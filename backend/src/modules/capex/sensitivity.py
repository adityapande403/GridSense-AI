from typing import List, Optional
from pydantic import BaseModel

from backend.src.modules.capex.schemas import (
    SensitivityParameterResult,
    TornadoSensitivityReport,
)
from backend.src.modules.capex.reconductoring import calculate_npv


def run_tornado_sensitivity_analysis(
    base_capex_inr: float = 2450000.0,
    base_annual_savings_inr: float = 425000.0,
    base_cost_per_kwh: float = 5.50,
    base_discount_rate_pct: float = 10.0,
    base_growth_rate_pct: float = 3.5,
    portfolio_name: str = "Puthiya Kadavu Comprehensive CAPEX Plan",
) -> TornadoSensitivityReport:
    """
    Computes multi-dimensional tornado sensitivity analysis for capital investment portfolio (TR-CPX-06).
    Evaluates parameter swings across ACoS, Capital Escalation, Discount Rate, and Load Growth.
    """
    base_r = base_discount_rate_pct / 100.0
    base_g = base_growth_rate_pct / 100.0

    base_npv = calculate_npv(base_capex_inr, base_annual_savings_inr, discount_rate=base_r, growth_rate=base_g)
    base_payback = base_capex_inr / max(1.0, base_annual_savings_inr)

    results: List[SensitivityParameterResult] = []

    # 1. Technical Loss Tariff (ACoS) Sensitivity (₹3.50 to ₹7.50 / kWh)
    low_acos = 3.50
    high_acos = 7.50
    savings_low_acos = base_annual_savings_inr * (low_acos / base_cost_per_kwh)
    savings_high_acos = base_annual_savings_inr * (high_acos / base_cost_per_kwh)
    npv_low_acos = calculate_npv(base_capex_inr, savings_low_acos, discount_rate=base_r, growth_rate=base_g)
    npv_high_acos = calculate_npv(base_capex_inr, savings_high_acos, discount_rate=base_r, growth_rate=base_g)

    results.append(
        SensitivityParameterResult(
            parameter_name="tariff_acos",
            display_name="Bulk Loss Valuation (ACoS)",
            unit="₹/kWh",
            base_value=base_cost_per_kwh,
            low_value=low_acos,
            high_value=high_acos,
            npv_base=round(base_npv, 2),
            npv_low_case=round(npv_low_acos, 2),
            npv_high_case=round(npv_high_acos, 2),
            npv_swing_inr=round(abs(npv_high_acos - npv_low_acos), 2),
            payback_base=round(base_payback, 2),
            payback_low_case=round(base_capex_inr / max(1.0, savings_low_acos), 2),
            payback_high_case=round(base_capex_inr / max(1.0, savings_high_acos), 2),
        )
    )

    # 2. Capital Cost Escalation (-20% to +20%)
    capex_low = base_capex_inr * 0.80
    capex_high = base_capex_inr * 1.20
    npv_low_cost = calculate_npv(capex_low, base_annual_savings_inr, discount_rate=base_r, growth_rate=base_g)
    npv_high_cost = calculate_npv(capex_high, base_annual_savings_inr, discount_rate=base_r, growth_rate=base_g)

    results.append(
        SensitivityParameterResult(
            parameter_name="capital_escalation",
            display_name="CAPEX Escalation / EPC Variation",
            unit="₹",
            base_value=base_capex_inr,
            low_value=capex_low,
            high_value=capex_high,
            npv_base=round(base_npv, 2),
            npv_low_case=round(npv_high_cost, 2),  # high cost = lower NPV
            npv_high_case=round(npv_low_cost, 2),  # low cost = higher NPV
            npv_swing_inr=round(abs(npv_low_cost - npv_high_cost), 2),
            payback_base=round(base_payback, 2),
            payback_low_case=round(capex_high / max(1.0, base_annual_savings_inr), 2),
            payback_high_case=round(capex_low / max(1.0, base_annual_savings_inr), 2),
        )
    )

    # 3. Discount Rate Sensitivity (8.0% to 12.0%)
    r_low = 0.08
    r_high = 0.12
    npv_low_r = calculate_npv(base_capex_inr, base_annual_savings_inr, discount_rate=r_low, growth_rate=base_g)
    npv_high_r = calculate_npv(base_capex_inr, base_annual_savings_inr, discount_rate=r_high, growth_rate=base_g)

    results.append(
        SensitivityParameterResult(
            parameter_name="discount_rate",
            display_name="Cost of Capital / Discount Rate",
            unit="%",
            base_value=base_discount_rate_pct,
            low_value=8.0,
            high_value=12.0,
            npv_base=round(base_npv, 2),
            npv_low_case=round(npv_high_r, 2),  # high discount = lower NPV
            npv_high_case=round(npv_low_r, 2),  # low discount = higher NPV
            npv_swing_inr=round(abs(npv_low_r - npv_high_r), 2),
            payback_base=round(base_payback, 2),
            payback_low_case=round(base_payback, 2),
            payback_high_case=round(base_payback, 2),
        )
    )

    # 4. Annual Load Growth Rate Sensitivity (1.5% to 6.0%)
    g_low = 0.015
    g_high = 0.060
    npv_low_g = calculate_npv(base_capex_inr, base_annual_savings_inr, discount_rate=base_r, growth_rate=g_low)
    npv_high_g = calculate_npv(base_capex_inr, base_annual_savings_inr, discount_rate=base_r, growth_rate=g_high)

    results.append(
        SensitivityParameterResult(
            parameter_name="load_growth",
            display_name="Annual Feeder Load Growth",
            unit="%",
            base_value=base_growth_rate_pct,
            low_value=1.5,
            high_value=6.0,
            npv_base=round(base_npv, 2),
            npv_low_case=round(npv_low_g, 2),
            npv_high_case=round(npv_high_g, 2),
            npv_swing_inr=round(abs(npv_high_g - npv_low_g), 2),
            payback_base=round(base_payback, 2),
            payback_low_case=round(base_payback, 2),
            payback_high_case=round(base_payback, 2),
        )
    )

    # Sort parameters by NPV swing descending (Tornado ordering)
    results.sort(key=lambda p: p.npv_swing_inr, reverse=True)

    most_sensitive = results[0].display_name if results else "Bulk Loss Valuation (ACoS)"

    return TornadoSensitivityReport(
        portfolio_name=portfolio_name,
        base_capex_inr=round(base_capex_inr, 2),
        base_annual_savings_inr=round(base_annual_savings_inr, 2),
        base_npv_15yr_inr=round(base_npv, 2),
        base_payback_years=round(base_payback, 2),
        parameters=results,
        most_sensitive_parameter=most_sensitive,
    )
