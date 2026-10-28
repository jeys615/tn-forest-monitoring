import React, { useState, useEffect, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import StatusBadge, { type BadgeVariant } from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Loading from '../../components/common/Loading';
import { temporaryAnalysisService } from '../../services/temporaryAnalysis.service';
import { useAuth } from '../../hooks/useAuth';
import { COLORS, FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import {
  GisWorkstation,
  GisMapViewer,
  GisBeforeAfterComparison,
  GisHistoricalTimeline,
  GisDetailPanel,
} from '../../components/gis';
import {
  TemporaryAreaStatus,
  MiningClassification,
  AlertSeverity,
  Permission,
  UserRole,
  GisMapMode,
  type TemporaryAreaDto,
  type TemporaryAreaAnalysisReportDto,
  type TemporaryAreaTimelineItemDto,
  type CreateTemporaryAreaRequest,
  type SatelliteMetadataDto,
} from '@tn-forest/shared/types';

import 'leaflet/dist/leaflet.css';

// Fix for Leaflet default icon paths in Vite
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;



interface MapDrawingEventsProps {
  isDrawing: boolean;
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

const getStatusBadgeVariant = (status: TemporaryAreaStatus): BadgeVariant => {
  switch (status) {
    case TemporaryAreaStatus.COMPLETED:
      return 'success';
    case TemporaryAreaStatus.PROCESSING:
      return 'warning';
    case TemporaryAreaStatus.FAILED:
      return 'danger';
    case TemporaryAreaStatus.ANALYSIS_REQUESTED:
      return 'info';
    default:
      return 'neutral';
  }
};

const getSeverityBadgeVariant = (severity: AlertSeverity | 'NONE'): BadgeVariant => {
  switch (severity) {
    case AlertSeverity.HIGH:
      return 'danger';
    case AlertSeverity.MEDIUM:
      return 'warning';
    case AlertSeverity.LOW:
      return 'info';
    default:
      return 'neutral';
  }
};

const getMiningClassLabel = (classification: MiningClassification): string => {
  switch (classification) {
    case MiningClassification.QUARRY_EXPANSION:
      return 'Quarry Expansion';
    case MiningClassification.EXCAVATION_EXPANSION:
      return 'Excavation Expansion';
    case MiningClassification.POSSIBLE_MINING_ACTIVITY:
      return 'Possible Mining Activity';
    case MiningClassification.STOCKPILE_CHANGE:
      return 'Stockpile / Overburden Change';
    case MiningClassification.BARE_SOIL_EXPOSURE:
      return 'Bare Soil Exposure';
    case MiningClassification.VEGETATION_CLEARANCE:
      return 'Vegetation Clearance';
    case MiningClassification.SURFACE_DISTURBANCE:
      return 'Surface Disturbance';
    default:
      return 'Non-Mining Fluctuation';
  }
};

export const TemporaryAnalysisPage: React.FC = () => {
  const { user } = useAuth();
  const canCreate =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.AREA_CREATE);
  const canRun =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.AREA_UPDATE);

  const [temporaryAreas, setTemporaryAreas] = useState<TemporaryAreaDto[]>([]);
  const [selectedArea, setSelectedArea] = useState<TemporaryAreaDto | null>(null);
  const [report, setReport] = useState<TemporaryAreaAnalysisReportDto | null>(null);
  const [observations, setObservations] = useState<SatelliteMetadataDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningAnalysis, setRunningAnalysis] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // GIS Map Mode & Comparison State
  const [gisMode, setGisMode] = useState<GisMapMode>(GisMapMode.SATELLITE);
  const [showComparisonModal, setShowComparisonModal] = useState<boolean>(false);
  const [showWorkstationModal, setShowWorkstationModal] = useState<boolean>(false);
  const [selectedTimelineStep, setSelectedTimelineStep] = useState<TemporaryAreaTimelineItemDto | null>(null);

  // New Request Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>('2026-03-31');
  const [reason, setReason] = useState<string>('');
  const [demEnabled, setDemEnabled] = useState<boolean>(false);
  const [depthMeters, setDepthMeters] = useState<number>(3.5);
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);

  const loadAreas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await temporaryAnalysisService.getTemporaryAreas();
      setTemporaryAreas(data);
      if (data.length > 0 && !selectedArea) {
        setSelectedArea(data[0]);
      }
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to load temporary monitoring areas');
    } finally {
      setLoading(false);
    }
  }, [selectedArea]);

  useEffect(() => {
    loadAreas();
  }, [loadAreas]);

  // Load report and observations when selected area changes
  useEffect(() => {
    if (!selectedArea) {
      setReport(null);
      setObservations([]);
      return;
    }

    temporaryAnalysisService
      .getHistoricalObservations(selectedArea.temporaryAreaId)
      .then((obs) => setObservations(obs))
      .catch((err) => console.error('Failed to load observations', err));

    if (selectedArea.status === TemporaryAreaStatus.COMPLETED) {
      temporaryAnalysisService
        .getReport(selectedArea.temporaryAreaId)
        .then((rep) => setReport(rep))
        .catch((err) => console.error('Failed to load report', err));
    } else {
      setReport(null);
    }
  }, [selectedArea]);

  const handleRunAnalysis = async () => {
    if (!selectedArea || !canRun) return;
    try {
      setRunningAnalysis(true);
      setActionMessage(null);
      const rep = await temporaryAnalysisService.runAnalysis(selectedArea.temporaryAreaId);
      setReport(rep);
      setActionMessage('Historical analysis & mining estimation completed successfully!');
      loadAreas();
    } catch (err: unknown) {
      console.error(err);
      setError('Historical analysis execution failed');
    } finally {
      setRunningAnalysis(false);
    }
  };

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (drawnPoints.length < 3) {
      setError('Please draw at least 3 points on the map to define the polygon boundary.');
      return;
    }

    // Close polygon
    const closedCoords = [...drawnPoints, drawnPoints[0]].map(([lat, lng]) => [lng, lat] as [number, number]);

    const payload: CreateTemporaryAreaRequest = {
      name,
      boundary: {
        type: 'Polygon',
        coordinates: [closedCoords],
      },
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      reason: reason || undefined,
      demElevationDataAvailable: demEnabled,
      estimatedMeanDepthMeters: demEnabled ? depthMeters : undefined,
    };

    try {
      setCreating(true);
      setError(null);
      const created = await temporaryAnalysisService.createTemporaryArea(payload);
      setShowCreateModal(false);
      setName('');
      setReason('');
      setDrawnPoints([]);
      setIsDrawing(false);
      setSelectedArea(created);
      setActionMessage(`Temporary area "${created.name}" created successfully!`);
      loadAreas();
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to create temporary monitoring area');
    } finally {
      setCreating(false);
    }
  };

  const handleUsePresetPolygon = () => {
    // Preset bounding box in monitored resource corridor
    setDrawnPoints([
      [11.20, 77.80],
      [11.20, 77.88],
      [11.28, 77.88],
      [11.28, 77.80],
    ]);
  };

  const handleDownloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Temporary-Analysis-Report-${report.temporaryArea.temporaryAreaId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl, padding: SPACE.xl }}>
      <PageHeader
        title="Temporary Area Analysis & Mining Activity Estimation"
        subtitle="Ad-hoc polygon analysis, multi-sensor historical time-series change tracking, and volumetric extraction estimation without modifying permanent zone baselines."
        actions={
          canCreate ? (
            <button
              onClick={() => {
                setShowCreateModal(true);
                setIsDrawing(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.sm,
                backgroundColor: COLORS.primary,
                color: '#fff',
                border: 'none',
                borderRadius: RADII.md,
                padding: '10px 18px',
                fontSize: FONT.sizeMd,
                fontWeight: FONT.weightSemibold,
                cursor: 'pointer',
                boxShadow: SHADOWS.sm,
              }}
            >
              + New Temporary Analysis
            </button>
          ) : undefined
        }
      />

      {/* Top Statistics Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: SPACE.lg,
        }}
      >
        <StatCard
          label="Total Temporary Areas"
          value={temporaryAreas.length}
          description="Independent ad-hoc zones"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>}
        />
        <StatCard
          label="Analysis Completed"
          value={temporaryAreas.filter((a) => a.status === TemporaryAreaStatus.COMPLETED).length}
          description="Historical time-series generated"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
        />
        <StatCard
          label="Pending Analysis"
          value={
            temporaryAreas.filter(
              (a) =>
                a.status === TemporaryAreaStatus.ANALYSIS_REQUESTED ||
                a.status === TemporaryAreaStatus.PROCESSING,
            ).length
          }
          description="Awaiting officer execution"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        />
        <StatCard
          label="Estimated Mining Volume"
          value={
            report?.summary?.totalEstimatedVolumeCubicMeters
              ? `${report.summary.totalEstimatedVolumeCubicMeters.toLocaleString()} m³`
              : 'DEM Guided'
          }
          description={report?.summary?.isVolumeAvailable ? 'Satellite-derived estimate' : 'DEM elevation required'}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9"/><path d="M15 13 9 7l4-4 6 6z"/></svg>}
        />
      </div>

      {actionMessage && (
        <div
          style={{
            padding: `${SPACE.md} ${SPACE.lg}`,
            backgroundColor: 'rgba(82, 183, 136, 0.15)',
            border: `1px solid ${COLORS.primary}`,
            borderRadius: RADII.md,
            color: '#1B4332',
            fontWeight: FONT.weightMedium,
          }}
        >
          {actionMessage}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      {loading ? (
        <Loading message="Loading temporary monitoring areas..." />
      ) : temporaryAreas.length === 0 ? (
        <EmptyState
          title="No Temporary Monitoring Areas"
          description="Create a temporary area request by drawing a polygon and selecting a historical date range."
          action={
            canCreate ? (
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  backgroundColor: COLORS.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: RADII.md,
                  padding: '8px 16px',
                  fontWeight: FONT.weightSemibold,
                  cursor: 'pointer',
                }}
              >
                Create Temporary Area
              </button>
            ) : undefined
          }
        />
      ) : (
        /* Main Layout Grid: Map + Area List & Details */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: SPACE.xl,
            alignItems: 'start',
          }}
        >
          {/* Left Column: Interactive Map & Area Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: RADII.lg,
                boxShadow: SHADOWS.sm,
                border: '1px solid #E5E7EB',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: `${SPACE.md} ${SPACE.lg}`,
                  borderBottom: '1px solid #E5E7EB',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: FONT.sizeLg,
                      fontWeight: FONT.weightBold,
                      color: '#111827',
                      margin: 0,
                    }}
                  >
                    Geospatial Boundary &amp; Footprint
                  </h3>
                  <span style={{ fontSize: FONT.sizeSm, color: '#6B7280' }}>
                    {selectedArea ? selectedArea.name : 'Select an area to view'}
                  </span>
                </div>
                {selectedArea && (
                  <StatusBadge
                    label={selectedArea.status}
                    variant={getStatusBadgeVariant(selectedArea.status)}
                  />
                )}
              </div>

              {/* Unified GIS Map Viewer */}
              <div style={{ height: '480px', width: '100%', position: 'relative' }}>
                {selectedArea ? (
                  <GisMapViewer
                    boundary={selectedArea.boundary}
                    areaName={selectedArea.name}
                    isPermanent={false}
                    activeMode={gisMode}
                    onModeChange={(m) => setGisMode(m)}
                    selectedResult={report?.results?.[0] || null}
                    changeDetection={report?.changes?.[0] || null}
                    miningEstimate={report?.miningEstimates?.[0] || null}
                    alerts={report?.alerts || []}
                    showComparisonToggle={!!report && report.timeline.length >= 2}
                    onOpenComparison={() => setShowComparisonModal(true)}
                  />
                ) : (
                  <div style={{ padding: SPACE.xl, textAlign: 'center', color: '#94a3b8' }}>
                    Select an area to load satellite GIS view
                  </div>
                )}
              </div>

              {/* Area List Selector */}
              <div style={{ padding: SPACE.md, maxHeight: '200px', overflowY: 'auto' }}>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: '#4B5563', marginBottom: SPACE.xs }}>
                  Select Temporary Request:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
                  {temporaryAreas.map((area) => (
                    <div
                      key={area.id}
                      onClick={() => setSelectedArea(area)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: RADII.md,
                        backgroundColor: selectedArea?.id === area.id ? 'rgba(82, 183, 136, 0.12)' : '#F9FAFB',
                        border: `1px solid ${selectedArea?.id === area.id ? COLORS.primary : '#E5E7EB'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: FONT.weightSemibold, fontSize: FONT.sizeMd, color: '#1F2937' }}>
                          {area.name}
                        </span>
                        <div style={{ fontSize: FONT.sizeXs, color: '#6B7280' }}>
                          {area.temporaryAreaId} • {area.areaHectares.toFixed(1)} ha • {area.startDate.slice(0, 10)} to {area.endDate.slice(0, 10)}
                        </div>
                      </div>
                      <StatusBadge label={area.status} variant={getStatusBadgeVariant(area.status)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Detailed Analysis Dashboard */}
          {selectedArea && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
              {/* Header Card with Trigger Action */}
              <div
                style={{
                  backgroundColor: '#fff',
                  borderRadius: RADII.lg,
                  padding: SPACE.lg,
                  boxShadow: SHADOWS.sm,
                  border: '1px solid #E5E7EB',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: '#111827', margin: 0 }}>
                      {selectedArea.name}
                    </h2>
                    <span style={{ fontSize: FONT.sizeSm, color: '#6B7280' }}>
                      ID: {selectedArea.temporaryAreaId} • Range: {selectedArea.startDate.slice(0, 10)} to {selectedArea.endDate.slice(0, 10)}
                    </span>
                    {selectedArea.reason && (
                      <p style={{ fontSize: FONT.sizeSm, color: '#4B5563', marginTop: SPACE.xs, marginBottom: 0 }}>
                        <em>Reason: {selectedArea.reason}</em>
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: SPACE.sm }}>
                    {selectedArea.status !== TemporaryAreaStatus.COMPLETED && canRun && (
                      <button
                        onClick={handleRunAnalysis}
                        disabled={runningAnalysis}
                        style={{
                          backgroundColor: COLORS.primary,
                          color: '#fff',
                          border: 'none',
                          borderRadius: RADII.md,
                          padding: '8px 16px',
                          fontSize: FONT.sizeMd,
                          fontWeight: FONT.weightSemibold,
                          cursor: runningAnalysis ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {runningAnalysis ? 'Analyzing Time-Series...' : 'Run Historical Analysis'}
                      </button>
                    )}
                    <button
                      onClick={() => setShowWorkstationModal(true)}
                      style={{
                        backgroundColor: '#1e293b',
                        color: '#38bdf8',
                        border: '1px solid #38bdf8',
                        borderRadius: RADII.md,
                        padding: '8px 14px',
                        fontSize: FONT.sizeSm,
                        fontWeight: FONT.weightBold,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                      Full GIS Workstation
                    </button>
                    {report && (
                      <button
                        onClick={handleDownloadReport}
                        style={{
                          backgroundColor: '#F3F4F6',
                          color: '#1F2937',
                          border: '1px solid #D1D5DB',
                          borderRadius: RADII.md,
                          padding: '8px 14px',
                          fontSize: FONT.sizeSm,
                          fontWeight: FONT.weightMedium,
                          cursor: 'pointer',
                        }}
                      >
                        Export Report JSON
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary Badges Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: SPACE.md,
                    marginTop: SPACE.md,
                    paddingTop: SPACE.md,
                    borderTop: '1px solid #F3F4F6',
                  }}
                >
                  <div>
                    <span style={{ fontSize: FONT.sizeXs, color: '#6B7280', textTransform: 'uppercase' }}>Total Area</span>
                    <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#111827' }}>
                      {selectedArea.areaHectares.toFixed(2)} ha
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: FONT.sizeXs, color: '#6B7280', textTransform: 'uppercase' }}>Observations Found</span>
                    <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#111827' }}>
                      {observations.length} Images
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: FONT.sizeXs, color: '#6B7280', textTransform: 'uppercase' }}>Baseline Status</span>
                    <div style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightSemibold, color: '#059669' }}>
                      Isolated Historical Ref
                    </div>
                  </div>
                </div>
              </div>

              {/* Mining Extraction & Volume Estimation Card */}
              {report && (
                <div
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: RADII.lg,
                    padding: SPACE.lg,
                    boxShadow: SHADOWS.sm,
                    border: '1px solid #E5E7EB',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md }}>
                    <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#111827', margin: 0 }}>
                      Mining &amp; Extraction Volumetric Estimation
                    </h3>
                    <StatusBadge
                      label={getMiningClassLabel(report.summary.primaryClassification)}
                      variant={
                        report.summary.primaryClassification === MiningClassification.EXCAVATION_EXPANSION ||
                        report.summary.primaryClassification === MiningClassification.QUARRY_EXPANSION
                          ? 'danger'
                          : 'warning'
                      }
                    />
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: SPACE.md,
                      padding: SPACE.md,
                      backgroundColor: '#FFFBEB',
                      borderRadius: RADII.md,
                      border: '1px solid #FDE68A',
                      marginBottom: SPACE.md,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: FONT.sizeXs, color: '#92400E', fontWeight: FONT.weightSemibold }}>
                        Cumulative Changed Area
                      </span>
                      <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: '#78350F' }}>
                        {report.summary.totalCumulativeChangedAreaHectares.toFixed(2)} ha
                      </div>
                      <span style={{ fontSize: FONT.sizeXs, color: '#B45309' }}>
                        ({(report.summary.totalCumulativeChangedAreaHectares * 10000).toLocaleString()} m²)
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: FONT.sizeXs, color: '#92400E', fontWeight: FONT.weightSemibold }}>
                        Estimated Volume
                      </span>
                      <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: '#78350F' }}>
                        {report.summary.isVolumeAvailable && report.summary.totalEstimatedVolumeCubicMeters
                          ? `${report.summary.totalEstimatedVolumeCubicMeters.toLocaleString()} m³`
                          : 'Unavailable'}
                      </div>
                      <span style={{ fontSize: FONT.sizeXs, color: '#B45309' }}>
                        {report.summary.isVolumeAvailable ? 'DEM Elevation Diff' : 'Elevation data required'}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: FONT.sizeXs, color: '#92400E', fontWeight: FONT.weightSemibold }}>
                        Evidence Strength
                      </span>
                      <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: '#78350F' }}>
                        {report.summary.maxEvidenceStrength} / 100
                      </div>
                      <StatusBadge
                        label={`Severity: ${report.summary.overallSeverity}`}
                        variant={getSeverityBadgeVariant(report.summary.overallSeverity)}
                      />
                    </div>
                  </div>

                  {/* Scientific Disclaimer Alert */}
                  <div
                    style={{
                      padding: SPACE.md,
                      backgroundColor: '#F3F4F6',
                      borderRadius: RADII.sm,
                      fontSize: FONT.sizeXs,
                      color: '#4B5563',
                      borderLeft: `4px solid ${COLORS.primary}`,
                    }}
                  >
                    <strong>Notice:</strong> {report.summary.disclaimer}
                  </div>
                </div>
              )}

              {/* GIS Inspection Detail Panel */}
              {selectedArea && (
                <GisDetailPanel
                  areaName={selectedArea.name}
                  calculationResult={report?.results?.[0] || null}
                  miningEstimate={report?.miningEstimates?.[0] || null}
                  alert={report?.alerts?.[0] || null}
                />
              )}

              {/* Time-Series Chronological Expansion Stepper */}
              {report && report.timeline.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: RADII.lg,
                    padding: SPACE.lg,
                    boxShadow: SHADOWS.sm,
                    border: '1px solid #E5E7EB',
                  }}
                >
                  <GisHistoricalTimeline
                    timeline={report.timeline}
                    selectedStepNumber={selectedTimelineStep?.stepNumber}
                    onSelectStep={(item) => setSelectedTimelineStep(item)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Before / After Satellite Environmental Comparison Modal */}
      {showComparisonModal && selectedArea && report && report.timeline.length >= 2 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: SPACE.lg,
          }}
        >
          <div
            style={{
              width: '95vw',
              maxWidth: '1200px',
              height: '85vh',
              backgroundColor: '#0f172a',
              borderRadius: RADII.xl,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: SHADOWS.lg,
            }}
          >
            <GisBeforeAfterComparison
              boundary={selectedArea.boundary}
              areaName={selectedArea.name}
              beforeDate={report.timeline[0].observationDate.slice(0, 10) + ' (Baseline Reference)'}
              beforeSource={report.timeline[0].satelliteSource}
              beforeSensor={report.timeline[0].sensorType}
              currentDate={
                report.timeline[report.timeline.length - 1].observationDate.slice(0, 10) +
                ' (Recent Change Event)'
              }
              currentSource={report.timeline[report.timeline.length - 1].satelliteSource}
              calculationResult={
                report.results
                  ? report.results[report.results.length - 1] || report.results[0]
                  : null
              }
              timelineItem={report.timeline[report.timeline.length - 1]}
              onClose={() => setShowComparisonModal(false)}
            />
          </div>
        </div>
      )}

      {/* Full-Screen GIS Workstation Modal */}
      {showWorkstationModal && selectedArea && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(2, 6, 23, 0.95)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: SPACE.lg,
          }}
        >
          <div
            style={{
              width: '96vw',
              maxWidth: '1400px',
              height: '90vh',
              backgroundColor: '#0f172a',
              borderRadius: RADII.lg,
              boxShadow: SHADOWS.lg,
              border: '1px solid #334155',
              overflow: 'hidden',
            }}
          >
            <GisWorkstation
              boundary={selectedArea.boundary}
              areaName={selectedArea.name}
              areaId={selectedArea.temporaryAreaId}
              isPermanent={false}
              totalAreaHectares={selectedArea.areaHectares}
              totalAreaM2={selectedArea.areaHectares * 10000}
              timeline={report?.timeline || []}
              results={report?.results || []}
              changes={report?.changes || []}
              miningEstimates={report?.miningEstimates || []}
              alerts={report?.alerts || []}
              onClose={() => setShowWorkstationModal(false)}
            />
          </div>
        </div>
      )}

      {/* New Temporary Analysis Request Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: SPACE.xl,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: RADII.xl,
              width: '100%',
              maxWidth: '850px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: SPACE.xl,
              boxShadow: SHADOWS.lg,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg }}>
              <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, margin: 0, color: '#111827' }}>
                Create Temporary Monitoring Request
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: FONT.sizeXl, cursor: 'pointer', color: '#6B7280' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateArea} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                <div>
                  <label style={{ display: 'block', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium, marginBottom: SPACE.xs }}>
                    Area Reference / Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salem Mining Corridor Sector 4"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADII.md, border: '1px solid #D1D5DB' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium, marginBottom: SPACE.xs }}>
                    Investigation Reason (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Unsanctioned granite extraction verification"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADII.md, border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                <div>
                  <label style={{ display: 'block', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium, marginBottom: SPACE.xs }}>
                    Historical Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADII.md, border: '1px solid #D1D5DB' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium, marginBottom: SPACE.xs }}>
                    Historical End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: RADII.md, border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              {/* DEM Elevation Parameters */}
              <div style={{ padding: SPACE.md, backgroundColor: '#F9FAFB', borderRadius: RADII.md, border: '1px solid #E5E7EB' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, cursor: 'pointer', fontWeight: FONT.weightMedium }}>
                  <input
                    type="checkbox"
                    checked={demEnabled}
                    onChange={(e) => setDemEnabled(e.target.checked)}
                  />
                  Enable 3D DEM / Surface Elevation Volumetric Calculation
                </label>
                {demEnabled && (
                  <div style={{ marginTop: SPACE.sm, display: 'flex', alignItems: 'center', gap: SPACE.md }}>
                    <label style={{ fontSize: FONT.sizeSm, color: '#4B5563' }}>
                      Estimated Mean Excavation Bench Depth (meters):
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="100"
                      value={depthMeters}
                      onChange={(e) => setDepthMeters(Number(e.target.value))}
                      style={{ width: '100px', padding: '6px 10px', borderRadius: RADII.md, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                )}
              </div>

              {/* Map Drawing Box */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xs }}>
                  <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium }}>
                    Draw Boundary Polygon on Map ({drawnPoints.length} vertices selected)
                  </span>
                  <div style={{ display: 'flex', gap: SPACE.sm }}>
                    <button
                      type="button"
                      onClick={handleUsePresetPolygon}
                      style={{
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        border: '1px solid #C7D2FE',
                        borderRadius: RADII.sm,
                        padding: '4px 10px',
                        fontSize: FONT.sizeXs,
                        cursor: 'pointer',
                      }}
                    >
                      Use Sample Corridor
                    </button>
                    {drawnPoints.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDrawnPoints([])}
                        style={{
                          background: '#FEE2E2',
                          color: '#DC2626',
                          border: '1px solid #FCA5A5',
                          borderRadius: RADII.sm,
                          padding: '4px 10px',
                          fontSize: FONT.sizeXs,
                          cursor: 'pointer',
                        }}
                      >
                        Clear Points
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ height: '280px', width: '100%', borderRadius: RADII.md, overflow: 'hidden', border: '1px solid #D1D5DB' }}>
                  <MapContainer center={[11.25, 77.85]} zoom={11} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <MapDrawingEvents isDrawing={isDrawing} onPointAdd={(pt) => setDrawnPoints((prev) => [...prev, pt])} />
                    {drawnPoints.length > 0 && (
                      <Polygon positions={drawnPoints} pathOptions={{ color: '#E65100', fillColor: '#FFB74D', fillOpacity: 0.4 }} />
                    )}
                  </MapContainer>
                </div>
                <span style={{ fontSize: FONT.sizeXs, color: '#6B7280', marginTop: '4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  Click on the map to place polygon vertices. At least 3 points required.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md, marginTop: SPACE.md }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    backgroundColor: '#F3F4F6',
                    border: '1px solid #D1D5DB',
                    borderRadius: RADII.md,
                    padding: '8px 16px',
                    fontSize: FONT.sizeMd,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || drawnPoints.length < 3}
                  style={{
                    backgroundColor: COLORS.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: RADII.md,
                    padding: '8px 20px',
                    fontSize: FONT.sizeMd,
                    fontWeight: FONT.weightSemibold,
                    cursor: creating || drawnPoints.length < 3 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creating ? 'Creating Request...' : 'Submit Analysis Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemporaryAnalysisPage;
