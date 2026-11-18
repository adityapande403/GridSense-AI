import React, { useMemo } from 'react';
import { X, BookOpen, Calculator, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceBadge';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface CalculationDetails {
  title: string;
  metric: string;
  formula: string;
  latexFormula?: string;
  description: string;
  inputs: Record<string, string | number>;
  assumptions: string[];
  constraints: string[];
  sourceStandards: string[];
  provenance: 'synthetic' | 'measured' | 'estimated' | 'predicted' | 'assumed';
  confidenceScore?: number;
}

interface CalculationModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: CalculationDetails | null;
}

export const CalculationModal: React.FC<CalculationModalProps> = ({ isOpen, onClose, details }) => {
  if (!isOpen || !details) return null;

  const renderedFormulaHtml = useMemo(() => {
    if (!details.latexFormula) return null;
    try {
      return katex.renderToString(details.latexFormula, {
        throwOnError: false,
        displayMode: true,
      });
    } catch (e) {
      console.error('KaTeX rendering error:', e);
      return null;
    }
  }, [details.latexFormula]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{details.title}</h3>
              <p className="text-xs text-slate-400">Physics & Mathematical Computation Transparency (A4-8)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Provenance Tag */}
          <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400">Data Provenance & Reliability:</span>
            <div className="flex items-center space-x-2">
              <ProvenanceBadge provenance={details.provenance} />
              {details.confidenceScore && (
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/60 px-2 py-0.5 rounded">
                  Score: {(details.confidenceScore * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          {/* Mathematical Formula */}
          <div className="bg-slate-950 border border-blue-900/40 rounded-xl p-4">
            <span className="text-xs font-mono uppercase text-blue-400 flex items-center space-x-1.5 mb-2">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Governing Formulation</span>
            </span>
            {renderedFormulaHtml ? (
              <div
                className="p-4 bg-slate-900/95 rounded-lg text-center text-cyan-200 text-base tracking-wide border border-slate-800 overflow-x-auto shadow-inner"
                dangerouslySetInnerHTML={{ __html: renderedFormulaHtml }}
              />
            ) : (
              <div className="p-3 bg-slate-900/90 rounded-lg text-center font-mono text-cyan-300 text-sm tracking-wide border border-slate-800">
                {details.formula}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">{details.description}</p>
          </div>

          {/* Stored Inputs */}
          <div>
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Calculation Inputs & Parameter Values</span>
            </h4>
            <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs font-mono">
              {Object.entries(details.inputs).map(([key, val]) => (
                <div key={key} className="flex justify-between py-1 border-b border-slate-800/60 last:border-none">
                  <span className="text-slate-400">{key}:</span>
                  <span className="text-slate-100 font-semibold">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Constraints & Assumptions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-semibold text-amber-300 flex items-center space-x-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Operating Assumptions</span>
              </span>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                {details.assumptions.map((ass, idx) => (
                  <li key={idx}>{ass}</li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-semibold text-purple-300 flex items-center space-x-1.5 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>Engineering Standards</span>
              </span>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                {details.sourceStandards.map((std, idx) => (
                  <li key={idx}>{std}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <span>Non-negotiable Principle A4-8: Hand-inspectable calculation lineage</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
