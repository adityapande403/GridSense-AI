import React, { useState } from 'react';
import { X, Zap, Cpu, Gauge, Calculator, ChevronRight, Activity } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceBadge';
import { CalculationModal, CalculationDetails } from './CalculationModal';

export interface SelectedAsset {
  id: string;
  code: string;
  name?: string;
  entity_type: 'substation' | 'line' | 'distribution_transformer' | 'switch' | 'consumer' | 'pole';
  voltage_kv?: number;
  provenance: 'synthetic' | 'measured' | 'estimated' | 'predicted' | 'assumed';
  confidence_score?: number;
  properties: Record<string, any>;
}

interface AssetInspectionDrawerProps {
  asset: SelectedAsset | null;
  onClose: () => void;
  onOpenClusterZoom?: (asset: SelectedAsset) => void;
}

export const AssetInspectionDrawer: React.FC<AssetInspectionDrawerProps> = ({
  asset,
  onClose,
  onOpenClusterZoom,
}) => {
  const [modalDetails, setModalDetails] = useState<CalculationDetails | null>(null);

  if (!asset) return null;

  const props = asset.properties || {};

  const openCalculationInspection = () => {
    if (asset.entity_type === 'distribution_transformer') {
      const ratedKva = props.rated_kva || 100.0;
      const loadPct = props.loading_pct || 75.0;
      const apparentKva = (ratedKva * loadPct) / 100.0;
      const activeKw = apparentKva * 0.9;

      setModalDetails({
        title: `DTR Loading & Utilization: ${asset.code}`,
        metric: 'Loading Percentage (%)',
        formula: 'Loading (%) = (S_apparent / S_rated) * 100',
        latexFormula: '\\text{Loading (\\%)} = \\frac{S_{\\text{apparent}}}{S_{\\text{rated}}} \\times 100\\%',
        description:
          'DTR utilization evaluated from aggregate consumer demand snapshot divided by nameplate kVA rating. Values exceeding 100% trigger critical thermal warnings.',
        inputs: {
          'Rated Capacity (kVA)': ratedKva,
          'Estimated Apparent Demand (kVA)': apparentKva.toFixed(1),
          'Active Power Peak (kW)': activeKw.toFixed(1),
          'Power Factor (Assumed)': '0.90 lag',
          'Primary Voltage': '11 kV',
          'Secondary Voltage': '415 V',
        },
        assumptions: [
          'Load distributed across 3 balanced phases.',
          'Ambient temperature assumed 35°C standard peak diurnal profile.',
          'No-load loss 0.25% and full-load loss 1.35% from IS 1180 table.',
        ],
        constraints: [
          'Maximum continuous thermal rating: 100% (1.0 p.u.).',
          'Emergency cyclic loading threshold: 120% for max 2 hours.',
        ],
        sourceStandards: [
          'IS 1180 (Part 1): 2014 Outdoor Distribution Transformers',
          'IEC 60076-7 Loading Guide for Oil-Immersed Power Transformers',
        ],
        provenance: asset.provenance,
        confidenceScore: asset.confidence_score || 0.95,
      });
    } else if (asset.entity_type === 'line') {
      const lengthKm = props.length_km || 0.5;
      const rOhm = props.r_ohm_per_km || 0.9075;
      const xOhm = props.x_ohm_per_km || 0.377;
      const maxAmp = (props.max_i_ka || 0.134) * 1000;

      setModalDetails({
        title: `Line Series Impedance & Capacity: ${asset.code}`,
        metric: 'Branch Series Impedance (Z = R + jX)',
        formula: 'Z_branch = (r_ohm_per_km + j * x_ohm_per_km) * length_km',
        latexFormula: 'Z_{\\text{branch}} = (R + jX) \\cdot L_{\\text{km}}',
        description:
          'Series resistance and inductive reactance computed from physical conductor cross-section and geodesic path length. Governs positive-sequence voltage drop in AC Newton-Raphson power flow.',
        inputs: {
          'Conductor Type': props.conductor_type || 'ACSR_Weasel',
          'Total Length (km)': lengthKm,
          'Resistance R (Ω/km)': rOhm,
          'Reactance X (Ω/km)': xOhm,
          'Total Branch Resistance (Ω)': (rOhm * lengthKm).toFixed(4),
          'Total Branch Reactance (Ω)': (xOhm * lengthKm).toFixed(4),
          'Thermal Ampacity (A)': maxAmp.toFixed(0),
        },
        assumptions: [
          'Conductor temperature normalized to 75°C operating resistance.',
          'Geometry follows surveyed pole coordinates.',
        ],
        constraints: [
          'Branch current I ≤ Thermal Ampacity (I_max).',
          'Statutory voltage drop across feeder ≤ 6.0%.',
        ],
        sourceStandards: [
          'REC Construction Standards & BIS 398 Part 2 Specification',
          'TGERC Distribution Supply Code 2024',
        ],
        provenance: asset.provenance,
        confidenceScore: asset.confidence_score || 0.90,
      });
    }
  };

  return (
    <>
      <div className="absolute right-0 top-0 bottom-0 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl backdrop-blur-md z-[2000] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              {asset.entity_type === 'distribution_transformer' ? (
                <Gauge className="w-5 h-5 text-amber-400" />
              ) : asset.entity_type === 'line' ? (
                <Activity className="w-5 h-5 text-cyan-400" />
              ) : asset.entity_type === 'substation' ? (
                <Cpu className="w-5 h-5 text-purple-400" />
              ) : (
                <Zap className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase font-mono tracking-wider text-slate-400">
                  {asset.entity_type.replace('_', ' ')}
                </span>
              </div>
              <h3 className="text-base font-bold text-white tracking-tight">{asset.name || asset.code}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Provenance Banner */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">Data Reliability:</span>
            <div className="flex items-center space-x-2">
              <ProvenanceBadge provenance={asset.provenance} />
              {asset.confidence_score && (
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800/60 px-2 py-0.5 rounded">
                  {(asset.confidence_score * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          {/* DTR Specific Metrics */}
          {asset.entity_type === 'distribution_transformer' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border ${
                  props.loading_pct > 100
                    ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                    : props.loading_pct > 80
                    ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                    : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase font-mono">Current Utilization</span>
                  <span className="text-lg font-bold font-mono">{props.loading_pct || 75.0}%</span>
                </div>
                <div className="w-full bg-slate-900/80 h-2 rounded-full mt-2.5 overflow-hidden">
                  <div
                    className={`h-full ${
                      props.loading_pct > 100 ? 'bg-rose-500' : props.loading_pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, props.loading_pct || 75)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs mt-2 font-mono">
                  <span>Capacity: {props.rated_kva} kVA</span>
                  <span>Status: {props.status || 'NORMAL'}</span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Parent Bus:</span>
                  <span className="text-slate-200 font-semibold">{props.bus_code || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Phases:</span>
                  <span className="text-slate-200">{props.phase_count || 3}-Phase</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Impedance (%Z):</span>
                  <span className="text-slate-200">{props.percent_z || 4.5}%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Full Load Loss:</span>
                  <span className="text-slate-200">{props.full_load_loss_kw || 1.35} kW</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">DT Metering:</span>
                  <span className={props.is_metered ? 'text-emerald-400' : 'text-slate-500'}>
                    {props.is_metered ? 'AMI Metered' : 'Unmetered (Estimated)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Line Specific Metrics */}
          {asset.entity_type === 'line' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Conductor:</span>
                  <span className="text-cyan-400 font-semibold">{props.conductor_type}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Length:</span>
                  <span className="text-slate-200">{props.length_km} km</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">From Bus:</span>
                  <span className="text-slate-200">{props.from_bus_code}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">To Bus:</span>
                  <span className="text-slate-200">{props.to_bus_code}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Current Rating:</span>
                  <span className="text-slate-200">{((props.max_i_ka || 0.134) * 1000).toFixed(0)} A</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Operational:</span>
                  <span className={props.is_operational ? 'text-emerald-400' : 'text-rose-400'}>
                    {props.is_operational ? 'Energized' : 'De-energized'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Switch Specific Metrics */}
          {asset.entity_type === 'switch' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Type:</span>
                  <span className="text-purple-400 uppercase font-semibold">{props.switch_type}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Current Status:</span>
                  <span
                    className={`font-bold uppercase ${
                      props.current_status === 'closed' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {props.current_status}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Normally Open Tie:</span>
                  <span className={props.is_normally_open ? 'text-amber-400' : 'text-slate-400'}>
                    {props.is_normally_open ? 'YES (Tie Point)' : 'NO (Normal Feeder)'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Remotely Operable:</span>
                  <span className={props.is_motorized ? 'text-cyan-400' : 'text-slate-500'}>
                    {props.is_motorized ? 'Motorized RMU' : 'Manual Field Crew'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Breaking Capacity:</span>
                  <span className="text-slate-200">{props.breaking_capacity_ka || 12.5} kA</span>
                </div>
              </div>
            </div>
          )}

          {/* Pole or DP Structure Specific Metrics */}
          {asset.entity_type === 'pole' && (
            <div className="space-y-4">
              {props.is_dp_structure || (props.name && props.name.includes('DP')) ? (
                <div className="space-y-3">
                  <div className="bg-orange-950/40 border border-orange-700/60 rounded-xl p-3.5 space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-orange-400 font-bold">
                      Substation Mounting Structure
                    </span>
                    <h4 className="text-sm font-bold text-orange-200">11 kV Double-Pole (DP) Gantry</h4>
                    <p className="text-[11px] text-slate-300">
                      Standard KSEB PSC 9m DP structure carrying distribution transformer, drop-out (DO) fuses, and AB switchgear.
                    </p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Structure Specification:</span>
                      <span className="text-orange-300 font-semibold">{props.name || 'PSC 9m 10FT DP'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Asset Code:</span>
                      <span className="text-slate-200 font-bold">{props.code}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Mounted Equipment:</span>
                      <span className="text-cyan-400 font-medium">DTR + DO Fuses + LA + AB Switch</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Operating Voltage:</span>
                      <span className="text-slate-200 font-semibold">11 kV Primary / 415 V Sec</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Earthing Standard:</span>
                      <span className="text-emerald-400">IS 3043 Pipe Earthing (Dual)</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Survey Lineage:</span>
                      <span className="text-emerald-400 font-semibold">DGPS Measured Field Point</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Structure Type:</span>
                    <span className="text-amber-400 font-semibold">{props.name || 'Support Pole (PSC)'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Asset Code:</span>
                    <span className="text-slate-200 font-bold">{props.code}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Operating Voltage:</span>
                    <span className="text-slate-200">{props.voltage_level_kv || 0.415} kV</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Survey Method:</span>
                    <span className="text-emerald-400 font-semibold">DGPS Field Survey (Measured)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Open Micro-Zoom Cluster Window CTA */}
          {onOpenClusterZoom && (asset.entity_type === 'pole' || asset.entity_type === 'distribution_transformer') && (
            <button
              onClick={() => onOpenClusterZoom(asset)}
              className="w-full flex items-center justify-between p-3.5 bg-orange-950/40 hover:bg-orange-900/50 border border-orange-700/60 rounded-xl text-orange-200 hover:text-white transition-all text-xs font-semibold group shadow-sm"
            >
              <div className="flex items-center space-x-2">
                <Gauge className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                <span>Open Micro-Zoom Cluster Window (21.5x)</span>
              </div>
              <ChevronRight className="w-4 h-4 text-orange-400" />
            </button>
          )}

          {/* Inspect Calculations CTA (Principle A4-8) */}
          {(asset.entity_type === 'distribution_transformer' || asset.entity_type === 'line') && (
            <button
              onClick={() => openCalculationInspection()}
              className="w-full flex items-center justify-between p-3.5 bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/60 rounded-xl text-blue-300 hover:text-white transition-all text-xs font-medium group"
            >
              <div className="flex items-center space-x-2">
                <Calculator className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>Inspect Calculation & Provenance Lineage</span>
              </div>
              <ChevronRight className="w-4 h-4 text-blue-400" />
            </button>
          )}
        </div>
      </div>

      {/* Mathematical Inspection Modal */}
      <CalculationModal
        isOpen={modalDetails !== null}
        onClose={() => setModalDetails(null)}
        details={modalDetails}
      />
    </>
  );
};
