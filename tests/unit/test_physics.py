import pytest
from fastapi import HTTPException

from backend.src.api.v1.physics import (
    execute_n1_screening,
    execute_power_flow,
    execute_short_circuit_screening,
    get_calibration_verification,
    list_simulation_feeders,
)
from backend.src.core.database import SessionLocal
from backend.src.modules.physics import (
    PowerFlowDivergenceError,
    build_network_from_db,
    calculate_ambient_derating,
    run_2bus_calibration,
    run_3bus_calibration,
    run_all_calibrations,
    run_ieee33_calibration,
    run_ieee69_calibration,
    run_ac_power_flow,
    run_n1_contingency_screening,
    run_short_circuit_screening,
)
from backend.src.modules.physics.schemas import (
    PowerFlowAlgorithm,
    PowerFlowRunRequest,
    ThermalLoadingStatus,
    VoltageComplianceStatus,
)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==============================================================================
# TR-PHY-06: Benchmark Calibration Tests
# ==============================================================================


def test_2bus_hand_calculated_calibration():
    """TR-PHY-06: 2-bus test matches hand calculations and active loss balance <= 10^-6 MW."""
    res = run_2bus_calibration()
    assert res["converged"] is True
    assert res["is_calibrated"] is True
    assert res["active_balance_error_mw"] <= 1e-6
    # Active power balance: Slack == Load + Line Loss
    assert abs(res["slack_p_mw"] - (res["load_p_mw"] + res["loss_p_mw"])) <= 1e-6
    assert 0.99 <= res["voltage_bus1_pu"] <= 1.0


def test_3bus_hand_calculated_calibration():
    """TR-PHY-06: 3-bus test matches radial calculations with loss balance <= 10^-6 MW."""
    res = run_3bus_calibration()
    assert res["converged"] is True
    assert res["is_calibrated"] is True
    assert res["active_balance_error_mw"] <= 1e-6
    assert res["min_voltage_pu"] < 1.0


def test_ieee33_benchmark_calibration():
    """TR-PHY-06: Reproduces IEEE 33-bus published losses of ~202.677 kW within +-0.1%."""
    res = run_ieee33_calibration()
    assert res["converged"] is True
    assert res["is_calibrated"] is True
    # Published losses ~ 202.677 kW (tolerance: within 0.1%)
    assert abs(res["calculated_losses_kw"] - 202.677) < 0.21
    assert res["loss_relative_error_pct"] <= 0.10
    # Minimum voltage ~ 0.9131 pu at bus 17 (0-indexed)
    assert abs(res["calculated_min_v_pu"] - 0.9131) < 0.001
    assert res["min_v_bus_index"] == 17


def test_ieee69_benchmark_calibration():
    """TR-PHY-06: Verifies IEEE 69-bus benchmark min voltage ~0.9092 pu at Bus 64."""
    res = run_ieee69_calibration()
    assert res["converged"] is True
    assert res["is_calibrated"] is True
    assert abs(res["calculated_min_v_pu"] - 0.9092) < 0.005
    assert res["min_v_bus_index"] == 64


def test_run_all_calibrations_suite():
    suite = run_all_calibrations()
    assert suite["all_calibrated"] is True
    assert "2bus" in suite["benchmarks"]
    assert "3bus" in suite["benchmarks"]
    assert "ieee33" in suite["benchmarks"]
    assert "ieee69" in suite["benchmarks"]


# ==============================================================================
# TR-PHY-04: Ambient Temperature Ampacity Derating (IEEE 738)
# ==============================================================================


