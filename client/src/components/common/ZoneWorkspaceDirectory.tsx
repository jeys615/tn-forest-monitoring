import React, { useState, useMemo } from 'react';
import type { ZoneDto } from '@tn-forest/shared/types';
import { ZoneCategory } from '@tn-forest/shared/types';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

export interface ZoneDirectoryStat {
  count?: number;
  countLabel?: string;
  latestDate?: string;
  opticalReady?: boolean;
  sarReady?: boolean;
  statusBadge?: { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' };
  extraNote?: string;
}

export interface ZoneWorkspaceDirectoryProps {
  moduleTitle: string;
  moduleSubtitle?: string;
  moduleBadge?: string;
  department?: string;
  zones: ZoneDto[];
  loading?: boolean;
  onSelectZone: (zoneId: string) => void;
  zoneStats?: Record<string, ZoneDirectoryStat>;
  actionLabel?: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
}

const CATEGORY_COLORS: Record<ZoneCategory, { bg: string; text: string; border: string }> = {
  [ZoneCategory.PROTECTED_FOREST]: { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  [ZoneCategory.RESERVED_AREA]: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  [ZoneCategory.COMMERCIAL_LEASE]: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  [ZoneCategory.SUSPICIOUS_HOTSPOT]: { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  [ZoneCategory.GENERAL]: { bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },
};

export const ZoneWorkspaceDirectory: React.FC<ZoneWorkspaceDirectoryProps> = ({
  moduleTitle,
  moduleSubtitle = 'Select a monitored zone to access dedicated telemetry, records, and operations.',
  moduleBadge,
  department = 'GEOSPATIAL MONITORING DIVISION',
  zones,
  loading = false,
  onSelectZone,
  zoneStats = {},
  actionLabel,
  icon,
  headerActions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const categories = useMemo(() => {
    const set = new Set<string>();
    zones.forEach((z) => {
      if (z.category) set.add(z.category);
    });
    return Array.from(set);
  }, [zones]);

  const filteredZones = useMemo(() => {
    return zones.filter((z) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        z.name.toLowerCase().includes(q) ||
        z.zoneId.toLowerCase().includes(q) ||
        Boolean((z as any).district && String((z as any).district).toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === 'ALL' || z.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [zones, searchTerm, selectedCategory]);

  const defaultAction = actionLabel || 'OPEN WORKSPACE →';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      {/* ─── Module Hero Header (Folder Index Style) ─── */}
      <div
        style={{
          backgroundColor: '#0D1F18',
          color: '#F8FAFC',
          borderRadius: RADII.md,
          padding: '24px 28px',
          border: '1px solid #1B4332',
          boxShadow: SHADOWS.md,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Breadcrumb / Department Line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#52B788',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            {/* SATELLITE MONITORING */}
            <span>SATELLITE MONITORING</span>
            <span>/</span>
            <span>{department}</span>
            <span>/</span>
            <span style={{ color: '#E2E8F0' }}>{moduleTitle}</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: SPACE.md,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {icon && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    borderRadius: RADII.sm,
                    backgroundColor: 'rgba(82, 183, 136, 0.15)',
                    border: '1px solid #2D6A4F',
                    color: '#52B788',
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '22px',
                      fontWeight: 800,
                      letterSpacing: '0.02em',
                      color: '#FFFFFF',
                      lineHeight: 1.2,
                    }}
                  >
                    {moduleTitle}
                  </h1>
                  {moduleBadge && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: '#1B4332',
                        color: '#74C69D',
                        border: '1px solid #2D6A4F',
                        padding: '2px 8px',
                        borderRadius: RADII.xs,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {moduleBadge}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94A3B8',
                      backgroundColor: 'rgba(15, 23, 42, 0.6)',
                      padding: '2px 8px',
                      borderRadius: RADII.xs,
                      border: '1px solid #334155',
                    }}
                  >
                    {zones.length} Registered {zones.length === 1 ? 'Zone' : 'Zones'}
                  </span>
                </div>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '13px',
                    color: '#CBD5E1',
                    maxWidth: '800px',
                    lineHeight: 1.4,
                  }}
                >
                  {moduleSubtitle}
                </p>
              </div>
            </div>

            {headerActions && <div>{headerActions}</div>}
          </div>
        </div>
      </div>

      {/* ─── Search & Category Filter Toolbar ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: SPACE.md,
          padding: '12px 16px',
          backgroundColor: COLORS.surface,
          borderRadius: RADII.md,
          border: `1px solid ${COLORS.border}`,
          boxShadow: SHADOWS.sm,
        }}
      >
        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '280px', flex: 1, maxWidth: '420px' }}>
          <div
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: COLORS.textMuted,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search zones by name, code, or district..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              fontSize: FONT.sizeSm,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.sm,
              backgroundColor: '#F8FAFC',
              color: COLORS.text,
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: COLORS.textMuted,
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: COLORS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginRight: '2px',
            }}
          >
            Category:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: selectedCategory === 'ALL' ? 600 : 500,
              borderRadius: RADII.sm,
              border: `1px solid ${selectedCategory === 'ALL' ? COLORS.primary : COLORS.border}`,
              backgroundColor: selectedCategory === 'ALL' ? '#ECFDF5' : '#FFFFFF',
              color: selectedCategory === 'ALL' ? '#065F46' : COLORS.text,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            All Categories ({zones.length})
          </button>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            const count = zones.filter((z) => z.category === cat).length;
            const style = CATEGORY_COLORS[cat as ZoneCategory] || CATEGORY_COLORS[ZoneCategory.GENERAL];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: isSelected ? 600 : 500,
                  borderRadius: RADII.sm,
                  border: `1px solid ${isSelected ? style.border : COLORS.border}`,
                  backgroundColor: isSelected ? style.bg : '#FFFFFF',
                  color: isSelected ? style.text : COLORS.text,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textTransform: 'capitalize',
                }}
              >
                {cat.replace(/_/g, ' ').toLowerCase()} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Zone Folders / Workspace Cards Grid ─── */}
      {loading ? (
        <div
          style={{
            padding: '48px 20px',
            textAlign: 'center',
            backgroundColor: COLORS.surface,
            borderRadius: RADII.md,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.textMuted,
          }}
        >
          <div style={{ display: 'inline-block', marginBottom: SPACE.sm }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke={COLORS.primary}
              strokeWidth="2"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          </div>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: 500 }}>Loading registered zone workspaces...</div>
        </div>
      ) : filteredZones.length === 0 ? (
        <div
          style={{
            padding: '48px 20px',
            textAlign: 'center',
            backgroundColor: COLORS.surface,
            borderRadius: RADII.md,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.textMuted,
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="1.5"
            style={{ marginBottom: SPACE.sm }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div style={{ fontSize: FONT.sizeMd, fontWeight: 600, color: COLORS.text }}>No Matching Zone Found</div>
          <div style={{ fontSize: FONT.sizeSm, marginTop: '4px' }}>
            No registered monitored zones match your search query &quot;{searchTerm}&quot;.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: SPACE.lg,
          }}
        >
          {filteredZones.map((z) => {
            const catStyle = CATEGORY_COLORS[z.category] || CATEGORY_COLORS[ZoneCategory.GENERAL];
            const stats = zoneStats[z.id] || zoneStats[z.zoneId] || {};
            const centerCoords = z.centerPoint?.coordinates;
            const coordDisplay =
              centerCoords && centerCoords.length >= 2
                ? `${centerCoords[1].toFixed(4)}° N, ${centerCoords[0].toFixed(4)}° E`
                : 'EPSG:4326 Defined';

            return (
              <div
                key={z.id || z.zoneId}
                onClick={() => onSelectZone(z.id || z.zoneId)}
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: RADII.md,
                  border: `1px solid ${COLORS.border}`,
                  boxShadow: SHADOWS.sm,
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  overflow: 'hidden',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.primary;
                  e.currentTarget.style.boxShadow = SHADOWS.md;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.boxShadow = SHADOWS.sm;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Top strip banner */}
                <div
                  style={{
                    backgroundColor: '#0D1F18',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #1B4332',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52B788" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#74C69D',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      ZONE WORKSPACE
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      backgroundColor: catStyle.bg,
                      color: catStyle.text,
                      border: `1px solid ${catStyle.border}`,
                      padding: '2px 7px',
                      borderRadius: RADII.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {z.category?.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Card Body */}
                <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Zone Name & ID */}
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 700,
                        color: COLORS.primaryDark,
                        lineHeight: 1.3,
                      }}
                    >
                      {z.name}
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '4px',
                        fontSize: '11px',
                        color: COLORS.textMuted,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: FONT.mono,
                          backgroundColor: '#F1F5F9',
                          padding: '1px 5px',
                          borderRadius: RADII.xs,
                          border: `1px solid ${COLORS.border}`,
                        }}
                      >
                        {z.zoneId}
                      </span>
                      {(z as any).district && (
                        <span>
                          District: <strong>{(z as any).district}</strong>
                        </span>
                      )}
                      <span>•</span>
                      <span style={{ fontFamily: FONT.mono }}>{coordDisplay}</span>
                    </div>
                  </div>

                  {/* Cadastral & Sensor Status Strip */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      padding: '8px 10px',
                      backgroundColor: '#F8FAFC',
                      borderRadius: RADII.sm,
                      border: `1px solid ${COLORS.borderLight}`,
                      fontSize: '11px',
                    }}
                  >
                    <div>
                      <div style={{ color: COLORS.textMuted, fontSize: '10px', textTransform: 'uppercase' }}>AREA</div>
                      <div style={{ fontWeight: 600, color: COLORS.text, marginTop: '2px' }}>
                        {(z as any).totalAreaHectares != null
                          ? `${(z as any).totalAreaHectares.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ha`
                          : 'Defined Polygon'}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: COLORS.textMuted, fontSize: '10px', textTransform: 'uppercase' }}>SENSORS</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                        <span className="ws-sensor-badge ws-sensor-optical">OPTICAL</span>
                        <span className="ws-sensor-badge ws-sensor-sar">SAR</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ color: COLORS.textMuted, fontSize: '10px', textTransform: 'uppercase' }}>STATUS</div>
                      <div style={{ fontWeight: 600, color: '#16A34A', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16A34A', display: 'inline-block' }} />
                        {z.status || 'ACTIVE'}
                      </div>
                    </div>
                  </div>

                  {/* Module specific stats / highlights (if available) */}
                  {(stats.count !== undefined || stats.latestDate || stats.extraNote) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        backgroundColor: '#ECFDF5',
                        borderRadius: RADII.sm,
                        border: '1px solid #A7F3D0',
                        fontSize: '11px',
                        color: '#065F46',
                      }}
                    >
                      {stats.count !== undefined && (
                        <span>
                          <strong>{stats.count}</strong> {stats.countLabel || 'Records in Zone'}
                        </span>
                      )}
                      {stats.latestDate && (
                        <span style={{ color: '#047857' }}>
                          Latest: <strong>{stats.latestDate}</strong>
                        </span>
                      )}
                      {stats.extraNote && <span>{stats.extraNote}</span>}
                    </div>
                  )}

                  {/* Action Link Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      marginTop: 'auto',
                      paddingTop: '8px',
                      borderTop: `1px solid ${COLORS.borderLight}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: COLORS.primaryDark,
                        letterSpacing: '0.03em',
                      }}
                    >
                      <span>{defaultAction}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
