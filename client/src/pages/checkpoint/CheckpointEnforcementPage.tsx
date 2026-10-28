import React, { useState, useEffect, useCallback } from 'react';
import { checkpointService } from '../../services/checkpoint.service';
import { epassService } from '../../services/epass.service';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import {
  CheckpointStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
  type CheckpointDto,
  type CheckpointLogDto,
  type CheckpointSummaryDto,
  type VerifyEPassResponse,
  type ZoneDto,
  type EPassDto,
} from '@tn-forest/shared/types';
import { zoneService } from '../../services/zone.service';
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

const RESULT_VARIANTS: Record<CheckpointVerificationResult, 'success' | 'danger'> = {
  [CheckpointVerificationResult.VALID]: 'success',
  [CheckpointVerificationResult.INVALID]: 'danger',
};

const STATUS_VARIANTS: Record<CheckpointStatus, 'success' | 'danger' | 'warning'> = {
  [CheckpointStatus.ACTIVE]: 'success',
  [CheckpointStatus.INACTIVE]: 'danger',
  [CheckpointStatus.MAINTENANCE]: 'warning',
};

export const CheckpointEnforcementPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'VERIFY' | 'LOGS' | 'REGISTRY'>('VERIFY');

  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointDto[]>([]);
  const [summary, setSummary] = useState<CheckpointSummaryDto | null>(null);
  const [logs, setLogs] = useState<CheckpointLogDto[]>([]);
  const [activePasses, setActivePasses] = useState<EPassDto[]>([]);

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

  // Selected Checkpoint
  const [selectedCpId, setSelectedCpId] = useState<string>('');

  // Verification Workstation states
  const [scanInput, setScanInput] = useState('');
  const [declaredTonnage, setDeclaredTonnage] = useState('');
  const [currentGps, setCurrentGps] = useState<[number, number] | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyEPassResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Passage Recording
  const [recordingPassage, setRecordingPassage] = useState(false);
  const [passageSuccessMessage, setPassageSuccessMessage] = useState<string | null>(null);

  // Log filter states
  const [logFilterResult, setLogFilterResult] = useState<'ALL' | CheckpointVerificationResult>('ALL');
  const [logSearchPass, setLogSearchPass] = useState('');

  // Checkpoint creation modal
  const [showCpModal, setShowCpModal] = useState(false);
  const [cpFormData, setCpFormData] = useState({
    name: '',
    district: 'Salem',
    longitude: '78.146',
    latitude: '11.664',
    geofenceRadiusMeters: '500',
    operatingHours: '24/7 Continuous Enforcement',
  });
  const [cpSubmitting, setCpSubmitting] = useState(false);

  const canCreateCheckpoint =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'FOREST_OFFICER';

  useEffect(() => {
    zoneService
      .getZones()
      .then((zList) => {
        setZones(zList);
        setZonesLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load zones', err);
        setZonesLoaded(true);
      });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cpList, sum, logList, passList] = await Promise.all([
        checkpointService.getCheckpoints(),
        checkpointService.getSummaryStats(),
        checkpointService.getLogs({
          limit: 100,
          zoneId: selectedZoneId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        epassService.getEPasses({ status: 'ACTIVE' }),
      ]);
      setCheckpoints(cpList);
      setSummary(sum);
      setLogs(logList);
      setActivePasses(passList);
      if (cpList.length > 0 && !selectedCpId) {
        setSelectedCpId(cpList[0].id);
        // Default GPS to the selected checkpoint coordinates for convenience
        const coords = cpList[0].location.coordinates as [number, number];
        setCurrentGps(coords);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Failed to load checkpoint data');
    } finally {
      setLoading(false);
    }
  }, [selectedCpId, selectedZoneId, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheckpointChange = (cpId: string) => {
    setSelectedCpId(cpId);
    setVerifyResult(null);
    setVerifyError(null);
    setPassageSuccessMessage(null);
    const cp = checkpoints.find((c) => c.id === cpId);
    if (cp && cp.location?.coordinates) {
      setCurrentGps(cp.location.coordinates as [number, number]);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCpId || !scanInput.trim()) return;

    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    setPassageSuccessMessage(null);

    const isJson = scanInput.trim().startsWith('{');

    try {
      const res = await checkpointService.verifyEPass({
        checkpointId: selectedCpId,
        qrPayload: isJson ? scanInput.trim() : undefined,
        passNumber: !isJson ? scanInput.trim() : undefined,
        currentLocation: gpsEnabled && currentGps ? currentGps : undefined,
        declaredQuantityTonnes: declaredTonnage ? parseFloat(declaredTonnage) : undefined,
      });
      setVerifyResult(res);
      // Refresh summary and logs
      const [sum, logList] = await Promise.all([
        checkpointService.getSummaryStats(),
        checkpointService.getLogs({ limit: 100 }),
      ]);
      setSummary(sum);
      setLogs(logList);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setVerifyError(e?.response?.data?.message || e?.message || 'Verification failed unexpectedly');
    } finally {
      setVerifying(false);
    }
  };

  const handleRecordPassage = async () => {
    if (!selectedCpId || !verifyResult?.epass) return;

    setRecordingPassage(true);
    setPassageSuccessMessage(null);

    try {
      const res = await checkpointService.recordPassage({
        checkpointId: selectedCpId,
        passNumberOrId: verifyResult.epass.passNumber,
        currentLocation: gpsEnabled && currentGps ? currentGps : undefined,
        declaredQuantityTonnes: declaredTonnage ? parseFloat(declaredTonnage) : undefined,
        notes: 'Transit passage recorded and verified by checkpoint officer',
      });
      setPassageSuccessMessage(res.message);
      // Update result epass status
      setVerifyResult({
        ...verifyResult,
        epass: res.epass,
      });
      // Refresh logs
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert(e?.response?.data?.message || e?.message || 'Failed to record passage');
    } finally {
      setRecordingPassage(false);
    }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const lng = parseFloat(cpFormData.longitude);
    const lat = parseFloat(cpFormData.latitude);
    const radius = parseFloat(cpFormData.geofenceRadiusMeters);

    if (!cpFormData.name || isNaN(lng) || isNaN(lat)) {
      alert('Please fill out all required fields with valid coordinates');
      return;
    }

    try {
      setCpSubmitting(true);
      await checkpointService.createCheckpoint({
        name: cpFormData.name.trim(),
        district: cpFormData.district.trim(),
        location: { type: 'Point', coordinates: [lng, lat] },
        geofenceRadiusMeters: radius,
        status: CheckpointStatus.ACTIVE,
        operatingHours: cpFormData.operatingHours,
      });
      setShowCpModal(false);
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert(e?.response?.data?.message || e?.message || 'Failed to create checkpoint');
    } finally {
      setCpSubmitting(false);
    }
  };

  const selectedCheckpoint = checkpoints.find((c) => c.id === selectedCpId);


  return (
    <div style={{ padding: SPACE.xl, maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Checkpoint Surveillance & Enforcement"
        subtitle="Live border checkpoint verification, physical vehicle passage logs, weighbridge audits, and transit violations."
        actions={
          canCreateCheckpoint ? (
            <button
              onClick={() => setShowCpModal(true)}
              style={{
                backgroundColor: COLORS.primary,
                color: '#ECFDF5',
                border: 'none',
                borderRadius: RADII.md,
                padding: '10px 18px',
                fontSize: FONT.sizeMd,
                fontWeight: FONT.weightMedium,
                cursor: 'pointer',
                boxShadow: SHADOWS.sm,
                display: 'flex',
                alignItems: 'center',
                gap: SPACE.sm,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Checkpoint
            </button>
          ) : undefined
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

      {/* Filter Toolbar */}
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
          alignItems: 'flex-end',
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
      </div>

      {/* KPI Stats */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: SPACE.md,
            marginBottom: SPACE.xl,
          }}
        >
          <StatCard
            label="Total Checkpoints"
            value={summary.totalCheckpoints.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M5 21V7l8-4v18M13 7l6 3v11" />
              </svg>
            }
          />
          <StatCard
            label="Active Checkpoints"
            value={summary.activeCheckpoints.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            }
          />
          <StatCard
            label="Total Scans / Verifications"
            value={summary.totalVerifications.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            }
          />
          <StatCard
            label="Valid Authorized Transits"
            value={summary.validVerifications.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
          />
          <StatCard
            label="Rejected Violations"
            value={summary.invalidVerifications.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            }
          />
          <StatCard
            label="Total Minerals Cleared"
            value={`${summary.totalTonnagePassed.toFixed(1)} t`}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              </svg>
            }
          />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: SPACE.sm, marginBottom: SPACE.lg, borderBottom: '1px solid #E2E8F0' }}>
        <button
          onClick={() => setActiveTab('VERIFY')}
          style={{
            padding: '10px 20px',
            fontSize: FONT.sizeMd,
            fontWeight: activeTab === 'VERIFY' ? FONT.weightBold : FONT.weightMedium,
            color: activeTab === 'VERIFY' ? COLORS.primary : COLORS.textMuted,
            borderBottom: activeTab === 'VERIFY' ? `3px solid ${COLORS.primary}` : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Checkpoint Workstation
        </button>
        <button
          onClick={() => setActiveTab('LOGS')}
          style={{
            padding: '10px 20px',
            fontSize: FONT.sizeMd,
            fontWeight: activeTab === 'LOGS' ? FONT.weightBold : FONT.weightMedium,
            color: activeTab === 'LOGS' ? COLORS.primary : COLORS.textMuted,
            borderBottom: activeTab === 'LOGS' ? `3px solid ${COLORS.primary}` : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          Verification Audit Logs ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab('REGISTRY')}
          style={{
            padding: '10px 20px',
            fontSize: FONT.sizeMd,
            fontWeight: activeTab === 'REGISTRY' ? FONT.weightBold : FONT.weightMedium,
            color: activeTab === 'REGISTRY' ? COLORS.primary : COLORS.textMuted,
            borderBottom: activeTab === 'REGISTRY' ? `3px solid ${COLORS.primary}` : '3px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="22"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
          Checkpoint Registry ({checkpoints.length})
        </button>
      </div>

      {loading ? (
        <Loading message="Loading checkpoint enforcement data..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <>
          {/* ── TAB 1: VERIFY WORKSTATION ── */}
          {activeTab === 'VERIFY' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: SPACE.xl }}>
              {/* Left Column: Verification Form */}
              <div>
                <div
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: RADII.lg,
                    boxShadow: SHADOWS.sm,
                    border: '1px solid #E2E8F0',
                    padding: SPACE.xl,
                    marginBottom: SPACE.lg,
                  }}
                >
                  <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, marginBottom: SPACE.md }}>
                    Active Enforcement Post
                  </h3>

                  <div style={{ marginBottom: SPACE.md }}>
                    <label style={formLbl}>Select Checkpoint *</label>
                    <select
                      style={formInp}
                      value={selectedCpId}
                      onChange={(e) => handleCheckpointChange(e.target.value)}
                    >
                      {checkpoints.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.district}) — {c.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedCheckpoint && (
                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: RADII.md,
                        padding: SPACE.md,
                        fontSize: FONT.sizeSm,
                        marginBottom: SPACE.lg,
                        border: '1px solid #E2E8F0',
                      }}
                    >
                      <div><strong>Location:</strong> {selectedCheckpoint.location.coordinates[1].toFixed(4)}°N, {selectedCheckpoint.location.coordinates[0].toFixed(4)}°E</div>
                      <div><strong>Geofence Radius:</strong> {selectedCheckpoint.geofenceRadiusMeters} meters</div>
                      <div><strong>Operating Hours:</strong> {selectedCheckpoint.operatingHours || '24/7'}</div>
                    </div>
                  )}

                  <form onSubmit={handleVerifySubmit}>
                    <div style={{ marginBottom: SPACE.md }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label style={{ ...formLbl, marginBottom: 0 }}>Scan QR Code Payload or Enter E-Pass Number *</label>
                        {activePasses.length > 0 && (
                          <span style={{ fontSize: '11px', color: COLORS.textMuted }}>
                            {activePasses.length} active passes in transit
                          </span>
                        )}
                      </div>

                      {activePasses.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, padding: '6px 8px', backgroundColor: '#F8FAFC', borderRadius: RADII.sm, border: '1px solid #E2E8F0' }}>
                          <span style={{ fontSize: '11px', color: COLORS.textMuted, alignSelf: 'center' }}>Quick Select:</span>
                          {activePasses.slice(0, 4).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setScanInput(p.qrPayload || p.passNumber);
                                setDeclaredTonnage(p.netWeightTonnes.toString());
                              }}
                              style={{
                                padding: '3px 8px',
                                borderRadius: RADII.sm,
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontFamily: 'monospace',
                                color: COLORS.primary,
                              }}
                              title={`Load pass ${p.passNumber} (${p.mineralType})`}
                            >
                              {p.passNumber} ({p.netWeightTonnes}t)
                            </button>
                          ))}
                        </div>
                      )}

                      <textarea
                        rows={4}
                        style={{ ...formInp, fontFamily: 'monospace', fontSize: FONT.sizeSm }}
                        placeholder='Paste full canonical QR JSON or enter pass number e.g. "EP-2026-10492812"'
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        required
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md, marginBottom: SPACE.md }}>
                      <div>
                        <label style={formLbl}>Weighbridge Declared Weight (t)</label>
                        <input
                          type="number"
                          step="0.1"
                          style={formInp}
                          placeholder="e.g. 24.5"
                          value={declaredTonnage}
                          onChange={(e) => setDeclaredTonnage(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={formLbl}>Geolocation Check</label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '38px', gap: SPACE.sm }}>
                          <input
                            type="checkbox"
                            id="gpsToggle"
                            checked={gpsEnabled}
                            onChange={(e) => setGpsEnabled(e.target.checked)}
                          />
                          <label htmlFor="gpsToggle" style={{ fontSize: FONT.sizeSm, cursor: 'pointer' }}>
                            Validate GPS Geofence
                          </label>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={verifying || !scanInput.trim()}
                      style={{
                        width: '100%',
                        backgroundColor: COLORS.primary,
                        color: '#ECFDF5',
                        border: 'none',
                        borderRadius: RADII.md,
                        padding: '12px',
                        fontSize: FONT.sizeMd,
                        fontWeight: FONT.weightBold,
                        cursor: verifying || !scanInput.trim() ? 'not-allowed' : 'pointer',
                        boxShadow: SHADOWS.sm,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: SPACE.sm,
                      }}
                    >
                      {verifying ? (
                        'Auditing Credentials & Cryptographic Signature...'
                      ) : (
                        <>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                          </svg>
                          Inspect & Verify Transit Pass
                        </>
                      )}
                    </button>
                  </form>

                  {verifyError && (
                    <div
                      style={{
                        backgroundColor: '#FEE2E2',
                        border: '1px solid #F87171',
                        color: '#991B1B',
                        padding: SPACE.md,
                        borderRadius: RADII.md,
                        fontSize: FONT.sizeSm,
                        marginTop: SPACE.md,
                      }}
                    >
                      {verifyError}
                    </div>
                  )}

                  {passageSuccessMessage && (
                    <div
                      style={{
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #10B981',
                        color: '#065F46',
                        padding: SPACE.md,
                        borderRadius: RADII.md,
                        fontSize: FONT.sizeSm,
                        marginTop: SPACE.md,
                        fontWeight: FONT.weightMedium,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      <span>{passageSuccessMessage}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Verification Results Display */}
              <div>
                {!verifyResult ? (
                  <div
                    style={{
                      backgroundColor: COLORS.surface,
                      borderRadius: RADII.lg,
                      border: '2px dashed #CBD5E1',
                      padding: SPACE['2xl'],
                      textAlign: 'center',
                      color: COLORS.textMuted,
                      minHeight: '400px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    <h4 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, marginTop: SPACE.md }}>
                      Awaiting Scan
                    </h4>
                    <p style={{ fontSize: FONT.sizeSm, maxWidth: '350px', marginTop: SPACE.xs }}>
                      Scan a digital E-Pass QR code or enter a pass number to perform live multi-attribute enforcement verification.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: COLORS.surface,
                      borderRadius: RADII.lg,
                      boxShadow: SHADOWS.md,
                      border: `2px solid ${
                        verifyResult.result === CheckpointVerificationResult.VALID ? '#10B981' : '#EF4444'
                      }`,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header Banner */}
                    <div
                      style={{
                        padding: SPACE.lg,
                        backgroundColor:
                          verifyResult.result === CheckpointVerificationResult.VALID ? '#ECFDF5' : '#FEF2F2',
                        borderBottom: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: FONT.sizeXs, textTransform: 'uppercase', letterSpacing: '0.05em', color: COLORS.textMuted }}>
                          Enforcement Decision
                        </div>
                        <div
                          style={{
                            fontSize: FONT.size2xl,
                            fontWeight: FONT.weightBold,
                            color:
                              verifyResult.result === CheckpointVerificationResult.VALID ? '#065F46' : '#991B1B',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {verifyResult.result === CheckpointVerificationResult.VALID ? (
                              <>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                <span>VALID TRANSIT AUTHORIZED</span>
                              </>
                            ) : (
                              <>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                <span>TRANSIT REJECTED</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <StatusBadge
                        label={verifyResult.result}
                        variant={RESULT_VARIANTS[verifyResult.result]}
                      />
                    </div>

                    <div style={{ padding: SPACE.xl }}>
                      {/* Rejection Reasons if invalid */}
                      {verifyResult.rejectionReasons.length > 0 && (
                        <div
                          style={{
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #F87171',
                            borderRadius: RADII.md,
                            padding: SPACE.md,
                            marginBottom: SPACE.lg,
                          }}
                        >
                          <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: '#991B1B', marginBottom: SPACE.xs }}>
                            Violations & Rejection Reasons:
                          </div>
                          <ul style={{ margin: 0, paddingLeft: SPACE.lg, fontSize: FONT.sizeSm, color: '#B91C1C' }}>
                            {verifyResult.rejectionReasons.map((r, i) => (
                              <li key={i}>{r.replace(/_/g, ' ')}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Integrity Badges */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          gap: SPACE.sm,
                          marginBottom: SPACE.lg,
                        }}
                      >
                        <div
                          style={{
                            padding: SPACE.sm,
                            borderRadius: RADII.sm,
                            backgroundColor: verifyResult.signatureVerified ? '#ECFDF5' : '#F1F5F9',
                            border: '1px solid #E2E8F0',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>HMAC-SHA256 Sig</div>
                          <strong style={{ fontSize: FONT.sizeSm, color: verifyResult.signatureVerified ? '#065F46' : '#64748B' }}>
                            {verifyResult.signatureVerified ? 'AUTHENTIC' : 'NOT SIGNED'}
                          </strong>
                        </div>

                        <div
                          style={{
                            padding: SPACE.sm,
                            borderRadius: RADII.sm,
                            backgroundColor: verifyResult.hashVerified ? '#ECFDF5' : '#F1F5F9',
                            border: '1px solid #E2E8F0',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>SHA-256 Hash</div>
                          <strong style={{ fontSize: FONT.sizeSm, color: verifyResult.hashVerified ? '#065F46' : '#64748B' }}>
                            {verifyResult.hashVerified ? 'MATCHED' : 'UNVERIFIED'}
                          </strong>
                        </div>

                        <div
                          style={{
                            padding: SPACE.sm,
                            borderRadius: RADII.sm,
                            backgroundColor:
                              verifyResult.locationStatus === LocationVerificationStatus.VERIFIED_LOCATION
                                ? '#ECFDF5'
                                : '#FEF2F2',
                            border: '1px solid #E2E8F0',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Geofence</div>
                          <strong
                            style={{
                              fontSize: FONT.sizeSm,
                              color:
                                verifyResult.locationStatus === LocationVerificationStatus.VERIFIED_LOCATION
                                  ? '#065F46'
                                  : '#991B1B',
                            }}
                          >
                            {verifyResult.locationStatus.replace(/_/g, ' ')}
                          </strong>
                        </div>
                      </div>

                      {/* E-Pass Details */}
                      {verifyResult.epass && (
                        <div
                          style={{
                            borderTop: '1px solid #E2E8F0',
                            paddingTop: SPACE.md,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: SPACE.sm,
                            fontSize: FONT.sizeSm,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: COLORS.textMuted }}>Pass Number:</span>
                            <strong>{verifyResult.epass.passNumber}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: COLORS.textMuted }}>Status:</span>
                            <span style={{ fontWeight: FONT.weightBold }}>{verifyResult.epass.status}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: COLORS.textMuted }}>Mineral & Authorized Weight:</span>
                            <span>
                              {verifyResult.epass.mineralType} — <strong>{verifyResult.epass.netWeightTonnes} Tonnes</strong>
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: COLORS.textMuted }}>Mining Permit:</span>
                            <span>{verifyResult.epass.permitNumber || 'N/A'} ({verifyResult.epass.lesseeName})</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: COLORS.textMuted }}>Vehicle Registration:</span>
                            <strong>{verifyResult.epass.vehicleRegistrationNumber || 'N/A'}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: COLORS.textMuted }}>Driver Name:</span>
                            <span>{verifyResult.epass.driverName} (Lic: {verifyResult.epass.driverLicenseNumber})</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: COLORS.textMuted }}>Validity Window:</span>
                            <span>
                              {new Date(verifyResult.epass.validFrom).toLocaleTimeString()} to{' '}
                              {new Date(verifyResult.epass.validUntil).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Passage Confirmation Action */}
                      {verifyResult.result === CheckpointVerificationResult.VALID &&
                        verifyResult.epass?.status === 'ACTIVE' && (
                          <button
                            onClick={handleRecordPassage}
                            disabled={recordingPassage}
                            style={{
                              marginTop: SPACE.xl,
                              width: '100%',
                              backgroundColor: '#10B981',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: RADII.md,
                              padding: '12px',
                              fontSize: FONT.sizeMd,
                              fontWeight: FONT.weightBold,
                              cursor: recordingPassage ? 'not-allowed' : 'pointer',
                              boxShadow: SHADOWS.md,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: SPACE.sm,
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {recordingPassage ? 'Recording Passage...' : 'Clear Vehicle & Confirm Transit Passage (Mark USED)'}
                          </button>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: AUDIT LOGS ── */}
          {activeTab === 'LOGS' && (
            <div>
              {/* Filter Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACE.md,
                  marginBottom: SPACE.lg,
                  flexWrap: 'wrap',
                }}
              >
                <select
                  value={logFilterResult}
                  onChange={(e) => setLogFilterResult(e.target.value as CheckpointVerificationResult)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: RADII.md,
                    border: `1px solid #CBD5E1`,
                    backgroundColor: COLORS.surface,
                    fontSize: FONT.sizeSm,
                  }}
                >
                  <option value="ALL">All Verification Results</option>
                  <option value={CheckpointVerificationResult.VALID}>VALID Only</option>
                  <option value={CheckpointVerificationResult.INVALID}>INVALID (Violations) Only</option>
                </select>

                <input
                  type="text"
                  placeholder="Filter by pass number..."
                  style={{ ...formInp, maxWidth: '250px' }}
                  value={logSearchPass}
                  onChange={(e) => setLogSearchPass(e.target.value)}
                />

                <button
                  onClick={fetchData}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADII.md,
                    border: `1px solid #CBD5E1`,
                    backgroundColor: COLORS.surface,
                    fontSize: FONT.sizeSm,
                    cursor: 'pointer',
                  }}
                >
                  Refresh Logs
                </button>
              </div>

              {logs.length === 0 ? (
                <EmptyState
                  title="No Checkpoint Logs Recorded"
                  description="No transit verification attempts logged yet."
                />
              ) : (
                <div
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: RADII.lg,
                    boxShadow: SHADOWS.sm,
                    border: '1px solid #E2E8F0',
                    overflowX: 'auto',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Timestamp</th>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Checkpoint</th>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Pass #</th>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Vehicle / Driver</th>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Tonnage</th>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Result</th>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Geofence</th>
                        <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Notes / Reasons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs
                        .filter((l) =>
                          logFilterResult === 'ALL' ? true : l.verificationResult === logFilterResult,
                        )
                        .filter((l) =>
                          logSearchPass ? l.passNumber.toLowerCase().includes(logSearchPass.toLowerCase()) : true,
                        )
                        .map((l) => (
                          <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                              {new Date(l.verificationTimestamp).toLocaleString()}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium }}>
                              {l.checkpointName}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontFamily: 'monospace', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                              {l.passNumber}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                              <div>{l.vehicleRegistrationNumber || 'N/A'}</div>
                              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{l.driverName || 'N/A'}</div>
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                              <strong>{l.authorizedQuantityTonnes || l.declaredQuantityTonnes || 0} t</strong>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <StatusBadge
                                label={l.verificationResult}
                                variant={RESULT_VARIANTS[l.verificationResult]}
                              />
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs }}>
                              {l.locationStatus.replace(/_/g, ' ')}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs, color: COLORS.textMuted, maxWidth: '200px' }}>
                              {l.rejectionReasons.length > 0 ? (
                                <span style={{ color: '#DC2626' }}>{l.rejectionReasons.join(', ')}</span>
                              ) : (
                                l.notes || 'Verified'
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: CHECKPOINT REGISTRY ── */}
          {activeTab === 'REGISTRY' && (
            <div
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: RADII.lg,
                boxShadow: SHADOWS.sm,
                border: '1px solid #E2E8F0',
                overflowX: 'auto',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Checkpoint ID</th>
                    <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Name</th>
                    <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>District</th>
                    <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Coordinates</th>
                    <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Geofence Radius</th>
                    <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Hours</th>
                    <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                        {c.checkpointId}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium }}>
                        {c.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>{c.district}</td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs, fontFamily: 'monospace' }}>
                        {c.location.coordinates[1].toFixed(4)}°N, {c.location.coordinates[0].toFixed(4)}°E
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>{c.geofenceRadiusMeters} m</td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                        {c.operatingHours || '24/7'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge label={c.status} variant={STATUS_VARIANTS[c.status]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Add Checkpoint Modal ── */}
      {showCpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
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
              borderRadius: RADII.xl,
              boxShadow: SHADOWS.lg,
              maxWidth: '550px',
              width: '100%',
              padding: SPACE['2xl'],
            }}
          >
            <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, marginBottom: SPACE.md }}>
              Add Border Checkpoint
            </h2>

            <form onSubmit={handleCreateCheckpoint} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              <div>
                <label style={formLbl}>Checkpoint Name *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. Walayar Forest Border Checkpoint #1"
                  value={cpFormData.name}
                  onChange={(e) => setCpFormData({ ...cpFormData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={formLbl}>District *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. Coimbatore"
                  value={cpFormData.district}
                  onChange={(e) => setCpFormData({ ...cpFormData, district: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                <div>
                  <label style={formLbl}>Longitude (°E) *</label>
                  <input
                    type="number"
                    step="0.0001"
                    style={formInp}
                    value={cpFormData.longitude}
                    onChange={(e) => setCpFormData({ ...cpFormData, longitude: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={formLbl}>Latitude (°N) *</label>
                  <input
                    type="number"
                    step="0.0001"
                    style={formInp}
                    value={cpFormData.latitude}
                    onChange={(e) => setCpFormData({ ...cpFormData, latitude: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                <div>
                  <label style={formLbl}>Geofence Radius (meters)</label>
                  <input
                    type="number"
                    style={formInp}
                    value={cpFormData.geofenceRadiusMeters}
                    onChange={(e) => setCpFormData({ ...cpFormData, geofenceRadiusMeters: e.target.value })}
                  />
                </div>
                <div>
                  <label style={formLbl}>Operating Hours</label>
                  <input
                    type="text"
                    style={formInp}
                    value={cpFormData.operatingHours}
                    onChange={(e) => setCpFormData({ ...cpFormData, operatingHours: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md, marginTop: SPACE.lg }}>
                <button
                  type="button"
                  onClick={() => setShowCpModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: RADII.md,
                    border: '1px solid #CBD5E1',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cpSubmitting}
                  style={{
                    padding: '8px 20px',
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.primary,
                    color: '#ECFDF5',
                    border: 'none',
                    fontWeight: FONT.weightMedium,
                    cursor: cpSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {cpSubmitting ? 'Creating...' : 'Register Checkpoint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckpointEnforcementPage;
