from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VoltageComplianceStatus(str, Enum):
    NORMAL = "normal"
    WARNING = "warning"
    VIOLATION = "violation"


class ThermalLoadingStatus(str, Enum):
    NORMAL = "normal"
    ELEVATED = "elevated"
    OVERLOAD = "overload"
    EMERGENCY = "emergency"


class PowerFlowAlgorithm(str, Enum):
    NEWTON_RAPHSON = "nr"
    FAST_DECOUPLED = "fdbx"
    BACKWARD_FORWARD_SWEEP = "bfsw"


class BusPowerFlowResult(BaseModel):
    bus_index: int
    bus_code: str
    bus_name: Optional[str] = None
    voltage_level_kv: float
    vm_pu: float = Field(..., description="Voltage magnitude in per-unit")
    va_degree: float = Field(..., description="Voltage angle in degrees")
    p_mw: float = Field(0.0, description="Net active power injection in MW")
    q_mvar: float = Field(0.0, description="Net reactive power injection in MVAr")
    voltage_deviation_pct: float = Field(..., description="Deviation from 1.0 p.u. in percent")
    status: VoltageComplianceStatus
    notes: Optional[str] = None


class LinePowerFlowResult(BaseModel):
    line_index: int
    line_code: str
    from_bus_code: str
    to_bus_code: str
    length_km: float
    conductor_type: str
    loading_percent: float = Field(..., description="Line percentage loading against ampacity")
    current_ka: float = Field(..., description="Branch current magnitude in kA")
    max_i_ka: float = Field(..., description="Thermal ampacity limit (ambient-corrected) in kA")
    p_from_mw: float = Field(0.0, description="Active power entering from-bus in MW")
    q_from_mvar: float = Field(0.0, description="Reactive power entering from-bus in MVAr")
    p_to_mw: float = Field(0.0, description="Active power exiting to-bus in MW")
    q_to_mvar: float = Field(0.0, description="Reactive power exiting to-bus in MVAr")
    active_loss_kw: float = Field(..., description="I^2 * R technical loss in kW")
    reactive_loss_kvar: float = Field(..., description="I^2 * X technical loss in kVAr")
    status: ThermalLoadingStatus


class TransformerPowerFlowResult(BaseModel):
    trafo_index: int
    trafo_code: str
    hv_bus_code: str
    lv_bus_code: str
    rated_mva: float
    loading_percent: float
    p_hv_mw: float
    q_hv_mvar: float
    p_lv_mw: float
    q_lv_mvar: float
    active_loss_kw: float
    reactive_loss_kvar: float
    status: ThermalLoadingStatus


class PowerFlowResult(BaseModel):
    feeder_code: str
    feeder_name: str
    converged: bool
    algorithm: str = "nr"
    iterations: int = 0
    total_active_load_mw: float = 0.0
    total_active_load_kw: float = 0.0
    total_reactive_load_mvar: float = 0.0
    total_reactive_load_kvar: float = 0.0
    total_active_loss_mw: float = 0.0
    total_active_loss_kw: float = 0.0
    total_reactive_loss_mvar: float = 0.0
    total_reactive_loss_kvar: float = 0.0
    loss_percentage: float = 0.0
    slack_active_power_mw: float = 0.0
    slack_reactive_power_mvar: float = 0.0
    slack_power_balance_error_mw: float = 0.0
    min_voltage_pu: float = 1.0
    min_voltage_bus_code: str = ""
    max_voltage_pu: float = 1.0
    max_voltage_bus_code: str = ""
    voltage_violations_count: int = 0
    voltage_warnings_count: int = 0
    line_overloads_count: int = 0
    trafo_overloads_count: int = 0
    buses: List[BusPowerFlowResult] = []
    lines: List[LinePowerFlowResult] = []
    transformers: List[TransformerPowerFlowResult] = []
    execution_time_ms: float = 0.0
    provenance: str = "physics_simulated"
    diagnostics: Optional[Dict[str, Any]] = None


class ContingencyLineResult(BaseModel):
    contingency_id: str
    line_code: str
    from_bus_code: str
    to_bus_code: str
    converged: bool
    unserved_load_kw: float = 0.0
    unserved_load_mw: float = 0.0
    isolated_buses_count: int = 0
    isolated_buses: List[str] = []
    post_contingency_max_loading_pct: float = 0.0
    worst_line_code: Optional[str] = None
    post_contingency_min_voltage_pu: float = 1.0
    worst_bus_code: Optional[str] = None
    overloaded_lines_count: int = 0
    voltage_violations_count: int = 0
    severity_score: float = Field(..., description="Composite N-1 severity index")
    rank: int = 1


class ContingencyScreeningReport(BaseModel):
    feeder_code: str
    feeder_name: str
    base_case_loss_kw: float
    base_case_min_voltage_pu: float
    total_contingencies_evaluated: int
    critical_contingencies_count: int
    results: List[ContingencyLineResult]
    execution_time_ms: float
    provenance: str = "physics_simulated"


class ShortCircuitBusResult(BaseModel):
    bus_code: str
    bus_name: Optional[str] = None
    voltage_level_kv: float
    ikss_ka: float = Field(..., description="Initial symmetrical short-circuit current (kA)")
    ip_ka: float = Field(..., description="Peak short-circuit current (kA)")
    skss_mva: float = Field(..., description="Short-circuit apparent power (MVA)")
    max_switchgear_breaking_capacity_ka: Optional[float] = None
    is_overdutied: bool = False
    connected_switches: List[str] = []


class ShortCircuitScreeningReport(BaseModel):
    feeder_code: str
    standard: str = "IEC 60909"
    fault_type: str = "3ph"
    results: List[ShortCircuitBusResult]
    overdutied_buses_count: int = 0
    max_fault_current_ka: float = 0.0
    max_fault_bus_code: str = ""
    execution_time_ms: float = 0.0
    provenance: str = "physics_simulated"


class PowerFlowRunRequest(BaseModel):
    feeder_code: str = "2011951"
    algorithm: PowerFlowAlgorithm = PowerFlowAlgorithm.NEWTON_RAPHSON
    load_multiplier: float = Field(1.0, ge=0.0, le=1000.0, description="Scale factor for network loads")
    ambient_temp_c: float = Field(35.0, ge=-10.0, le=60.0, description="Ambient temperature for conductor ampacity derating")
    enforce_q_limits: bool = True
