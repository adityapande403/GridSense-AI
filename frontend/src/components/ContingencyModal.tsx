import React from 'react';
import { ShieldAlert, X, Eye } from 'lucide-react';

export interface ContingencyItem {
  contingency_id: string;
  line_code: string;
  from_bus_code: string;
  to_bus_code: string;
  converged: boolean;
  unserved_load_kw: number;
  unserved_load_mw: number;
  isolated_buses_count: number;
  isolated_buses: string[];
  post_contingency_max_loading_pct: number;
  worst_line_code?: string;
  post_contingency_min_voltage_pu: number;
  worst_bus_code?: string;
  overloaded_lines_count: number;
  voltage_violations_count: number;
  severity_score: number;
  rank: number;
}

export interface ContingencyReportData {
  feeder_code: string;
  feeder_name: string;
  base_case_loss_kw: number;
  base_case_min_voltage_pu: number;
  total_contingencies_evaluated: number;
  critical_contingencies_count: number;
  results: ContingencyItem[];
  execution_time_ms: number;
}

interface ContingencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ContingencyReportData | null;
  onSelectContingency?: (item: ContingencyItem) => void;
}

export const ContingencyModal: React.FC<ContingencyModalProps> = ({
  isOpen,
  onClose,
  report,
  onSelectContingency,
}) => {
  if (!isOpen || !report) return null;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                N-1 Contingency Screening Report
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-rose-950/80 text-rose-300 border border-rose-800">
                  TR-PHY-07
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Single-contingency line outage simulation for feeder <strong>{report.feeder_name} ({report.feeder_code})</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary HUD Stats */}
        <div className="grid grid-cols-4 gap-3 p-4 bg-slate-950/40 border-b border-slate-800 text-xs">
          <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 font-mono text-[11px]">LINES EVALUATED</div>
            <div className="text-lg font-bold text-white font-mono mt-0.5">
              {report.total_contingencies_evaluated}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Sub-second screening ({report.execution_time_ms} ms)</div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 font-mono text-[11px]">CRITICAL BOTTLENECKS</div>
            <div className="text-lg font-bold text-rose-400 font-mono mt-0.5">
              {report.critical_contingencies_count}
            </div>
            <div className="text-[10px] text-rose-400/80 mt-0.5">Severity index &gt; 0.25</div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 font-mono text-[11px]">BASE MIN VOLTAGE</div>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
              {report.base_case_min_voltage_pu.toFixed(4)} p.u.
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Statutory normal (&plusmn;6%)</div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <div className="text-slate-400 font-mono text-[11px]">BASE TECHNICAL LOSS</div>
            <div className="text-lg font-bold text-cyan-400 font-mono mt-0.5">
              {report.base_case_loss_kw.toFixed(2)} kW
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Pre-contingency baseline</div>
          </div>
        </div>

        {/* Contingency Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="py-2.5 px-3">RANK</th>
                <th className="py-2.5 px-3">OUTAGED LINE</th>
                <th className="py-2.5 px-3">TOPOLOGY</th>
                <th className="py-2.5 px-3 text-right">UNSERVED LOAD</th>
                <th className="py-2.5 px-3 text-right">POST-OUTAGE V_MIN</th>
                <th className="py-2.5 px-3 text-right">MAX LINE LOAD</th>
                <th className="py-2.5 px-3 text-center">SEVERITY</th>
                <th className="py-2.5 px-3 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {report.results.map((c) => {
                const isCritical = c.severity_score >= 0.20 || c.unserved_load_kw > 100.0;
                return (
                  <tr
                    key={c.contingency_id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isCritical ? 'bg-rose-950/10' : ''
                    }`}
                  >
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                          c.rank === 1
                            ? 'bg-rose-600 text-white'
                            : c.rank <= 3
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {c.rank}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-200">
                      {c.line_code}
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-[11px]">
                      {c.from_bus_code} &rarr; {c.to_bus_code}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {c.unserved_load_kw > 0 ? (
                        <span className="text-amber-400 font-bold">
                          {c.unserved_load_kw.toFixed(1)} kW
                        </span>
                      ) : (
                        <span className="text-emerald-400">0 kW (Fed)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span
                        className={
                          c.post_contingency_min_voltage_pu < 0.94
                            ? 'text-rose-400 font-bold'
                            : c.post_contingency_min_voltage_pu < 0.95
                            ? 'text-amber-400'
                            : 'text-slate-300'
                        }
                      >
                        {c.post_contingency_min_voltage_pu.toFixed(4)} p.u.
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span
                        className={
                          c.post_contingency_max_loading_pct > 100.0
                            ? 'text-rose-400 font-bold'
                            : c.post_contingency_max_loading_pct > 80.0
                            ? 'text-amber-400'
                            : 'text-slate-300'
                        }
                      >
                        {c.post_contingency_max_loading_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.severity_score >= 0.25
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : c.severity_score >= 0.15
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {c.severity_score.toFixed(3)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {onSelectContingency && (
                        <button
                          onClick={() => {
                            onSelectContingency(c);
                            onClose();
                          }}
                          className="px-2 py-1 text-[11px] bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-600/40 transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Inspect
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/70 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between font-mono">
          <div>
            Ranking formula: <code className="text-slate-300">0.5*(Unserved/Total) + 0.3*(Loading/100) + 0.2*(1 - Vmin)</code>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
