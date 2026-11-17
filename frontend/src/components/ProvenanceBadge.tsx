import React from 'react';

export type ProvenanceType = 'synthetic' | 'measured' | 'estimated' | 'predicted' | 'assumed';

interface ProvenanceBadgeProps {
  provenance: ProvenanceType | string;
  className?: string;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({ provenance, className = '' }) => {
  const getBadgeStyle = (prov: string) => {
    switch (prov.toLowerCase()) {
      case 'measured':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700/60';
      case 'estimated':
        return 'bg-blue-950 text-blue-300 border-blue-700/60';
      case 'predicted':
        return 'bg-violet-950 text-violet-300 border-violet-700/60';
      case 'synthetic':
        return 'bg-amber-950 text-amber-300 border-amber-700/60';
      case 'assumed':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-600/60';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider border ${getBadgeStyle(
        provenance
      )} ${className}`}
      title={`Data Provenance: ${provenance}`}
    >
      {provenance}
    </span>
  );
};
