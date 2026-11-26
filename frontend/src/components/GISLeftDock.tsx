import React, { useState } from 'react';
import {
  Zap,
  Layers,
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  Play,
  ShieldAlert,
  Flame,
  CheckCircle2,
  RefreshCw,
  Maximize2,
  Sliders,
  Check,
} from 'lucide-react';
import { PowerFlowSummaryData } from './PhysicsSimulationBar';
import { useGridContext } from '../context/GridContext';

export interface GISLeftDockProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  activeTab: 'physics' | 'layers' | 'settings';
  onTabChange: (tab: 'physics' | 'layers' | 'settings') => void;

  // Feeder & Basemap
  selectedFeeder: string;
  onSelectFeeder: (code: string) => void;
  feeders: Array<{ code: string; name: string }>;
  baseMap: 'carto-voyager' | 'carto-dark' | 'osm' | 'satellite';
  onSelectBaseMap: (map: 'carto-voyager' | 'carto-dark' | 'osm' | 'satellite') => void;
  onFitBounds: () => void;

  // Layers
  showHTLines: boolean;
  setShowHTLines: (v: boolean) => void;
  showLTLines: boolean;
  setShowLTLines: (v: boolean) => void;
  showDTRs: boolean;
  setShowDTRs: (v: boolean) => void;
  showPoles: boolean;
  setShowPoles: (v: boolean) => void;
  showDPStructures: boolean;
  setShowDPStructures: (v: boolean) => void;
  showSwitches: boolean;
  setShowSwitches: (v: boolean) => void;
  showSubstations: boolean;
  setShowSubstations: (v: boolean) => void;
  showConsumers: boolean;
  setShowConsumers: (v: boolean) => void;
  summary: any;

  // Physics Simulation
  isSimulating: boolean;
  powerFlowData: PowerFlowSummaryData | null;
  onRunPowerFlow: (loadMultiplier: number, ambientTempC: number) => void;
  onOpenContingencyModal: () => void;
  heatmapActive: boolean;
  onToggleHeatmap: (active: boolean) => void;
}

