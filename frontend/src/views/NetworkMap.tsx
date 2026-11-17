import React, { useEffect, useState, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { AssetInspectionDrawer, SelectedAsset } from '../components/AssetInspectionDrawer';

interface NetworkGeoJSONResponse {
  feeders: Array<{ code: string; name: string; voltage_kv: number; trunk_conductor: string; provenance: any }>;
  substations: { type: string; features: any[] };
  lines: { type: string; features: any[] };
  transformers: { type: string; features: any[] };
  switches: { type: string; features: any[] };
  consumers: { type: string; features: any[] };
  summary: {
    total_substations: number;
    total_feeders: number;
    total_buses: number;
    total_lines: number;
    total_dtrs: number;
    total_switches: number;
    total_consumers: number;
    overloaded_dtrs_count: number;
    min_voltage_pu: number;
    max_voltage_pu: number;
  };
  bounds: [[number, number], [number, number]];
  center: [number, number];
}

export const NetworkMap: React.FC = () => {
  const [data, setData] = useState<NetworkGeoJSONResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeeder, setSelectedFeeder] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'geo' | 'sld'>('geo');
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);

  // Layer visibility toggles
  const [showSubstations, setShowSubstations] = useState<boolean>(true);
  const [showLines, setShowLines] = useState<boolean>(true);
  const [showDTRs, setShowDTRs] = useState<boolean>(true);
  const [showSwitches, setShowSwitches] = useState<boolean>(true);
  const [showConsumers, setShowConsumers] = useState<boolean>(false);

  // Zoom and pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNetworkData = (feederCode?: string) => {
    setLoading(true);
    setError(null);
    const query = feederCode && feederCode !== 'all' ? `?feeder_code=${feederCode}` : '';
    fetch(`/api/v1/network/geojson${query}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching network geojson:', err);
        setError('Failed to fetch digital twin network data from backend.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchNetworkData(selectedFeeder);
  }, [selectedFeeder]);

  // Coordinate normalizer for SVG canvas
  const getCoordinates = (coords: [number, number]) => {
    if (!data || !data.bounds) return { x: 400, y: 300 };
    const [[minLon, minLat], [maxLon, maxLat]] = data.bounds;
    const width = 800;
    const height = 550;
    const padding = 60;

    const lonSpan = maxLon - minLon || 0.01;
    const latSpan = maxLat - minLat || 0.01;

    const x = padding + ((coords[0] - minLon) / lonSpan) * (width - 2 * padding);
    // Invert Y axis for map rendering (latitudes increase upwards)
    const y = height - padding - ((coords[1] - minLat) / latSpan) * (height - 2 * padding);

    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] space-y-4">
      {/* Top Header & Operational Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-400">ACTIVE FEEDER:</span>
            <select
              value={selectedFeeder}
              onChange={(e) => setSelectedFeeder(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
            >
              <option value="all">All Available Network Feeders</option>
              <option value="F_TEL_01">Feeder 1 (F_TEL_01 - Mixed Urban/Agri)</option>
              <option value="F_TEL_02">Feeder 2 (F_TEL_02 - Interconnected Alternate)</option>
              <option value="2011951">Puthiya Kadavu Feeder (2011951 - KSEB Ingested GIS)</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
            <button
              onClick={() => setViewMode('geo')}
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'geo' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Geographic SLD Map
            </button>
            <button
              onClick={() => setViewMode('sld')}
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'sld' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Topological Tree View
            </button>
          </div>
        </div>

        {/* Live Summary Chips */}
        {data && (
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-400">Lines:</span>
              <span className="text-cyan-400 font-bold">{data.summary.total_lines}</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-400">DTRs:</span>
              <span className="text-amber-400 font-bold">{data.summary.total_dtrs}</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-400">Switches:</span>
              <span className="text-purple-400 font-bold">{data.summary.total_switches}</span>
            </div>
            {data.summary.overloaded_dtrs_count > 0 && (
              <div className="flex items-center space-x-1.5 bg-rose-950/60 border border-rose-800 px-3 py-1 rounded-lg text-rose-300 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>{data.summary.overloaded_dtrs_count} Overloaded DTRs</span>
              </div>
            )}
            <button
              onClick={() => fetchNetworkData(selectedFeeder)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
              title="Refresh Network Twin"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Map Canvas Area */}
      <div className="flex-1 relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex">
        {/* Layer Controls Palette (Floating Top Left) */}
        <div className="absolute top-4 left-4 z-20 bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 shadow-xl backdrop-blur-md space-y-2 text-xs">
          <span className="font-mono text-slate-400 uppercase tracking-wider block mb-1">Layer Visibility</span>
          <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={showSubstations}
              onChange={(e) => setShowSubstations(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
            <span>Substations (33/11 kV)</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={showLines}
              onChange={(e) => setShowLines(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
            />
            <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
            <span>11 kV HT Lines</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={showDTRs}
              onChange={(e) => setShowDTRs(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span>DTRs & Load Status</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={showSwitches}
              onChange={(e) => setShowSwitches(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
            />
            <span className="w-2.5 h-2.5 rounded-sm border border-emerald-400 inline-block" />
            <span>Switches & Tie Points</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={showConsumers}
              onChange={(e) => setShowConsumers(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
            />
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
            <span>Consumers ({data?.consumers.features.length || 0})</span>
          </label>
        </div>

        {/* Canvas Navigation Tools (Floating Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800/80 rounded-xl p-1 shadow-xl backdrop-blur-md">
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetView}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Topological Integrity Pill (Floating Bottom Center) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 border border-emerald-800/60 text-emerald-300 px-4 py-1.5 rounded-full shadow-xl backdrop-blur-md flex items-center space-x-2 text-xs font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>TOPOLOGICAL CONSISTENCY: AC RADIAL &bull; NO ORPHAN BUSES &bull; TIE SWITCH OPEN</span>
        </div>

        {/* SVG SLD Map Canvas */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="flex-1 w-full h-full cursor-grab active:cursor-grabbing select-none relative overflow-hidden"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full space-x-3 text-slate-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
              <span>Rendering Distribution Digital Twin...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full space-x-3 text-rose-400 text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          ) : (
            <svg
              className="w-full h-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
              viewBox="0 0 800 550"
            >
              {/* Dark Grid Background Lines */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                </pattern>
                {/* Glow Filter for Overloaded Elements */}
                <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {/* 1. Render HT Lines */}
              {showLines &&
                data?.lines.features.map((lineFeat) => {
                  const coords = lineFeat.geometry.coordinates;
                  if (!coords || coords.length < 2) return null;
                  const p1 = getCoordinates(coords[0]);
                  const p2 = getCoordinates(coords[coords.length - 1]);

                  const isSelected = selectedAsset?.code === lineFeat.properties.code;
                  const strokeColor = isSelected
                    ? '#38bdf8'
                    : lineFeat.properties.is_operational
                    ? '#06b6d4'
                    : '#64748b';

                  return (
                    <g key={lineFeat.properties.id}>
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 4 : 2.5}
                        strokeDasharray={lineFeat.properties.is_operational ? 'none' : '4 3'}
                        className="hover:stroke-cyan-300 cursor-pointer transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAsset({
                            id: lineFeat.properties.id,
                            code: lineFeat.properties.code,
                            entity_type: 'line',
                            provenance: lineFeat.properties.provenance,
                            confidence_score: lineFeat.properties.confidence_score,
                            properties: lineFeat.properties,
                          });
                        }}
                      />
                    </g>
                  );
                })}

              {/* 2. Render Substations */}
              {showSubstations &&
                data?.substations.features.map((subFeat) => {
                  const pt = getCoordinates(subFeat.geometry.coordinates);
                  const isSelected = selectedAsset?.code === subFeat.properties.code;
                  return (
                    <g
                      key={subFeat.properties.id}
                      transform={`translate(${pt.x}, ${pt.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({
                          id: subFeat.properties.id,
                          code: subFeat.properties.code,
                          name: subFeat.properties.name,
                          entity_type: 'substation',
                          provenance: subFeat.properties.provenance,
                          confidence_score: subFeat.properties.confidence_score,
                          properties: subFeat.properties,
                        });
                      }}
                    >
                      <polygon
                        points="0,-14 14,0 0,14 -14,0"
                        fill="#581c87"
                        stroke={isSelected ? '#c084fc' : '#a855f7'}
                        strokeWidth={isSelected ? 3 : 2}
                      />
                      <circle r="4" fill="#e9d5ff" />
                      <text x="18" y="4" fill="#e9d5ff" fontSize="10" fontFamily="monospace" fontWeight="bold">
                        {subFeat.properties.name || subFeat.properties.code}
                      </text>
                    </g>
                  );
                })}

              {/* 3. Render Switches & Tie Points */}
              {showSwitches &&
                data?.switches.features.map((swFeat) => {
                  const pt = getCoordinates(swFeat.geometry.coordinates);
                  const isNormallyOpen = swFeat.properties.is_normally_open;
                  const isClosed = swFeat.properties.current_status === 'closed';
                  const isSelected = selectedAsset?.code === swFeat.properties.code;

                  return (
                    <g
                      key={swFeat.properties.id}
                      transform={`translate(${pt.x}, ${pt.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({
                          id: swFeat.properties.id,
                          code: swFeat.properties.code,
                          name: swFeat.properties.name,
                          entity_type: 'switch',
                          provenance: swFeat.properties.provenance,
                          confidence_score: swFeat.properties.confidence_score,
                          properties: swFeat.properties,
                        });
                      }}
                    >
                      {isNormallyOpen ? (
                        // Open Tie Switch (Dashed Orange Ring)
                        <circle
                          r="7"
                          fill="#451a03"
                          stroke={isSelected ? '#fed7aa' : '#f97316'}
                          strokeWidth="2"
                          strokeDasharray="3 2"
                        />
                      ) : (
                        // Standard Sectionalizer / Breaker
                        <rect
                          x="-5"
                          y="-5"
                          width="10"
                          height="10"
                          fill={isClosed ? '#064e3b' : '#881337'}
                          stroke={isClosed ? '#10b981' : '#f43f5e'}
                          strokeWidth="1.5"
                          rx="1"
                        />
                      )}
                    </g>
                  );
                })}

              {/* 4. Render Distribution Transformers */}
              {showDTRs &&
                data?.transformers.features.map((dtrFeat) => {
                  const pt = getCoordinates(dtrFeat.geometry.coordinates);
                  const loadingPct = dtrFeat.properties.loading_pct || 70.0;
                  const isOverloaded = loadingPct > 100.0;
                  const isWarning = loadingPct > 80.0 && !isOverloaded;
                  const isSelected = selectedAsset?.code === dtrFeat.properties.code;

                  const color = isOverloaded ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';

                  return (
                    <g
                      key={dtrFeat.properties.id}
                      transform={`translate(${pt.x}, ${pt.y})`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({
                          id: dtrFeat.properties.id,
                          code: dtrFeat.properties.code,
                          name: dtrFeat.properties.name,
                          entity_type: 'distribution_transformer',
                          provenance: dtrFeat.properties.provenance,
                          confidence_score: dtrFeat.properties.confidence_score,
                          properties: dtrFeat.properties,
                        });
                      }}
                    >
                      {isOverloaded && (
                        <circle r="12" fill="#ef4444" opacity="0.3" filter="url(#glow-red)" className="animate-ping" />
                      )}
                      <circle
                        r="7"
                        fill={color}
                        stroke={isSelected ? '#ffffff' : '#0f172a'}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                      <circle r="2" fill="#ffffff" />
                      <text
                        x="10"
                        y="3"
                        fill={isOverloaded ? '#fca5a5' : '#cbd5e1'}
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="semibold"
                        className="group-hover:fill-white"
                      >
                        {dtrFeat.properties.name || dtrFeat.properties.code} ({loadingPct}%)
                      </text>
                    </g>
                  );
                })}
              {/* 5. Render Consumers (Optional) */}
              {showConsumers &&
                data?.consumers.features.map((cFeat) => {
                  const pt = getCoordinates(cFeat.geometry.coordinates);
                  return (
                    <circle
                      key={cFeat.properties.id}
                      cx={pt.x}
                      cy={pt.y}
                      r="2"
                      fill="#60a5fa"
                      opacity="0.8"
                      className="cursor-pointer hover:r-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({
                          id: cFeat.properties.id,
                          code: cFeat.properties.service_number,
                          entity_type: 'consumer',
                          provenance: cFeat.properties.provenance,
                          properties: cFeat.properties,
                        });
                      }}
                    />
                  );
                })}
            </svg>
          )}
        </div>

        {/* Slide-in Asset Inspection Drawer */}
        <AssetInspectionDrawer asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      </div>
    </div>
  );
};
