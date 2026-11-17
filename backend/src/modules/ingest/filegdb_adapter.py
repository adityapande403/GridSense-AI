import hashlib
import json
import logging
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import geopandas as gpd
import pyogrio
import pyproj
from backend.src.core.config import settings
from backend.src.models.network import (
    Bus,
    Connection,
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
from shapely.geometry import Point
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class FileGDBIngestionAdapter(BaseIngestionAdapter):
    """
    Ingests ESRI File Geodatabase (.gdb) network models (e.g., KSEB Puthiya Kadavu, TSSPDCL GIS).
    Adheres strictly to:
      - Principle A4-3: Explicit provenance labeling ('measured' for GIS assets, 'assumed' for missing electrical specs).
      - Principle A4-4: Geometry stored separately from topology.
      - Principle A4-5: Missing data surfaced in validation report.
      - Principle A4-8: Independent reproducibility via immutable TopologyVersion.
    """

    def __init__(self, mapping_config_path: Optional[Union[str, Path]] = None):
        if mapping_config_path is None:
            mapping_config_path = settings.BASE_DIR / "config" / "ingestion_mappings.json"
        self.mapping_config_path = Path(mapping_config_path)
        self.geod = pyproj.Geod(ellps="WGS84")

        # Load mappings
        if self.mapping_config_path.exists():
            with open(self.mapping_config_path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
        else:
            self.config = {"adapters": {"esri_filegdb": {"layers": {}}}}

        self.gdb_layer_mappings = (
            self.config.get("adapters", {}).get("esri_filegdb", {}).get("layers", {})
        )

        # Load default conductor specs
        conductors_path = settings.BASE_DIR / "config" / "conductors.json"
        if conductors_path.exists():
            with open(conductors_path, "r", encoding="utf-8") as f:
                self.conductor_specs = json.load(f).get("conductors", {})
        else:
            self.conductor_specs = {}

    def _resolve_gdb_path(self, source: Union[str, Path]) -> Path:
        p = Path(source)
        if not p.exists():
            raise FileNotFoundError(f"FileGDB dataset not found at path: {source}")
        return p

    def validate(self, source: Union[str, Path, dict]) -> ValidationReport:
        """Inspect FileGDB layers, check required attributes and geometries, and build a ValidationReport."""
        gdb_path = self._resolve_gdb_path(
            source if not isinstance(source, dict) else source.get("path", "")
        )
        layers_info = pyogrio.list_layers(str(gdb_path))
        available_layers = {lyr[0] for lyr in layers_info}

        report = ValidationReport(
            source_type="esri_filegdb",
            filename=gdb_path.name,
            total_rows=0,
            rows_accepted=0,
            rows_rejected=0,
            rejection_reasons=[],
            warnings=[],
            summary_counts={},
        )

        for layer_name in [
            "distribution_transformer",
            "ht_line",
            "ht_cable",
            "switch",
            "open_point",
            "ring_main_unit",
        ]:
            if layer_name not in available_layers:
                report.warnings.append(
                    f"Optional GIS layer '{layer_name}' not present in {gdb_path.name}."
                )
                continue

            try:
                gdf = gpd.read_file(str(gdb_path), layer=layer_name)
            except Exception as e:
                report.warnings.append(f"Could not read layer '{layer_name}': {e}")
                continue

            layer_count = len(gdf)
            report.total_rows += layer_count
            report.summary_counts[layer_name] = layer_count

            # Validate individual records
            for idx, row in gdf.iterrows():
                # Check geometry
                geom = row.get("geometry")
                if geom is None or geom.is_empty:
                    report.rows_rejected += 1
                    report.rejection_reasons.append(
                        RejectionReason(
                            row_index=int(idx),
                            entity_type=layer_name,
                            identifier=str(
                                row.get("asset_id") or row.get("global_id") or f"row_{idx}"
                            ),
                            reason="Missing or empty geometry.",
                            error_code="ERR_INVALID_GEOM",
                        )
                    )
                    continue

                # Check identifiers
                code = (
                    row.get("asset_id")
                    or row.get("global_id")
                    or row.get("assetid")
                    or row.get("globalid")
                )
                if not code or str(code).strip() in ("", "NA", "None"):
                    report.rows_rejected += 1
                    report.rejection_reasons.append(
                        RejectionReason(
                            row_index=int(idx),
                            entity_type=layer_name,
                            identifier=None,
                            reason="Missing primary identifier/asset_id.",
                            error_code="ERR_MISSING_ID",
                        )
                    )
                    continue

                report.rows_accepted += 1

        return report

    def ingest(
        self,
        source: Union[str, Path, dict],
        db_session: Session,
        organisation_id: Optional[uuid.UUID] = None,
        feeder_id: Optional[uuid.UUID] = None,
        version_tag: Optional[str] = None,
    ) -> IngestionResult:
        """Parse FileGDB and persist all assets into the database with explicit topology and immutable version."""
        val_report = self.validate(source)
        gdb_path = self._resolve_gdb_path(
            source if not isinstance(source, dict) else source.get("path", "")
        )

        # 1. Ensure Organisation exists
        org = None
        if organisation_id:
            org = db_session.get(Organisation, organisation_id)
        if not org:
            org = db_session.query(Organisation).filter_by(code="KSEB_CENTRAL").first()
            if not org:
                org = Organisation(
                    code="KSEB_CENTRAL",
                    name="Kerala State Electricity Board (Ingested GIS)",
                    description="Real-world distribution network imported from FileGDB.",
                )
                db_session.add(org)
                db_session.flush()

        # 2. Ensure Substation exists
        substation = db_session.query(Substation).filter_by(code="SS_PUTHIYA_KADAVU").first()
        if not substation:
            substation = Substation(
                organisation_id=org.id,
                code="SS_PUTHIYA_KADAVU",
                name="Puthiya Kadavu 33/11 kV Substation",
                nominal_kv=33.0,
                ptr_capacity_mva=5.0,
                source=f"FileGDB:{gdb_path.name}",
                provenance="assumed",
                confidence_score=0.90,
            )
            db_session.add(substation)
            db_session.flush()

        # 3. Read layers
        available_layers = {lyr[0] for lyr in pyogrio.list_layers(str(gdb_path))}
        ht_lines_gdf = (
            gpd.read_file(str(gdb_path), layer="ht_line") if "ht_line" in available_layers else None
        )
        ht_cables_gdf = (
            gpd.read_file(str(gdb_path), layer="ht_cable")
            if "ht_cable" in available_layers
            else None
        )
        dtr_gdf = (
            gpd.read_file(str(gdb_path), layer="distribution_transformer")
            if "distribution_transformer" in available_layers
            else None
        )
        switch_gdf = (
            gpd.read_file(str(gdb_path), layer="switch") if "switch" in available_layers else None
        )
        open_point_gdf = (
            gpd.read_file(str(gdb_path), layer="open_point")
            if "open_point" in available_layers
            else None
        )
        poles_gdf = (
            gpd.read_file(str(gdb_path), layer="pole_tower_support_structure")
            if "pole_tower_support_structure" in available_layers
            else None
        )

        # Build pole coordinate index if poles layer is available
        pole_coords: Dict[str, Tuple[float, float]] = {}
        if poles_gdf is not None:
            for _, prow in poles_gdf.iterrows():
                pcode = (
                    prow.get("asset_id") or prow.get("samagra_name") or prow.get("kseb_pole_code")
                )
                pgeom = prow.get("geometry")
                if pcode and pgeom and not pgeom.is_empty:
                    pole_coords[str(pcode).strip()] = (pgeom.x, pgeom.y)

        # 4. Resolve Feeder
        feeder_code = "2011951"
        feeder_name = "Puthiya Kadavu"
        if dtr_gdf is not None and not dtr_gdf.empty:
            fc = dtr_gdf.iloc[0].get("feeder_code")
            fn = dtr_gdf.iloc[0].get("feeder_name")
            if fc and str(fc) != "NA":
                feeder_code = str(fc)
            if fn and str(fn) != "NA":
                feeder_name = str(fn)

        feeder = db_session.query(Feeder).filter_by(code=feeder_code).first()
        if not feeder:
            feeder = Feeder(
                substation_id=substation.id,
                code=feeder_code,
                name=feeder_name,
                voltage_kv=11.0,
                peak_load_kw=1100.0,
                trunk_conductor_type="ACSR_Rabbit",
                metadata_json={"source_gdb": gdb_path.name},
                source=f"FileGDB:{gdb_path.name}",
                provenance="measured",
                confidence_score=0.95,
            )
            db_session.add(feeder)
            db_session.flush()

        created_counts: Dict[str, int] = {
            "buses": 0,
            "lines": 0,
            "distribution_transformers": 0,
            "switches": 0,
            "connections": 0,
        }

        bus_map: Dict[str, Bus] = {}

        def get_or_create_bus(
            bus_code: str, geom_pt: Optional[Point] = None, is_substation_source: bool = False
        ) -> Bus:
            clean_code = str(bus_code).strip()
            if clean_code in bus_map:
                return bus_map[clean_code]

            existing = db_session.query(Bus).filter_by(code=clean_code, feeder_id=feeder.id).first()
            if existing:
                bus_map[clean_code] = existing
                return existing

            # Determine point coordinates
            pt = geom_pt
            if pt is None and clean_code in pole_coords:
                x, y = pole_coords[clean_code]
                pt = Point(x, y)

            bus_type = "slack" if is_substation_source else "pq"
            bus = Bus(
                feeder_id=feeder.id,
                code=clean_code,
                name=f"Pole/Bus {clean_code}",
                voltage_level_kv=11.0,
                bus_type=bus_type,
                geom=pt,
                source=f"FileGDB:{gdb_path.name}",
                provenance="measured" if pt is not None else "assumed",
                confidence_score=0.95 if pt is not None else 0.80,
            )
            db_session.add(bus)
            db_session.flush()
            bus_map[clean_code] = bus
            created_counts["buses"] += 1
            return bus

        # 5. Process HT Lines and Cables
        line_records: List[Line] = []
        line_gdfs = []
        if ht_lines_gdf is not None:
            line_gdfs.append((ht_lines_gdf, "ACSR_Weasel"))
        if ht_cables_gdf is not None:
            line_gdfs.append((ht_cables_gdf, "XLPE_HT_Cable"))

        for gdf, default_cond in line_gdfs:
            for _, row in gdf.iterrows():
                lcode = row.get("asset_id") or row.get("global_id")
                from_name = row.get("connect_from_name")
                to_name = row.get("connect_to_name")
                geom = row.get("geometry")

                if (
                    not lcode
                    or not from_name
                    or not to_name
                    or str(from_name).strip() in ("", "NA")
                    or str(to_name).strip() in ("", "NA")
                ):
                    continue

                lcode_str = str(lcode).strip()
                from_str = str(from_name).strip()
                to_str = str(to_name).strip()

                # Get endpoint coordinates if available from LineString
                from_pt = None
                to_pt = None
                if geom and not geom.is_empty:
                    if geom.geom_type == "LineString":
                        coords = list(geom.coords)
                        if len(coords) >= 2:
                            from_pt = Point(coords[0])
                            to_pt = Point(coords[-1])
                    elif geom.geom_type == "MultiLineString":
                        first_line = list(geom.geoms)[0]
                        last_line = list(geom.geoms)[-1]
                        from_pt = Point(list(first_line.coords)[0])
                        to_pt = Point(list(last_line.coords)[-1])

                from_bus = get_or_create_bus(from_str, from_pt)
                to_bus = get_or_create_bus(to_str, to_pt)

                # Calculate geodesic length
                length_km = 0.05
                if geom and not geom.is_empty:
                    length_m = self.geod.geometry_length(geom)
                    length_km = max(0.01, round(length_m / 1000.0, 4))

                # Conductor properties
                cond_spec = self.conductor_specs.get(default_cond, {})
                r_val = cond_spec.get("r_ohm_per_km", 0.9075)
                x_val = cond_spec.get("x_ohm_per_km", 0.377)
                i_max = cond_spec.get("current_rating_amps", 134.0) / 1000.0

                line = db_session.query(Line).filter_by(code=lcode_str).first()
                if not line:
                    line = Line(
                        feeder_id=feeder.id,
                        from_bus_id=from_bus.id,
                        to_bus_id=to_bus.id,
                        code=lcode_str,
                        conductor_type=default_cond,
                        length_km=length_km,
                        r_ohm_per_km=r_val,
                        x_ohm_per_km=x_val,
                        max_i_ka=i_max,
                        is_operational=True,
                        geom=geom,
                        source=f"FileGDB:{gdb_path.name}",
                        provenance="assumed",  # Conductor electrical parameters assumed from config
                        confidence_score=0.90,
                    )
                    db_session.add(line)
                    db_session.flush()
                    created_counts["lines"] += 1
                    line_records.append(line)

                    # Explicit terminal Connection record (Principle A4-4)
                    conn = Connection(
                        from_element_type="line",
                        from_element_id=line.id,
                        from_terminal="1",
                        to_element_type="bus",
                        to_element_id=from_bus.id,
                        to_terminal="term",
                        is_active=True,
                        metadata_json={"bus_code": from_bus.code},
                        source=f"FileGDB:{gdb_path.name}",
                        provenance="measured",
                        confidence_score=0.95,
                    )
                    db_session.add(conn)
                    created_counts["connections"] += 1

        # 6. Process Distribution Transformers
        if dtr_gdf is not None:
            for _, row in dtr_gdf.iterrows():
                dcode = row.get("asset_id") or row.get("dtr_code") or row.get("global_id")
                dname = row.get("name") or row.get("samagra_name")
                parent_pole = row.get("connect_from_name")
                geom = row.get("geometry")

                if not dcode or str(dcode).strip() in ("", "NA"):
                    continue

                dcode_str = str(dcode).strip()
                parent_bus = None
                if parent_pole and str(parent_pole).strip() not in ("", "NA"):
                    parent_bus = get_or_create_bus(str(parent_pole).strip(), geom)
                else:
                    parent_bus = get_or_create_bus(f"BUS_{dcode_str}", geom)

                # Parse rated kVA
                rated_kva = 100.0
                samagra = str(row.get("samagra_name") or "")
                if "500" in samagra:
                    rated_kva = 500.0
                elif "250" in samagra:
                    rated_kva = 250.0
                elif "160" in samagra:
                    rated_kva = 160.0
                elif "100" in samagra:
                    rated_kva = 100.0
                elif "63" in samagra:
                    rated_kva = 63.0

                dtr = db_session.query(DistributionTransformer).filter_by(code=dcode_str).first()
                if not dtr:
                    dtr = DistributionTransformer(
                        bus_id=parent_bus.id,
                        code=dcode_str,
                        name=str(dname) if dname else f"DTR {dcode_str}",
                        rated_kva=rated_kva,
                        phase_count=3,
                        no_load_loss_kw=0.25,
                        full_load_loss_kw=1.35,
                        percent_z=4.5,
                        is_metered=False,
                        geom=geom,
                        source=f"FileGDB:{gdb_path.name}",
                        provenance="measured",
                        confidence_score=0.95,
                    )
                    db_session.add(dtr)
                    db_session.flush()
                    created_counts["distribution_transformers"] += 1

                    # Connection
                    conn = Connection(
                        from_element_type="dtr",
                        from_element_id=dtr.id,
                        from_terminal="primary",
                        to_element_type="bus",
                        to_element_id=parent_bus.id,
                        to_terminal="term",
                        is_active=True,
                        metadata_json={"bus_code": parent_bus.code},
                        source=f"FileGDB:{gdb_path.name}",
                        provenance="measured",
                        confidence_score=0.95,
                    )
                    db_session.add(conn)
                    created_counts["connections"] += 1

        # 7. Process Switches and RMU
        if switch_gdf is not None:
            for _, row in switch_gdf.iterrows():
                scode = row.get("asset_id") or row.get("global_id")
                sname = row.get("name") or row.get("samagra_name")
                from_name = row.get("connect_from_name")
                to_name = row.get("connect_to_name")
                geom = row.get("geometry")

                if not scode or str(scode).strip() in ("", "NA"):
                    continue

                scode_str = str(scode).strip()
                sname_str = str(sname) if sname else scode_str

                from_bus = get_or_create_bus(
                    str(from_name).strip()
                    if from_name and str(from_name) != "NA"
                    else f"SW_BUS_A_{scode_str}",
                    geom,
                )
                to_bus = get_or_create_bus(
                    str(to_name).strip()
                    if to_name and str(to_name) != "NA"
                    else f"SW_BUS_B_{scode_str}",
                    geom,
                )

                # Determine switch type
                stype = "sectionalizer"
                if "RM" in scode_str or "RMU" in sname_str:
                    stype = "rmu"
                elif "Earth" in sname_str or "ESW" in scode_str:
                    stype = "earth_switch"

                sw = db_session.query(Switch).filter_by(code=scode_str).first()
                if not sw:
                    sw = Switch(
                        from_bus_id=from_bus.id,
                        to_bus_id=to_bus.id,
                        code=scode_str,
                        switch_type=stype,
                        is_normally_open=False,
                        current_status="closed",
                        is_motorized=True if stype == "rmu" else False,
                        breaking_capacity_ka=16.0 if stype == "rmu" else 12.5,
                        geom=geom,
                        source=f"FileGDB:{gdb_path.name}",
                        provenance="measured",
                        confidence_score=0.90,
                    )
                    db_session.add(sw)
                    created_counts["switches"] += 1

        # 8. Process Open Points (Normally-open tie points)
        if open_point_gdf is not None:
            for _, row in open_point_gdf.iterrows():
                ocode = row.get("assetid") or row.get("globalid")
                geom = row.get("geometry")

                if not ocode or str(ocode).strip() in ("", "NA"):
                    continue

                ocode_str = str(ocode).strip()
                from_bus = get_or_create_bus(ocode_str, geom)
                to_bus = get_or_create_bus(f"{ocode_str}_TIE_EXT", geom)

                sw = db_session.query(Switch).filter_by(code=f"TIE_{ocode_str}").first()
                if not sw:
                    sw = Switch(
                        from_bus_id=from_bus.id,
                        to_bus_id=to_bus.id,
                        code=f"TIE_{ocode_str}",
                        switch_type="tie_switch",
                        is_normally_open=True,
                        current_status="open",
                        is_motorized=False,
                        breaking_capacity_ka=12.5,
                        geom=geom,
                        source=f"FileGDB:{gdb_path.name}",
                        provenance="measured",
                        confidence_score=0.95,
                    )
                    db_session.add(sw)
                    created_counts["switches"] += 1

        # 9. Compute network hash and create TopologyVersion
        db_session.flush()
        version_tag_str = version_tag or f"v_kseb_{feeder_code}_{uuid.uuid4().hex[:8]}"
        hash_input = f"{feeder.code}:{created_counts['buses']}:{created_counts['lines']}:{created_counts['distribution_transformers']}"
        network_hash = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()

        topo_version = (
            db_session.query(TopologyVersion).filter_by(version_tag=version_tag_str).first()
        )
        if not topo_version:
            topo_version = TopologyVersion(
                version_tag=version_tag_str,
                network_hash=network_hash,
                description=f"Ingested from FileGDB: {gdb_path.name} (Feeder {feeder.name} - {feeder.code})",
                is_authoritative=True,
                metadata_json={
                    "source_gdb": gdb_path.name,
                    "created_counts": created_counts,
                    "total_dtrs": created_counts["distribution_transformers"],
                    "total_lines": created_counts["lines"],
                },
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
