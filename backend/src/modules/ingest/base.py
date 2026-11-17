from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional, Union
from uuid import UUID

from backend.src.modules.ingest.schemas import IngestionResult, ValidationReport
from sqlalchemy.orm import Session


class BaseIngestionAdapter(ABC):
    """
    Abstract Base Class for declarative network data ingestion.
    Enforces Principle A4-3 (explicit provenance labeling) and Principle A4-5 (never ignore missing data).
    """

    @abstractmethod
    def validate(self, source: Union[str, Path, dict]) -> ValidationReport:
        """Parse source data and produce a detailed validation report without modifying the DB."""
        pass

    @abstractmethod
    def ingest(
        self,
        source: Union[str, Path, dict],
        db_session: Session,
        organisation_id: Optional[UUID] = None,
        feeder_id: Optional[UUID] = None,
        version_tag: Optional[str] = None,
    ) -> IngestionResult:
        """Ingest source data into database models and create a new immutable TopologyVersion."""
        pass
