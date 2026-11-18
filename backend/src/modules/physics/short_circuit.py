import math
import time
from typing import Any, Dict, List, Optional

import pandapower as pp
import pandapower.shortcircuit as sc
from sqlalchemy.orm import Session

from backend.src.models.network import Switch
from backend.src.modules.physics.schemas import (
    ShortCircuitBusResult,
    ShortCircuitScreeningReport,
)


def run_short_circuit_screening(
    net: pp.pandapowerNet,
    db_session: Optional[Session] = None,
    metadata: Optional[Dict[str, Any]] = None,
    fault_type: str = "3ph",
    case: str = "max",
) -> ShortCircuitScreeningReport:
    """
    Executes standard short-circuit current calculations according to IEC 60909.

    Calculates:
      - Symmetrical initial short-circuit current (Ik'' in kA)
      - Peak short-circuit current (Ip in kA)
      - Short-circuit apparent power (Sk'' in MVA)

    Validates prospective fault currents against switchgear breaking capacity.
    TR-PHY-08: IEC 60909 Short-circuit screening.
    """
    t_start = time.perf_counter()
    feeder_code = metadata.get("feeder_code", "UNKNOWN") if metadata else "UNKNOWN"

    # Pre-check: Ensure ext_grid has s_sc_max_mva defined
    if len(net.ext_grid) > 0:
        for idx in net.ext_grid.index:
            if "s_sc_max_mva" not in net.ext_grid.columns or net.ext_grid.loc[idx, "s_sc_max_mva"] <= 0:
                net.ext_grid.loc[idx, "s_sc_max_mva"] = 250.0
            if "rx_max" not in net.ext_grid.columns or net.ext_grid.loc[idx, "rx_max"] <= 0:
                net.ext_grid.loc[idx, "rx_max"] = 0.1

    # Fetch switchgear breaking capacities from database if session is provided
    switch_capacities: Dict[str, float] = {}
    switch_bus_map: Dict[str, List[str]] = {}
    if db_session:
        switches = db_session.query(Switch).all()
        for sw in switches:
            cap = float(sw.breaking_capacity_ka) if sw.breaking_capacity_ka > 0 else 12.5
            from_code = sw.from_bus.code if sw.from_bus else ""
            to_code = sw.to_bus.code if sw.to_bus else ""
            for b_code in [from_code, to_code]:
                if b_code:
                    if b_code not in switch_capacities or cap < switch_capacities[b_code]:
                        switch_capacities[b_code] = cap
                    if b_code not in switch_bus_map:
                        switch_bus_map[b_code] = []
                    switch_bus_map[b_code].append(sw.code)

    # Execute IEC 60909 short-circuit calculation
    sc.calc_sc(
        net,
        case=case,
        fault=fault_type,
        ip=True,
        ith=False,
        tk_s=1.0,
    )

    results: List[ShortCircuitBusResult] = []
    overdutied_count = 0
    max_fault_ka = 0.0
    max_fault_bus = ""

    for idx, b_row in net.bus.iterrows():
        b_code = b_row.get("name", f"BUS_{idx}")
        vn_kv = float(b_row.get("vn_kv", 11.0))

        # Check if short-circuit results are populated for this bus
        if idx in net.res_bus_sc.index:
            raw_ikss = float(net.res_bus_sc.loc[idx, "ikss_ka"])
            ikss = 0.0 if (math.isnan(raw_ikss) or math.isinf(raw_ikss)) else raw_ikss

            raw_ip = float(net.res_bus_sc.loc[idx, "ip_ka"]) if "ip_ka" in net.res_bus_sc.columns else ikss * 2.5
            ip = 0.0 if (math.isnan(raw_ip) or math.isinf(raw_ip)) else raw_ip

            raw_skss = float(net.res_bus_sc.loc[idx, "skss_mw"]) if "skss_mw" in net.res_bus_sc.columns else (ikss * vn_kv * 1.732)
            skss = 0.0 if (math.isnan(raw_skss) or math.isinf(raw_skss)) else raw_skss
        else:
            ikss = 0.0
            ip = 0.0
            skss = 0.0

        if ikss > max_fault_ka:
            max_fault_ka = ikss
            max_fault_bus = b_code

        # Breaking capacity check
        breaking_cap = switch_capacities.get(b_code, 12.5 if vn_kv <= 11.0 else 25.0)
        connected_sws = switch_bus_map.get(b_code, [])
        is_overdutied = (ikss > breaking_cap)
        if is_overdutied and connected_sws:
            overdutied_count += 1

        results.append(
            ShortCircuitBusResult(
                bus_code=b_code,
                bus_name=b_code,
                voltage_level_kv=vn_kv,
                ikss_ka=round(ikss, 3),
                ip_ka=round(ip, 3),
                skss_mva=round(skss, 2),
                max_switchgear_breaking_capacity_ka=breaking_cap if connected_sws else None,
                is_overdutied=is_overdutied and bool(connected_sws),
                connected_switches=connected_sws,
            )
        )

    results.sort(key=lambda x: x.ikss_ka, reverse=True)
    exec_time_ms = round((time.perf_counter() - t_start) * 1000.0, 2)

    return ShortCircuitScreeningReport(
        feeder_code=feeder_code,
        standard="IEC 60909",
        fault_type=fault_type,
        results=results,
        overdutied_buses_count=overdutied_count,
        max_fault_current_ka=round(max_fault_ka, 3),
        max_fault_bus_code=max_fault_bus,
        execution_time_ms=exec_time_ms,
        provenance="physics_simulated",
    )
