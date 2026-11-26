import React, { useState } from 'react';
import {
  Zap,
  ShieldAlert,
  Play,
  CheckCircle2,
  Flame,
  Activity,
  ChevronDown,
  Thermometer,
  HelpCircle,
  X,
  BookOpen,
} from 'lucide-react';
import { useGridContext } from '../context/GridContext';

export interface PowerFlowSummaryData {
  feeder_code: string;
  converged: boolean;
  algorithm: string;
  iterations: number;
  total_active_load_kw: number;
  total_active_loss_kw: number;
  total_active_loss_mw: number;
  loss_percentage: number;
  slack_active_power_mw: number;
  slack_power_balance_error_mw: number;
  min_voltage_pu: number;
  min_voltage_bus_code: string;
  max_voltage_pu: number;
  max_voltage_bus_code: string;
  voltage_violations_count: number;
  voltage_warnings_count: number;
  line_overloads_count: number;
  trafo_overloads_count: number;
  execution_time_ms: number;
  lines: Array<{
    line_code: string;
    loading_percent: number;
    current_ka: number;
    max_i_ka: number;
    active_loss_kw: number;
    reactive_loss_kvar: number;
    status: 'normal' | 'elevated' | 'overload' | 'emergency';
  }>;
  buses: Array<{
    bus_code: string;
    vm_pu: number;
    voltage_deviation_pct: number;
    status: 'normal' | 'warning' | 'violation';
  }>;
}

interface PhysicsSimulationBarProps {
  feederCode: string;
  isSimulating: boolean;
  powerFlowData: PowerFlowSummaryData | null;
  onRunPowerFlow: (loadMultiplier: number, ambientTempC: number) => void;
  onOpenContingencyModal: () => void;
  heatmapActive: boolean;
  onToggleHeatmap: (active: boolean) => void;
  isLayersCollapsed?: boolean;
  className?: string;
}

