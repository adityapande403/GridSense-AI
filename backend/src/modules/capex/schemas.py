from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# 1. Conductor Reconductoring Schemas (TR-CPX-03, TR-CPX-04)
# -------------------------------------------------------------------------

class ReconductoringCandidate(BaseModel):
    """Line segment candidate for reconductoring upgrade."""
    line_id: str
    line_code: str
    length_km: float
    voltage_kv: float
    current_conductor: str
    current_r_ohm_per_km: float
    current_loading_pct: float
    recommended_conductor: str
    recommended_r_ohm_per_km: float
    resistance_reduction_pct: float
    
    # Financial & Loss Metrics
    base_annual_loss_kwh: float
    post_annual_loss_kwh: float
    annual_energy_saved_kwh: float
    annual_cost_savings_inr: float = Field(..., description="Annual monetary savings at specified ACoS")
    capital_cost_inr: float = Field(..., description="Estimated replacement cost based on DISCOM standard rates")
    simple_payback_years: float = Field(..., description="Payback in years (CAPEX / annual savings)")
    npv_15yr_inr: float = Field(..., description="15-year Net Present Value at discount rate")
    benefit_cost_ratio: float = Field(..., description="Present value of savings / CAPEX")
    rank: int = Field(..., description="Priority rank (1 = highest BCR)")
    provenance: str = "calculated"


class ReconductoringReport(BaseModel):
    """Complete portfolio of ranked line reconductoring opportunities."""
    feeder_code: str
    feeder_name: str
    timestamp: str
    cost_per_kwh_inr: float
    discount_rate_pct: float
    total_reconductoring_capex_inr: float
    total_annual_savings_inr: float
    portfolio_payback_years: float
    portfolio_npv_15yr_inr: float
    candidates: List[ReconductoringCandidate]
    top_recommended: List[ReconductoringCandidate]


# -------------------------------------------------------------------------
# 2. DTR 3-Way Alternative Evaluation Schemas (TR-CPX-02)
# -------------------------------------------------------------------------

class DTROptionEvaluation(BaseModel):
    """Specific investment option for resolving DTR overload/stress."""
    option_type: str = Field(..., description="'AUGMENTATION', 'NEW_SITING', or 'LOAD_SWITCHING'")
    title: str
    description: str
    capital_cost_inr: float
    post_loading_pct: float
    tail_end_voltage_pu: float
    annual_loss_savings_inr: float
    payback_years: float
    npv_15yr_inr: float
    benefit_cost_ratio: float
    execution_time_weeks: int
    is_recommended: bool
    status: str = "VALIDATED_FEASIBLE"
    recommendation_reason: str


class DTRInvestmentCandidate(BaseModel):
    """Comprehensive 3-way evaluation for a single overloaded or high-risk DTR."""
    dtr_id: str
    dtr_code: str
    dtr_name: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None
    rated_kva: float
    peak_load_kva: float
    current_loading_pct: float
    connected_consumers: int
    health_index: float
    tail_end_voltage_pu: float
    urgency_level: str = Field(..., description="'HIGH', 'MEDIUM', 'MONITOR'")
    
    # 3-Way Comparison
    options: List[DTROptionEvaluation]
    recommended_option_type: str
    primary_justification: str


class DTRInvestmentReport(BaseModel):
    """Feeder-wide DTR capital decision intelligence."""
    feeder_code: str
    feeder_name: str
    timestamp: str
    total_dtrs_analyzed: int
    overloaded_dtrs_count: int
    dtr_evaluations: List[DTRInvestmentCandidate]


# -------------------------------------------------------------------------
# 3. Feeder Bifurcation Schemas (TR-CPX-01)
# -------------------------------------------------------------------------

class BifurcationSplitCandidate(BaseModel):
    """Detailed engineering plan for splitting an overloaded feeder."""
    split_id: str
    rank: int
    split_node_code: str
    split_node_location: str
    coordinates: Optional[Dict[str, float]] = None
    express_line_length_km: float
    load_ratio_split: str = Field(..., description="e.g. '52% / 48%'")
    
    # Original Feeder (A) Post-Split
    feeder_a_peak_kw: float
    feeder_a_peak_loading_pct: float
    feeder_a_min_voltage_pu: float
    feeder_a_loss_reduction_kw: float
    
    # New Express Feeder (B) Post-Split
    feeder_b_peak_kw: float
    feeder_b_peak_loading_pct: float
    feeder_b_min_voltage_pu: float
    
    # Project Financials
    total_bifurcation_capex_inr: float = Field(..., description="Substation bay + express line + switchgear")
    annual_loss_savings_inr: float
    simple_payback_years: float
    npv_15yr_inr: float
    benefit_cost_ratio: float
    status: str = "VALIDATED_FEASIBLE"
    provenance: str = "calculated"


class FeederBifurcationReport(BaseModel):
    """Feeder bifurcation necessity screening and optimal split ranking."""
    feeder_code: str
    feeder_name: str
    timestamp: str
    is_bifurcation_triggered: bool
    trigger_reasons: List[str]
    current_length_km: float
    current_peak_loading_pct: float
    current_min_voltage_pu: float
    load_moment_centroid_coordinates: Dict[str, float]
    candidates: List[BifurcationSplitCandidate]
    recommended_split: Optional[BifurcationSplitCandidate] = None


# -------------------------------------------------------------------------
# 4. Tornado Sensitivity Schemas (TR-CPX-06)
# -------------------------------------------------------------------------

class SensitivityParameterResult(BaseModel):
    """Low/Base/High outcomes for a single sensitivity parameter."""
    parameter_name: str
    display_name: str
    unit: str
    base_value: float
    low_value: float
    high_value: float
    
    # Outcome: Portfolio NPV (INR)
    npv_base: float
    npv_low_case: float
    npv_high_case: float
    npv_swing_inr: float
    
    # Outcome: Portfolio Payback (Years)
    payback_base: float
    payback_low_case: float
    payback_high_case: float


class TornadoSensitivityReport(BaseModel):
    """Tornado sensitivity analysis for capital investment portfolio."""
    portfolio_name: str
    base_capex_inr: float
    base_annual_savings_inr: float
    base_npv_15yr_inr: float
    base_payback_years: float
    parameters: List[SensitivityParameterResult]
    most_sensitive_parameter: str
    provenance: str = "calculated"
