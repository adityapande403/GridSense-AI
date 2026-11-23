import math
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from backend.src.models.network import DistributionTransformer
from backend.src.modules.thermal.schemas import (
    DTRThermalInterval,
    DTRThermalReport,
)
from backend.src.modules.estimation.allocator import allocate_dtr_load_profile


# Standard IEC 60076-7 Thermal Parameters for Distribution Transformers
TAU_OIL_MIN = 150.0       # Oil time constant (minutes) = 2.5 hours
TAU_WINDING_MIN = 7.0     # Winding time constant (minutes)
DELTA_THETA_OR = 55.0     # Rated top-oil temperature rise (K or °C)
H_GR_PRODUCT = 23.0       # Rated hot-spot to top-oil gradient H * g_r (K or °C)
LOSS_RATIO_R = 4.5        # Ratio of load loss to no-load loss at rated load
OIL_EXPONENT_X = 0.8      # Oil exponent for ONAN cooling
WINDING_EXPONENT_Y = 1.6  # Winding exponent


def get_telangana_ambient_temp(hour: int, base_ambient_c: float = 35.0) -> float:
    """
    Simulates diurnal ambient temperature curve typical of Telangana distribution networks.
    Trough at 05:00 (approx base - 5°C), peak at 14:00 (approx base + 6°C).
    """
    # Peak at 14:00, trough at 02:00-05:00
    angle = (hour - 9) * (2.0 * math.pi / 24.0)
    swing = 5.5
    return round(base_ambient_c + swing * math.sin(angle), 1)


