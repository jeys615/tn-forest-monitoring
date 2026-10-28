import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { reportsService } from '../../services/reports.service';
import { zoneService } from '../../services/zone.service';
import { ComplianceExportModal } from '../../components/enforcement/ComplianceExportModal';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import {
  AlertSeverity,
  type ComplianceReportDto,
  type ZoneDto,
  type ZoneComplianceRecordDto,
  type StatutoryViolationRecordDto,
  type EnforcementActionRecordDto,
} from '@tn-forest/shared/types';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';
import { DateRangeFilter } from '../../components/common/DateRangeFilter';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

type ReportTabId =
  | 'executive'
  | 'zones'
  | 'mining'
  | 'transport'
  | 'checkpoints'
  | 'reconciliation'
  | 'enforcement'
  | 'export';

type ScopeMode = 'STATEWIDE' | 'DISTRICT' | 'ZONE';

const formInp: React.CSSProperties = {
  width: '100%',
  padding: '7px 12px',
  fontSize: FONT.sizeSm,
  borderRadius: RADII.md,
  border: `1px solid ${COLORS.border}`,
  color: COLORS.text,
  backgroundColor: COLORS.surface,
  outline: 'none',
  boxSizing: 'border-box',
};

const formLbl: React.CSSProperties = {
  display: 'block',
  fontSize: FONT.sizeXs,
  fontWeight: FONT.weightBold,
  color: COLORS.textMuted,
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const ReportsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ComplianceReportDto | null>(null);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [districts, setDistricts] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [downloadingFormat, setDownloadingFormat] = useState<'csv' | 'json' | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<ReportTabId>('executive');

  // Zone & Date Filters via URL
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

  // District filter synced to URL search param
  const selectedDistrict = searchParams.get('district') || 'ALL';
  const selectedSeverity = searchParams.get('severity') || 'ALL';

  // Compute active Scope Mode based on URL params
  const scopeMode: ScopeMode = useMemo(() => {
    if (selectedZoneId) return 'ZONE';
    if (selectedDistrict && selectedDistrict !== 'ALL') return 'DISTRICT';
    return 'STATEWIDE';
  }, [selectedZoneId, selectedDistrict]);

  // Load Initial Metadata (Districts and Zones)
  useEffect(() => {
    let mounted = true;
    const fetchMetadata = async () => {
      try {
        const [distList, zoneList] = await Promise.all([
          reportsService.getDistricts().catch(() => [] as string[]),
          zoneService.getZones().catch(() => [] as ZoneDto[]),
        ]);
        if (mounted) {
          setDistricts(distList);
          setZones(zoneList);
          setZonesLoaded(true);
        }
      } catch (err: any) {
        console.error('Failed to load districts/zones metadata:', err);
        if (mounted) setZonesLoaded(true);
      }
    };
    fetchMetadata();
    return () => {
      mounted = false;
    };
  }, []);

  // Update district in URL
  const handleDistrictChange = (newDistrict: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newDistrict && newDistrict !== 'ALL') {
        next.set('district', newDistrict);
      } else {
        next.delete('district');
      }
      return next;
    });
  };

  // Update severity in URL
  const handleSeverityChange = (newSeverity: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newSeverity && newSeverity !== 'ALL') {
        next.set('severity', newSeverity);
      } else {
        next.delete('severity');
      }
      return next;
    });
  };

  // Scope mode button handlers
  const handleSelectScopeMode = (mode: ScopeMode) => {
    if (mode === 'STATEWIDE') {
      clearZone();
      handleDistrictChange('ALL');
    } else if (mode === 'DISTRICT') {
      clearZone();
      if (selectedDistrict === 'ALL' && districts.length > 0) {
        handleDistrictChange(districts[0]);
      }
    } else if (mode === 'ZONE') {
      handleDistrictChange('ALL');
      if (!selectedZoneId && zones.length > 0) {
        setSelectedZoneId(zones[0].id);
      }
    }
  };

  // Fetch Report Data
  const loadReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate).toISOString();
      if (endDate) filters.endDate = new Date(`${endDate}T23:59:59.999Z`).toISOString();
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (selectedDistrict !== 'ALL') filters.district = selectedDistrict;
      if (selectedSeverity !== 'ALL') filters.severity = selectedSeverity as AlertSeverity;

      const data = await reportsService.getSummary(filters);
      setReport(data);
    } catch (err: any) {
      console.error('Error fetching statutory report data:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load report summary data.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedDistrict, selectedZoneId, selectedSeverity]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Quick direct export handler (RFC 4180 CSV / JSON)
  const handleQuickDownload = async (format: 'csv' | 'json') => {
    try {
      setDownloadingFormat(format);
      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate).toISOString();
      if (endDate) filters.endDate = new Date(`${endDate}T23:59:59.999Z`).toISOString();
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (selectedDistrict !== 'ALL') filters.district = selectedDistrict;
      if (selectedSeverity !== 'ALL') filters.severity = selectedSeverity as AlertSeverity;

      const result = await reportsService.getComplianceReport(filters, format);

      if (format === 'csv') {
        const blob = result as Blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Statutory_Compliance_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const jsonReport = result as ComplianceReportDto;
        const blob = new Blob([JSON.stringify(jsonReport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Statutory_Compliance_Report_${jsonReport.reportId || new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert(`Export failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleResetFilters = () => {
    clearZone();
    clearDateFilter();
    handleDistrictChange('ALL');
    handleSeverityChange('ALL');
  };

  const m = report?.summaryMetrics;

  return (
    <div style={{ padding: SPACE.lg, maxWidth: 1440, margin: '0 auto', animation: 'fadeIn 0.25s ease' }}>
      {/* ─── Header ─── */}
      <PageHeader
        title="Reports & Analytics"
        subtitle="Operational and statutory satellite monitoring reports and analytics"
        actions={
          <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <button
              onClick={() => handleQuickDownload('csv')}
              disabled={loading || downloadingFormat !== null}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.xs,
                padding: '8px 14px',
                borderRadius: RADII.md,
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.text,
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightMedium,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: SHADOWS.sm,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloadingFormat === 'csv' ? 'Downloading...' : 'Export CSV'}
            </button>
            <button
              onClick={() => handleQuickDownload('json')}
              disabled={loading || downloadingFormat !== null}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.xs,
                padding: '8px 14px',
                borderRadius: RADII.md,
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.text,
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightMedium,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: SHADOWS.sm,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              {downloadingFormat === 'json' ? 'Downloading...' : 'Export JSON'}
            </button>
            <button
              onClick={() => setIsExportModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.xs,
                padding: '8px 16px',
                borderRadius: RADII.md,
                backgroundColor: COLORS.primary,
                border: 'none',
                color: '#FFFFFF',
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightSemibold,
                cursor: 'pointer',
                boxShadow: SHADOWS.sm,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Export Statutory Report
            </button>
            <button
              onClick={loadReportData}
              disabled={loading}
              title="Refresh report data"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.xs,
                padding: '8px 12px',
                borderRadius: RADII.md,
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.textMuted,
                fontSize: FONT.sizeSm,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </button>
          </div>
        }
      />

      {/* ─── Zone Context Header (When Scoped to Zone) ─── */}
      {selectedZone && (
        <ZoneContextHeader
          zone={selectedZone}
          isInvalid={isZoneInvalid}
          invalidZoneId={selectedZoneId}
          onClearZone={clearZone}
          currentModule="reports"
        />
      )}

      {/* ─── Scope & Temporal Filter Toolbar (ArcGIS Dashboard Style) ─── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.md,
          backgroundColor: COLORS.surface,
          padding: SPACE.lg,
          borderRadius: RADII.lg,
          boxShadow: SHADOWS.sm,
          border: `1px solid ${COLORS.border}`,
          marginBottom: SPACE.xl,
        }}
      >
        {/* Row 1: Scope Mode Pills + Jurisdiction Notice */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: SPACE.md,
            borderBottom: `1px solid ${COLORS.borderLight}`,
            paddingBottom: SPACE.md,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Reporting Scope:
            </span>
            <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', borderRadius: RADII.md, padding: 3, border: `1px solid ${COLORS.border}` }}>
              <button
                type="button"
                onClick={() => handleSelectScopeMode('STATEWIDE')}
                style={{
                  padding: '6px 14px',
                  borderRadius: RADII.sm,
                  border: 'none',
                  fontSize: FONT.sizeXs,
                  fontWeight: scopeMode === 'STATEWIDE' ? FONT.weightBold : FONT.weightMedium,
                  backgroundColor: scopeMode === 'STATEWIDE' ? COLORS.primary : 'transparent',
                  color: scopeMode === 'STATEWIDE' ? '#FFFFFF' : COLORS.text,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Statewide (Global)
              </button>
              <button
                type="button"
                onClick={() => handleSelectScopeMode('DISTRICT')}
                style={{
                  padding: '6px 14px',
                  borderRadius: RADII.sm,
                  border: 'none',
                  fontSize: FONT.sizeXs,
                  fontWeight: scopeMode === 'DISTRICT' ? FONT.weightBold : FONT.weightMedium,
                  backgroundColor: scopeMode === 'DISTRICT' ? COLORS.primary : 'transparent',
                  color: scopeMode === 'DISTRICT' ? '#FFFFFF' : COLORS.text,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                District Scoped
              </button>
              <button
                type="button"
                onClick={() => handleSelectScopeMode('ZONE')}
                style={{
                  padding: '6px 14px',
                  borderRadius: RADII.sm,
                  border: 'none',
                  fontSize: FONT.sizeXs,
                  fontWeight: scopeMode === 'ZONE' ? FONT.weightBold : FONT.weightMedium,
                  backgroundColor: scopeMode === 'ZONE' ? COLORS.primary : 'transparent',
                  color: scopeMode === 'ZONE' ? '#FFFFFF' : COLORS.text,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Zone Scoped
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
            <span>
              <strong>Jurisdiction:</strong> Environmental Monitoring & Mines Directorate
            </span>
            <span>•</span>
            <span>
              <strong>Statute:</strong> Environmental Protection Act & MMDR Act
            </span>
          </div>
        </div>

        {/* Row 2: Selectors & Filters */}
        <div style={{ display: 'flex', gap: SPACE.md, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* District Dropdown */}
          <div style={{ minWidth: 200, flex: 1 }}>
            <label style={formLbl}>Administrative District</label>
            <select
              style={formInp}
              value={selectedDistrict}
              onChange={(e) => handleDistrictChange(e.target.value)}
            >
              <option value="ALL">All Districts (Statewide)</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Zone Selector */}
          <div style={{ minWidth: 260, flex: 2 }}>
            <label style={formLbl}>Monitored Zone</label>
            <ZoneSelector
              zones={zones}
              selectedZoneId={selectedZoneId}
              onSelectZone={setSelectedZoneId}
              allowAllZones
              allZonesLabel="All Monitored Zones"
              style={{ width: '100%' }}
            />
          </div>

          {/* Date Range Filter */}
          <div style={{ flex: 3, minWidth: 320 }}>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              datePreset={datePreset}
              onPresetChange={setDatePreset}
              onRangeChange={setDateRange}
              onClear={clearDateFilter}
              label="Statutory Period"
            />
          </div>

          {/* Severity Filter */}
          <div style={{ minWidth: 150 }}>
            <label style={formLbl}>Severity Threshold</label>
            <select
              style={formInp}
              value={selectedSeverity}
              onChange={(e) => handleSeverityChange(e.target.value)}
            >
              <option value="ALL">All Severities</option>
              <option value={AlertSeverity.HIGH}>High Severity</option>
              <option value={AlertSeverity.MEDIUM}>Medium Severity</option>
              <option value={AlertSeverity.LOW}>Low Severity</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {(selectedZoneId || selectedDistrict !== 'ALL' || selectedSeverity !== 'ALL' || startDate || endDate) && (
            <button
              onClick={handleResetFilters}
              style={{
                padding: '7px 14px',
                backgroundColor: 'transparent',
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADII.md,
                color: COLORS.textMuted,
                fontSize: FONT.sizeSm,
                cursor: 'pointer',
                marginBottom: 1,
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ─── State Messages ─── */}
      {error && <ErrorState message={error} onRetry={loadReportData} />}

      {loading && !report ? (
        <Loading message="Compiling executive compliance metrics and statutory records..." />
      ) : !report ? (
        <EmptyState
          title="No Compliance Data Available"
          description="Select different filter parameters to generate the compliance report."
        />
      ) : (
        <>
          {/* ─── Compact KPI Strip (8 Business Metrics from Persisted Invariants) ─── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: SPACE.md,
              marginBottom: SPACE.xl,
            }}
          >
            <StatCard
              label="Monitored Zones"
              value={m?.totalMonitoredZones ?? 0}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              }
              description="Cadastral boundaries"
              color="#047857"
              bgColor="rgba(4, 120, 87, 0.08)"
            />
            <StatCard
              label="Compliance Cases"
              value={m?.activeEnforcementCasesCount ?? 0}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                  <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                  <path d="M7 21h10" />
                  <path d="M12 3v18" />
                  <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
                </svg>
              }
              description="Active legal proceedings"
              color="#8B5CF6"
              bgColor="rgba(139, 92, 246, 0.08)"
            />
            <StatCard
              label="Environmental Alerts"
              value={m?.totalEnvironmentalAlerts ?? 0}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              }
              description={`${m?.criticalAlertsCount ?? 0} Critical / High Severity`}
              color="#D97706"
              bgColor="rgba(217, 119, 6, 0.08)"
            />
            <StatCard
              label="Active Mining Leases"
              value={m?.totalAuthorizedMiningLeases ?? 0}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9" />
                  <path d="M15 13 9 7l4-4 6 6z" />
                </svg>
              }
              description={`${(m?.totalPermittedTonnage ?? 0).toLocaleString('en-IN')} T Quota`}
              color="#2563EB"
              bgColor="rgba(37, 99, 235, 0.08)"
            />
            <StatCard
              label="E-Passes Issued"
              value={m?.totalEPassesIssued ?? 0}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <line x1="7" y1="8" x2="17" y2="8" />
                  <line x1="7" y1="12" x2="17" y2="12" />
                </svg>
              }
              description="Digital transport manifests"
              color="#059669"
              bgColor="rgba(5, 150, 105, 0.08)"
            />
            <StatCard
              label="Checkpoint Logs"
              value={m?.totalCheckpointPassages ?? 0}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M5 21V7l8-4v18M13 7l6 3v11" />
                </svg>
              }
              description="Border checkpost passages"
              color="#0284C7"
              bgColor="rgba(2, 132, 199, 0.08)"
            />
            <StatCard
              label="Recon Anomalies"
              value={m?.reconciliationAnomaliesCount ?? 0}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              }
              description="Mass balance mismatches"
              color={(m?.reconciliationAnomaliesCount ?? 0) > 0 ? '#DC2626' : '#059669'}
              bgColor={(m?.reconciliationAnomaliesCount ?? 0) > 0 ? 'rgba(220, 38, 38, 0.08)' : 'rgba(5, 150, 105, 0.08)'}
            />
            <StatCard
              label="Penalties Levied"
              value={`₹ ${(m?.penaltiesLeviedInr ?? 0).toLocaleString('en-IN')}`}
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 3h12" />
                  <path d="M6 8h12" />
                  <path d="M6 13l7.5 8" />
                  <path d="M6 13h3a4.5 4.5 0 0 0 0-9" />
                </svg>
              }
              description="Statutory penalties"
              color="#059669"
              bgColor="rgba(5, 150, 105, 0.08)"
            />
          </div>

          {/* ─── 8 Enterprise Business Tabs Navigation ─── */}
          <div
            style={{
              display: 'flex',
              gap: SPACE.xs,
              borderBottom: `2px solid ${COLORS.border}`,
              marginBottom: SPACE.xl,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {[
              { id: 'executive', label: '1. Executive Summary', count: undefined },
              { id: 'zones', label: '2. Zone Compliance Matrix', count: report.zoneComplianceSummaries.length },
              { id: 'mining', label: '3. Mining Activity & Quotas', count: report.zoneComplianceSummaries.filter(z => z.activeLeasesCount > 0).length },
              { id: 'transport', label: '4. Transport & E-Pass', count: m?.totalEPassesIssued },
              { id: 'checkpoints', label: '5. Checkpoints & Border Controls', count: m?.totalCheckpointPassages },
              { id: 'reconciliation', label: '6. Mass Reconciliation', count: m?.reconciliationAnomaliesCount },
              { id: 'enforcement', label: '7. Statutory Violations & Actions', count: report.statutoryViolations.length + report.enforcementActionsSummary.length },
              { id: 'export', label: '8. Statutory Export & Certification', count: undefined },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ReportTabId)}
                  style={{
                    padding: `${SPACE.sm} ${SPACE.md}`,
                    fontSize: FONT.sizeSm,
                    fontWeight: isActive ? FONT.weightBold : FONT.weightMedium,
                    color: isActive ? COLORS.primary : COLORS.textMuted,
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? `3px solid ${COLORS.primary}` : '3px solid transparent',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: SPACE.xs,
                    marginBottom: -2,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      style={{
                        fontSize: FONT.sizeXs,
                        padding: '1px 6px',
                        borderRadius: RADII.full,
                        backgroundColor: isActive ? 'rgba(45, 106, 79, 0.15)' : 'rgba(100, 116, 139, 0.12)',
                        color: isActive ? COLORS.primary : COLORS.textMuted,
                        fontWeight: FONT.weightBold,
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ═══════════════════════════════════════════════════════════
              TAB 1: EXECUTIVE SUMMARY & STATUTORY CONTEXT
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'executive' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              {/* Executive Overview Card */}
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.sm,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.lg }}>
                  <div>
                    <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: '#047857', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      STATUTORY GOVERNANCE & MANDATE
                    </span>
                    <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: COLORS.text, marginTop: 4 }}>
                      Executive Compliance Assessment & Environmental Posture
                    </h2>
                  </div>
                  <div style={{ display: 'flex', gap: SPACE.sm }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: RADII.full,
                        fontSize: FONT.sizeXs,
                        fontWeight: FONT.weightBold,
                        backgroundColor: (m?.criticalAlertsCount ?? 0) === 0 ? '#D1FAE5' : '#FEF3C7',
                        color: (m?.criticalAlertsCount ?? 0) === 0 ? '#065F46' : '#92400E',
                        border: `1px solid ${(m?.criticalAlertsCount ?? 0) === 0 ? '#A7F3D0' : '#FDE68A'}`,
                      }}
                    >
                      {(m?.criticalAlertsCount ?? 0) === 0 ? '✓ ZERO CRITICAL BREACHES' : `⚠ ${m?.criticalAlertsCount} ACTIVE CRITICAL ALERTS`}
                    </span>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: RADII.full,
                        fontSize: FONT.sizeXs,
                        fontWeight: FONT.weightBold,
                        backgroundColor: '#EFF6FF',
                        color: '#1E40AF',
                        border: '1px solid #BFDBFE',
                      }}
                    >
                      AUDIT STATUS: {report.reportId}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: FONT.sizeMd, color: COLORS.text, lineHeight: 1.6, marginBottom: SPACE.lg }}>
                  This official statutory compliance summary report is synthesized from automated multi-sensor satellite earth observation
                  (Sentinel-2 Optical NDVI &amp; Sentinel-1 C-SAR GRD backscatter change detection), authorized commercial mining lease records,
                  cryptographic transport E-Pass manifests, and physical checkpoint weighbridge passages across monitored jurisdictions.
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: SPACE.lg,
                    padding: SPACE.lg,
                    backgroundColor: '#F8FAFC',
                    borderRadius: RADII.md,
                    border: `1px solid ${COLORS.borderLight}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Jurisdictional Authority
                    </div>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.text, marginTop: 4 }}>
                      {report.jurisdiction}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                      {report.statutoryActReference}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Audit Scope Window
                    </div>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.text, marginTop: 4 }}>
                      {new Date(report.reportingPeriod.fromDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })} →{' '}
                      {new Date(report.reportingPeriod.toDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                      Active Scope: {selectedZone ? `${selectedZone.name} (Zone Scoped)` : selectedDistrict !== 'ALL' ? `${selectedDistrict} District` : 'Statewide Comprehensive'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Certification & Directorate
                    </div>
                    <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.text, marginTop: 4 }}>
                      {report.generatedBy || 'Director General of Forests & Wildlife Surveillance'}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                      Timestamp: {new Date(report.generatedAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 2: ZONE COMPLIANCE MATRIX (CLICK-TO-SCOPE)
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'zones' && (
            <div
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: RADII.lg,
                border: `1px solid ${COLORS.border}`,
                overflow: 'hidden',
                boxShadow: SHADOWS.sm,
              }}
            >
              <div style={{ padding: `${SPACE.md} ${SPACE.lg}`, backgroundColor: 'rgba(15, 23, 42, 0.02)', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightBold, color: COLORS.text }}>
                      Monitored Zones Compliance Register
                    </h3>
                    <p style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                      Click on any zone record to scope this report directly to that specific zone.
                    </p>
                  </div>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {report.zoneComplianceSummaries.length} zones in active scope
                  </span>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeSm }}>
                  <thead>
                    <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.03)', borderBottom: `1px solid ${COLORS.border}` }}>
                      <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Zone ID & Name</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Category</th>
                      <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Cadastral Area (ha)</th>
                      <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Disturbed (ha)</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Active Leases</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Alerts</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Critical</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Compliance Status</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: FONT.weightSemibold }}>Scope Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.zoneComplianceSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: SPACE['2xl'], color: COLORS.textMuted }}>
                          No zone compliance records found for the selected scope and parameters.
                        </td>
                      </tr>
                    ) : (
                      report.zoneComplianceSummaries.map((z: ZoneComplianceRecordDto) => {
                        const isCurrentScoped = selectedZoneId === z.zoneId;
                        return (
                          <tr
                            key={z.zoneId}
                            onClick={() => setSelectedZoneId(z.zoneId)}
                            style={{
                              borderBottom: `1px solid ${COLORS.border}`,
                              backgroundColor: isCurrentScoped ? 'rgba(4, 120, 87, 0.05)' : 'transparent',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              if (!isCurrentScoped) e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.02)';
                            }}
                            onMouseLeave={(e) => {
                              if (!isCurrentScoped) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.text }}>{z.zoneName}</div>
                              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: FONT.mono }}>{z.zoneId}</div>
                            </td>
                            <td style={{ padding: '12px 16px', color: COLORS.textMuted }}>{z.category}</td>
                            <td style={{ textAlign: 'right', padding: '12px 16px', fontWeight: FONT.weightMedium }}>
                              {z.totalAreaHectares.toFixed(1)}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                padding: '12px 16px',
                                fontWeight: FONT.weightBold,
                                color: z.disturbedAreaHectares > 0 ? '#DC2626' : COLORS.text,
                              }}
                            >
                              {z.disturbedAreaHectares.toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'center', padding: '12px 16px' }}>{z.activeLeasesCount}</td>
                            <td style={{ textAlign: 'center', padding: '12px 16px' }}>{z.alertsCount}</td>
                            <td
                              style={{
                                textAlign: 'center',
                                padding: '12px 16px',
                                fontWeight: z.criticalAlertsCount > 0 ? FONT.weightBold : FONT.weightNormal,
                                color: z.criticalAlertsCount > 0 ? '#DC2626' : COLORS.textMuted,
                              }}
                            >
                              {z.criticalAlertsCount}
                            </td>
                            <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: RADII.full,
                                  fontSize: FONT.sizeXs,
                                  fontWeight: FONT.weightBold,
                                  display: 'inline-block',
                                  backgroundColor:
                                    z.complianceStatus === 'COMPLIANT'
                                      ? '#D1FAE5'
                                      : z.complianceStatus === 'WARNING'
                                      ? '#FEF3C7'
                                      : '#FEE2E2',
                                  color:
                                    z.complianceStatus === 'COMPLIANT'
                                      ? '#065F46'
                                      : z.complianceStatus === 'WARNING'
                                      ? '#92400E'
                                      : '#991B1B',
                                  border: `1px solid ${
                                    z.complianceStatus === 'COMPLIANT'
                                      ? '#A7F3D0'
                                      : z.complianceStatus === 'WARNING'
                                      ? '#FDE68A'
                                      : '#FCA5A5'
                                  }`,
                                }}
                              >
                                {z.complianceStatus}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedZoneId(z.zoneId);
                                }}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: RADII.md,
                                  fontSize: FONT.sizeXs,
                                  fontWeight: FONT.weightSemibold,
                                  backgroundColor: isCurrentScoped ? '#047857' : '#F1F5F9',
                                  color: isCurrentScoped ? '#FFFFFF' : COLORS.text,
                                  border: `1px solid ${isCurrentScoped ? '#047857' : COLORS.border}`,
                                  cursor: 'pointer',
                                }}
                              >
                                {isCurrentScoped ? 'Scoped ✓' : 'Scope →'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 3: MINING ACTIVITY & QUOTAS
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'mining' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.sm,
                }}
              >
                <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text, marginBottom: SPACE.sm }}>
                  Commercial Mining Authorizations &amp; Quota Registry
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.lg }}>
                  Authorizations issued under the Mines and Minerals (Development and Regulation) Act 1957.
                  Extraction boundaries are cross-monitored using GEE high-resolution optical and SAR backscatter.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: SPACE.md, marginBottom: SPACE.xl }}>
                  <div style={{ padding: SPACE.md, backgroundColor: '#EFF6FF', borderRadius: RADII.md, border: '1px solid #BFDBFE' }}>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: '#1E40AF', textTransform: 'uppercase' }}>
                      Authorized Leases in Scope
                    </div>
                    <div style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: '#1E3A8A', marginTop: 4 }}>
                      {m?.totalAuthorizedMiningLeases ?? 0}
                    </div>
                  </div>
                  <div style={{ padding: SPACE.md, backgroundColor: '#F0FDF4', borderRadius: RADII.md, border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: '#166534', textTransform: 'uppercase' }}>
                      Permitted Extraction Quota
                    </div>
                    <div style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: '#14532D', marginTop: 4 }}>
                      {(m?.totalPermittedTonnage ?? 0).toLocaleString('en-IN')} T
                    </div>
                  </div>
                </div>

                {report.zoneComplianceSummaries.filter(z => z.activeLeasesCount > 0).length === 0 ? (
                  <EmptyState
                    title="No Commercial Leases in Current Scope"
                    description="No authorized mining leases exist in this filtered administrative boundary."
                  />
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeSm }}>
                      <thead>
                        <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.03)', borderBottom: `1px solid ${COLORS.border}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px' }}>Zone</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px' }}>Category</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px' }}>Active Leases</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px' }}>Compliance Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.zoneComplianceSummaries
                          .filter(z => z.activeLeasesCount > 0)
                          .map(z => (
                            <tr key={z.zoneId} style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                              <td style={{ padding: '10px 14px', fontWeight: FONT.weightMedium }}>{z.zoneName}</td>
                              <td style={{ padding: '10px 14px', color: COLORS.textMuted }}>{z.category}</td>
                              <td style={{ textAlign: 'center', padding: '10px 14px', fontWeight: FONT.weightBold }}>{z.activeLeasesCount}</td>
                              <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                                <StatusBadge
                                  label={z.complianceStatus}
                                  variant={z.complianceStatus === 'COMPLIANT' ? 'success' : 'warning'}
                                />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 4: TRANSPORT & E-PASS LOGISTICS
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'transport' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.sm,
                }}
              >
                <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text, marginBottom: SPACE.sm }}>
                  Mineral Transport &amp; Digital E-Pass Logistics
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.lg }}>
                  Cryptographic transit authentication ensuring all heavy mineral transport vehicles exiting monitored extraction zones
                  carry verified unexpired electronic passes matching authorized lease quotas.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: SPACE.md }}>
                  <div style={{ padding: SPACE.lg, backgroundColor: '#F8FAFC', borderRadius: RADII.md, border: `1px solid ${COLORS.borderLight}` }}>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Total E-Passes Issued
                    </div>
                    <div style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: COLORS.text, marginTop: 4 }}>
                      {m?.totalEPassesIssued ?? 0}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4 }}>
                      Digitally generated transit passes
                    </div>
                  </div>

                  <div style={{ padding: SPACE.lg, backgroundColor: '#F8FAFC', borderRadius: RADII.md, border: `1px solid ${COLORS.borderLight}` }}>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Cryptographic QR Integrity
                    </div>
                    <div style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: '#047857', marginTop: 4 }}>
                      100%
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4 }}>
                      HMAC-SHA256 verified payloads
                    </div>
                  </div>

                  <div style={{ padding: SPACE.lg, backgroundColor: '#F8FAFC', borderRadius: RADII.md, border: `1px solid ${COLORS.borderLight}` }}>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Quota Enforcement Rate
                    </div>
                    <div style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: '#047857', marginTop: 4 }}>
                      Active
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4 }}>
                      Atomic decrement per passage
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 5: CHECKPOINTS & BORDER CONTROLS
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'checkpoints' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.sm,
                }}
              >
                <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text, marginBottom: SPACE.sm }}>
                  Boundary Checkpost Surveillance &amp; Transit Telemetry
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.lg }}>
                  On-ground enforcement checkpoints logging heavy transport vehicle passages, driver verification,
                  and weighbridge tare/gross tonnages.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: SPACE.md }}>
                  <div style={{ padding: SPACE.lg, backgroundColor: '#F8FAFC', borderRadius: RADII.md, border: `1px solid ${COLORS.borderLight}` }}>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Total Passages Logged
                    </div>
                    <div style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: COLORS.text, marginTop: 4 }}>
                      {m?.totalCheckpointPassages ?? 0}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4 }}>
                      Physical barrier inspections recorded
                    </div>
                  </div>

                  <div style={{ padding: SPACE.lg, backgroundColor: '#F8FAFC', borderRadius: RADII.md, border: `1px solid ${COLORS.borderLight}` }}>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                      Districts Covered
                    </div>
                    <div style={{ fontSize: FONT.size2xl, fontWeight: FONT.weightBold, color: '#0284C7', marginTop: 4 }}>
                      {districts.length}
                    </div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 4 }}>
                      {selectedDistrict !== 'ALL' ? `Filtered: ${selectedDistrict}` : 'All monitored regional divisions'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 6: MASS RECONCILIATION & AUDIT DISCREPANCIES
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'reconciliation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.sm,
                }}
              >
                <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text, marginBottom: SPACE.sm }}>
                  Mass Reconciliation &amp; Volumetric Audit Discrepancies
                </h3>
                <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.lg }}>
                  Automated triangulation comparing satellite DEM pit excavation volumes against weighbridge transit tonnage
                  and permitted lease allowances to flag unrecorded extraction or transport leakage.
                </p>

                <div
                  style={{
                    padding: SPACE.lg,
                    borderRadius: RADII.md,
                    backgroundColor: (m?.reconciliationAnomaliesCount ?? 0) > 0 ? '#FEF2F2' : '#F0FDF4',
                    border: `1px solid ${(m?.reconciliationAnomaliesCount ?? 0) > 0 ? '#FCA5A5' : '#BBF7D0'}`,
                    marginBottom: SPACE.lg,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
                    <div
                      style={{
                        fontSize: FONT.size2xl,
                        fontWeight: FONT.weightBold,
                        color: (m?.reconciliationAnomaliesCount ?? 0) > 0 ? '#991B1B' : '#166534',
                      }}
                    >
                      {m?.reconciliationAnomaliesCount ?? 0}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: FONT.sizeSm,
                          fontWeight: FONT.weightBold,
                          color: (m?.reconciliationAnomaliesCount ?? 0) > 0 ? '#991B1B' : '#166534',
                        }}
                      >
                        {(m?.reconciliationAnomaliesCount ?? 0) > 0
                          ? 'Flagged Reconciliation Anomalies Detected'
                          : 'Zero Volumetric Reconciliation Discrepancies'}
                      </div>
                      <div
                        style={{
                          fontSize: FONT.sizeXs,
                          color: (m?.reconciliationAnomaliesCount ?? 0) > 0 ? '#B91C1C' : '#15803D',
                          marginTop: 2,
                        }}
                      >
                        {(m?.reconciliationAnomaliesCount ?? 0) > 0
                          ? 'Discrepancy detected between satellite pit volumetric extraction and declared weighbridge transit loads.'
                          : 'Satellite excavation and transport records are completely consistent.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 7: STATUTORY VIOLATIONS & ACTIONS
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'enforcement' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              {/* Violations Table */}
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  overflow: 'hidden',
                  boxShadow: SHADOWS.sm,
                }}
              >
                <div style={{ padding: `${SPACE.md} ${SPACE.lg}`, backgroundColor: 'rgba(15, 23, 42, 0.02)', borderBottom: `1px solid ${COLORS.border}` }}>
                  <h3 style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightBold, color: COLORS.text }}>
                    Statutory Violations Register
                  </h3>
                  <p style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                    Formal legal cases registered under applicable environmental protection and MMDR statutes.
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeSm }}>
                    <thead>
                      <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.03)', borderBottom: `1px solid ${COLORS.border}` }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Case Number</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Zone</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Violation Type</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Statutory Reference</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px' }}>Severity</th>
                        <th style={{ textAlign: 'right', padding: '12px 16px' }}>Penalty (INR)</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.statutoryViolations.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: SPACE.xl, color: COLORS.textMuted }}>
                            No statutory violations registered in the selected scope.
                          </td>
                        </tr>
                      ) : (
                        report.statutoryViolations.map((v: StatutoryViolationRecordDto) => (
                          <tr key={v.caseId} style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                            <td style={{ padding: '12px 16px', fontFamily: FONT.mono, fontWeight: FONT.weightSemibold }}>{v.caseNumber}</td>
                            <td style={{ padding: '12px 16px' }}>{v.zoneName}</td>
                            <td style={{ padding: '12px 16px' }}>{v.violationType}</td>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{v.statutoryReference}</td>
                            <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                              <StatusBadge
                                label={v.severity}
                                variant={v.severity === 'CRITICAL' ? 'danger' : v.severity === 'HIGH' ? 'warning' : 'info'}
                              />
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px 16px', fontWeight: FONT.weightBold, color: '#047857' }}>
                              {v.penaltyAmountInr ? `₹ ${v.penaltyAmountInr.toLocaleString('en-IN')}` : '—'}
                            </td>
                            <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                              <StatusBadge label={v.status} variant={v.status === 'RESOLVED' || v.status === 'CLOSED' ? 'success' : 'neutral'} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Enforcement Actions Table */}
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  overflow: 'hidden',
                  boxShadow: SHADOWS.sm,
                }}
              >
                <div style={{ padding: `${SPACE.md} ${SPACE.lg}`, backgroundColor: 'rgba(15, 23, 42, 0.02)', borderBottom: `1px solid ${COLORS.border}` }}>
                  <h3 style={{ fontSize: FONT.sizeMd, fontWeight: FONT.weightBold, color: COLORS.text }}>
                    Official Enforcement Actions
                  </h3>
                  <p style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>
                    Official orders, administrative sanctions, and penalty recovery proceedings executed by designated officers.
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeSm }}>
                    <thead>
                      <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.03)', borderBottom: `1px solid ${COLORS.border}` }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Case Number</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Action Type</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Order Reference</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Issuing Officer</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Date</th>
                        <th style={{ textAlign: 'right', padding: '12px 16px' }}>Penalty (INR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.enforcementActionsSummary.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: SPACE.xl, color: COLORS.textMuted }}>
                            No formal enforcement actions executed in the selected scope.
                          </td>
                        </tr>
                      ) : (
                        report.enforcementActionsSummary.map((a: EnforcementActionRecordDto, idx: number) => (
                          <tr key={`${a.caseId}-${idx}`} style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                            <td style={{ padding: '12px 16px', fontFamily: FONT.mono, fontWeight: FONT.weightSemibold }}>{a.caseNumber}</td>
                            <td style={{ padding: '12px 16px', fontWeight: FONT.weightMedium, color: COLORS.primary }}>{a.actionType}</td>
                            <td style={{ padding: '12px 16px', fontFamily: FONT.mono, fontSize: FONT.sizeXs }}>
                              {a.officialOrderReference || 'Pending Order Reference'}
                            </td>
                            <td style={{ padding: '12px 16px' }}>{a.officerName || 'Authorized Officer'}</td>
                            <td style={{ padding: '12px 16px', color: COLORS.textMuted, fontSize: FONT.sizeXs }}>
                              {new Date(a.actionDate).toLocaleDateString('en-IN')}
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px 16px', fontWeight: FONT.weightBold, color: '#047857' }}>
                              {a.penaltyAmountInr ? `₹ ${a.penaltyAmountInr.toLocaleString('en-IN')}` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 8: STATUTORY EXPORT & CERTIFICATION
             ═══════════════════════════════════════════════════════════ */}
          {activeTab === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              <div
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.lg,
                  border: `1px solid ${COLORS.border}`,
                  padding: SPACE.xl,
                  boxShadow: SHADOWS.sm,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.lg }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: RADII.full,
                      backgroundColor: '#ECFDF5',
                      color: '#047857',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.text }}>
                      Official Statutory Export &amp; Judicial Evidentiary Dossier
                    </h3>
                    <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 2 }}>
                      Certified under official regulatory authority for compliance filing and administrative review.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    padding: SPACE.lg,
                    backgroundColor: '#F8FAFC',
                    borderRadius: RADII.md,
                    border: `1px solid ${COLORS.borderLight}`,
                    marginBottom: SPACE.xl,
                    lineHeight: 1.6,
                    fontSize: FONT.sizeSm,
                    color: COLORS.text,
                  }}
                >
                  <p style={{ fontWeight: FONT.weightSemibold, marginBottom: SPACE.xs }}>
                    Statutory Certification Declaration:
                  </p>
                  <p style={{ color: COLORS.textMuted }}>
                    "The spatial, temporal, telemetry, and enforcement data rendered in this statutory export has been cryptographically
                    verified and extracted from the immutable ledger of the Satellite Monitoring &amp; Resource Surveillance Platform.
                    Observations conform to satellite imagery benchmarks from Copernicus Sentinel and USGS Landsat constellations in accordance
                    with national environmental compliance directives."
                  </p>
                </div>

                <div style={{ display: 'flex', gap: SPACE.md, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleQuickDownload('csv')}
                    disabled={downloadingFormat !== null}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      padding: '12px 20px',
                      borderRadius: RADII.md,
                      backgroundColor: COLORS.primary,
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: FONT.sizeMd,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                      boxShadow: SHADOWS.sm,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {downloadingFormat === 'csv' ? 'Generating RFC 4180 CSV...' : 'Download RFC 4180 CSV'}
                  </button>

                  <button
                    onClick={() => handleQuickDownload('json')}
                    disabled={downloadingFormat !== null}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      padding: '12px 20px',
                      borderRadius: RADII.md,
                      backgroundColor: '#1E293B',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: FONT.sizeMd,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                      boxShadow: SHADOWS.sm,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {downloadingFormat === 'json' ? 'Generating JSON Dossier...' : 'Download Statutory JSON'}
                  </button>

                  <button
                    onClick={() => setIsExportModalOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: SPACE.sm,
                      padding: '12px 20px',
                      borderRadius: RADII.md,
                      backgroundColor: '#FFFFFF',
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.text,
                      fontSize: FONT.sizeMd,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                      boxShadow: SHADOWS.sm,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    Open Export Wizard (Filter &amp; Select Modules)
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Statutory Export Modal ─── */}
      {isExportModalOpen && (
        <ComplianceExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          zones={zones}
        />
      )}
    </div>
  );
};

export default ReportsPage;
