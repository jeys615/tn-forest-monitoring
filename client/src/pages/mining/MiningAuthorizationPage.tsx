import React, { useState, useEffect, useCallback } from 'react';
import { epassService } from '../../services/epass.service';
import { zoneService } from '../../services/zone.service';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import {
  MiningAuthorizationStatus,
  Permission,
  type MiningAuthorizationDto,
  type ZoneDto,
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

const STATUS_VARIANTS: Record<MiningAuthorizationStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  [MiningAuthorizationStatus.ACTIVE]: 'success',
  [MiningAuthorizationStatus.EXPIRED]: 'warning',
  [MiningAuthorizationStatus.SUSPENDED]: 'danger',
  [MiningAuthorizationStatus.REVOKED]: 'danger',
};

const STANDARD_MINERALS = [
  'Granite (Black / Multi-color)',
  'Rough Stone / Blue Metal',
  'Quartz / Feldspar',
  'River Sand / M-Sand',
  'Limestone',
  'Bauxite',
  'Timber / Forest Produce',
  'Gravel / Ordinary Earth',
  'Other',
];

export const MiningAuthorizationPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorizations, setAuthorizations] = useState<MiningAuthorizationDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

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

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    zoneId: '',
    permitNumber: '',
    lesseeName: '',
    mineralType: STANDARD_MINERALS[0],
    customMineral: '',
    permittedWeightTonnes: '',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canCreate =
    user?.permissions.includes(Permission.AREA_CREATE) ||
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
      const list = await epassService.getAuthorizations({
        zoneId: selectedZoneId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setAuthorizations(list);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Failed to load authorizations');
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = () => {
    setFormError(null);
    setFormData({
      zoneId: selectedZoneId || (zones.length > 0 ? zones[0].id : ''),
      permitNumber: '',
      lesseeName: '',
      mineralType: STANDARD_MINERALS[0],
      customMineral: '',
      permittedWeightTonnes: '',
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const weight = parseFloat(formData.permittedWeightTonnes);

    const effectiveMineral =
      formData.mineralType === 'Other'
        ? formData.customMineral.trim() || 'Other'
        : formData.mineralType;

    if (!formData.permitNumber.trim() || !formData.lesseeName.trim() || isNaN(weight) || weight <= 0) {
      setFormError('Please fill out all required fields with valid values');
      return;
    }

    if (new Date(formData.validUntil) <= new Date(formData.validFrom)) {
      setFormError('Permit validity end date must be after start date');
      return;
    }

    try {
      setSubmitting(true);
      await epassService.createAuthorization({
        zoneId: formData.zoneId || undefined,
        permitNumber: formData.permitNumber.trim().toUpperCase(),
        lesseeName: formData.lesseeName.trim(),
        mineralType: effectiveMineral,
        permittedWeightTonnes: weight,
        validFrom: new Date(formData.validFrom).toISOString(),
        validUntil: new Date(formData.validUntil).toISOString(),
      });
      setShowModal(false);
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setFormError(e?.response?.data?.message || e?.message || 'Failed to create mining permit');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAuthorizations = authorizations.filter((a) => {
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      a.permitNumber.toLowerCase().includes(q) ||
      a.lesseeName.toLowerCase().includes(q) ||
      a.mineralType.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: SPACE.xl, maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Mining Authorizations & Quota Registry"
        subtitle="Official mining permits, authorized extraction tonnage limits, validity windows, and remaining transport quotas."
        actions={
          canCreate ? (
            <button
              onClick={handleOpenModal}
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
              Add Mining Permit
            </button>
          ) : undefined
        }
      />

      {/* Zone Context Header */}
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
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'center', flexWrap: 'wrap' }}>
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

          <div>
            <select
              style={{ ...formInp, width: 'auto', minWidth: '130px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value={MiningAuthorizationStatus.ACTIVE}>Active</option>
              <option value={MiningAuthorizationStatus.EXPIRED}>Expired</option>
              <option value={MiningAuthorizationStatus.SUSPENDED}>Suspended</option>
              <option value={MiningAuthorizationStatus.REVOKED}>Revoked</option>
            </select>
          </div>
        </div>

        <div style={{ minWidth: '260px' }}>
          <input
            type="text"
            style={formInp}
            placeholder="Search by Permit #, Lessee..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Loading message="Loading mining authorizations..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : authorizations.length === 0 ? (
        <EmptyState
          title="No Mining Authorizations Found"
          description="No active permits or leases registered. Add a permit to enable transport E-Pass issuance."
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
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Permit Number</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Lessee Name</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Mineral Type</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Permitted Limit</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Remaining Quota</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Validity Period</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAuthorizations.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: COLORS.textMuted }}>
                    No mining authorizations match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredAuthorizations.map((a) => {
                  const pct = Math.max(0, Math.min(100, (a.remainingQuota / a.permittedWeightTonnes) * 100));
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                        {a.permitNumber}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium }}>{a.lesseeName}</td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                            fontSize: '12px',
                          }}
                        >
                          {a.mineralType}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                        <strong>{a.permittedWeightTonnes.toLocaleString()} Tonnes</strong>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                          <div
                            style={{
                              width: '80px',
                              height: '8px',
                              backgroundColor: '#E2E8F0',
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                backgroundColor: pct > 25 ? '#10B981' : '#EF4444',
                              }}
                            />
                          </div>
                          <span>
                            <strong>{a.remainingQuota.toLocaleString()} t</strong> ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                        {new Date(a.validFrom).toLocaleDateString()} to {new Date(a.validUntil).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge label={a.status} variant={STATUS_VARIANTS[a.status]} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Modal ── */}
      {showModal && (
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
              maxWidth: '560px',
              width: '100%',
              padding: SPACE['2xl'],
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, marginBottom: SPACE.xs }}>
              Add Mining Authorization Permit
            </h2>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.md }}>
              Authorize a mineral quarry or leaseholder with legal extraction quotas and validity dates.
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
              <div>
                <label style={formLbl}>Permit Number *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. TN-MIN-2026-088"
                  value={formData.permitNumber}
                  onChange={(e) => setFormData({ ...formData, permitNumber: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div>
                <label style={formLbl}>Lessee / Quarry Operator Name *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. Apex Mineral Quarries Ltd."
                  value={formData.lesseeName}
                  onChange={(e) => setFormData({ ...formData, lesseeName: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: SPACE.md }}>
                <div>
                  <label style={formLbl}>Mineral Type *</label>
                  <select
                    style={formInp}
                    value={formData.mineralType}
                    onChange={(e) => setFormData({ ...formData, mineralType: e.target.value })}
                  >
                    {STANDARD_MINERALS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {formData.mineralType === 'Other' && (
                    <input
                      type="text"
                      style={{ ...formInp, marginTop: '8px' }}
                      placeholder="Specify custom mineral name"
                      value={formData.customMineral}
                      onChange={(e) => setFormData({ ...formData, customMineral: e.target.value })}
                      required
                    />
                  )}
                </div>
                <div>
                  <label style={formLbl}>Permitted Limit (Tonnes) *</label>
                  <input
                    type="number"
                    style={formInp}
                    placeholder="e.g. 50000"
                    value={formData.permittedWeightTonnes}
                    onChange={(e) => setFormData({ ...formData, permittedWeightTonnes: e.target.value })}
                    required
                  />
                </div>
              </div>

              {zones.length > 0 && (
                <div>
                  <label style={formLbl}>Associated Monitored Zone (Optional)</label>
                  <select
                    style={formInp}
                    value={formData.zoneId}
                    onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
                  >
                    <option value="">-- No Specific Zone Boundary --</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                <div>
                  <label style={formLbl}>Valid From *</label>
                  <input
                    type="date"
                    style={formInp}
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={formLbl}>Valid Until *</label>
                  <input
                    type="date"
                    style={formInp}
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md, marginTop: SPACE.lg }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  {submitting ? 'Creating Permit...' : 'Create Permit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiningAuthorizationPage;
