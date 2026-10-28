import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ZoneDto } from '@tn-forest/shared/types';
import { ZoneCategory } from '@tn-forest/shared/types';
import { COLORS, FONT, RADII, SHADOWS, SPACE } from '../../styles/theme';

interface ZoneContextHeaderProps {
  zone: ZoneDto | undefined;
  isInvalid?: boolean;
  invalidZoneId?: string;
  onClearZone?: () => void;
  onClear?: () => void;
  currentModule?: string;
  currentModulePath?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
    preset?: string;
  };
}

const CATEGORY_COLORS: Record<ZoneCategory, { bg: string; text: string; border: string }> = {
  [ZoneCategory.PROTECTED_FOREST]: { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  [ZoneCategory.RESERVED_AREA]: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  [ZoneCategory.COMMERCIAL_LEASE]: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  [ZoneCategory.SUSPICIOUS_HOTSPOT]: { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  [ZoneCategory.GENERAL]: { bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },
};

const MODULE_LINKS = [
  { id: 'areas', label: 'Monitoring Areas', path: '/areas' },
  { id: 'satellite', label: 'Satellite Catalog', path: '/satellite' },
  { id: 'monitoring', label: 'Monitoring Jobs', path: '/monitoring' },
  { id: 'baselines', label: 'Baselines', path: '/baselines' },
  { id: 'changes', label: 'Change Detection', path: '/changes' },
];

export const ZoneContextHeader: React.FC<ZoneContextHeaderProps> = ({
  zone,
  isInvalid = false,
  invalidZoneId = '',
  onClearZone,
  onClear,
  currentModule,
  currentModulePath,
  dateRange,
}) => {
  const [showQuickLinks, setShowQuickLinks] = useState(false);
  const handleClear = onClearZone || onClear || (() => {});

  if (isInvalid) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: RADII.md,
          marginBottom: SPACE.lg,
          color: '#991B1B',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <div style={{ fontWeight: 600, fontSize: FONT.sizeMd }}>
              Zone Identifier Not Found
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: '#B91C1C' }}>
              The requested zone identifier &quot;{invalidZoneId}&quot; does not match any registered
              monitored zone. Showing unfiltered data.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: '5px 12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #F87171',
            borderRadius: RADII.sm,
            color: '#B91C1C',
            fontSize: FONT.sizeSm,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Reset to All Zones
        </button>
      </div>
    );
  }

  if (!zone) return null;

  const catStyle = CATEGORY_COLORS[zone.category] || CATEGORY_COLORS[ZoneCategory.GENERAL];
  const centerCoords = zone.centerPoint?.coordinates;
  const coordDisplay =
    centerCoords && centerCoords.length >= 2
      ? `${centerCoords[1].toFixed(4)}° N, ${centerCoords[0].toFixed(4)}° E`
      : 'Coordinates N/A';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px 16px',
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `4px solid ${COLORS.primary}`,
        borderRadius: RADII.md,
        boxShadow: SHADOWS.sm,
        marginBottom: SPACE.lg,
      }}
    >
      {/* Top Breadcrumb & Back Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${COLORS.borderLight}`,
          paddingBottom: '8px',
          gap: SPACE.md,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleClear}
            title="Return to All Zones directory for this module"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: '#F1F5F9',
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.sm,
              color: COLORS.primaryDark,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#E2E8F0';
              e.currentTarget.style.borderColor = COLORS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F1F5F9';
              e.currentTarget.style.borderColor = COLORS.border;
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>All Zones</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: COLORS.textMuted,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {/* SATELLITE MONITORING */}
            <span>SATELLITE MONITORING</span>
            <span>/</span>
            <span>MONITORING</span>
            {currentModule && (
              <>
                <span>/</span>
                <span style={{ color: COLORS.text }}>{currentModule}</span>
              </>
            )}
            <span>/</span>
            <span style={{ color: COLORS.primary, fontWeight: 700 }}>{zone.name}</span>
          </div>
        </div>

        <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
          Zone Workspace Active
        </div>
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
        {/* Left: Zone identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: RADII.sm,
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: COLORS.primaryDark,
                }}
              >
                {zone.name}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: catStyle.bg,
                  color: catStyle.text,
                  border: `1px solid ${catStyle.border}`,
                  padding: '2px 7px',
                  borderRadius: RADII.sm,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {zone.category?.replace(/_/g, ' ')}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: COLORS.textMuted,
                  backgroundColor: '#F1F5F9',
                  padding: '2px 6px',
                  borderRadius: RADII.xs,
                  fontFamily: FONT.mono,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                {zone.zoneId}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginTop: '3px',
                fontSize: '12px',
                color: COLORS.textMuted,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontFamily: FONT.mono }}>{coordDisplay}</span>
              {zone.monitoringTracks && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: COLORS.textLight, textTransform: 'uppercase', fontWeight: 600 }}>Tracks:</span>
                  {zone.monitoringTracks.optical?.enabled && (
                    <span className="ws-sensor-badge ws-sensor-optical">OPTICAL</span>
                  )}
                  {zone.monitoringTracks.sar?.enabled && (
                    <span className="ws-sensor-badge ws-sensor-sar">SAR</span>
                  )}
                </span>
              )}
              {zone.status && (
                <span>
                  Status: <strong style={{ color: COLORS.text }}>{zone.status}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowQuickLinks(!showQuickLinks)}
            style={{
              padding: '5px 10px',
              backgroundColor: showQuickLinks ? '#EFF6FF' : COLORS.surfaceAlt,
              border: `1px solid ${showQuickLinks ? '#93C5FD' : COLORS.border}`,
              borderRadius: RADII.sm,
              color: showQuickLinks ? '#1D4ED8' : COLORS.text,
              fontSize: FONT.sizeSm,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Switch Workspace</span>
            <span style={{ fontSize: '9px' }}>{showQuickLinks ? '▲' : '▼'}</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: '5px 10px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: RADII.sm,
              color: '#991B1B',
              fontSize: FONT.sizeSm,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>Clear Filter</span>
          </button>
        </div>
      </div>

      {/* Quick Launch Drawer */}
      {showQuickLinks && (
        <div
          style={{
            marginTop: '4px',
            paddingTop: '8px',
            borderTop: `1px dashed ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: COLORS.textMuted,
              marginRight: '4px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            JUMP TO:
          </span>
          {MODULE_LINKS.filter((m) => m.id !== currentModule && m.path !== currentModulePath).map((link) => {
            const queryParams = new URLSearchParams();
            queryParams.set('zoneId', zone.id || zone.zoneId);
            if (dateRange?.startDate) queryParams.set('startDate', dateRange.startDate);
            if (dateRange?.endDate) queryParams.set('endDate', dateRange.endDate);
            if (dateRange?.preset && dateRange.preset !== 'all') queryParams.set('preset', dateRange.preset);
            const targetUrl = `${link.path}?${queryParams.toString()}`;
            return (
              <Link
                key={link.id}
                to={targetUrl}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  backgroundColor: '#F8FAFC',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADII.sm,
                  color: COLORS.text,
                  textDecoration: 'none',
                  transition: 'all 0.12s ease',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#EFF6EF';
                  e.currentTarget.style.borderColor = COLORS.accent;
                  e.currentTarget.style.color = COLORS.primary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.color = COLORS.text;
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
