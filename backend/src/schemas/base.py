from enum import Enum
from typing import Generic, List, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ProvenanceTag(str, Enum):
    SYNTHETIC = "synthetic"
    MEASURED = "measured"
    ESTIMATED = "estimated"
    PREDICTED = "predicted"
    ASSUMED = "assumed"


class A5Status(str, Enum):
    VALIDATED_FEASIBLE = "VALIDATED_FEASIBLE"
    FEASIBLE_PROTECTION_UNVERIFIED = "FEASIBLE_PROTECTION_UNVERIFIED"
    FEASIBLE_WITH_WARNINGS = "FEASIBLE_WITH_WARNINGS"
    NOT_FEASIBLE = "NOT_FEASIBLE"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(from_attributes=True)
