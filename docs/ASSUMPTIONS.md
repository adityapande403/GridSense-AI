# Engineering, Data, and Economic Assumptions Register

**Project:** GridSense-AI (TISC 2026 Challenge 08)  
**Status:** Baseline (Step 0)  
**Last Updated:** 2026-11-12  
**Provenance Policy:** Every default parameter is labeled `assumed` or `synthetic` until calibrated with certified utility data.

---

## 1. Electrical Engineering Assumptions

| ID | Parameter / Area | Default Value | Standard / Source | Provenance | Risk if Wrong | Mitigation |
|---|---|---|---|---|---|---|
| **ASM-ENG-01** | Nominal Voltages | 33 kV (sub-transmission), 11 kV (primary distribution), 415 V L-L / 240 V L-N (secondary LT) | CEA Technical Standards for Construction of Electrical Plants and Electric Lines; TGERC | Standard | Mismatched per-unit base, invalid power flow | Strictly enforce base voltage attributes per bus/substation |
| **ASM-ENG-02** | Statutory Voltage Limits | ±6.0% of nominal at 11 kV and 415 V (0.94 p.u. to 1.06 p.u.) | TGERC Distribution Code / Pitch Deck target | `assumed` (Configurable) | Under-reporting or over-reporting statutory voltage non-compliance | Config file allows dynamic adjustment to ±5% or ±9% per local tariff order |
| **ASM-ENG-03** | Standard Conductor Parameters | ACSR Weasel (R=1.574 Ω/km, X=0.364 Ω/km, 130A), Rabbit (R=0.5426, X=0.334, 200A), Dog (R=0.2733, X=0.315, 300A), Wolf (R=0.1828, X=0.300, 390A), Panther (R=0.1375, X=0.290, 480A) | REC (Rural Electrification Corp) Construction Standards / BIS 398 Part 2 | Published Reference | Inaccurate line impedance leads to erroneous voltage drop and loss calculation | Parameter table is fully externalized in `config/conductors.json` |
| **ASM-ENG-04** | Standard DTR Ratings | 16, 25, 63, 100, 160, 250, 315, 500 kVA (33/11 kV power transformers: 3.15, 5.0, 8.0, 10.0 MVA) | CEA / TSSPDCL Standard Equipment Specifications | Published Reference | Algorithm recommends non-standard transformer sizes | Hard-coded candidate catalog restricted to utility standard ratings |
| **ASM-ENG-05** | DTR Impedance & Losses | %Z = 4.5% (≤100 kVA), 5.0% (>100 kVA); X/R ratio = 3.5 to 5.0; No-load loss = 0.25%, Full-load loss = 1.35% | IS 1180 (Part 1): 2014 Level 2 Energy Efficiency | Published Reference | Loss allocation between lines and transformers distorted | Standard impedance curves used in pandapower transformer models |
| **ASM-ENG-06** | Primary Model Representation | 11 kV network modeled in full branch-bus detail; secondary LT networks aggregated at 11/0.433 kV DTR LV bus by default | Engineering Scope Decision (Part B4) | Operational Baseline | LT tail-end voltage drop not captured on every consumer node | Detailed LT tree modeling generated on-demand for DTR augmentation/siting |
| **ASM-ENG-07** | Power Flow Formulation | Balanced single-phase equivalent AC power flow (`pandapower.runpp`) is the primary simulation engine | pandapower Newton-Raphson | Validated Physics Baseline | Phase unbalance effects neglected in 3-phase trunk | Report phase unbalance index separately; support unbalanced load screening |
| **ASM-ENG-08** | Transformer Thermal Dynamics | Top-oil time constant $\tau_o \approx 2.5\text{ h}$, winding time constant $\tau_w \approx 6\text{ min}$, hot-spot exponent $y=1.3$, oil exponent $x=0.8$ | IEC 60076-7 (Loading guide for oil-immersed power transformers) | `assumed` (Configurable) | Underestimation of thermal aging during acute overloading | Parameters documented; output labeled "Estimated, not measured" |
| **ASM-ENG-09** | Switching Operations | Break-before-make sequencing enforced. Transient paralleling prohibited unless explicit closed-loop interlock exists | Distribution Operating Safety Rules | Safety Critical | Circulating currents or out-of-phase closing | Sequencing engine generates verified open-before-close step orders |

---

## 2. Load and Data Assumptions

