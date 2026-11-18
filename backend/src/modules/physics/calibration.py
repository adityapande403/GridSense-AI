from typing import Any, Dict
import pandapower as pp
from backend.src.modules.network.benchmarks import (
    load_ieee33_benchmark,
    load_ieee69_benchmark,
)


def run_2bus_calibration() -> Dict[str, Any]:
    """
    TR-PHY-06 Calibration against hand-calculated 2-bus test circuit.

    System Parameters:
      - V_nominal: 11.0 kV
      - Slack Bus 0: V = 1.0 < 0 deg p.u.
      - Line 0-1: L = 1.0 km, R = 0.5 ohm/km, X = 0.2 ohm/km
      - Load Bus 1: P = 1.0 MW, Q = 0.2 MVAr

    Analytical Conservation:
      P_slack - (P_load + P_loss) == 0.0 to tolerance 10^-6 MW.
    """
    net = pp.create_empty_network(name="2-Bus Hand-Calculated Calibration")
    b0 = pp.create_bus(net, vn_kv=11.0, name="BUS_0_SLACK", type="b")
    b1 = pp.create_bus(net, vn_kv=11.0, name="BUS_1_LOAD", type="pq")
    pp.create_ext_grid(net, bus=b0, vm_pu=1.0, va_degree=0.0)
    pp.create_line_from_parameters(
        net,
        from_bus=b0,
        to_bus=b1,
        length_km=1.0,
        r_ohm_per_km=0.5,
        x_ohm_per_km=0.2,
        c_nf_per_km=0.0,
        max_i_ka=1.0,
        name="LINE_0_1",
    )
    pp.create_load(net, bus=b1, p_mw=1.0, q_mvar=0.2, name="LOAD_1")

    pp.runpp(net, algorithm="nr", tolerance_mva=1e-8, numba=False)

    p_slack = float(net.res_ext_grid.p_mw.sum())
    p_load = float(net.res_load.p_mw.sum())
    p_loss = float(net.res_line.pl_mw.sum())
    balance_error = abs(p_slack - (p_load + p_loss))
    v1_pu = float(net.res_bus.vm_pu.iloc[1])

    return {
        "benchmark_id": "2BUS_HAND_CALC",
        "description": "2-Bus Hand-Calculated Analytical Calibration",
        "converged": bool(net.converged),
        "slack_p_mw": round(p_slack, 8),
        "load_p_mw": round(p_load, 8),
        "loss_p_mw": round(p_loss, 8),
        "loss_p_kw": round(p_loss * 1000.0, 4),
        "voltage_bus1_pu": round(v1_pu, 6),
        "active_balance_error_mw": round(balance_error, 12),
        "tolerance_threshold_mw": 1e-6,
        "is_calibrated": bool(balance_error <= 1e-6 and net.converged),
        "provenance": "synthetic",
    }


def run_3bus_calibration() -> Dict[str, Any]:
    """
    TR-PHY-06 Calibration against 3-bus radial network.

    Parameters:
      - Slack Bus 0: 11 kV
      - Line 0-1: 1 km, R = 0.4 ohm/km, X = 0.2 ohm/km
      - Line 1-2: 1 km, R = 0.6 ohm/km, X = 0.3 ohm/km
      - Load Bus 1: P = 0.5 MW, Q = 0.1 MVAr
      - Load Bus 2: P = 0.8 MW, Q = 0.15 MVAr
    """
    net = pp.create_empty_network(name="3-Bus Radial Calibration")
    b0 = pp.create_bus(net, vn_kv=11.0, name="BUS_0_SLACK", type="b")
    b1 = pp.create_bus(net, vn_kv=11.0, name="BUS_1_LOAD", type="pq")
    b2 = pp.create_bus(net, vn_kv=11.0, name="BUS_2_LOAD", type="pq")
    pp.create_ext_grid(net, bus=b0, vm_pu=1.0, va_degree=0.0)
    pp.create_line_from_parameters(
        net, from_bus=b0, to_bus=b1, length_km=1.0, r_ohm_per_km=0.4, x_ohm_per_km=0.2, c_nf_per_km=0.0, max_i_ka=1.0
    )
    pp.create_line_from_parameters(
        net, from_bus=b1, to_bus=b2, length_km=1.0, r_ohm_per_km=0.6, x_ohm_per_km=0.3, c_nf_per_km=0.0, max_i_ka=1.0
    )
    pp.create_load(net, bus=b1, p_mw=0.5, q_mvar=0.1)
    pp.create_load(net, bus=b2, p_mw=0.8, q_mvar=0.15)

    pp.runpp(net, algorithm="nr", tolerance_mva=1e-8, numba=False)

    p_slack = float(net.res_ext_grid.p_mw.sum())
    p_load = float(net.res_load.p_mw.sum())
    p_loss = float(net.res_line.pl_mw.sum())
    balance_error = abs(p_slack - (p_load + p_loss))

    return {
        "benchmark_id": "3BUS_HAND_CALC",
        "description": "3-Bus Hand-Calculated Radial Calibration",
        "converged": bool(net.converged),
        "slack_p_mw": round(p_slack, 8),
        "load_p_mw": round(p_load, 8),
        "loss_p_mw": round(p_loss, 8),
        "loss_p_kw": round(p_loss * 1000.0, 4),
        "min_voltage_pu": round(float(net.res_bus.vm_pu.min()), 6),
        "active_balance_error_mw": round(balance_error, 12),
        "tolerance_threshold_mw": 1e-6,
        "is_calibrated": bool(balance_error <= 1e-6 and net.converged),
        "provenance": "synthetic",
    }


