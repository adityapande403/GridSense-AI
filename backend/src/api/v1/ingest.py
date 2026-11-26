import base64
import json
import logging
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from backend.src.core.config import settings
from backend.src.core.database import get_db
from backend.src.models.network import (
    Bus,
    Consumer,
    DistributionTransformer,
    Feeder,
    Line,
    Substation,
    Switch,
)
from backend.src.models.telemetry import LoadMeasurement, LoadSnapshot, WeatherObservation
from backend.src.models.topology import TopologyVersion
from backend.src.modules.ingest.csv_adapter import CSVIngestionAdapter
from backend.src.modules.ingest.filegdb_adapter import FileGDBIngestionAdapter
from backend.src.modules.ingest.geojson_adapter import GeoJSONIngestionAdapter
from backend.src.modules.ingest.scada_adapter import SCADAIngestionAdapter
from backend.src.modules.ingest.schemas import (
    IngestionResult,
    SCADAIngestPayload,
    SCADAIngestionResult,
    ValidationReport,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["Ingestion"])


class IngestGDBRequest(BaseModel):
    gdb_path: Optional[str] = None
    version_tag: Optional[str] = None


class IngestGeoJSONRequest(BaseModel):
    data: Dict[str, Any]
    version_tag: Optional[str] = None


class IngestCSVRequest(BaseModel):
    csv_content: str
    filename: Optional[str] = "upload.csv"
    version_tag: Optional[str] = None


class UploadSCADAPayload(BaseModel):
    content: Optional[str] = None
    filename: Optional[str] = "upload.csv"
    default_feeder_code: Optional[str] = None


@router.post("/gdb", response_model=IngestionResult)
def ingest_file_gdb(
    request: IngestGDBRequest,
    db: Session = Depends(get_db),
) -> IngestionResult:
    """
    Ingest distribution network from ESRI File Geodatabase (.gdb or .gdb.zip).
    Defaults to KSEB Puthiya Kadavu dataset/archive if available locally.
    """
    gdb_path = request.gdb_path
    if not gdb_path:
        for candidate in [
            settings.BASE_DIR / "Puthiya Kadavu.gdb" / "Puthiya Kadavu.gdb",
            settings.BASE_DIR / "Puthiya Kadavu.gdb",
            settings.BASE_DIR / "Puthiya Kadavu.gdb.zip",
        ]:
            if candidate.exists():
                gdb_path = str(candidate)
                break

    if not gdb_path or not Path(gdb_path).exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "FileGDB dataset not found on disk. Please upload a .gdb.zip via "
                "POST /api/v1/ingest/upload-gdb, or seed demo data via POST /api/v1/ingest/seed-demo."
            ),
        )

    adapter = FileGDBIngestionAdapter()
    try:
        result = adapter.ingest(
            source=gdb_path,
            db_session=db,
            version_tag=request.version_tag,
        )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error(f"FileGDB Ingestion error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"FileGDB Ingestion failed: {str(e)}")


@router.post("/upload-gdb", response_model=IngestionResult)
async def upload_and_ingest_gdb(
    request: Request,
    filename: Optional[str] = Query("uploaded_grid.gdb.zip", description="File name"),
    version_tag: Optional[str] = Query(None, description="Custom version tag"),
    db: Session = Depends(get_db),
) -> IngestionResult:
    """
    Upload a zipped ESRI FileGDB archive (.zip). Accepts raw binary body or JSON with base64.
    Extracts on-the-fly, validates topology, and writes authoritative digital twin.
    """
    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty request body. Please upload a .zip file.")

    # Check if JSON payload with base64
    if raw_body.startswith(b"{"):
        try:
            data = json.loads(raw_body)
            if "content_base64" in data:
                raw_body = base64.b64decode(data["content_base64"])
                filename = data.get("filename", filename)
                version_tag = data.get("version_tag", version_tag)
        except Exception:
            pass

    # Verify zip magic bytes: PK\x03\x04
    if not raw_body.startswith(b"PK\x03\x04"):
        raise HTTPException(
            status_code=400,
            detail="Uploaded data is not a valid zip archive (missing zip header PK).",
        )

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)
        tmp_file.write(raw_body)

    adapter = FileGDBIngestionAdapter()
    try:
        result = adapter.ingest(
            source=tmp_path,
            db_session=db,
            version_tag=version_tag or f"upload_{filename[:20]}",
        )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error(f"Upload FileGDB error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"FileGDB upload & ingestion failed: {str(e)}")
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                pass


@router.post("/geojson", response_model=IngestionResult)
def ingest_geojson(
    request: IngestGeoJSONRequest,
    db: Session = Depends(get_db),
) -> IngestionResult:
    """Ingest distribution network elements from a GeoJSON FeatureCollection."""
    adapter = GeoJSONIngestionAdapter()
    try:
        result = adapter.ingest(
            source=request.data,
            db_session=db,
            version_tag=request.version_tag,
        )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"GeoJSON Ingestion failed: {str(e)}")


