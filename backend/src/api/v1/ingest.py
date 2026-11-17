from pathlib import Path
from typing import Any, Dict, Optional

from backend.src.core.config import settings
from backend.src.core.database import get_db
from backend.src.modules.ingest.csv_adapter import CSVIngestionAdapter
from backend.src.modules.ingest.filegdb_adapter import FileGDBIngestionAdapter
from backend.src.modules.ingest.geojson_adapter import GeoJSONIngestionAdapter
from backend.src.modules.ingest.schemas import IngestionResult, ValidationReport
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

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


@router.post("/gdb", response_model=IngestionResult)
def ingest_file_gdb(
    request: IngestGDBRequest,
    db: Session = Depends(get_db),
) -> IngestionResult:
    """
    Ingest distribution network from ESRI File Geodatabase (.gdb).
    Defaults to KSEB Puthiya Kadavu dataset if no path provided.
    """
    gdb_path = request.gdb_path or str(
        settings.BASE_DIR / "Puthiya Kadavu.gdb" / "Puthiya Kadavu.gdb"
    )
    if not Path(gdb_path).exists():
        # Fallback check
        alt_path = settings.BASE_DIR / "Puthiya Kadavu.gdb"
        if alt_path.exists() and (alt_path / "Puthiya Kadavu.gdb").exists():
            gdb_path = str(alt_path / "Puthiya Kadavu.gdb")
        elif alt_path.exists():
            gdb_path = str(alt_path)
        else:
            raise HTTPException(status_code=404, detail=f"FileGDB dataset not found at: {gdb_path}")

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
        raise HTTPException(status_code=500, detail=f"FileGDB Ingestion failed: {str(e)}")


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


@router.post("/validate", response_model=ValidationReport)
def validate_dataset(
    source_type: str = Query(..., description="'esri_filegdb', 'geojson', or 'csv'"),
    file_path: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> ValidationReport:
    """Perform pre-ingestion validation without database modification."""
    if source_type == "esri_filegdb":
        path = file_path or str(settings.BASE_DIR / "Puthiya Kadavu.gdb" / "Puthiya Kadavu.gdb")
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