| ID | Parameter / Area | Default Value | Standard / Source | Provenance | Risk if Wrong | Mitigation |
|---|---|---|---|---|---|---|
| **ASM-DAT-01** | Consumer Categories & Power Factor | Domestic (0.95 lag), Commercial (0.90 lag), Industrial (0.88 lag), Agricultural (0.82 lag), Streetlight (0.92 lag) | TSSPDCL Tariff Orders / CEA guidelines | `assumed` (Configurable) | Over/under-reactive power estimation, distorted voltage drop | External load profile matrix; reconcile against feeder-head power factor |
| **ASM-DAT-02** | Agricultural Load Scheduling | 7 to 9 hours continuous or split 2-shift 3-phase supply per day in rural zones | Telangana Government 24x7 Agricultural Power Policy (with staggered rostering) | `assumed` | Sudden block load surges violate feeder limits | Injected diurnal patterns incorporate agricultural pump scheduling blocks |
| **ASM-DAT-03** | Ambient Temperature Profile | Diurnal cycle: $24^\circ\text{C}$ night min to $42^\circ\text{C}$ summer peak afternoon (Telangana climate) | IMD Hyderabad climatological normals | `assumed` | Under-cooling of outdoor DTRs during May peak | Thermal model coupled directly with synthetic weather time series |
| **ASM-DAT-04** | Feeder Metering Penetration | Feeder head: 100% metered (15-min intervals). DTR metering: default 10% (configurable 0% to 50% for sensitivity) | Typical Indian DISCOM brownfield status | `assumed` | High estimation variance on unmetered DTRs | Load allocation engine outputs confidence intervals; degrades gracefully |
| **ASM-DAT-05** | Brownfield GIS Conductor Impedances | When conductor size/type is present in GIS but test impedance is absent, conductor impedance defaults to standard REC/BIS tables (`ACSR_Weasel` / `ACSR_Rabbit`) | DISCOM Brownfield GIS Standard Practice | `assumed` | Incorrect line voltage drops and branch losses | Flagged with provenance `assumed` and confidence `0.90` |
| **ASM-DAT-06** | Open Point GIS Representation | Open points (`open_point` layer) are represented as normally-open tie switches (`switch_type='tie_switch'`, `is_normally_open=True`, `current_status='open'`) | KSEB / DISCOM GIS schema convention | `assumed` | Erroneous closed loop if open switch omitted | Ingestion validator treats open points as normally-open switches |
| **ASM-DAT-07** | Snapping Heuristics Non-Authoritative | Geometric snapping candidates within 5.0m threshold are strictly advisory candidate records | Non-Negotiable Principle A4-4 & A4-9 | `estimated` | False connections formed from spatial proximity | Candidate records require human operator sign-off before DB update |

---

## 3. Economic and CAPEX Assumptions

| ID | Parameter / Area | Default Value | Standard / Source | Provenance | Risk if Wrong | Mitigation |
|---|---|---|---|---|---|---|
| **ASM-ECO-01** | Technical Energy Loss Valuation | ₹5.50 per kWh | TSSPDCL Average Cost of Supply (ACoS) / Bulk Power Purchase Cost | `assumed` (Configurable) | Over-valuing or under-valuing loss reduction benefits in NPV | Interactive sensitivity tornado analysis on loss valuation (₹3.50 to ₹7.50/kWh) |
| **ASM-ECO-02** | Conductor Replacement Cost | ₹1,80,000 to ₹3,50,000 per km (depending on Weasel -> Dog/Wolf, inclusive of dismantling & stringing) | TSSPDCL Standard Schedule of Rates (SoR) 2024-25 | `assumed` | Distorted payback calculation for reconductoring | Editable cost database with line-item breakdown (material, labor, civil) |
| **ASM-ECO-03** | DTR Siting / Augmentation Cost | 100 kVA: ₹2,20,000; 160 kVA: ₹3,10,000; 250 kVA: ₹4,50,000 (including plinth, protection, metering) | TSSPDCL SoR / RDSS benchmark costs | `assumed` | False economic trade-off between switching vs asset upgrade | Cost engine supports granular equipment + erection cost definitions |
| **ASM-ECO-04** | Feeder Bifurcation Cost | New 11 kV bay at substation: ₹15,00,000; Overhead line construction: ₹6,50,000/km; Breaker/switchgear: ₹4,00,000 | RDSS (Revamped Distribution Sector Scheme) Guidelines | `assumed` | CAPEX ranking may misprioritize bifurcation vs conductor upgrade | Transparent factor weights; sensitivity analysis over CAPEX variability |
| **ASM-ECO-05** | Discount Rate & Asset Life | Discount rate: 10.0%; Project analysis life: 15 years; Annual O&M: 2.5% of capital cost | Standard utility regulatory accounting (CERC/TGERC guidelines) | `assumed` | Flawed discounted cash flow and net present value | All discount rates and lifetime horizons are user-adjustable parameters |

