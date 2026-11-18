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
} from 'lucide-react';

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
}

export const PhysicsSimulationBar: React.FC<PhysicsSimulationBarProps> = ({
  feederCode,
  isSimulating,
  powerFlowData,
  onRunPowerFlow,
  onOpenContingencyModal,
  heatmapActive,
  onToggleHeatmap,
}) => {
  const [loadMultiplier, setLoadMultiplier] = useState<number>(1.0);
  const [ambientTempC, setAmbientTempC] = useState<number>(35.0);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  return (
    <div className="absolute top-4 left-[235px] right-4 z-[900] pointer-events-none">
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
                  pandapower AC Newton-Raphson
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                  TGERC &plusmn;6.0% (TR-PHY-03)
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons & Scenario Adjusters */}
          <div className="flex items-center space-x-2 text-xs">
            {/* Load Scale Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-700 px-2 py-1 rounded-lg">
              <span className="text-[11px] text-slate-400 font-mono">Load Scale:</span>
              <select
                value={loadMultiplier}
                onChange={(e) => setLoadMultiplier(parseFloat(e.target.value))}
                className="bg-transparent text-cyan-300 font-mono text-xs focus:outline-none cursor-pointer"
              >
                <option value="0.8" className="bg-slate-900 text-white">0.8x (Off-Peak)</option>
                <option value="1.0" className="bg-slate-900 text-white">1.0x (Normal Rated)</option>
                <option value="1.25" className="bg-slate-900 text-white">1.25x (Elevated)</option>
                <option value="1.5" className="bg-slate-900 text-white">1.50x (Peak Summer)</option>
                <option value="2.0" className="bg-slate-900 text-white">2.00x (Severe Stress)</option>
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
                <option value="35" className="bg-slate-900 text-white">35&deg;C (Standard Base)</option>
                <option value="42" className="bg-slate-900 text-white">42&deg;C (Summer Peak)</option>
                <option value="48" className="bg-slate-900 text-white">48&deg;C (Extreme Heatwave)</option>
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
              <span>{heatmapActive ? 'Loading Heatmap ON' : 'Loading Heatmap'}</span>
            </button>

            {/* N-1 Contingency Button */}
            <button
              onClick={onOpenContingencyModal}
              className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-lg font-mono text-[11px] font-semibold flex items-center space-x-1 transition-colors"
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
                  <span>SOLVING NR...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>RUN POWER FLOW</span>
                </>
              )}
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
          <div className="px-4 py-2 bg-slate-950/60 flex items-center justify-between text-xs font-mono">
            {powerFlowData ? (
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
                <div className="flex items-center space-x-3">
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
              </div>
            ) : (
              <div className="flex items-center justify-between w-full text-slate-400 py-1">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span>
                    Physics Core ready for feeder <strong>{feederCode}</strong>. Click &ldquo;RUN POWER FLOW&rdquo; to execute Newton-Raphson simulation.
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
  );
};
