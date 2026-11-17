import pytest
from fastapi import HTTPException

from backend.src.api.v1.network import get_benchmark_verification
from backend.src.modules.network.benchmarks import (
    load_ieee33_benchmark,
    load_ieee69_benchmark,
    verify_benchmark,
)


def test_ieee33_benchmark_load_and_verify():
    net = load_ieee33_benchmark()
    assert net.name is not None
    assert len(net.bus) == 33
    assert len(net.line) == 37  # 32 standard lines + 5 normally open ties

    res = verify_benchmark(net)
    assert res["converged"] is True
    assert res["benchmark_id"] == "IEEE33"
    # Published losses ~202.677 kW (tolerance: within 0.1%)
    assert abs(res["total_losses_kw"] - 202.677) < 0.20
    # Minimum voltage ~0.9131 pu at bus 17
    assert abs(res["min_voltage_pu"] - 0.9131) < 0.001
    assert res["min_voltage_bus"] == 17
    assert res["provenance"] == "synthetic"


def test_ieee69_benchmark_load_and_verify():
    net = load_ieee69_benchmark()
    assert len(net.bus) == 69
    assert len(net.line) == 73  # 68 lines + 5 ties

    res = verify_benchmark(net)
    assert res["converged"] is True
    assert res["benchmark_id"] == "IEEE69"
    # Min voltage at bus 64 (0-indexed) or bus 65 (1-indexed) ~0.9092 pu
    assert abs(res["min_voltage_pu"] - 0.9092) < 0.005
    assert res["min_voltage_bus"] == 64
    assert res["provenance"] == "synthetic"


def test_benchmark_api_endpoint():
    res33 = get_benchmark_verification("IEEE33")
    assert res33["converged"] is True
    assert res33["benchmark_id"] == "IEEE33"

    res69 = get_benchmark_verification("ieee69")
    assert res69["converged"] is True
    assert res69["benchmark_id"] == "IEEE69"

    with pytest.raises(HTTPException) as exc:
        get_benchmark_verification("IEEE999")
    assert exc.value.status_code == 404
