# Risk Register

**Project:** GridSense-AI (TISC 2026 Challenge 08)  
**Status:** Baseline (Step 0)  
**Last Updated:** 2026-11-12

---

## 1. Risk Matrix Overview

| Risk ID | Category | Description | Likelihood | Impact | Severity | Mitigation Strategy | Contingency Plan |
|---|---|---|---|---|---|---|---|
| **RSK-TEC-01** | Technical | Newton-Raphson AC power flow non-convergence on reconfigured topology during switching search | Medium | High | **HIGH** | Use robust solver initialization, fall back to flat start or runpp Newton-Raphson with tolerance stepping; reject any candidate that fails to converge as `NOT_FEASIBLE`. | Mark candidate non-viable, log diagnostic bus mismatch vector, present next best candidate from MILP top-k list. |
| **RSK-TEC-02** | Technical | MILP DistFlow linearisation error causing discrepancies with non-linear AC power flow | Medium | Medium | **MEDIUM** | Linearise reactive power and $I^2R$ term conservatively; treat MILP purely as a candidate generator and use AC power flow as the authoritative validator. | Report AC-versus-MILP discrepancy percentage in recommendation payload; filter out any candidates violating AC voltage bounds. |
| **RSK-TEC-03** | Technical | Radiality constraint violation in meshed / multi-feeder switching graph | Low | Critical | **HIGH** | Formulate spanning forest using single-commodity fictitious flow or parent-pointer formulation in Pyomo; enforce graph-theoretic cycle detection via NetworkX prior to power flow. | Abort simulation if cycle detected; flag topology error; never recommend a closed loop. |
| **RSK-TEC-04** | Technical | Solver license or installation failure with commercial MIP solvers | Low | High | **MEDIUM** | Use open-source HiGHS via Pyomo (`appsi_highs` or `highs`), which has no proprietary licensing and compiles reliably across platforms. | Fallback solver: CBC or GLPK pre-configured in environment. |
| **RSK-DAT-01** | Data | Lack of phase-identified consumer and DTR meter data in Indian distribution context | High | Medium | **MEDIUM** | Model 11 kV balanced three-phase equivalent; flag unbalance as an estimated metric with stated data basis; never pretend 3-phase split is measured. | Provide phase unbalance sensitivity slider in DTR drawer; document limitations explicitly. |
| **RSK-DAT-02** | Data | Unrealistic synthetic load profiles leading to trivial optimization solutions | Medium | Medium | **MEDIUM** | Seed realistic diurnal profiles reflecting Telangana load curves (summer heatwave peaks, nighttime agricultural pumping, commercial evening peaks). | Validate synthetic profiles against published CEA/TGERC load curve shapes. |
| **RSK-SCH-01** | Schedule | Over-engineering Tier 2 items (e.g. Graph Neural Networks, WebSockets) before Tier 1 MVP is stable | High | High | **HIGH** | Enforce strict tier gating (Part B1). No Tier 2 work allowed until the complete Part E demonstration scenario passes automated acceptance tests. | Drop GNN entirely in favor of deterministic rule + isolation forest engine if timeline compresses. |
| **RSK-DEM-01** | Demo-Day | Live execution latency or browser hang during map rendering or multi-scenario optimization | Medium | High | **HIGH** | Decouple heavy computation via FastAPI asynchronous job queue; pre-cache deterministic demonstration seeds; optimize MapLibre GeoJSON layers with vector tiling or GeoJSON source diffing. | Standby pre-computed scenario cache ready for 1-click instant playback if live compute stalls. |
| **RSK-DEM-02** | Demo-Day | Utility judges questioning numbers as "fabricated AI black-box" | High | Critical | **CRITICAL** | Strictly enforce Non-negotiable Principles A4: every number is clickable to its source calculation, provenance is visibly badged, and pitch deck metrics are labeled as illustrative targets. | Provide live inspection drawer showing exact formulas, raw matrices, and pandapower convergence outputs. |

