# Limitations & Non-Goals Register

**Project:** GridSense-AI (TISC 2026 Challenge 08)  
**Status:** Baseline (Step 0)  
**Last Updated:** 2026-11-12

---

## 1. Explicit Non-Goals & Boundaries

1. **Advisory-Only Architecture (Strictly Enforced)**
   - GridSense-AI does **not** connect directly to utility SCADA (Supervisory Control and Data Acquisition), ADMS (Advanced Distribution Management System), or substation RTUs.
   - Live switching commands are **never** issued by the platform. Every output is an engineering or operational recommendation requiring certified human review, safety interlock checks, and manual field execution confirmation.

2. **No Field Execution Automation**
   - The platform strictly enforces safety layer separation (A6):
     1. Analytical Recommendation
     2. Simulated Action
     3. Human-Approved Action
     4. Field Execution (Manual record only; actual operations carried out by utility line crews or SCADA operators outside the platform).

3. **Protection Coordination Limitations**
   - GridSense-AI calculates short-circuit screening currents (via pandapower `shortcircuit`) to assess prospective fault levels.
   - It does **not** perform full relay coordination curves (TCC grading, IDMT relay curve discrimination, fuse-recloser coordination). Any switching recommendation requiring protection validation is assigned `FEASIBLE_PROTECTION_UNVERIFIED` until verified by a protection engineer.

4. **Synthetic Data Boundaries**
   - In accordance with Reality Constraint A3, all demonstration networks, load profiles, and weather data are synthetically generated and calibrated against plausible Indian distribution engineering standards.
   - Synthetic pipeline success validates algorithm correctness, numerical convergence, and workflow integrity, **not** empirical field performance of TSSPDCL/TSNPDCL networks.

5. **Secondary LT Network Modeling Scope**
   - The primary digital twin focuses on the 33 kV sub-transmission and 11 kV primary distribution network.
   - Low Tension (415 V / 240 V) networks are represented as aggregated balanced or unbalance-flagged loads at the DTR low-voltage terminal. Detailed LT network branches are generated dynamically only for specific DTR siting and LT tail-end voltage analysis.

6. **Balanced AC Power Flow Default**
   - Balanced three-phase positive-sequence AC Newton-Raphson is the standard simulation engine.
   - Where phase imbalance exists, it is reported as an unbalance metric; unbalanced 3-phase 4-wire power flow is not run across the entire wide-area network without confirmed phase-specific meter data.

---

## 2. Platform Status Indicators

- Any feature, API endpoint, or UI widget that is not fully backed by tested physics/ML code will explicitly display `NOT IMPLEMENTED` in accordance with Non-Negotiable Principle A4-11.



---

## 3. Milestone 1 Completed State & Remaining Limitations

- **M1 Completed Capabilities:**
  - Database schema & migrations for asset registry, versioning, telemetry, recommendations, scenarios, and audit logs.
  - Multi-dialect support: Native PostgreSQL/PostGIS in containerized deployments; automatic fallback to SQLite with text geometry for fast, zero-dependency unit testing and local development.
  - Externalized domain configuration (`config/electrical.json`, `config/conductors.json`, `config/economics.json`, `config/thermal.json`).
  - FastAPI application entrypoint with health and config endpoints.
  - React + TypeScript + Vite + Tailwind frontend shell with provenance badging and A5 taxonomy status indicators.

- **Current Limitations (To be addressed in upcoming milestones):**
  - Network generator (M2) and benchmark network loaders not yet implemented.
  - GIS shapefile/GeoJSON ingestion parsers (M3) not yet wired to database persistence.
  - Physics AC power-flow engine wrapper (M5) not yet connected to database topology instances.


### Milestone 2 Completed State & Remaining Limitations

- **M2 Completed Capabilities:**
  - Standard IEEE 33-bus and IEEE 69-bus benchmark network loaders with published reference loss comparisons.
  - Deterministic, seeded synthetic distribution network generator for Telangana-style 33/11 kV networks with 24-hour diurnal profiles, agricultural scheduled pumping blocks, and injected operational scenarios.
  - Relational database persistence pipeline saving synthetic networks into immutable topology versions with audit trails.
  - Automated AC convergence verified across 100 seeded networks.

- **Current Limitations (To be addressed in upcoming milestones):**
  - Ingestion of arbitrary GIS files (Shapefile, GeoJSON, CSV) from disk via declarative column mapping not yet implemented (M3).
  - Graph-based topological consistency checks (orphan nodes, loops, disconnected DTRs) not yet wired into an ingestion validator report (M3).
  - Geospatial map rendering on MapLibre GL JS not yet integrated with live backend GeoJSON endpoints (M4).
