import React, { useState, useEffect, useCallback } from 'react';
import { epassService } from '../../services/epass.service';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import {
  VehicleStatus,
  VehicleType,
  type VehicleDto,
  type TransportCompanyDto,
  type ZoneDto,
} from '@tn-forest/shared/types';
import { zoneService } from '../../services/zone.service';
import { useZoneScopedParams } from '../../hooks/useZoneScopedParams';
import { ZoneSelector } from '../../components/common/ZoneSelector';
import { ZoneContextHeader } from '../../components/common/ZoneContextHeader';

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

const STATUS_VARIANTS: Record<VehicleStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  [VehicleStatus.ACTIVE]: 'success',
  [VehicleStatus.MAINTENANCE]: 'warning',
  [VehicleStatus.SUSPENDED]: 'danger',
  [VehicleStatus.INACTIVE]: 'neutral',
};

export const VehicleRegistryPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [companies, setCompanies] = useState<TransportCompanyDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const {
    zoneId: selectedZoneId,
    selectedZone,
    isZoneInvalid,
    setZoneId: setSelectedZoneId,
    clearZone,
  } = useZoneScopedParams(zones, zonesLoaded);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [formData, setFormData] = useState({
    registrationNumber: '',
    vehicleType: VehicleType.TRUCK,
    tareWeight: '',
    grossVehicleWeight: '',
    permittedCarryingCapacity: '',
    gpsTrackerId: '',
    transportCompanyId: '',
  });
  const [companyFormData, setCompanyFormData] = useState({
    companyName: '',
    registrationNumber: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [companySubmitting, setCompanySubmitting] = useState(false);

  const canCreate =
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
      const [list, cList] = await Promise.all([
        epassService.getVehicles({
          zoneId: selectedZoneId || undefined,
        }),
        epassService.getTransportCompanies(),
      ]);
      setVehicles(list);
      setCompanies(cList);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Tare / Gross changes with auto-calculation of Carrying Capacity
  const handleWeightChange = (field: 'tareWeight' | 'grossVehicleWeight' | 'permittedCarryingCapacity', val: string) => {
    const updated = { ...formData, [field]: val };

    if (field === 'tareWeight' || field === 'grossVehicleWeight') {
      const tare = parseFloat(field === 'tareWeight' ? val : formData.tareWeight);
      const gross = parseFloat(field === 'grossVehicleWeight' ? val : formData.grossVehicleWeight);
      if (!isNaN(tare) && !isNaN(gross) && gross >= tare) {
        updated.permittedCarryingCapacity = (Math.round((gross - tare) * 10) / 10).toString();
      }
    }

    setFormData(updated);
  };

  const handleOpenModal = async () => {
    setFormError(null);
    try {
      const cList = await epassService.getTransportCompanies();
      setCompanies(cList);
    } catch {
      // ignore
    }
    setShowModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const tare = parseFloat(formData.tareWeight);
    const gross = parseFloat(formData.grossVehicleWeight);
    const cap = parseFloat(formData.permittedCarryingCapacity);

    if (!formData.registrationNumber || isNaN(tare) || isNaN(gross) || isNaN(cap)) {
      setFormError('Please provide valid numbers for all weights and capacities');
      return;
    }

    if (gross < tare) {
      setFormError('Gross vehicle weight cannot be less than tare weight');
      return;
    }

    try {
      setSubmitting(true);
      await epassService.createVehicle({
        registrationNumber: formData.registrationNumber.trim().toUpperCase(),
        vehicleType: formData.vehicleType,
        tareWeight: tare,
        grossVehicleWeight: gross,
        permittedCarryingCapacity: cap,
        gpsTrackerId: formData.gpsTrackerId ? formData.gpsTrackerId.trim().toUpperCase() : undefined,
        transportCompanyId: formData.transportCompanyId || undefined,
      });
      setShowModal(false);
      setFormData({
        registrationNumber: '',
        vehicleType: VehicleType.TRUCK,
        tareWeight: '',
        grossVehicleWeight: '',
        permittedCarryingCapacity: '',
        gpsTrackerId: '',
        transportCompanyId: '',
      });
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setFormError(e?.response?.data?.message || e?.message || 'Failed to register vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyFormError(null);

    if (!companyFormData.companyName.trim() || !companyFormData.registrationNumber.trim()) {
      setCompanyFormError('Company name and registration number / GSTIN are required.');
      return;
    }

    try {
      setCompanySubmitting(true);
      const created = await epassService.createTransportCompany({
        companyName: companyFormData.companyName.trim(),
        registrationNumber: companyFormData.registrationNumber.trim().toUpperCase(),
        contactDetails: {
          phone: companyFormData.contactPhone.trim() || undefined,
          email: companyFormData.contactEmail.trim() || undefined,
          address: companyFormData.address.trim() || undefined,
        },
      });

      // Update companies list and select it in the vehicle form
      setCompanies((prev) => [created, ...prev]);
      setFormData((prev) => ({ ...prev, transportCompanyId: created.id }));
      setShowCompanyModal(false);
      setCompanyFormData({
        companyName: '',
        registrationNumber: '',
        contactPhone: '',
        contactEmail: '',
        address: '',
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setCompanyFormError(e?.response?.data?.message || e?.message || 'Failed to register company');
    } finally {
      setCompanySubmitting(false);
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      v.registrationNumber.toLowerCase().includes(q) ||
      (v.transportCompanyName && v.transportCompanyName.toLowerCase().includes(q)) ||
      v.vehicleType.toLowerCase().includes(q) ||
      (v.gpsTrackerId && v.gpsTrackerId.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ padding: SPACE.xl, maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Vehicle Registry & Transport Fleet"
        subtitle="Official heavy transport vehicles, unladen/gross weights, permitted payload capacities, and fleet associations."
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
              Register Vehicle
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

      {/* Filter & Search Toolbar */}
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
        </div>

        <div style={{ minWidth: '280px' }}>
          <input
            type="text"
            style={formInp}
            placeholder="Search by Plate #, Operator, GPS..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Loading message="Loading vehicle fleet..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : vehicles.length === 0 ? (
        <EmptyState
          title="No Vehicles Registered"
          description="No transport vehicles found. Register heavy tippers and trucks to enable transit E-Passes."
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
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Registration #</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Vehicle Type</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Tare (Unladen)</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Gross Weight (GVW)</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Permitted Payload</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Transport Operator</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>GPS Unit</th>
                <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: COLORS.textMuted }}>
                    No vehicles match your search filter.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                      {v.registrationNumber}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>{v.vehicleType}</td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>{v.tareWeight} Tonnes</td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>{v.grossVehicleWeight} Tonnes</td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                      <strong style={{ color: '#047857' }}>{v.permittedCarryingCapacity} Tonnes</strong>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                      {v.transportCompanyName ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            fontSize: '12px',
                            fontWeight: FONT.weightMedium,
                          }}
                        >
                          {v.transportCompanyName}
                        </span>
                      ) : (
                        <span style={{ color: COLORS.textMuted, fontStyle: 'italic' }}>Independent Carrier</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontFamily: 'monospace' }}>
                      {v.gpsTrackerId || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge label={v.status} variant={STATUS_VARIANTS[v.status]} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Register Vehicle Modal ── */}
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
            <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, marginBottom: SPACE.md }}>
              Register Transport Vehicle
            </h2>

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
                <label style={formLbl}>Registration Number *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. KA-01-AB-1234"
                  value={formData.registrationNumber}
                  onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div>
                <label style={formLbl}>Vehicle Type *</label>
                <select
                  style={formInp}
                  value={formData.vehicleType}
                  onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value as VehicleType })}
                >
                  <option value={VehicleType.TRUCK}>Truck (Standard 6-Wheeler)</option>
                  <option value={VehicleType.TIPPER}>Tipper (Hydraulic Heavy Tipper)</option>
                  <option value={VehicleType.TRAILER}>Trailer / Multi-Axle Carrier</option>
                  <option value={VehicleType.DUMPER}>Dumper</option>
                  <option value={VehicleType.OTHER}>Other Commercial Vehicle</option>
                </select>
              </div>

              {/* Weight Grid with Auto-Calculation */}
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACE.sm }}>
                  <div>
                    <label style={formLbl}>Tare (Unladen) *</label>
                    <input
                      type="number"
                      step="0.1"
                      style={formInp}
                      placeholder="e.g. 10.5"
                      value={formData.tareWeight}
                      onChange={(e) => handleWeightChange('tareWeight', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={formLbl}>Gross (GVW) *</label>
                    <input
                      type="number"
                      step="0.1"
                      style={formInp}
                      placeholder="e.g. 35.0"
                      value={formData.grossVehicleWeight}
                      onChange={(e) => handleWeightChange('grossVehicleWeight', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={formLbl}>Max Payload *</label>
                    <input
                      type="number"
                      step="0.1"
                      style={{ ...formInp, backgroundColor: '#F8FAFC', fontWeight: FONT.weightBold }}
                      placeholder="e.g. 24.5"
                      value={formData.permittedCarryingCapacity}
                      onChange={(e) => handleWeightChange('permittedCarryingCapacity', e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: 4 }}>
                  Auto-calculated: Carrying Capacity = Gross Vehicle Weight (GVW) − Tare Weight.
                </div>
              </div>

              {/* Transport Company Selection with Inline Registration */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ ...formLbl, marginBottom: 0 }}>Transport Company / Carrier</label>
                  <button
                    type="button"
                    onClick={() => setShowCompanyModal(true)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: COLORS.primary,
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightMedium,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    + Register New Company
                  </button>
                </div>
                <select
                  style={formInp}
                  value={formData.transportCompanyId}
                  onChange={(e) => setFormData({ ...formData, transportCompanyId: e.target.value })}
                >
                  <option value="">-- Independent Vehicle / Unaffiliated --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.registrationNumber})
                    </option>
                  ))}
                </select>
                {companies.length === 0 && (
                  <div style={{ fontSize: '11px', color: '#D97706', marginTop: 4 }}>
                    No transport companies registered. Click "+ Register New Company" above to add one.
                  </div>
                )}
              </div>

              <div>
                <label style={formLbl}>GPS Telemetry Unit ID (Optional)</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. GPS-SYS-2026-9042"
                  value={formData.gpsTrackerId}
                  onChange={(e) => setFormData({ ...formData, gpsTrackerId: e.target.value.toUpperCase() })}
                />
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
                  {submitting ? 'Registering...' : 'Register Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick Register Transport Company Modal ── */}
      {showCompanyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: SPACE.md,
          }}
        >
          <div
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: RADII.xl,
              boxShadow: SHADOWS.lg,
              maxWidth: '500px',
              width: '100%',
              padding: SPACE['2xl'],
            }}
          >
            <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, marginBottom: SPACE.xs }}>
              Register Transport Company
            </h2>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.md }}>
              Create an authorized commercial carrier to link with transport vehicles and drivers.
            </p>

            {companyFormError && (
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
                {companyFormError}
              </div>
            )}

            <form onSubmit={handleCompanySubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              <div>
                <label style={formLbl}>Company / Fleet Name *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. Kongu Logistics & Mineral Carriers Pvt Ltd"
                  value={companyFormData.companyName}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, companyName: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={formLbl}>Business Registration # / GSTIN *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. 33AAAAA0000A1Z5"
                  value={companyFormData.registrationNumber}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, registrationNumber: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm }}>
                <div>
                  <label style={formLbl}>Contact Phone</label>
                  <input
                    type="tel"
                    style={formInp}
                    placeholder="e.g. +91 94431 22890"
                    value={companyFormData.contactPhone}
                    onChange={(e) => setCompanyFormData({ ...companyFormData, contactPhone: e.target.value })}
                  />
                </div>
                <div>
                  <label style={formLbl}>Contact Email</label>
                  <input
                    type="email"
                    style={formInp}
                    placeholder="e.g. ops@kongulogistics.in"
                    value={companyFormData.contactEmail}
                    onChange={(e) => setCompanyFormData({ ...companyFormData, contactEmail: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={formLbl}>Base Operating Address</label>
                <textarea
                  rows={2}
                  style={formInp}
                  placeholder="e.g. 14B Industrial Bypass Road, Sector 4"
                  value={companyFormData.address}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md, marginTop: SPACE.md }}>
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
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
                  disabled={companySubmitting}
                  style={{
                    padding: '8px 20px',
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.primary,
                    color: '#ECFDF5',
                    border: 'none',
                    fontWeight: FONT.weightMedium,
                    cursor: companySubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {companySubmitting ? 'Creating Company...' : 'Save & Link Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleRegistryPage;
