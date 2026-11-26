import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.src.core.database import SessionLocal
from backend.src.main import app
from backend.src.modules.estimation import (
    allocate_dtr_load_profile,
    evaluate_metering_sensitivity,
)
from backend.src.modules.thermal import (
    simulate_iec60076_thermal_dynamics,
    get_telangana_ambient_temp,
)


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_dtr_load_profile_allocation(db_session: Session):
    """TR-EST-01..04: Verify 24-hour load allocation and uncertainty bounds."""
    report = allocate_dtr_load_profile(
        db_session=db_session,
        dtr_code="DT-2011951-001",
        feeder_code="2011951",
        peak_multiplier=1.0,
    )

    assert report.dtr_code == "DT-2011951-001"
    assert report.rated_kva == 250.0
    assert len(report.time_series) == 24
    assert report.peak_demand_kw > 0.0
    assert 0.0 < report.load_factor <= 1.0
    assert report.provenance == "estimated"

    for interval in report.time_series:
        assert 0 <= interval.hour <= 23
        # Strict uncertainty bounds: P10 <= P50 <= P90
        assert interval.p10_kw <= interval.p50_kw <= interval.p90_kw
        assert interval.loading_pct >= 0.0
        # Category breakdown sum should approximately equal P50 minus technical loss
        cat_sum = (
            interval.domestic_kw
            + interval.commercial_kw
            + interval.industrial_kw
            + interval.agricultural_kw
            + interval.technical_loss_kw
        )
        assert abs(cat_sum - interval.p50_kw) < 0.5


def test_metering_penetration_sensitivity(db_session: Session):
    """TR-EST-05: Test sensitivity benchmark across 0%, 5%, 10%, 25%, 50% AMI coverage."""
    report = evaluate_metering_sensitivity(
        db_session=db_session,
        feeder_code="2011951",
    )

    assert len(report.benchmark_metrics) == 5
    coverages = [m.metering_coverage_pct for m in report.benchmark_metrics]
    assert coverages == [0.0, 5.0, 10.0, 25.0, 50.0]

    # Error metrics must strictly decrease as metering coverage increases
    for i in range(len(report.benchmark_metrics) - 1):
        curr = report.benchmark_metrics[i]
        nxt = report.benchmark_metrics[i + 1]
        assert curr.mae_kw > nxt.mae_kw
        assert curr.rmse_kw > nxt.rmse_kw
        assert curr.mape_pct > nxt.mape_pct
        assert curr.state_estimation_confidence_pct < nxt.state_estimation_confidence_pct


def test_iec60076_thermal_dynamics(db_session: Session):
    """TR-THM-01..03: Test IEC 60076-7 numerical integration and Asset Health Index."""
    report = simulate_iec60076_thermal_dynamics(
        db_session=db_session,
        dtr_code="DT-2011951-001",
        feeder_code="2011951",
        base_ambient_temp_c=35.0,
        peak_multiplier=1.0,
    )

    assert report.dtr_code == "DT-2011951-001"
    assert len(report.time_series) == 24
    assert report.peak_hot_spot_temp_c >= report.peak_top_oil_temp_c
    assert report.peak_top_oil_temp_c >= report.peak_ambient_temp_c
    assert 0.0 <= report.asset_health_index <= 100.0
    assert report.health_category in [
        "EXCELLENT",
        "GOOD",
        "DEGRADED",
        "CRITICAL",
        "WARNING (THERMAL STRESS)",
        "DEGRADED (OVERLOADED)",
    ]
    assert report.cumulative_aging_hours_24h > 0.0

    for interval in report.time_series:
        # Hot-spot must exceed top-oil, which must exceed ambient
        assert interval.hot_spot_temp_c >= interval.top_oil_temp_c
        assert interval.top_oil_temp_c >= interval.ambient_temp_c
        assert interval.relative_aging_rate > 0.0
        # If hot spot >= 120°C, critical flag must be set
        if interval.hot_spot_temp_c >= 120.0:
            assert interval.is_critical_hot_spot is True


def test_estimation_and_thermal_api_endpoints():
    """Verify FastAPI routes for estimation and thermal dynamics."""
    client = TestClient(app)

    res_est = client.get("/api/v1/estimation/dtr-profile?dtr_code=DT-2011951-001&feeder_code=2011951")
    assert res_est.status_code == 200
    assert "time_series" in res_est.json()

    res_sens = client.get("/api/v1/estimation/metering-sensitivity?feeder_code=2011951")
    assert res_sens.status_code == 200
    assert "benchmark_metrics" in res_sens.json()

    res_thm = client.get("/api/v1/thermal/dtr-dynamics?dtr_code=DT-2011951-001&feeder_code=2011951&base_ambient_temp_c=35")
    assert res_thm.status_code == 200
    assert "asset_health_index" in res_thm.json()
