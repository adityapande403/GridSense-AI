# Requirements & Pitch-Deck Traceability Matrix

**Project:** GridSense-AI (TISC 2026 Challenge 08)  
**Status:** Baseline (Step 0)  
**Last Updated:** 2026-11-12

---

## 1. Mapping Official Asks to Architecture & Tests

| Challenge 08 Official Ask | Target Engine | Architectural Module | Milestones | Primary Verification / Acceptance Test |
|---|---|---|---|---|
| **Ask 1: Feeder-network mapping and modelling** | C-Engine 1, 2, 4 | `network`, `ingest`, `topology_ai`, `estimation` | M1 (PASSED), M2 (PASSED), M3 (PASSED), M4 | Roundtrip import/export test; synthetic consistency check (orphan nodes, loops, disconnected DTRs caught); MapLibre SLD rendering with provenance badges. |
| **Ask 2: Evaluates sectionalising and load-switching options** | C-Engine 5, 7 | `switching`, `flisr`, `physics`, `scenarios` | M5, M8, M10 | IEEE 33-bus reconfiguration loss reduction benchmark (~202.7 kW -> ~139.5 kW); top-k MILP candidate generation with mandatory AC power-flow re-validation and A5 taxonomy assignment. |
| **Ask 3: Identifies overloaded assets** | C-Engine 3, 4 | `physics`, `thermal`, `forecast`, `alerts` | M5, M6, M7 | AC power flow transformer and line ampacity checks; IEC 60076-7 dynamic hot-spot and loss-of-life thermal stress calculation; 4-24h predictive overload alert test. |
| **Ask 4: Ranks where additional DTRs, feeder bifurcation or conductor upgrades are needed** | C-Engine 6 | `capex` | M9, M11 | Hand-verifiable multi-criteria ranking model; cluster-weighted DTR siting; line segment loss-reduction-per-rupee ranking; bifurcation split-point graph analysis. |
| **Ask 5: Evidence-based investment prioritization** | C-Engine 6, 7 | `capex`, `scenarios` | M9, M10, M11 | Financial NPV, Payback period, and Loss Abatement Index calculations; interactive sensitivity tornado analysis (CAPEX, loss cost ₹/kWh, discount rate). |

---

## 2. Mapping Pitch-Deck Promises to Reality & Implementations

| Pitch Deck Claim | Engine & Implementation | Status / Scope in GridSense-AI | Verification Gate |
|---|---|---|---|
| **Self-healing digital twin** | C-Engine 1, 5b (`flisr`, `network`) | Advisory FLISR playbook: fault isolation, upstream/downstream restoration sequencing, SAIDI/CMI impact calculation. Zero live actuation. | Injected line fault test: isolatable section identified, boundary switches sequenced, AC power flow confirms restoration feasibility. |
| **DTR overload detection & 4-24h alerts** | C-Engine 4b, 4c, 4d (`forecast`, `thermal`, `alerts`) | Chronological walk-forward time-series forecasting (LightGBM/XGBoost) coupled with IEC 60076-7 thermal stress model; prediction intervals. | Backtested against synthetic ground truth; persistence baseline benchmark; prediction interval coverage ≥ 90%. |
| **MILP-based safe load transfer** | C-Engine 5a (`switching`) | Linearised DistFlow branch-flow MILP solved via HiGHS with spanning-tree radiality and voltage constraints; independent AC power-flow post-validation. | 100% radiality preservation over 100 seeded networks; AC power flow convergence verification; A5 status tagging. |
| **Fault isolation & restoration (SAIDI reduction)** | C-Engine 5b (`flisr`) | Automated sequence generation with break-before-make rules, crew operating time modeling, and customer-minutes saved accounting. | Customer restoration accounting test; manual field-crew action checklist generation. |
| **Ranked CAPEX (Bifurcation, Siting, Reconductoring)** | C-Engine 6 (`capex`) | Physics-validated alternative comparison: upsizing vs new DTR siting vs bifurcation vs reconductoring, using standardized DISCOM cost tables. | Worked engineering example verification; reproducible ranking; tornado sensitivity outputs. |
| **Deck Targets: 114%→76% loading, 9.4% loss reduction, 25-40% fewer burnouts, 2.4x ROI** | C-Engine 5, 6, 10 | **Explicitly labeled illustrative benchmark targets**, not claimed field outcomes. Measured only via controlled synthetic backtesting. | Clear disclaimers across all documentation and UI dashboards; backtest scenario reproducibly achieves target under explicit assumptions. |



---

## 3. Milestone Completion Audit Log

