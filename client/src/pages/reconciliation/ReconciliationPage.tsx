import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { reconciliationService } from '../../services/reconciliation.service';
import { zoneService } from '../../services/zone.service';
import { epassService } from '../../services/epass.service';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import {
  ReconciliationStatus,
  ReconciliationReportStatus,
  ReconciliationAnomalySeverity,
  type ReconciliationReportDto,
  type ReconciliationSummaryDto,
  type ZoneDto,
  type MiningAuthorizationDto,
} from '@tn-forest/shared/types';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';

import { DateRangeFilter } from '../../components/common/DateRangeFilter';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

const formInp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: FONT.sizeMd,
  borderRadius: RADII.md,
  border: `1px solid #CBD5E1`,
  color: COLORS.text,
  backgroundColor: COLORS.surface,
  outline: 'none',
  boxSizing: 'border-box',
};

const formLbl: React.CSSProperties = {
  display: 'block',
  fontSize: FONT.sizeSm,
  fontWeight: FONT.weightMedium,
  color: COLORS.textMuted,
  marginBottom: '4px',
};

const STATUS_VARIANTS: Record<ReconciliationStatus, 'success' | 'warning' | 'danger'> = {
  [ReconciliationStatus.COMPLIANT]: 'success',
  [ReconciliationStatus.FLAGGED_DISCREPANCY]: 'warning',
  [ReconciliationStatus.CRITICAL_ANOMALY]: 'danger',
};

const REPORT_STATUS_VARIANTS: Record<ReconciliationReportStatus, 'info' | 'primary' | 'warning' | 'success'> = {
  [ReconciliationReportStatus.DRAFT]: 'info',
  [ReconciliationReportStatus.FINALIZED]: 'primary',
  [ReconciliationReportStatus.UNDER_INVESTIGATION]: 'warning',
  [ReconciliationReportStatus.RESOLVED]: 'success',
};

