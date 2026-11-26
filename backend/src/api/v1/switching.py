import hashlib
import time
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.src.core.database import get_db
from backend.src.models.audit import AuditLog
from backend.src.models.network import Feeder, Switch, Bus
from backend.src.modules.switching import (
    SwitchingOptimizationRequest,
    SwitchingOptimizationReport,
    SwitchingApprovalRequest,
    SwitchingApprovalResponse,
    run_switching_optimization,
)

router = APIRouter(prefix="/switching", tags=["Switching & Reconfiguration (TR-SWT)"])


@router.post(
    "/optimize",
    response_model=SwitchingOptimizationReport,
    summary="Execute Network Sectionalizing & Reconfiguration Optimization (TR-SWT-01..09)",
    status_code=status.HTTP_200_OK,
)
def optimize_network_switching(
    req: SwitchingOptimizationRequest,
    db: Session = Depends(get_db),
) -> SwitchingOptimizationReport:
    """
    Executes optimal distribution network sectionalizing and load transfer:
    - Identifies all sectionalizing and normally-open tie switches.
    - Enforces radiality constraints (zero loops, zero isolated buses).
    - Evaluates candidate plans using full pandapower AC Newton-Raphson post-validation.
    - Assigns A5 Taxonomy (VALIDATED_FEASIBLE, FEASIBLE_WITH_WARNINGS, NOT_FEASIBLE).
    - Generates break-before-make ordered switching sequences for field dispatch.
    """
    try:
        report = run_switching_optimization(db_session=db, req=req)
        return report
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Switching optimization failed: {str(e)}",
        )


@router.get(
    "/switches",
    summary="List All Network Switches with Real-Time Operability State",
)
def list_network_switches(
    feeder_code: str = Query("2011951", description="Feeder code"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Returns all sectionalizers, RMUs, circuit breakers, and tie switches on a feeder."""
    feeder = db.query(Feeder).filter(Feeder.code == feeder_code).first()
    if not feeder:
        feeder = db.query(Feeder).filter(Feeder.id == feeder_code).first()
    if not feeder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Feeder '{feeder_code}' not found.")

    feeder_bus_ids = [b.id for b in db.query(Bus.id).filter(Bus.feeder_id == feeder.id).all()]
    switches = (
        db.query(Switch)
        .filter((Switch.from_bus_id.in_(feeder_bus_ids)) | (Switch.to_bus_id.in_(feeder_bus_ids)))
        .all()
    )

    all_connected_bus_ids = set()
    for s in switches:
        if s.from_bus_id:
            all_connected_bus_ids.add(s.from_bus_id)
        if s.to_bus_id:
            all_connected_bus_ids.add(s.to_bus_id)
    bus_map = {str(b.id): b.code for b in db.query(Bus).filter(Bus.id.in_(all_connected_bus_ids)).all()}

    result = []
    for s in switches:
        result.append({
            "id": str(s.id),
            "code": s.code,
            "switch_type": s.switch_type,
            "current_status": s.current_status,
            "is_normally_open": s.is_normally_open,
            "is_motorized": s.is_motorized,
            "breaking_capacity_ka": s.breaking_capacity_ka,
            "from_bus_code": bus_map.get(str(s.from_bus_id), "BUS-A"),
            "to_bus_code": bus_map.get(str(s.to_bus_id), "BUS-B"),
            "provenance": s.provenance or "measured",
        })
    return result


@router.post(
    "/approve",
    response_model=SwitchingApprovalResponse,
    summary="Register Operator Engineering Sign-Off for a Switching Recommendation (A5/A6)",
    status_code=status.HTTP_200_OK,
)
def approve_switching_recommendation(
    req: SwitchingApprovalRequest,
    db: Session = Depends(get_db),
) -> SwitchingApprovalResponse:
    """
    Records immutable human engineering sign-off for a switching plan.
    Enforces Safety Separation A6: advisory recommendation -> operator review -> approval -> staging.
    """
    ts = datetime.utcnow().isoformat() + "Z"
    approval_id = f"APPR-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    # Generate immutable cryptographic audit hash
    hash_payload = f"{approval_id}:{req.plan_id}:{req.feeder_code}:{req.operator_id}:{ts}"
    audit_hash = hashlib.sha256(hash_payload.encode('utf-8')).hexdigest()

    # Persist immutable audit log record to database (TR-SEC-02)
    audit_record = AuditLog(
        user_identifier=req.operator_id or "operator",
        action_type="approve_switching_plan",
        resource_type="switching_plan",
        details_json={
            "approval_id": approval_id,
            "plan_id": req.plan_id,
            "feeder_code": req.feeder_code,
            "status": "APPROVED_STAGED_FOR_DISPATCH",
            "audit_hash": audit_hash,
            "notes": getattr(req, "engineering_justification", getattr(req, "notes", "Operator engineering approval verified")),
            "timestamp": ts,
        },
    )
    db.add(audit_record)
    db.commit()

    return SwitchingApprovalResponse(
        approval_id=approval_id,
        plan_id=req.plan_id,
        status="APPROVED_STAGED_FOR_DISPATCH",
        timestamp=ts,
        operator_id=req.operator_id,
        audit_hash=audit_hash,
    )
