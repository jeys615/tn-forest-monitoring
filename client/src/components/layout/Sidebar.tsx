import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Permission, UserRole } from '@tn-forest/shared/types';

/* ─── Inline SVG Icons ─────────────────────────────────────── */
const Icon = {
  Dashboard: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  Map: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  ),
  Satellite: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m13 7 1.5 1.5-1.5 1.5M10.5 4.5 9 6l1.5 1.5M7 13l1.5 1.5L7 16" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.5 7.5 18 6l1.5 1.5L18 9zM4.5 16.5 6 15l1.5 1.5L6 18z" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  ),
  Users: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Profile: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Logout: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Leaf: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path
        d="M17 8C8 10 5.9 16.17 3.82 21.34a.93.93 0 0 0 1.42 1.05C7.39 20.5 9.69 18.4 13 17c3-1.3 5-3.6 5-7.5V8z"
        opacity="0.7"
      />
      <path d="M14 4.5C10 6 6 9 4 13c1.5-1 3-1.5 4.5-1.5C12 11.5 15 15 15 19c2-2 3-4.5 3-7.5 0-4-2-7-4-7z" />
    </svg>
  ),
};

/* ─── NavItem ───────────────────────────────────────────────── */
interface NavItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, label, icon, end }) => (
  <li>
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 16px',
        color: isActive ? '#FFFFFF' : '#94A3B8',
        textDecoration: 'none',
        fontSize: '13px',
        fontWeight: isActive ? 600 : 450,
        backgroundColor: isActive ? 'rgba(45, 106, 79, 0.45)' : 'transparent',
        borderLeft: `3px solid ${isActive ? '#52B788' : 'transparent'}`,
        transition: 'all 0.15s ease',
      })}
    >
      <span style={{ display: 'flex', alignItems: 'center', opacity: 0.9 }}>{icon}</span>
      <span style={{ letterSpacing: '0.01em' }}>{label}</span>
    </NavLink>
  </li>
);

/* ─── NavGroup Label ────────────────────────────────────────── */
const NavGroup: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      padding: '14px 16px 6px',
      fontSize: '10px',
      fontWeight: 700,
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      userSelect: 'none',
    }}
  >
    {label}
  </div>
);

/* ─── Role Label Formatter ──────────────────────────────────── */
function getRoleLabel(role?: string): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return 'Super Administrator';
    case UserRole.ADMIN:
      return 'Administrator';
    case UserRole.FOREST_OFFICER:
      return 'Monitoring Officer';
    case UserRole.MINING_OFFICER:
      return 'Mining Officer';
    case UserRole.CHECKPOINT_OFFICER:
      return 'Checkpoint Officer';
    case UserRole.FIELD_OFFICER:
      return 'Field Officer';
    case UserRole.VIEWER:
      return 'Auditor / Viewer';
    default:
      return role?.replace(/_/g, ' ') ?? 'User';
  }
}

