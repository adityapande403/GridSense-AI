from backend.src.core.database import JSONBType
from backend.src.models.base import CoreBaseModel, ProvenanceMixin
from sqlalchemy import Boolean, Column, ForeignKey, String, Uuid


class Scenario(CoreBaseModel, ProvenanceMixin):
    """
    Isolated What-If simulation sandbox.
    Never modifies the authoritative digital twin.
    """
    __tablename__ = "scenarios"

    base_topology_version_id = Column(Uuid(as_uuid=True), ForeignKey("topology_versions.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    description = Column(String(256), nullable=True)
    modifications = Column(JSONBType, default=dict, nullable=False)
    simulation_results = Column(JSONBType, default=dict, nullable=False)
    is_saved = Column(Boolean, default=True, nullable=False)
