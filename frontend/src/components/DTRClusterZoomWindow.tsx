import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, ZoomIn, ZoomOut, Maximize2, Minimize2, Navigation, Zap, Info } from 'lucide-react';
import { SelectedAsset } from './AssetInspectionDrawer';

const CARTO_API_KEY = 'cb1_5bc6_1_33507307e992fe96d084bfb5';

interface DTRClusterZoomWindowProps {
  isOpen: boolean;
  onClose: () => void;
  dtr: SelectedAsset | null;
  networkData: any;
  baseMap: 'carto-voyager' | 'carto-dark' | 'osm' | 'satellite';
  isDrawerOpen?: boolean;
  onSelectAsset?: (asset: SelectedAsset) => void;
}

export const DTRClusterZoomWindow: React.FC<DTRClusterZoomWindowProps> = ({
  isOpen,
  onClose,
  dtr,
  networkData,
  baseMap,
  isDrawerOpen = true,
  onSelectAsset,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(21.5);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterLayersRef = useRef<{
    lines: L.LayerGroup;
    poles: L.LayerGroup;
    dtr: L.LayerGroup;
  } | null>(null);

  // Extract DTR Coordinates
  const getDTRCoords = (): [number, number] | null => {
    if (!dtr) return null;
    const props = dtr.properties || {};
    if (props.coordinates && Array.isArray(props.coordinates) && props.coordinates.length === 2) {
      return props.coordinates as [number, number]; // [lat, lon]
    }
    if (props.latitude && props.longitude) {
      return [Number(props.latitude), Number(props.longitude)];
    }
    return [11.270127, 75.765721]; // fallback Beach 2
  };

  const dtrCoords = getDTRCoords();

  // Distance helper in meters
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dy = (lat2 - lat1) * 111000;
    const dx = (lon2 - lon1) * 111000 * Math.cos((lat1 * Math.PI) / 180);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Helper to get clean short pole code
  const getShortPoleCode = (code: string, name?: string): string => {
    if (name && (name.includes('DTR DP') || name.includes('DP LINE SIDE'))) {
      return 'DP-Structure';
    }
    if (code.startsWith('PL-660118-')) return code.replace('PL-660118-', '');
    if (code.startsWith('PL-660119-')) return code.replace('PL-660119-', '');
    if (code.startsWith('PL-660115-')) return code.replace('PL-660115-', '');
    if (code.startsWith('PL-2011951-')) return code.replace('PL-2011951-', 'P-');
    if (code.startsWith('PL-MANUAL-')) return 'P-Manual';
    if (code.startsWith('LC-') || code.startsWith('HL-') || code.startsWith('SW_')) {
      const parts = code.split('-');
      return parts[parts.length - 1] || code;
    }
    return code.length > 10 ? code.slice(-6) : code;
  };

  // 1. Initialize or Re-center Cluster Mini-Map with Extra High Zoom
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const center = dtrCoords || [11.270127, 75.765721];
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 18,
        maxZoom: 24, // Allow ultra high zoom
      }).setView(center, 21.5);

      // Base tile layer with maxNativeZoom: 19 so Leaflet overscales raster tiles smoothly up to zoom 24
      let tileUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;
      if (baseMap === 'carto-dark') {
        tileUrl = `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;
      } else if (baseMap === 'osm') {
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      } else if (baseMap === 'satellite') {
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      }

      const tileLayer = L.tileLayer(tileUrl, {
        maxNativeZoom: 19,
        maxZoom: 24,
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      map.on('zoomend', () => {
        setCurrentZoom(Math.round(map.getZoom() * 10) / 10);
      });

      const linesGroup = L.layerGroup().addTo(map);
      const polesGroup = L.layerGroup().addTo(map);
      const dtrGroup = L.layerGroup().addTo(map);

      clusterLayersRef.current = {
        lines: linesGroup,
        poles: polesGroup,
        dtr: dtrGroup,
      };

      mapInstanceRef.current = map;
    } else if (dtrCoords) {
      mapInstanceRef.current.setView(dtrCoords, 21.5);
    }

    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);
  }, [isOpen, dtrCoords?.[0], dtrCoords?.[1], isExpanded]);

  // Clean cleanup on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Render Cluster Features (DTR, Surrounding Triangle Poles, Branch Lines)
  useEffect(() => {
    if (!isOpen || !mapInstanceRef.current || !clusterLayersRef.current || !dtrCoords || !networkData) return;

    const [dtrLat, dtrLon] = dtrCoords;
    const { lines, poles, dtr: dtrGroup } = clusterLayersRef.current;

    lines.clearLayers();
    poles.clearLayers();
    dtrGroup.clearLayers();

    // A. Filter Poles in immediate Triangle Cluster (within 85 meters)
    const clusterPoles = (networkData.poles?.features || []).filter((poleFeat: any) => {
      const coords = poleFeat.geometry?.coordinates;
      if (!coords) return false;
      const dist = getDistanceMeters(dtrLat, dtrLon, coords[1], coords[0]);
      return dist <= 85;
    });

    const clusterPoleCodes = new Set(clusterPoles.map((p: any) => p.properties.code));

    // B. Filter Lines in Cluster
    const clusterLines = (networkData.lines?.features || []).filter((lineFeat: any) => {
      const fromCode = lineFeat.properties.from_bus_code;
      const toCode = lineFeat.properties.to_bus_code;
      if (clusterPoleCodes.has(fromCode) || clusterPoleCodes.has(toCode)) return true;

      const coords = lineFeat.geometry?.coordinates;
      if (coords && coords.length > 0) {
        const mid = coords[Math.floor(coords.length / 2)];
        return getDistanceMeters(dtrLat, dtrLon, mid[1], mid[0]) <= 85;
      }
      return false;
    });

    // C. Render Connecting Lines in Cluster with Enhanced Visibility
    clusterLines.forEach((lineFeat: any) => {
      const coords = lineFeat.geometry?.coordinates;
      if (!coords || coords.length < 2) return;

      const isHT = lineFeat.properties.is_ht !== false;
      const latlngs = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);

      const polyline = L.polyline(latlngs, {
        color: isHT ? '#ef4444' : '#0ea5e9',
        weight: isHT ? 6.5 : 4.5,
        opacity: isHT ? 1.0 : 0.9,
        dashArray: lineFeat.properties.is_operational !== false ? undefined : '5, 5',
        lineCap: 'round',
        lineJoin: 'round',
      });

      const lengthMeters = (lineFeat.properties.length_km * 1000).toFixed(0);

      polyline.bindTooltip(
        `
        <div style="background: #0f172a; color: #f8fafc; padding: 5px 8px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <div style="font-weight: bold; color: ${isHT ? '#ef4444' : '#38bdf8'};">${isHT ? '11 kV Primary Incomer' : '415 V LT Circuit Cable'}</div>
          <div>Conductor: <b>${lineFeat.properties.conductor_type}</b></div>
          <div>Span: <b>${lengthMeters} m</b> &bull; Load: <b>${lineFeat.properties.loading_pct}%</b></div>
        </div>
        `,
        { sticky: true, opacity: 0.95 }
      );

      polyline.on('click', () => {
        if (onSelectAsset) {
          onSelectAsset({
            id: lineFeat.properties.id,
            code: lineFeat.properties.code,
            name: lineFeat.properties.name,
            entity_type: 'line',
            provenance: lineFeat.properties.provenance,
            confidence_score: lineFeat.properties.confidence_score,
            properties: lineFeat.properties,
          });
        }
      });

      lines.addLayer(polyline);
    });

    // D. Render Cluster Poles with Permanent Text Badges for Immediate Visibility
    clusterPoles.forEach((poleFeat: any) => {
      const coords = poleFeat.geometry?.coordinates;
      if (!coords) return;
      const pLat = coords[1];
      const pLon = coords[0];
      const distM = getDistanceMeters(dtrLat, dtrLon, pLat, pLon).toFixed(1);
      const shortCode = getShortPoleCode(poleFeat.properties.code, poleFeat.properties.name);
      const isDP = shortCode === 'DP-Structure';

      const poleBadgeIcon = L.divIcon({
        className: 'cluster-pole-badge-icon',
        html: `
          <div style="display: flex; align-items: center; gap: 4px; pointer-events: auto; cursor: pointer; white-space: nowrap;">
            <div style="width: ${isDP ? '14px' : '11px'}; height: ${isDP ? '14px' : '11px'}; border-radius: 50%; background: ${isDP ? '#ea580c' : '#854d0e'}; border: 2.5px solid ${isDP ? '#f97316' : '#fde047'}; box-shadow: 0 0 10px rgba(0,0,0,0.8);"></div>
            <span style="background: rgba(15, 23, 42, 0.92); color: ${isDP ? '#fdba74' : '#fef08a'}; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; padding: 1.5px 6px; border-radius: 4px; border: 1px solid ${isDP ? '#ea580c' : '#78350f'}; box-shadow: 0 2px 6px rgba(0,0,0,0.6);">
              ${shortCode} (${distM}m)
            </span>
          </div>
        `,
        iconSize: [90, 20],
        iconAnchor: [6, 6],
      });

      const marker = L.marker([pLat, pLon], { icon: poleBadgeIcon });

      marker.bindTooltip(
        `
        <div style="background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #78350f;">
          <div style="font-weight: bold; color: #fde047;">${poleFeat.properties.name || poleFeat.properties.code}</div>
          <div>Asset Code: <b>${poleFeat.properties.code}</b></div>
          <div>Distance from DTR: <b>${distM} m</b></div>
          <div>Operating Voltage: ${poleFeat.properties.voltage_level_kv || 0.415} kV</div>
        </div>
        `,
        { direction: 'top', offset: [0, -8], opacity: 1 }
      );

      marker.on('click', () => {
        if (onSelectAsset) {
          onSelectAsset({
            id: poleFeat.properties.id,
            code: poleFeat.properties.code,
            name: poleFeat.properties.name,
            entity_type: 'pole',
            provenance: poleFeat.properties.provenance,
            confidence_score: poleFeat.properties.confidence_score,
            properties: poleFeat.properties,
          });
        }
      });

      poles.addLayer(marker);
    });

    // E. Render Central DTR Beacon
    const dtrIcon = L.divIcon({
      className: 'cluster-dtr-center-icon',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; cursor: pointer;">
          <div style="position: absolute; width: 46px; height: 46px; border-radius: 50%; background: rgba(236, 72, 153, 0.4); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 26px; height: 26px; border-radius: 50%; background: #ec4899; border: 3.5px solid #ffffff; box-shadow: 0 0 20px #ec4899; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <div style="width: 7px; height: 7px; border-radius: 50%; background: #ffffff;"></div>
          </div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    const dtrMarker = L.marker([dtrLat, dtrLon], { icon: dtrIcon });
    dtrMarker.bindTooltip(
      `
      <div style="background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #ec4899; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <div style="font-weight: bold; color: #f472b6;">${dtr?.name || dtr?.code}</div>
        <div>Rating: <b>${dtr?.properties?.rated_kva || 100} kVA</b></div>
        <div>Cluster Center: 11 kV &rarr; 415 V Stepdown</div>
      </div>
      `,
      { direction: 'top', offset: [0, -20], opacity: 1 }
    );
    dtrGroup.addLayer(dtrMarker);
  }, [isOpen, dtrCoords?.[0], dtrCoords?.[1], networkData, baseMap]);

  if (!isOpen || !dtr) return null;

  const props = dtr.properties || {};
  const ratedKva = props.rated_kva || 100;
  const loadingPct = props.loading_pct || 72;
  const isOverloaded = loadingPct > 100;

  return (
    <div
      className={`fixed ${
        isExpanded
          ? 'inset-6 z-[2500]'
          : isDrawerOpen
          ? 'bottom-6 right-[404px] w-[500px] h-[480px] z-[1500]'
          : 'bottom-6 right-6 w-[500px] h-[480px] z-[1500]'
      } bg-slate-900/98 border border-pink-500/50 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200 transition-all`}
    >
      {/* Header Bar */}
      <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white tracking-wide">{dtr.name || dtr.code}</span>
              <span className="text-[10px] bg-pink-950/60 border border-pink-800 text-pink-300 px-1.5 py-0.2 rounded font-mono">
                {ratedKva} kVA
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Triangle Cluster Magnifier &bull; <span className="text-pink-300 font-bold">{currentZoom}x Zoom</span>
            </p>
          </div>
        </div>

        {/* Quick Zoom Presets & Action Controls */}
        <div className="flex items-center space-x-1.5">
          {/* Quick Zoom Level Selectors */}
          <div className="flex items-center space-x-1 bg-slate-900 px-1.5 py-0.5 rounded-lg border border-slate-800 text-[10px] font-mono mr-1">
            <button
              onClick={() => mapInstanceRef.current?.setZoom(20)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                currentZoom <= 20.2 ? 'bg-pink-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="20x Zoom: Cluster Overview (~80m span)"
            >
              20x
            </button>
            <button
              onClick={() => mapInstanceRef.current?.setZoom(21.5)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                currentZoom > 20.2 && currentZoom <= 22.2 ? 'bg-pink-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="21.5x Zoom: Triangle Delta (~25m span)"
            >
              21.5x
            </button>
            <button
              onClick={() => mapInstanceRef.current?.setZoom(23)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                currentZoom > 22.2 ? 'bg-pink-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
              title="23x Zoom: Ultra Close-Up DP Pole (~5m span)"
            >
              23x
            </button>
          </div>

          <button
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => dtrCoords && mapInstanceRef.current?.setView(dtrCoords, 21.5)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Recenter on DTR"
          >
            <Navigation className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            title="Close Zoom Window"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Interactive High-Res Mini-Map Canvas */}
      <div className="flex-1 relative w-full h-full bg-slate-950">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Map Cluster Legend Overlay */}
        <div className="absolute top-2.5 left-2.5 z-[1000] bg-slate-950/85 border border-slate-800/80 rounded-lg p-2 text-[10px] font-mono space-y-1 shadow-lg backdrop-blur-sm pointer-events-none">
          <div className="flex items-center space-x-1.5 text-rose-300">
            <span className="w-2.5 h-1 bg-red-500 rounded-sm inline-block" />
            <span>11 kV HT Incomer</span>
          </div>
          <div className="flex items-center space-x-1.5 text-cyan-300">
            <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" />
            <span>415 V LT Circuit Cables</span>
          </div>
          <div className="flex items-center space-x-1.5 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-600 border border-yellow-300 inline-block" />
            <span>Poles & DP Structure (with distance)</span>
          </div>
        </div>
      </div>

      {/* Cluster Summary Footer Bar */}
      <div className="px-4 py-2.5 bg-slate-950/95 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center space-x-3 text-[11px]">
          <span className="text-slate-400">Loading:</span>
          <span
            className={`font-bold ${
              isOverloaded ? 'text-rose-400' : loadingPct > 80 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {loadingPct}% {isOverloaded ? '(Overloaded)' : '(Optimal)'}
          </span>
          <span className="text-slate-600">&bull;</span>
          <span className="text-slate-400">Delta Bus:</span>
          <span className="text-cyan-400 font-semibold">11 kV &rarr; 415 V</span>
        </div>
        <div className="text-[10px] text-slate-500 flex items-center space-x-1">
          <Info className="w-3 h-3 text-slate-400" />
          <span>Click any line/pole in cluster to inspect</span>
        </div>
      </div>
    </div>
  );
};
