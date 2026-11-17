from datetime import datetime, timezone
from typing import Any, Dict

from backend.src.models import (
    AuditLog,
    Bus,
    Consumer,
    DistributionTransformer,
    Feeder,
    Line,
    LoadMeasurement,
    LoadSnapshot,
    Organisation,
    Substation,
    Switch,
    TopologyVersion,
)
from backend.src.models.base import ProvenanceEnum
from sqlalchemy.orm import Session


def save_synthetic_network_to_db(
    db: Session,
    net_data: Dict[str, Any],
    version_tag: str = "v1.0.0-synthetic-demo",
    is_authoritative: bool = True,
    operator_user: str = "system_generator",
) -> TopologyVersion:
    """
    Persists a generated synthetic network into the relational database.
    Creates an immutable TopologyVersion record and logs the import in AuditLog.
    """
    # 1. Get or create Organisation (TSSPDCL / TSNPDCL default)
    org_code = "TSSPDCL"
    org = db.query(Organisation).filter(Organisation.code == org_code).first()
    if not org:
        org = Organisation(
            code=org_code,
            name="Telangana State Southern Power Distribution Company Limited",
            description="Telangana DISCOM (Hyderabad & Southern Circles)",
        )
        db.add(org)
        db.flush()

    # 2. Create Substation
    sub_data = net_data["substation"]
    substation = db.query(Substation).filter(Substation.code == sub_data["code"]).first()
    if not substation:
        substation = Substation(
            organisation_id=org.id,
            code=sub_data["code"],
            name=sub_data["name"],
            nominal_kv=sub_data["nominal_kv"],
            ptr_capacity_mva=sub_data["ptr_capacity_mva"],
            provenance=ProvenanceEnum.SYNTHETIC.value,
        )
        db.add(substation)
        db.flush()

    # 3. Create Feeders
    feeder_orm_lookup = {}
    for f in net_data["feeders"]:
        feeder = db.query(Feeder).filter(Feeder.code == f["feeder_code"]).first()
        if not feeder:
            feeder = Feeder(
                substation_id=substation.id,
                code=f["feeder_code"],
                name=f["feeder_name"],
                voltage_kv=f["voltage_kv"],
                trunk_conductor_type="ACSR_Dog",
                metadata_json={"archetype": net_data.get("archetype", "mixed")},
                provenance=ProvenanceEnum.SYNTHETIC.value,
            )
            db.add(feeder)
            db.flush()
        feeder_orm_lookup[f["feeder_code"]] = feeder

    # Use first feeder as default parent for substation buses
    default_feeder = list(feeder_orm_lookup.values())[0]

    # 4. Create Buses
    bus_orm_lookup = {}
    for b in net_data["buses"]:
        # Assign feeder_id based on bus code or fallback to default
        target_feeder = default_feeder
        for f_code, f_obj in feeder_orm_lookup.items():
            if f_code in b["bus_id"]:
                target_feeder = f_obj
                break

        bus = db.query(Bus).filter(Bus.code == b["bus_id"]).first()
        if not bus:
            bus = Bus(
                feeder_id=target_feeder.id,
                code=b["bus_id"],
                name=b["name"],
                voltage_level_kv=b["voltage_level_kv"],
                bus_type=b["bus_type"],
                provenance=ProvenanceEnum.SYNTHETIC.value,
            )
            db.add(bus)
            db.flush()
        bus_orm_lookup[b["bus_id"]] = bus

    # 5. Create Lines
    for line_item in net_data["lines"]:
        line = db.query(Line).filter(Line.code == line_item["line_id"]).first()
        if not line:
            f_code = line_item.get("feeder_code", "")
            target_feeder = feeder_orm_lookup.get(f_code, default_feeder)

            from_bus = bus_orm_lookup[line_item["from_bus_id"]]
            to_bus = bus_orm_lookup[line_item["to_bus_id"]]

            line = Line(
                feeder_id=target_feeder.id,
                from_bus_id=from_bus.id,
                to_bus_id=to_bus.id,
                code=line_item["line_id"],
                conductor_type=line_item["conductor_type"],
                length_km=line_item["length_km"],
                r_ohm_per_km=line_item["r_ohm_per_km"],
                x_ohm_per_km=line_item["x_ohm_per_km"],
                max_i_ka=line_item["max_i_ka"],
                is_operational=line_item["is_operational"],
                provenance=ProvenanceEnum.SYNTHETIC.value,
            )
            db.add(line)

    # 6. Create Switches
    for sw in net_data["switches"]:
        switch = db.query(Switch).filter(Switch.code == sw["code"]).first()
        if not switch:
            from_bus = bus_orm_lookup[sw["from_bus_id"]]
            to_bus = bus_orm_lookup[sw["to_bus_id"]]

            switch = Switch(
                from_bus_id=from_bus.id,
                to_bus_id=to_bus.id,
                code=sw["code"],
                switch_type=sw["switch_type"],
                is_normally_open=sw["is_normally_open"],
                current_status=sw["current_status"],
                is_motorized=sw["is_motorized"],
                provenance=ProvenanceEnum.SYNTHETIC.value,
            )
            db.add(switch)

    # 7. Create DTRs and Consumers
    dtr_orm_lookup = {}
    for d in net_data["dtrs"]:
        dtr = db.query(DistributionTransformer).filter(DistributionTransformer.code == d["code"]).first()
        if not dtr:
            parent_bus = bus_orm_lookup[d["bus_id"]]
            dtr = DistributionTransformer(
                bus_id=parent_bus.id,
                code=d["code"],
                name=d["name"],
                rated_kva=d["rated_kva"],
                no_load_loss_kw=d["no_load_loss_kw"],
                full_load_loss_kw=d["full_load_loss_kw"],
                percent_z=d["percent_z"],
                is_metered=d["is_metered"],
                provenance=ProvenanceEnum.SYNTHETIC.value,
            )
            db.add(dtr)
            db.flush()
        dtr_orm_lookup[d["dtr_id"]] = dtr

    # Consumers
    for c in net_data["consumers"]:
        parent_dtr = dtr_orm_lookup.get(c["dtr_id"])
        if parent_dtr:
            consumer = db.query(Consumer).filter(Consumer.service_number == c["service_number"]).first()
            if not consumer:
                consumer = Consumer(
                    dtr_id=parent_dtr.id,
                    service_number=c["service_number"],
                    consumer_category=c["category"],
                    sanctioned_load_kw=c["sanctioned_load_kw"],
                    provenance=ProvenanceEnum.SYNTHETIC.value,
                )
                db.add(consumer)

    # 8. Create Immutable Topology Version
    top_version = TopologyVersion(
        version_tag=version_tag,
        network_hash=net_data["network_hash"],
        description=f"Synthetic {net_data['archetype']} network generated with seed {net_data['seed']}",
        is_authoritative=is_authoritative,
        metadata_json={
            "seed": net_data["seed"],
            "archetype": net_data["archetype"],
            "injected_scenario": net_data["injected_scenario"],
            "bus_count": len(net_data["buses"]),
            "dtr_count": len(net_data["dtrs"]),
            "line_count": len(net_data["lines"]),
            "switch_count": len(net_data["switches"]),
            "initial_power_flow": net_data["initial_power_flow"],
        },
    )
    db.add(top_version)
    db.flush()

    # 9. Create Initial Load Snapshot at Peak Hour (Hour 19)
    peak_loads = net_data["time_series"]["hourly_dtr_loads"][19]
    total_p_mw = sum(d["p_kw"] for d in peak_loads.values()) / 1000.0
    total_q_mvar = sum(d["q_kvar"] for d in peak_loads.values()) / 1000.0

    snapshot = LoadSnapshot(
        feeder_id=default_feeder.id,
        timestamp=datetime.now(timezone.utc),
        total_p_mw=round(total_p_mw, 4),
        total_q_mvar=round(total_q_mvar, 4),
        source_bus_voltage_pu=1.0,
        provenance=ProvenanceEnum.SYNTHETIC.value,
    )
    db.add(snapshot)
    db.flush()

    for d_id, d_loads in peak_loads.items():
        dtr_obj = dtr_orm_lookup.get(d_id)
        if dtr_obj:
            meas = LoadMeasurement(
                snapshot_id=snapshot.id,
                dtr_id=dtr_obj.id,
                p_kw=d_loads["p_kw"],
                q_kvar=d_loads["q_kvar"],
                is_metered=dtr_obj.is_metered,
                confidence_lower_kw=round(d_loads["p_kw"] * 0.90, 2),
                confidence_upper_kw=round(d_loads["p_kw"] * 1.10, 2),
                provenance=ProvenanceEnum.SYNTHETIC.value,
            )
            db.add(meas)

    # 10. Audit Log Entry
    audit = AuditLog(
        user_identifier=operator_user,
        action_type="import_synthetic_network",
        resource_type="topology_version",
        resource_id=top_version.id,
        details_json={
            "network_hash": net_data["network_hash"],
            "version_tag": version_tag,
            "seed": net_data["seed"],
        },
    )
    db.add(audit)
    db.commit()

    return top_version
