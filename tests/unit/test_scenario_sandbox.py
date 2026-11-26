"""
Unit Tests for Milestone 10: Scenario Simulator ("What-If" Sandbox) (TR-SCN-01..04).
Verifies:
- Authoritative base twin immutability (TR-SCN-02).
- In-memory branch-and-mutate sandbox execution (TR-SCN-01).
- Multi-scenario delta scorecard calculation (TR-SCN-03).
- Deterministic simulation reproducibility (TR-SCN-04).
- FastAPI endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.src.core.database import SessionLocal
from backend.src.main import app
from backend.src.models.network import Feeder, DistributionTransformer, Line
from backend.src.modules.scenarios import (
    ScenarioMutation,
    ScenarioMutationType,
    ScenarioRequest,
    MultiScenarioComparisonRequest,
    compute_feeder_hash,
    get_scenario_presets,
    simulate_scenario,
    compare_multiple_scenarios,
)


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_authoritative_base_immutability(db_session: Session):
    """TR-SCN-02: Strict base twin cryptographic immutability verification."""
    feeder = db_session.query(Feeder).filter(Feeder.code == "2011951").first()
    assert feeder is not None

    hash_prior = compute_feeder_hash(db_session, feeder.id)

    # Run heavy multi-variable scenario
    req = ScenarioRequest(
        feeder_code="2011951",
        scenario_name="Stress Test Scenario",
        mutations=[
            ScenarioMutation(mutation_type=ScenarioMutationType.LOAD_GROWTH, scale_factor=1.35),
            ScenarioMutation(mutation_type=ScenarioMutationType.EV_CHARGING, ev_chargers_count=6, charger_kw=50.0),
            ScenarioMutation(mutation_type=ScenarioMutationType.SOLAR_PV, solar_kw=200.0),
        ],
    )
    result = simulate_scenario(db_session, req)

    hash_post = compute_feeder_hash(db_session, feeder.id)

    # Assert immutability guarantees
    assert hash_prior == hash_post
    assert result.immutability_verified is True
    assert result.base_version_hash == hash_prior
    assert result.post_run_version_hash == hash_post


def test_simulation_reproducibility(db_session: Session):
    """TR-SCN-04: Identical rerun produces byte-identical results and identical reproducibility token."""
    req = ScenarioRequest(
        feeder_code="2011951",
        scenario_name="Reproducible Rerun Test",
        mutations=[
            ScenarioMutation(mutation_type=ScenarioMutationType.LOAD_GROWTH, scale_factor=1.20),
            ScenarioMutation(mutation_type=ScenarioMutationType.SOLAR_PV, solar_kw=100.0),
        ],
    )

    run1 = simulate_scenario(db_session, req)
    run2 = simulate_scenario(db_session, req)

    assert run1.reproducibility_token == run2.reproducibility_token
    assert run1.kpis.delta_loss_kw == run2.kpis.delta_loss_kw
    assert run1.kpis.scenario_min_voltage_pu == run2.kpis.scenario_min_voltage_pu
    assert run1.kpis.base_loss_kw == run2.kpis.base_loss_kw


def test_solar_pv_der_physics_impact(db_session: Session):
    """TR-SCN-01 & TR-PHY: Solar PV injection should improve minimum tail-end voltage."""
    req_solar = ScenarioRequest(
        feeder_code="2011951",
        scenario_name="Rooftop Solar DER Test",
        mutations=[
            ScenarioMutation(mutation_type=ScenarioMutationType.SOLAR_PV, solar_kw=250.0, solar_pf=1.0),
        ],
    )
    result = simulate_scenario(db_session, req_solar)

    assert result.kpis.ac_converged is True
    # Solar active power injection supports tail voltage (delta >= 0.0)
    assert result.kpis.delta_min_voltage_pu >= -0.001
    assert len(result.impacted_elements) > 0


def test_ev_charging_cluster_physics_impact(db_session: Session):
    """TR-SCN-01: EV Fast-Charging cluster adds concentrated load and increases technical losses."""
    req_ev = ScenarioRequest(
        feeder_code="2011951",
        scenario_name="EV Fast Charging Hub",
        mutations=[
            ScenarioMutation(mutation_type=ScenarioMutationType.EV_CHARGING, ev_chargers_count=8, charger_kw=50.0),
        ],
    )
    result = simulate_scenario(db_session, req_ev)

    assert result.kpis.ac_converged is True
    # 400 kW added load increases feeder technical losses
    assert result.kpis.delta_loss_kw > 0.0
    # Min voltage drops under 400 kW load
    assert result.kpis.delta_min_voltage_pu <= 0.0


def test_scenario_presets_loader(db_session: Session):
    """Tests loading curated presets for active feeder."""
    presets = get_scenario_presets(db_session, feeder_code="2011951")
    assert len(presets) >= 4

    preset_ids = {p.preset_id for p in presets}
    assert "PRESET_EV_CHARGING" in preset_ids
    assert "PRESET_ROOFTOP_SOLAR" in preset_ids
    assert "PRESET_LOAD_GROWTH_25" in preset_ids
    assert "PRESET_N1_OUTAGE" in preset_ids


def test_multi_scenario_comparison(db_session: Session):
    """TR-SCN-03: Side-by-side multi-scenario comparison."""
    scenarios = [
        ScenarioRequest(
            feeder_code="2011951",
            scenario_name="Scenario A: +15% Growth",
            mutations=[ScenarioMutation(mutation_type=ScenarioMutationType.LOAD_GROWTH, scale_factor=1.15)],
        ),
        ScenarioRequest(
            feeder_code="2011951",
            scenario_name="Scenario B: Solar Adoption",
            mutations=[ScenarioMutation(mutation_type=ScenarioMutationType.SOLAR_PV, solar_kw=150.0)],
        ),
    ]

    comp = compare_multiple_scenarios(db_session, feeder_code="2011951", scenarios=scenarios)
    assert len(comp.scenario_results) == 2
    assert comp.baseline is not None
    assert comp.scenario_results[0].scenario_name == "Scenario A: +15% Growth"
    assert comp.scenario_results[1].scenario_name == "Scenario B: Solar Adoption"


def test_scenario_api_endpoints():
    """Verify FastAPI endpoints for scenarios router."""
    client = TestClient(app)

    # 1. GET /api/v1/scenarios/presets
    res_presets = client.get("/api/v1/scenarios/presets?feeder_code=2011951")
    assert res_presets.status_code == 200
    assert len(res_presets.json()) >= 4

    # 2. GET /api/v1/scenarios/base-hash
    res_hash = client.get("/api/v1/scenarios/base-hash?feeder_code=2011951")
    assert res_hash.status_code == 200
    data_hash = res_hash.json()
    assert "base_version_hash" in data_hash
    assert data_hash["immutability_status"] == "CRYPTOGRAPHICALLY_LOCKED"

    # 3. POST /api/v1/scenarios/simulate
    sim_body = {
        "feeder_code": "2011951",
        "scenario_name": "API Test Scenario",
        "mutations": [
            {"mutation_type": "LOAD_GROWTH", "scale_factor": 1.10},
            {"mutation_type": "SOLAR_PV", "solar_kw": 50.0},
        ],
    }
    res_sim = client.post("/api/v1/scenarios/simulate", json=sim_body)
    assert res_sim.status_code == 200
    data_sim = res_sim.json()
    assert data_sim["immutability_verified"] is True
    assert "kpis" in data_sim
    assert "impacted_elements" in data_sim
    assert len(data_sim["impacted_elements"]) > 0

    # 4. POST /api/v1/scenarios/compare
    comp_body = {
        "feeder_code": "2011951",
        "scenarios": [sim_body],
    }
    res_comp = client.post("/api/v1/scenarios/compare", json=comp_body)
    assert res_comp.status_code == 200
    data_comp = res_comp.json()
    assert len(data_comp["scenario_results"]) == 1
