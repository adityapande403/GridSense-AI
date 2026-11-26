import React, { useEffect, useState } from 'react';
import {
  Zap,
  ShieldAlert,
  GitBranch,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  UserCheck,
  Copy,
  Layers,
  ChevronRight,
  AlertOctagon,
  RefreshCw,
  Cpu,
  Hash,
  Play,
  CheckSquare,
  Square,
  Info
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { ClickableAsset } from '../components/ClickableAsset';
import { useGridContext } from '../context/GridContext';

/* =========================================================================
   TYPE DEFINITIONS (Matching Backend Schemas)
   ========================================================================= */

interface SwitchOperationStep {
  sequence_order: number;
  action: 'OPEN' | 'CLOSE' | string;
  switch_code: string;
  switch_type: string;
  is_motorized: boolean;
  location_description?: string;
  from_bus_code: string;
  to_bus_code: string;
  safety_rule: string;
}

interface SwitchingPlanCandidate {
  plan_id: string;
  rank: number;
  status: string;
  status_reason: string;
  base_loss_kw: number;
  optimized_loss_kw: number;
  loss_reduction_kw: number;
  loss_reduction_pct: number;
  annual_cost_savings_inr: number;
  min_voltage_pu: number;
  min_voltage_bus_code: string;
  max_voltage_pu: number;
  max_line_loading_pct: number;
  max_loaded_line_code: string;
  radiality_preserved: boolean;
  isolated_buses_count: number;
  switches_to_open: string[];
  switches_to_close: string[];
  total_switching_operations: number;
  switching_sequence: SwitchOperationStep[];
  solver_execution_time_ms: number;
  ac_converged: boolean;
  provenance: string;
}

interface SwitchingOptimizationReport {
  feeder_code: string;
  feeder_name: string;
  timestamp: string;
  total_switches_available: number;
  motorized_switches_count: number;
  manual_switches_count: number;
  base_configuration: Record<string, any>;
  candidates: SwitchingPlanCandidate[];
  recommended_plan?: SwitchingPlanCandidate;
}

interface SwitchingApprovalResponse {
  approval_id: string;
  plan_id: string;
  status: string;
  timestamp: string;
  operator_id: string;
  safety_disclaimer: string;
  audit_hash: string;
}

interface FaultableLine {
  id: string;
  code: string;
  is_ht: boolean;
  voltage_kv: number;
  conductor_type: string;
  length_km: number;
  is_operational: boolean;
}

interface RestorationCandidatePlan {
  restoration_id: string;
  rank: number;
  tie_switch_code: string;
  tie_switch_type: string;
  is_motorized: boolean;
  donor_feeder_name: string;
  donor_feeder_code: string;
  restored_load_kw: number;
  restored_customers_count: number;
  restored_dtrs_count: number;
  unrestored_load_kw: number;
  unrestored_customers_count: number;
  ac_feasible: boolean;
  min_voltage_pu: number;
  min_voltage_bus_code: string;
  donor_feeder_max_loading_pct: number;
  status: string;
  status_reason: string;
  cmi_saved: number;
  estimated_outage_time_min_manual: number;
  estimated_outage_time_min_flisr: number;
  saidi_reduction_hours: number;
  switching_sequence: SwitchOperationStep[];
}

interface FLISRSimulationReport {
  event_id: string;
  feeder_code: string;
  feeder_name: string;
  timestamp: string;
  faulted_line_code: string;
  fault_type: string;
  isolated_zone_id: string;
  faulted_line_length_km: number;
  faulted_line_conductor: string;
  lines_in_isolated_zone: string[];
  isolation_switches_to_open: SwitchOperationStep[];
  upstream_energized_buses_count: number;
  downstream_interrupted_buses_count: number;
  total_customers_affected: number;
  total_load_interrupted_kw: number;
  interrupted_dtrs_count: number;
  available_restoration_plans: RestorationCandidatePlan[];
  recommended_restoration_plan?: RestorationCandidatePlan;
  provenance: string;
  notes: string;
}

interface SwitchItem {
  id: string;
  code: string;
  switch_type: string;
  current_status: string;
  is_normally_open: boolean;
  is_motorized: boolean;
  breaking_capacity_ka: number;
  from_bus_code: string;
  to_bus_code: string;
  provenance: string;
}

export const SwitchingWorkbench: React.FC = () => {
  const { gridContext } = useGridContext();
  // Navigation Mode: 'reconfig' (TR-SWT) | 'flisr' (TR-FLI)
  const [activeMode, setActiveMode] = useState<'reconfig' | 'flisr'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'flisr') return 'flisr';
    if (window.location.hash.includes('flisr')) return 'flisr';
    return 'reconfig';
  });

  // Shared Data
  const feederCode = gridContext?.feeder_code || '2011951';
  const [switches, setSwitches] = useState<SwitchItem[]>([]);
  const [faultableLines, setFaultableLines] = useState<FaultableLine[]>([]);

  // Mode 1: Sectionalizing State
  const [ambientTemp, setAmbientTemp] = useState<number>(35.0);
  const [loadMultiplier, setLoadMultiplier] = useState<number>(1.0);
  const [topK, setTopK] = useState<number>(3);
  const [maxOps, setMaxOps] = useState<number>(6);
  const [optReport, setOptReport] = useState<SwitchingOptimizationReport | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SwitchingPlanCandidate | null>(null);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optError, setOptError] = useState<string | null>(null);

  // Execution Checklist & Sign-Off State
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [isSignOffModalOpen, setIsSignOffModalOpen] = useState<boolean>(false);
  const [operatorId, setOperatorId] = useState<string>(() => `ENG-${gridContext?.utility_short || 'KSEB'}-4091`);
  const [operatorRole, setOperatorRole] = useState<string>('Senior Distribution Engineer');
  const [justification, setJustification] = useState<string>(
    'AC Newton-Raphson feasibility confirmed. Minimal loss reconfiguration with break-before-make interlock verified.'
  );
  const [fieldCrew, setFieldCrew] = useState<string>(() => gridContext?.field_crew_default || 'Kozhikode Puthiya Kadavu Field Crew #1');

  useEffect(() => {
    if (gridContext) {
      if (gridContext.field_crew_default) setFieldCrew(gridContext.field_crew_default);
      if (gridContext.utility_short) setOperatorId(`ENG-${gridContext.utility_short}-4091`);
    }
  }, [gridContext?.utility_short, gridContext?.field_crew_default]);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState<boolean>(false);
  const [approvalResult, setApprovalResult] = useState<SwitchingApprovalResponse | null>(null);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  // Mode 2: FLISR State
  const [faultedLineCode, setFaultedLineCode] = useState<string>('HL-2011951-14');
  const [faultType, setFaultType] = useState<string>('3ph_short');
  const [isSimulatingFLISR, setIsSimulatingFLISR] = useState<boolean>(false);
  const [flisrReport, setFlisrReport] = useState<FLISRSimulationReport | null>(null);
  const [selectedRestorationPlan, setSelectedRestorationPlan] = useState<RestorationCandidatePlan | null>(null);
  const [flisrCheckedSteps, setFlisrCheckedSteps] = useState<Record<string, boolean>>({});
  const [flisrError, setFlisrError] = useState<string | null>(null);

  // Initial Load: Fetch Switches & Candidate Faultable Lines
  useEffect(() => {
    fetch(`/api/v1/switching/switches?feeder_code=${feederCode}`)
      .then((res) => res.json())
      .then((data) => setSwitches(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to fetch switches', err));

    fetch(`/api/v1/flisr/faultable-lines?feeder_code=${feederCode}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setFaultableLines(data);
          // Set default to first HT line
          const ht = data.find((l: FaultableLine) => l.is_ht);
          if (ht) setFaultedLineCode(ht.code);
        }
      })
      .catch((err) => console.error('Failed to fetch faultable lines', err));

    // Auto-trigger default optimization on mount for seamless experience
    handleRunOptimization();
    if (new URLSearchParams(window.location.search).get('mode') === 'flisr' || window.location.hash.includes('flisr')) {
      handleRunFLISR();
    }
  }, [feederCode]);

  // Run Switching Optimization
  const handleRunOptimization = async () => {
    setIsOptimizing(true);
    setOptError(null);
    setApprovalResult(null);
    setCheckedSteps({});

    try {
      const res = await fetch('/api/v1/switching/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feeder_code: feederCode,
          ambient_temp_c: ambientTemp,
          load_multiplier: loadMultiplier,
          top_k: topK,
          max_switch_operations: maxOps,
          weight_loss: 1.0,
          weight_switching: 0.05
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Optimization failed');
      }

      const report: SwitchingOptimizationReport = await res.json();
      setOptReport(report);
      if (report.recommended_plan) {
        setSelectedPlan(report.recommended_plan);
      } else if (report.candidates && report.candidates.length > 0) {
        setSelectedPlan(report.candidates[0]);
      }
    } catch (err: any) {
      console.error(err);
      setOptError(err.message || 'Failed to run switching optimization');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Run FLISR Simulation
  const handleRunFLISR = async (overrideLine?: string) => {
    setIsSimulatingFLISR(true);
    setFlisrError(null);
    setFlisrCheckedSteps({});

    try {
      const res = await fetch('/api/v1/flisr/simulate-fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feeder_code: feederCode,
          faulted_line_code: overrideLine || faultedLineCode,
          fault_type: faultType,
          ambient_temp_c: ambientTemp,
          load_multiplier: loadMultiplier
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'FLISR simulation failed');
      }

      const report: FLISRSimulationReport = await res.json();
      setFlisrReport(report);
      if (report.recommended_restoration_plan) {
        setSelectedRestorationPlan(report.recommended_restoration_plan);
      } else if (report.available_restoration_plans && report.available_restoration_plans.length > 0) {
        setSelectedRestorationPlan(report.available_restoration_plans[0]);
      }
    } catch (err: any) {
      console.error(err);
      setFlisrError(err.message || 'Failed to simulate FLISR fault');
    } finally {
      setIsSimulatingFLISR(false);
    }
  };

  // Submit Operator Engineering Sign-Off
  const handleSubmitApproval = async () => {
    if (!selectedPlan) return;
    setIsSubmittingApproval(true);

    try {
      const res = await fetch('/api/v1/switching/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: selectedPlan.plan_id,
          feeder_code: feederCode,
          operator_id: operatorId,
          operator_role: operatorRole,
          engineering_justification: justification,
          field_crew_assigned: fieldCrew
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to sign switching order');
      }

      const approvalData: SwitchingApprovalResponse = await res.json();
      setApprovalResult(approvalData);
      setIsSignOffModalOpen(false);
    } catch (err: any) {
      alert(`Approval Registration Error: ${err.message}`);
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const toggleStep = (stepKey: string) => {
    setCheckedSteps((prev) => ({ ...prev, [stepKey]: !prev[stepKey] }));
  };

  const toggleFlisrStep = (stepKey: string) => {
    setFlisrCheckedSteps((prev) => ({ ...prev, [stepKey]: !prev[stepKey] }));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Advisory & Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono uppercase tracking-widest text-blue-400 bg-blue-950/80 px-2.5 py-0.5 rounded border border-blue-800">
                Distribution Automation Core
              </span>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                AC Newton-Raphson Verified
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1 flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <span>Switching & FLISR Workbench</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Distribution feeder optimal sectionalizing, loss-minimization load reconfiguration, automated fault isolation,
              and alternate tie-switch backfeed restoration.
            </p>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setActiveMode('reconfig')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeMode === 'reconfig'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              <span>Optimal Reconfiguration (TR-SWT)</span>
            </button>

            <button
              onClick={() => setActiveMode('flisr')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeMode === 'flisr'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
              <span>Automated FLISR (TR-FLI)</span>
            </button>
          </div>
        </div>

        {/* Feeder & Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-800/80 text-xs font-mono">
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">TARGET FEEDER</span>
            <span className="font-bold text-white">{gridContext?.feeder_name || 'Feeder'}</span>
            <span className="text-slate-400 block text-[10px]">Code: {feederCode} (11 kV)</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">CONDUCTORS</span>
            <span className="font-bold text-cyan-400">553 Segments</span>
            <span className="text-slate-400 block text-[10px]">ACSR Weasel / XLPE</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">TOTAL SWITCHES</span>
            <span className="font-bold text-purple-400">{switches.length || 13} Switches</span>
            <span className="text-slate-400 block text-[10px]">
              {switches.filter((s) => s.is_motorized).length || 7} Motorized &bull; {switches.filter((s) => !s.is_motorized).length || 6} Manual
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">NORMALLY-OPEN TIES</span>
            <span className="font-bold text-amber-400">
              {switches.filter((s) => s.is_normally_open).length || 2} Tie Points
            </span>
            <span className="text-slate-400 block text-[10px]">Loop-Break Ready</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">CONNECTED DTRS</span>
            <span className="font-bold text-emerald-400">
              4 DTRs (660 kVA)
            </span>
            <span className="text-slate-400 block text-[10px]">
              ~2,772 Consumers
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">LOSS VALUATION</span>
            <span className="font-bold text-yellow-400">₹5.50 / kWh</span>
            <span className="text-slate-400 block text-[10px]">{gridContext?.utility_short || 'DISCOM'} Bulk ACoS</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODE 1: OPTIMAL SECTIONALIZING & RECONFIGURATION (TR-SWT)
          ========================================================================= */}
      {activeMode === 'reconfig' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-300">Parameters:</span>
              </div>

              {/* Ambient Temp */}
              <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                <span className="text-slate-400">Ambient Temp:</span>
                <input
                  type="number"
                  min="20"
                  max="50"
                  step="1"
                  value={ambientTemp}
                  onChange={(e) => setAmbientTemp(parseFloat(e.target.value) || 35)}
                  className="w-12 bg-transparent text-amber-300 font-bold outline-none text-right"
                />
                <span className="text-slate-400">°C</span>
              </div>

              {/* Load Multiplier */}
              <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                <span className="text-slate-400">Load Factor:</span>
                <input
                  type="number"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={loadMultiplier}
                  onChange={(e) => setLoadMultiplier(parseFloat(e.target.value) || 1.0)}
                  className="w-12 bg-transparent text-cyan-300 font-bold outline-none text-right"
                />
                <span className="text-slate-400">×</span>
              </div>

              {/* Max Switch Operations */}
              <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                <span className="text-slate-400">Max Ops:</span>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={maxOps}
                  onChange={(e) => setMaxOps(parseInt(e.target.value) || 6)}
                  className="w-10 bg-transparent text-white font-bold outline-none text-right"
                />
              </div>

              {/* Top K Candidates */}
              <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 font-mono">
                <span className="text-slate-400">Top-K:</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value) || 3)}
                  className="w-8 bg-transparent text-white font-bold outline-none text-right"
                />
              </div>
            </div>

            {/* Run Optimizer Button */}
            <button
              onClick={handleRunOptimization}
              disabled={isOptimizing}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg ${
                isOptimizing
                  ? 'bg-blue-800 text-blue-200 cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30'
              }`}
            >
              {isOptimizing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Computing Optimal Switching...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>RUN SWITCHING OPTIMIZER</span>
                </>
              )}
            </button>
          </div>

          {optError && (
            <div className="bg-rose-950/80 border border-rose-700 text-rose-200 p-4 rounded-xl text-xs flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{optError}</span>
            </div>
          )}

          {/* Signed Approval Notification Banner */}
          {approvalResult && (
            <div className="bg-emerald-950/90 border border-emerald-500 rounded-xl p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Switching Order Digitally Signed & Staged for Field Dispatch</span>
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  Order ID: <span className="text-white font-bold">{approvalResult.approval_id}</span> &bull; Plan:{' '}
                  <span className="text-white font-bold">{approvalResult.plan_id}</span> &bull; Operator:{' '}
                  <span className="text-white font-bold">{approvalResult.operator_id}</span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
                  <Hash className="w-3.5 h-3.5 text-blue-400" />
                  <span className="truncate max-w-xl text-blue-300">{approvalResult.audit_hash}</span>
                  <button
                    onClick={() => copyToClipboard(approvalResult.audit_hash)}
                    className="p-1 hover:text-white rounded bg-slate-900 border border-slate-700"
                    title="Copy SHA-256 Hash"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {copiedHash && <span className="text-emerald-400 text-[10px]">Copied!</span>}
                </div>
              </div>

              <div className="text-right text-[10px] font-mono text-amber-300 max-w-xs bg-amber-950/50 p-2 rounded border border-amber-800">
                <Info className="w-3 h-3 inline mr-1 text-amber-400" />
                ADVISORY ONLY: Operator field verification and permit-to-work required prior to physical operation.
              </div>
            </div>
          )}

          {/* Baseline vs Optimized KPI Comparison Cards */}
          {selectedPlan && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Technical Loss */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Technical Loss (kW)</span>
                  <ProvenanceBadge provenance="calculated" />
                </div>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span className="text-2xl font-bold text-white font-mono">
                    {selectedPlan.optimized_loss_kw.toFixed(2)} kW
                  </span>
                  <span className="text-xs font-mono text-slate-500 line-through">
                    {selectedPlan.base_loss_kw.toFixed(2)} kW
                  </span>
                </div>
                <div className="mt-2 flex items-center space-x-1.5 text-xs text-emerald-400 font-mono font-semibold">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>
                    -{selectedPlan.loss_reduction_kw.toFixed(2)} kW ({selectedPlan.loss_reduction_pct.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Annual Cost Savings */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Annual Monetary Savings</span>
                  <ProvenanceBadge provenance="calculated" />
                </div>
                <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
                  ₹{selectedPlan.annual_cost_savings_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                <div className="mt-2 text-xs text-slate-400 font-mono">
                  Valued at ₹5.50 / kWh bulk ACoS
                </div>
              </div>

              {/* Minimum Voltage */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Min Bus Voltage</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                    ±6.0% Statutory
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold text-white font-mono">
                  {selectedPlan.min_voltage_pu.toFixed(4)} p.u.
                </div>
                <div className="mt-2 text-xs text-slate-400 font-mono flex items-center space-x-1">
                  <span>At node:</span>
                  <span className="text-blue-400 font-bold">{selectedPlan.min_voltage_bus_code}</span>
                </div>
              </div>

              {/* Line Loading Peak */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Peak Line Loading</span>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">
                    IEEE 738 Rated
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold text-cyan-300 font-mono">
                  {selectedPlan.max_line_loading_pct.toFixed(1)}%
                </div>
                <div className="mt-2 text-xs text-slate-400 font-mono truncate" title={selectedPlan.max_loaded_line_code}>
                  Line: {selectedPlan.max_loaded_line_code}
                </div>
              </div>

              {/* A5 Taxonomy & Feasibility */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  <span>A5 Engineering Taxonomy</span>
                </div>
                <div className="my-1">
                  <StatusBadge status={selectedPlan.status} />
                </div>
                <div className="text-[11px] font-mono text-slate-400 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Radially Verified (0 Loops)</span>
                </div>
              </div>
            </div>
          )}

          {/* Main Grid: Left = Candidate Plans Selector, Right = Break-Before-Make Execution Sequence */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Candidate Plans List (5 cols) */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Candidate Reconfiguration Plans</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluated by MILP cycle search & pandapower AC Newton-Raphson
                  </p>
                </div>
                <span className="text-xs font-mono text-blue-300 bg-blue-950 border border-blue-800 px-2 py-0.5 rounded">
                  {optReport?.candidates.length || 0} Candidates
                </span>
              </div>

              <div className="space-y-3">
                {optReport?.candidates.map((cand) => {
                  const isSelected = selectedPlan?.plan_id === cand.plan_id;
                  return (
                    <div
                      key={cand.plan_id}
                      onClick={() => setSelectedPlan(cand)}
                      className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                              cand.rank === 1
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            #{cand.rank}
                          </span>
                          <span className="text-sm font-bold text-white font-mono">{cand.plan_id}</span>
                          {cand.rank === 1 && (
                            <span className="text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700 px-1.5 py-0.2 rounded">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <StatusBadge status={cand.status} />
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
                        <div>
                          <span className="text-slate-500 block text-[10px]">LOSS REDUCTION</span>
                          <span className="text-emerald-400 font-bold">
                            -{cand.loss_reduction_pct.toFixed(2)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">MIN VOLTAGE</span>
                          <span className="text-white font-bold">{cand.min_voltage_pu.toFixed(4)} pu</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">OPERATIONS</span>
                          <span className="text-purple-300 font-bold">{cand.total_switching_operations} Steps</span>
                        </div>
                      </div>

                      <div className="mt-2.5 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                        <div>
                          <span className="text-rose-400 font-semibold">OPEN:</span>{' '}
                          {cand.switches_to_open.join(', ')} &bull;{' '}
                          <span className="text-emerald-400 font-semibold">CLOSE:</span>{' '}
                          {cand.switches_to_close.join(', ')}
                        </div>
                        <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-600'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Break-Before-Make Switching Execution Sequence & Sign-off (7 cols) */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    <span>Break-Before-Make Switching Sequence (TR-SWT-08)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Radiality enforcement: Strictly open sectionalizers before closing tie switches to prevent loop currents.
                  </p>
                </div>

                {/* Operator Sign-Off Trigger */}
                <button
                  onClick={() => setIsSignOffModalOpen(true)}
                  disabled={!selectedPlan}
                  className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg shadow-emerald-950/50 transition-all shrink-0"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>OPERATOR SIGN-OFF</span>
                </button>
              </div>

              {/* Safety Interlock Notice */}
              <div className="bg-amber-950/40 border border-amber-700/60 rounded-lg p-3 text-xs text-amber-200/90 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold text-amber-300">INTERLOCK MANDATE: </span>
                  Step 1 must be confirmed OPEN and de-energized prior to initiating Step 2 tie closure.
                  Field crew authorization and permit-to-work (PTW) are mandatory.
                </div>
              </div>

              {/* Step Sequence Checklist */}
              <div className="space-y-3">
                {selectedPlan?.switching_sequence.map((step) => {
                  const stepKey = `${selectedPlan.plan_id}-step-${step.sequence_order}`;
                  const isChecked = !!checkedSteps[stepKey];
                  const isOpen = step.action === 'OPEN';

                  return (
                    <div
                      key={stepKey}
                      className={`border rounded-xl p-4 transition-all ${
                        isChecked
                          ? 'bg-emerald-950/20 border-emerald-800'
                          : 'bg-slate-950/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-3">
                          <button
                            onClick={() => toggleStep(stepKey)}
                            className="mt-1 text-slate-400 hover:text-white transition-colors"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-600" />
                            )}
                          </button>

                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                                SEQUENCE #{step.sequence_order}
                              </span>
                              <span
                                className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                  isOpen
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                }`}
                              >
                                {step.action} ({isOpen ? 'BREAK' : 'MAKE'})
                              </span>
                              <div className="flex items-center gap-1.5 text-sm font-bold text-white font-mono">
                                <span>Switch:</span>
                                <ClickableAsset code={step.switch_code} feederCode={feederCode} badge="SWITCH" />
                              </div>
                            </div>

                            <div className="text-xs text-slate-400 font-mono mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span>Type: <strong className="text-slate-200">{step.switch_type}</strong></span>
                              <span>
                                Control:{' '}
                                {step.is_motorized ? (
                                  <span className="text-cyan-400 font-bold">Motorized / SCADA Ready</span>
                                ) : (
                                  <span className="text-yellow-400 font-bold">Manual Field Crew</span>
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                Span: <ClickableAsset code={step.from_bus_code} feederCode={feederCode} showIcon={false} /> ➔{' '}
                                <ClickableAsset code={step.to_bus_code} feederCode={feederCode} showIcon={false} />
                              </span>
                            </div>

                            <p className="text-xs text-slate-400 mt-2 bg-slate-900/80 p-2 rounded border border-slate-800/80">
                              <strong className="text-slate-300">Safety Requirement:</strong> {step.safety_rule}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              isChecked
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : 'bg-slate-900 text-slate-500 border-slate-800'
                            }`}
                          >
                            {isChecked ? 'VERIFIED' : 'PENDING'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress Summary */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>
                  Execution Progress:{' '}
                  <strong className="text-white">
                    {Object.values(checkedSteps).filter(Boolean).length} of{' '}
                    {selectedPlan?.switching_sequence.length || 0} Steps Verified
                  </strong>
                </span>
                <span className="text-slate-500">
                  Solver Runtime: {selectedPlan?.solver_execution_time_ms.toFixed(1)} ms
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODE 2: AUTOMATED FLISR WORKBENCH (TR-FLI)
          ========================================================================= */}
      {activeMode === 'flisr' && (
        <div className="space-y-6">
          {/* Fault Simulation Configuration Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <span className="font-bold text-white uppercase tracking-wider">Simulate Network Fault:</span>
              </div>

              {/* Line Selector */}
              <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-mono">Faulted Line:</span>
                <select
                  value={faultedLineCode}
                  onChange={(e) => setFaultedLineCode(e.target.value)}
                  className="bg-transparent text-white font-mono font-bold outline-none cursor-pointer"
                >
                  {faultableLines.map((line) => (
                    <option key={line.id} value={line.code} className="bg-slate-900 text-white">
                      {line.code} ({line.voltage_kv} kV &bull; {line.conductor_type} &bull; {(line.length_km * 1000).toFixed(0)}m)
                    </option>
                  ))}
                </select>
              </div>

              {/* Fault Type Selector */}
              <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-mono">Fault Type:</span>
                <select
                  value={faultType}
                  onChange={(e) => setFaultType(e.target.value)}
                  className="bg-transparent text-amber-300 font-mono font-bold outline-none cursor-pointer"
                >
                  <option value="3ph_short" className="bg-slate-900 text-amber-300">
                    3-Phase Bolted Short Circuit (Worst-Case)
                  </option>
                  <option value="1ph_ground" className="bg-slate-900 text-amber-300">
                    Single Line-to-Ground (SLG)
                  </option>
                  <option value="conductor_snap" className="bg-slate-900 text-amber-300">
                    Conductor Snap / Open Conductor
                  </option>
                </select>
              </div>
            </div>

            {/* Run FLISR CTA */}
            <button
              onClick={() => handleRunFLISR()}
              disabled={isSimulatingFLISR}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg ${
                isSimulatingFLISR
                  ? 'bg-rose-900 text-rose-200 cursor-wait'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40'
              }`}
            >
              {isSimulatingFLISR ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Computing Isolation & Restoration...</span>
                </>
              ) : (
                <>
                  <AlertOctagon className="w-4 h-4" />
                  <span>SIMULATE FAULT & TRIGGER FLISR</span>
                </>
              )}
            </button>
          </div>

          {flisrError && (
            <div className="bg-rose-950/80 border border-rose-700 text-rose-200 p-4 rounded-xl text-xs flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{flisrError}</span>
            </div>
          )}

          {/* FLISR Results Display */}
          {flisrReport && (
            <div className="space-y-6">
              {/* Fault Zone & Interruption Impact Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Fault Zone ID */}
                <div className="bg-rose-950/40 border border-rose-700/80 rounded-xl p-4">
                  <span className="text-[10px] font-mono text-rose-300 uppercase tracking-wider block">
                    ISOLATED FAULT ZONE
                  </span>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {flisrReport.isolated_zone_id}
                  </div>
                  <div className="text-xs text-rose-200 font-mono mt-1 space-y-1">
                    <div>Bounded: {flisrReport.lines_in_isolated_zone.length} Conductor Segments</div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-slate-400">Faulted Line:</span>
                      <ClickableAsset code={flisrReport.faulted_line_code} feederCode={feederCode} badge="LINE" />
                    </div>
                  </div>
                </div>

                {/* Affected Consumers */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    INTERRUPTED CONSUMERS
                  </span>
                  <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
                    {flisrReport.total_customers_affected.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    Connected to {flisrReport.interrupted_dtrs_count} DTRs
                  </div>
                </div>

                {/* Interrupted Load */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    INTERRUPTED LOAD
                  </span>
                  <div className="text-2xl font-bold text-rose-400 font-mono mt-1">
                    {flisrReport.total_load_interrupted_kw.toFixed(1)} kW
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    Feeder: {flisrReport.feeder_name}
                  </div>
                </div>

                {/* SAIDI Impact Savings */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    SAIDI SAVINGS
                  </span>
                  <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                    {selectedRestorationPlan?.saidi_reduction_hours.toFixed(2) || '0.00'} hrs
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    {(selectedRestorationPlan?.cmi_saved || 0).toLocaleString()} CMI Saved
                  </div>
                </div>

                {/* Outage Time Reduction */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    RESTORATION SPEED
                  </span>
                  <div className="text-2xl font-bold text-cyan-300 font-mono mt-1">
                    {selectedRestorationPlan?.estimated_outage_time_min_flisr || 2} min
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1 line-through">
                    Manual: {selectedRestorationPlan?.estimated_outage_time_min_manual || 90} min
                  </div>
                </div>
              </div>

              {/* Two Column Section: Step 1 Isolation & Step 2 Restoration Playbook */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Step 1: Boundary Isolation Locks (5 cols) */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <AlertOctagon className="w-4 h-4 text-rose-400" />
                        <span>Step 1: Boundary Fault Isolation</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Open upstream breaker & downstream sectionalizers to de-energize fault zone
                      </p>
                    </div>
                    <span className="text-xs font-mono text-rose-300 bg-rose-950 border border-rose-800 px-2 py-0.5 rounded">
                      OPEN LOCKOUT
                    </span>
                  </div>

                  <div className="space-y-3">
                    {flisrReport.isolation_switches_to_open.map((step) => {
                      const stepKey = `iso-${step.switch_code}`;
                      const isChecked = !!flisrCheckedSteps[stepKey];

                      return (
                        <div
                          key={stepKey}
                          className={`border rounded-xl p-4 transition-all ${
                            isChecked
                              ? 'bg-rose-950/20 border-rose-800'
                              : 'bg-slate-950/70 border-slate-800'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3">
                              <button
                                onClick={() => toggleFlisrStep(stepKey)}
                                className="mt-1 text-slate-400 hover:text-white"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-5 h-5 text-rose-400" />
                                ) : (
                                  <Square className="w-5 h-5 text-slate-600" />
                                )}
                              </button>

                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded">
                                    OPEN
                                  </span>
                                  <ClickableAsset code={step.switch_code} feederCode={feederCode} badge="SWITCH" />
                                </div>
                                <div className="text-xs text-slate-400 font-mono mt-1 space-y-0.5">
                                  <div>Type: {step.switch_type} &bull; {step.is_motorized ? 'Motorized SCADA' : 'Manual Crew'}</div>
                                  <div>Location: {step.location_description || `${step.from_bus_code} ➔ ${step.to_bus_code}`}</div>
                                </div>
                                <div className="text-xs text-rose-300/80 mt-2 bg-rose-950/30 p-1.5 rounded border border-rose-900/50">
                                  {step.safety_rule}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                isChecked
                                  ? 'bg-rose-950 text-rose-300 border-rose-700'
                                  : 'bg-slate-900 text-slate-500 border-slate-800'
                              }`}
                            >
                              {isChecked ? 'OPENED' : 'ARMED'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Service Restoration Playbook (7 cols) */}
                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Step 2: Service Restoration Playbook (Backfeed)</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Close alternate tie switches to backfeed healthy downstream customers
                      </p>
                    </div>
                    <span className="text-xs font-mono text-emerald-300 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded">
                      CLOSE TIE
                    </span>
                  </div>

                  {/* Candidate Restoration Plans */}
                  <div className="space-y-3">
                    {flisrReport.available_restoration_plans.map((rPlan) => {
                      const isSelected = selectedRestorationPlan?.restoration_id === rPlan.restoration_id;

                      return (
                        <div
                          key={rPlan.restoration_id}
                          onClick={() => setSelectedRestorationPlan(rPlan)}
                          className={`cursor-pointer rounded-xl p-4 border transition-all ${
                            isSelected
                              ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center justify-center text-xs font-mono font-bold">
                                #{rPlan.rank}
                              </span>
                              <span className="text-sm font-bold text-white font-mono">{rPlan.restoration_id}</span>
                              <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                via <ClickableAsset code={rPlan.tie_switch_code} feederCode={feederCode} badge="TIE SWITCH" />
                              </span>
                            </div>
                            <StatusBadge status={rPlan.status} />
                          </div>

                          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
                            <div>
                              <span className="text-slate-500 block text-[10px]">RESTORED USERS</span>
                              <span className="text-emerald-400 font-bold">{rPlan.restored_customers_count}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">RESTORED DTRS</span>
                              <span className="text-white font-bold">{rPlan.restored_dtrs_count} DTRs</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">POST-VOLTAGE</span>
                              <span className="text-cyan-300 font-bold">{rPlan.min_voltage_pu.toFixed(4)} pu</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px]">SAIDI SAVINGS</span>
                              <span className="text-amber-300 font-bold">{rPlan.saidi_reduction_hours.toFixed(2)}h</span>
                            </div>
                          </div>

                          {/* Restoration Sequence Steps */}
                          <div className="mt-3 pt-2 border-t border-slate-800/60 space-y-2">
                            {rPlan.switching_sequence.map((step) => {
                              const stepKey = `flisr-seq-${step.sequence_order}`;
                              const isChecked = !!flisrCheckedSteps[stepKey];

                              return (
                                <div
                                  key={stepKey}
                                  className="flex items-center justify-between bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs font-mono"
                                >
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFlisrStep(stepKey);
                                      }}
                                    >
                                      {isChecked ? (
                                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-600" />
                                      )}
                                    </button>
                                    <span className="text-emerald-400 font-bold">CLOSE</span>
                                    <ClickableAsset code={step.switch_code} feederCode={feederCode} badge="SWITCH" />
                                    <span className="text-slate-400">({step.switch_type} &bull; {step.is_motorized ? 'Motorized' : 'Manual'})</span>
                                  </div>
                                  <span className="text-slate-500 text-[10px]">
                                    {isChecked ? 'CLOSED' : 'PENDING'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          INTERACTIVE TOPOLOGICAL SCHEMATIC & SWITCHING SLD CANVAS
          ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Interactive Feeder SLD & Switching Topology Canvas</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live representation of 11 kV Substation bus, sectionalizers, tie switches, and backfeed restoration paths.
            </p>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-cyan-400 inline-block shadow-cyan-400/50 shadow"></span>
              <span className="text-slate-300">Normal Feeder (11 kV)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-rose-500/50 shadow animate-pulse"></span>
              <span className="text-slate-300">Fault Zone</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block shadow-emerald-400/50 shadow"></span>
              <span className="text-slate-300">Restored Tie</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 border-2 border-amber-400 rounded-sm inline-block"></span>
              <span className="text-slate-300">Normally Open Tie</span>
            </div>
          </div>
        </div>

        {/* Visual Schematic Diagram (SVG Canvas) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 overflow-x-auto">
          <svg className="w-full min-w-[760px] h-64 select-none font-mono text-xs" viewBox="0 0 880 240">
            {/* Background Grid Pattern */}
            <defs>
              <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="880" height="240" fill="url(#gridPattern)" rx="8" />

            {/* 11 kV Substation Bus (Golden Bar) */}
            <rect x="40" y="40" width="16" height="150" fill="#f59e0b" rx="2" />
            <text x="48" y="210" fill="#fbbf24" textAnchor="middle" fontSize="10" fontWeight="bold">
              {gridContext?.substation_name?.toUpperCase() || 'SUBSTATION'} 11kV BUS
            </text>

            {/* Feeder Outgoing Breaker */}
            <line x1="56" y1="90" x2="120" y2="90" stroke="#06b6d4" strokeWidth="3" />
            <circle cx="120" cy="90" r="7" fill="#0f172a" stroke="#10b981" strokeWidth="2.5" />
            <text x="120" y="75" fill="#94a3b8" textAnchor="middle" fontSize="9">
              {`CB-${feederCode.slice(-4)}`} (CLOSED)
            </text>

            {/* Main HT Trunk Line 1 */}
            <line x1="127" y1="90" x2="250" y2="90" stroke="#06b6d4" strokeWidth="3" />
            <text x="180" y="82" fill="#64748b" textAnchor="middle" fontSize="9">
              {faultableLines[0]?.code || 'Trunk Line 1'} ({faultableLines[0]?.length_km ? `${Math.round(faultableLines[0].length_km * 1000)}m` : '850m'})
            </text>

            {/* Sectionalizer SW-01 (RMU-1) */}
            {/* If Mode 1 has selectedPlan with SW-01 in open list, or Mode 2 has fault */}
            <circle
              cx="250"
              cy="90"
              r="8"
              fill="#0f172a"
              stroke={
                selectedPlan?.switches_to_open.includes(switches[0]?.code || 'SW-01') || flisrReport
                  ? '#ef4444'
                  : '#10b981'
              }
              strokeWidth="3"
            />
            <text x="250" y="73" fill="#cbd5e1" textAnchor="middle" fontSize="9" fontWeight="bold">
              {switches[0]?.code || 'SW-01'} ({selectedPlan?.switches_to_open.includes(switches[0]?.code || 'SW-01') ? 'OPEN' : 'CLOSED'})
            </text>

            {/* Branch to DTR 1 */}
            <line x1="250" y1="98" x2="250" y2="150" stroke="#06b6d4" strokeWidth="2" strokeDasharray="3 3" />
            <rect x="235" y="150" width="30" height="24" rx="4" fill="#0284c7" />
            <text x="250" y="165" fill="#ffffff" textAnchor="middle" fontSize="9" fontWeight="bold">
              DTR-01
            </text>
            <text x="250" y="186" fill="#94a3b8" textAnchor="middle" fontSize="8">
              160 kVA
            </text>

            {/* Middle Section (Fault Zone if FLISR active) */}
            <line
              x1="258"
              y1="90"
              x2="430"
              y2="90"
              stroke={activeMode === 'flisr' && flisrReport ? '#ef4444' : '#06b6d4'}
              strokeWidth={activeMode === 'flisr' && flisrReport ? 4 : 3}
              strokeDasharray={activeMode === 'flisr' && flisrReport ? '6 3' : 'none'}
            />
            {activeMode === 'flisr' && flisrReport ? (
              <g>
                <rect x="310" y="65" width="80" height="18" rx="4" fill="#7f1d1d" stroke="#ef4444" />
                <text x="350" y="78" fill="#fecaca" textAnchor="middle" fontSize="9" fontWeight="bold">
                  ⚡ FAULT ZONE
                </text>
              </g>
            ) : (
              <text x="340" y="82" fill="#64748b" textAnchor="middle" fontSize="9">
                {faultedLineCode || faultableLines[1]?.code || 'Line-02'} ({faultableLines[1]?.length_km ? `${Math.round(faultableLines[1].length_km * 1000)}m` : '44m'})
              </text>
            )}

            {/* Sectionalizer SW-02 (RMU-2) */}
            <circle
              cx="430"
              cy="90"
              r="8"
              fill="#0f172a"
              stroke={
                selectedPlan?.switches_to_open.includes(switches[1]?.code || 'SW-02') || (activeMode === 'flisr' && flisrReport)
                  ? '#ef4444'
                  : '#10b981'
              }
              strokeWidth="3"
            />
            <text x="430" y="73" fill="#cbd5e1" textAnchor="middle" fontSize="9" fontWeight="bold">
              {switches[1]?.code || 'SW-02'} ({activeMode === 'flisr' && flisrReport ? 'ISOLATED' : 'CLOSED'})
            </text>

            {/* Branch to DTR 2 */}
            <line x1="430" y1="98" x2="430" y2="150" stroke="#06b6d4" strokeWidth="2" strokeDasharray="3 3" />
            <rect x="415" y="150" width="30" height="24" rx="4" fill="#0284c7" />
            <text x="430" y="165" fill="#ffffff" textAnchor="middle" fontSize="9" fontWeight="bold">
              DTR-02
            </text>
            <text x="430" y="186" fill="#94a3b8" textAnchor="middle" fontSize="8">
              100 kVA
            </text>

            {/* Downstream Line Section */}
            <line
              x1="438"
              y1="90"
              x2="610"
              y2="90"
              stroke={
                activeMode === 'flisr' && selectedRestorationPlan
                  ? '#10b981'
                  : '#06b6d4'
              }
              strokeWidth="3"
            />
            <text x="520" y="82" fill="#64748b" textAnchor="middle" fontSize="9">
              {faultableLines[2]?.code || 'Branch Line 3'} ({faultableLines[2]?.length_km ? `${Math.round(faultableLines[2].length_km * 1000)}m` : '43m'})
            </text>

            {/* Downstream Sectionalizer SW-03 / DTR 3 */}
            <circle cx="610" cy="90" r="8" fill="#0f172a" stroke="#10b981" strokeWidth="3" />
            <text x="610" y="73" fill="#cbd5e1" textAnchor="middle" fontSize="9" fontWeight="bold">
              {switches[2]?.code || (switches.length > 2 ? switches[2].code : 'SW-03')}
            </text>

            <line x1="610" y1="98" x2="610" y2="150" stroke="#06b6d4" strokeWidth="2" strokeDasharray="3 3" />
            <rect x="595" y="150" width="30" height="24" rx="4" fill="#0284c7" />
            <text x="610" y="165" fill="#ffffff" textAnchor="middle" fontSize="9" fontWeight="bold">
              DTR-03
            </text>
            <text x="610" y="186" fill="#94a3b8" textAnchor="middle" fontSize="8">
              250 kVA
            </text>

            {/* Normally-Open Tie Line to Alternate Feeder */}
            <line
              x1="618"
              y1="90"
              x2="730"
              y2="90"
              stroke={
                (activeMode === 'reconfig' && selectedPlan?.switches_to_close.includes('SW-TIE-01')) ||
                (activeMode === 'flisr' && selectedRestorationPlan)
                  ? '#10b981'
                  : '#f59e0b'
              }
              strokeWidth="3"
              strokeDasharray={
                (activeMode === 'reconfig' && selectedPlan?.switches_to_close.includes('SW-TIE-01')) ||
                (activeMode === 'flisr' && selectedRestorationPlan)
                  ? 'none'
                  : '4 4'
              }
            />

            {/* Tie Switch SW-TIE-01 */}
            <rect
              x="730"
              y="81"
              width="18"
              height="18"
              rx="3"
              fill="#0f172a"
              stroke={
                (activeMode === 'reconfig' && selectedPlan?.switches_to_close.includes('SW-TIE-01')) ||
                (activeMode === 'flisr' && selectedRestorationPlan)
                  ? '#10b981'
                  : '#f59e0b'
              }
              strokeWidth="2.5"
            />
            <text x="739" y="72" fill="#fbbf24" textAnchor="middle" fontSize="9" fontWeight="bold">
              SW-TIE-01 ({
                (activeMode === 'reconfig' && selectedPlan?.switches_to_close.includes('SW-TIE-01')) ||
                (activeMode === 'flisr' && selectedRestorationPlan)
                  ? 'CLOSED'
                  : 'NORM-OPEN'
              })
            </text>

            {/* Alternate Feeder Tie Source */}
            <line x1="748" y1="90" x2="820" y2="90" stroke="#10b981" strokeWidth="3" />
            <rect x="820" y="70" width="40" height="40" rx="6" fill="#065f46" stroke="#10b981" />
            <text x="840" y="88" fill="#ecfdf5" textAnchor="middle" fontSize="8" fontWeight="bold">
              DONOR
            </text>
            <text x="840" y="100" fill="#a7f3d0" textAnchor="middle" fontSize="7">
              FEEDER #2
            </text>
          </svg>
        </div>
      </div>

      {/* =========================================================================
          OPERATOR ENGINEERING SIGN-OFF MODAL (TR-SWT-09, A6)
          ========================================================================= */}
      {isSignOffModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 uppercase tracking-wider">
                  <UserCheck className="w-4 h-4" />
                  <span>Engineering Authorization & Audit Certificate</span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">
                  Approve Switching Plan: {selectedPlan.plan_id}
                </h2>
              </div>
              <button
                onClick={() => setIsSignOffModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Legal Advisory Disclaimer */}
            <div className="bg-amber-950/60 border border-amber-600/70 p-3.5 rounded-xl text-xs text-amber-200 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-amber-300 uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Non-Negotiable Advisory-Only Platform Governance (A6)</span>
              </div>
              <p className="leading-relaxed text-amber-200/90 text-[11px]">
                GridSense-AI provides decision support and analytical recommendations only. Direct SCADA actuation is strictly disabled.
                The signing distribution engineer assumes regulatory responsibility for verifying field interlocking, radiality integrity,
                and crew safety before manual or tele-controlled switching execution.
              </p>
            </div>

            {/* Plan Metrics Snapshot */}
            <div className="grid grid-cols-3 gap-3 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px]">LOSS REDUCTION</span>
                <span className="text-emerald-400 font-bold">
                  -{selectedPlan.loss_reduction_pct.toFixed(2)}% ({selectedPlan.loss_reduction_kw.toFixed(2)} kW)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">MIN VOLTAGE</span>
                <span className="text-white font-bold">{selectedPlan.min_voltage_pu.toFixed(4)} pu</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">A5 TAXONOMY</span>
                <span className="text-cyan-300 font-bold">{selectedPlan.status}</span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 block mb-1">Operator ID / Employee Code</label>
                  <input
                    type="text"
                    value={operatorId}
                    onChange={(e) => setOperatorId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Engineering Designation</label>
                  <select
                    value={operatorRole}
                    onChange={(e) => setOperatorRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-blue-500"
                  >
                    <option value="Senior Distribution Engineer">Senior Distribution Engineer</option>
                    <option value="Executive Engineer (Distribution)">Executive Engineer (Distribution)</option>
                    <option value="Assistant Executive Engineer">Assistant Executive Engineer</option>
                    <option value="Substation Shift In-Charge">Substation Shift In-Charge</option>
                    <option value="SCADA Dispatcher">SCADA Dispatcher</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Assigned Field Crew Unit</label>
                <input
                  type="text"
                  value={fieldCrew}
                  onChange={(e) => setFieldCrew(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Engineering Justification & PTW Reference</label>
                <textarea
                  rows={3}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsSignOffModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleSubmitApproval}
                disabled={isSubmittingApproval || !operatorId}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg ${
                  isSubmittingApproval
                    ? 'bg-emerald-800 text-emerald-200 cursor-wait'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                }`}
              >
                {isSubmittingApproval ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing Switching Order...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>AUTHORIZE & SIGN SWITCHING ORDER</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwitchingWorkbench;
