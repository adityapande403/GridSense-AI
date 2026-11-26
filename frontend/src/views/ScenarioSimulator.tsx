import React, { useEffect, useState } from 'react';
import {
  GitBranch,
  Play,
  Zap,
  ShieldCheck,
  Sun,
  BatteryCharging,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Sliders,
  Cpu,
  Flame,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { useGridContext } from '../context/GridContext';
import { ClickableAsset } from '../components/ClickableAsset';
import { StatusBadge } from '../components/StatusBadge';
import { ProvenanceBadge } from '../components/ProvenanceBadge';

/* =========================================================================
   TYPE DEFINITIONS (Matching Backend Scenarios Schemas)
   ========================================================================= */

interface ScenarioMutation {
  mutation_type: 'LOAD_GROWTH' | 'SOLAR_PV' | 'EV_CHARGING' | 'LINE_OUTAGE' | 'DTR_AUGMENTATION' | 'SWITCH_TOGGLE';
  target_code?: string;
  scale_factor?: number;
  solar_kw?: number;
  solar_pf?: number;
  ev_chargers_count?: number;
  charger_kw?: number;
  new_kva?: number;
  switch_state?: string;
}

interface ScenarioPreset {
  preset_id: string;
  title: string;
  description: string;
  category: string;
  mutations: ScenarioMutation[];
}

interface ScenarioElementDelta {
  element_type: 'line' | 'dtr' | 'bus' | string;
  code: string;
  name: string;
  base_value: number;
  scenario_value: number;
  delta_value: number;
  unit: string;
  base_status: string;
  scenario_status: string;
  coordinates?: { latitude: number; longitude: number };
}

interface ScenarioKpiComparison {
  base_loss_kw: number;
  scenario_loss_kw: number;
  delta_loss_kw: number;
  delta_loss_pct: number;
  base_min_voltage_pu: number;
  scenario_min_voltage_pu: number;
  delta_min_voltage_pu: number;
  base_max_line_loading_pct: number;
  scenario_max_line_loading_pct: number;
  base_overloaded_dtrs_count: number;
  scenario_overloaded_dtrs_count: number;
  delta_overloaded_dtrs: number;
  base_statutory_violations_count: number;
  scenario_statutory_violations_count: number;
  ac_converged: boolean;
  iterations: number;
  solver_time_ms: number;
}

interface ScenarioSimulationResponse {
  scenario_id: string;
  scenario_name: string;
  feeder_code: string;
  feeder_name: string;
  timestamp: string;
  base_version_hash: string;
  post_run_version_hash: string;
  immutability_verified: boolean;
  reproducibility_token: string;
  kpis: ScenarioKpiComparison;
  impacted_elements: ScenarioElementDelta[];
  applied_mutations: ScenarioMutation[];
  provenance: string;
}

export const ScenarioSimulator: React.FC = () => {
  const { gridContext, feederCode, navigateToAsset } = useGridContext();

  // Presets and Base Hash
  const [presets, setPresets] = useState<ScenarioPreset[]>([]);
  const [baseHash, setBaseHash] = useState<string>('LOCKED_HASH_INITIALIZING');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Parameter Sliders / Form Controls
  const [scenarioName, setScenarioName] = useState<string>('Custom What-If Scenario');
  const [loadGrowthPct, setLoadGrowthPct] = useState<number>(0);
  const [solarKw, setSolarKw] = useState<number>(0);
  const [evChargerCount, setEvChargerCount] = useState<number>(0);
  const [evChargerKw, setEvChargerKw] = useState<number>(50);
  const [outageLineCode, setOutageLineCode] = useState<string>('NONE');
  const [candidateLines, setCandidateLines] = useState<Array<{ code: string; name?: string }>>([]);

  // Execution State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<ScenarioSimulationResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  // Table Filter State
  const [assetFilter, setAssetFilter] = useState<'ALL' | 'OVERLOADED' | 'LINES' | 'DTRS'>('ALL');

  // Load Presets, Base Hash, and Line Candidates
  useEffect(() => {
    fetchPresetsAndBaseState();
  }, [feederCode]);

  const fetchPresetsAndBaseState = async () => {
    try {
      const [presRes, hashRes, linesRes] = await Promise.all([
        fetch(`/api/v1/scenarios/presets?feeder_code=${encodeURIComponent(feederCode)}`),
        fetch(`/api/v1/scenarios/base-hash?feeder_code=${encodeURIComponent(feederCode)}`),
        fetch(`/api/v1/flisr/faultable-lines?feeder_code=${encodeURIComponent(feederCode)}`),
      ]);

      if (presRes.ok) {
        const presData = await presRes.json();
        setPresets(Array.isArray(presData) ? presData : []);
      }
      if (hashRes.ok) {
        const hashData = await hashRes.json();
        setBaseHash(hashData.base_version_hash || 'LOCKED');
      }
      if (linesRes.ok) {
        const linesData = await linesRes.json();
        setCandidateLines(Array.isArray(linesData) ? linesData : []);
      }

      // Automatically run baseline simulation on initial mount
      handleRunSimulation([
        { mutation_type: 'LOAD_GROWTH', scale_factor: 1.0 },
      ]);
    } catch (err: any) {
      console.error('Failed to initialize scenario sandbox:', err);
    }
  };

  // Preset Selection Handler
  const handleApplyPreset = (preset: ScenarioPreset) => {
    setActivePresetId(preset.preset_id);
    setScenarioName(preset.title);

    // Reset parameters
    setLoadGrowthPct(0);
    setSolarKw(0);
    setEvChargerCount(0);
    setOutageLineCode('NONE');

    // Parse preset mutations into UI controls
    for (const m of preset.mutations) {
      if (m.mutation_type === 'LOAD_GROWTH' && m.scale_factor) {
        setLoadGrowthPct(Math.round((m.scale_factor - 1.0) * 100));
      } else if (m.mutation_type === 'SOLAR_PV' && m.solar_kw) {
        setSolarKw(m.solar_kw);
      } else if (m.mutation_type === 'EV_CHARGING') {
        setEvChargerCount(m.ev_chargers_count || 4);
        setEvChargerKw(m.charger_kw || 50);
      } else if (m.mutation_type === 'LINE_OUTAGE' && m.target_code) {
        setOutageLineCode(m.target_code);
      }
    }

    handleRunSimulation(preset.mutations, preset.title);
  };

  // Build Mutations from UI State and Execute
  const handleCustomSimulate = () => {
    setActivePresetId(null);
    const mutations: ScenarioMutation[] = [];

    if (loadGrowthPct > 0) {
      mutations.push({
        mutation_type: 'LOAD_GROWTH',
        scale_factor: 1.0 + loadGrowthPct / 100.0,
      });
    }

    if (solarKw > 0) {
      mutations.push({
        mutation_type: 'SOLAR_PV',
        solar_kw: solarKw,
        solar_pf: 1.0,
      });
    }

    if (evChargerCount > 0) {
      mutations.push({
        mutation_type: 'EV_CHARGING',
        ev_chargers_count: evChargerCount,
        charger_kw: evChargerKw,
      });
    }

    if (outageLineCode && outageLineCode !== 'NONE') {
      mutations.push({
        mutation_type: 'LINE_OUTAGE',
        target_code: outageLineCode,
      });
    }

    if (mutations.length === 0) {
      mutations.push({ mutation_type: 'LOAD_GROWTH', scale_factor: 1.0 });
    }

    handleRunSimulation(mutations, scenarioName);
  };

  const handleRunSimulation = async (mutations: ScenarioMutation[], name?: string) => {
    setIsSimulating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/scenarios/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feeder_code: feederCode,
          scenario_name: name || scenarioName,
          mutations,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Simulation execution failed');
      }

      const data: ScenarioSimulationResponse = await res.json();
      setSimResult(data);
    } catch (err: any) {
      console.error('Error running scenario simulation:', err);
      setErrorMsg(err.message || 'Error executing AC power flow on mutated sandbox.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetToBaseline = () => {
    setActivePresetId(null);
    setScenarioName('Baseline Feeder Network');
    setLoadGrowthPct(0);
    setSolarKw(0);
    setEvChargerCount(0);
    setOutageLineCode('NONE');
    handleRunSimulation([{ mutation_type: 'LOAD_GROWTH', scale_factor: 1.0 }], 'Baseline Feeder Network');
  };

  const copyTokenToClipboard = () => {
    if (simResult?.reproducibility_token) {
      navigator.clipboard.writeText(simResult.reproducibility_token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Filter Impacted Assets
  const filteredAssets = (simResult?.impacted_elements || []).filter((item) => {
    if (assetFilter === 'OVERLOADED') {
      return item.scenario_status === 'overload' || item.scenario_status === 'violation';
    }
    if (assetFilter === 'LINES') {
      return item.element_type === 'line';
    }
    if (assetFilter === 'DTRS') {
      return item.element_type === 'dtr';
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Header & Immutability Guarantee Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase font-mono tracking-wider text-blue-400 font-bold">
                AC Physics Mutation Engine &bull; TR-SCN-01..04
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                In-Memory Branch Sandbox
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                {gridContext?.regulatory_band || 'SERC ±6%'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1 flex items-center space-x-2.5">
              <GitBranch className="w-6 h-6 text-cyan-400" />
              <span>What-If Scenario Simulator & Branch Sandbox</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Branch-and-mutate sandbox for evaluating DER rooftop solar adoption, EV fast-charging corridors, organic load growth, and N-1 contingencies. Solves AC Newton-Raphson physics while strictly preserving master digital twin immutability.
            </p>
          </div>

          {/* Cryptographic Immutability Shield */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 shrink-0 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-emerald-400">AUTHORITATIVE TWIN LOCKED</span>
                <span className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-1 py-0.2 rounded">
                  TR-SCN-02
                </span>
              </div>
              <div
                className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center space-x-1 cursor-help"
                title={`Master twin SHA-256 state hash: ${baseHash}. Database mutations are strictly prohibited during simulation.`}
              >
                <span>Base SHA-256:</span>
                <span className="text-slate-200 font-semibold">{baseHash.slice(0, 16)}...</span>
              </div>
            </div>
          </div>
        </div>

        {/* Preset Launchers */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 mb-2.5 flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>CURATED SCENARIO PRESETS (ONE-CLICK LAUNCH)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {presets.map((preset) => {
              const isActive = activePresetId === preset.preset_id;
              return (
                <button
                  key={preset.preset_id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isActive
                      ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="truncate pr-1">{preset.title.split('(')[0]}</span>
                    {isActive && <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-1">{preset.category}</div>
                  <div className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                    {preset.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Interactive Multi-Variable Mutation Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Mutation Parameter Sandbox</h2>
            </div>
            <button
              onClick={handleResetToBaseline}
              className="text-[11px] font-mono text-slate-400 hover:text-white transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Scenario Name */}
          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">Scenario Label</label>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Mutation 1: Uniform Load Growth Slider */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <span>Demand Growth</span>
              </span>
              <span className="font-mono text-amber-300 font-bold">
                {loadGrowthPct > 0 ? `+${loadGrowthPct}%` : '0% (Nominal)'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={loadGrowthPct}
              onChange={(e) => setLoadGrowthPct(parseInt(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>0%</span>
              <span>+25%</span>
              <span>+50%</span>
            </div>
          </div>

          {/* Mutation 2: Solar PV Generation Slider */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <Sun className="w-3.5 h-3.5 text-emerald-400" />
                <span>Rooftop Solar PV</span>
              </span>
              <span className="font-mono text-emerald-300 font-bold">
                {solarKw > 0 ? `${solarKw} kW` : '0 kW (None)'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="400"
              step="25"
              value={solarKw}
              onChange={(e) => setSolarKw(parseInt(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>0 kW</span>
              <span>200 kW</span>
              <span>400 kW</span>
            </div>
          </div>

          {/* Mutation 3: EV Fast-Charging Hub */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <BatteryCharging className="w-3.5 h-3.5 text-cyan-400" />
                <span>EV Fast Charging Hub</span>
              </span>
              <span className="font-mono text-cyan-300 font-bold">
                {evChargerCount > 0 ? `${evChargerCount} x ${evChargerKw} kW` : 'None'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[10px] text-slate-500 font-mono block mb-1">Units Count</label>
                <select
                  value={evChargerCount}
                  onChange={(e) => setEvChargerCount(parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-cyan-300 rounded-lg px-2 py-1 font-mono focus:outline-none"
                >
                  <option value="0">0 (Disabled)</option>
                  <option value="2">2 Chargers</option>
                  <option value="4">4 Chargers</option>
                  <option value="6">6 Chargers</option>
                  <option value="8">8 Chargers</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-mono block mb-1">Power Rating</label>
                <select
                  value={evChargerKw}
                  onChange={(e) => setEvChargerKw(parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-cyan-300 rounded-lg px-2 py-1 font-mono focus:outline-none"
                >
                  <option value="22">22 kW (AC Type-2)</option>
                  <option value="50">50 kW (DC CCS-2)</option>
                  <option value="120">120 kW (DC Ultra)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Mutation 4: N-1 Contingency Tripping */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <label className="text-xs text-slate-300 font-medium flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>N-1 Line Outage Contingency</span>
            </label>
            <select
              value={outageLineCode}
              onChange={(e) => setOutageLineCode(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-xs text-rose-300 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none"
            >
              <option value="NONE">No Outage (All Lines In-Service)</option>
              {candidateLines.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} {l.name ? `(${l.name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Execute Button */}
          <button
            onClick={handleCustomSimulate}
            disabled={isSimulating}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 text-white text-xs font-mono font-bold rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
          >
            {isSimulating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>SOLVING AC NEWTON-RAPHSON...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white text-white" />
                <span>SIMULATE WHAT-IF SCENARIO</span>
              </>
            )}
          </button>

          {errorMsg && (
            <div className="bg-rose-950/80 border border-rose-700/80 rounded-xl p-3 text-xs text-rose-300 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* 3. Side-by-Side Comparative Scorecard */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  PHYSICS SIMULATION SCORECARD (TR-SCN-03)
                </span>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2 mt-0.5">
                  <span>Base Twin vs. Scenario Case:</span>
                  <span className="text-cyan-400">{simResult?.scenario_name || scenarioName}</span>
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <StatusBadge status={simResult?.kpis.ac_converged ? 'VALIDATED_FEASIBLE' : 'NOT_FEASIBLE'} />
                <ProvenanceBadge provenance="simulated" />
              </div>
            </div>

            {/* Scorecard KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              {/* Metric 1: Technical Losses */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase">Technical Losses</span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xs text-slate-400 line-through">
                    {simResult?.kpis.base_loss_kw.toFixed(1)} kW
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-base font-bold text-white">
                    {simResult?.kpis.scenario_loss_kw.toFixed(1)} kW
                  </span>
                </div>
                {simResult && (
                  <div
                    className={`inline-block text-[11px] font-mono px-1.5 py-0.5 rounded font-bold ${
                      simResult.kpis.delta_loss_kw <= 0
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {simResult.kpis.delta_loss_kw <= 0 ? '' : '+'}
                    {simResult.kpis.delta_loss_kw.toFixed(1)} kW ({simResult.kpis.delta_loss_pct > 0 ? '+' : ''}
                    {simResult.kpis.delta_loss_pct.toFixed(1)}%)
                  </div>
                )}
              </div>

              {/* Metric 2: Min Voltage */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase">Min Tail Voltage</span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xs text-slate-400 line-through">
                    {simResult?.kpis.base_min_voltage_pu.toFixed(4)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span
                    className={`text-base font-bold ${
                      (simResult?.kpis.scenario_min_voltage_pu || 1.0) < 0.94 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {simResult?.kpis.scenario_min_voltage_pu.toFixed(4)} pu
                  </span>
                </div>
                {simResult && (
                  <div
                    className={`inline-block text-[11px] font-mono px-1.5 py-0.5 rounded font-bold ${
                      simResult.kpis.delta_min_voltage_pu >= 0
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {simResult.kpis.delta_min_voltage_pu >= 0 ? '+' : ''}
                    {simResult.kpis.delta_min_voltage_pu.toFixed(4)} pu
                  </div>
                )}
              </div>

              {/* Metric 3: Max Line Loading */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase">Max Line Ampacity</span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xs text-slate-400 line-through">
                    {simResult?.kpis.base_max_line_loading_pct.toFixed(1)}%
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span
                    className={`text-base font-bold ${
                      (simResult?.kpis.scenario_max_line_loading_pct || 0) > 100
                        ? 'text-rose-400'
                        : (simResult?.kpis.scenario_max_line_loading_pct || 0) > 80
                        ? 'text-amber-400'
                        : 'text-white'
                    }`}
                  >
                    {simResult?.kpis.scenario_max_line_loading_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400">IEEE 738 Ambient Derated</div>
              </div>

              {/* Metric 4: Overload Count */}
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase">Overloaded Assets</span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xs text-slate-400">
                    Base: {simResult?.kpis.base_overloaded_dtrs_count || 0}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span
                    className={`text-base font-bold ${
                      (simResult?.kpis.scenario_overloaded_dtrs_count || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {simResult?.kpis.scenario_overloaded_dtrs_count || 0} Assets
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {simResult?.kpis.delta_overloaded_dtrs && simResult.kpis.delta_overloaded_dtrs > 0
                    ? `+${simResult.kpis.delta_overloaded_dtrs} newly stressed`
                    : 'Within thermal limits'}
                </div>
              </div>
            </div>

            {/* Reproducibility Token & Solver Telemetry */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
              <div className="flex items-center space-x-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  pandapower AC Newton-Raphson &bull; {simResult?.kpis.iterations || 4} iter &bull;{' '}
                  {simResult?.kpis.solver_time_ms.toFixed(1) || 12.5} ms
                </span>
              </div>
              <div className="flex items-center space-x-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <span className="text-slate-500">Reproducibility Token:</span>
                <span className="text-cyan-300 font-semibold">{simResult?.reproducibility_token || 'TOKEN'}</span>
                <button
                  onClick={copyTokenToClipboard}
                  className="text-slate-400 hover:text-white transition-colors"
                  title="Copy token for byte-identical rerun (TR-SCN-04)"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* 4. Impacted Assets & Deep-Linking Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Critical Assets Impact & Variance Table</h3>
                <span className="text-xs font-mono text-slate-400">({filteredAssets.length} elements)</span>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1 text-xs">
                {[
                  { id: 'ALL', label: 'All Elements' },
                  { id: 'OVERLOADED', label: 'Overloaded Only' },
                  { id: 'LINES', label: 'Lines Only' },
                  { id: 'DTRS', label: 'Transformers' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setAssetFilter(t.id as any)}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-colors ${
                      assetFilter === t.id
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2.5">Asset Code (Click to Fly-to Map)</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Base State</th>
                    <th className="px-3 py-2.5">Scenario State</th>
                    <th className="px-3 py-2.5">Variance (Δ)</th>
                    <th className="px-3 py-2.5">Scenario Status</th>
                    <th className="px-3 py-2.5 text-right">Quick Map Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                  {filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500 font-sans text-xs">
                        No assets matching filter or all assets within standard nominal tolerances.
                      </td>
                    </tr>
                  ) : (
                    filteredAssets.map((asset) => (
                      <tr key={asset.code} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-3.5 py-2">
                          <ClickableAsset code={asset.code} feederCode={feederCode} />
                        </td>
                        <td className="px-3 py-2 text-slate-400 uppercase text-[10px]">
                          {asset.element_type}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {asset.base_value.toFixed(1)} {asset.unit}
                        </td>
                        <td className="px-3 py-2 font-bold text-white">
                          {asset.scenario_value.toFixed(1)} {asset.unit}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                              asset.delta_value > 0
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : asset.delta_value < 0
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {asset.delta_value > 0 ? '+' : ''}
                            {asset.delta_value.toFixed(1)} {asset.unit}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              asset.scenario_status === 'overload'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : asset.scenario_status === 'elevated'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            }`}
                          >
                            {asset.scenario_status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => navigateToAsset(asset.code, feederCode)}
                            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium underline inline-flex items-center space-x-1"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
