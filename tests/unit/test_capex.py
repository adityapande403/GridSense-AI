import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.src.core.database import get_db, Base, engine, SessionLocal
from backend.src.main import app
from backend.src.models.network import Feeder, Line, Bus, DistributionTransformer
from backend.src.modules.capex import (
    evaluate_reconductoring_portfolio,
    evaluate_dtr_investments,
    analyze_feeder_bifurcation,
    run_tornado_sensitivity_analysis,
)


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_reconductoring_portfolio_ranking(db_session: Session):
    """TR-CPX-03 & TR-CPX-04: Test conductor upgrade ranking and payback."""
    report = evaluate_reconductoring_portfolio(
        db_session=db_session,
        feeder_code="2011951",
        cost_per_kwh_inr=5.50,
        discount_rate_pct=10.0,
    )

    assert report.feeder_code in ["2011951", report.feeder_name]
    assert len(report.candidates) > 0
    assert len(report.top_recommended) <= 8
    assert report.total_reconductoring_capex_inr > 0.0
    assert report.total_annual_savings_inr > 0.0
    assert report.portfolio_payback_years > 0.0
    assert report.portfolio_npv_15yr_inr > 0.0

    # Verify rank order (Rank 1 has highest BCR or best payback)
    cand_1 = report.top_recommended[0]
    assert cand_1.rank == 1
    assert cand_1.resistance_reduction_pct > 0.0
    assert cand_1.recommended_conductor in ["ACSR_Dog", "ACSR_Rabbit", "ACSR_Wolf"]
    assert cand_1.simple_payback_years > 0.0
    assert cand_1.benefit_cost_ratio >= 1.0


def test_dtr_investments_3way(db_session: Session):
    """TR-CPX-02: Test 3-way DTR evaluation (Augmentation vs Siting vs Switching)."""
    report = evaluate_dtr_investments(
        db_session=db_session,
        feeder_code="2011951",
        cost_per_kwh_inr=5.50,
        discount_rate_pct=10.0,
    )

    assert report.total_dtrs_analyzed >= 4
    assert len(report.dtr_evaluations) >= 4

    for cand in report.dtr_evaluations:
        assert len(cand.options) == 3
        option_types = {opt.option_type for opt in cand.options}
        assert option_types == {"AUGMENTATION", "NEW_SITING", "LOAD_SWITCHING"}
        
        # Verify exactly one option is marked as recommended
        recommended_opts = [opt for opt in cand.options if opt.is_recommended]
        assert len(recommended_opts) == 1
        assert cand.recommended_option_type == recommended_opts[0].option_type
        assert len(cand.primary_justification) > 10

        # Load switching should be zero-CAPEX / negligible CAPEX
        switch_opt = next(opt for opt in cand.options if opt.option_type == "LOAD_SWITCHING")
        assert switch_opt.capital_cost_inr <= 10000.0
        assert switch_opt.payback_years < 1.0


def test_feeder_bifurcation_analysis(db_session: Session):
    """TR-CPX-01: Test feeder bifurcation triggers, load centroid, and candidate splits."""
    report = analyze_feeder_bifurcation(
        db_session=db_session,
        feeder_code="2011951",
        cost_per_kwh_inr=5.50,
        discount_rate_pct=10.0,
    )

    assert report.current_length_km > 5.0
    assert "latitude" in report.load_moment_centroid_coordinates
    assert "longitude" in report.load_moment_centroid_coordinates
    assert len(report.candidates) == 3
    assert report.recommended_split is not None
    assert report.recommended_split.rank == 1
    assert report.recommended_split.express_line_length_km > 0.0
    assert report.recommended_split.total_bifurcation_capex_inr > 1000000.0  # Bay + Line + Switch
    assert report.recommended_split.annual_loss_savings_inr > 0.0
    assert report.recommended_split.simple_payback_years > 0.0


def test_tornado_sensitivity_analysis():
    """TR-CPX-06: Test tornado multi-variable sensitivity intervals."""
    report = run_tornado_sensitivity_analysis(
        base_capex_inr=2450000.0,
        base_annual_savings_inr=425000.0,
        base_cost_per_kwh=5.50,
        base_discount_rate_pct=10.0,
        base_growth_rate_pct=3.5,
    )

    assert len(report.parameters) == 4
    param_names = {p.parameter_name for p in report.parameters}
    assert param_names == {"tariff_acos", "capital_escalation", "discount_rate", "load_growth"}

    # Verify descending ordering by swing (Tornado structure)
    for i in range(len(report.parameters) - 1):
        assert report.parameters[i].npv_swing_inr >= report.parameters[i + 1].npv_swing_inr

    assert report.most_sensitive_parameter is not None


def test_capex_api_endpoints():
    """Verify FastAPI CAPEX router responses via TestClient."""
    client = TestClient(app)

    res_rec = client.get("/api/v1/capex/reconductoring-ranks?feeder_code=2011951")
    assert res_rec.status_code == 200
    assert "candidates" in res_rec.json()

    res_dtr = client.get("/api/v1/capex/dtr-investments?feeder_code=2011951")
    assert res_dtr.status_code == 200
    assert "dtr_evaluations" in res_dtr.json()

    res_bif = client.get("/api/v1/capex/bifurcation?feeder_code=2011951")
    assert res_bif.status_code == 200
    assert "recommended_split" in res_bif.json()

    res_tor = client.post(
        "/api/v1/capex/sensitivity-tornado",
        json={
            "base_capex_inr": 2000000.0,
            "base_annual_savings_inr": 350000.0,
            "base_cost_per_kwh": 5.50,
            "base_discount_rate_pct": 10.0,
            "base_growth_rate_pct": 3.5,
            "portfolio_name": "Test Feeder Portfolio",
        },
    )
    assert res_tor.status_code == 200
    assert "parameters" in res_tor.json()
