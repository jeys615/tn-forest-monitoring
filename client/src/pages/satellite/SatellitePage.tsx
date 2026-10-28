import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { satelliteService } from '../../services/satellite.service';
import { zoneService } from '../../services/zone.service';
import { useAuth } from '../../hooks/useAuth';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';
import { ZoneWorkspaceDirectory } from '../../components/common/ZoneWorkspaceDirectory';
import { DateRangeFilter } from '../../components/common/DateRangeFilter';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import MapLegend from '../../components/ui/MapLegend';
import {
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  Permission,
  type SatelliteMetadataDto,
  type ZoneDto,
  type RealSentinel2ImageDto,
  type RealSarImageDto,
} from '@tn-forest/shared/types';
import axios from 'axios';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

import 'leaflet/dist/leaflet.css';

function extractApiErrorMessage(err: unknown, defaultFallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data === 'string' && data.trim().length > 0) {
      return data.trim();
    }
    if (data && typeof data === 'object') {
      if (
        'message' in data &&
        typeof (data as any).message === 'string' &&
        (data as any).message.trim().length > 0
      ) {
        return (data as any).message.trim();
      }
      if (
        'error' in data &&
        typeof (data as any).error === 'string' &&
        (data as any).error.trim().length > 0
      ) {
        return (data as any).error.trim();
      }
    }
    if (err.message && err.message.trim().length > 0) {
      return err.message.trim();
    }
  } else if (err instanceof Error && err.message && err.message.trim().length > 0) {
    return err.message.trim();
  }
  return defaultFallback;
}

// Fix for default Leaflet icon paths in Vite
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// ─── Map sub-components & GeoJSON Helpers ───────────────────────
interface MapControllerProps {
  center?: [number, number];
  zoom?: number;
  bounds?: [number, number][];
}

const MapController: React.FC<MapControllerProps> = ({ center, zoom, bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      try {
        const leafletBounds = L.latLngBounds(bounds.map(([lat, lng]) => [lat, lng]));
        if (leafletBounds.isValid()) {
          map.fitBounds(leafletBounds, { padding: [40, 40], maxZoom: 14 });
        }
      } catch (e) {
        console.error('[MapController] Error fitting bounds:', e);
      }
    } else if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, bounds, map]);
  return null;
};

// Helper to extract Leaflet [lat, lng][] rings from any GeoJSON Polygon or MultiPolygon
export function getGeoJsonPolygonPositions(
  geometry?: { type: string; coordinates: any } | null,
): [number, number][][] {
  if (!geometry || !geometry.coordinates || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as [number, number][][];
    if (!rings || !rings.length || !Array.isArray(rings[0])) return [];
    return [rings[0].map(([lng, lat]) => [lat, lng])];
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as [number, number][][][];
    if (!polys || !polys.length || !Array.isArray(polys)) return [];
    return polys
      .map((poly) =>
        Array.isArray(poly) && Array.isArray(poly[0])
          ? poly[0].map(([lng, lat]) => [lat, lng] as [number, number])
          : null,
      )
      .filter((ring): ring is [number, number][] => Array.isArray(ring) && ring.length > 0);
  }
  return [];
}

export function calculateGeometryBounds(
  geometry?: { type: string; coordinates: any } | null,
): [number, number][] | undefined {
  const rings = getGeoJsonPolygonPositions(geometry);
  if (!rings || rings.length === 0) return undefined;
  const allPoints = rings.flat();
  return allPoints.length > 0 ? allPoints : undefined;
}


// ─── Labels & styles ────────────────────────────────────────────
const SOURCE_LABELS: Record<SatelliteSource, string> = {
  [SatelliteSource.SENTINEL_2]: 'Sentinel-2 (MSI)',
  [SatelliteSource.LANDSAT_8]: 'Landsat-8 (OLI)',
  [SatelliteSource.LANDSAT_9]: 'Landsat-9 (OLI-2)',
  [SatelliteSource.SENTINEL_1]: 'Sentinel-1 (C-SAR)',
  [SatelliteSource.SRTM]: 'SRTM DEM (1 Arc-Sec)',
};

type PStatusVariant = 'info' | 'warning' | 'success' | 'danger';

const STATUS_META: Record<
  SatelliteProcessingStatus,
  { label: string; variant: PStatusVariant; color: string; bgColor: string }
> = {
  [SatelliteProcessingStatus.ACQUIRED]: {
    label: 'Metadata Acquired',
    variant: 'info',
    color: '#1e40af',
    bgColor: '#dbeafe',
  },
  [SatelliteProcessingStatus.CATALOG_ACQUIRED]: {
    label: 'Metadata Acquired',
    variant: 'info',
    color: '#1e40af',
    bgColor: '#dbeafe',
  },
  [SatelliteProcessingStatus.PROCESSING]: {
    label: 'Processing',
    variant: 'warning',
    color: '#854d0e',
    bgColor: '#fef9c3',
  },
  [SatelliteProcessingStatus.EXPORT_REQUESTED]: {
    label: 'Export Requested',
    variant: 'warning',
    color: '#b45309',
    bgColor: '#fef3c7',
  },
  [SatelliteProcessingStatus.EXPORT_RUNNING]: {
    label: 'Export Running',
    variant: 'warning',
    color: '#d97706',
    bgColor: '#fef3c7',
  },
  [SatelliteProcessingStatus.EXPORT_COMPLETED]: {
    label: 'Raster Exported',
    variant: 'info',
    color: '#0e7490',
    bgColor: '#cffafe',
  },
  [SatelliteProcessingStatus.DRIVE_FILE_FOUND]: {
    label: 'Drive File Found',
    variant: 'info',
    color: '#0369a1',
    bgColor: '#e0f2fe',
  },
  [SatelliteProcessingStatus.DOWNLOADED]: {
    label: 'Downloaded',
    variant: 'info',
    color: '#4338ca',
    bgColor: '#e0e7ff',
  },
  [SatelliteProcessingStatus.RASTER_VALIDATED]: {
    label: 'Raster Validated',
    variant: 'info',
    color: '#6d28d9',
    bgColor: '#ede9fe',
  },
  [SatelliteProcessingStatus.PROCESSED]: {
    label: 'Processed',
    variant: 'success',
    color: '#166534',
    bgColor: '#dcfce7',
  },
  [SatelliteProcessingStatus.FAILED]: {
    label: 'Failed',
    variant: 'danger',
    color: '#991b1b',
    bgColor: '#fef2f2',
  },
};

const NON_TERMINAL_EXPORT_STATUSES = [
  SatelliteProcessingStatus.EXPORT_REQUESTED,
  SatelliteProcessingStatus.EXPORT_RUNNING,
  SatelliteProcessingStatus.EXPORT_COMPLETED,
  SatelliteProcessingStatus.DRIVE_FILE_FOUND,
  SatelliteProcessingStatus.DOWNLOADED,
  SatelliteProcessingStatus.RASTER_VALIDATED,
  SatelliteProcessingStatus.PROCESSING,
];

// Kept for backward compatibility in the JSX below
// const STATUS_LABELS = STATUS_META;

