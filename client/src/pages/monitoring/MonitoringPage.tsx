import React, { useState, useEffect, useCallback, useRef } from 'react';
import { monitoringService } from '../../services/monitoring.service';
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
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { SatelliteMonitoringStatusPanel } from '../../components/monitoring/SatelliteMonitoringStatusPanel';
import {
  MonitoringJobType,
  MonitoringJobStatus,
  Permission,
  type MonitoringJobDto,
  type ZoneDto,
} from '@tn-forest/shared/types';
import axios from 'axios';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

type PStatusVariant = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const STATUS_META: Record<MonitoringJobStatus, { label: string; variant: PStatusVariant }> = {
  [MonitoringJobStatus.PENDING]: { label: 'Pending', variant: 'neutral' },
  [MonitoringJobStatus.ACQUIRING]: { label: 'Acquiring', variant: 'info' },
  [MonitoringJobStatus.EXPORTING]: { label: 'Exporting (GEE)', variant: 'info' },
  [MonitoringJobStatus.DOWNLOADING]: { label: 'Downloading (Drive)', variant: 'info' },
  [MonitoringJobStatus.PREPROCESSING]: { label: 'Preprocessing (GIS)', variant: 'warning' },
  [MonitoringJobStatus.PROCESSING]: { label: 'Processing (Spectral/Change)', variant: 'warning' },
  [MonitoringJobStatus.COMPLETED]: { label: 'Completed', variant: 'success' },
  [MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE]: { label: 'Waiting Next Cycle', variant: 'neutral' },
  [MonitoringJobStatus.FAILED]: { label: 'Failed', variant: 'danger' },
};

const TYPE_LABELS: Record<MonitoringJobType, string> = {
  [MonitoringJobType.SCHEDULED_SCAN]: 'Scheduled Scan',
  [MonitoringJobType.TARGETED_ACQUISITION]: 'Targeted Acquisition',
};

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

// ─── Log group filters & styling helper ─────────────────────────
const LOG_GROUPS = [
  { id: 'ALL', label: 'All Raw Logs' },
  { id: 'START', label: 'START', match: ['[START]'] },
  { id: 'ZONE', label: 'ZONE', match: ['[ZONE_VALIDATION]'] },
  { id: 'BASELINE', label: 'BASELINE', match: ['[BASELINE_LOOKUP]', '[BASELINE_FOUND]'] },
  {
    id: 'CURRENT',
    label: 'CURRENT',
    match: [
      '[CURRENT_IMAGE_LOOKUP]',
      '[CANDIDATE_SELECTION]',
      '[CURRENT_IMAGE_FOUND]',
      '[COMPARISON_VALIDATION]',
      '[IMAGE_COMPARISON]',
    ],
  },
  { id: 'GEE', label: 'GEE & EXPORT', match: ['[GEE_REQUEST]', '[GEE_RESPONSE]', '[GEE_EXPORT_REQUEST]', '[GEE_EXPORT_STATUS]'] },
  { id: 'DRIVE', label: 'GOOGLE DRIVE', match: ['[GOOGLE_DRIVE_DOWNLOAD]', '[GOOGLE_DRIVE_LOOKUP]'] },
  { id: 'RASTER', label: 'RASTER & GIS', match: ['[RASTER_VALIDATION]', '[PREPROCESSING]', '[CLOUD_MASKING]', '[HARMONIZATION]', '[PIXEL_EXTRACTION]', '[BAND_EXTRACTION]', '[NORMALIZATION]'] },
  { id: 'M5', label: 'SPECTRAL', match: ['[M5_START]', '[M5_RESULTS]', '[SPECTRAL_INDEX_CALCULATION]', '[LOCAL_PROCESSING_START]', '[LOCAL_PROCESSING_RESULT]'] },
  {
    id: 'M6',
    label: 'CHANGE DETECTION',
    match: [
      '[M6_START]',
      '[M6_PIXEL_ANALYSIS]',
      '[M6_VALIDATION]',
      '[M6_AREA_ANALYSIS]',
      '[M6_EVIDENCE]',
      '[ANOMALY_EVALUATION]',
    ],
  },
  { id: 'ALERT', label: 'ALERT', match: ['[ALERT_DECISION]', '[ANOMALY_EVALUATION]'] },
  {
    id: 'PERSISTENCE',
    label: 'PERSISTENCE',
    match: ['[PERSISTENCE_START]', '[PERSISTENCE_SUCCESS]', '[PERSISTENCE_VALIDATION]'],
  },
  { id: 'PERFORMANCE', label: 'PERFORMANCE', match: ['[PERFORMANCE]'] },
  {
    id: 'COMPLETE',
    label: 'COMPLETE',
    match: ['[SUMMARY]', '[COMPLETION]', '[JOB_COMPLETED]'],
  },
  { id: 'ERROR', label: 'ERROR', match: ['[ERROR]'] },
];

