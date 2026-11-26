import React, { useEffect, useState } from 'react';
import { Activity, ShieldAlert, Cpu, Database, Compass, Zap, GitBranch, TrendingUp } from 'lucide-react';
import { NetworkMap } from './views/NetworkMap';
import { SwitchingWorkbench } from './views/SwitchingWorkbench';
import { CapexPlanner } from './views/CapexPlanner';
import { ScenarioSimulator } from './views/ScenarioSimulator';
import { ExecutiveOverview } from './views/ExecutiveOverview';
import { GridContextProvider, useGridContext } from './context/GridContext';

interface SystemHealth {
  status: string;
  app_name: string;
  version: string;
  environment: string;
  database_connected: boolean;
  tables_count: number;
  timestamp: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('GridSense Application Error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isHookError = Boolean(this.state.error?.message?.toLowerCase().includes('hook'));
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-xl">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">Workspace Render Anomaly Handled</h2>
          <p className="text-xs text-slate-400 max-w-lg mb-6 font-mono bg-slate-900 border border-slate-800 p-3 rounded-xl text-rose-300">
            {this.state.error?.message || 'Component failed to render safely.'}
          </p>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                if (isHookError) {
                  window.location.reload();
                } else {
                  this.setState({ hasError: false, error: null });
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold shadow transition-all cursor-pointer"
            >
              Resume Workspace
            </button>
            <button
              onClick={() => {
                window.location.hash = '#map';
                window.location.reload();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AppContent: React.FC = () => {
  const { gridContext, activeTab, setActiveTab } = useGridContext();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const rawHash = window.location.hash.replace('#', '').split('?')[0];
    if (rawHash !== activeTab) {
      const search = window.location.search;
      const hashParams = window.location.hash.includes('?') ? `?${window.location.hash.split('?')[1]}` : '';
      window.history.replaceState(null, '', `${search}#${activeTab}${hashParams}`);
    }
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '').split('?')[0];
      if (['overview', 'map', 'switching', 'capex', 'scenarios'].includes(rawHash)) {
        setActiveTab(rawHash as any);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setActiveTab]);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error('Failed to fetch backend health status', err));
  }, []);

  const showTopBars = !isMapFullscreen || activeTab !== 'map';

  return (
    <div
      className={`bg-slate-950 text-slate-100 flex flex-col font-sans overflow-x-hidden ${activeTab === 'map' ? 'h-screen overflow-hidden' : 'min-h-screen'
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
              title={`ADVISORY-ONLY PLATFORM: No direct SCADA actuation. Recommendations require operator engineering sign-off. Target: ${gridContext?.utility_short || 'DISCOM'} • ${gridContext?.district || 'Distribution Circle'} • Feeder ${gridContext?.feeder_code || ''}`}
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
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${isActive
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
                className={`font-medium ${health?.database_connected ? 'text-emerald-400' : 'text-amber-400'
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
          className={`w-full h-full ${activeTab === 'map'
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
          className={`w-full h-full p-6 space-y-6 overflow-y-auto ${activeTab === 'map' ? 'hidden' : 'block'
            }`}
        >
          {/* Executive Overview */}
          {activeTab === 'overview' && <ExecutiveOverview />}

          {/* Switching & FLISR Workbench */}
          {activeTab === 'switching' && <SwitchingWorkbench />}

          {/* CAPEX Intelligence Planner */}
          {activeTab === 'capex' && <CapexPlanner />}

          {/* Scenario Simulator Sandbox */}
          {activeTab === 'scenarios' && <ScenarioSimulator />}
        </div>
      </main>

      {/* Footer (hidden on full-bleed digital twin map) */}
      {activeTab !== 'map' && (
        <footer className="bg-slate-950 border-t border-slate-900 px-6 py-3 text-xs text-slate-500 flex justify-between items-center">
          <span>GridSense-AI Platform &bull; {gridContext?.utility_name || 'State Electricity Distribution Company'}</span>
          <span>Advisory Distribution Intelligence &bull; {gridContext?.substation_name || 'Substation'} &bull; Feeder {gridContext?.feeder_code || ''}</span>
        </footer>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <GridContextProvider>
        <AppContent />
      </GridContextProvider>
    </ErrorBoundary>
  );
};

export default App;