@router.post("/upload-geojson", response_model=IngestionResult)
async def upload_and_ingest_geojson(
    request: Request,
    version_tag: Optional[str] = Query(None, description="Custom version tag"),
    db: Session = Depends(get_db),
) -> IngestionResult:
    """Upload and ingest a GeoJSON FeatureCollection directly from raw body or JSON."""
    raw_body = await request.body()
    try:
        text = raw_body.decode("utf-8-sig", errors="replace")
        parsed = json.loads(text)
        # If wrapped in {data: ...}
        if "data" in parsed and isinstance(parsed["data"], dict):
            parsed = parsed["data"]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON/GeoJSON payload: {str(e)}")

    adapter = GeoJSONIngestionAdapter()
    try:
        result = adapter.ingest(
            source=parsed,
            db_session=db,
            version_tag=version_tag or "upload_geojson",
        )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"GeoJSON Ingestion failed: {str(e)}")


@router.post("/csv", response_model=IngestionResult)
def ingest_csv(
    request: IngestCSVRequest,
    db: Session = Depends(get_db),
) -> IngestionResult:
    """Ingest asset registry tables from CSV text."""
    adapter = CSVIngestionAdapter()
    try:
        source_dict = {"content": request.csv_content, "filename": request.filename or "upload.csv"}
        result = adapter.ingest(
            source=source_dict,
            db_session=db,
            version_tag=request.version_tag,
        )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"CSV Ingestion failed: {str(e)}")


@router.post("/upload-csv", response_model=IngestionResult)
async def upload_and_ingest_csv(
    request: Request,
    filename: Optional[str] = Query("upload.csv", description="CSV filename"),
    version_tag: Optional[str] = Query(None, description="Custom version tag"),
    db: Session = Depends(get_db),
) -> IngestionResult:
    """Upload and ingest asset registry tables from a raw CSV file body."""
    raw_body = await request.body()
    try:
        csv_text = raw_body.decode("utf-8-sig", errors="replace")
        # Check if wrapped in JSON
        if csv_text.strip().startswith("{"):
            parsed = json.loads(csv_text)
            csv_text = parsed.get("csv_content") or parsed.get("content") or csv_text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV text: {str(e)}")

    adapter = CSVIngestionAdapter()
    try:
        result = adapter.ingest(
            source={"content": csv_text, "filename": filename},
            db_session=db,
            version_tag=version_tag or f"upload_{filename[:20]}",
        )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"CSV Ingestion failed: {str(e)}")


# ---------------------------------------------------------------------------
# SCADA & TELEMETRY INGESTION ENDPOINTS
# ---------------------------------------------------------------------------