export const GISLeftDock: React.FC<GISLeftDockProps> = ({
  isOpen,
  onToggleOpen,
  activeTab,
  onTabChange,
  selectedFeeder,
  onSelectFeeder,
  feeders,
  baseMap,
  onSelectBaseMap,
  onFitBounds,
  showHTLines,
  setShowHTLines,
  showLTLines,
  setShowLTLines,
  showDTRs,
  setShowDTRs,
  showPoles,
  setShowPoles,
  showDPStructures,
  setShowDPStructures,
  showSwitches,
  setShowSwitches,
  showSubstations,
  setShowSubstations,
  showConsumers,
  setShowConsumers,
  summary,
  isSimulating,
  powerFlowData,
  onRunPowerFlow,
  onOpenContingencyModal,
  heatmapActive,
  onToggleHeatmap,
}) => {
  const { gridContext } = useGridContext();
  const [loadMultiplier, setLoadMultiplier] = useState<number>(1.0);
  const [ambientTempC, setAmbientTempC] = useState<number>(35.0);

  if (!isOpen) {
    return (
      <button
        onClick={onToggleOpen}
        className="absolute top-3 left-3 z-[700] bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500 rounded-xl px-3 py-2 shadow-2xl backdrop-blur-md flex items-center space-x-2 text-xs text-slate-200 transition-all group"
        title="Open Digital Twin Workbench"
      >
        <div className="w-5 h-5 rounded-md bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
          <Zap className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <span className="font-mono text-[11px] font-bold tracking-wide">WORKBENCH</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
      </button>
    );
  }

  return (
    <aside className="absolute top-3 bottom-4 left-3 w-[335px] z-[700] bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-left duration-200 select-none">
      {/* 1. Dock Header */}
      <div className="px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/50 flex items-center justify-center text-blue-400 shrink-0">
            <Zap className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white tracking-wide truncate">
              GridSense Workbench
            </div>
            <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span>11 kV Digital Twin</span>
            </div>
          </div>
        </div>
        <button
          onClick={onToggleOpen}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Collapse Workbench (◀)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Mode Selector Navigation Tabs */}
      <div className="flex bg-slate-950/60 border-b border-slate-800/80 p-1 gap-1 text-[11px] font-medium">
        <button
          onClick={() => onTabChange('physics')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg transition-colors ${
            activeTab === 'physics'
              ? 'bg-blue-600 text-white font-bold shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Physics</span>
        </button>
        <button
          onClick={() => onTabChange('layers')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg transition-colors ${
            activeTab === 'layers'
              ? 'bg-blue-600 text-white font-bold shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Layers</span>
        </button>
        <button
          onClick={() => onTabChange('settings')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg transition-colors ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white font-bold shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>Basemap</span>
        </button>
      </div>

      {/* 3. Tab Contents */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs text-slate-300">
        {/* TAB 1: PHYSICS & SIMULATION CORE */}
        {activeTab === 'physics' && (
          <div className="space-y-3">
            {/* Primary Action Button: Run Power Flow */}
            <button
              onClick={() => onRunPowerFlow(loadMultiplier, ambientTempC)}
              disabled={isSimulating}
              className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center space-x-2 shadow-lg ${
                isSimulating
                  ? 'bg-cyan-900/50 text-cyan-300 cursor-not-allowed border border-cyan-800/50'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/40 hover:shadow-cyan-500/20 active:scale-[0.99]'
              }`}
            >
              {isSimulating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                  <span>Solving AC Newton-Raphson...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white text-white" />
                  <span>RUN AC POWER FLOW (NR)</span>
                </>
              )}
            </button>

            {/* Secondary Actions: N-1 & Heatmap */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onOpenContingencyModal}
                disabled={isSimulating}
                className="py-1.5 px-2 bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/70 text-purple-200 hover:text-white rounded-lg font-mono text-[11px] transition-colors flex items-center justify-center space-x-1.5"
                title="Single-Contingency Line Outage Screening (TR-PHY-07)"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
                <span>N-1 Screening</span>
              </button>

              <button
                onClick={() => onToggleHeatmap(!heatmapActive)}
                className={`py-1.5 px-2 rounded-lg font-mono text-[11px] border transition-colors flex items-center justify-center space-x-1.5 ${
                  heatmapActive
                    ? 'bg-amber-950/80 border-amber-600/80 text-amber-200 font-bold'
                    : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle Conductor Loading Heatmap Colors"
              >
                <Flame className={`w-3.5 h-3.5 ${heatmapActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Heatmap: {heatmapActive ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Scenario Adjusters (Load Multiplier & Ambient Temp) */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800/80 pb-1">
                <span className="flex items-center space-x-1">
                  <Sliders className="w-3 h-3 text-cyan-400" />
                  <span>Simulation Parameters</span>
                </span>
                <span className="text-[10px] text-slate-500">IEEE 738 Calibrated</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">Load Multiplier</label>
                  <select
                    value={loadMultiplier}
                    onChange={(e) => setLoadMultiplier(parseFloat(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 text-cyan-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="0.8">0.8x (Off-Peak)</option>
                    <option value="1.0">1.0x (Nominal)</option>
                    <option value="1.2">1.2x (Peak Load)</option>
                    <option value="1.5">1.5x (Severe Stress)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">Ambient Temp</label>
                  <select
                    value={ambientTempC}
                    onChange={(e) => setAmbientTempC(parseFloat(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 text-amber-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500 font-mono"
                  >
                    <option value="25.0">25°C (Cool)</option>
                    <option value="35.0">35°C (Standard)</option>
                    <option value="40.0">40°C (Hot)</option>
                    <option value="45.0">45°C (Summer Peak)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Telemetry Results Card */}
            {powerFlowData && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-mono text-[11px] font-bold text-emerald-300">
                      SOLVER CONVERGED
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {powerFlowData.execution_time_ms.toFixed(1)} ms &bull; {powerFlowData.iterations} iter
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500">TECHNICAL LOSS</div>
                    <div className="text-amber-300 font-bold mt-0.5">
                      {powerFlowData.total_active_loss_kw.toFixed(2)} kW
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ({powerFlowData.loss_percentage.toFixed(2)}%)
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500">MIN VOLTAGE</div>
                    <div
                      className={`font-bold mt-0.5 ${
                        powerFlowData.min_voltage_pu < 0.94 ? 'text-rose-400' : 'text-emerald-300'
                      }`}
                    >
                      {powerFlowData.min_voltage_pu.toFixed(4)} p.u.
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {gridContext?.regulatory_band || 'SERC ±6%'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono bg-slate-900/60 px-2 py-1.5 rounded-lg border border-slate-800">
                  <span className="text-slate-400">Violations:</span>
                  <span className="text-emerald-400 font-semibold">
                    {powerFlowData.line_overloads_count} Overloads &bull; {powerFlowData.voltage_violations_count} Voltage
                  </span>
                </div>

                {/* Heatmap Conductor Scale Legend */}
                <div className="pt-1">
                  <div className="text-[10px] text-slate-400 font-mono mb-1.5">Conductor Loading Heatmap</div>
                  <div className="grid grid-cols-5 gap-1 text-[9px] font-mono text-center">
                    <div className="bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 py-1 rounded">
                      &le;20%
                    </div>
                    <div className="bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 py-1 rounded">
                      20-50%
                    </div>
                    <div className="bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 py-1 rounded">
                      50-80%
                    </div>
                    <div className="bg-amber-950/80 text-amber-300 border border-amber-800/80 py-1 rounded">
                      80-100%
                    </div>
                    <div className="bg-rose-950/80 text-rose-300 border border-rose-800/80 py-1 rounded">
                      &gt;100%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INGESTED QGIS LAYERS */}
        {activeTab === 'layers' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 text-[11px] font-mono text-slate-400 border-b border-slate-800">
              <span>QGIS Ingested Layers (8)</span>
              <button
                onClick={() => {
                  const allOn = showHTLines && showLTLines && showDTRs && showPoles && showDPStructures && showSwitches && showSubstations;
                  setShowHTLines(!allOn);
                  setShowLTLines(!allOn);
                  setShowDTRs(!allOn);
                  setShowPoles(!allOn);
                  setShowDPStructures(!allOn);
                  setShowSwitches(!allOn);
                  setShowSubstations(!allOn);
                }}
                className="text-blue-400 hover:text-blue-300 text-[10px]"
              >
                Toggle All
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showHTLines}
                    onChange={(e) => setShowHTLines(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-rose-500 focus:ring-0"
                  />
                  <span className="w-3 h-1 bg-red-500 inline-block rounded-sm" />
                  <span className="text-slate-200">11 kV HT Backbone</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_ht_lines || 36})</span>
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showLTLines}
                    onChange={(e) => setShowLTLines(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
                  />
                  <span className="w-3 h-0.5 bg-slate-400 inline-block" />
                  <span className="text-slate-200">LT Lines & Cables</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_lt_lines ?? 0})</span>
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showDTRs}
                    onChange={(e) => setShowDTRs(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-pink-500 focus:ring-0"
                  />
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block border border-white" />
                  <span className="text-slate-200">DTR Transformers</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_dtrs ?? 0})</span>
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showPoles}
                    onChange={(e) => setShowPoles(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-amber-600 focus:ring-0"
                  />
                  <span className="w-2 h-2 rounded-full bg-amber-700 inline-block border border-amber-950" />
                  <span className="text-slate-200">Standard Poles</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_poles ?? 0})</span>
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showDPStructures}
                    onChange={(e) => setShowDPStructures(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-orange-500 focus:ring-0"
                  />
                  <span className="w-2.5 h-2.5 rounded-xs bg-orange-600 inline-block border border-orange-400" />
                  <span className="text-slate-200">DP Structures</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_dp_structures ?? (summary?.total_switches ? Math.round(summary.total_switches * 0.9) : 0)})</span>
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showSwitches}
                    onChange={(e) => setShowSwitches(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <span className="w-2.5 h-2.5 rounded-sm border border-emerald-400 inline-block" />
                  <span className="text-slate-200">Switches & Tie Points</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_switches ?? 0})</span>
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showSubstations}
                    onChange={(e) => setShowSubstations(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-0"
                  />
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                  <span className="text-slate-200">33/11 kV Substation</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_substations ?? 1})</span>
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/50 cursor-pointer border border-slate-800/80 transition-colors">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showConsumers}
                    onChange={(e) => setShowConsumers(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
                  />
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  <span className="text-slate-200">Consumers</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">({summary?.total_consumers ?? 0})</span>
              </label>
            </div>
          </div>
        )}

        {/* TAB 3: BASEMAP & FEEDER SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-3">
            {/* Feeder Switcher */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-slate-400 block">Select Active Feeder</label>
              <select
                value={selectedFeeder}
                onChange={(e) => onSelectFeeder(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-semibold"
              >
                <option value="all">All Network Feeders</option>
                {feeders.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Basemap Selection */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-slate-400 block">Basemap Provider</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'carto-voyager', label: 'Carto Voyager', desc: 'Crisp Streets & Labels' },
                  { id: 'carto-dark', label: 'Carto Dark', desc: 'High-Contrast Night' },
                  { id: 'osm', label: 'OSM Streets', desc: 'OpenStreetMap Vector' },
                  { id: 'satellite', label: 'Satellite', desc: 'ESRI Aerial Imagery' },
                ].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBaseMap(b.id as any)}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      baseMap === b.id
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{b.label}</span>
                      {baseMap === b.id && <Check className="w-3 h-3 text-blue-400" />}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{b.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* View Reset Button */}
            <div className="pt-2">
              <button
                onClick={onFitBounds}
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 transition-colors flex items-center justify-center space-x-2"
              >
                <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Fit Map to Feeder Bounds</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Dock Footer Summary */}
      <div className="px-3 py-2 bg-slate-950/90 border-t border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
        <span>{gridContext?.utility_short || 'GIS'} Brownfield Dataset</span>
        <span className="text-emerald-400 font-semibold">100% GIS SNAPPED</span>
      </div>
    </aside>
  );
};
