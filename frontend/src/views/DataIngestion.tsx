import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  Database,
  Activity,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  ShieldCheck,
  Layers,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useGridContext } from '../context/GridContext';

interface IngestionSummary {
  status: string;
  counts: {
    substations: number;
    feeders: number;
    buses: number;
    lines: number;
    distribution_transformers: number;
    switches: number;
    consumers: number;
    load_snapshots: number;
    load_measurements: number;
    weather_observations: number;
    topology_versions: number;
  };
  latest_topology_hash: string | null;
  latest_snapshot_timestamp: string | null;
}

interface IngestionReport {
  success: boolean;
  topology_version_id?: string;
  version_tag?: string;
  network_hash?: string;
  validation_report?: {
    total_rows: number;
    rows_accepted: number;
    rows_rejected: number;
    rejection_reasons: Array<{
      row_index: number;
      entity_type: string;
      reason: string;
      error_code: string;
    }>;
    warnings: string[];
    summary_counts: Record<string, number>;
  };
  created_counts?: Record<string, number>;
}

interface ScadaReport {
  success: boolean;
  dataset_hash: string;
  total_records: number;
  snapshots_created: number;
  measurements_created: number;
  weather_created: number;
  records_rejected: number;
  time_range_start?: string;
  time_range_end?: string;
  rejection_reasons?: Array<{
    row_index: number;
    record_type: string;
    reason: string;
    error_code: string;
  }>;
}

