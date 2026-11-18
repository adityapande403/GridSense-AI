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
  onSelectAsset?: (asset: SelectedAsset) => void;
}

export const DTRClusterZoomWindow: React.FC<DTRClusterZoomWindowProps> = ({
  isOpen,
  onClose,
  dtr,
  networkData,
  baseMap,
  onSelectAsset,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
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

  // 1. Initialize or Re-center Cluster Mini-Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const center = dtrCoords || [11.270127, 75.765721];
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 17,
        maxZoom: 21,
      }).setView(center, 19.5);

      // Base tile layer
      let tileUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;
      if (baseMap === 'carto-dark') {
        tileUrl = `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;
      } else if (baseMap === 'osm') {
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      } else if (baseMap === 'satellite') {
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      }

      const tileLayer = L.tileLayer(tileUrl, { maxZoom: 21 }).addTo(map);
      tileLayerRef.current = tileLayer;

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
      mapInstanceRef.current.setView(dtrCoords, 19.5);
    }

    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);

    return () => {
      // Keep instance or destroy on close
    };
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

    // C. Render Connecting Lines in Cluster
    clusterLines.forEach((lineFeat: any) => {
      const coords = lineFeat.geometry?.coordinates;
      if (!coords || coords.length < 2) return;

      const isHT = lineFeat.properties.is_ht !== false;
      const latlngs = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);

      const polyline = L.polyline(latlngs, {
        color: isHT ? '#ef4444' : '#38bdf8',
        weight: isHT ? 5.5 : 3.5,
        opacity: isHT ? 1.0 : 0.85,
        dashArray: lineFeat.properties.is_operational !== false ? undefined : '4, 4',
        lineCap: 'round',
        lineJoin: 'round',
      });

      const lengthMeters = (lineFeat.properties.length_km * 1000).toFixed(0);

      polyline.bindTooltip(
        `
        <div style="background: #0f172a; color: #f8fafc; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; border: 1px solid #334155;">
          <div style="font-weight: bold; color: ${isHT ? '#ef4444' : '#38bdf8'};">${isHT ? '11 kV Primary Incomer' : '415 V LT Branch'}</div>
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

    // D. Render Cluster Poles (Support structures in the delta/triangle cluster)
    clusterPoles.forEach((poleFeat: any) => {
      const coords = poleFeat.geometry?.coordinates;
      if (!coords) return;
      const pLat = coords[1];
      const pLon = coords[0];
      const distM = getDistanceMeters(dtrLat, dtrLon, pLat, pLon).toFixed(1);

      const marker = L.circleMarker([pLat, pLon], {
        radius: 6.0,
        fillColor: '#854d0e',
        color: '#fde047',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95,
      });

      marker.bindTooltip(
        `
        <div style="background: #0f172a; color: #f8fafc; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; border: 1px solid #78350f;">
          <div style="font-weight: bold; color: #fde047;">${poleFeat.properties.name || poleFeat.properties.code}</div>
          <div>Code: ${poleFeat.properties.code}</div>
          <div>Distance from DTR: <b>${distM} m</b></div>
        </div>
        `,
        { direction: 'top', offset: [0, -6], opacity: 1 }
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
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; cursor: pointer;">
          <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: rgba(236, 72, 153, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 22px; height: 22px; border-radius: 50%; background: #ec4899; border: 3px solid #ffffff; box-shadow: 0 0 16px #ec4899; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
          </div>
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });

    const dtrMarker = L.marker([dtrLat, dtrLon], { icon: dtrIcon });
    dtrMarker.bindTooltip(
      `
      <div style="background: #0f172a; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #ec4899; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <div style="font-weight: bold; color: #f472b6;">${dtr?.name || dtr?.code}</div>
        <div>Rating: <b>${dtr?.properties?.rated_kva || 100} kVA</b></div>
        <div>Cluster Center: 11 kV &rarr; 415 V</div>
      </div>
      `,
      { direction: 'top', offset: [0, -18], opacity: 1 }
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
          : 'bottom-6 right-6 w-[480px] h-[450px] z-[1500]'
      } bg-slate-900/98 border border-pink-500/40 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200`}
    >
      {/* Header Bar */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
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
            <p className="text-[10px] text-slate-400 font-mono">DTR Triangle Cluster Magnifier &bull; Zoom 19.5x</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5">
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
            onClick={() => dtrCoords && mapInstanceRef.current?.setView(dtrCoords, 19.5)}
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
            <span>Cluster Poles / DP Structure</span>
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
          <span className="text-slate-400">Stepdown:</span>
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
