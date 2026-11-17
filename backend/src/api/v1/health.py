from datetime import datetime, timezone

from backend.src.core.config import settings
from backend.src.core.database import Base, get_db
from backend.src.schemas.health import HealthCheckResponse
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

router = APIRouter(tags=["System Health"])


@router.get("/health", response_model=HealthCheckResponse)
def healthcheck(db: Session = Depends(get_db)):
    """System health check endpoint verifying database connectivity."""
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return HealthCheckResponse(
        status="ok" if db_ok else "degraded",
        app_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        database_connected=db_ok,
        tables_count=len(Base.metadata.tables),
        timestamp=datetime.now(timezone.utc),
    )
