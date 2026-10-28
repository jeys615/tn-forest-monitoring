import React, { useState, useEffect } from 'react';
import type { DatePreset } from '../../hooks/useZoneScopedParams';
import { COLORS, FONT, RADII, SPACE } from '../../styles/theme';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  datePreset?: DatePreset;
  preset?: DatePreset;
  activePreset?: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  onRangeChange?: (start: string, end: string) => void;
  onCustomRangeChange?: (start: string, end: string) => void;
  onClear: () => void;
  label?: string;
  style?: React.CSSProperties;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  startDate,
  endDate,
  datePreset,
  preset,
  activePreset,
  onPresetChange,
  onRangeChange,
  onCustomRangeChange,
  onClear,
  label = 'Date Window',
  style,
}) => {
  const currentPreset: DatePreset = datePreset || preset || activePreset || 'all';
  const handleRangeChange = onRangeChange || onCustomRangeChange || (() => {});
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const [showCustomInputs, setShowCustomInputs] = useState(currentPreset === 'custom');

  useEffect(() => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
    setShowCustomInputs(currentPreset === 'custom' || Boolean(startDate || endDate));
  }, [startDate, endDate, currentPreset]);

  const handlePresetClick = (p: DatePreset) => {
    if (p === 'custom') {
      setShowCustomInputs(true);
      onPresetChange('custom');
    } else {
      setShowCustomInputs(false);
      onPresetChange(p);
    }
  };

  const handleApplyCustom = () => {
    handleRangeChange(customStart, customEnd);
  };

  const hasActiveFilter = currentPreset !== 'all' || Boolean(startDate || endDate);

  const presets: { id: DatePreset; label: string }[] = [
    { id: 'all', label: 'All Time' },
    { id: 'today', label: 'Today' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: 'custom', label: 'Custom Range' },
  ];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE.sm,
        flexWrap: 'wrap',
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
        <span>{label}:</span>
      </div>

      {/* Preset Buttons Group */}
      <div
        style={{
          display: 'inline-flex',
          borderRadius: RADII.md,
          backgroundColor: '#F1F5F9',
          padding: '2px',
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {presets.map((p) => {
          const isActive = currentPreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetClick(p.id)}
              style={{
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? COLORS.primaryDark : COLORS.textMuted,
                backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                border: 'none',
                borderRadius: RADII.sm,
                boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom Inputs */}
      {showCustomInputs && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            aria-label="Start date"
            style={{
              padding: '5px 8px',
              fontSize: '12px',
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.sm,
              color: COLORS.text,
              backgroundColor: COLORS.surface,
              outline: 'none',
            }}
          />
          <span style={{ color: COLORS.textMuted, fontSize: '12px' }}>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            aria-label="End date"
            style={{
              padding: '5px 8px',
              fontSize: '12px',
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADII.sm,
              color: COLORS.text,
              backgroundColor: COLORS.surface,
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleApplyCustom}
            style={{
              padding: '5px 10px',
              backgroundColor: COLORS.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: RADII.sm,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
      )}

      {/* Clear Button */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onClear}
          title="Clear date filter"
          style={{
            padding: '4px 8px',
            backgroundColor: '#F8FAFC',
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADII.sm,
            color: COLORS.textMuted,
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span>Clear Date</span>
        </button>
      )}
    </div>
  );
};