const getLogLineStyle = (line: string): React.CSSProperties => {
  if (
    line.includes('===') ||
    line.includes('[START]') ||
    line.includes('[SUMMARY]') ||
    line.includes('MONITORING JOB FINAL SUMMARY') ||
    line.includes('MONITORING JOB COMPLETED')
  ) {
    return { color: '#38bdf8', fontWeight: 'bold' };
  }
  if (
    line.includes('[ERROR]') ||
    line.includes('ERROR') ||
    line.includes('FAILED') ||
    line.includes('rejected') ||
    line.includes('ALERT GENERATED')
  ) {
    return { color: '#f87171', fontWeight: 'bold' };
  }
  if (
    line.includes('SUCCESS') ||
    line.includes('NO ALERT') ||
    line.includes('[ALERT_DECISION]') ||
    line.includes('[PERSISTENCE_SUCCESS]') ||
    line.includes('COMPLETED')
  ) {
    return { color: '#4ade80', fontWeight: 'bold' };
  }
  if (
    line.includes('[M5_RESULTS]') ||
    line.includes('[M6_PIXEL_ANALYSIS]') ||
    line.includes('[M6_AREA_ANALYSIS]') ||
    line.includes('[ANOMALY_EVALUATION]') ||
    line.includes('NDVI:') ||
    line.includes('NDWI:') ||
    line.includes('BSI:') ||
    line.includes('EVI:') ||
    line.includes('SAVI:') ||
    line.includes('Evidence Score:') ||
    line.includes('Affected Area:')
  ) {
    return { color: '#fbbf24', fontWeight: '600' };
  }
  if (
    line.includes('[BASELINE_FOUND]') ||
    line.includes('[CURRENT_IMAGE_FOUND]') ||
    line.includes('[BASELINE_LOOKUP]') ||
    line.includes('[CURRENT_IMAGE_LOOKUP]') ||
    line.includes('[CANDIDATE_SELECTION]')
  ) {
    return { color: '#c084fc' };
  }
  if (line.includes('[GEE_REQUEST]') || line.includes('[GEE_RESPONSE]')) {
    return { color: '#60a5fa' };
  }
  return { color: '#cbd5e1' };
};

const MonitoringPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [jobs, setJobs] = useState<MonitoringJobDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('');

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

  const [selectedJob, setSelectedJob] = useState<MonitoringJobDto | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Traceable log UI states
  const [logFilterGroup, setLogFilterGroup] = useState<string>('ALL');
  const [logSearchTerm, setLogSearchTerm] = useState<string>('');
  const [isLogExpanded, setIsLogExpanded] = useState<boolean>(false);
  const [copiedLogMsg, setCopiedLogMsg] = useState<string | null>(null);
  const logConsoleRef = useRef<HTMLDivElement | null>(null);

  const [formData, setFormData] = useState({
    type: MonitoringJobType.TARGETED_ACQUISITION,
    zoneId: '',
  });

  // Auto-scroll log viewer to bottom on job selection or logs update
  useEffect(() => {
    if (logConsoleRef.current) {
      logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
    }
  }, [selectedJob?.logs, logFilterGroup, logSearchTerm]);

  const canSchedule =
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.permissions.includes(Permission.MONITORING_READ);

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

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await monitoringService.getJobs({
        status: statusFilter || undefined,
        zoneId: zoneId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setJobs(data);
    } catch (err: unknown) {
      let msg = 'Failed to fetch monitoring jobs';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, zoneId, startDate, endDate]);

  useEffect(() => {
    fetchZones();
    fetchJobs();
  }, [fetchJobs]);

  const handleScheduleJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.zoneId) {
      setError('Please select a zone');
      return;
    }

    try {
      setIsScheduling(true);
      setError(null);
      setSuccessMsg(null);
      await monitoringService.scheduleJob({
        type: formData.type as MonitoringJobType,
        zoneId: formData.zoneId,
      });
      setSuccessMsg('Monitoring job scheduled successfully.');
      fetchJobs();
    } catch (err: unknown) {
      let msg = 'Failed to schedule job';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleForceProcess = async (id: string) => {
    try {
      setIsProcessing(true);
      setError(null);
      setSuccessMsg(null);
      const updatedJob = await monitoringService.processJob(id);
      setSelectedJob(updatedJob);
      setSuccessMsg('Job processed successfully.');
      fetchJobs();
    } catch (err: unknown) {
      let msg = 'Failed to process job';
      if (axios.isAxiosError(err) && err.response?.data?.message) msg = err.response.data.message;
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading && jobs.length === 0) {
    return (
      <div
        style={{
          padding: SPACE['2xl'],
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Loading size="lg" message="Loading monitoring dashboard..." />
      </div>
    );
  }

  const pendingCount = jobs.filter((j) => j.status === MonitoringJobStatus.PENDING).length;
  const activeProcessingStatuses = [
    MonitoringJobStatus.PROCESSING,
    MonitoringJobStatus.DOWNLOADING,
    MonitoringJobStatus.ACQUIRING,
    MonitoringJobStatus.EXPORTING,
    MonitoringJobStatus.PREPROCESSING,
  ];
  const processingCount = jobs.filter((j) => activeProcessingStatuses.includes(j.status)).length;
  const completedCount = jobs.filter((j) => j.status === MonitoringJobStatus.COMPLETED).length;
  const waitingCount = jobs.filter(
    (j) => j.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE,
  ).length;
  const failedCount = jobs.filter((j) => j.status === MonitoringJobStatus.FAILED).length;
  const successfulCyclesCount = completedCount + waitingCount;

  if (!selectedZone) {
    return (
      <div style={{ padding: SPACE.xl, maxWidth: 1400, margin: '0 auto' }}>
        <ZoneWorkspaceDirectory
          moduleTitle="MONITORING JOBS"
          moduleSubtitle="Automated satellite acquisition pipelines, dual-track periodic change detection, and operational job execution."
          moduleBadge="SURVEILLANCE SCHEDULER"
          department="FOREST PROTECTION & SURVEILLANCE DIVISION"
          zones={zones}
          loading={!zonesLoaded}
          onSelectZone={(zid) => setZoneId(zid)}
          actionLabel="OPEN MONITORING WORKSPACE →"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.25-4.24" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: SPACE.xl,
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.xl,
        minHeight: '100%',
      }}
    >
      <PageHeader
        title="Monitoring Jobs"
        subtitle="Manage scheduled and targeted satellite monitoring jobs."
      />

      <SatelliteMonitoringStatusPanel />

      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      {successMsg && (
        <div
          style={{
            padding: SPACE.md,
            backgroundColor: '#dcfce7',
            color: '#166534',
            borderRadius: RADII.md,
            border: '1px solid #bbf7d0',
            fontSize: FONT.sizeSm,
            fontWeight: FONT.weightMedium,
          }}
        >
          {successMsg}
        </div>
      )}

      {/* ─── Stats Row ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: SPACE.md,
        }}
      >
        <StatCard
          label="Total Jobs"
          value={jobs.length}
          tooltip="Total monitoring jobs in the system"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
          color="#334155"
          bgColor="#F1F5F9"
        />
        <StatCard
          label="Pending"
          value={pendingCount}
          tooltip="Monitoring job is queued and has not started."
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          }
          color="#64748B"
          bgColor="#F8FAFC"
        />
        <StatCard
          label="Processing"
          value={processingCount}
          tooltip="Monitoring work is currently being executed."
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.25-4.24" />
            </svg>
          }
          color="#D97706"
          bgColor="#FEF3C7"
        />
        <StatCard
          label="Completed"
          value={completedCount}
          tooltip="Monitoring job completed successfully and processed an eligible satellite observation."
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="M22 4L12 14.01l-3-3" />
            </svg>
          }
          color="#059669"
          bgColor="#D1FAE5"
        />
        <StatCard
          label="Waiting"
          value={waitingCount}
          tooltip="Monitoring evaluation completed successfully, but no newer eligible satellite observation was available. The zone will be evaluated again during the next monitoring cycle."
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l3 3" />
            </svg>
          }
          color="#0284C7"
          bgColor="#E0F2FE"
        />
        <StatCard
          label="Failed"
          value={failedCount}
          tooltip="Monitoring job terminated because an error occurred."
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          }
          color="#DC2626"
          bgColor="#FEE2E2"
        />
        <StatCard
          label="Successful Cycles"
          value={successfulCyclesCount}
          tooltip="Monitoring evaluations completed without execution failure, including cycles where no new observation was available."
          description={`${completedCount} Processed + ${waitingCount} Waiting`}
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          }
          color="#047857"
          bgColor="#ECFDF5"
        />
      </div>

      {/* ─── Zone Context Header ─── */}
      <ZoneContextHeader
        zone={selectedZone}
        isInvalid={isZoneInvalid}
        invalidZoneId={zoneId}
        onClearZone={clearZone}
        currentModule="monitoring"
      />

      <div style={{ display: 'flex', gap: SPACE.xl, alignItems: 'flex-start' }}>
        {/* ─── Main Content (Filters & Table) ─── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: SPACE.md,
              padding: SPACE.lg,
              backgroundColor: COLORS.surface,
              borderRadius: RADII.lg,
              boxShadow: SHADOWS.sm,
              border: `1px solid ${COLORS.borderLight}`,
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <ZoneSelector
              zones={zones}
              selectedZoneId={zoneId}
              onSelectZone={setZoneId}
              allowAllZones
              allZonesLabel="All Monitored Zones"
              style={{ flex: 1 }}
            />

            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              datePreset={datePreset}
              onPresetChange={setDatePreset}
              onRangeChange={setDateRange}
              onClear={clearDateFilter}
              label="Schedule Window"
            />

            <div style={{ minWidth: 180 }}>
              <label style={formLbl}>Status</label>
              <select
                style={formInp}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {Object.keys(STATUS_META).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_META[status as MonitoringJobStatus].label}
                  </option>
                ))}
              </select>
            </div>

            {(statusFilter || zoneId || startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  clearZone();
                  clearDateFilter();
                }}
                style={{
                  padding: '8px 14px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADII.md,
                  color: COLORS.textMuted,
                  fontSize: FONT.sizeSm,
                  cursor: 'pointer',
                  marginBottom: '1px',
                }}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Jobs List */}
          <div
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: RADII.lg,
              boxShadow: SHADOWS.sm,
              border: `1px solid ${COLORS.borderLight}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: SPACE.lg,
                borderBottom: `1px solid ${COLORS.borderLight}`,
                backgroundColor: COLORS.bg,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: FONT.sizeLg,
                  color: COLORS.text,
                  fontWeight: FONT.weightSemibold,
                }}
              >
                Job History
              </h2>
            </div>

            {jobs.length === 0 ? (
              <EmptyState
                title="No monitoring jobs available."
                description="Create a monitoring job for a marked zone."
                icon={
                  <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                }
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: COLORS.bg,
                        borderBottom: `1px solid ${COLORS.borderLight}`,
                      }}
                    >
                      <th
                        style={{
                          padding: `${SPACE.md} ${SPACE.lg}`,
                          fontSize: FONT.sizeSm,
                          color: COLORS.textMuted,
                          fontWeight: FONT.weightSemibold,
                        }}
                      >
                        Job ID
                      </th>
                      <th
                        style={{
                          padding: `${SPACE.md} ${SPACE.lg}`,
                          fontSize: FONT.sizeSm,
                          color: COLORS.textMuted,
                          fontWeight: FONT.weightSemibold,
                        }}
                      >
                        Zone
                      </th>
                      <th
                        style={{
                          padding: `${SPACE.md} ${SPACE.lg}`,
                          fontSize: FONT.sizeSm,
                          color: COLORS.textMuted,
                          fontWeight: FONT.weightSemibold,
                        }}
                      >
                        Type
                      </th>
                      <th
                        style={{
                          padding: `${SPACE.md} ${SPACE.lg}`,
                          fontSize: FONT.sizeSm,
                          color: COLORS.textMuted,
                          fontWeight: FONT.weightSemibold,
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          padding: `${SPACE.md} ${SPACE.lg}`,
                          fontSize: FONT.sizeSm,
                          color: COLORS.textMuted,
                          fontWeight: FONT.weightSemibold,
                        }}
                      >
                        Scheduled
                      </th>
                      <th
                        style={{
                          padding: `${SPACE.md} ${SPACE.lg}`,
                          fontSize: FONT.sizeSm,
                          color: COLORS.textMuted,
                          fontWeight: FONT.weightSemibold,
                        }}
                      ></th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const zone = zones.find((z) => z.id === job.zoneId);
                      const sMeta = STATUS_META[job.status];
                      return (
                        <tr
                          key={job.id}
                          style={{
                            borderBottom: `1px solid ${COLORS.borderLight}`,
                            transition: 'background-color 0.15s',
                          }}
                        >
                          <td
                            style={{
                              padding: `${SPACE.md} ${SPACE.lg}`,
                              fontSize: FONT.sizeSm,
                              fontWeight: FONT.weightMedium,
                            }}
                          >
                            {job.jobId}
                          </td>
                          <td style={{ padding: `${SPACE.md} ${SPACE.lg}`, fontSize: FONT.sizeSm }}>
                            {zone?.name || 'Unknown Zone'}
                          </td>
                          <td style={{ padding: `${SPACE.md} ${SPACE.lg}`, fontSize: FONT.sizeSm }}>
                            {TYPE_LABELS[job.type]}
                          </td>
                          <td style={{ padding: `${SPACE.md} ${SPACE.lg}` }}>
                            <StatusBadge label={sMeta.label} variant={sMeta.variant} />
                          </td>
                          <td
                            style={{
                              padding: `${SPACE.md} ${SPACE.lg}`,
                              fontSize: FONT.sizeSm,
                              color: COLORS.textMuted,
                            }}
                          >
                            {new Date(job.scheduledAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: `${SPACE.md} ${SPACE.lg}`, textAlign: 'right' }}>
                            <button
                              onClick={() => setSelectedJob(job)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: 'transparent',
                                color: COLORS.primary,
                                border: `1px solid ${COLORS.primary}`,
                                borderRadius: RADII.md,
                                fontSize: FONT.sizeSm,
                                cursor: 'pointer',
                                fontWeight: FONT.weightMedium,
                              }}
                            >
                              View Details
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
        </div>

        {/* ─── Right Panel (Details / Schedule Form) ─── */}
        <div style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          {selectedJob ? (
            <div
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: RADII.lg,
                boxShadow: SHADOWS.sm,
                border: `1px solid ${COLORS.borderLight}`,
                padding: SPACE.xl,
                position: 'sticky',
                top: SPACE.xl,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: SPACE.lg,
                }}
              >
                <h3 style={{ margin: 0, fontSize: FONT.sizeLg, color: COLORS.text }}>
                  Job Details
                </h3>
                <button
                  onClick={() => setSelectedJob(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: COLORS.textMuted,
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <DetailRow label="Job ID">
                <div
                  style={{
                    fontSize: FONT.sizeMd,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.text,
                  }}
                >
                  {selectedJob.jobId}
                </div>
              </DetailRow>

              <DetailRow label="Type">
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.text }}>
                  {TYPE_LABELS[selectedJob.type]}
                </div>
              </DetailRow>

              <DetailRow label="Status">
                <StatusBadge
                  label={STATUS_META[selectedJob.status].label}
                  variant={STATUS_META[selectedJob.status].variant}
                />
              </DetailRow>

              <DetailRow label="Timestamps">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: SPACE.sm,
                    fontSize: FONT.sizeSm,
                    color: COLORS.text,
                  }}
                >
                  <div>
                    <span style={{ color: COLORS.textMuted }}>Scheduled:</span>
                    <br />
                    {new Date(selectedJob.scheduledAt).toLocaleString()}
                  </div>
                  {selectedJob.startedAt && (
                    <div>
                      <span style={{ color: COLORS.textMuted }}>Started:</span>
                      <br />
                      {new Date(selectedJob.startedAt).toLocaleString()}
                    </div>
                  )}
                  {selectedJob.completedAt && (
                    <div>
                      <span style={{ color: COLORS.textMuted }}>Completed:</span>
                      <br />
                      {new Date(selectedJob.completedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </DetailRow>

              {selectedJob.results && (
                <div
                  style={{
                    marginTop: SPACE.xl,
                    backgroundColor: COLORS.bg,
                    padding: SPACE.lg,
                    borderRadius: RADII.md,
                    border: `1px solid ${COLORS.borderLight}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: FONT.sizeSm,
                      fontWeight: FONT.weightBold,
                      marginBottom: SPACE.md,
                      color: COLORS.primary,
                    }}
                  >
                    Local Processing Results
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm }}>
                    <div
                      style={{
                        backgroundColor: COLORS.surface,
                        padding: SPACE.sm,
                        borderRadius: RADII.sm,
                        border: `1px solid ${COLORS.borderLight}`,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          color: COLORS.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        NDVI
                      </div>
                      <div
                        style={{
                          fontSize: FONT.sizeLg,
                          fontWeight: FONT.weightBold,
                          color: '#047857',
                        }}
                      >
                        {selectedJob.results.ndviMean !== undefined ? selectedJob.results.ndviMean.toFixed(3) : 'N/A'}
                      </div>
                    </div>
                    <div
                      style={{
                        backgroundColor: COLORS.surface,
                        padding: SPACE.sm,
                        borderRadius: RADII.sm,
                        border: `1px solid ${COLORS.borderLight}`,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          color: COLORS.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        Change Detected
                      </div>
                      <div
                        style={{
                          fontSize: FONT.sizeLg,
                          fontWeight: FONT.weightBold,
                          color: '#2563eb',
                        }}
                      >
                        {selectedJob.results.affectedAreaPercentage !== undefined
                          ? `${selectedJob.results.affectedAreaPercentage.toFixed(2)}%`
                          : '0.00%'}
                      </div>
                    </div>
                    <div
                      style={{
                        backgroundColor: COLORS.surface,
                        padding: SPACE.sm,
                        borderRadius: RADII.sm,
                        border: `1px solid ${COLORS.borderLight}`,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          color: COLORS.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        Evidence Score
                      </div>
                      <div
                        style={{
                          fontSize: FONT.sizeLg,
                          fontWeight: FONT.weightBold,
                          color: '#d97706',
                        }}
                      >
                        {selectedJob.results.evidenceScore !== undefined
                          ? `${selectedJob.results.evidenceScore}/100`
                          : selectedJob.results.anomalyScore !== undefined
                          ? `${selectedJob.results.anomalyScore}/100`
                          : 'N/A'}
                      </div>
                    </div>
                    <div
                      style={{
                        backgroundColor: COLORS.surface,
                        padding: SPACE.sm,
                        borderRadius: RADII.sm,
                        border: `1px solid ${COLORS.borderLight}`,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          color: COLORS.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        Severity
                      </div>
                      <div
                        style={{
                          fontSize: FONT.sizeLg,
                          fontWeight: FONT.weightBold,
                          color:
                            (selectedJob.results.severity || (selectedJob.diagnostics as { m6?: { severity?: string } } | undefined)?.m6?.severity) === 'HIGH'
                              ? '#dc2626'
                              : (selectedJob.results.severity || (selectedJob.diagnostics as { m6?: { severity?: string } } | undefined)?.m6?.severity) === 'MEDIUM'
                              ? '#d97706'
                              : '#10b981',
                        }}
                      >
                        {selectedJob.results.severity || (selectedJob.diagnostics as { m6?: { severity?: string } } | undefined)?.m6?.severity || 'NONE'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: SPACE.md,
                      padding: SPACE.sm,
                      backgroundColor: COLORS.surface,
                      borderRadius: RADII.sm,
                      border: `1px solid ${COLORS.borderLight}`,
                      fontSize: FONT.sizeXs,
                      color: COLORS.text,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                    }}
                  >
                    <div>
                      <span style={{ color: COLORS.textMuted }}>Changed Pixels: </span>
                      <strong>
                        {(selectedJob.diagnostics as { m6?: { changedPixels?: number } } | undefined)?.m6?.changedPixels ?? (selectedJob.results as Record<string, unknown>)?.changedPixels as number ?? 0}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: COLORS.textMuted }}>Valid Pixels: </span>
                      <strong>
                        {(selectedJob.diagnostics as { m6?: { validPixels?: number } } | undefined)?.m6?.validPixels ?? (selectedJob.results as Record<string, unknown>)?.validPixels as number ?? 0}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: COLORS.textMuted }}>Affected Area: </span>
                      <strong>
                        {selectedJob.results.affectedAreaHa !== undefined
                          ? `${selectedJob.results.affectedAreaHa.toFixed(2)} ha`
                          : '0.00 ha'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: COLORS.textMuted }}>Alert: </span>
                      <strong
                        style={{
                          color: (selectedJob.diagnostics as { alertDecision?: { alertGenerated?: boolean } } | undefined)?.alertDecision?.alertGenerated ? '#dc2626' : '#10b981',
                        }}
                      >
                        {(selectedJob.diagnostics as { alertDecision?: { alertGenerated?: boolean } } | undefined)?.alertDecision?.alertGenerated ? 'ALERT GENERATED' : 'NO ALERT'}
                      </strong>
                    </div>
                    {selectedJob.results.cloudCoverUsed !== undefined && (
                      <div style={{ gridColumn: 'span 2', textAlign: 'center', marginTop: '2px', borderTop: `1px dashed ${COLORS.borderLight}`, paddingTop: '4px' }}>
                        <span style={{ color: COLORS.textMuted }}>Cloud Cover: </span>
                        <strong>{selectedJob.results.cloudCoverUsed}%</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedJob.status === MonitoringJobStatus.PENDING ||
              selectedJob.status === MonitoringJobStatus.FAILED ? (
                <button
                  onClick={() => handleForceProcess(selectedJob.id)}
                  disabled={isProcessing || !canSchedule}
                  style={{
                    width: '100%',
                    marginTop: SPACE.xl,
                    padding: '10px',
                    backgroundColor: canSchedule ? COLORS.primary : COLORS.textMuted,
                    color: '#fff',
                    border: 'none',
                    borderRadius: RADII.md,
                    fontSize: FONT.sizeMd,
                    fontWeight: FONT.weightSemibold,
                    cursor: canSchedule && !isProcessing ? 'pointer' : 'not-allowed',
                    opacity: isProcessing ? 0.7 : 1,
                  }}
                >
                  {isProcessing ? 'Processing...' : 'Force Local Processing'}
                </button>
              ) : null}

              {selectedJob.errorMessage && (
                <div
                  style={{
                    marginTop: SPACE.xl,
                    padding: SPACE.md,
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: RADII.md,
                    color: '#991b1b',
                    fontSize: FONT.sizeSm,
                  }}
                >
                  <strong>Error:</strong> {selectedJob.errorMessage}
                </div>
              )}

              {selectedJob.logs && selectedJob.logs.length > 0 && (() => {
                const currentGroup = LOG_GROUPS.find((g) => g.id === logFilterGroup);
                const filteredLogs = selectedJob.logs.filter((log) => {
                  if (logSearchTerm && !log.toLowerCase().includes(logSearchTerm.toLowerCase())) {
                    return false;
                  }
                  if (!currentGroup || currentGroup.id === 'ALL' || !currentGroup.match) {
                    return true;
                  }
                  return currentGroup.match.some((keyword) => log.includes(keyword));
                });

                const copyAllLogs = () => {
                  navigator.clipboard.writeText(selectedJob.logs.join('\n'));
                  setCopiedLogMsg('Copied!');
                  setTimeout(() => setCopiedLogMsg(null), 2000);
                };

                return (
                  <div style={{ marginTop: SPACE.xl }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: SPACE.sm,
                      }}
                    >
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          fontWeight: FONT.weightSemibold,
                          color: COLORS.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        Scientific Processing Logs ({filteredLogs.length}/{selectedJob.logs.length})
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={copyAllLogs}
                          style={{
                            background: 'none',
                            border: `1px solid ${COLORS.borderLight}`,
                            borderRadius: RADII.sm,
                            padding: '2px 8px',
                            fontSize: '11px',
                            color: COLORS.primary,
                            cursor: 'pointer',
                          }}
                        >
                          {copiedLogMsg || 'Copy All'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsLogExpanded(!isLogExpanded)}
                          style={{
                            background: 'none',
                            border: `1px solid ${COLORS.borderLight}`,
                            borderRadius: RADII.sm,
                            padding: '2px 8px',
                            fontSize: '11px',
                            color: COLORS.textMuted,
                            cursor: 'pointer',
                          }}
                        >
                          {isLogExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                    </div>

                    {/* Stage Group Filter Pills */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '4px',
                        overflowX: 'auto',
                        paddingBottom: '6px',
                        marginBottom: '6px',
                      }}
                    >
                      {LOG_GROUPS.map((group) => {
                        const active = logFilterGroup === group.id;
                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => setLogFilterGroup(group.id)}
                            style={{
                              padding: '3px 8px',
                              fontSize: '10px',
                              borderRadius: RADII.full,
                              border: 'none',
                              backgroundColor: active ? COLORS.primary : '#e2e8f0',
                              color: active ? '#ffffff' : COLORS.text,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              fontWeight: active ? FONT.weightBold : FONT.weightNormal,
                            }}
                          >
                            {group.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Keyword search input */}
                    <div style={{ marginBottom: '6px' }}>
                      <input
                        type="text"
                        placeholder="Search logs (e.g. NDVI, Anomaly, Sentinel, Baseline)..."
                        value={logSearchTerm}
                        onChange={(e) => setLogSearchTerm(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '4px 8px',
                          fontSize: '11px',
                          borderRadius: RADII.sm,
                          border: `1px solid ${COLORS.borderLight}`,
                          backgroundColor: COLORS.bg,
                          color: COLORS.text,
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* Terminal console */}
                    <div
                      ref={logConsoleRef}
                      style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: RADII.md,
                        padding: SPACE.md,
                        fontSize: '11px',
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        maxHeight: isLogExpanded ? '450px' : '180px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                      }}
                    >
                      {filteredLogs.length > 0 ? (
                        filteredLogs.map((log, i) => (
                          <div
                            key={i}
                            style={{
                              ...getLogLineStyle(log),
                              lineHeight: '1.4',
                              wordBreak: 'break-all',
                            }}
                          >
                            {log}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: '#64748b', fontStyle: 'italic' }}>
                          No log lines match the selected group/filter.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            canSchedule && (
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  boxShadow: SHADOWS.sm,
                  border: `1px solid ${COLORS.borderLight}`,
                  padding: SPACE.xl,
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: FONT.sizeLg, color: COLORS.text }}>
                  Schedule Job
                </h3>
                <form
                  onSubmit={handleScheduleJob}
                  style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}
                >
                  <div>
                    <label style={formLbl}>Job Type</label>
                    <select
                      style={formInp}
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value as MonitoringJobType })
                      }
                      required
                    >
                      <option value={MonitoringJobType.TARGETED_ACQUISITION}>
                        Targeted Acquisition
                      </option>
                      <option value={MonitoringJobType.SCHEDULED_SCAN}>Scheduled Scan</option>
                    </select>
                  </div>
                  <div>
                    <label style={formLbl}>Zone</label>
                    <select
                      style={formInp}
                      value={formData.zoneId}
                      onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
                      required
                    >
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isScheduling}
                    style={{
                      marginTop: SPACE.sm,
                      padding: '10px 16px',
                      backgroundColor: COLORS.primary,
                      color: 'white',
                      border: 'none',
                      borderRadius: RADII.md,
                      fontWeight: FONT.weightSemibold,
                      cursor: isScheduling ? 'not-allowed' : 'pointer',
                      opacity: isScheduling ? 0.7 : 1,
                    }}
                  >
                    {isScheduling ? 'Scheduling...' : 'Create Monitoring Job'}
                  </button>
                </form>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default MonitoringPage;
