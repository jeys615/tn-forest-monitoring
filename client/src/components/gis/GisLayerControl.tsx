import React from 'react';
import { GisMapMode, SensorType } from '@tn-forest/shared/types';
import { FONT, SPACE, RADII } from '../../styles/theme';

export type BaseMapType = 'SATELLITE' | 'STREET' | 'TOPO';

export interface GisLayerControlProps {
  baseMap: BaseMapType;
  onBaseMapChange: (baseMap: BaseMapType) => void;
  activeMode: GisMapMode;
  onModeChange: (mode: GisMapMode) => void;
  sensorFilter: 'ALL' | SensorType;
  onSensorFilterChange: (filter: 'ALL' | SensorType) => void;
  showBoundary: boolean;
  onToggleBoundary: (show: boolean) => void;
  showChangeOverlay: boolean;
  onToggleChangeOverlay: (show: boolean) => void;
  showAlerts: boolean;
  onToggleAlerts: (show: boolean) => void;
  showMiningLayer: boolean;
  onToggleMiningLayer: (show: boolean) => void;
  overlayOpacity: number;
  onOpacityChange: (opacity: number) => void;
}

export const GisLayerControl: React.FC<GisLayerControlProps> = ({
  baseMap,
  onBaseMapChange,
  activeMode,
  onModeChange,
  sensorFilter,
  onSensorFilterChange,
  showBoundary,
  onToggleBoundary,
  showChangeOverlay,
  onToggleChangeOverlay,
  showAlerts,
  onToggleAlerts,
  showMiningLayer,
  onToggleMiningLayer,
  overlayOpacity,
  onOpacityChange,
}) => {
  const BASE_MAPS: Array<{ id: BaseMapType; label: string; icon: React.ReactNode; desc: string }> = [
    {
      id: 'SATELLITE',
      label: 'Esri Satellite',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 9.17l4.24-4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M9.17 14.83L4.93 19.07"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)"/></svg>,
      desc: 'World Imagery (High-Res)',
    },
    {
      id: 'STREET',
      label: 'OpenStreetMap',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
      desc: 'Cartographic Standard',
    },
    {
      id: 'TOPO',
      label: 'USGS Topo',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3l4 8 5-5 5 15H2L8 3z"/></svg>,
      desc: 'Elevation & Relief',
    },
  ];

  const ANALYSIS_MODES: Array<{
    id: GisMapMode;
    label: string;
    category: 'OPTICAL' | 'SAR' | 'CHANGE';
    badge: string;
  }> = [
    { id: GisMapMode.CHANGE_DETECTION, label: 'Change Detection', category: 'CHANGE', badge: 'Chg' },
    { id: GisMapMode.NDVI, label: 'NDVI (Vegetation)', category: 'OPTICAL', badge: 'Opt' },
    { id: GisMapMode.NDWI, label: 'NDWI (Water)', category: 'OPTICAL', badge: 'Opt' },
    { id: GisMapMode.NDBI, label: 'NDBI (Built-up)', category: 'OPTICAL', badge: 'Opt' },
    { id: GisMapMode.BSI, label: 'BSI (Bare Soil)', category: 'OPTICAL', badge: 'Opt' },
    { id: GisMapMode.SAVI, label: 'SAVI (Soil Adjusted)', category: 'OPTICAL', badge: 'Opt' },
    { id: GisMapMode.EVI, label: 'EVI (Enhanced Veg)', category: 'OPTICAL', badge: 'Opt' },
    { id: GisMapMode.SAR_VV, label: 'SAR VV Backscatter', category: 'SAR', badge: 'S-1' },
    { id: GisMapMode.SAR_VH, label: 'SAR VH Cross-Pol', category: 'SAR', badge: 'S-1' },
    { id: GisMapMode.SAR_VV_VH, label: 'SAR VV/VH Ratio', category: 'SAR', badge: 'S-1' },
    { id: GisMapMode.MINING_ANALYSIS, label: 'Mining & Excavation', category: 'CHANGE', badge: 'Mine' },
  ];

  const filteredModes = ANALYSIS_MODES.filter((mode) => {
    if (sensorFilter === 'ALL') return true;
    if (sensorFilter === SensorType.OPTICAL) return mode.category === 'OPTICAL' || mode.category === 'CHANGE';
    if (sensorFilter === SensorType.SAR) return mode.category === 'SAR' || mode.category === 'CHANGE';
    return true;
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.md,
        padding: SPACE.md,
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: FONT.family,
        fontSize: FONT.sizeSm,
        height: '100%',
        overflowY: 'auto',
        borderRight: '1px solid #334155',
      }}
    >
      {/* ─── 1. Base Map Selection ─── */}
      <div>
        <div
          style={{
            fontSize: FONT.sizeXs,
            fontWeight: FONT.weightBold,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: SPACE.xs,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
          Base Map Layer
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {BASE_MAPS.map((bm) => {
            const isActive = baseMap === bm.id;
            return (
              <button
                key={bm.id}
                onClick={() => onBaseMapChange(bm.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: RADII.md,
                  border: `1px solid ${isActive ? '#52b788' : '#334155'}`,
                  backgroundColor: isActive ? 'rgba(82,183,136,0.15)' : '#1e293b',
                  color: isActive ? '#86efac' : '#e2e8f0',
                  cursor: 'pointer',
                  fontSize: FONT.sizeSm,
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ fontWeight: isActive ? FONT.weightBold : FONT.weightMedium, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {bm.icon}
                    <span>{bm.label}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{bm.desc}</div>
                </div>
                {isActive && (
                  <span
                    style={{
                      fontSize: '10px',
                      backgroundColor: '#52b788',
                      color: '#0f2b1e',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontWeight: FONT.weightBold,
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 2. Sensor Track Filter ─── */}
      <div>
        <div
          style={{
            fontSize: FONT.sizeXs,
            fontWeight: FONT.weightBold,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: SPACE.xs,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 9.17l4.24-4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M9.17 14.83L4.93 19.07"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)"/></svg>
          Sensor Track Filter
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
          {(['ALL', SensorType.OPTICAL, SensorType.SAR] as const).map((filter) => {
            const isActive = sensorFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => onSensorFilterChange(filter)}
                style={{
                  padding: '4px 6px',
                  borderRadius: RADII.sm,
                  border: `1px solid ${isActive ? '#52b788' : '#334155'}`,
                  backgroundColor: isActive ? '#52b788' : '#1e293b',
                  color: isActive ? '#0f2b1e' : '#e2e8f0',
                  fontWeight: isActive ? FONT.weightBold : FONT.weightMedium,
                  fontSize: FONT.sizeXs,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {filter === 'ALL' ? 'All' : filter === SensorType.OPTICAL ? 'Optical' : 'SAR (S-1)'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 3. Analysis Layer Selection ─── */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: FONT.sizeXs,
            fontWeight: FONT.weightBold,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: SPACE.xs,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Spectral / SAR Analysis
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '240px', overflowY: 'auto' }}>
          {filteredModes.map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onModeChange(mode.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: RADII.sm,
                  border: `1px solid ${isActive ? '#38bdf8' : '#1e293b'}`,
                  backgroundColor: isActive ? 'rgba(56,189,248,0.18)' : '#1e293b',
                  color: isActive ? '#7dd3fc' : '#cbd5e1',
                  cursor: 'pointer',
                  fontSize: FONT.sizeXs,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: isActive ? FONT.weightBold : FONT.weightNormal }}>
                  {mode.label}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    backgroundColor:
                      mode.category === 'OPTICAL'
                        ? 'rgba(34,197,94,0.2)'
                        : mode.category === 'SAR'
                          ? 'rgba(168,85,247,0.2)'
                          : 'rgba(234,179,8,0.2)',
                    color:
                      mode.category === 'OPTICAL'
                        ? '#86efac'
                        : mode.category === 'SAR'
                          ? '#d8b4fe'
                          : '#fde047',
                  }}
                >
                  {mode.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 4. Layer Visibility Toggles ─── */}
      <div>
        <div
          style={{
            fontSize: FONT.sizeXs,
            fontWeight: FONT.weightBold,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: SPACE.xs,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Layer Visibility
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, cursor: 'pointer', fontSize: FONT.sizeXs }}>
            <input
              type="checkbox"
              checked={showBoundary}
              onChange={(e) => onToggleBoundary(e.target.checked)}
            />
            <span>Area Boundary Polygon</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, cursor: 'pointer', fontSize: FONT.sizeXs }}>
            <input
              type="checkbox"
              checked={showChangeOverlay}
              onChange={(e) => onToggleChangeOverlay(e.target.checked)}
            />
            <span>Changed-Area Detection Mask</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, cursor: 'pointer', fontSize: FONT.sizeXs }}>
            <input
              type="checkbox"
              checked={showAlerts}
              onChange={(e) => onToggleAlerts(e.target.checked)}
            />
            <span>Alert Centroids &amp; Hotspots</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, cursor: 'pointer', fontSize: FONT.sizeXs }}>
            <input
              type="checkbox"
              checked={showMiningLayer}
              onChange={(e) => onToggleMiningLayer(e.target.checked)}
            />
            <span>Excavation / Mining Polygons</span>
          </label>
        </div>
      </div>

      {/* ─── 5. Overlay Opacity Slider ─── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: FONT.sizeXs,
            color: '#94a3b8',
            marginBottom: '2px',
          }}
        >
          <span>Overlay Opacity</span>
          <span>{Math.round(overlayOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="0.9"
          step="0.05"
          value={overlayOpacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }}
        />
      </div>
    </div>
  );
};
