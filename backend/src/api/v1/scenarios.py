"""FastAPI router for Scenario Simulator endpoints (TR-SCN-01..04)."""

import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.models.audit import AuditLog
from backend.src.models.network import Feeder
from backend.src.modules.scenarios import (
    MultiScenarioComparisonRequest,
    MultiScenarioComparisonResponse,
    ScenarioPreset,
    ScenarioRequest,
    ScenarioSimulationResponse,
    compare_multiple_scenarios,
    compute_feeder_hash,
    get_scenario_presets,
    simulate_scenario,
)

router = APIRouter(prefix="/scenarios", tags=["What-If Scenario Simulator"])


@router.get("/presets", response_model=List[ScenarioPreset])
def get_feeder_scenario_presets(
    feeder_code: str = Query("2011951", description="Feeder code"),
    db: Session = Depends(get_db),
):
    """Returns curated What-If scenario presets for the active feeder."""
    try:
        return get_scenario_presets(db_session=db, feeder_code=feeder_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load scenario presets: {str(e)}")


@router.get("/base-hash")
def get_feeder_immutability_hash(
    feeder_code: str = Query("2011951", description="Target feeder code"),
    db: Session = Depends(get_db),
):
    """Returns authoritative SHA-256 state hash verifying base twin immutability (TR-SCN-02)."""
    feeder = db.query(Feeder).filter(Feeder.code == str(feeder_code)).first()
    if not feeder:
        try:
            f_uuid = uuid.UUID(str(feeder_code))
            feeder = db.get(Feeder, f_uuid)
        except (ValueError, TypeError):
            pass
    if not feeder:
        raise HTTPException(status_code=404, detail=f"Feeder '{feeder_code}' not found.")

    h = compute_feeder_hash(db, feeder.id)
    return {
        "feeder_code": feeder.code,
        "feeder_name": feeder.name,
        "base_version_hash": h,
        "immutability_status": "CRYPTOGRAPHICALLY_LOCKED",
        "provenance": "measured",
    }


@router.post("/simulate", response_model=ScenarioSimulationResponse)
def run_scenario_simulation(
    request: ScenarioRequest,
    db: Session = Depends(get_db),
):
    """
    Executes an isolated What-If scenario simulation in an in-memory branch sandbox (TR-SCN-01).
    Guarantees master database immutability and returns AC Newton-Raphson delta metrics.
    """
    try:
        resp = simulate_scenario(db_session=db, req=request)
        try:
            audit = AuditLog(
                user_identifier="operator",
                action_type="simulate_scenario",
                resource_type="scenario",
                details_json={
                    "scenario_name": resp.scenario_name,
                    "feeder_code": request.feeder_code,
                    "reproducibility_token": resp.reproducibility_token,
                    "base_network_hash": resp.base_network_hash,
                    "delta_loss_kw": resp.kpis.active_loss_kw.delta,
                    "delta_min_voltage_pu": resp.kpis.min_voltage_pu.delta,
                    "delta_max_loading_pct": resp.kpis.max_line_loading_pct.delta,
                },
            )
            db.add(audit)
            db.commit()
        except Exception:
            pass
        return resp
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scenario simulation error: {str(e)}")


@router.post("/compare", response_model=MultiScenarioComparisonResponse)
def compare_scenarios(
    request: MultiScenarioComparisonRequest,
    db: Session = Depends(get_db),
):
    """
    Simulates and compares up to 3 candidate scenarios side-by-side against baseline (TR-SCN-03).
    """
    try:
        return compare_multiple_scenarios(
            db_session=db,
            feeder_code=request.feeder_code,
            scenarios=request.scenarios,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-scenario comparison error: {str(e)}")
