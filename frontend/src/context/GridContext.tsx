import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface DiurnalProfileContext {
  ambient_min_c: number;
  ambient_max_c: number;
  ambient_swing_c: number;
  ambient_label: string;
  peak_hours_desc: string;
  is_ag_shift_dominant: boolean;
  default_consumer_mix: Record<string, number>;
  overload_driver_template: string;
}

export interface GridContextResponse {
  utility_name: string;
  utility_short: string;
  regulatory_body: string;
  regulatory_band: string;
  supply_code_standard: string;
  state: string;
  district: string;
  town?: string;
  feeder_code: string;
  feeder_name: string;
  substation_code: string;
  substation_name: string;
  field_crew_default: string;
  climate_archetype: string;
  diurnal_profile: DiurnalProfileContext;
  centroid_coordinates: {
    latitude: number;
    longitude: number;
  };
}

export type TabType = 'overview' | 'map' | 'switching' | 'capex' | 'scenarios';

interface GridContextType {
  gridContext: GridContextResponse | null;
  loading: boolean;
  error: string | null;
  feederCode: string;
  setFeederCode: (code: string) => void;
  refreshGridContext: (code?: string) => Promise<void>;
  targetAssetCode: string | null;
  setTargetAssetCode: (code: string | null) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  navigateToAsset: (code: string, targetFeeder?: string) => void;
}

const fallbackGridContext: GridContextResponse = {
  utility_name: 'Kerala State Electricity Board (KSEB)',
  utility_short: 'KSEB',
  regulatory_body: 'KSERC',
  regulatory_band: 'KSERC ±6%',
  supply_code_standard: 'KSERC Distribution Code 2014',
  state: 'Kerala',
  district: 'Kozhikode',
  town: 'KOZHIKODE',
  feeder_code: '2011951',
  feeder_name: 'Puthiya Kadavu',
  substation_code: 'SS_PUTHIYA_KADAVU',
  substation_name: 'Puthiya Kadavu 33/11 kV Substation',
  field_crew_default: 'Kozhikode Puthiya Kadavu Field Crew #1',
  climate_archetype: 'coastal_maritime',
  diurnal_profile: {
    ambient_min_c: 24.5,
    ambient_max_c: 33.5,
    ambient_swing_c: 4.5,
    ambient_label: 'Kerala Coastal (25°C - 34°C)',
    peak_hours_desc: 'Domestic Evening Peak (18:00 - 22:00) & Harbour Commercial Shift',
    is_ag_shift_dominant: false,
    default_consumer_mix: { domestic: 62.0, commercial: 24.0, industrial: 10.0, agricultural: 4.0 },
    overload_driver_template: 'KSEB Coastal Evening Lighting & Cooling Peak (18:00-22:00) + Harbour Demand',
  },
  centroid_coordinates: {
    latitude: 11.270065,
    longitude: 75.765743,
  },
};

const GridContext = createContext<GridContextType>({
  gridContext: fallbackGridContext,
  loading: false,
  error: null,
  feederCode: '2011951',
  setFeederCode: () => {},
  refreshGridContext: async () => {},
  targetAssetCode: null,
  setTargetAssetCode: () => {},
  activeTab: 'map',
  setActiveTab: () => {},
  navigateToAsset: () => {},
});

export const GridContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [feederCode, setFeederCode] = useState<string>('2011951');
  const [gridContext, setGridContext] = useState<GridContextResponse>(fallbackGridContext);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [targetAssetCode, setTargetAssetCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const rawHash = window.location.hash.replace('#', '').split('?')[0];
    if (['overview', 'map', 'switching', 'capex', 'scenarios'].includes(rawHash)) {
      return rawHash as any;
    }
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['overview', 'map', 'switching', 'capex', 'scenarios'].includes(tabParam)) {
      return tabParam as any;
    }
    return 'map';
  });

  const navigateToAsset = (code: string, targetFeeder?: string) => {
    if (!code) return;
    if (targetFeeder && targetFeeder !== feederCode) {
      setFeederCode(targetFeeder);
    }
    setTargetAssetCode(code);
    setActiveTab('map');
    window.location.hash = `#map?asset=${encodeURIComponent(code)}`;
  };

  const fetchContext = async (targetCode?: string) => {
    const code = targetCode || feederCode;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/network/grid-context?feeder_code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data: GridContextResponse = await res.json();
        setGridContext(data);
      } else {
        console.warn(`Grid context fetch returned HTTP ${res.status}, keeping current profile`);
      }
    } catch (err: any) {
      console.warn('Grid context fetch error:', err);
      setError(err?.message || 'Failed to fetch grid context');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContext(feederCode);
  }, [feederCode]);

  return (
    <GridContext.Provider
      value={{
        gridContext,
        loading,
        error,
        feederCode,
        setFeederCode,
        refreshGridContext: fetchContext,
        targetAssetCode,
        setTargetAssetCode,
        activeTab,
        setActiveTab,
        navigateToAsset,
      }}
    >
      {children}
    </GridContext.Provider>
  );
};

export const useGridContext = (): GridContextType => {
  return useContext(GridContext);
};
