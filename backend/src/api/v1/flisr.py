from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.models.network import Feeder, Line
from backend.src.modules.flisr import (
    FaultSimulationRequest,
    FLISRSimulationReport,
    run_flisr_simulation,
)

router = APIRouter(prefix="/flisr", tags=["Fault Isolation & Service Restoration (TR-FLI)"])


@router.post(
    "/simulate-fault",
    response_model=FLISRSimulationReport,
    summary="Simulate Line Fault & Compute Isolation and Service Restoration (TR-FLI-01..05)",
    status_code=status.HTTP_200_OK,
)
def simulate_flisr_fault(
    req: FaultSimulationRequest,
    db: Session = Depends(get_db),
) -> FLISRSimulationReport:
    """
    Executes automated Fault Location, Isolation and Service Restoration (FLISR):
    1. Identifies minimal faulted section bounded by sectionalizers/breakers.
    2. Generates boundary isolation switch OPEN commands.
    3. Identifies alternate tie switches to backfeed healthy downstream customers.
    4. Validates post-restoration network via AC Newton-Raphson power flow.
    5. Calculates Customer-Minutes Interrupted (CMI) saved and SAIDI reduction.
    """
    try:
        report = run_flisr_simulation(db_session=db, req=req)
        return report
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"FLISR simulation failed: {str(e)}",
        )


@router.get(
    "/faultable-lines",
    summary="List Candidate Feeder Lines Eligible for Fault Simulation",
)
def list_faultable_lines(
    feeder_code: str = Query("2011951", description="Feeder code"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Returns lines with voltage, conductor type, and length eligible for fault simulation."""
    feeder = db.query(Feeder).filter(Feeder.code == feeder_code).first()
    if not feeder:
        feeder = db.query(Feeder).filter(Feeder.id == feeder_code).first()
    if not feeder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Feeder '{feeder_code}' not found.")

    def is_ht_line(line: Line) -> bool:
        code = line.code or ""
        cond = line.conductor_type or ""
        return not (code.startswith("LL-") or code.startswith("LC-") or "LT_" in cond)

    lines = (
        db.query(Line)
        .filter(Line.feeder_id == feeder.id)
        .order_by(Line.length_km.desc())
        .limit(60)
        .all()
    )

    return [
        {
            "id": str(l.id),
            "code": l.code,
            "is_ht": is_ht_line(l),
            "voltage_kv": 11.0 if is_ht_line(l) else 0.415,
            "conductor_type": l.conductor_type,
            "length_km": l.length_km,
            "is_operational": l.is_operational,
        }
        for l in lines
    ]
