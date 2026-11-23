from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DTRLoadInterval(BaseModel):
    """Estimated 15-minute or 1-hour load snapshot for a single DTR."""
    hour: int = Field(..., description="Hour of the day (0 to 23)")
    time_label: str = Field(..., description="e.g. '00:00', '01:00', ...")
    
    # Active Power Estimates with Uncertainty Intervals (TR-EST-04)
    p50_kw: float = Field(..., description="Median estimated active power (kW)")
    p10_kw: float = Field(..., description="10th percentile lower bound (kW)")
    p90_kw: float = Field(..., description="90th percentile upper bound (kW)")
    q50_kvar: float = Field(..., description="Estimated reactive power (kVAr)")
    
    # Transformer Loading
    loading_pct: float = Field(..., description="Estimated transformer loading percentage (%)")
    is_overloaded: bool = Field(False, description="True if loading > 100%")
    
    # Category Disaggregation Breakdown (TR-EST-01, TR-EST-02)
    domestic_kw: float = 0.0
    commercial_kw: float = 0.0
    industrial_kw: float = 0.0
    agricultural_kw: float = 0.0
    technical_loss_kw: float = 0.0
    
    is_metered: bool = Field(False, description="True if reading is directly measured by DT AMI meter")
    provenance: str = Field("estimated", description="Data provenance: 'estimated' or 'measured'")


class DTRLoadProfileReport(BaseModel):
    """Complete 24-hour diurnal load allocation report for a transformer."""
    dtr_id: str
    dtr_code: str
    rated_kva: float
    connected_consumers_count: int
    total_sanctioned_load_kw: float
    
    # Diurnal Metrics
    peak_demand_kw: float
    peak_hour: int
    min_demand_kw: float
    average_demand_kw: float
    load_factor: float = Field(..., description="Average demand / Peak demand")
    
    # Category Mix Percentages
    category_mix_pct: Dict[str, float] = Field(..., description="e.g. {'domestic': 55.0, 'agricultural': 25.0, ...}")
    
    time_series: List[DTRLoadInterval]
    provenance: str = "estimated"
    disclaimer: str = (
        "DTR demand estimated from feeder-head SCADA disaggregation, category load curves, "
        "and connected sanctioned loads. Labeled 'estimated' in accordance with Principle A4-7."
    )


class MeteringPenetrationMetric(BaseModel):
    """Error metrics for a specific smart meter penetration level (TR-EST-05)."""
    metering_coverage_pct: float = Field(..., description="0%, 5%, 10%, 25%, 50%")
    mae_kw: float = Field(..., description="Mean Absolute Error in kW")
    rmse_kw: float = Field(..., description="Root Mean Squared Error in kW")
    mape_pct: float = Field(..., description="Mean Absolute Percentage Error (%)")
    state_estimation_confidence_pct: float


class MeteringPenetrationSensitivityReport(BaseModel):
    """Sensitivity benchmark of DTR load allocation accuracy vs metering coverage."""
    feeder_code: str
    feeder_name: str
    total_dtrs_count: int
    benchmark_metrics: List[MeteringPenetrationMetric]
    key_finding: str
    provenance: str = "calculated"
