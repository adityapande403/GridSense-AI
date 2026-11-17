from typing import Any, Dict

import pandapower as pp
import pandapower.networks as pn


def load_ieee33_benchmark() -> pp.pandapowerNet:
    """
    Loads the standard IEEE 33-bus radial distribution test system (Baran & Wu, 1989).

    System Specifications:
      - Nominal Voltage: 12.66 kV
      - Base MVA: 10.0 MVA
      - Buses: 33 (1 slack bus at bus 0, 32 load buses)
      - Normally closed branches: 32 (lines 0 to 31)
      - Tie switches: 5 normally open tie lines (branches 32 to 36):
          * Line 32: Bus 7 to Bus 20 (8-21 in 1-based indexing)
          * Line 33: Bus 8 to Bus 14 (9-15 in 1-based indexing)
          * Line 34: Bus 11 to Bus 21 (12-22 in 1-based indexing)
          * Line 35: Bus 17 to Bus 32 (18-33 in 1-based indexing)
          * Line 36: Bus 24 to Bus 28 (25-29 in 1-based indexing)
      - Published Base-Case Losses: ~202.67 kW (active), ~135.14 kVAR (reactive)
      - Published Minimum Voltage: ~0.9131 p.u. (Bus 17 / Bus 18 in 1-based indexing)
    """
    net = pn.case33bw()

    # Tag all elements with synthetic provenance
    net.name = "IEEE 33-Bus Radial Distribution Benchmark (Baran & Wu, 1989)"
    net.bus["provenance"] = "synthetic"
    net.line["provenance"] = "synthetic"
    net.load["provenance"] = "synthetic"

    # Add standard SLD coordinates if not already populated for visualization
    if "geo" not in net.bus or net.bus["geo"].isnull().all():
        # Standard schematic coordinates for IEEE 33 bus layout
        # Main trunk: bus 0 to 17 along X axis
        # Branch 1: bus 1 to 21 (X=1..4, Y=1)
        # Branch 2: bus 2 to 24 (X=2..5, Y=-1)
        # Branch 3: bus 5 to 32 (X=5..7, Y=2)
        x_coords = {}
        y_coords = {}
        # Main trunk 0 to 17
        for i in range(18):
            x_coords[i] = float(i)
            y_coords[i] = 0.0
        # Lateral 1: 18 to 21 (tapped at bus 1)
        for idx, b in enumerate(range(18, 22)):
            x_coords[b] = 1.0 + (idx + 1) * 0.8
            y_coords[b] = 1.5
        # Lateral 2: 22 to 24 (tapped at bus 2)
        for idx, b in enumerate(range(22, 25)):
            x_coords[b] = 2.0 + (idx + 1) * 0.8
            y_coords[b] = -1.5
        # Lateral 3: 25 to 32 (tapped at bus 5)
        for idx, b in enumerate(range(25, 33)):
            x_coords[b] = 5.0 + (idx + 1) * 0.8
            y_coords[b] = 2.5

        net.bus_geodata = net.bus_geodata.reindex(net.bus.index)
        for b in net.bus.index:
            net.bus_geodata.loc[b, "x"] = x_coords.get(b, float(b))
            net.bus_geodata.loc[b, "y"] = y_coords.get(b, 0.0)

    # Store benchmark metadata
    net.user_data = {
        "benchmark_id": "IEEE33",
        "nominal_kv": 12.66,
        "base_mva": 10.0,
        "published_losses_kw": 202.677,
        "published_min_v_pu": 0.9131,
        "published_optimal_losses_kw": 139.55,
        "tie_lines": [32, 33, 34, 35, 36],
        "provenance": "synthetic",
    }
    return net


