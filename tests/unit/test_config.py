from backend.src.core.config import settings


def test_electrical_config_loaded():
    cfg = settings.electrical_config
    assert "system" in cfg
    assert "provenance" in cfg
    sys_cfg = cfg["system"]
    assert sys_cfg["grid_frequency_hz"] == 50.0
    assert 11.0 in sys_cfg["nominal_voltages_kv"]
    assert 100 in sys_cfg["standard_dtr_ratings_kva"]
    assert sys_cfg["voltage_limits"]["nominal_11kv"]["statutory_band_pct"] == 6.0


def test_conductors_config_loaded():
    cfg = settings.conductors_config
    assert "overhead_conductors" in cfg
    conductors = cfg["overhead_conductors"]
    assert "ACSR_Weasel" in conductors
    assert "ACSR_Rabbit" in conductors
    assert "ACSR_Dog" in conductors
    assert "ACSR_Wolf" in conductors
    assert "ACSR_Panther" in conductors

    weasel = conductors["ACSR_Weasel"]
    assert weasel["r_ohm_per_km"] > 0
    assert weasel["ampacity_amps"] == 130.0


def test_economics_config_loaded():
    cfg = settings.economics_config
    assert "valuation" in cfg
    assert "asset_costs_inr" in cfg
    valuation = cfg["valuation"]
    assert valuation["technical_loss_cost_inr_per_kwh"] == 5.50
    assert valuation["discount_rate_annual_pct"] == 10.0
    assert valuation["project_lifetime_years"] == 15

    dtr_costs = cfg["asset_costs_inr"]["distribution_transformers"]
    assert "100_kva" in dtr_costs
    assert dtr_costs["100_kva"] == 220000.0


def test_thermal_config_loaded():
    cfg = settings.thermal_config
    assert "iec_60076_7" in cfg
    iec = cfg["iec_60076_7"]
    assert iec["oil_time_constant_minutes"] == 150.0
    assert iec["winding_time_constant_minutes"] == 6.0
    assert iec["oil_exponent_x"] == 0.8
    assert iec["winding_exponent_y"] == 1.3
