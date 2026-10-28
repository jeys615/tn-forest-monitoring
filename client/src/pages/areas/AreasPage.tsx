import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZoneWorkspaceDirectory } from '../../components/common/ZoneWorkspaceDirectory';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { zoneService } from '../../services/zone.service';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import MapLegend from '../../components/ui/MapLegend';
import {
  ZoneCategory,
  ZoneStatus,
  Permission,
  type ZoneDto,
  type CreateZoneRequest,
  type UpdateZoneRequest,
} from '@tn-forest/shared/types';
import axios from 'axios';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon paths in Vite
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// ─── Map sub-components (unchanged logic) ──────────────────────
interface MapControllerProps {
  center?: [number, number];
  zoom?: number;
  bounds?: [number, number][];
}

const MapController: React.FC<MapControllerProps> = ({ center, zoom, bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      const leafletBounds = L.latLngBounds(bounds.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(leafletBounds, { padding: [50, 50] });
    } else if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, bounds, map]);
  return null;
};

interface MapDrawingEventsProps {
  isDrawing: boolean;
  drawingPoints: [number, number][];
  onPointAdd: (point: [number, number]) => void;
}

const MapDrawingEvents: React.FC<MapDrawingEventsProps> = ({ isDrawing, onPointAdd }) => {
  useMapEvents({
    click(e) {
      if (isDrawing) {
        onPointAdd([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
};

// ─── Zone styles ───────────────────────────────────────────────
const CATEGORY_STYLES: Record<ZoneCategory, { color: string; label: string }> = {
  [ZoneCategory.PROTECTED_FOREST]: { color: '#10b981', label: 'Protected Forest' },
  [ZoneCategory.RESERVED_AREA]: { color: '#06b6d4', label: 'Reserved Area' },
  [ZoneCategory.COMMERCIAL_LEASE]: { color: '#f59e0b', label: 'Commercial Lease' },
  [ZoneCategory.SUSPICIOUS_HOTSPOT]: { color: '#ef4444', label: 'Suspicious Hotspot' },
  [ZoneCategory.GENERAL]: { color: '#6366f1', label: 'General / Test Zone' },
};

const STATUS_STYLES: Record<
  ZoneStatus,
  { color: string; label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  [ZoneStatus.PROTECTED]: { color: '#10b981', label: 'Protected', variant: 'success' },
  [ZoneStatus.SUSPICIOUS]: { color: '#f59e0b', label: 'Attention', variant: 'warning' },
  [ZoneStatus.SUSPENDED]: { color: '#6b7280', label: 'Suspended', variant: 'neutral' },
};

// ─── Shared input style ────────────────────────────────────────
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
  marginBottom: SPACE.sm,
};

// ─── Field row helper ──────────────────────────────────────────
const DetailRow = ({ label, value }: { label: string; value: string }) => (
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
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: FONT.sizeLg,
        color: COLORS.text,
        marginTop: '3px',
        wordBreak: 'break-all',
      }}
    >
      {value}
    </div>
  </div>
);

// ─── Map legend items ──────────────────────────────────────────
const MAP_LEGEND_ITEMS = Object.values(ZoneCategory).map((c) => ({
  color: CATEGORY_STYLES[c].color,
  label: CATEGORY_STYLES[c].label,
}));

// ─── AreasPage ─────────────────────────────────────────────────
const AreasPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedZone, setSelectedZone] = useState<ZoneDto | null>(null);

  const [mapCenter, setMapCenter] = useState<[number, number]>([11.1271, 78.6569]);
  const [mapZoom, setMapZoom] = useState<number>(7);
  const [mapBounds, setMapBounds] = useState<[number, number][] | undefined>(undefined);

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);

  const [uiMode, setUiMode] = useState<'view' | 'create' | 'edit'>('view');

  const [formData, setFormData] = useState({
    name: '',
    category: ZoneCategory.PROTECTED_FOREST,
    status: ZoneStatus.PROTECTED,
    baselineDate: '',
    baselineImageUrl: '',
    baselineImageRef: '',
    opticalTrackEnabled: true,
    sarTrackEnabled: false,
  });

  const canCreate =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.permissions.includes(Permission.AREA_CREATE);
  const canUpdate =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.permissions.includes(Permission.AREA_UPDATE);

  const fetchZones = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await zoneService.getZones({
        category: categoryFilter ? (categoryFilter as ZoneCategory) : undefined,
        status: statusFilter ? (statusFilter as ZoneStatus) : undefined,
        search: searchQuery || undefined,
      });
      setZones(data);
    } catch (err: unknown) {
      let msg = 'Failed to fetch monitored zones';
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        msg = err.response.data.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  useEffect(() => {
    const zid = searchParams.get('zoneId');
    if (zid && zones.length > 0) {
      const match = zones.find((z) => z.id === zid);
      if (match && selectedZone?.id !== match.id) {
        handleZoneSelect(match);
      }
    }
  }, [searchParams, zones]);

  const handleZoneSelect = (zone: ZoneDto) => {
    setSelectedZone(zone);
    setUiMode('view');
    const [lng, lat] = zone.centerPoint.coordinates;
    setMapCenter([lat, lng]);
    setMapZoom(12);
    const boundaryPoints: [number, number][] =
      zone.boundary.type === 'MultiPolygon'
        ? ((zone.boundary.coordinates as [number, number][][][])[0]?.[0] || []).map(
            ([lngPoint, latPoint]) => [latPoint, lngPoint],
          )
        : ((zone.boundary.coordinates as [number, number][][])[0] || []).map(
            ([lngPoint, latPoint]) => [latPoint, lngPoint],
          );
    setMapBounds(boundaryPoints);
  };

  const getZoneCenterLatLng = (zone: ZoneDto): [number, number] => {
    const [lng, lat] = zone.centerPoint.coordinates;
    return [lat, lng];
  };

  const convertDrawingPointsToGeoJSON = (points: [number, number][]) => {
    const closedPoints = [...points];
    if (
      points[0][0] !== points[points.length - 1][0] ||
      points[0][1] !== points[points.length - 1][1]
    ) {
      closedPoints.push(points[0]);
    }
    const formatted = closedPoints.map(([lat, lng]) => [lng, lat]);
    return { type: 'Polygon' as const, coordinates: [formatted as [number, number][]] };
  };

  const handleStartDrawing = () => {
    setIsDrawing(true);
    setDrawingPoints([]);
    setUiMode('create');
    setFormData({
      name: '',
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      baselineDate: '',
      baselineImageUrl: '',
      baselineImageRef: '',
      opticalTrackEnabled: true,
      sarTrackEnabled: false,
    });
  };

  const handlePointAdd = (point: [number, number]) => {
    setDrawingPoints((prev) => [...prev, point]);
  };

  const handleUndoPoint = () => {
    setDrawingPoints((prev) => prev.slice(0, -1));
  };

  const handleCancelDrawing = () => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setUiMode('view');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (drawingPoints.length < 3) {
      setError('A polygon must contain at least 3 points before saving.');
      return;
    }
    try {
      setError(null);
      const boundary = convertDrawingPointsToGeoJSON(drawingPoints);
      const requestPayload: CreateZoneRequest = {
        name: formData.name,
        category: formData.category,
        boundary,
        baselineDate: formData.baselineDate || undefined,
        baselineImageUrl: formData.baselineImageUrl || undefined,
        baselineImageRef: formData.baselineImageRef || undefined,
        monitoringTracks: {
          optical: { enabled: formData.opticalTrackEnabled },
          sar: { enabled: formData.sarTrackEnabled },
        },
      };
      const created = await zoneService.createZone(requestPayload);
      setSuccessMsg('Monitored zone created successfully');
      setIsDrawing(false);
      setDrawingPoints([]);
      setUiMode('view');
      fetchZones();
      handleZoneSelect(created);
    } catch (err: unknown) {
      let msg = 'Failed to create monitored zone';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZone) return;
    try {
      setError(null);
      const requestPayload: UpdateZoneRequest = {
        name: formData.name,
        category: formData.category,
        status: formData.status,
        baselineDate: formData.baselineDate || undefined,
        baselineImageUrl: formData.baselineImageUrl || undefined,
        baselineImageRef: formData.baselineImageRef || undefined,
        monitoringTracks: {
          optical: { enabled: formData.opticalTrackEnabled },
          sar: { enabled: formData.sarTrackEnabled },
        },
      };
      const updated = await zoneService.updateZone(selectedZone.id, requestPayload);
      setSuccessMsg('Monitored zone updated successfully');
      setUiMode('view');
      fetchZones();
      setSelectedZone(updated);
    } catch (err: unknown) {
      let msg = 'Failed to update monitored zone';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    }
  };

  const handleSuspendClick = async (id: string) => {
    if (!window.confirm('Are you sure you want to suspend this monitored zone?')) return;
    try {
      setError(null);
      const updated = await zoneService.suspendZone(id);
      setSuccessMsg('Zone suspended successfully');
      fetchZones();
      setSelectedZone(updated);
    } catch (err: unknown) {
      let msg = 'Failed to suspend zone';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    }
  };

  const startEditing = () => {
    if (!selectedZone) return;
    setUiMode('edit');
    setFormData({
      name: selectedZone.name,
      category: selectedZone.category,
      status: selectedZone.status,
      baselineDate: selectedZone.baselineDate ? selectedZone.baselineDate.split('T')[0] : '',
      baselineImageUrl: selectedZone.baselineImageUrl || '',
      baselineImageRef: selectedZone.baselineImageRef || '',
      opticalTrackEnabled: selectedZone.monitoringTracks?.optical?.enabled ?? true,
      sarTrackEnabled: selectedZone.monitoringTracks?.sar?.enabled ?? false,
    });
  };

  const computeZoneCadastralMetrics = (zone: ZoneDto) => {
    const coords: [number, number][] =
      zone.boundary.type === 'MultiPolygon'
        ? ((zone.boundary.coordinates as [number, number][][][])[0]?.[0] || []).map(
            ([lng, lat]) => [lng, lat],
          )
        : ((zone.boundary.coordinates as [number, number][][])[0] || []).map(
            ([lng, lat]) => [lng, lat],
          );

    const vertexCount = coords.length;
    if (vertexCount < 3) {
      return {
        areaHectares: 0,
        areaKm2: 0,
        perimeterKm: 0,
        vertexCount: 0,
        bbox: null,
        coords: [] as [number, number][],
      };
    }

    const R = 6378137;
    let areaM2 = 0;
    let perimeterM = 0;
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    for (let i = 0; i < coords.length; i++) {
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[(i + 1) % coords.length];

      minLat = Math.min(minLat, lat1);
      maxLat = Math.max(maxLat, lat1);
      minLng = Math.min(minLng, lng1);
      maxLng = Math.max(maxLng, lng1);

      const radLat1 = (lat1 * Math.PI) / 180;
      const radLat2 = (lat2 * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      areaM2 += dLng * (2 + Math.sin(radLat1) + Math.sin(radLat2));

      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      perimeterM += R * c;
    }

    areaM2 = Math.abs((areaM2 * R * R) / 2);
    const areaHectares = areaM2 / 10000;
    const areaKm2 = areaM2 / 1000000;
    const perimeterKm = perimeterM / 1000;

    return {
      areaHectares: Number(areaHectares.toFixed(2)),
      areaKm2: Number(areaKm2.toFixed(3)),
      perimeterKm: Number(perimeterKm.toFixed(2)),
      vertexCount,
      bbox: { minLat, maxLat, minLng, maxLng },
      coords,
    };
  };

  // ─── Render Zone Directory (Entry UX) ─────────────────────
  if (!selectedZone && !isDrawing && uiMode === 'view') {
    return (
      <div style={{ padding: SPACE.xl, maxWidth: 1400, margin: '0 auto' }}>
        <ZoneWorkspaceDirectory
          moduleTitle="MONITORED AREAS"
          moduleSubtitle="Geospatial monitoring zone boundaries, category classifications, and operational status."
          moduleBadge="CADASTRAL REGISTRY"
          department="GEOSPATIAL MONITORING & SURVEILLANCE DIVISION"
          zones={zones}
          loading={loading}
          onSelectZone={(zid) => {
            setSearchParams({ zoneId: zid });
            const match = zones.find((z) => z.id === zid);
            if (match) handleZoneSelect(match);
          }}
          actionLabel="INSPECT AREA & CADASTRE →"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
          headerActions={
            canCreate ? (
              <button
                onClick={handleStartDrawing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: SPACE.xs,
                  padding: '9px 18px',
                  backgroundColor: COLORS.primary,
                  color: '#FFFFFF',
                  borderRadius: RADII.md,
                  border: 'none',
                  fontSize: FONT.sizeSm,
                  fontWeight: FONT.weightSemibold,
                  cursor: 'pointer',
                  boxShadow: SHADOWS.sm,
                }}
              >
                + Register New Zone
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const zoneMetrics = selectedZone ? computeZoneCadastralMetrics(selectedZone) : null;

  // ─── Render GIS Workstation ─────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 108px)',
        gap: SPACE.lg,
        animation: 'fadeIn 0.25s ease',
      }}
    >
      {/* ── Zone Context Header ── */}
      {selectedZone && (
        <ZoneContextHeader
          zone={selectedZone}
          onClearZone={() => {
            setSelectedZone(null);
            setSearchParams({});
          }}
          currentModule="Monitored Areas"
          currentModulePath="/areas"
        />
      )}

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
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: 4 }}>
            <button
              onClick={() => {
                setSelectedZone(null);
                setSearchParams({});
              }}
              style={{
                padding: '4px 10px',
                backgroundColor: '#F1F5F9',
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADII.md,
                color: COLORS.textMuted,
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightSemibold,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ← All Zones
            </button>
          </div>
          <h1
            style={{ fontSize: FONT.size3xl, fontWeight: FONT.weightBold, color: COLORS.primary }}
          >
            {selectedZone ? `${selectedZone.name} — Cadastral Workspace` : 'Monitored Areas & Zones'}
            {zones.length > 0 && (
              <span
                style={{
                  fontSize: FONT.sizeSm,
                  fontWeight: FONT.weightSemibold,
                  color: COLORS.accent,
                  backgroundColor: '#D1FAE5',
                  padding: '3px 9px',
                  borderRadius: RADII.full,
                  marginLeft: SPACE.md,
                }}
              >
                {zones.length}
              </span>
            )}
          </h1>
          <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '3px' }}>
            Geospatial zone boundaries · Category classification · Enforcement status monitoring
          </p>
        </div>

        {canCreate && uiMode === 'view' && !isDrawing && (
          <button
            onClick={handleStartDrawing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
              padding: '9px 18px',
              backgroundColor: COLORS.primary,
              color: '#FFF',
              border: 'none',
              borderRadius: RADII.md,
              fontWeight: FONT.weightSemibold,
              fontSize: FONT.sizeLg,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Draw Zone Boundary
          </button>
        )}
      </div>

      {/* ── Notifications ── */}
      {error && <ErrorState message={error} onRetry={fetchZones} />}
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

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: SPACE.md, flexShrink: 0, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search zones by name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: '1 1 180px',
            padding: '7px 12px',
            fontSize: FONT.sizeMd,
            borderRadius: RADII.md,
            border: `1px solid #CBD5E1`,
            backgroundColor: COLORS.surface,
            color: COLORS.text,
            outline: 'none',
          }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '7px 12px',
            fontSize: FONT.sizeMd,
            borderRadius: RADII.md,
            border: `1px solid #CBD5E1`,
            backgroundColor: COLORS.surface,
            color: COLORS.text,
            outline: 'none',
          }}
        >
          <option value="">All Categories</option>
          {Object.values(ZoneCategory).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_STYLES[c].label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '7px 12px',
            fontSize: FONT.sizeMd,
            borderRadius: RADII.md,
            border: `1px solid #CBD5E1`,
            backgroundColor: COLORS.surface,
            color: COLORS.text,
            outline: 'none',
          }}
        >
          <option value="">All Statuses</option>
          {Object.values(ZoneStatus).map((s) => (
            <option key={s} value={s}>
              {STATUS_STYLES[s].label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Main content: map left + panel right ── */}
      <div style={{ display: 'flex', flex: 1, gap: SPACE.lg, minHeight: 0 }}>
        {/* ── Left: Map + Zone List ── */}
        <div
          style={{ display: 'flex', flexDirection: 'column', flex: 7, gap: SPACE.lg, minHeight: 0 }}
        >
          {/* Map */}
          <div
            style={{
              flex: 3,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.lg,
              overflow: 'hidden',
              position: 'relative',
              minHeight: '300px',
              boxShadow: SHADOWS.sm,
            }}
          >
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ width: '100%', height: '100%', zIndex: 1 }}
            >
              <MapController center={mapCenter} zoom={mapZoom} bounds={mapBounds} />
              <MapDrawingEvents
                isDrawing={isDrawing}
                drawingPoints={drawingPoints}
                onPointAdd={handlePointAdd}
              />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {zones.map((z) => {
                const centerLatLng = getZoneCenterLatLng(z);
                const isSelected = selectedZone?.id === z.id;
                const style = CATEGORY_STYLES[z.category];
                const polyStyle = {
                  color: isSelected
                    ? '#1B4332'
                    : z.status === ZoneStatus.SUSPENDED
                      ? '#4b5563'
                      : style.color,
                  fillColor: style.color,
                  fillOpacity: isSelected ? 0.45 : 0.25,
                  weight: isSelected ? 3 : 2,
                  dashArray: z.status === ZoneStatus.SUSPENDED ? '5, 5' : undefined,
                };
                const polyPoints: [number, number][] =
                  z.boundary.type === 'MultiPolygon'
                    ? ((z.boundary.coordinates as [number, number][][][])[0]?.[0] || []).map(
                        ([lngPoint, latPoint]) => [latPoint, lngPoint],
                      )
                    : ((z.boundary.coordinates as [number, number][][])[0] || []).map(
                        ([lngPoint, latPoint]) => [latPoint, lngPoint],
                      );
                return (
                  <div key={z.id}>
                    <Polygon
                      positions={polyPoints}
                      eventHandlers={{ click: () => handleZoneSelect(z) }}
                      pathOptions={polyStyle}
                    />
                    <Marker
                      position={centerLatLng}
                      eventHandlers={{ click: () => handleZoneSelect(z) }}
                    >
                      <Popup>
                        <strong>{z.name}</strong>
                        <br />
                        Category: {style.label}
                        <br />
                        Status: {STATUS_STYLES[z.status].label}
                      </Popup>
                    </Marker>
                  </div>
                );
              })}

              {isDrawing && drawingPoints.length > 0 && (
                <>
                  {drawingPoints.map((pt, idx) => (
                    <Marker key={idx} position={pt} />
                  ))}
                  {drawingPoints.length >= 2 && (
                    <Polygon
                      positions={drawingPoints}
                      pathOptions={{ color: '#ef4444', dashArray: '5, 5', fillOpacity: 0.15 }}
                    />
                  )}
                </>
              )}
            </MapContainer>

            {/* Drawing mode overlay */}
            {isDrawing && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor: '#FFF',
                  boxShadow: SHADOWS.md,
                  borderRadius: RADII.md,
                  padding: '10px 14px',
                  zIndex: 10,
                  fontSize: FONT.sizeSm,
                  border: `1px solid ${COLORS.dangerBorder}`,
                }}
              >
                <div
                  style={{
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.dangerText,
                    display: 'flex',
                    alignItems: 'center',
                    gap: SPACE.sm,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: COLORS.dangerText,
                    }}
                  />
                  Drawing Mode Active
                </div>
                <div style={{ color: COLORS.textMuted, marginTop: '4px' }}>
                  Click map to place vertices · Points: {drawingPoints.length}
                </div>
                <div style={{ display: 'flex', gap: SPACE.sm, marginTop: SPACE.sm }}>
                  <button
                    onClick={handleUndoPoint}
                    disabled={drawingPoints.length === 0}
                    style={{
                      padding: '4px 8px',
                      fontSize: FONT.sizeXs,
                      borderRadius: RADII.sm,
                      border: `1px solid ${COLORS.border}`,
                      cursor: drawingPoints.length === 0 ? 'not-allowed' : 'pointer',
                      backgroundColor: COLORS.surfaceAlt,
                    }}
                  >
                    Undo Point
                  </button>
                  <button
                    onClick={handleCancelDrawing}
                    style={{
                      padding: '4px 8px',
                      fontSize: FONT.sizeXs,
                      borderRadius: RADII.sm,
                      border: `1px solid ${COLORS.border}`,
                      cursor: 'pointer',
                      backgroundColor: COLORS.surfaceAlt,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Map Legend */}
            <MapLegend title="Zone Categories" items={MAP_LEGEND_ITEMS} position="bottom-left" />
          </div>

          {/* Zone List */}
          <div
            style={{
              flex: 2,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.lg,
              overflow: 'hidden',
              minHeight: 0,
              boxShadow: SHADOWS.sm,
            }}
          >
            <div
              style={{
                padding: `${SPACE.md} ${SPACE.lg}`,
                borderBottom: `1px solid ${COLORS.border}`,
                flexShrink: 0,
                backgroundColor: '#F8FAFB',
              }}
            >
              <span
                style={{
                  fontSize: FONT.sizeMd,
                  fontWeight: FONT.weightSemibold,
                  color: COLORS.primary,
                }}
              >
                Zone List
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <Loading message="Loading zones..." size="sm" />
              ) : zones.length === 0 ? (
                <EmptyState
                  title="No monitoring zones available."
                  description="Create a protected zone to begin monitoring."
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
                      }}
                    >
                      {['Zone ID', 'Name', 'Category', 'Status', 'Sensor Tracks', 'Centroid'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 12px',
                            fontWeight: FONT.weightSemibold,
                            color: COLORS.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((z) => {
                      const isSelected = selectedZone?.id === z.id;
                      return (
                        <tr
                          key={z.id}
                          onClick={() => handleZoneSelect(z)}
                          style={{
                            borderBottom: `1px solid ${COLORS.borderLight}`,
                            cursor: 'pointer',
                            backgroundColor: isSelected ? '#ECFDF5' : 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected)
                              (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = isSelected
                              ? '#ECFDF5'
                              : '';
                          }}
                        >
                          <td
                            style={{
                              padding: '9px 12px',
                              fontFamily: 'monospace',
                              color: COLORS.accent,
                              fontWeight: FONT.weightMedium,
                            }}
                          >
                            {z.zoneId}
                          </td>
                          <td
                            style={{
                              padding: '9px 12px',
                              fontWeight: FONT.weightSemibold,
                              color: COLORS.text,
                            }}
                          >
                            {z.name}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span
                              style={{
                                fontSize: FONT.sizeXs,
                                fontWeight: FONT.weightSemibold,
                                color: CATEGORY_STYLES[z.category].color,
                                backgroundColor: '#F0FFF4',
                                padding: '2px 7px',
                                borderRadius: RADII.full,
                              }}
                            >
                              {CATEGORY_STYLES[z.category].label}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <StatusBadge
                              label={STATUS_STYLES[z.status].label}
                              variant={STATUS_STYLES[z.status].variant}
                              dot
                            />
                          </td>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: FONT.weightSemibold,
                                  padding: '2px 7px',
                                  borderRadius: RADII.full,
                                  backgroundColor: (z.monitoringTracks?.optical?.enabled ?? true) ? '#DCFCE7' : '#F1F5F9',
                                  color: (z.monitoringTracks?.optical?.enabled ?? true) ? '#166534' : '#64748B',
                                  border: `1px solid ${(z.monitoringTracks?.optical?.enabled ?? true) ? '#BBF7D0' : '#E2E8F0'}`,
                                }}
                              >
                                {(z.monitoringTracks?.optical?.enabled ?? true) ? '● Optical' : '○ Optical Off'}
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: FONT.weightSemibold,
                                  padding: '2px 7px',
                                  borderRadius: RADII.full,
                                  backgroundColor: (z.monitoringTracks?.sar?.enabled ?? false) ? '#F3E8FF' : '#F1F5F9',
                                  color: (z.monitoringTracks?.sar?.enabled ?? false) ? '#7E22CE' : '#64748B',
                                  border: `1px solid ${(z.monitoringTracks?.sar?.enabled ?? false) ? '#D8B4FE' : '#E2E8F0'}`,
                                }}
                              >
                                {(z.monitoringTracks?.sar?.enabled ?? false) ? '● SAR' : '○ SAR Off'}
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '9px 12px',
                              color: COLORS.textMuted,
                              fontSize: FONT.sizeXs,
                              fontFamily: 'monospace',
                            }}
                          >
                            {z.centerPoint.coordinates[0].toFixed(4)},{' '}
                            {z.centerPoint.coordinates[1].toFixed(4)}
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

        {/* ── Right: Detail / Form Panel ── */}
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
          {/* Create form */}
          {uiMode === 'create' && (
            <form
              onSubmit={handleCreateSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg, padding: SPACE.xl }}
            >
              <div>
                <h3
                  style={{
                    fontSize: FONT.sizeXl,
                    fontWeight: FONT.weightBold,
                    color: COLORS.primary,
                  }}
                >
                  Save Monitored Zone
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '3px' }}>
                  Complete the form below to save the drawn boundary
                </p>
              </div>
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: COLORS.infoBg,
                  border: `1px solid #BFDBFE`,
                  borderRadius: RADII.md,
                  fontSize: FONT.sizeSm,
                  color: COLORS.infoText,
                }}
              >
                Vertices collected: <strong>{drawingPoints.length}</strong> — minimum 3 required
              </div>
              <div>
                <label style={formLbl}>Zone Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mudumalai North Sector"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={formInp}
                />
              </div>
              <div>
                <label style={formLbl}>Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value as ZoneCategory })
                  }
                  style={{ ...formInp, cursor: 'pointer' }}
                >
                  {Object.values(ZoneCategory).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_STYLES[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={formLbl}>Baseline Date</label>
                <input
                  type="date"
                  value={formData.baselineDate}
                  onChange={(e) => setFormData({ ...formData, baselineDate: e.target.value })}
                  style={formInp}
                />
              </div>
              <div>
                <label style={formLbl}>Baseline Image Reference ID</label>
                <input
                  type="text"
                  placeholder="e.g. Sentinel-2 Image ID"
                  value={formData.baselineImageRef}
                  onChange={(e) => setFormData({ ...formData, baselineImageRef: e.target.value })}
                  style={formInp}
                />
              </div>

              {/* Monitoring Tracks Configuration */}
              <div
                style={{
                  borderTop: `1px solid ${COLORS.border}`,
                  paddingTop: SPACE.md,
                  marginTop: SPACE.xs,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: SPACE.md,
                }}
              >
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.primary }}>
                  Monitoring Tracks Configuration
                </div>

                {/* Optical Track Toggle */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px 12px',
                    backgroundColor: COLORS.surfaceAlt,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADII.md,
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      color: COLORS.text,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.opticalTrackEnabled}
                      onChange={(e) =>
                        setFormData({ ...formData, opticalTrackEnabled: e.target.checked })
                      }
                      style={{ width: '16px', height: '16px', accentColor: COLORS.primary, cursor: 'pointer' }}
                    />
                    Enable Optical Monitoring Track (Sentinel-2 / Landsat)
                  </label>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: '24px' }}>
                    Multispectral optical change detection. Dependent on clear sky conditions.
                  </span>
                </div>

                {/* SAR Track Toggle */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px 12px',
                    backgroundColor: formData.sarTrackEnabled ? '#F0FDF4' : COLORS.surfaceAlt,
                    border: `1px solid ${formData.sarTrackEnabled ? '#BBF7D0' : COLORS.border}`,
                    borderRadius: RADII.md,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      color: formData.sarTrackEnabled ? COLORS.successText : COLORS.text,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.sarTrackEnabled}
                      onChange={(e) =>
                        setFormData({ ...formData, sarTrackEnabled: e.target.checked })
                      }
                      style={{ width: '16px', height: '16px', accentColor: COLORS.accent, cursor: 'pointer' }}
                    />
                    Enable Sentinel-1 SAR Monitoring Track
                  </label>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: '24px', lineHeight: 1.4 }}>
                    Independent C-Band radar monitoring track. Operates all-weather through cloud cover and precipitation.
                    Does not act as an optical fallback; maintains its own independent baseline and cursor.
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: SPACE.md, marginTop: SPACE.sm }}>
                <button
                  type="button"
                  onClick={handleCancelDrawing}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: RADII.md,
                    border: `1px solid ${COLORS.border}`,
                    cursor: 'pointer',
                    backgroundColor: COLORS.surfaceAlt,
                    color: COLORS.textMuted,
                    fontWeight: FONT.weightMedium,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={drawingPoints.length < 3}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: RADII.md,
                    border: 'none',
                    backgroundColor: drawingPoints.length < 3 ? '#94a3b8' : COLORS.primary,
                    color: '#FFF',
                    fontWeight: FONT.weightSemibold,
                    cursor: drawingPoints.length < 3 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Save Zone
                </button>
              </div>
            </form>
          )}

          {/* Edit form */}
          {uiMode === 'edit' && selectedZone && (
            <form
              onSubmit={handleEditSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg, padding: SPACE.xl }}
            >
              <div>
                <h3
                  style={{
                    fontSize: FONT.sizeXl,
                    fontWeight: FONT.weightBold,
                    color: COLORS.primary,
                  }}
                >
                  Edit Zone Parameters
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '3px' }}>
                  {selectedZone.zoneId}
                </p>
              </div>
              <div>
                <label style={formLbl}>Zone Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={formInp}
                />
              </div>
              <div>
                <label style={formLbl}>Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value as ZoneCategory })
                  }
                  style={{ ...formInp, cursor: 'pointer' }}
                >
                  {Object.values(ZoneCategory).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_STYLES[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={formLbl}>Status *</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as ZoneStatus })
                  }
                  style={{ ...formInp, cursor: 'pointer' }}
                >
                  {Object.values(ZoneStatus).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_STYLES[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={formLbl}>Baseline Date</label>
                <input
                  type="date"
                  value={formData.baselineDate}
                  onChange={(e) => setFormData({ ...formData, baselineDate: e.target.value })}
                  style={formInp}
                />
              </div>
              <div>
                <label style={formLbl}>Baseline Image Reference</label>
                <input
                  type="text"
                  value={formData.baselineImageRef}
                  onChange={(e) => setFormData({ ...formData, baselineImageRef: e.target.value })}
                  style={formInp}
                />
              </div>

              {/* Monitoring Tracks Configuration */}
              <div
                style={{
                  borderTop: `1px solid ${COLORS.border}`,
                  paddingTop: SPACE.md,
                  marginTop: SPACE.xs,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: SPACE.md,
                }}
              >
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.primary }}>
                  Monitoring Tracks Configuration
                </div>

                {/* Optical Track Toggle */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px 12px',
                    backgroundColor: COLORS.surfaceAlt,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADII.md,
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      color: COLORS.text,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.opticalTrackEnabled}
                      onChange={(e) =>
                        setFormData({ ...formData, opticalTrackEnabled: e.target.checked })
                      }
                      style={{ width: '16px', height: '16px', accentColor: COLORS.primary, cursor: 'pointer' }}
                    />
                    Enable Optical Monitoring Track (Sentinel-2 / Landsat)
                  </label>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: '24px' }}>
                    Multispectral optical change detection. Dependent on clear sky conditions.
                  </span>
                </div>

                {/* SAR Track Toggle */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px 12px',
                    backgroundColor: formData.sarTrackEnabled ? '#F0FDF4' : COLORS.surfaceAlt,
                    border: `1px solid ${formData.sarTrackEnabled ? '#BBF7D0' : COLORS.border}`,
                    borderRadius: RADII.md,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightSemibold,
                      color: formData.sarTrackEnabled ? COLORS.successText : COLORS.text,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.sarTrackEnabled}
                      onChange={(e) =>
                        setFormData({ ...formData, sarTrackEnabled: e.target.checked })
                      }
                      style={{ width: '16px', height: '16px', accentColor: COLORS.accent, cursor: 'pointer' }}
                    />
                    Enable Sentinel-1 SAR Monitoring Track
                  </label>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: '24px', lineHeight: 1.4 }}>
                    Independent C-Band radar monitoring track. Operates all-weather through cloud cover and precipitation.
                    Does not act as an optical fallback; maintains its own independent baseline and cursor.
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: SPACE.md }}>
                <button
                  type="button"
                  onClick={() => setUiMode('view')}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: RADII.md,
                    border: `1px solid ${COLORS.border}`,
                    cursor: 'pointer',
                    backgroundColor: COLORS.surfaceAlt,
                    color: COLORS.textMuted,
                    fontWeight: FONT.weightMedium,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: RADII.md,
                    border: 'none',
                    backgroundColor: COLORS.primary,
                    color: '#FFF',
                    fontWeight: FONT.weightSemibold,
                    cursor: 'pointer',
                  }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* View details */}
          {uiMode === 'view' && selectedZone && (
            <div style={{ padding: SPACE.xl }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: SPACE.xl,
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: FONT.sizeXl,
                      fontWeight: FONT.weightBold,
                      color: COLORS.primary,
                    }}
                  >
                    {selectedZone.name}
                  </h3>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: FONT.sizeSm,
                      color: COLORS.accent,
                      marginTop: '2px',
                    }}
                  >
                    {selectedZone.zoneId}
                  </div>
                </div>
                <StatusBadge
                  label={STATUS_STYLES[selectedZone.status].label}
                  variant={STATUS_STYLES[selectedZone.status].variant}
                  dot
                />
              </div>

              <DetailRow label="Category" value={CATEGORY_STYLES[selectedZone.category].label} />
              <DetailRow
                label="Centroid (Lng, Lat)"
                value={`${selectedZone.centerPoint.coordinates[0].toFixed(6)}, ${selectedZone.centerPoint.coordinates[1].toFixed(6)}`}
              />
              {zoneMetrics && (
                <>
                  <DetailRow
                    label="Cadastral Area"
                    value={`${zoneMetrics.areaHectares.toLocaleString()} ha (${zoneMetrics.areaKm2} km²)`}
                  />
                  <DetailRow
                    label="Boundary Perimeter"
                    value={`${zoneMetrics.perimeterKm} km`}
                  />
                  <DetailRow
                    label="Boundary Vertices"
                    value={`${zoneMetrics.vertexCount} GeoJSON coordinates (${selectedZone.boundary.type})`}
                  />
                </>
              )}

              {/* Exact Polygon Coordinates */}
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
                    marginBottom: '6px',
                  }}
                >
                  Exact Polygon Coordinates (WGS84)
                </div>
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: RADII.sm,
                    padding: '8px 10px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#1E293B',
                    maxHeight: '140px',
                    overflowY: 'auto',
                    whiteSpace: 'pre',
                    lineHeight: 1.5,
                  }}
                >
                  {zoneMetrics?.coords && zoneMetrics.coords.length > 0
                    ? zoneMetrics.coords
                        .map(
                          ([lng, lat], idx) =>
                            `V${idx + 1}: Longitude: ${lng.toFixed(6)}°, Latitude: ${lat.toFixed(6)}°`,
                        )
                        .join('\n')
                    : JSON.stringify(selectedZone.boundary.coordinates)}
                </div>
              </div>
              <DetailRow
                label="Baseline Date"
                value={
                  selectedZone.baselineDate
                    ? new Date(selectedZone.baselineDate).toLocaleDateString('en-IN')
                    : 'Not specified'
                }
              />
              <DetailRow
                label="Baseline Image Ref"
                value={selectedZone.baselineImageRef || 'Not specified'}
              />
              <DetailRow
                label="Created By"
                value={`${selectedZone.createdBy.name} (${selectedZone.createdBy.email})`}
              />
              <DetailRow
                label="Created At"
                value={new Date(selectedZone.createdAt).toLocaleString('en-IN')}
              />
              <DetailRow
                label="Last Updated"
                value={new Date(selectedZone.updatedAt).toLocaleString('en-IN')}
              />

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
                    marginBottom: '6px',
                  }}
                >
                  Monitoring Tracks
                </div>
                <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightSemibold,
                      padding: '3px 8px',
                      borderRadius: RADII.full,
                      backgroundColor: (selectedZone.monitoringTracks?.optical?.enabled ?? true) ? '#DCFCE7' : '#F1F5F9',
                      color: (selectedZone.monitoringTracks?.optical?.enabled ?? true) ? '#166534' : '#64748B',
                      border: `1px solid ${(selectedZone.monitoringTracks?.optical?.enabled ?? true) ? '#BBF7D0' : '#E2E8F0'}`,
                    }}
                  >
                    {(selectedZone.monitoringTracks?.optical?.enabled ?? true) ? '● Optical Track Active' : '○ Optical Track Disabled'}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightSemibold,
                      padding: '3px 8px',
                      borderRadius: RADII.full,
                      backgroundColor: (selectedZone.monitoringTracks?.sar?.enabled ?? false) ? '#DCFCE7' : '#F1F5F9',
                      color: (selectedZone.monitoringTracks?.sar?.enabled ?? false) ? '#166534' : '#64748B',
                      border: `1px solid ${(selectedZone.monitoringTracks?.sar?.enabled ?? false) ? '#BBF7D0' : '#E2E8F0'}`,
                    }}
                  >
                    {(selectedZone.monitoringTracks?.sar?.enabled ?? false) ? '● SAR Track Active' : '○ SAR Track Disabled'}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: SPACE.sm,
                  marginTop: SPACE.md,
                }}
              >
                {canUpdate && (
                  <button
                    onClick={startEditing}
                    style={{
                      width: '100%',
                      padding: '9px',
                      borderRadius: RADII.md,
                      border: `1px solid ${COLORS.border}`,
                      cursor: 'pointer',
                      backgroundColor: COLORS.surfaceAlt,
                      color: COLORS.text,
                      fontWeight: FONT.weightSemibold,
                      fontSize: FONT.sizeLg,
                    }}
                  >
                    Edit Zone Parameters
                  </button>
                )}
                {canUpdate && selectedZone.status !== ZoneStatus.SUSPENDED && (
                  <button
                    onClick={() => handleSuspendClick(selectedZone.id)}
                    style={{
                      width: '100%',
                      padding: '9px',
                      borderRadius: RADII.md,
                      border: `1px solid #FED7AA`,
                      backgroundColor: '#FFF7ED',
                      color: '#C2410C',
                      cursor: 'pointer',
                      fontWeight: FONT.weightSemibold,
                      fontSize: FONT.sizeLg,
                    }}
                  >
                    Suspend Zone
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty panel */}
          {!selectedZone && uiMode === 'view' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: SPACE['2xl'],
                textAlign: 'center',
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
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                <line x1="9" y1="3" x2="9" y2="18" />
                <line x1="15" y1="6" x2="15" y2="21" />
              </svg>
              <h4
                style={{
                  fontSize: FONT.sizeLg,
                  fontWeight: FONT.weightSemibold,
                  color: COLORS.textMuted,
                }}
              >
                No Zone Selected
              </h4>
              <p
                style={{
                  fontSize: FONT.sizeSm,
                  color: COLORS.textLight,
                  marginTop: SPACE.sm,
                  lineHeight: 1.6,
                }}
              >
                Click a zone on the map or list to view its parameters and management options.
              </p>
            </div>
          )}
        </div>
      </div>



          </div>
  );
};

export default AreasPage;
