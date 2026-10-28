import React, { useState, useEffect, useCallback } from 'react';
import { intelligenceService } from '../../services/intelligence.service';
import { zoneService } from '../../services/zone.service';
import type {
  ExecutiveIntelligenceSummaryDto,
  ZoneRiskIntelligenceDto,
  CrossModuleCorrelationDto,
  AlertIntelligenceSummaryDto,
  TransportMiningIntelligenceSummaryDto,
  EnforcementIntelligenceSummaryDto,
  TrendAnalyticsDto,
  HotspotPriorityRankingsDto,
  DecisionSupportSummaryDto,
  ZoneRiskLevel,
  InvestigationTimelineDto,
  IntelligenceSearchDto,
  ZoneDto,
} from '@tn-forest/shared/types';
import { TimeRangePreset, GisMapMode } from '@tn-forest/shared/types';
import { GisMapViewer } from '../../components/gis/GisMapViewer';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';

import { DateRangeFilter } from '../../components/common/DateRangeFilter';

export const IntelligenceDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Core Data states
  const [summary, setSummary] = useState<ExecutiveIntelligenceSummaryDto | null>(null);
  const [zoneRisks, setZoneRisks] = useState<ZoneRiskIntelligenceDto[]>([]);
  const [alertSummary, setAlertSummary] = useState<AlertIntelligenceSummaryDto | null>(null);
  const [transportSummary, setTransportSummary] = useState<TransportMiningIntelligenceSummaryDto | null>(null);
  const [enforcementSummary, setEnforcementSummary] = useState<EnforcementIntelligenceSummaryDto | null>(null);
  const [trends, setTrends] = useState<TrendAnalyticsDto | null>(null);
  const [hotspots, setHotspots] = useState<HotspotPriorityRankingsDto | null>(null);
  const [decisionSupport, setDecisionSupport] = useState<DecisionSupportSummaryDto | null>(null);

  // Registered Monitored Zones
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState<boolean>(false);

  // Zone Scoped URL Parameters
  const {
    zoneId,
    selectedZoneId,
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
    clearAll,
  } = useZoneScopedParams(zones, zonesLoaded);

  // Filter & Navigation states
  const [selectedPreset, setSelectedPreset] = useState<TimeRangePreset>(TimeRangePreset.THIRTY_DAYS);
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<
    'ZONES' | 'ALERTS' | 'TRANSPORT' | 'ENFORCEMENT' | 'TIMELINE' | 'MAP' | 'TRENDS' | 'HOTSPOTS'
  >('ZONES');

  // Modal drill-down state
  const [selectedZoneCorrelation, setSelectedZoneCorrelation] = useState<CrossModuleCorrelationDto | null>(null);
  const [correlationLoading, setCorrelationLoading] = useState<boolean>(false);

  // Timeline state
  const [timelineData, setTimelineData] = useState<InvestigationTimelineDto | null>(null);
  const [timelineLoading, setTimelineLoading] = useState<boolean>(false);
  const [timelineModuleFilter, setTimelineModuleFilter] = useState<string>('ALL');
  const [timelineSearch, setTimelineSearch] = useState<string>('');

  // Global Cross-Entity Search state
  const [globalQuery, setGlobalQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<IntelligenceSearchDto | null>(null);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchSubmitted, setSearchSubmitted] = useState<boolean>(false);

  // GIS Surveillance Map state
  const [mapSelectedZoneId, setMapSelectedZoneId] = useState<string>('');
  const [mapSelectedCorrelation, setMapSelectedCorrelation] = useState<CrossModuleCorrelationDto | null>(null);
  const [mapLoading, setMapLoading] = useState<boolean>(false);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, zonesRes, alertRes, transRes, enfRes, trendRes, hotRes, decRes, registeredZones] =
        await Promise.all([
          intelligenceService.getSummary(),
          intelligenceService.getZoneRiskList({ limit: 100 }),
          intelligenceService.getAlertSummary(),
          intelligenceService.getTransportSummary(),
          intelligenceService.getEnforcementSummary(),
          intelligenceService.getTrends(selectedPreset),
          intelligenceService.getHotspots(),
          intelligenceService.getDecisionSupport(),
          zoneService.getZones(),
        ]);

      setSummary(sumRes);
      setZoneRisks(zonesRes);
      setAlertSummary(alertRes);
      setTransportSummary(transRes);
      setEnforcementSummary(enfRes);
      setTrends(trendRes);
      setHotspots(hotRes);
      setDecisionSupport(decRes);
      setZones(registeredZones);
      setZonesLoaded(true);

      // Pre-select zone for map if available
      if (selectedZoneId) {
        setMapSelectedZoneId(selectedZoneId);
      } else if (zonesRes.length > 0 && !mapSelectedZoneId) {
        setMapSelectedZoneId(zonesRes[0].zoneId);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to load intelligence workstation data.');
    } finally {
      setLoading(false);
    }
  }, [selectedPreset, selectedZoneId, mapSelectedZoneId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Sync selectedZoneId with map selection
  useEffect(() => {
    if (selectedZoneId) {
      setMapSelectedZoneId(selectedZoneId);
    }
  }, [selectedZoneId]);

  // Load timeline data
  const loadTimelineData = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const data = await intelligenceService.getTimeline({
        module: timelineModuleFilter !== 'ALL' ? timelineModuleFilter : undefined,
        limit: 100,
      });
      setTimelineData(data);
    } catch (err: unknown) {
      const e = err as Error;
      console.error('Failed to load timeline:', e);
    } finally {
      setTimelineLoading(false);
    }
  }, [timelineModuleFilter]);

  useEffect(() => {
    if (activeTab === 'TIMELINE') {
      loadTimelineData();
    }
  }, [activeTab, loadTimelineData]);

  // Load GIS map zone correlation when selected
  const loadMapZoneCorrelation = useCallback(async (zoneId: string) => {
    if (!zoneId) return;
    setMapLoading(true);
    try {
      const data = await intelligenceService.getCorrelation(zoneId);
      setMapSelectedCorrelation(data);
    } catch (err: unknown) {
      const e = err as Error;
      console.error('Failed to load zone map correlation:', e);
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'MAP' && mapSelectedZoneId) {
      loadMapZoneCorrelation(mapSelectedZoneId);
    }
  }, [activeTab, mapSelectedZoneId, loadMapZoneCorrelation]);

  const handleOpenCorrelation = async (zoneId: string) => {
    setCorrelationLoading(true);
    try {
      const data = await intelligenceService.getCorrelation(zoneId);
      setSelectedZoneCorrelation(data);
    } catch (err: unknown) {
      const e = err as Error;
      alert(`Failed to load cross-module lineage: ${e.message}`);
    } finally {
      setCorrelationLoading(false);
    }
  };

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalQuery.trim()) return;
    setSearchLoading(true);
    setSearchSubmitted(true);
    try {
      const res = await intelligenceService.search(globalQuery.trim(), 20);
      setSearchResults(res);
    } catch (err: unknown) {
      const e = err as Error;
      alert(`Search failed: ${e.message}`);
    } finally {
      setSearchLoading(false);
    }
  };

  // Filtered zones
  const filteredZones = zoneRisks.filter((z) => {
    if (selectedZoneId && z.zoneId !== selectedZoneId) return false;
    if (riskFilter !== 'ALL' && z.riskLevel !== riskFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        z.zoneName.toLowerCase().includes(q) ||
        z.zoneId.toLowerCase().includes(q) ||
        z.decisionSupportRationale.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtered timeline events
  const filteredTimelineEvents = (timelineData?.events || []).filter((item) => {
    if (selectedZoneId) {
      const zName = selectedZone?.name?.toLowerCase();
      const matchZoneId = item.entityId === selectedZoneId || (item as any).zoneId === selectedZoneId;
      const matchZoneName = Boolean(zName && item.zoneName && item.zoneName.toLowerCase().includes(zName));
      const matchDesc = Boolean(zName && item.description && item.description.toLowerCase().includes(zName));
      if (!matchZoneId && !matchZoneName && !matchDesc) return false;
    }
    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.entityId.toLowerCase().includes(q) ||
        (item.zoneName && item.zoneName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getRiskBadge = (level: ZoneRiskLevel | string) => {
    switch (level) {
      case 'CRITICAL':
        return <span className="ws-badge ws-badge-critical">CRITICAL</span>;
      case 'HIGH':
        return <span className="ws-badge ws-badge-high">HIGH</span>;
      case 'MEDIUM':
        return <span className="ws-badge ws-badge-medium">MEDIUM</span>;
      case 'LOW':
        return <span className="ws-badge ws-badge-low">LOW</span>;
      default:
        return <span className="ws-badge ws-badge-neutral">{level}</span>;
    }
  };

  const getModuleBadge = (moduleName: string) => {
    switch (moduleName) {
      case 'ALERT':
        return <span className="ws-badge ws-badge-critical">ALERT</span>;
      case 'CHANGE_DETECTION':
        return <span className="ws-badge ws-badge-high">CHANGE</span>;
      case 'SATELLITE':
        return <span className="ws-badge ws-badge-info">SATELLITE</span>;
      case 'MINING_AUTHORIZATION':
        return <span className="ws-badge ws-badge-medium">LEASE</span>;
      case 'EPASS':
        return <span className="ws-badge ws-badge-primary">E-PASS</span>;
      case 'CHECKPOINT':
        return <span className="ws-badge ws-badge-primary">CHECKPOINT</span>;
      case 'RECONCILIATION':
        return <span className="ws-badge ws-badge-high">RECON</span>;
      case 'ENFORCEMENT':
        return <span className="ws-badge ws-badge-critical">ENFORCEMENT</span>;
      case 'EVIDENCE':
        return <span className="ws-badge ws-badge-low">EVIDENCE</span>;
      default:
        return <span className="ws-badge ws-badge-neutral">{moduleName}</span>;
    }
  };

  // Group search results by entity type
  const searchCountsByType = (searchResults?.results || []).reduce<Record<string, number>>(
    (acc, curr) => {
      acc[curr.entityType] = (acc[curr.entityType] || 0) + 1;
      return acc;
    },
    {},
  );


  return (
    <div className="ws-container">
      {/* Page Header */}
      <div className="ws-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="ws-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Intelligence &amp; Investigation Workstation
            </h1>
            <span className="ws-badge ws-badge-primary">
              Multi-Source Synthesis
            </span>
          </div>
          <p className="ws-subtitle">
            Authoritative multi-source environmental intelligence, operational correlation, and decision support.
          </p>
        </div>

        {/* Global Controls */}
        <div className="ws-header-actions">
          {/* Time range selector */}
          <div className="ws-pill-group">
            <button
              onClick={() => setSelectedPreset(TimeRangePreset.SEVEN_DAYS)}
              className={`ws-pill-btn ${selectedPreset === TimeRangePreset.SEVEN_DAYS ? 'ws-pill-btn-active' : ''}`}
            >
              7 Days
            </button>
            <button
              onClick={() => setSelectedPreset(TimeRangePreset.THIRTY_DAYS)}
              className={`ws-pill-btn ${selectedPreset === TimeRangePreset.THIRTY_DAYS ? 'ws-pill-btn-active' : ''}`}
            >
              30 Days
            </button>
            <button
              onClick={() => setSelectedPreset(TimeRangePreset.NINETY_DAYS)}
              className={`ws-pill-btn ${selectedPreset === TimeRangePreset.NINETY_DAYS ? 'ws-pill-btn-active' : ''}`}
            >
              90 Days
            </button>
          </div>

          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="ws-btn ws-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            {loading ? 'Refreshing...' : 'Refresh Workstation'}
          </button>
        </div>
      </div>

      {/* Zone Context Header */}
      {selectedZone && (
        <ZoneContextHeader
          zone={selectedZone}
          onClear={clearZone}
          dateRange={{
            startDate,
            endDate,
            preset: datePreset,
          }}
          currentModulePath="/intelligence"
        />
      )}
      {isZoneInvalid && (
        <ZoneContextHeader
          zone={undefined}
          isInvalid={true}
          invalidZoneId={zoneId}
          onClear={clearZone}
          currentModulePath="/intelligence"
        />
      )}

      {/* Enterprise Zone & Temporal Filter Toolbar */}
      <div className="ws-filter-bar" style={{ marginBottom: 14 }}>
        <div className="ws-filter-item" style={{ minWidth: 260 }}>
          <ZoneSelector
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setZoneId}
            label="Monitored Zone"
            allZonesLabel="All Monitored Zones (Global Synthesis)"
          />
        </div>

        <div className="ws-filter-item">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            datePreset={datePreset}
            onPresetChange={setDatePreset}
            onCustomRangeChange={setDateRange}
            onClear={clearDateFilter}
          />
        </div>

        {selectedZoneId && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ws-badge ws-badge-primary">
              Zone Filter Active: {selectedZone?.name || selectedZoneId}
            </span>
            <button
              onClick={clearAll}
              className="ws-btn ws-btn-secondary ws-btn-sm"
              title="Reset to All Monitored Zones and clear date filter"
            >
              Reset to All Zones
            </button>
          </div>
        )}
      </div>

      {/* Statutory Disclaimer Banner */}
      <div className="ws-alert-box ws-alert-warning">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
        <div>
          <strong>STATUTORY ENVIRONMENTAL COMPLIANCE NOTICE: </strong>
          Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey. Physical enforcement actions require official on-ground field inspection.
        </div>
      </div>

      {/* Global Cross-Entity Search Bar */}
      <div className="ws-card">
        <div className="ws-card-body" style={{ padding: 14 }}>
          <form onSubmit={handleGlobalSearch} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="ws-search-bar" style={{ flex: '1 1 320px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Search across all entities (Zones, Alerts, Leases, Cases, Vehicles, E-Passes, Checkpoints, Dossiers)..."
                className="ws-search-input"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading || !globalQuery.trim()}
              className="ws-btn ws-btn-primary"
            >
              {searchLoading ? 'Searching...' : 'Search Intelligence'}
            </button>
            {searchSubmitted && (
              <button
                type="button"
                onClick={() => {
                  setGlobalQuery('');
                  setSearchResults(null);
                  setSearchSubmitted(false);
                }}
                className="ws-btn ws-btn-secondary"
              >
                Clear
              </button>
            )}
          </form>

          {/* Global Search Results Panel */}
          {searchSubmitted && searchResults && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                <span>
                  Found <strong>{searchResults.totalMatches}</strong> entities matching &ldquo;{searchResults.query}&rdquo;
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(searchCountsByType).map(([type, count]) => (
                    <span key={type} className="ws-badge ws-badge-neutral">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>

              {searchResults.results.length === 0 ? (
                <div className="ws-empty-state" style={{ padding: 24 }}>
                  No matching intelligence entities found.
                </div>
              ) : (
                <div className="ws-grid-3">
                  {searchResults.results.map((res, idx) => (
                    <div
                      key={idx}
                      className="ws-card"
                      style={{ padding: 12, marginBottom: 0, background: 'var(--color-surface-alt)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span className="ws-badge ws-badge-primary" style={{ fontSize: 10 }}>
                          {res.entityType}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--color-text-muted)' }}>
                          {res.referenceId}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-text)' }}>{res.title}</div>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{res.subtitle}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--color-border-light)', fontSize: 10, color: 'var(--color-text-light)' }}>
                        <span>Status: {res.status}</span>
                        {res.timestamp && <span>{new Date(res.timestamp).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="ws-alert-box ws-alert-danger">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>{error}</div>
        </div>
      )}

      {/* Top KPI Cards Grid */}
      <div className="ws-kpi-grid">
        <div className="ws-kpi-card" style={{ borderLeftColor: '#16A34A' }}>
          <div className="ws-kpi-top">
            <span className="ws-kpi-label">Monitored Zones</span>
            <span className="ws-kpi-icon" style={{ background: '#DCFCE7', color: '#16A34A' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </span>
          </div>
          <div className="ws-kpi-value">{summary?.totalMonitoredZones ?? 0}</div>
          <div className="ws-kpi-subtext" style={{ color: '#16A34A', fontWeight: 600 }}>
            {summary?.activeZones ?? 0} Protected / Active
          </div>
        </div>

        <div className="ws-kpi-card" style={{ borderLeftColor: '#DC2626' }}>
          <div className="ws-kpi-top">
            <span className="ws-kpi-label" style={{ color: '#DC2626' }}>Critical Alerts</span>
            <span className="ws-kpi-icon" style={{ background: '#FEE2E2', color: '#DC2626' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </span>
          </div>
          <div className="ws-kpi-value" style={{ color: '#DC2626' }}>
            {summary?.criticalAlertsCount ?? 0}
          </div>
          <div className="ws-kpi-subtext">
            +{summary?.highAlertsCount ?? 0} High Severity
          </div>
        </div>

        <div className="ws-kpi-card" style={{ borderLeftColor: '#D97706' }}>
          <div className="ws-kpi-top">
            <span className="ws-kpi-label" style={{ color: '#D97706' }}>High Risk Zones</span>
            <span className="ws-kpi-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
          </div>
          <div className="ws-kpi-value" style={{ color: '#D97706' }}>
            {(summary?.riskDistribution?.critical ?? 0) + (summary?.riskDistribution?.high ?? 0)}
          </div>
          <div className="ws-kpi-subtext">
            {summary?.riskDistribution?.critical ?? 0} Critical Attention
          </div>
        </div>

        <div className="ws-kpi-card" style={{ borderLeftColor: '#EA580C' }}>
          <div className="ws-kpi-top">
            <span className="ws-kpi-label" style={{ color: '#EA580C' }}>Critical Discrepancies</span>
            <span className="ws-kpi-icon" style={{ background: '#FFEDD5', color: '#EA580C' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </span>
          </div>
          <div className="ws-kpi-value" style={{ color: '#EA580C' }}>
            {summary?.criticalDiscrepanciesCount ?? 0}
          </div>
          <div className="ws-kpi-subtext">
            {summary?.totalReconciliationReportsCount ?? 0} Recon audits
          </div>
        </div>

        <div className="ws-kpi-card" style={{ borderLeftColor: '#2563EB' }}>
          <div className="ws-kpi-top">
            <span className="ws-kpi-label" style={{ color: '#2563EB' }}>Active Cases</span>
            <span className="ws-kpi-icon" style={{ background: '#DBEAFE', color: '#2563EB' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            </span>
          </div>
          <div className="ws-kpi-value" style={{ color: '#2563EB' }}>
            {summary?.activeEnforcementCasesCount ?? 0}
          </div>
          <div className="ws-kpi-subtext">
            {summary?.closedEnforcementCasesCount ?? 0} Resolved &amp; closed
          </div>
        </div>

        <div className="ws-kpi-card" style={{ borderLeftColor: '#B91C1C' }}>
          <div className="ws-kpi-top">
            <span className="ws-kpi-label" style={{ color: '#B91C1C' }}>Action Required</span>
            <span className="ws-kpi-icon" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
          </div>
          <div className="ws-kpi-value" style={{ color: '#B91C1C' }}>
            {summary?.investigationRequiredCasesCount ?? 0}
          </div>
          <div className="ws-kpi-subtext">
            Field survey / Stop orders
          </div>
        </div>
      </div>

      {/* Decision Support Priority Ribbon */}
      {decisionSupport && (
        <div className="ws-card">
          <div className="ws-card-header">
            <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              Executive Decision-Support Classification
            </span>
          </div>
          <div className="ws-card-body">
            <div className="ws-grid-4">
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#991B1B', fontSize: 12 }}>
                  <span>CRITICAL ATTENTION</span>
                  <span className="ws-badge ws-badge-critical">
                    {decisionSupport.criticalAttention.length}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#7F1D1D', marginTop: 6, lineHeight: 1.4 }}>
                  Immediate field intervention &amp; stop-work orders recommended.
                </p>
              </div>

              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#92400E', fontSize: 12 }}>
                  <span>HIGH PRIORITY</span>
                  <span className="ws-badge ws-badge-high">
                    {decisionSupport.highPriority.length}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#78350F', marginTop: 6, lineHeight: 1.4 }}>
                  Active discrepancies; schedule UAV drone / checkpoint inspection.
                </p>
              </div>

              <div style={{ background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#854D0E', fontSize: 12 }}>
                  <span>ACTIVE MONITORING</span>
                  <span className="ws-badge ws-badge-medium">
                    {decisionSupport.monitor.length}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#713F12', marginTop: 6, lineHeight: 1.4 }}>
                  Elevated spectral change; track across next satellite pass.
                </p>
              </div>

              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#166534', fontSize: 12 }}>
                  <span>NORMAL / IN ORDER</span>
                  <span className="ws-badge ws-badge-low">
                    {decisionSupport.noCurrentAction.length}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#14532D', marginTop: 6, lineHeight: 1.4 }}>
                  Within authorized baseline parameters; no action required.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Navigation Tabs */}
      <div className="ws-tab-nav">
        <button
          onClick={() => setActiveTab('ZONES')}
          className={`ws-tab-btn ${activeTab === 'ZONES' ? 'ws-tab-btn-active' : ''}`}
        >
          Zone Risk Ranking ({zoneRisks.length})
        </button>
        <button
          onClick={() => setActiveTab('ALERTS')}
          className={`ws-tab-btn ${activeTab === 'ALERTS' ? 'ws-tab-btn-active' : ''}`}
        >
          Alert Intelligence
        </button>
        <button
          onClick={() => setActiveTab('TRANSPORT')}
          className={`ws-tab-btn ${activeTab === 'TRANSPORT' ? 'ws-tab-btn-active' : ''}`}
        >
          Transport &amp; Mining Quotas
        </button>
        <button
          onClick={() => setActiveTab('ENFORCEMENT')}
          className={`ws-tab-btn ${activeTab === 'ENFORCEMENT' ? 'ws-tab-btn-active' : ''}`}
        >
          Enforcement Intelligence
        </button>
        <button
          onClick={() => setActiveTab('TIMELINE')}
          className={`ws-tab-btn ${activeTab === 'TIMELINE' ? 'ws-tab-btn-active' : ''}`}
        >
          Investigation Timeline
        </button>
        <button
          onClick={() => setActiveTab('MAP')}
          className={`ws-tab-btn ${activeTab === 'MAP' ? 'ws-tab-btn-active' : ''}`}
        >
          GIS Surveillance Map
        </button>
        <button
          onClick={() => setActiveTab('TRENDS')}
          className={`ws-tab-btn ${activeTab === 'TRENDS' ? 'ws-tab-btn-active' : ''}`}
        >
          Trend Analytics
        </button>
        <button
          onClick={() => setActiveTab('HOTSPOTS')}
          className={`ws-tab-btn ${activeTab === 'HOTSPOTS' ? 'ws-tab-btn-active' : ''}`}
        >
          Priority Hotspots
        </button>
      </div>

      {/* TAB CONTENT 1: Zone Risk Ranking */}
      {activeTab === 'ZONES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filter Bar */}
          <div className="ws-filter-bar">
            <div className="ws-filter-item">
              <label className="ws-label">Filter by Risk</label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="ws-select"
              >
                <option value="ALL">All Risk Levels</option>
                <option value="CRITICAL">Critical Only</option>
                <option value="HIGH">High Risk</option>
                <option value="MEDIUM">Medium Risk</option>
                <option value="LOW">Low Risk</option>
              </select>
            </div>

            <div className="ws-filter-item" style={{ flex: '2 1 280px' }}>
              <label className="ws-label">Search Monitored Zone</label>
              <div className="ws-search-bar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search zone by name, ID or rationale..."
                  className="ws-search-input"
                />
              </div>
            </div>

            <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Showing <strong>{filteredZones.length}</strong> zones
            </div>
          </div>

          {/* Zones Table */}
          <div className="ws-table-container">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Zone Identifier</th>
                  <th>Category</th>
                  <th>Risk Level</th>
                  <th>Composite Score</th>
                  <th>Decision Support</th>
                  <th>Spectral / SAR Status</th>
                  <th style={{ textAlign: 'right' }}>Operational Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredZones.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>
                      No zones match the selected risk criteria.
                    </td>
                  </tr>
                ) : (
                  filteredZones.map((z) => (
                    <tr key={z.zoneId}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{z.zoneName}</div>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {z.zoneId}
                        </div>
                      </td>
                      <td>
                        <span className="ws-badge ws-badge-neutral">{z.category}</span>
                      </td>
                      <td>{getRiskBadge(z.riskLevel)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{z.riskScore}/100</span>
                          <div className="ws-progress-track" style={{ width: 64 }}>
                            <div
                              className="ws-progress-fill"
                              style={{
                                width: `${Math.min(z.riskScore, 100)}%`,
                                backgroundColor:
                                  z.riskScore >= 75
                                    ? '#DC2626'
                                    : z.riskScore >= 50
                                    ? '#EA580C'
                                    : z.riskScore >= 25
                                    ? '#D97706'
                                    : '#16A34A',
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {z.decisionSupportCategory.replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={z.decisionSupportRationale}>
                          {z.decisionSupportRationale}
                        </div>
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <div>NDVI: <strong>{z.latestOpticalIndicators?.ndvi ?? 'N/A'}</strong> • BSI: {z.latestOpticalIndicators?.bsi ?? 'N/A'}</div>
                        <div style={{ color: 'var(--color-text-muted)' }}>
                          SAR VV: {z.latestSarIndicators?.vvMean ? `${z.latestSarIndicators.vvMean.toFixed(1)} dB` : 'N/A'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenCorrelation(z.zoneId)}
                          className="ws-btn ws-btn-sm ws-btn-outline"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          {correlationLoading ? '...' : 'Lineage'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: Alert Intelligence */}
      {activeTab === 'ALERTS' && alertSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ws-grid-4">
            <div className="ws-kpi-card" style={{ borderLeftColor: '#475569' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label">Total Alerts</span>
                <span className="ws-kpi-icon" style={{ background: '#F1F5F9', color: '#475569' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value">{alertSummary.totalAlerts}</div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#DC2626' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#DC2626' }}>Critical Alerts</span>
                <span className="ws-kpi-icon" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#DC2626' }}>
                {alertSummary.alertsBySeverity.critical}
              </div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#D97706' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#D97706' }}>High Alerts</span>
                <span className="ws-kpi-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#D97706' }}>
                {alertSummary.alertsBySeverity.high}
              </div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#2563EB' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#2563EB' }}>Unresolved Queue</span>
                <span className="ws-kpi-icon" style={{ background: '#DBEAFE', color: '#2563EB' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#2563EB' }}>
                {alertSummary.unresolvedAlerts}
              </div>
            </div>
          </div>

          <div className="ws-card">
            <div className="ws-card-header">
              <span className="ws-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Recent Critical Alerts Requiring Review
              </span>
            </div>
            <div className="ws-card-body">
              {alertSummary.recentCriticalAlerts.length === 0 ? (
                <div className="ws-empty-state" style={{ padding: 24 }}>No critical alerts currently active.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {alertSummary.recentCriticalAlerts.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: 12,
                        background: 'var(--color-surface-alt)',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                          <span>{a.alertId}</span>
                          <span className="ws-badge ws-badge-critical">{a.severity}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          Zone: {a.zoneName}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>
                          Evidence: {a.evidenceScore}/100
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-light)', marginTop: 2 }}>
                          {new Date(a.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: Transport & Mining Quotas */}
      {activeTab === 'TRANSPORT' && transportSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ws-grid-4">
            <div className="ws-kpi-card" style={{ borderLeftColor: '#475569' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label">Authorized Mining Quota</span>
                <span className="ws-kpi-icon" style={{ background: '#F1F5F9', color: '#475569' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value">
                {transportSummary.totalAuthorizedQuotaTonnes.toLocaleString()} t
              </div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#2563EB' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#2563EB' }}>Transport Dispatched</span>
                <span className="ws-kpi-icon" style={{ background: '#DBEAFE', color: '#2563EB' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#2563EB' }}>
                {transportSummary.totalIssuedTransportTonnes.toLocaleString()} t
              </div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#16A34A' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#16A34A' }}>Checkpoint Verified</span>
                <span className="ws-kpi-icon" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#16A34A' }}>
                {transportSummary.totalCheckpointVerifiedTonnes.toLocaleString()} t
              </div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#D97706' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#D97706' }}>Remaining Quota Balance</span>
                <span className="ws-kpi-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#D97706' }}>
                {transportSummary.totalRemainingQuotaTonnes.toLocaleString()} t
              </div>
            </div>
          </div>

          <div className="ws-grid-2">
            <div className="ws-card">
              <div className="ws-card-header">
                <span className="ws-card-title">
                  E-Pass Operational Status Distribution
                </span>
              </div>
              <div className="ws-card-body">
                <div className="ws-grid-3">
                  <div style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Active Passes</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                      {transportSummary.ePassCounts.active}
                    </div>
                  </div>
                  <div style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Used / Completed</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#16A34A', marginTop: 4 }}>
                      {transportSummary.ePassCounts.used}
                    </div>
                  </div>
                  <div style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Expired</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#D97706', marginTop: 4 }}>
                      {transportSummary.ePassCounts.expired}
                    </div>
                  </div>
                  <div style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Draft</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {transportSummary.ePassCounts.draft}
                    </div>
                  </div>
                  <div style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Cancelled</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>
                      {transportSummary.ePassCounts.cancelled}
                    </div>
                  </div>
                  <div style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Quota Utilization</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary)', marginTop: 4 }}>
                      {transportSummary.overallQuotaUtilizationPercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ws-card">
              <div className="ws-card-header">
                <span className="ws-card-title">
                  Transit Discrepancy &amp; Gap Telemetry
                </span>
              </div>
              <div className="ws-card-body">
                <div className="ws-alert-box ws-alert-warning" style={{ flexDirection: 'column', gap: 6, margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontWeight: 600 }}>Unverified Transit Gap:</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#B45309' }}>
                      {transportSummary.totalUnverifiedTransitGapTonnes.toLocaleString()} metric tonnes
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: '#92400E' }}>
                    Represents the mass difference between mineral tonnage declared upon lease dispatch vs verified weight measured at physical forest weighbridge checkpoints.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: Enforcement Intelligence */}
      {activeTab === 'ENFORCEMENT' && enforcementSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ws-grid-4">
            <div className="ws-kpi-card" style={{ borderLeftColor: '#475569' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label">Total Legal Cases</span>
                <span className="ws-kpi-icon" style={{ background: '#F1F5F9', color: '#475569' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value">{enforcementSummary.totalCases}</div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#2563EB' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#2563EB' }}>Active Cases</span>
                <span className="ws-kpi-icon" style={{ background: '#DBEAFE', color: '#2563EB' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#2563EB' }}>
                {enforcementSummary.activeCases}
              </div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#DC2626' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#DC2626' }}>Critical Cases</span>
                <span className="ws-kpi-icon" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#DC2626' }}>
                {enforcementSummary.criticalCases}
              </div>
            </div>
            <div className="ws-kpi-card" style={{ borderLeftColor: '#D97706' }}>
              <div className="ws-kpi-top">
                <span className="ws-kpi-label" style={{ color: '#D97706' }}>Action Required</span>
                <span className="ws-kpi-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </span>
              </div>
              <div className="ws-kpi-value" style={{ color: '#D97706' }}>
                {enforcementSummary.actionRequiredCases}
              </div>
            </div>
          </div>

          <div className="ws-card">
            <div className="ws-card-header">
              <span className="ws-card-title">
                Recent Enforcement Actions &amp; Orders
              </span>
            </div>
            <div className="ws-card-body">
              {enforcementSummary.recentActions.length === 0 ? (
                <div className="ws-empty-state" style={{ padding: 24 }}>No recent enforcement actions recorded.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {enforcementSummary.recentActions.map((action, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        background: 'var(--color-surface-alt)',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                          <span>Case: {action.caseId}</span>
                          <span className="ws-badge ws-badge-primary">{action.actionType}</span>
                          {action.orderRef && (
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                              Ref: {action.orderRef}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{action.actionDetails}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {action.penaltyAmountInr && (
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#16A34A', fontFamily: 'monospace' }}>
                            ₹{action.penaltyAmountInr.toLocaleString()}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--color-text-light)', marginTop: 2 }}>
                          {new Date(action.actionDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: Investigation Timeline */}
      {activeTab === 'TIMELINE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Timeline Filter Controls */}
          <div className="ws-filter-bar">
            <div className="ws-filter-item">
              <label className="ws-label">Filter by Module</label>
              <select
                value={timelineModuleFilter}
                onChange={(e) => setTimelineModuleFilter(e.target.value)}
                className="ws-select"
              >
                <option value="ALL">All Modules</option>
                <option value="ALERT">Alerts</option>
                <option value="CHANGE_DETECTION">Change Detection</option>
                <option value="SATELLITE">Satellite Scans</option>
                <option value="MINING_AUTHORIZATION">Mining Leases</option>
                <option value="EPASS">Transport Passes</option>
                <option value="CHECKPOINT">Checkpoints</option>
                <option value="RECONCILIATION">Reconciliation</option>
                <option value="ENFORCEMENT">Enforcement Cases</option>
                <option value="EVIDENCE">Evidence Dossiers</option>
              </select>
            </div>

            <div className="ws-filter-item" style={{ flex: '2 1 280px' }}>
              <label className="ws-label">Filter Events</label>
              <div className="ws-search-bar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  value={timelineSearch}
                  onChange={(e) => setTimelineSearch(e.target.value)}
                  placeholder="Filter events by entity, title or description..."
                  className="ws-search-input"
                />
              </div>
            </div>

            <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Showing <strong>{filteredTimelineEvents.length}</strong> events
            </div>
          </div>

          {/* Timeline List */}
          <div className="ws-card">
            <div className="ws-card-header">
              <span className="ws-card-title">
                Multi-Source Chronological Event Stream ({filteredTimelineEvents.length} events)
              </span>
              {timelineLoading && <span className="ws-spinner" style={{ width: 14, height: 14 }} />}
            </div>
            <div className="ws-card-body">
              {filteredTimelineEvents.length === 0 ? (
                <div className="ws-empty-state" style={{ padding: 32 }}>
                  {timelineLoading ? 'Retrieving multi-source timeline...' : 'No events found matching criteria.'}
                </div>
              ) : (
                <div className="ws-timeline">
                  {filteredTimelineEvents.map((evt) => (
                    <div key={evt.id} className="ws-timeline-item">
                      <div className="ws-timeline-point">•</div>
                      <div className="ws-card" style={{ marginBottom: 0 }}>
                        <div className="ws-card-header" style={{ padding: '8px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {getModuleBadge(evt.sourceModule)}
                            <strong style={{ fontSize: 13, color: 'var(--color-text)' }}>{evt.title}</strong>
                            {evt.severity && getRiskBadge(evt.severity)}
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                            {new Date(evt.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="ws-card-body" style={{ padding: 12 }}>
                          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{evt.description}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--color-border-light)', fontSize: 11, color: 'var(--color-text-light)' }}>
                            <span>
                              Entity: <strong style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{evt.entityId}</strong>
                              {evt.zoneName && ` • Zone: ${evt.zoneName}`}
                            </span>
                            {evt.zoneId && (
                              <button
                                onClick={() => handleOpenCorrelation(evt.zoneId!)}
                                className="ws-btn ws-btn-sm ws-btn-outline"
                                style={{ padding: '2px 8px', fontSize: 11 }}
                              >
                                Lineage →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 6: GIS Surveillance Map */}
      {activeTab === 'MAP' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ws-card" style={{ marginBottom: 0 }}>
            <div className="ws-card-body" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="ws-label" style={{ marginBottom: 0 }}>Select Surveillance Zone:</span>
                <select
                  value={mapSelectedZoneId}
                  onChange={(e) => setMapSelectedZoneId(e.target.value)}
                  className="ws-select"
                  style={{ width: 'auto', minWidth: 260 }}
                >
                  {zoneRisks.map((z) => (
                    <option key={z.zoneId} value={z.zoneId}>
                      {z.zoneName} ({z.zoneId}) — Risk: {z.riskLevel}
                    </option>
                  ))}
                </select>
              </div>

              {mapSelectedCorrelation && (
                <button
                  onClick={() => handleOpenCorrelation(mapSelectedCorrelation.zone.zoneId)}
                  className="ws-btn ws-btn-primary"
                >
                  Inspect Operational Lineage
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Map Canvas */}
            <div className="ws-card" style={{ gridColumn: 'span 2' }}>
              <div className="ws-card-header">
                <span className="ws-card-title">
                  High-Resolution Satellite &amp; GIS Surveillance
                </span>
                {mapLoading && <span className="ws-spinner" style={{ width: 14, height: 14 }} />}
              </div>
              <div className="ws-card-body" style={{ padding: 12 }}>
                <div style={{ height: 480, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)', position: 'relative' }}>
                  {mapSelectedCorrelation?.zone?.boundary ? (
                    <GisMapViewer
                      boundary={mapSelectedCorrelation.zone.boundary}
                      areaName={mapSelectedCorrelation.zone.name}
                      isPermanent={true}
                      activeMode={GisMapMode.SATELLITE}
                      showBoundary={true}
                      showChangeOverlay={true}
                      overlayOpacity={0.7}
                    />
                  ) : (
                    <div className="ws-empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {mapLoading
                        ? 'Loading boundary coordinates...'
                        : 'Select a monitored zone to view its geospatial boundary and satellite surveillance overlay.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Zone Telemetry Card */}
            <div className="ws-card">
              <div className="ws-card-header">
                <span className="ws-card-title">
                  Zone Surveillance Telemetry
                </span>
              </div>
              <div className="ws-card-body">
                {mapSelectedCorrelation ? (
                  <div className="ws-detail-group">
                    <div style={{ background: 'var(--color-surface-alt)', padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                        {mapSelectedCorrelation.zone.name}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        ID: {mapSelectedCorrelation.zone.zoneId}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        Category: {mapSelectedCorrelation.zone.category}
                      </div>
                    </div>

                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Satellite Scans:</span>
                      <span className="ws-detail-value">{mapSelectedCorrelation.satelliteObservations.length}</span>
                    </div>
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Change Detections:</span>
                      <span className="ws-detail-value">{mapSelectedCorrelation.changeDetections.length}</span>
                    </div>
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Alerts Triggered:</span>
                      <span className="ws-detail-value" style={{ color: '#DC2626' }}>{mapSelectedCorrelation.alerts.length}</span>
                    </div>
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Mining Authorizations:</span>
                      <span className="ws-detail-value">{mapSelectedCorrelation.miningAuthorizations.length}</span>
                    </div>

                    {mapSelectedCorrelation.activeBaseline && (
                      <div style={{ background: '#F0FDF4', padding: 10, borderRadius: 6, border: '1px solid #BBF7D0', marginTop: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>Active Satellite Baseline</div>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#14532D' }}>
                          {mapSelectedCorrelation.activeBaseline.baselineId}
                        </div>
                        <div style={{ fontSize: 10, color: '#15803D' }}>
                          Sensor: {mapSelectedCorrelation.activeBaseline.sensorType} • Effective:{' '}
                          {new Date(mapSelectedCorrelation.activeBaseline.effectiveDate).toLocaleDateString()}
                        </div>
                      </div>
                    )}

                    {mapSelectedCorrelation.evidenceDossiers && mapSelectedCorrelation.evidenceDossiers.length > 0 && (
                      <div style={{ background: '#EFF6FF', padding: 10, borderRadius: 6, border: '1px solid #BFDBFE', marginTop: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF' }}>
                          Evidence Dossiers ({mapSelectedCorrelation.evidenceDossiers.length})
                        </div>
                        {mapSelectedCorrelation.evidenceDossiers.slice(0, 2).map((d) => (
                          <div key={d.id} style={{ fontSize: 10, fontFamily: 'monospace', color: '#1E3A8A', marginTop: 2 }}>
                            {d.dossierId} {d.isSealed ? 'SEALED' : 'DRAFT'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ws-empty-state" style={{ padding: 24 }}>Select a zone above to inspect live telemetry.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 7: Trends */}
      {activeTab === 'TRENDS' && trends && (
        <div className="ws-card">
          <div className="ws-card-header">
            <span className="ws-card-title">
              Multi-Source Environmental Trends &amp; Disturbance Telemetry
            </span>
          </div>
          <div className="ws-card-body">
            {trends.dataPoints.length === 0 ? (
              <div className="ws-empty-state" style={{ padding: 24 }}>No trend data available for this range.</div>
            ) : (
              <div className="ws-table-container" style={{ margin: 0 }}>
                <table className="ws-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Alerts</th>
                      <th>Critical Alerts</th>
                      <th>Disturbed Area</th>
                      <th>Avg Recon Score</th>
                      <th>Dispatched Transport</th>
                      <th>Verified Transport</th>
                      <th>Legal Cases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.dataPoints.map((dp, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace' }}>{dp.date}</td>
                        <td style={{ fontWeight: 600 }}>{dp.alertsCount}</td>
                        <td style={{ color: '#DC2626', fontWeight: 700 }}>{dp.criticalAlertsCount}</td>
                        <td>{dp.disturbedAreaHectares.toFixed(2)} ha</td>
                        <td>{dp.discrepancyScoreAvg}/100</td>
                        <td>{dp.transportIssuedTonnes} t</td>
                        <td>{dp.checkpointVerifiedTonnes} t</td>
                        <td style={{ fontWeight: 700, color: '#991B1B' }}>{dp.enforcementCasesCreated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 8: Hotspots */}
      {activeTab === 'HOTSPOTS' && hotspots && (
        <div className="ws-grid-2">
          <div className="ws-card">
            <div className="ws-card-header">
              <span className="ws-card-title">
                Highest Discrepancy Reconciliation Hotspots
              </span>
            </div>
            <div className="ws-card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hotspots.highestDiscrepancyZones.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#991B1B' }}>{d.zoneName}</div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#7F1D1D', marginTop: 2 }}>
                        Report: {d.reportId}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#DC2626' }}>
                        {d.discrepancyScore}/100
                      </div>
                      <div style={{ fontSize: 11, color: '#991B1B', marginTop: 2 }}>{d.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ws-card">
            <div className="ws-card-header">
              <span className="ws-card-title">
                Zones with Repeated Change Alerts
              </span>
            </div>
            <div className="ws-card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hotspots.repeatedAlertZones.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#92400E' }}>{r.zoneName}</div>
                      <div style={{ fontSize: 11, color: '#78350F', marginTop: 2 }}>
                        Last alert: {new Date(r.lastAlertAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#D97706' }}>
                        {r.alertCount} Alerts
                      </div>
                      <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>
                        {r.criticalCount} Critical
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Module Operational Lineage Modal */}
      {selectedZoneCorrelation && (
        <div
          className="ws-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedZoneCorrelation(null);
          }}
        >
          <div className="ws-modal-dialog" style={{ maxWidth: 960 }}>
            <div className="ws-modal-header">
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Operational Lineage &amp; Evidence Correlation
                </h2>
                <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  Zone: {selectedZoneCorrelation.zone.name} ({selectedZoneCorrelation.zone.zoneId}) • Category: {selectedZoneCorrelation.zone.category}
                </p>
              </div>
              <button
                onClick={() => setSelectedZoneCorrelation(null)}
                className="ws-btn ws-btn-ghost"
                style={{ fontSize: 16, padding: '2px 6px' }}
              >
                ✕
              </button>
            </div>

            <div className="ws-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 1. Satellite & Changes */}
              <div className="ws-card" style={{ marginBottom: 0 }}>
                <div className="ws-card-header">
                  <span className="ws-card-title">1. Satellite Observations & Physical Change Detections</span>
                </div>
                <div className="ws-card-body ws-detail-group">
                  <div className="ws-grid-2">
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Scans:</span>
                      <span className="ws-detail-value">{selectedZoneCorrelation.satelliteObservations.length} observations</span>
                    </div>
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Change Detections:</span>
                      <span className="ws-detail-value">{selectedZoneCorrelation.changeDetections.length} recorded</span>
                    </div>
                  </div>

                  {/* Active Baseline */}
                  {selectedZoneCorrelation.activeBaseline && (
                    <div style={{ background: '#F0FDF4', padding: 10, borderRadius: 6, border: '1px solid #BBF7D0', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                      <div>
                        <strong style={{ color: '#166534' }}>Active Satellite Baseline: </strong>
                        <span style={{ fontFamily: 'monospace' }}>{selectedZoneCorrelation.activeBaseline.baselineId}</span>
                        <span style={{ color: 'var(--color-text-muted)', marginLeft: 6 }}>({selectedZoneCorrelation.activeBaseline.sensorType})</span>
                      </div>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        Effective: {new Date(selectedZoneCorrelation.activeBaseline.effectiveDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Alerts */}
              <div className="ws-card" style={{ marginBottom: 0 }}>
                <div className="ws-card-header">
                  <span className="ws-card-title">
                    2. Environmental Change Alerts ({selectedZoneCorrelation.alerts.length})
                  </span>
                </div>
                <div className="ws-card-body">
                  {selectedZoneCorrelation.alerts.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      No active or historical alerts for this zone.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedZoneCorrelation.alerts.map((a) => (
                        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border-light)', fontSize: 12 }}>
                          <div>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.alertId}</span>
                            <span style={{ marginLeft: 8 }}>{getRiskBadge(a.severity)}</span>
                          </div>
                          <div>
                            Evidence: <strong>{a.evidenceScore}/100</strong> ({a.status})
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Transport & Passes */}
              <div className="ws-card" style={{ marginBottom: 0 }}>
                <div className="ws-card-header">
                  <span className="ws-card-title">3. Transport E-Passes & Checkpoint Scans</span>
                </div>
                <div className="ws-card-body">
                  <div className="ws-grid-3">
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Authorizations:</span>
                      <span className="ws-detail-value">{selectedZoneCorrelation.miningAuthorizations.length} permits</span>
                    </div>
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">E-Passes Issued:</span>
                      <span className="ws-detail-value">{selectedZoneCorrelation.ePasses.length} passes</span>
                    </div>
                    <div className="ws-detail-row">
                      <span className="ws-detail-label">Checkpoint Scans:</span>
                      <span className="ws-detail-value">{selectedZoneCorrelation.checkpointPassages.length} passages</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Reconciliation & Enforcement */}
              <div className="ws-card" style={{ marginBottom: 0 }}>
                <div className="ws-card-header">
                  <span className="ws-card-title">4. Reconciliation Reports & Legal Enforcement Cases</span>
                </div>
                <div className="ws-card-body ws-detail-group">
                  <div className="ws-detail-row">
                    <span className="ws-detail-label">Recon Audits:</span>
                    <span className="ws-detail-value">
                      {selectedZoneCorrelation.reconciliationReports.map((r) => `${r.reconciliationId} (Score: ${r.discrepancyScore})`).join(', ') || 'None'}
                    </span>
                  </div>
                  <div className="ws-detail-row">
                    <span className="ws-detail-label">Enforcement Cases:</span>
                    <span className="ws-detail-value">
                      {selectedZoneCorrelation.enforcementCases.map((c) => `${c.caseId} [${c.severity} - ${c.status}]`).join(', ') || 'None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Tamper-Evident Evidence Dossiers */}
              {selectedZoneCorrelation.evidenceDossiers && selectedZoneCorrelation.evidenceDossiers.length > 0 && (
                <div className="ws-card" style={{ marginBottom: 0 }}>
                  <div className="ws-card-header">
                    <span className="ws-card-title">
                      5. Tamper-Evident Evidence Dossiers ({selectedZoneCorrelation.evidenceDossiers.length})
                    </span>
                  </div>
                  <div className="ws-card-body">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedZoneCorrelation.evidenceDossiers.map((d) => (
                        <div
                          key={d.id}
                          style={{
                            padding: 10,
                            background: 'var(--color-surface-alt)',
                            borderRadius: 6,
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                              <strong style={{ fontFamily: 'monospace' }}>{d.dossierId}</strong>
                              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>(v{d.dossierVersion})</span>
                              {d.isSealed ? (
                                <span className="ws-badge ws-badge-low">SEALED</span>
                              ) : (
                                <span className="ws-badge ws-badge-medium">DRAFT</span>
                              )}
                            </div>
                            {d.caseNumber && (
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>Case: {d.caseNumber}</div>
                            )}
                            <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-light)', marginTop: 2, wordBreak: 'break-all' }}>
                              SHA-256: {d.dossierHash}
                            </div>
                          </div>
                          {d.sealedAt && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'right' }}>
                              {new Date(d.sealedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="ws-modal-footer">
              <button
                onClick={() => setSelectedZoneCorrelation(null)}
                className="ws-btn ws-btn-secondary"
              >
                Close Lineage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
