import math
import time
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple

import networkx as nx
import numpy as np
import pandapower as pp
from pandapower.powerflow import LoadflowNotConverged
from sqlalchemy.orm import Session

from backend.src.core.config import settings
from backend.src.models.network import (
    Bus,
    DistributionTransformer,
    Feeder,
    Line,
    Substation,
    Switch,
)
from backend.src.modules.physics.schemas import (
    BusPowerFlowResult,
    LinePowerFlowResult,
    PowerFlowAlgorithm,
    PowerFlowResult,
    ThermalLoadingStatus,
    TransformerPowerFlowResult,
    VoltageComplianceStatus,
)


class PowerFlowDivergenceError(Exception):
    """Raised when AC power flow fails to converge."""

    def __init__(self, message: str, diagnostics: Dict[str, Any]):
        super().__init__(message)
        self.diagnostics = diagnostics


def calculate_ambient_derating(
    ambient_temp_c: float,
    t_base_c: float = 40.0,
    t_max_c: float = 75.0,
) -> float:
    """
    Calculates the conductor thermal ampacity derating factor per IEEE Standard 738.

    Formula:
        k(T_amb) = sqrt( (T_max - T_amb) / (T_max - T_base) )
    Clamped to range [0.10, 1.30].
    """
    if ambient_temp_c >= t_max_c:
        return 0.10  # Severe thermal restriction near maximum operating temperature
    temp_ratio = (t_max_c - ambient_temp_c) / (t_max_c - t_base_c)
    if temp_ratio <= 0:
        return 0.10
    k = math.sqrt(temp_ratio)
    return max(0.10, min(1.30, k))


