import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Navigation,
  Zap,
  Info,
  Layers,
  Activity,
  Cpu,
  ToggleLeft,
} from 'lucide-react';
import { SelectedAsset } from './AssetInspectionDrawer';

const CARTO_API_KEY = 'cb1_5bc6_1_33507307e992fe96d084bfb5';

interface DTRClusterZoomWindowProps {
  isOpen: boolean;
  onClose: () => void;
  dtr?: SelectedAsset | null;
  clusterAsset?: SelectedAsset | null;
  networkData: any;
  baseMap: 'carto-voyager' | 'carto-dark' | 'osm' | 'satellite';
  mode?: 'floating' | 'embedded';
  isDrawerOpen?: boolean;
  showHTLines?: boolean;
  showLTLines?: boolean;
  showPoles?: boolean;
  showDPStructures?: boolean;
  showDTRs?: boolean;
  showSwitches?: boolean;
  selectedAsset?: SelectedAsset | null;
  onSelectAsset?: (asset: SelectedAsset) => void;
}

export const DTRClusterZoomWindow: React.FC<DTRClusterZoomWindowProps> = ({
  isOpen,
  onClose,
  dtr,
  clusterAsset,
  networkData,
  baseMap,
  mode = 'embedded',
  isDrawerOpen = true,
  showHTLines = true,
  showLTLines = true,
  showPoles = true,
  showDPStructures = true,
  showDTRs = true,
  showSwitches = true,
  selectedAsset,
  onSelectAsset,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(21.5);

  // Local attribute/layer visibility toggles (initialized from parent props)
  const [showHT, setShowHT] = useState<boolean>(showHTLines);
  const [showLT, setShowLT] = useState<boolean>(showLTLines);
  const [showPolesLayer, setShowPolesLayer] = useState<boolean>(showPoles);
  const [showDP, setShowDP] = useState<boolean>(showDPStructures);
  const [showDTRLayer, setShowDTRLayer] = useState<boolean>(showDTRs);
  const [showSwitchesLayer, setShowSwitchesLayer] = useState<boolean>(showSwitches);

  const [dpCount, setDpCount] = useState<number>(0);
  const [stdPolesCount, setStdPolesCount] = useState<number>(0);
  const [dtrCount, setDtrCount] = useState<number>(0);
  const [switchesCount, setSwitchesCount] = useState<number>(0);
  const [mapReady, setMapReady] = useState<number>(0);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterLayersRef = useRef<{
    lines: L.LayerGroup;
    poles: L.LayerGroup;
    dpStructures: L.LayerGroup;
    dtr: L.LayerGroup;
    switches: L.LayerGroup;
    substations: L.LayerGroup;
  } | null>(null);

  // Sync with parent props when changed globally
  useEffect(() => {
    setShowHT(showHTLines);
  }, [showHTLines]);
  useEffect(() => {
    setShowLT(showLTLines);
  }, [showLTLines]);
  useEffect(() => {
    setShowPolesLayer(showPoles);
  }, [showPoles]);
  useEffect(() => {
    setShowDP(showDPStructures);
  }, [showDPStructures]);
  useEffect(() => {
    setShowDTRLayer(showDTRs);
  }, [showDTRs]);
  useEffect(() => {
    setShowSwitchesLayer(showSwitches);
  }, [showSwitches]);

  const targetAsset = clusterAsset || dtr;

  // Extract Center Coordinates (works universally for any attribute: line, switch, substation, DTR, pole)
  const getCenterCoords = (): [number, number] | null => {
    if (!targetAsset) return null;
    const props = targetAsset.properties || {};
    if (props.coordinates && Array.isArray(props.coordinates) && props.coordinates.length === 2) {
      return props.coordinates as [number, number]; // [lat, lon]
    }
    if (props.latitude && props.longitude) {
      return [Number(props.latitude), Number(props.longitude)];
    }
    if (targetAsset.entity_type === 'pole' && networkData?.poles?.features) {
      const pFeat = networkData.poles.features.find((f: any) => f.properties.code === targetAsset.code);
      if (pFeat?.geometry?.coordinates) {
        return [pFeat.geometry.coordinates[1], pFeat.geometry.coordinates[0]];
      }
    }
    if (targetAsset.entity_type === 'distribution_transformer' && networkData?.transformers?.features) {
      const dFeat = networkData.transformers.features.find((f: any) => f.properties.code === targetAsset.code);
      if (dFeat?.geometry?.coordinates) {
        return [dFeat.geometry.coordinates[1], dFeat.geometry.coordinates[0]];
      }
    }
    if (targetAsset.entity_type === 'line' && networkData?.lines?.features) {
      const lFeat = networkData.lines.features.find((f: any) => f.properties.code === targetAsset.code);
      const coords = lFeat?.geometry?.coordinates;
      if (coords && coords.length > 0) {
        const mid = coords[Math.floor(coords.length / 2)];
        return [mid[1], mid[0]];
      }
    }
    if (targetAsset.entity_type === 'switch' && networkData?.switches?.features) {
      const sFeat = networkData.switches.features.find((f: any) => f.properties.code === targetAsset.code);
      if (sFeat?.geometry?.coordinates) {
        return [sFeat.geometry.coordinates[1], sFeat.geometry.coordinates[0]];
      }
    }
    if (targetAsset.entity_type === 'substation' && networkData?.substations?.features) {
      const subFeat = networkData.substations.features.find((f: any) => f.properties.code === targetAsset.code);
      if (subFeat?.geometry?.coordinates) {
        return [subFeat.geometry.coordinates[1], subFeat.geometry.coordinates[0]];
      }
    }
    return [11.270127, 75.765721];
  };

  const centerCoords = getCenterCoords();

  // Distance helper in meters
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dy = (lat2 - lat1) * 111000;
    const dx = (lon2 - lon1) * 111000 * Math.cos((lat1 * Math.PI) / 180);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Helper to identify DP (Double-Pole) transformer mounting structure
  const isDPSupport = (p: any): boolean => {
    const name = p.properties.name || '';
    const code = p.properties.code || '';
    return name.includes('DP') || name.includes('DTR DP') || code.includes('DP') || name.includes('11kV DTR');
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

  // Helper to compute non-colliding badge placement quadrant for dense neighbor poles
  const getBadgeQuadrant = (
    lat: number,
    lon: number,
    allPoles: any[],
    idx: number
  ): 'right' | 'left' | 'top' | 'bottom' => {
    // Find all poles within 8.5 meters
    const closePoles = allPoles.filter((other) => {
      const oc = other.geometry?.coordinates;
      if (!oc) return false;
      return getDistanceMeters(lat, lon, oc[1], oc[0]) <= 8.5;
    });

    if (closePoles.length <= 1) {
      return 'right';
    }

    // Sort deterministic by code
    closePoles.sort((a, b) => (a.properties?.code || '').localeCompare(b.properties?.code || ''));
    const pos = closePoles.findIndex((n) => {
      const nc = n.geometry?.coordinates;
      return nc && Math.abs(nc[1] - lat) < 0.00005 && Math.abs(nc[0] - lon) < 0.00005;
    });

    const quadrantOrder: Array<'right' | 'left' | 'top' | 'bottom'> = ['right', 'left', 'top', 'bottom'];
    return quadrantOrder[(pos >= 0 ? pos : idx) % 4];
  };

  // Dynamic entity styling helpers
  const getEntityColors = () => {
    const type = targetAsset?.entity_type;
    switch (type) {
      case 'distribution_transformer':
        return {
          border: 'border-pink-500/50',
          badgeBg: 'bg-pink-950/60 border-pink-800 text-pink-300',
          iconBg: 'bg-pink-500/20 border-pink-500/40 text-pink-400',
          accentText: 'text-pink-300',
          btnActive: 'bg-pink-600',
        };
      case 'line':
        return {
          border: 'border-cyan-500/50',
          badgeBg: 'bg-cyan-950/60 border-cyan-800 text-cyan-300',
          iconBg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400',
          accentText: 'text-cyan-300',
          btnActive: 'bg-cyan-600',
        };
      case 'switch':
        return {
          border: 'border-emerald-500/50',
          badgeBg: 'bg-emerald-950/60 border-emerald-800 text-emerald-300',
          iconBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
          accentText: 'text-emerald-300',
          btnActive: 'bg-emerald-600',
        };
      case 'substation':
        return {
          border: 'border-purple-500/50',
          badgeBg: 'bg-purple-950/60 border-purple-800 text-purple-300',
          iconBg: 'bg-purple-500/20 border-purple-500/40 text-purple-400',
          accentText: 'text-purple-300',
          btnActive: 'bg-purple-600',
        };
      case 'pole':
      default:
        return {
          border: 'border-orange-500/50',
          badgeBg: 'bg-orange-950/60 border-orange-800 text-orange-300',
          iconBg: 'bg-orange-500/20 border-orange-500/40 text-orange-400',
          accentText: 'text-orange-300',
          btnActive: 'bg-orange-600',
        };
    }
  };

  const getEntityIcon = () => {
    switch (targetAsset?.entity_type) {
      case 'distribution_transformer':
        return <Zap className="w-4 h-4 text-pink-400" />;
      case 'line':
        return <Activity className="w-4 h-4 text-cyan-400" />;
      case 'switch':
        return <ToggleLeft className="w-4 h-4 text-emerald-400" />;
      case 'substation':
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case 'pole':
      default:
        return <Layers className="w-4 h-4 text-orange-400" />;
    }
  };

  const getEntityCategoryDesc = () => {
    switch (targetAsset?.entity_type) {
      case 'distribution_transformer':
        return 'DTR Micro-Cluster Magnifier';
      case 'line':
        return 'Line Span Micro-Magnifier';
      case 'switch':
        return 'Switchgear & Tie Point Magnifier';
      case 'substation':
        return 'Substation Bay & Gantry Magnifier';
      case 'pole':
      default:
        return 'Dense Street & Junction Magnifier';
    }
  };

  const getEntityBadge = () => {
    if (!targetAsset) return '';
    const p = targetAsset.properties || {};
    switch (targetAsset.entity_type) {
      case 'distribution_transformer':
        return `${p.rated_kva || 100} kVA`;
      case 'line':
        return `${p.conductor_type || 'Line'} • ${(p.length_km || 0).toFixed(2)} km`;
      case 'switch':
        return `${(p.switch_type || 'Switch').toUpperCase()} • ${(p.current_status || 'closed').toUpperCase()}`;
      case 'substation':
        return `${p.nominal_kv || 33} kV • ${p.ptr_capacity_mva || 10} MVA`;
      case 'pole':
      default:
        return p.is_dp_structure ? '11 kV DP Structure' : `${stdPolesCount + dpCount} Poles Clustered`;
    }
  };

  // 1. Initialize, Re-center or Dispose Cluster Mini-Map with Extra High Zoom
  useEffect(() => {
    // If closed, cleanly tear down Leaflet instance and free memory
    if (!isOpen) {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore
        }
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        clusterLayersRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current) return;

    // Guard: Verify existing map is still attached to the active DOM element
    if (mapInstanceRef.current) {
      const container = mapInstanceRef.current.getContainer();
      if (!container || container !== mapContainerRef.current || !document.body.contains(container)) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore
        }
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        clusterLayersRef.current = null;
      }
    }

    if (!mapInstanceRef.current) {
      if ((mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
      const center = centerCoords || [11.270127, 75.765721];
      let map: L.Map;
      try {
        map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          minZoom: 18,
          maxZoom: 24, // Allow ultra high zoom up to 24x
        }).setView(center, 21.5);
      } catch (err) {
        console.warn('Leaflet cluster zoom window initialization guard:', err);
        return;
      }

      let tileUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?key=${CARTO_API_KEY}`;
      let nativeZoom = 18;
      let sub = 'abc';
      if (baseMap === 'carto-dark') {
        tileUrl = `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png?key=${CARTO_API_KEY}`;
        nativeZoom = 18;
      } else if (baseMap === 'osm') {
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        nativeZoom = 19;
      } else if (baseMap === 'satellite') {
        tileUrl = 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
        nativeZoom = 20;
        sub = '0123';
      }

      const tileLayer = L.tileLayer(tileUrl, {
        subdomains: sub,
        maxNativeZoom: nativeZoom,
        maxZoom: 24,
        tileSize: 256,
        keepBuffer: 8,
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      map.on('zoomend', () => {
        setCurrentZoom(Math.round(map.getZoom() * 10) / 10);
      });

      const linesGroup = L.layerGroup().addTo(map);
      const dpGroup = L.layerGroup().addTo(map);
      const polesGroup = L.layerGroup().addTo(map);
      const dtrGroup = L.layerGroup().addTo(map);
      const switchesGroup = L.layerGroup().addTo(map);
      const substationsGroup = L.layerGroup().addTo(map);

      clusterLayersRef.current = {
        lines: linesGroup,
        dpStructures: dpGroup,
        poles: polesGroup,
        dtr: dtrGroup,
        switches: switchesGroup,
        substations: substationsGroup,
      };

      mapInstanceRef.current = map;
      // Notify feature renderer that fresh map is ready
      setMapReady((v) => v + 1);
    } else if (centerCoords) {
      mapInstanceRef.current.setView(centerCoords, 21.5);
    }

    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, centerCoords?.[0], centerCoords?.[1], isExpanded]);

  // Clean cleanup on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore
        }
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        clusterLayersRef.current = null;
      }
    };
  }, []);

  // 2. Base Map Tile Layer Switch
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    let tileUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?key=${CARTO_API_KEY}`;
    let nativeZoom = 18;
    let sub = 'abc';
    if (baseMap === 'carto-dark') {
      tileUrl = `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png?key=${CARTO_API_KEY}`;
      nativeZoom = 18;
    } else if (baseMap === 'osm') {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      nativeZoom = 19;
    } else if (baseMap === 'satellite') {
      tileUrl = 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
      nativeZoom = 20;
      sub = '0123';
    }

    const newTileLayer = L.tileLayer(tileUrl, {
      subdomains: sub,
      maxNativeZoom: nativeZoom,
      maxZoom: 24,
      tileSize: 256,
      keepBuffer: 8,
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current = newTileLayer;
  }, [baseMap]);

  // 3. Render Cluster Features for ALL Network Attributes with Anti-Collision Radial Fanning
  useEffect(() => {
    if (!isOpen || !mapInstanceRef.current || !clusterLayersRef.current || !centerCoords || !networkData || !targetAsset)
      return;

    const [centerLat, centerLon] = centerCoords;
    const { lines, dpStructures, poles, dtr: dtrGroup, switches, substations } = clusterLayersRef.current;

    lines.clearLayers();
    dpStructures.clearLayers();
    poles.clearLayers();
    dtrGroup.clearLayers();
    switches.clearLayers();
    substations.clearLayers();

    // A. Filter Poles in immediate Cluster (within 85 meters of focal center)
    const clusterPoles = (networkData.poles?.features || []).filter((poleFeat: any) => {
      const coords = poleFeat.geometry?.coordinates;
      if (!coords) return false;
      const dist = getDistanceMeters(centerLat, centerLon, coords[1], coords[0]);
      return dist <= 85;
    });

    const dpPolesList = clusterPoles.filter(isDPSupport);
    const stdPolesList = clusterPoles.filter((p: any) => !isDPSupport(p));
    setDpCount(dpPolesList.length);
    setStdPolesCount(stdPolesList.length);

    // Group poles with identical or near-identical coordinates (< 0.8m) to spiderfy them neatly
    const coordGroups = new Map<string, any[]>();
    clusterPoles.forEach((p: any) => {
      const c = p.geometry?.coordinates;
      if (!c) return;
      const key = `${c[1].toFixed(5)},${c[0].toFixed(5)}`;
      if (!coordGroups.has(key)) coordGroups.set(key, []);
      coordGroups.get(key)!.push(p);
    });

    const clusterPoleCodes = new Set(clusterPoles.map((p: any) => p.properties.code));

    // B. Filter Lines in Cluster (within 85m or connected to cluster poles, or target line)
    const clusterLines = (networkData.lines?.features || []).filter((lineFeat: any) => {
      if (targetAsset.entity_type === 'line' && lineFeat.properties.code === targetAsset.code) return true;
      const fromCode = lineFeat.properties.from_bus_code;
      const toCode = lineFeat.properties.to_bus_code;
      if (clusterPoleCodes.has(fromCode) || clusterPoleCodes.has(toCode)) return true;

      const coords = lineFeat.geometry?.coordinates;
      if (coords && coords.length > 0) {
        const mid = coords[Math.floor(coords.length / 2)];
        return getDistanceMeters(centerLat, centerLon, mid[1], mid[0]) <= 85;
      }
      return false;
    });

    // C. Render Lines (respecting showHT and showLT attribute toggles)
    clusterLines.forEach((lineFeat: any) => {
      const coords = lineFeat.geometry?.coordinates;
      if (!coords || coords.length < 2) return;

      const isHT = lineFeat.properties.is_ht !== false;
      if (isHT && !showHT) return;
      if (!isHT && !showLT) return;

      const latlngs = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
      const isSelected = selectedAsset?.code === lineFeat.properties.code;

      const polyline = L.polyline(latlngs, {
        color: isSelected ? '#38bdf8' : isHT ? '#ef4444' : '#0ea5e9',
        weight: isSelected ? 8.0 : isHT ? 6.5 : 4.5,
        opacity: isHT ? 1.0 : 0.9,
        dashArray: lineFeat.properties.is_operational !== false ? undefined : '5, 5',
        lineCap: 'round',
        lineJoin: 'round',
      });

      const lengthMeters = ((lineFeat.properties.length_km || 0) * 1000).toFixed(0);

      polyline.bindTooltip(
        `
        <div style="background: #0f172a; color: #f8fafc; padding: 5px 8px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <div style="font-weight: bold; color: ${isHT ? '#ef4444' : '#38bdf8'};">${
          isHT ? '11 kV Primary Incomer' : '415 V LT Circuit Cable'
        }</div>
          <div>Conductor: <b>${lineFeat.properties.conductor_type}</b></div>
          <div>Span: <b>${lengthMeters} m</b> &bull; Load: <b>${lineFeat.properties.loading_pct}%</b></div>
          <div style="font-size: 9px; color: #38bdf8; margin-top: 2px;">Click to select & inspect attributes</div>
        </div>
        `,
        { sticky: true, opacity: 0.95 }
      );

      polyline.on('click', () => {
        if (onSelectAsset) {
          const midIdx = Math.floor(coords.length / 2);
          const midPoint = coords[midIdx] || coords[0];
          onSelectAsset({
            id: lineFeat.properties.id,
            code: lineFeat.properties.code,
            name: lineFeat.properties.name,
            entity_type: 'line',
            provenance: lineFeat.properties.provenance,
            confidence_score: lineFeat.properties.confidence_score,
            properties: {
              ...lineFeat.properties,
              coordinates: [midPoint[1], midPoint[0]],
            },
          });
        }
      });

      lines.addLayer(polyline);
    });

    // D1. Render DP STRUCTURES (Substation Double-Pole Mounting Structure)
    if (showDP) {
      dpPolesList.forEach((poleFeat: any, pIdx: number) => {
        const coords = poleFeat.geometry?.coordinates;
        if (!coords) return;
        const origLat = coords[1];
        const origLon = coords[0];
        const distM = getDistanceMeters(centerLat, centerLon, origLat, origLon).toFixed(1);
        const shortCode = getShortPoleCode(poleFeat.properties.code, poleFeat.properties.name);
        const isSelected = selectedAsset?.code === poleFeat.properties.code;

        // Check if multiple poles share this exact coordinate; if so, spiderfy neatly
        const group = coordGroups.get(`${origLat.toFixed(5)},${origLon.toFixed(5)}`);
        let pLat = origLat;
        let pLon = origLon;

        if (group && group.length > 1) {
          const idx = group.findIndex((x) => x.properties.code === poleFeat.properties.code);
          const angle = (2 * Math.PI * idx) / group.length;
          const offsetM = 3.6; // 3.6m radial offset fanning
          pLat = origLat + (offsetM * Math.sin(angle)) / 111000;
          pLon = origLon + (offsetM * Math.cos(angle)) / (111000 * Math.cos((origLat * Math.PI) / 180));

          const spiderLine = L.polyline(
            [
              [origLat, origLon],
              [pLat, pLon],
            ],
            {
              color: '#ea580c',
              weight: 1.2,
              dashArray: '2, 3',
              opacity: 0.8,
            }
          );
          dpStructures.addLayer(spiderLine);
        }

        // Multi-directional badge placement to completely prevent overlapping boxes
        const quadrant = getBadgeQuadrant(pLat, pLon, clusterPoles, pIdx);
        let flexClass = 'display: flex; align-items: center; gap: 4px;';
        let iconAnchor: [number, number] = [8, 10];
        let iconSize: [number, number] = [115, 24];

        if (quadrant === 'left') {
          flexClass = 'display: flex; flex-direction: row-reverse; align-items: center; gap: 4px;';
          iconAnchor = [107, 10];
        } else if (quadrant === 'top') {
          flexClass = 'display: flex; flex-direction: column-reverse; align-items: center; gap: 3px;';
          iconAnchor = [57, 32];
          iconSize = [115, 38];
        } else if (quadrant === 'bottom') {
          flexClass = 'display: flex; flex-direction: column; align-items: center; gap: 3px;';
          iconAnchor = [57, 6];
          iconSize = [115, 38];
        }

        const dpBadgeIcon = L.divIcon({
          className: 'cluster-dp-badge-icon',
          html: `
            <div style="${flexClass} pointer-events: auto; cursor: pointer; white-space: nowrap;">
              <div style="width: 16px; height: 16px; border-radius: 4px; background: ${
                isSelected ? '#38bdf8' : '#ea580c'
              }; border: 2px solid ${isSelected ? '#ffffff' : '#fed7aa'}; box-shadow: 0 0 12px ${
            isSelected ? '#38bdf8' : '#ea580c'
          }; display: flex; align-items: center; justify-content: center; shrink-0;">
                <div style="width: 4px; height: 4px; background: #ffffff; border-radius: 50%;"></div>
              </div>
              <span style="background: ${
                isSelected ? 'rgba(14, 165, 233, 0.95)' : 'rgba(124, 45, 18, 0.92)'
              }; color: ${isSelected ? '#ffffff' : '#fed7aa'}; font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 700; padding: 1.5px 5px; border-radius: 4px; border: 1px solid ${
            isSelected ? '#38bdf8' : '#ea580c'
          }; box-shadow: 0 2px 6px rgba(0,0,0,0.6);">
                ${shortCode} <span style="opacity: 0.8; font-size: 8.5px;">(${distM}m)</span>
              </span>
            </div>
          `,
          iconSize: iconSize,
          iconAnchor: iconAnchor,
        });

        const marker = L.marker([pLat, pLon], { icon: dpBadgeIcon });
        marker.bindTooltip(`<b>11 kV DP Structure: ${poleFeat.properties.code}</b>`, { opacity: 0.95 });

        marker.on('click', () => {
          if (onSelectAsset) {
            onSelectAsset({
              id: poleFeat.properties.id,
              code: poleFeat.properties.code,
              name: poleFeat.properties.name,
              entity_type: 'pole',
              provenance: poleFeat.properties.provenance,
              confidence_score: poleFeat.properties.confidence_score,
              properties: {
                ...poleFeat.properties,
                is_dp_structure: true,
                coordinates: [origLat, origLon],
              },
            });
          }
        });

        dpStructures.addLayer(marker);
      });
    }

    // D2. Render STANDARD DISTRIBUTION SUPPORT POLES with Multi-directional Radial Fanning
    if (showPolesLayer) {
      stdPolesList.forEach((poleFeat: any, pIdx: number) => {
        const coords = poleFeat.geometry?.coordinates;
        if (!coords) return;
        const origLat = coords[1];
        const origLon = coords[0];
        const distM = getDistanceMeters(centerLat, centerLon, origLat, origLon).toFixed(1);
        const shortCode = getShortPoleCode(poleFeat.properties.code, poleFeat.properties.name);
        const isSelected = selectedAsset?.code === poleFeat.properties.code;

        // Check if multiple poles share this exact coordinate; if so, spiderfy neatly
        const group = coordGroups.get(`${origLat.toFixed(5)},${origLon.toFixed(5)}`);
        let pLat = origLat;
        let pLon = origLon;

        if (group && group.length > 1) {
          const idx = group.findIndex((x) => x.properties.code === poleFeat.properties.code);
          const angle = (2 * Math.PI * idx) / group.length;
          const offsetM = 3.6; // 3.6m radial offset fanning
          pLat = origLat + (offsetM * Math.sin(angle)) / 111000;
          pLon = origLon + (offsetM * Math.cos(angle)) / (111000 * Math.cos((origLat * Math.PI) / 180));

          const spiderLine = L.polyline(
            [
              [origLat, origLon],
              [pLat, pLon],
            ],
            {
              color: '#854d0e',
              weight: 1.2,
              dashArray: '2, 3',
              opacity: 0.7,
            }
          );
          poles.addLayer(spiderLine);
        }

        // Multi-directional badge placement: East, West, North, or South based on local density
        const quadrant = getBadgeQuadrant(pLat, pLon, clusterPoles, pIdx);
        let flexClass = 'display: flex; align-items: center; gap: 3px;';
        let iconAnchor: [number, number] = [6, 8];
        let iconSize: [number, number] = [100, 20];

        if (quadrant === 'left') {
          flexClass = 'display: flex; flex-direction: row-reverse; align-items: center; gap: 3px;';
          iconAnchor = [94, 8];
        } else if (quadrant === 'top') {
          flexClass = 'display: flex; flex-direction: column-reverse; align-items: center; gap: 2px;';
          iconAnchor = [50, 26];
          iconSize = [100, 32];
        } else if (quadrant === 'bottom') {
          flexClass = 'display: flex; flex-direction: column; align-items: center; gap: 2px;';
          iconAnchor = [50, 5];
          iconSize = [100, 32];
        }

        const poleBadgeIcon = L.divIcon({
          className: 'cluster-pole-badge-icon',
          html: `
            <div style="${flexClass} pointer-events: auto; cursor: pointer; white-space: nowrap;">
              <div style="width: 11px; height: 11px; border-radius: 50%; background: ${
                isSelected ? '#38bdf8' : '#854d0e'
              }; border: 2px solid ${isSelected ? '#ffffff' : '#fde047'}; box-shadow: 0 0 8px ${
            isSelected ? '#38bdf8' : 'rgba(0,0,0,0.8)'
          }; shrink-0;"></div>
              <span style="background: ${
                isSelected ? 'rgba(14, 165, 233, 0.95)' : 'rgba(15, 23, 42, 0.92)'
              }; color: ${isSelected ? '#ffffff' : '#fef08a'}; font-family: ui-monospace, monospace; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3.5px; border: 1px solid ${
            isSelected ? '#38bdf8' : '#78350f'
          }; box-shadow: 0 2px 6px rgba(0,0,0,0.6);">
                ${shortCode} <span style="opacity: 0.8; font-size: 8px;">(${distM}m)</span>
              </span>
            </div>
          `,
          iconSize: iconSize,
          iconAnchor: iconAnchor,
        });

        const marker = L.marker([pLat, pLon], { icon: poleBadgeIcon });
        marker.bindTooltip(`<b>Pole: ${poleFeat.properties.code}</b> (${distM}m)`, { opacity: 0.95 });

        marker.on('click', () => {
          if (onSelectAsset) {
            onSelectAsset({
              id: poleFeat.properties.id,
              code: poleFeat.properties.code,
              name: poleFeat.properties.name,
              entity_type: 'pole',
              provenance: poleFeat.properties.provenance,
              confidence_score: poleFeat.properties.confidence_score,
              properties: {
                ...poleFeat.properties,
                is_dp_structure: false,
                coordinates: [origLat, origLon],
              },
            });
          }
        });

        poles.addLayer(marker);
      });
    }

    // E. Render Switches & Tie Points in Cluster
    const clusterSwitches = (networkData.switches?.features || []).filter((swFeat: any) => {
      if (targetAsset.entity_type === 'switch' && swFeat.properties.code === targetAsset.code) return true;
      const c = swFeat.geometry?.coordinates;
      if (!c) return false;
      return getDistanceMeters(centerLat, centerLon, c[1], c[0]) <= 85;
    });
    setSwitchesCount(clusterSwitches.length);

    if (showSwitchesLayer) {
      clusterSwitches.forEach((swFeat: any) => {
        const c = swFeat.geometry?.coordinates;
        if (!c) return;
        const sLat = c[1];
        const sLon = c[0];
        const isNO = swFeat.properties.is_normally_open;
        const isClosed = swFeat.properties.current_status === 'closed';
        const isSelected = selectedAsset?.code === swFeat.properties.code;

        const swDiv = L.divIcon({
          className: 'cluster-sw-icon',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; cursor: pointer;">
              ${
                isSelected
                  ? '<div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; border: 2px solid #38bdf8; animation: ping 1.5s infinite;"></div>'
                  : ''
              }
              <div style="width: 18px; height: 18px; border-radius: ${isNO ? '50%' : '4px'}; background: ${
            isNO ? 'rgba(255,237,213,0.95)' : isClosed ? '#059669' : '#dc2626'
          }; border: 2px solid ${isSelected ? '#38bdf8' : isNO ? '#ea580c' : '#ffffff'}; box-shadow: 0 0 10px ${
            isNO ? '#ea580c' : 'rgba(0,0,0,0.5)'
          }; display: flex; align-items: center; justify-content: center;">
                <div style="width: 5px; height: 5px; border-radius: 50%; background: ${
                  isNO ? '#ea580c' : '#ffffff'
                };"></div>
              </div>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const marker = L.marker([sLat, sLon], { icon: swDiv });
        marker.bindTooltip(
          `<b>${swFeat.properties.code}</b> (${isNO ? 'Open Tie' : swFeat.properties.current_status?.toUpperCase()})`,
          { opacity: 0.95 }
        );

        marker.on('click', () => {
          if (onSelectAsset) {
            onSelectAsset({
              id: swFeat.properties.id,
              code: swFeat.properties.code,
              name: swFeat.properties.name,
              entity_type: 'switch',
              provenance: swFeat.properties.provenance,
              confidence_score: swFeat.properties.confidence_score,
              properties: {
                ...swFeat.properties,
                coordinates: [sLat, sLon],
              },
            });
          }
        });

        switches.addLayer(marker);
      });
    }

    // F. Render Substations in Cluster (or Focal Substation)
    const clusterSubstations = (networkData.substations?.features || []).filter((subFeat: any) => {
      if (targetAsset.entity_type === 'substation' && subFeat.properties.code === targetAsset.code) return true;
      const c = subFeat.geometry?.coordinates;
      if (!c) return false;
      return getDistanceMeters(centerLat, centerLon, c[1], c[0]) <= 85;
    });

    clusterSubstations.forEach((subFeat: any) => {
      const c = subFeat.geometry?.coordinates;
      if (!c) return;
      const subLat = c[1];
      const subLon = c[0];
      const isSelected = selectedAsset?.code === subFeat.properties.code;

      const subDiv = L.divIcon({
        className: 'cluster-sub-icon',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; cursor: pointer;">
            ${
              isSelected
                ? '<div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; border: 2px solid #38bdf8; animation: ping 1.5s infinite;"></div>'
                : ''
            }
            <div style="width: 22px; height: 22px; transform: rotate(45deg); background: #581c87; border: 2.5px solid ${
              isSelected ? '#38bdf8' : '#c084fc'
            }; box-shadow: 0 0 12px #a855f7; display: flex; align-items: center; justify-content: center;">
              <div style="width: 6px; height: 6px; background: #e9d5ff; border-radius: 50%;"></div>
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([subLat, subLon], { icon: subDiv });
      marker.bindTooltip(`<b>Substation: ${subFeat.properties.name || subFeat.properties.code}</b>`, {
        opacity: 0.95,
      });

      marker.on('click', () => {
        if (onSelectAsset) {
          onSelectAsset({
            id: subFeat.properties.id,
            code: subFeat.properties.code,
            name: subFeat.properties.name,
            entity_type: 'substation',
            provenance: subFeat.properties.provenance,
            confidence_score: subFeat.properties.confidence_score,
            properties: {
              ...subFeat.properties,
              coordinates: [subLat, subLon],
            },
          });
        }
      });

      substations.addLayer(marker);
    });

    // G. Render DTRs in Cluster (or Focal DTR)
    const clusterDTRs = (networkData.transformers?.features || []).filter((dFeat: any) => {
      if (targetAsset.entity_type === 'distribution_transformer' && dFeat.properties.code === targetAsset.code)
        return true;
      const c = dFeat.geometry?.coordinates;
      if (!c) return false;
      return getDistanceMeters(centerLat, centerLon, c[1], c[0]) <= 85;
    });
    setDtrCount(clusterDTRs.length);

    if (showDTRLayer) {
      clusterDTRs.forEach((dFeat: any) => {
        const c = dFeat.geometry?.coordinates;
        if (!c) return;
        const dLat = c[1];
        const dLon = c[0];
        const isSelected = selectedAsset?.code === dFeat.properties.code;
        const isFocal = targetAsset.code === dFeat.properties.code;

        const dtrIcon = L.divIcon({
          className: 'cluster-dtr-icon',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: ${
              isFocal ? '46px' : '32px'
            }; height: ${isFocal ? '46px' : '32px'}; cursor: pointer;">
              ${
                isFocal
                  ? `<div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(236, 72, 153, ${
                      isSelected ? '0.6' : '0.4'
                    }); animation: ping 2s infinite;"></div>`
                  : ''
              }
              <div style="width: ${isFocal ? '24px' : '18px'}; height: ${
            isFocal ? '24px' : '18px'
          }; border-radius: 50%; background: #ec4899; border: 2.5px solid ${
            isSelected ? '#38bdf8' : '#ffffff'
          }; box-shadow: 0 0 16px #ec4899; display: flex; align-items: center; justify-content: center; z-index: 10;">
                <div style="width: 5px; height: 5px; border-radius: 50%; background: #ffffff;"></div>
              </div>
            </div>
          `,
          iconSize: isFocal ? [46, 46] : [32, 32],
          iconAnchor: isFocal ? [23, 23] : [16, 16],
        });

        const dtrMarker = L.marker([dLat, dLon], { icon: dtrIcon });
        dtrMarker.bindTooltip(
          `<b>DTR: ${dFeat.properties.name || dFeat.properties.code}</b> (${dFeat.properties.rated_kva} kVA)`,
          { opacity: 0.95 }
        );

        dtrMarker.on('click', () => {
          if (onSelectAsset) {
            onSelectAsset({
              id: dFeat.properties.id,
              code: dFeat.properties.code,
              name: dFeat.properties.name,
              entity_type: 'distribution_transformer',
              provenance: dFeat.properties.provenance,
              confidence_score: dFeat.properties.confidence_score,
              properties: {
                ...dFeat.properties,
                coordinates: [dLat, dLon],
              },
            });
          }
        });

        dtrGroup.addLayer(dtrMarker);
      });
    }

    // H. Focal Center Hub Beacon (for line, switch, pole or substation when target is not a DTR)
    if (targetAsset.entity_type !== 'distribution_transformer') {
      const focalColor =
        targetAsset.entity_type === 'line'
          ? '#38bdf8'
          : targetAsset.entity_type === 'switch'
          ? '#10b981'
          : targetAsset.entity_type === 'substation'
          ? '#a855f7'
          : '#ea580c';

      const hubIcon = L.divIcon({
        className: 'cluster-focal-hub-icon',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; pointer-events: none;">
            <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; border: 2px dashed ${focalColor}; background: rgba(56, 189, 248, 0.15); animation: pulse 2s infinite;"></div>
            <div style="width: 14px; height: 14px; border-radius: 50%; background: ${focalColor}; border: 2.5px solid #ffffff; box-shadow: 0 0 14px ${focalColor}; display: flex; align-items: center; justify-content: center;">
              <div style="width: 4px; height: 4px; border-radius: 50%; background: #ffffff;"></div>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const hubMarker = L.marker([centerLat, centerLon], { icon: hubIcon });
      poles.addLayer(hubMarker);
    }
  }, [
    isOpen,
    mapReady,
    centerCoords?.[0],
    centerCoords?.[1],
    networkData,
    baseMap,
    showHT,
    showLT,
    showDP,
    showPolesLayer,
    showDTRLayer,
    showSwitchesLayer,
    selectedAsset?.code,
    targetAsset?.code,
  ]);

  if (!isOpen || !targetAsset) return null;

  const props = targetAsset.properties || {};
  const ratedKva = props.rated_kva || 100;
  const loadingPct = props.loading_pct || 72;
  const isOverloaded = loadingPct > 100;
  const totalClusterPoles = stdPolesCount + dpCount;
  const entityColors = getEntityColors();

  const isEmbedded = mode === 'embedded';

  const containerClasses = isExpanded
    ? 'fixed inset-6 z-[2500] bg-slate-900/98 border border-slate-700 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in duration-200'
    : isEmbedded
    ? `w-full bg-slate-950/90 border ${entityColors.border} rounded-2xl shadow-xl overflow-hidden flex flex-col my-2 transition-all duration-300`
    : `fixed ${
        isDrawerOpen
          ? 'bottom-4 right-[580px] w-[530px] h-[430px] z-[1500]'
          : 'bottom-4 right-4 w-[530px] h-[430px] z-[1500]'
      } bg-slate-900/98 border ${
        entityColors.border
      } rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200 transition-all`;

  return (
    <div className={containerClasses}>
      {/* Header Bar */}
      <div className="px-3 py-2 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
          <div className={`w-7 h-7 rounded-lg ${entityColors.iconBg} border flex items-center justify-center shrink-0`}>
            {getEntityIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5">
              <span
                className="font-bold text-white tracking-wide truncate max-w-[210px] text-xs"
                title={targetAsset.name || targetAsset.code}
              >
                {targetAsset.name || targetAsset.code}
              </span>
              <span
                className={`text-[10px] ${entityColors.badgeBg} border px-1.5 py-0.2 rounded font-mono shrink-0 whitespace-nowrap`}
              >
                {getEntityBadge()}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate">
              {getEntityCategoryDesc()} &bull;{' '}
              <span className={`${entityColors.accentText} font-bold`}>{currentZoom}x Zoom</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => centerCoords && mapInstanceRef.current?.setView(centerCoords, 21.5)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Recenter Focal Asset"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            title="Close Zoom Window"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Attribute Selector Toolbar within Zoom Window */}
      <div className="px-3 py-1.5 bg-slate-950/85 border-b border-slate-800 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-slate-500 uppercase text-[9px] mr-0.5 shrink-0">Attributes:</span>

          {/* DP Structure Toggle */}
          <button
            onClick={() => setShowDP(!showDP)}
            className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-1 shrink-0 ${
              showDP
                ? 'bg-orange-500/25 text-orange-200 border border-orange-500/60 shadow-sm'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle 11 kV DP Structure"
          >
            <span className="w-1.5 h-1.5 rounded-xs bg-orange-500 inline-block border border-orange-300" />
            <span className="font-bold">DP ({dpCount})</span>
          </button>

          {/* Poles Toggle */}
          <button
            onClick={() => setShowPolesLayer(!showPolesLayer)}
            className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-1 shrink-0 ${
              showPolesLayer
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle Support Poles"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Poles ({stdPolesCount})</span>
          </button>

          {/* 11kV HT Toggle */}
          <button
            onClick={() => setShowHT(!showHT)}
            className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-1 shrink-0 ${
              showHT
                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle 11 kV HT Lines"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>11kV HT</span>
          </button>

          {/* 415V LT Toggle */}
          <button
            onClick={() => setShowLT(!showLT)}
            className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-1 shrink-0 ${
              showLT
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle 415 V LT Lines"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>415V LT</span>
          </button>

          {/* DTR Toggle */}
          <button
            onClick={() => setShowDTRLayer(!showDTRLayer)}
            className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-1 shrink-0 ${
              showDTRLayer
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle DTR Station"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
            <span>DTR ({dtrCount})</span>
          </button>

          {/* Switch Toggle */}
          <button
            onClick={() => setShowSwitchesLayer(!showSwitchesLayer)}
            className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-1 shrink-0 ${
              showSwitchesLayer
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle Switches & Tie Points"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Switches ({switchesCount})</span>
          </button>
        </div>
      </div>

      {/* Interactive High-Res Mini-Map Canvas */}
      <div
        className={`${isExpanded || !isEmbedded ? 'flex-1' : ''} relative w-full transition-colors duration-200`}
        style={{
          height: isExpanded ? 'calc(100vh - 160px)' : isEmbedded ? '240px' : '100%',
          minHeight: isEmbedded && !isExpanded ? '240px' : undefined,
          background:
            baseMap === 'carto-voyager' || baseMap === 'osm'
              ? '#e2e8f0'
              : '#020617',
        }}
      >
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* Cluster Summary Footer Bar */}
      <div className="px-3.5 py-2 bg-slate-950/95 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-2 text-[10px] truncate">
          {targetAsset.entity_type === 'distribution_transformer' ? (
            <>
              <span className="text-slate-400">Loading:</span>
              <span
                className={`font-bold ${
                  isOverloaded ? 'text-rose-400' : loadingPct > 80 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {loadingPct}% {isOverloaded ? '(Overloaded)' : '(Optimal)'}
              </span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Rating:</span>
              <span className="text-pink-300 font-bold">{ratedKva} kVA</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Mount:</span>
              <span className="text-orange-400 font-semibold">11 kV DP Gantry</span>
            </>
          ) : targetAsset.entity_type === 'line' ? (
            <>
              <span className="text-slate-400">Span:</span>
              <span className="text-cyan-300 font-bold">{((props.length_km || 0) * 1000).toFixed(0)} m</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Type:</span>
              <span className="text-slate-200">{props.conductor_type || 'ACSR'}</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Status:</span>
              <span className={props.is_operational !== false ? 'text-emerald-400' : 'text-rose-400'}>
                {props.is_operational !== false ? 'Energized' : 'De-energized'}
              </span>
            </>
          ) : targetAsset.entity_type === 'switch' ? (
            <>
              <span className="text-slate-400">Status:</span>
              <span
                className={`font-bold ${props.current_status === 'closed' ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {(props.current_status || 'closed').toUpperCase()}
              </span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Type:</span>
              <span className="text-orange-300">{(props.switch_type || 'Switch').toUpperCase()}</span>
            </>
          ) : targetAsset.entity_type === 'substation' ? (
            <>
              <span className="text-slate-400">Capacity:</span>
              <span className="text-purple-300 font-bold">{props.ptr_capacity_mva || 10} MVA</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Feeders:</span>
              <span className="text-slate-200">{props.feeder_count || 3}</span>
            </>
          ) : (
            <>
              <span className="text-slate-400">Cluster:</span>
              <span className="text-amber-300 font-bold">{totalClusterPoles} Poles</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">DP:</span>
              <span className="text-orange-400 font-semibold">{dpCount}</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-400">Radius:</span>
              <span className="text-cyan-400 font-semibold">85m</span>
            </>
          )}
        </div>
        <div className="text-[9px] text-slate-400 flex items-center space-x-1 shrink-0">
          <Info className="w-3 h-3 text-cyan-400" />
          <span>Click elements to inspect</span>
        </div>
      </div>
    </div>
  );
};