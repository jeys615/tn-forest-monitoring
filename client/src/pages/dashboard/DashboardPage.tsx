import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService, type HealthCheckResponse } from '../../services/api.service';
import { userService } from '../../services/user.service';
import { zoneService } from '../../services/zone.service';
import { satelliteService } from '../../services/satellite.service';
import { useAuth } from '../../hooks/useAuth';
import { Permission, UserRole } from '@tn-forest/shared/types';
import Loading from '../../components/common/Loading';
import StatCard from '../../components/ui/StatCard';
import SectionCard from '../../components/ui/SectionCard';
import StatusBadge, { type BadgeVariant } from '../../components/ui/StatusBadge';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

/* ─── Inline SVG Icons ─────────────────────────────────────── */
const Icons = {
  Users: () => (
    <svg
      width="22"
      height="22"
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
  Map: () => (
    <svg
      width="22"
      height="22"
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
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
      <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M20.49 3.51a12 12 0 0 1 0 16.97" />
      <path d="M3.51 20.49a12 12 0 0 1 0-16.97" />
    </svg>
  ),
  Server: () => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  ArrowRight: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

/* ─── Module Nav Card ──────────────────────────────────────── */
interface ModuleCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  color: string;
  bgColor: string;
  canAccess: boolean;
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  title,
  description,
  icon,
  to,
  color,
  bgColor,
  canAccess,
}) => {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => canAccess && navigate(to)}
      style={{
        backgroundColor: COLORS.surface,
        borderRadius: RADII.lg,
        boxShadow: SHADOWS.sm,
        border: `1px solid ${COLORS.border}`,
        padding: SPACE['2xl'],
        cursor: canAccess ? 'pointer' : 'default',
        opacity: canAccess ? 1 : 0.5,
        transition: 'box-shadow 0.15s, transform 0.15s',
        animation: 'fadeIn 0.3s ease',
      }}
      onMouseEnter={(e) => {
        if (canAccess) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = SHADOWS.md;
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = SHADOWS.sm;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: RADII.md,
            backgroundColor: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        {canAccess && (
          <div style={{ color: COLORS.textLight }}>
            <Icons.ArrowRight />
          </div>
        )}
      </div>
      <div style={{ marginTop: SPACE.lg }}>
        <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightSemibold, color: COLORS.text }}>
          {title}
        </div>
        <div
          style={{
            fontSize: FONT.sizeMd,
            color: COLORS.textMuted,
            marginTop: SPACE.xs,
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
};

/* ─── DashboardPage ────────────────────────────────────────── */
const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [zoneCount, setZoneCount] = useState<number | null>(null);
  const [satelliteCount, setSatelliteCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const canReadUsers =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.USER_READ);
  const canReadAreas =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.AREA_READ);
  const canReadSatellite =
    user?.role === UserRole.SUPER_ADMIN || user?.permissions.includes(Permission.MONITORING_READ);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.allSettled([
        apiService
          .healthCheck()
          .then(setHealth)
          .catch(() => null),
        canReadUsers
          ? userService
              .getUsers({})
              .then((u) => setUserCount(u.length))
              .catch(() => null)
          : Promise.resolve(),
        canReadAreas
          ? zoneService
              .getZones()
              .then((z) => setZoneCount(z.length))
              .catch(() => null)
          : Promise.resolve(),
        canReadSatellite
          ? satelliteService
              .getImages({})
              .then((s) => setSatelliteCount(s.length))
              .catch(() => null)
          : Promise.resolve(),
      ]);
      setLoading(false);
    };
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uptime = health
    ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
    : null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  if (loading) return <Loading message="Loading dashboard..." fullPage />;

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      {/* ── Welcome ── */}
      <div style={{ marginBottom: SPACE['2xl'] }}>
        <h1 style={{ fontSize: FONT.size4xl, fontWeight: FONT.weightBold, color: COLORS.primary }}>
          {greeting}, {user?.name?.split(' ')[0] ?? 'Officer'}
        </h1>
        <p style={{ fontSize: FONT.sizeMd, color: COLORS.textMuted, marginTop: SPACE.xs }}>
          TN Forest &amp; Resource Monitoring System — Executive Geospatial Overview
        </p>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: SPACE.lg,
          marginBottom: SPACE['2xl'],
        }}
      >
        <StatCard
          label="System Status"
          value={health ? (health.status === 'healthy' ? 'Online' : 'Degraded') : 'Unknown'}
          icon={<Icons.Server />}
          description={
            health ? `DB: ${health.database.status} · Uptime: ${uptime}` : 'Unable to connect'
          }
          color={health?.status === 'healthy' ? COLORS.successText : COLORS.dangerText}
          bgColor={health?.status === 'healthy' ? COLORS.successBg : COLORS.dangerBg}
        />

        {canReadUsers && (
          <StatCard
            label="Total Users"
            value={userCount !== null ? userCount : '—'}
            icon={<Icons.Users />}
            description="Registered system accounts"
            color="#1E40AF"
            bgColor="#DBEAFE"
          />
        )}

        {canReadAreas && (
          <StatCard
            label="Monitored Areas"
            value={zoneCount !== null ? zoneCount : '—'}
            icon={<Icons.Map />}
            description="Active geospatial zones"
            color={COLORS.accent}
            bgColor="#D1FAE5"
          />
        )}

        {canReadSatellite && (
          <StatCard
            label="Satellite Records"
            value={satelliteCount !== null ? satelliteCount : '—'}
            icon={<Icons.Satellite />}
            description="Indexed satellite metadata"
            color="#7C3AED"
            bgColor="#EDE9FE"
          />
        )}
      </div>

      {/* ── Module Navigation ── */}
      <div style={{ marginBottom: SPACE['2xl'] }}>
        <h2
          style={{
            fontSize: FONT.size2xl,
            fontWeight: FONT.weightSemibold,
            color: COLORS.primary,
            marginBottom: SPACE.lg,
          }}
        >
          Monitoring Modules
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: SPACE.lg,
          }}
        >
          <ModuleCard
            title="Monitored Areas"
            description="Manage geospatial zone boundaries, categories, and enforcement status using the interactive map interface."
            icon={<Icons.Map />}
            to="/areas"
            color={COLORS.accent}
            bgColor="#D1FAE5"
            canAccess={!!canReadAreas}
          />
          <ModuleCard
            title="Satellite Catalog"
            description="Query multi-source satellite imagery metadata, manage acquisition records, and inspect spatial footprints."
            icon={<Icons.Satellite />}
            to="/satellite"
            color="#7C3AED"
            bgColor="#EDE9FE"
            canAccess={!!canReadSatellite}
          />
          {canReadUsers && (
            <ModuleCard
              title="User Management"
              description="Administer system accounts, assign roles, manage permissions, and control user access levels."
              icon={<Icons.Users />}
              to="/users"
              color="#1E40AF"
              bgColor="#DBEAFE"
              canAccess={!!canReadUsers}
            />
          )}
        </div>
      </div>

      {/* ── System Status Detail ── */}
      {health && (
        <SectionCard title="System Information">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: SPACE.lg,
            }}
          >
            {(
              [
                {
                  label: 'Server Status',
                  value: health.status,
                  badge: true,
                  variant: (health.status === 'healthy' ? 'success' : 'danger') as BadgeVariant,
                },
                {
                  label: 'Database',
                  value: health.database.status,
                  badge: true,
                  variant: (health.database.status === 'connected'
                    ? 'success'
                    : 'danger') as BadgeVariant,
                },
                {
                  label: 'Environment',
                  value: health.environment,
                  badge: false,
                  variant: 'neutral' as BadgeVariant,
                },
                {
                  label: 'Server Uptime',
                  value: uptime ?? '—',
                  badge: false,
                  variant: 'neutral' as BadgeVariant,
                },
                {
                  label: 'Last Check',
                  value: new Date(health.timestamp).toLocaleTimeString('en-IN'),
                  badge: false,
                  variant: 'neutral' as BadgeVariant,
                },
              ] as const
            ).map(({ label, value, badge, variant }) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: FONT.sizeSm,
                    fontWeight: FONT.weightSemibold,
                    color: COLORS.textMuted,
                    marginBottom: SPACE.xs,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {label}
                </div>
                {badge ? (
                  <StatusBadge label={value} variant={variant} dot />
                ) : (
                  <div
                    style={{
                      fontSize: FONT.sizeLg,
                      fontWeight: FONT.weightMedium,
                      color: COLORS.text,
                    }}
                  >
                    {value}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default DashboardPage;
