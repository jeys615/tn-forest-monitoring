import React, { useState, useEffect, useCallback } from 'react';
import { epassService } from '../../services/epass.service';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import {
  EPassStatus,
  Permission,
  type EPassDto,
  type EPassSummaryDto,
  type MiningAuthorizationDto,
  type VehicleDto,
  type DriverDto,
  type ZoneDto,
  type CheckpointDto,
} from '@tn-forest/shared/types';
import { zoneService } from '../../services/zone.service';
import { checkpointService } from '../../services/checkpoint.service';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';

import { DateRangeFilter } from '../../components/common/DateRangeFilter';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

const STATUS_VARIANTS: Record<EPassStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  [EPassStatus.DRAFT]: 'neutral',
  [EPassStatus.ACTIVE]: 'success',
  [EPassStatus.USED]: 'info',
  [EPassStatus.EXPIRED]: 'warning',
  [EPassStatus.CANCELLED]: 'danger',
  [EPassStatus.REVOKED]: 'danger',
};

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

export const EPassPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [epasses, setEpasses] = useState<EPassDto[]>([]);
  const [summary, setSummary] = useState<EPassSummaryDto | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

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

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedPass, setSelectedPass] = useState<EPassDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Dropdown data for creation
  const [authorizations, setAuthorizations] = useState<MiningAuthorizationDto[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointDto[]>([]);
  const [customCheckpoint, setCustomCheckpoint] = useState('');

  // Creation form state
  const [formData, setFormData] = useState({
    authorizationId: '',
    vehicleId: '',
    driverId: '',
    netWeightTonnes: '',
    destinationCheckpoint: '',
    sourceLocation: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canCreate =
    user?.permissions.includes(Permission.EPASS_CREATE) ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    user?.role === 'MINING_OFFICER' ||
    user?.role === 'FOREST_OFFICER';

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
      const filters: Record<string, string> = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (selectedZoneId) filters.zoneId = selectedZoneId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const [list, sum] = await Promise.all([
        epassService.getEPasses(Object.keys(filters).length > 0 ? filters : undefined),
        epassService.getSummaryStats(),
      ]);
      setEpasses(list);
      setSummary(sum);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Failed to load E-Pass data');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedZoneId, startDate, endDate]);

  const loadDropdowns = async () => {
    try {
      const [auths, vechs, drvs, cps] = await Promise.all([
        epassService.getAuthorizations({ status: 'ACTIVE' }),
        epassService.getVehicles({ status: 'ACTIVE' }),
        epassService.getDrivers({ verificationStatus: 'VERIFIED' }),
        checkpointService.getCheckpoints(),
      ]);
      setAuthorizations(auths);
      setVehicles(vechs);
      setDrivers(drvs);
      const activeCps = cps.filter((c) => c.status === 'ACTIVE');
      setCheckpoints(activeCps);
      if (activeCps.length > 0 && !formData.destinationCheckpoint) {
        setFormData((prev) => ({
          ...prev,
          destinationCheckpoint: `${activeCps[0].name} (${activeCps[0].district})`,
        }));
      }
    } catch {
      setFormError('Failed to load fleet and authorization prerequisites');
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenCreate = () => {
    setFormError(null);
    setCustomCheckpoint('');
    setFormData({
      authorizationId: '',
      vehicleId: '',
      driverId: '',
      netWeightTonnes: '',
      destinationCheckpoint: '',
      sourceLocation: '',
    });
    loadDropdowns();
    setShowCreateModal(true);
  };

  const handleAuthorizationSelect = (authId: string) => {
    const auth = authorizations.find((a) => a.id === authId);
    setFormData((prev) => ({
      ...prev,
      authorizationId: authId,
      sourceLocation: auth ? `${auth.lesseeName} Lease Site (${auth.mineralType})` : prev.sourceLocation,
    }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const weight = parseFloat(formData.netWeightTonnes);

    const effectiveCheckpoint =
      formData.destinationCheckpoint === 'CUSTOM'
        ? customCheckpoint.trim()
        : formData.destinationCheckpoint.trim();

    if (!formData.authorizationId || !formData.vehicleId || !formData.driverId || isNaN(weight) || weight <= 0) {
      setFormError('Please fill out all required fields with valid positive values');
      return;
    }

    if (!effectiveCheckpoint) {
      setFormError('Please select or specify a destination enforcement checkpoint');
      return;
    }

    const selectedAuth = authorizations.find((a) => a.id === formData.authorizationId);
    if (selectedAuth && weight > selectedAuth.remainingQuota) {
      setFormError(`Requested weight (${weight}t) exceeds permit remaining quota (${selectedAuth.remainingQuota}t)`);
      return;
    }

    const selectedVehicle = vehicles.find((v) => v.id === formData.vehicleId);
    if (selectedVehicle && weight > selectedVehicle.permittedCarryingCapacity) {
      setFormError(`Requested weight (${weight}t) exceeds vehicle capacity (${selectedVehicle.permittedCarryingCapacity}t)`);
      return;
    }

    try {
      setSubmitting(true);
      await epassService.createEPass({
        authorizationId: formData.authorizationId,
        vehicleId: formData.vehicleId,
        driverId: formData.driverId,
        netWeightTonnes: weight,
        destinationCheckpoint: effectiveCheckpoint,
        sourceLocation: formData.sourceLocation,
      });
      setShowCreateModal(false);
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setFormError(e?.response?.data?.message || e?.message || 'Failed to generate E-Pass');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPass = async () => {
    if (!selectedPass) return;
    try {
      setSubmitting(true);
      await epassService.cancelEPass(selectedPass.id, cancelReason || 'Cancelled by authorized officer');
      setShowCancelModal(false);
      setSelectedPass(null);
      setCancelReason('');
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert(e?.response?.data?.message || e?.message || 'Failed to cancel E-Pass');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div style={{ padding: SPACE.xl, maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Transit E-Pass System"
        subtitle="Digital transit passes, authorized transport routes, QR verification, and mineral quota validation."
        actions={
          canCreate ? (
            <button
              onClick={handleOpenCreate}
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
              Issue Digital E-Pass
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
            label="Total Passes Issued"
            value={summary.totalIssued.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
              </svg>
            }
          />
          <StatCard
            label="Active In-Transit"
            value={summary.activeCount.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
          />
          <StatCard
            label="Verified & Used"
            value={summary.usedCount.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
          />
          <StatCard
            label="Cancelled / Revoked"
            value={summary.cancelledCount.toString()}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            }
          />
          <StatCard
            label="Total Transported"
            value={`${summary.totalTransportedTonnes.toFixed(1)} t`}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
              </svg>
            }
          />
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: SPACE.md,
          marginBottom: SPACE.lg,
          flexWrap: 'wrap',
          padding: SPACE.md,
          backgroundColor: COLORS.surface,
          borderRadius: RADII.lg,
          border: `1px solid ${COLORS.border}`,
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
          <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontWeight: FONT.weightSemibold }}>
            STATUS
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: RADII.md,
              border: `1px solid #CBD5E1`,
              backgroundColor: COLORS.surface,
              fontSize: FONT.sizeSm,
              color: COLORS.text,
              outline: 'none',
            }}
          >
            <option value="ALL">All Statuses</option>
            {Object.values(EPassStatus).map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
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
          Refresh Registry
        </button>
      </div>

      {/* Main Table */}
      {loading ? (
        <Loading message="Loading E-Pass registry..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : epasses.length === 0 ? (
        <EmptyState
          title="No E-Passes Found"
          description="No digital passes match the selected criteria. Issue an E-Pass to begin transport tracking."
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
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Pass Number</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Permit / Lease</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Vehicle Reg</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Driver</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Mineral / Weight</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Destination Checkpoint</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Validity</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {epasses.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                    {p.passNumber}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                    {p.permitNumber || p.lesseeName || 'Permit Lease'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium }}>
                    {p.vehicleRegistrationNumber || 'XX-00-XXXX'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                    {p.driverName || 'Verified Driver'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                    <strong>{p.netWeightTonnes} t</strong> ({p.mineralType})
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                    {p.destinationCheckpoint}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {new Date(p.validUntil).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge label={p.status} variant={STATUS_VARIANTS[p.status]} />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => {
                        setSelectedPass(p);
                        setShowDetailModal(true);
                      }}
                      style={{
                        backgroundColor: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        borderRadius: RADII.sm,
                        padding: '4px 8px',
                        fontSize: FONT.sizeSm,
                        cursor: 'pointer',
                        marginRight: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                      QR Code
                    </button>
                    {p.status === EPassStatus.ACTIVE && canCreate && (
                      <button
                        onClick={() => {
                          setSelectedPass(p);
                          setShowCancelModal(true);
                        }}
                        style={{
                          backgroundColor: '#FEE2E2',
                          color: '#DC2626',
                          border: '1px solid #FCA5A5',
                          borderRadius: RADII.sm,
                          padding: '4px 8px',
                          fontSize: FONT.sizeSm,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Generate E-Pass Modal ── */}
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
            padding: SPACE.md,
          }}
        >
          <div
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: RADII.xl,
              boxShadow: SHADOWS.lg,
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: SPACE['2xl'],
            }}
          >
            <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, marginBottom: SPACE.md }}>
              Issue Digital Transit E-Pass
            </h2>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.lg }}>
              E-Passes atomically reserve authorized mineral quota and issue cryptographically verifiable QR security tokens.
            </p>

            {formError && (
              <div
                style={{
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #F87171',
                  color: '#991B1B',
                  padding: SPACE.md,
                  borderRadius: RADII.md,
                  fontSize: FONT.sizeSm,
                  marginBottom: SPACE.md,
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {/* Mining Authorization Selection */}
              <div>
                <label style={formLbl}>Select Active Mining Authorization / Permit *</label>
                <select
                  style={formInp}
                  value={formData.authorizationId}
                  onChange={(e) => handleAuthorizationSelect(e.target.value)}
                  required
                >
                  <option value="">-- Choose Permit Lease --</option>
                  {authorizations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.permitNumber} ({a.lesseeName} — {a.mineralType}) [Quota Left: {a.remainingQuota}t]
                    </option>
                  ))}
                </select>
                {formData.authorizationId && (
                  (() => {
                    const auth = authorizations.find((a) => a.id === formData.authorizationId);
                    if (!auth) return null;
                    return (
                      <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: 4 }}>
                        Permit remaining quota: <strong style={{ color: auth.remainingQuota > 10 ? '#059669' : '#DC2626' }}>{auth.remainingQuota.toLocaleString()} Tonnes</strong>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Vehicle Selection */}
              <div>
                <label style={formLbl}>Select Registered Vehicle *</label>
                <select
                  style={formInp}
                  value={formData.vehicleId}
                  onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                  required
                >
                  <option value="">-- Choose Vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registrationNumber} ({v.vehicleType}) [Max Capacity: {v.permittedCarryingCapacity}t]
                    </option>
                  ))}
                </select>
                {formData.vehicleId && (
                  (() => {
                    const v = vehicles.find((item) => item.id === formData.vehicleId);
                    if (!v) return null;
                    return (
                      <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: 4 }}>
                        Vehicle permitted carrying capacity: <strong style={{ color: '#047857' }}>{v.permittedCarryingCapacity} Tonnes</strong>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Driver Selection */}
              <div>
                <label style={formLbl}>Select Verified Driver *</label>
                <select
                  style={formInp}
                  value={formData.driverId}
                  onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
                  required
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (License: {d.licenseNumber}) — {d.verificationStatus}
                    </option>
                  ))}
                </select>
              </div>

              {/* Net Weight */}
              <div>
                <label style={formLbl}>Net Cargo Weight (Tonnes) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  style={formInp}
                  placeholder="e.g. 24.5"
                  value={formData.netWeightTonnes}
                  onChange={(e) => setFormData({ ...formData, netWeightTonnes: e.target.value })}
                  required
                />
                {(() => {
                  const weight = parseFloat(formData.netWeightTonnes);
                  if (isNaN(weight) || weight <= 0) return null;
                  const v = vehicles.find((item) => item.id === formData.vehicleId);
                  const a = authorizations.find((item) => item.id === formData.authorizationId);
                  const overVehicle = v && weight > v.permittedCarryingCapacity;
                  const overQuota = a && weight > a.remainingQuota;

                  if (overVehicle) {
                    return (
                      <div style={{ fontSize: '12px', color: '#DC2626', marginTop: 4, fontWeight: FONT.weightMedium }}>
                        ⚠️ Warning: Cargo weight ({weight}t) exceeds vehicle permitted capacity ({v.permittedCarryingCapacity}t)!
                      </div>
                    );
                  }
                  if (overQuota) {
                    return (
                      <div style={{ fontSize: '12px', color: '#DC2626', marginTop: 4, fontWeight: FONT.weightMedium }}>
                        ⚠️ Warning: Cargo weight ({weight}t) exceeds permit remaining quota ({a.remainingQuota}t)!
                      </div>
                    );
                  }
                  if (v && a) {
                    return (
                      <div style={{ fontSize: '11px', color: '#059669', marginTop: 4, fontWeight: FONT.weightMedium }}>
                        ✓ Cargo weight ({weight}t) is within vehicle capacity and permit quota.
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Destination Checkpoint */}
              <div>
                <label style={formLbl}>Destination Checkpoint *</label>
                {checkpoints.length > 0 ? (
                  <>
                    <select
                      style={formInp}
                      value={formData.destinationCheckpoint}
                      onChange={(e) => setFormData({ ...formData, destinationCheckpoint: e.target.value })}
                      required
                    >
                      <option value="">-- Select Active Checkpoint --</option>
                      {checkpoints.map((cp) => (
                        <option key={cp.id} value={`${cp.name} (${cp.district})`}>
                          {cp.name} ({cp.district})
                        </option>
                      ))}
                      <option value="CUSTOM">-- Other / Unlisted Checkpoint --</option>
                    </select>
                    {formData.destinationCheckpoint === 'CUSTOM' && (
                      <input
                        type="text"
                        style={{ ...formInp, marginTop: '8px' }}
                        placeholder="Specify destination post name"
                        value={customCheckpoint}
                        onChange={(e) => setCustomCheckpoint(e.target.value)}
                        required
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    style={formInp}
                    placeholder="e.g. Walayar Forest Enforcement Checkpoint #1"
                    value={formData.destinationCheckpoint}
                    onChange={(e) => setFormData({ ...formData, destinationCheckpoint: e.target.value })}
                    required
                  />
                )}
              </div>

              {/* Source Location */}
              <div>
                <label style={formLbl}>Source Location / Quarry Name</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. Salem Quarry Block B-4"
                  value={formData.sourceLocation}
                  onChange={(e) => setFormData({ ...formData, sourceLocation: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md, marginTop: SPACE.lg }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                  disabled={submitting}
                  style={{
                    padding: '8px 20px',
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.primary,
                    color: '#ECFDF5',
                    border: 'none',
                    fontWeight: FONT.weightMedium,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Signing & Issuing...' : 'Issue E-Pass'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View E-Pass QR Details Modal ── */}
      {showDetailModal && selectedPass && (
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
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'inline-block', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: RADII.lg, marginBottom: SPACE.md }}>
              <div
                style={{
                  width: '180px',
                  height: '180px',
                  margin: '0 auto',
                  backgroundColor: '#FFFFFF',
                  border: '2px dashed #94A3B8',
                  borderRadius: RADII.md,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                }}
              >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <circle cx="17.5" cy="17.5" r="2.5" />
                </svg>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: '6px' }}>
                  HMAC-SHA256 Signed QR
                </span>
              </div>
            </div>

            <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.primary }}>
              {selectedPass.passNumber}
            </h3>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.md }}>
              {selectedPass.permitNumber} — {selectedPass.netWeightTonnes}t {selectedPass.mineralType}
            </p>

            <div
              style={{
                backgroundColor: '#F8FAFC',
                padding: SPACE.md,
                borderRadius: RADII.md,
                textAlign: 'left',
                fontSize: FONT.sizeXs,
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                color: COLORS.textMuted,
                marginBottom: SPACE.md,
              }}
            >
              <div><strong>QR Hash:</strong> {selectedPass.qrCodeHash}</div>
              <div><strong>Signature:</strong> {selectedPass.digitalSignature.substring(0, 32)}...</div>
              <div><strong>Valid Until:</strong> {new Date(selectedPass.validUntil).toLocaleString()}</div>
            </div>

            <button
              onClick={() => {
                setShowDetailModal(false);
                setSelectedPass(null);
              }}
              style={{
                padding: '8px 24px',
                borderRadius: RADII.md,
                backgroundColor: COLORS.primary,
                color: '#ECFDF5',
                border: 'none',
                fontWeight: FONT.weightMedium,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Cancel Pass Modal ── */}
      {showCancelModal && selectedPass && (
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
              maxWidth: '450px',
              width: '100%',
              padding: SPACE['2xl'],
            }}
          >
            <h3 style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#DC2626', marginBottom: SPACE.sm }}>
              Cancel E-Pass {selectedPass.passNumber}?
            </h3>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.md }}>
              Cancelling this pass will mark it as CANCELLED and atomically restore <strong>{selectedPass.netWeightTonnes} tonnes</strong> of quota to authorization permit <strong>{selectedPass.permitNumber}</strong>.
            </p>
            <div style={{ marginBottom: SPACE.md }}>
              <label style={formLbl}>Reason for Cancellation</label>
              <textarea
                style={{ ...formInp, minHeight: '80px' }}
                placeholder="e.g. Transport vehicle breakdown, incorrect cargo weight entry"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md }}>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setSelectedPass(null);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: RADII.md,
                  border: '1px solid #CBD5E1',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleCancelPass}
                disabled={submitting}
                style={{
                  padding: '8px 20px',
                  borderRadius: RADII.md,
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: FONT.weightMedium,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EPassPage;
