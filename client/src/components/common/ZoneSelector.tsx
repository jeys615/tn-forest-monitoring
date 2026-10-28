import React from 'react';
import type { ZoneDto } from '@tn-forest/shared/types';
import { COLORS, FONT, RADII, SPACE } from '../../styles/theme';

interface ZoneSelectorProps {
  zones: ZoneDto[];
  selectedZoneId: string;
  onSelectZone: (zoneId: string) => void;
  allowAllZones?: boolean;
  allZonesLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  style?: React.CSSProperties;
}

const LocationPinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const ZoneSelector: React.FC<ZoneSelectorProps> = ({
  zones,
  selectedZoneId,
  onSelectZone,
  allowAllZones = true,
  allZonesLabel = 'All Monitored Zones',
  placeholder = 'Select a Zone...',
  disabled = false,
  label = 'Zone',
  style,
}) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE.sm,
        minWidth: 260,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: FONT.sizeSm,
          fontWeight: 600,
          color: COLORS.textMuted,
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ color: COLORS.accent, display: 'flex', alignItems: 'center' }}>
          <LocationPinIcon />
        </span>
        <span>{label}:</span>
      </div>

      <select
        value={selectedZoneId}
        onChange={(e) => onSelectZone(e.target.value)}
        disabled={disabled}
        aria-label="Filter by Zone"
        style={{
          flex: 1,
          padding: '7px 11px',
          fontSize: FONT.sizeMd,
          fontWeight: selectedZoneId ? 600 : 400,
          color: selectedZoneId ? COLORS.primaryDark : COLORS.text,
          backgroundColor: selectedZoneId ? '#F0FDF4' : COLORS.surface,
          border: selectedZoneId ? `1px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
          borderRadius: RADII.md,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: selectedZoneId ? '0 0 0 1px rgba(45, 106, 79, 0.15)' : 'none',
        }}
      >
        {allowAllZones && <option value="">{allZonesLabel}</option>}
        {!allowAllZones && !selectedZoneId && <option value="">{placeholder}</option>}
        {zones.map((z) => {
          const categoryTag = z.category ? ` [${z.category.replace(/_/g, ' ')}]` : '';
          return (
            <option key={z.id} value={z.id}>
              {z.name} ({z.zoneId}){categoryTag}
            </option>
          );
        })}
      </select>

      {selectedZoneId && (
        <button
          type="button"
          onClick={() => onSelectZone('')}
          title="Clear zone filter"
          style={{
            padding: '5px 8px',
            backgroundColor: '#F8FAFC',
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADII.md,
            color: COLORS.textMuted,
            fontSize: FONT.sizeXs,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F1F5F9';
            e.currentTarget.style.color = COLORS.dangerText;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F8FAFC';
            e.currentTarget.style.color = COLORS.textMuted;
          }}
        >
          <CloseIcon />
          <span>Clear</span>
        </button>
      )}
    </div>
  );
};