def load_ieee69_benchmark() -> pp.pandapowerNet:
    """
    Constructs the standard IEEE 69-bus radial distribution test system (Savic & Sreeram / Baran & Wu).

    System Specifications:
      - Nominal Voltage: 12.66 kV
      - Base MVA: 10.0 MVA
      - Buses: 69 (Bus 0 is slack bus at 12.66 kV, 68 load buses)
      - Published Base-Case Losses: ~225.00 kW
      - Published Minimum Voltage: ~0.9092 p.u. at Bus 64
      - Standard Tie Switches: 5 normally open ties:
          * 11-42 (branch 69)
          * 12-20 (branch 70)
          * 14-45 (branch 71)
          * 49-58 (branch 72)
          * 26-64 (branch 73)
    """
    net = pp.create_empty_network(name="IEEE 69-Bus Radial Distribution Benchmark")
    v_base_kv = 12.66

    # Create 69 buses
    buses = []
    for i in range(69):
        b = pp.create_bus(
            net,
            vn_kv=v_base_kv,
            name=f"BUS_{i + 1}",
            type="b" if i == 0 else "pq",
            zone="IEEE69",
        )
        buses.append(b)

    # Substation slack bus at Bus 1 (index 0)
    pp.create_ext_grid(net, bus=buses[0], vm_pu=1.0, va_degree=0.0, name="Substation Slack Grid")

    # IEEE 69-bus branch and load data: (from_bus_1indexed, to_bus_1indexed, R_ohm, X_ohm, P_kW, Q_kVAR)
    branch_load_data = [
        (1, 2, 0.0005, 0.0012, 0.0, 0.0),
        (2, 3, 0.0005, 0.0012, 0.0, 0.0),
        (3, 4, 0.0015, 0.0036, 0.0, 0.0),
        (4, 5, 0.0251, 0.0294, 0.0, 0.0),
        (5, 6, 0.3660, 0.1864, 2.6, 2.2),
        (6, 7, 0.3811, 0.1941, 40.4, 30.0),
        (7, 8, 0.0922, 0.0470, 75.0, 54.0),
        (8, 9, 0.0493, 0.0251, 30.0, 22.0),
        (9, 10, 0.8190, 0.2707, 28.0, 19.0),
        (10, 11, 0.1872, 0.0619, 145.0, 104.0),
        (11, 12, 0.7114, 0.2351, 145.0, 104.0),
        (12, 13, 1.0300, 0.3400, 8.0, 5.0),
        (13, 14, 1.0440, 0.3450, 8.0, 5.5),
        (14, 15, 1.0580, 0.3496, 0.0, 0.0),
        (15, 16, 0.1966, 0.0650, 45.5, 30.0),
        (16, 17, 0.3744, 0.1238, 60.0, 35.0),
        (17, 18, 0.0047, 0.0016, 60.0, 35.0),
        (18, 19, 0.3276, 0.1083, 0.0, 0.0),
        (19, 20, 0.2106, 0.0690, 1.0, 0.6),
        (20, 21, 0.3416, 0.1129, 114.0, 81.0),
        (21, 22, 0.0140, 0.0046, 5.0, 3.5),
        (22, 23, 0.1591, 0.0526, 0.0, 0.0),
        (23, 24, 0.2914, 0.0963, 28.0, 20.0),
        (24, 25, 0.2014, 0.0665, 0.0, 0.0),
        (25, 26, 0.4730, 0.1560, 14.0, 10.0),
        (26, 27, 0.7300, 0.2410, 14.0, 10.0),
        (3, 28, 0.0044, 0.0108, 26.0, 18.6),
        (28, 29, 0.0640, 0.1565, 26.0, 18.6),
        (29, 30, 0.3978, 0.1315, 0.0, 0.0),
        (30, 31, 0.0702, 0.0232, 0.0, 0.0),
        (31, 32, 0.3510, 0.1160, 0.0, 0.0),
        (32, 33, 0.8390, 0.2816, 14.0, 10.0),
        (33, 34, 1.7080, 0.5646, 19.5, 14.0),
        (34, 35, 1.4740, 0.4873, 6.0, 4.0),
        (3, 36, 0.0044, 0.0108, 26.0, 18.5),
        (36, 37, 0.0640, 0.1565, 26.0, 18.5),
        (37, 38, 0.1053, 0.1230, 0.0, 0.0),
        (38, 39, 0.0304, 0.0355, 24.0, 17.0),
        (39, 40, 0.0018, 0.0021, 24.0, 17.0),
        (40, 41, 0.7283, 0.8509, 1.2, 1.0),
        (41, 42, 0.3100, 0.3620, 0.0, 0.0),
        (42, 43, 0.0410, 0.0478, 6.0, 4.3),
        (43, 44, 0.0092, 0.0116, 0.0, 0.0),
        (44, 45, 0.1089, 0.1373, 39.22, 26.3),
        (45, 46, 0.0620, 0.0720, 39.22, 26.3),
        (4, 47, 0.0034, 0.0084, 0.0, 0.0),
        (47, 48, 0.0851, 0.2083, 79.0, 56.4),
        (48, 49, 0.2898, 0.7091, 384.7, 274.5),
        (49, 50, 0.0822, 0.2011, 384.7, 274.5),
        (8, 51, 0.0928, 0.0473, 40.5, 28.3),
        (51, 52, 0.3319, 0.1114, 3.6, 2.7),
        (9, 53, 0.1740, 0.0886, 4.35, 3.5),
        (53, 54, 0.2030, 0.1034, 26.4, 19.0),
        (54, 55, 0.2842, 0.1447, 24.0, 17.2),
        (55, 56, 0.2813, 0.1433, 0.0, 0.0),
        (56, 57, 1.5900, 0.5337, 0.0, 0.0),
        (57, 58, 0.7837, 0.2630, 0.0, 0.0),
        (58, 59, 0.3042, 0.1006, 0.0, 0.0),
        (59, 60, 0.3861, 0.1172, 100.0, 72.0),
        (60, 61, 0.5075, 0.2585, 0.0, 0.0),
        (61, 62, 0.0974, 0.0496, 1244.0, 888.0),
        (62, 63, 0.1450, 0.0738, 32.0, 23.0),
        (63, 64, 0.7105, 0.3619, 0.0, 0.0),
        (64, 65, 1.0410, 0.5302, 227.0, 162.0),
        (11, 66, 0.2012, 0.0611, 59.0, 42.0),
        (66, 67, 0.0047, 0.0014, 18.0, 13.0),
        (12, 68, 0.7394, 0.2444, 18.0, 13.0),
        (68, 69, 0.0047, 0.0016, 28.0, 20.0),
    ]

    for fb, tb, r_ohm, x_ohm, p_kw, q_kvar in branch_load_data:
        from_idx = buses[fb - 1]
        to_idx = buses[tb - 1]

        # Create line (using 1 km length and actual ohms)
        pp.create_line_from_parameters(
            net,
            from_bus=from_idx,
            to_bus=to_idx,
            length_km=1.0,
            r_ohm_per_km=r_ohm,
            x_ohm_per_km=x_ohm,
            c_nf_per_km=0.0,
            max_i_ka=0.40,
            name=f"LINE_{fb}_{tb}",
        )

        # Create load if load > 0
        if p_kw > 0 or q_kvar > 0:
            pp.create_load(
                net,
                bus=to_idx,
                p_mw=p_kw / 1000.0,
                q_mvar=q_kvar / 1000.0,
                name=f"LOAD_{tb}",
            )

    # 5 standard normally-open tie lines: (from_bus, to_bus, R_ohm, X_ohm)
    tie_lines_data = [
        (11, 43, 0.5, 0.5),
        (13, 21, 0.5, 0.5),
        (15, 46, 0.5, 0.5),
        (50, 59, 0.5, 0.5),
        (27, 65, 0.5, 0.5),
    ]
    for fb, tb, r_ohm, x_ohm in tie_lines_data:
        from_idx = buses[fb - 1]
        to_idx = buses[tb - 1]
        line_idx = pp.create_line_from_parameters(
            net,
            from_bus=from_idx,
            to_bus=to_idx,
            length_km=1.0,
            r_ohm_per_km=r_ohm,
            x_ohm_per_km=x_ohm,
            c_nf_per_km=0.0,
            max_i_ka=0.40,
            name=f"TIE_{fb}_{tb}",
            in_service=False,  # Normally open
        )
        pp.create_switch(
            net, bus=from_idx, element=line_idx, et="l", closed=False, name=f"SW_TIE_{fb}_{tb}"
        )

    net.bus["provenance"] = "synthetic"
    net.line["provenance"] = "synthetic"
    net.load["provenance"] = "synthetic"

    net.user_data = {
        "benchmark_id": "IEEE69",
        "nominal_kv": 12.66,
        "base_mva": 10.0,
        "published_losses_kw": 225.00,
        "published_min_v_pu": 0.9092,
        "provenance": "synthetic",
    }
    return net


