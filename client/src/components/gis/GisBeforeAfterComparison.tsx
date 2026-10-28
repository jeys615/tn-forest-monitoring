import React, { useState } from 'react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type MarkedAreaCalculationResultDto,
  type TemporaryAreaTimelineItemDto,
  AlertSeverity,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import 'leaflet/dist/leaflet.css';

interface SynchronizedMapProps {
  bounds?: [number, number][];
}

const SynchronizedMapController: React.FC<SynchronizedMapProps> = ({ bounds }) => {
  const map = useMap();
  React.useEffect(() => {
    if (bounds && bounds.length > 0) {
      const leafletBounds = L.latLngBounds(bounds.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(leafletBounds, { padding: [20, 20] });
    }
  }, [bounds, map]);
  return null;
};

export interface GisBeforeAfterComparisonProps {
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  areaName: string;
  beforeDate?: string;
  beforeSource?: string;
  beforeSensor?: string;
  currentDate?: string;
  currentSource?: string;
  currentSensor?: string;
  calculationResult?: MarkedAreaCalculationResultDto | null;
  timelineItem?: TemporaryAreaTimelineItemDto | null;
  onClose?: () => void;
}

export const GisBeforeAfterComparison: React.FC<GisBeforeAfterComparisonProps> = ({
  boundary,
  areaName,
  beforeDate = '2026-01-05 (Baseline)',
  beforeSource = 'Sentinel-2',
  beforeSensor = 'OPTICAL',
  currentDate = '2026-03-15 (Current)',
  currentSource = 'Sentinel-2',
  currentSensor = 'OPTICAL',
  calculationResult,
  timelineItem,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'SIDE_BY_SIDE' | 'SLIDER'>('SIDE_BY_SIDE');
  const [sliderPosition, setSliderPosition] = useState<number>(50); // percentage 0-100

  const boundaryCoords: [number, number][] =
    !boundary || !boundary.coordinates
      ? []
      : boundary.type === 'MultiPolygon'
      ? ((boundary.coordinates as [number, number][][][])[0]?.[0] || []).map(([lng, lat]) => [lat, lng])
      : ((boundary.coordinates as [number, number][][])[0] || []).map(([lng, lat]) => [lat, lng]);

  const centerPoint: [number, number] =
    boundaryCoords.length > 0 ? boundaryCoords[0] : [11.6643, 78.146];

  const severity = calculationResult?.severity || timelineItem?.severity || 'NONE';
  const affectedPct =
    calculationResult?.affectedAreaPercentage ?? timelineItem?.affectedAreaPercentage ?? 0;
  const changedHa =
    calculationResult?.changedAreaHectares ?? timelineItem?.changedAreaHectares ?? 0;
  const evidenceScore =
    calculationResult?.evidenceStrength ?? timelineItem?.evidenceStrength ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        borderRadius: RADII.lg,
        overflow: 'hidden',
        boxShadow: SHADOWS.lg,
        fontFamily: FONT.family,
      }}
    >
      {/* ─── Header & Comparison Controls ─── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${SPACE.sm} ${SPACE.md}`,
          backgroundColor: '#0f2b1e',
          borderBottom: '1px solid rgba(82,183,136,0.3)',
          gap: SPACE.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#52B788" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeLg }}>
            Before vs After Environmental Comparison: {areaName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          {/* Mode Switcher */}
          <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: RADII.sm, padding: '2px' }}>
            <button
              onClick={() => setViewMode('SIDE_BY_SIDE')}
              style={{
                padding: '4px 10px',
                border: 'none',
                borderRadius: RADII.sm,
                fontSize: FONT.sizeXs,
                fontWeight: viewMode === 'SIDE_BY_SIDE' ? FONT.weightBold : FONT.weightNormal,
                backgroundColor: viewMode === 'SIDE_BY_SIDE' ? '#2d6a4f' : 'transparent',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              Side-by-Side Dual Map
            </button>
            <button
              onClick={() => setViewMode('SLIDER')}
              style={{
                padding: '4px 10px',
                border: 'none',
                borderRadius: RADII.sm,
                fontSize: FONT.sizeXs,
                fontWeight: viewMode === 'SLIDER' ? FONT.weightBold : FONT.weightNormal,
                backgroundColor: viewMode === 'SLIDER' ? '#2d6a4f' : 'transparent',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              Interactive Curtain Slider
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: '4px 10px',
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: RADII.sm,
                fontSize: FONT.sizeXs,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Close
            </button>
          )}
        </div>
      </div>

      {/* ─── Environmental Delta Summary Ribbon ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          padding: '8px 16px',
          backgroundColor: '#1e293b',
          borderBottom: '1px solid #334155',
          fontSize: '12px',
          gap: '12px',
        }}
      >
        <div>
          <span style={{ color: '#94a3b8' }}>Affected Area:</span>{' '}
          <strong style={{ color: '#f8fafc' }}>
            {changedHa.toFixed(2)} ha ({affectedPct.toFixed(1)}%)
          </strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Severity:</span>{' '}
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              backgroundColor:
                severity === AlertSeverity.HIGH
                  ? '#ef4444'
                  : severity === AlertSeverity.MEDIUM
                  ? '#f97316'
                  : severity === AlertSeverity.LOW
                  ? '#eab308'
                  : '#22c55e',
              color: '#ffffff',
            }}
          >
            {severity}
          </span>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Evidence Score:</span>{' '}
          <strong style={{ color: '#52b788' }}>{evidenceScore} / 100</strong>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>Source:</span>{' '}
          <strong style={{ color: '#cbd5e1' }}>
            {beforeSource} → {currentSource}
          </strong>
        </div>
      </div>

      {/* ─── Comparison Maps Area ─── */}
      <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: '360px' }}>
        {viewMode === 'SIDE_BY_SIDE' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%', width: '100%' }}>
            {/* LEFT: BEFORE (Reference/Baseline) */}
            <div style={{ position: 'relative', borderRight: '2px solid #334155' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  zIndex: 1000,
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  padding: '4px 10px',
                  borderRadius: RADII.sm,
                  border: '1px solid #3b82f6',
                  fontSize: '11px',
                }}
              >
                <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>BEFORE:</span> {beforeSource} ({beforeSensor})
                <div style={{ color: '#cbd5e1', fontSize: '10px' }}>{beforeDate}</div>
              </div>
              <MapContainer center={centerPoint} zoom={13} style={{ height: '100%', width: '100%' }}>
                <SynchronizedMapController bounds={boundaryCoords} />
                <TileLayer
                  attribution="Tiles &copy; Esri World Imagery"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={18}
                />
                {boundaryCoords.length > 0 && (
                  <Polygon
                    positions={boundaryCoords}
                    pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
                  />
                )}
              </MapContainer>
            </div>

            {/* RIGHT: CURRENT (Observation/Change Event) */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  zIndex: 1000,
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  padding: '4px 10px',
                  borderRadius: RADII.sm,
                  border: '1px solid #ef4444',
                  fontSize: '11px',
                }}
              >
                <span style={{ color: '#f87171', fontWeight: 'bold' }}>CURRENT:</span> {currentSource} ({currentSensor})
                <div style={{ color: '#cbd5e1', fontSize: '10px' }}>{currentDate}</div>
              </div>
              <MapContainer center={centerPoint} zoom={13} style={{ height: '100%', width: '100%' }}>
                <SynchronizedMapController bounds={boundaryCoords} />
                <TileLayer
                  attribution="Tiles &copy; Esri World Imagery"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={18}
                />
                {boundaryCoords.length > 0 && (
                  <Polygon
                    positions={boundaryCoords}
                    pathOptions={{
                      color: severity === AlertSeverity.HIGH ? '#ef4444' : '#f97316',
                      fillColor: severity === AlertSeverity.HIGH ? '#ef4444' : '#f97316',
                      fillOpacity: 0.35,
                      weight: 2,
                    }}
                  />
                )}
              </MapContainer>
            </div>
          </div>
        ) : (
          /* SLIDER MODE */
          <div style={{ position: 'relative', height: '100%', width: '100%' }}>
            <MapContainer center={centerPoint} zoom={13} style={{ height: '100%', width: '100%' }}>
              <SynchronizedMapController bounds={boundaryCoords} />
              <TileLayer
                attribution="Tiles &copy; Esri World Imagery"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={18}
              />
              {boundaryCoords.length > 0 && (
                <Polygon
                  positions={boundaryCoords}
                  pathOptions={{
                    color: severity === AlertSeverity.HIGH ? '#ef4444' : '#52b788',
                    fillColor: severity === AlertSeverity.HIGH ? '#ef4444' : '#52b788',
                    fillOpacity: (sliderPosition / 100) * 0.4,
                    weight: 2,
                  }}
                />
              )}
            </MapContainer>

            {/* Slider Divider Control */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                padding: '6px 14px',
                borderRadius: RADII.full,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                border: '1px solid #52b788',
              }}
            >
              <span style={{ fontSize: '11px', color: '#60a5fa' }}>BEFORE ({beforeDate})</span>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPosition}
                onChange={(e) => setSliderPosition(Number(e.target.value))}
                style={{ cursor: 'ew-resize', accentColor: '#52b788' }}
              />
              <span style={{ fontSize: '11px', color: '#f87171' }}>AFTER ({currentDate})</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
