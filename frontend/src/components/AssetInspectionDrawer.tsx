import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  Cpu,
  Gauge,
  Calculator,
  ChevronRight,
  Activity,
  TrendingUp,
  Flame,
  Maximize2,
  Minimize2,
  Layers,
  AlertTriangle,
  Info,
  Sparkles,
  Search,
} from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceBadge';
import { CalculationModal, CalculationDetails } from './CalculationModal';

export const fmtNum = (val: number | null | undefined, digits = 1, fallback = 'N/A'): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return fallback;
  return Number(val).toFixed(digits);
};

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

interface LoadInterval {
  hour: number;
  time_label: string;
  p50_kw: number;
  p10_kw: number;
  p90_kw: number;
  q50_kvar: number;
  loading_pct: number;
  is_overloaded: boolean;
  domestic_kw: number;
  commercial_kw: number;
  industrial_kw: number;
  agricultural_kw: number;
  technical_loss_kw: number;
  is_metered: boolean;
  provenance: string;
}

interface DTRLoadProfileReport {
  dtr_id: string;
  dtr_code: string;
  rated_kva: number;
  connected_consumers_count: number;
  total_sanctioned_load_kw: number;
  peak_demand_kw: number;
  peak_hour: number;
  min_demand_kw: number;
  average_demand_kw: number;
  load_factor: number;
  category_mix_pct: Record<string, number>;
  time_series: LoadInterval[];
  provenance: string;
  disclaimer: string;
}

interface ThermalInterval {
  hour: number;
  time_label: string;
  ambient_temp_c: number;
  load_ratio_k: number;
  top_oil_rise_c: number;
  top_oil_temp_c: number;
  hot_spot_rise_c: number;
  hot_spot_temp_c: number;
  relative_aging_rate: number;
  loss_of_life_hours: number;
  is_critical_hot_spot: boolean;
}

interface DTRThermalReport {
  dtr_id: string;
  dtr_code: string;
  rated_kva: number;
  peak_ambient_temp_c: number;
  peak_top_oil_temp_c: number;
  peak_hot_spot_temp_c: number;
  hours_overloaded: number;
  hours_critical_hot_spot: number;
  cumulative_aging_hours_24h: number;
  daily_aging_acceleration_factor: number;
  asset_health_index: number;
  health_category: string;
  time_series: ThermalInterval[];
  provenance: string;
  disclaimer: string;
}

interface ForecastDataPoint {
  horizon_hours: number;
  horizon_label: string;
  timestamp: string;
  hour_of_day: number;
  predicted_load_kw: number;
  confidence_p10_kw: number;
  confidence_p90_kw: number;
  predicted_loading_pct: number;
  status: string;
  is_overload: boolean;
  ambient_temp_c: number;
  is_ag_shift_active: boolean;
  model_name: string;
  provenance: string;
}

interface ModelBenchmarkMetric {
  horizon_hours: number;
  horizon_label: string;
  model_mae_kw: number;
  model_rmse_kw: number;
  model_mape_pct: number;
  model_r2: number;
  persistence_mae_kw: number;
  persistence_mape_pct: number;
  improvement_over_persistence_pct: number;
}

interface DTRForecastReport {
  dtr_id: string;
  dtr_code: string;
  dtr_name: string;
  rated_kva: number;
  rated_kw: number;
  current_load_kw: number;
  current_loading_pct: number;
  current_timestamp: string;
  forecasts: ForecastDataPoint[];
  benchmarks: ModelBenchmarkMetric[];
  feature_importances: Record<string, number>;
  validation_method: string;
  provenance: string;
  provenance_disclaimer: string;
}

export interface AssetInspectionDrawerProps {
  asset: SelectedAsset | null;
  onClose: () => void;
  onOpenClusterZoom?: () => void;
  isClusterZoomOpen?: boolean;
}

