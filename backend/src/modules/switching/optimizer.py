import time
import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import networkx as nx
from sqlalchemy.orm import Session

from backend.src.models.network import Feeder, Bus, Line, Switch, DistributionTransformer
from backend.src.modules.physics.engine import build_network_from_db, run_ac_power_flow
from backend.src.modules.switching.schemas import (
    SwitchingPlanCandidate,
    SwitchOperationStep,
    SwitchingOptimizationRequest,
    SwitchingOptimizationReport,
)

ACOS_PER_KWH = 5.50  # Average Cost of Supply (₹/kWh) per TGERC tariff orders
HOURS_PER_YEAR = 8760


def run_switching_optimization(
    db_session: Session,
    req: SwitchingOptimizationRequest,
) -> SwitchingOptimizationReport:
    """
    Executes optimal distribution network sectionalizing and load switching (TR-SWT-01..09).
    
    1. Runs baseline AC Newton-Raphson power flow on current switch configuration.
    2. Identifies all sectionalizers, RMUs, and normally-open tie switches.
    3. Uses fundamental cycle analysis and spanning forest constraints to find valid radial
       reconfigurations (zero loops, zero unsupplied islands).
    4. Evaluates top candidate configurations through full AC Newton-Raphson power flow.
    5. Assigns A5 Approval Taxonomy and generates break-before-make switching sequences.
    """
    start_time = time.time()
    feeder = db_session.query(Feeder).filter(Feeder.code == req.feeder_code).first()
    if not feeder:
        feeder = db_session.query(Feeder).filter(Feeder.id == req.feeder_code).first()
    
    if not feeder:
        raise ValueError(f"Feeder with code '{req.feeder_code}' not found in database.")

    # 1. Base Configuration AC Power Flow
    base_net, base_meta = build_network_from_db(
        db_session=db_session,
        feeder_code_or_id=feeder.code,
        ambient_temp_c=req.ambient_temp_c,
        load_multiplier=req.load_multiplier,
    )
    base_pf = run_ac_power_flow(net=base_net, metadata=base_meta)
    
    base_loss_kw = round(base_pf.total_active_loss_kw, 2)
    base_min_v = round(base_pf.min_voltage_pu, 4)
    base_max_loading = round(max([l.loading_percent for l in base_pf.lines], default=0.0), 1)

    # 2. Query all switches associated with this feeder
    feeder_bus_ids = [b.id for b in db_session.query(Bus.id).filter(Bus.feeder_id == feeder.id).all()]
    all_switches = (
        db_session.query(Switch)
        .filter((Switch.from_bus_id.in_(feeder_bus_ids)) | (Switch.to_bus_id.in_(feeder_bus_ids)))
        .all()
    )
    
    motorized_count = sum(1 for s in all_switches if s.is_motorized)
    manual_count = len(all_switches) - motorized_count

    # Separate normally open tie switches vs sectionalizing switches
    tie_switches = [s for s in all_switches if s.is_normally_open or s.current_status == 'open']
    sectionalizer_switches = [s for s in all_switches if not s.is_normally_open and s.current_status == 'closed']

    # 3. Build Network Connectivity Graph for Spanning Tree / Cycle Analysis
    G = nx.Graph()
    bus_codes = {str(b.id): b.code for b in db_session.query(Bus).filter(Bus.feeder_id == feeder.id).all()}
    for b_id, b_code in bus_codes.items():
        G.add_node(b_code)

    def is_ht_line(line: Line) -> bool:
        code = line.code or ""
        cond = line.conductor_type or ""
        return not (code.startswith("LL-") or code.startswith("LC-") or "LT_" in cond)

    lines = db_session.query(Line).filter(Line.feeder_id == feeder.id).all()
    for l in lines:
        fc = bus_codes.get(str(l.from_bus_id))
        tc = bus_codes.get(str(l.to_bus_id))
        if fc and tc and fc != tc:
            G.add_edge(fc, tc, code=l.code, type="line", is_ht=is_ht_line(l))

    # 4. Generate Candidate Switching Operations
    # In Puthiya Kadavu, closing a tie switch creates a loop with the feeder trunk.
    # Opening an upstream sectionalizer restores radiality and transfers load between sections.
    candidates: List[SwitchingPlanCandidate] = []
    
    # Check if we have tie switches to explore
    if tie_switches and sectionalizer_switches:
        # Generate candidate pairs: (tie_to_close, sectionalizer_to_open)
        candidate_pairs = []
        for tie in tie_switches:
            for sec in sectionalizer_switches:
                if tie.code != sec.code:
                    candidate_pairs.append((tie, sec))
        
        # Test candidate pairs through AC Power Flow
        plan_num = 1
        tested_configs: Set[str] = set()

        for tie_sw, sec_sw in candidate_pairs:
            config_key = f"CLOSE:{tie_sw.code}_OPEN:{sec_sw.code}"
            if config_key in tested_configs:
                continue
            tested_configs.add(config_key)

            overrides = {
                tie_sw.code: "closed",
                sec_sw.code: "open",
            }

            try:
                cand_net, cand_meta = build_network_from_db(
                    db_session=db_session,
                    feeder_code_or_id=feeder.code,
                    ambient_temp_c=req.ambient_temp_c,
                    load_multiplier=req.load_multiplier,
                    switch_overrides=overrides,
                )
                
                # Check graph connectivity & radiality
                H = nx.Graph()
                for b_idx in cand_net.bus.index:
                    H.add_node(b_idx)
                for _, row in cand_net.line[cand_net.line.in_service].iterrows():
                    H.add_edge(row.from_bus, row.to_bus)
                for _, row in cand_net.switch[cand_net.switch.closed].iterrows():
                    H.add_edge(row.bus, row.element)

                # Radiality check: graph must be acyclic (a forest or tree)
                cycles = nx.cycle_basis(H)
                is_radial = (len(cycles) == 0)
                
                # Verify zero disconnected buses with active load
                load_buses = set(cand_net.load.bus.values)
                sub_bus = cand_net.ext_grid.bus.values[0] if len(cand_net.ext_grid) > 0 else 0
                connected_to_sub = set(nx.node_connected_component(H, sub_bus)) if sub_bus in H else set()
                unsupplied_loads = load_buses - connected_to_sub

                if len(unsupplied_loads) > 0 or not is_radial:
                    # Skip configurations that drop loads or create closed mesh loops
                    continue

                # Run full AC Newton-Raphson power flow (TR-SWT-06)
                cand_pf = run_ac_power_flow(net=cand_net, metadata=cand_meta)

                cand_loss_kw = round(cand_pf.total_active_loss_kw, 2)
                loss_reduction_kw = round(base_loss_kw - cand_loss_kw, 2)
                loss_reduction_pct = round((loss_reduction_kw / max(base_loss_kw, 0.01)) * 100.0, 2)
                annual_savings_inr = round(max(0.0, loss_reduction_kw) * HOURS_PER_YEAR * ACOS_PER_KWH, 2)
                
                cand_min_v = round(cand_pf.min_voltage_pu, 4)
                cand_max_v = round(cand_pf.max_voltage_pu, 4)
                cand_max_load = round(max([l.loading_percent for l in cand_pf.lines], default=0.0), 1)
                worst_line = max(cand_pf.lines, key=lambda l: l.loading_percent).line_code if cand_pf.lines else "NONE"

                # Assign Taxonomy A5 Status (TR-SWT-07)
                if cand_min_v >= 0.94 and cand_max_v <= 1.06 and cand_max_load <= 100.0:
                    status = "VALIDATED_FEASIBLE"
                    status_reason = (
                        f"AC power flow converged in {cand_pf.execution_time_ms:.1f} ms. "
                        f"Radiality strictly verified. Voltages within TGERC statutory band "
                        f"({cand_min_v} - {cand_max_v} p.u.) with zero thermal overloads."
                    )
                elif cand_min_v >= 0.90 and cand_max_load <= 100.0:
                    status = "FEASIBLE_WITH_WARNINGS"
                    status_reason = (
                        f"Feasible topology, but minimum voltage ({cand_min_v} p.u.) is in warning band (<0.94 p.u.). "
                        f"Max loading {cand_max_load}%."
                    )
                else:
                    status = "NOT_FEASIBLE"
                    status_reason = f"Constraint violation: Vmin = {cand_min_v} p.u., Max load = {cand_max_load}%."

                # Break-Before-Make Sequence Generation (TR-SWT-08)
                from_b_code = bus_codes.get(str(sec_sw.from_bus_id), "BUS-A")
                to_b_code = bus_codes.get(str(sec_sw.to_bus_id), "BUS-B")
                tie_from_code = bus_codes.get(str(tie_sw.from_bus_id), "BUS-T1")
                tie_to_code = bus_codes.get(str(tie_sw.to_bus_id), "BUS-T2")

                sequence = [
                    SwitchOperationStep(
                        sequence_order=1,
                        action="OPEN",
                        switch_code=sec_sw.code,
                        switch_type=sec_sw.switch_type,
                        is_motorized=sec_sw.is_motorized,
                        location_description=f"Sectionalizer between {from_b_code} and {to_b_code}",
                        from_bus_code=from_b_code,
                        to_bus_code=to_b_code,
                        safety_rule="BREAK FIRST: Open sectionalizer to isolate section and prevent circulating loop current.",
                    ),
                    SwitchOperationStep(
                        sequence_order=2,
                        action="CLOSE",
                        switch_code=tie_sw.code,
                        switch_type=tie_sw.switch_type,
                        is_motorized=tie_sw.is_motorized,
                        location_description=f"Tie Point between {tie_from_code} and {tie_to_code}",
                        from_bus_code=tie_from_code,
                        to_bus_code=tie_to_code,
                        safety_rule="MAKE SECOND: Close tie switch to re-energize transferred DTR cluster from alternate feeder trunk.",
                    ),
                ]

                candidate = SwitchingPlanCandidate(
                    plan_id=f"PLAN-{plan_num:02d}",
                    rank=plan_num,
                    status=status,
                    status_reason=status_reason,
                    base_loss_kw=base_loss_kw,
                    optimized_loss_kw=cand_loss_kw,
                    loss_reduction_kw=loss_reduction_kw,
                    loss_reduction_pct=loss_reduction_pct,
                    annual_cost_savings_inr=annual_savings_inr,
                    min_voltage_pu=cand_min_v,
                    min_voltage_bus_code=cand_pf.min_voltage_bus_code,
                    max_voltage_pu=cand_max_v,
                    max_line_loading_pct=cand_max_load,
                    max_loaded_line_code=worst_line,
                    radiality_preserved=is_radial,
                    isolated_buses_count=len(unsupplied_loads),
                    switches_to_open=[sec_sw.code],
                    switches_to_close=[tie_sw.code],
                    total_switching_operations=2,
                    switching_sequence=sequence,
                    solver_execution_time_ms=round(cand_pf.execution_time_ms, 1),
                    ac_converged=True,
                    provenance="calculated",
                )
                candidates.append(candidate)
                plan_num += 1

            except Exception as e:
                # Catch simulation divergence or topology error
                continue

    # Sort candidates by multi-objective score: loss reduction primary, voltage health secondary
    candidates.sort(
        key=lambda c: (
            c.status == "VALIDATED_FEASIBLE",
            c.loss_reduction_kw,
            c.min_voltage_pu,
        ),
        reverse=True,
    )

    # Re-assign ranks 1..k
    top_candidates = candidates[: req.top_k]
    for idx, c in enumerate(top_candidates, start=1):
        c.rank = idx
        c.plan_id = f"PLAN-{idx:02d}"

    recommended = top_candidates[0] if top_candidates else None

    report = SwitchingOptimizationReport(
        feeder_code=feeder.code,
        feeder_name=feeder.name,
        timestamp=datetime.utcnow().isoformat() + "Z",
        total_switches_available=len(all_switches),
        motorized_switches_count=motorized_count,
        manual_switches_count=manual_count,
        base_configuration={
            "total_active_loss_kw": base_loss_kw,
            "min_voltage_pu": base_min_v,
            "max_line_loading_pct": base_max_loading,
            "switches_open": [s.code for s in tie_switches],
            "switches_closed": [s.code for s in sectionalizer_switches],
        },
        candidates=top_candidates,
        recommended_plan=recommended,
    )
    return report