@router.post("/scada", response_model=SCADAIngestionResult)
def ingest_scada_payload(
    payload: SCADAIngestPayload,
    default_feeder_code: Optional[str] = Query(None, description="Fallback feeder code"),
    db: Session = Depends(get_db),
) -> SCADAIngestionResult:
    """
    Ingest structured SCADA timeseries telemetry: feeder snapshots,
    individual DTR kW allocations, and ambient weather observations.
    """
    adapter = SCADAIngestionAdapter()
    try:
        result = adapter.ingest(
            source=payload.model_dump(),
            db_session=db,
            default_feeder_code=default_feeder_code,
        )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error(f"SCADA ingestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"SCADA Ingestion failed: {str(e)}")


@router.post("/scada/upload", response_model=SCADAIngestionResult)
async def upload_and_ingest_scada(
    request: Request,
    filename: Optional[str] = Query("scada_upload.csv", description="File name"),
    default_feeder_code: Optional[str] = Query(None, description="Fallback feeder code"),
    db: Session = Depends(get_db),
) -> SCADAIngestionResult:
    """
    Upload and ingest SCADA operational logs from CSV or JSON timeseries.
    Accepts raw CSV text, JSON array, or structured JSON payload in the request body.
    """
    raw_bytes = await request.body()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty request body.")

    text = raw_bytes.decode("utf-8-sig", errors="replace").strip()

    adapter = SCADAIngestionAdapter()
    try:
        if text.startswith("{") or text.startswith("["):
            parsed = json.loads(text)
            # If payload model
            if isinstance(parsed, dict) and ("content" in parsed or "csv_content" in parsed):
                src = parsed.get("content") or parsed.get("csv_content")
            else:
                src = parsed
            result = adapter.ingest(
                source=src,
                db_session=db,
                default_feeder_code=default_feeder_code,
            )
        else:
            result = adapter.ingest(
                source=text,
                db_session=db,
                default_feeder_code=default_feeder_code,
            )
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        logger.error(f"SCADA upload ingestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"SCADA Ingestion failed: {str(e)}")


@router.post("/seed-demo")
def seed_demo_data(
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    One-click setup for demonstration and evaluation without external proprietary GDB:
    Seeds authoritative 11 kV Feeder digital twin from bundled GeoJSON and 24-hour SCADA timeseries.
    """
    network_file = settings.BASE_DIR / "backend" / "src" / "data" / "demo_network_feeder.geojson"
    scada_file = settings.BASE_DIR / "backend" / "src" / "data" / "demo_scada_telemetry.csv"

    if not network_file.exists():
        raise HTTPException(status_code=500, detail=f"Bundled demo network file not found at: {network_file}")

    try:
        with open(network_file, "r", encoding="utf-8") as f:
            geojson_data = json.load(f)

        geo_adapter = GeoJSONIngestionAdapter()
        net_result = geo_adapter.ingest(
            source=geojson_data,
            db_session=db,
            version_tag="seed_demo_kseb_11kv",
        )

        scada_result = None
        if scada_file.exists():
            scada_adapter = SCADAIngestionAdapter()
            scada_result = scada_adapter.ingest(
                source=scada_file,
                db_session=db,
                default_feeder_code="2011951",
                provenance="measured",
            )

        db.commit()
        return {
            "success": True,
            "message": "Demo grid digital twin and SCADA telemetry successfully seeded into database.",
            "network_ingestion": net_result.model_dump(),
            "scada_ingestion": scada_result.model_dump() if scada_result else None,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Seed demo data failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to seed demo data: {str(e)}")


@router.get("/summary")
def get_ingestion_summary(
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Returns database record counts and latest telemetry timestamps."""
    feeders_count = db.query(Feeder).count()
    substations_count = db.query(Substation).count()
    buses_count = db.query(Bus).count()
    lines_count = db.query(Line).count()
    dtrs_count = db.query(DistributionTransformer).count()
    switches_count = db.query(Switch).count()
    consumers_count = db.query(Consumer).count()
    snapshots_count = db.query(LoadSnapshot).count()
    measurements_count = db.query(LoadMeasurement).count()
    weather_count = db.query(WeatherObservation).count()
    versions_count = db.query(TopologyVersion).count()

    latest_snapshot = db.query(LoadSnapshot).order_by(LoadSnapshot.timestamp.desc()).first()
    latest_topo = db.query(TopologyVersion).order_by(TopologyVersion.created_at.desc()).first()

    return {
        "status": "online",
        "counts": {
            "substations": substations_count,
            "feeders": feeders_count,
            "buses": buses_count,
            "lines": lines_count,
            "distribution_transformers": dtrs_count,
            "switches": switches_count,
            "consumers": consumers_count,
            "load_snapshots": snapshots_count,
            "load_measurements": measurements_count,
            "weather_observations": weather_count,
            "topology_versions": versions_count,
        },
        "latest_topology_hash": latest_topo.network_hash if latest_topo else None,
        "latest_snapshot_timestamp": latest_snapshot.timestamp.isoformat() if latest_snapshot else None,
    }


@router.get("/templates/{template_type}")
def download_template(
    template_type: str,
) -> Response:
    """Download clean sample templates for SCADA telemetry or GeoJSON."""
    if template_type == "scada_csv":
        content = (
            "timestamp,feeder_code,total_p_mw,total_q_mvar,source_bus_voltage_pu,dtr_code,p_kw,q_kvar,current_a,voltage_pu,ambient_temperature_c,solar_radiation_w_m2\n"
            "2026-11-25 12:00:00,2011951,2.50,0.82,1.00,2011951-DTR-01,215.0,70.0,33.0,0.965,32.5,820.0\n"
            "2026-11-25 13:00:00,2011951,2.45,0.80,1.00,2011951-DTR-01,210.0,68.0,32.0,0.966,33.0,800.0\n"
        )
        return Response(content=content, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=scada_telemetry_template.csv"})

    elif template_type == "geojson":
        sample = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [75.78, 11.25]},
                    "properties": {"entity_type": "bus", "code": "BUS_01", "voltage_level_kv": 11.0, "bus_type": "slack"},
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [75.79, 11.26]},
                    "properties": {"entity_type": "bus", "code": "BUS_02", "voltage_level_kv": 11.0, "bus_type": "pq"},
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [[75.78, 11.25], [75.79, 11.26]]},
                    "properties": {"entity_type": "line", "code": "LINE_01", "from_bus_code": "BUS_01", "to_bus_code": "BUS_02", "length_km": 1.2, "conductor_type": "ACSR_Raccoon"},
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [75.79, 11.26]},
                    "properties": {"entity_type": "distribution_transformer", "code": "DTR_01", "bus_code": "BUS_02", "rated_kva": 250.0},
                },
            ],
        }
        return Response(content=json.dumps(sample, indent=2), media_type="application/json", headers={"Content-Disposition": "attachment; filename=sample_distribution_network.geojson"})

    elif template_type == "csv_assets":
        content = (
            "entity_type,code,from_bus_code,to_bus_code,length_km,conductor_type,rated_kva,latitude,longitude\n"
            "bus,BUS_01,,,,,,11.25,75.78\n"
            "bus,BUS_02,,,,,,11.26,75.79\n"
            "line,LINE_01,BUS_01,BUS_02,1.2,ACSR_Raccoon,,,,\n"
            "distribution_transformer,DTR_01,,,,,250.0,11.26,75.79\n"
        )
        return Response(content=content, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=asset_registry_template.csv"})

    else:
        raise HTTPException(status_code=400, detail="Valid template types: 'scada_csv', 'geojson', 'csv_assets'")


@router.post("/validate", response_model=ValidationReport)
def validate_dataset(
    source_type: str = Query(..., description="'esri_filegdb', 'geojson', or 'csv'"),
    file_path: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> ValidationReport:
    """Perform pre-ingestion validation without database modification."""
    if source_type == "esri_filegdb":
        path = file_path
        if not path:
            for candidate in [
                settings.BASE_DIR / "Puthiya Kadavu.gdb" / "Puthiya Kadavu.gdb",
                settings.BASE_DIR / "Puthiya Kadavu.gdb",
                settings.BASE_DIR / "Puthiya Kadavu.gdb.zip",
            ]:
                if candidate.exists():
                    path = str(candidate)
                    break
        if not path:
            raise HTTPException(status_code=404, detail="FileGDB dataset or zip archive not found.")
        adapter = FileGDBIngestionAdapter()
        return adapter.validate(path)
    elif source_type == "geojson":
        if not payload:
            raise HTTPException(status_code=400, detail="GeoJSON payload required.")
        adapter = GeoJSONIngestionAdapter()
        return adapter.validate(payload)
    elif source_type == "csv":
        if not file_path and not payload:
            raise HTTPException(status_code=400, detail="CSV file_path or payload required.")
        adapter = CSVIngestionAdapter()
        return adapter.validate(file_path or payload)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported source_type '{source_type}'.")