export const AssetInspectionDrawer: React.FC<AssetInspectionDrawerProps> = ({
  asset,
  onClose,
  onOpenClusterZoom,
  isClusterZoomOpen,
}) => {
  const [modalDetails, setModalDetails] = useState<CalculationDetails | null>(null);
  const [dtrTab, setDtrTab] = useState<'overview' | 'estimation' | 'thermal' | 'forecast'>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('dtr_tab');
      if (p === 'estimation' || p === 'thermal' || p === 'forecast') return p;
    } catch {}
    return 'overview';
  });
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('dtr_tab');
      if (p === 'estimation' || p === 'thermal' || p === 'forecast') return true;
    } catch {}
    return false;
  });

  // Milestone 6 & 7 State: Load Profile, Thermal Dynamics, ML Forecast
  const [loadProfile, setLoadProfile] = useState<DTRLoadProfileReport | null>(null);
  const [thermalReport, setThermalReport] = useState<DTRThermalReport | null>(null);
  const [forecastReport, setForecastReport] = useState<DTRForecastReport | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState<boolean>(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [hoveredForecastIdx, setHoveredForecastIdx] = useState<number | null>(null);
  const [meteringCoverage, setMeteringCoverage] = useState<number>(0);

  const props = asset?.properties || {};

  // Fetch Milestone 6 & 7 data when a DTR is inspected
  useEffect(() => {
    if (!asset || asset.entity_type !== 'distribution_transformer') {
      setLoadProfile(null);
      setThermalReport(null);
      setForecastReport(null);
      return;
    }

    let isMounted = true;
    setIsLoadingAnalytics(true);
    setAnalyticsError(null);

    Promise.all([
      fetch(`/api/v1/estimation/dtr-profile?dtr_code=${encodeURIComponent(asset.code)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch load profile`);
          return res.json();
        }),
      fetch(`/api/v1/thermal/dtr-dynamics?dtr_code=${encodeURIComponent(asset.code)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch thermal dynamics`);
          return res.json();
        }),
      fetch(`/api/v1/forecast/dtr?dtr_code=${encodeURIComponent(asset.code)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch ML forecast`);
          return res.json();
        }),
    ])
      .then(([profile, thermal, forecast]) => {
        if (isMounted) {
          setLoadProfile(profile);
          setThermalReport(thermal);
          setForecastReport(forecast);
          setIsLoadingAnalytics(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('DTR analytics error:', err);
          setAnalyticsError(err.message);
          setIsLoadingAnalytics(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [asset?.code, asset?.entity_type]);

  const isDtr = asset?.entity_type === 'distribution_transformer';

  const openCalculationInspection = () => {
    if (!asset) return;
    if (isDtr) {
      const ratedKva = props.rated_kva || loadProfile?.rated_kva || 100.0;
      const peakDemandKw = loadProfile?.peak_demand_kw || (ratedKva * 0.75 * 0.9);
      const hotSpotC = thermalReport?.peak_hot_spot_temp_c || 85.6;
      const topOilC = thermalReport?.peak_top_oil_temp_c || 68.2;
      const ahi = thermalReport?.asset_health_index || 95.0;

      setModalDetails({
        title: `IEC 60076-7 Thermal Dynamics & Load Allocation: ${asset.code}`,
        metric: `Health Index: ${ahi}/100 | Peak Hot-Spot: ${hotSpotC}°C`,
        formula: 'dθ_o/dt = (1/τ_o) * [Δθ_or * ((1 + R*K^2)/(1 + R))^x - Δθ_o],  V = 2^((θ_h - 98) / 6)',
        latexFormula:
          '\\frac{d\\theta_o}{dt} = \\frac{1}{\\tau_o} \\left[ \\Delta\\theta_{or} \\left( \\frac{1 + R K^2}{1 + R} \\right)^x - \\Delta\\theta_o \\right], \\quad V = 2^{\\frac{\\theta_h - 98}{6}}',
        description:
          'Dynamic thermal simulation of oil and winding temperatures per IEC 60076-7 differential equations, coupled with top-down feeder SCADA disaggregation across domestic, commercial, industrial, and agricultural consumer archetypes.',
        inputs: {
          'Rated Capacity (kVA)': ratedKva,
          'Peak Demand (kW)': fmtNum(peakDemandKw, 1),
          'Top-Oil Time Constant (τ_o)': '150 min (2.5 hrs)',
          'Hot-Spot Time Constant (τ_h)': '7 min',
          'Loss Ratio (R = P_cu / P_fe)': '4.50',
          'Oil Exponent (x)': '0.80',
          'Winding Exponent (y)': '1.60',
          'Peak Top-Oil Temp (θ_o)': `${topOilC}°C`,
          'Peak Hot-Spot Temp (θ_h)': `${hotSpotC}°C`,
          'Asset Health Index (AHI)': `${ahi} / 100`,
        },
        assumptions: [
          'Top-oil rise Δθ_or = 55 K, Hot-spot rise Δθ_hr = 23 K at rated capacity.',
          'Montsinger relative aging rate doubles for every 6°C rise above 98°C reference.',
          'Telangana agricultural shift active between 10:00 and 17:00 (7-hour day pumping).',
          'Uncertainty intervals (P10/P90) reflect unmetered distribution transformer variance.',
        ],
        constraints: [
          'Normal continuous thermal rating: Hot-spot θ_h ≤ 98°C (V ≤ 1.0).',
          'IEC 60076-7 Emergency critical threshold: θ_h < 120°C.',
          'Maximum continuous transformer loading ≤ 100% rated kVA.',
        ],
        sourceStandards: [
          'IEC 60076-7:2018 Loading Guide for Oil-Immersed Power Transformers',
          'IS 1180 (Part 1): 2014 Outdoor Distribution Transformers up to 2500 kVA',
          'IEEE Std C57.91-2011 Guide for Loading Mineral-Oil-Immersed Transformers',
          'CEA Guidelines for Technical Loss Calculation in Distribution Networks',
        ],
        provenance: 'estimated',
        confidenceScore: asset.confidence_score || 0.95,
      });
    } else if (asset.entity_type === 'line') {
      const lengthKm = props.length_km || 0.5;
      const rOhm = props.r_ohm_per_km || 0.9075;
      const xOhm = props.x_ohm_per_km || 0.377;
      const maxAmp = (props.max_i_ka || 0.134) * 1000;
      const pf = props.physics_result;

      setModalDetails({
        title: `Line Series Impedance & Physics Lineage: ${asset.code}`,
        metric: pf
          ? `Thermal Loading: ${pf.loading_percent}% (Loss: ${pf.active_loss_kw} kW)`
          : 'Branch Series Impedance (Z = R + jX)',
        formula: pf
          ? `P_loss = 3 * I^2 * R * L = 3 * (${fmtNum(pf.current_ka * 1000, 1)} A)^2 * ${rOhm} Ω/km * ${lengthKm} km = ${pf.active_loss_kw} kW`
          : 'Z_branch = (r_ohm_per_km + j * x_ohm_per_km) * length_km',
        latexFormula: pf
          ? 'P_{\\text{loss}} = 3 \\cdot I_{\\text{line}}^2 \\cdot R_{\\text{cond}} \\cdot L_{\\text{km}}'
          : 'Z_{\\text{branch}} = (R + jX) \\cdot L_{\\text{km}}',
        description: pf
          ? 'Solved via balanced AC Newton-Raphson power flow (pandapower core). Line loading computed against ambient-derated ampacity per IEEE Std 738.'
          : 'Series resistance and inductive reactance computed from physical conductor cross-section and geodesic path length. Governs positive-sequence voltage drop in AC Newton-Raphson power flow.',
        inputs: {
          'Conductor Type': props.conductor_type || 'ACSR_Weasel',
          'Total Length (km)': lengthKm,
          'Resistance R (Ω/km)': rOhm,
          'Reactance X (Ω/km)': xOhm,
          'Total Branch Resistance (Ω)': fmtNum(rOhm * lengthKm, 4),
          'Total Branch Reactance (Ω)': fmtNum(xOhm * lengthKm, 4),
          ...(pf
            ? {
                'Operating Current (A)': fmtNum(pf.current_ka * 1000, 1),
                'Active Technical Loss (kW)': pf.active_loss_kw,
                'Reactive Technical Loss (kVAr)': pf.reactive_loss_kvar,
                'Derated Ampacity (A)': fmtNum(pf.max_i_ka * 1000, 1),
                'Pandapower Loading (%)': `${pf.loading_percent}%`,
              }
            : {
                'Thermal Ampacity (A)': fmtNum(maxAmp, 0),
              }),
        },
        assumptions: [
          'Conductor temperature normalized to 75°C operating resistance.',
          'Geometry follows surveyed pole coordinates.',
          'Ampacity derated per IEEE Std 738 ambient temperature curve.',
        ],
        constraints: [
          'Branch current I ≤ Thermal Ampacity (I_max).',
          'Statutory voltage drop across feeder ≤ 6.0% (TGERC).',
        ],
        sourceStandards: [
          'REC Construction Standards & BIS 398 Part 2 Specification',
          'IEEE Std 738-2012 Standard for Calculating Bare Overhead Conductor Temperature and Ampacity',
          'TGERC Distribution Supply Code 2024',
        ],
        provenance: pf ? 'estimated' : asset.provenance,
        confidenceScore: asset.confidence_score || 0.90,
      });
    }
  };

  // Helper calculation for Load Profile SVG Coordinates
  const loadChartData = useMemo(() => {
    if (!loadProfile || !loadProfile.time_series || loadProfile.time_series.length === 0) return null;
    const series = loadProfile.time_series;
    const maxVal = Math.max(...series.map((d) => d.p90_kw), (loadProfile.rated_kva * 0.9) * 1.05, 50);
    const minVal = 0;
    const svgW = 460;
    const svgH = 150;
    const padL = 40;
    const padR = 20;
    const padT = 15;
    const padB = 25;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    const getX = (hour: number) => padL + (hour / 23) * plotW;
    const getY = (val: number) => padT + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

    // Apply smart metering sensitivity slider: at 50% metering, P10/P90 interval contracts towards P50
    const shrinkFactor = 1.0 - (meteringCoverage / 100) * 0.65;

    // Build P10-P90 polygon points
    let polyPoints = '';
    // Forward P90
    series.forEach((d) => {
      const adjustedP90 = d.p50_kw + (d.p90_kw - d.p50_kw) * shrinkFactor;
      polyPoints += `${getX(d.hour).toFixed(1)},${getY(adjustedP90).toFixed(1)} `;
    });
    // Reverse P10
    for (let i = series.length - 1; i >= 0; i--) {
      const d = series[i];
      const adjustedP10 = Math.max(0, d.p50_kw - (d.p50_kw - d.p10_kw) * shrinkFactor);
      polyPoints += `${getX(d.hour).toFixed(1)},${getY(adjustedP10).toFixed(1)} `;
    }

    // P50 line points
    const p50Points = series.map((d) => `${getX(d.hour).toFixed(1)},${getY(d.p50_kw).toFixed(1)}`).join(' ');

    // Rated capacity Y
    const ratedKw = loadProfile.rated_kva * 0.9;
    const ratedY = getY(ratedKw);

    return {
      svgW,
      svgH,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      maxVal,
      minVal,
      getX,
      getY,
      polyPoints,
      p50Points,
      ratedKw,
      ratedY,
      series,
    };
  }, [loadProfile, meteringCoverage]);

  // Helper calculation for Thermal Dynamics SVG Coordinates
  const thermalChartData = useMemo(() => {
    if (!thermalReport || !thermalReport.time_series || thermalReport.time_series.length === 0) return null;
    const series = thermalReport.time_series;
    const maxVal = Math.max(130, ...series.map((d) => d.hot_spot_temp_c * 1.05));
    const minVal = 20;
    const svgW = 460;
    const svgH = 150;
    const padL = 40;
    const padR = 20;
    const padT = 15;
    const padB = 25;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    const getX = (hour: number) => padL + (hour / 23) * plotW;
    const getY = (val: number) => padT + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

    const hotSpotPoints = series.map((d) => `${getX(d.hour).toFixed(1)},${getY(d.hot_spot_temp_c).toFixed(1)}`).join(' ');
    const topOilPoints = series.map((d) => `${getX(d.hour).toFixed(1)},${getY(d.top_oil_temp_c).toFixed(1)}`).join(' ');
    const ambientPoints = series.map((d) => `${getX(d.hour).toFixed(1)},${getY(d.ambient_temp_c).toFixed(1)}`).join(' ');

    const criticalY = getY(120.0);

    return {
      svgW,
      svgH,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      maxVal,
      minVal,
      getX,
      getY,
      hotSpotPoints,
      topOilPoints,
      ambientPoints,
      criticalY,
      series,
    };
  }, [thermalReport]);

  // Helper calculation for ML Forecast SVG Quantile Cone Coordinates (TR-FOR-01..03)
  const forecastChartData = useMemo(() => {
    if (!forecastReport || !forecastReport.forecasts || forecastReport.forecasts.length === 0) return null;
    const forecasts = forecastReport.forecasts;
    const currentKw = forecastReport.current_load_kw;
    const ratedKw = forecastReport.rated_kw;

    // Cones: 0h (current), 1h, 4h, 8h, 24h
    const pts = [
      { h: 0, p10: currentKw, p50: currentKw, p90: currentKw, label: 'Now' },
      ...forecasts.map((f) => ({
        h: f.horizon_hours,
        p10: f.confidence_p10_kw,
        p50: f.predicted_load_kw,
        p90: f.confidence_p90_kw,
        label: `+${f.horizon_hours}h`,
        data: f,
      })),
    ];

    const maxVal = Math.max(...pts.map((p) => p.p90), ratedKw * 1.1, 40);
    const minVal = 0;
    const svgW = 460;
    const svgH = 150;
    const padL = 40;
    const padR = 20;
    const padT = 15;
    const padB = 25;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    // Even horizontal spacing across the 5 points (0, 1h, 4h, 8h, 24h)
    const getX = (idx: number) => padL + (idx / (pts.length - 1)) * plotW;
    const getY = (val: number) => padT + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

    // Cone polygon: forward p90 then reverse p10
    let conePoly = '';
    pts.forEach((p, idx) => {
      conePoly += `${getX(idx).toFixed(1)},${getY(p.p90).toFixed(1)} `;
    });
    for (let i = pts.length - 1; i >= 0; i--) {
      conePoly += `${getX(i).toFixed(1)},${getY(pts[i].p10).toFixed(1)} `;
    }

    const p50Points = pts.map((p, idx) => `${getX(idx).toFixed(1)},${getY(p.p50).toFixed(1)}`).join(' ');
    const ratedY = getY(ratedKw);

    return {
      svgW,
      svgH,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      maxVal,
      minVal,
      getX,
      getY,
      conePoly,
      p50Points,
      ratedKw,
      ratedY,
      pts,
    };
  }, [forecastReport]);

  if (!asset) return null;

  return (
    <>
      <div
        className={`absolute right-0 top-0 bottom-0 bg-slate-900 border-l border-slate-800 shadow-2xl backdrop-blur-md z-[2000] flex flex-col transition-all duration-300 ${
          isDtr && isExpanded ? 'w-full max-w-[560px]' : 'w-96'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                asset.entity_type === 'distribution_transformer'
                  ? 'bg-amber-600/20 border-amber-500/40 text-amber-400'
                  : asset.entity_type === 'line'
                  ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-400'
                  : asset.entity_type === 'substation'
                  ? 'bg-purple-600/20 border-purple-500/40 text-purple-400'
                  : 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400'
              }`}
            >
              {asset.entity_type === 'distribution_transformer' ? (
                <Gauge className="w-5 h-5" />
              ) : asset.entity_type === 'line' ? (
                <Activity className="w-5 h-5" />
              ) : asset.entity_type === 'substation' ? (
                <Cpu className="w-5 h-5" />
              ) : (
                <Zap className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                  {asset.entity_type.replace('_', ' ')}
                </span>
                {isDtr && thermalReport && thermalReport.asset_health_index != null && (
                  <span
                    className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded border ${
                      thermalReport.asset_health_index >= 85
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                        : thermalReport.asset_health_index >= 60
                        ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                        : 'bg-rose-950/70 text-rose-300 border-rose-800'
                    }`}
                  >
                    AHI: {fmtNum(thermalReport.asset_health_index, 0)}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight truncate max-w-[220px]">
                {asset.name || asset.code}
              </h3>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {onOpenClusterZoom && (
              <button
                onClick={onOpenClusterZoom}
                title={isClusterZoomOpen ? 'Magnifier window active' : 'Reopen 22x High-Resolution Magnifier'}
                className={`px-2 py-1 rounded-lg border transition-colors flex items-center space-x-1 text-[11px] font-mono font-bold ${
                  isClusterZoomOpen
                    ? 'text-amber-300 bg-amber-950/80 border-amber-500'
                    : 'text-slate-400 hover:text-amber-300 bg-slate-900 border-slate-700 hover:border-amber-600'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Magnifier</span>
              </button>
            )}
            {isDtr && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Collapse width' : 'Expand width for chart inspection'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Milestone 6 & 7 Tab Bar for DTR */}
        {isDtr && (
          <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/90 text-xs font-semibold">
            <button
              onClick={() => setDtrTab('overview')}
              className={`py-2 px-1 flex items-center justify-center space-x-1 border-b-2 transition-all ${
                dtrTab === 'overview'
                  ? 'border-blue-500 text-blue-400 bg-blue-950/30 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Specs</span>
            </button>
            <button
              onClick={() => setDtrTab('estimation')}
              className={`py-2 px-1 flex items-center justify-center space-x-1 border-b-2 transition-all ${
                dtrTab === 'estimation'
                  ? 'border-cyan-500 text-cyan-400 bg-cyan-950/30 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>24h Load</span>
            </button>
            <button
              onClick={() => setDtrTab('thermal')}
              className={`py-2 px-1 flex items-center justify-center space-x-1 border-b-2 transition-all ${
                dtrTab === 'thermal'
                  ? 'border-amber-500 text-amber-400 bg-amber-950/30 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>IEC Thermal</span>
            </button>
            <button
              onClick={() => setDtrTab('forecast')}
              className={`py-2 px-1 flex items-center justify-center space-x-1 border-b-2 transition-all ${
                dtrTab === 'forecast'
                  ? 'border-purple-500 text-purple-400 bg-purple-950/30 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>ML Forecast</span>
            </button>
          </div>
        )}

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {/* Provenance Banner */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">Provenance Lineage:</span>
            <div className="flex items-center space-x-2">
              <ProvenanceBadge provenance={isDtr ? 'estimated' : asset.provenance} />
              {asset.confidence_score && (
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800/60 px-2 py-0.5 rounded">
                  {fmtNum(asset.confidence_score * 100, 0)}%
                </span>
              )}
            </div>
          </div>

          {/* DTR TAB 1: SPECS & OVERVIEW */}
          {isDtr && dtrTab === 'overview' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border ${
                  (props.loading_pct || 75.0) > 100
                    ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                    : (props.loading_pct || 75.0) > 80
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
                      (props.loading_pct || 75.0) > 100
                        ? 'bg-rose-500'
                        : (props.loading_pct || 75.0) > 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, props.loading_pct || 75)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs mt-2 font-mono">
                  <span>Capacity: {props.rated_kva || loadProfile?.rated_kva || 100} kVA</span>
                  <span>Status: {props.status || 'NORMAL'}</span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Parent Bus:</span>
                  <span className="text-slate-200 font-semibold">{props.bus_code || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Connected Consumers:</span>
                  <span className="text-cyan-400 font-bold">
                    {loadProfile?.connected_consumers_count ?? props.connected_consumers_count ?? 48}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Sanctioned Load:</span>
                  <span className="text-slate-200">
                    {fmtNum(loadProfile?.total_sanctioned_load_kw, 1, '185.0')} kW
                  </span>
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
                  <span className={props.is_metered ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-medium'}>
                    {props.is_metered ? 'AMI Direct Metered' : 'Unmetered (SCADA Disaggregated)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* DTR TAB 2: 24-HOUR LOAD ALLOCATION (TR-EST) */}
          {isDtr && dtrTab === 'estimation' && (
            <div className="space-y-4">
              {isLoadingAnalytics ? (
                <div className="p-8 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center space-y-2">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  <span>Disaggregating Feeder SCADA Curve...</span>
                </div>
              ) : loadProfile ? (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-center">
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Peak Demand</span>
                      <span className="text-sm font-bold text-cyan-400">{fmtNum(loadProfile.peak_demand_kw, 1)} kW</span>
                      <span className="text-[9px] text-slate-500 block">@ {loadProfile.peak_hour ?? 14}:00 hrs</span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Load Factor</span>
                      <span className="text-sm font-bold text-blue-400">{fmtNum(loadProfile.load_factor, 2)}</span>
                      <span className="text-[9px] text-slate-500 block">Avg/Peak</span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Rated Capacity</span>
                      <span className="text-sm font-bold text-white">{fmtNum(loadProfile.rated_kva * 0.9, 0)} kW</span>
                      <span className="text-[9px] text-slate-500 block">{loadProfile.rated_kva ?? 100} kVA @ 0.9pf</span>
                    </div>
                  </div>

                  {/* Category Mix Breakdown */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 font-mono text-xs">
                    <span className="text-[11px] font-semibold text-slate-300 block">Consumer Category Breakdown:</span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="flex items-center justify-between bg-blue-950/30 border border-blue-900/40 px-2 py-1 rounded">
                        <span className="text-blue-300 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Domestic
                        </span>
                        <span className="font-bold text-blue-200">{loadProfile.category_mix_pct.domestic ?? 55}%</span>
                      </div>
                      <div className="flex items-center justify-between bg-purple-950/30 border border-purple-900/40 px-2 py-1 rounded">
                        <span className="text-purple-300 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Commercial
                        </span>
                        <span className="font-bold text-purple-200">{loadProfile.category_mix_pct.commercial ?? 20}%</span>
                      </div>
                      <div className="flex items-center justify-between bg-amber-950/30 border border-amber-900/40 px-2 py-1 rounded">
                        <span className="text-amber-300 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Industrial
                        </span>
                        <span className="font-bold text-amber-200">{loadProfile.category_mix_pct.industrial ?? 10}%</span>
                      </div>
                      <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-900/40 px-2 py-1 rounded">
                        <span className="text-emerald-300 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Ag Pumping
                        </span>
                        <span className="font-bold text-emerald-200">{loadProfile.category_mix_pct.agricultural ?? 15}%</span>
                      </div>
                    </div>
                  </div>

                  {/* 24-Hour Diurnal SVG Chart with P10/P50/P90 Ribbon */}
                  {loadChartData && (
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-cyan-400" /> Diurnal Load Profile (kW)
                        </span>
                        <span className="text-[10px] text-slate-400">P10 - P90 Uncertainty Ribbon</span>
                      </div>

                      <div className="relative overflow-x-auto">
                        <svg
                          viewBox={`0 0 ${loadChartData.svgW} ${loadChartData.svgH}`}
                          className="w-full h-40 select-none font-mono text-[9px]"
                        >
                          {/* Grid lines */}
                          <line
                            x1={loadChartData.padL}
                            y1={loadChartData.padT}
                            x2={loadChartData.svgW - loadChartData.padR}
                            y2={loadChartData.padT}
                            stroke="#334155"
                            strokeDasharray="2 2"
                            strokeWidth="0.7"
                          />
                          <line
                            x1={loadChartData.padL}
                            y1={loadChartData.padT + loadChartData.plotH * 0.5}
                            x2={loadChartData.svgW - loadChartData.padR}
                            y2={loadChartData.padT + loadChartData.plotH * 0.5}
                            stroke="#334155"
                            strokeDasharray="2 2"
                            strokeWidth="0.7"
                          />
                          <line
                            x1={loadChartData.padL}
                            y1={loadChartData.padT + loadChartData.plotH}
                            x2={loadChartData.svgW - loadChartData.padR}
                            y2={loadChartData.padT + loadChartData.plotH}
                            stroke="#475569"
                            strokeWidth="1"
                          />

                          {/* Y Axis Labels */}
                          <text x={loadChartData.padL - 6} y={loadChartData.padT + 8} fill="#94a3b8" textAnchor="end">
                            {fmtNum(loadChartData.maxVal, 0)}k
                          </text>
                          <text
                            x={loadChartData.padL - 6}
                            y={loadChartData.padT + loadChartData.plotH * 0.5 + 4}
                            fill="#64748b"
                            textAnchor="end"
                          >
                            {fmtNum(loadChartData.maxVal * 0.5, 0)}k
                          </text>
                          <text
                            x={loadChartData.padL - 6}
                            y={loadChartData.padT + loadChartData.plotH}
                            fill="#64748b"
                            textAnchor="end"
                          >
                            0
                          </text>

                          {/* Rated Capacity Line */}
                          {loadChartData.ratedY >= loadChartData.padT && (
                            <>
                              <line
                                x1={loadChartData.padL}
                                y1={loadChartData.ratedY}
                                x2={loadChartData.svgW - loadChartData.padR}
                                y2={loadChartData.ratedY}
                                stroke="#f43f5e"
                                strokeDasharray="3 3"
                                strokeWidth="1.2"
                              />
                              <text
                                x={loadChartData.svgW - loadChartData.padR - 4}
                                y={loadChartData.ratedY - 4}
                                fill="#fb7185"
                                textAnchor="end"
                                fontSize="8"
                                fontWeight="bold"
                              >
                                Rated: {fmtNum(loadChartData.ratedKw, 0)} kW
                              </text>
                            </>
                          )}

                          {/* P10 - P90 Shaded Uncertainty Ribbon */}
                          <polygon points={loadChartData.polyPoints} fill="rgba(6, 182, 212, 0.15)" stroke="none" />

                          {/* P50 Median Line */}
                          <polyline
                            points={loadChartData.p50Points}
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Hover Vertical Line and Points */}
                          {loadChartData.series.map((d) => {
                            const cx = loadChartData.getX(d.hour);
                            const cy = loadChartData.getY(d.p50_kw);
                            const isHovered = hoveredHour === d.hour;

                            return (
                              <g key={d.hour}>
                                {isHovered && (
                                  <line
                                    x1={cx}
                                    y1={loadChartData.padT}
                                    x2={cx}
                                    y2={loadChartData.padT + loadChartData.plotH}
                                    stroke="#38bdf8"
                                    strokeDasharray="2 2"
                                    strokeWidth="1"
                                  />
                                )}
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isHovered ? 4.5 : 2.5}
                                  fill={isHovered ? '#38bdf8' : '#0891b2'}
                                  stroke={isHovered ? '#ffffff' : '#0e7490'}
                                  strokeWidth={isHovered ? 2 : 1}
                                  className="cursor-pointer transition-all"
                                  onMouseEnter={() => setHoveredHour(d.hour)}
                                  onMouseLeave={() => setHoveredHour(null)}
                                />
                              </g>
                            );
                          })}

                          {/* X Axis Time Labels */}
                          {[0, 4, 8, 12, 16, 20, 23].map((hr) => (
                            <text
                              key={hr}
                              x={loadChartData.getX(hr)}
                              y={loadChartData.padT + loadChartData.plotH + 15}
                              fill="#94a3b8"
                              textAnchor="middle"
                              fontSize="8"
                            >
                              {String(hr).padStart(2, '0')}:00
                            </text>
                          ))}
                        </svg>
                      </div>

                      {/* Interactive Hover Inspection Strip */}
                      {hoveredHour !== null && loadProfile.time_series[hoveredHour] && (
                        <div className="bg-slate-900 border border-cyan-800/80 rounded-lg p-2 font-mono text-[11px] animate-in fade-in duration-150">
                          <div className="flex justify-between items-center text-cyan-300 font-bold border-b border-cyan-900/50 pb-1 mb-1">
                            <span>Hour {String(hoveredHour).padStart(2, '0')}:00 Snapshot</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] ${
                                (loadProfile.time_series[hoveredHour].loading_pct ?? 0) > 100
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              }`}
                            >
                              {fmtNum(loadProfile.time_series[hoveredHour].loading_pct, 1)}% Load
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>
                              P50 Estimate:{' '}
                              <span className="text-white font-bold">
                                {fmtNum(loadProfile.time_series[hoveredHour].p50_kw, 1)} kW
                              </span>
                            </div>
                            <div>
                              P10 - P90 Band:{' '}
                              <span className="text-cyan-300">
                                {fmtNum(loadProfile.time_series[hoveredHour].p10_kw, 1)} -{' '}
                                {fmtNum(loadProfile.time_series[hoveredHour].p90_kw, 1)} kW
                              </span>
                            </div>
                            <div>
                              Domestic:{' '}
                              <span className="text-blue-300">
                                {fmtNum(loadProfile.time_series[hoveredHour].domestic_kw, 1)} kW
                              </span>
                            </div>
                            <div>
                              Commercial:{' '}
                              <span className="text-purple-300">
                                {fmtNum(loadProfile.time_series[hoveredHour].commercial_kw, 1)} kW
                              </span>
                            </div>
                            <div>
                              Industrial:{' '}
                              <span className="text-amber-300">
                                {fmtNum(loadProfile.time_series[hoveredHour].industrial_kw, 1)} kW
                              </span>
                            </div>
                            <div>
                              Ag Pumping (7h):{' '}
                              <span className="text-emerald-300">
                                {fmtNum(loadProfile.time_series[hoveredHour].agricultural_kw, 1)} kW
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Smart Metering Sensitivity Slider (TR-EST-04) */}
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                          <span className="flex items-center gap-1 text-slate-300">
                            <Layers className="w-3 h-3 text-cyan-400" /> Smart Metering Penetration (AMI):
                          </span>
                          <span className="text-cyan-400 font-bold">{meteringCoverage}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          step="5"
                          value={meteringCoverage}
                          onChange={(e) => setMeteringCoverage(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
                          <span>0% (Feeder SCADA only)</span>
                          <span className="text-cyan-400">
                            Uncertainty Width: -{fmtNum(meteringCoverage * 1.25, 0)}%
                          </span>
                          <span>50% (Smart Grids)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Estimation Provenance Disclaimer Banner (Principle A4-7) */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center space-x-1.5 text-cyan-400 font-semibold">
                      <Info className="w-3.5 h-3.5" />
                      <span>SCADA Disaggregation Provenance (TR-EST-05)</span>
                    </div>
                    <p className="leading-relaxed">
                      {loadProfile.disclaimer ||
                        'DTR demand estimated from feeder-head SCADA disaggregation and sanctioned connected loads.'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  {analyticsError ? `Error: ${analyticsError}` : 'No load profile data available.'}
                </div>
              )}
            </div>
          )}

          {/* DTR TAB 3: IEC 60076-7 THERMAL DYNAMICS (TR-THM) */}
          {isDtr && dtrTab === 'thermal' && (
            <div className="space-y-4">
              {isLoadingAnalytics ? (
                <div className="p-8 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center space-y-2">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>Integrating IEC 60076-7 Differential Equations...</span>
                </div>
              ) : thermalReport ? (
                <>
                  {/* Asset Health Index & Life Consumption Banner */}
                  <div
                    className={`p-4 rounded-xl border font-mono ${
                      thermalReport.asset_health_index >= 85
                        ? 'bg-emerald-950/40 border-emerald-800/80'
                        : thermalReport.asset_health_index >= 60
                        ? 'bg-amber-950/40 border-amber-800/80'
                        : 'bg-rose-950/40 border-rose-800/80'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs uppercase text-slate-400 font-bold flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-amber-400" /> Asset Health Index (AHI)
                      </span>
                      <span
                        className={`text-xl font-extrabold ${
                          thermalReport.asset_health_index >= 85
                            ? 'text-emerald-400'
                            : thermalReport.asset_health_index >= 60
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {fmtNum(thermalReport.asset_health_index, 1)} / 100
                      </span>
                    </div>

                    <div className="w-full bg-slate-900/80 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          thermalReport.asset_health_index >= 85
                            ? 'bg-emerald-500'
                            : thermalReport.asset_health_index >= 60
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, thermalReport.asset_health_index)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-slate-300">
                      <div>
                        Status:{' '}
                        <span className="font-bold uppercase text-white">{thermalReport.health_category}</span>
                      </div>
                      <div>
                        Life Loss:{' '}
                        <span className="font-bold text-amber-400">
                          {fmtNum(thermalReport.cumulative_aging_hours_24h, 1)} h/day
                        </span>
                      </div>
                      <div>
                        Hours Overload:{' '}
                        <span className="font-bold text-white">{thermalReport.hours_overloaded} hrs</span>
                      </div>
                      <div>
                        Critical Hot-Spot (≥120°C):{' '}
                        <span
                          className={`font-bold ${
                            thermalReport.hours_critical_hot_spot > 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {thermalReport.hours_critical_hot_spot} hrs
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Temperature Metrics Triple */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-center">
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Peak Hot-Spot</span>
                      <span
                        className={`text-sm font-bold ${
                          thermalReport.peak_hot_spot_temp_c >= 120
                            ? 'text-rose-400'
                            : thermalReport.peak_hot_spot_temp_c >= 98
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {fmtNum(thermalReport.peak_hot_spot_temp_c, 1)}°C
                      </span>
                      <span className="text-[9px] text-slate-500 block">θ_h (Winding)</span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Peak Top-Oil</span>
                      <span className="text-sm font-bold text-orange-400">
                        {fmtNum(thermalReport.peak_top_oil_temp_c, 1)}°C
                      </span>
                      <span className="text-[9px] text-slate-500 block">θ_o (Oil Rise)</span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Peak Ambient</span>
                      <span className="text-sm font-bold text-slate-300">
                        {fmtNum(thermalReport.peak_ambient_temp_c, 1)}°C
                      </span>
                      <span className="text-[9px] text-slate-500 block">θ_a (Telangana)</span>
                    </div>
                  </div>

                  {/* 24-Hour Thermal Dynamics SVG Chart */}
                  {thermalChartData && (
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-amber-400" /> IEC 60076-7 Temperature Profiles (°C)
                        </span>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="text-amber-400 flex items-center gap-1">
                            <span className="w-2 h-0.5 bg-amber-400 inline-block" /> Hot-Spot
                          </span>
                          <span className="text-orange-400 flex items-center gap-1">
                            <span className="w-2 h-0.5 bg-orange-400 inline-block" /> Top-Oil
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <span className="w-2 h-0.5 bg-slate-400 inline-block" /> Ambient
                          </span>
                        </div>
                      </div>

                      <div className="relative overflow-x-auto">
                        <svg
                          viewBox={`0 0 ${thermalChartData.svgW} ${thermalChartData.svgH}`}
                          className="w-full h-40 select-none font-mono text-[9px]"
                        >
                          {/* Grid lines */}
                          <line
                            x1={thermalChartData.padL}
                            y1={thermalChartData.padT}
                            x2={thermalChartData.svgW - thermalChartData.padR}
                            y2={thermalChartData.padT}
                            stroke="#334155"
                            strokeDasharray="2 2"
                            strokeWidth="0.7"
                          />
                          <line
                            x1={thermalChartData.padL}
                            y1={thermalChartData.padT + thermalChartData.plotH * 0.5}
                            x2={thermalChartData.svgW - thermalChartData.padR}
                            y2={thermalChartData.padT + thermalChartData.plotH * 0.5}
                            stroke="#334155"
                            strokeDasharray="2 2"
                            strokeWidth="0.7"
                          />
                          <line
                            x1={thermalChartData.padL}
                            y1={thermalChartData.padT + thermalChartData.plotH}
                            x2={thermalChartData.svgW - thermalChartData.padR}
                            y2={thermalChartData.padT + thermalChartData.plotH}
                            stroke="#475569"
                            strokeWidth="1"
                          />

                          {/* Y Axis Labels */}
                          <text x={thermalChartData.padL - 6} y={thermalChartData.padT + 8} fill="#94a3b8" textAnchor="end">
                            {fmtNum(thermalChartData.maxVal, 0)}°
                          </text>
                          <text
                            x={thermalChartData.padL - 6}
                            y={thermalChartData.padT + thermalChartData.plotH * 0.5 + 4}
                            fill="#64748b"
                            textAnchor="end"
                          >
                            {fmtNum((thermalChartData.maxVal + thermalChartData.minVal) * 0.5, 0)}°
                          </text>
                          <text
                            x={thermalChartData.padL - 6}
                            y={thermalChartData.padT + thermalChartData.plotH}
                            fill="#64748b"
                            textAnchor="end"
                          >
                            {thermalChartData.minVal}°
                          </text>

                          {/* IEC 60076-7 120°C Emergency Threshold Line */}
                          {thermalChartData.criticalY >= thermalChartData.padT && (
                            <>
                              <line
                                x1={thermalChartData.padL}
                                y1={thermalChartData.criticalY}
                                x2={thermalChartData.svgW - thermalChartData.padR}
                                y2={thermalChartData.criticalY}
                                stroke="#f43f5e"
                                strokeDasharray="3 3"
                                strokeWidth="1.2"
                              />
                              <text
                                x={thermalChartData.svgW - thermalChartData.padR - 4}
                                y={thermalChartData.criticalY - 4}
                                fill="#fb7185"
                                textAnchor="end"
                                fontSize="8"
                                fontWeight="bold"
                              >
                                120°C Emergency Limit
                              </text>
                            </>
                          )}

                          {/* Ambient Temp Polyline */}
                          <polyline
                            points={thermalChartData.ambientPoints}
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth="1.5"
                            strokeDasharray="3 2"
                          />

                          {/* Top-Oil Temp Polyline */}
                          <polyline
                            points={thermalChartData.topOilPoints}
                            fill="none"
                            stroke="#fb923c"
                            strokeWidth="2.0"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Hot-Spot Temp Polyline */}
                          <polyline
                            points={thermalChartData.hotSpotPoints}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Interactive Hover Point Markers */}
                          {thermalChartData.series.map((d) => {
                            const cx = thermalChartData.getX(d.hour);
                            const cy = thermalChartData.getY(d.hot_spot_temp_c);
                            const isHovered = hoveredHour === d.hour;

                            return (
                              <g key={d.hour}>
                                {isHovered && (
                                  <line
                                    x1={cx}
                                    y1={thermalChartData.padT}
                                    x2={cx}
                                    y2={thermalChartData.padT + thermalChartData.plotH}
                                    stroke="#f59e0b"
                                    strokeDasharray="2 2"
                                    strokeWidth="1"
                                  />
                                )}
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isHovered ? 4.5 : 2.5}
                                  fill={isHovered ? '#fbbf24' : '#d97706'}
                                  stroke={isHovered ? '#ffffff' : '#b45309'}
                                  strokeWidth={isHovered ? 2 : 1}
                                  className="cursor-pointer transition-all"
                                  onMouseEnter={() => setHoveredHour(d.hour)}
                                  onMouseLeave={() => setHoveredHour(null)}
                                />
                              </g>
                            );
                          })}

                          {/* X Axis Time Labels */}
                          {[0, 4, 8, 12, 16, 20, 23].map((hr) => (
                            <text
                              key={hr}
                              x={thermalChartData.getX(hr)}
                              y={thermalChartData.padT + thermalChartData.plotH + 15}
                              fill="#94a3b8"
                              textAnchor="middle"
                              fontSize="8"
                            >
                              {String(hr).padStart(2, '0')}:00
                            </text>
                          ))}
                        </svg>
                      </div>

                      {/* Interactive Hover Inspection Strip */}
                      {hoveredHour !== null && thermalReport.time_series[hoveredHour] && (
                        <div className="bg-slate-900 border border-amber-800/80 rounded-lg p-2 font-mono text-[11px] animate-in fade-in duration-150">
                          <div className="flex justify-between items-center text-amber-300 font-bold border-b border-amber-900/50 pb-1 mb-1">
                            <span>Hour {String(hoveredHour).padStart(2, '0')}:00 Thermal State</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] ${
                                (thermalReport.time_series[hoveredHour].hot_spot_temp_c ?? 0) >= 120
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              Aging V = {fmtNum(thermalReport.time_series[hoveredHour].relative_aging_rate, 2)}x
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>
                              Hot-Spot θ_h:{' '}
                              <span className="text-amber-400 font-bold">
                                {fmtNum(thermalReport.time_series[hoveredHour].hot_spot_temp_c, 1)}°C
                              </span>
                            </div>
                            <div>
                              Top-Oil θ_o:{' '}
                              <span className="text-orange-400">
                                {fmtNum(thermalReport.time_series[hoveredHour].top_oil_temp_c, 1)}°C
                              </span>
                            </div>
                            <div>
                              Ambient θ_a:{' '}
                              <span className="text-slate-400">
                                {fmtNum(thermalReport.time_series[hoveredHour].ambient_temp_c, 1)}°C
                              </span>
                            </div>
                            <div>
                              Life Loss/Hour:{' '}
                              <span className="text-white">
                                {fmtNum(thermalReport.time_series[hoveredHour].loss_of_life_hours, 2)} hrs
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Thermal Disclaimer Banner (Principle A4-7, TR-THM-05) */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center space-x-1.5 text-amber-400 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>IEC 60076-7 Simulation Notice (TR-THM-05)</span>
                    </div>
                    <p className="leading-relaxed">
                      {thermalReport.disclaimer ||
                        'Thermal dynamics calculated via IEC 60076-7 differential equations; not direct sensor telemetry.'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  {analyticsError ? `Error: ${analyticsError}` : 'No thermal dynamics data available.'}
                </div>
              )}
            </div>
          )}

          {/* DTR TAB 4: PREDICTIVE ML FORECASTING (TR-FOR) */}
          {isDtr && dtrTab === 'forecast' && (
            <div className="space-y-4">
              {isLoadingAnalytics ? (
                <div className="p-8 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center space-y-2">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span>Executing LightGBM Multi-Horizon Quantile Inference...</span>
                </div>
              ) : forecastReport ? (
                <>
                  {/* Current Operating Baseline vs. Projected Peak */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-center">
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Current Active</span>
                      <span className="text-sm font-bold text-white">{fmtNum(forecastReport.current_load_kw, 1)} kW</span>
                      <span className="text-[9px] text-slate-500 block">{fmtNum(forecastReport.current_loading_pct, 0)}% Load</span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">24h Peak Pred</span>
                      <span
                        className={`text-sm font-bold ${
                          (forecastReport.forecasts?.[3]?.predicted_loading_pct ?? 0) > 100
                            ? 'text-rose-400'
                            : (forecastReport.forecasts?.[3]?.predicted_loading_pct ?? 0) > 85
                            ? 'text-amber-400'
                            : 'text-purple-400'
                        }`}
                      >
                        {fmtNum(forecastReport.forecasts?.[3]?.predicted_load_kw, 1)} kW
                      </span>
                      <span className="text-[9px] text-slate-500 block">
                        {fmtNum(forecastReport.forecasts?.[3]?.predicted_loading_pct, 0)}% Peak
                      </span>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase">Rated Capacity</span>
                      <span className="text-sm font-bold text-slate-300">{fmtNum(forecastReport.rated_kw, 0)} kW</span>
                      <span className="text-[9px] text-slate-500 block">{forecastReport.rated_kva ?? 100} kVA (0.9pf)</span>
                    </div>
                  </div>

                  {/* 4 Multi-Horizon Forecast Cards (TR-FOR-01) */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300 font-mono block">
                      Multi-Horizon GBDT Projections:
                    </span>
                    <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                      {forecastReport.forecasts.map((fc) => (
                        <div
                          key={fc.horizon_hours}
                          className={`p-2.5 rounded-xl border transition-all ${
                            fc.status === 'CRITICAL_OVERLOAD'
                              ? 'bg-rose-950/40 border-rose-800/80'
                              : fc.status === 'NEAR_OVERLOAD'
                              ? 'bg-amber-950/40 border-amber-800/80'
                              : 'bg-slate-950/70 border-slate-800'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-purple-400">+{fc.horizon_hours}H Ahead</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                fc.status === 'CRITICAL_OVERLOAD'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : fc.status === 'NEAR_OVERLOAD'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800'
                              }`}
                            >
                              {fmtNum(fc.predicted_loading_pct, 0)}%
                            </span>
                          </div>
                          <div className="text-sm font-bold text-white">{fmtNum(fc.predicted_load_kw, 1)} kW</div>
                          <div className="text-[9px] text-slate-400 flex justify-between mt-1">
                            <span>P10: {fmtNum(fc.confidence_p10_kw, 0)}k</span>
                            <span>P90: {fmtNum(fc.confidence_p90_kw, 0)}k</span>
                          </div>
                          {fc.is_ag_shift_active && (
                            <span className="inline-block mt-1 text-[8px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-1 py-0.2 rounded">
                              Telangana Ag Shift
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Multi-Horizon Quantile Cone SVG Chart (TR-FOR-03) */}
                  {forecastChartData && (
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-purple-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Multi-Horizon Quantile Cone
                        </span>
                        <span className="text-[10px] text-slate-400">P10 - P50 - P90 Cones</span>
                      </div>

                      <div className="relative overflow-x-auto">
                        <svg
                          viewBox={`0 0 ${forecastChartData.svgW} ${forecastChartData.svgH}`}
                          className="w-full h-40 select-none font-mono text-[9px]"
                        >
                          {/* Grid Lines */}
                          <line
                            x1={forecastChartData.padL}
                            y1={forecastChartData.padT}
                            x2={forecastChartData.svgW - forecastChartData.padR}
                            y2={forecastChartData.padT}
                            stroke="#334155"
                            strokeDasharray="2 2"
                            strokeWidth="0.7"
                          />
                          <line
                            x1={forecastChartData.padL}
                            y1={forecastChartData.padT + forecastChartData.plotH * 0.5}
                            x2={forecastChartData.svgW - forecastChartData.padR}
                            y2={forecastChartData.padT + forecastChartData.plotH * 0.5}
                            stroke="#334155"
                            strokeDasharray="2 2"
                            strokeWidth="0.7"
                          />
                          <line
                            x1={forecastChartData.padL}
                            y1={forecastChartData.padT + forecastChartData.plotH}
                            x2={forecastChartData.svgW - forecastChartData.padR}
                            y2={forecastChartData.padT + forecastChartData.plotH}
                            stroke="#475569"
                            strokeWidth="1"
                          />

                          {/* Y-Axis Labels */}
                          <text x={forecastChartData.padL - 6} y={forecastChartData.padT + 8} fill="#94a3b8" textAnchor="end">
                            {fmtNum(forecastChartData.maxVal, 0)}k
                          </text>
                          <text
                            x={forecastChartData.padL - 6}
                            y={forecastChartData.padT + forecastChartData.plotH * 0.5 + 4}
                            fill="#64748b"
                            textAnchor="end"
                          >
                            {fmtNum(forecastChartData.maxVal * 0.5, 0)}k
                          </text>
                          <text
                            x={forecastChartData.padL - 6}
                            y={forecastChartData.padT + forecastChartData.plotH}
                            fill="#64748b"
                            textAnchor="end"
                          >
                            0
                          </text>

                          {/* Rated Capacity Line */}
                          {forecastChartData.ratedY >= forecastChartData.padT && (
                            <>
                              <line
                                x1={forecastChartData.padL}
                                y1={forecastChartData.ratedY}
                                x2={forecastChartData.svgW - forecastChartData.padR}
                                y2={forecastChartData.ratedY}
                                stroke="#f43f5e"
                                strokeDasharray="3 3"
                                strokeWidth="1.2"
                              />
                              <text
                                x={forecastChartData.svgW - forecastChartData.padR - 4}
                                y={forecastChartData.ratedY - 4}
                                fill="#fb7185"
                                textAnchor="end"
                                fontSize="8"
                                fontWeight="bold"
                              >
                                Rated: {fmtNum(forecastChartData.ratedKw, 0)} kW
                              </text>
                            </>
                          )}

                          {/* Quantile Uncertainty Cone Polygon */}
                          <polygon points={forecastChartData.conePoly} fill="rgba(168, 85, 247, 0.18)" stroke="none" />

                          {/* P50 Median Line */}
                          <polyline
                            points={forecastChartData.p50Points}
                            fill="none"
                            stroke="#c084fc"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Data points */}
                          {forecastChartData.pts.map((p, idx) => {
                            const cx = forecastChartData.getX(idx);
                            const cy = forecastChartData.getY(p.p50);
                            const isHovered = hoveredForecastIdx === idx;

                            return (
                              <g key={idx}>
                                {isHovered && (
                                  <line
                                    x1={cx}
                                    y1={forecastChartData.padT}
                                    x2={cx}
                                    y2={forecastChartData.padT + forecastChartData.plotH}
                                    stroke="#c084fc"
                                    strokeDasharray="2 2"
                                    strokeWidth="1"
                                  />
                                )}
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isHovered ? 5 : 3}
                                  fill={isHovered ? '#e9d5ff' : '#a855f7'}
                                  stroke={isHovered ? '#ffffff' : '#7e22ce'}
                                  strokeWidth={isHovered ? 2 : 1}
                                  className="cursor-pointer transition-all"
                                  onMouseEnter={() => setHoveredForecastIdx(idx)}
                                  onMouseLeave={() => setHoveredForecastIdx(null)}
                                />
                                <text
                                  x={cx}
                                  y={forecastChartData.padT + forecastChartData.plotH + 15}
                                  fill="#94a3b8"
                                  textAnchor="middle"
                                  fontSize="8"
                                >
                                  {p.label}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>

                      {/* Interactive Hover Snapshot Strip */}
                      {hoveredForecastIdx !== null && forecastChartData.pts[hoveredForecastIdx] && (
                        <div className="bg-slate-900 border border-purple-800/80 rounded-lg p-2 font-mono text-[11px] animate-in fade-in duration-150">
                          <div className="flex justify-between items-center text-purple-300 font-bold border-b border-purple-900/50 pb-1 mb-1">
                            <span>Horizon {forecastChartData.pts[hoveredForecastIdx].label} Snapshot</span>
                            <span className="text-white font-bold">
                              {fmtNum(forecastChartData.pts[hoveredForecastIdx].p50, 1)} kW
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-300 text-[10px]">
                            <span>P10: {fmtNum(forecastChartData.pts[hoveredForecastIdx].p10, 1)} kW</span>
                            <span>P90: {fmtNum(forecastChartData.pts[hoveredForecastIdx].p90, 1)} kW</span>
                            <span className="text-purple-400">
                              Spread: ±{fmtNum((forecastChartData.pts[hoveredForecastIdx].p90 - forecastChartData.pts[hoveredForecastIdx].p10) * 0.5, 1)} kW
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Model vs Persistence Benchmark Scorecard (TR-FOR-02) */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2 font-mono text-xs">
                    <span className="text-[11px] font-bold text-slate-300 block">
                      Chronological Walk-Forward Benchmarks (LightGBM vs Persistence):
                    </span>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[10px]">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-1">Horizon</th>
                            <th className="py-1">GBDT MAE</th>
                            <th className="py-1">GBDT MAPE</th>
                            <th className="py-1">Persistence</th>
                            <th className="py-1 text-right">Accuracy Gain</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {forecastReport.benchmarks.map((b) => (
                            <tr key={b.horizon_hours} className="hover:bg-slate-900/50">
                              <td className="py-1 font-bold text-purple-400">+{b.horizon_hours}h</td>
                              <td className="py-1 text-white">{b.model_mae_kw} kW</td>
                              <td className="py-1 text-cyan-300">{b.model_mape_pct}%</td>
                              <td className="py-1 text-slate-400">{b.persistence_mape_pct}%</td>
                              <td className="py-1 text-right font-bold text-emerald-400">
                                +{b.improvement_over_persistence_pct}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Top Feature Importances (TR-FOR-04) */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 font-mono text-xs">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Top GBDT Predictive Drivers (Telangana Operations):
                    </span>
                    <div className="space-y-1.5 text-[10px]">
                      {Object.entries(forecastReport.feature_importances)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 4)
                        .map(([feat, score]) => (
                          <div key={feat} className="space-y-0.5">
                            <div className="flex justify-between text-slate-400">
                              <span className="capitalize">
                                {feat === 'is_ag_shift'
                                  ? 'Telangana 7h Ag Pumping Shift'
                                  : feat === 'ambient_temp_c'
                                  ? 'Ambient Temperature Peak'
                                  : feat === 'lag_1h'
                                  ? 'Prior Hour SCADA Telemetry'
                                  : feat === 'rolling_mean_3h'
                                  ? 'Rolling 3h Baseline Demand'
                                  : feat.replace('_', ' ')}
                              </span>
                              <span className="text-purple-300 font-bold">{fmtNum(score * 100, 1)}%</span>
                            </div>
                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full"
                                style={{ width: `${Math.min(100, score * 250)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Provenance Disclaimer (Principle A4-7) */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center space-x-1.5 text-purple-400 font-semibold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Predictive ML Provenance Lineage (TR-FOR-05)</span>
                    </div>
                    <p className="leading-relaxed">{forecastReport.provenance_disclaimer}</p>
                  </div>
                </>
              ) : (
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  {analyticsError ? `Error: ${analyticsError}` : 'No predictive forecast data available.'}
                </div>
              )}
            </div>
          )}

          {/* Line Specific Metrics */}
          {asset.entity_type === 'line' && (
            <div className="space-y-4">
              {props.physics_result && (
                <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-xl p-4 space-y-2 font-mono text-xs shadow-lg">
                  <div className="flex items-center justify-between pb-2 border-b border-cyan-800/40">
                    <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" /> AC Newton-Raphson Results
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        props.physics_result.status === 'emergency'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                          : props.physics_result.status === 'overload'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : props.physics_result.status === 'elevated'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {props.physics_result.status.toUpperCase()} ({props.physics_result.loading_percent}%)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-cyan-900/40">
                    <span className="text-slate-400">Loading %:</span>
                    <span className="text-white font-bold">{props.physics_result.loading_percent}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-cyan-900/40">
                    <span className="text-slate-400">Current Flow:</span>
                    <span className="text-cyan-300 font-semibold">
                      {fmtNum(props.physics_result.current_ka * 1000, 1)} A
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-cyan-900/40">
                    <span className="text-slate-400">Derated Ampacity:</span>
                    <span className="text-slate-300">{fmtNum(props.physics_result.max_i_ka * 1000, 1)} A</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-cyan-900/40">
                    <span className="text-slate-400">Active Technical Loss:</span>
                    <span className="text-amber-400 font-bold">
                      {fmtNum(props.physics_result.active_loss_kw, 3)} kW
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Reactive Loss:</span>
                    <span className="text-slate-300">{fmtNum(props.physics_result.reactive_loss_kvar, 3)} kVAr</span>
                  </div>
                </div>
              )}

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
                  <span className="text-slate-200">{fmtNum((props.max_i_ka || 0.134) * 1000, 0)} A</span>
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
                      Standard PSC 9m DP structure carrying distribution transformer, drop-out (DO) fuses, and AB
                      switchgear.
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
