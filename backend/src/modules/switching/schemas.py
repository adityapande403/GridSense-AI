from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SwitchOperationStep(BaseModel):
    """Single step in an ordered break-before-make switching sequence."""
    sequence_order: int = Field(..., description="Execution sequence number (1, 2, ...)")
    action: str = Field(..., description="'OPEN' or 'CLOSE'")
    switch_code: str = Field(..., description="Unique switch asset identifier")
    switch_type: str = Field(..., description="RMU, Air Break (AB), Sectionalizer, or Recloser")
    is_motorized: bool = Field(..., description="Whether switch is motorized/SCADA-ready or manual field crew")
    location_description: Optional[str] = Field(None, description="Physical location / pole ID")
    from_bus_code: str = Field(..., description="From bus/pole identifier")
    to_bus_code: str = Field(..., description="To bus/pole identifier")
    safety_rule: str = Field(..., description="Break-before-make rule or interlocking requirement")


class SwitchingPlanCandidate(BaseModel):
    """A feasible candidate network reconfiguration plan evaluated by AC Newton-Raphson."""
    plan_id: str = Field(..., description="Unique candidate identifier (e.g. PLAN-01)")
    rank: int = Field(..., description="Candidate rank (1 = optimal)")
    status: str = Field(..., description="A5 Taxonomy status: VALIDATED_FEASIBLE, FEASIBLE_WITH_WARNINGS, etc.")
    status_reason: str = Field(..., description="Detailed explanation of status classification")
    
    # Loss & Energy Metrics
    base_loss_kw: float = Field(..., description="Base configuration technical loss in kW")
    optimized_loss_kw: float = Field(..., description="Post-switching technical loss in kW")
    loss_reduction_kw: float = Field(..., description="Loss reduction in kW")
    loss_reduction_pct: float = Field(..., description="Percentage loss reduction")
    annual_cost_savings_inr: float = Field(..., description="Estimated annual monetary savings at ₹5.50/kWh ACoS")
    
    # Voltage & Thermal Metrics
    min_voltage_pu: float = Field(..., description="Minimum system bus voltage in per-unit")
    min_voltage_bus_code: str = Field(..., description="Bus code exhibiting minimum voltage")
    max_voltage_pu: float = Field(..., description="Maximum system bus voltage in per-unit")
    max_line_loading_pct: float = Field(..., description="Highest line loading percentage")
    max_loaded_line_code: str = Field(..., description="Line code with highest loading")
    
    # Structural & Operational Metrics
    radiality_preserved: bool = Field(..., description="True if network remains strictly radial with zero loops")
    isolated_buses_count: int = Field(0, description="Count of de-energized/unsupplied buses (must be 0 for full service)")
    switches_to_open: List[str] = Field(..., description="List of switch codes to open")
    switches_to_close: List[str] = Field(..., description="List of switch codes to close")
    total_switching_operations: int = Field(..., description="Total open + close operations required")
    switching_sequence: List[SwitchOperationStep] = Field(..., description="Ordered break-before-make execution sequence")
    
    # Computational Provenance
    solver_execution_time_ms: float = Field(..., description="Execution time of MILP + AC validation in ms")
    ac_converged: bool = Field(..., description="True if AC Newton-Raphson converged")
    provenance: str = Field("calculated", description="Data provenance: calculated / synthetic")


class SwitchingOptimizationRequest(BaseModel):
    """Parameters for running network sectionalizing and reconfiguration optimization."""
    feeder_code: str = Field("2011951", description="Target feeder code")
    ambient_temp_c: float = Field(35.0, description="Ambient temperature in degrees C for IEEE 738 thermal rating")
    load_multiplier: float = Field(1.0, description="Feeder load scaling multiplier (0.8 = off-peak, 1.2 = peak)")
    top_k: int = Field(3, description="Number of distinct top candidate plans to generate (default 3)")
    max_switch_operations: int = Field(6, description="Maximum allowable switch operations (open + close limit)")
    weight_loss: float = Field(1.0, description="Objective weight for loss reduction")
    weight_switching: float = Field(0.05, description="Objective weight penalty per switch operation")


class SwitchingOptimizationReport(BaseModel):
    """Complete optimization report returned to the frontend."""
    feeder_code: str
    feeder_name: str
    timestamp: str
    total_switches_available: int
    motorized_switches_count: int
    manual_switches_count: int
    base_configuration: Dict[str, Any]
    candidates: List[SwitchingPlanCandidate]
    recommended_plan: Optional[SwitchingPlanCandidate] = None


class SwitchingApprovalRequest(BaseModel):
    """Operator sign-off payload for engineering approval of a switching recommendation."""
    plan_id: str = Field(..., description="Identifier of the candidate plan approved")
    feeder_code: str = Field(..., description="Feeder code")
    operator_id: str = Field(..., description="Unique operator or engineer username/ID")
    operator_role: str = Field(..., description="Role of the approving engineer (e.g. Senior Distribution Engineer)")
    engineering_justification: str = Field(..., description="Required engineering notes / justification for action")
    field_crew_assigned: Optional[str] = Field(None, description="Field crew unit assigned for manual switches")


class SwitchingApprovalResponse(BaseModel):
    """Result of operator approval registration."""
    approval_id: str
    plan_id: str
    status: str = "APPROVED_STAGED_FOR_DISPATCH"
    timestamp: str
    operator_id: str
    safety_disclaimer: str = (
        "ADVISORY-ONLY PLATFORM: No automated SCADA writes. "
        "Physical switching requires field crew authorization and interlocking verification."
    )
    audit_hash: str