def build_network_from_db(
    db_session: Session,
    feeder_code_or_id: str,
    ambient_temp_c: float = 35.0,
    load_multiplier: float = 1.0,
    switch_overrides: Optional[Dict[str, str]] = None,
) -> Tuple[pp.pandapowerNet, Dict[str, Any]]:
    """
    Dynamically constructs a valid, runnable pandapower network from database tables
    for a given feeder or network group.

    Supports:
      1. Synthetic archetype feeders (e.g., FDR_042_01 with 33kV source, PTR transformer, 11kV lines).
      2. Ingested GIS networks (e.g., Puthiya Kadavu 2011951 with 11kV HT backbone and DTRs).
      3. Switch open/closed topology overrides for reconfiguration and FLISR testing.
      4. Conductor thermal derating per IEEE 738.

    Returns:
      (pandapowerNet, metadata_dict)
    """
    # 1. Fetch Feeder record safely
    feeder = db_session.query(Feeder).filter(Feeder.code == str(feeder_code_or_id)).first()
    if not feeder:
        try:
            f_uuid = uuid.UUID(str(feeder_code_or_id))
            feeder = db_session.query(Feeder).filter(Feeder.id == f_uuid).first()
        except (ValueError, AttributeError):
            pass
    if not feeder:
        raise ValueError(f"Feeder '{feeder_code_or_id}' not found in database.")

    # Conductor derating factor
    derating_factor = calculate_ambient_derating(ambient_temp_c)

    net = pp.create_empty_network(name=f"Network_{feeder.code}_{feeder.name}")
    net.sn_mva = 10.0  # Distribution standard base MVA

    bus_lookup: Dict[str, int] = {}  # db_bus_id_or_code -> pandapower bus index
    metadata: Dict[str, Any] = {
        "feeder_code": feeder.code,
        "feeder_name": feeder.name,
        "voltage_kv": feeder.voltage_kv,
        "ambient_temp_c": ambient_temp_c,
        "ampacity_derating_factor": round(derating_factor, 4),
        "load_multiplier": load_multiplier,
        "bus_code_map": {},
        "line_code_map": {},
        "trafo_code_map": {},
    }

    # 2. Fetch Buses
    buses = db_session.query(Bus).filter(Bus.feeder_id == feeder.id).all()

    # If this feeder connects to a 33kV Substation bus, fetch substation buses too
    substation = db_session.query(Substation).filter(Substation.id == feeder.substation_id).first()
    substation_buses = []
    if substation:
        substation_buses = (
            db_session.query(Bus)
            .filter(
                Bus.code.like(f"%{substation.code}%")
                | (Bus.feeder_id == feeder.id)
            )
            .all()
        )

    all_db_buses = {b.id: b for b in buses}
    for sb in substation_buses:
        all_db_buses[sb.id] = sb

    # 3. Fetch Lines
    lines = db_session.query(Line).filter(Line.feeder_id == feeder.id).all()

    # Fetch Switches related to this feeder
    feeder_bus_ids = [b.id for b in buses]
    switches = (
        db_session.query(Switch)
        .filter(
            (Switch.from_bus_id.in_(feeder_bus_ids))
            | (Switch.to_bus_id.in_(feeder_bus_ids))
        )
        .all()
    )

    # For ingested GIS network with 500+ LT lines, isolate the 11 kV HT backbone
    # unless all lines belong to a small compact circuit
    is_large_gis = len(lines) > 100
    selected_lines: List[Line] = []
    if is_large_gis:
        # Select 11 kV lines (HT backbone lines and feeder cables)
        for l in lines:
            if (
                l.code.startswith("HL-")
                or l.code.startswith("HC-")
                or l.r_ohm_per_km < 1.0
                or l.conductor_type.startswith("ACSR")
            ):
                selected_lines.append(l)
    else:
        selected_lines = lines

    # Collect participating buses
    participating_bus_ids: Set[Any] = set()
    for l in selected_lines:
        participating_bus_ids.add(l.from_bus_id)
        participating_bus_ids.add(l.to_bus_id)

    for sw in switches:
        if sw.from_bus_id in all_db_buses and sw.to_bus_id in all_db_buses:
            participating_bus_ids.add(sw.from_bus_id)
            participating_bus_ids.add(sw.to_bus_id)

    if substation:
        for sb in substation_buses:
            if "BUS_33KV" in sb.code or "BUS_11KV" in sb.code:
                participating_bus_ids.add(sb.id)

    # 4. Identify or assign Slack Bus
    slack_bus_obj: Optional[Bus] = None

    # First check if this feeder's own buses have an explicit slack bus
    for b in buses:
        if b.bus_type == "slack":
            slack_bus_obj = b
            participating_bus_ids.add(b.id)
            break

    # If this feeder connects to a substation slack bus
    if not slack_bus_obj and substation:
        for sb in substation_buses:
            if sb.bus_type == "slack" and substation.code in sb.code:
                slack_bus_obj = sb
                participating_bus_ids.add(sb.id)
                break

    # If no explicit slack bus, identify the feeder head / RMU / source bus among participating buses
    if not slack_bus_obj:
        for b_id in participating_bus_ids:
            b = all_db_buses.get(b_id)
            if b and ("RM-" in b.code or "HEAD" in b.code or "SS_" in b.code):
                slack_bus_obj = b
                break

    # If still not found, determine in-degree zero bus in HT graph
    if not slack_bus_obj and selected_lines:
        G = nx.DiGraph()
        for l in selected_lines:
            G.add_edge(l.from_bus_id, l.to_bus_id)
        roots = [n for n in G.nodes() if G.in_degree(n) == 0]
        if roots:
            slack_bus_obj = all_db_buses.get(roots[0])
        else:
            slack_bus_obj = all_db_buses.get(selected_lines[0].from_bus_id)

    # 5. Create pandapower Buses
    for b_id in participating_bus_ids:
        b = all_db_buses.get(b_id)
        if not b:
            continue
        vn_kv = b.voltage_level_kv if b.voltage_level_kv > 0.0 else 11.0
        # If part of 11kV HT backbone, ensure nominal voltage is at least 11.0 kV
        if is_large_gis and vn_kv < 1.0:
            vn_kv = 11.0

        is_slack = (slack_bus_obj is not None and b.id == slack_bus_obj.id)
        b_type = "b" if is_slack else "pq"

        pp_b_idx = pp.create_bus(
            net,
            vn_kv=vn_kv,
            name=b.code,
            type=b_type,
            zone=feeder.code,
        )
        bus_lookup[str(b.id)] = pp_b_idx
        bus_lookup[b.code] = pp_b_idx
        metadata["bus_code_map"][pp_b_idx] = b.code

        if is_slack:
            pp.create_ext_grid(
                net,
                bus=pp_b_idx,
                vm_pu=1.00,
                va_degree=0.0,
                s_sc_max_mva=250.0,
                rx_max=0.1,
                name=f"Slack_{b.code}",
            )
            metadata["slack_bus_code"] = b.code
            metadata["slack_bus_index"] = pp_b_idx

    # If Substation PTR connects 33kV slack to 11kV bus (synthetic feeder archetype)
    sub_33_bus = None
    sub_11_bus = None
    for b_id in participating_bus_ids:
        b = all_db_buses.get(b_id)
        if b and "BUS_33KV" in b.code:
            sub_33_bus = b
        elif b and "BUS_11KV" in b.code:
            sub_11_bus = b

    if sub_33_bus and sub_11_bus and str(sub_33_bus.id) in bus_lookup and str(sub_11_bus.id) in bus_lookup:
        hv_idx = bus_lookup[str(sub_33_bus.id)]
        lv_idx = bus_lookup[str(sub_11_bus.id)]
        t_idx = pp.create_transformer_from_parameters(
            net,
            hv_bus=hv_idx,
            lv_bus=lv_idx,
            sn_mva=8.0,
            vn_hv_kv=33.0,
            vn_lv_kv=11.0,
            vkr_percent=0.85,
            vk_percent=7.5,
            pfe_kw=12.0,
            i0_percent=0.1,
            name="PTR_33_11KV_8MVA",
        )
        metadata["trafo_code_map"][t_idx] = "PTR_33_11KV_8MVA"

    # 6. Create Lines
    for l in selected_lines:
        from_id_str = str(l.from_bus_id)
        to_id_str = str(l.to_bus_id)
        if from_id_str not in bus_lookup or to_id_str not in bus_lookup:
            continue

        from_idx = bus_lookup[from_id_str]
        to_idx = bus_lookup[to_id_str]
        if from_idx == to_idx:
            continue

        length_km = max(0.005, float(l.length_km))
        r_ohm = float(l.r_ohm_per_km) if l.r_ohm_per_km > 0.0 else 0.5426
        x_ohm = float(l.x_ohm_per_km) if l.x_ohm_per_km > 0.0 else 0.3340
        # Ambient temperature derated ampacity (kA)
        base_i_ka = float(l.max_i_ka) if l.max_i_ka > 0.0 else 0.20
        derated_i_ka = max(0.05, base_i_ka * derating_factor)

        line_idx = pp.create_line_from_parameters(
            net,
            from_bus=from_idx,
            to_bus=to_idx,
            length_km=length_km,
            r_ohm_per_km=r_ohm,
            x_ohm_per_km=x_ohm,
            c_nf_per_km=0.0,
            max_i_ka=derated_i_ka,
            name=l.code,
            in_service=bool(l.is_operational),
        )
        metadata["line_code_map"][line_idx] = {
            "code": l.code,
            "conductor_type": l.conductor_type,
            "length_km": length_km,
            "base_i_ka": base_i_ka,
            "derated_i_ka": round(derated_i_ka, 4),
        }

    # 7. Create Switches
    for sw in switches:
        from_id_str = str(sw.from_bus_id)
        to_id_str = str(sw.to_bus_id)
        if from_id_str in bus_lookup and to_id_str in bus_lookup:
            fb_idx = bus_lookup[from_id_str]
            tb_idx = bus_lookup[to_id_str]
            if fb_idx == tb_idx:
                continue

            # Determine operational status
            is_closed = (sw.current_status == "closed")
            if switch_overrides and sw.code in switch_overrides:
                is_closed = (switch_overrides[sw.code] == "closed")

            pp.create_switch(
                net,
                bus=fb_idx,
                element=tb_idx,
                et="b",
                closed=is_closed,
                name=sw.code,
            )

    # 8. Create DTR Loads
    dtrs = (
        db_session.query(DistributionTransformer)
        .join(Bus)
        .filter(Bus.feeder_id == feeder.id)
        .all()
    )
    power_factor = 0.92
    q_multiplier = math.tan(math.acos(power_factor))

    for d in dtrs:
        bus_id_str = str(d.bus_id)
        if bus_id_str not in bus_lookup:
            continue
        pp_b_idx = bus_lookup[bus_id_str]

        # Standard load: 60% of rated kVA at pf=0.92, scaled by load_multiplier
        rated_kva = float(d.rated_kva) if d.rated_kva > 0 else 100.0
        s_mva = (rated_kva * 0.60 * load_multiplier) / 1000.0
        p_mw = max(0.001, s_mva * power_factor)
        q_mvar = max(0.0005, p_mw * q_multiplier)

        pp.create_load(
            net,
            bus=pp_b_idx,
            p_mw=p_mw,
            q_mvar=q_mvar,
            name=f"LOAD_{d.code}",
        )

    return net, metadata