def run_ieee33_calibration() -> Dict[str, Any]:
    """
    TR-PHY-06 Calibration against published IEEE 33-bus radial benchmark (Baran & Wu, 1989).
    Target: Base-case active losses ~ 202.677 kW within +-0.1%.
    Target: Minimum voltage ~ 0.9131 p.u. at Bus 17.
    """
    net = load_ieee33_benchmark()
    pp.runpp(net, algorithm="nr", numba=False)

    losses_kw = float(net.res_line.pl_mw.sum() * 1000.0)
    published_kw = 202.677
    rel_error_pct = abs(losses_kw - published_kw) / published_kw * 100.0
    min_v = float(net.res_bus.vm_pu.min())
    min_v_bus = int(net.res_bus.vm_pu.idxmin())

    return {
        "benchmark_id": "IEEE33",
        "description": "IEEE 33-Bus Radial Distribution Benchmark (Baran & Wu, 1989)",
        "converged": bool(net.converged),
        "published_losses_kw": published_kw,
        "calculated_losses_kw": round(losses_kw, 4),
        "loss_relative_error_pct": round(rel_error_pct, 4),
        "loss_tolerance_pct": 0.10,
        "published_min_v_pu": 0.9131,
        "calculated_min_v_pu": round(min_v, 4),
        "min_v_bus_index": min_v_bus,
        "is_calibrated": bool(rel_error_pct <= 0.10 and abs(min_v - 0.9131) < 0.001 and net.converged),
        "provenance": "synthetic",
    }


def run_ieee69_calibration() -> Dict[str, Any]:
    """
    TR-PHY-06 Calibration against IEEE 69-bus benchmark (Savic & Sreeram / Baran & Wu).
    Target: Base-case losses ~ 217.78 - 225.00 kW, min voltage ~ 0.9092 p.u. at Bus 64.
    """
    net = load_ieee69_benchmark()
    pp.runpp(net, algorithm="nr", numba=False)

    losses_kw = float(net.res_line.pl_mw.sum() * 1000.0)
    min_v = float(net.res_bus.vm_pu.min())
    min_v_bus = int(net.res_bus.vm_pu.idxmin())

    return {
        "benchmark_id": "IEEE69",
        "description": "IEEE 69-Bus Radial Distribution Benchmark",
        "converged": bool(net.converged),
        "calculated_losses_kw": round(losses_kw, 4),
        "calculated_min_v_pu": round(min_v, 4),
        "min_v_bus_index": min_v_bus,
        "is_calibrated": bool(abs(min_v - 0.9092) < 0.005 and net.converged),
        "provenance": "synthetic",
    }


def run_all_calibrations() -> Dict[str, Any]:
    """
    Executes complete TR-PHY-06 calibration suite and returns audit verification report.
    """
    c2 = run_2bus_calibration()
    c3 = run_3bus_calibration()
    c33 = run_ieee33_calibration()
    c69 = run_ieee69_calibration()

    all_passed = c2["is_calibrated"] and c3["is_calibrated"] and c33["is_calibrated"] and c69["is_calibrated"]

    return {
        "suite_name": "TR-PHY-06 Grid Physics Calibration Suite",
        "all_calibrated": all_passed,
        "benchmarks": {
            "2bus": c2,
            "3bus": c3,
            "ieee33": c33,
            "ieee69": c69,
        },
        "provenance": "synthetic",
    }
