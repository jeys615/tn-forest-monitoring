import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import StatusBadge, { type BadgeVariant } from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { changeService } from '../../services/change.service';
import { zoneService } from '../../services/zone.service';
import { satelliteService } from '../../services/satellite.service';
import { useAuth } from '../../hooks/useAuth';
import { COLORS, FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import {
  GisWorkstation,
  GisBeforeAfterComparison,
} from '../../components/gis';
import { SatelliteImageViewerModal } from '../../components/satellite';
import type { ChangeComparisonMetadataDto } from '../../services/change.service';
import {
  SensorType,
  AlertSeverity,
  ComparisonMode,
  Permission,
  UserRole,
  type ChangeDetectionDto,
  type ZoneDto,
  type SatelliteMetadataDto,
} from '@tn-forest/shared/types';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';
import { ZoneWorkspaceDirectory } from '../../components/common/ZoneWorkspaceDirectory';
import { DateRangeFilter } from '../../components/common/DateRangeFilter';

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

export const ChangesPage: React.FC = () => {
  const { user } = useAuth();
  const canDetect =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.AREA_UPDATE);

  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);

  const {
    zoneId: selectedZoneId,
    selectedZone,
    isZoneInvalid,
    startDate,
    endDate,
    datePreset,
    setZoneId: setSelectedZoneId,
    setDatePreset,
    setDateRange,
    clearZone,
    clearDateFilter,
  } = useZoneScopedParams(zones, zonesLoaded);

  const [selectedSensorType, setSelectedSensorType] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedComparisonMode, setSelectedComparisonMode] = useState<string>('ALL');

  const [changes, setChanges] = useState<ChangeDetectionDto[]>([]);
  const [selectedChange, setSelectedChange] = useState<ChangeDetectionDto | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Trigger Modal state
  const [showDetectModal, setShowDetectModal] = useState<boolean>(false);
  const [detectZoneId, setDetectZoneId] = useState<string>('');
  const [zoneObservations, setZoneObservations] = useState<SatelliteMetadataDto[]>([]);
  const [detectObservationId, setDetectObservationId] = useState<string>('');
  const [detectLoading, setDetectLoading] = useState<boolean>(false);

  // GIS Map Viewer & Comparison States
  const [showGisMapModal, setShowGisMapModal] = useState<boolean>(false);
  const [showComparisonModal, setShowComparisonModal] = useState<boolean>(false);

  // Satellite Imagery Viewer & Comparison Metadata States
  const [comparisonMeta, setComparisonMeta] = useState<ChangeComparisonMetadataDto | null>(null);
  const [_metaLoading, setMetaLoading] = useState<boolean>(false);
  const [showSatelliteViewerModal, setShowSatelliteViewerModal] = useState<boolean>(false);
  const [satelliteViewerMode, setSatelliteViewerMode] = useState<
    'BASELINE' | 'CURRENT' | 'SIDE_BY_SIDE' | 'SLIDER'
  >('SIDE_BY_SIDE');

  // Load Zones
  useEffect(() => {
    zoneService
      .getZones()
      .then((data) => {
        setZones(data);
        setZonesLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load zones', err);
        setZonesLoaded(true);
      });
  }, []);

  // Fetch changes
  const fetchChanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: {
        zoneId?: string;
        sensorType?: SensorType;
        severity?: AlertSeverity | 'NONE';
        comparisonMode?: string;
        fromDate?: string;
        toDate?: string;
      } = {};
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (selectedSensorType !== 'ALL') filters.sensorType = selectedSensorType as SensorType;
      if (selectedSeverity !== 'ALL') filters.severity = selectedSeverity as AlertSeverity | 'NONE';
      if (selectedComparisonMode !== 'ALL') filters.comparisonMode = selectedComparisonMode;
      if (startDate) filters.fromDate = startDate;
      if (endDate) filters.toDate = endDate;

      const data = await changeService.getChanges(filters);
      setChanges(data);
      setSelectedChange((prev) => {
        if (data.length === 0) return null;
        if (!prev || !data.some((c) => (c.id && c.id === prev.id) || (c.changeId && c.changeId === prev.changeId))) {
          return data[0];
        }
        return prev;
      });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to fetch change detection records';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, selectedSensorType, selectedSeverity, selectedComparisonMode, startDate, endDate]);

  useEffect(() => {
    fetchChanges();
  }, [fetchChanges]);

  // Fetch change comparison metadata whenever selectedChange changes
  useEffect(() => {
    if (selectedChange) {
      setMetaLoading(true);
      changeService
        .getComparisonMetadata(selectedChange.changeId || selectedChange.id)
        .then((meta) => {
          setComparisonMeta(meta);
        })
        .catch((err) => {
          console.error('Failed to load change comparison metadata', err);
          setComparisonMeta(null);
        })
        .finally(() => {
          setMetaLoading(false);
        });
    } else {
      setComparisonMeta(null);
    }
  }, [selectedChange]);

  // Load observations when modal zone changes
  useEffect(() => {
    if (detectZoneId) {
      satelliteService
        .getImages({ zoneId: detectZoneId })
        .then((items: SatelliteMetadataDto[]) => {
          setZoneObservations(items);
          if (items.length > 0) {
            setDetectObservationId(items[0].id);
          } else {
            setDetectObservationId('');
          }
        })
        .catch((err: unknown) => {
          console.error('Failed to load zone satellite imagery', err);
        });
    } else {
      setZoneObservations([]);
      setDetectObservationId('');
    }
  }, [detectZoneId]);

  const handleRunDetect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detectZoneId || !detectObservationId) return;

    setDetectLoading(true);
    setActionMessage(null);
    setError(null);

    try {
      const result = await changeService.detectChange({
        zoneId: detectZoneId,
        observationId: detectObservationId,
      });

      setActionMessage(
        `Change detection completed successfully (Affected: ${result.affectedAreaPercentage}%, Severity: ${result.severity})`,
      );
      setShowDetectModal(false);
      await fetchChanges();
      setSelectedChange(result);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to run change detection';
      setError(msg);
    } finally {
      setDetectLoading(false);
    }
  };

  // KPIs
  const totalChanges = changes.length;
  const highSeverityCount = changes.filter((c) => c.severity === AlertSeverity.HIGH).length;
  const mediumSeverityCount = changes.filter((c) => c.severity === AlertSeverity.MEDIUM).length;
  const alertsGeneratedCount = changes.filter((c) => c.alertGenerated).length;
  const hlsChangeCount = changes.filter((c) => c.comparisonMode === ComparisonMode.HLS).length;
  const nativeChangeCount = changes.filter((c) => c.comparisonMode === ComparisonMode.NATIVE).length;

  // ─── Render Zone Directory (Part J: Entry UX) ───────────────
  if (!selectedZone) {
    return (
      <div style={{ padding: SPACE.xl, maxWidth: 1400, margin: '0 auto' }}>
        <ZoneWorkspaceDirectory
          moduleTitle="CHANGE DETECTION"
          moduleSubtitle="Multi-temporal optical NDVI and Sentinel-1 SAR radar land-surface change detection across monitored zones."
          moduleBadge="SPECTRAL SURVEILLANCE"
          department="GEOSPATIAL MONITORING & SURVEILLANCE DIVISION"
          zones={zones}
          loading={!zonesLoaded}
          onSelectZone={(zid) => setSelectedZoneId(zid)}
          actionLabel="OPEN CHANGE DETECTION →"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          }
        />
      </div>
    );
  }

  // ─── Render Zone-Scoped Workspace ─────────────────────────────
  return (
    <div style={{ padding: SPACE.xl, maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title={`${selectedZone.name} — Change Detection`}
        subtitle="Multi-threshold environmental change detection, optical & SAR indicator analysis, and explainable evidence scoring."
        actions={
          canDetect && (
            <button
              onClick={() => {
                setShowDetectModal(true);
                if (selectedZoneId) setDetectZoneId(selectedZoneId);
                else if (zones.length > 0) setDetectZoneId(zones[0].id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.xs,
                padding: `${SPACE.sm} ${SPACE.lg}`,
                backgroundColor: COLORS.primary,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: RADII.md,
                fontWeight: FONT.weightSemibold,
                fontSize: FONT.sizeSm,
                cursor: 'pointer',
                boxShadow: SHADOWS.sm,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
              Run Change Detection
            </button>
          )
        }
      />

      {/* Zone Context Header */}
      <ZoneContextHeader
        zone={selectedZone}
        isInvalid={isZoneInvalid}
        invalidZoneId={selectedZoneId}
        onClearZone={clearZone}
        currentModule="Change Detection"
        currentModulePath="/changes"
      />

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: SPACE.md,
          marginBottom: SPACE.xl,
        }}
      >
        <StatCard
          label="Total Change Events"
          value={totalChanges}
          color={COLORS.primary}
          bgColor="#D1FAE5"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          }
        />
        <StatCard
          label="Alerts Generated"
          value={alertsGeneratedCount}
          color={alertsGeneratedCount > 0 ? COLORS.warningText : COLORS.successText}
          bgColor={alertsGeneratedCount > 0 ? COLORS.warningBg : COLORS.successBg}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          }
        />
        <StatCard
          label="High Severity (≥10%)"
          value={highSeverityCount}
          color={highSeverityCount > 0 ? COLORS.dangerText : COLORS.textMuted}
          bgColor={highSeverityCount > 0 ? COLORS.dangerBg : COLORS.neutralBg}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          }
        />
        <StatCard
          label="Medium Severity (5-10%)"
          value={mediumSeverityCount}
          color={mediumSeverityCount > 0 ? COLORS.warningText : COLORS.textMuted}
          bgColor={mediumSeverityCount > 0 ? COLORS.warningBg : COLORS.neutralBg}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          }
        />
        <StatCard
          label="HLS Cross-Sensor"
          value={hlsChangeCount}
          color={hlsChangeCount > 0 ? '#7c3aed' : COLORS.textMuted}
          bgColor={hlsChangeCount > 0 ? '#f3e8ff' : COLORS.neutralBg}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
              <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
              <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
            </svg>
          }
        />
        <StatCard
          label="Native Optical"
          value={nativeChangeCount}
          color={COLORS.primary}
          bgColor={COLORS.accentLight}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="4"></circle>
              <line x1="21.17" y1="8" x2="12" y2="8"></line>
              <line x1="3.95" y1="6.06" x2="8.54" y2="14"></line>
              <line x1="10.88" y1="21.94" x2="15.46" y2="14"></line>
            </svg>
          }
        />
      </div>

      {/* Action / Error Banner */}
      {actionMessage && (
        <div
          style={{
            padding: SPACE.md,
            backgroundColor: COLORS.successBg,
            color: COLORS.successText,
            borderRadius: RADII.md,
            marginBottom: SPACE.lg,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={fetchChanges} />}

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: SPACE.md,
          padding: SPACE.md,
          backgroundColor: COLORS.surface,
          borderRadius: RADII.lg,
          border: `1px solid ${COLORS.border}`,
          marginBottom: SPACE.xl,
          alignItems: 'center',
        }}
      >
        <ZoneSelector
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
        />

        <DateRangeFilter
          preset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={setDatePreset}
          onCustomRangeChange={setDateRange}
          onClear={clearDateFilter}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: FONT.sizeXs,
              color: COLORS.textMuted,
              fontWeight: FONT.weightSemibold,
            }}
          >
            SENSOR TRACK
          </label>
          <select
            value={selectedSensorType}
            onChange={(e) => setSelectedSensorType(e.target.value)}
            style={{
              padding: `${SPACE.xs} ${SPACE.sm}`,
              borderRadius: RADII.md,
              border: `1px solid ${COLORS.neutralBorder}`,
              fontSize: FONT.sizeSm,
            }}
          >
            <option value="ALL">All Sensors</option>
            <option value={SensorType.OPTICAL}>Optical Track (S2 / L8 / L9)</option>
            <option value={SensorType.SAR}>SAR Track (Sentinel-1)</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: FONT.sizeXs,
              color: COLORS.textMuted,
              fontWeight: FONT.weightSemibold,
            }}
          >
            SEVERITY
          </label>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            style={{
              padding: `${SPACE.xs} ${SPACE.sm}`,
              borderRadius: RADII.md,
              border: `1px solid ${COLORS.neutralBorder}`,
              fontSize: FONT.sizeSm,
            }}
          >
            <option value="ALL">All Severities</option>
            <option value={AlertSeverity.HIGH}>High (≥ 10%)</option>
            <option value={AlertSeverity.MEDIUM}>Medium (5 - 10%)</option>
            <option value={AlertSeverity.LOW}>Low (2 - 5%)</option>
            <option value="NONE">None (&lt; 2%)</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: FONT.sizeXs,
              color: COLORS.textMuted,
              fontWeight: FONT.weightSemibold,
            }}
          >
            COMPARISON MODE
          </label>
          <select
            value={selectedComparisonMode}
            onChange={(e) => setSelectedComparisonMode(e.target.value)}
            style={{
              padding: `${SPACE.xs} ${SPACE.sm}`,
              borderRadius: RADII.md,
              border: `1px solid ${COLORS.neutralBorder}`,
              fontSize: FONT.sizeSm,
            }}
          >
            <option value="ALL">All Modes</option>
            <option value={ComparisonMode.NATIVE}>Native Optical (Same-Sensor)</option>
            <option value={ComparisonMode.HLS}>Cross-Sensor Harmonized Analysis (HLS)</option>
          </select>
        </div>
      </div>

      {/* Main Content Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
          gap: SPACE.xl,
          alignItems: 'start',
        }}
      >
        {/* Change History Table */}
        <div
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: RADII.lg,
            border: `1px solid ${COLORS.border}`,
            boxShadow: SHADOWS.sm,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: `${SPACE.md} ${SPACE.lg}`,
              borderBottom: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.surfaceAlt,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: FONT.sizeMd,
                fontWeight: FONT.weightSemibold,
                color: COLORS.text,
              }}
            >
              Change Detection Events ({changes.length})
            </h3>
          </div>

          {loading ? (
            <div style={{ padding: SPACE['3xl'], textAlign: 'center', color: COLORS.textMuted }}>
              Loading change detections...
            </div>
          ) : changes.length === 0 ? (
            <EmptyState
              title="No Change Detections Found"
              description="Run change detection on an acquired satellite observation against its active baseline."
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr
                    style={{
                      backgroundColor: COLORS.surfaceAlt,
                      borderBottom: `1px solid ${COLORS.border}`,
                      fontSize: FONT.sizeXs,
                      color: COLORS.textMuted,
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>Change ID</th>
                    <th style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>Sensor / Source</th>
                    <th style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>Affected Area</th>
                    <th style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>Severity</th>
                    <th style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>Evidence Strength</th>
                    <th style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => {
                    const isSelected = selectedChange?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedChange(c)}
                        style={{
                          borderBottom: `1px solid ${COLORS.border}`,
                          backgroundColor: isSelected ? 'rgba(27, 67, 50, 0.08)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
                          fontSize: FONT.sizeSm,
                        }}
                      >
                        <td style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: FONT.weightBold }}>{c.changeId}</span>
                            {c.auditStatus === 'INVALID_FOR_PRODUCTION_GEOMETRY' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: FONT.weightBold,
                                  padding: '1px 6px',
                                  borderRadius: RADII.sm,
                                  backgroundColor: '#FEE2E2',
                                  color: '#991B1B',
                                  border: '1px solid #FCA5A5',
                                }}
                                title="Incompatible SAR relative orbit pair audited as invalid for production geometry"
                              >
                                INVALID GEOMETRY AUDIT
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                            {new Date(c.detectedAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: FONT.weightSemibold }}>{c.sensorType}</span>
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                              {c.source}
                            </div>
                            {c.comparisonMode === ComparisonMode.HLS && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '10px',
                                  fontWeight: FONT.weightBold,
                                  padding: '1px 5px',
                                  borderRadius: RADII.sm,
                                  backgroundColor: '#f3e8ff',
                                  color: '#7c3aed',
                                  border: '1px solid #ddd6fe',
                                  width: 'fit-content',
                                }}
                                title="NASA HLS V2.0 Cross-Sensor Comparison (S30/L30 harmonized to 30m grid)"
                              >
                                HLS
                              </span>
                            )}
                            {c.comparisonMode === ComparisonMode.NATIVE && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '10px',
                                  fontWeight: FONT.weightBold,
                                  padding: '1px 5px',
                                  borderRadius: RADII.sm,
                                  backgroundColor: '#dcfce7',
                                  color: '#166534',
                                  border: '1px solid #bbf7d0',
                                  width: 'fit-content',
                                }}
                                title="Native same-sensor optical comparison"
                              >
                                NATIVE
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>
                          <span
                            style={{
                              fontWeight: FONT.weightBold,
                              color:
                                c.affectedAreaPercentage >= 10
                                  ? COLORS.dangerText
                                  : c.affectedAreaPercentage >= 5
                                    ? COLORS.warningText
                                    : COLORS.text,
                            }}
                          >
                            {c.affectedAreaPercentage}%
                          </span>
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                            {c.changedArea} ha / {c.zoneArea} ha
                          </div>
                        </td>
                        <td style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>
                          <StatusBadge
                            variant={getSeverityBadgeVariant(c.severity)}
                            label={c.severity}
                          />
                        </td>
                        <td style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div
                              style={{
                                width: 40,
                                height: 6,
                                backgroundColor: COLORS.border,
                                borderRadius: 3,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${c.evidenceStrength}%`,
                                  height: '100%',
                                  backgroundColor:
                                    c.evidenceStrength >= 75
                                      ? COLORS.successText
                                      : c.evidenceStrength >= 50
                                        ? COLORS.warningText
                                        : COLORS.dangerText,
                                }}
                              />
                            </div>
                            <span style={{ fontWeight: FONT.weightSemibold }}>
                              {c.evidenceStrength}/100
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: `${SPACE.sm} ${SPACE.md}` }}>
                          {c.alertGenerated ? (
                            <StatusBadge variant="danger" label="ALERT" />
                          ) : (
                            <StatusBadge variant="neutral" label="NONE" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Change Detail Panel */}
        <div
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: RADII.lg,
            border: `1px solid ${COLORS.border}`,
            boxShadow: SHADOWS.sm,
            padding: SPACE.lg,
          }}
        >
          {selectedChange ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: SPACE.md,
                  borderBottom: `1px solid ${COLORS.border}`,
                  paddingBottom: SPACE.sm,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: FONT.sizeLg,
                      fontWeight: FONT.weightBold,
                      color: COLORS.text,
                    }}
                  >
                    {selectedChange.changeId}
                  </h3>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    Detected: {new Date(selectedChange.detectedAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                  <button
                    onClick={() => setShowGisMapModal(true)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#1b4332',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: RADII.sm,
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightBold,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                    GIS Map
                  </button>
                  <button
                    onClick={() => setShowComparisonModal(true)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#52b788',
                      color: '#0f2b1e',
                      border: 'none',
                      borderRadius: RADII.sm,
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightBold,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Before / After
                  </button>
                  <button
                    onClick={() => {
                      setSatelliteViewerMode('SIDE_BY_SIDE');
                      setShowSatelliteViewerModal(true);
                    }}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#2d6a4f',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: RADII.sm,
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightBold,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                    Satellite Imagery
                  </button>
                  <StatusBadge
                    variant={getSeverityBadgeVariant(selectedChange.severity)}
                    label={`SEVERITY: ${selectedChange.severity}`}
                  />
                </div>
              </div>

              {selectedChange.auditStatus === 'INVALID_FOR_PRODUCTION_CROSS_SENSOR' && (
                <div
                  style={{
                    padding: `${SPACE.sm} ${SPACE.md}`,
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: RADII.md,
                    marginBottom: SPACE.md,
                    fontSize: FONT.sizeXs,
                  }}
                >
                  <div style={{ fontWeight: FONT.weightBold, color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    AUDIT STATUS: INVALID_FOR_PRODUCTION_CROSS_SENSOR
                  </div>
                  <div style={{ color: '#7F1D1D', marginTop: '4px', lineHeight: 1.4 }}>
                    This HLS cross-sensor comparison was audited as invalid for production use. The detection does not meet the minimum eligibility criteria for alert generation.
                  </div>
                </div>
              )}

              {/* ── HLS CROSS-SENSOR ANALYSIS CARD ──────────────────────────── */}
              {selectedChange.comparisonMode === ComparisonMode.HLS && (
                <div
                  style={{
                    padding: SPACE.md,
                    backgroundColor: '#faf5ff',
                    border: '2px solid #c4b5fd',
                    borderRadius: RADII.lg,
                    marginBottom: SPACE.md,
                  }}
                >
                  {/* Card header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: SPACE.sm,
                      flexWrap: 'wrap',
                      gap: SPACE.xs,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          backgroundColor: '#7c3aed',
                          color: '#ffffff',
                          borderRadius: RADII.sm,
                          fontSize: '11px',
                          fontWeight: FONT.weightBold,
                          letterSpacing: '0.04em',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                        HLS CROSS-SENSOR ANALYSIS
                      </span>
                      {selectedChange.hlsVersion && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: RADII.sm,
                            backgroundColor: '#ede9fe',
                            color: '#5b21b6',
                            fontWeight: FONT.weightSemibold,
                          }}
                        >
                          NASA HLS {selectedChange.hlsVersion}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '10px',
                        color: COLORS.textMuted,
                        fontFamily: 'monospace',
                      }}
                    >
                      {selectedChange.baselineHlsRepresentationId
                        ? `Baseline Rep: …${selectedChange.baselineHlsRepresentationId.slice(-8)}`
                        : ''}
                    </span>
                  </div>

                  {/* Baseline ↔ Current sensor grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      gap: SPACE.xs,
                      marginBottom: SPACE.sm,
                      alignItems: 'center',
                    }}
                  >
                    {/* Baseline panel */}
                    <div
                      style={{
                        padding: SPACE.sm,
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: RADII.md,
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: FONT.weightBold, color: '#1d4ed8', marginBottom: 4 }}>
                        BASELINE
                      </div>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.text }}>
                        {selectedChange.baselineSensor ?? 'Sentinel-2'}
                      </div>
                      <div style={{ fontSize: '10px', color: COLORS.textMuted, marginTop: 2 }}>
                        S30 (HLS Sentinel Product)
                      </div>
                      {selectedChange.baselineHlsImageId && (
                        <div
                          style={{
                            fontSize: '10px',
                            color: COLORS.textMuted,
                            marginTop: 2,
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={selectedChange.baselineHlsImageId}
                        >
                          {selectedChange.baselineHlsImageId.split('/').pop() ?? selectedChange.baselineHlsImageId}
                        </div>
                      )}
                      {selectedChange.baselineHlsRepresentationId && (
                        <div style={{ fontSize: '10px', color: '#6366f1', marginTop: 2, fontFamily: 'monospace' }}>
                          Rep: …{selectedChange.baselineHlsRepresentationId.slice(-8)}
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <div style={{ textAlign: 'center', color: '#7c3aed', fontSize: FONT.sizeLg, fontWeight: FONT.weightBold }}>
                      →
                    </div>

                    {/* Current panel */}
                    <div
                      style={{
                        padding: SPACE.sm,
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: RADII.md,
                      }}
                    >
                      <div style={{ fontSize: '10px', fontWeight: FONT.weightBold, color: '#047857', marginBottom: 4 }}>
                        CURRENT
                      </div>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.text }}>
                        {selectedChange.currentSensor ?? 'Landsat-8'}
                      </div>
                      <div style={{ fontSize: '10px', color: COLORS.textMuted, marginTop: 2 }}>
                        L30 (HLS Landsat Product)
                      </div>
                      {selectedChange.currentHlsImageId && (
                        <div
                          style={{
                            fontSize: '10px',
                            color: COLORS.textMuted,
                            marginTop: 2,
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={selectedChange.currentHlsImageId}
                        >
                          {selectedChange.currentHlsImageId.split('/').pop() ?? selectedChange.currentHlsImageId}
                        </div>
                      )}
                      {selectedChange.currentHlsRepresentationId && (
                        <div style={{ fontSize: '10px', color: '#6366f1', marginTop: 2, fontFamily: 'monospace' }}>
                          Rep: …{selectedChange.currentHlsRepresentationId.slice(-8)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Analysis Grid */}
                  {selectedChange.analysisGrid && (
                    <div
                      style={{
                        padding: SPACE.sm,
                        backgroundColor: '#ede9fe',
                        border: '1px solid #ddd6fe',
                        borderRadius: RADII.md,
                        marginBottom: SPACE.sm,
                        fontSize: FONT.sizeXs,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: SPACE.md,
                      }}
                    >
                      <div>
                        <span style={{ color: COLORS.textMuted }}>CRS: </span>
                        <span style={{ fontWeight: FONT.weightBold, fontFamily: 'monospace' }}>
                          {selectedChange.analysisGrid.crs}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: COLORS.textMuted }}>Resolution: </span>
                        <span style={{ fontWeight: FONT.weightBold }}>
                          {selectedChange.analysisGrid.pixelSizeX ?? 30} m
                        </span>
                      </div>
                      {selectedChange.analysisGrid.width && selectedChange.analysisGrid.height && (
                        <div>
                          <span style={{ color: COLORS.textMuted }}>Grid: </span>
                          <span style={{ fontWeight: FONT.weightBold }}>
                            {selectedChange.analysisGrid.width} × {selectedChange.analysisGrid.height} px
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pixel-level comparison metrics */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                      gap: SPACE.xs,
                      marginBottom: SPACE.sm,
                      fontSize: FONT.sizeXs,
                    }}
                  >
                    <div style={{ padding: SPACE.xs, backgroundColor: COLORS.surface, border: '1px solid #e9d5ff', borderRadius: RADII.sm }}>
                      <div style={{ color: COLORS.textMuted }}>Valid Pixels</div>
                      <div style={{ fontWeight: FONT.weightBold, color: COLORS.text }}>
                        {selectedChange.opticalRasterStatistics?.validComparisonPixelCount?.toLocaleString() ?? '—'}
                      </div>
                    </div>
                    <div style={{ padding: SPACE.xs, backgroundColor: '#FEF2F2', border: '1px solid #fecaca', borderRadius: RADII.sm }}>
                      <div style={{ color: COLORS.textMuted }}>Changed Pixels</div>
                      <div style={{ fontWeight: FONT.weightBold, color: COLORS.dangerText }}>
                        {selectedChange.opticalRasterStatistics?.changedPixelCount?.toLocaleString() ?? '—'}
                      </div>
                    </div>
                    <div style={{ padding: SPACE.xs, backgroundColor: COLORS.surface, border: '1px solid #e9d5ff', borderRadius: RADII.sm }}>
                      <div style={{ color: COLORS.textMuted }}>Changed Area</div>
                      <div style={{ fontWeight: FONT.weightBold, color: COLORS.text }}>
                        {selectedChange.changedArea} ha
                      </div>
                    </div>
                    <div style={{ padding: SPACE.xs, backgroundColor: COLORS.dangerBg, border: '1px solid #fecaca', borderRadius: RADII.sm }}>
                      <div style={{ color: COLORS.textMuted }}>Affected</div>
                      <div
                        style={{
                          fontWeight: FONT.weightBold,
                          color:
                            selectedChange.affectedAreaPercentage >= 10
                              ? COLORS.dangerText
                              : selectedChange.affectedAreaPercentage >= 5
                                ? COLORS.warningText
                                : COLORS.text,
                        }}
                      >
                        {selectedChange.affectedAreaPercentage}%
                      </div>
                    </div>
                  </div>

                  {/* NDVI threshold */}
                  {selectedChange.opticalThresholdConfig && (
                    <div
                      style={{
                        padding: `${SPACE.xs} ${SPACE.sm}`,
                        backgroundColor: '#ede9fe',
                        borderRadius: RADII.sm,
                        marginBottom: SPACE.xs,
                        fontSize: '11px',
                        display: 'flex',
                        gap: SPACE.md,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        <span style={{ color: COLORS.textMuted }}>NDVI Threshold: </span>
                        <span style={{ fontWeight: FONT.weightBold, fontFamily: 'monospace' }}>
                          {selectedChange.opticalThresholdConfig.ndviThreshold ?? '—'}
                        </span>
                      </span>
                      {selectedChange.opticalRasterStatistics?.meanDeltaNdvi !== undefined && (
                        <span>
                          <span style={{ color: COLORS.textMuted }}>Mean ΔNDVI: </span>
                          <span style={{ fontWeight: FONT.weightBold, color: COLORS.dangerText, fontFamily: 'monospace' }}>
                            {selectedChange.opticalRasterStatistics.meanDeltaNdvi.toFixed(4)}
                          </span>
                        </span>
                      )}
                      {selectedChange.opticalRasterStatistics?.medianDeltaNdvi !== undefined && (
                        <span>
                          <span style={{ color: COLORS.textMuted }}>Median ΔNDVI: </span>
                          <span style={{ fontWeight: FONT.weightBold, color: COLORS.dangerText, fontFamily: 'monospace' }}>
                            {selectedChange.opticalRasterStatistics.medianDeltaNdvi.toFixed(4)}
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Audit status */}
                  <div style={{ fontSize: '10px', color: COLORS.textMuted, display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', marginTop: 4 }}>
                    <span>
                      Audit:{' '}
                      <span
                        style={{
                          fontWeight: FONT.weightBold,
                          color:
                            selectedChange.auditStatus === 'CONFIRMED' || selectedChange.auditStatus === 'VALID'
                              ? COLORS.successText
                              : selectedChange.auditStatus?.startsWith('INVALID')
                                ? COLORS.dangerText
                                : COLORS.textMuted,
                        }}
                      >
                        {selectedChange.auditStatus ?? 'N/A'}
                      </span>
                    </span>
                    {selectedChange.processingVersion && (
                      <span>Pipeline: <span style={{ fontFamily: 'monospace' }}>{selectedChange.processingVersion}</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Audit Status Banner — invalid SAR geometry */}
              {selectedChange.auditStatus === 'INVALID_FOR_PRODUCTION_GEOMETRY' && (
                <div
                  style={{
                    padding: `${SPACE.sm} ${SPACE.md}`,
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: RADII.md,
                    marginBottom: SPACE.md,
                    fontSize: FONT.sizeXs,
                  }}
                >
                  <div style={{ fontWeight: FONT.weightBold, color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    AUDIT STATUS: INVALID_FOR_PRODUCTION_GEOMETRY
                  </div>
                  <div style={{ color: '#7F1D1D', marginTop: '4px', lineHeight: 1.4 }}>
                    This change detection evaluated an incompatible SAR relative orbit pair (Track 92 baseline vs Track 165 current). Differing incidence angles (~11° variance) produce false-positive backscatter variations across topography. For production forest disturbance monitoring, identical relative orbit tracks are required.
                  </div>
                </div>
              )}

              {/* Spatial Calculation Mode Banner */}
              <div
                style={{
                  padding: `${SPACE.sm} ${SPACE.md}`,
                  backgroundColor:
                    selectedChange.calculationMode === 'REAL'
                      ? '#ecfdf5'
                      : COLORS.neutralBg,
                  borderRadius: RADII.md,
                  marginBottom: SPACE.md,
                  border: `1px solid ${selectedChange.calculationMode === 'REAL' ? '#a7f3d0' : COLORS.border}`,
                  fontSize: FONT.sizeXs,
                  color: COLORS.text,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: SPACE.xs,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: RADII.sm,
                      fontSize: '11px',
                      fontWeight: FONT.weightBold,
                      backgroundColor:
                        selectedChange.calculationMode === 'REAL' ? '#059669' : '#64748b',
                      color: '#ffffff',
                    }}
                  >
                    {selectedChange.calculationMode === 'REAL'
                      ? '✓ REAL SATELLITE RASTER'
                      : 'SIMULATED / DERIVED'}
                  </span>
                  <span style={{ fontWeight: FONT.weightSemibold }}>
                    {selectedChange.calculationMode === 'REAL'
                      ? 'Real Satellite Raster Analysis (Confirmed Changed-Pixel Mask)'
                      : 'Derived / Simulated Spectral Indicators'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: COLORS.textMuted, fontFamily: 'monospace' }}>
                  CRS: EPSG:32643 • Resolution: 10m • GEE Telemetry Export
                </div>
              </div>

              {/* Observation Image Pair & Temporal Comparison Section */}
              <div
                style={{
                  backgroundColor: COLORS.surfaceAlt,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADII.lg,
                  padding: SPACE.md,
                  marginBottom: SPACE.md,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: SPACE.sm,
                    flexWrap: 'wrap',
                    gap: SPACE.xs,
                  }}
                >
                  <span
                    style={{
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightBold,
                      textTransform: 'uppercase',
                      color: COLORS.primaryDark,
                      letterSpacing: '0.05em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                    Verified Satellite Observation Pair
                  </span>
                  {comparisonMeta?.temporalGap && (
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: RADII.full,
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        fontWeight: FONT.weightBold,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Gap: {comparisonMeta.temporalGap.formatted}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: SPACE.sm,
                    marginBottom: SPACE.sm,
                  }}
                >
                  {/* Baseline Card */}
                  <div
                    style={{
                      backgroundColor: COLORS.surface,
                      border: '1px solid #bfdbfe',
                      borderRadius: RADII.md,
                      padding: SPACE.sm,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: FONT.weightBold,
                            color: '#1d4ed8',
                            backgroundColor: '#eff6ff',
                            padding: '1px 6px',
                            borderRadius: RADII.sm,
                          }}
                        >
                          BASELINE REFERENCE
                        </span>
                        <span style={{ fontSize: '11px', color: COLORS.textMuted }}>
                          {comparisonMeta?.baseline?.source || comparisonMeta?.baseline?.spacecraftName || selectedChange.source}
                        </span>
                      </div>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.text }}>
                        {comparisonMeta?.baseline?.acquisitionDate
                          ? new Date(comparisonMeta.baseline.acquisitionDate).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Baseline Reference'}
                        <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightNormal, color: COLORS.textMuted, marginLeft: 6 }}>
                          {comparisonMeta?.baseline?.acquisitionTimeUtc
                            ? `${new Date(comparisonMeta.baseline.acquisitionTimeUtc).toISOString().slice(11, 16)} UTC`
                            : ''}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: COLORS.textMuted,
                          marginTop: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                        }}
                        title={comparisonMeta?.baseline?.imageId || ''}
                      >
                        {comparisonMeta?.baseline?.imageId
                          ? comparisonMeta.baseline.imageId.split('/').pop()
                          : 'Baseline Imagery'}
                      </div>
                      <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: 2 }}>
                        Cloud: <b>{comparisonMeta?.baseline?.cloudCover?.toFixed(2) ?? '0.00'}%</b> • {comparisonMeta?.baseline?.resolutionMeters || 30}m Res
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSatelliteViewerMode('BASELINE');
                        setShowSatelliteViewerModal(true);
                      }}
                      style={{
                        marginTop: SPACE.sm,
                        width: '100%',
                        padding: '5px 8px',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #93c5fd',
                        borderRadius: RADII.sm,
                        fontSize: FONT.sizeXs,
                        fontWeight: FONT.weightSemibold,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      View Baseline Image
                    </button>
                  </div>

                  {/* Current Observation Card */}
                  <div
                    style={{
                      backgroundColor: COLORS.surface,
                      border: '1px solid #a7f3d0',
                      borderRadius: RADII.md,
                      padding: SPACE.sm,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: FONT.weightBold,
                            color: '#047857',
                            backgroundColor: '#ecfdf5',
                            padding: '1px 6px',
                            borderRadius: RADII.sm,
                          }}
                        >
                          CURRENT OBSERVATION
                        </span>
                        <span style={{ fontSize: '11px', color: COLORS.textMuted }}>
                          {comparisonMeta?.current?.source || comparisonMeta?.current?.spacecraftName || selectedChange.source}
                        </span>
                      </div>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.text }}>
                        {comparisonMeta?.current?.acquisitionDate
                          ? new Date(comparisonMeta.current.acquisitionDate).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : new Date(selectedChange.detectedAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                        <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightNormal, color: COLORS.textMuted, marginLeft: 6 }}>
                          {comparisonMeta?.current?.acquisitionTimeUtc
                            ? `${new Date(comparisonMeta.current.acquisitionTimeUtc).toISOString().slice(11, 16)} UTC`
                            : ''}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: COLORS.textMuted,
                          marginTop: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                        }}
                        title={comparisonMeta?.current?.imageId || ''}
                      >
                        {comparisonMeta?.current?.imageId
                          ? comparisonMeta.current.imageId.split('/').pop()
                          : 'Sentinel-2 L2A'}
                      </div>
                      <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: 2 }}>
                        Cloud: <b>{comparisonMeta?.current?.cloudCover?.toFixed(2) ?? '0.00'}%</b> • {comparisonMeta?.current?.resolutionMeters || 10}m Res
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSatelliteViewerMode('CURRENT');
                        setShowSatelliteViewerModal(true);
                      }}
                      style={{
                        marginTop: SPACE.sm,
                        width: '100%',
                        padding: '5px 8px',
                        backgroundColor: '#ecfdf5',
                        color: '#047857',
                        border: '1px solid #6ee7b7',
                        borderRadius: RADII.sm,
                        fontSize: FONT.sizeXs,
                        fontWeight: FONT.weightSemibold,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      View Current Image
                    </button>
                  </div>
                </div>

                {/* Compare Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    gap: SPACE.xs,
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    onClick={() => {
                      setSatelliteViewerMode('SIDE_BY_SIDE');
                      setShowSatelliteViewerModal(true);
                    }}
                    style={{
                      padding: '5px 12px',
                      backgroundColor: '#1b4332',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: RADII.sm,
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                    Side-by-Side Dual View
                  </button>
                  <button
                    onClick={() => {
                      setSatelliteViewerMode('SLIDER');
                      setShowSatelliteViewerModal(true);
                    }}
                    style={{
                      padding: '5px 12px',
                      backgroundColor: '#2d6a4f',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: RADII.sm,
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>↔️</span> Curtain Slider
                  </button>
                </div>
              </div>

              {/* Directional SAR Backscatter Analysis Matrix */}
              {selectedChange.rasterStatistics && (
                <div
                  style={{
                    padding: SPACE.md,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: RADII.md,
                    marginBottom: SPACE.md,
                  }}
                >
                  <div
                    style={{
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightBold,
                      color: COLORS.primaryDark,
                      textTransform: 'uppercase',
                      marginBottom: SPACE.xs,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: SPACE.xs,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 6a6 6 0 0 1 6 6"/><circle cx="12" cy="12" r="2"/></svg>
                      Directional SAR Backscatter Analysis
                    </span>
                    <span
                      style={{
                        color: '#15803D',
                        backgroundColor: '#DCFCE7',
                        padding: '1px 6px',
                        borderRadius: RADII.sm,
                        fontSize: '10px',
                        fontWeight: FONT.weightBold,
                      }}
                    >
                      Primary: {selectedChange.thresholdConfig?.changeDirection || 'DECREASE'} (Canopy Disturbance)
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: SPACE.sm,
                      fontSize: FONT.sizeXs,
                      marginTop: SPACE.xs,
                    }}
                  >
                    <div style={{ backgroundColor: '#FEF2F2', padding: '8px', borderRadius: RADII.sm, border: '1px solid #FECACA' }}>
                      <div style={{ color: '#991B1B', fontWeight: FONT.weightBold, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                        Drops (Canopy Loss)
                      </div>
                      <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#DC2626', marginTop: '2px' }}>
                        {selectedChange.rasterStatistics.negativeAffectedAreaPercentage?.toFixed(2) ?? selectedChange.affectedAreaPercentage}%
                      </div>
                      <div style={{ color: '#7F1D1D', fontSize: '10px' }}>
                        {selectedChange.rasterStatistics.negativeChangePixelCount?.toLocaleString() ?? '—'} px
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#EFF6FF', padding: '8px', borderRadius: RADII.sm, border: '1px solid #BFDBFE' }}>
                      <div style={{ color: '#1E40AF', fontWeight: FONT.weightBold, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        Increases (Moisture)
                      </div>
                      <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#2563EB', marginTop: '2px' }}>
                        {selectedChange.rasterStatistics.positiveAffectedAreaPercentage?.toFixed(2) ?? '—'}%
                      </div>
                      <div style={{ color: '#1E3A8A', fontSize: '10px' }}>
                        {selectedChange.rasterStatistics.positiveChangePixelCount?.toLocaleString() ?? '—'} px
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#F0FDF4', padding: '8px', borderRadius: RADII.sm, border: '1px solid #BBF7D0' }}>
                      <div style={{ color: '#166534', fontWeight: FONT.weightBold, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#15803D" stroke="#15803D" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                        Stable Backscatter
                      </div>
                      <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#15803D', marginTop: '2px' }}>
                        {selectedChange.rasterStatistics.stablePixelCount?.toLocaleString() ?? '—'} px
                      </div>
                      <div style={{ color: '#14532D', fontSize: '10px' }}>
                        Total: {selectedChange.rasterStatistics.validComparisonPixelCount?.toLocaleString() ?? '—'} px
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Area & Multi-Threshold Matrix */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: SPACE.sm,
                  marginBottom: SPACE.md,
                }}
              >
                <div
                  style={{
                    padding: SPACE.sm,
                    backgroundColor: COLORS.surfaceAlt,
                    borderRadius: RADII.md,
                  }}
                >
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    Affected Percentage
                  </div>
                  <div
                    style={{
                      fontSize: FONT.sizeXl,
                      fontWeight: FONT.weightBold,
                      color: COLORS.primary,
                    }}
                  >
                    {selectedChange.affectedAreaPercentage}%
                  </div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {selectedChange.changedArea} ha of {selectedChange.zoneArea} ha
                  </div>
                </div>

                <div
                  style={{
                    padding: SPACE.sm,
                    backgroundColor: COLORS.surfaceAlt,
                    borderRadius: RADII.md,
                  }}
                >
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    Highest Threshold Crossed
                  </div>
                  <div
                    style={{
                      fontSize: FONT.sizeXl,
                      fontWeight: FONT.weightBold,
                      color:
                        selectedChange.highestThresholdCrossed >= 10
                          ? COLORS.dangerText
                          : selectedChange.highestThresholdCrossed >= 5
                            ? COLORS.warningText
                            : COLORS.textMuted,
                    }}
                  >
                    {selectedChange.highestThresholdCrossed > 0
                      ? `${selectedChange.highestThresholdCrossed}%`
                      : 'None (<2%)'}
                  </div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    Thresholds:{' '}
                    {[
                      selectedChange.threshold2Crossed && '2%',
                      selectedChange.threshold5Crossed && '5%',
                      selectedChange.threshold10Crossed && '10%',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'None'}
                  </div>
                </div>
              </div>

              {/* Evidence Strength Breakdown */}
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: COLORS.surfaceAlt,
                  borderRadius: RADII.md,
                  marginBottom: SPACE.md,
                }}
              >
                <div
                  style={{
                    fontSize: FONT.sizeXs,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: SPACE.xs,
                  }}
                >
                  Evidence Strength Breakdown ({selectedChange.evidenceStrength}/100)
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: SPACE.xs,
                    fontSize: FONT.sizeXs,
                  }}
                >
                  <div>
                    Magnitude: <b>{selectedChange.evidenceBreakdown?.magnitudeScore || 0}/40</b>
                  </div>
                  <div>
                    Data Quality:{' '}
                    <b>{selectedChange.evidenceBreakdown?.dataQualityScore || 0}/20</b>
                  </div>
                  <div>
                    Temporal:{' '}
                    <b>{selectedChange.evidenceBreakdown?.temporalConsistencyScore || 0}/20</b>
                  </div>
                  <div>
                    Cross-Sensor:{' '}
                    <b>{selectedChange.evidenceBreakdown?.crossSensorScore || 0}/20</b>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: FONT.sizeXs,
                    color: COLORS.textMuted,
                    marginTop: SPACE.xs,
                  }}
                >
                  Agreement: <b>{selectedChange.crossSensorAgreement}</b> | History:{' '}
                  <b>{selectedChange.temporalConsistency}</b>
                </div>
              </div>

              {/* Indicators Delta Section */}
              <div style={{ marginBottom: SPACE.md }}>
                <div
                  style={{
                    fontSize: FONT.sizeXs,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: SPACE.xs,
                  }}
                >
                  Spectral / Radar Change Vector
                </div>
                {selectedChange.sensorType === SensorType.OPTICAL ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: SPACE.xs,
                      fontSize: FONT.sizeXs,
                    }}
                  >
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      NDVI Δ: <b>{selectedChange.changeIndicators?.ndviDelta ?? 'N/A'}</b>
                    </div>
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      NDWI Δ: <b>{selectedChange.changeIndicators?.ndwiDelta ?? 'N/A'}</b>
                    </div>
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      NDBI Δ: <b>{selectedChange.changeIndicators?.ndbiDelta ?? 'N/A'}</b>
                    </div>
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      BSI Δ: <b>{selectedChange.changeIndicators?.bsiDelta ?? 'N/A'}</b>
                    </div>
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      SAVI Δ: <b>{selectedChange.changeIndicators?.saviDelta ?? 'N/A'}</b>
                    </div>
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      EVI Δ: <b>{selectedChange.changeIndicators?.eviDelta ?? 'N/A'}</b>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: SPACE.xs,
                      fontSize: FONT.sizeXs,
                    }}
                  >
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      VV Δ: <b>{selectedChange.changeIndicators?.vvDelta ?? 'N/A'} dB</b>
                    </div>
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      VH Δ: <b>{selectedChange.changeIndicators?.vhDelta ?? 'N/A'} dB</b>
                    </div>
                    <div
                      style={{
                        padding: SPACE.xs,
                        backgroundColor: COLORS.neutralBg,
                        borderRadius: RADII.sm,
                      }}
                    >
                      VV/VH Δ:{' '}
                      <b>{selectedChange.changeIndicators?.vvVhRatioDelta ?? 'N/A'} dB</b>
                    </div>
                  </div>
                )}
              </div>

              {/* Human-Readable Explanation */}
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: 'rgba(27, 67, 50, 0.08)',
                  borderRadius: RADII.md,
                  fontSize: FONT.sizeSm,
                  color: COLORS.text,
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.primaryDark,
                    marginBottom: 4,
                  }}
                >
                  Detection Explanation & Summary:
                </div>
                {selectedChange.explanation}
              </div>
            </div>
          ) : (
            <div style={{ padding: SPACE.xl, textAlign: 'center', color: COLORS.textMuted }}>
              Select a change event from the list to view comprehensive indicators and evidence
              fusion analysis.
            </div>
          )}
        </div>
      </div>

      {/* Trigger Change Detection Modal */}
      {showDetectModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: SPACE.md,
          }}
        >
          <div
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: RADII.lg,
              maxWidth: 540,
              width: '100%',
              padding: SPACE.xl,
              boxShadow: SHADOWS.lg,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: SPACE.lg,
              }}
            >
              <h3 style={{ margin: 0, fontSize: FONT.sizeLg, color: COLORS.text }}>
                Run Change Detection
              </h3>
              <button
                onClick={() => setShowDetectModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: FONT.sizeLg,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRunDetect}>
              <div style={{ marginBottom: SPACE.md }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: FONT.sizeSm,
                    fontWeight: FONT.weightSemibold,
                    marginBottom: 4,
                  }}
                >
                  Target Monitored Zone *
                </label>
                <select
                  value={detectZoneId}
                  onChange={(e) => setDetectZoneId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: SPACE.sm,
                    borderRadius: RADII.md,
                    border: `1px solid ${COLORS.neutralBorder}`,
                  }}
                  required
                >
                  <option value="">Select Zone...</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.zoneId})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: SPACE.lg }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: FONT.sizeSm,
                    fontWeight: FONT.weightSemibold,
                    marginBottom: 4,
                  }}
                >
                  Acquired Satellite Observation *
                </label>
                {zoneObservations.length === 0 ? (
                  <div
                    style={{
                      fontSize: FONT.sizeXs,
                      color: COLORS.dangerText,
                      padding: SPACE.xs,
                    }}
                  >
                    No acquired imagery found for this zone. Please acquire imagery from the Satellite Catalog first.
                  </div>
                ) : (
                  <select
                    value={detectObservationId}
                    onChange={(e) => setDetectObservationId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: SPACE.sm,
                      borderRadius: RADII.md,
                      border: `1px solid ${COLORS.neutralBorder}`,
                    }}
                    required
                  >
                    {zoneObservations.map((obs) => (
                      <option key={obs.id} value={obs.id}>
                        {obs.source} ({obs.sensorType}) —{' '}
                        {new Date(obs.acquisitionDate).toLocaleDateString()} (Cloud:{' '}
                        {obs.cloudCover}%)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.sm }}>
                <button
                  type="button"
                  onClick={() => setShowDetectModal(false)}
                  style={{
                    padding: `${SPACE.sm} ${SPACE.md}`,
                    border: `1px solid ${COLORS.neutralBorder}`,
                    backgroundColor: COLORS.surface,
                    borderRadius: RADII.md,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={detectLoading || !detectObservationId}
                  style={{
                    padding: `${SPACE.sm} ${SPACE.lg}`,
                    backgroundColor: COLORS.primary,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: RADII.md,
                    fontWeight: FONT.weightSemibold,
                    cursor: detectLoading || !detectObservationId ? 'not-allowed' : 'pointer',
                    opacity: detectLoading || !detectObservationId ? 0.6 : 1,
                  }}
                >
                  {detectLoading ? 'Evaluating Changes...' : 'Execute Change Detection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── GIS Map Modal ─── */}
      {showGisMapModal && selectedChange && (() => {
        const targetZone =
          zones.find((z) => z.id === selectedChange.zoneId || z.zoneId === selectedChange.zoneId) ||
          selectedZone;
        const boundary = targetZone?.boundary || {
          type: 'Polygon',
          coordinates: [
            [
              [78.1, 11.6],
              [78.2, 11.6],
              [78.2, 11.7],
              [78.1, 11.7],
              [78.1, 11.6],
            ],
          ],
        };
        const areaName = targetZone?.name || comparisonMeta?.zoneName || `Zone ${selectedChange.zoneId || 'Protected Area'}`;
        const areaId = targetZone?.zoneId || targetZone?.id || selectedChange.zoneId;

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              padding: SPACE.lg,
            }}
          >
            <div
              style={{
                width: '90vw',
                maxWidth: '1100px',
                height: '80vh',
                backgroundColor: '#0f172a',
                borderRadius: RADII.xl,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: SHADOWS.lg,
                border: '1px solid #334155',
              }}
            >
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <GisWorkstation
                  boundary={boundary}
                  areaName={areaName}
                  areaId={areaId}
                  isPermanent={true}
                  totalAreaHectares={selectedChange.zoneArea}
                  totalAreaM2={selectedChange.zoneArea * 10000}
                  changes={[selectedChange]}
                  onClose={() => setShowGisMapModal(false)}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Before / After Comparison Modal ─── */}
      {showComparisonModal && selectedChange && (() => {
        const targetZone =
          zones.find((z) => z.id === selectedChange.zoneId || z.zoneId === selectedChange.zoneId) ||
          selectedZone;
        const boundary = targetZone?.boundary || {
          type: 'Polygon',
          coordinates: [
            [
              [78.1, 11.6],
              [78.2, 11.6],
              [78.2, 11.7],
              [78.1, 11.7],
              [78.1, 11.6],
            ],
          ],
        };
        const areaName = targetZone?.name || comparisonMeta?.zoneName || `Zone ${selectedChange.zoneId || 'Protected Area'}`;
        const beforeDate = comparisonMeta?.baseline?.acquisitionDate
          ? `${new Date(comparisonMeta.baseline.acquisitionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} (Active Baseline)`
          : 'Active Baseline Reference';
        const currentDate = comparisonMeta?.current?.acquisitionDate
          ? `${new Date(comparisonMeta.current.acquisitionDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} (Detection Event)`
          : `${new Date(selectedChange.detectedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} (Detection Event)`;

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2100,
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
                boundary={boundary}
                areaName={areaName}
                beforeDate={beforeDate}
                beforeSource={comparisonMeta?.baseline?.source || selectedChange.source}
                beforeSensor={comparisonMeta?.baseline?.sensor || selectedChange.sensorType}
                currentDate={currentDate}
                currentSource={comparisonMeta?.current?.source || selectedChange.source}
                currentSensor={comparisonMeta?.current?.sensor || selectedChange.sensorType}
                onClose={() => setShowComparisonModal(false)}
              />
            </div>
          </div>
        );
      })()}

      {/* ─── Satellite Image Viewer Modal (Real Sentinel-2 Telemetry & Rasters) ─── */}
      {showSatelliteViewerModal && selectedChange && (() => {
        const targetZone =
          zones.find((z) => z.id === selectedChange.zoneId || z.zoneId === selectedChange.zoneId) ||
          selectedZone;
        const zoneName = targetZone?.name || comparisonMeta?.zoneName || 'Protected Area';

        return (
          <SatelliteImageViewerModal
            changeId={selectedChange.changeId || selectedChange.id}
            zoneName={zoneName}
            initialMode={satelliteViewerMode}
            onClose={() => setShowSatelliteViewerModal(false)}
          />
        );
      })()}
    </div>
  );
};

export default ChangesPage;
