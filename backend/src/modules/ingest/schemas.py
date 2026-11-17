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
