import React, { useEffect, useState } from 'react';
import { Activity, ShieldAlert, Cpu, Database, Compass, Zap, GitBranch, TrendingUp } from 'lucide-react';
import { ProvenanceBadge } from './components/ProvenanceBadge';
import { StatusBadge } from './components/StatusBadge';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'map' | 'switching' | 'capex' | 'scenarios'>('overview');

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error('Failed to fetch backend health status', err));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Advisory Banner */}
      <div className="bg-amber-950/80 border-b border-amber-600/40 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span className="font-semibold tracking-wide">ADVISORY-ONLY PLATFORM:</span>
          <span className="text-amber-300/90">
            No direct SCADA actuation. Recommendations require operator engineering sign-off.
          </span>
        </div>
        <div className="flex items-center space-x-3 text-xs">
          <span>Target: <strong>TSSPDCL / TSNPDCL</strong></span>
          <span className="text-amber-500">•</span>
          <span>TISC 2026 Challenge 08</span>
        </div>
      </div>

      {/* Primary Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold">
            <Zap className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold tracking-tight text-white">GridSense-AI</h1>
              <span className="text-xs font-mono bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded">
                v0.1.0-M1
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Distribution Network Sectionalizing, Load Switching & CAPEX Intelligence
            </p>
          </div>
        </div>

        {/* System Telemetry & Status Indicator */}
        <div className="flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">PostGIS Engine:</span>
            <span
              className={`text-xs font-mono font-medium ${
                health?.database_connected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {health?.database_connected ? `ONLINE (${health.tables_count} Tables)` : 'CONNECTING...'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">Physics Core:</span>
            <span className="text-xs font-mono text-cyan-400">pandapower AC Newton-Raphson</span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs (Tier 1 Screens) */}
      <nav className="bg-slate-900/60 border-b border-slate-800 px-6 flex space-x-1">
        {[
          { id: 'overview', label: 'Executive Overview', icon: Activity },
          { id: 'map', label: 'Network Digital Twin (Map SLD)', icon: Compass },
          { id: 'switching', label: 'Switching & FLISR Workbench', icon: Zap },
          { id: 'capex', label: 'CAPEX Intelligence', icon: TrendingUp },
          { id: 'scenarios', label: 'Scenario Simulator', icon: GitBranch },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Workspace Body */}
      <main className="flex-1 p-6 space-y-6">
        {/* Tier 1 Delivery Status Banner */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs uppercase font-mono tracking-wider text-blue-400">
                Milestone 1 Verification Gate
              </span>
              <h2 className="text-lg font-semibold text-white mt-1">
                Modular Monolith Architecture & Database Registry Initialized
              </h2>
              <p className="text-sm text-slate-400 mt-1 max-w-3xl">
                GridSense-AI repository skeleton established with explicit domain module boundaries, reversible
                Alembic migrations, standard Indian distribution equipment defaults, and test suites.
              </p>
            </div>
            <StatusBadge status="VALIDATED_FEASIBLE" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
              <span className="text-xs text-slate-500 font-mono">ASSET REGISTRY</span>
              <div className="text-base font-semibold text-slate-200 mt-1">20 Relational Models</div>
              <div className="mt-2">
                <ProvenanceBadge provenance="assumed" />
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
              <span className="text-xs text-slate-500 font-mono">RECONFIGURATION SOLVER</span>
              <div className="text-base font-semibold text-slate-200 mt-1">Pyomo + HiGHS MILP</div>
              <div className="mt-2">
                <ProvenanceBadge provenance="synthetic" />
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
              <span>Next Milestone Gate: M2</span>
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Seeded, reproducible synthetic network generator for Telangana-style 33/11 kV feeders with agricultural
              pump rostering and IEEE 33-bus algorithmic verification benchmarks.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between items-center">
              <span>Ready for Milestone 2:</span>
              <span className="text-emerald-400 font-semibold">GATE CLEARED</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 px-6 py-3 text-xs text-slate-500 flex justify-between items-center">
        <span>GridSense-AI Platform &bull; Telangana Innovation Startup Challenge 2026</span>
        <span>Advisory Distribution Intelligence &bull; TSSPDCL / TSNPDCL</span>
      </footer>
    </div>
  );
};

export default App;
