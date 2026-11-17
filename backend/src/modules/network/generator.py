import hashlib
import json
import math
import random
from typing import Any, Dict, List

import numpy as np
import pandapower as pp
from backend.src.core.config import settings


class TelanganaSyntheticNetworkGenerator:
    """
    Seeded, reproducible synthetic network generator for Telangana-style
    33/11 kV distribution networks (TSSPDCL / TSNPDCL archetypes).

    Generates:
      - 33/11 kV Substation with 8.0 MVA Power Transformer.
      - Interconnected 11 kV feeders (Primary Feeder + Adjacent Donor Feeder).
      - Normally-open tie switches for load transfer and FLISR.
      - DTR population across standard Indian ratings (25, 63, 100, 160, 250 kVA).
      - Realistic consumer mix: Domestic, Commercial, Industrial, Agricultural.
      - 24-hour diurnal load time series with agricultural pumping block shifts.
      - Injected operational scenarios (DTR Overload, Feeder Overload, Undervoltage).
    """

    def __init__(
        self,
        seed: int = 42,
        archetype: str = "mixed",  # urban, rural_agricultural, mixed
        num_feeders: int = 2,
        dtrs_per_feeder: int = 10,
        base_latitude: float = 17.3850,   # Hyderabad / Rangareddy coordinates
        base_longitude: float = 78.4867,
    ):
        self.seed = seed
        self.archetype = archetype
        self.num_feeders = num_feeders
        self.dtrs_per_feeder = dtrs_per_feeder
        self.base_lat = base_latitude
        self.base_lon = base_longitude

        # Seeded deterministic generators
        self.rng = random.Random(seed)
        self.np_rng = np.random.RandomState(seed)

        # Load engineering defaults
        self.conductors = settings.conductors_config.get("overhead_conductors", {})
        self.electrical = settings.electrical_config.get("system", {})
        self.standard_dtr_ratings = self.electrical.get("standard_dtr_ratings_kva", [25, 63, 100, 160, 250])

    def generate(self, injected_scenario: str = "normal") -> Dict[str, Any]:
        """
        Generates full network data structure and returns a validated dictionary.
        Guaranteed byte-identical for identical seeds.
        """
        # Reset RNG state for reproducibility
        self.rng = random.Random(self.seed)
        self.np_rng = np.random.RandomState(self.seed)

        network_id = f"NET_TS_{self.seed:04d}_{self.archetype.upper()}"
        substation_code = f"SS_HYD_{self.seed:03d}"
        substation_name = f"Rangareddy 33/11kV Substation ({self.archetype.capitalize()})"

        buses = []
        lines = []
        transformers = []
        switches = []
        consumers = []
        dtrs = []

        # 1. Create Substation 33 kV slack bus and 11 kV primary bus
        sub_33kv_bus = {
            "bus_id": f"{substation_code}_BUS_33KV",
            "name": f"{substation_name} 33kV Source Bus",
            "voltage_level_kv": 33.0,
            "bus_type": "slack",
            "lat": self.base_lat,
            "lon": self.base_lon,
            "provenance": "synthetic",
        }
        sub_11kv_bus = {
            "bus_id": f"{substation_code}_BUS_11KV",
            "name": f"{substation_name} 11kV Busbar",
            "voltage_level_kv": 11.0,
            "bus_type": "pq",
            "lat": self.base_lat + 0.0002,
            "lon": self.base_lon + 0.0002,
            "provenance": "synthetic",
        }
        buses.extend([sub_33kv_bus, sub_11kv_bus])

        # 33/11 kV Power Transformer (PTR)
        ptr = {
            "ptr_id": f"{substation_code}_PTR_01",
            "name": "33/11kV 8.0MVA Power Transformer",
            "hv_bus_id": sub_33kv_bus["bus_id"],
            "lv_bus_id": sub_11kv_bus["bus_id"],
            "rated_mva": 8.0,
            "percent_z": 7.15,
            "pfe_kw": 8.5,
            "provenance": "synthetic",
        }
        transformers.append(ptr)

        feeder_roots = []
        feeders_data = []

        # 2. Build Feeders
        for f_idx in range(self.num_feeders):
            feeder_code = f"FDR_{self.seed:03d}_{f_idx + 1:02d}"
            feeder_name = (
                f"11kV Feeder {f_idx + 1} (Target Mixed Feeder)"
                if f_idx == 0
                else f"11kV Feeder {f_idx + 1} (Adjacent Donor Feeder)"
            )
            feeder_bus_ids = []
            feeder_dtr_ids = []

            # Feeder Head Circuit Breaker
            cb_bus = {
                "bus_id": f"{feeder_code}_BUS_HEAD",
                "name": f"{feeder_name} Head Bus",
                "voltage_level_kv": 11.0,
                "bus_type": "pq",
                "lat": self.base_lat + 0.001 * (f_idx + 1),
                "lon": self.base_lon + 0.001 * (f_idx + 1),
                "provenance": "synthetic",
            }
            buses.append(cb_bus)
            feeder_bus_ids.append(cb_bus["bus_id"])
            feeder_roots.append(cb_bus["bus_id"])

            # Circuit breaker switch connecting Substation 11kV to Feeder Head
            switches.append({
                "switch_id": f"CB_{feeder_code}",
                "from_bus_id": sub_11kv_bus["bus_id"],
                "to_bus_id": cb_bus["bus_id"],
                "code": f"CB_{feeder_code}",
                "switch_type": "breaker",
                "is_normally_open": False,
                "current_status": "closed",
                "is_motorized": True,
                "provenance": "synthetic",
            })

            # Create sections and DTR buses along feeder route
            prev_bus_id = cb_bus["bus_id"]
            prev_lat = cb_bus["lat"]
            prev_lon = cb_bus["lon"]

            angle = math.radians(45.0 if f_idx == 0 else 135.0)

            for d_idx in range(self.dtrs_per_feeder):
                dist_km = 0.4 + self.rng.uniform(0.1, 0.4)
                # Scenario injection: in undervoltage scenario, lengthen tail sections to induce realistic statutory voltage drop
                if injected_scenario == "undervoltage" and d_idx >= 6 and f_idx == 0:
                    dist_km = 1.6 + self.rng.uniform(0.2, 0.5)

                d_lat = prev_lat + (dist_km / 111.0) * math.cos(angle) + self.rng.uniform(-0.0005, 0.0005)
                d_lon = prev_lon + (dist_km / (111.0 * math.cos(math.radians(prev_lat)))) * math.sin(angle) + self.rng.uniform(-0.0005, 0.0005)

                bus_id = f"{feeder_code}_BUS_{d_idx + 1:02d}"
                buses.append({
                    "bus_id": bus_id,
                    "name": f"{feeder_code} Pole Bus {d_idx + 1}",
                    "voltage_level_kv": 11.0,
                    "bus_type": "pq",
                    "lat": round(d_lat, 6),
                    "lon": round(d_lon, 6),
                    "provenance": "synthetic",
                })
                feeder_bus_ids.append(bus_id)

                # Conductor: Dog on first 3 sections, Rabbit on middle, Weasel on tail
                if d_idx < 3:
                    cond_type = "ACSR_Dog"
                elif d_idx < 7:
                    cond_type = "ACSR_Rabbit"
                else:
                    cond_type = "ACSR_Weasel"

                cond_spec = self.conductors.get(cond_type, {
                    "r_ohm_per_km": 0.5426,
                    "x_ohm_per_km": 0.334,
                    "max_i_ka": 0.20,
                })

                # Line segment
                lines.append({
                    "line_id": f"LINE_{prev_bus_id}_{bus_id}",
                    "feeder_code": feeder_code,
                    "from_bus_id": prev_bus_id,
                    "to_bus_id": bus_id,
                    "conductor_type": cond_type,
                    "length_km": round(dist_km, 3),
                    "r_ohm_per_km": cond_spec["r_ohm_per_km"],
                    "x_ohm_per_km": cond_spec["x_ohm_per_km"],
                    "max_i_ka": cond_spec["max_i_ka"],
                    "is_operational": True,
                    "provenance": "synthetic",
                })

                # Sectionalizing switch every 4 DTRs
                if (d_idx + 1) % 4 == 0 and d_idx < self.dtrs_per_feeder - 1:
                    sec_sw_id = f"SEC_{feeder_code}_{d_idx + 1}"
                    switches.append({
                        "switch_id": sec_sw_id,
                        "from_bus_id": prev_bus_id,
                        "to_bus_id": bus_id,
                        "code": sec_sw_id,
                        "switch_type": "sectionalizer",
                        "is_normally_open": False,
                        "current_status": "closed",
                        "is_motorized": self.rng.choice([True, False]),
                        "provenance": "synthetic",
                    })

                # DTR at this bus
                dtr_code = f"DTR_{feeder_code}_{d_idx + 1:02d}"
                # Sample rating: weighted towards 100 kVA and 160 kVA
                dtr_rating = self.rng.choice([25, 63, 100, 100, 160, 160, 250])

                # Scenario injection: boost rating or load if scenario specified
                is_overload_target = (f_idx == 0 and d_idx == 3 and injected_scenario == "dtr_overload")
                dtr_meta = {
                    "dtr_id": dtr_code,
                    "feeder_code": feeder_code,
                    "bus_id": bus_id,
                    "code": dtr_code,
                    "name": f"{dtr_code} ({dtr_rating}kVA)",
                    "rated_kva": float(dtr_rating),
                    "percent_z": 4.5 if dtr_rating <= 100 else 5.0,
                    "no_load_loss_kw": round(0.0025 * dtr_rating, 3),
                    "full_load_loss_kw": round(0.0135 * dtr_rating, 3),
                    "is_metered": (self.rng.random() < 0.20),  # 20% AMR metered brownfield status
                    "is_overload_target": is_overload_target,
                    "lat": round(d_lat, 6),
                    "lon": round(d_lon, 6),
                    "provenance": "synthetic",
                }
                dtrs.append(dtr_meta)
                feeder_dtr_ids.append(dtr_code)

                # Generate connected consumers for this DTR
                cons_list = self._generate_consumers_for_dtr(dtr_code, dtr_rating, is_overload_target)
                consumers.extend(cons_list)

                prev_bus_id = bus_id
                prev_lat = d_lat
                prev_lon = d_lon

            feeders_data.append({
                "feeder_code": feeder_code,
                "feeder_name": feeder_name,
                "voltage_kv": 11.0,
                "buses": feeder_bus_ids,
                "dtrs": feeder_dtr_ids,
                "provenance": "synthetic",
            })

        # 3. Create Normally-Open Tie Switch between Feeder 1 and Feeder 2
        # Connect tail of Feeder 1 to mid-point or tail of Feeder 2
        f1_tail_bus = feeders_data[0]["buses"][-1]
        f2_tie_bus = feeders_data[1]["buses"][len(feeders_data[1]["buses"]) // 2]
        tie_line_id = f"TIE_LINE_{f1_tail_bus}_{f2_tie_bus}"
        tie_sw_id = "TIE_SW_01"

        lines.append({
            "line_id": tie_line_id,
            "feeder_code": "TIE",
            "from_bus_id": f1_tail_bus,
            "to_bus_id": f2_tie_bus,
            "conductor_type": "ACSR_Rabbit",
            "length_km": 0.85,
            "r_ohm_per_km": 0.5426,
            "x_ohm_per_km": 0.334,
            "max_i_ka": 0.20,
            "is_operational": False,  # Normally open
            "provenance": "synthetic",
        })

        switches.append({
            "switch_id": tie_sw_id,
            "from_bus_id": f1_tail_bus,
            "to_bus_id": f2_tie_bus,
            "code": tie_sw_id,
            "switch_type": "tie_switch",
            "is_normally_open": True,
            "current_status": "open",
            "is_motorized": True,
            "provenance": "synthetic",
        })

        # 4. Generate 24-hour diurnal load time series
        time_series = self._generate_time_series_profiles(dtrs, consumers, injected_scenario)

        # 5. Build pandapower network and verify AC convergence at peak hour (hour 19 = 19:00 peak)
        pandapower_net = self.build_pandapower_net(
            buses, lines, transformers, switches, dtrs, time_series["hourly_dtr_loads"][19]
        )
        pp.runpp(pandapower_net)

        if not pandapower_net.converged:
            raise RuntimeError(f"Generated synthetic network for seed {self.seed} failed AC power flow convergence!")

        # 6. Compute deterministic network hash
        network_summary = {
            "network_id": network_id,
            "seed": self.seed,
            "bus_count": len(buses),
            "line_count": len(lines),
            "dtr_count": len(dtrs),
            "switch_count": len(switches),
            "consumer_count": len(consumers),
            "injected_scenario": injected_scenario,
        }
        summary_str = json.dumps(network_summary, sort_keys=True)
        net_hash = hashlib.sha256(summary_str.encode("utf-8")).hexdigest()

        return {
            "network_id": network_id,
            "network_hash": net_hash,
            "seed": self.seed,
            "archetype": self.archetype,
            "injected_scenario": injected_scenario,
            "substation": {
                "code": substation_code,
                "name": substation_name,
                "nominal_kv": 33.0,
                "ptr_capacity_mva": 8.0,
                "lat": self.base_lat,
                "lon": self.base_lon,
                "provenance": "synthetic",
            },
            "feeders": feeders_data,
            "buses": buses,
            "lines": lines,
            "transformers": transformers,
            "switches": switches,
            "dtrs": dtrs,
            "consumers": consumers,
            "time_series": time_series,
            "initial_power_flow": {
                "converged": bool(pandapower_net.converged),
                "total_losses_kw": round(float(pandapower_net.res_line.pl_mw.sum() * 1000.0), 3),
                "min_voltage_pu": round(float(pandapower_net.res_bus.vm_pu.min()), 4),
                "slack_mw": round(float(pandapower_net.res_ext_grid.p_mw.sum()), 4),
            },
            "provenance": "synthetic",
        }

    def _generate_consumers_for_dtr(self, dtr_code: str, dtr_rating: float, is_overload: bool) -> List[Dict[str, Any]]:
        consumers = []
        # Total sanctioned kW targeting 60-80% of DTR kVA under normal, or 120% under overload
        target_sanctioned_kw = dtr_rating * (1.25 if is_overload else self.rng.uniform(0.65, 0.85))
        accumulated_kw = 0.0
        c_idx = 1

        while accumulated_kw < target_sanctioned_kw:
            cat_choice = self.rng.choices(
                ["domestic", "commercial", "agricultural", "industrial"],
                weights=[0.55, 0.20, 0.20, 0.05],
            )[0]

            if cat_choice == "domestic":
                sanctioned_kw = round(self.rng.choice([1.0, 1.5, 2.0, 3.0, 4.0]), 1)
                pf = 0.95
            elif cat_choice == "commercial":
                sanctioned_kw = round(self.rng.choice([3.0, 5.0, 8.0, 12.0]), 1)
                pf = 0.90
            elif cat_choice == "agricultural":
                sanctioned_kw = round(self.rng.choice([3.7, 5.5, 7.5]), 1)  # 5 HP, 7.5 HP, 10 HP pumpsets
                pf = 0.82
            else:
                sanctioned_kw = round(self.rng.choice([15.0, 25.0, 40.0]), 1)
                pf = 0.88

            consumers.append({
                "consumer_id": f"CONS_{dtr_code}_{c_idx:03d}",
                "dtr_id": dtr_code,
                "service_number": f"TS-{self.seed:03d}-{dtr_code.replace('DTR_', '')}-{c_idx:03d}",
                "category": cat_choice,
                "sanctioned_load_kw": sanctioned_kw,
                "power_factor": pf,
                "provenance": "synthetic",
            })
            accumulated_kw += sanctioned_kw
            c_idx += 1

        return consumers

    def _generate_time_series_profiles(
        self,
        dtrs: List[Dict[str, Any]],
        consumers: List[Dict[str, Any]],
        injected_scenario: str,
    ) -> Dict[str, Any]:
        """
        Generates 24 hourly load curves with category diurnal shapes and agricultural block scheduling.
        """
        hours = list(range(24))
        hourly_dtr_loads = {}

        # Standard category normalized 24h diurnal multipliers [0..1]
        domestic_curve = [
            0.25, 0.22, 0.20, 0.22, 0.35, 0.55, 0.75, 0.82, 0.70, 0.55,
            0.48, 0.45, 0.48, 0.50, 0.48, 0.52, 0.60, 0.78, 0.95, 1.00,
            0.92, 0.75, 0.50, 0.35
        ]
        commercial_curve = [
            0.10, 0.10, 0.10, 0.10, 0.12, 0.15, 0.25, 0.45, 0.75, 0.90,
            0.98, 1.00, 0.95, 0.92, 0.90, 0.88, 0.85, 0.75, 0.50, 0.30,
            0.20, 0.15, 0.12, 0.10
        ]
        # Telangana 7-hour scheduled agricultural block: night shift (01:00 to 08:00)
        agricultural_curve = [
            0.05, 0.95, 1.00, 1.00, 1.00, 1.00, 0.98, 0.90, 0.15, 0.05,
            0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05,
            0.05, 0.05, 0.05, 0.05
        ]
        industrial_curve = [
            0.60, 0.60, 0.60, 0.60, 0.65, 0.75, 0.85, 0.90, 0.95, 1.00,
            1.00, 0.98, 0.85, 0.90, 0.95, 0.98, 0.95, 0.85, 0.75, 0.70,
            0.65, 0.60, 0.60, 0.60
        ]
        # Ambient temperature profile (°C)
        ambient_temp = [
            25.5, 24.8, 24.2, 24.0, 24.5, 26.0, 28.5, 31.0, 34.2, 37.0,
            39.5, 41.2, 42.0, 42.5, 41.8, 40.5, 38.5, 36.0, 33.5, 31.0,
            29.2, 28.0, 27.0, 26.2
        ]

        # Pre-aggregate sanctioned load per DTR and category
        dtr_category_kw = {d["dtr_id"]: {"domestic": 0.0, "commercial": 0.0, "agricultural": 0.0, "industrial": 0.0} for d in dtrs}
        for c in consumers:
            dtr_category_kw[c["dtr_id"]][c["category"]] += c["sanctioned_load_kw"]

        for h in hours:
            step_loads = {}
            for d in dtrs:
                d_id = d["dtr_id"]
                cats = dtr_category_kw[d_id]
                p_kw = (
                    cats["domestic"] * domestic_curve[h]
                    + cats["commercial"] * commercial_curve[h]
                    + cats["agricultural"] * agricultural_curve[h]
                    + cats["industrial"] * industrial_curve[h]
                )

                # Apply diversity factor
                p_kw *= 0.85

                # Feeder overload scenario injection: scale up feeder 1 load during peak hours
                if injected_scenario == "feeder_overload" and "FDR_042_01" in d_id or (injected_scenario == "feeder_overload" and "_01_" in d_id):
                    if 18 <= h <= 21:
                        p_kw *= 1.75

                # Undervoltage scenario injection: extra load on tail-end DTRs
                if injected_scenario == "undervoltage" and ("_08" in d_id or "_09" in d_id or "_10" in d_id):
                    if 18 <= h <= 21:
                        p_kw *= 1.60

                # DTR overload injection during peak hours (18:00 - 21:00 or agricultural 02:00-06:00)
                if d.get("is_overload_target", False):
                    if 18 <= h <= 21:
                        p_kw = d["rated_kva"] * 1.18  # 118% loading
                    elif 2 <= h <= 6:
                        p_kw = d["rated_kva"] * 1.14  # 114% loading

                # Weighted reactive power
                q_kvar = p_kw * math.tan(math.acos(0.92))

                step_loads[d_id] = {
                    "p_kw": round(p_kw, 2),
                    "q_kvar": round(q_kvar, 2),
                    "loading_pct": round((math.sqrt(p_kw**2 + q_kvar**2) / d["rated_kva"]) * 100.0, 1),
                }

            hourly_dtr_loads[h] = step_loads

        return {
            "hours": hours,
            "ambient_temperature_c": ambient_temp,
            "hourly_dtr_loads": hourly_dtr_loads,
            "provenance": "synthetic",
        }

    def build_pandapower_net(
        self,
        buses: List[Dict[str, Any]],
        lines: List[Dict[str, Any]],
        transformers: List[Dict[str, Any]],
        switches: List[Dict[str, Any]],
        dtrs: List[Dict[str, Any]],
        load_snapshot: Dict[str, Any],
    ) -> pp.pandapowerNet:
        """
        Builds an active pandapowerNet from generated components and snapshot load values.
        """
        net = pp.create_empty_network(name=f"Telangana_Feeder_{self.seed}")
        bus_lookup = {}

        # 1. Create buses
        for b in buses:
            b_idx = pp.create_bus(
                net,
                vn_kv=b["voltage_level_kv"],
                name=b["name"],
                type="b" if b["bus_type"] == "slack" else "pq",
                geodata=(b["lon"], b["lat"]),
            )
            bus_lookup[b["bus_id"]] = b_idx

            if b["bus_type"] == "slack":
                pp.create_ext_grid(net, bus=b_idx, vm_pu=1.0, va_degree=0.0, name="Substation 33kV Slack")

        # 2. Create 33/11 kV Transformers
        for t in transformers:
            hv_b = bus_lookup[t["hv_bus_id"]]
            lv_b = bus_lookup[t["lv_bus_id"]]
            pp.create_transformer_from_parameters(
                net,
                hv_bus=hv_b,
                lv_bus=lv_b,
                sn_mva=t["rated_mva"],
                vn_hv_kv=33.0,
                vn_lv_kv=11.0,
                vkr_percent=0.85,
                vk_percent=t["percent_z"],
                pfe_kw=t["pfe_kw"],
                i0_percent=0.1,
                name=t["name"],
            )

        # 3. Create Lines
        for line_item in lines:
            from_b = bus_lookup[line_item["from_bus_id"]]
            to_b = bus_lookup[line_item["to_bus_id"]]
            pp.create_line_from_parameters(
                net,
                from_bus=from_b,
                to_bus=to_b,
                length_km=line_item["length_km"],
                r_ohm_per_km=line_item["r_ohm_per_km"],
                x_ohm_per_km=line_item["x_ohm_per_km"],
                c_nf_per_km=0.0,
                max_i_ka=line_item["max_i_ka"],
                name=line_item["line_id"],
                in_service=line_item["is_operational"],
            )

        # 4. Create Switches
        for sw in switches:
            from_b = bus_lookup[sw["from_bus_id"]]
            to_b = bus_lookup[sw["to_bus_id"]]
            pp.create_switch(
                net,
                bus=from_b,
                element=to_b,
                et="b",
                closed=(sw["current_status"] == "closed"),
                name=sw["code"],
            )

        # 5. Create DTR Loads
        for d in dtrs:
            d_id = d["dtr_id"]
            b_idx = bus_lookup[d["bus_id"]]
            load_data = load_snapshot.get(d_id, {"p_kw": 50.0, "q_kvar": 25.0})
            pp.create_load(
                net,
                bus=b_idx,
                p_mw=load_data["p_kw"] / 1000.0,
                q_mvar=load_data["q_kvar"] / 1000.0,
                name=f"LOAD_{d_id}",
            )

        net.bus["provenance"] = "synthetic"
        net.line["provenance"] = "synthetic"
        net.load["provenance"] = "synthetic"
        return net
