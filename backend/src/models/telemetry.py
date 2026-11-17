from backend.src.models.base import CoreBaseModel, ProvenanceMixin
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Uuid
from sqlalchemy.orm import relationship


class LoadSnapshot(CoreBaseModel, ProvenanceMixin):
    """
    Feeder-level or substation-level load snapshot at a specific point in time.
    """
    __tablename__ = "load_snapshots"

    feeder_id = Column(Uuid(as_uuid=True), ForeignKey("feeders.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    total_p_mw = Column(Float, nullable=False)
    total_q_mvar = Column(Float, nullable=False)
    source_bus_voltage_pu = Column(Float, default=1.0, nullable=False)

    measurements = relationship("LoadMeasurement", back_populates="snapshot", cascade="all, delete-orphan")


class LoadMeasurement(CoreBaseModel, ProvenanceMixin):
    """
    Individual DTR load allocation or measurement corresponding to a snapshot.
    """
    __tablename__ = "load_measurements"

    snapshot_id = Column(Uuid(as_uuid=True), ForeignKey("load_snapshots.id"), nullable=False, index=True)
    dtr_id = Column(Uuid(as_uuid=True), ForeignKey("distribution_transformers.id"), nullable=False, index=True)
    p_kw = Column(Float, nullable=False)
    q_kvar = Column(Float, nullable=False)
    current_a = Column(Float, nullable=True)
    voltage_pu = Column(Float, nullable=True)
    is_metered = Column(Boolean, default=False, nullable=False)
    confidence_lower_kw = Column(Float, nullable=True)
    confidence_upper_kw = Column(Float, nullable=True)

    snapshot = relationship("LoadSnapshot", back_populates="measurements")


class WeatherObservation(CoreBaseModel, ProvenanceMixin):
    """
    Ambient temperature and weather observation for IEC 60076-7 thermal modeling.
    """
    __tablename__ = "weather_observations"

    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    ambient_temperature_c = Column(Float, nullable=False)
    humidity_pct = Column(Float, nullable=True)
    solar_radiation_w_m2 = Column(Float, nullable=True)
