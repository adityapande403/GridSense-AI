import hashlib
import json
import logging
import uuid
from pathlib import Path
from typing import Dict, Optional, Union

from backend.src.core.config import settings
from backend.src.models.network import (
    Bus,
    Connection,
    Consumer,
    DistributionTransformer,
    Feeder,
    Line,
    Organisation,
    Substation,
    Switch,
)
from backend.src.models.topology import TopologyVersion
from backend.src.modules.ingest.base import BaseIngestionAdapter
from backend.src.modules.ingest.schemas import (
    IngestionResult,
    RejectionReason,
    ValidationReport,
)
from shapely.geometry import shape
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class GeoJSONIngestionAdapter(BaseIngestionAdapter):
    """
    Ingests GeoJSON FeatureCollections representing distribution networks.
    Enforces validation reporting, rejection reasons, and explicit connectivity modeling.
    """

    def __init__(self, mapping_config_path: Optional[Union[str, Path]] = None):
        if mapping_config_path is None:
            mapping_config_path = settings.BASE_DIR / "config" / "ingestion_mappings.json"
        self.mapping_config_path = Path(mapping_config_path)

        conductors_path = settings.BASE_DIR / "config" / "conductors.json"
        if conductors_path.exists():
            with open(conductors_path, "r", encoding="utf-8") as f:
                self.conductor_specs = json.load(f).get("conductors", {})
        else:
            self.conductor_specs = {}

    def _parse_geojson(self, source: Union[str, Path, dict]) -> dict:
        if isinstance(source, dict):
            return source
        p = Path(source)
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        # Try raw json string
        return json.loads(str(source))

    def validate(self, source: Union[str, Path, dict]) -> ValidationReport:
        data = self._parse_geojson(source)
        filename = "geojson_data"
        if isinstance(source, (str, Path)) and Path(source).exists():
            filename = Path(source).name

        features = data.get("features", [])
        report = ValidationReport(
            source_type="geojson",
            filename=filename,
            total_rows=len(features),
            rows_accepted=0,
            rows_rejected=0,
            rejection_reasons=[],
            warnings=[],
            summary_counts={},
        )

        for idx, feat in enumerate(features):
            geom_raw = feat.get("geometry")
            props = feat.get("properties", {})
            entity_type = props.get("entity_type") or props.get("type", "unknown")

            # Check geometry
            if not geom_raw or not geom_raw.get("coordinates"):
                report.rows_rejected += 1
                report.rejection_reasons.append(
                    RejectionReason(
                        row_index=idx,
                        entity_type=str(entity_type),
                        identifier=props.get("code") or props.get("service_number"),
                        reason="Missing geometry or empty coordinates.",
                        error_code="ERR_INVALID_GEOM",
                        raw_data=props,
                    )
                )
                continue

            try:
                geom = shape(geom_raw)
                if geom.is_empty:
                    raise ValueError("Empty geometry.")
            except Exception as e:
                report.rows_rejected += 1
                report.rejection_reasons.append(
                    RejectionReason(
                        row_index=idx,
                        entity_type=str(entity_type),
                        identifier=props.get("code"),
                        reason=f"Malformed geometry: {e}",
                        error_code="ERR_INVALID_GEOM",
                        raw_data=props,
                    )
                )
                continue

            # Check identifier
            code = props.get("code") or props.get("service_number") or props.get("id")
            if not code or str(code).strip() in ("", "None", "NA"):
                report.rows_rejected += 1
                report.rejection_reasons.append(
                    RejectionReason(
                        row_index=idx,
                        entity_type=str(entity_type),
                        identifier=None,
                        reason="Missing mandatory primary identifier (code / service_number).",
                        error_code="ERR_MISSING_ID",
                        raw_data=props,
                    )
                )
                continue

            # Entity-specific validation
            if entity_type == "line":
                from_bus = props.get("from_bus_code") or props.get("from_bus")
                to_bus = props.get("to_bus_code") or props.get("to_bus")
                if not from_bus or not to_bus:
                    report.rows_rejected += 1
                    report.rejection_reasons.append(
                        RejectionReason(
                            row_index=idx,
                            entity_type="line",
                            identifier=str(code),
                            reason="Line requires both from_bus_code and to_bus_code.",
                            error_code="ERR_MISSING_BUS_REF",
                            raw_data=props,
                        )
                    )
                    continue

                length = props.get("length_km", 0.5)
                if float(length) <= 0.0:
                    report.rows_rejected += 1
                    report.rejection_reasons.append(
                        RejectionReason(
                            row_index=idx,
                            entity_type="line",
                            identifier=str(code),
                            reason=f"Line length must be positive, got {length}.",
                            error_code="ERR_INVALID_NUMERIC",
                            raw_data=props,
                        )
                    )
                    continue

            elif entity_type in ("dtr", "distribution_transformer"):
                rated_kva = props.get("rated_kva", 100.0)
                if float(rated_kva) <= 0.0:
                    report.rows_rejected += 1
                    report.rejection_reasons.append(
                        RejectionReason(
                            row_index=idx,
                            entity_type="distribution_transformer",
                            identifier=str(code),
                            reason=f"Transformer rated kVA must be positive, got {rated_kva}.",
                            error_code="ERR_INVALID_NUMERIC",
                            raw_data=props,
                        )
                    )
                    continue

            report.rows_accepted += 1
            report.summary_counts[str(entity_type)] = (
                report.summary_counts.get(str(entity_type), 0) + 1
            )

        return report

    def ingest(
        self,
        source: Union[str, Path, dict],
        db_session: Session,
        organisation_id: Optional[uuid.UUID] = None,
        feeder_id: Optional[uuid.UUID] = None,
        version_tag: Optional[str] = None,
    ) -> IngestionResult:
        val_report = self.validate(source)
        data = self._parse_geojson(source)
        features = data.get("features", [])

        # Ensure organization
        org = None
        if organisation_id:
            org = db_session.get(Organisation, organisation_id)
        if not org:
            org = db_session.query(Organisation).filter_by(code="GEOJSON_INGEST_ORG").first()
            if not org:
                org = Organisation(
                    code="GEOJSON_INGEST_ORG",
                    name="GeoJSON Ingestion Organisation",
                    description="Organisation created for GeoJSON network import.",
                )
                db_session.add(org)
                db_session.flush()

        # Ensure substation
        substation = db_session.query(Substation).filter_by(code="SS_GEOJSON").first()
        if not substation:
            substation = Substation(
                organisation_id=org.id,
                code="SS_GEOJSON",
                name="GeoJSON 33/11 kV Substation",
                nominal_kv=33.0,
                ptr_capacity_mva=5.0,
                source="GeoJSON",
                provenance="assumed",
                confidence_score=0.90,
            )
            db_session.add(substation)
            db_session.flush()

        # Ensure feeder
        feeder = None
        if feeder_id:
            feeder = db_session.get(Feeder, feeder_id)
        if not feeder:
            feeder = db_session.query(Feeder).filter_by(code="F_GEOJSON").first()
            if not feeder:
                feeder = Feeder(
                    substation_id=substation.id,
                    code="F_GEOJSON",
                    name="GeoJSON Feeder 1",
                    voltage_kv=11.0,
                    peak_load_kw=1000.0,
                    trunk_conductor_type="ACSR_Rabbit",
                    metadata_json={},
                    source="GeoJSON",
                    provenance="assumed",
                    confidence_score=0.90,
                )
                db_session.add(feeder)
                db_session.flush()

        created_counts = {
            "buses": 0,
            "lines": 0,
            "distribution_transformers": 0,
            "switches": 0,
            "consumers": 0,
            "connections": 0,
        }

        # First pass: Buses
        bus_map: Dict[str, Bus] = {}
        for feat in features:
            props = feat.get("properties", {})
            entity_type = props.get("entity_type") or props.get("type")
            if entity_type == "bus":
                code = str(props.get("code") or props.get("id")).strip()
                geom_shape = shape(feat.get("geometry"))
                bus = db_session.query(Bus).filter_by(code=code, feeder_id=feeder.id).first()
                if not bus:
                    bus = Bus(
                        feeder_id=feeder.id,
                        code=code,
                        name=props.get("name", f"Bus {code}"),
                        voltage_level_kv=float(props.get("voltage_level_kv", 11.0)),
                        bus_type=props.get("bus_type", "pq"),
                        geom=geom_shape,
                        source="GeoJSON",
                        provenance=props.get("provenance", "measured"),
                        confidence_score=float(props.get("confidence_score", 0.95)),
                    )
                    db_session.add(bus)
                    db_session.flush()
                    created_counts["buses"] += 1
                bus_map[code] = bus

        # Helper to get or create bus on the fly for referenced endpoints
        def resolve_bus(bus_code: str, fallback_geom=None) -> Bus:
            clean = str(bus_code).strip()
            if clean in bus_map:
                return bus_map[clean]
            b = db_session.query(Bus).filter_by(code=clean, feeder_id=feeder.id).first()
            if not b:
                b = Bus(
                    feeder_id=feeder.id,
                    code=clean,
                    name=f"Bus {clean}",
                    voltage_level_kv=11.0,
                    bus_type="pq",
                    geom=fallback_geom,
                    source="GeoJSON",
                    provenance="assumed",
                    confidence_score=0.85,
                )
                db_session.add(b)
                db_session.flush()
                created_counts["buses"] += 1
            bus_map[clean] = b
            return b

        # Second pass: Lines, DTRs, Switches, Consumers
        for feat in features:
            props = feat.get("properties", {})
            entity_type = props.get("entity_type") or props.get("type")
            code = props.get("code") or props.get("service_number") or props.get("id")
            if not code or str(code).strip() in ("", "None", "NA"):
                continue
            code_str = str(code).strip()
            geom_shape = shape(feat.get("geometry"))

            if entity_type == "line":
                from_code = props.get("from_bus_code") or props.get("from_bus")
                to_code = props.get("to_bus_code") or props.get("to_bus")
                if not from_code or not to_code:
                    continue

                from_bus = resolve_bus(from_code)
                to_bus = resolve_bus(to_code)
                cond_type = props.get("conductor_type", "ACSR_Weasel")
                spec = self.conductor_specs.get(cond_type, {})
                r_val = float(props.get("r_ohm_per_km") or spec.get("r_ohm_per_km", 0.9075))
                x_val = float(props.get("x_ohm_per_km") or spec.get("x_ohm_per_km", 0.377))
                i_max = float(
                    props.get("max_i_ka") or (spec.get("current_rating_amps", 134.0) / 1000.0)
                )

                line = db_session.query(Line).filter_by(code=code_str).first()
                if not line:
                    line = Line(
                        feeder_id=feeder.id,
                        from_bus_id=from_bus.id,
                        to_bus_id=to_bus.id,
                        code=code_str,
                        conductor_type=cond_type,
                        length_km=float(props.get("length_km", 0.5)),
                        r_ohm_per_km=r_val,
                        x_ohm_per_km=x_val,
                        max_i_ka=i_max,
                        is_operational=bool(props.get("is_operational", True)),
                        geom=geom_shape,
                        source="GeoJSON",
                        provenance=props.get("provenance", "assumed"),
                        confidence_score=float(props.get("confidence_score", 0.90)),
                    )
                    db_session.add(line)
                    db_session.flush()
                    created_counts["lines"] += 1

                    # Connection
                    conn = Connection(
                        from_element_type="line",
                        from_element_id=line.id,
                        from_terminal="1",
                        to_element_type="bus",
                        to_element_id=from_bus.id,
                        to_terminal="term",
                        is_active=True,
                        metadata_json={"bus_code": from_bus.code},
                        source="GeoJSON",
                        provenance="measured",
                    )
                    db_session.add(conn)
                    created_counts["connections"] += 1

            elif entity_type in ("dtr", "distribution_transformer"):
                bus_code = props.get("bus_code") or props.get("parent_bus") or f"BUS_{code_str}"
                parent_bus = resolve_bus(bus_code, fallback_geom=geom_shape)

                dtr = db_session.query(DistributionTransformer).filter_by(code=code_str).first()
                if not dtr:
                    dtr = DistributionTransformer(
                        bus_id=parent_bus.id,
                        code=code_str,
                        name=props.get("name", f"DTR {code_str}"),
                        rated_kva=float(props.get("rated_kva", 100.0)),
                        phase_count=int(props.get("phase_count", 3)),
                        no_load_loss_kw=float(props.get("no_load_loss_kw", 0.25)),
                        full_load_loss_kw=float(props.get("full_load_loss_kw", 1.35)),
                        percent_z=float(props.get("percent_z", 4.5)),
                        is_metered=bool(props.get("is_metered", False)),
                        geom=geom_shape,
                        source="GeoJSON",
                        provenance=props.get("provenance", "measured"),
                        confidence_score=float(props.get("confidence_score", 0.95)),
                    )
                    db_session.add(dtr)
                    db_session.flush()
                    created_counts["distribution_transformers"] += 1

                    conn = Connection(
                        from_element_type="dtr",
                        from_element_id=dtr.id,
                        from_terminal="primary",
                        to_element_type="bus",
                        to_element_id=parent_bus.id,
                        to_terminal="term",
                        is_active=True,
                        metadata_json={"bus_code": parent_bus.code},
                        source="GeoJSON",
                        provenance="measured",
                    )
                    db_session.add(conn)
                    created_counts["connections"] += 1

            elif entity_type == "switch":
                from_code = (
                    props.get("from_bus_code") or props.get("from_bus") or f"SW_BUS_A_{code_str}"
                )
                to_code = props.get("to_bus_code") or props.get("to_bus") or f"SW_BUS_B_{code_str}"
                from_bus = resolve_bus(from_code, fallback_geom=geom_shape)
                to_bus = resolve_bus(to_code, fallback_geom=geom_shape)

                sw = db_session.query(Switch).filter_by(code=code_str).first()
                if not sw:
                    sw = Switch(
                        from_bus_id=from_bus.id,
                        to_bus_id=to_bus.id,
                        code=code_str,
                        switch_type=props.get("switch_type", "sectionalizer"),
                        is_normally_open=bool(props.get("is_normally_open", False)),
                        current_status=props.get("current_status", "closed"),
                        is_motorized=bool(props.get("is_motorized", False)),
                        breaking_capacity_ka=float(props.get("breaking_capacity_ka", 12.5)),
                        geom=geom_shape,
                        source="GeoJSON",
                        provenance=props.get("provenance", "measured"),
                        confidence_score=float(props.get("confidence_score", 0.90)),
                    )
                    db_session.add(sw)
                    created_counts["switches"] += 1

            elif entity_type == "consumer":
                dtr_code = props.get("dtr_code") or props.get("transformer_code")
                dtr = None
                if dtr_code:
                    dtr = (
                        db_session.query(DistributionTransformer)
                        .filter_by(code=str(dtr_code).strip())
                        .first()
                    )
                if not dtr:
                    dtr = db_session.query(DistributionTransformer).first()

                if dtr:
                    consumer = db_session.query(Consumer).filter_by(service_number=code_str).first()
                    if not consumer:
                        consumer = Consumer(
                            dtr_id=dtr.id,
                            service_number=code_str,
                            consumer_category=props.get("consumer_category", "domestic"),
                            sanctioned_load_kw=float(props.get("sanctioned_load_kw", 2.0)),
                            phase=props.get("phase", "3ph"),
                            geom=geom_shape,
                            source="GeoJSON",
                            provenance=props.get("provenance", "measured"),
                            confidence_score=float(props.get("confidence_score", 0.95)),
                        )
                        db_session.add(consumer)
                        created_counts["consumers"] += 1

        db_session.flush()

        # Immutable TopologyVersion
        version_tag_str = version_tag or f"v_geojson_{uuid.uuid4().hex[:8]}"
        hash_input = f"{version_tag_str}:{created_counts['buses']}:{created_counts['lines']}:{created_counts['distribution_transformers']}"
        network_hash = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()

        topo_version = (
            db_session.query(TopologyVersion).filter_by(version_tag=version_tag_str).first()
        )
        if not topo_version:
            topo_version = TopologyVersion(
                version_tag=version_tag_str,
                network_hash=network_hash,
                description=f"Ingested from GeoJSON: {val_report.filename}",
                is_authoritative=True,
                metadata_json={"source": val_report.filename, "created_counts": created_counts},
            )
            db_session.add(topo_version)
            db_session.flush()

        return IngestionResult(
            success=True,
            topology_version_id=topo_version.id,
            version_tag=topo_version.version_tag,
            network_hash=topo_version.network_hash,
            validation_report=val_report,
            created_counts=created_counts,
        )
