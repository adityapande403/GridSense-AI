from sqlalchemy.orm import Session

from backend.src.api.v1.config import (
    get_conductors_configuration,
    get_economics_configuration,
    get_electrical_configuration,
    get_full_configuration,
    get_thermal_configuration,
)
from backend.src.api.v1.health import healthcheck


def test_health_endpoint(db_session: Session):
    response = healthcheck(db=db_session)
    assert response.status == "ok"
    assert response.app_name == "GridSense-AI"
    assert response.version == "0.1.0"
    assert response.database_connected is True
    assert response.tables_count >= 20


def test_config_endpoints():
    full_cfg = get_full_configuration()
    assert "electrical" in full_cfg.model_dump()
    assert "conductors" in full_cfg.model_dump()
    assert "economics" in full_cfg.model_dump()
    assert "thermal" in full_cfg.model_dump()

    elec = get_electrical_configuration()
    assert elec["system"]["grid_frequency_hz"] == 50.0

    conductors = get_conductors_configuration()
    assert "ACSR_Rabbit" in conductors["overhead_conductors"]

    econ = get_economics_configuration()
    assert econ["valuation"]["technical_loss_cost_inr_per_kwh"] == 5.50

    therm = get_thermal_configuration()
    assert therm["iec_60076_7"]["oil_time_constant_minutes"] == 150.0
