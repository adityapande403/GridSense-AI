import math
from datetime import datetime
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from backend.src.models.network import Feeder, Line, Bus
from backend.src.modules.capex.schemas import (
    ReconductoringCandidate,
    ReconductoringReport,
)

# Standard DISCOM Conductor Catalog & Electrical Parameters
CONDUCTOR_CATALOG = {
    "ACSR_Weasel": {"r_ohm_per_km": 0.908, "x_ohm_per_km": 0.380, "max_i_ka": 0.135, "sq_mm": 30},
    "ACSR_Rabbit": {"r_ohm_per_km": 0.542, "x_ohm_per_km": 0.370, "max_i_ka": 0.190, "sq_mm": 50},
    "ACSR_Dog":    {"r_ohm_per_km": 0.273, "x_ohm_per_km": 0.355, "max_i_ka": 0.300, "sq_mm": 100},
    "ACSR_Wolf":   {"r_ohm_per_km": 0.183, "x_ohm_per_km": 0.340, "max_i_ka": 0.380, "sq_mm": 150},
    "XLPE_HT_Cable": {"r_ohm_per_km": 0.320, "x_ohm_per_km": 0.090, "max_i_ka": 0.240, "sq_mm": 95},
}

# Standard DISCOM Capital Replacement Cost Rates (INR per km)
RECONDUCTORING_COST_PER_KM = {
    ("ACSR_Weasel", "ACSR_Rabbit"): 220000.0,
    ("ACSR_Weasel", "ACSR_Dog"):    380000.0,
    ("ACSR_Rabbit", "ACSR_Dog"):    260000.0,
    ("ACSR_Dog", "ACSR_Wolf"):      450000.0,
}


def calculate_npv(capex: float, annual_savings: float, discount_rate: float = 0.10, growth_rate: float = 0.035, years: int = 15) -> float:
    """Calculates 15-year Net Present Value with compound load growth."""
    pv_savings = sum(
        (annual_savings * ((1.0 + growth_rate) ** (t - 1))) / ((1.0 + discount_rate) ** t)
        for t in range(1, years + 1)
    )
    return pv_savings - capex


