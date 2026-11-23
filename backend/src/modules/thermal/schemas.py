from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DTRThermalInterval(BaseModel):
    """Hourly thermal state snapshot calculated via IEC 60076-7 differential equations."""
    hour: int = Field(..., description="Hour of the day (0 to 23)")
    time_label: str
    ambient_temp_c: float = Field(..., description="Ambient temperature (°C)")
    load_ratio_k: float = Field(..., description="Load ratio K = S / S_rated")
    
    # IEC 60076-7 Temperatures
    top_oil_rise_c: float = Field(..., description="Top-oil temperature rise above ambient (°C)")
    top_oil_temp_c: float = Field(..., description="Absolute top-oil temperature (°C)")
    hot_spot_rise_c: float = Field(..., description="Hot-spot rise above top-oil (°C)")
    hot_spot_temp_c: float = Field(..., description="Winding hot-spot temperature theta_h (°C)")
    
    # Aging & Loss of Life (TR-THM-02)
    relative_aging_rate: float = Field(..., description="Relative aging rate V = 2^((theta_h - 98) / 6)")
    loss_of_life_hours: float = Field(..., description="Equivalent normal insulation life consumed in this hour (hrs)")
    
    is_critical_hot_spot: bool = Field(False, description="True if theta_h >= 120°C")


class DTRThermalReport(BaseModel):
    """Complete 24-hour IEC 60076-7 thermal stress and Asset Health Index report."""
    dtr_id: str
    dtr_code: str
    rated_kva: float
    
    # 24-Hour Peak Temperatures
    peak_ambient_temp_c: float
    peak_top_oil_temp_c: float
    peak_hot_spot_temp_c: float
    
    # Operational Stresses & Life Consumption
    hours_overloaded: int = Field(..., description="Total hours operating above 100% rated kVA")
    hours_critical_hot_spot: int = Field(..., description="Total hours with hot-spot >= 120°C")
    cumulative_aging_hours_24h: float = Field(..., description="Total equivalent insulation life consumed (normal = 24.0h)")
    daily_aging_acceleration_factor: float = Field(..., description="Cumulative life consumed / 24.0")
    
    # Asset Health & Failure Index (TR-THM-03)
    asset_health_index: float = Field(..., description="Asset Health Index (0 to 100, where 100 = pristine, <50 = critical)")
    health_category: str = Field(..., description="'EXCELLENT', 'GOOD', 'DEGRADED', or 'CRITICAL'")
    
    time_series: List[DTRThermalInterval]
    provenance: str = "estimated"
    disclaimer: str = (
        "Thermal dynamics calculated via IEC 60076-7 differential loading equations; "
        "not directly measured via physical oil/winding sensors (TR-THM-04)."
    )
