import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  GitBranch,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  BarChart2,
  Award,
  Split
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { ClickableAsset } from '../components/ClickableAsset';
import { useGridContext } from '../context/GridContext';

/* =========================================================================
   TYPE DEFINITIONS (Matching Backend CAPEX Schemas)
   ========================================================================= */

interface ReconductoringCandidate {
  line_id: string;
  line_code: string;
  length_km: number;
  voltage_kv: number;
  current_conductor: string;
  current_r_ohm_per_km: number;
  current_loading_pct: number;
  recommended_conductor: string;
  recommended_r_ohm_per_km: number;
  resistance_reduction_pct: number;
  base_annual_loss_kwh: number;
  post_annual_loss_kwh: number;
  annual_energy_saved_kwh: number;
  annual_cost_savings_inr: number;
  capital_cost_inr: number;
  simple_payback_years: number;
  npv_15yr_inr: number;
  benefit_cost_ratio: number;
  rank: number;
  provenance: string;
}

interface ReconductoringReport {
  feeder_code: string;
  feeder_name: string;
  timestamp: string;
  cost_per_kwh_inr: number;
  discount_rate_pct: number;
  total_reconductoring_capex_inr: number;
  total_annual_savings_inr: number;
  portfolio_payback_years: number;
  portfolio_npv_15yr_inr: number;
  candidates: ReconductoringCandidate[];
  top_recommended: ReconductoringCandidate[];
}

interface DTROptionEvaluation {
  option_type: 'AUGMENTATION' | 'NEW_SITING' | 'LOAD_SWITCHING';
  title: string;
  description: string;
  capital_cost_inr: number;
  post_loading_pct: number;
  tail_end_voltage_pu: number;
  annual_loss_savings_inr: number;
  payback_years: number;
  npv_15yr_inr: number;
  benefit_cost_ratio: number;
  execution_time_weeks: number;
  is_recommended: boolean;
  status: string;
  recommendation_reason: string;
}

interface DTRInvestmentCandidate {
  dtr_id: string;
  dtr_code: string;
  dtr_name?: string;
  coordinates?: { latitude: number; longitude: number };
  rated_kva: number;
  peak_load_kva: number;
  current_loading_pct: number;
  connected_consumers: number;
  health_index: number;
  tail_end_voltage_pu: number;
  urgency_level: 'HIGH' | 'MEDIUM' | 'MONITOR' | string;
  options: DTROptionEvaluation[];
  recommended_option_type: string;
  primary_justification: string;
}

interface DTRInvestmentReport {
  feeder_code: string;
  feeder_name: string;
  timestamp: string;
  total_dtrs_analyzed: number;
  overloaded_dtrs_count: number;
  dtr_evaluations: DTRInvestmentCandidate[];
}

interface BifurcationSplitCandidate {
  split_id: string;
  rank: number;
  split_node_code: string;
  split_node_location: string;
  coordinates?: { latitude: number; longitude: number };
  express_line_length_km: number;
  load_ratio_split: string;
  feeder_a_peak_kw: number;
  feeder_a_peak_loading_pct: number;
  feeder_a_min_voltage_pu: number;
  feeder_a_loss_reduction_kw: number;
  feeder_b_peak_kw: number;
  feeder_b_peak_loading_pct: number;
  feeder_b_min_voltage_pu: number;
  total_bifurcation_capex_inr: number;
  annual_loss_savings_inr: number;
  simple_payback_years: number;
  npv_15yr_inr: number;
  benefit_cost_ratio: number;
  status: string;
  provenance: string;
}

interface FeederBifurcationReport {
  feeder_code: string;
  feeder_name: string;
  timestamp: string;
  is_bifurcation_triggered: boolean;
  trigger_reasons: string[];
  current_length_km: number;
  current_peak_loading_pct: number;
  current_min_voltage_pu: number;
  load_moment_centroid_coordinates: { latitude: number; longitude: number };
  candidates: BifurcationSplitCandidate[];
  recommended_split?: BifurcationSplitCandidate;
}

