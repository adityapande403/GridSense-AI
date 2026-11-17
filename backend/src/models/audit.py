from backend.src.core.database import JSONBType
from backend.src.models.base import CoreBaseModel, ProvenanceMixin
from sqlalchemy import Column, Integer, String, Uuid


class AuditLog(CoreBaseModel):
    """
    Immutable audit logging of every simulation, approval, and data import.
    """

    __tablename__ = "audit_logs"

    user_identifier = Column(String(64), default="system", nullable=False, index=True)
    action_type = Column(
        String(64), nullable=False, index=True
    )  # simulate, approve, import, modify, export
    resource_type = Column(
        String(32), nullable=False
    )  # topology, switching_plan, scenario, dataset
    resource_id = Column(Uuid(as_uuid=True), nullable=True)
    client_ip = Column(String(45), nullable=True)
    details_json = Column(JSONBType, default=dict, nullable=False)


class DatasetRegistry(CoreBaseModel, ProvenanceMixin):
    """
    Registry tracking imported and synthetic datasets with cryptographic hashes.
    """

    __tablename__ = "dataset_registry"

    dataset_name = Column(String(128), unique=True, nullable=False, index=True)
    dataset_hash = Column(String(64), nullable=False, index=True)
    file_format = Column(String(16), nullable=False)  # geojson, shapefile, csv, synthetic
    row_count = Column(Integer, default=0, nullable=False)
    quality_report = Column(JSONBType, default=dict, nullable=False)
    description = Column(String(256), nullable=True)
