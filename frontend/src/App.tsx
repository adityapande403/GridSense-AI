import React, { useEffect, useState } from 'react';
import { Activity, ShieldAlert, Cpu, Database, Compass, Zap, GitBranch, TrendingUp } from 'lucide-react';
import { ProvenanceBadge } from './components/ProvenanceBadge';
import { StatusBadge } from './components/StatusBadge';
import { NetworkMap } from './views/NetworkMap';
import { SwitchingWorkbench } from './views/SwitchingWorkbench';
import { CapexPlanner } from './views/CapexPlanner';

interface SystemHealth {
  status: string;
  app_name: string;
  version: string;
  environment: string;
  database_connected: boolean;
  tables_count: number;
  timestamp: string;
}

export const App: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'map' | 'switching' | 'capex' | 'scenarios'>(() => {
    const hash = window.location.hash.replace('#', '');
    if (['overview', 'map', 'switching', 'capex', 'scenarios'].includes(hash)) {
      return hash as any;
    }
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['overview', 'map', 'switching', 'capex', 'scenarios'].includes(tabParam)) {
      return tabParam as any;
    }
    return 'capex'; // Default to capex for Milestone 9 demonstration
  });
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);

  useEffect(() => {
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['overview', 'map', 'switching', 'capex', 'scenarios'].includes(hash)) {
        setActiveTab((prev) => (prev !== hash ? (hash as any) : prev));
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error('Failed to fetch backend health status', err));
  }, []);

  const showTopBars = !isMapFullscreen || activeTab !== 'map';

  return (
    <div
      className={`bg-slate-950 text-slate-100 flex flex-col font-sans overflow-x-hidden ${
        activeTab === 'map' ? 'h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* Unified Slim App Navigation Header (Single 44px Row) */}
      {showTopBars && (
        <header className="bg-slate-900 border-b border-slate-800 px-4 h-11 flex items-center justify-between shrink-0 select-none z-30">
          {/* Brand & Advisory Badge */}
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold shrink-0">
              <Zap className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-sm font-bold tracking-tight text-white">GridSense-AI</span>
              <span className="text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.2 rounded">
                v0.1
              </span>
            </div>

            {/* Advisory Pill with Tooltip */}
            <div
              className="hidden sm:flex items-center space-x-1 text-[10px] font-mono bg-amber-950/70 border border-amber-600/50 text-amber-300 px-2 py-0.5 rounded cursor-help"
              title="ADVISORY-ONLY PLATFORM: No direct SCADA actuation. Recommendations require operator engineering sign-off. Target: TSSPDCL / TSNPDCL • TISC 2026 Challenge 08"
            >
              <ShieldAlert className="w-3 h-3 text-amber-400" />
              <span className="font-semibold">ADVISORY ONLY</span>
            </div>
          </div>

          {/* Navigation Tabs (Centered Inline) */}
          <nav className="flex items-center space-x-1">
            {[
              { id: 'overview', label: 'Executive Overview', icon: Activity },
              { id: 'map', label: 'Network Digital Twin', icon: Compass },
              { id: 'switching', label: 'Switching & FLISR', icon: Zap },
              { id: 'capex', label: 'CAPEX Intelligence', icon: TrendingUp },
              { id: 'scenarios', label: 'Scenario Simulator', icon: GitBranch },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Telemetry Status Indicators */}
          <div className="flex items-center space-x-2 text-xs font-mono">
            <div
              className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded-lg text-[11px]"
              title="PostGIS Spatial Database Status"
            >
              <Database className="w-3 h-3 text-slate-400" />
              <span
                className={`font-medium ${
                  health?.database_connected ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {health?.database_connected ? `DB: ${health.tables_count} tbls` : 'DB: ...'}
              </span>
            </div>

            <div
              className="hidden xl:flex items-center space-x-1.5 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded-lg text-[11px]"
              title="Physics Core Solver"
            >
              <Cpu className="w-3 h-3 text-slate-400" />
              <span className="text-cyan-400 font-medium">pandapower NR</span>
            </div>
          </div>
        </header>
      )}

      {/* Main Workspace Body */}
      <main className="flex-1 min-h-0 relative w-full h-full overflow-hidden">
        {/* Network Map Tab (Preserved in DOM to prevent map reloads & re-fetches) */}
        <div
          className={`w-full h-full ${
            activeTab === 'map'
              ? isMapFullscreen
                ? 'fixed inset-0 z-50 w-screen h-screen p-0 m-0 overflow-hidden bg-slate-950'
                : 'relative w-full h-full p-0 m-0 overflow-hidden bg-slate-950'
              : 'hidden'
          }`}
        >
          <NetworkMap
            isFullscreen={isMapFullscreen}
            onToggleFullscreen={() => setIsMapFullscreen(!isMapFullscreen)}
            isActive={activeTab === 'map'}
          />
        </div>

        {/* Scrollable Container for Standard Workspace Tabs */}
        <div
          className={`w-full h-full p-6 space-y-6 overflow-y-auto ${
            activeTab === 'map' ? 'hidden' : 'block'
          }`}
        >
          {/* Executive Overview */}
          <div className={activeTab === 'overview' ? 'block space-y-6' : 'hidden'}>
            {/* Tier 1 Delivery Status Banner */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs uppercase font-mono tracking-wider text-blue-400">
                    Milestone 4 Verification Gate
                  </span>
                  <h2 className="text-lg font-semibold text-white mt-1">
                    Geospatial Digital Twin Visualization & Asset Inspection Operational
                  </h2>
                  <p className="text-sm text-slate-400 mt-1 max-w-3xl">
                    High-contrast electrical Single Line Diagram (SLD) map canvas with color-coded voltage symbology,
                    loading thresholds, normally-open tie switch tracking, and inspectable mathematical provenance.
                  </p>
                </div>
                <StatusBadge status="VALIDATED_FEASIBLE" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <span className="text-xs text-slate-500 font-mono">ASSET REGISTRY</span>
                  <div className="text-base font-semibold text-slate-200 mt-1">20 Relational Models</div>
                  <div className="mt-2">
                    <ProvenanceBadge provenance="measured" />
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <span className="text-xs text-slate-500 font-mono">STATUTORY VOLTAGE</span>
                  <div className="text-base font-semibold text-slate-200 mt-1">11 kV ± 6.0% Band</div>
                  <div className="mt-2">
                    <ProvenanceBadge provenance="assumed" />
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <span className="text-xs text-slate-500 font-mono">BROWNFIELD GIS TWIN</span>
                  <div className="text-base font-semibold text-slate-200 mt-1">KSEB 4 DTRs / 34 Lines</div>
                  <div className="mt-2">
                    <ProvenanceBadge provenance="measured" />
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                  <span className="text-xs text-slate-500 font-mono">LOSS VALUATION</span>
                  <div className="text-base font-semibold text-slate-200 mt-1">₹5.50 per kWh (ACoS)</div>
                  <div className="mt-2">
                    <ProvenanceBadge provenance="assumed" />
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Principles & Gating Information */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-400" />
                  <span>A5 Approval Taxonomy (Strictly Enforced)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Every switching or capital recommendation receives exactly one status based on independent AC power
                  flow convergence, radiality preservation, and protection data availability.
                </p>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">AC Converged & Protected:</span>
                    <StatusBadge status="VALIDATED_FEASIBLE" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Protection Unverified:</span>
                    <StatusBadge status="FEASIBLE_PROTECTION_UNVERIFIED" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Constraint Violated:</span>
                    <StatusBadge status="NOT_FEASIBLE" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <Compass className="w-4 h-4 text-blue-400" />
                  <span>Data Provenance Tracking</span>
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Every metric, coordinate, and state is explicitly tagged. Fabricated simulation outputs or uncalibrated
                  predictions are strictly prohibited.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ProvenanceBadge provenance="measured" />
                  <ProvenanceBadge provenance="estimated" />
                  <ProvenanceBadge provenance="predicted" />
                  <ProvenanceBadge provenance="synthetic" />
                  <ProvenanceBadge provenance="assumed" />
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span>Next Milestone Gate: M5</span>
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  AC Physics Engine integration with pandapower Newton-Raphson solver, limits verification, and contingency screening.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between items-center">
                  <span>Ready for Milestone 5:</span>
                  <span className="text-emerald-400 font-semibold">GATE CLEARED</span>
                </div>
              </div>
            </div>
          </div>

          {/* Switching & FLISR Workbench */}
          <div className={activeTab === 'switching' ? 'block' : 'hidden'}>
            <SwitchingWorkbench />
          </div>

          {/* CAPEX Intelligence Planner */}
          <div className={activeTab === 'capex' ? 'block' : 'hidden'}>
            <CapexPlanner />
          </div>

          {/* Scenario Simulator Sandbox */}
          <div className={activeTab === 'scenarios' ? 'block' : 'hidden'}>
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                Scenario Simulator Sandbox (Milestone 10)
              </h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                In accordance with Non-negotiable Principle A4-11, this module is staged for delivery in its respective milestone.
              </p>
              <span className="inline-block px-3 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs font-mono text-amber-400">
                STATUS: STAGED IN PIPELINE
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer (hidden on full-bleed digital twin map) */}
      {activeTab !== 'map' && (
        <footer className="bg-slate-950 border-t border-slate-900 px-6 py-3 text-xs text-slate-500 flex justify-between items-center">
          <span>GridSense-AI Platform &bull; Telangana Innovation Startup Challenge 2026</span>
          <span>Advisory Distribution Intelligence &bull; TSSPDCL / TSNPDCL</span>
        </footer>
      )}
    </div>
  );
};

export default App;
