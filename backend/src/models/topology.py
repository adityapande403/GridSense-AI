from backend.src.core.database import JSONBType
from backend.src.models.base import CoreBaseModel
from sqlalchemy import Boolean, Column, ForeignKey, String, Uuid
from sqlalchemy.orm import relationship


class TopologyVersion(CoreBaseModel):
    """
    Immutable network state versioning.
    Every recommendation, simulation, or scenario points to a specific topology version.
    """

    __tablename__ = "topology_versions"

    version_tag = Column(String(64), unique=True, nullable=False, index=True)
    parent_version_id = Column(
        Uuid(as_uuid=True), ForeignKey("topology_versions.id"), nullable=True
    )
    network_hash = Column(String(64), nullable=False, index=True)
    description = Column(String(256), nullable=True)
    is_authoritative = Column(Boolean, default=False, nullable=False)
    metadata_json = Column(JSONBType, default=dict, nullable=False)

    diffs = relationship(
        "TopologyDiff", back_populates="topology_version", cascade="all, delete-orphan"
    )


class TopologyDiff(CoreBaseModel):
    """
    Delta changes applied to a topology version relative to its parent.
    """

    __tablename__ = "topology_diffs"

    topology_version_id = Column(
        Uuid(as_uuid=True), ForeignKey("topology_versions.id"), nullable=False, index=True
    )
    entity_type = Column(String(32), nullable=False)  # line, switch, dtr, bus
    entity_id = Column(Uuid(as_uuid=True), nullable=False)
    action = Column(String(16), nullable=False)  # add, remove, toggle, parameter_change
    diff_payload = Column(JSONBType, default=dict, nullable=False)

    topology_version = relationship("TopologyVersion", back_populates="diffs")
