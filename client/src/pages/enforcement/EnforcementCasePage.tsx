import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CaseStatus,
  CaseSeverity,
  CaseType,
  EnforcementActionType,
  type EnforcementCaseDto,
  type CaseAuditLogDto,
  type EnforcementCaseSummaryDto,
  type CreateEnforcementCaseRequest,
  type CreateCaseFromReconciliationRequest,
  type ReconciliationReportDto,
  type ZoneDto,
  type UserDto,
  type EnforcementCaseFilters,
  type UpdateInvestigationRequest,
} from '@tn-forest/shared/types';
import { enforcementCaseService } from '../../services/enforcementCase.service';
import { reconciliationService } from '../../services/reconciliation.service';
import { zoneService } from '../../services/zone.service';
import { userService } from '../../services/user.service';
import { EvidenceDossierTab } from '../../components/enforcement/EvidenceDossierTab';
import { ComplianceExportModal } from '../../components/enforcement/ComplianceExportModal';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';

import { DateRangeFilter } from '../../components/common/DateRangeFilter';

export const EnforcementCasePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [cases, setCases] = useState<EnforcementCaseDto[]>([]);
  const [summary, setSummary] = useState<EnforcementCaseSummaryDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Case for Details / Workstation Modal
  const [selectedCase, setSelectedCase] = useState<EnforcementCaseDto | null>(null);
  const [auditLogs, setAuditLogs] = useState<CaseAuditLogDto[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'assignment' | 'investigation' | 'action' | 'audit' | 'dossier'>('overview');
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  // Create Case Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showComplianceModal, setShowComplianceModal] = useState<boolean>(false);
  const [createMode, setCreateMode] = useState<'manual' | 'reconciliation'>('reconciliation');
  const [availableReconReports, setAvailableReconReports] = useState<ReconciliationReportDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState<boolean>(false);
  const [officers, setOfficers] = useState<UserDto[]>([]);

  // Zone Scoped Hooks
  const {
    selectedZone,
    selectedZoneId,
    setZoneId,
    clearZone,
    startDate,
    endDate,
    datePreset,
    setDatePreset,
    setDateRange,
    clearDateFilter,
  } = useZoneScopedParams(zones, zonesLoaded);

  // Manual Form State
  const [manualForm, setManualForm] = useState<CreateEnforcementCaseRequest>({
    title: '',
    description: '',
    severity: CaseSeverity.MEDIUM,
    caseType: CaseType.UNRECORDED_EXTRACTION,
    zoneId: '',
    assignedOfficerId: '',
  });

  // Recon Form State
  const [reconForm, setReconForm] = useState<CreateCaseFromReconciliationRequest>({
    reconciliationReportId: '',
    assignedOfficerId: '',
    customTitle: '',
    customDescription: '',
  });

  // Action Forms Inside Workstation
  const [assignForm, setAssignForm] = useState({ assignedOfficerId: '', remarks: '' });
  const [statusForm, setStatusForm] = useState({ status: CaseStatus.UNDER_INVESTIGATION, remarks: '' });
  const [investigationForm, setInvestigationForm] = useState({
    newFinding: '',
    locationCoordinates: '',
    siteObservations: '',
    droneSurveyConducted: false,
    groundDisturbanceConfirmed: true,
    notes: '',
    remarks: '',
  });
  const [actionForm, setActionForm] = useState({
    actionType: EnforcementActionType.NOTICE_ISSUED,
    actionDetails: '',
    penaltyAmountInr: 0,
    officialOrderReference: '',
    remarks: '',
  });
  const [closeForm, setCloseForm] = useState({
    resolutionSummary: '',
    followUpRequired: false,
    remarks: '',
  });

  const getErrorMessage = (err: unknown, fallback: string): string => {
    if (err && typeof err === 'object' && 'response' in err) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      if (res?.data?.message) return res.data.message;
    }
    if (err instanceof Error) return err.message;
    return fallback;
  };

  // Load Main Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: EnforcementCaseFilters = {};
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      if (statusFilter !== 'ALL') filters.status = statusFilter as CaseStatus;
      if (severityFilter !== 'ALL') filters.severity = severityFilter as CaseSeverity;
      if (caseTypeFilter !== 'ALL') filters.caseType = caseTypeFilter as CaseType;
      if (searchQuery.trim()) filters.search = searchQuery.trim();

      const [caseList, summaryData] = await Promise.all([
        enforcementCaseService.getAll(filters),
        enforcementCaseService.getSummary(),
      ]);

      setCases(caseList);
      setSummary(summaryData);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load enforcement cases'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, caseTypeFilter, searchQuery, selectedZoneId, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load auxiliary data for modals
  useEffect(() => {
    const loadAuxData = async () => {
      try {
        const [zoneList, reconList, userList] = await Promise.all([
          zoneService.getZones(),
          reconciliationService.getReports(),
          userService.getUsers(),
        ]);
        setZones(zoneList);
        setZonesLoaded(true);
        setAvailableReconReports(reconList);
        setOfficers(userList.filter((u: UserDto) => u.status === 'ACTIVE'));
      } catch (err) {
        console.warn('Failed to load auxiliary entities', err);
      }
    };
    loadAuxData();
  }, []);

  // Handle incoming query params for escalations (from Reconciliation or Incident Alerts)
  useEffect(() => {
    const reconId = searchParams.get('reconciliationReportId');
    const alertId = searchParams.get('alertId');
    const zoneIdParam = searchParams.get('zoneId');

    if (reconId) {
      setCreateMode('reconciliation');
      setReconForm((prev) => ({
        ...prev,
        reconciliationReportId: reconId,
        customTitle: `Reconciliation Discrepancy Investigation #${reconId.slice(-6).toUpperCase()}`,
        customDescription: `Enforcement case escalated from flagged reconciliation audit report ${reconId}.`,
      }));
      setShowCreateModal(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('reconciliationReportId');
          return next;
        },
        { replace: true },
      );
    } else if (alertId) {
      setCreateMode('manual');
      setManualForm((prev) => ({
        ...prev,
        title: `Field Investigation: Incident Alert ${alertId}`,
        description: `Formal enforcement case opened following confirmed satellite change detection alert ${alertId}.`,
        severity: CaseSeverity.HIGH,
        caseType: CaseType.PROTECTED_ZONE_BREACH,
        zoneId: zoneIdParam || prev.zoneId,
      }));
      setShowCreateModal(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('alertId');
          next.delete('zoneId');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  // Open Case Workstation
  const handleOpenCase = async (c: EnforcementCaseDto) => {
    setSelectedCase(c);
    setActiveTab('overview');
    setAssignForm({ assignedOfficerId: c.assignedOfficerId || '', remarks: '' });
    setStatusForm({ status: c.status, remarks: '' });
    try {
      setModalLoading(true);
      const [freshCase, logs] = await Promise.all([
        enforcementCaseService.getById(c.id),
        enforcementCaseService.getAuditHistory(c.id),
      ]);
      setSelectedCase(freshCase);
      setAuditLogs(logs);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load case details'));
    } finally {
      setModalLoading(false);
    }
  };

  // Submit Officer Assignment
  const handleAssignOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !assignForm.assignedOfficerId) return;
    try {
      setModalLoading(true);
      const updated = await enforcementCaseService.assignOfficer(selectedCase.id, assignForm);
      setSelectedCase(updated);
      const logs = await enforcementCaseService.getAuditHistory(selectedCase.id);
      setAuditLogs(logs);
      loadData();
    } catch (err) {
      alert(getErrorMessage(err, 'Assignment failed'));
    } finally {
      setModalLoading(false);
    }
  };

  // Submit Status Transition
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    try {
      setModalLoading(true);
      const updated = await enforcementCaseService.updateStatus(selectedCase.id, statusForm);
      setSelectedCase(updated);
      const logs = await enforcementCaseService.getAuditHistory(selectedCase.id);
      setAuditLogs(logs);
      loadData();
    } catch (err) {
      alert(getErrorMessage(err, 'Status transition failed'));
    } finally {
      setModalLoading(false);
    }
  };

  // Submit Investigation Details
  const handleUpdateInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    try {
      setModalLoading(true);
      const payload: UpdateInvestigationRequest = {
        findings: investigationForm.newFinding.trim() ? [investigationForm.newFinding.trim()] : undefined,
        remarks: investigationForm.remarks.trim() || undefined,
      };

      if (investigationForm.siteObservations.trim()) {
        let coords: [number, number] | undefined = undefined;
        if (investigationForm.locationCoordinates.includes(',')) {
          const parts = investigationForm.locationCoordinates.split(',').map((s) => parseFloat(s.trim()));
          if (!isNaN(parts[0]) && !isNaN(parts[1])) {
            coords = [parts[0], parts[1]];
          }
        }

        payload.fieldVerification = {
          locationCoordinates: coords,
          siteObservations: investigationForm.siteObservations,
          droneSurveyConducted: investigationForm.droneSurveyConducted,
          groundDisturbanceConfirmed: investigationForm.groundDisturbanceConfirmed,
          notes: investigationForm.notes,
        };
      }

      const updated = await enforcementCaseService.updateInvestigation(selectedCase.id, payload);
      setSelectedCase(updated);
      const logs = await enforcementCaseService.getAuditHistory(selectedCase.id);
      setAuditLogs(logs);
      setInvestigationForm({
        newFinding: '',
        locationCoordinates: '',
        siteObservations: '',
        droneSurveyConducted: false,
        groundDisturbanceConfirmed: true,
        notes: '',
        remarks: '',
      });
      loadData();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to update investigation'));
    } finally {
      setModalLoading(false);
    }
  };

  // Submit Enforcement Action
  const handleRecordAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !actionForm.actionDetails.trim()) return;
    try {
      setModalLoading(true);
      const updated = await enforcementCaseService.recordEnforcementAction(selectedCase.id, {
        actionType: actionForm.actionType,
        actionDetails: actionForm.actionDetails.trim(),
        penaltyAmountInr: actionForm.penaltyAmountInr > 0 ? actionForm.penaltyAmountInr : undefined,
        officialOrderReference: actionForm.officialOrderReference.trim() || undefined,
        remarks: actionForm.remarks.trim() || undefined,
      });
      setSelectedCase(updated);
      const logs = await enforcementCaseService.getAuditHistory(selectedCase.id);
      setAuditLogs(logs);
      loadData();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to record enforcement action'));
    } finally {
      setModalLoading(false);
    }
  };

  // Submit Formal Case Closure
  const handleCloseCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !closeForm.resolutionSummary.trim()) return;
    if (!window.confirm('Are you sure you want to formally CLOSE this enforcement case? This will lock standard edits.')) return;

    try {
      setModalLoading(true);
      const updated = await enforcementCaseService.closeCase(selectedCase.id, {
        resolutionSummary: closeForm.resolutionSummary.trim(),
        followUpRequired: closeForm.followUpRequired,
        remarks: closeForm.remarks.trim() || undefined,
      });
      setSelectedCase(updated);
      const logs = await enforcementCaseService.getAuditHistory(selectedCase.id);
      setAuditLogs(logs);
      loadData();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to close case'));
    } finally {
      setModalLoading(false);
    }
  };

  // Create Case Handler
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (createMode === 'reconciliation') {
        if (!reconForm.reconciliationReportId) {
          alert('Please select a reconciliation report');
          return;
        }
        await enforcementCaseService.createFromReconciliation(reconForm);
      } else {
        if (!manualForm.title.trim() || !manualForm.description.trim()) {
          alert('Title and description are required');
          return;
        }
        await enforcementCaseService.create(manualForm);
      }
      setShowCreateModal(false);
      setManualForm({
        title: '',
        description: '',
        severity: CaseSeverity.MEDIUM,
        caseType: CaseType.UNRECORDED_EXTRACTION,
        zoneId: '',
        assignedOfficerId: '',
      });
      setReconForm({
        reconciliationReportId: '',
        assignedOfficerId: '',
        customTitle: '',
        customDescription: '',
      });
      loadData();
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to create case'));
    } finally {
      setLoading(false);
    }
  };

  // Clear filters
  const resetFilters = () => {
    setStatusFilter('ALL');
    setSeverityFilter('ALL');
    setCaseTypeFilter('ALL');
    setSearchQuery('');
    clearZone();
    clearDateFilter();
  };

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    severityFilter !== 'ALL' ||
    caseTypeFilter !== 'ALL' ||
    searchQuery.trim() !== '' ||
    Boolean(selectedZoneId) ||
    Boolean(startDate) ||
    Boolean(endDate);

  // Helper Badge Renderers
  const renderSeverityBadge = (sev: CaseSeverity) => {
    switch (sev) {
      case CaseSeverity.CRITICAL:
        return <span className="ws-badge ws-badge-critical">CRITICAL</span>;
      case CaseSeverity.HIGH:
        return <span className="ws-badge ws-badge-high">HIGH</span>;
      case CaseSeverity.MEDIUM:
        return <span className="ws-badge ws-badge-medium">MEDIUM</span>;
      case CaseSeverity.LOW:
        return <span className="ws-badge ws-badge-low">LOW</span>;
      default:
        return <span className="ws-badge ws-badge-neutral">{sev}</span>;
    }
  };

  const renderStatusBadge = (st: CaseStatus) => {
    switch (st) {
      case CaseStatus.DETECTED:
        return <span className="ws-badge ws-badge-neutral">DETECTED</span>;
      case CaseStatus.CASE_CREATED:
        return <span className="ws-badge ws-badge-info">CASE CREATED</span>;
      case CaseStatus.ASSIGNED:
        return <span className="ws-badge ws-badge-primary">ASSIGNED</span>;
      case CaseStatus.UNDER_INVESTIGATION:
        return <span className="ws-badge ws-badge-medium">UNDER INVESTIGATION</span>;
      case CaseStatus.FIELD_VERIFICATION:
        return <span className="ws-badge ws-badge-high">FIELD VERIFICATION</span>;
      case CaseStatus.ACTION_REQUIRED:
        return <span className="ws-badge ws-badge-critical">ACTION REQUIRED</span>;
      case CaseStatus.RESOLVED:
        return <span className="ws-badge ws-badge-low">RESOLVED</span>;
      case CaseStatus.CLOSED:
        return <span className="ws-badge ws-badge-low" style={{ background: '#E6F4EA', color: '#137333', borderColor: '#CEEAD6' }}>CLOSED</span>;
      default:
        return <span className="ws-badge ws-badge-neutral">{st}</span>;
    }
  };

  // Lifecycle Steps
  const lifecycleSteps = [
    CaseStatus.CASE_CREATED,
    CaseStatus.ASSIGNED,
    CaseStatus.UNDER_INVESTIGATION,
    CaseStatus.FIELD_VERIFICATION,
    CaseStatus.ACTION_REQUIRED,
    CaseStatus.RESOLVED,
    CaseStatus.CLOSED,
  ];


  return (
    <div className="ws-container">
      {/* Header */}
      <div className="ws-header">
        <div>
          <h1 className="ws-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-primary)' }}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
            Enforcement Case Management & Investigation
          </h1>
          <p className="ws-subtitle">
            Formalized environmental non-compliance investigations, officer assignments, on-ground verification, official actions, and immutable audit logs.
          </p>
        </div>
        <div className="ws-header-actions">
          <button
            onClick={() => setShowComplianceModal(true)}
            className="ws-btn ws-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Statutory Compliance Report
          </button>
          <button
            onClick={() => {
              if (selectedZoneId) {
                setManualForm((prev) => ({ ...prev, zoneId: selectedZoneId }));
              }
              setShowCreateModal(true);
            }}
            className="ws-btn ws-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>+</span> Open Enforcement Case
          </button>
          <button
            onClick={loadData}
            className="ws-btn ws-btn-secondary"
            title="Refresh case data"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Refresh
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
          currentModulePath="/enforcement"
        />
      )}

      {/* KPI Stats Grid */}
      {summary && (
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card" style={{ borderLeftColor: '#475569' }}>
            <div className="ws-kpi-top">
              <span className="ws-kpi-label">Total Cases</span>
              <span className="ws-kpi-icon" style={{ background: '#F1F5F9', color: '#475569' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </span>
            </div>
            <div className="ws-kpi-value">{summary.totalCases}</div>
            <div className="ws-kpi-subtext">Recorded in registry</div>
          </div>

          <div className="ws-kpi-card" style={{ borderLeftColor: '#2563EB' }}>
            <div className="ws-kpi-top">
              <span className="ws-kpi-label" style={{ color: '#2563EB' }}>Active Cases</span>
              <span className="ws-kpi-icon" style={{ background: '#DBEAFE', color: '#2563EB' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/></svg>
              </span>
            </div>
            <div className="ws-kpi-value" style={{ color: '#1D4ED8' }}>{summary.activeCases}</div>
            <div className="ws-kpi-subtext">Open lifecycle workflow</div>
          </div>

          <div className="ws-kpi-card" style={{ borderLeftColor: '#D97706' }}>
            <div className="ws-kpi-top">
              <span className="ws-kpi-label" style={{ color: '#D97706' }}>Investigating</span>
              <span className="ws-kpi-icon" style={{ background: '#FEF3C7', color: '#D97706' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
            </div>
            <div className="ws-kpi-value" style={{ color: '#B45309' }}>{summary.underInvestigationCount}</div>
            <div className="ws-kpi-subtext">Active officer inquiry</div>
          </div>

          <div className="ws-kpi-card" style={{ borderLeftColor: '#7C3AED' }}>
            <div className="ws-kpi-top">
              <span className="ws-kpi-label" style={{ color: '#7C3AED' }}>Field Verification</span>
              <span className="ws-kpi-icon" style={{ background: '#EDE9FE', color: '#7C3AED' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
              </span>
            </div>
            <div className="ws-kpi-value" style={{ color: '#6D28D9' }}>{summary.fieldVerificationCount}</div>
            <div className="ws-kpi-subtext">Ground &amp; UAV survey</div>
          </div>

          <div className="ws-kpi-card" style={{ borderLeftColor: '#DC2626' }}>
            <div className="ws-kpi-top">
              <span className="ws-kpi-label" style={{ color: '#DC2626' }}>Action Required</span>
              <span className="ws-kpi-icon" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
            </div>
            <div className="ws-kpi-value" style={{ color: '#B91C1C' }}>{summary.actionRequiredCount}</div>
            <div className="ws-kpi-subtext">Notice / Penalty / Stop Order</div>
          </div>

          <div className="ws-kpi-card" style={{ borderLeftColor: '#16A34A' }}>
            <div className="ws-kpi-top">
              <span className="ws-kpi-label" style={{ color: '#16A34A' }}>Resolved / Closed</span>
              <span className="ws-kpi-icon" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </span>
            </div>
            <div className="ws-kpi-value" style={{ color: '#15803D' }}>{summary.resolvedCount + summary.closedCount}</div>
            <div className="ws-kpi-subtext">{summary.closedCount} Locked &amp; Sealed</div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="ws-filter-bar">
        <div className="ws-filter-item" style={{ minWidth: 220 }}>
          <ZoneSelector
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setZoneId}
            label="Filter by Zone"
          />
        </div>

        <div className="ws-filter-item">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            activePreset={datePreset}
            onPresetChange={setDatePreset}
            onCustomRangeChange={setDateRange}
            onClear={clearDateFilter}
          />
        </div>

        <div className="ws-filter-item" style={{ flex: '2 1 240px' }}>
          <label className="ws-label">Search Cases</label>
          <div className="ws-search-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search Case ID, Title, Zone, Permit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ws-search-input"
            />
          </div>
        </div>

        <div className="ws-filter-item">
          <label className="ws-label">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ws-select"
          >
            <option value="ALL">All Statuses</option>
            {Object.values(CaseStatus).map((st) => (
              <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="ws-filter-item">
          <label className="ws-label">Severity</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="ws-select"
          >
            <option value="ALL">All Severities</option>
            {Object.values(CaseSeverity).map((sev) => (
              <option key={sev} value={sev}>{sev}</option>
            ))}
          </select>
        </div>

        <div className="ws-filter-item">
          <label className="ws-label">Classification</label>
          <select
            value={caseTypeFilter}
            onChange={(e) => setCaseTypeFilter(e.target.value)}
            className="ws-select"
          >
            <option value="ALL">All Case Types</option>
            {Object.values(CaseType).map((ct) => (
              <option key={ct} value={ct}>{ct.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <button
              onClick={resetFilters}
              className="ws-btn ws-btn-secondary ws-btn-sm"
              title="Reset all search filters"
            >
              Clear Filters
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Showing <strong>{cases.length}</strong> cases
        </div>
      </div>

      {/* Main Cases Table */}
      <div className="ws-table-container">
        {loading ? (
          <div className="ws-empty-state">
            <div className="ws-spinner" style={{ marginBottom: 12 }}></div>
            <div>Loading enforcement cases...</div>
          </div>
        ) : error ? (
          <div className="ws-alert-box ws-alert-danger" style={{ margin: 20 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>{error}</div>
          </div>
        ) : cases.length === 0 ? (
          <div className="ws-empty-state">
            <div className="ws-empty-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>No Enforcement Cases Found</div>
            <p style={{ marginTop: 4 }}>No cases match the selected filter criteria or search parameters.</p>
          </div>
        ) : (
          <table className="ws-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Title & Classification</th>
                <th>Target Zone / Permit</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned Officer</th>
                <th>Created / Updated</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {c.caseId}
                    </span>
                    {c.reconciliationReportNumber && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                        via {c.reconciliationReportNumber}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {c.caseType.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.zoneName || 'N/A'}</div>
                    {c.permitNumber && (
                      <div style={{ fontSize: 11, color: '#D97706', fontFamily: 'monospace', marginTop: 2 }}>
                        Permit: {c.permitNumber}
                      </div>
                    )}
                  </td>
                  <td>{renderSeverityBadge(c.severity)}</td>
                  <td>{renderStatusBadge(c.status)}</td>
                  <td>
                    {c.assignedOfficerName ? (
                      <span style={{ fontWeight: 500 }}>{c.assignedOfficerName}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-light)', fontStyle: 'italic' }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <div>{new Date(c.createdAt).toLocaleDateString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-light)' }}>
                      {new Date(c.updatedAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => handleOpenCase(c)}
                      className="ws-btn ws-btn-sm ws-btn-outline"
                    >
                      Inspect Workstation →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Case Workstation Modal */}
      {selectedCase && (
        <div
          className="ws-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCase(null);
          }}
        >
          <div className="ws-modal-dialog" style={{ maxWidth: 1060 }}>
            {/* Modal Header */}
            <div className="ws-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: 'var(--color-primary)' }}>
                    {selectedCase.caseId}
                  </span>
                  {renderSeverityBadge(selectedCase.severity)}
                  {renderStatusBadge(selectedCase.status)}
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--color-text)' }}>
                  {selectedCase.title}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Type: <strong style={{ color: 'var(--color-text)' }}>{selectedCase.caseType.replace(/_/g, ' ')}</strong> |{' '}
                  Zone: <strong style={{ color: 'var(--color-text)' }}>{selectedCase.zoneName || 'N/A'}</strong> |{' '}
                  Assigned Officer: <strong style={{ color: 'var(--color-text)' }}>{selectedCase.assignedOfficerName || 'None'}</strong>
                </div>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="ws-btn ws-btn-ghost"
                style={{ fontSize: 18, padding: '4px 8px' }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Stepper Pipeline */}
            <div className="ws-stepper">
              {lifecycleSteps.map((step, idx) => {
                const currentIdx = lifecycleSteps.indexOf(selectedCase.status);
                const isCurrent = selectedCase.status === step;
                const isPast = currentIdx > idx;

                let circleBg = 'var(--color-surface)';
                let circleColor = 'var(--color-text-muted)';
                let circleBorder = '1px solid var(--color-border)';

                if (isCurrent) {
                  circleBg = 'var(--color-primary)';
                  circleColor = '#FFFFFF';
                  circleBorder = '1px solid var(--color-primary)';
                } else if (isPast) {
                  circleBg = '#E8F5E9';
                  circleColor = '#166534';
                  circleBorder = '1px solid #BBF7D0';
                }

                return (
                  <React.Fragment key={step}>
                    <div className="ws-step-node" style={{ color: isCurrent ? 'var(--color-primary)' : isPast ? '#166534' : undefined, fontWeight: isCurrent ? 700 : undefined }}>
                      <div className="ws-step-circle" style={{ background: circleBg, color: circleColor, border: circleBorder }}>
                        {isPast ? '✓' : idx + 1}
                      </div>
                      <span>{step.replace(/_/g, ' ')}</span>
                    </div>
                    {idx < lifecycleSteps.length - 1 && (
                      <div className="ws-step-line" style={{ background: isPast ? '#BBF7D0' : undefined }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Tab Navigation */}
            <div className="ws-tab-nav" style={{ padding: '0 20px', background: 'var(--color-surface-alt)' }}>
              <button
                onClick={() => setActiveTab('overview')}
                className={`ws-tab-btn ${activeTab === 'overview' ? 'ws-tab-btn-active' : ''}`}
              >
                1. Case Overview & Evidence
              </button>
              <button
                onClick={() => setActiveTab('assignment')}
                className={`ws-tab-btn ${activeTab === 'assignment' ? 'ws-tab-btn-active' : ''}`}
              >
                2. Officer Assignment
              </button>
              <button
                onClick={() => setActiveTab('investigation')}
                className={`ws-tab-btn ${activeTab === 'investigation' ? 'ws-tab-btn-active' : ''}`}
              >
                3. Investigation & Ground Survey
              </button>
              <button
                onClick={() => setActiveTab('action')}
                className={`ws-tab-btn ${activeTab === 'action' ? 'ws-tab-btn-active' : ''}`}
              >
                4. Enforcement Action & Closure
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`ws-tab-btn ${activeTab === 'audit' ? 'ws-tab-btn-active' : ''}`}
              >
                5. Immutable Audit Trail ({auditLogs.length})
              </button>
              <button
                onClick={() => setActiveTab('dossier')}
                className={`ws-tab-btn ${activeTab === 'dossier' ? 'ws-tab-btn-active' : ''}`}
                style={{ color: activeTab === 'dossier' ? '#166534' : undefined }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: 5, verticalAlign: 'text-bottom' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                6. Evidence Dossier &amp; SHA-256
              </button>
            </div>

            {/* Tab Body */}
            <div className="ws-modal-body">
              {modalLoading ? (
                <div className="ws-empty-state">
                  <div className="ws-spinner" style={{ marginBottom: 12 }}></div>
                  <div>Loading case details and immutable audit history...</div>
                </div>
              ) : (
                <>
                  {/* TAB 1: OVERVIEW */}
                  {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="ws-card" style={{ marginBottom: 0 }}>
                        <div className="ws-card-header">
                          <span className="ws-card-title">Case Description</span>
                        </div>
                        <div className="ws-card-body">
                          <p style={{ whiteSpace: 'pre-line', fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)' }}>
                            {selectedCase.description}
                          </p>
                        </div>
                      </div>

                      <div className="ws-grid-2">
                        <div className="ws-card" style={{ marginBottom: 0 }}>
                          <div className="ws-card-header">
                            <span className="ws-card-title">Target & Legal Attributes</span>
                          </div>
                          <div className="ws-card-body ws-detail-group">
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Monitored Zone:</span>
                              <span className="ws-detail-value">{selectedCase.zoneName || 'N/A'}</span>
                            </div>
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Mining Permit:</span>
                              <span className="ws-detail-value" style={{ fontFamily: 'monospace', color: '#D97706' }}>
                                {selectedCase.permitNumber || 'None / Protected'}
                              </span>
                            </div>
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Originating Reconciliation Report:</span>
                              <span className="ws-detail-value" style={{ fontFamily: 'monospace', color: '#DC2626' }}>
                                {selectedCase.reconciliationReportNumber || 'Manual Report'}
                              </span>
                            </div>
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Date Logged:</span>
                              <span className="ws-detail-value">{new Date(selectedCase.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="ws-card" style={{ marginBottom: 0 }}>
                          <div className="ws-card-header">
                            <span className="ws-card-title">Current Workflow State</span>
                          </div>
                          <div className="ws-card-body ws-detail-group">
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Status:</span>
                              <div>{renderStatusBadge(selectedCase.status)}</div>
                            </div>
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Assigned Officer:</span>
                              <span className="ws-detail-value">{selectedCase.assignedOfficerName || 'Not Assigned'}</span>
                            </div>
                            {selectedCase.assignedAt && (
                              <div className="ws-detail-row">
                                <span className="ws-detail-label">Assigned At:</span>
                                <span className="ws-detail-value">{new Date(selectedCase.assignedAt).toLocaleString()}</span>
                              </div>
                            )}
                            {selectedCase.closedAt && (
                              <div className="ws-detail-row">
                                <span className="ws-detail-label">Closed At:</span>
                                <span className="ws-detail-value" style={{ color: '#16A34A' }}>
                                  {new Date(selectedCase.closedAt).toLocaleString()} by {selectedCase.closedByName || 'Officer'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {selectedCase.investigationFindings && selectedCase.investigationFindings.length > 0 && (
                        <div className="ws-card" style={{ marginBottom: 0 }}>
                          <div className="ws-card-header">
                            <span className="ws-card-title">Initial Findings & Telemetry Anomaly Triggers</span>
                          </div>
                          <div className="ws-card-body">
                            <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text)' }}>
                              {selectedCase.investigationFindings.map((f, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>{f}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="ws-alert-box ws-alert-info">
                        <span style={{ fontSize: 16 }}>ℹ️</span>
                        <div>
                          <strong>Statutory Legal Advisory:</strong> Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey. Inconsistencies initiate official enforcement inquiries and do not constitute automatic legal convictions.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ASSIGNMENT */}
                  {activeTab === 'assignment' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="ws-card" style={{ marginBottom: 0 }}>
                        <div className="ws-card-header">
                          <span className="ws-card-title">Assign / Reassign Enforcement Officer</span>
                        </div>
                        <div className="ws-card-body">
                          {selectedCase.status === CaseStatus.CLOSED ? (
                            <div className="ws-alert-box ws-alert-warning">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              <div>Case is CLOSED. Officer reassignment is locked.</div>
                            </div>
                          ) : (
                            <form onSubmit={handleAssignOfficer}>
                              <div className="ws-form-group">
                                <label className="ws-label">Select Enforcement Officer *</label>
                                <select
                                  value={assignForm.assignedOfficerId}
                                  onChange={(e) => setAssignForm({ ...assignForm, assignedOfficerId: e.target.value })}
                                  className="ws-select"
                                  required
                                >
                                  <option value="">-- Choose Officer --</option>
                                  {officers.map((off) => (
                                    <option key={off.id} value={off.id}>
                                      {off.name} ({off.role}) - {off.email}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="ws-form-group">
                                <label className="ws-label">Assignment Remarks / Directives</label>
                                <textarea
                                  value={assignForm.remarks}
                                  onChange={(e) => setAssignForm({ ...assignForm, remarks: e.target.value })}
                                  placeholder="Special instructions for field verification or preliminary inquiry..."
                                  rows={3}
                                  className="ws-textarea"
                                />
                              </div>
                              <button
                                type="submit"
                                className="ws-btn ws-btn-primary"
                              >
                                Confirm Officer Assignment
                              </button>
                            </form>
                          )}
                        </div>
                      </div>

                      {/* Manual Status Transition */}
                      <div className="ws-card" style={{ marginBottom: 0 }}>
                        <div className="ws-card-header">
                          <span className="ws-card-title">Update Lifecycle Status</span>
                        </div>
                        <div className="ws-card-body">
                          {selectedCase.status === CaseStatus.CLOSED ? (
                            <div className="ws-alert-box ws-alert-warning">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              <div>Case is CLOSED. Status modification is locked.</div>
                            </div>
                          ) : (
                            <form onSubmit={handleUpdateStatus}>
                              <div className="ws-form-group">
                                <label className="ws-label">Next Lifecycle Status</label>
                                <select
                                  value={statusForm.status}
                                  onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value as CaseStatus })}
                                  className="ws-select"
                                >
                                  {Object.values(CaseStatus).map((st) => (
                                    <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="ws-form-group">
                                <label className="ws-label">Transition Justification</label>
                                <input
                                  type="text"
                                  value={statusForm.remarks}
                                  onChange={(e) => setStatusForm({ ...statusForm, remarks: e.target.value })}
                                  placeholder="Reason for transitioning status..."
                                  className="ws-input"
                                />
                              </div>
                              <button
                                type="submit"
                                className="ws-btn ws-btn-secondary"
                              >
                                Transition Status
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: INVESTIGATION */}
                  {activeTab === 'investigation' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* Log Field Verification */}
                      <div className="ws-card" style={{ marginBottom: 0 }}>
                        <div className="ws-card-header">
                          <span className="ws-card-title">Record On-Ground Field / Drone Verification</span>
                        </div>
                        <div className="ws-card-body">
                          {selectedCase.status === CaseStatus.CLOSED ? (
                            <div className="ws-alert-box ws-alert-warning">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              <div>Case is CLOSED. Investigation logging is locked.</div>
                            </div>
                          ) : (
                            <form onSubmit={handleUpdateInvestigation}>
                              <div className="ws-grid-2">
                                <div className="ws-form-group">
                                  <label className="ws-label">Add Investigation Finding</label>
                                  <input
                                    type="text"
                                    value={investigationForm.newFinding}
                                    onChange={(e) => setInvestigationForm({ ...investigationForm, newFinding: e.target.value })}
                                    placeholder="e.g. Unregistered excavator spotted at site..."
                                    className="ws-input"
                                  />
                                </div>
                                <div className="ws-form-group">
                                  <label className="ws-label">GPS Coordinates (lng, lat)</label>
                                  <input
                                    type="text"
                                    value={investigationForm.locationCoordinates}
                                    onChange={(e) => setInvestigationForm({ ...investigationForm, locationCoordinates: e.target.value })}
                                    placeholder="e.g. 76.6215, 11.5830"
                                    className="ws-input"
                                  />
                                </div>
                              </div>

                              <div className="ws-form-group">
                                <label className="ws-label">On-Site Observations</label>
                                <textarea
                                  value={investigationForm.siteObservations}
                                  onChange={(e) => setInvestigationForm({ ...investigationForm, siteObservations: e.target.value })}
                                  placeholder="Details of ground inspection, pit depth measurement, boundary pillar inspection..."
                                  rows={3}
                                  className="ws-textarea"
                                />
                              </div>

                              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={investigationForm.droneSurveyConducted}
                                    onChange={(e) => setInvestigationForm({ ...investigationForm, droneSurveyConducted: e.target.checked })}
                                  />
                                  <span>UAV / Drone Survey Conducted</span>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={investigationForm.groundDisturbanceConfirmed}
                                    onChange={(e) => setInvestigationForm({ ...investigationForm, groundDisturbanceConfirmed: e.target.checked })}
                                  />
                                  <span style={{ fontWeight: 600, color: '#DC2626' }}>Ground Disturbance Confirmed</span>
                                </label>
                              </div>

                              <button
                                type="submit"
                                className="ws-btn ws-btn-primary"
                              >
                                Save Field Verification & Update Status
                              </button>
                            </form>
                          )}
                        </div>
                      </div>

                      {/* Logged Verification Details */}
                      {selectedCase.fieldVerification && (
                        <div className="ws-card" style={{ marginBottom: 0 }}>
                          <div className="ws-card-header">
                            <span className="ws-card-title">Logged Field Verification Summary</span>
                          </div>
                          <div className="ws-card-body ws-detail-group">
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Verified By:</span>
                              <span className="ws-detail-value">{selectedCase.fieldVerification.verifiedByName || 'Enforcement Squad'}</span>
                            </div>
                            {selectedCase.fieldVerification.verifiedAt && (
                              <div className="ws-detail-row">
                                <span className="ws-detail-label">Date:</span>
                                <span className="ws-detail-value">{new Date(selectedCase.fieldVerification.verifiedAt).toLocaleString()}</span>
                              </div>
                            )}
                            {selectedCase.fieldVerification.locationCoordinates && (
                              <div className="ws-detail-row">
                                <span className="ws-detail-label">Coordinates:</span>
                                <span className="ws-detail-value" style={{ fontFamily: 'monospace', color: '#D97706' }}>
                                  [{selectedCase.fieldVerification.locationCoordinates.join(', ')}]
                                </span>
                              </div>
                            )}
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Observations:</span>
                              <span className="ws-detail-value">{selectedCase.fieldVerification.siteObservations || 'None'}</span>
                            </div>
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Surveys:</span>
                              <div>
                                {selectedCase.fieldVerification.droneSurveyConducted && (
                                  <span className="ws-badge ws-badge-info" style={{ marginRight: 8 }}>✓ Drone Survey</span>
                                )}
                                {selectedCase.fieldVerification.groundDisturbanceConfirmed ? (
                                  <span className="ws-badge ws-badge-critical">✓ Disturbance Confirmed</span>
                                ) : (
                                  <span className="ws-badge ws-badge-low">No Disturbance</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: ACTION & CLOSURE */}
                  {activeTab === 'action' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* Record Official Enforcement Action */}
                      <div className="ws-card" style={{ marginBottom: 0 }}>
                        <div className="ws-card-header">
                          <span className="ws-card-title">Record Official Enforcement Action</span>
                        </div>
                        <div className="ws-card-body">
                          {selectedCase.status === CaseStatus.CLOSED ? (
                            <div className="ws-alert-box ws-alert-warning">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              <div>Case is CLOSED. Enforcement action logging is locked.</div>
                            </div>
                          ) : (
                            <form onSubmit={handleRecordAction}>
                              <div className="ws-grid-2">
                                <div className="ws-form-group">
                                  <label className="ws-label">Action Type *</label>
                                  <select
                                    value={actionForm.actionType}
                                    onChange={(e) => setActionForm({ ...actionForm, actionType: e.target.value as EnforcementActionType })}
                                    className="ws-select"
                                  >
                                    {Object.values(EnforcementActionType).map((act) => (
                                      <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="ws-form-group">
                                  <label className="ws-label">Official Order / Memo Reference</label>
                                  <input
                                    type="text"
                                    value={actionForm.officialOrderReference}
                                    onChange={(e) => setActionForm({ ...actionForm, officialOrderReference: e.target.value })}
                                    placeholder="e.g. TN-FD/MINING/2026/042"
                                    className="ws-input"
                                  />
                                </div>
                              </div>

                              <div className="ws-grid-2">
                                <div className="ws-form-group">
                                  <label className="ws-label">Penalty Levied (INR)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={actionForm.penaltyAmountInr}
                                    onChange={(e) => setActionForm({ ...actionForm, penaltyAmountInr: parseFloat(e.target.value) || 0 })}
                                    className="ws-input"
                                  />
                                </div>
                                <div className="ws-form-group">
                                  <label className="ws-label">Action Details *</label>
                                  <input
                                    type="text"
                                    value={actionForm.actionDetails}
                                    onChange={(e) => setActionForm({ ...actionForm, actionDetails: e.target.value })}
                                    placeholder="Summary of notice served, halt order, FIR number, vehicle impoundment..."
                                    className="ws-input"
                                    required
                                  />
                                </div>
                              </div>

                              <button
                                type="submit"
                                className="ws-btn ws-btn-danger"
                              >
                                Record Action & Transition to ACTION_REQUIRED
                              </button>
                            </form>
                          )}
                        </div>
                      </div>

                      {/* Display Logged Action */}
                      {selectedCase.enforcementAction && (
                        <div className="ws-card" style={{ marginBottom: 0 }}>
                          <div className="ws-card-header">
                            <span className="ws-card-title">Current Official Action on Record</span>
                          </div>
                          <div className="ws-card-body ws-detail-group">
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Action:</span>
                              <span className="ws-detail-value" style={{ fontWeight: 700 }}>
                                {selectedCase.enforcementAction.actionType?.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="ws-detail-row">
                              <span className="ws-detail-label">Details:</span>
                              <span className="ws-detail-value">{selectedCase.enforcementAction.actionDetails}</span>
                            </div>
                            {selectedCase.enforcementAction.penaltyAmountInr && (
                              <div className="ws-detail-row">
                                <span className="ws-detail-label">Penalty Levied:</span>
                                <span className="ws-detail-value" style={{ color: '#D97706', fontWeight: 700 }}>
                                  ₹{selectedCase.enforcementAction.penaltyAmountInr.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                            {selectedCase.enforcementAction.officialOrderReference && (
                              <div className="ws-detail-row">
                                <span className="ws-detail-label">Order Ref:</span>
                                <span className="ws-detail-value" style={{ fontFamily: 'monospace', color: '#7C3AED' }}>
                                  {selectedCase.enforcementAction.officialOrderReference}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Formal Case Closure */}
                      <div className="ws-card" style={{ marginBottom: 0 }}>
                        <div className="ws-card-header">
                          <span className="ws-card-title" style={{ color: '#166534' }}>
                            Formal Case Resolution & Settlement
                          </span>
                        </div>
                        <div className="ws-card-body">
                          {selectedCase.status === CaseStatus.CLOSED ? (
                            <div className="ws-alert-box ws-alert-success">
                              <span>✓</span>
                              <div>
                                <strong>Case is CLOSED</strong> (Settled on {new Date(selectedCase.closedAt || '').toLocaleString()})
                                {selectedCase.resolutionInfo && (
                                  <div style={{ marginTop: 4, fontSize: 12 }}>
                                    Summary: {selectedCase.resolutionInfo.summary}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <form onSubmit={handleCloseCase}>
                              <div className="ws-form-group">
                                <label className="ws-label">Resolution Summary *</label>
                                <textarea
                                  value={closeForm.resolutionSummary}
                                  onChange={(e) => setCloseForm({ ...closeForm, resolutionSummary: e.target.value })}
                                  placeholder="Explain final settlement, penalty realization, site reclamation, or compounding order..."
                                  rows={3}
                                  className="ws-textarea"
                                  required
                                />
                              </div>

                              <div className="ws-form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={closeForm.followUpRequired}
                                    onChange={(e) => setCloseForm({ ...closeForm, followUpRequired: e.target.checked })}
                                  />
                                  <span>Requires periodic satellite follow-up monitoring</span>
                                </label>
                              </div>

                              <button
                                type="submit"
                                className="ws-btn ws-btn-primary"
                              >
                                Lock & Formally Close Case
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 5: AUDIT TRAIL */}
                  {activeTab === 'audit' && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
                        Immutable Chronological Audit Log ({auditLogs.length} Events)
                      </div>
                      {auditLogs.length === 0 ? (
                        <div className="ws-empty-state">No audit logs recorded for this case.</div>
                      ) : (
                        <div className="ws-timeline">
                          {auditLogs.map((log) => (
                            <div key={log.id} className="ws-timeline-item">
                              <div className="ws-timeline-point" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                              </div>
                              <div className="ws-card" style={{ marginBottom: 0 }}>
                                <div className="ws-card-header" style={{ padding: '8px 14px' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#D97706', fontSize: 12 }}>
                                    {log.auditId}
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                    {new Date(log.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <div className="ws-card-body" style={{ padding: 12, fontSize: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span className="ws-badge ws-badge-primary">{log.action}</span>
                                    <span style={{ fontWeight: 600 }}>{log.actorName} ({log.actorRole})</span>
                                  </div>
                                  {log.previousStatus && log.newStatus && log.previousStatus !== log.newStatus && (
                                    <div style={{ color: 'var(--color-text-muted)', margin: '4px 0' }}>
                                      Status: <strong style={{ color: '#D97706' }}>{log.previousStatus}</strong> →{' '}
                                      <strong style={{ color: '#16A34A' }}>{log.newStatus}</strong>
                                    </div>
                                  )}
                                  {log.remarks && (
                                    <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: 4 }}>
                                      {log.remarks}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 6: EVIDENCE DOSSIER */}
                  {activeTab === 'dossier' && (
                    <EvidenceDossierTab
                      enforcementCase={selectedCase}
                      zone={zones.find((z) => z.id === selectedCase.zoneId)}
                    />
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="ws-modal-footer">
              <span style={{ alignSelf: 'center', marginRight: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
                Security: All modifications are immutably signed and audit-logged.
              </span>
              <button
                onClick={() => setSelectedCase(null)}
                className="ws-btn ws-btn-secondary"
              >
                Close Workstation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Case Modal */}
      {showCreateModal && (
        <div
          className="ws-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div className="ws-modal-dialog" style={{ maxWidth: 600 }}>
            <div className="ws-modal-header">
              <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-primary)' }}><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
                Initiate Enforcement Case
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="ws-btn ws-btn-ghost"
                style={{ fontSize: 16, padding: '2px 6px' }}
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="ws-tab-nav" style={{ padding: '0 20px', background: 'var(--color-surface-alt)', marginBottom: 0 }}>
              <button
                onClick={() => setCreateMode('reconciliation')}
                className={`ws-tab-btn ${createMode === 'reconciliation' ? 'ws-tab-btn-active' : ''}`}
                style={{ fontSize: 12 }}
              >
                From Reconciliation Report (Recommended)
              </button>
              <button
                onClick={() => setCreateMode('manual')}
                className={`ws-tab-btn ${createMode === 'manual' ? 'ws-tab-btn-active' : ''}`}
                style={{ fontSize: 12 }}
              >
                Manual Ingestion
              </button>
            </div>

            <form onSubmit={handleCreateCase}>
              <div className="ws-modal-body" style={{ maxHeight: '65vh' }}>
                {createMode === 'reconciliation' ? (
                  <>
                    <div className="ws-form-group">
                      <label className="ws-label">Select Discrepancy Report *</label>
                      <select
                        value={reconForm.reconciliationReportId}
                        onChange={(e) => setReconForm({ ...reconForm, reconciliationReportId: e.target.value })}
                        className="ws-select"
                        required
                      >
                        <option value="">-- Choose Reconciliation Report --</option>
                        {availableReconReports.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.reconciliationId} | {r.zoneName || 'Zone'} | Score: {r.discrepancyScore}/100 ({r.reconciliationStatus})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="ws-form-group">
                      <label className="ws-label">Assign Officer (Optional)</label>
                      <select
                        value={reconForm.assignedOfficerId}
                        onChange={(e) => setReconForm({ ...reconForm, assignedOfficerId: e.target.value })}
                        className="ws-select"
                      >
                        <option value="">-- Leave Unassigned --</option>
                        {officers.map((off) => (
                          <option key={off.id} value={off.id}>
                            {off.name} ({off.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="ws-form-group">
                      <label className="ws-label">Custom Title Override (Optional)</label>
                      <input
                        type="text"
                        value={reconForm.customTitle}
                        onChange={(e) => setReconForm({ ...reconForm, customTitle: e.target.value })}
                        placeholder="Auto-generated from anomaly triggers if left blank"
                        className="ws-input"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ws-form-group">
                      <label className="ws-label">Case Title *</label>
                      <input
                        type="text"
                        value={manualForm.title}
                        onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                        placeholder="e.g. Unlawful Granite Excavation at Nilgiris Forest Buffer"
                        className="ws-input"
                        required
                      />
                    </div>

                    <div className="ws-grid-2">
                      <div className="ws-form-group">
                        <label className="ws-label">Severity *</label>
                        <select
                          value={manualForm.severity}
                          onChange={(e) => setManualForm({ ...manualForm, severity: e.target.value as CaseSeverity })}
                          className="ws-select"
                        >
                          {Object.values(CaseSeverity).map((sev) => (
                            <option key={sev} value={sev}>{sev}</option>
                          ))}
                        </select>
                      </div>

                      <div className="ws-form-group">
                        <label className="ws-label">Classification *</label>
                        <select
                          value={manualForm.caseType}
                          onChange={(e) => setManualForm({ ...manualForm, caseType: e.target.value as CaseType })}
                          className="ws-select"
                        >
                          {Object.values(CaseType).map((ct) => (
                            <option key={ct} value={ct}>{ct.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="ws-form-group">
                      <label className="ws-label">Target Zone (Optional)</label>
                      <select
                        value={manualForm.zoneId}
                        onChange={(e) => setManualForm({ ...manualForm, zoneId: e.target.value })}
                        className="ws-select"
                      >
                        <option value="">-- None / Outside Boundary --</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>{z.name} ({z.category})</option>
                        ))}
                      </select>
                    </div>

                    <div className="ws-form-group">
                      <label className="ws-label">Case Description *</label>
                      <textarea
                        value={manualForm.description}
                        onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                        placeholder="Detailed facts, intelligence source, initial evidence observations..."
                        rows={3}
                        className="ws-textarea"
                        required
                      />
                    </div>

                    <div className="ws-form-group">
                      <label className="ws-label">Assign Officer (Optional)</label>
                      <select
                        value={manualForm.assignedOfficerId}
                        onChange={(e) => setManualForm({ ...manualForm, assignedOfficerId: e.target.value })}
                        className="ws-select"
                      >
                        <option value="">-- Leave Unassigned --</option>
                        {officers.map((off) => (
                          <option key={off.id} value={off.id}>
                            {off.name} ({off.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="ws-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="ws-btn ws-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="ws-btn ws-btn-primary"
                >
                  {loading ? 'Creating...' : 'Launch Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statutory Compliance Export Modal */}
      <ComplianceExportModal
        isOpen={showComplianceModal}
        onClose={() => setShowComplianceModal(false)}
        zones={zones}
      />
    </div>
  );
};
