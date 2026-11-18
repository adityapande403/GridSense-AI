import time
from typing import Any, Dict, List, Optional, Set

import networkx as nx
import numpy as np
import pandapower as pp
from pandapower.powerflow import LoadflowNotConverged

from backend.src.modules.physics.schemas import (
    ContingencyLineResult,
    ContingencyScreeningReport,
)


def run_n1_contingency_screening(
    net: pp.pandapowerNet,
    metadata: Optional[Dict[str, Any]] = None,
    max_lines_to_screen: Optional[int] = None,
) -> ContingencyScreeningReport:
    """
    Simulates single-contingency line outages (N-1) across the network.

    For each line outage:
      1. Isolates line (in_service = False).
      2. Graph-screens for disconnected downstream islands / unserved customer loads.
      3. Solves AC power flow on energized network to compute thermal post-contingency stress.
      4. Ranks contingencies by composite severity index.

    TR-PHY-07: Single-contingency line outage screening within 5s for 100-bus network.
    """
    t_start = time.perf_counter()
    feeder_code = metadata.get("feeder_code", "UNKNOWN") if metadata else "UNKNOWN"
    feeder_name = metadata.get("feeder_name", "Distribution Feeder") if metadata else "Distribution Feeder"

    # Base case solve
    try:
        pp.runpp(net, algorithm="nr", numba=False)
        base_loss_kw = float(net.res_line.pl_mw.sum() * 1000.0)
        base_min_v = float(net.res_bus.vm_pu.min())
        total_system_load_mw = float(net.load.p_mw.sum()) if len(net.load) > 0 else 1.0
    except Exception:
        base_loss_kw = 0.0
        base_min_v = 1.0
        total_system_load_mw = 1.0

    if total_system_load_mw <= 0:
        total_system_load_mw = 1.0

    # Build base graph representation
    slack_bus_idx = int(net.ext_grid.bus.iloc[0]) if len(net.ext_grid) > 0 else 0
    G_base = nx.Graph()
    for b_idx in net.bus.index:
        G_base.add_node(b_idx)

    for l_idx, l_row in net.line.iterrows():
        if l_row.in_service:
            G_base.add_edge(int(l_row.from_bus), int(l_row.to_bus), line_idx=l_idx)

    # Add closed switches as edges
    if len(net.switch) > 0:
        for s_idx, s_row in net.switch.iterrows():
            if s_row.closed and s_row.et == "b":
                G_base.add_edge(int(s_row.bus), int(s_row.element))

    # Determine lines to screen
    lines_to_screen = list(net.line.index)
    if max_lines_to_screen and max_lines_to_screen < len(lines_to_screen):
        lines_to_screen = lines_to_screen[:max_lines_to_screen]

    contingency_results: List[ContingencyLineResult] = []
    critical_count = 0

    for l_idx in lines_to_screen:
        l_name = net.line.name.iloc[l_idx] if hasattr(net.line, "name") and net.line.name.iloc[l_idx] else f"LINE_{l_idx}"
        from_b_idx = int(net.line.from_bus.iloc[l_idx])
        to_b_idx = int(net.line.to_bus.iloc[l_idx])
        from_code = net.bus.name.iloc[from_b_idx] if hasattr(net.bus, "name") else f"Bus_{from_b_idx}"
        to_code = net.bus.name.iloc[to_b_idx] if hasattr(net.bus, "name") else f"Bus_{to_b_idx}"

        # 1. Simulate Outage
        net.line.loc[l_idx, "in_service"] = False

        # Build modified graph
        G_outage = G_base.copy()
        if G_outage.has_edge(from_b_idx, to_b_idx):
            G_outage.remove_edge(from_b_idx, to_b_idx)

        # Find energized component connected to slack bus
        if slack_bus_idx in G_outage:
            energized_buses = nx.node_connected_component(G_outage, slack_bus_idx)
        else:
            energized_buses = set(G_outage.nodes())

        all_buses = set(G_outage.nodes())
        islanded_buses = all_buses - energized_buses

        # Calculate unserved customer load on islanded buses
        unserved_p_mw = 0.0
        islanded_bus_codes = []
        loads_to_temporarily_disable: List[int] = []

        if islanded_buses:
            for b in islanded_buses:
                b_code = net.bus.name.iloc[b] if hasattr(net.bus, "name") else f"Bus_{b}"
                islanded_bus_codes.append(b_code)

            for ld_idx, ld_row in net.load.iterrows():
                if int(ld_row.bus) in islanded_buses and ld_row.in_service:
                    unserved_p_mw += float(ld_row.p_mw)
                    loads_to_temporarily_disable.append(ld_idx)
                    net.load.loc[ld_idx, "in_service"] = False

        # 2. Run AC Power Flow on energized network
        post_converged = False
        post_max_loading = 0.0
        worst_line_code = None
        post_min_v = 1.0
        worst_bus_code = None
        overloaded_lines_count = 0
        voltage_violations_count = 0

        try:
            pp.runpp(net, algorithm="nr", numba=False)
            post_converged = True

            # Evaluate loading on in-service lines
            in_service_lines = net.res_line[net.line.in_service]
            if len(in_service_lines) > 0:
                post_max_loading = float(in_service_lines.loading_percent.max())
                worst_l_idx = in_service_lines.loading_percent.idxmax()
                worst_line_code = net.line.name.iloc[worst_l_idx] if hasattr(net.line, "name") else f"LINE_{worst_l_idx}"
                overloaded_lines_count = int((in_service_lines.loading_percent > 100.0).sum())

            # Evaluate voltage on energized buses
            energized_bus_indices = [b for b in energized_buses if b in net.res_bus.index]
            if energized_bus_indices:
                energized_res_bus = net.res_bus.loc[energized_bus_indices]
                post_min_v = float(energized_res_bus.vm_pu.min())
                worst_b_idx = energized_res_bus.vm_pu.idxmin()
                worst_bus_code = net.bus.name.iloc[worst_b_idx] if hasattr(net.bus, "name") else f"Bus_{worst_b_idx}"
                voltage_violations_count = int(
                    ((energized_res_bus.vm_pu < 0.94) | (energized_res_bus.vm_pu > 1.06)).sum()
                )

        except (LoadflowNotConverged, Exception):
            post_converged = False
            post_max_loading = 150.0  # Diverged indicates severe network stress
            post_min_v = 0.85

        # 3. Restore Network State
        net.line.loc[l_idx, "in_service"] = True
        for ld_idx in loads_to_temporarily_disable:
            net.load.loc[ld_idx, "in_service"] = True

        # 4. Compute Composite Severity Index
        # Weights: 50% Unserved Power fraction, 30% Thermal Line Stress, 20% Voltage Drop
        unserved_ratio = min(1.0, unserved_p_mw / total_system_load_mw)
        thermal_ratio = min(2.0, post_max_loading / 100.0)
        v_drop = max(0.0, 1.0 - post_min_v)
        severity = round(0.50 * unserved_ratio + 0.30 * thermal_ratio + 0.20 * v_drop, 4)

        if severity > 0.30 or unserved_p_mw > 0.05 or post_max_loading > 100.0:
            critical_count += 1

        contingency_results.append(
            ContingencyLineResult(
                contingency_id=f"N1_{l_name}",
                line_code=l_name,
                from_bus_code=from_code,
                to_bus_code=to_code,
                converged=post_converged,
                unserved_load_kw=round(unserved_p_mw * 1000.0, 3),
                unserved_load_mw=round(unserved_p_mw, 5),
                isolated_buses_count=len(islanded_bus_codes),
                isolated_buses=islanded_bus_codes[:10],
                post_contingency_max_loading_pct=round(post_max_loading, 2),
                worst_line_code=worst_line_code,
                post_contingency_min_voltage_pu=round(post_min_v, 4),
                worst_bus_code=worst_bus_code,
                overloaded_lines_count=overloaded_lines_count,
                voltage_violations_count=voltage_violations_count,
                severity_score=severity,
                rank=1,
            )
        )

    # Sort results by severity descending
    contingency_results.sort(key=lambda x: x.severity_score, reverse=True)
    for rank, res in enumerate(contingency_results, start=1):
        res.rank = rank

    exec_time_ms = round((time.perf_counter() - t_start) * 1000.0, 2)

    return ContingencyScreeningReport(
        feeder_code=feeder_code,
        feeder_name=feeder_name,
        base_case_loss_kw=round(base_loss_kw, 3),
        base_case_min_voltage_pu=round(base_min_v, 4),
        total_contingencies_evaluated=len(contingency_results),
        critical_contingencies_count=critical_count,
        results=contingency_results,
        execution_time_ms=exec_time_ms,
        provenance="physics_simulated",
    )
