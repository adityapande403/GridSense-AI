import uuid
from typing import Optional

from backend.src.schemas.base import ProvenanceTag
from pydantic import BaseModel, ConfigDict


class SubstationSchema(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    code: str
    name: str
    nominal_kv: float
    ptr_capacity_mva: float
    provenance: ProvenanceTag

    model_config = ConfigDict(from_attributes=True)


class FeederSchema(BaseModel):
    id: uuid.UUID
    substation_id: uuid.UUID
    code: str
    name: str
    voltage_kv: float
    peak_load_kw: float
    trunk_conductor_type: str
    provenance: ProvenanceTag

    model_config = ConfigDict(from_attributes=True)


class BusSchema(BaseModel):
    id: uuid.UUID
    feeder_id: uuid.UUID
    code: str
    name: Optional[str] = None
    voltage_level_kv: float
    bus_type: str
    provenance: ProvenanceTag

    model_config = ConfigDict(from_attributes=True)


class LineSchema(BaseModel):
    id: uuid.UUID
    feeder_id: uuid.UUID
    from_bus_id: uuid.UUID
    to_bus_id: uuid.UUID
    code: str
    conductor_type: str
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    max_i_ka: float
    is_operational: bool
    provenance: ProvenanceTag

    model_config = ConfigDict(from_attributes=True)


class DTRSchema(BaseModel):
    id: uuid.UUID
    bus_id: uuid.UUID
    code: str
    name: Optional[str] = None
    rated_kva: float
    phase_count: int
    no_load_loss_kw: float
    full_load_loss_kw: float
    percent_z: float
    is_metered: bool
    provenance: ProvenanceTag

    model_config = ConfigDict(from_attributes=True)


class SwitchSchema(BaseModel):
    id: uuid.UUID
    from_bus_id: uuid.UUID
    to_bus_id: uuid.UUID
    code: str
    switch_type: str
    is_normally_open: bool
    current_status: str
    is_motorized: bool
    breaking_capacity_ka: float
    provenance: ProvenanceTag

    model_config = ConfigDict(from_attributes=True)