def test_ieee738_ambient_derating():
    # At base temp 40C, derating factor == 1.0
    k_40 = calculate_ambient_derating(40.0)
    assert abs(k_40 - 1.0) < 0.001

    # At cooler temp 25C, ampacity increases (k > 1.0)
    k_25 = calculate_ambient_derating(25.0)
    assert k_25 > 1.0

    # At hotter temp 50C, ampacity decreases (k < 1.0)
    k_50 = calculate_ambient_derating(50.0)
    assert k_50 < 1.0
    # Expected sqrt((75-50)/(75-40)) = sqrt(25/35) = 0.845
    assert abs(k_50 - 0.845) < 0.01

    # Extreme high temperature >= 75C clamps safely to minimum
    k_80 = calculate_ambient_derating(80.0)
    assert k_80 == 0.10


# ==============================================================================
# TR-PHY-01 & TR-PHY-05: Ingested Feeder Power Flow (Puthiya Kadavu 2011951)
# ==============================================================================


def test_puthiya_kadavu_power_flow(db_session):
    """TR-PHY-01 & TR-PHY-05: Solves AC power flow on Puthiya Kadavu 11kV network."""
    net, metadata = build_network_from_db(
        db_session=db_session,
        feeder_code_or_id="2011951",
        ambient_temp_c=35.0,
        load_multiplier=1.0,
    )
    assert len(net.bus) >= 30
    assert len(net.line) >= 30
    assert len(net.load) == 4

    result = run_ac_power_flow(net=net, metadata=metadata)
    assert result.converged is True
    assert result.algorithm == "nr"
    assert result.total_active_load_kw > 0.0
    assert result.total_active_loss_kw > 0.0
    assert result.min_voltage_pu > 0.95
    assert result.max_voltage_pu <= 1.05

    # TR-PHY-05: Loss conservation balance check |Slack - (Load + Loss)| <= 10^-4 MW
    assert result.slack_power_balance_error_mw <= 1e-4

    # Verify bus compliance classification
    for b in result.buses:
        assert b.status in [VoltageComplianceStatus.NORMAL, VoltageComplianceStatus.WARNING, VoltageComplianceStatus.VIOLATION]

    # Verify line thermal loading classification
    for l in result.lines:
        assert l.status in [ThermalLoadingStatus.NORMAL, ThermalLoadingStatus.ELEVATED, ThermalLoadingStatus.OVERLOAD, ThermalLoadingStatus.EMERGENCY]
        assert l.loading_percent >= 0.0
        assert l.active_loss_kw >= 0.0


# ==============================================================================
# TR-PHY-01: Synthetic Archetype Feeder Power Flow (FDR_042_01)
# ==============================================================================


def test_synthetic_feeder_power_flow(db_session):
    """TR-PHY-01: Solves AC power flow on synthetic Rangareddy mixed feeder."""
    net, metadata = build_network_from_db(
        db_session=db_session,
        feeder_code_or_id="FDR_042_01",
        ambient_temp_c=40.0,
        load_multiplier=1.2,
    )
    assert len(net.bus) >= 10
    assert len(net.line) >= 10

    result = run_ac_power_flow(net=net, metadata=metadata)
    assert result.converged is True
    assert result.total_active_load_kw > 0.0
    assert result.slack_power_balance_error_mw <= 1e-4


# ==============================================================================
# TR-PHY-02: Non-Convergence Error Diagnostics
# ==============================================================================


def test_power_flow_non_convergence_handling(db_session):
    """TR-PHY-02: Severe overload causes divergence, returning explicit diagnostics."""
    net, metadata = build_network_from_db(
        db_session=db_session,
        feeder_code_or_id="2011951",
        load_multiplier=500.0,  # Massive overload causing mathematical divergence
    )

    with pytest.raises(PowerFlowDivergenceError) as exc_info:
        run_ac_power_flow(net=net, metadata=metadata, max_iteration=5)

    diagnostics = exc_info.value.diagnostics
    assert diagnostics["solver_status"] == "DIVERGED"
    assert diagnostics["feeder_code"] == "2011951"
    assert diagnostics["total_requested_p_mw"] > 10.0
    assert len(diagnostics["top_demand_buses"]) > 0


