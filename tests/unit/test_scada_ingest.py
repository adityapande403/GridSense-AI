import json
import pytest
from fastapi.testclient import TestClient
from backend.src.main import app
from backend.src.core.database import SessionLocal
from backend.src.models.network import Bus, DistributionTransformer, Feeder, Line, Substation, Switch
from backend.src.models.telemetry import LoadSnapshot, LoadMeasurement, WeatherObservation
from backend.src.modules.ingest.scada_adapter import SCADAIngestionAdapter
from backend.src.modules.ingest.schemas import SCADAIngestPayload, SCADAFeederRecord, SCADADTRRecord, SCADAWeatherRecord

client = TestClient(app)


def _cleanup_test_records():
    db = SessionLocal()
    try:
        # Delete test snapshots
        db.query(LoadSnapshot).filter(LoadSnapshot.provenance == "measured_test").delete()
        db.query(WeatherObservation).filter(WeatherObservation.provenance == "measured_test").delete()
        # Clean up any test DTRs
        test_dtrs = db.query(DistributionTransformer).filter(DistributionTransformer.code.like("DEMO_DTR%")).all()
        for d in test_dtrs:
            db.delete(d)
        demo_feeder = db.query(Feeder).filter(Feeder.code == "DEMO_KSEB_11KV").first()
        if demo_feeder:
            # Delete related children
            for b in demo_feeder.buses:
                db.query(Line).filter((Line.from_bus_id == b.id) | (Line.to_bus_id == b.id)).delete()
                db.query(Switch).filter((Switch.from_bus_id == b.id) | (Switch.to_bus_id == b.id)).delete()
            db.delete(demo_feeder)
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def cleanup_scada_test_data():
    """Ensure any test telemetry records are removed before and after each test."""
    _cleanup_test_records()
    yield
    _cleanup_test_records()


def test_scada_adapter_validation_and_rejections():
    adapter = SCADAIngestionAdapter()

    raw_csv = """timestamp,feeder_code,total_p_mw,dtr_code,p_kw,ambient_temperature_c
2026-11-25 10:00:00,2011951,2.5,DT-2011951-001,150.0,31.5
INVALID_DATE,2011951,2.5,DT-2011951-001,150.0,31.5
2026-11-25 11:00:00,2011951,999.0,,,
2026-11-25 12:00:00,,,DT-2011951-002,99999.0,
2026-11-25 13:00:00,,,,,-100.0
"""
    report = adapter.validate(raw_csv)
    assert report.total_records == 5
    assert report.records_accepted >= 1
    assert report.records_rejected >= 3

    error_codes = [r.error_code for r in report.rejection_reasons]
    assert "ERR_INVALID_TIMESTAMP" in error_codes
    assert "ERR_VALUE_OUT_OF_BOUNDS" in error_codes


def test_scada_adapter_csv_ingest(db_session):
    adapter = SCADAIngestionAdapter()

    csv_data = """timestamp,feeder_code,total_p_mw,total_q_mvar,source_bus_voltage_pu,dtr_code,p_kw,q_kvar,current_a,voltage_pu,ambient_temperature_c,solar_radiation_w_m2
2026-11-25 14:00:00,2011951,2.45,0.80,1.00,DT-2011951-001,210.0,68.0,32.0,0.965,33.0,800.0
2026-11-25 15:00:00,2011951,2.40,0.78,1.00,DT-2011951-001,205.0,66.0,31.0,0.966,32.0,600.0
"""
    result = adapter.ingest(
        source=csv_data,
        db_session=db_session,
        default_feeder_code="2011951",
        provenance="measured_test",
    )
    assert result.success is True
    assert result.total_records == 2
    assert result.snapshots_created >= 1
    assert result.measurements_created >= 1
    assert result.weather_created >= 1
    assert len(result.dataset_hash) == 64


def test_scada_api_json_ingest():
    payload = {
        "feeder_snapshots": [
            {
                "timestamp": "2026-11-25T16:00:00Z",
                "feeder_code": "2011951",
                "total_p_mw": 2.35,
                "total_q_mvar": 0.77,
                "source_bus_voltage_pu": 1.002,
            }
        ],
        "dtr_measurements": [
            {
                "timestamp": "2026-11-25T16:00:00Z",
                "dtr_code": "DT-2011951-001",
                "p_kw": 197.0,
                "q_kvar": 64.6,
                "current_a": 30.0,
                "voltage_pu": 0.968,
            }
        ],
        "weather_observations": [
            {
                "timestamp": "2026-11-25T16:00:00Z",
                "ambient_temperature_c": 31.0,
                "humidity_pct": 65.0,
                "solar_radiation_w_m2": 320.0,
            }
        ],
    }
    response = client.post("/api/v1/ingest/scada", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["snapshots_created"] >= 1
    assert data["measurements_created"] >= 1
    assert data["weather_created"] >= 1


def test_ingest_summary_endpoint():
    res = client.get("/api/v1/ingest/summary")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert "counts" in data
    assert "feeders" in data["counts"]
    assert "load_snapshots" in data["counts"]


def test_ingest_template_endpoints():
    res_scada = client.get("/api/v1/ingest/templates/scada_csv")
    assert res_scada.status_code == 200
    assert "text/csv" in res_scada.headers["content-type"]
    assert "total_p_mw" in res_scada.text

    res_geo = client.get("/api/v1/ingest/templates/geojson")
    assert res_geo.status_code == 200
    assert "FeatureCollection" in res_geo.text


def test_seed_demo_endpoint():
    res = client.post("/api/v1/ingest/seed-demo")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "network_ingestion" in data
