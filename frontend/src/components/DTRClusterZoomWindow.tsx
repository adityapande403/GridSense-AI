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
  showHTLines?: boolean;
  showLTLines?: boolean;
  showPoles?: boolean;
  showDPStructures?: boolean;
  showDTRs?: boolean;
  selectedAsset?: SelectedAsset | null;
  onSelectAsset?: (asset: SelectedAsset) => void;
}

export const DTRClusterZoomWindow: React.FC<DTRClusterZoomWindowProps> = ({
  isOpen,
  onClose,
  dtr,
  networkData,
  baseMap,
  isDrawerOpen = true,
  showHTLines = true,
  showLTLines = true,
  showPoles = true,
  showDPStructures = true,
  showDTRs = true,
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

  const [dpCount, setDpCount] = useState<number>(0);
  const [stdPolesCount, setStdPolesCount] = useState<number>(0);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterLayersRef = useRef<{
    lines: L.LayerGroup;
    poles: L.LayerGroup;
    dpStructures: L.LayerGroup;
    dtr: L.LayerGroup;
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
    return [11.270127, 75.765721];
  };

  const dtrCoords = getDTRCoords();

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

  // 1. Initialize or Re-center Cluster Mini-Map with Extra High Zoom
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const center = dtrCoords || [11.270127, 75.765721];
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 18,
        maxZoom: 24, // Allow ultra high zoom up to 24x
      }).setView(center, 21.5);

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
      const dpGroup = L.layerGroup().addTo(map);
      const polesGroup = L.layerGroup().addTo(map);
      const dtrGroup = L.layerGroup().addTo(map);

      clusterLayersRef.current = {
        lines: linesGroup,
        dpStructures: dpGroup,
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

  // 2. Base Map Tile Layer Switch
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    let tileUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;
    if (baseMap === 'carto-dark') {
      tileUrl = `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;
    } else if (baseMap === 'osm') {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    } else if (baseMap === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }

    const newTileLayer = L.tileLayer(tileUrl, {
      maxNativeZoom: 19,
      maxZoom: 24,
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current = newTileLayer;
  }, [baseMap]);

  // 3. Render Cluster Features with Functional Attribute Selection & Separate DP Structure Layer
  useEffect(() => {
    if (!isOpen || !mapInstanceRef.current || !clusterLayersRef.current || !dtrCoords || !networkData || !dtr) return;

    const [dtrLat, dtrLon] = dtrCoords;
    const { lines, dpStructures, poles, dtr: dtrGroup } = clusterLayersRef.current;

    lines.clearLayers();
    dpStructures.clearLayers();
    poles.clearLayers();
    dtrGroup.clearLayers();

    // A. Filter Poles in immediate Triangle Cluster (within 85 meters)
    const clusterPoles = (networkData.poles?.features || []).filter((poleFeat: any) => {
      const coords = poleFeat.geometry?.coordinates;
      if (!coords) return false;
      const dist = getDistanceMeters(dtrLat, dtrLon, coords[1], coords[0]);
      return dist <= 85;
    });

    const dpPolesList = clusterPoles.filter(isDPSupport);
    const stdPolesList = clusterPoles.filter((p: any) => !isDPSupport(p));
    setDpCount(dpPolesList.length);
    setStdPolesCount(stdPolesList.length);

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

      const lengthMeters = (lineFeat.properties.length_km * 1000).toFixed(0);

      polyline.bindTooltip(
        `
        <div style="background: #0f172a; color: #f8fafc; padding: 5px 8px; border-radius: 6px; font-family: monospace; font-size: 11px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <div style="font-weight: bold; color: ${isHT ? '#ef4444' : '#38bdf8'};">${isHT ? '11 kV Primary Incomer' : '415 V LT Circuit Cable'}</div>
          <div>Conductor: <b>${lineFeat.properties.conductor_type}</b></div>
          <div>Span: <b>${lengthMeters} m</b> &bull; Load: <b>${lineFeat.properties.loading_pct}%</b></div>
          <div style="font-size: 9px; color: #38bdf8; margin-top: 2px;">Click to select & inspect attributes</div>
        </div>
        `,
        { sticky: true, opacity: 0.95 }
      );

      const linePopupHtml = `
        <div style="font-family: ui-monospace, monospace; padding: 10px 12px; width: 250px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
          <div style="font-size: 10px; font-weight: 700; color: ${isHT ? '#ef4444' : '#38bdf8'}; text-transform: uppercase; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
            ${isHT ? '11 kV Primary Incomer' : '415 V LT Cable'}
          </div>
          <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">${lineFeat.properties.code}</div>
          <div style="font-size: 10px; color: #cbd5e1; space-y: 2px;">
            <div>Conductor: <b>${lineFeat.properties.conductor_type}</b></div>
            <div>Length: <b>${lengthMeters} meters</b></div>
            <div>Loading: <b>${lineFeat.properties.loading_pct}%</b></div>
            <div>Status: <b style="color: ${lineFeat.properties.is_operational !== false ? '#34d399' : '#f87171'}">${lineFeat.properties.is_operational !== false ? 'Energized' : 'De-energized'}</b></div>
            <div style="font-size: 9px; color: #64748b; margin-top: 4px;">From: ${lineFeat.properties.from_bus_code} &rarr; To: ${lineFeat.properties.to_bus_code}</div>
          </div>
        </div>
      `;

      polyline.bindPopup(linePopupHtml, { maxWidth: 280, autoPan: false, closeButton: true });

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

    // D1. Render DP STRUCTURES (Substation Double-Pole Mounting Structure)
    if (showDP) {
      dpPolesList.forEach((poleFeat: any) => {
        const coords = poleFeat.geometry?.coordinates;
        if (!coords) return;
        const pLat = coords[1];
        const pLon = coords[0];
        const distM = getDistanceMeters(dtrLat, dtrLon, pLat, pLon).toFixed(1);
        const shortCode = getShortPoleCode(poleFeat.properties.code, poleFeat.properties.name);
        const isSelected = selectedAsset?.code === poleFeat.properties.code;

        const dpBadgeIcon = L.divIcon({
          className: 'cluster-dp-badge-icon',
          html: `
            <div style="display: flex; align-items: center; gap: 5px; pointer-events: auto; cursor: pointer; white-space: nowrap;">
              <div style="width: 18px; height: 18px; border-radius: 4px; background: ${
                isSelected ? '#38bdf8' : '#ea580c'
              }; border: 2.5px solid ${isSelected ? '#ffffff' : '#fed7aa'}; box-shadow: 0 0 14px ${
                isSelected ? '#38bdf8' : '#ea580c'
              }; display: flex; align-items: center; justify-content: center;">
                <div style="width: 5px; height: 5px; background: #ffffff; border-radius: 50%;"></div>
              </div>
              <span style="background: ${
                isSelected ? 'rgba(14, 165, 233, 0.95)' : 'rgba(124, 45, 18, 0.92)'
              }; color: ${isSelected ? '#ffffff' : '#fed7aa'}; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 5px; border: 1.5px solid ${
                isSelected ? '#38bdf8' : '#ea580c'
              }; box-shadow: 0 3px 8px rgba(0,0,0,0.6);">
                ⚡ ${shortCode} (${distM}m)
              </span>
            </div>
          `,
          iconSize: [120, 24],
          iconAnchor: [9, 9],
        });

        const marker = L.marker([pLat, pLon], { icon: dpBadgeIcon });

        const dpPopupHtml = `
          <div style="font-family: ui-monospace, monospace; padding: 10px 12px; width: 270px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
            <div style="font-size: 10px; font-weight: 700; color: #fb923c; text-transform: uppercase; border-bottom: 1px solid #7c2d12; padding-bottom: 4px; margin-bottom: 6px;">
              ⚡ 11 kV Double-Pole (DP) Gantry Structure
            </div>
            <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">${poleFeat.properties.name || poleFeat.properties.code}</div>
            <div style="font-size: 10px; color: #cbd5e1; space-y: 2px;">
              <div>Asset Code: <b style="color: #fed7aa">${poleFeat.properties.code}</b></div>
              <div>Distance from DTR Center: <b>${distM} meters</b></div>
              <div>Operating Voltage: <b>11 kV Primary / 415 V Sec</b></div>
              <div>Mounts: <b>DTR + DO Fuses + AB Switchgear + LA</b></div>
              <div>Earthing: <b style="color: #34d399">IS 3043 Neutral & Body Double Pipe</b></div>
              <div>Provenance: <b style="color: #38bdf8">${poleFeat.properties.provenance}</b></div>
            </div>
          </div>
        `;

        marker.bindPopup(dpPopupHtml, { maxWidth: 290, autoPan: false, closeButton: true });

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
              },
            });
          }
        });

        dpStructures.addLayer(marker);
      });
    }

    // D2. Render STANDARD DISTRIBUTION SUPPORT POLES
    if (showPolesLayer) {
      stdPolesList.forEach((poleFeat: any) => {
        const coords = poleFeat.geometry?.coordinates;
        if (!coords) return;
        const pLat = coords[1];
        const pLon = coords[0];
        const distM = getDistanceMeters(dtrLat, dtrLon, pLat, pLon).toFixed(1);
        const shortCode = getShortPoleCode(poleFeat.properties.code, poleFeat.properties.name);
        const isSelected = selectedAsset?.code === poleFeat.properties.code;

        const poleBadgeIcon = L.divIcon({
          className: 'cluster-pole-badge-icon',
          html: `
            <div style="display: flex; align-items: center; gap: 4px; pointer-events: auto; cursor: pointer; white-space: nowrap;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background: ${
                isSelected ? '#38bdf8' : '#854d0e'
              }; border: 2.5px solid ${isSelected ? '#ffffff' : '#fde047'}; box-shadow: 0 0 10px ${
                isSelected ? '#38bdf8' : 'rgba(0,0,0,0.8)'
              };"></div>
              <span style="background: ${
                isSelected ? 'rgba(14, 165, 233, 0.95)' : 'rgba(15, 23, 42, 0.92)'
              }; color: ${isSelected ? '#ffffff' : '#fef08a'}; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; padding: 1.5px 6px; border-radius: 4px; border: 1px solid ${
                isSelected ? '#38bdf8' : '#78350f'
              }; box-shadow: 0 2px 6px rgba(0,0,0,0.6);">
                ${shortCode} (${distM}m)
              </span>
            </div>
          `,
          iconSize: [90, 20],
          iconAnchor: [6, 6],
        });

        const marker = L.marker([pLat, pLon], { icon: poleBadgeIcon });

        const polePopupHtml = `
          <div style="font-family: ui-monospace, monospace; padding: 10px 12px; width: 250px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
            <div style="font-size: 10px; font-weight: 700; color: #f59e0b; text-transform: uppercase; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
              Distribution Support Pole
            </div>
            <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">${poleFeat.properties.name || poleFeat.properties.code}</div>
            <div style="font-size: 10px; color: #cbd5e1; space-y: 2px;">
              <div>Asset Code: <b>${poleFeat.properties.code}</b></div>
              <div>Distance from DTR: <b>${distM} m</b></div>
              <div>Operating Voltage: <b>${poleFeat.properties.voltage_level_kv || 0.415} kV</b></div>
              <div>Provenance: <b style="color: #38bdf8">${poleFeat.properties.provenance}</b></div>
            </div>
          </div>
        `;

        marker.bindPopup(polePopupHtml, { maxWidth: 280, autoPan: false, closeButton: true });

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
              },
            });
          }
        });

        poles.addLayer(marker);
      });
    }

    // E. Render Central DTR Beacon (respecting showDTRLayer attribute toggle)
    if (showDTRLayer) {
      const isDTRSelected = selectedAsset?.code === dtr.code;
      const dtrIcon = L.divIcon({
        className: 'cluster-dtr-center-icon',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; cursor: pointer;">
            <div style="position: absolute; width: 46px; height: 46px; border-radius: 50%; background: rgba(236, 72, 153, ${
              isDTRSelected ? '0.6' : '0.4'
            }); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 26px; height: 26px; border-radius: 50%; background: #ec4899; border: 3.5px solid ${
              isDTRSelected ? '#38bdf8' : '#ffffff'
            }; box-shadow: 0 0 20px #ec4899; display: flex; align-items: center; justify-content: center; z-index: 10;">
              <div style="width: 7px; height: 7px; border-radius: 50%; background: #ffffff;"></div>
            </div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });

      const dtrMarker = L.marker([dtrLat, dtrLon], { icon: dtrIcon });

      const dtrPopupHtml = `
        <div style="font-family: ui-monospace, monospace; padding: 10px 12px; width: 260px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
          <div style="font-size: 10px; font-weight: 700; color: #ec4899; text-transform: uppercase; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
            Distribution Transformer (Center)
          </div>
          <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">${dtr.name || dtr.code}</div>
          <div style="font-size: 10px; color: #cbd5e1; space-y: 2px;">
            <div>Rating: <b>${dtr.properties?.rated_kva || 100} kVA</b></div>
            <div>Loading: <b>${dtr.properties?.loading_pct || 72}%</b></div>
            <div>Primary: 11 kV &bull; Secondary: 415 V Stepdown</div>
            <div>Provenance: <b style="color: #38bdf8">${dtr.provenance}</b></div>
          </div>
        </div>
      `;

      dtrMarker.bindPopup(dtrPopupHtml, { maxWidth: 280, autoPan: false, closeButton: true });

      dtrMarker.on('click', () => {
        if (onSelectAsset) {
          onSelectAsset(dtr);
        }
      });

      dtrGroup.addLayer(dtrMarker);
    }
  }, [
    isOpen,
    dtrCoords?.[0],
    dtrCoords?.[1],
    networkData,
    baseMap,
    showHT,
    showLT,
    showDP,
    showPolesLayer,
    showDTRLayer,
    selectedAsset?.code,
  ]);

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
          ? 'bottom-6 right-[404px] w-[530px] h-[500px] z-[1500]'
          : 'bottom-6 right-6 w-[530px] h-[500px] z-[1500]'
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

      {/* Attribute Selector Toolbar within Zoom Window (with dedicated DP Structure selector) */}
      <div className="px-4 py-2 bg-slate-950/75 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          <span className="text-slate-500 uppercase text-[9px] mr-1">Attribute Selectors:</span>
          {/* DP Structure Attribute Selector Button */}
          <button
            onClick={() => setShowDP(!showDP)}
            className={`px-2 py-0.5 rounded transition-all flex items-center space-x-1.5 ${
              showDP
                ? 'bg-orange-500/25 text-orange-200 border border-orange-500/60 shadow-sm'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle 11 kV DP (Double-Pole) Transformer Gantry Structure"
          >
            <span className="w-2 h-2 rounded-xs bg-orange-500 inline-block border border-orange-300" />
            <span className="font-bold">⚡ DP Structure ({dpCount})</span>
          </button>

          <button
            onClick={() => setShowPolesLayer(!showPolesLayer)}
            className={`px-2 py-0.5 rounded transition-all flex items-center space-x-1.5 ${
              showPolesLayer
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle Distribution Support Poles"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Poles ({stdPolesCount})</span>
          </button>

          <button
            onClick={() => setShowHT(!showHT)}
            className={`px-2 py-0.5 rounded transition-all flex items-center space-x-1.5 ${
              showHT
                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle 11 kV HT Incomer Lines"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>11kV HT</span>
          </button>

          <button
            onClick={() => setShowLT(!showLT)}
            className={`px-2 py-0.5 rounded transition-all flex items-center space-x-1.5 ${
              showLT
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle 415 V LT Circuit Lines"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>415V LT</span>
          </button>

          <button
            onClick={() => setShowDTRLayer(!showDTRLayer)}
            className={`px-2 py-0.5 rounded transition-all flex items-center space-x-1.5 ${
              showDTRLayer
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                : 'text-slate-500 hover:text-slate-400 bg-slate-900 border border-slate-800'
            }`}
            title="Toggle Central DTR Station"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
            <span>DTR Center</span>
          </button>
        </div>
        <div className="text-[10px] text-slate-400">
          Selected: <b className="text-cyan-300">{selectedAsset?.name || selectedAsset?.code || 'None'}</b>
        </div>
      </div>

      {/* Interactive High-Res Mini-Map Canvas */}
      <div className="flex-1 relative w-full h-full bg-slate-950">
        <div ref={mapContainerRef} className="w-full h-full" />
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
          <span className="text-slate-400">Mount:</span>
          <span className="text-orange-400 font-semibold">11 kV DP Gantry (PSC 9m)</span>
        </div>
        <div className="text-[10px] text-slate-400 flex items-center space-x-1">
          <Info className="w-3 h-3 text-cyan-400" />
          <span>Click DP structure or lines to inspect attributes</span>
        </div>
      </div>
    </div>
  );
};
