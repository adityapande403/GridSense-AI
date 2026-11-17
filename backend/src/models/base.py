import uuid
from datetime import datetime, timezone
from enum import Enum

from backend.src.core.database import Base
from sqlalchemy import Column, DateTime, Float, String, Uuid


class ProvenanceEnum(str, Enum):
    SYNTHETIC = "synthetic"
    MEASURED = "measured"
    ESTIMATED = "estimated"
    PREDICTED = "predicted"
    ASSUMED = "assumed"


class A5ApprovalStatusEnum(str, Enum):
    VALIDATED_FEASIBLE = "VALIDATED_FEASIBLE"
    FEASIBLE_PROTECTION_UNVERIFIED = "FEASIBLE_PROTECTION_UNVERIFIED"
    FEASIBLE_WITH_WARNINGS = "FEASIBLE_WITH_WARNINGS"
    NOT_FEASIBLE = "NOT_FEASIBLE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class CoreBaseModel(Base):
    __abstract__ = True

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ProvenanceMixin:
    source = Column(String(128), default="internal", nullable=False)
    provenance = Column(String(32), default=ProvenanceEnum.ASSUMED.value, nullable=False)
    confidence_score = Column(Float, default=1.0, nullable=False)