# ==============================================================================
# TR-PHY-07: Single-Contingency (N-1) Outage Screening
# ==============================================================================


def test_n1_contingency_screening(db_session):
    """TR-PHY-07: Evaluates N-1 single contingency line outages and ranks critical lines."""
    net, metadata = build_network_from_db(
        db_session=db_session,
        feeder_code_or_id="2011951",
    )
    report = run_n1_contingency_screening(net=net, metadata=metadata, max_lines_to_screen=5)
    assert report.feeder_code == "2011951"
    assert report.total_contingencies_evaluated == 5
    assert len(report.results) == 5
    assert report.results[0].rank == 1
    # Check severity ordering
    assert report.results[0].severity_score >= report.results[-1].severity_score
    # Execution time sub-5 seconds
    assert report.execution_time_ms < 5000.0


# ==============================================================================
# TR-PHY-08: Short-Circuit Fault Screening (IEC 60909)
# ==============================================================================


def test_short_circuit_screening(db_session):
    """TR-PHY-08: Calculates prospective 3-phase fault currents per IEC 60909."""
    net, metadata = build_network_from_db(
        db_session=db_session,
        feeder_code_or_id="2011951",
    )
    report = run_short_circuit_screening(net=net, db_session=db_session, metadata=metadata, fault_type="3ph")
    assert report.standard == "IEC 60909"
    assert report.fault_type == "3ph"
    assert report.max_fault_current_ka > 0.0
    assert len(report.results) > 0
    top_bus = report.results[0]
    assert top_bus.ikss_ka > 0.0
    assert top_bus.ip_ka >= top_bus.ikss_ka


# ==============================================================================
# REST API Endpoint Function Unit Tests
# ==============================================================================


def test_api_power_flow_run_endpoint(db_session):
    req = PowerFlowRunRequest(
        feeder_code="2011951",
        algorithm=PowerFlowAlgorithm.NEWTON_RAPHSON,
        load_multiplier=1.0,
        ambient_temp_c=35.0,
    )
    res = execute_power_flow(req=req, db=db_session)
    assert res.converged is True
    assert res.feeder_code == "2011951"
    assert res.min_voltage_pu > 0.90
    assert res.total_active_loss_kw > 0.0
    assert len(res.buses) > 0
    assert len(res.lines) > 0


def test_api_power_flow_divergence_returns_422(db_session):
    req = PowerFlowRunRequest(
        feeder_code="2011951",
        algorithm=PowerFlowAlgorithm.NEWTON_RAPHSON,
        load_multiplier=500.0,
    )
    with pytest.raises(HTTPException) as exc_info:
        execute_power_flow(req=req, db=db_session)
    assert exc_info.value.status_code == 422
    assert "detail" in exc_info.value.__dict__ or hasattr(exc_info.value, "detail")


def test_api_feeders_list_endpoint(db_session):
    feeders = list_simulation_feeders(db=db_session)
    assert len(feeders) >= 2
    codes = [f["code"] for f in feeders]
    assert "2011951" in codes
    assert "FDR_042_01" in codes


def test_api_calibration_endpoint():
    data = get_calibration_verification()
    assert data["all_calibrated"] is True
    assert data["benchmarks"]["ieee33"]["is_calibrated"] is True
    assert data["benchmarks"]["2bus"]["is_calibrated"] is True


def test_api_contingency_endpoint(db_session):
    report = execute_n1_screening(
        feeder_code="2011951",
        ambient_temp_c=35.0,
        load_multiplier=1.0,
        max_lines=5,
        db=db_session,
    )
    assert report.total_contingencies_evaluated == 5
    assert len(report.results) == 5


def test_api_short_circuit_endpoint(db_session):
    report = execute_short_circuit_screening(
        feeder_code="2011951",
        fault_type="3ph",
        case="max",
        db=db_session,
    )
    assert report.standard == "IEC 60909"
    assert report.max_fault_current_ka > 0.0
