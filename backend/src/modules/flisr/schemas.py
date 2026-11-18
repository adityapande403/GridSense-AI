from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.src.modules.switching.schemas import SwitchOperationStep


class FaultSimulationRequest(BaseModel):
    """Parameters to trigger a simulated fault event for FLISR analysis."""
    feeder_code: str = Field("2011951", description="Feeder code")
    faulted_line_code: str = Field(..., description="Line code where fault / trip occurred")
    fault_type: str = Field("3ph_short", description="Fault type: '3ph_short', '1ph_ground', 'conductor_snap'")
    ambient_temp_c: float = Field(35.0, description="Ambient temperature in degrees C")
    load_multiplier: float = Field(1.0, description="Load multiplier at time of fault")


class FaultIsolationStep(BaseModel):
    """Specific isolation action required to disconnect faulted zone."""
    switch_code: str
    action: str = "OPEN"
    switch_type: str
    is_motorized: bool
    location: str
    zone_boundary: str


class RestorationCandidatePlan(BaseModel):
    """Candidate restoration plan to restore healthy unsupplied downstream customers."""
    restoration_id: str
    rank: int
    tie_switch_code: str
    tie_switch_type: str
    is_motorized: bool
    donor_feeder_name: str
    donor_feeder_code: str
    
    # Customer & Load Restoration
    restored_load_kw: float
    restored_customers_count: int
    restored_dtrs_count: int
    unrestored_load_kw: float
    unrestored_customers_count: int
    
    # Post-Restoration Electrical Feasibility (AC Newton-Raphson)
    ac_feasible: bool
    min_voltage_pu: float
    min_voltage_bus_code: str
    donor_feeder_max_loading_pct: float
    status: str  # A5 Taxonomy
    status_reason: str
    
    # Reliability & Impact
    cmi_saved: float = Field(..., description="Customer-Minutes Interrupted saved")
    estimated_outage_time_min_manual: float = Field(..., description="Estimated manual restoration time in minutes")
    estimated_outage_time_min_flisr: float = Field(..., description="Automated FLISR restoration time in minutes")
    saidi_reduction_hours: float
    switching_sequence: List[SwitchOperationStep]


class FLISRSimulationReport(BaseModel):
    """Complete Fault Location, Isolation and Service Restoration (FLISR) report."""
    event_id: str
    feeder_code: str
    feeder_name: str
    timestamp: str
    faulted_line_code: str
    fault_type: str
    
    # 1. Fault Location & Isolation
    isolated_zone_id: str
    faulted_line_length_km: float
    faulted_line_conductor: str
    lines_in_isolated_zone: List[str]
    isolation_switches_to_open: List[SwitchOperationStep]
    
    # 2. Impact Baseline (Before Alternate Restoration)
    upstream_energized_buses_count: int
    downstream_interrupted_buses_count: int
    total_customers_affected: int
    total_load_interrupted_kw: float
    interrupted_dtrs_count: int
    
    # 3. Restoration Playbook
    available_restoration_plans: List[RestorationCandidatePlan]
    recommended_restoration_plan: Optional[RestorationCandidatePlan] = None
    
    # 4. Provenance & Engineering Audit
    provenance: str = "calculated"
    notes: str = (
        "Advisory-only FLISR recommendation. In accordance with safety protocol A6, "
        "operator confirmation and boundary clearance verification are required before actuation."
    )
