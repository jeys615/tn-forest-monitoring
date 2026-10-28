import React, { useState, useEffect } from 'react';
import { apiClient, getStoredToken } from '../../config/api';
import {
  type OfflineSatelliteSensor,
  type OfflinePipelineType,
  type OfflineRasterMetadata,
  type OfflineChangeDetectionResult,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';

interface LocalRasterItem {
  filename: string;
  relativePath: string;
  sizeBytes: number;
  detectedSensor: OfflineSatelliteSensor;
}

const AuthenticatedImage: React.FC<{
  src?: string;
  alt: string;
  style?: React.CSSProperties;
}> = ({ src, alt, style }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      return;
    }
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setBlobUrl(src);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);

    apiClient
      .get(src, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load authenticated image artifact:', src, err);
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div style={{ padding: '36px', color: '#94A3B8', fontSize: '13px' }}>
        ⏳ Loading imagery artifact...
      </div>
    );
  }

  if (error || !blobUrl) {
    const token = getStoredToken();
    const fallbackUrl = src && token ? `${src}${src.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : src;
    return (
      <img
        src={fallbackUrl}
        alt={alt}
        style={style}
        onError={() => setError(true)}
      />
    );
  }

  return <img src={blobUrl} alt={alt} style={style} />;
};

export const OfflineChangeDetectionPage: React.FC = () => {
  // ─── State ────────────────────────────────────────────────────────
  const [localCatalog, setLocalCatalog] = useState<LocalRasterItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Baseline Selection
  const [baselinePath, setBaselinePath] = useState<string>('');
  const [baselineSensor, setBaselineSensor] = useState<OfflineSatelliteSensor>('Sentinel-2');
  const [baselineDate, setBaselineDate] = useState<string>('');
  const [baselineMeta, setBaselineMeta] = useState<OfflineRasterMetadata | null>(null);
  const [inspectingBaseline, setInspectingBaseline] = useState(false);

  // Observation Selection
  const [observationPath, setObservationPath] = useState<string>('');
  const [observationSensor, setObservationSensor] = useState<OfflineSatelliteSensor>('Sentinel-2');
  const [observationDate, setObservationDate] = useState<string>('');
  const [observationMeta, setObservationMeta] = useState<OfflineRasterMetadata | null>(null);
  const [inspectingObservation, setInspectingObservation] = useState(false);

  // Processing Parameters
  const [vegThreshold, setVegThreshold] = useState<number>(0.15);
  const [soilThreshold, setSoilThreshold] = useState<number>(0.12);
  const [maskClouds, setMaskClouds] = useState<boolean>(true);

  // Execution & Results
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [result, setResult] = useState<OfflineChangeDetectionResult | null>(null);

  // View Controls
  const [activeTab, setActiveTab] = useState<'CHANGE_MAP' | 'SIDE_BY_SIDE' | 'SLIDER' | 'CLOUD_MASK'>('CHANGE_MAP');
  const [sliderPosition, setSliderPosition] = useState<number>(50);

  // ─── Load Local Catalog on Mount ──────────────────────────────────
  useEffect(() => {
    fetchLocalCatalog();
  }, []);

  const fetchLocalCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const res = await apiClient.get('/offline-change-detection/local-catalog');
      if (res.data.success && Array.isArray(res.data.data)) {
        setLocalCatalog(res.data.data);
      }
    } catch (err) {
      console.warn('Could not load local raster catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  };

  // ─── Inspect Selected Baseline ─────────────────────────────────────
  const inspectRasterPath = async (
    path: string,
    isBaseline: boolean,
  ) => {
    if (isBaseline) setInspectingBaseline(true);
    else setInspectingObservation(true);

    try {
      const res = await apiClient.post('/offline-change-detection/inspect', { filePath: path });
      if (res.data.success) {
        const meta = res.data.data as OfflineRasterMetadata;
        if (isBaseline) {
          setBaselineMeta(meta);
          setBaselineSensor(meta.detectedSensor);
        } else {
          setObservationMeta(meta);
          setObservationSensor(meta.detectedSensor);
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Inspection failed';
      setUploadError(msg);
      alert(`Inspection failed: ${msg}`);
    } finally {
      if (isBaseline) setInspectingBaseline(false);
      else setInspectingObservation(false);
    }
  };

  // ─── Handle File Upload via Multipart FormData ────────────────────
  const handleFileUpload = async (file: File, isBaseline: boolean) => {
    setUploadError(null);
    const originalName = file.name;

    // Client-side format & size checks
    const lowerName = originalName.toLowerCase();
    if (!lowerName.endsWith('.tif') && !lowerName.endsWith('.tiff')) {
      const msg = `"${originalName}" is not a recognized GeoTIFF raster. Please upload a .tif or .tiff file.`;
      setUploadError(msg);
      alert(`Upload failed: ${msg}`);
      return;
    }

    if (file.size === 0) {
      const msg = `Selected file "${originalName}" is empty (0 bytes).`;
      setUploadError(msg);
      alert(`Upload failed: ${msg}`);
      return;
    }

    const MAX_SIZE = 200 * 1024 * 1024; // 200 MB
    if (file.size > MAX_SIZE) {
      const msg = `Selected file "${originalName}" (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds maximum upload limit of 200 MB.`;
      setUploadError(msg);
      alert(`Upload failed: ${msg}`);
      return;
    }

    try {
      if (isBaseline) setInspectingBaseline(true);
      else setInspectingObservation(true);

      // Package file into standard multipart FormData
      const formData = new FormData();
      formData.append('file', file);

      // Include authentication credentials from local storage
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Note: We deliberately do NOT set 'Content-Type' header here
      // so the browser sets 'multipart/form-data; boundary=...' automatically.

      const res = await fetch('/api/offline-change-detection/upload', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        let errorDetails = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errorDetails = errData.message || errorDetails;
        } catch {
          const txt = await res.text().catch(() => '');
          if (txt) errorDetails = txt;
        }

        if (res.status === 401) {
          throw new Error('Authentication session expired or missing token. Please log in.');
        } else if (res.status === 403) {
          throw new Error('Permission denied: Account lacks MONITORING_READ permission.');
        } else if (res.status === 413) {
          throw new Error(`File too large: ${errorDetails}`);
        } else if (res.status === 400) {
          throw new Error(`Invalid GeoTIFF file: ${errorDetails}`);
        } else {
          throw new Error(`Upload failed (${res.status}): ${errorDetails}`);
        }
      }

      const data = await res.json();
      if (data.success && data.data?.filePath) {
        if (isBaseline) {
          setBaselinePath(data.data.filePath);
          await inspectRasterPath(data.data.filePath, true);
        } else {
          setObservationPath(data.data.filePath);
          await inspectRasterPath(data.data.filePath, false);
        }
      } else {
        throw new Error(data.message || 'Server did not return a valid raster path.');
      }
    } catch (err: any) {
      let friendlyMsg = err?.message || 'Unknown upload failure';
      if (err.name === 'TypeError' && (err.message.includes('fetch') || err.message.includes('NetworkError'))) {
        friendlyMsg = 'Cannot connect to backend server. Please verify network connectivity and server status.';
      }
      setUploadError(friendlyMsg);
      alert(`Upload failed: ${friendlyMsg}`);
    } finally {
      if (isBaseline) setInspectingBaseline(false);
      else setInspectingObservation(false);
    }
  };

  // ─── Quick Select from Local Catalog ──────────────────────────────
  const handleSelectFromCatalog = async (relPath: string, isBaseline: boolean) => {
    if (isBaseline) {
      setBaselinePath(relPath);
      await inspectRasterPath(relPath, true);
    } else {
      setObservationPath(relPath);
      await inspectRasterPath(relPath, false);
    }
  };

  // ─── Execute Change Detection ─────────────────────────────────────
  const handleRunProcessing = async () => {
    if (!baselinePath || !observationPath) {
      alert('Please select both a Baseline image and an Observation image before processing.');
      return;
    }

    setIsProcessing(true);
    setProcessingError(null);

    try {
      const res = await apiClient.post('/offline-change-detection/process', {
        baselinePath,
        observationPath,
        baselineSensor,
        observationSensor,
        baselineDate,
        observationDate,
        vegetationThreshold: vegThreshold,
        soilThreshold,
        maskClouds,
      });

      if (res.data.success) {
        setResult(res.data.data);
      }
    } catch (err: any) {
      setProcessingError(err?.response?.data?.message || err.message || 'Change detection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const detectedPipeline: OfflinePipelineType =
    (baselineSensor === 'Sentinel-2' && observationSensor === 'Sentinel-2') ||
    (baselineSensor.startsWith('Landsat') && observationSensor.startsWith('Landsat'))
      ? 'SAME_SENSOR'
      : 'CROSS_SENSOR';

  const handleDownloadArtifact = async (url: string, defaultName: string) => {
    try {
      const res = await apiClient.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(`Download failed: ${err?.message || 'Error fetching artifact'}`);
    }
  };

  return (
    <div style={{ padding: SPACE.lg, maxWidth: '1440px', margin: '0 auto', fontFamily: FONT.family }}>
      {/* ─── Top Header & Offline Security Badge ─── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.md,
          marginBottom: SPACE.xl,
          padding: `${SPACE.md} ${SPACE.lg}`,
          backgroundColor: '#071611',
          borderRadius: RADII.lg,
          border: '1px solid #1B4332',
          boxShadow: SHADOWS.md,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>🛰️</span>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#F8FAFC' }}>
              Offline Satellite Image Change Detection
            </h1>
            <span
              style={{
                backgroundColor: '#1B4332',
                color: '#52B788',
                border: '1px solid #2D6A4F',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '12px',
                letterSpacing: '0.04em',
              }}
            >
              100% OFFLINE LOCAL
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94A3B8' }}>
            Local multispectral change detection • Zero cloud upload • Sentinel-2 & Landsat same/cross-sensor pipelines
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <button
            onClick={fetchLocalCatalog}
            disabled={loadingCatalog}
            style={{
              padding: '6px 14px',
              backgroundColor: '#1E293B',
              color: '#E2E8F0',
              border: '1px solid #334155',
              borderRadius: RADII.md,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {loadingCatalog ? 'Scanning...' : '🔄 Scan Local Rasters'}
          </button>
        </div>
      </div>

      {/* ─── Upload Error Alert Banner ─── */}
      {uploadError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.md,
            marginBottom: SPACE.lg,
            padding: `${SPACE.sm} ${SPACE.md}`,
            backgroundColor: '#450A0A',
            border: '1px solid #DC2626',
            borderRadius: RADII.md,
            color: '#FEE2E2',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span>{uploadError}</span>
          </div>
          <button
            onClick={() => setUploadError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FCA5A5',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '2px 6px',
              lineHeight: 1,
            }}
            title="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Dual Image Selection Row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: SPACE.lg, marginBottom: SPACE.xl }}>
        {/* Baseline Card */}
        <div
          style={{
            backgroundColor: '#0D1F18',
            borderRadius: RADII.lg,
            border: '1px solid #2D6A4F',
            padding: SPACE.lg,
            color: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ backgroundColor: '#2D6A4F', color: '#D8F3DC', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>T₀</span>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Baseline / Earlier Image</h2>
            </div>
            {inspectingBaseline && <span style={{ fontSize: '11px', color: '#52B788' }}>Inspecting raster...</span>}
          </div>

          {/* Catalog Dropdown */}
          <div style={{ marginBottom: SPACE.sm }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>
              Select from Local Disk Catalog:
            </label>
            <select
              value={baselinePath}
              onChange={(e) => handleSelectFromCatalog(e.target.value, true)}
              style={{
                width: '100%',
                padding: '8px 10px',
                backgroundColor: '#081410',
                border: '1px solid #1B4332',
                borderRadius: RADII.md,
                color: '#F8FAFC',
                fontSize: '12px',
              }}
            >
              <option value="">-- Choose local raster or upload below --</option>
              {localCatalog.map((item, idx) => (
                <option key={idx} value={item.relativePath}>
                  {item.filename} ({(item.sizeBytes / 1024 / 1024).toFixed(1)} MB - {item.detectedSensor})
                </option>
              ))}
            </select>
          </div>

          {/* Local File Browser Upload */}
          <div style={{ marginBottom: SPACE.sm }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>
              Or Browse Local File (GeoTIFF):
            </label>
            <input
              type="file"
              accept=".tif,.tiff"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0], true);
                }
              }}
              style={{
                width: '100%',
                fontSize: '12px',
                color: '#94A3B8',
              }}
            />
          </div>

          {/* Sensor & Date Override */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm, marginBottom: SPACE.sm }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>Sensor Family:</label>
              <select
                value={baselineSensor}
                onChange={(e) => setBaselineSensor(e.target.value as OfflineSatelliteSensor)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#081410',
                  border: '1px solid #1B4332',
                  borderRadius: RADII.sm,
                  color: '#F8FAFC',
                  fontSize: '12px',
                }}
              >
                <option value="Sentinel-2">Sentinel-2 (MSI)</option>
                <option value="Landsat-8">Landsat 8 (OLI)</option>
                <option value="Landsat-9">Landsat 9 (OLI-2)</option>
                <option value="Landsat-7">Landsat 7 (ETM+)</option>
                <option value="Landsat-5">Landsat 5 (TM)</option>
                <option value="Generic-Optical">Generic Optical</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>Acquisition Date:</label>
              <input
                type="date"
                value={baselineDate}
                onChange={(e) => setBaselineDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#081410',
                  border: '1px solid #1B4332',
                  borderRadius: RADII.sm,
                  color: '#F8FAFC',
                  fontSize: '12px',
                }}
              />
            </div>
          </div>

          {/* Metadata Display */}
          {baselineMeta && (
            <div
              style={{
                marginTop: SPACE.sm,
                padding: '8px 12px',
                backgroundColor: '#081410',
                borderRadius: RADII.md,
                fontSize: '11px',
                color: '#CBD5E1',
                border: '1px solid #1E293B',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <div><strong>Grid:</strong> {baselineMeta.width} × {baselineMeta.height} px</div>
                <div><strong>Bands:</strong> {baselineMeta.numBands} bands</div>
                <div><strong>CRS:</strong> {baselineMeta.crs}</div>
                <div><strong>Resolution:</strong> {baselineMeta.pixelSizeX.toFixed(1)}m</div>
              </div>
              {baselineMeta.thumbnailPngBase64 && (
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  <img
                    src={baselineMeta.thumbnailPngBase64}
                    alt="Baseline Preview"
                    style={{ maxHeight: '110px', maxWidth: '100%', borderRadius: '4px', border: '1px solid #334155' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Observation Card */}
        <div
          style={{
            backgroundColor: '#0D1F18',
            borderRadius: RADII.lg,
            border: '1px solid #2D6A4F',
            padding: SPACE.lg,
            color: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ backgroundColor: '#52B788', color: '#081410', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>T₁</span>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Observation / Later Image</h2>
            </div>
            {inspectingObservation && <span style={{ fontSize: '11px', color: '#52B788' }}>Inspecting raster...</span>}
          </div>

          {/* Catalog Dropdown */}
          <div style={{ marginBottom: SPACE.sm }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>
              Select from Local Disk Catalog:
            </label>
            <select
              value={observationPath}
              onChange={(e) => handleSelectFromCatalog(e.target.value, false)}
              style={{
                width: '100%',
                padding: '8px 10px',
                backgroundColor: '#081410',
                border: '1px solid #1B4332',
                borderRadius: RADII.md,
                color: '#F8FAFC',
                fontSize: '12px',
              }}
            >
              <option value="">-- Choose local raster or upload below --</option>
              {localCatalog.map((item, idx) => (
                <option key={idx} value={item.relativePath}>
                  {item.filename} ({(item.sizeBytes / 1024 / 1024).toFixed(1)} MB - {item.detectedSensor})
                </option>
              ))}
            </select>
          </div>

          {/* Local File Browser Upload */}
          <div style={{ marginBottom: SPACE.sm }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>
              Or Browse Local File (GeoTIFF):
            </label>
            <input
              type="file"
              accept=".tif,.tiff"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0], false);
                }
              }}
              style={{
                width: '100%',
                fontSize: '12px',
                color: '#94A3B8',
              }}
            />
          </div>

          {/* Sensor & Date Override */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm, marginBottom: SPACE.sm }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>Sensor Family:</label>
              <select
                value={observationSensor}
                onChange={(e) => setObservationSensor(e.target.value as OfflineSatelliteSensor)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#081410',
                  border: '1px solid #1B4332',
                  borderRadius: RADII.sm,
                  color: '#F8FAFC',
                  fontSize: '12px',
                }}
              >
                <option value="Sentinel-2">Sentinel-2 (MSI)</option>
                <option value="Landsat-8">Landsat 8 (OLI)</option>
                <option value="Landsat-9">Landsat 9 (OLI-2)</option>
                <option value="Landsat-7">Landsat 7 (ETM+)</option>
                <option value="Landsat-5">Landsat 5 (TM)</option>
                <option value="Generic-Optical">Generic Optical</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>Acquisition Date:</label>
              <input
                type="date"
                value={observationDate}
                onChange={(e) => setObservationDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#081410',
                  border: '1px solid #1B4332',
                  borderRadius: RADII.sm,
                  color: '#F8FAFC',
                  fontSize: '12px',
                }}
              />
            </div>
          </div>

          {/* Metadata Display */}
          {observationMeta && (
            <div
              style={{
                marginTop: SPACE.sm,
                padding: '8px 12px',
                backgroundColor: '#081410',
                borderRadius: RADII.md,
                fontSize: '11px',
                color: '#CBD5E1',
                border: '1px solid #1E293B',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <div><strong>Grid:</strong> {observationMeta.width} × {observationMeta.height} px</div>
                <div><strong>Bands:</strong> {observationMeta.numBands} bands</div>
                <div><strong>CRS:</strong> {observationMeta.crs}</div>
                <div><strong>Resolution:</strong> {observationMeta.pixelSizeX.toFixed(1)}m</div>
              </div>
              {observationMeta.thumbnailPngBase64 && (
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  <img
                    src={observationMeta.thumbnailPngBase64}
                    alt="Observation Preview"
                    style={{ maxHeight: '110px', maxWidth: '100%', borderRadius: '4px', border: '1px solid #334155' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Processing Parameters & Execute Bar ─── */}
      <div
        style={{
          backgroundColor: '#0A1A14',
          borderRadius: RADII.lg,
          border: '1px solid #1B4332',
          padding: SPACE.md,
          marginBottom: SPACE.xl,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: SPACE.md,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.lg }}>
          <div>
            <span style={{ fontSize: '11px', color: '#94A3B8', display: 'block' }}>Pipeline:</span>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: detectedPipeline === 'SAME_SENSOR' ? '#1B4332' : '#3B2A10',
                color: detectedPipeline === 'SAME_SENSOR' ? '#52B788' : '#F59E0B',
                border: `1px solid ${detectedPipeline === 'SAME_SENSOR' ? '#2D6A4F' : '#78350F'}`,
              }}
            >
              {detectedPipeline === 'SAME_SENSOR' ? '✓ Same-Sensor Pipeline' : '⚡ Cross-Sensor (Harmonized)'}
            </span>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block' }}>
              Vegetation Threshold (ΔNDVI): <strong>±{vegThreshold.toFixed(2)}</strong>
            </label>
            <input
              type="range"
              min="0.05"
              max="0.40"
              step="0.01"
              value={vegThreshold}
              onChange={(e) => setVegThreshold(parseFloat(e.target.value))}
              style={{ width: '130px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block' }}>
              Bare-Soil Threshold (ΔBSI): <strong>±{soilThreshold.toFixed(2)}</strong>
            </label>
            <input
              type="range"
              min="0.05"
              max="0.35"
              step="0.01"
              value={soilThreshold}
              onChange={(e) => setSoilThreshold(parseFloat(e.target.value))}
              style={{ width: '130px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
            <input
              type="checkbox"
              id="maskClouds"
              checked={maskClouds}
              onChange={(e) => setMaskClouds(e.target.checked)}
            />
            <label htmlFor="maskClouds" style={{ fontSize: '12px', color: '#E2E8F0', cursor: 'pointer' }}>
              Mask Clouds & Shadows (SCL / QA)
            </label>
          </div>
        </div>

        <button
          onClick={handleRunProcessing}
          disabled={isProcessing || !baselinePath || !observationPath}
          style={{
            padding: '10px 24px',
            backgroundColor: isProcessing || !baselinePath || !observationPath ? '#334155' : '#2D6A4F',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: RADII.md,
            fontSize: '13px',
            fontWeight: 700,
            cursor: isProcessing || !baselinePath || !observationPath ? 'not-allowed' : 'pointer',
            boxShadow: SHADOWS.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {isProcessing ? '⚙️ Processing Rasters...' : '▶ Start Change Detection'}
        </button>
      </div>

      {/* Error Message */}
      {processingError && (
        <div
          style={{
            padding: SPACE.md,
            backgroundColor: '#450A0A',
            border: '1px solid #991B1B',
            borderRadius: RADII.md,
            color: '#FCA5A5',
            fontSize: '13px',
            marginBottom: SPACE.lg,
          }}
        >
          <strong>Processing Error:</strong> {processingError}
        </div>
      )}

      {/* ─── Results Dashboard ─── */}
      {result && (
        <div style={{ marginTop: SPACE.lg }}>
          {/* Key Metrics KPI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: SPACE.md, marginBottom: SPACE.lg }}>
            <div style={{ backgroundColor: '#0F172A', padding: SPACE.md, borderRadius: RADII.md, border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>TOTAL MONITORED FOOTPRINT</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#F8FAFC', marginTop: '2px' }}>
                {result.areaSummary.totalFootprintHectares.toFixed(2)} ha
              </div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>{(result.areaSummary.totalFootprintHectares / 100).toFixed(3)} km²</div>
            </div>

            <div style={{ backgroundColor: '#0F172A', padding: SPACE.md, borderRadius: RADII.md, border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>VALID OBSERVABLE AREA</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#52B788', marginTop: '2px' }}>
                {result.areaSummary.validAnalyzedHectares.toFixed(2)} ha
              </div>
              <div style={{ fontSize: '11px', color: '#52B788' }}>{result.areaSummary.validPercentage}% clear</div>
            </div>

            <div style={{ backgroundColor: '#0F172A', padding: SPACE.md, borderRadius: RADII.md, border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>VEGETATION DECREASE</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#E63946', marginTop: '2px' }}>
                {result.areaSummary.categories[0].areaHectares.toFixed(2)} ha
              </div>
              <div style={{ fontSize: '11px', color: '#E63946' }}>{result.areaSummary.categories[0].percentage}% of total</div>
            </div>

            <div style={{ backgroundColor: '#0F172A', padding: SPACE.md, borderRadius: RADII.md, border: '1px solid #1E293B' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>BARE-GROUND EXPANSION</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#E76F51', marginTop: '2px' }}>
                {result.areaSummary.categories[2].areaHectares.toFixed(2)} ha
              </div>
              <div style={{ fontSize: '11px', color: '#E76F51' }}>{result.areaSummary.categories[2].percentage}% of total</div>
            </div>
          </div>

          {/* Interactive GIS Viewer Card */}
          <div
            style={{
              backgroundColor: '#0F172A',
              borderRadius: RADII.lg,
              border: '1px solid #1E293B',
              overflow: 'hidden',
              marginBottom: SPACE.lg,
            }}
          >
            {/* View Mode Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                backgroundColor: '#0B132B',
                borderBottom: '1px solid #1E293B',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('CHANGE_MAP')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'CHANGE_MAP' ? '#2D6A4F' : 'transparent',
                    color: activeTab === 'CHANGE_MAP' ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                  }}
                >
                  🗺️ Change Classification Map
                </button>
                <button
                  onClick={() => setActiveTab('SIDE_BY_SIDE')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'SIDE_BY_SIDE' ? '#2D6A4F' : 'transparent',
                    color: activeTab === 'SIDE_BY_SIDE' ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                  }}
                >
                  🪟 Side-by-Side Comparison
                </button>
                <button
                  onClick={() => setActiveTab('SLIDER')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'SLIDER' ? '#2D6A4F' : 'transparent',
                    color: activeTab === 'SLIDER' ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                  }}
                >
                  ↔️ Curtain Swipe Slider
                </button>
                <button
                  onClick={() => setActiveTab('CLOUD_MASK')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'CLOUD_MASK' ? '#2D6A4F' : 'transparent',
                    color: activeTab === 'CLOUD_MASK' ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                  }}
                >
                  ☁️ Cloud & Quality Mask
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#64748B' }}>
                Job: \`{result.jobId}\` • Grid: {result.commonGrid.width} × {result.commonGrid.height} px
              </div>
            </div>

            {/* Viewer Content Area */}
            <div style={{ padding: SPACE.lg, backgroundColor: '#020617', textAlign: 'center', minHeight: '440px' }}>
              {activeTab === 'CHANGE_MAP' && (
                <div>
                  <AuthenticatedImage
                    src={result.changeMapPreviewUrl}
                    alt="Change Detection Result"
                    style={{ maxHeight: '520px', maxWidth: '100%', borderRadius: RADII.md, border: '1px solid #334155' }}
                  />
                  {/* Categorical Legend */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: '12px',
                      marginTop: SPACE.md,
                      padding: '8px',
                      backgroundColor: '#0F172A',
                      borderRadius: RADII.md,
                    }}
                  >
                    {result.areaSummary.categories.map((c, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#E2E8F0' }}>
                        <span style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: c.colorHex, display: 'inline-block' }} />
                        <span>{c.label}: <strong>{c.areaHectares.toFixed(1)} ha</strong> ({c.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'SIDE_BY_SIDE' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACE.md }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}>
                      Baseline T₀ ({result.baselineMetadata.detectedSensor})
                    </div>
                    <AuthenticatedImage
                      src={result.baselinePreviewUrl}
                      alt="Baseline"
                      style={{ maxHeight: '380px', maxWidth: '100%', borderRadius: '4px', border: '1px solid #334155' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}>
                      Observation T₁ ({result.observationMetadata.detectedSensor})
                    </div>
                    <AuthenticatedImage
                      src={result.observationPreviewUrl}
                      alt="Observation"
                      style={{ maxHeight: '380px', maxWidth: '100%', borderRadius: '4px', border: '1px solid #334155' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}>
                      Categorical Change Map
                    </div>
                    <AuthenticatedImage
                      src={result.changeMapPreviewUrl}
                      alt="Change Map"
                      style={{ maxHeight: '380px', maxWidth: '100%', borderRadius: '4px', border: '1px solid #334155' }}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'SLIDER' && (
                <div style={{ position: 'relative', maxWidth: '640px', margin: '0 auto' }}>
                  <div style={{ position: 'relative', width: '100%', height: '440px', overflow: 'hidden', borderRadius: RADII.md, border: '1px solid #334155' }}>
                    {/* Background (Observation) */}
                    <AuthenticatedImage
                      src={result.observationPreviewUrl}
                      alt="Observation"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    {/* Foreground (Baseline with clip-path) */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        overflow: 'hidden',
                        clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
                      }}
                    >
                      <AuthenticatedImage
                        src={result.baselinePreviewUrl}
                        alt="Baseline"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    </div>
                    {/* Divider line */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${sliderPosition}%`,
                        width: '2px',
                        backgroundColor: '#52B788',
                        boxShadow: '0 0 8px rgba(82, 183, 136, 0.8)',
                      }}
                    />
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sliderPosition}
                      onChange={(e) => setSliderPosition(parseInt(e.target.value, 10))}
                      style={{ width: '80%' }}
                    />
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                      Swipe: <strong>{sliderPosition}%</strong> (Left: Baseline T₀ | Right: Observation T₁)
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'CLOUD_MASK' && (
                <div>
                  <AuthenticatedImage
                    src={result.cloudMaskPreviewUrl}
                    alt="Cloud Mask"
                    style={{ maxHeight: '460px', maxWidth: '100%', borderRadius: RADII.md, border: '1px solid #334155' }}
                  />
                  <div style={{ fontSize: '12px', color: '#CBD5E1', marginTop: SPACE.sm }}>
                    Mask Overlay (Amber = Cloud, Shadow, or NoData pixels excluded from analysis)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Area Statistics Table & Download Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: SPACE.lg, marginBottom: SPACE.xl }}>
            {/* Table */}
            <div style={{ backgroundColor: '#0F172A', padding: SPACE.md, borderRadius: RADII.lg, border: '1px solid #1E293B' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#F8FAFC' }}>
                Quantitative Change Category Register
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#CBD5E1' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94A3B8', textAlign: 'left' }}>
                    <th style={{ padding: '6px' }}>Category</th>
                    <th style={{ padding: '6px' }}>Pixels</th>
                    <th style={{ padding: '6px' }}>Area (ha)</th>
                    <th style={{ padding: '6px' }}>Area (km²)</th>
                    <th style={{ padding: '6px' }}>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {result.areaSummary.categories.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1E293B' }}>
                      <td style={{ padding: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: c.colorHex, display: 'inline-block' }} />
                        {c.label}
                      </td>
                      <td style={{ padding: '6px' }}>{c.pixelCount.toLocaleString()}</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>{c.areaHectares.toFixed(2)}</td>
                      <td style={{ padding: '6px' }}>{c.areaSqKm.toFixed(4)}</td>
                      <td style={{ padding: '6px' }}>{c.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Export & Download Artifacts */}
            <div style={{ backgroundColor: '#0F172A', padding: SPACE.md, borderRadius: RADII.lg, border: '1px solid #1E293B' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#F8FAFC' }}>
                Download Scientific Artifacts
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a
                  href={result.artifacts.changeMapGeoTiff}
                  download="change_classification.tif"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDownloadArtifact(result.artifacts.changeMapGeoTiff, 'change_classification.tif');
                  }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#1E293B',
                    color: '#E2E8F0',
                    borderRadius: RADII.md,
                    fontSize: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <span>🗺️ Change Classification (GeoTIFF)</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>.tif</span>
                </a>

                <a
                  href={result.artifacts.cloudMaskGeoTiff}
                  download="cloud_mask.tif"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDownloadArtifact(result.artifacts.cloudMaskGeoTiff, 'cloud_mask.tif');
                  }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#1E293B',
                    color: '#E2E8F0',
                    borderRadius: RADII.md,
                    fontSize: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <span>☁️ Cloud & Quality Mask (GeoTIFF)</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>.tif</span>
                </a>

                {result.artifacts.ndviDiffGeoTiff && (
                  <a
                    href={result.artifacts.ndviDiffGeoTiff}
                    download="ndvi_difference.tif"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDownloadArtifact(result.artifacts.ndviDiffGeoTiff!, 'ndvi_difference.tif');
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#1E293B',
                      color: '#E2E8F0',
                      borderRadius: RADII.md,
                      fontSize: '12px',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <span>📈 NDVI Difference (GeoTIFF)</span>
                    <span style={{ fontSize: '10px', color: '#64748B' }}>.tif</span>
                  </a>
                )}

                {result.artifacts.bsiDiffGeoTiff && (
                  <a
                    href={result.artifacts.bsiDiffGeoTiff}
                    download="bsi_difference.tif"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDownloadArtifact(result.artifacts.bsiDiffGeoTiff!, 'bsi_difference.tif');
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#1E293B',
                      color: '#E2E8F0',
                      borderRadius: RADII.md,
                      fontSize: '12px',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <span>🏜️ Bare-Soil Index Diff (GeoTIFF)</span>
                    <span style={{ fontSize: '10px', color: '#64748B' }}>.tif</span>
                  </a>
                )}

                <a
                  href={result.artifacts.areaSummaryCsv}
                  download="area_summary.csv"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDownloadArtifact(result.artifacts.areaSummaryCsv, 'area_summary.csv');
                  }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#1E293B',
                    color: '#E2E8F0',
                    borderRadius: RADII.md,
                    fontSize: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <span>📊 Area Statistics Summary (CSV)</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>.csv</span>
                </a>

                <a
                  href={result.artifacts.validationReportMd}
                  download="validation_report.md"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDownloadArtifact(result.artifacts.validationReportMd, 'validation_report.md');
                  }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#1E293B',
                    color: '#E2E8F0',
                    borderRadius: RADII.md,
                    fontSize: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <span>📝 Validation & Limitations Report</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>.md</span>
                </a>

                <a
                  href={result.artifacts.metadataJson}
                  download="change_metadata.json"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDownloadArtifact(result.artifacts.metadataJson, 'change_metadata.json');
                  }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#1E293B',
                    color: '#E2E8F0',
                    borderRadius: RADII.md,
                    fontSize: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <span>⚙️ Processing Metadata (JSON)</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>.json</span>
                </a>
              </div>
            </div>
          </div>

          {/* Scientific Disclaimer Card */}
          <div
            style={{
              padding: SPACE.md,
              backgroundColor: '#1E293B',
              borderRadius: RADII.md,
              fontSize: '12px',
              color: '#94A3B8',
              lineHeight: 1.5,
            }}
          >
            <strong>Scientific &amp; Operational Notice:</strong> Change classifications generated by this offline workstation indicate spectral candidate variations across acquisition epochs. Spectral index decreases (e.g., negative ΔNDVI) or bare-soil increases (positive ΔBSI) can be caused by seasonal phenology, agricultural harvest, or surface changes, and do not constitute proof of unauthorized activity without ground-truth verification by authorized field monitoring teams.
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineChangeDetectionPage;