interface SensitivityParameterResult {
  parameter_name: string;
  display_name: string;
  unit: string;
  base_value: number;
  low_value: number;
  high_value: number;
  npv_base: number;
  npv_low_case: number;
  npv_high_case: number;
  npv_swing_inr: number;
  payback_base: number;
  payback_low_case: number;
  payback_high_case: number;
}

interface TornadoSensitivityReport {
  portfolio_name: string;
  base_capex_inr: number;
  base_annual_savings_inr: number;
  base_npv_15yr_inr: number;
  base_payback_years: number;
  parameters: SensitivityParameterResult[];
  most_sensitive_parameter: string;
  provenance: string;
}

export const CapexPlanner: React.FC = () => {
  const { gridContext } = useGridContext();
  // Navigation Sub-tab
  const [activeSubTab, setActiveSubTab] = useState<'reconductoring' | 'dtr' | 'bifurcation' | 'tornado'>(() => {
    const params = new URLSearchParams(window.location.search);
    const sub = params.get('subtab');
    if (sub && ['reconductoring', 'dtr', 'bifurcation', 'tornado'].includes(sub)) {
      return sub as any;
    }
    return 'reconductoring';
  });

  // Shared Parameters
  const feederCode = gridContext?.feeder_code || '2011951';
  const [costPerKwh, setCostPerKwh] = useState<number>(5.50);
  const [discountRate, setDiscountRate] = useState<number>(10.0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Data States
  const [reconductoringData, setReconductoringData] = useState<ReconductoringReport | null>(null);
  const [dtrData, setDtrData] = useState<DTRInvestmentReport | null>(null);
  const [selectedDtr, setSelectedDtr] = useState<DTRInvestmentCandidate | null>(null);
  const [bifurcationData, setBifurcationData] = useState<FeederBifurcationReport | null>(null);
  const [selectedSplit, setSelectedSplit] = useState<BifurcationSplitCandidate | null>(null);
  const [tornadoData, setTornadoData] = useState<TornadoSensitivityReport | null>(null);

  // Fetch all CAPEX intelligence on mount or parameter change
  useEffect(() => {
    fetchAllCapexData();
  }, [costPerKwh, discountRate, feederCode]);

  const fetchAllCapexData = async () => {
    setIsLoading(true);
    try {
      const [recRes, dtrRes, bifRes, torRes] = await Promise.all([
        fetch(`/api/v1/capex/reconductoring-ranks?feeder_code=${feederCode}&cost_per_kwh_inr=${costPerKwh}&discount_rate_pct=${discountRate}`),
        fetch(`/api/v1/capex/dtr-investments?feeder_code=${feederCode}&cost_per_kwh_inr=${costPerKwh}&discount_rate_pct=${discountRate}`),
        fetch(`/api/v1/capex/bifurcation?feeder_code=${feederCode}&cost_per_kwh_inr=${costPerKwh}&discount_rate_pct=${discountRate}`),
        fetch('/api/v1/capex/sensitivity-tornado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_capex_inr: 2450000.0,
            base_annual_savings_inr: 425000.0,
            base_cost_per_kwh: costPerKwh,
            base_discount_rate_pct: discountRate,
            base_growth_rate_pct: 3.5,
            portfolio_name: `${gridContext?.feeder_name || 'Active Feeder'} CAPEX Program`,
          }),
        }),
      ]);

      if (recRes.ok) {
        const data = await recRes.json();
        setReconductoringData(data);
      }

      if (dtrRes.ok) {
        const data: DTRInvestmentReport = await dtrRes.json();
        setDtrData(data);
        if (data.dtr_evaluations && data.dtr_evaluations.length > 0) {
          setSelectedDtr(data.dtr_evaluations[0]);
        }
      }

      if (bifRes.ok) {
        const data: FeederBifurcationReport = await bifRes.json();
        setBifurcationData(data);
        if (data.recommended_split) {
          setSelectedSplit(data.recommended_split);
        } else if (data.candidates && data.candidates.length > 0) {
          setSelectedSplit(data.candidates[0]);
        }
      }

      if (torRes.ok) {
        const data = await torRes.json();
        setTornadoData(data);
      }
    } catch (err) {
      console.error('Failed to load CAPEX intelligence data', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Advisory & Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-800">
                Tier 1 Screen 4 &bull; Milestone 9
              </span>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                15-Year NPV & Payback Engine
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1 flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>CAPEX Intelligence & Asset Investment Planner</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Data-driven capital expenditure optimization for distribution utilities: Feeder bifurcation centroid analysis,
              3-way DTR alternative decision matrix, conductor reconductoring payback ranker, and tornado sensitivity.
            </p>
          </div>

          {/* Module Switcher Buttons */}
          <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-xl shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveSubTab('reconductoring')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeSubTab === 'reconductoring'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              <span>Reconductoring Ranker</span>
            </button>

            <button
              onClick={() => setActiveSubTab('dtr')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeSubTab === 'dtr'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>3-Way DTR Decisions</span>
            </button>

            <button
              onClick={() => setActiveSubTab('bifurcation')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeSubTab === 'bifurcation'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Split className="w-4 h-4" />
              <span>Feeder Bifurcation</span>
            </button>

            <button
              onClick={() => setActiveSubTab('tornado')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                activeSubTab === 'tornado'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              <span>Tornado Sensitivity</span>
            </button>
          </div>
        </div>

        {/* Global Parameter Controls & Feeder Context Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-800/80 text-xs font-mono">
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">TARGET FEEDER</span>
            <span className="font-bold text-white">{gridContext?.feeder_name || 'Feeder'}</span>
            <span className="text-slate-400 block text-[10px]">Code: {feederCode} (11 kV)</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">CONNECTED ASSETS</span>
            <span className="font-bold text-cyan-400">
              {reconductoringData?.candidates?.length || 33} HT Lines &bull; {dtrData?.dtr_evaluations?.length || 4} DTRs
            </span>
            <span className="text-slate-400 block text-[10px]">
              ~{(dtrData?.dtr_evaluations?.length || 4) * 690} Consumers
            </span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg flex flex-col justify-between">
            <span className="text-slate-500 block text-[10px]">LOSS VALUATION (ACoS)</span>
            <div className="flex items-center space-x-1">
              <span className="text-yellow-400 font-bold">₹</span>
              <input
                type="number"
                step="0.5"
                min="3.0"
                max="9.0"
                value={costPerKwh}
                onChange={(e) => setCostPerKwh(parseFloat(e.target.value) || 5.50)}
                className="w-12 bg-transparent text-yellow-300 font-bold outline-none"
              />
              <span className="text-slate-400 text-[10px]">/ kWh</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg flex flex-col justify-between">
            <span className="text-slate-500 block text-[10px]">DISCOUNT RATE (WACC)</span>
            <div className="flex items-center space-x-1">
              <input
                type="number"
                step="0.5"
                min="5.0"
                max="15.0"
                value={discountRate}
                onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 10.0)}
                className="w-10 bg-transparent text-emerald-400 font-bold outline-none"
              />
              <span className="text-slate-400 font-bold">%</span>
              <span className="text-slate-500 text-[10px] ml-1">15-Yr Horizon</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <span className="text-slate-500 block text-[10px]">FINANCIAL METRIC</span>
            <span className="font-bold text-purple-400">NPV + Simple Payback</span>
            <span className="text-slate-400 block text-[10px]">{gridContext?.regulatory_body || 'SERC'} Regulated</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg flex items-center justify-center">
            <button
              onClick={fetchAllCapexData}
              disabled={isLoading}
              className="w-full h-full flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-xs shadow transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Computing...' : 'Recalculate'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: CONDUCTOR RECONDUCTORING RANKER (TR-CPX-03, TR-CPX-04)
          ========================================================================= */}
      {activeSubTab === 'reconductoring' && reconductoringData && (
        <div className="space-y-6">
          {/* Portfolio Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                PORTFOLIO RECONDUCTORING CAPEX
              </span>
              <div className="text-2xl font-bold text-white font-mono mt-1">
                ₹{reconductoringData.total_reconductoring_capex_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-1">
                Top {reconductoringData.top_recommended.length} priority segments
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                ANNUAL LOSS MONETARY SAVINGS
              </span>
              <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                ₹{reconductoringData.total_annual_savings_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / yr
              </div>
              <div className="text-xs text-slate-400 font-mono mt-1">
                Valued at ₹{costPerKwh.toFixed(2)} / kWh
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                PORTFOLIO SIMPLE PAYBACK
              </span>
              <div className="text-2xl font-bold text-cyan-300 font-mono mt-1">
                {reconductoringData.portfolio_payback_years.toFixed(2)} Years
              </div>
              <div className="text-xs text-emerald-400 font-mono mt-1">
                High capital turnaround efficiency
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                15-YEAR NET PRESENT VALUE (NPV)
              </span>
              <div className="text-2xl font-bold text-purple-400 font-mono mt-1">
                ₹{reconductoringData.portfolio_npv_15yr_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-1">
                Discounted at {discountRate}% WACC
              </div>
            </div>
          </div>

          {/* Ranked Reconductoring Candidates Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Conductor Upgrade Priority Ranking (Benefit-Cost Ratio)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Line segments ranked by annual technical loss savings divided by reconductoring replacement cost (TR-CPX-03).
                </p>
              </div>
              <span className="text-xs font-mono text-blue-300 bg-blue-950 border border-blue-800 px-2 py-0.5 rounded self-start">
                {reconductoringData.candidates.length} Lines Evaluated
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-left bg-slate-950/60">
                    <th className="p-3">RANK</th>
                    <th className="p-3">LINE CODE</th>
                    <th className="p-3">LENGTH</th>
                    <th className="p-3">UPGRADE TRANSITION</th>
                    <th className="p-3">RESISTANCE Δ</th>
                    <th className="p-3">ANNUAL SAVINGS</th>
                    <th className="p-3">CAPEX (₹)</th>
                    <th className="p-3">PAYBACK</th>
                    <th className="p-3">15-YR NPV</th>
                    <th className="p-3">BCR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {reconductoringData.candidates.slice(0, 10).map((cand) => (
                    <tr
                      key={cand.line_id}
                      className="hover:bg-slate-950/80 transition-colors"
                    >
                      <td className="p-3">
                        <span
                          className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-[11px] ${
                            cand.rank === 1
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                              : cand.rank <= 3
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          #{cand.rank}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-white">
                        <ClickableAsset code={cand.line_code} feederCode={feederCode} badge="LINE" />
                      </td>
                      <td className="p-3 text-slate-300">{(cand.length_km * 1000).toFixed(0)} m</td>
                      <td className="p-3">
                        <span className="text-slate-400">{cand.current_conductor}</span>
                        <ArrowRight className="w-3 h-3 inline mx-1.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">{cand.recommended_conductor}</span>
                      </td>
                      <td className="p-3 text-cyan-300">-{cand.resistance_reduction_pct.toFixed(1)}%</td>
                      <td className="p-3 text-emerald-400 font-bold">
                        ₹{cand.annual_cost_savings_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / yr
                      </td>
                      <td className="p-3 text-slate-200">
                        ₹{cand.capital_cost_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3">
                        <span className="text-amber-300 font-bold">{cand.simple_payback_years.toFixed(2)} yrs</span>
                      </td>
                      <td className="p-3 text-purple-300">
                        ₹{cand.npv_15yr_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3">
                        <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                          {cand.benefit_cost_ratio.toFixed(2)}x
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: 3-WAY DTR DECISION MATRIX (TR-CPX-02)
          ========================================================================= */}
      {activeSubTab === 'dtr' && dtrData && (
        <div className="space-y-6">
          {/* Transformer Selector Pills */}
          <div className="flex items-center space-x-3 overflow-x-auto pb-1">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider shrink-0">
              Select Transformer:
            </span>
            {dtrData.dtr_evaluations.map((cand) => {
              const isSelected = selectedDtr?.dtr_id === cand.dtr_id;
              return (
                <button
                  key={cand.dtr_id}
                  onClick={() => setSelectedDtr(cand)}
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                    isSelected
                      ? 'bg-emerald-950/80 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="font-bold">{cand.dtr_name ? `${cand.dtr_name} (${cand.dtr_code})` : cand.dtr_code}</span>
                  <span className="text-[10px] text-slate-400">({cand.rated_kva} kVA)</span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                      cand.urgency_level === 'HIGH'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : cand.urgency_level === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {cand.urgency_level}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected DTR Telemetry Strip */}
          {selectedDtr && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">SELECTED ASSET:</span>
                  <ClickableAsset
                    code={selectedDtr.dtr_code}
                    name={selectedDtr.dtr_name}
                    feederCode={feederCode}
                    badge="DTR"
                  />
                </div>
                <ClickableAsset
                  code={selectedDtr.dtr_code}
                  feederCode={feederCode}
                  className="bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded text-[11px]"
                >
                  Inspect on Digital Twin Map &rarr;
                </ClickableAsset>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <div>
                <span className="text-slate-500 block text-[10px]">CURRENT RATING</span>
                <span className="font-bold text-white">{selectedDtr.rated_kva} kVA</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">PEAK LOADING</span>
                <span className={`font-bold ${selectedDtr.current_loading_pct > 100 ? 'text-rose-400' : 'text-amber-400'}`}>
                  {selectedDtr.current_loading_pct.toFixed(1)}% ({selectedDtr.peak_load_kva.toFixed(1)} kVA)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TAIL-END VOLTAGE</span>
                <span className={`font-bold ${selectedDtr.tail_end_voltage_pu < 0.94 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {selectedDtr.tail_end_voltage_pu.toFixed(3)} pu
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">HEALTH INDEX</span>
                <span className="font-bold text-cyan-300">{selectedDtr.health_index.toFixed(1)} / 100</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">CONNECTED USERS</span>
                <span className="font-bold text-slate-200">{selectedDtr.connected_consumers} Consumers</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">PRIMARY JUSTIFICATION</span>
                <span className="text-[11px] text-emerald-400 font-semibold truncate block" title={selectedDtr.primary_justification}>
                  {selectedDtr.recommended_option_type}
                </span>
              </div>
            </div>
            </div>
          )}

          {/* 3-Way Alternative Comparison Cards */}
          {selectedDtr && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {selectedDtr.options.map((opt) => {
                const isRec = opt.is_recommended;
                return (
                  <div
                    key={opt.option_type}
                    className={`rounded-2xl p-5 border flex flex-col justify-between transition-all relative overflow-hidden ${
                      isRec
                        ? 'bg-slate-900 border-emerald-500 shadow-xl ring-1 ring-emerald-500/50'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    {isRec && (
                      <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-mono font-bold px-3 py-1 rounded-bl-lg">
                        RECOMMENDED OPTION
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          {opt.option_type.replace('_', ' ')}
                        </span>
                        <h4 className="text-base font-bold text-white mt-0.5">{opt.title}</h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {opt.description}
                        </p>
                      </div>

                      {/* Financial & Technical Metrics */}
                      <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Capital Expenditure:</span>
                          <span className="font-bold text-white">
                            ₹{opt.capital_cost_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Post-Action Loading:</span>
                          <span className="font-bold text-cyan-300">{opt.post_loading_pct.toFixed(1)}%</span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Tail-End Voltage:</span>
                          <span className="font-bold text-emerald-400">{opt.tail_end_voltage_pu.toFixed(3)} pu</span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Annual Loss Savings:</span>
                          <span className="font-bold text-emerald-400">
                            ₹{opt.annual_loss_savings_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / yr
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Simple Payback:</span>
                          <span className="font-bold text-amber-300">{opt.payback_years.toFixed(2)} Years</span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">15-Year NPV:</span>
                          <span className="font-bold text-purple-300">
                            ₹{opt.npv_15yr_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Benefit-Cost Ratio:</span>
                          <span className="font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            {opt.benefit_cost_ratio.toFixed(2)}x
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Execution Timeline:</span>
                          <span className="text-slate-300">{opt.execution_time_weeks} Weeks</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                      <strong className="text-slate-300">Rationale: </strong>
                      {opt.recommendation_reason}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: FEEDER BIFURCATION PLANNER (TR-CPX-01)
          ========================================================================= */}
      {activeSubTab === 'bifurcation' && bifurcationData && (
        <div className="space-y-6">
          {/* Bifurcation Trigger Status Banner */}
          <div
            className={`border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              bifurcationData.is_bifurcation_triggered
                ? 'bg-amber-950/40 border-amber-600/80 text-amber-200'
                : 'bg-emerald-950/40 border-emerald-600/80 text-emerald-200'
            }`}
          >
            <div className="flex items-start space-x-3">
              {bifurcationData.is_bifurcation_triggered ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className="text-sm font-bold text-white">
                  {bifurcationData.is_bifurcation_triggered
                    ? 'Feeder Bifurcation Criteria Triggered (Action Recommended)'
                    : 'Feeder Operating Within Radial Ampacity Limits'}
                </h4>
                <div className="text-xs text-slate-300 mt-1 space-y-0.5">
                  {bifurcationData.trigger_reasons.map((r, i) => (
                    <div key={i}>&bull; {r}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-right text-xs font-mono shrink-0">
              <span className="text-slate-400 block text-[10px]">LOAD-MOMENT CENTROID</span>
              <span className="font-bold text-white">
                {bifurcationData.load_moment_centroid_coordinates.latitude.toFixed(4)}°N,{' '}
                {bifurcationData.load_moment_centroid_coordinates.longitude.toFixed(4)}°E
              </span>
            </div>
          </div>

          {/* Bifurcation Candidate Split Points */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Split Plans List (5 cols) */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Split className="w-4 h-4 text-purple-400" />
                    <span>Candidate Graph-Cut Splits</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluated by load-moment centroid & new express line length
                  </p>
                </div>
                <span className="text-xs font-mono text-purple-300 bg-purple-950 border border-purple-800 px-2 py-0.5 rounded">
                  {bifurcationData.candidates.length} Candidates
                </span>
              </div>

              <div className="space-y-3">
                {bifurcationData.candidates.map((split) => {
                  const isSelected = selectedSplit?.split_id === split.split_id;
                  return (
                    <div
                      key={split.split_id}
                      onClick={() => setSelectedSplit(split)}
                      className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                              split.rank === 1
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            #{split.rank}
                          </span>
                          <span className="text-sm font-bold text-white font-mono">{split.split_id}</span>
                          {split.rank === 1 && (
                            <span className="text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700 px-1.5 py-0.2 rounded">
                              OPTIMAL CUT
                            </span>
                          )}
                        </div>
                        <StatusBadge status={split.status} />
                      </div>

                      <div className="text-xs text-slate-300 font-mono mt-2 space-y-0.5">
                        <div>
                          Node: <ClickableAsset code={split.split_node_code} feederCode={feederCode} badge="BUS" /> &bull;{' '}
                          <strong className="text-white">{split.split_node_location}</strong>
                        </div>
                        {split.coordinates && (
                          <div className="text-[10px] text-slate-400">
                            GPS: {split.coordinates.latitude.toFixed(6)}°N, {split.coordinates.longitude.toFixed(6)}°E
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
                        <div>
                          <span className="text-slate-500 block text-[10px]">LOAD SPLIT</span>
                          <span className="text-cyan-300 font-bold">{split.load_ratio_split}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">EXPRESS LINE</span>
                          <span className="text-white font-bold">{split.express_line_length_km} km</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">PAYBACK</span>
                          <span className="text-amber-300 font-bold">{split.simple_payback_years.toFixed(1)} yrs</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Split Plan Deep-Dive & Topology Schematic (7 cols) */}
            {selectedSplit && (
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Bifurcation Plan: {selectedSplit.split_id} ({selectedSplit.split_node_location})
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Substation 11 kV Bay + {selectedSplit.express_line_length_km} km Express Line + Terminal Switch
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded font-bold">
                    BCR: {selectedSplit.benefit_cost_ratio.toFixed(2)}x
                  </span>
                </div>

                {/* Sub-Feeder Post-Split Balances */}
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="text-blue-400 font-bold uppercase text-[11px]">Original Feeder (A)</div>
                    <div className="text-slate-400">Peak Load: <strong className="text-white">{selectedSplit.feeder_a_peak_kw} kW</strong></div>
                    <div className="text-slate-400">Utilization: <strong className="text-cyan-300">{selectedSplit.feeder_a_peak_loading_pct}%</strong></div>
                    <div className="text-slate-400">Min Voltage: <strong className="text-emerald-400">{selectedSplit.feeder_a_min_voltage_pu} pu</strong></div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                    <div className="text-purple-400 font-bold uppercase text-[11px]">New Express Feeder (B)</div>
                    <div className="text-slate-400">Peak Load: <strong className="text-white">{selectedSplit.feeder_b_peak_kw} kW</strong></div>
                    <div className="text-slate-400">Utilization: <strong className="text-cyan-300">{selectedSplit.feeder_b_peak_loading_pct}%</strong></div>
                    <div className="text-slate-400">Min Voltage: <strong className="text-emerald-400">{selectedSplit.feeder_b_min_voltage_pu} pu</strong></div>
                  </div>
                </div>

                {/* Financial Overview */}
                <div className="grid grid-cols-3 gap-3 text-xs font-mono bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-500 block text-[10px]">TOTAL BIFURCATION CAPEX</span>
                    <span className="text-white font-bold text-sm">
                      ₹{selectedSplit.total_bifurcation_capex_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ANNUAL LOSS SAVINGS</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ₹{selectedSplit.annual_loss_savings_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">15-YEAR NPV</span>
                    <span className="text-purple-300 font-bold text-sm">
                      ₹{selectedSplit.npv_15yr_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* Visual Schematic Diagram */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto">
                  <svg className="w-full min-w-[500px] h-40 select-none font-mono text-xs" viewBox="0 0 650 160">
                    {/* Substation Bus */}
                    <rect x="30" y="30" width="14" height="100" fill="#f59e0b" rx="2" />
                    <text x="37" y="145" fill="#fbbf24" textAnchor="middle" fontSize="9" fontWeight="bold">
                      SUBSTATION
                    </text>

                    {/* Original Feeder (A) Trunk */}
                    <line x1="44" y1="50" x2="280" y2="50" stroke="#06b6d4" strokeWidth="3" />
                    <circle cx="280" cy="50" r="6" fill="#0f172a" stroke="#ef4444" strokeWidth="2.5" />
                    <text x="160" y="42" fill="#64748b" textAnchor="middle" fontSize="9">
                      FEEDER A (Original Trunk)
                    </text>
                    <text x="280" y="35" fill="#ef4444" textAnchor="middle" fontSize="8" fontWeight="bold">
                      SPLIT CUT
                    </text>

                    {/* Downstream Cluster (Feeder A) */}
                    <line x1="280" y1="50" x2="420" y2="50" stroke="#06b6d4" strokeWidth="2" strokeDasharray="3 3" />
                    <rect x="420" y="40" width="50" height="22" rx="4" fill="#0284c7" />
                    <text x="445" y="55" fill="#ffffff" textAnchor="middle" fontSize="9" fontWeight="bold">
                      ZONE A
                    </text>

                    {/* Proposed Express Feeder (B) from Substation */}
                    <path
                      d="M 44 110 L 280 110 L 450 110"
                      fill="none"
                      stroke="#a855f7"
                      strokeWidth="3"
                    />
                    <text x="160" y="102" fill="#c084fc" textAnchor="middle" fontSize="9" fontWeight="bold">
                      NEW EXPRESS FEEDER B ({selectedSplit.express_line_length_km} km)
                    </text>
                    <rect x="450" y="100" width="50" height="22" rx="4" fill="#7e22ce" />
                    <text x="475" y="115" fill="#ffffff" textAnchor="middle" fontSize="9" fontWeight="bold">
                      ZONE B
                    </text>
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: TORNADO SENSITIVITY ENGINE (TR-CPX-06)
          ========================================================================= */}
      {activeSubTab === 'tornado' && tornadoData && (
        <div className="space-y-6">
          {/* Base Portfolio Summary Strip */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-500 block text-[10px]">BASE PORTFOLIO CAPEX</span>
              <span className="text-white font-bold text-base">
                ₹{tornadoData.base_capex_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">BASE ANNUAL SAVINGS</span>
              <span className="text-emerald-400 font-bold text-base">
                ₹{tornadoData.base_annual_savings_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">BASE 15-YR NPV</span>
              <span className="text-purple-300 font-bold text-base">
                ₹{tornadoData.base_npv_15yr_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">MOST SENSITIVE DRIVER</span>
              <span className="text-yellow-400 font-bold text-xs truncate block" title={tornadoData.most_sensitive_parameter}>
                {tornadoData.most_sensitive_parameter}
              </span>
            </div>
          </div>

          {/* Tornado Visual Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <BarChart2 className="w-4 h-4 text-amber-400" />
                <span>15-Year Portfolio NPV Tornado Sensitivity Analysis</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluates volatility in Net Present Value (NPV) across key regulatory, financial, and physical variables (TR-CPX-06).
              </p>
            </div>

            {/* Tornado Bars */}
            <div className="space-y-5">
              {tornadoData.parameters.map((param) => {
                const maxSwing = tornadoData.parameters[0].npv_swing_inr || 1.0;
                const swingRatio = (param.npv_swing_inr / maxSwing) * 100.0;

                return (
                  <div key={param.parameter_name} className="space-y-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-bold text-white">{param.display_name}</span>
                      <span className="text-slate-400">
                        Swing: <strong className="text-yellow-400">₹{param.npv_swing_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-12 gap-3 items-center">
                      {/* Low Case Value */}
                      <div className="col-span-3 text-right text-[11px] text-slate-400">
                        Low Case ({param.low_value} {param.unit}):{' '}
                        <strong className="text-rose-400">
                          ₹{param.npv_low_case.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>

                      {/* Visual Bar */}
                      <div className="col-span-6 bg-slate-950 h-6 rounded-lg border border-slate-800 flex items-center p-1 relative overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500/80 via-yellow-500/80 to-emerald-500/80 rounded"
                          style={{ width: `${Math.max(15, swingRatio)}%`, margin: '0 auto' }}
                        />
                      </div>

                      {/* High Case Value */}
                      <div className="col-span-3 text-left text-[11px] text-slate-400">
                        High Case ({param.high_value} {param.unit}):{' '}
                        <strong className="text-emerald-400">
                          ₹{param.npv_high_case.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapexPlanner;
