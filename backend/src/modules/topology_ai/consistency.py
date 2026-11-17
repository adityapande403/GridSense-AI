import logging
from typing import Dict, List, Literal, Optional, Set
from uuid import UUID

import networkx as nx
from backend.src.models.network import (
    Bus,
    Consumer,
    DistributionTransformer,
    Line,
    Switch,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class TopologyDefect(BaseModel):
    rule_id: str
    severity: Literal["critical", "warning", "info"]
    entity_type: str  # "bus", "line", "dtr", "switch", "consumer", "feeder"
    entity_id: Optional[str] = None
    entity_code: Optional[str] = None
    message: str
    details: Dict[str, object] = Field(default_factory=dict)


class TopologyValidationResult(BaseModel):
    is_valid: bool  # True if 0 critical defects
    topology_version_id: Optional[UUID] = None
    feeder_id: Optional[UUID] = None
    critical_count: int = 0
    warning_count: int = 0
    defects: List[TopologyDefect] = Field(default_factory=list)
    summary: Dict[str, object] = Field(default_factory=dict)


class TopologyConsistencyEngine:
    """
    Deterministic rule-based network topological consistency engine.
    Detects orphan nodes, loops in radial circuits, disconnected DTRs, voltage mismatches,
    undefined switch states, duplicate assets, and consumer distance outliers.
    """

    def __init__(self, consumer_distance_threshold_m: float = 1000.0):
        self.consumer_distance_threshold_m = consumer_distance_threshold_m

    def check_orphan_nodes(
        self, buses: List[Bus], lines: List[Line], switches: List[Switch]
    ) -> List[TopologyDefect]:
        """Buses with degree 0 that are not connected to any operational line or switch."""
        connected_bus_ids: Set[UUID] = set()
        for line in lines:
            connected_bus_ids.add(line.from_bus_id)
            connected_bus_ids.add(line.to_bus_id)
        for sw in switches:
            connected_bus_ids.add(sw.from_bus_id)
            connected_bus_ids.add(sw.to_bus_id)

        defects = []
        for b in buses:
            if b.id not in connected_bus_ids and b.bus_type != "slack":
                defects.append(
                    TopologyDefect(
                        rule_id="TOPO_ERR_ORPHAN_BUS",
                        severity="critical",
                        entity_type="bus",
                        entity_id=str(b.id),
                        entity_code=b.code,
                        message=f"Bus '{b.code}' is an orphan node (not connected to any line or switch).",
                        details={"voltage_level_kv": b.voltage_level_kv, "bus_type": b.bus_type},
                    )
                )
        return defects

    def check_radial_cycles(
        self, buses: List[Bus], lines: List[Line], switches: List[Switch]
    ) -> List[TopologyDefect]:
        """
        Detects closed cycles in radial distribution networks.
        A loop of closed lines and closed switches violates radial operation.
        """
        G = nx.Graph()
        bus_id_to_code = {b.id: b.code for b in buses}

        for b in buses:
            G.add_node(b.id)

        for line in lines:
            if line.is_operational:
                G.add_edge(
                    line.from_bus_id,
                    line.to_bus_id,
                    edge_type="line",
                    code=line.code,
                    obj_id=line.id,
                )

        for sw in switches:
            if sw.current_status == "closed":
                G.add_edge(
                    sw.from_bus_id, sw.to_bus_id, edge_type="switch", code=sw.code, obj_id=sw.id
                )

        cycles = nx.cycle_basis(G)
        defects = []
        for idx, cycle in enumerate(cycles):
            cycle_codes = [bus_id_to_code.get(bid, str(bid)) for bid in cycle]
            defects.append(
                TopologyDefect(
                    rule_id="TOPO_ERR_RADIAL_LOOP",
                    severity="critical",
                    entity_type="feeder",
                    entity_id=None,
                    entity_code="->".join(cycle_codes),
                    message=f"Unintentional closed loop detected among {len(cycle)} buses: {' -> '.join(cycle_codes)}",
                    details={"cycle_buses": cycle_codes, "cycle_length": len(cycle)},
                )
            )
        return defects

    def check_disconnected_dtrs(
        self,
        buses: List[Bus],
        lines: List[Line],
        switches: List[Switch],
        dtrs: List[DistributionTransformer],
    ) -> List[TopologyDefect]:
        """Checks if each DTR has an electrically connected path to a slack/source bus."""
        G = nx.Graph()
        slack_buses: Set[UUID] = set()

        for b in buses:
            G.add_node(b.id)
            if b.bus_type == "slack":
                slack_buses.add(b.id)

        for line in lines:
            if line.is_operational:
                G.add_edge(line.from_bus_id, line.to_bus_id)

        for sw in switches:
            if sw.current_status == "closed":
                G.add_edge(sw.from_bus_id, sw.to_bus_id)

        defects = []
        if not slack_buses:
            # If no explicit slack bus, check connected components count
            comps = list(nx.connected_components(G))
            if len(comps) > 1:
                # Find which component is largest (assumed main feeder)
                largest = max(comps, key=len)
                for dtr in dtrs:
                    if dtr.bus_id not in largest:
                        defects.append(
                            TopologyDefect(
                                rule_id="TOPO_ERR_DISCONNECTED_DTR",
                                severity="critical",
                                entity_type="dtr",
                                entity_id=str(dtr.id),
                                entity_code=dtr.code,
                                message=f"Distribution transformer '{dtr.code}' is electrically disconnected from the main feeder.",
                                details={"bus_id": str(dtr.bus_id), "rated_kva": dtr.rated_kva},
                            )
                        )
            return defects

        # Slack buses exist: check path from each DTR's bus to at least one slack bus
        for dtr in dtrs:
            has_path = False
            for sb in slack_buses:
                if nx.has_path(G, dtr.bus_id, sb):
                    has_path = True
                    break
            if not has_path:
                defects.append(
                    TopologyDefect(
                        rule_id="TOPO_ERR_DISCONNECTED_DTR",
                        severity="critical",
                        entity_type="dtr",
                        entity_id=str(dtr.id),
                        entity_code=dtr.code,
                        message=f"Distribution transformer '{dtr.code}' has no path to any substation source bus.",
                        details={"bus_id": str(dtr.bus_id), "rated_kva": dtr.rated_kva},
                    )
                )

        return defects

    def check_voltage_mismatch(self, buses: List[Bus], lines: List[Line]) -> List[TopologyDefect]:
        """Checks for direct line connections between buses with differing voltage levels."""
        bus_voltage_map = {b.id: (b.voltage_level_kv, b.code) for b in buses}
        defects = []

        for line in lines:
            from_v, from_code = bus_voltage_map.get(line.from_bus_id, (None, None))
            to_v, to_code = bus_voltage_map.get(line.to_bus_id, (None, None))

            if from_v is not None and to_v is not None:
                if abs(from_v - to_v) > 0.1:  # Different voltage level
                    defects.append(
                        TopologyDefect(
                            rule_id="TOPO_ERR_VOLTAGE_MISMATCH",
                            severity="critical",
                            entity_type="line",
                            entity_id=str(line.id),
                            entity_code=line.code,
                            message=(
                                f"Voltage mismatch on line '{line.code}': connecting "
                                f"bus '{from_code}' ({from_v} kV) directly to bus '{to_code}' ({to_v} kV)."
                            ),
                            details={
                                "from_bus": from_code,
                                "from_voltage_kv": from_v,
                                "to_bus": to_code,
                                "to_voltage_kv": to_v,
                            },
                        )
                    )

        return defects

    def check_undefined_switch_status(self, switches: List[Switch]) -> List[TopologyDefect]:
        """Checks for switches with non-standard or missing current status."""
        defects = []
        for sw in switches:
            if not sw.current_status or str(sw.current_status).strip().lower() not in (
                "open",
                "closed",
            ):
                defects.append(
                    TopologyDefect(
                        rule_id="TOPO_ERR_UNDEFINED_SWITCH",
                        severity="critical",
                        entity_type="switch",
                        entity_id=str(sw.id),
                        entity_code=sw.code,
                        message=f"Switch '{sw.code}' has undefined status '{sw.current_status}'. Must be 'open' or 'closed'.",
                        details={
                            "current_status": sw.current_status,
                            "switch_type": sw.switch_type,
                        },
                    )
                )
        return defects

    def check_duplicate_assets(
        self, buses: List[Bus], lines: List[Line], dtrs: List[DistributionTransformer]
    ) -> List[TopologyDefect]:
        """Checks for duplicate asset codes."""
        defects = []
        for entity_name, entity_list in [("bus", buses), ("line", lines), ("dtr", dtrs)]:
            seen: Dict[str, str] = {}
            for item in entity_list:
                c = item.code
                if c in seen:
                    defects.append(
                        TopologyDefect(
                            rule_id="TOPO_WARN_DUPLICATE_ASSET",
                            severity="warning",
                            entity_type=entity_name,
                            entity_id=str(item.id),
                            entity_code=c,
                            message=f"Duplicate {entity_name} code detected: '{c}'.",
                            details={"original_id": seen[c], "duplicate_id": str(item.id)},
                        )
                    )
                else:
                    seen[c] = str(item.id)
        return defects

    def check_consumer_dtr_distances(
        self, consumers: List[Consumer], dtrs: List[DistributionTransformer]
    ) -> List[TopologyDefect]:
        """Checks for consumers situated unusually far from their assigned DTR."""
        dtr_geom_map = {d.id: d.geom for d in dtrs if d.geom is not None}
        defects = []

        for c in consumers:
            if c.geom is None or c.dtr_id not in dtr_geom_map:
                continue

            dtr_geom = dtr_geom_map[c.dtr_id]
            # Approximate Euclidean distance in degrees -> meters (~111,139 m per degree)
            dx = (c.geom.x - dtr_geom.x) * 111139.0
            dy = (c.geom.y - dtr_geom.y) * 111139.0
            dist_m = (dx**2 + dy**2) ** 0.5

            if dist_m > self.consumer_distance_threshold_m:
                defects.append(
                    TopologyDefect(
                        rule_id="TOPO_WARN_DISTANCE_OUTLIER",
                        severity="warning",
                        entity_type="consumer",
                        entity_id=str(c.id),
                        entity_code=c.service_number,
                        message=(
                            f"Consumer '{c.service_number}' is {dist_m:.1f} m from assigned DTR "
                            f"(threshold: {self.consumer_distance_threshold_m} m)."
                        ),
                        details={
                            "distance_meters": round(dist_m, 2),
                            "threshold_meters": self.consumer_distance_threshold_m,
                        },
                    )
                )

        return defects

    def validate_network(
        self,
        db_session: Session,
        feeder_id: Optional[UUID] = None,
        topology_version_id: Optional[UUID] = None,
    ) -> TopologyValidationResult:
        """Run all topological consistency checks across the network or feeder."""
        bus_q = db_session.query(Bus)
        line_q = db_session.query(Line)
        dtr_q = db_session.query(DistributionTransformer)
        sw_q = db_session.query(Switch)
        c_q = db_session.query(Consumer)

        if feeder_id:
            bus_q = bus_q.filter_by(feeder_id=feeder_id)
            line_q = line_q.filter_by(feeder_id=feeder_id)

        buses = bus_q.all()
        lines = line_q.all()
        dtrs = dtr_q.all()
        switches = sw_q.all()
        consumers = c_q.all()

        all_defects: List[TopologyDefect] = []

        # 1. Orphan nodes
        all_defects.extend(self.check_orphan_nodes(buses, lines, switches))

        # 2. Radial cycles
        all_defects.extend(self.check_radial_cycles(buses, lines, switches))

        # 3. Disconnected DTRs
        all_defects.extend(self.check_disconnected_dtrs(buses, lines, switches, dtrs))

        # 4. Voltage mismatch
        all_defects.extend(self.check_voltage_mismatch(buses, lines))

        # 5. Undefined switch status
        all_defects.extend(self.check_undefined_switch_status(switches))

        # 6. Duplicate assets
        all_defects.extend(self.check_duplicate_assets(buses, lines, dtrs))

        # 7. Consumer-DTR distance outliers
        all_defects.extend(self.check_consumer_dtr_distances(consumers, dtrs))

        crit_count = sum(1 for d in all_defects if d.severity == "critical")
        warn_count = sum(1 for d in all_defects if d.severity == "warning")

        return TopologyValidationResult(
            is_valid=(crit_count == 0),
            topology_version_id=topology_version_id,
            feeder_id=feeder_id,
            critical_count=crit_count,
            warning_count=warn_count,
            defects=all_defects,
            summary={
                "total_buses": len(buses),
                "total_lines": len(lines),
                "total_dtrs": len(dtrs),
                "total_switches": len(switches),
                "total_consumers": len(consumers),
            },
        )
