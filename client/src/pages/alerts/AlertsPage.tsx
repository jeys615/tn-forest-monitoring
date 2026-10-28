import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import StatusBadge, { type BadgeVariant } from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { SatelliteImageViewerModal } from '../../components/satellite/SatelliteImageViewerModal';
import { alertService } from '../../services/alert.service';
import { zoneService } from '../../services/zone.service';
import { useAuth } from '../../hooks/useAuth';
import { COLORS, FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import {
  AlertSeverity,
  AlertStatus,
  AlertAction,
  MonitoringTrack,
  ComparisonMode,
  Permission,
  UserRole,
  type AlertDto,
  type AlertAuditEntryDto,
  type AlertStatsDto,
  type ZoneDto,
} from '@tn-forest/shared/types';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';

import { DateRangeFilter } from '../../components/common/DateRangeFilter';

// ─── Badge helpers ────────────────────────────────────────────────────────────

const getSeverityBadgeVariant = (severity: AlertSeverity): BadgeVariant => {
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

const getStatusBadgeVariant = (status: AlertStatus): BadgeVariant => {
  switch (status) {
    case AlertStatus.OPEN:
      return 'danger';
    case AlertStatus.ACKNOWLEDGED:
      return 'warning';
    case AlertStatus.UNDER_REVIEW:
      return 'info';
    case AlertStatus.CONFIRMED:
      return 'danger';
    case AlertStatus.RESOLVED:
      return 'success';
    case AlertStatus.DISMISSED:
      return 'neutral';
    default:
      return 'neutral';
  }
};

// ─── Available actions per status ─────────────────────────────────────────────

const ACTIONS_FOR_STATUS: Record<AlertStatus, AlertAction[]> = {
  [AlertStatus.OPEN]: [AlertAction.ACKNOWLEDGE, AlertAction.DISMISS],
  [AlertStatus.ACKNOWLEDGED]: [AlertAction.START_REVIEW, AlertAction.RESOLVE, AlertAction.DISMISS],
  [AlertStatus.UNDER_REVIEW]: [AlertAction.CONFIRM, AlertAction.RESOLVE, AlertAction.DISMISS],
  [AlertStatus.CONFIRMED]: [AlertAction.RESOLVE, AlertAction.DISMISS],
  [AlertStatus.RESOLVED]: [],
  [AlertStatus.DISMISSED]: [],
};

const ACTION_LABELS: Record<AlertAction, string> = {
  [AlertAction.ACKNOWLEDGE]: 'Acknowledge',
  [AlertAction.START_REVIEW]: 'Start Review',
  [AlertAction.CONFIRM]: 'Confirm',
  [AlertAction.DISMISS]: 'Dismiss',
  [AlertAction.RESOLVE]: 'Resolve',
  [AlertAction.ASSIGN]: 'Assign',
};

const TERMINAL_ACTIONS = new Set<AlertAction>([AlertAction.DISMISS, AlertAction.RESOLVE]);

// ─── Component ────────────────────────────────────────────────────────────────

export const AlertsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canUpdateAlerts =
    !!(user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.ALERT_UPDATE));

  // ── Filter state ────────────────────────────────────────────────────────────
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

  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedTrack, setSelectedTrack] = useState('ALL');
  const [selectedComparisonMode, setSelectedComparisonMode] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'severity' | 'affectedArea'>('newest');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // ── Data state ──────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<AlertDto[]>([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<AlertStatsDto | null>(null);
  const [auditHistory, setAuditHistory] = useState<AlertAuditEntryDto[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDto | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // ── Image viewer ────────────────────────────────────────────────────────────
  const [viewerChangeId, setViewerChangeId] = useState<string | null>(null);

  // ── Action modal state ──────────────────────────────────────────────────────
  const [actionModal, setActionModal] = useState<{
    alert: AlertDto;
    action: AlertAction;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [dismissalReason, setDismissalReason] = useState('');
  const [resolutionInfo, setResolutionInfo] = useState('');
  const [confirmTerminal, setConfirmTerminal] = useState(false);

  // ─── Load zones ─────────────────────────────────────────────────────────────

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

  // ─── Fetch alerts ────────────────────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, unknown> = {
        sortBy,
        page,
        pageSize: PAGE_SIZE,
      };
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (selectedSeverity !== 'ALL') filters.severity = selectedSeverity;
      if (selectedStatus !== 'ALL') filters.status = selectedStatus;
      if (selectedTrack !== 'ALL') filters.monitoringTrack = selectedTrack;
      if (selectedComparisonMode !== 'ALL') filters.comparisonMode = selectedComparisonMode;
      if (startDate) filters.fromDate = startDate;
      if (endDate) filters.toDate = endDate;

      const result = await alertService.getAlerts(filters as Parameters<typeof alertService.getAlerts>[0]);
      setAlerts(result.data);
      setTotalAlerts(result.total);
      setTotalPages(result.totalPages);
      if (result.data.length > 0 && !selectedAlert) {
        setSelectedAlert(result.data[0]);
      }
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, selectedSeverity, selectedStatus, selectedTrack, selectedComparisonMode, sortBy, page, selectedAlert, startDate, endDate]);

  // ─── Fetch stats ─────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (startDate) filters.fromDate = startDate;
      if (endDate) filters.toDate = endDate;
      const s = await alertService.getAlertStats(filters);
      setStats(s);
    } catch (err) {
      console.error('Failed to load stats', err);
    }
  }, [selectedZoneId, startDate, endDate]);

  useEffect(() => {
    void fetchAlerts();
    void fetchStats();
  }, [fetchAlerts, fetchStats]);

  // ─── Select alert + load audit history ───────────────────────────────────────

  const handleSelectAlert = async (alert: AlertDto) => {
    setSelectedAlert(alert);
    setAuditHistory([]);
    try {
      const history = await alertService.getAlertAuditHistory(alert.id);
      setAuditHistory(history);
    } catch (err) {
      console.error('Failed to load audit history', err);
    }
  };

  // ─── Open action modal ────────────────────────────────────────────────────────

  const openActionModal = (alert: AlertDto, action: AlertAction) => {
    setActionModal({ alert, action });
    setActionNotes('');
    setDismissalReason('');
    setResolutionInfo('');
    setConfirmTerminal(false);
  };

  // ─── Submit lifecycle action ──────────────────────────────────────────────────

  const handleSubmitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;
    const { alert, action } = actionModal;

    // Gate terminal confirmation
    if (TERMINAL_ACTIONS.has(action) && !confirmTerminal) {
      setConfirmTerminal(true);
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const updated = await alertService.performAlertAction(alert.id, {
        action,
        notes: actionNotes || undefined,
        dismissalReason: action === AlertAction.DISMISS ? dismissalReason : undefined,
        resolutionInfo: action === AlertAction.RESOLVE ? resolutionInfo : undefined,
      });

      setActionMessage(`Alert ${updated.alertId}: ${ACTION_LABELS[action]} applied`);
      setActionModal(null);
      setSelectedAlert(updated);
      await fetchAlerts();
      await fetchStats();
      const history = await alertService.getAlertAuditHistory(updated.id);
      setAuditHistory(history);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Pagination helpers ───────────────────────────────────────────────────────

  const resetPage = () => setPage(1);

  // ─── Reset page when filters change ──────────────────────────────────────────

  useEffect(() => {
    resetPage();
  }, [selectedZoneId, selectedSeverity, selectedStatus, selectedTrack, selectedComparisonMode, sortBy, startDate, endDate]);

  // ─── Rendering ────────────────────────────────────────────────────────────────

  const activeAlerts = stats ? stats.open + stats.acknowledged + stats.underReview + stats.confirmed : 0;


  // ─── Render Zone-Scoped Workspace ─────────────────────────────
  return (
    <div style={{ padding: SPACE.xl, maxWidth: 1440, margin: '0 auto' }}>
      <PageHeader
        title="Incident Alerts & Threat Dispatch"
        subtitle="Full alert lifecycle management: triage, review, field verification, resolution, and audit trail."
      />

      {/* Zone Context Header — only shown when a specific zone is filtered */}
      {selectedZone && (
        <ZoneContextHeader
          zone={selectedZone}
          isInvalid={isZoneInvalid}
          invalidZoneId={selectedZoneId}
          onClearZone={clearZone}
          currentModule="Incident Alerts"
          currentModulePath="/alerts"
        />
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: SPACE.md,
          marginBottom: SPACE.xl,
        }}
      >
        <StatCard label="Total Alerts" value={stats?.total ?? totalAlerts} color={COLORS.primary} bgColor="#D1FAE5"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>}
        />
        <StatCard label="Open" value={stats?.open ?? 0}
          color={stats?.open ?? 0 > 0 ? COLORS.dangerText : COLORS.textMuted}
          bgColor={stats?.open ?? 0 > 0 ? COLORS.dangerBg : COLORS.neutralBg}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
        />
        <StatCard label="Acknowledged" value={stats?.acknowledged ?? 0}
          color={COLORS.warningText} bgColor={COLORS.warningBg}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
        />
        <StatCard label="Under Review" value={stats?.underReview ?? 0}
          color={COLORS.primary} bgColor={COLORS.accentLight}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}
        />
        <StatCard label="Confirmed" value={stats?.confirmed ?? 0}
          color={stats?.confirmed ?? 0 > 0 ? COLORS.dangerText : COLORS.textMuted}
          bgColor={stats?.confirmed ?? 0 > 0 ? COLORS.dangerBg : COLORS.neutralBg}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>}
        />
        <StatCard label="High Severity" value={stats?.highSeverity ?? 0}
          color={stats?.highSeverity ?? 0 > 0 ? COLORS.dangerText : COLORS.textMuted}
          bgColor={stats?.highSeverity ?? 0 > 0 ? COLORS.dangerBg : COLORS.neutralBg}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
        />
      </div>

      {/* ── Action / Error banners ────────────────────────────────────────── */}
      {actionMessage && (
        <div style={{ padding: SPACE.md, backgroundColor: COLORS.successBg, color: COLORS.successText, borderRadius: RADII.md, marginBottom: SPACE.lg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
        </div>
      )}
      {error && <ErrorState message={error} onRetry={fetchAlerts} />}

      {/* ── Filter Toolbar ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.md, padding: SPACE.md, backgroundColor: COLORS.surface, borderRadius: RADII.lg, border: `1px solid ${COLORS.border}`, marginBottom: SPACE.xl, alignItems: 'flex-end' }}>
        {/* Zone */}
        <ZoneSelector
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
        />

        {/* Date Range */}
        <DateRangeFilter
          preset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={setDatePreset}
          onCustomRangeChange={setDateRange}
          onClear={clearDateFilter}
        />

        {/* Severity */}
        <FilterField label="SEVERITY">
          <select value={selectedSeverity} onChange={(e) => setSelectedSeverity(e.target.value)} style={selectStyle}>
            <option value="ALL">All Severities</option>
            <option value={AlertSeverity.HIGH}>High (≥10%)</option>
            <option value={AlertSeverity.MEDIUM}>Medium (5-10%)</option>
            <option value={AlertSeverity.LOW}>Low (2-5%)</option>
          </select>
        </FilterField>

        {/* Status */}
        <FilterField label="STATUS">
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} style={selectStyle}>
            <option value="ALL">All Statuses</option>
            <option value={AlertStatus.OPEN}>Open</option>
            <option value={AlertStatus.ACKNOWLEDGED}>Acknowledged</option>
            <option value={AlertStatus.UNDER_REVIEW}>Under Review</option>
            <option value={AlertStatus.CONFIRMED}>Confirmed</option>
            <option value={AlertStatus.RESOLVED}>Resolved</option>
            <option value={AlertStatus.DISMISSED}>Dismissed</option>
          </select>
        </FilterField>

        {/* Monitoring Track */}
        <FilterField label="TRACK">
          <select value={selectedTrack} onChange={(e) => setSelectedTrack(e.target.value)} style={selectStyle}>
            <option value="ALL">All Tracks</option>
            <option value={MonitoringTrack.OPTICAL}>Optical</option>
            <option value={MonitoringTrack.SAR}>SAR</option>
          </select>
        </FilterField>

        {/* Comparison Mode */}
        <FilterField label="COMPARISON MODE">
          <select value={selectedComparisonMode} onChange={(e) => setSelectedComparisonMode(e.target.value)} style={selectStyle}>
            <option value="ALL">All Modes</option>
            <option value={ComparisonMode.NATIVE}>Native Optical</option>
            <option value={ComparisonMode.HLS}>Cross-Sensor Harmonized Analysis (HLS)</option>
          </select>
        </FilterField>

        {/* Sort */}
        <FilterField label="SORT BY">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={selectStyle}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="severity">Highest Severity</option>
            <option value="affectedArea">Most Affected Area</option>
          </select>
        </FilterField>
      </div>

      {/* ── Main grid: Table + Detail panel ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: SPACE.xl, alignItems: 'start' }}>

        {/* ── Alert Table ─────────────────────────────────────────────────── */}
        <div style={{ backgroundColor: COLORS.surface, borderRadius: RADII.lg, border: `1px solid ${COLORS.border}`, boxShadow: SHADOWS.sm, overflow: 'hidden' }}>
          <div style={{ padding: `${SPACE.md} ${SPACE.lg}`, borderBottom: `1px solid ${COLORS.border}`, backgroundColor: COLORS.surfaceAlt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: FONT.sizeMd, fontWeight: FONT.weightSemibold, color: COLORS.text }}>
              Alert Records ({totalAlerts})
            </h3>
            {activeAlerts > 0 && (
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.dangerText, fontWeight: FONT.weightSemibold }}>
                {activeAlerts} active
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: SPACE['3xl'], textAlign: 'center', color: COLORS.textMuted }}>Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <EmptyState title="No alerts found." description="No environmental alerts match your active filter criteria." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.border}`, fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                    <th style={thStyle}>Alert ID</th>
                    <th style={thStyle}>Area / Track</th>
                    <th style={thStyle}>Severity</th>
                    <th style={thStyle}>Status</th>
                    {canUpdateAlerts && <th style={thStyle}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const isSelected = selectedAlert?.id === a.id;
                    const availableActions = canUpdateAlerts ? ACTIONS_FOR_STATUS[a.status] : [];
                    return (
                      <tr
                        key={a.id}
                        onClick={() => void handleSelectAlert(a)}
                        style={{ borderBottom: `1px solid ${COLORS.border}`, backgroundColor: isSelected ? 'rgba(27,67,50,0.08)' : 'transparent', cursor: 'pointer', fontSize: FONT.sizeSm }}
                      >
                        <td style={tdStyle}>
                          <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeXs }}>{a.alertId}</span>
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{new Date(a.detectedAt).toLocaleDateString()}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: FONT.weightBold, color: a.affectedAreaPercentage >= 10 ? COLORS.dangerText : COLORS.warningText }}>
                            {a.affectedAreaPercentage}%
                          </span>
                          <div style={{ fontSize: FONT.sizeXs, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                            <span style={{ padding: '1px 4px', backgroundColor: a.monitoringTrack === MonitoringTrack.SAR ? '#e0e7ff' : '#dcfce7', color: a.monitoringTrack === MonitoringTrack.SAR ? '#3730a3' : '#166534', borderRadius: RADII.sm, fontWeight: FONT.weightSemibold, width: 'fit-content' }}>
                              {a.monitoringTrack ?? 'OPTICAL'}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge variant={getSeverityBadgeVariant(a.severity)} label={a.severity} />
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge variant={getStatusBadgeVariant(a.status)} label={a.status.replace('_', ' ')} />
                        </td>
                        {canUpdateAlerts && (
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                              {availableActions.slice(0, 2).map((action) => (
                                <button
                                  key={action}
                                  onClick={(e) => { e.stopPropagation(); openActionModal(a, action); }}
                                  style={{ ...actionBtnBase, ...getActionBtnStyle(action) }}
                                >
                                  {ACTION_LABELS[action]}
                                </button>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding: SPACE.md, borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: SPACE.sm }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={paginationBtnStyle(page <= 1)}>← Prev</button>
              <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={paginationBtnStyle(page >= totalPages)}>Next →</button>
            </div>
          )}
        </div>

        {/* ── Alert Detail Panel ───────────────────────────────────────────── */}
        <div style={{ backgroundColor: COLORS.surface, borderRadius: RADII.lg, border: `1px solid ${COLORS.border}`, boxShadow: SHADOWS.sm, padding: SPACE.lg, position: 'sticky', top: 24 }}>
          {selectedAlert ? (
            <AlertDetailPanel
              alert={selectedAlert}
              auditHistory={auditHistory}
              canUpdate={canUpdateAlerts}
              onAction={openActionModal}
              onViewImages={(changeId) => setViewerChangeId(changeId)}
              onEscalateToCase={(a) => navigate(`/enforcement-cases?alertId=${a.alertId}&zoneId=${a.zoneId || ''}`)}
            />
          ) : (
            <div style={{ padding: SPACE.xl, textAlign: 'center', color: COLORS.textMuted }}>
              Select an alert to view details, evidence, and audit history.
            </div>
          )}
        </div>
      </div>

      {/* ── Action Modal ─────────────────────────────────────────────────── */}
      {actionModal && (
        <ActionModal
          alert={actionModal.alert}
          action={actionModal.action}
          notes={actionNotes}
          dismissalReason={dismissalReason}
          resolutionInfo={resolutionInfo}
          confirmTerminal={confirmTerminal}
          loading={actionLoading}
          onNotesChange={setActionNotes}
          onDismissalReasonChange={setDismissalReason}
          onResolutionInfoChange={setResolutionInfo}
          onSubmit={(e) => void handleSubmitAction(e)}
          onCancel={() => setActionModal(null)}
        />
      )}

      {/* ── Satellite Image Viewer ────────────────────────────────────────── */}
      {viewerChangeId && (
        <SatelliteImageViewerModal
          changeId={viewerChangeId}
          zoneName={zones.find((z) => z.id === selectedAlert?.zoneId)?.name}
          onClose={() => setViewerChangeId(null)}
        />
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AlertDetailPanelProps {
  alert: AlertDto;
  auditHistory: AlertAuditEntryDto[];
  canUpdate: boolean;
  onAction: (alert: AlertDto, action: AlertAction) => void;
  onViewImages: (changeId: string) => void;
  onEscalateToCase: (alert: AlertDto) => void;
}

const AlertDetailPanel: React.FC<AlertDetailPanelProps> = ({
  alert,
  auditHistory,
  canUpdate,
  onAction,
  onViewImages,
  onEscalateToCase,
}) => {
  const availableActions = canUpdate ? ACTIONS_FOR_STATUS[alert.status] : [];
  const isOptical = (alert.monitoringTrack ?? MonitoringTrack.OPTICAL) === MonitoringTrack.OPTICAL;
  const isSar = alert.monitoringTrack === MonitoringTrack.SAR;

  // Use API-provided comparisonMode from AlertDto (H10.1 fix).
  // Falls back to explanation heuristic only for legacy alerts created before H10.1.
  const isHlsAlert =
    isOptical &&
    (alert.comparisonMode === ComparisonMode.HLS ||
      (!alert.comparisonMode && alert.explanation?.includes('HLS')));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: SPACE.sm }}>
        <div>
          <h3 style={{ margin: 0, fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text }}>{alert.alertId}</h3>
          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Detected: {new Date(alert.detectedAt).toLocaleString()}</span>
        </div>
        <StatusBadge variant={getStatusBadgeVariant(alert.status)} label={alert.status.replace('_', ' ')} />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs, marginBottom: SPACE.md, padding: SPACE.sm, backgroundColor: COLORS.surfaceAlt, borderRadius: RADII.md }}>
        {availableActions.map((action) => (
          <button key={action} onClick={() => onAction(alert, action)} style={{ ...actionBtnBase, ...getActionBtnStyle(action), padding: `${SPACE.xs} ${SPACE.md}`, fontSize: FONT.sizeSm }}>
            {ACTION_LABELS[action]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onEscalateToCase(alert)}
          style={{
            ...actionBtnBase,
            backgroundColor: '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FCA5A5',
            padding: `${SPACE.xs} ${SPACE.md}`,
            fontSize: FONT.sizeSm,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="Create formal enforcement case from this incident alert"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Escalate to Case →
        </button>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: SPACE.sm, marginBottom: SPACE.md }}>
        <MetricBox label="Affected Area" value={`${alert.affectedAreaPercentage}%`} valueColor={alert.affectedAreaPercentage >= 10 ? COLORS.dangerText : COLORS.warningText} />
        <MetricBox label="Evidence Strength" value={`${alert.evidenceStrength}/100`} valueColor={COLORS.primary} />
        <MetricBox label="Sensor" value={alert.sensorType} />
        <MetricBox label="Track" value={alert.monitoringTrack ?? 'OPTICAL'} />
      </div>

      {/* Evidence badges */}
      <div style={{ marginBottom: SPACE.md, fontSize: FONT.sizeXs }}>
        <div style={{ color: COLORS.textMuted, marginBottom: 4 }}>EVIDENCE SOURCES &amp; CATEGORIES:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs }}>
          {alert.evidenceSources.map((s) => (
            <span key={s} style={{ padding: `2px ${SPACE.xs}`, backgroundColor: COLORS.accentLight, color: COLORS.primaryDark, borderRadius: RADII.sm, fontWeight: FONT.weightSemibold }}>{s}</span>
          ))}
          {alert.categories.map((c) => (
            <span key={c} style={{ padding: `2px ${SPACE.xs}`, backgroundColor: COLORS.neutralBg, color: COLORS.neutralText, borderRadius: RADII.sm }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <div style={{ padding: SPACE.md, backgroundColor: COLORS.surfaceAlt, borderRadius: RADII.md, fontSize: FONT.sizeSm, color: COLORS.text, lineHeight: 1.5, marginBottom: SPACE.md }}>
        <div style={{ fontWeight: FONT.weightSemibold, marginBottom: 4 }}>Alert Explanation:</div>
        {alert.explanation}
      </div>

      {/* ── HLS ALERT LINEAGE SECTION ─────────────────────────────────────── */}
      {isHlsAlert && (
        <EvidenceSection title="HLS Cross-Sensor Alert Lineage">
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACE.xs }}>
            This alert was generated from a NASA HLS V2.0 cross-sensor comparison.
            The baseline and current observations were harmonized to a common 30 m grid (S30/L30)
            before pixel-level NDVI change detection.
          </div>
          <div
            style={{
              padding: SPACE.sm,
              backgroundColor: '#faf5ff',
              border: '1px solid #c4b5fd',
              borderRadius: RADII.md,
              fontSize: FONT.sizeXs,
              display: 'flex',
              flexDirection: 'column',
              gap: SPACE.xs,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.xs }}>
              <span style={{ color: COLORS.textMuted }}>Comparison Mode:</span>
              <span
                style={{
                  fontWeight: FONT.weightBold,
                  padding: '1px 6px',
                  backgroundColor: '#f3e8ff',
                  color: '#7c3aed',
                  borderRadius: RADII.sm,
                }}
              >
                HLS Cross-Sensor
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.xs }}>
              <span style={{ color: COLORS.textMuted }}>HLS Version:</span>
              <span style={{ fontWeight: FONT.weightBold, fontFamily: 'monospace' }}>NASA HLS V2.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.xs }}>
              <span style={{ color: COLORS.textMuted }}>Baseline Product:</span>
              <span style={{ fontWeight: FONT.weightBold }}>S30 (Sentinel-2 → 30 m)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.xs }}>
              <span style={{ color: COLORS.textMuted }}>Current Product:</span>
              <span style={{ fontWeight: FONT.weightBold }}>L30 (Landsat-8 → 30 m)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.xs }}>
              <span style={{ color: COLORS.textMuted }}>Analysis CRS:</span>
              <span style={{ fontWeight: FONT.weightBold, fontFamily: 'monospace' }}>EPSG:32643 · 30 m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.xs }}>
              <span style={{ color: COLORS.textMuted }}>Affected Area:</span>
              <span
                style={{
                  fontWeight: FONT.weightBold,
                  color: alert.affectedAreaPercentage >= 10 ? COLORS.dangerText : COLORS.warningText,
                }}
              >
                {alert.affectedAreaPercentage}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.xs }}>
              <span style={{ color: COLORS.textMuted }}>Severity:</span>
              <span style={{ fontWeight: FONT.weightBold, color: alert.severity === 'HIGH' ? COLORS.dangerText : COLORS.warningText }}>
                {alert.severity}
              </span>
            </div>
            <div
              style={{
                padding: `${SPACE.xs} ${SPACE.sm}`,
                backgroundColor: '#ede9fe',
                borderRadius: RADII.sm,
                marginTop: SPACE.xs,
                fontSize: '10px',
                color: '#5b21b6',
                fontFamily: 'monospace',
              }}
            >
              ChangeDetection: {alert.changeDetectionId}
            </div>
          </div>
        </EvidenceSection>
      )}

      {/* ── Optical Evidence (native) ────────────────────────────────────── */}
      {isOptical && !isHlsAlert && hasOpticalEvidence(alert) && (
        <EvidenceSection title="Optical Change Indicators (NDVI / NDWI / NDBI)">
          <OpticalEvidenceGrid alert={alert} />
        </EvidenceSection>
      )}

      {/* ── SAR Evidence ────────────────────────────────────────────────────── */}
      {isSar && hasSarEvidence(alert) && (
        <EvidenceSection title="SAR Change Indicators (VV / VH)">
          <SarEvidenceGrid alert={alert} />
        </EvidenceSection>
      )}

      {/* View images button */}
      <button
        onClick={() => onViewImages(alert.changeDetectionId)}
        style={{ width: '100%', padding: `${SPACE.sm} ${SPACE.md}`, backgroundColor: COLORS.primary, color: '#fff', border: 'none', borderRadius: RADII.md, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, cursor: 'pointer', marginBottom: SPACE.md, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        View Satellite Evidence Images
      </button>

      {/* Lifecycle fields */}
      {(alert.dismissalReason || alert.resolutionInfo || alert.notes) && (
        <div style={{ padding: SPACE.sm, backgroundColor: COLORS.warningBg, borderRadius: RADII.md, fontSize: FONT.sizeXs, color: COLORS.warningText, marginBottom: SPACE.md }}>
          {alert.dismissalReason && <div><b>Dismissal Reason:</b> {alert.dismissalReason}</div>}
          {alert.resolutionInfo && <div><b>Resolution Info:</b> {alert.resolutionInfo}</div>}
          {alert.notes && <div><b>Notes:</b> {alert.notes}</div>}
        </div>
      )}

      {/* Audit Timeline */}
      {auditHistory.length > 0 && (
        <AuditTimeline entries={auditHistory} />
      )}
    </div>
  );
};

// ─── Optical / SAR evidence helpers ──────────────────────────────────────────

function hasOpticalEvidence(alert: AlertDto): boolean {
  // Detect if linked change detection has optical indices — we show section when
  // at least one field is non-null on the alert explanation (heuristic; real data
  // comes from change detection detail page). For AlertsPage we gate on track.
  return (alert.monitoringTrack ?? MonitoringTrack.OPTICAL) === MonitoringTrack.OPTICAL;
}

function hasSarEvidence(alert: AlertDto): boolean {
  return alert.monitoringTrack === MonitoringTrack.SAR;
}

interface OpticalEvidenceGridProps { alert: AlertDto }
const OpticalEvidenceGrid: React.FC<OpticalEvidenceGridProps> = ({ alert }) => (
  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
    <p style={{ margin: '0 0 4px' }}>Optical index deltas from the linked change detection record. Click <em>View Satellite Evidence Images</em> above for the full comparison.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs, marginTop: 4 }}>
      {(['NDVI', 'NDWI', 'NDBI', 'BSI', 'SAVI', 'EVI'] as const).map((idx) => (
        <span key={idx} style={{ padding: `2px ${SPACE.xs}`, backgroundColor: COLORS.accentLight, color: COLORS.primaryDark, borderRadius: RADII.sm, fontWeight: FONT.weightSemibold }}>
          {idx}
        </span>
      ))}
      <span style={{ color: COLORS.textMuted }}>— see Change Detection record {alert.changeDetectionId.slice(-8)}</span>
    </div>
  </div>
);

interface SarEvidenceGridProps { alert: AlertDto }
const SarEvidenceGrid: React.FC<SarEvidenceGridProps> = ({ alert }) => (
  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
    <p style={{ margin: '0 0 4px' }}>Sentinel-1 SAR backscatter deltas. Click <em>View Satellite Evidence Images</em> for the full raster comparison.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs, marginTop: 4 }}>
      {(['VV ΔdB', 'VH ΔdB', 'VV/VH Ratio Δ'] as const).map((idx) => (
        <span key={idx} style={{ padding: `2px ${SPACE.xs}`, backgroundColor: '#e0e7ff', color: '#3730a3', borderRadius: RADII.sm, fontWeight: FONT.weightSemibold }}>
          {idx}
        </span>
      ))}
      <span style={{ color: COLORS.textMuted }}>— see Change Detection record {alert.changeDetectionId.slice(-8)}</span>
    </div>
  </div>
);

// ─── Audit timeline ───────────────────────────────────────────────────────────

interface AuditTimelineProps { entries: AlertAuditEntryDto[] }
const AuditTimeline: React.FC<AuditTimelineProps> = ({ entries }) => (
  <div>
    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightSemibold, marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      Audit History ({entries.length})
    </div>
    <div style={{ borderLeft: `2px solid ${COLORS.border}`, paddingLeft: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
      {entries.map((entry, idx) => (
        <div key={idx} style={{ fontSize: FONT.sizeXs }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS.primary, flexShrink: 0 }} />
            <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.text }}>{entry.action}</span>
            <span style={{ color: COLORS.textMuted }}>
              {entry.fromStatus} → {entry.toStatus}
            </span>
          </div>
          <div style={{ color: COLORS.textMuted, marginLeft: 16 }}>
            {new Date(entry.performedAt).toLocaleString()}
            {entry.notes && <span> — {entry.notes}</span>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Action modal ─────────────────────────────────────────────────────────────

interface ActionModalProps {
  alert: AlertDto;
  action: AlertAction;
  notes: string;
  dismissalReason: string;
  resolutionInfo: string;
  confirmTerminal: boolean;
  loading: boolean;
  onNotesChange: (v: string) => void;
  onDismissalReasonChange: (v: string) => void;
  onResolutionInfoChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

const ActionModal: React.FC<ActionModalProps> = ({
  alert, action, notes, dismissalReason, resolutionInfo, confirmTerminal,
  loading, onNotesChange, onDismissalReasonChange, onResolutionInfoChange,
  onSubmit, onCancel,
}) => {
  const isTerminal = TERMINAL_ACTIONS.has(action);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: SPACE.md }}>
      <div style={{ backgroundColor: COLORS.surface, borderRadius: RADII.lg, maxWidth: 500, width: '100%', padding: SPACE.xl, boxShadow: SHADOWS.lg }}>
        <h3 style={{ margin: '0 0 4px', fontSize: FONT.sizeLg }}>{ACTION_LABELS[action]} Alert</h3>
        <p style={{ margin: '0 0 16px', fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{alert.alertId}</p>

        {isTerminal && confirmTerminal && (
          <div style={{ padding: SPACE.md, backgroundColor: COLORS.dangerBg, color: COLORS.dangerText, borderRadius: RADII.md, marginBottom: SPACE.md, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              This action is <strong>irreversible</strong>. The alert will be locked in <strong>{action === AlertAction.DISMISS ? 'DISMISSED' : 'RESOLVED'}</strong> state. Confirm to proceed.
            </div>
          </div>
        )}

        <form onSubmit={onSubmit}>
          {action === AlertAction.DISMISS && (
            <div style={{ marginBottom: SPACE.md }}>
              <label style={labelStyle}>Dismissal Reason <span style={{ color: COLORS.dangerText }}>*</span></label>
              <textarea value={dismissalReason} onChange={(e) => onDismissalReasonChange(e.target.value)} required placeholder="Why is this alert being dismissed?" style={{ ...textareaStyle }} />
            </div>
          )}

          {action === AlertAction.RESOLVE && (
            <div style={{ marginBottom: SPACE.md }}>
              <label style={labelStyle}>Resolution Information <span style={{ color: COLORS.dangerText }}>*</span></label>
              <textarea value={resolutionInfo} onChange={(e) => onResolutionInfoChange(e.target.value)} required placeholder="Describe the resolution actions taken..." style={{ ...textareaStyle }} />
            </div>
          )}

          <div style={{ marginBottom: SPACE.lg }}>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Additional notes..." style={{ ...textareaStyle }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.sm }}>
            <button type="button" onClick={onCancel} style={{ padding: `${SPACE.sm} ${SPACE.md}`, border: `1px solid ${COLORS.neutralBorder}`, backgroundColor: COLORS.surface, borderRadius: RADII.md, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: `${SPACE.sm} ${SPACE.lg}`, backgroundColor: isTerminal ? COLORS.dangerText : COLORS.primary, color: '#fff', border: 'none', borderRadius: RADII.md, fontWeight: FONT.weightSemibold, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Processing...' : isTerminal && !confirmTerminal ? `Confirm ${ACTION_LABELS[action]}` : ACTION_LABELS[action]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Tiny reusable atoms ──────────────────────────────────────────────────────

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>{label}</label>
    {children}
  </div>
);

const MetricBox: React.FC<{ label: string; value: string; valueColor?: string }> = ({ label, value, valueColor }) => (
  <div style={{ padding: SPACE.sm, backgroundColor: COLORS.surfaceAlt, borderRadius: RADII.md }}>
    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{label}</div>
    <div style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightBold, color: valueColor ?? COLORS.text }}>{value}</div>
  </div>
);

const EvidenceSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ padding: SPACE.sm, backgroundColor: COLORS.surfaceAlt, borderRadius: RADII.md, marginBottom: SPACE.md }}>
    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.text, marginBottom: 4 }}>{title}</div>
    {children}
  </div>
);

// ─── Style helpers ────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: `${SPACE.xs} ${SPACE.sm}`,
  borderRadius: RADII.md,
  border: `1px solid ${COLORS.neutralBorder}`,
  fontSize: FONT.sizeSm,
  minWidth: 140,
};

const thStyle: React.CSSProperties = { padding: `${SPACE.sm} ${SPACE.md}` };
const tdStyle: React.CSSProperties = { padding: `${SPACE.sm} ${SPACE.md}` };

const actionBtnBase: React.CSSProperties = {
  padding: `2px ${SPACE.xs}`,
  fontSize: FONT.sizeXs,
  borderRadius: RADII.sm,
  cursor: 'pointer',
  border: '1px solid',
  fontWeight: FONT.weightSemibold,
};

function getActionBtnStyle(action: AlertAction): React.CSSProperties {
  switch (action) {
    case AlertAction.ACKNOWLEDGE:
      return { backgroundColor: COLORS.warningBg, color: COLORS.warningText, borderColor: COLORS.warningBorder };
    case AlertAction.START_REVIEW:
      return { backgroundColor: COLORS.accentLight, color: COLORS.primaryDark, borderColor: COLORS.primary };
    case AlertAction.CONFIRM:
      return { backgroundColor: COLORS.dangerBg, color: COLORS.dangerText, borderColor: '#fca5a5' };
    case AlertAction.DISMISS:
      return { backgroundColor: COLORS.neutralBg, color: COLORS.neutralText, borderColor: COLORS.neutralBorder };
    case AlertAction.RESOLVE:
      return { backgroundColor: COLORS.successBg, color: COLORS.successText, borderColor: COLORS.successBorder };
    default:
      return { backgroundColor: COLORS.surface, color: COLORS.text, borderColor: COLORS.border };
  }
}

const paginationBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: `${SPACE.xs} ${SPACE.md}`,
  border: `1px solid ${COLORS.neutralBorder}`,
  borderRadius: RADII.md,
  backgroundColor: disabled ? COLORS.neutralBg : COLORS.surface,
  color: disabled ? COLORS.textMuted : COLORS.text,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: FONT.sizeSm,
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: FONT.sizeSm,
  fontWeight: FONT.weightSemibold,
  marginBottom: 4,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: SPACE.sm,
  borderRadius: RADII.md,
  border: `1px solid ${COLORS.neutralBorder}`,
  minHeight: 80,
  fontSize: FONT.sizeSm,
  resize: 'vertical',
  boxSizing: 'border-box',
};

export default AlertsPage;