def run_ac_power_flow(
    net: pp.pandapowerNet,
    algorithm: PowerFlowAlgorithm = PowerFlowAlgorithm.NEWTON_RAPHSON,
    max_iteration: int = 50,
    tolerance_mva: float = 1e-5,
    enforce_q_limits: bool = True,
    metadata: Optional[Dict[str, Any]] = None,
) -> PowerFlowResult:
    """
    Executes standard balanced AC power flow using the Newton-Raphson solver.
    Enforces strict mathematical convergence and statutory limits accounting.

    TR-PHY-01: AC Newton-Raphson power flow.
    TR-PHY-02: Robust non-convergence error diagnostics.
    TR-PHY-03: Statutory voltage compliance bounds (0.94 - 1.06 p.u.).
    TR-PHY-04: Conductor thermal ampacity and transformer loading.
    TR-PHY-05: Technical loss accounting and conservation balance check.
    """
    t_start = time.perf_counter()
    feeder_code = metadata.get("feeder_code", "UNKNOWN") if metadata else "UNKNOWN"
    feeder_name = metadata.get("feeder_name", "Distribution Feeder") if metadata else "Distribution Feeder"

    # Pre-solve check: Ensure network has an external grid slack bus
    if len(net.ext_grid) == 0:
        raise PowerFlowDivergenceError(
            f"Feeder '{feeder_code}' has no slack bus/ext_grid defined.",
            diagnostics={
                "feeder_code": feeder_code,
                "reason": "Missing slack generator",
                "total_buses": len(net.bus),
                "total_lines": len(net.line),
            },
        )

    # Execute pandapower AC power flow
    algo_str = algorithm.value if hasattr(algorithm, "value") else str(algorithm)
    try:
        pp.runpp(
            net,
            algorithm=algo_str,
            calculate_voltage_angles=True,
            max_iteration=max_iteration,
            tolerance_mva=tolerance_mva,
            enforce_q_lims=enforce_q_limits,
            numba=False,  # High portability
        )
    except (LoadflowNotConverged, Exception) as e:
        # Non-convergence handling (TR-PHY-02)
        exec_ms = round((time.perf_counter() - t_start) * 1000.0, 2)

        # Build mismatch diagnostics
        total_p_demand = float(net.load.p_mw.sum()) if len(net.load) > 0 else 0.0
        total_q_demand = float(net.load.q_mvar.sum()) if len(net.load) > 0 else 0.0

        culprit_buses = []
        for l_idx, l_row in net.load.iterrows():
            b_idx = int(l_row.bus)
            b_name = net.bus.name.iloc[b_idx] if hasattr(net.bus, "name") else f"Bus_{b_idx}"
            culprit_buses.append({
                "bus_index": b_idx,
                "bus_name": b_name,
                "requested_p_mw": float(l_row.p_mw),
                "requested_q_mvar": float(l_row.q_mvar),
            })

        culprit_buses.sort(key=lambda x: x["requested_p_mw"], reverse=True)

        diagnostics = {
            "feeder_code": feeder_code,
            "solver_algorithm": algo_str,
            "max_iterations_reached": max_iteration,
            "error_type": type(e).__name__,
            "error_message": str(e),
            "total_requested_p_mw": round(total_p_demand, 4),
            "total_requested_q_mvar": round(total_q_demand, 4),
            "top_demand_buses": culprit_buses[:5],
            "solver_status": "DIVERGED",
            "execution_time_ms": exec_ms,
        }

        raise PowerFlowDivergenceError(
            f"AC Power Flow Newton-Raphson solver diverged for feeder '{feeder_code}' after {max_iteration} iterations: {str(e)}",
            diagnostics=diagnostics,
        )

    exec_time_ms = round((time.perf_counter() - t_start) * 1000.0, 2)

    # 1. Total loads and slack injections
    total_active_load_mw = float(net.res_load.p_mw.sum()) if len(net.res_load) > 0 else 0.0
    total_reactive_load_mvar = float(net.res_load.q_mvar.sum()) if len(net.res_load) > 0 else 0.0

    slack_active_mw = float(net.res_ext_grid.p_mw.sum()) if len(net.res_ext_grid) > 0 else 0.0
    slack_reactive_mvar = float(net.res_ext_grid.q_mvar.sum()) if len(net.res_ext_grid) > 0 else 0.0

    # 2. Total technical losses (TR-PHY-05)
    line_loss_mw = float(net.res_line.pl_mw.sum()) if len(net.res_line) > 0 else 0.0
    line_loss_mvar = float(net.res_line.ql_mvar.sum()) if len(net.res_line) > 0 else 0.0

    trafo_loss_mw = float(net.res_trafo.pl_mw.sum()) if len(net.res_trafo) > 0 else 0.0
    trafo_loss_mvar = float(net.res_trafo.ql_mvar.sum()) if len(net.res_trafo) > 0 else 0.0

    total_loss_mw = line_loss_mw + trafo_loss_mw
    total_loss_mvar = line_loss_mvar + trafo_loss_mvar

    # Loss conservation balance check: |Slack - (Load + Loss)| <= 10^-4 MW
    balance_error_mw = abs(slack_active_mw - (total_active_load_mw + total_loss_mw))
    loss_pct = (total_loss_mw / slack_active_mw * 100.0) if slack_active_mw > 0.0 else 0.0

    # 3. Process Buses (TR-PHY-03: Statutory Voltage Compliance 0.94 - 1.06 p.u.)
    v_min_statutory = 0.94
    v_max_statutory = 1.06
    v_warn_low = 0.95
    v_warn_high = 1.05

    buses_result: List[BusPowerFlowResult] = []
    min_v_pu = 999.0
    min_v_bus = ""
    max_v_pu = 0.0
    max_v_bus = ""
    voltage_violations = 0
    voltage_warnings = 0

    for idx, b_row in net.res_bus.iterrows():
        vm = float(b_row.vm_pu)
        va = float(b_row.va_degree)
        p = float(b_row.p_mw)
        q = float(b_row.q_mvar)
        b_code = net.bus.name.iloc[idx] if hasattr(net.bus, "name") and net.bus.name.iloc[idx] else f"BUS_{idx}"
        vn_kv = float(net.bus.vn_kv.iloc[idx])

        dev_pct = round((vm - 1.0) * 100.0, 3)

        if vm < v_min_statutory or vm > v_max_statutory:
            status = VoltageComplianceStatus.VIOLATION
            voltage_violations += 1
            note = f"Statutory Violation: {vm:.4f} p.u. outside [{v_min_statutory}, {v_max_statutory}]"
        elif vm < v_warn_low or vm > v_warn_high:
            status = VoltageComplianceStatus.WARNING
            voltage_warnings += 1
            note = f"Warning: {vm:.4f} p.u. approaching statutory limit"
        else:
            status = VoltageComplianceStatus.NORMAL
            note = "Compliant within ±5% statutory operating band"

        if vm < min_v_pu:
            min_v_pu = vm
            min_v_bus = b_code
        if vm > max_v_pu:
            max_v_pu = vm
            max_v_bus = b_code

        buses_result.append(
            BusPowerFlowResult(
                bus_index=int(idx),
                bus_code=b_code,
                bus_name=b_code,
                voltage_level_kv=vn_kv,
                vm_pu=round(vm, 5),
                va_degree=round(va, 3),
                p_mw=round(p, 5),
                q_mvar=round(q, 5),
                voltage_deviation_pct=dev_pct,
                status=status,
                notes=note,
            )
        )

    # 4. Process Lines (TR-PHY-04: Thermal Ampacity Loading)
    lines_result: List[LinePowerFlowResult] = []
    line_overloads = 0

    for idx, l_row in net.res_line.iterrows():
        loading = float(l_row.loading_percent)
        i_ka = float(l_row.i_ka)
        pl_mw = float(l_row.pl_mw)
        ql_mvar = float(l_row.ql_mvar)
        p_from = float(l_row.p_from_mw)
        q_from = float(l_row.q_from_mvar)
        p_to = float(l_row.p_to_mw)
        q_to = float(l_row.q_to_mvar)

        l_code = net.line.name.iloc[idx] if hasattr(net.line, "name") and net.line.name.iloc[idx] else f"LINE_{idx}"
        from_b_idx = int(net.line.from_bus.iloc[idx])
        to_b_idx = int(net.line.to_bus.iloc[idx])
        from_code = net.bus.name.iloc[from_b_idx]
        to_code = net.bus.name.iloc[to_b_idx]
        length_km = float(net.line.length_km.iloc[idx])
        max_i = float(net.line.max_i_ka.iloc[idx])

        # Classification per TR-PHY-04:
        # normal <= 80%, elevated 80-100%, overload 100-120%, emergency > 120%
        if loading > 120.0:
            l_status = ThermalLoadingStatus.EMERGENCY
            line_overloads += 1
        elif loading > 100.0:
            l_status = ThermalLoadingStatus.OVERLOAD
            line_overloads += 1
        elif loading > 80.0:
            l_status = ThermalLoadingStatus.ELEVATED
        else:
            l_status = ThermalLoadingStatus.NORMAL

        lines_result.append(
            LinePowerFlowResult(
                line_index=int(idx),
                line_code=l_code,
                from_bus_code=from_code,
                to_bus_code=to_code,
                length_km=round(length_km, 4),
                conductor_type=metadata.get("line_code_map", {}).get(idx, {}).get("conductor_type", "ACSR"),
                loading_percent=round(loading, 2),
                current_ka=round(i_ka, 4),
                max_i_ka=round(max_i, 4),
                p_from_mw=round(p_from, 5),
                q_from_mvar=round(q_from, 5),
                p_to_mw=round(p_to, 5),
                q_to_mvar=round(q_to, 5),
                active_loss_kw=round(pl_mw * 1000.0, 3),
                reactive_loss_kvar=round(ql_mvar * 1000.0, 3),
                status=l_status,
            )
        )

    # 5. Process Transformers
    trafos_result: List[TransformerPowerFlowResult] = []
    trafo_overloads = 0
    if len(net.res_trafo) > 0:
        for idx, t_row in net.res_trafo.iterrows():
            t_loading = float(t_row.loading_percent)
            t_pl = float(t_row.pl_mw)
            t_ql = float(t_row.ql_mvar)
            t_code = net.trafo.name.iloc[idx] if hasattr(net.trafo, "name") and net.trafo.name.iloc[idx] else f"TRAFO_{idx}"
            hv_b = net.bus.name.iloc[int(net.trafo.hv_bus.iloc[idx])]
            lv_b = net.bus.name.iloc[int(net.trafo.lv_bus.iloc[idx])]
            sn = float(net.trafo.sn_mva.iloc[idx])

            if t_loading > 120.0:
                t_status = ThermalLoadingStatus.EMERGENCY
                trafo_overloads += 1
            elif t_loading > 100.0:
                t_status = ThermalLoadingStatus.OVERLOAD
                trafo_overloads += 1
            elif t_loading > 80.0:
                t_status = ThermalLoadingStatus.ELEVATED
            else:
                t_status = ThermalLoadingStatus.NORMAL

            trafos_result.append(
                TransformerPowerFlowResult(
                    trafo_index=int(idx),
                    trafo_code=t_code,
                    hv_bus_code=hv_b,
                    lv_bus_code=lv_b,
                    rated_mva=sn,
                    loading_percent=round(t_loading, 2),
                    p_hv_mw=round(float(t_row.p_hv_mw), 5),
                    q_hv_mvar=round(float(t_row.q_hv_mvar), 5),
                    p_lv_mw=round(float(t_row.p_lv_mw), 5),
                    q_lv_mvar=round(float(t_row.q_lv_mvar), 5),
                    active_loss_kw=round(t_pl * 1000.0, 3),
                    reactive_loss_kvar=round(t_ql * 1000.0, 3),
                    status=t_status,
                )
            )

    return PowerFlowResult(
        feeder_code=feeder_code,
        feeder_name=feeder_name,
        converged=True,
        algorithm=algo_str,
        iterations=int(net._ppc.get("iterations", 3)) if hasattr(net, "_ppc") and net._ppc else 3,
        total_active_load_mw=round(total_active_load_mw, 5),
        total_active_load_kw=round(total_active_load_mw * 1000.0, 3),
        total_reactive_load_mvar=round(total_reactive_load_mvar, 5),
        total_reactive_load_kvar=round(total_reactive_load_mvar * 1000.0, 3),
        total_active_loss_mw=round(total_loss_mw, 6),
        total_active_loss_kw=round(total_loss_mw * 1000.0, 3),
        total_reactive_loss_mvar=round(total_loss_mvar, 6),
        total_reactive_loss_kvar=round(total_loss_mvar * 1000.0, 3),
        loss_percentage=round(loss_pct, 3),
        slack_active_power_mw=round(slack_active_mw, 5),
        slack_reactive_power_mvar=round(slack_reactive_mvar, 5),
        slack_power_balance_error_mw=round(balance_error_mw, 9),
        min_voltage_pu=round(min_v_pu, 5),
        min_voltage_bus_code=min_v_bus,
        max_voltage_pu=round(max_v_pu, 5),
        max_voltage_bus_code=max_v_bus,
        voltage_violations_count=voltage_violations,
        voltage_warnings_count=voltage_warnings,
        line_overloads_count=line_overloads,
        trafo_overloads_count=trafo_overloads,
        buses=buses_result,
        lines=lines_result,
        transformers=trafos_result,
        execution_time_ms=exec_time_ms,
        provenance="physics_simulated",
        diagnostics={
            "tolerance_mva": tolerance_mva,
            "loss_balance_compliant": bool(balance_error_mw <= 1e-4),
            "enforce_q_limits": enforce_q_limits,
        },
    )
