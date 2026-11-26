"""Unit tests for Command Centre and Regulatory Compliance (TR-UI-04, TR-SEC-02)."""

import pytest
from fastapi.testclient import TestClient
from backend.src.main import app
from backend.src.core.database import SessionLocal
from backend.src.models.audit import AuditLog

client = TestClient(app)


def test_system_overview_telemetry():
    """Verifies multi-feeder aggregated executive telemetry."""
    response = client.get("/api/v1/compliance/system-overview")
    assert response.status_code == 200
    data = response.json()

    assert data["total_feeders"] >= 1
    assert data["total_substations"] >= 1
    assert data["total_dtrs"] >= 1
    assert data["total_route_km"] > 0
    assert data["system_peak_demand_mw"] > 0
    assert data["system_technical_loss_pct"] > 0
    assert data["annual_loss_cost_inr"] > 0
    assert 0.90 <= data["worst_tail_voltage_pu"] <= 1.05
    assert isinstance(data["feeders"], list)
    assert len(data["feeders"]) >= 1

    f0 = data["feeders"][0]
    assert "code" in f0
    assert "dtr_count" in f0
    assert "route_km" in f0
    assert "peak_demand_kw" in f0
    assert "health_status" in f0


def test_calculation_audit_technical_losses():
    """Verifies TR-UI-04 transparent mathematical calculation breakdown for technical losses."""
    response = client.get("/api/v1/compliance/calculation-audit/technical_losses?feeder_code=2011951")
    assert response.status_code == 200
    data = response.json()

    assert data["metric_key"] == "technical_losses"
    assert "CEA" in data["governing_standard"]
    assert "P_{\\text{loss}}" in data["latex_formula"]
    assert len(data["step_by_step_derivation"]) >= 3
    assert data["pandapower_convergence"]["converged"] is True
    assert data["pandapower_convergence"]["iterations"] == 4


def test_calculation_audit_tail_voltage():
    """Verifies TR-UI-04 transparent mathematical calculation breakdown for statutory voltage drop."""
    response = client.get("/api/v1/compliance/calculation-audit/tail_voltage?feeder_code=2011951")
    assert response.status_code == 200
    data = response.json()

    assert data["metric_key"] == "tail_voltage"
    assert "SERC" in data["governing_standard"] or "Distribution Code" in data["governing_standard"]
    assert "Delta V" in data["latex_formula"] or "\\Delta V" in data["latex_formula"]
    assert "worst_tail_voltage_pu" in data["active_inputs"]


def test_calculation_audit_transformer_aging():
    """Verifies TR-UI-04 transparent mathematical calculation breakdown for IEC 60076-7 thermal aging."""
    response = client.get("/api/v1/compliance/calculation-audit/transformer_aging?feeder_code=2011951")
    assert response.status_code == 200
    data = response.json()

    assert data["metric_key"] == "transformer_aging"
    assert "IEC 60076-7" in data["governing_standard"]
    assert "exp" in data["latex_formula"]
    assert "critical_dtr_code" in data["active_inputs"]


def test_calculation_audit_acos_loss_valuation():
    """Verifies TR-UI-04 transparent mathematical calculation breakdown for ACoS financial valuation."""
    response = client.get("/api/v1/compliance/calculation-audit/acos_loss_valuation?feeder_code=2011951")
    assert response.status_code == 200
    data = response.json()

    assert data["metric_key"] == "acos_loss_valuation"
    assert "ACoS" in data["governing_standard"] or "Tariff" in data["governing_standard"]
    assert "Annual Loss Cost" in data["latex_formula"]
    assert data["active_inputs"]["acos_rate_inr_kwh"] == 5.50


def test_audit_trail_retrieval_and_creation():
    """Verifies TR-SEC-02 immutable cryptographic audit trail recording and tamper verification."""
    # 1. Retrieve current audit trail
    response = client.get("/api/v1/compliance/audit-trail")
    assert response.status_code == 200
    logs = response.json()
    assert isinstance(logs, list)
    assert len(logs) >= 1
    assert logs[0]["tamper_verified"] is True
    assert len(logs[0]["audit_hash"]) == 64

    # 2. Record new audit entry
    post_payload = {
        "user_identifier": "chief_regulatory_inspector",
        "action_type": "statutory_compliance_certification",
        "resource_type": "feeder_compliance",
        "feeder_code": "2011951",
        "details": {
            "statutory_status": "APPROVED_MEETS_SERC_STANDARDS",
            "inspector_id": "DISCOM-KSEB-883",
        },
    }
    create_res = client.post("/api/v1/compliance/audit-trail", json=post_payload)
    assert create_res.status_code == 200
    new_entry = create_res.json()
    assert new_entry["action_type"] == "statutory_compliance_certification"
    assert new_entry["user_identifier"] == "chief_regulatory_inspector"
    assert len(new_entry["audit_hash"]) == 64
    assert new_entry["tamper_verified"] is True


def test_regulatory_engineering_report_export_json_and_html():
    """Verifies regulatory engineering audit report export in HTML and JSON."""
    # JSON export
    json_res = client.get("/api/v1/compliance/export-report?feeder_code=2011951&format=json")
    assert json_res.status_code == 200
    report_data = json_res.json()
    assert report_data["compliance_status"] == "VALIDATED_FEASIBLE"
    assert "metrics" in report_data
    assert len(report_data["report_hash"]) == 64

    # HTML print-ready export
    html_res = client.get("/api/v1/compliance/export-report?feeder_code=2011951&format=html")
    assert html_res.status_code == 200
    assert "text/html" in html_res.headers.get("content-type", "")
    assert "Distribution Engineering Audit & Statutory Compliance Report" in html_res.text
    assert "window.print()" in html_res.text
    assert "A5 Validated Feasible" in html_res.text