### Milestone 1: Repository, Architecture, Database & Baseline CI
- **Status:** COMPLETED & VERIFIED
- **Date:** 2026-11-17
- **Verification Gates:**
  1. Modular monolith directory layout with 13 domain modules initialized.
  2. 20 core SQLAlchemy 2.0 database models compiled with spatial geometry and dialect independence.
  3. Alembic migration `0001_initial_core_schema.py` executed: clean upgrade to `head`, clean rollback downgrade to `base`, and idempotent re-upgrade verified.
  4. 12 automated unit tests executed via Pytest (`tests/unit/test_config.py`, `test_database_models.py`, `test_alembic_migrations.py`, `test_api_endpoints.py`), all passing (100% pass rate).
  5. Ruff linting checks executed across the codebase with 0 errors.
  6. Docker Compose environment defined (`gridsense-db` with PostGIS 16-3.4, `gridsense-backend`, `gridsense-frontend`).


### Milestone 2: Synthetic Network Generator & Benchmarks
- **Status:** COMPLETED & VERIFIED
- **Date:** 2026-11-17
- **Verification Gates Executed:**
  1. Standard IEEE 33-bus loader (`load_ieee33_benchmark`) verified against published literature:
     - Base losses: 202.677 kW (0.0% discrepancy vs Baran & Wu 1989 published 202.677 kW).
     - Minimum voltage: 0.9131 p.u. at Bus 17.
  2. Standard IEEE 69-bus loader (`load_ieee69_benchmark`) verified against Savic & Sreeram / Baran & Wu literature:
     - Base losses: 217.783 kW.
     - Minimum voltage: 0.9092 p.u. at Bus 64.
  3. Telangana Synthetic Network Generator (`TelanganaSyntheticNetworkGenerator`):
     - Deterministic byte-identical output verified under fixed seed (`seed=101` and `seed=42`).
     - 100% provenance tagging (`synthetic`) on all buses, lines, transformers, switches, DTRs, and consumers.
     - Injected scenarios (`normal`, `dtr_overload`, `feeder_overload`, `undervoltage`) all solve to AC convergence and manifest distinct electrical profiles.
     - Relational database persistence verified (`save_synthetic_network_to_db`).
  4. 100-network AC power flow convergence gate:
     - Executed across 100 seeded networks (`seed=1` to `seed=100`): **100/100 (100%) converged in AC power flow (`pandapower.runpp`)**.
  5. 21 automated unit tests passing cleanly in CI.


### Milestone 3: Digital Twin & Topology Reconstruction & Ingestion
- **Status:** COMPLETED & VERIFIED
- **Date:** 2026-11-17
- **Verification Gates Executed:**
  1. Declarative ingestion mapping configuration (`config/ingestion_mappings.json`):
     - Mappings established for ESRI FileGDB (KSEB / DISCOM schema), GeoJSON, and CSV.
  2. Ingestion validation reports with row-level rejection tracking and error codes:
     - `ERR_INVALID_GEOM`, `ERR_MISSING_ID`, `ERR_MISSING_BUS_REF`, `ERR_INVALID_NUMERIC` verified.
  3. Real-world brownfield GIS ingestion (`FileGDBIngestionAdapter`):
     - Validated and ingested KSEB `Puthiya Kadavu.gdb` (4 DTRs totaling 1100 kVA, 33 HT lines, 3 HT cables, 1 RMU, 8 field switches, 5 open tie points, 35 buses).
     - Explicit connectivity mapped into `connections` table, separating topology from geometry (Principle A4-4).
     - Authoritative `TopologyVersion` record created with 64-char SHA256 network hash.
  4. Deterministic topological consistency engine (`TopologyConsistencyEngine`):
     - Catches orphan nodes (`TOPO_ERR_ORPHAN_BUS`).
     - Catches closed loops violating radiality (`TOPO_ERR_RADIAL_LOOP`).
     - Catches disconnected DTRs (`TOPO_ERR_DISCONNECTED_DTR`).
     - Catches voltage level mismatches across lines (`TOPO_ERR_VOLTAGE_MISMATCH`).
     - Catches undefined switch status (`TOPO_ERR_UNDEFINED_SWITCH`).
     - Flags duplicate asset codes (`TOPO_WARN_DUPLICATE_ASSET`).
     - Flags consumer-DTR distance outliers (`TOPO_WARN_DISTANCE_OUTLIER`).
  5. Geometric snapping rules engine (`SnappingRulesEngine`):
     - Proposes candidate connections within spatial proximity threshold (e.g., 5.0m for HT lines).
     - Strictly advisory: zero auto-mutation of authoritative topology (Principles A4-4, A4-9).
     - Operator-approved application route logs human sign-off into `TopologyDiff` (Principle A6).
  6. REST API routes implemented and verified:
     - `POST /api/v1/ingest/gdb`, `POST /api/v1/ingest/geojson`, `POST /api/v1/ingest/csv`, `POST /api/v1/ingest/validate`.
     - `POST /api/v1/topology/validate`, `GET /api/v1/topology/candidates`, `POST /api/v1/topology/candidates/approve`.
  7. 41 automated unit tests passing cleanly in CI (100% pass rate).
