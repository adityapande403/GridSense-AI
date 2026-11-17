import csv
import hashlib
import io
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
)
from backend.src.models.topology import TopologyVersion
from backend.src.modules.ingest.base import BaseIngestionAdapter
from backend.src.modules.ingest.schemas import (
    IngestionResult,
    RejectionReason,
    ValidationReport,
)
from shapely.geometry import Point
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class CSVIngestionAdapter(BaseIngestionAdapter):
    """
    Ingests tabular CSV data for distribution network asset registries.
    Tracks rejected rows with explicit error codes and rejection reasons.
    """

    def __init__(self):
        conductors_path = settings.BASE_DIR / "config" / "conductors.json"
        if conductors_path.exists():
            import json

            with open(conductors_path, "r", encoding="utf-8") as f:
                self.conductor_specs = json.load(f).get("conductors", {})
        else:
            self.conductor_specs = {}

    def _read_rows(self, source: Union[str, Path, dict]) -> tuple[list[dict], str]:
        if isinstance(source, dict):
            csv_text = source.get("content", "")
            filename = source.get("filename", "upload.csv")
            reader = csv.DictReader(io.StringIO(csv_text))
            return list(reader), filename

        p = Path(source)
        if p.exists():
            with open(p, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                return list(reader), p.name

        # Raw string
        reader = csv.DictReader(io.StringIO(str(source)))
        return list(reader), "raw.csv"

    def validate(self, source: Union[str, Path, dict]) -> ValidationReport:
        rows, filename = self._read_rows(source)
        report = ValidationReport(
            source_type="csv",
            filename=filename,
            total_rows=len(rows),
            rows_accepted=0,
            rows_rejected=0,
            rejection_reasons=[],
            warnings=[],
            summary_counts={},
        )

        for idx, row in enumerate(rows):
            entity_type = row.get("entity_type", "").strip().lower()
            code = row.get("code") or row.get("service_number") or row.get("asset_id")

            if not code or str(code).strip() in ("", "None", "NA"):
                report.rows_rejected += 1
                report.rejection_reasons.append(
                    RejectionReason(
                        row_index=idx,
                        entity_type=entity_type or "unknown",
                        identifier=None,
                        reason="Missing mandatory primary identifier (code / service_number / asset_id).",
                        error_code="ERR_MISSING_ID",
                        raw_data=row,
                    )
                )
                continue

            # Infer entity type if not explicitly given
            if not entity_type:
                if "rated_kva" in row:
                    entity_type = "distribution_transformer"
                elif "from_bus_code" in row or "from_bus" in row:
                    entity_type = "line"
                elif "service_number" in row or "sanctioned_load_kw" in row:
                    entity_type = "consumer"
                else:
                    entity_type = "bus"

            # Check specific fields
            if entity_type == "distribution_transformer":
                kva_val = row.get("rated_kva")
                try:
                    if kva_val is not None and float(kva_val) <= 0:
                        raise ValueError("rated_kva must be positive")
                except ValueError:
                    report.rows_rejected += 1
                    report.rejection_reasons.append(
                        RejectionReason(
                            row_index=idx,
                            entity_type=entity_type,
                            identifier=code,
                            reason=f"Invalid rated_kva value: '{kva_val}'.",
                            error_code="ERR_INVALID_NUMERIC",
                            raw_data=row,
                        )
                    )
                    continue

            elif entity_type == "line":
                fb = row.get("from_bus_code") or row.get("from_bus")
                tb = row.get("to_bus_code") or row.get("to_bus")
                if not fb or not tb:
                    report.rows_rejected += 1
                    report.rejection_reasons.append(
                        RejectionReason(
                            row_index=idx,
                            entity_type=entity_type,
                            identifier=code,
                            reason="Line requires both from_bus_code and to_bus_code.",
                            error_code="ERR_MISSING_BUS_REF",
                            raw_data=row,
                        )
                    )
                    continue

            report.rows_accepted += 1
            report.summary_counts[entity_type] = report.summary_counts.get(entity_type, 0) + 1

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
        rows, filename = self._read_rows(source)

        # Organization
        org = None
        if organisation_id:
            org = db_session.get(Organisation, organisation_id)
        if not org:
            org = db_session.query(Organisation).filter_by(code="CSV_INGEST_ORG").first()
            if not org:
                org = Organisation(
                    code="CSV_INGEST_ORG",
                    name="CSV Ingestion Organisation",
                    description="Organisation created for CSV network imports.",
                )
                db_session.add(org)
                db_session.flush()

        # Substation
        substation = db_session.query(Substation).filter_by(code="SS_CSV").first()
        if not substation:
            substation = Substation(
                organisation_id=org.id,
                code="SS_CSV",
                name="CSV Substation 33/11 kV",
                nominal_kv=33.0,
                ptr_capacity_mva=5.0,
                source="CSV",
                provenance="assumed",
            )
            db_session.add(substation)
            db_session.flush()

        # Feeder
        feeder = None
        if feeder_id:
            feeder = db_session.get(Feeder, feeder_id)
        if not feeder:
            feeder = db_session.query(Feeder).filter_by(code="F_CSV").first()
            if not feeder:
                feeder = Feeder(
                    substation_id=substation.id,
                    code="F_CSV",
                    name="CSV Feeder 1",
                    voltage_kv=11.0,
                    peak_load_kw=1000.0,
                    trunk_conductor_type="ACSR_Rabbit",
                    metadata_json={},
                    source="CSV",
                    provenance="assumed",
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

        bus_map: Dict[str, Bus] = {}

        def get_or_create_bus(
            bus_code: str, lat: Optional[float] = None, lon: Optional[float] = None
        ) -> Bus:
            clean = str(bus_code).strip()
            if clean in bus_map:
                return bus_map[clean]
            b = db_session.query(Bus).filter_by(code=clean, feeder_id=feeder.id).first()
            if not b:
                pt = Point(lon, lat) if (lat is not None and lon is not None) else None
                b = Bus(
                    feeder_id=feeder.id,
                    code=clean,
                    name=f"Bus {clean}",
                    voltage_level_kv=11.0,
                    bus_type="pq",
                    geom=pt,
                    source="CSV",
                    provenance="measured" if pt is not None else "assumed",
                )
                db_session.add(b)
                db_session.flush()
                created_counts["buses"] += 1
            bus_map[clean] = b
            return b

        for row in rows:
            entity_type = row.get("entity_type", "").strip().lower()
            code = row.get("code") or row.get("service_number") or row.get("asset_id")
            if not code or str(code).strip() in ("", "None", "NA"):
                continue
            code_str = str(code).strip()

            lat = (
                float(row["latitude"])
                if row.get("latitude") and row["latitude"].strip() != ""
                else None
            )
            lon = (
                float(row["longitude"])
                if row.get("longitude") and row["longitude"].strip() != ""
                else None
            )
            pt = Point(lon, lat) if (lat is not None and lon is not None) else None

            if not entity_type:
                if "rated_kva" in row:
                    entity_type = "distribution_transformer"
                elif "from_bus_code" in row or "from_bus" in row:
                    entity_type = "line"
                elif "service_number" in row:
                    entity_type = "consumer"
                else:
                    entity_type = "bus"

            if entity_type == "bus":
                get_or_create_bus(code_str, lat, lon)

            elif entity_type == "line":
                fb = row.get("from_bus_code") or row.get("from_bus")
                tb = row.get("to_bus_code") or row.get("to_bus")
                if not fb or not tb:
                    continue
                from_bus = get_or_create_bus(fb)
                to_bus = get_or_create_bus(tb)

                cond_type = row.get("conductor_type", "ACSR_Weasel")
                spec = self.conductor_specs.get(cond_type, {})
                r_val = float(row.get("r_ohm_per_km") or spec.get("r_ohm_per_km", 0.9075))
                x_val = float(row.get("x_ohm_per_km") or spec.get("x_ohm_per_km", 0.377))
                i_max = float(
                    row.get("max_i_ka") or (spec.get("current_rating_amps", 134.0) / 1000.0)
                )
                length_km = float(row.get("length_km", 0.5))

                line = db_session.query(Line).filter_by(code=code_str).first()
                if not line:
                    line = Line(
                        feeder_id=feeder.id,
                        from_bus_id=from_bus.id,
                        to_bus_id=to_bus.id,
                        code=code_str,
                        conductor_type=cond_type,
                        length_km=length_km,
                        r_ohm_per_km=r_val,
                        x_ohm_per_km=x_val,
                        max_i_ka=i_max,
                        is_operational=True,
                        source="CSV",
                        provenance="assumed",
                    )
                    db_session.add(line)
                    db_session.flush()
                    created_counts["lines"] += 1

                    conn = Connection(
                        from_element_type="line",
                        from_element_id=line.id,
                        from_terminal="1",
                        to_element_type="bus",
                        to_element_id=from_bus.id,
                        to_terminal="term",
                        is_active=True,
                        source="CSV",
                        provenance="measured",
                    )
                    db_session.add(conn)
                    created_counts["connections"] += 1

            elif entity_type in ("distribution_transformer", "dtr"):
                parent_code = row.get("bus_code") or f"BUS_{code_str}"
                parent_bus = get_or_create_bus(parent_code, lat, lon)
                rated_kva = float(row.get("rated_kva", 100.0))

                dtr = db_session.query(DistributionTransformer).filter_by(code=code_str).first()
                if not dtr:
                    dtr = DistributionTransformer(
                        bus_id=parent_bus.id,
                        code=code_str,
                        name=row.get("name", f"DTR {code_str}"),
                        rated_kva=rated_kva,
                        phase_count=int(row.get("phase_count", 3)),
                        geom=pt,
                        source="CSV",
                        provenance="measured",
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
                        source="CSV",
                        provenance="measured",
                    )
                    db_session.add(conn)
                    created_counts["connections"] += 1

            elif entity_type == "consumer":
                dtr_code = row.get("dtr_code")
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
                            consumer_category=row.get("consumer_category", "domestic"),
                            sanctioned_load_kw=float(row.get("sanctioned_load_kw", 2.0)),
                            phase=row.get("phase", "3ph"),
                            geom=pt,
                            source="CSV",
                            provenance="measured",
                        )
                        db_session.add(consumer)
                        created_counts["consumers"] += 1

        db_session.flush()

        version_tag_str = version_tag or f"v_csv_{uuid.uuid4().hex[:8]}"
        hash_input = f"{version_tag_str}:{created_counts['buses']}:{created_counts['lines']}:{created_counts['distribution_transformers']}"
        network_hash = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()

        topo_version = (
            db_session.query(TopologyVersion).filter_by(version_tag=version_tag_str).first()
        )
        if not topo_version:
            topo_version = TopologyVersion(
                version_tag=version_tag_str,
                network_hash=network_hash,
                description=f"Ingested from CSV: {val_report.filename}",
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
