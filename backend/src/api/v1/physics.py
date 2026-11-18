from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.models.network import Feeder, Bus, Line, DistributionTransformer, Switch
from backend.src.modules.physics import (
    PowerFlowDivergenceError,
    PowerFlowResult,
    PowerFlowRunRequest,
    ContingencyScreeningReport,
    ShortCircuitScreeningReport,
    build_network_from_db,
    run_ac_power_flow,
    run_n1_contingency_screening,
    run_short_circuit_screening,
    run_all_calibrations,
)

router = APIRouter(prefix="/physics", tags=["Grid Physics Engine (TR-PHY)"])


@router.post(
    "/power-flow/run",
    response_model=PowerFlowResult,
    summary="Execute AC Newton-Raphson Power Flow (TR-PHY-01..05)",
    status_code=status.HTTP_200_OK,
)
def execute_power_flow(
    req: PowerFlowRunRequest,
    db: Session = Depends(get_db),
) -> PowerFlowResult:
    """
    Constructs pandapower network dynamically from database assets and executes
    balanced AC power flow using the Newton-Raphson solver.

    TR-PHY-01: Balanced AC Newton-Raphson power flow.
    TR-PHY-02: Non-convergence returns HTTP 422 with diagnostics payload.
    TR-PHY-03: Statutory voltage compliance classification (0.94 - 1.06 p.u.).
    TR-PHY-04: Conductor thermal ampacity loading (ambient corrected per IEEE 738).
    TR-PHY-05: Technical loss accounting and conservation balance check.
    """
    try:
        net, metadata = build_network_from_db(
            db_session=db,
            feeder_code_or_id=req.feeder_code,
            ambient_temp_c=req.ambient_temp_c,
            load_multiplier=req.load_multiplier,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(val_err),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to construct network model: {str(e)}",
        )

    try:
        result = run_ac_power_flow(
            net=net,
            algorithm=req.algorithm,
            enforce_q_limits=req.enforce_q_limits,
            metadata=metadata,
        )
        return result
    except PowerFlowDivergenceError as div_err:
        # TR-PHY-02: Return explicit 422 diagnostic payload
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": str(div_err),
                "diagnostics": div_err.diagnostics,
            },
        )


@router.get(
    "/power-flow/feeders",
    summary="List Feeders Available for Physics Simulation",
)
def list_simulation_feeders(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """Returns all feeders in the database ready for AC power flow simulation."""
    feeders = db.query(Feeder).all()
    feeders_list = []
    for f in feeders:
        b_count = db.query(Bus).filter(Bus.feeder_id == f.id).count()
        l_count = db.query(Line).filter(Line.feeder_id == f.id).count()
        d_count = db.query(DistributionTransformer).join(Bus).filter(Bus.feeder_id == f.id).count()
        sw_count = db.query(Switch).join(Bus, Switch.from_bus_id == Bus.id).filter(Bus.feeder_id == f.id).count()
        feeders_list.append({
            "id": str(f.id),
            "code": f.code,
            "name": f.name,
            "nominal_voltage_kv": f.voltage_kv,
            "trunk_conductor": f.trunk_conductor_type,
            "total_buses": b_count,
            "total_lines": l_count,
            "total_dtrs": d_count,
            "total_switches": sw_count,
        })
    return feeders_list


@router.post(
    "/contingency/n-1",
    response_model=ContingencyScreeningReport,
    summary="Execute Single-Contingency N-1 Line Outage Screening (TR-PHY-07)",
)
def execute_n1_screening(
    feeder_code: str = Query("2011951", description="Feeder code to screen"),
    ambient_temp_c: float = Query(35.0, description="Ambient temperature (deg C)"),
    load_multiplier: float = Query(1.0, description="Load multiplier"),
    max_lines: Optional[int] = Query(None, description="Max lines to simulate"),
    db: Session = Depends(get_db),
) -> ContingencyScreeningReport:
    """
    Executes single-contingency line outage (N-1) screening across the network.
    Identifies single points of failure, downstream unserved energy, and post-contingency thermal line overloads.
    """
    try:
        net, metadata = build_network_from_db(
            db_session=db,
            feeder_code_or_id=feeder_code,
            ambient_temp_c=ambient_temp_c,
            load_multiplier=load_multiplier,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))

    report = run_n1_contingency_screening(
        net=net,
        metadata=metadata,
        max_lines_to_screen=max_lines,
    )
    return report


@router.post(
    "/short-circuit/screening",
    response_model=ShortCircuitScreeningReport,
    summary="Execute IEC 60909 Short-Circuit Fault Screening (TR-PHY-08)",
)
def execute_short_circuit_screening(
    feeder_code: str = Query("2011951", description="Feeder code"),
    fault_type: str = Query("3ph", description="Fault type: '3ph' (symmetrical) or '1ph' (single line to ground)"),
    case: str = Query("max", description="Calculation case: 'max' or 'min' per IEC 60909"),
    db: Session = Depends(get_db),
) -> ShortCircuitScreeningReport:
    """
    Calculates symmetrical initial and peak short-circuit currents per IEC 60909.
    Evaluates whether switchgear breaking capacities are exceeded.
    """
    try:
        net, metadata = build_network_from_db(
            db_session=db,
            feeder_code_or_id=feeder_code,
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))

    report = run_short_circuit_screening(
        net=net,
        db_session=db,
        metadata=metadata,
        fault_type=fault_type,
        case=case,
    )
    return report


@router.get(
    "/benchmarks/calibration",
    summary="Execute TR-PHY-06 Calibration Suite (2-bus, 3-bus, IEEE 33, IEEE 69)",
)
def get_calibration_verification() -> Dict[str, Any]:
    """
    Runs hand-calculated 2-bus, 3-bus networks, IEEE 33-bus, and IEEE 69-bus benchmarks.
    Verifies power flow solution tolerances and literature loss reproducibility.
    """
    return run_all_calibrations()