def simulate_iec60076_thermal_dynamics(
    db_session: Session,
    dtr_code: str,
    feeder_code: str = "2011951",
    base_ambient_temp_c: float = 35.0,
    peak_multiplier: float = 1.0,
) -> DTRThermalReport:
    """
    Performs continuous numerical integration of the differential equations of IEC 60076-7
    over 24 hours to track top-oil rise, hot-spot temperature, aging rate, and Health Index (TR-THM-01..03).
    """
    dtr = db_session.query(DistributionTransformer).filter(DistributionTransformer.code == dtr_code).first()
    if not dtr:
        raise ValueError(f"DTR with code '{dtr_code}' not found.")

    rated_kva = dtr.rated_kva or 100.0

    # 1. Obtain 24-hour load allocation profile from Estimation Module (TR-EST)
    load_profile = allocate_dtr_load_profile(
        db_session=db_session,
        dtr_code=dtr_code,
        feeder_code=feeder_code,
        peak_multiplier=peak_multiplier,
    )

    # Convert hours into load ratios K(t)
    hourly_k = [interval.loading_pct / 100.0 for interval in load_profile.time_series]

    # 2. Continuous Euler integration with 5-minute sub-steps to ensure high numerical stability
    sub_step_min = 5.0
    dt_hours = sub_step_min / 60.0
    total_sub_steps = int(24 * 60 / sub_step_min)  # 288 steps

    # Initial steady-state estimate at hour 0
    k_0 = hourly_k[0]
    initial_top_oil_rise = DELTA_THETA_OR * (((1.0 + LOSS_RATIO_R * (k_0**2)) / (1.0 + LOSS_RATIO_R)) ** OIL_EXPONENT_X)
    initial_hot_spot_rise = H_GR_PRODUCT * (k_0 ** WINDING_EXPONENT_Y)

    delta_theta_o = initial_top_oil_rise
    delta_theta_h = initial_hot_spot_rise

    # Storage for hourly averages
    hourly_intervals: List[DTRThermalInterval] = []
    sub_step_count = int(60 / sub_step_min)

    peak_ambient = -100.0
    peak_top_oil = -100.0
    peak_hot_spot = -100.0

    total_life_consumed_hours = 0.0
    overload_hours = 0
    critical_hot_spot_hours = 0

    step_idx = 0
    for hour in range(24):
        ambient_t = get_telangana_ambient_temp(hour, base_ambient_c=base_ambient_temp_c)
        if ambient_t > peak_ambient:
            peak_ambient = ambient_t

        k_val = hourly_k[hour]
        if k_val > 1.0:
            overload_hours += 1

        accum_top_oil_rise = 0.0
        accum_hot_spot_rise = 0.0
        accum_theta_h = 0.0
        accum_v = 0.0

        for _ in range(sub_step_count):
            # Target ultimate rises at current K
            u_top_oil = DELTA_THETA_OR * (((1.0 + LOSS_RATIO_R * (k_val**2)) / (1.0 + LOSS_RATIO_R)) ** OIL_EXPONENT_X)
            u_hot_spot = H_GR_PRODUCT * (k_val ** WINDING_EXPONENT_Y)

            # d(rise)/dt = (u_rise - rise) / tau
            d_oil = (u_top_oil - delta_theta_o) / (TAU_OIL_MIN / sub_step_min)
            d_hs = (u_hot_spot - delta_theta_h) / (TAU_WINDING_MIN / sub_step_min)

            delta_theta_o += d_oil
            delta_theta_h += d_hs

            theta_h = ambient_t + delta_theta_o + delta_theta_h
            # Relative aging rate: V = 2^((theta_h - 98) / 6)
            v_rate = 2.0 ** ((theta_h - 98.0) / 6.0)

            accum_top_oil_rise += delta_theta_o
            accum_hot_spot_rise += delta_theta_h
            accum_theta_h += theta_h
            accum_v += v_rate
            step_idx += 1

        avg_top_oil_rise = accum_top_oil_rise / sub_step_count
        avg_hot_spot_rise = accum_hot_spot_rise / sub_step_count
        avg_theta_o = ambient_t + avg_top_oil_rise
        avg_theta_h = accum_theta_h / sub_step_count
        avg_v = accum_v / sub_step_count

        hour_life_loss = avg_v * 1.0  # 1 hour * relative rate
        total_life_consumed_hours += hour_life_loss

        if avg_theta_o > peak_top_oil:
            peak_top_oil = avg_theta_o
        if avg_theta_h > peak_hot_spot:
            peak_hot_spot = avg_theta_h
        if avg_theta_h >= 120.0:
            critical_hot_spot_hours += 1

        hourly_intervals.append(
            DTRThermalInterval(
                hour=hour,
                time_label=f"{hour:02d}:00",
                ambient_temp_c=ambient_t,
                load_ratio_k=round(k_val, 3),
                top_oil_rise_c=round(avg_top_oil_rise, 1),
                top_oil_temp_c=round(avg_theta_o, 1),
                hot_spot_rise_c=round(avg_hot_spot_rise, 1),
                hot_spot_temp_c=round(avg_theta_h, 1),
                relative_aging_rate=round(avg_v, 4),
                loss_of_life_hours=round(hour_life_loss, 4),
                is_critical_hot_spot=(avg_theta_h >= 120.0),
            )
        )

    # 3. Calculate Asset Health Index (TR-THM-03)
    # Baseline pristine score = 100
    penalties = 0.0
    penalties += 3.5 * overload_hours
    penalties += 6.0 * critical_hot_spot_hours
    penalties += 0.8 * max(0.0, total_life_consumed_hours - 24.0)
    if peak_hot_spot > 115.0:
        penalties += 0.6 * (peak_hot_spot - 115.0)

    health_index = max(10.0, min(100.0, 100.0 - penalties))

    if health_index >= 85.0:
        category = "EXCELLENT"
    elif health_index >= 70.0:
        category = "GOOD"
    elif health_index >= 50.0:
        category = "DEGRADED"
    else:
        category = "CRITICAL"

    daily_acceleration = total_life_consumed_hours / 24.0

    return DTRThermalReport(
        dtr_id=str(dtr.id),
        dtr_code=dtr.code,
        rated_kva=rated_kva,
        peak_ambient_temp_c=round(peak_ambient, 1),
        peak_top_oil_temp_c=round(peak_top_oil, 1),
        peak_hot_spot_temp_c=round(peak_hot_spot, 1),
        hours_overloaded=overload_hours,
        hours_critical_hot_spot=critical_hot_spot_hours,
        cumulative_aging_hours_24h=round(total_life_consumed_hours, 1),
        daily_aging_acceleration_factor=round(daily_acceleration, 2),
        asset_health_index=round(health_index, 1),
        health_category=category,
        time_series=hourly_intervals,
        provenance="estimated",
    )
