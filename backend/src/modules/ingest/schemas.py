from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

ProvenanceType = Literal["synthetic", "measured", "estimated", "predicted", "assumed"]


class RejectionReason(BaseModel):
    row_index: int
    entity_type: str
    identifier: Optional[str] = None
    reason: str
    error_code: str
    raw_data: Optional[Dict[str, Any]] = None


class ValidationReport(BaseModel):
    dataset_id: Optional[UUID] = None
    source_type: Literal["esri_filegdb", "geojson", "shapefile", "csv"]
    filename: str
    total_rows: int = 0
    rows_accepted: int = 0
    rows_rejected: int = 0
    rejection_reasons: List[RejectionReason] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    summary_counts: Dict[str, int] = Field(default_factory=dict)


class IngestionResult(BaseModel):
    success: bool
    topology_version_id: Optional[UUID] = None
    version_tag: Optional[str] = None
    network_hash: Optional[str] = None
    validation_report: ValidationReport
    created_counts: Dict[str, int] = Field(default_factory=dict)


class SCADARejectionReason(BaseModel):
    row_index: int
    record_type: str
    identifier: Optional[str] = None
    reason: str
    error_code: str
    raw_data: Optional[Dict[str, Any]] = None


class SCADAValidationReport(BaseModel):
    source_type: Literal["csv", "json"]
    filename: str
    total_records: int = 0
    records_accepted: int = 0
    records_rejected: int = 0
    rejection_reasons: List[SCADARejectionReason] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    summary_counts: Dict[str, int] = Field(default_factory=dict)


class SCADAIngestionResult(BaseModel):
    success: bool
    dataset_hash: str
    total_records: int
    snapshots_created: int
    measurements_created: int
    weather_created: int
    records_rejected: int
    time_range_start: Optional[str] = None
    time_range_end: Optional[str] = None
    summary_stats: Dict[str, Any] = Field(default_factory=dict)
    rejection_reasons: List[SCADARejectionReason] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class SCADAFeederRecord(BaseModel):
    timestamp: str
    feeder_code: Optional[str] = None
    total_p_mw: float
    total_q_mvar: Optional[float] = None
    source_bus_voltage_pu: Optional[float] = 1.0


class SCADADTRRecord(BaseModel):
    timestamp: str
    dtr_code: str
    p_kw: float
    q_kvar: Optional[float] = None
    voltage_pu: Optional[float] = None
    current_a: Optional[float] = None
    is_metered: Optional[bool] = True


class SCADAWeatherRecord(BaseModel):
    timestamp: str
    ambient_temperature_c: float
    humidity_pct: Optional[float] = None
    solar_radiation_w_m2: Optional[float] = None


class SCADAIngestPayload(BaseModel):
    feeder_snapshots: List[SCADAFeederRecord] = Field(default_factory=list)
    dtr_measurements: List[SCADADTRRecord] = Field(default_factory=list)
    weather_observations: List[SCADAWeatherRecord] = Field(default_factory=list)
    source_name: Optional[str] = "api_scada_payload"

