from typing import List, Optional
from uuid import UUID

from backend.src.core.database import get_db
from backend.src.modules.topology_ai.consistency import (
    TopologyConsistencyEngine,
    TopologyValidationResult,
)
from backend.src.modules.topology_ai.snapping import (
    CandidateConnection,
    SnappingRulesEngine,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/topology", tags=["Topology Intelligence"])


class ValidateTopologyRequest(BaseModel):
    feeder_id: Optional[UUID] = None
    topology_version_id: Optional[UUID] = None


class ApproveCandidateRequest(BaseModel):
    candidate: CandidateConnection
    approver_name: str
    conductor_type: Optional[str] = "ACSR_Weasel"


@router.post("/validate", response_model=TopologyValidationResult)
def validate_topology(
    request: ValidateTopologyRequest = ValidateTopologyRequest(),
    db: Session = Depends(get_db),
) -> TopologyValidationResult:
    """
    Execute deterministic topological consistency validation across the network.
    Checks orphan nodes, closed radial loops, disconnected DTRs, voltage mismatches,
    and undefined switch states.
    """
    engine = TopologyConsistencyEngine()
    result = engine.validate_network(
        db_session=db,
        feeder_id=request.feeder_id,
        topology_version_id=request.topology_version_id,
    )
    return result


@router.get("/candidates", response_model=List[CandidateConnection])
def get_snapping_candidates(
    feeder_id: Optional[UUID] = None,
    tolerance_meters: float = Query(
        5.0, ge=0.5, le=50.0, description="Spatial proximity threshold in meters"
    ),
    db: Session = Depends(get_db),
) -> List[CandidateConnection]:
    """
    Scan for disconnected terminals within proximity threshold and propose candidate connections.
    Strictly advisory: produces review items, never silently mutates authoritative topology.
    """
    engine = SnappingRulesEngine()
    return engine.find_snapping_candidates(
        db_session=db,
        feeder_id=feeder_id,
        tolerance_meters=tolerance_meters,
    )


@router.post("/candidates/approve")
def approve_candidate(
    request: ApproveCandidateRequest,
    db: Session = Depends(get_db),
):
    """
    Human operator approval of a candidate connection.
    Applies the connection, logs the approval in the audit diff, and updates topology.
    """
    engine = SnappingRulesEngine()
    try:
        line = engine.approve_and_apply_candidate(
            candidate=request.candidate,
            db_session=db,
            approver_name=request.approver_name,
            conductor_type=request.conductor_type or "ACSR_Weasel",
        )
        db.commit()
        return {
            "success": True,
            "message": f"Candidate connection approved and applied as line '{line.code}'.",
            "line_id": str(line.id),
            "line_code": line.code,
            "approver": request.approver_name,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to apply candidate: {str(e)}")
