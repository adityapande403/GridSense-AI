from backend.src.core.database import GeometryLineStringType, GeometryPointType, JSONBType
from backend.src.models.base import CoreBaseModel, ProvenanceMixin
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import relationship


class Organisation(CoreBaseModel):
    __tablename__ = "organisations"

    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    description = Column(String(256), nullable=True)

    substations = relationship("Substation", back_populates="organisation", cascade="all, delete-orphan")


class Substation(CoreBaseModel, ProvenanceMixin):
    __tablename__ = "substations"

    organisation_id = Column(Uuid(as_uuid=True), ForeignKey("organisations.id"), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    nominal_kv = Column(Float, default=33.0, nullable=False)
    ptr_capacity_mva = Column(Float, default=5.0, nullable=False)
    geom = Column(GeometryPointType(), nullable=True)

    organisation = relationship("Organisation", back_populates="substations")
    feeders = relationship("Feeder", back_populates="substation", cascade="all, delete-orphan")


class Feeder(CoreBaseModel, ProvenanceMixin):
    __tablename__ = "feeders"

    substation_id = Column(Uuid(as_uuid=True), ForeignKey("substations.id"), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    voltage_kv = Column(Float, default=11.0, nullable=False)
    peak_load_kw = Column(Float, default=0.0, nullable=False)
    trunk_conductor_type = Column(String(64), default="ACSR_Rabbit", nullable=False)
    metadata_json = Column(JSONBType, default=dict, nullable=False)

    substation = relationship("Substation", back_populates="feeders")
    buses = relationship("Bus", back_populates="feeder", cascade="all, delete-orphan")
    lines = relationship("Line", back_populates="feeder", cascade="all, delete-orphan")


class Bus(CoreBaseModel, ProvenanceMixin):
    __tablename__ = "buses"

    feeder_id = Column(Uuid(as_uuid=True), ForeignKey("feeders.id"), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=True)
    voltage_level_kv = Column(Float, default=11.0, nullable=False)
    bus_type = Column(String(16), default="pq", nullable=False)  # slack, pq, pv
    geom = Column(GeometryPointType(), nullable=True)

    feeder = relationship("Feeder", back_populates="buses")
    dtrs = relationship("DistributionTransformer", back_populates="bus", cascade="all, delete-orphan")


class Line(CoreBaseModel, ProvenanceMixin):
    __tablename__ = "lines"

    feeder_id = Column(Uuid(as_uuid=True), ForeignKey("feeders.id"), nullable=False, index=True)
    from_bus_id = Column(Uuid(as_uuid=True), ForeignKey("buses.id"), nullable=False, index=True)
    to_bus_id = Column(Uuid(as_uuid=True), ForeignKey("buses.id"), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    conductor_type = Column(String(64), default="ACSR_Weasel", nullable=False)
    length_km = Column(Float, default=0.5, nullable=False)
    r_ohm_per_km = Column(Float, nullable=False)
    x_ohm_per_km = Column(Float, nullable=False)
    max_i_ka = Column(Float, nullable=False)
    is_operational = Column(Boolean, default=True, nullable=False)
    geom = Column(GeometryLineStringType(), nullable=True)

    feeder = relationship("Feeder", back_populates="lines")
    from_bus = relationship("Bus", foreign_keys=[from_bus_id])
    to_bus = relationship("Bus", foreign_keys=[to_bus_id])


class DistributionTransformer(CoreBaseModel, ProvenanceMixin):
    __tablename__ = "distribution_transformers"

    bus_id = Column(Uuid(as_uuid=True), ForeignKey("buses.id"), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=True)
    rated_kva = Column(Float, default=100.0, nullable=False)
    phase_count = Column(Integer, default=3, nullable=False)
    no_load_loss_kw = Column(Float, default=0.25, nullable=False)
    full_load_loss_kw = Column(Float, default=1.35, nullable=False)
    percent_z = Column(Float, default=4.5, nullable=False)
    is_metered = Column(Boolean, default=False, nullable=False)
    geom = Column(GeometryPointType(), nullable=True)

    bus = relationship("Bus", back_populates="dtrs")
    consumers = relationship("Consumer", back_populates="dtr", cascade="all, delete-orphan")


class Switch(CoreBaseModel, ProvenanceMixin):
    __tablename__ = "switches"

    from_bus_id = Column(Uuid(as_uuid=True), ForeignKey("buses.id"), nullable=False, index=True)
    to_bus_id = Column(Uuid(as_uuid=True), ForeignKey("buses.id"), nullable=False, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    switch_type = Column(String(32), default="sectionalizer", nullable=False)  # breaker, sectionalizer, rmu, ab_switch, tie_switch
    is_normally_open = Column(Boolean, default=False, nullable=False)
    current_status = Column(String(16), default="closed", nullable=False)  # closed, open
    is_motorized = Column(Boolean, default=False, nullable=False)  # True = remote operable, False = manual field crew
    breaking_capacity_ka = Column(Float, default=12.5, nullable=False)
    geom = Column(GeometryPointType(), nullable=True)

    from_bus = relationship("Bus", foreign_keys=[from_bus_id])
    to_bus = relationship("Bus", foreign_keys=[to_bus_id])


class Consumer(CoreBaseModel, ProvenanceMixin):
    __tablename__ = "consumers"

    dtr_id = Column(Uuid(as_uuid=True), ForeignKey("distribution_transformers.id"), nullable=False, index=True)
    service_number = Column(String(64), unique=True, nullable=False, index=True)
    consumer_category = Column(String(32), default="domestic", nullable=False)  # domestic, commercial, industrial, agricultural, streetlight
    sanctioned_load_kw = Column(Float, default=2.0, nullable=False)
    phase = Column(String(8), default="3ph", nullable=False)
    geom = Column(GeometryPointType(), nullable=True)

    dtr = relationship("DistributionTransformer", back_populates="consumers")


class Connection(CoreBaseModel, ProvenanceMixin):
    """
    Explicit terminal-to-terminal connectivity table.
    Enforces Principle A4-4: Geometry is stored separately from topology.
    """
    __tablename__ = "connections"

    from_element_type = Column(String(32), nullable=False)  # bus, line, dtr, switch
    from_element_id = Column(Uuid(as_uuid=True), nullable=False, index=True)
    from_terminal = Column(String(16), default="1", nullable=False)

    to_element_type = Column(String(32), nullable=False)
    to_element_id = Column(Uuid(as_uuid=True), nullable=False, index=True)
    to_terminal = Column(String(16), default="2", nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    metadata_json = Column(JSONBType, default=dict, nullable=False)