export const DataIngestion: React.FC = () => {
  const { refreshGridContext, setActiveTab } = useGridContext();
  const [activeSubTab, setActiveSubTab] = useState<'network' | 'scada'>('network');
  const [summary, setSummary] = useState<IngestionSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  // Network Ingestion State
  const [networkFile, setNetworkFile] = useState<File | null>(null);
  const [versionTag, setVersionTag] = useState<string>('');
  const [isUploadingNetwork, setIsUploadingNetwork] = useState<boolean>(false);
  const [networkReport, setNetworkReport] = useState<IngestionReport | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // SCADA Ingestion State
  const [scadaFile, setScadaFile] = useState<File | null>(null);
  const [isUploadingScada, setIsUploadingScada] = useState<boolean>(false);
  const [scadaReport, setScadaReport] = useState<ScadaReport | null>(null);
  const [scadaError, setScadaError] = useState<string | null>(null);

  // Seed Demo State
  const [isSeedingDemo, setIsSeedingDemo] = useState<boolean>(false);
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/v1/ingest/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Failed to fetch ingestion summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleNetworkUpload = async () => {
    if (!networkFile) return;
    setIsUploadingNetwork(true);
    setNetworkError(null);
    setNetworkReport(null);

    try {
      const filename = networkFile.name.toLowerCase();
      let endpoint = '/api/v1/ingest/upload-geojson';
      if (filename.endsWith('.zip')) {
        endpoint = `/api/v1/ingest/upload-gdb?filename=${encodeURIComponent(networkFile.name)}${versionTag ? `&version_tag=${encodeURIComponent(versionTag)}` : ''}`;
      } else if (filename.endsWith('.csv')) {
        endpoint = `/api/v1/ingest/upload-csv?filename=${encodeURIComponent(networkFile.name)}${versionTag ? `&version_tag=${encodeURIComponent(versionTag)}` : ''}`;
      } else {
        endpoint = `/api/v1/ingest/upload-geojson${versionTag ? `?version_tag=${encodeURIComponent(versionTag)}` : ''}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: networkFile,
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errPayload.detail || 'Ingestion failed');
      }

      const data = await res.json();
      setNetworkReport(data);
      await fetchSummary();
      await refreshGridContext();
    } catch (err: any) {
      setNetworkError(err.message || 'Error occurred during network ingestion');
    } finally {
      setIsUploadingNetwork(false);
    }
  };

  const handleScadaUpload = async () => {
    if (!scadaFile) return;
    setIsUploadingScada(true);
    setScadaError(null);
    setScadaReport(null);

    try {
      const res = await fetch(`/api/v1/ingest/scada/upload?filename=${encodeURIComponent(scadaFile.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: scadaFile,
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errPayload.detail || 'SCADA upload failed');
      }

      const data = await res.json();
      setScadaReport(data);
      await fetchSummary();
    } catch (err: any) {
      setScadaError(err.message || 'Error occurred during SCADA ingestion');
    } finally {
      setIsUploadingScada(false);
    }
  };

  const handleSeedDemo = async () => {
    setIsSeedingDemo(true);
    setSeedSuccess(null);
    try {
      const res = await fetch('/api/v1/ingest/seed-demo', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Demo seed failed');
      }
      const data = await res.json();
      setSeedSuccess(data.message || 'Pre-packaged demo network & SCADA seeded successfully!');
      await fetchSummary();
      await refreshGridContext();
    } catch (err: any) {
      alert(`Seed failed: ${err.message}`);
    } finally {
      setIsSeedingDemo(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Advisory Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono uppercase tracking-widest text-blue-400 bg-blue-950/80 px-2.5 py-0.5 rounded border border-blue-800">
                Data Ingestion Layer
              </span>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                TR-SEC-02 Cryptographic Audit
              </span>
              <span className="text-xs font-mono text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800">
                A4 Provenance Tracking
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1 flex items-center space-x-2">
              <UploadCloud className="w-5 h-5 text-blue-400" />
              <span>Network Topology & SCADA Telemetry Hub</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Declarative ingestion pipeline for electric distribution utilities. Ingest ESRI File Geodatabase archives (.gdb.zip),
              GeoJSON electrical topologies, CSV asset registries, and real-time SCADA / AMI smart meter timeseries.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSeedDemo}
              disabled={isSeedingDemo}
              className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSeedingDemo ? 'animate-spin' : ''}`} />
              <span>{isSeedingDemo ? 'Seeding Demo Twin...' : 'Quick Seed Demo Grid & SCADA'}</span>
            </button>
            <button
              onClick={fetchSummary}
              disabled={loadingSummary}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700 cursor-pointer"
              title="Refresh Registry Status"
            >
              <RefreshCw className={`w-4 h-4 ${loadingSummary ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {seedSuccess && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-700 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{seedSuccess}</span>
            </div>
            <button
              onClick={() => setActiveTab('map')}
              className="flex items-center space-x-1 text-emerald-200 hover:text-white underline font-medium cursor-pointer"
            >
              <span>View in Map Canvas</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Telemetry & Registry Live State Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
            <Layers className="w-3 h-3 text-blue-400" />
            <span>Feeders / Sub</span>
          </div>
          <div className="text-lg font-bold text-white mt-1">
            {summary ? `${summary.counts.feeders} / ${summary.counts.substations}` : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            <span>Buses / Lines</span>
          </div>
          <div className="text-lg font-bold text-white mt-1">
            {summary ? `${summary.counts.buses} / ${summary.counts.lines}` : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
            <Database className="w-3 h-3 text-amber-400" />
            <span>DTRs / Switches</span>
          </div>
          <div className="text-lg font-bold text-white mt-1">
            {summary ? `${summary.counts.distribution_transformers} / ${summary.counts.switches}` : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>SCADA Snapshots</span>
          </div>
          <div className="text-lg font-bold text-emerald-400 mt-1">
            {summary?.counts.load_snapshots ?? '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-purple-400" />
            <span>DTR Measurements</span>
          </div>
          <div className="text-lg font-bold text-purple-300 mt-1">
            {summary?.counts.load_measurements ?? '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-teal-400" />
            <span>Topology Versions</span>
          </div>
          <div className="text-lg font-bold text-teal-400 mt-1">
            {summary?.counts.topology_versions ?? '...'}
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex border-b border-slate-800 space-x-4 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('network')}
          className={`pb-2.5 flex items-center space-x-2 transition border-b-2 cursor-pointer ${
            activeSubTab === 'network'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileArchive className="w-4 h-4" />
          <span>1. Network GIS & Topology Ingestion</span>
        </button>

        <button
          onClick={() => setActiveSubTab('scada')}
          className={`pb-2.5 flex items-center space-x-2 transition border-b-2 cursor-pointer ${
            activeSubTab === 'scada'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>2. SCADA & AMR Telemetry Ingestion</span>
        </button>
      </div>

      {/* TAB 1: Network GIS Ingestion */}
      {activeSubTab === 'network' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Upload Network Topology Dataset</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Supported formats: <strong>.zip</strong> (File Geodatabase containing .gdb folder), <strong>.geojson</strong>, <strong>.json</strong>, or <strong>.csv</strong>.
                </p>
              </div>

              {/* Template Download Pills */}
              <div className="flex items-center space-x-2">
                <a
                  href="/api/v1/ingest/templates/geojson"
                  download="sample_feeder.geojson"
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 flex items-center space-x-1.5 transition"
                >
                  <Download className="w-3 h-3 text-cyan-400" />
                  <span>GeoJSON Template</span>
                </a>
                <a
                  href="/api/v1/ingest/templates/csv_assets"
                  download="asset_registry_template.csv"
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 flex items-center space-x-1.5 transition"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  <span>CSV Template</span>
                </a>
              </div>
            </div>

            {/* Drop / File Input Zone */}
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-8 text-center bg-slate-950/50 transition">
              <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <label className="block text-xs font-semibold text-slate-200 cursor-pointer mb-1">
                Choose a network file or drag & drop here
                <input
                  type="file"
                  accept=".zip,.geojson,.json,.csv"
                  onChange={(e) => setNetworkFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-slate-500 font-mono">
                {networkFile ? `Selected: ${networkFile.name} (${(networkFile.size / 1024).toFixed(1)} KB)` : 'ESRI FileGDB .zip, GeoJSON FeatureCollection, or CSV registry'}
              </p>
            </div>

            {/* Version Tag & Ingest Button */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="text"
                placeholder="Version Tag (e.g. v2026_q4_field_survey)"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono flex-1"
              />
              <button
                onClick={handleNetworkUpload}
                disabled={!networkFile || isUploadingNetwork}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isUploadingNetwork ? 'Ingesting Dataset...' : 'Ingest to Digital Twin'}</span>
              </button>
            </div>

            {networkError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{networkError}</span>
              </div>
            )}

            {networkReport && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Ingestion Successful</span>
                  </div>
                  {networkReport.network_hash && (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                      SHA-256: {networkReport.network_hash.slice(0, 16)}...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">Total Rows:</span>
                    <span className="font-bold text-white">{networkReport.validation_report?.total_rows ?? 0}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">Accepted:</span>
                    <span className="font-bold text-emerald-400">{networkReport.validation_report?.rows_accepted ?? 0}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">Rejected:</span>
                    <span className="font-bold text-rose-400">{networkReport.validation_report?.rows_rejected ?? 0}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">Version:</span>
                    <span className="font-bold text-cyan-400">{networkReport.version_tag || 'v_latest'}</span>
                  </div>
                </div>

                {networkReport.created_counts && (
                  <div className="text-[11px] font-mono text-slate-300">
                    <span className="text-slate-400">Created Assets: </span>
                    {Object.entries(networkReport.created_counts).map(([k, v]) => (
                      <span key={k} className="inline-block mr-3">
                        {k}: <strong className="text-white">{v}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SCADA & Real-Time Telemetry Ingestion */}
      {activeSubTab === 'scada' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Upload SCADA & Smart Meter Telemetry</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ingest 15-minute or hourly feeder telemetry (MW, Mvar, bus voltage), DTR smart meter logs (kW, current, voltage), and ambient weather observations.
                </p>
              </div>

              {/* Template Download */}
              <a
                href="/api/v1/ingest/templates/scada_csv"
                download="scada_telemetry_template.csv"
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 flex items-center space-x-1.5 transition shrink-0"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                <span>SCADA CSV Template</span>
              </a>
            </div>

            {/* Drop / File Input Zone */}
            <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-8 text-center bg-slate-950/50 transition">
              <Activity className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <label className="block text-xs font-semibold text-slate-200 cursor-pointer mb-1">
                Choose SCADA operational timeseries log (.csv or .json)
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={(e) => setScadaFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-slate-500 font-mono">
                {scadaFile ? `Selected: ${scadaFile.name} (${(scadaFile.size / 1024).toFixed(1)} KB)` : 'Standard utility SCADA / AMI timeseries CSV with timestamp, total_p_mw, and dtr_code'}
              </p>
            </div>

            <button
              onClick={handleScadaUpload}
              disabled={!scadaFile || isUploadingScada}
              className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow transition-all cursor-pointer flex items-center justify-center space-x-2"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{isUploadingScada ? 'Processing Telemetry...' : 'Ingest SCADA Telemetry'}</span>
            </button>

            {scadaError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{scadaError}</span>
              </div>
            )}

            {scadaReport && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">SCADA Telemetry Stored Successfully</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    Audit SHA: {scadaReport.dataset_hash.slice(0, 16)}...
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">Feeder Snapshots:</span>
                    <span className="font-bold text-emerald-400">{scadaReport.snapshots_created}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">DTR Measurements:</span>
                    <span className="font-bold text-cyan-400">{scadaReport.measurements_created}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">Weather Observations:</span>
                    <span className="font-bold text-amber-400">{scadaReport.weather_created}</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-slate-400 block text-[10px]">Records Rejected:</span>
                    <span className="font-bold text-rose-400">{scadaReport.records_rejected}</span>
                  </div>
                </div>

                {scadaReport.time_range_start && (
                  <div className="text-[11px] font-mono text-slate-400">
                    Timeseries Range: <strong className="text-slate-200">{scadaReport.time_range_start}</strong> &rarr; <strong className="text-slate-200">{scadaReport.time_range_end}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default DataIngestion;
