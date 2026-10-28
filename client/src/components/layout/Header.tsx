import React from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { COLORS, FONT, RADII } from '../../styles/theme';

interface RouteMeta {
  title: string;
  category: string;
}

const ROUTE_DIRECTORY: Record<string, RouteMeta> = {
  '/': { title: 'Executive Overview Dashboard', category: 'Overview' },
  '/intelligence': { title: 'Intelligence Workstation', category: 'Intelligence' },
  '/areas': { title: 'Monitored Areas', category: 'Monitoring' },
  '/satellite': { title: 'Satellite Catalog', category: 'Monitoring' },
  '/monitoring': { title: 'Automated Monitoring Jobs', category: 'Monitoring' },
  '/baselines': { title: 'Baseline Reference Catalog', category: 'Monitoring' },
  '/changes': { title: 'Change Detection & Analysis', category: 'Monitoring' },
  '/temporary-analysis': { title: 'Temporary GIS Analysis', category: 'Monitoring' },
  '/alerts': { title: 'Incident Alerts & Field Verification', category: 'Monitoring & Cases' },
  '/enforcement-cases': { title: 'Investigation & Case Management', category: 'Monitoring & Cases' },
  '/mining-authorizations': { title: 'Mining Permits & Extraction Quotas', category: 'Logistics' },
  '/vehicles': { title: 'Vehicle Fleet Registry', category: 'Logistics' },
  '/drivers': { title: 'Authorized Driver Registry', category: 'Logistics' },
  '/epass': { title: 'Transit E-Pass System', category: 'Logistics' },
  '/checkpoints': { title: 'Checkpoint Surveillance & Verification', category: 'Logistics' },
  '/reconciliation': { title: 'Mining & Transport Reconciliation', category: 'Logistics' },
  '/reports': { title: 'Statutory Reports & Analytics', category: 'Reporting' },
  '/users': { title: 'User Management & Permissions', category: 'Administration' },
  '/profile': { title: 'Officer Profile & Credentials', category: 'Account' },
  '/unauthorized': { title: 'Access Restricted', category: 'System' },
};

const Header: React.FC = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { isOnline } = useNetworkStatus();

  const zoneIdParam = searchParams.get('zoneId');
  const routeMeta = ROUTE_DIRECTORY[pathname] || {
    title: pathname.replace('/', '').replace(/-/g, ' ').toUpperCase() || 'Satellite Monitoring System',
    category: 'Workstation',
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'SM';

  return (
    <header
      style={{
        height: '50px',
        backgroundColor: COLORS.surface,
        color: COLORS.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: `1px solid ${COLORS.border}`,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        flexShrink: 0,
        zIndex: 15,
      }}
    >
      {/* ── Left: Breadcrumb / Page Title / Context ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: COLORS.textMuted }}>
          <span style={{ fontWeight: 600, color: COLORS.primaryDark }}>TN FOREST MONITORING</span>
          <span>/</span>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>
            {routeMeta.category}
          </span>
          <span>/</span>
        </div>

        <h1
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: COLORS.text,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            margin: 0,
          }}
        >
          {routeMeta.title}
        </h1>

        {/* Optional Active Zone Context Tag */}
        {zoneIdParam && (
          <div
            title={`Active Monitored Zone Filter: ${zoneIdParam}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 8px',
              borderRadius: RADII.sm,
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: FONT.mono,
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Zone:</span>
            <span>{zoneIdParam}</span>
          </div>
        )}
      </div>

      {/* ── Right Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        {/* System Online / Offline Badge */}
        <div
          title={
            isOnline
              ? 'Workstation System Status: Connected / GEE Operational'
              : 'Workstation System Status: Offline (Background network operations paused)'
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            borderRadius: RADII.full,
            backgroundColor: isOnline ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${isOnline ? '#BBF7D0' : '#FECACA'}`,
            fontSize: '11px',
            fontWeight: 600,
            color: isOnline ? '#166534' : '#991B1B',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isOnline ? '#10B981' : '#EF4444',
              display: 'inline-block',
            }}
          />
          <span style={{ letterSpacing: '0.04em' }}>{isOnline ? 'LIVE' : 'OFFLINE'}</span>
        </div>

        {/* User Chip */}
        {user && (
          <Link
            to="/profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              padding: '2px 6px',
              borderRadius: RADII.sm,
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
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
            <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: COLORS.text,
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: COLORS.textLight,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  marginTop: '1px',
                }}
              >
                {user.role?.replace(/_/g, ' ')}
              </div>
            </div>
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;
