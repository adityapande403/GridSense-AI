"""Pydantic v2 schemas and data contracts for Milestone 10 Scenario Simulator (TR-SCN-01..04)."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ScenarioMutationType(str, Enum):
    LOAD_GROWTH = "LOAD_GROWTH"
    SOLAR_PV = "SOLAR_PV"
    EV_CHARGING = "EV_CHARGING"
    LINE_OUTAGE = "LINE_OUTAGE"
    DTR_AUGMENTATION = "DTR_AUGMENTATION"
    SWITCH_TOGGLE = "SWITCH_TOGGLE"


class ScenarioMutation(BaseModel):
    mutation_type: ScenarioMutationType = Field(..., description="Type of grid mutation")
    target_code: Optional[str] = Field(None, description="Target asset code (e.g. line, DTR, bus, or switch)")
    scale_factor: Optional[float] = Field(1.0, description="Multiplier for load scaling (e.g. 1.25 for +25% load)")
    solar_kw: Optional[float] = Field(0.0, description="Solar active generation capacity in kW to inject")
    solar_pf: Optional[float] = Field(1.0, description="Power factor of solar inverter")
    ev_chargers_count: Optional[int] = Field(0, description="Number of EV fast charging units")
    charger_kw: Optional[float] = Field(50.0, description="Per-charger active power in kW")
    new_kva: Optional[float] = Field(None, description="New transformer rating in kVA for augmentation")
    switch_state: Optional[str] = Field(None, description="'open' or 'closed'")


class ScenarioRequest(BaseModel):
    feeder_code: str = Field("2011951", description="Target feeder code")
    scenario_name: str = Field("What-If Scenario", description="Human-readable scenario title")
    description: Optional[str] = Field(None, description="Detailed explanation of scenario parameters")
    mutations: List[ScenarioMutation] = Field(default_factory=list, description="Ordered list of mutations to apply")


class ScenarioElementDelta(BaseModel):
    element_type: str = Field(..., description="'line', 'dtr', or 'bus'")
    code: str = Field(..., description="Element unique code")
    name: str = Field(..., description="Element display name")
    base_value: float = Field(..., description="Value under baseline power flow")
    scenario_value: float = Field(..., description="Value under mutated scenario")
    delta_value: float = Field(..., description="scenario_value - base_value")
    unit: str = Field(..., description="e.g. '%', 'kW', 'pu'")
    base_status: str = Field("normal", description="'normal', 'elevated', 'overload', 'violation'")
    scenario_status: str = Field("normal", description="'normal', 'elevated', 'overload', 'violation'")
    coordinates: Optional[Dict[str, float]] = Field(None, description="Spatial coordinates (latitude, longitude)")


class ScenarioKpiComparison(BaseModel):
    base_loss_kw: float
    scenario_loss_kw: float
    delta_loss_kw: float
    delta_loss_pct: float
    base_min_voltage_pu: float
    scenario_min_voltage_pu: float
    delta_min_voltage_pu: float
    base_max_line_loading_pct: float
    scenario_max_line_loading_pct: float
    base_overloaded_dtrs_count: int
    scenario_overloaded_dtrs_count: int
    delta_overloaded_dtrs: int
    base_statutory_violations_count: int
    scenario_statutory_violations_count: int
    ac_converged: bool
    iterations: int
    solver_time_ms: float


class ScenarioSimulationResponse(BaseModel):
    scenario_id: str
    scenario_name: str
    feeder_code: str
    feeder_name: str
    timestamp: str
    base_version_hash: str = Field(..., description="Cryptographic SHA-256 hash of authoritative base twin (TR-SCN-02)")
    post_run_version_hash: str = Field(..., description="Post-simulation SHA-256 hash verifying immutability")
    immutability_verified: bool = Field(True, description="Strictly true if database remained untouched")
    reproducibility_token: str = Field(..., description="Deterministic execution token for byte-identical rerun (TR-SCN-04)")
    kpis: ScenarioKpiComparison
    impacted_elements: List[ScenarioElementDelta]
    applied_mutations: List[ScenarioMutation]
    provenance: str = "simulated"


class ScenarioPreset(BaseModel):
    preset_id: str
    title: str
    description: str
    category: str
    mutations: List[ScenarioMutation]


class MultiScenarioComparisonRequest(BaseModel):
    feeder_code: str = Field("2011951", description="Target feeder code")
    scenarios: List[ScenarioRequest] = Field(..., max_length=3, description="Up to 3 scenarios for side-by-side comparison")


class MultiScenarioComparisonResponse(BaseModel):
    feeder_code: str
    feeder_name: str
    baseline: ScenarioKpiComparison
    scenario_results: List[ScenarioSimulationResponse]
    provenance: str = "simulated"
