import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { epassService } from '../../services/epass.service';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import StatusBadge from '../../components/ui/StatusBadge';
import type {
  TransportCompanyDto,
  VehicleDto,
  DriverDto,
  MiningAuthorizationDto,
  EPassDto,
  CreateVehicleRequest,
  CreateDriverRequest,
  CreateMiningAuthorizationRequest,
  VehicleType,
} from '@tn-forest/shared/types';
import { DriverVerificationStatus, VehicleStatus, MiningAuthorizationStatus, EPassStatus } from '@tn-forest/shared/types';

export const TransporterPortalPage: React.FC = () => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'vehicles' | 'drivers' | 'mining' | 'epasses'>('profile');
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<TransportCompanyDto | null>(null);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [miningAuths, setMiningAuths] = useState<MiningAuthorizationDto[]>([]);
  const [epasses, setEpasses] = useState<EPassDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals state
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showMiningModal, setShowMiningModal] = useState(false);
  const [showEditCompanyModal, setShowEditCompanyModal] = useState(false);

  // Vehicle form
  const [vehReg, setVehReg] = useState('');
  const [vehType, setVehType] = useState('TIPPER');
  const [vehTare, setVehTare] = useState(11.5);
  const [vehGvw, setVehGvw] = useState(28.0);
  const [vehGps, setVehGps] = useState('');

  // Driver form
  const [drvName, setDrvName] = useState('');
  const [drvLicense, setDrvLicense] = useState('');
  const [drvPhone, setDrvPhone] = useState('');

  // Mining authorization form
  const [permitNum, setPermitNum] = useState('');
  const [mineralType, setMineralType] = useState('Rough Stone & Blue Metal Aggregate');
  const [permittedWeight, setPermittedWeight] = useState(50000);
  const [validUntil, setValidUntil] = useState('2028-12-31');

  // Company edit form
  const [editCompName, setEditCompName] = useState('');
  const [editCompReg, setEditCompReg] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editZoneName, setEditZoneName] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Load Company
      let compData: TransportCompanyDto | null = null;
      try {
        compData = await epassService.getMyCompany();
      } catch {
        // Fallback: load all and pick matching or first
        const allComps = await epassService.getTransportCompanies();
        if (allComps.length > 0) {
          compData = allComps.find((c) => c.id === user?.companyId) || allComps[0];
        }
      }
      setCompany(compData);

      if (compData) {
        setEditCompName(compData.companyName);
        setEditCompReg(compData.registrationNumber);
        setEditPhone(compData.contactDetails?.phone || '');
        setEditAddress(compData.contactDetails?.address || '');
        setEditZoneName(compData.miningZoneDetails?.zoneName || '');
      }

      // 2. Load Vehicles, Drivers, Mining Authorizations & E-Passes
      const [vList, dList, authList, passList] = await Promise.all([
        epassService.getVehicles(),
        epassService.getDrivers(),
        epassService.getAuthorizations(),
        epassService.getEPasses(),
      ]);

      // Filter by company if company id is available
      const compId = compData?.id;
      const filteredVehicles = compId ? vList.filter((v) => v.transportCompanyId === compId) : vList;
      const filteredDrivers = compId ? dList.filter((d) => d.transportCompanyId === compId) : dList;

      setVehicles(filteredVehicles.length > 0 ? filteredVehicles : vList);
      setDrivers(filteredDrivers.length > 0 ? filteredDrivers : dList);
      setMiningAuths(authList);
      setEpasses(passList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load transport portal data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehReg.trim()) return;
    try {
      const payload: CreateVehicleRequest = {
        registrationNumber: vehReg.trim().toUpperCase(),
        vehicleType: vehType as VehicleType,
        tareWeight: Number(vehTare),
        grossVehicleWeight: Number(vehGvw),
        permittedCarryingCapacity: Math.max(0, Number(vehGvw) - Number(vehTare)),
        gpsTrackerId: vehGps.trim() || `GPS-TRK-${Math.floor(1000 + Math.random() * 9000)}`,
        status: VehicleStatus.ACTIVE,
        transportCompanyId: company?.id,
      };
      await epassService.createVehicle(payload);
      setShowVehicleModal(false);
      setVehReg('');
      setVehGps('');
      setSuccessMsg('Vehicle registered successfully to your fleet!');
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register vehicle');
    }
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drvName.trim() || !drvLicense.trim()) return;
    try {
      const payload: CreateDriverRequest = {
        name: drvName.trim(),
        licenseNumber: drvLicense.trim().toUpperCase(),
        phone: drvPhone.trim() || '+91 90000 00000',
        verificationStatus: DriverVerificationStatus.VERIFIED,
        transportCompanyId: company?.id,
      };
      await epassService.createDriver(payload);
      setShowDriverModal(false);
      setDrvName('');
      setDrvLicense('');
      setDrvPhone('');
      setSuccessMsg('Driver enrolled and registered successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register driver');
    }
  };

  const handleCreateMiningAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permitNum.trim()) return;
    try {
      const payload: CreateMiningAuthorizationRequest = {
        permitNumber: permitNum.trim().toUpperCase(),
        lesseeName: company?.companyName || user?.name || 'Authorized Lessee',
        mineralType: mineralType.trim(),
        permittedWeightTonnes: Number(permittedWeight),
        validFrom: new Date().toISOString(),
        validUntil: new Date(validUntil).toISOString(),
        status: MiningAuthorizationStatus.ACTIVE,
      };
      await epassService.createAuthorization(payload);
      setShowMiningModal(false);
      setPermitNum('');
      setSuccessMsg('Mining lease authorization registered successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register mining permit');
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    try {
      await epassService.updateTransportCompany(company.id, {
        companyName: editCompName.trim(),
        registrationNumber: editCompReg.trim().toUpperCase(),
        contactDetails: {
          phone: editPhone.trim(),
          email: company.contactDetails?.email,
          address: editAddress.trim(),
        },
        miningZoneDetails: {
          ...company.miningZoneDetails,
          zoneName: editZoneName.trim(),
        },
      });
      setShowEditCompanyModal(false);
      setSuccessMsg('Company details updated successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
      loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update company details');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: FONT.sizeSm,
    borderRadius: RADII.md,
    border: '1px solid #CBD5E1',
    outline: 'none',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    boxSizing: 'border-box',
    marginTop: '4px',
  };

  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '16px',
    backdropFilter: 'blur(3px)',
  };

  const modalContentStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: RADII.lg,
    padding: '24px',
    maxWidth: '520px',
    width: '100%',
    boxShadow: SHADOWS.lg,
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  return (
    <div style={{ padding: SPACE['2xl'], maxWidth: '1360px', margin: '0 auto', fontFamily: FONT.family }}>
      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: SPACE.xl,
          flexWrap: 'wrap',
          gap: SPACE.md,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #DBEAFE',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </span>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {company?.companyName || user?.name || 'Commercial Transporter & Fleet Portal'}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', fontFamily: 'monospace' }}>
                  REG: {company?.registrationNumber || 'CIN-PENDING'}
                </span>
                <span style={{ color: '#CBD5E1' }}>&bull;</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: RADII.full,
                    backgroundColor: '#ECFDF5',
                    color: '#065F46',
                    border: '1px solid #A7F3D0',
                  }}
                >
                  ACTIVE FLEET OPERATOR
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowEditCompanyModal(true)}
            style={{
              padding: '9px 15px',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: RADII.md,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Edit Company Details
          </button>

          <button
            onClick={() => setShowVehicleModal(true)}
            style={{
              padding: '9px 15px',
              backgroundColor: '#1E3A8A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: RADII.md,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(30, 58, 138, 0.25)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            + Register Vehicle
          </button>

          <button
            onClick={() => setShowDriverModal(true)}
            style={{
              padding: '9px 15px',
              backgroundColor: '#1B4332',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: RADII.md,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(27, 67, 50, 0.25)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            + Register Driver
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: RADII.md,
            color: '#065F46',
            fontSize: '13.5px',
            fontWeight: 600,
            marginBottom: SPACE.lg,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✔</span>
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: RADII.md,
            color: '#991B1B',
            fontSize: '13.5px',
            marginBottom: SPACE.lg,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── KPI Stat Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: SPACE.md,
          marginBottom: SPACE.xl,
        }}
      >
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '18px 20px',
            borderRadius: RADII.lg,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Registered Fleet
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#1E3A8A', marginTop: '4px' }}>
            {vehicles.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Trucks</span>
          </div>
          <div style={{ fontSize: '12px', color: '#10B981', marginTop: '4px', fontWeight: 600 }}>
            ● {vehicles.filter((v) => v.status === VehicleStatus.ACTIVE).length} Active &amp; GPS-Tracked
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '18px 20px',
            borderRadius: RADII.lg,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Verified Drivers
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#065F46', marginTop: '4px' }}>
            {drivers.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Drivers</span>
          </div>
          <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px', fontWeight: 600 }}>
            ● {drivers.filter((d) => d.verificationStatus === DriverVerificationStatus.VERIFIED).length} Verified Licenses
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '18px 20px',
            borderRadius: RADII.lg,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Mining Leases &amp; Quotas
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
            {miningAuths.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Permits</span>
          </div>
          <div style={{ fontSize: '12px', color: '#D97706', marginTop: '4px', fontWeight: 600 }}>
            {company?.miningZoneDetails?.zoneName || 'Sirumalai Foothills & Designated Quarries'}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '18px 20px',
            borderRadius: RADII.lg,
            border: '1px solid #E2E8F0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Transit e-Passes
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#7C3AED', marginTop: '4px' }}>
            {epasses.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Issued</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6D28D9', marginTop: '4px', fontWeight: 600 }}>
            QR Digital Verification Active
          </div>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid #E2E8F0',
          marginBottom: SPACE.xl,
          gap: '8px',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'profile', label: 'Company Profile & Details', icon: '🏢' },
          { id: 'vehicles', label: `Fleet Vehicles (${vehicles.length})`, icon: '🚛' },
          { id: 'drivers', label: `Registered Drivers (${drivers.length})`, icon: '👤' },
          { id: 'mining', label: `Mining Zone & Leases (${miningAuths.length})`, icon: '⛰️' },
          { id: 'epasses', label: `Transit E-Passes (${epasses.length})`, icon: '📄' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 18px',
                border: 'none',
                background: 'none',
                fontSize: '14px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#1E3A8A' : '#64748B',
                borderBottom: isActive ? '3px solid #1E3A8A' : '3px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748B' }}>
          Loading company details &amp; fleet records...
        </div>
      ) : (
        <>
          {/* ── TAB 1: COMPANY PROFILE & DETAILS ── */}
          {activeTab === 'profile' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: SPACE.xl }}>
              {/* Legal Entity Card */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: RADII.lg,
                  padding: '24px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    Legal Registration &amp; Company Identity
                  </h3>
                  <button
                    onClick={() => setShowEditCompanyModal(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13.5px' }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Company Legal Name</div>
                    <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px', fontSize: '15px' }}>
                      {company?.companyName || user?.name || 'N/A'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Registration / CIN Number</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace', marginTop: '2px' }}>
                      {company?.registrationNumber || 'CIN-PENDING'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Internal Identifier</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace', marginTop: '2px' }}>
                      {company?.companyId || 'TC-AUTO'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Operating Status</div>
                    <div style={{ marginTop: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: RADII.full,
                          backgroundColor: '#ECFDF5',
                          color: '#065F46',
                          border: '1px solid #A7F3D0',
                        }}
                      >
                        {company?.status || 'ACTIVE'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Authorized Contact Person</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                      {user?.name || 'Managing Director'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact & Physical Address Card */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: RADII.lg,
                  padding: '24px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    Contact &amp; Headquarters
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13.5px' }}>
                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Official Email Address</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                      {company?.contactDetails?.email || user?.email || 'N/A'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Phone / Dispatch Helpline</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                      {company?.contactDetails?.phone || user?.phone || '+91 9444000008'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Registered Office Address</div>
                    <div style={{ color: '#334155', marginTop: '2px', lineHeight: 1.5 }}>
                      {company?.contactDetails?.address || '42 Industrial Corridor, Madurai - Dindigul Highway, Sector 4'}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                    <div style={{ color: '#64748B', fontSize: '12px' }}>Operational Corridor</div>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                      State Highway 33 · Checkpoint Corridor CP-02
                    </div>
                  </div>
                </div>
              </div>

              {/* Mining Zone & Quarry Association Card */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: RADII.lg,
                  padding: '24px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  gridColumn: '1 / -1',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                      Mining Zone Details &amp; Extraction Boundaries
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      Primary extraction lease authorized for mineral transportation and e-Pass generation.
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMiningModal(true)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#FEF3C7',
                      color: '#92400E',
                      border: '1px solid #FCD34D',
                      borderRadius: RADII.sm,
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Add Mining Permit
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '16px',
                    padding: '16px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: RADII.md,
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Permitted Zone</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                      {company?.miningZoneDetails?.zoneName || 'Sirumalai Foothill Extraction Zone A-1'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Lease / Permit No.</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E3A8A', fontFamily: 'monospace', marginTop: '2px' }}>
                      {company?.miningZoneDetails?.leasePermitNumber || 'ML-2024-MIN-009'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Authorized Mineral</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                      {company?.miningZoneDetails?.mineralType || 'Rough Stone & Blue Metal Aggregate'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Permitted Capacity</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                      {company?.miningZoneDetails?.authorizedCapacityTonnes
                        ? `${company.miningZoneDetails.authorizedCapacityTonnes.toLocaleString()} Tonnes`
                        : '75,000 Tonnes / Year'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: FLEET VEHICLES ── */}
          {activeTab === 'vehicles' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: RADII.lg,
                padding: '24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    Registered Transport Vehicles ({vehicles.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Vehicles authorized for mineral cartage, tare/GVW weight verification, and GPS tracking.
                  </div>
                </div>
                <button
                  onClick={() => setShowVehicleModal(true)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#1E3A8A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: RADII.md,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Add Vehicle
                </button>
              </div>

              {vehicles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                  No vehicles registered yet. Click &quot;+ Add Vehicle&quot; to register your first truck.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Registration No.</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Vehicle Type</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Tare Weight</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Gross Weight (GVW)</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Permitted Capacity</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>GPS Tracker</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((v) => (
                        <tr key={v.id || v.vehicleId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700, fontFamily: 'monospace', color: '#0F172A' }}>
                            {v.registrationNumber}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#334155' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                backgroundColor: '#EFF6FF',
                                color: '#1E40AF',
                                borderRadius: RADII.sm,
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              {v.vehicleType || 'TIPPER'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748B' }}>{v.tareWeight} T</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>{v.grossVehicleWeight} T</td>
                          <td style={{ padding: '12px 14px', color: '#059669', fontWeight: 700 }}>
                            {v.permittedCarryingCapacity} T
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748B', fontFamily: 'monospace', fontSize: '11.5px' }}>
                            {v.gpsTrackerId ? (
                              <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                                {v.gpsTrackerId}
                              </span>
                            ) : (
                              'Not Configured'
                            )}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <StatusBadge
                              label={v.status}
                              variant={v.status === VehicleStatus.ACTIVE ? 'success' : 'warning'}
                              dot
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: REGISTERED DRIVERS ── */}
          {activeTab === 'drivers' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: RADII.lg,
                padding: '24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    Company Driver Roster ({drivers.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Drivers with validated transport licenses authorized to haul mineral consignments.
                  </div>
                </div>
                <button
                  onClick={() => setShowDriverModal(true)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#1B4332',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: RADII.md,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Add Driver
                </button>
              </div>

              {drivers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                  No drivers registered yet. Click &quot;+ Add Driver&quot; to enroll your drivers.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Driver Name</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Driving License No.</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Contact Phone</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Verification Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map((d) => (
                        <tr key={d.id || d.driverId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0F172A' }}>{d.name}</td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#1E3A8A' }}>
                            {d.licenseNumber}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#334155' }}>{d.phone}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: RADII.full,
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: d.verificationStatus === 'VERIFIED' ? '#ECFDF5' : '#FEF3C7',
                                color: d.verificationStatus === 'VERIFIED' ? '#065F46' : '#92400E',
                                border: d.verificationStatus === 'VERIFIED' ? '1px solid #A7F3D0' : '1px solid #FCD34D',
                              }}
                            >
                              {d.verificationStatus || 'VERIFIED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 4: MINING ZONES & LEASES ── */}
          {activeTab === 'mining' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: RADII.lg,
                padding: '24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    Authorized Mining Leases &amp; Extraction Zones
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Government quarry permits, approved volumetric extraction caps, and remaining transport balance.
                  </div>
                </div>
                <button
                  onClick={() => setShowMiningModal(true)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#B45309',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: RADII.md,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  + Add Mining Permit
                </button>
              </div>

              {miningAuths.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                  No mining permits registered yet. Click &quot;+ Add Mining Permit&quot; to link your quarry lease.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {miningAuths.map((auth) => (
                    <div
                      key={auth.id || auth.authorizationId}
                      style={{
                        padding: '16px',
                        borderRadius: RADII.md,
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Permit No.</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: '#1E3A8A' }}>
                            {auth.permitNumber}
                          </div>
                        </div>
                        <StatusBadge
                          label={auth.status}
                          variant={auth.status === MiningAuthorizationStatus.ACTIVE ? 'success' : 'neutral'}
                          dot
                        />
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                        <div>
                          <span style={{ color: '#64748B' }}>Lessee: </span>
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>{auth.lesseeName}</span>
                        </div>
                        <div>
                          <span style={{ color: '#64748B' }}>Mineral Type: </span>
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>{auth.mineralType}</span>
                        </div>
                        <div>
                          <span style={{ color: '#64748B' }}>Permitted Quota: </span>
                          <span style={{ fontWeight: 700, color: '#059669' }}>
                            {auth.permittedWeightTonnes.toLocaleString()} Tonnes
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#64748B' }}>Remaining Balance: </span>
                          <span style={{ fontWeight: 700, color: '#D97706' }}>
                            {auth.remainingQuota !== undefined
                              ? `${auth.remainingQuota.toLocaleString()} Tonnes`
                              : `${auth.permittedWeightTonnes.toLocaleString()} Tonnes`}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '6px' }}>
                          Validity: {new Date(auth.validFrom).toLocaleDateString()} &mdash;{' '}
                          {new Date(auth.validUntil).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 5: TRANSIT E-PASSES ── */}
          {activeTab === 'epasses' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: RADII.lg,
                padding: '24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    Active Transit E-Passes ({epasses.length})
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Digital transit permits generated for company vehicles passing through checkpoints.
                  </div>
                </div>
              </div>

              {epasses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                  No transit passes issued yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Pass Number</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Vehicle</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Driver</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Mineral Type</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Weight (T)</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Destination</th>
                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {epasses.map((p) => (
                        <tr key={p.id || p.passNumber} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700, fontFamily: 'monospace', color: '#1E3A8A' }}>
                            {p.passNumber}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{p.vehicleRegistrationNumber || p.vehicleId}</td>
                          <td style={{ padding: '12px 14px' }}>{p.driverName || p.driverId}</td>
                          <td style={{ padding: '12px 14px' }}>{p.mineralType}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#059669' }}>
                            {p.netWeightTonnes} T
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748B' }}>{p.destinationCheckpoint}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <StatusBadge
                              label={p.status}
                              variant={
                                p.status === EPassStatus.ACTIVE
                                  ? 'success'
                                  : p.status === EPassStatus.USED
                                  ? 'info'
                                  : p.status === EPassStatus.CANCELLED || p.status === EPassStatus.REVOKED
                                  ? 'danger'
                                  : 'neutral'
                              }
                              dot
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── MODAL: Register Vehicle ── */}
      {showVehicleModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Register Vehicle to Fleet</h3>
              <button
                onClick={() => setShowVehicleModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateVehicle}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Vehicle Registration Plate *</label>
                <input
                  type="text"
                  placeholder="e.g. TN-58-AA-1234"
                  value={vehReg}
                  onChange={(e) => setVehReg(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Vehicle Configuration Type</label>
                <select value={vehType} onChange={(e) => setVehType(e.target.value)} style={inputStyle}>
                  <option value="TIPPER">Tipper Truck</option>
                  <option value="DUMPER">Heavy Dumper</option>
                  <option value="TRUCK">Heavy Commercial Truck (10-Wheeler)</option>
                  <option value="TRAILER">Multi-Axle Semi-Trailer</option>
                  <option value="OTHER">Other Mineral Hauler</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Tare Weight (Empty T)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vehTare}
                    onChange={(e) => setVehTare(Number(e.target.value))}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Gross Weight (GVW T)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vehGvw}
                    onChange={(e) => setVehGvw(Number(e.target.value))}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>GPS Telematics ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. GPS-TRK-9812"
                  value={vehGps}
                  onChange={(e) => setVehGps(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowVehicleModal(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADII.md,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: RADII.md,
                    border: 'none',
                    backgroundColor: '#1E3A8A',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Register Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Register Driver ── */}
      {showDriverModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Enroll Driver</h3>
              <button
                onClick={() => setShowDriverModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateDriver}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Driver Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. R. Murugan"
                  value={drvName}
                  onChange={(e) => setDrvName(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Driving License Number *</label>
                <input
                  type="text"
                  placeholder="e.g. DL-TN58-2020-00129"
                  value={drvLicense}
                  onChange={(e) => setDrvLicense(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Contact Phone</label>
                <input
                  type="text"
                  placeholder="+91 98421 11091"
                  value={drvPhone}
                  onChange={(e) => setDrvPhone(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowDriverModal(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADII.md,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: RADII.md,
                    border: 'none',
                    backgroundColor: '#1B4332',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Enroll Driver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Add Mining Permit ── */}
      {showMiningModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                Register Authorized Mining Permit
              </h3>
              <button
                onClick={() => setShowMiningModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateMiningAuth}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Lease / Permit Number *</label>
                <input
                  type="text"
                  placeholder="e.g. ML-2024-MIN-009"
                  value={permitNum}
                  onChange={(e) => setPermitNum(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Mineral Type</label>
                <input
                  type="text"
                  placeholder="e.g. Rough Stone & Blue Metal Aggregate"
                  value={mineralType}
                  onChange={(e) => setMineralType(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Permitted Quota (Tonnes)</label>
                  <input
                    type="number"
                    value={permittedWeight}
                    onChange={(e) => setPermittedWeight(Number(e.target.value))}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Validity Until</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMiningModal(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADII.md,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: RADII.md,
                    border: 'none',
                    backgroundColor: '#B45309',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Permit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Edit Company Details ── */}
      {showEditCompanyModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                Update Company &amp; Fleet Details
              </h3>
              <button
                onClick={() => setShowEditCompanyModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateCompany}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Company Legal Name *</label>
                <input
                  type="text"
                  value={editCompName}
                  onChange={(e) => setEditCompName(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Registration / CIN Number *</label>
                <input
                  type="text"
                  value={editCompReg}
                  onChange={(e) => setEditCompReg(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Helpline / Dispatch Phone</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Operating Headquarters / Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Primary Mining Zone Area</label>
                <input
                  type="text"
                  value={editZoneName}
                  onChange={(e) => setEditZoneName(e.target.value)}
                  placeholder="e.g. Sirumalai Foothill Extraction Zone A-1"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditCompanyModal(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADII.md,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: RADII.md,
                    border: 'none',
                    backgroundColor: '#1E3A8A',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransporterPortalPage;
