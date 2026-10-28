import React, { useState, useEffect, useCallback } from 'react';
import { epassService } from '../../services/epass.service';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/common/Loading';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import PageHeader from '../../components/ui/PageHeader';
import {
  DriverVerificationStatus,
  TransportCompanyStatus,
  type DriverDto,
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

const STATUS_VARIANTS: Record<DriverVerificationStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  [DriverVerificationStatus.VERIFIED]: 'success',
  [DriverVerificationStatus.PENDING]: 'warning',
  [DriverVerificationStatus.REJECTED]: 'danger',
  [DriverVerificationStatus.SUSPENDED]: 'danger',
};

export const DriverRegistryPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'DRIVERS' | 'COMPANIES'>('DRIVERS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [companies, setCompanies] = useState<TransportCompanyDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);

  const {
    zoneId: selectedZoneId,
    selectedZone,
    isZoneInvalid,
    setZoneId: setSelectedZoneId,
    clearZone,
  } = useZoneScopedParams(zones, zonesLoaded);

  // Driver Modal State
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [driverFormData, setDriverFormData] = useState({
    licenseNumber: '',
    name: '',
    phone: '',
    verificationStatus: DriverVerificationStatus.VERIFIED,
    transportCompanyId: '',
  });
  const [driverFormError, setDriverFormError] = useState<string | null>(null);
  const [driverSubmitting, setDriverSubmitting] = useState(false);

  // Company Modal State
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companyFormData, setCompanyFormData] = useState({
    companyName: '',
    registrationNumber: '',
    phone: '',
    email: '',
    address: '',
    status: TransportCompanyStatus.ACTIVE,
  });
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);
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
      const [driverList, companyList] = await Promise.all([
        epassService.getDrivers({
          zoneId: selectedZoneId || undefined,
        }),
        epassService.getTransportCompanies(),
      ]);
      setDrivers(driverList);
      setCompanies(companyList);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Failed to load drivers and transport fleet data');
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenDriverModal = () => {
    setDriverFormError(null);
    setDriverFormData({
      licenseNumber: '',
      name: '',
      phone: '',
      verificationStatus: DriverVerificationStatus.VERIFIED,
      transportCompanyId: companies.length > 0 ? companies[0].id : '',
    });
    setShowDriverModal(true);
  };

  const handleOpenCompanyModal = () => {
    setCompanyFormError(null);
    setCompanyFormData({
      companyName: '',
      registrationNumber: '',
      phone: '',
      email: '',
      address: '',
      status: TransportCompanyStatus.ACTIVE,
    });
    setShowCompanyModal(true);
  };

  const handleCreateDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverFormError(null);

    if (!driverFormData.licenseNumber || !driverFormData.name || !driverFormData.phone) {
      setDriverFormError('Please fill out all required fields');
      return;
    }

    try {
      setDriverSubmitting(true);
      await epassService.createDriver({
        licenseNumber: driverFormData.licenseNumber.trim().toUpperCase(),
        name: driverFormData.name.trim(),
        phone: driverFormData.phone.trim(),
        verificationStatus: driverFormData.verificationStatus,
        transportCompanyId: driverFormData.transportCompanyId || undefined,
      });
      setShowDriverModal(false);
      await fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setDriverFormError(e?.response?.data?.message || e?.message || 'Failed to register driver');
    } finally {
      setDriverSubmitting(false);
    }
  };

  const handleCreateCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyFormError(null);

    if (!companyFormData.companyName.trim() || !companyFormData.registrationNumber.trim()) {
      setCompanyFormError('Company Name and Registration / Tax ID are required');
      return;
    }

    try {
      setCompanySubmitting(true);
      const createdCompany = await epassService.createTransportCompany({
        companyName: companyFormData.companyName.trim(),
        registrationNumber: companyFormData.registrationNumber.trim().toUpperCase(),
        contactDetails: {
          phone: companyFormData.phone.trim() || undefined,
          email: companyFormData.email.trim() || undefined,
          address: companyFormData.address.trim() || undefined,
        },
        status: companyFormData.status,
      });

      // Update companies list
      const updatedCompanies = await epassService.getTransportCompanies();
      setCompanies(updatedCompanies);

      // If driver modal is open, auto-select newly registered company
      if (showDriverModal) {
        setDriverFormData((prev) => ({
          ...prev,
          transportCompanyId: createdCompany.id,
        }));
      }

      setShowCompanyModal(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setCompanyFormError(e?.response?.data?.message || e?.message || 'Failed to register transport company');
    } finally {
      setCompanySubmitting(false);
    }
  };

  return (
    <div style={{ padding: SPACE.xl, maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Driver & Transport Company Registry"
        subtitle="Manage authorized commercial heavy transport drivers, driving credentials, and transport fleet operators."
        actions={
          canCreate ? (
            <div style={{ display: 'flex', gap: SPACE.sm }}>
              <button
                onClick={handleOpenCompanyModal}
                style={{
                  backgroundColor: '#F1F5F9',
                  color: COLORS.primary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADII.md,
                  padding: '9px 16px',
                  fontSize: FONT.sizeMd,
                  fontWeight: FONT.weightMedium,
                  cursor: 'pointer',
                  boxShadow: SHADOWS.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACE.xs,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M5 21V7l8-4v18M13 7l6 3v11" />
                </svg>
                + Register Company
              </button>
              <button
                onClick={handleOpenDriverModal}
                style={{
                  backgroundColor: COLORS.primary,
                  color: '#ECFDF5',
                  border: 'none',
                  borderRadius: RADII.md,
                  padding: '9px 18px',
                  fontSize: FONT.sizeMd,
                  fontWeight: FONT.weightMedium,
                  cursor: 'pointer',
                  boxShadow: SHADOWS.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACE.xs,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Register Driver
              </button>
            </div>
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

      {/* Tab Switcher & Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: SPACE.md,
          marginBottom: SPACE.lg,
        }}
      >
        <div
          style={{
            display: 'flex',
            backgroundColor: '#F1F5F9',
            padding: '4px',
            borderRadius: RADII.lg,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <button
            onClick={() => setActiveTab('DRIVERS')}
            style={{
              padding: '8px 18px',
              borderRadius: RADII.md,
              border: 'none',
              backgroundColor: activeTab === 'DRIVERS' ? COLORS.surface : 'transparent',
              color: activeTab === 'DRIVERS' ? COLORS.primary : COLORS.textMuted,
              fontWeight: activeTab === 'DRIVERS' ? FONT.weightSemibold : FONT.weightMedium,
              fontSize: FONT.sizeSm,
              cursor: 'pointer',
              boxShadow: activeTab === 'DRIVERS' ? SHADOWS.sm : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Drivers ({drivers.length})
          </button>
          <button
            onClick={() => setActiveTab('COMPANIES')}
            style={{
              padding: '8px 18px',
              borderRadius: RADII.md,
              border: 'none',
              backgroundColor: activeTab === 'COMPANIES' ? COLORS.surface : 'transparent',
              color: activeTab === 'COMPANIES' ? COLORS.primary : COLORS.textMuted,
              fontWeight: activeTab === 'COMPANIES' ? FONT.weightSemibold : FONT.weightMedium,
              fontSize: FONT.sizeSm,
              cursor: 'pointer',
              boxShadow: activeTab === 'COMPANIES' ? SHADOWS.sm : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M5 21V7l8-4v18M13 7l6 3v11" />
            </svg>
            Transport Companies ({companies.length})
          </button>
        </div>

        {activeTab === 'DRIVERS' && (
          <div style={{ minWidth: '220px' }}>
            <ZoneSelector
              zones={zones}
              selectedZoneId={selectedZoneId}
              onSelectZone={setSelectedZoneId}
            />
          </div>
        )}
      </div>

      {loading ? (
        <Loading message="Loading fleet and driver directory..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : activeTab === 'DRIVERS' ? (
        drivers.length === 0 ? (
          <EmptyState
            title="No Drivers Registered"
            description="No commercial transport drivers registered yet. Add verified drivers to authorize them for E-Pass transport."
            action={
              canCreate ? (
                <button
                  onClick={handleOpenDriverModal}
                  style={{
                    backgroundColor: COLORS.primary,
                    color: '#ECFDF5',
                    border: 'none',
                    borderRadius: RADII.md,
                    padding: '8px 16px',
                    fontWeight: FONT.weightMedium,
                    cursor: 'pointer',
                    marginTop: SPACE.sm,
                  }}
                >
                  Register First Driver
                </button>
              ) : undefined
            }
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
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Driver Name</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Commercial License #</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Contact Phone</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Transport Operator</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Verification Status</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                      {d.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontFamily: 'monospace' }}>
                      {d.licenseNumber}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>{d.phone}</td>
                    <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                      {d.transportCompanyName ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            backgroundColor: '#F0FDF4',
                            color: '#166534',
                            border: '1px solid #BBF7D0',
                            borderRadius: RADII.sm,
                            fontWeight: FONT.weightMedium,
                            fontSize: FONT.sizeXs,
                          }}
                        >
                          🏢 {d.transportCompanyName}
                        </span>
                      ) : (
                        <span style={{ color: COLORS.textMuted, fontStyle: 'italic', fontSize: FONT.sizeXs }}>
                          Independent Contractor
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge label={d.verificationStatus} variant={STATUS_VARIANTS[d.verificationStatus]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Transport Companies View */
        companies.length === 0 ? (
          <EmptyState
            title="No Transport Companies Registered"
            description="Register freight corporations and fleet operators to link authorized drivers and haulage vehicles."
            action={
              canCreate ? (
                <button
                  onClick={handleOpenCompanyModal}
                  style={{
                    backgroundColor: COLORS.primary,
                    color: '#ECFDF5',
                    border: 'none',
                    borderRadius: RADII.md,
                    padding: '8px 16px',
                    fontWeight: FONT.weightMedium,
                    cursor: 'pointer',
                    marginTop: SPACE.sm,
                  }}
                >
                  Register First Transport Company
                </button>
              ) : undefined
            }
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
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Company Name</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Registration # / GSTIN</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Contact Details</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Drivers Associated</th>
                  <th style={{ padding: '12px 16px', fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const linkedDrivers = drivers.filter(
                    (d) => d.transportCompanyId === c.id || d.transportCompanyName === c.companyName,
                  );
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: FONT.weightSemibold, color: COLORS.primary }}>
                        {c.companyName}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm, fontFamily: 'monospace' }}>
                        {c.registrationNumber}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                        {c.contactDetails?.phone || 'No phone'}
                        {c.contactDetails?.email && (
                          <span style={{ color: COLORS.textMuted, display: 'block', fontSize: FONT.sizeXs }}>
                            {c.contactDetails.email}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: FONT.sizeSm }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            borderRadius: '12px',
                            fontSize: FONT.sizeXs,
                            fontWeight: FONT.weightMedium,
                          }}
                        >
                          {linkedDrivers.length} Drivers
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge label={c.status} variant="success" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Register Driver Modal ── */}
      {showDriverModal && (
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
              Register Commercial Driver
            </h2>

            {driverFormError && (
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
                {driverFormError}
              </div>
            )}

            <form onSubmit={handleCreateDriverSubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              <div>
                <label style={formLbl}>Full Name *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. S. Murugesan"
                  value={driverFormData.name}
                  onChange={(e) => setDriverFormData({ ...driverFormData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={formLbl}>Driving License Number *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. TN-38-2018-0094123"
                  value={driverFormData.licenseNumber}
                  onChange={(e) =>
                    setDriverFormData({ ...driverFormData, licenseNumber: e.target.value.toUpperCase() })
                  }
                  required
                />
              </div>

              <div>
                <label style={formLbl}>Contact Phone Number *</label>
                <input
                  type="tel"
                  style={formInp}
                  placeholder="e.g. +91 98421 00000"
                  value={driverFormData.phone}
                  onChange={(e) => setDriverFormData({ ...driverFormData, phone: e.target.value })}
                  required
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ ...formLbl, marginBottom: 0 }}>Transport Fleet Operator / Company</label>
                  <button
                    type="button"
                    onClick={handleOpenCompanyModal}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: COLORS.primary,
                      fontSize: FONT.sizeXs,
                      fontWeight: FONT.weightSemibold,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    + Register New Company
                  </button>
                </div>
                <select
                  style={formInp}
                  value={driverFormData.transportCompanyId}
                  onChange={(e) => setDriverFormData({ ...driverFormData, transportCompanyId: e.target.value })}
                >
                  <option value="">-- Independent Contractor / Self-Employed --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.registrationNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={formLbl}>Verification Status</label>
                <select
                  style={formInp}
                  value={driverFormData.verificationStatus}
                  onChange={(e) =>
                    setDriverFormData({
                      ...driverFormData,
                      verificationStatus: e.target.value as DriverVerificationStatus,
                    })
                  }
                >
                  <option value={DriverVerificationStatus.VERIFIED}>VERIFIED (Approved for Transport)</option>
                  <option value={DriverVerificationStatus.PENDING}>PENDING (Verification In Progress)</option>
                  <option value={DriverVerificationStatus.SUSPENDED}>SUSPENDED</option>
                  <option value={DriverVerificationStatus.REJECTED}>REJECTED</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.md, marginTop: SPACE.lg }}>
                <button
                  type="button"
                  onClick={() => setShowDriverModal(false)}
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
                  disabled={driverSubmitting}
                  style={{
                    padding: '8px 20px',
                    borderRadius: RADII.md,
                    backgroundColor: COLORS.primary,
                    color: '#ECFDF5',
                    border: 'none',
                    fontWeight: FONT.weightMedium,
                    cursor: driverSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {driverSubmitting ? 'Registering...' : 'Register Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Register Transport Company Modal ── */}
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
              maxWidth: '520px',
              width: '100%',
              padding: SPACE['2xl'],
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md }}>
              <h2 style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, margin: 0 }}>
                Register Transport Company
              </h2>
              <button
                onClick={() => setShowCompanyModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: COLORS.textMuted }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACE.md }}>
              Register commercial haulage operators and freight carriers to link authorized vehicles and drivers.
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

            <form onSubmit={handleCreateCompanySubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              <div>
                <label style={formLbl}>Company / Fleet Name *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. Kongu Logistics Transport Corp."
                  value={companyFormData.companyName}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, companyName: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={formLbl}>Registration Number / GSTIN / CIN *</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. 33AABCK1234F1Z5 or TN-TC-2026-042"
                  value={companyFormData.registrationNumber}
                  onChange={(e) =>
                    setCompanyFormData({ ...companyFormData, registrationNumber: e.target.value.toUpperCase() })
                  }
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                <div>
                  <label style={formLbl}>Contact Phone</label>
                  <input
                    type="tel"
                    style={formInp}
                    placeholder="e.g. +91 94432 00000"
                    value={companyFormData.phone}
                    onChange={(e) => setCompanyFormData({ ...companyFormData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label style={formLbl}>Contact Email</label>
                  <input
                    type="email"
                    style={formInp}
                    placeholder="e.g. dispatch@kongutransport.in"
                    value={companyFormData.email}
                    onChange={(e) => setCompanyFormData({ ...companyFormData, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={formLbl}>Operating Base / Depot Address</label>
                <input
                  type="text"
                  style={formInp}
                  placeholder="e.g. Salem Industrial Estate, Salem, Tamil Nadu"
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
                  {companySubmitting ? 'Registering...' : 'Save Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverRegistryPage;
