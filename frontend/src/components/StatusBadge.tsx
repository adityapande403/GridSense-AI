import React from 'react';

export type A5Status =
  | 'VALIDATED_FEASIBLE'
  | 'FEASIBLE_PROTECTION_UNVERIFIED'
  | 'FEASIBLE_WITH_WARNINGS'
  | 'NOT_FEASIBLE'
  | 'INSUFFICIENT_DATA';

interface StatusBadgeProps {
  status: A5Status | string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const getBadgeStyle = (st: string) => {
    switch (st) {
      case 'VALIDATED_FEASIBLE':
        return 'bg-emerald-950 text-emerald-300 border-emerald-500';
      case 'FEASIBLE_PROTECTION_UNVERIFIED':
        return 'bg-amber-950 text-amber-300 border-amber-500';
      case 'FEASIBLE_WITH_WARNINGS':
        return 'bg-orange-950 text-orange-300 border-orange-500';
      case 'NOT_FEASIBLE':
        return 'bg-rose-950 text-rose-300 border-rose-500';
      case 'INSUFFICIENT_DATA':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-600';
    }
  };

  const getLabel = (st: string) => {
    switch (st) {
      case 'VALIDATED_FEASIBLE':
        return 'Validated Feasible (AC Converged)';
      case 'FEASIBLE_PROTECTION_UNVERIFIED':
        return 'Feasible (Protection Unverified)';
      case 'FEASIBLE_WITH_WARNINGS':
        return 'Feasible with Warnings';
      case 'NOT_FEASIBLE':
        return 'Not Feasible (Constraint Violated)';
      case 'INSUFFICIENT_DATA':
      default:
        return 'Insufficient Data';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold border ${getBadgeStyle(
        status
      )} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current animate-pulse" />
      {getLabel(status)}
    </span>
  );
};