const SEVERITY_COLORS: Record<ReconciliationAnomalySeverity, { bg: string; text: string; border: string }> = {
  [ReconciliationAnomalySeverity.CRITICAL]: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' },
  [ReconciliationAnomalySeverity.HIGH]: { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
  [ReconciliationAnomalySeverity.MEDIUM]: { bg: '#FEFCE8', text: '#A16207', border: '#FDE047' },
  [ReconciliationAnomalySeverity.LOW]: { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
};

export const ReconciliationPage: React.FC = () => {
  const navigate = useNavigate();
  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ReconciliationReportDto[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummaryDto | null>(null);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [authorizations, setAuthorizations] = useState<MiningAuthorizationDto[]>([]);

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

  // Filter states
  const [filterStatus, setFilterStatus] = useState<'ALL' | ReconciliationStatus>('ALL');
  const [filterReportStatus, setFilterReportStatus] = useState<'ALL' | ReconciliationReportStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Report Modal
  const [selectedReport, setSelectedReport] = useState<ReconciliationReportDto | null>(null);
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Run Reconciliation Modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [runTargetType, setRunTargetType] = useState<'ZONE' | 'PERMIT'>('ZONE');
  const [runZoneId, setRunZoneId] = useState('');
  const [selectedAuthId, setSelectedAuthId] = useState('');
  const [periodStart, setPeriodStart] = useState(
    new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [mineralDensity, setMineralDensity] = useState(2.6);
  const [tolerancePercent, setTolerancePercent] = useState(15.0);
  const [runNotes, setRunNotes] = useState('');
  const [runningRecon, setRunningRecon] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, reportsRes, zonesRes, authsRes] = await Promise.all([
        reconciliationService.getSummary(),
        reconciliationService.getReports({
          zoneId: selectedZoneId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        zoneService.getZones(),
        epassService.getAuthorizations(),
      ]);

      setSummary(summaryRes);
      setReports(reportsRes);
      setZones(zonesRes);
      setZonesLoaded(true);
      setAuthorizations(authsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenRunModal = () => {
    setRunError(null);
    if (selectedZoneId) {
      setRunZoneId(selectedZoneId);
      setRunTargetType('ZONE');
    }
    setShowRunModal(true);
  };

  const handleRunReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunError(null);
    setRunningRecon(true);

    try {
      const payload = {
        zoneId: runTargetType === 'ZONE' ? runZoneId : undefined,
        authorizationId: runTargetType === 'PERMIT' ? selectedAuthId : undefined,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        mineralDensityTonnesPerCubicMeter: Number(mineralDensity),
        discrepancyTolerancePercent: Number(tolerancePercent),
        notes: runNotes.trim() || undefined,
      };

      const newReport = await reconciliationService.runReconciliation(payload);
      setShowRunModal(false);
      setSelectedReport(newReport);
      await loadData();
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : 'Failed to run reconciliation audit');
    } finally {
      setRunningRecon(false);
    }
  };

  const handleUpdateStatus = async (newStatus: ReconciliationReportStatus) => {
    if (!selectedReport) return;
    setUpdatingStatus(true);

    try {
      const updated = await reconciliationService.updateReportStatus(selectedReport.id, {
        status: newStatus,
        investigationNotes: investigationNotes.trim() || undefined,
      });

      setSelectedReport(updated);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update report status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (filterStatus !== 'ALL' && r.reconciliationStatus !== filterStatus) return false;
    if (filterReportStatus !== 'ALL' && r.status !== filterReportStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = r.reconciliationId.toLowerCase().includes(q);
      const matchZone = r.zoneName?.toLowerCase().includes(q) || false;
      const matchPermit = r.permitNumber?.toLowerCase().includes(q) || false;
      if (!matchId && !matchZone && !matchPermit) return false;
    }
    return true;
  });

  if (loading && !reports.length) {
    return <Loading message="Loading Mining & Transport Reconciliation Workstation..." />;
  }



  return (
    <div style={{ padding: SPACE.xl, maxWidth: '1440px', margin: '0 auto' }}>
      <PageHeader
        title="Mining & Transport Reconciliation"
        subtitle="Multi-dimensional audit comparing satellite observations, mining permits, E-Pass transport, and physical checkpoint logs"
        actions={
          <button
            onClick={handleOpenRunModal}
            style={{
              padding: '10px 18px',
              backgroundColor: COLORS.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: RADII.md,
              fontWeight: FONT.weightSemibold,
              cursor: 'pointer',
              boxShadow: SHADOWS.sm,
            }}
          >
            + Run Reconciliation Audit
          </button>
        }
      />


      {/* Zone Context Header — optional, shown only when a zone is selected as filter */}
      {selectedZone && (
        <ZoneContextHeader
          zone={selectedZone}
          isInvalid={isZoneInvalid}
          invalidZoneId={selectedZoneId}
          onClearZone={clearZone}
        />
      )}

      {error && <ErrorState message={error} onRetry={loadData} />}

      {/* KPI Stats Bar */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: SPACE.md,
            marginBottom: SPACE.xl,
          }}
        >
          <StatCard
            label="Total Reconciliations"
            value={summary.totalReports}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
            color="#2563EB"
            bgColor="#DBEAFE"
          />
          <StatCard
            label="Compliant Audits"
            value={summary.compliantCount}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
            color="#059669"
            bgColor="#D1FAE5"
          />
          <StatCard
            label="Flagged Discrepancies"
            value={summary.discrepancyCount}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            color="#D97706"
            bgColor="#FEF3C7"
          />
          <StatCard
            label="Critical Anomalies"
            value={summary.criticalAnomalyCount}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            color="#DC2626"
            bgColor="#FEE2E2"
          />
          <StatCard
            label="Unverified Transit Gap"
            value={`${summary.unverifiedTransitGapTonnage.toFixed(1)} t`}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>}
            color="#7C3AED"
            bgColor="#EDE9FE"
          />
        </div>
      )}

      {/* Toolbar & Filters */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: SPACE.md,
          padding: SPACE.md,
          backgroundColor: COLORS.surface,
          borderRadius: RADII.lg,
          border: `1px solid ${COLORS.border}`,
          marginBottom: SPACE.lg,
          boxShadow: SHADOWS.sm,
        }}
      >
        <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
            <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>
              SEARCH
            </label>
            <input
              type="text"
              placeholder="Search by Audit ID, Zone, or Permit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...formInp, width: '240px' }}
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'ALL' | ReconciliationStatus)}
            style={{ ...formInp, width: '200px' }}
          >
            <option value="ALL">All Compliance Levels</option>
            <option value={ReconciliationStatus.COMPLIANT}>Compliant</option>
            <option value={ReconciliationStatus.FLAGGED_DISCREPANCY}>Flagged Discrepancy</option>
            <option value={ReconciliationStatus.CRITICAL_ANOMALY}>Critical Anomaly</option>
          </select>

          <select
            value={filterReportStatus}
            onChange={(e) => setFilterReportStatus(e.target.value as 'ALL' | ReconciliationReportStatus)}
            style={{ ...formInp, width: '180px' }}
          >
            <option value="ALL">All Report Statuses</option>
            <option value={ReconciliationReportStatus.DRAFT}>Draft</option>
            <option value={ReconciliationReportStatus.FINALIZED}>Finalized</option>
            <option value={ReconciliationReportStatus.UNDER_INVESTIGATION}>Under Investigation</option>
            <option value={ReconciliationReportStatus.RESOLVED}>Resolved</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: SPACE.sm }}>
          <button
            onClick={loadData}
            style={{
              padding: '8px 14px',
              backgroundColor: '#F1F5F9',
              color: COLORS.text,
              border: '1px solid #CBD5E1',
              borderRadius: RADII.md,
              fontWeight: FONT.weightMedium,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Reports Table */}
      <div
        style={{
          backgroundColor: COLORS.surface,
          borderRadius: RADII.lg,
          border: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
          boxShadow: SHADOWS.sm,
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${COLORS.border}` }}>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Audit ID</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Target / Permit</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Audit Period</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Compliance Status</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Discrepancy Score</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Anomalies</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Report State</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: SPACE.xl, textAlign: 'center' }}>
                    <EmptyState
                      title="No Reconciliation Reports Found"
                      description="Run a reconciliation audit above to cross-reference satellite disturbance against issued transport E-Passes and checkpoint verifications."
                    />
                  </td>
                </tr>
              ) : (
                filteredReports.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: `1px solid #F1F5F9`,
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                      {r.reconciliationId}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: FONT.weightMedium, color: COLORS.text }}>
                        {r.zoneName || 'Ad-hoc Area'}
                      </div>
                      {r.permitNumber && (
                        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                          Permit: {r.permitNumber}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                      {r.periodStart.slice(0, 10)} to {r.periodEnd.slice(0, 10)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <StatusBadge label={r.reconciliationStatus} variant={STATUS_VARIANTS[r.reconciliationStatus]} dot />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '60px',
                            height: '8px',
                            borderRadius: '4px',
                            backgroundColor: '#E2E8F0',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${r.discrepancyScore}%`,
                              height: '100%',
                              backgroundColor:
                                r.discrepancyScore >= 50 ? '#EF4444' : r.discrepancyScore >= 15 ? '#F59E0B' : '#10B981',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium }}>
                          {r.discrepancyScore}/100
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {r.anomalies.length === 0 ? (
                        <span style={{ fontSize: FONT.sizeSm, color: '#10B981' }}>None (0)</span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#FEE2E2',
                            color: '#DC2626',
                            fontSize: FONT.sizeSm,
                            fontWeight: FONT.weightSemibold,
                          }}
                        >
                          {r.anomalies.length} Flagged
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <StatusBadge label={r.status} variant={REPORT_STATUS_VARIANTS[r.status]} />
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          setSelectedReport(r);
                          setInvestigationNotes(r.investigationNotes || '');
                        }}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#F8FAFC',
                          color: COLORS.primary,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: RADII.md,
                          fontSize: FONT.sizeSm,
                          fontWeight: FONT.weightMedium,
                          cursor: 'pointer',
                        }}
                      >
                        Inspect Audit →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Run Reconciliation Modal */}
      {showRunModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
              borderRadius: RADII.xl,
              padding: SPACE.xl,
              maxWidth: '560px',
              width: '100%',
              boxShadow: SHADOWS.lg,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg }}>
              <h2 style={{ margin: 0, fontSize: FONT.sizeXl, color: COLORS.text }}>
                Run Reconciliation Audit
              </h2>
              <button
                onClick={() => setShowRunModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: COLORS.textMuted }}
              >
                ✕
              </button>
            </div>

            {runError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  borderRadius: RADII.md,
                  marginBottom: SPACE.md,
                  fontSize: FONT.sizeSm,
                }}
              >
                {runError}
              </div>
            )}

            <form onSubmit={handleRunReconciliation}>
              {/* Target Type Selector */}
              <div style={{ marginBottom: SPACE.md }}>
                <label style={formLbl}>Audit Scope Target</label>
                <div style={{ display: 'flex', gap: SPACE.sm }}>
                  <button
                    type="button"
                    onClick={() => setRunTargetType('ZONE')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: RADII.md,
                      border: `1px solid ${runTargetType === 'ZONE' ? COLORS.primary : '#CBD5E1'}`,
                      backgroundColor: runTargetType === 'ZONE' ? '#EFF6FF' : '#FFFFFF',
                      color: runTargetType === 'ZONE' ? COLORS.primary : COLORS.text,
                      fontWeight: FONT.weightMedium,
                      cursor: 'pointer',
                    }}
                  >
                    Monitored Zone
                  </button>
                  <button
                    type="button"
                    onClick={() => setRunTargetType('PERMIT')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: RADII.md,
                      border: `1px solid ${runTargetType === 'PERMIT' ? COLORS.primary : '#CBD5E1'}`,
                      backgroundColor: runTargetType === 'PERMIT' ? '#EFF6FF' : '#FFFFFF',
                      color: runTargetType === 'PERMIT' ? COLORS.primary : COLORS.text,
                      fontWeight: FONT.weightMedium,
                      cursor: 'pointer',
                    }}
                  >
                    Mining Permit
                  </button>
                </div>
              </div>

              {runTargetType === 'ZONE' ? (
                <div style={{ marginBottom: SPACE.md }}>
                  <label style={formLbl}>Select Monitored Forest / Mining Zone *</label>
                  <select
                    value={runZoneId}
                    onChange={(e) => setRunZoneId(e.target.value)}
                    style={formInp}
                    required
                  >
                    <option value="">-- Choose Zone --</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.category})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ marginBottom: SPACE.md }}>
                  <label style={formLbl}>Select Mining Authorization *</label>
                  <select
                    value={selectedAuthId}
                    onChange={(e) => setSelectedAuthId(e.target.value)}
                    style={formInp}
                    required
                  >
                    <option value="">-- Choose Mining Permit --</option>
                    {authorizations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.permitNumber} - {a.lesseeName} ({a.mineralType})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm, marginBottom: SPACE.md }}>
                <div>
                  <label style={formLbl}>Period Start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    style={formInp}
                    required
                  />
                </div>
                <div>
                  <label style={formLbl}>Period End</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    style={formInp}
                    required
                  />
                </div>
              </div>

              {/* Density & Tolerance */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm, marginBottom: SPACE.md }}>
                <div>
                  <label style={formLbl}>Mineral Density (t/m³)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="10.0"
                    value={mineralDensity}
                    onChange={(e) => setMineralDensity(Number(e.target.value))}
                    style={formInp}
                  />
                </div>
                <div>
                  <label style={formLbl}>Discrepancy Tolerance (%)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    value={tolerancePercent}
                    onChange={(e) => setTolerancePercent(Number(e.target.value))}
                    style={formInp}
                  />
                </div>
              </div>

              <div style={{ marginBottom: SPACE.lg }}>
                <label style={formLbl}>Audit Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={runNotes}
                  onChange={(e) => setRunNotes(e.target.value)}
                  placeholder="e.g. Quarterly environmental compliance inspection"
                  style={{ ...formInp, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.sm }}>
                <button
                  type="button"
                  onClick={() => setShowRunModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: RADII.md,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={runningRecon}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: COLORS.primary,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: RADII.md,
                    fontWeight: FONT.weightSemibold,
                    cursor: runningRecon ? 'not-allowed' : 'pointer',
                  }}
                >
                  {runningRecon ? 'Analyzing Telemetry...' : 'Run Audit Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detailed Audit Report Modal */}
      {selectedReport && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
              borderRadius: RADII.xl,
              padding: SPACE.xl,
              maxWidth: '960px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: SHADOWS.lg,
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: `1px solid ${COLORS.border}`,
                paddingBottom: SPACE.md,
                marginBottom: SPACE.lg,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: '4px' }}>
                  <h2 style={{ margin: 0, fontSize: FONT.sizeXl, color: COLORS.text }}>
                    Reconciliation Audit: {selectedReport.reconciliationId}
                  </h2>
                  <StatusBadge
                    label={selectedReport.reconciliationStatus}
                    variant={STATUS_VARIANTS[selectedReport.reconciliationStatus]}
                    dot
                  />
                  <StatusBadge
                    label={selectedReport.status}
                    variant={REPORT_STATUS_VARIANTS[selectedReport.status]}
                  />
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                  Target: {selectedReport.zoneName || 'N/A'} | Permit: {selectedReport.permitNumber || 'N/A'} | Period: {selectedReport.periodStart.slice(0, 10)} to {selectedReport.periodEnd.slice(0, 10)}
                </div>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: COLORS.textMuted }}
              >
                ✕
              </button>
            </div>

            {/* 4-Quadrant Multi-Dimensional Comparison Grid */}
            <h3 style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightSemibold, marginBottom: SPACE.sm, color: COLORS.text }}>
              Multi-Source Telemetry Cross-Reference
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: SPACE.md,
                marginBottom: SPACE.lg,
              }}
            >
              {/* Card 1: Permit Quota */}
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: '#F8FAFC',
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: '#0369A1', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Authorized Permit
                </div>
                {selectedReport.permitSummary ? (
                  <>
                    <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Permitted Lease Quota:</div>
                    <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text }}>
                      {selectedReport.permitSummary.permittedWeightTonnes} t
                    </div>
                    <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '4px' }}>
                      Remaining: <span style={{ fontWeight: FONT.weightMedium }}>{selectedReport.permitSummary.remainingQuota} t</span>
                    </div>
                    <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                      Lessee: {selectedReport.permitSummary.lesseeName}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: FONT.sizeSm, color: '#DC2626', fontStyle: 'italic' }}>
                    No active mining permit found for this zone (Protected forest)
                  </div>
                )}
              </div>

              {/* Card 2: E-Pass Issued */}
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: '#F8FAFC',
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: '#15803D', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  Issued Transport Logistics
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Total Issued Weight:</div>
                <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text }}>
                  {selectedReport.transportSummary.totalIssuedTonnage} t
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '4px' }}>
                  Passes Issued: <span style={{ fontWeight: FONT.weightMedium }}>{selectedReport.transportSummary.totalPassesIssued}</span>
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                  Used / Verified: {selectedReport.transportSummary.totalPassesUsed} passes
                </div>
              </div>

              {/* Card 3: Checkpoint Scanned */}
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: '#F8FAFC',
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: '#7C3AED', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Physical Checkpoints
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Verified Transit Weight:</div>
                <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text }}>
                  {selectedReport.checkpointSummary.totalTransitTonnage} t
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '4px' }}>
                  Valid Scans: <span style={{ fontWeight: FONT.weightMedium }}>{selectedReport.checkpointSummary.validScans}</span>
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                  Outside Geofence: {selectedReport.checkpointSummary.outsideGeofenceScans}
                </div>
              </div>

              {/* Card 4: Satellite Telemetry */}
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: '#F8FAFC',
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: '#C2410C', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  Satellite Environmental Observation
                </div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Disturbed Land Area:</div>
                <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text }}>
                  {selectedReport.satelliteSummary.totalDisturbedAreaHectares} ha
                </div>
                {selectedReport.satelliteSummary.estimatedTonnageEquivalent ? (
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '4px' }}>
                    DEM Est. Volume: {selectedReport.satelliteSummary.estimatedExtractionVolumeCubicMeters} m³ (≈ {selectedReport.satelliteSummary.estimatedTonnageEquivalent} t)
                  </div>
                ) : (
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: '4px', fontStyle: 'italic' }}>
                    DEM 3D volume unavailable
                  </div>
                )}
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                  Max Evidence: {selectedReport.satelliteSummary.maxEvidenceStrength}/100
                </div>
              </div>
            </div>

            {/* Flagged Anomalies */}
            <h3 style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightSemibold, marginBottom: SPACE.sm, color: COLORS.text }}>
              Detected Discrepancies & Compliance Anomalies ({selectedReport.anomalies.length})
            </h3>
            {selectedReport.anomalies.length === 0 ? (
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: '#F0FDF4',
                  borderRadius: RADII.md,
                  border: '1px solid #86EFAC',
                  color: '#166534',
                  marginBottom: SPACE.lg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span>No compliance discrepancies found. All environmental satellite observations and transport logistics align with authorized permit parameters.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm, marginBottom: SPACE.lg }}>
                {selectedReport.anomalies.map((an, idx) => {
                  const style = SEVERITY_COLORS[an.severity];
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: SPACE.md,
                        backgroundColor: style.bg,
                        border: `1px solid ${style.border}`,
                        borderRadius: RADII.md,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontWeight: FONT.weightSemibold, color: style.text }}>
                          [{an.severity}] {an.title}
                        </div>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: style.text }}>
                          Confidence: {an.evidenceScore}%
                        </div>
                      </div>
                      <div style={{ fontSize: FONT.sizeSm, color: COLORS.text }}>
                        {an.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Findings & Action Recommendations */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md, marginBottom: SPACE.lg }}>
              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: '#F8FAFC',
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontWeight: FONT.weightSemibold, marginBottom: '6px', color: COLORS.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Audit Findings
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: FONT.sizeSm, color: COLORS.text }}>
                  {selectedReport.findings.map((f, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>{f}</li>
                  ))}
                </ul>
              </div>

              <div
                style={{
                  padding: SPACE.md,
                  backgroundColor: '#F8FAFC',
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontWeight: FONT.weightSemibold, marginBottom: '6px', color: COLORS.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                  Action Recommendations
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: FONT.sizeSm, color: COLORS.text }}>
                  {selectedReport.recommendations.map((rec, i) => (
                    <li key={i} style={{ marginBottom: '4px' }}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Disclaimer */}
            <div
              style={{
                fontSize: FONT.sizeSm,
                fontStyle: 'italic',
                color: COLORS.textMuted,
                padding: '8px 12px',
                backgroundColor: '#F1F5F9',
                borderRadius: RADII.md,
                marginBottom: SPACE.lg,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
              <span>{selectedReport.satelliteSummary.disclaimer}</span>
            </div>

            {/* Investigation Triage Actions */}
            <div
              style={{
                borderTop: `1px solid ${COLORS.border}`,
                paddingTop: SPACE.md,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: SPACE.md,
              }}
            >
              <div style={{ flex: 1, minWidth: '300px' }}>
                <label style={formLbl}>Investigation Notes</label>
                <input
                  type="text"
                  placeholder="Add notes for field inspection or legal follow-up..."
                  value={investigationNotes}
                  onChange={(e) => setInvestigationNotes(e.target.value)}
                  style={formInp}
                />
              </div>

              <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/enforcement-cases?reconciliationReportId=${selectedReport.id}`);
                  }}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#FEF2F2',
                    color: '#991B1B',
                    border: '1px solid #FCA5A5',
                    borderRadius: RADII.md,
                    fontWeight: FONT.weightMedium,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Escalate to Case →
                </button>

                {selectedReport.status !== ReconciliationReportStatus.UNDER_INVESTIGATION && (
                  <button
                    onClick={() => handleUpdateStatus(ReconciliationReportStatus.UNDER_INVESTIGATION)}
                    disabled={updatingStatus}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: '#FEF3C7',
                      color: '#92400E',
                      border: '1px solid #FCD34D',
                      borderRadius: RADII.md,
                      fontWeight: FONT.weightMedium,
                      cursor: 'pointer',
                    }}
                  >
                    Mark Under Investigation
                  </button>
                )}

                {selectedReport.status !== ReconciliationReportStatus.RESOLVED && (
                  <button
                    onClick={() => handleUpdateStatus(ReconciliationReportStatus.RESOLVED)}
                    disabled={updatingStatus}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: '#DCFCE7',
                      color: '#166534',
                      border: '1px solid #86EFAC',
                      borderRadius: RADII.md,
                      fontWeight: FONT.weightMedium,
                      cursor: 'pointer',
                    }}
                  >
                    Resolve Audit
                  </button>
                )}

                <button
                  onClick={() => setSelectedReport(null)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#F1F5F9',
                    color: COLORS.text,
                    border: '1px solid #CBD5E1',
                    borderRadius: RADII.md,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconciliationPage;