def evaluate_reconductoring_portfolio(
    db_session: Session,
    feeder_code: str = "2011951",
    cost_per_kwh_inr: float = 5.50,
    discount_rate_pct: float = 10.0,
    load_factor: float = 0.60,
    min_length_meters: float = 20.0,
) -> ReconductoringReport:
    """
    Evaluates all 11 kV lines on the target feeder for reconductoring opportunities.
    Ranks candidates by Benefit-Cost Ratio and Simple Payback Period (TR-CPX-03).
    """
    feeder = db_session.query(Feeder).filter(Feeder.code == feeder_code).first()
    if not feeder:
        feeder = db_session.query(Feeder).filter(Feeder.id == feeder_code).first()
    if not feeder:
        raise ValueError(f"Feeder '{feeder_code}' not found.")

    def is_ht(line: Line) -> bool:
        c = line.code or ""
        cond = line.conductor_type or ""
        return not (c.startswith("LL-") or c.startswith("LC-") or "LT_" in cond)

    lines = (
        db_session.query(Line)
        .filter(Line.feeder_id == feeder.id)
        .all()
    )
    ht_lines = [l for l in lines if is_ht(l)]

    discount_rate = discount_rate_pct / 100.0
    # Loss Load Factor: LLF = 0.3 * LF + 0.7 * LF^2
    llf = 0.3 * load_factor + 0.7 * (load_factor ** 2)

    candidates: List[ReconductoringCandidate] = []

    for line in ht_lines:
        length_km = max(line.length_km or 0.05, min_length_meters / 1000.0)
        curr_cond = line.conductor_type or "ACSR_Weasel"
        
        # Determine recommended conductor
        if "Weasel" in curr_cond:
            rec_cond = "ACSR_Dog" if length_km >= 0.05 else "ACSR_Rabbit"
            unit_rate = RECONDUCTORING_COST_PER_KM.get(("ACSR_Weasel", rec_cond), 380000.0)
        elif "Rabbit" in curr_cond:
            rec_cond = "ACSR_Dog"
            unit_rate = RECONDUCTORING_COST_PER_KM.get(("ACSR_Rabbit", rec_cond), 260000.0)
        else:
            rec_cond = "ACSR_Dog"
            unit_rate = 320000.0

        curr_r = line.r_ohm_per_km or CONDUCTOR_CATALOG.get(curr_cond, {}).get("r_ohm_per_km", 0.908)
        rec_r = CONDUCTOR_CATALOG.get(rec_cond, {}).get("r_ohm_per_km", 0.273)
        delta_r = max(0.01, curr_r - rec_r)
        reduction_pct = (delta_r / curr_r) * 100.0

        # Estimated peak current in amperes (based on line max_i_ka or downstream loading)
        max_ka = line.max_i_ka or 0.135
        # Assume average trunk/branch utilization 30% - 65%
        loading_pct = 42.5 if "HC-" in line.code else 32.0
        i_peak_amps = (loading_pct / 100.0) * (max_ka * 1000.0)

        # 3-phase line active power loss: P_loss = 3 * I^2 * R * L / 1000 kW
        base_p_loss_kw = 3.0 * (i_peak_amps ** 2) * curr_r * length_km / 1000.0
        post_p_loss_kw = 3.0 * (i_peak_amps ** 2) * rec_r * length_km / 1000.0
        delta_p_loss_kw = max(0.001, base_p_loss_kw - post_p_loss_kw)

        # Annual energy loss savings: kWh = delta_P_kw * 8760 * LLF
        annual_energy_saved_kwh = delta_p_loss_kw * 8760.0 * llf
        base_annual_loss_kwh = base_p_loss_kw * 8760.0 * llf
        post_annual_loss_kwh = post_p_loss_kw * 8760.0 * llf

        annual_savings_inr = annual_energy_saved_kwh * cost_per_kwh_inr
        capex_inr = unit_rate * length_km

        payback_years = capex_inr / max(1.0, annual_savings_inr)
        npv_15yr = calculate_npv(capex_inr, annual_savings_inr, discount_rate=discount_rate)
        bcr = (npv_15yr + capex_inr) / capex_inr if capex_inr > 0 else 0.0

        candidates.append(
            ReconductoringCandidate(
                line_id=str(line.id),
                line_code=line.code,
                length_km=round(length_km, 4),
                voltage_kv=11.0,
                current_conductor=curr_cond,
                current_r_ohm_per_km=round(curr_r, 4),
                current_loading_pct=round(loading_pct, 1),
                recommended_conductor=rec_cond,
                recommended_r_ohm_per_km=round(rec_r, 4),
                resistance_reduction_pct=round(reduction_pct, 1),
                base_annual_loss_kwh=round(base_annual_loss_kwh, 1),
                post_annual_loss_kwh=round(post_annual_loss_kwh, 1),
                annual_energy_saved_kwh=round(annual_energy_saved_kwh, 1),
                annual_cost_savings_inr=round(annual_savings_inr, 2),
                capital_cost_inr=round(capex_inr, 2),
                simple_payback_years=round(payback_years, 2),
                npv_15yr_inr=round(npv_15yr, 2),
                benefit_cost_ratio=round(bcr, 2),
                rank=0,  # assigned below
            )
        )

    # Sort candidates by BCR descending, then Payback ascending
    candidates.sort(key=lambda c: (c.benefit_cost_ratio, -c.simple_payback_years), reverse=True)
    for idx, cand in enumerate(candidates):
        cand.rank = idx + 1

    top_candidates = candidates[:8]

    total_capex = sum(c.capital_cost_inr for c in top_candidates)
    total_savings = sum(c.annual_cost_savings_inr for c in top_candidates)
    portfolio_payback = total_capex / max(1.0, total_savings)
    portfolio_npv = calculate_npv(total_capex, total_savings, discount_rate=discount_rate)

    return ReconductoringReport(
        feeder_code=feeder.code or str(feeder.id),
        feeder_name=feeder.name or f"Feeder {feeder_code}",
        timestamp=datetime.utcnow().isoformat() + "Z",
        cost_per_kwh_inr=cost_per_kwh_inr,
        discount_rate_pct=discount_rate_pct,
        total_reconductoring_capex_inr=round(total_capex, 2),
        total_annual_savings_inr=round(total_savings, 2),
        portfolio_payback_years=round(portfolio_payback, 2),
        portfolio_npv_15yr_inr=round(portfolio_npv, 2),
        candidates=candidates,
        top_recommended=top_candidates,
    )