export const PhysicsSimulationBar: React.FC<PhysicsSimulationBarProps> = ({
  feederCode,
  isSimulating,
  powerFlowData,
  onRunPowerFlow,
  onOpenContingencyModal,
  heatmapActive,
  onToggleHeatmap,
  isLayersCollapsed = false,
  className,
}) => {
  const { gridContext } = useGridContext();
  const [loadMultiplier, setLoadMultiplier] = useState<number>(1.0);
  const [ambientTempC, setAmbientTempC] = useState<number>(35.0);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);

  return (
    <>
      <div
        className={`absolute top-[56px] ${
          isLayersCollapsed ? 'left-24' : 'left-[234px]'
        } right-3 z-[650] pointer-events-none transition-all duration-300 ${className || ''}`}
      >
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden pointer-events-auto transition-all duration-200">
          {/* Top Control Bar */}
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white tracking-wide">
                    GRID PHYSICS SIMULATION CORE
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                    AC Newton-Raphson
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                    {gridContext?.regulatory_band || 'SERC ±6%'} (TR-PHY-03)
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons & Scenario Adjusters */}
            <div className="flex items-center space-x-2 text-xs">
              {/* Load Scale Selector */}
              <div className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-700 px-2 py-1 rounded-lg">
                <span className="text-[11px] text-slate-400 font-mono">Load:</span>
                <select
                  value={loadMultiplier}
                  onChange={(e) => setLoadMultiplier(parseFloat(e.target.value))}
                  className="bg-transparent text-cyan-300 font-mono text-xs focus:outline-none cursor-pointer"
                >
                  <option value="0.8" className="bg-slate-900 text-white">0.8x (Off-Peak)</option>
                  <option value="1.0" className="bg-slate-900 text-white">1.0x (Normal Base)</option>
                  <option value="1.25" className="bg-slate-900 text-white">1.25x (Elevated)</option>
                  <option value="1.5" className="bg-slate-900 text-white">1.50x (Peak Summer)</option>
                  <option value="2.0" className="bg-slate-900 text-white">2.00x (Stress Overload)</option>
                </select>
              </div>

              {/* Ambient Temperature Selector (IEEE 738 derating) */}
              <div className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-700 px-2 py-1 rounded-lg">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                <select
                  value={ambientTempC}
                  onChange={(e) => setAmbientTempC(parseFloat(e.target.value))}
                  className="bg-transparent text-amber-300 font-mono text-xs focus:outline-none cursor-pointer"
                >
                  <option value="30" className="bg-slate-900 text-white">30&deg;C (Winter)</option>
                  <option value="35" className="bg-slate-900 text-white">35&deg;C (Standard)</option>
                  <option value="42" className="bg-slate-900 text-white">42&deg;C (Summer Peak)</option>
                  <option value="48" className="bg-slate-900 text-white">48&deg;C (Heatwave)</option>
                </select>
              </div>

              {/* Heatmap Toggle */}
              <button
                onClick={() => onToggleHeatmap(!heatmapActive)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold flex items-center space-x-1 border transition-colors ${
                  heatmapActive
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{heatmapActive ? 'Heatmap ON' : 'Heatmap OFF'}</span>
              </button>

              {/* N-1 Contingency Button */}
              <button
                onClick={onOpenContingencyModal}
                className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-lg font-mono text-[11px] font-semibold flex items-center space-x-1 transition-colors"
                title="Run single-line outage contingency screening"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>N-1 Screening</span>
              </button>

              {/* Run Power Flow Button */}
              <button
                onClick={() => onRunPowerFlow(loadMultiplier, ambientTempC)}
                disabled={isSimulating}
                className={`px-3 py-1 rounded-lg font-mono text-xs font-bold flex items-center space-x-1.5 shadow-lg transition-all ${
                  isSimulating
                    ? 'bg-cyan-700 text-cyan-200 cursor-not-allowed opacity-75'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 active:scale-95'
                }`}
              >
                {isSimulating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>SOLVING...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>RUN POWER FLOW</span>
                  </>
                )}
              </button>

              {/* Guide / How It Works Button */}
              <button
                onClick={() => setIsGuideOpen(true)}
                className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition-colors"
                title="What is Power Flow and N-1 Screening? (User Guide)"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {/* Collapse / Expand Toggle */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              >
                <ChevronDown className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* HUD Metrics Banner (Expanded) */}
          {isExpanded && (
            <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800/60 flex flex-col gap-1.5 text-xs font-mono">
              {powerFlowData ? (
                <>
                  <div className="flex items-center space-x-6 w-full justify-between">
                    {/* Solver Status */}
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <div>
                        <span className="text-[10px] text-slate-400 block leading-tight">SOLVER STATUS</span>
                        <span className="text-emerald-400 font-bold">
                          CONVERGED ({powerFlowData.algorithm.toUpperCase()}) &bull; {powerFlowData.execution_time_ms} ms
                        </span>
                      </div>
                    </div>

                    {/* Total Loss */}
                    <div>
                      <span className="text-[10px] text-slate-400 block leading-tight">TECHNICAL LOSS (I&sup2;R)</span>
                      <span className="text-cyan-300 font-bold">
                        {powerFlowData.total_active_loss_kw.toFixed(2)} kW{' '}
                        <span className="text-[11px] text-cyan-400/80 font-normal">
                          ({powerFlowData.loss_percentage.toFixed(2)}%)
                        </span>
                      </span>
                    </div>

                    {/* Min Voltage */}
                    <div>
                      <span className="text-[10px] text-slate-400 block leading-tight">MIN SYSTEM VOLTAGE</span>
                      <span
                        className={`font-bold ${
                          powerFlowData.min_voltage_pu < 0.94
                            ? 'text-rose-400'
                            : powerFlowData.min_voltage_pu < 0.95
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {powerFlowData.min_voltage_pu.toFixed(4)} p.u.{' '}
                        <span className="text-[10px] text-slate-400 font-normal">
                          (@ {powerFlowData.min_voltage_bus_code})
                        </span>
                      </span>
                    </div>

                    {/* Active Loss Balance Error */}
                    <div>
                      <span className="text-[10px] text-slate-400 block leading-tight">LOSS BALANCE &Delta;P</span>
                      <span className="text-emerald-400 font-bold">
                        {powerFlowData.slack_power_balance_error_mw.toExponential(2)} MW{' '}
                        <span className="text-[10px] text-emerald-400/80 font-normal">(&le;10&minus;&sup4;)</span>
                      </span>
                    </div>

                    {/* Overloads & Violations */}
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block leading-tight">VIOLATIONS</span>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            powerFlowData.line_overloads_count > 0
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {powerFlowData.line_overloads_count} Overloads
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            powerFlowData.voltage_violations_count > 0
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {powerFlowData.voltage_violations_count} Voltage
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Heatmap Legend Bar */}
                  {heatmapActive && (
                    <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-sans">
                      <span className="font-mono text-slate-400 text-[10px] font-semibold uppercase">
                        Conductor Loading Heatmap:
                      </span>
                      <div className="flex items-center space-x-3 text-[10px] font-mono">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block shadow-sm"></span> &le;20% Low
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block shadow-sm"></span> 20-50% Med
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block shadow-sm"></span> 50-80% Elevated
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block shadow-sm"></span> 80-100% Near-Limit
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block shadow-sm"></span> &gt;100% Overload
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between w-full text-slate-400 py-1">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span>
                      Physics Core ready for feeder <strong>{feederCode}</strong>. Executing Newton-Raphson simulation...
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Ambient corrected per IEEE 738 &bull; Statutory bounds 0.94 - 1.06 p.u.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Educational Guide Modal: What is Power Flow & N-1 Screening? */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Grid Physics & Simulation Guide
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Understanding AC Power Flow, Heatmaps, and N-1 Outage Screening
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300 leading-relaxed font-sans">
              {/* Card 1: AC Power Flow */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm">
                  <Zap className="w-4 h-4" />
                  <h4>1. What is AC Newton-Raphson Power Flow?</h4>
                </div>
                <p className="text-slate-300 text-xs">
                  Electricity is not an abstract number &mdash; it follows Kirchhoff&rsquo;s and Ohm&rsquo;s laws.
                  When customers use power, electricity flows from the 33/11 kV Substation down along the wires to the transformers (DTRs).
                </p>
                <p className="text-slate-400 text-xs">
                  The <strong>AC Newton-Raphson solver</strong> calculates:
                </p>
                <ul className="list-disc list-inside text-slate-300 space-y-1 font-mono text-[11px]">
                  <li><strong>Bus Voltages (V):</strong> Checks that voltage at every pole stays within the statutory &plusmn;6.0% band (0.94 &ndash; 1.06 p.u.) per {gridContext?.regulatory_body || 'SERC'} regulations.</li>
                  <li><strong>Conductor Currents (A):</strong> Computes the exact amperage flowing through each cable.</li>
                  <li><strong>Technical Losses (kW):</strong> Calculates energy wasted as conductor heat (I&sup2;R).</li>
                </ul>
              </div>

              {/* Card 2: Heatmap */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                  <Flame className="w-4 h-4" />
                  <h4>2. What Does the Loading Heatmap Show?</h4>
                </div>
                <p className="text-slate-300 text-xs">
                  The heatmap visually colors every wire based on its percentage thermal loading against its rated conductor ampacity:
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                  <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span>
                    <span>&le; 20%: Light loading / excess capacity</span>
                  </div>
                  <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-cyan-500 inline-block"></span>
                    <span>20 &ndash; 50%: Normal moderate flow</span>
                  </div>
                  <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-amber-500 inline-block"></span>
                    <span>50 &ndash; 80%: Elevated loading</span>
                  </div>
                  <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-orange-500 inline-block"></span>
                    <span>80 &ndash; 100%: Near thermal limit</span>
                  </div>
                  <div className="p-2 bg-slate-900 border border-slate-800 rounded flex items-center gap-2 col-span-2">
                    <span className="w-3 h-3 rounded bg-rose-500 inline-block"></span>
                    <span>&gt; 100%: Overload! Cable exceeds ampacity (danger of sagging / burning)</span>
                  </div>
                </div>
              </div>

              {/* Card 3: N-1 Screening */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
                  <ShieldAlert className="w-4 h-4" />
                  <h4>3. What is N-1 Contingency Screening?</h4>
                </div>
                <p className="text-slate-300 text-xs">
                  In utility grid operations, <strong>&ldquo;N-1&rdquo;</strong> asks: <em>&ldquo;What happens if any ONE single wire trips or breaks unexpectedly?&rdquo;</em>
                </p>
                <p className="text-slate-300 text-xs">
                  GridSense simulates tripping each wire in the feeder one by one in milliseconds. For each wire outage, it determines:
                </p>
                <ul className="list-disc list-inside text-slate-300 space-y-1 font-mono text-[11px]">
                  <li><strong>Unserved Load (kW):</strong> How much customer power is cut off because there is no backup path.</li>
                  <li><strong>Post-Outage Line Stress:</strong> Will remaining lines get dangerously overloaded by re-routed electricity?</li>
                  <li><strong>Post-Outage Voltage Drop:</strong> Does voltage drop below statutory limits on surviving lines?</li>
                </ul>
                <p className="text-slate-400 text-xs pt-1">
                  It then ranks the outages so engineers can immediately identify the <strong>top critical single points of failure</strong> in the network.
                </p>
              </div>

              {/* Card 4: Ambient Temperature Derating */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-amber-300 font-bold text-sm">
                  <Thermometer className="w-4 h-4" />
                  <h4>4. Why Adjust Ambient Temperature?</h4>
                </div>
                <p className="text-slate-300 text-xs">
                  In hot coastal summer conditions (e.g. 34&deg;C with high humidity in Kozhikode), bare overhead conductors cannot dissipate heat efficiently.
                  Per <strong>IEEE Standard 738</strong>, thermal capacity is derated. The temperature selector lets you simulate heatwave conditions to test if conductors will overheat during peak summer loads.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsGuideOpen(false)}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
