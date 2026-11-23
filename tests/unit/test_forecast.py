import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.src.core.database import SessionLocal
from backend.src.main import app
from backend.src.models.network import DistributionTransformer
from backend.src.modules.forecast import (
    build_dtr_forecast_report,
    generate_feeder_overload_alerts,
)


@pytest.fixture(scope="module")
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_dtr_ml_forecast_report_generation(db_session: Session):
    """
    TR-FOR-01..04: Tests LightGBM multi-horizon load forecast generation
    with quantile intervals (P10 <= P50 <= P90), chronological walk-forward
    validation, and benchmark comparison against persistence baseline.
    """
    dtr = db_session.query(DistributionTransformer).first()
    assert dtr is not None, "At least one DTR required in database"
    
    report = build_dtr_forecast_report(db_session=db_session, dtr_code=dtr.code)
    
    # 1. Provenance Tagging (Principle A4-7)
    assert report.provenance == "predicted"
    assert "LightGBM" in report.provenance_disclaimer
    
    # 2. Multi-Horizon Forecasts (1h, 4h, 8h, 24h)
    assert len(report.forecasts) == 4
    horizons = [f.horizon_hours for f in report.forecasts]
    assert horizons == [1, 4, 8, 24]
    
    for f in report.forecasts:
        assert f.provenance == "predicted"
        assert f.predicted_load_kw > 0
        # Quantile monotonicity guarantee
        assert f.confidence_p10_kw <= f.predicted_load_kw
        assert f.confidence_p90_kw >= f.predicted_load_kw
        assert f.predicted_loading_pct > 0
        assert f.ambient_temp_c >= 20.0
        assert f.status in ["NORMAL", "ELEVATED", "NEAR_OVERLOAD", "CRITICAL_OVERLOAD"]
        
    # 3. Model Benchmark Evaluation (TR-FOR-02)
    assert len(report.benchmarks) == 4
    for b in report.benchmarks:
        assert b.model_mae_kw > 0
        assert b.model_rmse_kw >= b.model_mae_kw
        assert b.model_mape_pct > 0
        assert b.persistence_mae_kw > 0
        # GBDT must beat persistence baseline across horizons
        assert b.improvement_over_persistence_pct > 0
        
    # 4. Feature Importance
    assert len(report.feature_importances) > 0
    assert "ambient_temp_c" in report.feature_importances
    assert "is_ag_shift" in report.feature_importances


def test_feeder_overload_early_warning_alerts(db_session: Session):
    """
    TR-FOR-05: Tests feeder-wide early warning alert generation
    identifying projected overloads with 4h to 24h lead time.
    """
    summary = generate_feeder_overload_alerts(db_session=db_session, feeder_code="2011951")
    
    assert summary.provenance == "predicted"
    assert summary.total_dtrs_monitored > 0
    assert summary.active_alerts_count >= 0
    
    for alert in summary.alerts:
        assert alert.provenance == "predicted"
        assert alert.lead_time_hours in [1, 4, 8, 24]
        assert alert.severity in ["WARNING", "CRITICAL"]
        assert alert.projected_loading_pct >= 85.0
        assert "FLISR" in alert.recommended_mitigation or "transfer" in alert.recommended_mitigation.lower()


def test_api_forecast_endpoints(client: TestClient, db_session: Session):
    """Tests FastAPI REST endpoints for forecasting and feeder alerts."""
    dtr = db_session.query(DistributionTransformer).first()
    assert dtr is not None
    
    # 1. GET /api/v1/forecast/dtr
    res_dtr = client.get(f"/api/v1/forecast/dtr?dtr_code={dtr.code}")
    assert res_dtr.status_code == 200
    data_dtr = res_dtr.json()
    assert data_dtr["dtr_code"] == dtr.code
    assert data_dtr["provenance"] == "predicted"
    assert len(data_dtr["forecasts"]) == 4
    
    # 2. GET /api/v1/forecast/feeder-alerts
    res_alerts = client.get("/api/v1/forecast/feeder-alerts?feeder_code=2011951")
    assert res_alerts.status_code == 200
    data_alerts = res_alerts.json()
    assert data_alerts["provenance"] == "predicted"
    assert "alerts" in data_alerts
