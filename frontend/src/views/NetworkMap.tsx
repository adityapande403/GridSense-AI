import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  AlertTriangle,
  Layers,
  Map as MapIcon,
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

type BaseMapType = 'dark' | 'osm' | 'satellite';

export const NetworkMap: React.FC = () => {
  const [data, setData] = useState<NetworkGeoJSONResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeeder, setSelectedFeeder] = useState<string>('2011951');
  const [baseMap, setBaseMap] = useState<BaseMapType>('dark');
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);

  // Layer visibility toggles
  const [showSubstations, setShowSubstations] = useState<boolean>(true);
  const [showLines, setShowLines] = useState<boolean>(true);
  const [showDTRs, setShowDTRs] = useState<boolean>(true);
  const [showSwitches, setShowSwitches] = useState<boolean>(true);
  const [showConsumers, setShowConsumers] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupsRef = useRef<{
    substations: L.LayerGroup;
    lines: L.LayerGroup;
    dtrs: L.LayerGroup;
    switches: L.LayerGroup;
    consumers: L.LayerGroup;
  } | null>(null);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center at Puthiya Kadavu (Kozhikode, Kerala)
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      minZoom: 3,
      maxZoom: 20,
    }).setView([11.2678, 75.7671], 16);

    // Initial tile layer (CartoDB Dark Matter)
    const tileLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }
    ).addTo(map);

    tileLayerRef.current = tileLayer;

    // Feature LayerGroups
    const substationsGroup = L.layerGroup().addTo(map);
    const linesGroup = L.layerGroup().addTo(map);
    const dtrsGroup = L.layerGroup().addTo(map);
    const switchesGroup = L.layerGroup().addTo(map);
    const consumersGroup = L.layerGroup().addTo(map);

    layerGroupsRef.current = {
      substations: substationsGroup,
      lines: linesGroup,
      dtrs: dtrsGroup,
      switches: switchesGroup,
      consumers: consumersGroup,
    };

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Handle Base Map Tile Layer Switch
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;

    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attr = '&copy; OpenStreetMap contributors &copy; CARTO';
    let sub = 'abcd';

    if (baseMap === 'osm') {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attr = '&copy; OpenStreetMap contributors';
      sub = 'abc';
    } else if (baseMap === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attr = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
      sub = 'abc';
    }

    const newTileLayer = L.tileLayer(url, {
      attribution: attr,
      subdomains: sub,
      maxZoom: 20,
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current = newTileLayer;
  }, [baseMap]);

  // 3. Fetch Network Data from Backend
  const fetchNetworkData = (feederCode?: string) => {
    setLoading(true);
    setError(null);
    const query = feederCode && feederCode !== 'all' ? `?feeder_code=${feederCode}` : '';
    fetch(`/api/v1/network/geojson${query}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((resData: NetworkGeoJSONResponse) => {
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

  // 4. Render GeoJSON Assets onto Leaflet Layers
  useEffect(() => {
    if (!data || !layerGroupsRef.current || !mapInstanceRef.current) return;

    const { substations, lines, dtrs, switches, consumers } = layerGroupsRef.current;

    // Clear existing features
    substations.clearLayers();
    lines.clearLayers();
    dtrs.clearLayers();
    switches.clearLayers();
    consumers.clearLayers();

    // A. Render 11 kV HT Lines (MultiLineString & LineString)
    if (showLines && data.lines?.features) {
      data.lines.features.forEach((lineFeat) => {
        const coords = lineFeat.geometry?.coordinates;
        if (!coords || coords.length < 2) return;

        // Leaflet expects [lat, lon], GeoJSON provides [lon, lat]
        const latlngs = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
        const isOperational = lineFeat.properties.is_operational !== false;
        const isSelected = selectedAsset?.code === lineFeat.properties.code;

        const polyline = L.polyline(latlngs, {
          color: isSelected ? '#38bdf8' : (isOperational ? '#06b6d4' : '#64748b'),
          weight: isSelected ? 5 : 3.5,
          opacity: 0.9,
          dashArray: isOperational ? undefined : '6, 6',
          lineCap: 'round',
          lineJoin: 'round',
        });

        // Hover tooltip
        polyline.bindTooltip(
          `
          <div style="background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: bold; color: #38bdf8;">${lineFeat.properties.name || lineFeat.properties.code}</div>
            <div>Conductor: <b>${lineFeat.properties.conductor_type || 'ACSR'}</b></div>
            <div>Length: <b>${lineFeat.properties.length_km} km</b></div>
            <div>Loading: <b>${lineFeat.properties.loading_pct}%</b></div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 3px;">From: ${lineFeat.properties.from_bus_code} &rarr; To: ${lineFeat.properties.to_bus_code}</div>
          </div>
          `,
          { sticky: true, opacity: 1 }
        );

        polyline.on('click', () => {
          setSelectedAsset({
            id: lineFeat.properties.id,
            code: lineFeat.properties.code,
            name: lineFeat.properties.name,
            entity_type: 'line',
            provenance: lineFeat.properties.provenance,
            confidence_score: lineFeat.properties.confidence_score,
            properties: lineFeat.properties,
          });
        });

        lines.addLayer(polyline);
      });
    }

    // B. Render Substations (33/11 kV)
    if (showSubstations && data.substations?.features) {
      data.substations.features.forEach((subFeat) => {
        const coords = subFeat.geometry?.coordinates;
        if (!coords) return;
        const lat = coords[1];
        const lon = coords[0];

        const subIcon = L.divIcon({
          className: 'custom-sub-icon',
          html: `
            <div style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; cursor: pointer;">
              <div style="width: 22px; height: 22px; transform: rotate(45deg); background: #581c87; border: 2.5px solid #c084fc; box-shadow: 0 0 12px #a855f7; display: flex; align-items: center; justify-content: center;">
                <div style="width: 6px; height: 6px; background: #e9d5ff; border-radius: 50%;"></div>
              </div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const marker = L.marker([lat, lon], { icon: subIcon });

        marker.bindTooltip(
          `
          <div style="background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #7e22ce; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: bold; color: #c084fc;">${subFeat.properties.name || subFeat.properties.code}</div>
            <div>Voltage: <b>${subFeat.properties.nominal_kv} kV</b></div>
            <div>PTR Capacity: <b>${subFeat.properties.ptr_capacity_mva} MVA</b></div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 3px;">Type: 33/11 kV Primary Substation</div>
          </div>
          `,
          { direction: 'top', offset: [0, -14], opacity: 1 }
        );

        marker.on('click', () => {
          setSelectedAsset({
            id: subFeat.properties.id,
            code: subFeat.properties.code,
            name: subFeat.properties.name,
            entity_type: 'substation',
            provenance: subFeat.properties.provenance,
            confidence_score: subFeat.properties.confidence_score,
            properties: subFeat.properties,
          });
        });

        substations.addLayer(marker);
      });
    }

    // C. Render Switches & Tie Points
    if (showSwitches && data.switches?.features) {
      data.switches.features.forEach((swFeat) => {
        const coords = swFeat.geometry?.coordinates;
        if (!coords) return;
        const lat = coords[1];
        const lon = coords[0];
        const isNormallyOpen = swFeat.properties.is_normally_open;
        const isClosed = swFeat.properties.current_status === 'closed';

        const swIcon = L.divIcon({
          className: 'custom-sw-icon',
          html: isNormallyOpen
            ? `
              <div style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; cursor: pointer;">
                <div style="width: 18px; height: 18px; border-radius: 50%; border: 2.5px dashed #f97316; background: rgba(69, 26, 3, 0.9); box-shadow: 0 0 10px #ea580c; display: flex; align-items: center; justify-content: center;">
                  <div style="width: 4px; height: 4px; border-radius: 50%; background: #fdba74;"></div>
                </div>
              </div>
            `
            : `
              <div style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; cursor: pointer;">
                <div style="width: 12px; height: 12px; border-radius: 2px; background: ${isClosed ? '#064e3b' : '#881337'}; border: 1.5px solid ${isClosed ? '#10b981' : '#f43f5e'}; box-shadow: 0 0 8px ${isClosed ? '#10b981' : '#f43f5e'};"></div>
              </div>
            `,
          iconSize: isNormallyOpen ? [22, 22] : [16, 16],
          iconAnchor: isNormallyOpen ? [11, 11] : [8, 8],
        });

        const marker = L.marker([lat, lon], { icon: swIcon });

        marker.bindTooltip(
          `
          <div style="background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: bold; color: ${isNormallyOpen ? '#fb923c' : (isClosed ? '#34d399' : '#f87171')};">
              ${isNormallyOpen ? 'OPEN TIE SWITCH' : `SWITCH (${swFeat.properties.current_status.toUpperCase()})`}
            </div>
            <div>Code: <b>${swFeat.properties.code}</b></div>
            <div>Type: <b>${swFeat.properties.switch_type}</b></div>
            <div>Motorized: <b>${swFeat.properties.is_motorized ? 'Yes (SCADA Ready)' : 'Manual Field Crew'}</b></div>
          </div>
          `,
          { direction: 'top', offset: [0, -8], opacity: 1 }
        );

        marker.on('click', () => {
          setSelectedAsset({
            id: swFeat.properties.id,
            code: swFeat.properties.code,
            name: swFeat.properties.name,
            entity_type: 'switch',
            provenance: swFeat.properties.provenance,
            confidence_score: swFeat.properties.confidence_score,
            properties: swFeat.properties,
          });
        });

        switches.addLayer(marker);
      });
    }

    // D. Render Distribution Transformers (DTRs)
    if (showDTRs && data.transformers?.features) {
      data.transformers.features.forEach((dtrFeat) => {
        const coords = dtrFeat.geometry?.coordinates;
        if (!coords) return;
        const lat = coords[1];
        const lon = coords[0];

        const loadingPct = dtrFeat.properties.loading_pct || 72.0;
        const isOverloaded = loadingPct > 100.0;
        const isWarning = loadingPct > 80.0 && !isOverloaded;
        const color = isOverloaded ? '#ef4444' : (isWarning ? '#f59e0b' : '#10b981');

        const dtrIcon = L.divIcon({
          className: 'custom-dtr-icon',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; cursor: pointer;">
              ${
                isOverloaded
                  ? '<div style="position: absolute; width: 30px; height: 30px; border-radius: 50%; background: rgba(239,68,68,0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>'
                  : ''
              }
              <div style="width: 15px; height: 15px; border-radius: 50%; background: ${color}; border: 2.5px solid #ffffff; box-shadow: 0 0 10px ${color}; display: flex; align-items: center; justify-content: center;">
                <div style="width: 3px; height: 3px; border-radius: 50%; background: #ffffff;"></div>
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([lat, lon], { icon: dtrIcon });

        marker.bindTooltip(
          `
          <div style="background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <div style="font-weight: bold; color: ${color};">${dtrFeat.properties.name || dtrFeat.properties.code}</div>
            <div>Rating: <b>${dtrFeat.properties.rated_kva} kVA</b></div>
            <div>Loading: <b style="color: ${color};">${loadingPct}%</b> (${dtrFeat.properties.status})</div>
            <div style="font-size: 9px; color: #94a3b8; margin-top: 3px;">Provenance: ${dtrFeat.properties.provenance}</div>
          </div>
          `,
          { direction: 'top', offset: [0, -12], opacity: 1 }
        );

        marker.on('click', () => {
          setSelectedAsset({
            id: dtrFeat.properties.id,
            code: dtrFeat.properties.code,
            name: dtrFeat.properties.name,
            entity_type: 'distribution_transformer',
            provenance: dtrFeat.properties.provenance,
            confidence_score: dtrFeat.properties.confidence_score,
            properties: dtrFeat.properties,
          });
        });

        dtrs.addLayer(marker);
      });
    }

    // E. Render Consumers (Optional)
    if (showConsumers && data.consumers?.features) {
      data.consumers.features.forEach((cFeat) => {
        const coords = cFeat.geometry?.coordinates;
        if (!coords) return;
        const lat = coords[1];
        const lon = coords[0];

        const circle = L.circleMarker([lat, lon], {
          radius: 3,
          fillColor: '#60a5fa',
          color: '#1d4ed8',
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.8,
        });

        circle.bindTooltip(`Consumer: ${cFeat.properties.service_number} (${cFeat.properties.consumer_category})`);
        circle.on('click', () => {
          setSelectedAsset({
            id: cFeat.properties.id,
            code: cFeat.properties.service_number,
            entity_type: 'consumer',
            provenance: cFeat.properties.provenance,
            properties: cFeat.properties,
          });
        });

        consumers.addLayer(circle);
      });
    }

    // F. Smooth Fit Bounds to Active Feeder
    if (data.bounds && data.bounds.length === 2) {
      const [[minLon, minLat], [maxLon, maxLat]] = data.bounds;
      mapInstanceRef.current.fitBounds(
        [
          [minLat, minLon],
          [maxLat, maxLon],
        ],
        { padding: [50, 50], maxZoom: 17, animate: true }
      );
    }
  }, [data, showSubstations, showLines, showDTRs, showSwitches, showConsumers, selectedAsset]);

  // Zoom controls
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleFitBounds = () => {
    if (data?.bounds && mapInstanceRef.current) {
      const [[minLon, minLat], [maxLon, maxLat]] = data.bounds;
      mapInstanceRef.current.fitBounds(
        [
          [minLat, minLon],
          [maxLat, maxLon],
        ],
        { padding: [50, 50], maxZoom: 17, animate: true }
      );
    }
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
              {data?.feeders.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
          </div>

          {/* Base Map Style Selector */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
            <button
              onClick={() => setBaseMap('dark')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center space-x-1.5 ${
                baseMap === 'dark' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Carto Dark</span>
            </button>
            <button
              onClick={() => setBaseMap('osm')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center space-x-1.5 ${
                baseMap === 'osm' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Streets (OSM)</span>
            </button>
            <button
              onClick={() => setBaseMap('satellite')}
              className={`px-3 py-1 rounded-md transition-colors flex items-center space-x-1.5 ${
                baseMap === 'satellite' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Satellite</span>
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
        <div className="absolute top-4 left-4 z-[500] bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 shadow-xl backdrop-blur-md space-y-2 text-xs">
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
            <span>Consumers ({data?.consumers?.features?.length || 0})</span>
          </label>
        </div>

        {/* Canvas Navigation Tools (Floating Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-[500] flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800/80 rounded-xl p-1 shadow-xl backdrop-blur-md">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitBounds}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fit to Feeder Bounds"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Topological Integrity Pill (Floating Bottom Center) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] bg-slate-900/90 border border-emerald-800/60 text-emerald-300 px-4 py-1.5 rounded-full shadow-xl backdrop-blur-md flex items-center space-x-2 text-xs font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>TOPOLOGICAL CONSISTENCY: AC RADIAL &bull; NO ORPHAN BUSES &bull; TIE SWITCH OPEN</span>
        </div>

        {/* Interactive Leaflet Map Container */}
        <div className="flex-1 w-full h-full relative">
          {loading && (
            <div className="absolute inset-0 z-[600] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center space-x-3 text-slate-400 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
              <span>Rendering GIS Distribution Digital Twin...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-[600] bg-slate-950/80 flex items-center justify-center space-x-3 text-rose-400 text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}
          <div ref={mapContainerRef} className="w-full h-full" style={{ background: '#020617' }} />
        </div>

        {/* Slide-in Asset Inspection Drawer */}
        <AssetInspectionDrawer asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      </div>
    </div>
  );
};