def verify_benchmark(net: pp.pandapowerNet) -> Dict[str, Any]:
    """
    Solves AC power flow and verifies against published benchmark values.
    """
    pp.runpp(net)

    if not net.converged:
        return {
            "converged": False,
            "error": "AC power flow failed to converge on benchmark network.",
        }

    total_losses_mw = float(net.res_line.pl_mw.sum())
    total_losses_kw = total_losses_mw * 1000.0
    min_voltage_pu = float(net.res_bus.vm_pu.min())
    min_v_bus = int(net.res_bus.vm_pu.idxmin())
    slack_p_mw = float(net.res_ext_grid.p_mw.sum())
    total_load_mw = float(net.res_load.p_mw.sum()) if len(net.res_load) > 0 else 0.0

    meta = getattr(net, "user_data", {})
    published_losses = meta.get("published_losses_kw", 0.0)
    loss_discrepancy_pct = (
        abs(total_losses_kw - published_losses) / published_losses * 100.0
        if published_losses > 0
        else 0.0
    )

    return {
        "converged": True,
        "benchmark_id": meta.get("benchmark_id", "UNKNOWN"),
        "total_losses_kw": round(total_losses_kw, 3),
        "published_losses_kw": published_losses,
        "loss_discrepancy_pct": round(loss_discrepancy_pct, 3),
        "min_voltage_pu": round(min_voltage_pu, 4),
        "min_voltage_bus": min_v_bus,
        "slack_p_mw": round(slack_p_mw, 4),
        "total_load_mw": round(total_load_mw, 4),
        "provenance": "synthetic",
    }
