import React from 'react';
import { MapPin } from 'lucide-react';
import { useGridContext } from '../context/GridContext';

export interface ClickableAssetProps {
  code: string;
  name?: string;
  feederCode?: string;
  className?: string;
  children?: React.ReactNode;
  showIcon?: boolean;
  badge?: string;
  title?: string;
}

export const ClickableAsset: React.FC<ClickableAssetProps> = ({
  code,
  name,
  feederCode,
  className = '',
  children,
  showIcon = true,
  badge,
  title,
}) => {
  const { navigateToAsset } = useGridContext();

  if (!code) {
    return <span className={className}>{children || name || '—'}</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigateToAsset(code, feederCode);
  };

  return (
    <button
      type="button"
      data-testid={`clickable-asset-${code}`}
      data-asset-code={code}
      onClick={handleClick}
      title={title || `Locate and inspect ${name || code} on Digital Twin Map`}
      className={`inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/40 px-1.5 py-0.5 rounded border border-transparent hover:border-cyan-700/50 underline decoration-cyan-500/40 hover:decoration-cyan-300 font-mono text-xs transition-all cursor-pointer group select-none text-left ${className}`}
    >
      {showIcon && (
        <MapPin className="w-3 h-3 text-cyan-400/80 group-hover:text-cyan-200 shrink-0 transition-transform group-hover:scale-110" />
      )}
      <span className="font-semibold">{children || name || code}</span>
      {badge && (
        <span className="text-[9px] uppercase px-1 py-0.2 bg-slate-800 text-slate-300 rounded border border-slate-700 font-mono">
          {badge}
        </span>
      )}
    </button>
  );
};
