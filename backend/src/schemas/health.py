from datetime import datetime
from typing import Any, Dict

from pydantic import BaseModel, Field


class HealthCheckResponse(BaseModel):
    status: str = Field(default="ok", json_schema_extra={"example": "ok"})
    app_name: str
    version: str
    environment: str
    database_connected: bool
    tables_count: int
    timestamp: datetime


class ConfigResponse(BaseModel):
    electrical: Dict[str, Any]
    conductors: Dict[str, Any]
    economics: Dict[str, Any]
    thermal: Dict[str, Any]