/* ─── Sidebar ───────────────────────────────────────────────── */
const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const canReadUsers =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.USER_READ);
  const canReadAreas =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.AREA_READ);
  const canReadSatellite =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.MONITORING_READ);
  const canReadAlerts =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.ALERT_READ);
  const canReadEnforcementCases =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.ENFORCEMENT_CASE_READ);
  const canReadIntelligence =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.INTELLIGENCE_READ);
  const canReadEpass =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.EPASS_READ);
  const canReadCheckpoints =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.CHECKPOINT_READ);
  const canReadReconciliation =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.RECONCILIATION_READ);
  const canReadReports =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.permissions.includes(Permission.INTELLIGENCE_READ) ||
    user?.permissions.includes(Permission.MONITORING_READ);

  const hasLogisticsGroup = canReadEpass || canReadCheckpoints || canReadReconciliation;
  const hasEnforcementGroup = canReadAlerts || canReadEnforcementCases;

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'SM';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside
      style={{
        width: '260px',
        minWidth: '260px',
        flexShrink: 0,
        backgroundColor: '#0D1F18',
        color: '#E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 20,
        height: '100vh',
      }}
    >
      {/* ── Brand / Header ── */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#081410',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '6px',
            backgroundColor: '#1B4332',
            border: '1px solid #2D6A4F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#52B788',
            flexShrink: 0,
          }}
        >
          <Icon.Leaf />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#F8FAFC',
              letterSpacing: '0.04em',
              lineHeight: 1.2,
            }}
          >
            TN FOREST MONITORING
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#64748B',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: '1px',
              fontWeight: 600,
            }}
          >
            GOVERNMENT OF TAMIL NADU
          </div>
        </div>
      </div>

      {/* ── Navigation Tree ── */}
      <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <NavGroup label="Overview" />
          <NavItem to="/" label="Dashboard" icon={<Icon.Dashboard />} end />
          {canReadIntelligence && (
            <NavItem to="/intelligence" label="Intelligence Workstation" icon={<Icon.Dashboard />} />
          )}

          {(canReadAreas || canReadSatellite) && <NavGroup label="Monitoring" />}
          {canReadAreas && <NavItem to="/areas" label="Monitored Areas" icon={<Icon.Map />} />}
          {canReadSatellite && (
            <>
              <NavItem to="/satellite" label="Satellite Catalog" icon={<Icon.Satellite />} />
              <NavItem
                to="/monitoring"
                label="Monitoring Jobs"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                }
              />
              <NavItem
                to="/baselines"
                label="Baselines & Processing"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                }
              />
              <NavItem
                to="/changes"
                label="Change Detection"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                }
              />
              <NavItem
                to="/temporary-analysis"
                label="Temporary Analysis"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                }
              />
              <NavItem
                to="/offline-change-detection"
                label="Offline Change Detection"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                }
              />
            </>
          )}

          {hasEnforcementGroup && (
            <>
              <NavGroup label="Monitoring & Incidents" />
              {canReadAlerts && (
                <NavItem
                  to="/alerts"
                  label="Incident Alerts"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  }
                />
              )}
              {canReadEnforcementCases && (
                <NavItem
                  to="/enforcement-cases"
                  label="Investigation Cases"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  }
                />
              )}
            </>
          )}

          {hasLogisticsGroup && (
            <>
              <NavGroup label="Transport & Logistics" />
              {canReadEpass && (
                <NavItem
                  to="/mining-authorizations"
                  label="Resource & Mining Permits"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  }
                />
              )}
              {(canReadEpass || canReadCheckpoints) && (
                <>
                  <NavItem
                    to="/vehicles"
                    label="Vehicles"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            }
          />
          <NavItem
            to="/drivers"
            label="Drivers"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
          />
                </>
              )}
              {canReadEpass && (
                <NavItem
                  to="/epass"
                  label="Transit E-Passes"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="7" y1="8" x2="17" y2="8" />
                      <line x1="7" y1="12" x2="13" y2="12" />
                    </svg>
                  }
                />
              )}
              {canReadCheckpoints && (
                <NavItem
                  to="/checkpoints"
                  label="Checkpoints"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 21h18M5 21V7l8-4v18M13 7l6 3v11" />
                      <circle cx="9" cy="14" r="2" />
                    </svg>
                  }
                />
              )}
              {canReadReconciliation && (
                <NavItem
                  to="/reconciliation"
                  label="Reconciliation"
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  }
                />
              )}
            </>
          )}

          {canReadReports && (
            <>
              <NavGroup label="Reporting" />
              <NavItem
                to="/reports"
                label="Reports & Analytics"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                }
              />
            </>
          )}

          {canReadUsers && <NavGroup label="Administration" />}
          {canReadUsers && <NavItem to="/users" label="Users & Access" icon={<Icon.Users />} />}
        </ul>
      </nav>

      {/* ── User & Status Footer ── */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '12px 14px',
          backgroundColor: '#081410',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '10px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#1B4332',
              border: '1px solid #2D6A4F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: '#52B788',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#F1F5F9',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.name ?? 'Officer'}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: '#64748B',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 500,
              }}
            >
              {getRoleLabel(user?.role)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <NavLink
            to="/profile"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#CBD5E1',
              textDecoration: 'none',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            <Icon.Profile />
            <span>Profile</span>
          </NavLink>
          <button
            onClick={handleLogout}
            title="Sign out of workstation"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#FCA5A5',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Icon.Logout />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
