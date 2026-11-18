import pytest
from backend.src.core.database import SessionLocal
from backend.src.modules.switching.schemas import (
    SwitchingOptimizationRequest,
    SwitchingApprovalRequest,
)
from backend.src.modules.switching.optimizer import run_switching_optimization
from backend.src.modules.flisr.schemas import FaultSimulationRequest
from backend.src.modules.flisr.flisr_engine import run_flisr_simulation
from backend.src.api.v1.switching import approve_switching_recommendation


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_switching_optimization_kseb_feeder(db_session):
    """TR-SWT-01..07: Test network reconfiguration optimization on Puthiya Kadavu 11 kV feeder."""
    req = SwitchingOptimizationRequest(
        feeder_code="2011951",
        ambient_temp_c=35.0,
        load_multiplier=1.0,
        top_k=3,
        max_switch_operations=6,
    )
    report = run_switching_optimization(db_session, req)

    assert report.feeder_code == "2011951"
    assert report.total_switches_available >= 10
    assert len(report.candidates) > 0
    assert report.recommended_plan is not None

    # Verify A5 Taxonomy on recommended plan
    rec = report.recommended_plan
    assert rec.status in ["VALIDATED_FEASIBLE", "FEASIBLE_WITH_WARNINGS"]
    assert rec.ac_converged is True
    assert rec.radiality_preserved is True
    assert rec.isolated_buses_count == 0
    assert rec.min_voltage_pu >= 0.90
    assert rec.max_voltage_pu <= 1.06
    assert rec.total_switching_operations == 2

    # Verify Break-Before-Make Sequencing (TR-SWT-08)
    seq = rec.switching_sequence
    assert len(seq) == 2
    assert seq[0].action == "OPEN"  # BREAK FIRST
    assert seq[1].action == "CLOSE"  # MAKE SECOND
    assert "BREAK" in seq[0].safety_rule
    assert "MAKE" in seq[1].safety_rule


def test_flisr_fault_isolation_and_restoration(db_session):
    """TR-FLI-01..05: Test automated fault location, boundary isolation, and tie restoration."""
    req = FaultSimulationRequest(
        feeder_code="2011951",
        faulted_line_code="",  # Auto-selects HT line
        fault_type="3ph_short",
        ambient_temp_c=35.0,
        load_multiplier=1.0,
    )
    report = run_flisr_simulation(db_session, req)

    assert report.feeder_code == "2011951"
    assert len(report.isolation_switches_to_open) >= 1
    assert report.total_customers_affected > 0
    assert report.total_load_interrupted_kw > 0

    # Verify restoration candidates
    assert len(report.available_restoration_plans) > 0
    best_plan = report.recommended_restoration_plan
    assert best_plan is not None
    assert best_plan.ac_feasible is True
    assert best_plan.status in ["VALIDATED_FEASIBLE", "FEASIBLE_PROTECTION_UNVERIFIED", "FEASIBLE_WITH_WARNINGS"]
    assert best_plan.cmi_saved > 0
    assert best_plan.saidi_reduction_hours > 0

    # Verify restoration switching sequence includes isolation opens followed by tie close
    assert len(best_plan.switching_sequence) >= 2
    assert best_plan.switching_sequence[-1].action == "CLOSE"


def test_operator_switching_approval_audit_hash(db_session):
    """TR-SEC-02, A6: Test operator engineering approval and cryptographic audit trail."""
    req = SwitchingApprovalRequest(
        plan_id="PLAN-01",
        feeder_code="2011951",
        operator_id="OP-KSEB-8421",
        operator_role="Senior Distribution Engineer",
        engineering_justification="Load transfer approved to relieve downstream line loading during maintenance.",
        field_crew_assigned="CREW-NORTH-04",
    )
    resp = approve_switching_recommendation(req, db_session)

    assert resp.status == "APPROVED_STAGED_FOR_DISPATCH"
    assert resp.operator_id == "OP-KSEB-8421"
    assert len(resp.audit_hash) == 64  # SHA-256 hash
    assert "ADVISORY-ONLY" in resp.safety_disclaimer