// ─── Shared input style ─────────────────────────────────────────
const formInp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: FONT.sizeMd,
  borderRadius: RADII.md,
  border: `1px solid #CBD5E1`,
  color: COLORS.text,
  backgroundColor: COLORS.surface,
  outline: 'none',
};
const formLbl: React.CSSProperties = {
  display: 'block',
  fontSize: FONT.sizeSm,
  fontWeight: FONT.weightSemibold,
  color: COLORS.textMuted,
  marginBottom: '4px',
};

// ─── Detail row helper ──────────────────────────────────────────
const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div
    style={{
      borderBottom: `1px solid ${COLORS.borderLight}`,
      paddingBottom: SPACE.md,
      marginBottom: SPACE.md,
    }}
  >
    <div
      style={{
        fontSize: FONT.sizeXs,
        fontWeight: FONT.weightSemibold,
        color: COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '3px',
      }}
    >
      {label}
    </div>
    {children}
  </div>
);

// ─── SatellitePage ──────────────────────────────────────────────
const SatellitePage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [images, setImages] = useState<SatelliteMetadataDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [sensorFilter, setSensorFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [zonesLoaded, setZonesLoaded] = useState(false);

  const {
    zoneId,
    selectedZone,
    isZoneInvalid,
    startDate,
    endDate,
    datePreset,
    setZoneId,
    setDatePreset,
    setDateRange,
    clearZone,
    clearDateFilter,
  } = useZoneScopedParams(zones, zonesLoaded);

  const [selectedImage, setSelectedImage] = useState<SatelliteMetadataDto | null>(null);

  const [mapCenter] = useState<[number, number]>([11.1271, 78.6569]);
  const [mapZoom] = useState<number>(7);
  const [mapBounds, setMapBounds] = useState<[number, number][] | undefined>(undefined);

  // Auto-fit map bounds and reset selection when selected zone changes
  useEffect(() => {
    setSelectedImage(null);
    setCandidateImages([]);
    if (selectedZone?.boundary) {
      const bounds = calculateGeometryBounds(selectedZone.boundary);
      setMapBounds(bounds);
    } else {
      setMapBounds(undefined);
    }
  }, [selectedZone, zoneId]);

  const [isSearching, setIsSearching] = useState(false);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [acquiringCandidateId, setAcquiringCandidateId] = useState<string | null>(null);
  const [candidateImages, setCandidateImages] = useState<Array<RealSentinel2ImageDto | RealSarImageDto>>([]);
  const [candidateTrack, setCandidateTrack] = useState<'OPTICAL' | 'SAR' | ''>('');
  const [candidateZoneId, setCandidateZoneId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [acquisitionLogs, setAcquisitionLogs] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    zoneId: '',
    sensorType: '' as 'OPTICAL' | 'SAR' | '',
    source: '' as SatelliteSource | '',
    startDate: '',
    endDate: '',
    maxCloudCover: 20,
  });

  const canAcquire =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.permissions.includes(Permission.AREA_UPDATE);

  const fetchZones = async () => {
    try {
      const data = await zoneService.getZones();
      setZones(data);
      setZonesLoaded(true);
      if (data.length > 0) {
        setFormData((prev) => ({ ...prev, zoneId: prev.zoneId || zoneId || data[0].id }));
      }
    } catch (err) {
      console.error('Failed to fetch zones for select dropdown', err);
      setZonesLoaded(true);
    }
  };

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const targetZoneId = selectedZone?.id || zoneId || undefined;
      const data = await satelliteService.getImages({
        source: sourceFilter ? (sourceFilter as SatelliteSource) : undefined,
        sensorType: sensorFilter ? (sensorFilter as SensorType) : undefined,
        processingStatus: statusFilter ? (statusFilter as SatelliteProcessingStatus) : undefined,
        zoneId: targetZoneId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setImages(data);
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Failed to fetch satellite metadata');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, sensorFilter, statusFilter, zoneId, selectedZone?.id, startDate, endDate]);

  useEffect(() => {
    fetchZones();
    fetchImages();
  }, [fetchImages]);

  // ─── Asynchronous Export Polling Effect ─────────────────────
  // Polls active export status every 4 seconds until terminal state (PROCESSED or FAILED)
  const hasActiveExports =
    images.some((img) => NON_TERMINAL_EXPORT_STATUSES.includes(img.processingStatus)) ||
    (selectedImage !== null && NON_TERMINAL_EXPORT_STATUSES.includes(selectedImage.processingStatus));

  useEffect(() => {
    if (!hasActiveExports) return;

    const intervalId = setInterval(async () => {
      try {
        const targetZoneId = selectedZone?.id || zoneId || undefined;
        const data = await satelliteService.getImages({
          source: sourceFilter ? (sourceFilter as SatelliteSource) : undefined,
          sensorType: sensorFilter ? (sensorFilter as SensorType) : undefined,
          processingStatus: statusFilter ? (statusFilter as SatelliteProcessingStatus) : undefined,
          zoneId: targetZoneId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });
        setImages(data);

        // If selected observation is active, update its status in real-time
        if (selectedImage) {
          const fresh = data.find((img) => img.id === selectedImage.id);
          if (fresh) {
            setSelectedImage(fresh);
            if (
              fresh.processingStatus === SatelliteProcessingStatus.PROCESSED &&
              selectedImage.processingStatus !== SatelliteProcessingStatus.PROCESSED
            ) {
              setSuccessMsg(`GeoTIFF raster export completed & validated for ${fresh.imageId}`);
              setAcquisitionLogs((prev) => [
                ...prev,
                `[${new Date().toLocaleTimeString()}] GeoTIFF raster successfully exported, downloaded, and validated for ${fresh.imageId}`,
                `[${new Date().toLocaleTimeString()}] Status: PROCESSED. Ready for baseline selection or monitoring.`,
              ]);
            } else if (
              fresh.processingStatus === SatelliteProcessingStatus.FAILED &&
              selectedImage.processingStatus !== SatelliteProcessingStatus.FAILED
            ) {
              setError(fresh.failureReason || 'Background GeoTIFF export failed in Earth Engine');
              setAcquisitionLogs((prev) => [
                ...prev,
                `[${new Date().toLocaleTimeString()}] ERROR: Background export failed: ${fresh.failureReason}`,
              ]);
            }
          }
        }
      } catch (pollErr) {
        console.error('Error polling active satellite export status:', pollErr);
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [hasActiveExports, selectedImage, sourceFilter, sensorFilter, statusFilter, zoneId, selectedZone?.id, startDate, endDate]);

  const handleImageSelect = (img: SatelliteMetadataDto) => {
    if (selectedImage?.id === img.id) {
      setSelectedImage(null);
      if (selectedZone?.boundary) {
        setMapBounds(calculateGeometryBounds(selectedZone.boundary));
      }
      return;
    }
    setSelectedImage(img);
    const footprintBounds = calculateGeometryBounds(img.footprint);
    if (footprintBounds && footprintBounds.length > 0) {
      setMapBounds(footprintBounds);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.zoneId || !formData.startDate || !formData.endDate) {
      setError('Please select a zone and specify a date range.');
      return;
    }
    if (!formData.sensorType) {
      setError('Please explicitly select a sensor track: OPTICAL or SAR.');
      return;
    }
    try {
      setError(null);
      setSuccessMsg(null);
      setIsSearching(true);
      setCandidateImages([]);
      const isSar = formData.sensorType === 'SAR';
      setCandidateTrack(formData.sensorType);
      setCandidateZoneId(formData.zoneId);

      setAcquisitionLogs([
        `[${new Date().toLocaleTimeString()}] Starting ${isSar ? 'Sentinel-1 SAR radar' : 'Optical (Sentinel-2 / Landsat)'} catalog discovery...`,
        `[${new Date().toLocaleTimeString()}] Selected sensor track: ${formData.sensorType}`,
        `[${new Date().toLocaleTimeString()}] ${isSar ? 'Querying Sentinel-1 C-SAR GRD (VV/VH backscatter) passes...' : 'Querying Sentinel-2 & Landsat collections...'}`
      ]);

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      await delay(200);
      setAcquisitionLogs((prev) => [
        ...prev,
        isSar
          ? `[${new Date().toLocaleTimeString()}] Searching real GEE collection COPERNICUS/S1_GRD (All-Weather C-SAR)...`
          : formData.source
          ? `[${new Date().toLocaleTimeString()}] Searching real GEE collection for ${formData.source}...`
          : `[${new Date().toLocaleTimeString()}] Searching real GEE optical collections (Sentinel-2, Landsat-8, Landsat-9)...`,
      ]);

      const response = await satelliteService.searchImages({
        zoneId: formData.zoneId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        sensorType: formData.sensorType as SensorType,
        source: formData.source ? (formData.source as SatelliteSource) : undefined,
        maxCloudCover: isSar ? 100 : Number(formData.maxCloudCover),
      });

      if (!response.images || response.images.length === 0) {
        const noImagesMsg = isSar
          ? 'No real Sentinel-1 SAR imagery found for the selected period. Try a wider date range.'
          : `No real optical imagery found for the selected period under cloud threshold ${formData.maxCloudCover}%. Try a wider date range.`;
        setAcquisitionLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ${noImagesMsg}`,
        ]);
        setError(noImagesMsg);
        return;
      }

      setCandidateImages(response.images);
      setAcquisitionLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] GEE search resolved! Found ${response.totalFound} candidate observations.`,
        `[${new Date().toLocaleTimeString()}] Select a candidate observation below to acquire into the database catalog.`,
      ]);
      setSuccessMsg(
        `Found ${response.totalFound} real ${isSar ? 'Sentinel-1 SAR' : 'optical'} observations. Select an observation to acquire into the catalog.`,
      );
    } catch (err: unknown) {
      let msg = extractApiErrorMessage(err, 'Failed to search satellite catalog');
      if (
        msg.includes('GEE_NO_IMAGES_FOUND') ||
        (formData.sensorType === 'SAR' && msg.toLowerCase().includes('no real sentinel-1 sar imagery found'))
      ) {
        msg = 'No real Sentinel-1 SAR imagery found for the selected period. Try a wider date range.';
      }
      setAcquisitionLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
      setError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAcquireCandidate = async (candidate: RealSentinel2ImageDto | RealSarImageDto) => {
    try {
      setIsAcquiring(true);
      setAcquiringCandidateId(candidate.imageId);
      setError(null);
      setSuccessMsg(null);

      const isSar = candidateTrack === 'SAR';
      setAcquisitionLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Explicit acquisition initiated for observation: ${candidate.imageId}`,
        `[${new Date().toLocaleTimeString()}] Persisting ${isSar ? 'Sentinel-1 SAR' : 'Sentinel-2 Optical'} metadata to catalog...`,
      ]);

      const acquired = await satelliteService.acquireImage({
        zoneId: candidateZoneId || formData.zoneId,
        startDate: candidate.acquisitionDate.slice(0, 10),
        endDate: candidate.acquisitionDate.slice(0, 10),
        sensorType: (candidateTrack || formData.sensorType) as SensorType,
        imageId: candidate.imageId,
        maxCloudCover: isSar ? 100 : Number(formData.maxCloudCover),
      });

      const isExportRunning =
        acquired.processingStatus === SatelliteProcessingStatus.EXPORT_RUNNING ||
        acquired.processingStatus === SatelliteProcessingStatus.EXPORT_REQUESTED;

      setAcquisitionLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Acquisition successful! ID: ${acquired.imageId}`,
        `[${new Date().toLocaleTimeString()}] Spatial footprint indexed for intersecting zones.`,
        isExportRunning
          ? `[${new Date().toLocaleTimeString()}] GEE export operation submitted: ${acquired.geeExportTaskId || 'In progress'}`
          : `[${new Date().toLocaleTimeString()}] Record active in MongoDB catalog.`,
        isExportRunning
          ? `[${new Date().toLocaleTimeString()}] GeoTIFF raster export running in background (GEE → Google Drive)...`
          : `[${new Date().toLocaleTimeString()}] Status: ${acquired.processingStatus}`,
      ]);

      setSuccessMsg(
        isExportRunning
          ? `${acquired.sensorType} satellite observation acquired to catalog. GeoTIFF export running in background...`
          : `${acquired.sensorType} satellite observation acquired and indexed in catalog (${SOURCE_LABELS[acquired.source]}). Ready for baseline selection or monitoring.`,
      );

      await fetchImages();
      handleImageSelect(acquired);
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Failed to acquire satellite image');
      setAcquisitionLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${msg}`]);
      setError(msg);
    } finally {
      setIsAcquiring(false);
      setAcquiringCandidateId(null);
    }
  };

  const handleExportRaster = async () => {
    if (!selectedImage) return;
    try {
      setIsExporting(true);
      setError(null);
      setSuccessMsg(null);
      const firstZone =
        selectedImage.intersectingZones.length > 0
          ? selectedImage.intersectingZones[0]
          : undefined;
      const targetZoneId =
        firstZone && typeof firstZone === 'object' && (firstZone as any)._id
          ? (firstZone as any)._id
          : firstZone
            ? String(firstZone)
            : zones.length > 0
              ? zones[0].id
              : undefined;

      const updated = await satelliteService.exportRaster(selectedImage.id, {
        zoneId: targetZoneId,
        sync: false,
      });
      setSuccessMsg(`GeoTIFF raster export initiated for ${updated.imageId}. Running in background...`);
      setSelectedImage(updated);
      await fetchImages();
    } catch (err: unknown) {
      const msg = extractApiErrorMessage(err, 'Failed to export GeoTIFF raster');
      setError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px',
    fontSize: FONT.sizeMd,
    borderRadius: RADII.md,
    border: `1px solid #CBD5E1`,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    outline: 'none',
  };

  // ─── Render Zone Directory (Part G: Entry UX) ───────────────
  if (!selectedZone) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
        <ZoneWorkspaceDirectory
          moduleTitle="SATELLITE CATALOG"
          moduleSubtitle="Multi-source satellite observation imagery and coverage catalog for monitored forest areas."
          moduleBadge="EARTH OBSERVATION"
          department="FOREST PROTECTION & SURVEILLANCE DIVISION"
          zones={zones}
          loading={!zonesLoaded}
          onSelectZone={(zid) => setZoneId(zid)}
          actionLabel="OPEN SATELLITE CATALOG →"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          }
        />
      </div>
    );
  }

  // ─── Render Zone-Scoped Workspace ─────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        gap: SPACE.lg,
        animation: 'fadeIn 0.25s ease',
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexShrink: 0,
        }}
      >
        <div>
          <h1
            style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: COLORS.primaryDark }}
          >
            {selectedZone.name} — Satellite Catalog
            {images.length > 0 && (
              <span
                style={{
                  fontSize: FONT.sizeSm,
                  fontWeight: FONT.weightSemibold,
                  color: '#7C3AED',
                  backgroundColor: '#EDE9FE',
                  padding: '3px 9px',
                  borderRadius: RADII.full,
                  marginLeft: SPACE.md,
                }}
              >
                {images.length} records
              </span>
            )}
          </h1>
          <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '3px' }}>
            Multi-source satellite acquisition · Metadata catalog · Spatial footprint visualization
          </p>
        </div>
      </div>

      {/* ── Notifications ── */}
      {error && <ErrorState message={error} onRetry={fetchImages} />}
      {successMsg && (
        <div
          style={{
            padding: SPACE.md,
            backgroundColor: COLORS.successBg,
            border: `1px solid #BBF7D0`,
            borderRadius: RADII.md,
            color: COLORS.successText,
            fontSize: FONT.sizeMd,
            flexShrink: 0,
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* ── Zone Context Header ── */}
      <ZoneContextHeader
        zone={selectedZone}
        isInvalid={isZoneInvalid}
        invalidZoneId={zoneId}
        onClearZone={clearZone}
        currentModule="satellite"
      />

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: SPACE.md, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <ZoneSelector
          zones={zones}
          selectedZoneId={zoneId}
          onSelectZone={setZoneId}
          allowAllZones
          allZonesLabel="All Monitored Zones"
        />

        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          datePreset={datePreset}
          onPresetChange={setDatePreset}
          onRangeChange={setDateRange}
          onClear={clearDateFilter}
          label="Acquisition Window"
        />

        <select
          value={sensorFilter}
          onChange={(e) => setSensorFilter(e.target.value)}
          style={selectStyle}
          id="satellite-sensor-filter"
        >
          <option value="">All Sensor Tracks</option>
          <option value={SensorType.OPTICAL}>Optical (Multispectral)</option>
          <option value={SensorType.SAR}>SAR (Radar)</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Satellite Sources</option>
          {Object.values(SatelliteSource).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Processing Statuses</option>
          {Object.values(SatelliteProcessingStatus).map((st) => (
            <option key={st} value={st}>
              {STATUS_META[st].label}
            </option>
          ))}
        </select>

        {(sourceFilter || sensorFilter || statusFilter || zoneId || startDate || endDate) && (
          <button
            onClick={() => {
              setSourceFilter('');
              setSensorFilter('');
              setStatusFilter('');
              clearZone();
              clearDateFilter();
            }}
            style={{
              padding: '7px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.md,
              color: COLORS.textMuted,
              fontSize: FONT.sizeMd,
              cursor: 'pointer',
            }}
          >
            Clear All Filters
          </button>
        )}
      </div>

      {/* ── Main: map left + panel right ── */}
      <div style={{ display: 'flex', gap: SPACE.lg, alignItems: 'flex-start', minWidth: 0 }}>
        {/* ── Left: Map + Records Table ── */}
        <div
          style={{ display: 'flex', flexDirection: 'column', flex: 7, gap: SPACE.lg, minWidth: 0 }}
        >
          {/* Map */}
          <div
            style={{
              height: '380px',
              minHeight: '380px',
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.md,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: SHADOWS.sm,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Satellite Intelligence Workspace Top HUD */}
            <div
              style={{
                padding: '8px 14px',
                backgroundColor: '#0F172A',
                color: '#F8FAFC',
                borderBottom: '1px solid #1E293B',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                zIndex: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                  }}
                >
                  {selectedZone ? `${selectedZone.name} · SATELLITE INTELLIGENCE` : 'SATELLITE SURVEILLANCE WORKSPACE'}
                </span>
                {selectedImage && (
                  <span
                    className={
                      selectedImage.sensorType === SensorType.SAR
                        ? 'ws-sensor-badge ws-sensor-sar'
                        : 'ws-sensor-badge ws-sensor-optical'
                    }
                  >
                    {SOURCE_LABELS[selectedImage.source] || selectedImage.source}
                  </span>
                )}
              </div>
              {selectedImage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '11px',
                    color: '#CBD5E1',
                    fontFamily: FONT.mono,
                  }}
                >
                  <span>DATE: {selectedImage.acquisitionDate.slice(0, 10)}</span>
                  <span>
                    CLOUD:{' '}
                    {selectedImage.sensorType === SensorType.SAR
                      ? '0.0% (SAR)'
                      : typeof selectedImage.cloudCover === 'number'
                        ? `${selectedImage.cloudCover.toFixed(1)}%`
                        : 'N/A'}
                  </span>
                  <span>CRS: {selectedImage.rasterCrs || selectedImage.originalCrs || 'EPSG:32643'}</span>
                </div>
              )}
            </div>

            <div style={{ flex: 1, position: 'relative', minHeight: '300px' }}>
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                style={{ width: '100%', height: '100%', zIndex: 1 }}
              >
                <MapController center={mapCenter} zoom={mapZoom} bounds={mapBounds} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* 1. Selected Zone Boundary (Always visible for selected zone) */}
                {selectedZone &&
                  getGeoJsonPolygonPositions(selectedZone.boundary).map((ring, idx) => (
                    <Polygon
                      key={`selected-zone-ring-${selectedZone.id}-${idx}`}
                      positions={ring}
                      pathOptions={{
                        color: '#059669', // Emerald/Forest green
                        fillColor: '#10B981',
                        fillOpacity: 0.18,
                        weight: 3,
                      }}
                    >
                      <Popup>
                        <div style={{ padding: '4px' }}>
                          <strong style={{ color: '#065F46', fontSize: '13px' }}>
                            {selectedZone.name}
                          </strong>
                          <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '2px' }}>
                            Zone Code: <strong>{selectedZone.zoneId}</strong>
                          </div>
                          <div style={{ fontSize: '11px', color: '#4B5563' }}>
                            Category: <strong>{selectedZone.category}</strong>
                          </div>
                          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginTop: '4px' }}>
                            ★ SELECTED ZONE BOUNDARY
                          </div>
                        </div>
                      </Popup>
                    </Polygon>
                  ))}

                {/* 2. Selected Satellite Footprint */}
                {selectedImage &&
                  getGeoJsonPolygonPositions(selectedImage.footprint).map((ring, idx) => (
                    <Polygon
                      key={`selected-image-footprint-${selectedImage.id}-${idx}`}
                      positions={ring}
                      pathOptions={{
                        color: '#7C3AED', // Purple
                        fillColor: '#8B5CF6',
                        fillOpacity: 0.12,
                        dashArray: '6, 6',
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <div style={{ padding: '4px' }}>
                          <strong style={{ color: '#5B21B6', fontSize: '12px' }}>
                            {selectedImage.imageId}
                          </strong>
                          <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '2px' }}>
                            Acquisition: {new Date(selectedImage.acquisitionDate).toLocaleString('en-IN')}
                          </div>
                          <div style={{ fontSize: '11px', color: '#6D28D9', fontWeight: 600, marginTop: '4px' }}>
                            ⬡ SATELLITE FOOTPRINT
                          </div>
                        </div>
                      </Popup>
                    </Polygon>
                  ))}

                {/* 3. Intersecting Monitored Zones (Excluding selected zone) */}
                {selectedImage &&
                  zones
                    .filter((z) => z.id !== selectedZone?.id && selectedImage.intersectingZones.includes(z.id))
                    .map((z) =>
                      getGeoJsonPolygonPositions(z.boundary).map((ring, idx) => (
                        <Polygon
                          key={`intersecting-zone-${z.id}-${idx}`}
                          positions={ring}
                          pathOptions={{
                            color: '#2563EB', // Blue
                            fillColor: '#3B82F6',
                            fillOpacity: 0.12,
                            weight: 2,
                          }}
                        >
                          <Popup>
                            <div style={{ padding: '4px' }}>
                              <strong style={{ color: '#1E40AF' }}>{z.name}</strong>
                              <br />
                              <span style={{ fontSize: '11px', color: '#4B5563' }}>
                                Category: {z.category}
                              </span>
                              <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                                INTERSECTING MONITORED ZONE
                              </div>
                            </div>
                          </Popup>
                        </Polygon>
                      )),
                    )}
              </MapContainer>

              <MapLegend
                title="Map Legend"
                items={[
                  { color: '#059669', label: 'Selected Zone Boundary' },
                  ...(selectedImage
                    ? [
                        { color: '#7C3AED', label: 'Satellite Footprint' },
                        { color: '#2563EB', label: 'Intersecting Monitored Zones' },
                      ]
                    : []),
                ]}
                position="bottom-left"
              />
            </div>
          </div>

          {/* Records Table */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.lg,
              overflow: 'hidden',
              minHeight: '380px',
              maxHeight: '560px',
              boxShadow: SHADOWS.sm,
            }}
          >
            <div
              style={{
                padding: `${SPACE.md} ${SPACE.lg}`,
                borderBottom: `1px solid ${COLORS.border}`,
                flexShrink: 0,
                backgroundColor: '#F8FAFB',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: FONT.sizeMd,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.primary,
                  }}
                >
                  Catalog Records
                </span>
                <span
                  style={{
                    fontSize: FONT.sizeXs,
                    fontWeight: FONT.weightBold,
                    color: '#7C3AED',
                    backgroundColor: '#EDE9FE',
                    padding: '2px 8px',
                    borderRadius: RADII.full,
                  }}
                >
                  {images.length} {images.length === 1 ? 'record' : 'records'}
                </span>
              </div>
              {selectedImage && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImage(null);
                    if (selectedZone?.boundary) {
                      setMapBounds(calculateGeometryBounds(selectedZone.boundary));
                    }
                  }}
                  style={{
                    fontSize: FONT.sizeXs,
                    color: COLORS.textMuted,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Deselect Observation
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              {loading ? (
                <Loading message="Loading catalog..." size="sm" />
              ) : images.length === 0 ? (
                <EmptyState
                  title="No satellite records"
                  description="No metadata records match the current filters. Try adjusting filters or trigger a catalog acquisition."
                  icon={
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    >
                      <circle cx="12" cy="12" r="2" />
                      <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.49 3.51a12 12 0 0 1 0 16.97M3.51 20.49a12 12 0 0 1 0-16.97" />
                    </svg>
                  }
                />
              ) : (
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: FONT.sizeSm,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#F8FAFB',
                        borderBottom: `1px solid ${COLORS.border}`,
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                      }}
                    >
                      {[
                        'Scene / Image ID',
                        'Platform & Sensor',
                        'Source Collection',
                        'Acquisition Date & Time',
                        'Cloud Cover',
                        'Status',
                        'Raster Availability',
                        'Resolution & CRS',
                        'Zones',
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 12px',
                            fontWeight: FONT.weightSemibold,
                            color: COLORS.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            fontSize: '11px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {images.map((img) => {
                      const isSelected = selectedImage?.id === img.id;
                      const meta = STATUS_META[img.processingStatus] || {
                        label: img.processingStatus || 'Unknown',
                        variant: 'info' as const,
                        color: '#475569',
                        bgColor: '#f1f5f9',
                      };
                      const isSar = img.sensorType === SensorType.SAR || img.source === SatelliteSource.SENTINEL_1;
                      const isRasterReady =
                        img.processingStatus === SatelliteProcessingStatus.PROCESSED ||
                        Boolean(img.localRasterPath) ||
                        Boolean(img.rasterWidth);
                      const isRasterExporting = NON_TERMINAL_EXPORT_STATUSES.includes(img.processingStatus as any);

                      return (
                        <tr
                          key={img.id}
                          onClick={() => handleImageSelect(img)}
                          style={{
                            borderBottom: `1px solid ${COLORS.borderLight}`,
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#F3F0FF' : 'transparent',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? '#F3F0FF' : '';
                          }}
                        >
                          {/* 1. Scene / Image ID */}
                          <td
                            style={{
                              padding: '10px 12px',
                              fontFamily: 'monospace',
                              fontSize: FONT.sizeXs,
                              color: isSelected ? '#6D28D9' : COLORS.text,
                              fontWeight: isSelected ? FONT.weightBold : FONT.weightMedium,
                              maxWidth: '190px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={img.imageId}
                          >
                            {img.imageId}
                          </td>

                          {/* 2. Platform & Sensor */}
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <span
                                className={isSar ? 'ws-sensor-badge ws-sensor-sar' : 'ws-sensor-badge ws-sensor-optical'}
                              >
                                {isSar ? 'SAR' : 'OPTICAL'}
                              </span>
                              <span style={{ fontSize: '10px', color: COLORS.textMuted }}>
                                {img.platform || (img.source === SatelliteSource.SENTINEL_2 ? 'Sentinel-2' : img.source === SatelliteSource.SENTINEL_1 ? 'Sentinel-1' : 'Landsat')}
                              </span>
                            </div>
                          </td>

                          {/* 3. Source Collection */}
                          <td
                            style={{
                              padding: '10px 12px',
                              fontWeight: FONT.weightMedium,
                              color: COLORS.textMuted,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {SOURCE_LABELS[img.source] || img.source}
                          </td>

                          {/* 4. Acquisition Date & Time */}
                          <td
                            style={{
                              padding: '10px 12px',
                              color: COLORS.text,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <div style={{ fontWeight: FONT.weightMedium }}>
                              {new Date(img.acquisitionDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
                              {new Date(img.acquisitionDate).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              UTC
                            </div>
                          </td>

                          {/* 5. Cloud Cover */}
                          <td
                            style={{
                              padding: '10px 12px',
                              fontWeight: FONT.weightSemibold,
                              color: isSar
                                ? '#64748B'
                                : typeof img.cloudCover === 'number' && img.cloudCover > 15
                                  ? '#B45309'
                                  : COLORS.successText,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isSar
                              ? 'Radar (0%)'
                              : typeof img.cloudCover === 'number'
                                ? `${img.cloudCover.toFixed(1)}%`
                                : 'N/A'}
                          </td>

                          {/* 6. Processing Status */}
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <StatusBadge label={meta.label} variant={meta.variant} dot />
                          </td>

                          {/* 7. Raster Availability */}
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {isRasterReady ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#15803D',
                                  backgroundColor: '#DCFCE7',
                                  padding: '2px 8px',
                                  borderRadius: RADII.full,
                                  border: '1px solid #BBF7D0',
                                }}
                              >
                                ✓ GeoTIFF Ready
                              </span>
                            ) : isRasterExporting ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#B45309',
                                  backgroundColor: '#FEF3C7',
                                  padding: '2px 8px',
                                  borderRadius: RADII.full,
                                  border: '1px solid #FDE68A',
                                }}
                              >
                                ⏳ Exporting...
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: '#64748B',
                                  backgroundColor: '#F1F5F9',
                                  padding: '2px 8px',
                                  borderRadius: RADII.full,
                                }}
                              >
                                Metadata Only
                              </span>
                            )}
                          </td>

                          {/* 8. Resolution & CRS */}
                          <td
                            style={{
                              padding: '10px 12px',
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              color: COLORS.textMuted,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <div>{img.rasterCrs || img.originalCrs || 'EPSG:32643'}</div>
                            <div style={{ color: '#0369A1', fontWeight: 600 }}>
                              {img.resolutionMeters ? `${img.resolutionMeters}m` : (isSar ? '10m' : '10m')}
                            </div>
                          </td>

                          {/* 9. Intersecting Zones */}
                          <td
                            style={{
                              padding: '10px 12px',
                              color: '#7C3AED',
                              fontWeight: FONT.weightBold,
                              fontSize: FONT.sizeSm,
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {img.intersectingZones?.length ?? 1}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Acquisition + Details Panel ── */}
        <div
          style={{
            flex: 3,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADII.lg,
            minWidth: '280px',
            overflowY: 'auto',
            boxShadow: SHADOWS.sm,
          }}
        >
          {/* Acquisition section */}
          {canAcquire && (
            <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: SPACE.xl }}>
              <div style={{ marginBottom: SPACE.lg }}>
                <h3
                  style={{
                    fontSize: FONT.sizeXl,
                    fontWeight: FONT.weightBold,
                    color: COLORS.primary,
                  }}
                >
                  Catalog Acquisition
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '3px' }}>
                  Real GEE multi-source satellite catalog search
                </p>
              </div>

              {zones.length === 0 ? (
                <div
                  style={{
                    fontSize: FONT.sizeSm,
                    color: COLORS.dangerText,
                    padding: SPACE.md,
                    backgroundColor: COLORS.dangerBg,
                    borderRadius: RADII.md,
                  }}
                >
                  No monitored zones available. Create a zone boundary first.
                </div>
              ) : (
                <form
                  onSubmit={handleSearchSubmit}
                  style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}
                >
                  <div>
                    <label style={formLbl}>
                      Sensor Track * <span style={{ fontSize: '11px', color: COLORS.dangerText }}>(Required)</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm, marginBottom: '6px' }}>
                      <button
                        type="button"
                        id="catalog-sensor-optical"
                        onClick={() => setFormData({ ...formData, sensorType: 'OPTICAL' })}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          padding: '10px 12px',
                          borderRadius: RADII.md,
                          border: formData.sensorType === 'OPTICAL' ? `2px solid ${COLORS.primary}` : `1px solid #CBD5E1`,
                          backgroundColor: formData.sensorType === 'OPTICAL' ? '#F0FDF4' : COLORS.surface,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeSm, color: formData.sensorType === 'OPTICAL' ? COLORS.primary : COLORS.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                            OPTICAL
                          </span>
                          {formData.sensorType === 'OPTICAL' && (
                            <span style={{ fontSize: '10px', fontWeight: FONT.weightBold, color: '#166534', backgroundColor: '#DCFCE7', padding: '1px 5px', borderRadius: RADII.full }}>
                              Selected
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '4px', lineHeight: 1.3 }}>
                          Sentinel-2 / Landsat
                        </span>
                      </button>

                      <button
                        type="button"
                        id="catalog-sensor-sar"
                        onClick={() => setFormData({ ...formData, sensorType: 'SAR', source: '' })}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          padding: '10px 12px',
                          borderRadius: RADII.md,
                          border: formData.sensorType === 'SAR' ? '2px solid #7E22CE' : `1px solid #CBD5E1`,
                          backgroundColor: formData.sensorType === 'SAR' ? '#FAF5FF' : COLORS.surface,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeSm, color: formData.sensorType === 'SAR' ? '#7E22CE' : COLORS.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 6a6 6 0 0 1 6 6"/><circle cx="12" cy="12" r="2"/></svg>
                            SAR
                          </span>
                          {formData.sensorType === 'SAR' && (
                            <span style={{ fontSize: '10px', fontWeight: FONT.weightBold, color: '#7E22CE', backgroundColor: '#F3E8FF', padding: '1px 5px', borderRadius: RADII.full }}>
                              Selected
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '4px', lineHeight: 1.3 }}>
                          Sentinel-1 C-SAR Radar
                        </span>
                      </button>
                    </div>
                    {!formData.sensorType && (
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.dangerText, display: 'block' }}>
                        * Please explicitly choose either OPTICAL or SAR sensor track.
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={formLbl}>Target Zone *</label>
                    <select
                      value={formData.zoneId}
                      onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
                      style={{ ...formInp, cursor: 'pointer' }}
                    >
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({z.zoneId})
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.sensorType === 'OPTICAL' && (
                    <div>
                      <label style={formLbl}>Optical Collection Source</label>
                      <select
                        value={formData.source}
                        onChange={(e) =>
                          setFormData({ ...formData, source: e.target.value as SatelliteSource | '' })
                        }
                        style={{ ...formInp, cursor: 'pointer' }}
                      >
                        <option value="">All Optical Collections (Sentinel-2, Landsat-8, Landsat-9)</option>
                        <option value={SatelliteSource.SENTINEL_2}>Sentinel-2 (MSI)</option>
                        <option value={SatelliteSource.LANDSAT_8}>Landsat-8 (OLI)</option>
                        <option value={SatelliteSource.LANDSAT_9}>Landsat-9 (OLI-2)</option>
                      </select>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm }}>
                    <div>
                      <label style={formLbl}>Start Date *</label>
                      <input
                        type="date"
                        required
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        style={formInp}
                      />
                    </div>
                    <div>
                      <label style={formLbl}>End Date *</label>
                      <input
                        type="date"
                        required
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        style={formInp}
                      />
                    </div>
                  </div>

                  {formData.sensorType !== 'SAR' ? (
                    <div>
                      <label style={formLbl}>Max Cloud Cover: {formData.maxCloudCover}%</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formData.maxCloudCover}
                        onChange={(e) =>
                          setFormData({ ...formData, maxCloudCover: Number(e.target.value) })
                        }
                        style={{ width: '100%', cursor: 'pointer', accentColor: COLORS.primary }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '9px 12px',
                        backgroundColor: '#FAF5FF',
                        border: '1px solid #E9D5FF',
                        borderRadius: RADII.md,
                        fontSize: FONT.sizeXs,
                        color: '#6B21A8',
                        lineHeight: 1.4,
                      }}
                    >
                      <strong>All-Weather Radar:</strong> Sentinel-1 C-SAR penetrates clouds and precipitation. Cloud cover filter does not apply.
                    </div>
                  )}

                  <button
                    type="submit"
                    id="catalog-start-search-button"
                    disabled={isSearching || isAcquiring}
                    style={{
                      width: '100%',
                      padding: '9px',
                      borderRadius: RADII.md,
                      border: 'none',
                      backgroundColor: isSearching || isAcquiring ? '#94a3b8' : COLORS.primary,
                      color: '#FFF',
                      fontWeight: FONT.weightSemibold,
                      fontSize: FONT.sizeLg,
                      cursor: isSearching || isAcquiring ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSearching ? 'Searching GEE Catalog…' : 'Start Catalog Search'}
                  </button>
                </form>
              )}

              {/* Candidate observations from search */}
              {candidateImages.length > 0 && (
                <div style={{ marginTop: SPACE.lg, borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: SPACE.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
                    <h4 style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightBold, color: COLORS.text }}>
                      Candidate Observations ({candidateImages.length})
                    </h4>
                    <span style={{ fontSize: '11px', color: COLORS.textMuted }}>
                      Real GEE observations
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: SPACE.sm,
                      maxHeight: '260px',
                      overflowY: 'auto',
                      paddingRight: '4px',
                    }}
                  >
                    {candidateImages.map((c) => {
                      const isSarCandidate = candidateTrack === 'SAR' || (c as any).source === SatelliteSource.SENTINEL_1;
                      const isThisAcquiring = acquiringCandidateId === c.imageId;
                      return (
                        <div
                          key={c.imageId}
                          style={{
                            padding: '10px 12px',
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: RADII.md,
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.text }}>
                                  {c.spacecraftName || (isSarCandidate ? 'Sentinel-1' : 'Optical')}
                                </span>
                                {c.source && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 6px',
                                      borderRadius: RADII.sm,
                                      backgroundColor: isSarCandidate ? '#F3E8FF' : '#DCFCE7',
                                      color: isSarCandidate ? '#7E22CE' : '#166534',
                                      fontWeight: FONT.weightMedium,
                                    }}
                                  >
                                    {c.source.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '2px' }}>
                                {new Date(c.acquisitionDate).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAcquireCandidate(c)}
                              disabled={isAcquiring}
                              style={{
                                padding: '5px 10px',
                                fontSize: FONT.sizeXs,
                                fontWeight: FONT.weightBold,
                                color: '#FFF',
                                backgroundColor: isThisAcquiring ? '#94A3B8' : isSarCandidate ? '#7E22CE' : COLORS.primary,
                                border: 'none',
                                borderRadius: RADII.sm,
                                cursor: isAcquiring ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isThisAcquiring ? 'Acquiring…' : 'Acquire to Catalog'}
                            </button>
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              color: '#475569',
                              wordBreak: 'break-all',
                            }}
                          >
                            {c.imageId}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: COLORS.textMuted }}>
                            {isSarCandidate ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' }}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <span>Mode: <strong>{(c as any).mode || 'IW'}</strong></span>
                                  <span>• Pol: <strong>{((c as any).polarizations?.join('+')) || 'VV+VH'}</strong></span>
                                  <span>• Pass: <strong>{(c as any).orbitDirection || 'DESCENDING'}</strong></span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <span style={{ color: '#15803D', fontWeight: FONT.weightBold }}>
                                    • Relative Orbit: <strong>Track {(c as any).relativeOrbitNumber ?? 'N/A'}</strong>
                                  </span>
                                  {(c as any).absoluteOrbitNumber && (
                                    <span style={{ color: COLORS.textMuted }}>(Abs #{(c as any).absoluteOrbitNumber})</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span>Cloud cover: <strong>{(c as any).cloudCoverPercentage !== undefined ? `${(c as any).cloudCoverPercentage.toFixed(1)}%` : 'N/A'}</strong></span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Console log */}
              {acquisitionLogs.length > 0 && (
                <div
                  style={{
                    marginTop: SPACE.lg,
                    backgroundColor: '#0F172A',
                    color: '#38BDF8',
                    fontFamily: 'monospace',
                    fontSize: FONT.sizeXs,
                    padding: SPACE.md,
                    borderRadius: RADII.md,
                    maxHeight: '130px',
                    overflowY: 'auto',
                    border: `1px solid #1E293B`,
                    lineHeight: 1.6,
                  }}
                >
                  {acquisitionLogs.map((log, idx) => (
                    <div key={idx} style={{ whiteSpace: 'pre-wrap', marginBottom: '2px' }}>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Details section */}
          {selectedImage ? (
            <div style={{ padding: SPACE.xl }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: SPACE.xl,
                }}
              >
                <h3
                  style={{
                    fontSize: FONT.sizeXl,
                    fontWeight: FONT.weightBold,
                    color: COLORS.primary,
                  }}
                >
                  Image Metadata
                </h3>
                <StatusBadge
                  label={STATUS_META[selectedImage.processingStatus]?.label || selectedImage.processingStatus}
                  variant={STATUS_META[selectedImage.processingStatus]?.variant || 'info'}
                  dot
                />
              </div>

              <DetailRow label="Sensor Track">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightBold,
                      padding: '3px 10px',
                      borderRadius: RADII.full,
                      backgroundColor: selectedImage.sensorType === SensorType.SAR ? '#F3E8FF' : '#E0F2FE',
                      color: selectedImage.sensorType === SensorType.SAR ? '#7E22CE' : '#0369A1',
                      border: `1px solid ${selectedImage.sensorType === SensorType.SAR ? '#D8B4FE' : '#BAE6FD'}`,
                    }}
                  >
                    {selectedImage.sensorType === SensorType.SAR ? 'SAR (Synthetic Aperture Radar)' : 'OPTICAL (Multispectral)'}
                  </span>
                </div>
              </DetailRow>

              <DetailRow label="Image Asset ID">
                <div
                  style={{
                    fontSize: FONT.sizeSm,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.text,
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                  }}
                >
                  {selectedImage.imageId}
                </div>
              </DetailRow>

              <DetailRow label="Satellite Catalog Source">
                <div style={{ fontSize: FONT.sizeLg, color: COLORS.text }}>
                  {SOURCE_LABELS[selectedImage.source]}
                </div>
              </DetailRow>

              <DetailRow label="Acquisition Timestamp">
                <div style={{ fontSize: FONT.sizeLg, color: COLORS.text }}>
                  {new Date(selectedImage.acquisitionDate).toLocaleString('en-IN')}
                </div>
              </DetailRow>

              <DetailRow label="Cloud Coverage">
                <div
                  style={{
                    fontSize: FONT.sizeLg,
                    fontWeight: FONT.weightSemibold,
                    color:
                      selectedImage.sensorType === SensorType.SAR
                        ? COLORS.textMuted
                        : typeof selectedImage.cloudCover === 'number' && selectedImage.cloudCover > 15
                          ? '#B45309'
                          : COLORS.successText,
                  }}
                >
                  {selectedImage.sensorType === SensorType.SAR
                    ? 'N/A (All-Weather Radar Penetration)'
                    : typeof selectedImage.cloudCover === 'number'
                      ? `${selectedImage.cloudCover.toFixed(2)}%`
                      : 'N/A'}
                </div>
              </DetailRow>

              {selectedImage.sensorType === SensorType.SAR && (
                <>
                  <DetailRow label="SAR Acquisition Mode">
                    <div style={{ fontSize: FONT.sizeMd, color: COLORS.text, fontWeight: FONT.weightMedium }}>
                      {selectedImage.mode || (selectedImage.metadata?.mode as string) || 'IW'} (Interferometric Wide Swath)
                    </div>
                  </DetailRow>
                  <DetailRow label="Radar Polarizations">
                    <div style={{ fontSize: FONT.sizeMd, color: COLORS.text, fontFamily: 'monospace' }}>
                      {selectedImage.polarizations?.join(', ') || (selectedImage.metadata?.polarization ? String(selectedImage.metadata.polarization) : 'VV, VH')}
                    </div>
                  </DetailRow>
                  <DetailRow label="Orbit Direction / Pass">
                    <div style={{ fontSize: FONT.sizeMd, color: COLORS.text }}>
                      {selectedImage.orbitDirection || (selectedImage.metadata?.orbitDirection as string) || 'DESCENDING'}
                    </div>
                  </DetailRow>
                  <DetailRow label="Relative Orbit Track">
                    <div style={{ fontSize: FONT.sizeLg, color: '#15803D', fontWeight: FONT.weightBold }}>
                      Track {selectedImage.relativeOrbitNumber ?? 92}
                    </div>
                  </DetailRow>
                  {selectedImage.absoluteOrbitNumber && (
                    <DetailRow label="Absolute Orbit Number">
                      <div style={{ fontSize: FONT.sizeSm, color: COLORS.text, fontFamily: 'monospace' }}>
                        #{selectedImage.absoluteOrbitNumber}
                      </div>
                    </DetailRow>
                  )}
                </>
              )}

              <DetailRow label="GEE / Catalog Reference">
                <div
                  style={{
                    fontSize: FONT.sizeXs,
                    color: COLORS.textMuted,
                    backgroundColor: COLORS.surfaceAlt,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADII.sm,
                    padding: SPACE.sm,
                    marginTop: '3px',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {selectedImage.geeReference}
                </div>
              </DetailRow>

              <DetailRow label={`Intersecting Zones (${selectedImage.intersectingZones.length})`}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs, marginTop: '4px' }}>
                  {zones
                    .filter((z) => selectedImage.intersectingZones.includes(z.id))
                    .map((z) => (
                      <span
                        key={z.id}
                        style={{
                          padding: '2px 8px',
                          borderRadius: RADII.full,
                          fontSize: FONT.sizeXs,
                          backgroundColor: '#D1FAE5',
                          color: COLORS.successText,
                          fontWeight: FONT.weightMedium,
                          border: `1px solid #BBF7D0`,
                        }}
                      >
                        {z.name}
                      </span>
                    ))}
                  {selectedImage.intersectingZones.length === 0 && (
                    <span style={{ fontSize: FONT.sizeSm, color: COLORS.textLight }}>
                      No intersecting zones
                    </span>
                  )}
                </div>
              </DetailRow>

              {selectedImage.geeExportTaskId && (
                <DetailRow label="GEE Export Operation / Task ID">
                  <div
                    style={{
                      fontSize: FONT.sizeXs,
                      color: COLORS.text,
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {selectedImage.geeExportTaskId}
                  </div>
                </DetailRow>
              )}

              {selectedImage.driveFileName && (
                <DetailRow label="Google Drive File">
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.text }}>
                    <strong>{selectedImage.driveFileName}</strong>
                    {selectedImage.driveFileSizeBytes ? (
                      <span style={{ color: COLORS.textMuted, marginLeft: '8px' }}>
                        ({(selectedImage.driveFileSizeBytes / 1024).toFixed(1)} KB)
                      </span>
                    ) : null}
                    {selectedImage.driveFileId ? (
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          color: COLORS.textMuted,
                          fontFamily: 'monospace',
                          marginTop: '2px',
                        }}
                      >
                        File ID: {selectedImage.driveFileId}
                      </div>
                    ) : null}
                  </div>
                </DetailRow>
              )}

              {selectedImage.rasterWidth && (
                <DetailRow label="Raster Validation & CRS">
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.text }}>
                    {selectedImage.rasterWidth} x {selectedImage.rasterHeight} px |{' '}
                    {selectedImage.rasterBandCount} bands |{' '}
                    {selectedImage.rasterCrs || 'EPSG:32643'} |{' '}
                    {selectedImage.resolutionMeters || 10}m
                  </div>
                </DetailRow>
              )}

              {selectedImage.failureReason && (
                <DetailRow label="Pipeline Failure Reason">
                  <div
                    style={{
                      fontSize: FONT.sizeSm,
                      color: COLORS.dangerText,
                      backgroundColor: COLORS.dangerBg,
                      padding: SPACE.sm,
                      borderRadius: RADII.sm,
                    }}
                  >
                    {selectedImage.failureReason}
                  </div>
                </DetailRow>
              )}

              <div style={{ marginTop: SPACE.lg, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
                {selectedImage.processingStatus === SatelliteProcessingStatus.PROCESSED ? (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: RADII.md,
                      backgroundColor: '#DCFCE7',
                      color: '#166534',
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      textAlign: 'center',
                      border: '1px solid #BBF7D0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Raster Exported, Downloaded &amp; Validated
                  </div>
                ) : NON_TERMINAL_EXPORT_STATUSES.includes(selectedImage.processingStatus as any) || isExporting ? (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: RADII.md,
                      backgroundColor: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      textAlign: 'center',
                      border: '1px solid #BFDBFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: SPACE.sm,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    <span>
                      {selectedImage.processingStatus === SatelliteProcessingStatus.EXPORT_RUNNING
                        ? 'Export in progress (GEE → Drive → Local GeoTIFF)...'
                        : 'Export requested...'}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleExportRaster}
                    disabled={isExporting}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: RADII.md,
                      border: 'none',
                      backgroundColor: '#0284C7',
                      color: '#FFF',
                      fontWeight: FONT.weightSemibold,
                      fontSize: FONT.sizeMd,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: SPACE.sm,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export GeoTIFF Raster
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: SPACE['2xl'],
                textAlign: 'center',
                color: COLORS.textMuted,
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke={COLORS.accentLight}
                strokeWidth="1.2"
                style={{ marginBottom: SPACE.lg, opacity: 0.6 }}
              >
                <circle cx="12" cy="12" r="2" />
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.49 3.51a12 12 0 0 1 0 16.97M3.51 20.49a12 12 0 0 1 0-16.97" />
              </svg>
              <h4
                style={{
                  fontSize: FONT.sizeLg,
                  fontWeight: FONT.weightSemibold,
                  color: COLORS.textMuted,
                }}
              >
                No Record Selected
              </h4>
              <p
                style={{
                  fontSize: FONT.sizeSm,
                  color: COLORS.textLight,
                  marginTop: SPACE.sm,
                  lineHeight: 1.6,
                }}
              >
                Select a satellite record from the catalog table to display its geographic footprint
                and associated zone intersections.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SatellitePage;
