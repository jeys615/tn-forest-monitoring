import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import StatusBadge, { type BadgeVariant } from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { baselineService } from '../../services/baseline.service';
import { processingService } from '../../services/processing.service';
import { zoneService } from '../../services/zone.service';
import { useAuth } from '../../hooks/useAuth';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';
import { ZoneWorkspaceDirectory } from '../../components/common/ZoneWorkspaceDirectory';
import { COLORS, FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import {
  SensorType,
  BaselineStatus,
  Permission,
  UserRole,
  type BaselineDto,
  type ProcessedImageResultDto,
  type ZoneDto,
  type AvailableSatelliteObservationDto,
  type BaselineVerificationResultDto,
} from '@tn-forest/shared/types';

const getBaselineBadgeVariant = (status: BaselineStatus): BadgeVariant => {
  switch (status) {
    case BaselineStatus.ACTIVE:
      return 'success';
    case BaselineStatus.PROCESSED:
      return 'primary';
    case BaselineStatus.CANDIDATE:
    case BaselineStatus.DISCOVERED:
    case BaselineStatus.EXPORT_REQUESTED:
    case BaselineStatus.EXPORT_RUNNING:
    case BaselineStatus.EXPORT_COMPLETED:
    case BaselineStatus.DRIVE_AVAILABLE:
    case BaselineStatus.RASTER_VALIDATED:
      return 'info';
    case BaselineStatus.RETIRED:
      return 'neutral';
    case BaselineStatus.FROZEN:
      return 'warning';
    case BaselineStatus.REJECTED:
    case BaselineStatus.GEE_SEARCH_FAILED:
    case BaselineStatus.EXPORT_FAILED:
    case BaselineStatus.DRIVE_FILE_MISSING:
    case BaselineStatus.RASTER_INVALID:
    case BaselineStatus.PROCESSING_FAILED:
      return 'danger';
    default:
      return 'neutral';
  }
};

export const BaselinePage: React.FC = () => {
  const { user } = useAuth();
  const canManageBaselines =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.ADMIN ||
    (user?.permissions && user.permissions.includes(Permission.AREA_UPDATE));

  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);

  const {
    zoneId: selectedZoneId,
    selectedZone,
    isZoneInvalid,
    setZoneId: setSelectedZoneId,
    clearZone,
  } = useZoneScopedParams(zones, zonesLoaded);

  const [selectedSensorType, setSelectedSensorType] = useState<string>('ALL');

  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessedImageResultDto[]>([]);
  const [selectedResult, setSelectedResult] = useState<ProcessedImageResultDto | null>(null);

  // Authentic Satellite Observations from Satellite Catalog
  const [candidates, setCandidates] = useState<AvailableSatelliteObservationDto[]>([]);
  const [selectedObservation, setSelectedObservation] = useState<AvailableSatelliteObservationDto | null>(null);
  const [verificationResult, setVerificationResult] = useState<BaselineVerificationResultDto | null>(null);
  const [evaluatingObsId, setEvaluatingObsId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Load Zones
  useEffect(() => {
    zoneService
      .getZones()
      .then((data) => {
        setZones(data);
        setZonesLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to fetch zones:', err);
        setZonesLoaded(true);
      });
  }, []);

  // Clear observation and verification when selected zone changes
  useEffect(() => {
    setSelectedObservation(null);
    setVerificationResult(null);
  }, [selectedZoneId]);

  // Fetch Baselines, Processing Results & Authentic Satellite Catalog Observations
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { zoneId?: string; sensorType?: SensorType } = {};
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (selectedSensorType !== 'ALL') filters.sensorType = selectedSensorType as SensorType;

      const [baselineData, resultData, candidateData] = await Promise.all([
        baselineService.getBaselines(filters),
        processingService.getResults(filters),
        selectedZoneId
          ? baselineService.getCandidates({
              zoneId: selectedZoneId,
              sensorType: selectedSensorType !== 'ALL' ? (selectedSensorType as SensorType) : undefined,
            })
          : Promise.resolve([]),
      ]);

      setBaselines(baselineData);
      setResults(resultData);
      setCandidates(candidateData);

      if (resultData.length > 0) {
        setSelectedResult(resultData[0]);
      } else {
        setSelectedResult(null);
      }
      if (baselineData.length > 0) {
        setSelectedBaselineId((prev) => prev && baselineData.some((b) => b.id === prev) ? prev : baselineData[0].id);
      } else {
        setSelectedBaselineId(null);
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load baseline and processing data';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, selectedSensorType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-poll while any baseline is in export/processing pipeline
  useEffect(() => {
    const hasActivePipeline = baselines.some(
      (b) =>
        b.status === BaselineStatus.EXPORT_REQUESTED ||
        b.status === BaselineStatus.EXPORT_RUNNING,
    );
    if (!hasActivePipeline) return;

    const interval = setInterval(() => {
      fetchData();
    }, 5000);

    return () => clearInterval(interval);
  }, [baselines, fetchData]);

  // Activate Baseline Handler
  const handleActivateBaseline = async (baselineId: string) => {
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      await baselineService.activateBaseline(baselineId);
      setActionMessage('Baseline successfully activated.');
      await fetchData();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to activate baseline.';
      setError(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Evaluate Authentic Satellite Observation from Satellite Catalog
  const handleEvaluateObservation = async (obs: AvailableSatelliteObservationDto) => {
    if (!selectedZoneId) return;
    setEvaluatingObsId(obs.satelliteMetadataId);
    setSelectedObservation(obs);
    setError(null);
    setActionMessage(null);
    try {
      const result = await baselineService.evaluateCandidate({
        zoneId: selectedZoneId,
        satelliteMetadataId: obs.satelliteMetadataId,
        sensorType: obs.sensorType,
      });
      setVerificationResult(result);
      if (result.isEligible) {
        setActionMessage(
          `Candidate ${result.imageId} verified: All 14 baseline validation gates PASSED (${result.qualityScore}/100). Eligible for explicit activation.`,
        );
      } else {
        setActionMessage(
          `Candidate evaluated: ${result.selectionReason}`,
        );
      }
      await fetchData();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to evaluate satellite observation.';
      setError(errorMsg);
    } finally {
      setEvaluatingObsId(null);
    }
  };

  // Explicit Activation Handler for verified candidate from 14-point evaluation
  const handleActivateVerifiedCandidate = async (candidateBaselineId: string) => {
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      await baselineService.activateBaseline(candidateBaselineId);
      setActionMessage('Verified baseline candidate successfully activated as the active zone baseline.');
      await fetchData();
      if (verificationResult && verificationResult.candidate) {
        setVerificationResult({
          ...verificationResult,
          candidate: {
            ...verificationResult.candidate,
            isActive: true,
            status: BaselineStatus.ACTIVE,
          },
        });
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to activate baseline.';
      setError(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Retry Export Handler for failed baselines
  const handleRetryBaseline = async (b: BaselineDto) => {
    if (!selectedZoneId) return;
    setActionLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      const response = await baselineService.selectCandidate({
        zoneId: selectedZoneId,
        sensorType: b.sensorType,
        satelliteMetadataId: b.satelliteMetadataId,
        overrideSelection: true,
      });
      setActionMessage(
        `Pipeline re-initiated for ${b.sensorType} baseline candidate (${response.candidate?.status || 'REQUESTED'}).`,
      );
      await fetchData();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to retry baseline pipeline.';
      setError(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Metric Calculation summaries
  const selectedBaseline =
    baselines.find((b) => b.id === selectedBaselineId) || baselines[0] || null;
  const activeOptical = baselines.find((b) => b.isActive && b.sensorType === SensorType.OPTICAL);
  const activeSar = baselines.find((b) => b.isActive && b.sensorType === SensorType.SAR);
  const isSarDisabledForZone = selectedZone?.monitoringTracks?.sar?.enabled === false;

  if (!selectedZone) {
    return (
      <div style={{ padding: SPACE.xl, maxWidth: 1400, margin: '0 auto' }}>
        <ZoneWorkspaceDirectory
          moduleTitle="BASELINE MANAGEMENT"
          moduleSubtitle="Dual-Track (Optical Sentinel-2/Landsat & SAR Sentinel-1) reference baselines, image quality verification, and spectral indices."
          moduleBadge="CALIBRATION REFERENCE"
          department="FOREST PROTECTION & SURVEILLANCE DIVISION"
          zones={zones}
          loading={!zonesLoaded}
          onSelectZone={(zid) => setSelectedZoneId(zid)}
          actionLabel="OPEN BASELINE WORKSPACE →"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: SPACE.xl, maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Baseline Management & Local Image Processing"
        subtitle="Dual-Track (Optical & SAR) baseline selection, image quality assessment, and local spectral indicator extraction"
      />

      {/* Zone Context Header */}
      <ZoneContextHeader
        zone={selectedZone}
        isInvalid={isZoneInvalid}
        invalidZoneId={selectedZoneId}
        onClearZone={clearZone}
        currentModule="baselines"
      />

      {/* Top Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: SPACE.md,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: SPACE.xl,
          backgroundColor: COLORS.surface,
          padding: SPACE.lg,
          borderRadius: RADII.lg,
          boxShadow: SHADOWS.sm,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ flex: 1, minWidth: '260px' }}>
          <label
            style={{
              display: 'block',
              fontSize: FONT.sizeXs,
              fontWeight: FONT.weightBold,
              color: COLORS.textMuted,
              marginBottom: SPACE.xs,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Monitored Zone
          </label>
          <ZoneSelector
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={(id) => {
              setSelectedZoneId(id);
              setSelectedBaselineId(null);
            }}
            allowAllZones
            allZonesLabel="All Monitored Zones"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label
            htmlFor="sensor-select"
            style={{
              display: 'block',
              fontSize: FONT.sizeXs,
              fontWeight: FONT.weightBold,
              color: COLORS.textMuted,
              marginBottom: SPACE.xs,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Sensor Family Track
          </label>
          <select
            id="sensor-select"
            value={selectedSensorType}
            onChange={(e) => setSelectedSensorType(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: RADII.md,
              border: `1px solid ${COLORS.border}`,
              backgroundColor: COLORS.surface,
              fontSize: FONT.sizeMd,
              color: COLORS.text,
            }}
          >
            <option value="ALL">All Sensor Tracks</option>
            <option value={SensorType.OPTICAL}>Optical Track (Sentinel-2 / Landsat)</option>
            <option value={SensorType.SAR}>SAR Track (Sentinel-1)</option>
          </select>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: SPACE.md,
            backgroundColor: '#DCFCE7',
            border: '1px solid #86EFAC',
            borderRadius: RADII.md,
            color: '#166534',
            marginBottom: SPACE.lg,
            fontSize: FONT.sizeMd,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>{actionMessage}</span>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={fetchData} />}

      {/* Overview Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: SPACE.lg,
          marginBottom: SPACE.xl,
        }}
      >
        <StatCard
          label="Active Optical Baseline"
          value={activeOptical ? (activeOptical.platform || activeOptical.source) : 'Not Established'}
          description={
            activeOptical
              ? `Scene: ${activeOptical.imageId ? activeOptical.imageId.slice(-25) : 'Active'} · ${new Date(activeOptical.acquisitionDate).toLocaleDateString()} · Score: ${activeOptical.qualityScore}`
              : 'Requires clean optical candidate'
          }
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          }
        />
        <StatCard
          label="Active SAR Baseline"
          value={
            activeSar
              ? (activeSar.platform || activeSar.source)
              : isSarDisabledForZone
                ? 'SAR Disabled'
                : 'Not Established'
          }
          description={
            activeSar
              ? `Scene: ${activeSar.imageId ? activeSar.imageId.slice(-25) : 'Active'} · Track ${activeSar.relativeOrbitNumber ?? 92} · ${new Date(activeSar.acquisitionDate).toLocaleDateString()}`
              : isSarDisabledForZone
                ? 'SAR Track Disabled for this Zone'
                : 'Requires valid Sentinel-1 candidate'
          }
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v20M2 12h20M5 5l14 14M5 19L19 5" />
            </svg>
          }
        />
        <StatCard
          label="Available Observations"
          value={candidates.length.toString()}
          description={`${candidates.filter((c) => c.monitoringTrack === 'OPTICAL').length} Optical | ${candidates.filter((c) => c.monitoringTrack === 'SAR').length} SAR from Satellite Catalog`}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <StatCard
          label="Baseline Records"
          value={baselines.length.toString()}
          description={`${baselines.filter((b) => b.isActive).length} Active | ${baselines.filter((b) => b.status === BaselineStatus.RETIRED).length} Retired`}
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
      </div>

      {/* Active SAR Baseline Compatibility & Orbital Geometry Requirements Banner */}
      {activeSar && (
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: RADII.lg,
            padding: SPACE.lg,
            marginBottom: SPACE.xl,
            boxShadow: SHADOWS.sm,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: SPACE.sm,
              marginBottom: SPACE.xs,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1E40AF', fontWeight: FONT.weightBold, fontSize: FONT.sizeMd }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 1 10 10" />
                <path d="M12 6a6 6 0 0 1 6 6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <span>Active SAR Baseline Compatibility Requirements &amp; Invariants</span>
            </div>
            <span
              style={{
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightBold,
                padding: '3px 10px',
                borderRadius: RADII.full,
                backgroundColor: '#DBEAFE',
                color: '#1E40AF',
                border: '1px solid #93C5FD',
              }}
            >
              STRICT REPEAT-PASS INVARIANT
            </span>
          </div>
          <p style={{ margin: '0 0 12px 0', fontSize: FONT.sizeXs, color: '#1E3A8A' }}>
            Production Sentinel-1 SAR change detection requires identical relative orbit geometry. Observations from differing tracks (e.g. Track 165 vs baseline Track 92) exhibit ~11° look/incidence angle disparities that induce severe pseudo-disturbance backscatter shifts and are automatically rejected.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: SPACE.sm,
              fontSize: FONT.sizeXs,
            }}
          >
            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 12px', borderRadius: RADII.sm, border: '1px solid #DBEAFE' }}>
              <div style={{ color: COLORS.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>Sensor / Platform</div>
              <div style={{ fontWeight: FONT.weightBold, color: '#1E40AF', marginTop: '2px' }}>
                {activeSar.platform || 'Sentinel-1A'} (C-SAR)
              </div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 12px', borderRadius: RADII.sm, border: '1px solid #DBEAFE' }}>
              <div style={{ color: COLORS.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>Acquisition Mode</div>
              <div style={{ fontWeight: FONT.weightBold, color: '#1E40AF', marginTop: '2px' }}>
                {activeSar.mode || 'IW'} (Interferometric Wide)
              </div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 12px', borderRadius: RADII.sm, border: '1px solid #DBEAFE' }}>
              <div style={{ color: COLORS.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>Polarizations</div>
              <div style={{ fontWeight: FONT.weightBold, color: '#1E40AF', marginTop: '2px' }}>
                {activeSar.polarizations?.join(' + ') || 'VV + VH'} (Dual-pol)
              </div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 12px', borderRadius: RADII.sm, border: '1px solid #DBEAFE' }}>
              <div style={{ color: COLORS.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>Pass Direction</div>
              <div style={{ fontWeight: FONT.weightBold, color: '#1E40AF', marginTop: '2px' }}>
                {activeSar.orbitDirection || 'DESCENDING'}
              </div>
            </div>
            <div style={{ padding: '8px 12px', borderRadius: RADII.sm, border: '1px solid #86EFAC', backgroundColor: '#F0FDF4' }}>
              <div style={{ color: '#15803D', fontSize: '11px', textTransform: 'uppercase', fontWeight: FONT.weightBold }}>Required Relative Orbit</div>
              <div style={{ fontWeight: FONT.weightBold, color: '#15803D', marginTop: '2px', fontSize: FONT.sizeSm }}>
                Track {activeSar.relativeOrbitNumber ?? 92}
              </div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 12px', borderRadius: RADII.sm, border: '1px solid #DBEAFE' }}>
              <div style={{ color: COLORS.textMuted, fontSize: '11px', textTransform: 'uppercase' }}>Exact Repeat Interval</div>
              <div style={{ fontWeight: FONT.weightBold, color: '#1E40AF', marginTop: '2px' }}>
                12 Days (Same Geometry)
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: SPACE['3xl'], textAlign: 'center', color: COLORS.textMuted }}>
          Loading Baseline &amp; Processing Data...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: SPACE.xl }}>
          {/* Main Left Section: Baselines List & History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
            {/* Section A: Available Satellite Observations (from Satellite Catalog) */}
            <div
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: RADII.xl,
                padding: SPACE.xl,
                boxShadow: SHADOWS.md,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: SPACE.md,
                  flexWrap: 'wrap',
                  gap: SPACE.sm,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                    <h3
                      style={{
                        fontSize: FONT.sizeXl,
                        fontWeight: FONT.weightBold,
                        color: COLORS.primary,
                        margin: 0,
                      }}
                    >
                      Available Satellite Observations
                    </h3>
                    <span
                      style={{
                        fontSize: FONT.sizeXs,
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        fontWeight: FONT.weightBold,
                        padding: '2px 8px',
                        borderRadius: RADII.sm,
                        border: '1px solid #BFDBFE',
                      }}
                    >
                      {candidates.length} Catalog Records
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                    Authentic Earth Engine acquired observations for {selectedZone?.name || 'this zone'}. Select an observation to evaluate baseline eligibility.
                  </p>
                </div>
              </div>

              {candidates.length === 0 ? (
                <EmptyState
                  title="No Satellite Catalog Observations Found"
                  description={`No acquired satellite observations found for this zone${
                    selectedSensorType !== 'ALL' ? ` with ${selectedSensorType} track filter` : ''
                  }. Visit Satellite Catalog to query Earth Engine.`}
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: FONT.sizeSm,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: `2px solid ${COLORS.border}`,
                          textAlign: 'left',
                          color: COLORS.textMuted,
                        }}
                      >
                        <th style={{ padding: SPACE.md }}>Scene / Image ID</th>
                        <th style={{ padding: SPACE.md }}>Platform / Source</th>
                        <th style={{ padding: SPACE.md }}>Track</th>
                        <th style={{ padding: SPACE.md }}>Acquisition Date</th>
                        <th style={{ padding: SPACE.md }}>Cloud %</th>
                        <th style={{ padding: SPACE.md }}>Catalog Status</th>
                        <th style={{ padding: SPACE.md }}>Baseline Status</th>
                        <th style={{ padding: SPACE.md, textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((obs) => {
                        const isSelected =
                          selectedObservation?.satelliteMetadataId === obs.satelliteMetadataId;
                        const isEvaluating = evaluatingObsId === obs.satelliteMetadataId;
                        const isOptical = obs.monitoringTrack === 'OPTICAL';

                        return (
                          <tr
                            key={obs.satelliteMetadataId}
                            onClick={() => setSelectedObservation(obs)}
                            style={{
                              borderBottom: `1px solid ${COLORS.border}`,
                              backgroundColor: isSelected
                                ? 'rgba(45, 106, 79, 0.08)'
                                : obs.isBaselineActive
                                  ? 'rgba(82, 183, 136, 0.08)'
                                  : 'transparent',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease',
                            }}
                          >
                            <td
                              style={{
                                padding: SPACE.md,
                                fontFamily: 'monospace',
                                fontSize: FONT.sizeXs,
                                maxWidth: '220px',
                              }}
                            >
                              <div
                                title={obs.imageId}
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontWeight: FONT.weightMedium,
                                  color: COLORS.text,
                                }}
                              >
                                {obs.imageId}
                              </div>
                              {obs.hasLocalRaster && (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    marginTop: '2px',
                                    fontSize: '10px',
                                    color: '#15803D',
                                    backgroundColor: '#DCFCE7',
                                    padding: '1px 5px',
                                    borderRadius: RADII.sm,
                                  }}
                                >
                                  GeoTIFF Ready
                                </span>
                              )}
                            </td>
                            <td style={{ padding: SPACE.md }}>
                              <div style={{ fontWeight: FONT.weightMedium }}>
                                {obs.platform || obs.source}
                              </div>
                              <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
                                {obs.source}
                              </div>
                            </td>
                            <td style={{ padding: SPACE.md }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '3px 8px',
                                  borderRadius: RADII.sm,
                                  backgroundColor: isOptical ? '#DCFCE7' : '#DBEAFE',
                                  color: isOptical ? '#166534' : '#1E40AF',
                                  fontSize: FONT.sizeXs,
                                  fontWeight: FONT.weightBold,
                                }}
                              >
                                {obs.monitoringTrack}
                              </span>
                            </td>
                            <td style={{ padding: SPACE.md, whiteSpace: 'nowrap' }}>
                              {new Date(obs.acquisitionDate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td style={{ padding: SPACE.md }}>
                              {obs.cloudCover !== null ? (
                                <span
                                  style={{
                                    fontWeight: FONT.weightMedium,
                                    color:
                                      obs.cloudCover <= 15
                                        ? '#15803D'
                                        : obs.cloudCover <= 30
                                          ? '#D97706'
                                          : '#DC2626',
                                  }}
                                >
                                  {obs.cloudCover.toFixed(1)}%
                                </span>
                              ) : (
                                <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs }}>
                                  Radar (All-Weather)
                                </span>
                              )}
                            </td>
                            <td style={{ padding: SPACE.md }}>
                              <span
                                style={{
                                  fontSize: FONT.sizeXs,
                                  padding: '2px 6px',
                                  borderRadius: RADII.sm,
                                  backgroundColor: '#F3F4F6',
                                  color: '#4B5563',
                                  fontWeight: FONT.weightMedium,
                                }}
                              >
                                {obs.processingStatus}
                              </span>
                            </td>
                            <td style={{ padding: SPACE.md }}>
                              {obs.isBaselineActive ? (
                                <span
                                  style={{
                                    fontSize: FONT.sizeXs,
                                    fontWeight: FONT.weightBold,
                                    color: '#15803D',
                                    backgroundColor: '#DCFCE7',
                                    padding: '3px 8px',
                                    borderRadius: RADII.sm,
                                    border: '1px solid #86EFAC',
                                  }}
                                >
                                  Active Baseline
                                </span>
                              ) : obs.baselineStatus === BaselineStatus.PROCESSED ? (
                                <span
                                  style={{
                                    fontSize: FONT.sizeXs,
                                    fontWeight: FONT.weightMedium,
                                    color: '#1D4ED8',
                                    backgroundColor: '#EFF6FF',
                                    padding: '3px 8px',
                                    borderRadius: RADII.sm,
                                  }}
                                >
                                  Verified Candidate
                                </span>
                              ) : obs.baselineStatus !== 'NOT_EVALUATED' ? (
                                <StatusBadge
                                  label={obs.baselineStatus}
                                  variant={getBaselineBadgeVariant(
                                    obs.baselineStatus as BaselineStatus,
                                  )}
                                />
                              ) : (
                                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                                  Not Evaluated
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: SPACE.md,
                                textAlign: 'right',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEvaluateObservation(obs);
                                }}
                                disabled={isEvaluating || actionLoading}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: isSelected
                                    ? COLORS.primaryDark
                                    : COLORS.primary,
                                  color: '#FFF',
                                  border: 'none',
                                  borderRadius: RADII.sm,
                                  fontSize: FONT.sizeXs,
                                  fontWeight: FONT.weightSemibold,
                                  cursor: isEvaluating ? 'wait' : 'pointer',
                                  opacity: isEvaluating ? 0.7 : 1,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {isEvaluating ? (
                                  <>Evaluating 14 Gates...</>
                                ) : isSelected && verificationResult ? (
                                  <>Re-evaluate</>
                                ) : (
                                  <>Evaluate</>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section B: 14-Point Baseline Verification Results */}
            {verificationResult && (
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.xl,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.md,
                  border: `1px solid ${verificationResult.isEligible ? '#86EFAC' : '#FCA5A5'}`,
                }}
              >
                {/* Verification Banner */}
                <div
                  style={{
                    padding: SPACE.lg,
                    borderRadius: RADII.lg,
                    backgroundColor: verificationResult.isEligible ? '#F0FDF4' : '#FEF2F2',
                    border: `1px solid ${verificationResult.isEligible ? '#BBF7D0' : '#FECACA'}`,
                    marginBottom: SPACE.xl,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: SPACE.md,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                      <span style={{ fontSize: '20px' }}>
                        {verificationResult.isEligible ? '✅' : '❌'}
                      </span>
                      <h3
                        style={{
                          fontSize: FONT.sizeLg,
                          fontWeight: FONT.weightBold,
                          color: verificationResult.isEligible ? '#166534' : '#991B1B',
                          margin: 0,
                        }}
                      >
                        {verificationResult.isEligible
                          ? 'BASELINE CANDIDATE VERIFIED'
                          : 'BASELINE CANDIDATE NOT ELIGIBLE'}
                      </h3>
                    </div>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: FONT.sizeSm,
                        color: verificationResult.isEligible ? '#15803D' : '#B91C1C',
                        fontWeight: FONT.weightMedium,
                      }}
                    >
                      {verificationResult.selectionReason}
                    </p>
                  </div>

                  {/* Explicit Activation Action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
                    {verificationResult.isEligible && verificationResult.candidate && (
                      verificationResult.candidate.isActive ? (
                        <div
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#DCFCE7',
                            border: '1px solid #86EFAC',
                            borderRadius: RADII.md,
                            color: '#166534',
                            fontWeight: FONT.weightBold,
                            fontSize: FONT.sizeSm,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          ✓ ACTIVE ZONE BASELINE
                        </div>
                      ) : (
                        canManageBaselines && (
                          <button
                            onClick={() =>
                              handleActivateVerifiedCandidate(verificationResult.candidate!.id)
                            }
                            disabled={actionLoading}
                            style={{
                              padding: '10px 20px',
                              backgroundColor: '#15803D',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: RADII.md,
                              fontSize: FONT.sizeSm,
                              fontWeight: FONT.weightBold,
                              cursor: actionLoading ? 'wait' : 'pointer',
                              boxShadow: SHADOWS.sm,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'background-color 0.2s',
                            }}
                          >
                            {actionLoading ? 'Activating...' : '⚡ ACTIVATE AS BASELINE'}
                          </button>
                        )
                      )
                    )}
                  </div>
                </div>

                {/* Candidate Observation Metadata Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: SPACE.md,
                    marginBottom: SPACE.xl,
                    backgroundColor: '#F9FAFB',
                    padding: SPACE.md,
                    borderRadius: RADII.lg,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: COLORS.textMuted,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Scene ID
                    </div>
                    <div
                      title={verificationResult.imageId}
                      style={{
                        fontWeight: FONT.weightSemibold,
                        color: COLORS.text,
                        fontSize: FONT.sizeXs,
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '2px',
                      }}
                    >
                      {verificationResult.imageId}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        color: COLORS.textMuted,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Sensor / Track
                    </div>
                    <div
                      style={{
                        fontWeight: FONT.weightSemibold,
                        color: COLORS.text,
                        fontSize: FONT.sizeSm,
                        marginTop: '2px',
                      }}
                    >
                      {verificationResult.sensorType} Track
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        color: COLORS.textMuted,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Acquisition Date
                    </div>
                    <div
                      style={{
                        fontWeight: FONT.weightSemibold,
                        color: COLORS.text,
                        fontSize: FONT.sizeSm,
                        marginTop: '2px',
                      }}
                    >
                      {new Date(verificationResult.acquisitionDate).toLocaleDateString(
                        undefined,
                        {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        },
                      )}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        color: COLORS.textMuted,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Cloud Cover
                    </div>
                    <div
                      style={{
                        fontWeight: FONT.weightSemibold,
                        color: COLORS.text,
                        fontSize: FONT.sizeSm,
                        marginTop: '2px',
                      }}
                    >
                      {verificationResult.cloudCover !== null
                        ? `${verificationResult.cloudCover}%`
                        : 'N/A (Radar)'}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        color: COLORS.textMuted,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Zone
                    </div>
                    <div
                      style={{
                        fontWeight: FONT.weightSemibold,
                        color: COLORS.text,
                        fontSize: FONT.sizeSm,
                        marginTop: '2px',
                      }}
                    >
                      {verificationResult.zoneName} ({verificationResult.zoneCode})
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        color: COLORS.textMuted,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Quality Score
                    </div>
                    <div
                      style={{
                        fontWeight: FONT.weightBold,
                        color:
                          verificationResult.qualityScore >= 70 ? '#15803D' : '#B91C1C',
                        fontSize: FONT.sizeSm,
                        marginTop: '2px',
                      }}
                    >
                      {verificationResult.qualityScore} / 100
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        color: COLORS.textMuted,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Evaluated At
                    </div>
                    <div
                      style={{
                        fontWeight: FONT.weightMedium,
                        color: COLORS.textMuted,
                        fontSize: FONT.sizeXs,
                        marginTop: '2px',
                      }}
                    >
                      {new Date(verificationResult.evaluatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* 14-Point Baseline Verification Gates */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: SPACE.md,
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        fontSize: FONT.sizeMd,
                        fontWeight: FONT.weightBold,
                        color: COLORS.text,
                      }}
                    >
                      14-Point Baseline Verification Gates
                    </h4>
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      {
                        verificationResult.gates.filter((g) => g.status === 'PASSED').length
                      }{' '}
                      of {verificationResult.gates.length} Gates Passed
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: SPACE.sm,
                    }}
                  >
                    {verificationResult.gates.map((gate) => {
                      const isPassed = gate.status === 'PASSED';
                      const isFailed = gate.status === 'FAILED';

                      return (
                        <div
                          key={gate.gate}
                          style={{
                            padding: '10px 14px',
                            borderRadius: RADII.md,
                            backgroundColor: isPassed ? '#F9FAFB' : '#FEF2F2',
                            border: `1px solid ${isPassed ? '#E5E7EB' : '#FCA5A5'}`,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: SPACE.sm,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '14px',
                              fontWeight: FONT.weightBold,
                              color: isPassed
                                ? '#166534'
                                : isFailed
                                  ? '#DC2626'
                                  : '#D97706',
                              marginTop: '1px',
                            }}
                          >
                            {isPassed ? '✔' : isFailed ? '✘' : '⏳'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: SPACE.xs,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: FONT.sizeXs,
                                  fontWeight: FONT.weightBold,
                                  color: COLORS.text,
                                }}
                              >
                                Gate {gate.gate}: {gate.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: RADII.sm,
                                  backgroundColor: isPassed ? '#DCFCE7' : '#FEE2E2',
                                  color: isPassed ? '#15803D' : '#991B1B',
                                  fontWeight: FONT.weightBold,
                                }}
                              >
                                {gate.status}
                              </span>
                            </div>
                            <p
                              style={{
                                margin: '3px 0 0',
                                fontSize: '11px',
                                color: isPassed ? COLORS.textMuted : '#B91C1C',
                                lineHeight: '1.4',
                              }}
                            >
                              {gate.message}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Section D: Baseline Evaluation & Activation History Table */}
            <div
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: RADII.xl,
                padding: SPACE.xl,
                boxShadow: SHADOWS.md,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ marginBottom: SPACE.lg }}>
                <h3
                  style={{
                    fontSize: FONT.sizeXl,
                    fontWeight: FONT.weightBold,
                    color: COLORS.primary,
                    margin: 0,
                  }}
                >
                  Baseline Evaluation &amp; Activation History
                </h3>
                <p style={{ margin: '4px 0 0', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                  Historical records of evaluated, activated, and retired baselines for this zone.
                </p>
              </div>

              {baselines.length === 0 ? (
                <EmptyState
                  title="No Baseline History Found"
                  description="Select an available satellite observation above and evaluate it to establish baselines for this zone."
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: FONT.sizeSm,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: `2px solid ${COLORS.border}`,
                          textAlign: 'left',
                          color: COLORS.textMuted,
                        }}
                      >
                        <th style={{ padding: SPACE.md }}>Sensor Track</th>
                        <th style={{ padding: SPACE.md }}>Source</th>
                        <th style={{ padding: SPACE.md }}>Status</th>
                        <th style={{ padding: SPACE.md }}>Score</th>
                        <th style={{ padding: SPACE.md }}>Cloud %</th>
                        <th style={{ padding: SPACE.md }}>Acquisition Date</th>
                        <th style={{ padding: SPACE.md }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baselines.map((b) => {
                        const isSar = b.sensorType === SensorType.SAR;
                        const bTrack = b.relativeOrbitNumber ?? (isSar && b.source.includes('SENTINEL_1') ? 92 : undefined);
                        const activeSarTrack = activeSar?.relativeOrbitNumber ?? 92;
                        const isCompatibleSar = isSar && activeSar && bTrack === activeSarTrack;
                        const isMismatchedSar = isSar && activeSar && bTrack !== undefined && bTrack !== activeSarTrack;

                        return (
                          <tr
                            key={b.id}
                            onClick={() => setSelectedBaselineId(b.id)}
                            style={{
                              borderBottom: `1px solid ${COLORS.border}`,
                              backgroundColor:
                                selectedBaselineId === b.id
                                  ? 'rgba(45, 106, 79, 0.08)'
                                  : b.isActive
                                    ? 'rgba(82, 183, 136, 0.08)'
                                    : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <td style={{ padding: SPACE.md, fontWeight: FONT.weightSemibold }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: 'fit-content',
                                    padding: '3px 8px',
                                    borderRadius: RADII.sm,
                                    backgroundColor:
                                      b.sensorType === SensorType.OPTICAL ? '#DCFCE7' : '#DBEAFE',
                                    color: b.sensorType === SensorType.OPTICAL ? '#166534' : '#1E40AF',
                                    fontSize: FONT.sizeXs,
                                  }}
                                >
                                  {b.sensorType}
                                </span>
                                {isSar && bTrack !== undefined && (
                                  <span style={{ fontSize: '10px', color: COLORS.textMuted, fontFamily: 'monospace' }}>
                                    Track {bTrack} ({b.orbitDirection || 'DESCENDING'})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: SPACE.md }}>
                              <div style={{ fontWeight: FONT.weightMedium }}>{b.source}</div>
                              {isSar && (
                                <div style={{ marginTop: '4px' }}>
                                  {b.isActive ? (
                                    <span style={{ fontSize: '10px', fontWeight: FONT.weightBold, color: '#15803D', backgroundColor: '#DCFCE7', padding: '1px 6px', borderRadius: RADII.sm, border: '1px solid #86EFAC' }}>
                                      Active Track {bTrack}
                                    </span>
                                  ) : isCompatibleSar ? (
                                    <span style={{ fontSize: '10px', fontWeight: FONT.weightBold, color: '#15803D', backgroundColor: '#DCFCE7', padding: '1px 6px', borderRadius: RADII.sm, border: '1px solid #86EFAC' }} title="Identical relative orbit track geometry">
                                      ✓ SAME RELATIVE ORBIT (Track {bTrack})
                                    </span>
                                  ) : isMismatchedSar ? (
                                    <span
                                      style={{ fontSize: '10px', fontWeight: FONT.weightBold, color: '#991B1B', backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: RADII.sm, border: '1px solid #FCA5A5' }}
                                      title="Incompatible SAR acquisition geometry: differing incidence angles cause false-positive backscatter variation"
                                    >
                                      ✗ RELATIVE ORBIT MISMATCH (Track {bTrack})
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          <td style={{ padding: SPACE.md }}>
                            <StatusBadge
                              label={b.status}
                              variant={getBaselineBadgeVariant(b.status)}
                              dot
                            />
                            {b.isActive && (
                              <span
                                style={{
                                  marginLeft: SPACE.xs,
                                  fontSize: FONT.sizeXs,
                                  fontWeight: FONT.weightBold,
                                  color: '#059669',
                                }}
                              >
                                [ACTIVE]
                              </span>
                            )}
                          </td>
                          <td style={{ padding: SPACE.md, fontWeight: FONT.weightBold }}>
                            {b.qualityScore}
                          </td>
                          <td style={{ padding: SPACE.md }}>
                            {b.cloudCover !== null ? `${b.cloudCover}%` : 'N/A (SAR)'}
                          </td>
                          <td style={{ padding: SPACE.md }}>
                            {new Date(b.acquisitionDate).toLocaleDateString()}
                          </td>
                          <td style={{ padding: SPACE.md }}>
                            {b.isActive ? (
                              <span
                                style={{
                                  color: '#059669',
                                  fontWeight: FONT.weightBold,
                                  fontSize: FONT.sizeXs,
                                }}
                              >
                                ✓ Active
                              </span>
                            ) : b.status === BaselineStatus.PROCESSED ? (
                              canManageBaselines && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleActivateBaseline(b.id);
                                  }}
                                  disabled={actionLoading}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: COLORS.primary,
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: RADII.sm,
                                    fontSize: FONT.sizeXs,
                                    fontWeight: FONT.weightSemibold,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Activate
                                </button>
                              )
                            ) : [
                                BaselineStatus.EXPORT_REQUESTED,
                                BaselineStatus.EXPORT_RUNNING,
                              ].includes(b.status) ? (
                              <span
                                style={{
                                  color: '#2563EB',
                                  fontSize: FONT.sizeXs,
                                  fontWeight: FONT.weightMedium,
                                }}
                              >
                                ⏳ Exporting...
                              </span>
                            ) : [
                                BaselineStatus.EXPORT_FAILED,
                                BaselineStatus.DRIVE_FILE_MISSING,
                                BaselineStatus.RASTER_INVALID,
                                BaselineStatus.PROCESSING_FAILED,
                              ].includes(b.status) ? (
                              canManageBaselines && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetryBaseline(b);
                                  }}
                                  disabled={actionLoading}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: '#DC2626',
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: RADII.sm,
                                    fontSize: FONT.sizeXs,
                                    fontWeight: FONT.weightSemibold,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Retry Export
                                </button>
                              )
                            ) : (
                              canManageBaselines &&
                              b.status !== BaselineStatus.REJECTED && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleActivateBaseline(b.id);
                                  }}
                                  disabled={actionLoading || b.isActive}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: b.isActive ? '#9CA3AF' : COLORS.primary,
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: RADII.sm,
                                    fontSize: FONT.sizeXs,
                                    fontWeight: FONT.weightSemibold,
                                    cursor: b.isActive ? 'default' : 'pointer',
                                  }}
                                >
                                  {b.isActive ? 'Active' : 'Activate'}
                                </button>
                              )
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

            {/* Selected Baseline Pipeline Stepper & Diagnostics */}
            {selectedBaseline && (
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.xl,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.md,
                  border: `1px solid ${COLORS.border}`,
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
                  <div>
                    <h3
                      style={{
                        fontSize: FONT.sizeLg,
                        fontWeight: FONT.weightBold,
                        color: COLORS.primary,
                        margin: 0,
                      }}
                    >
                      End-to-End Pipeline Execution: {selectedBaseline.source} ({selectedBaseline.sensorType})
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      Real Earth Engine Export &rarr; Google Drive &rarr; Local GeoTIFF Validation &rarr; 14-Gate Baseline Activation
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
                    <StatusBadge
                      label={selectedBaseline.status}
                      variant={getBaselineBadgeVariant(selectedBaseline.status)}
                      dot
                    />
                    {selectedBaseline.status === BaselineStatus.PROCESSED && canManageBaselines && (
                      <button
                        onClick={() => handleActivateBaseline(selectedBaseline.id)}
                        disabled={actionLoading}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: COLORS.primary,
                          color: '#FFF',
                          border: 'none',
                          borderRadius: RADII.md,
                          fontWeight: FONT.weightSemibold,
                          fontSize: FONT.sizeSm,
                          cursor: 'pointer',
                        }}
                      >
                        Activate Baseline
                      </button>
                    )}
                    {[
                      BaselineStatus.EXPORT_FAILED,
                      BaselineStatus.DRIVE_FILE_MISSING,
                      BaselineStatus.RASTER_INVALID,
                      BaselineStatus.PROCESSING_FAILED,
                    ].includes(selectedBaseline.status) &&
                      canManageBaselines && (
                        <button
                          onClick={() => handleRetryBaseline(selectedBaseline)}
                          disabled={actionLoading}
                          style={{
                            padding: '6px 14px',
                            backgroundColor: '#DC2626',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: RADII.md,
                            fontWeight: FONT.weightSemibold,
                            fontSize: FONT.sizeSm,
                            cursor: 'pointer',
                          }}
                        >
                          Retry Pipeline
                        </button>
                      )}
                  </div>
                </div>

                {/* Pipeline Failure Warning Banner */}
                {selectedBaseline.failureReason &&
                  ![BaselineStatus.ACTIVE, BaselineStatus.PROCESSED].includes(selectedBaseline.status) && (
                  <div
                    style={{
                      padding: SPACE.md,
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: RADII.md,
                      color: '#991B1B',
                      marginBottom: SPACE.lg,
                      fontSize: FONT.sizeSm,
                    }}
                  >
                    <div style={{ fontWeight: FONT.weightBold, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      <span>Pipeline Halted: {selectedBaseline.errorMessage || selectedBaseline.failureReason}</span>
                    </div>
                    {selectedBaseline.errorStage && (
                      <div style={{ fontSize: FONT.sizeXs, marginTop: '4px', opacity: 0.9 }}>
                        Stage: <b>{selectedBaseline.errorStage}</b>
                        {selectedBaseline.errorCode && <span> | Code: <b>{selectedBaseline.errorCode}</b></span>}
                        {selectedBaseline.operationId && <span> | Operation ID: <code>{selectedBaseline.operationId}</code></span>}
                        {selectedBaseline.failedAt && <span> | Failed At: {new Date(selectedBaseline.failedAt).toLocaleString()}</span>}
                      </div>
                    )}
                    {selectedBaseline.errorCause && (
                      <div style={{ fontSize: FONT.sizeXs, marginTop: '4px', color: '#7F1D1D', fontFamily: 'monospace' }}>
                        Cause: {selectedBaseline.errorCause}
                      </div>
                    )}
                    {selectedBaseline.failureReason && selectedBaseline.failureReason.includes('DRIVE_AUTH_FAILED') && (
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          color: '#7F1D1D',
                          marginTop: SPACE.xs,
                          padding: SPACE.xs,
                          backgroundColor: '#FEE2E2',
                          borderRadius: RADII.sm,
                          fontFamily: 'monospace',
                        }}
                      >
                        Notice: Drive API returned 403 (ACCESS_TOKEN_SCOPE_INSUFFICIENT). Run the following in terminal to authorize Google Drive:
                        <br />
                        <b>gcloud auth login --enable-gdrive-access --update-adc</b>
                      </div>
                    )}
                  </div>
                )}

                {/* 7-Step Pipeline Progress Stepper */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: SPACE.xs,
                    marginBottom: SPACE.xl,
                  }}
                >
                  {[
                    {
                      step: 1,
                      label: 'GEE Discovery',
                      done: true,
                      active: false,
                    },
                    {
                      step: 2,
                      label: 'GEE Export',
                      done: [
                        BaselineStatus.EXPORT_COMPLETED,
                        BaselineStatus.DRIVE_AVAILABLE,
                        BaselineStatus.RASTER_VALIDATED,
                        BaselineStatus.PROCESSED,
                        BaselineStatus.ACTIVE,
                      ].includes(selectedBaseline.status),
                      active: [
                        BaselineStatus.EXPORT_REQUESTED,
                        BaselineStatus.EXPORT_RUNNING,
                      ].includes(selectedBaseline.status),
                      failed: selectedBaseline.status === BaselineStatus.EXPORT_FAILED,
                    },
                    {
                      step: 3,
                      label: 'Drive Delivery',
                      done: [
                        BaselineStatus.DRIVE_AVAILABLE,
                        BaselineStatus.RASTER_VALIDATED,
                        BaselineStatus.PROCESSED,
                        BaselineStatus.ACTIVE,
                      ].includes(selectedBaseline.status),
                      active: selectedBaseline.status === BaselineStatus.EXPORT_COMPLETED,
                      failed: selectedBaseline.status === BaselineStatus.DRIVE_FILE_MISSING,
                    },
                    {
                      step: 4,
                      label: 'GeoTIFF Validation',
                      done: [
                        BaselineStatus.RASTER_VALIDATED,
                        BaselineStatus.PROCESSED,
                        BaselineStatus.ACTIVE,
                      ].includes(selectedBaseline.status),
                      active: selectedBaseline.status === BaselineStatus.DRIVE_AVAILABLE,
                      failed: selectedBaseline.status === BaselineStatus.RASTER_INVALID,
                    },
                    {
                      step: 5,
                      label:
                        selectedBaseline.sensorType === SensorType.SAR
                          ? 'Radar Bands (VV/VH)'
                          : 'Spectral Indices',
                      done: [
                        BaselineStatus.PROCESSED,
                        BaselineStatus.ACTIVE,
                      ].includes(selectedBaseline.status),
                      active: selectedBaseline.status === BaselineStatus.RASTER_VALIDATED,
                      failed: selectedBaseline.status === BaselineStatus.PROCESSING_FAILED,
                    },
                    {
                      step: 6,
                      label: '14-Point Gate',
                      done: selectedBaseline.isActive || selectedBaseline.status === BaselineStatus.ACTIVE,
                      ready: selectedBaseline.status === BaselineStatus.PROCESSED && !selectedBaseline.isActive,
                      active: actionLoading && selectedBaseline.status === BaselineStatus.PROCESSED,
                      failed:
                        !!selectedBaseline.failureReason &&
                        (selectedBaseline.failureReason.includes('CHECK') ||
                          selectedBaseline.status === BaselineStatus.FROZEN),
                    },
                    {
                      step: 7,
                      label: 'Active Baseline',
                      done: selectedBaseline.isActive || selectedBaseline.status === BaselineStatus.ACTIVE,
                      ready: false,
                      active: false,
                      failed: false,
                    },
                  ].map((s) => {
                    const isDone = s.done;
                    const isReady = (s as any).ready;
                    const isActive = s.active;
                    const isFailed = s.failed;
                    const bg = isFailed
                      ? '#FEE2E2'
                      : isDone
                        ? '#DCFCE7'
                        : isReady
                          ? '#FEF3C7'
                          : isActive
                            ? '#DBEAFE'
                            : '#F3F4F6';
                    const textCol = isFailed
                      ? '#991B1B'
                      : isDone
                        ? '#166534'
                        : isReady
                          ? '#92400E'
                          : isActive
                            ? '#1E40AF'
                            : '#6B7280';
                    const borderCol = isFailed
                      ? '#EF4444'
                      : isDone
                        ? '#22C55E'
                        : isReady
                          ? '#F59E0B'
                          : isActive
                            ? '#3B82F6'
                            : '#E5E7EB';

                    return (
                      <div
                        key={s.step}
                        style={{
                          backgroundColor: bg,
                          border: `1px solid ${borderCol}`,
                          borderRadius: RADII.md,
                          padding: '8px 6px',
                          textAlign: 'center',
                          transition: 'all 0.2s ease-in-out',
                        }}
                      >
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            backgroundColor: isDone ? '#166534' : isActive ? '#1E40AF' : isFailed ? '#991B1B' : '#E2E8F0',
                            color: isDone || isActive || isFailed ? '#FFFFFF' : '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: FONT.weightBold,
                            margin: '0 auto',
                          }}
                        >
                          {isDone ? '✓' : s.step}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: FONT.weightBold,
                            color: textCol,
                            marginTop: '4px',
                          }}
                        >
                          {s.label}
                        </div>
                        <div style={{ fontSize: '10px', color: textCol, marginTop: '2px', fontWeight: FONT.weightMedium }}>
                          {isFailed
                            ? 'Failed'
                            : isDone
                              ? s.step === 7
                                ? 'Active'
                                : 'Passed'
                              : isReady
                                ? 'Ready'
                                : isActive
                                  ? 'Validating...'
                                  : 'Pending'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Baseline Activation Call-To-Action Banner */}
                {selectedBaseline.status === BaselineStatus.PROCESSED && !selectedBaseline.isActive && (
                  <div
                    style={{
                      padding: SPACE.md,
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: RADII.md,
                      marginBottom: SPACE.xl,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: SPACE.md,
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      <div>
                        <div style={{ fontWeight: FONT.weightBold, color: '#166534', fontSize: FONT.sizeSm }}>
                          Pipeline Complete &mdash; 14-Point Safety Gate Verification &amp; Activation Ready
                        </div>
                        <div style={{ fontSize: FONT.sizeXs, color: '#15803D', marginTop: '2px' }}>
                          All 5 automated stages passed: GEE export completed, Google Drive file verified ({selectedBaseline.driveFileSizeBytes ? (selectedBaseline.driveFileSizeBytes / 1024).toFixed(0) : '0'} KB), GeoTIFF normalized ({selectedBaseline.rasterWidth} × {selectedBaseline.rasterHeight} px, CRS {selectedBaseline.rasterCrs}), and spectral indices extracted.
                        </div>
                      </div>
                    </div>
                    {canManageBaselines ? (
                      <button
                        onClick={() => handleActivateBaseline(selectedBaseline.id)}
                        disabled={actionLoading}
                        style={{
                          padding: '8px 18px',
                          backgroundColor: '#15803D',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: RADII.md,
                          fontWeight: FONT.weightBold,
                          fontSize: FONT.sizeSm,
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          opacity: actionLoading ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: SPACE.xs,
                          whiteSpace: 'nowrap',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        {actionLoading ? 'Running 14-Point Gate...' : 'Run 14-Point Gate & Activate'}
                      </button>
                    ) : (
                      <div style={{ fontSize: FONT.sizeXs, color: '#92400E', fontWeight: FONT.weightSemibold, whiteSpace: 'nowrap' }}>
                        Requires SUPER_ADMIN or AREA_UPDATE permission to activate
                      </div>
                    )}
                  </div>
                )}

                {(selectedBaseline.isActive || selectedBaseline.status === BaselineStatus.ACTIVE) && (
                  <div
                    style={{
                      padding: SPACE.md,
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #86EFAC',
                      borderRadius: RADII.md,
                      marginBottom: SPACE.xl,
                      display: 'flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#15803D" stroke="#15803D" strokeWidth="1"><circle cx="12" cy="12" r="10"/></svg>
                    <div>
                      <div style={{ fontWeight: FONT.weightBold, color: '#15803D', fontSize: FONT.sizeSm }}>
                        Active Baseline &mdash; 14-Point Safety Gate Verified
                      </div>
                      <div style={{ fontSize: FONT.sizeXs, color: '#166534', marginTop: '2px' }}>
                        This zone is actively protected. Automated monitoring cycles and change-detection workers will compare new satellite observations against this active baseline.
                      </div>
                    </div>
                  </div>
                )}

                {/* Pipeline Technical Artifacts Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: SPACE.md,
                    fontSize: FONT.sizeXs,
                  }}
                >
                  <div
                    style={{
                      padding: SPACE.sm,
                      backgroundColor: '#F9FAFB',
                      borderRadius: RADII.md,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div style={{ color: COLORS.textMuted, marginBottom: '2px' }}>GEE Export Task ID</div>
                    <div
                      style={{
                        fontWeight: FONT.weightBold,
                        color: COLORS.text,
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                      }}
                    >
                      {selectedBaseline.geeExportTaskId || 'Not initialized'}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: SPACE.sm,
                      backgroundColor: '#F9FAFB',
                      borderRadius: RADII.md,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div style={{ color: COLORS.textMuted, marginBottom: '2px' }}>Google Drive File</div>
                    <div
                      style={{
                        fontWeight: FONT.weightBold,
                        color: COLORS.text,
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                      }}
                    >
                      {selectedBaseline.driveFileName || 'Pending GEE completion'}
                    </div>
                    {selectedBaseline.driveFileSizeBytes ? (
                      <div style={{ color: COLORS.textMuted, marginTop: '2px' }}>
                        Size: {(selectedBaseline.driveFileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      padding: SPACE.sm,
                      backgroundColor: '#F9FAFB',
                      borderRadius: RADII.md,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div style={{ color: COLORS.textMuted, marginBottom: '2px' }}>Raster Validation</div>
                    <div style={{ fontWeight: FONT.weightBold, color: COLORS.text }}>
                      {selectedBaseline.rasterWidth && selectedBaseline.rasterHeight
                        ? `${selectedBaseline.rasterWidth} × ${selectedBaseline.rasterHeight} px`
                        : 'Validation pending'}
                    </div>
                    {selectedBaseline.rasterCrs && (
                      <div style={{ color: COLORS.textMuted, marginTop: '2px' }}>
                        CRS: {selectedBaseline.rasterCrs} | Bands: {selectedBaseline.rasterBandCount ?? 0}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      padding: SPACE.sm,
                      backgroundColor: '#F9FAFB',
                      borderRadius: RADII.md,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div style={{ color: COLORS.textMuted, marginBottom: '2px' }}>Spectral Indicators</div>
                    <div style={{ fontWeight: FONT.weightBold, color: COLORS.text }}>
                      {selectedBaseline.spectralIndicesCalculated
                        ? 'NDVI, NDWI, NDBI Extracted'
                        : 'Pending GeoTIFF ingestion'}
                    </div>
                    <div style={{ color: COLORS.textMuted, marginTop: '2px' }}>
                      Status: {selectedBaseline.status}
                    </div>
                  </div>

                  {selectedBaseline.sensorType === SensorType.SAR && (
                    <div
                      style={{
                        padding: SPACE.sm,
                        backgroundColor: '#EFF6FF',
                        borderRadius: RADII.md,
                        border: '1px solid #BFDBFE',
                      }}
                    >
                      <div style={{ color: '#1E40AF', marginBottom: '2px', fontWeight: FONT.weightBold }}>
                        SAR Orbit &amp; Geometry
                      </div>
                      <div style={{ fontWeight: FONT.weightBold, color: '#1E3A8A' }}>
                        Track {selectedBaseline.relativeOrbitNumber ?? 92} ({selectedBaseline.orbitDirection || 'DESCENDING'})
                      </div>
                      <div style={{ color: COLORS.textMuted, marginTop: '2px', fontSize: '11px' }}>
                        Mode: {selectedBaseline.mode || 'IW'} · Pol: {selectedBaseline.polarizations?.join('+') || 'VV+VH'} · S1 Repeat: 12d
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Processed Results & Indicators List */}
            <div
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: RADII.xl,
                padding: SPACE.xl,
                boxShadow: SHADOWS.md,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <h3
                style={{
                  fontSize: FONT.sizeXl,
                  fontWeight: FONT.weightBold,
                  color: COLORS.primary,
                  marginBottom: SPACE.lg,
                }}
              >
                Local Processing Results History
              </h3>

              {results.length === 0 ? (
                <EmptyState
                  title="No Processing Results"
                  description="Run local image processing on acquired satellite metadata to extract spectral indicators."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
                  {results.map((res) => (
                    <div
                      key={res.id}
                      onClick={() => setSelectedResult(res)}
                      style={{
                        padding: SPACE.lg,
                        borderRadius: RADII.lg,
                        border: `1px solid ${selectedResult?.id === res.id ? COLORS.primary : COLORS.border}`,
                        backgroundColor:
                          selectedResult?.id === res.id
                            ? 'rgba(45, 106, 79, 0.04)'
                            : COLORS.surface,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: SPACE.xs,
                        }}
                      >
                        <span style={{ fontWeight: FONT.weightBold, color: COLORS.text }}>
                          {res.source} ({res.sensorType})
                        </span>
                        <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                          {new Date(res.acquisitionDate).toLocaleString()}
                        </span>
                      </div>

                      {res.fallbackTriggered && (
                        <div
                          style={{
                            fontSize: FONT.sizeXs,
                            color: '#92400E',
                            backgroundColor: '#FEF3C7',
                            padding: '4px 8px',
                            borderRadius: RADII.sm,
                            marginBottom: SPACE.xs,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          <span>{res.fallbackReason}</span>
                        </div>
                      )}

                      {res.opticalMetrics && (
                        <div
                          style={{
                            display: 'flex',
                            gap: SPACE.lg,
                            fontSize: FONT.sizeXs,
                            color: COLORS.textMuted,
                            marginTop: SPACE.xs,
                          }}
                        >
                          <span>
                            NDVI: <b>{res.opticalMetrics.ndvi}</b>
                          </span>
                          <span>
                            NDWI: <b>{res.opticalMetrics.ndwi}</b>
                          </span>
                          <span>
                            BSI: <b>{res.opticalMetrics.bsi}</b>
                          </span>
                          <span>
                            SAVI: <b>{res.opticalMetrics.savi}</b>
                          </span>
                        </div>
                      )}

                      {res.sarMetrics && (
                        <div
                          style={{
                            display: 'flex',
                            gap: SPACE.lg,
                            fontSize: FONT.sizeXs,
                            color: COLORS.textMuted,
                            marginTop: SPACE.xs,
                          }}
                        >
                          <span>
                            VV: <b>{res.sarMetrics.vv} dB</b>
                          </span>
                          <span>
                            VH: <b>{res.sarMetrics.vh} dB</b>
                          </span>
                          <span>
                            VV/VH: <b>{res.sarMetrics.vvVhRatio}</b>
                          </span>
                          {res.sarMetrics.vvDifference !== undefined && (
                            <span>
                              VV Diff: <b>{res.sarMetrics.vvDifference} dB</b>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Detail Panel for Selected Processing Result */}
          <div>
            <div
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: RADII.xl,
                padding: SPACE.xl,
                boxShadow: SHADOWS.md,
                border: `1px solid ${COLORS.border}`,
                position: 'sticky',
                top: SPACE.xl,
              }}
            >
              <h3
                style={{
                  fontSize: FONT.sizeLg,
                  fontWeight: FONT.weightBold,
                  color: COLORS.primary,
                  marginBottom: SPACE.md,
                }}
              >
                Spectral Indicator Details
              </h3>

              {!selectedResult ? (
                <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                  Select a processing result to view complete extracted indicators.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
                  <div>
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      Sensor Track &amp; Source
                    </span>
                    <div style={{ fontWeight: FONT.weightBold, color: COLORS.text }}>
                      {selectedResult.source} ({selectedResult.sensorType})
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      Quality Metrics
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: SPACE.xs,
                        marginTop: SPACE.xs,
                        fontSize: FONT.sizeXs,
                      }}
                    >
                      <div>
                        Cloud Cover: <b>{selectedResult.qualityMetrics.cloudCover}%</b>
                      </div>
                      <div>
                        Valid Pixels: <b>{selectedResult.qualityMetrics.validPixelPercentage}%</b>
                      </div>
                      <div>
                        Quality Score: <b>{selectedResult.qualityMetrics.imageQuality}/100</b>
                      </div>
                      <div>
                        Duration: <b>{selectedResult.processingDurationMs}ms</b>
                      </div>
                    </div>
                  </div>

                  {selectedResult.opticalMetrics && (
                    <div
                      style={{
                        backgroundColor: '#F0FDF4',
                        padding: SPACE.md,
                        borderRadius: RADII.lg,
                        border: '1px solid #DCFCE7',
                      }}
                    >
                      <h4
                        style={{
                          fontSize: FONT.sizeSm,
                          fontWeight: FONT.weightBold,
                          color: '#166534',
                          marginBottom: SPACE.sm,
                        }}
                      >
                        Optical Vegetation Indices
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: SPACE.sm,
                          fontSize: FONT.sizeXs,
                        }}
                      >
                        <div>
                          NDVI (Vegetation): <b>{selectedResult.opticalMetrics.ndvi}</b>
                        </div>
                        <div>
                          NDWI (Water): <b>{selectedResult.opticalMetrics.ndwi}</b>
                        </div>
                        <div>
                          NDBI (Built-up): <b>{selectedResult.opticalMetrics.ndbi}</b>
                        </div>
                        <div>
                          BSI (Bare Soil): <b>{selectedResult.opticalMetrics.bsi}</b>
                        </div>
                        <div>
                          SAVI (Soil Adj): <b>{selectedResult.opticalMetrics.savi}</b>
                        </div>
                        <div>
                          EVI (Enhanced): <b>{selectedResult.opticalMetrics.evi}</b>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedResult.sarMetrics && (
                    <div
                      style={{
                        backgroundColor: '#EFF6FF',
                        padding: SPACE.md,
                        borderRadius: RADII.lg,
                        border: '1px solid #DBEAFE',
                      }}
                    >
                      <h4
                        style={{
                          fontSize: FONT.sizeSm,
                          fontWeight: FONT.weightBold,
                          color: '#1E40AF',
                          marginBottom: SPACE.sm,
                        }}
                      >
                        SAR Backscatter Indicators
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: SPACE.sm,
                          fontSize: FONT.sizeXs,
                        }}
                      >
                        <div>
                          VV Backscatter: <b>{selectedResult.sarMetrics.vv} dB</b>
                        </div>
                        <div>
                          VH Backscatter: <b>{selectedResult.sarMetrics.vh} dB</b>
                        </div>
                        <div>
                          VV/VH Ratio: <b>{selectedResult.sarMetrics.vvVhRatio}</b>
                        </div>
                        {selectedResult.sarMetrics.vvDifference !== undefined && (
                          <div>
                            VV Baseline Diff: <b>{selectedResult.sarMetrics.vvDifference} dB</b>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BaselinePage;
