import React, { useState, useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  GisMapMode,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type ChangeDetectionDto,
  type MarkedAreaCalculationResultDto,
  type MiningExtractionEstimateDto,
  type AlertDto,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import type { BaseMapType } from './GisLayerControl';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet default icon paths in Vite
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

interface MapControllerProps {
  center?: [number, number];
  zoom?: number;
  bounds?: [number, number][];
}

const MapController: React.FC<MapControllerProps> = ({ center, zoom, bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      const leafletBounds = L.latLngBounds(bounds.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(leafletBounds, { padding: [30, 30] });
    } else if (center) {
      map.setView(center, zoom || 13);
    }
  }, [center, zoom, bounds, map]);
  return null;
};

// Geodesic Area Calculation Helper (Spherical Polygon)
function calculateGeodesicArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const radius = 6378137; // Earth's radius in meters
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % coords.length];
    const lat1 = (p1[0] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const lon1 = (p1[1] * Math.PI) / 180;
    const lon2 = (p2[1] * Math.PI) / 180;
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = Math.abs((area * radius * radius) / 2.0);
  return Math.round(area);
}

// Distance Calculation Helper
function calculateDistanceMeters(p1: [number, number], p2: [number, number]): number {
  const latlng1 = L.latLng(p1[0], p1[1]);
  const latlng2 = L.latLng(p2[0], p2[1]);
  return latlng1.distanceTo(latlng2);
}

interface MapInteractionEventsProps {
  onMouseMove: (lat: number, lng: number) => void;
  measureMode: 'NONE' | 'DISTANCE' | 'AREA';
  onMeasurePoint: (pt: [number, number]) => void;
}

const MapInteractionEvents: React.FC<MapInteractionEventsProps> = ({
  onMouseMove,
  measureMode,
  onMeasurePoint,
}) => {
  useMapEvents({
    mousemove(e) {
      onMouseMove(e.latlng.lat, e.latlng.lng);
    },
    click(e) {
      if (measureMode !== 'NONE') {
        onMeasurePoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
};

export interface GisMapViewerProps {
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  areaName: string;
  isPermanent?: boolean;
  baseMap?: BaseMapType;
  activeMode?: GisMapMode;
  onModeChange?: (mode: GisMapMode) => void;
  selectedResult?: MarkedAreaCalculationResultDto | null;
  changeDetection?: ChangeDetectionDto | null;
  miningEstimate?: MiningExtractionEstimateDto | null;
  alerts?: AlertDto[];
  showBoundary?: boolean;
  showChangeOverlay?: boolean;
  showAlerts?: boolean;
  showMiningLayer?: boolean;
  overlayOpacity?: number;
  showComparisonToggle?: boolean;
  onOpenComparison?: () => void;
}

export const GisMapViewer: React.FC<GisMapViewerProps> = ({
  boundary,
  areaName,
  isPermanent = true,
  baseMap = 'SATELLITE',
  activeMode = GisMapMode.SATELLITE,
  selectedResult,
  changeDetection,
  miningEstimate,
  alerts = [],
  showBoundary = true,
  showChangeOverlay = true,
  showAlerts = true,
  showMiningLayer = true,
  overlayOpacity = 0.45,
  showComparisonToggle = true,
  onOpenComparison,
}) => {
  const [cursorPos, setCursorPos] = useState<{ lat: number; lng: number } | null>(null);
  const [measureMode, setMeasureMode] = useState<'NONE' | 'DISTANCE' | 'AREA'>('NONE');
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);

  // Extract coordinates for Leaflet ([lat, lng])
  const boundaryCoords: [number, number][] = React.useMemo(() => {
    if (!boundary || !boundary.coordinates) return [];
    if (boundary.type === 'MultiPolygon') {
      const polys = boundary.coordinates as [number, number][][][];
      return polys[0] && polys[0][0]
        ? polys[0][0].map(([lng, lat]) => [lat, lng] as [number, number])
        : [];
    }
    const coords = boundary.coordinates as [number, number][][];
    return coords && coords[0]
      ? coords[0].map(([lng, lat]) => [lat, lng] as [number, number])
      : [];
  }, [boundary]);

  const centerPoint: [number, number] = React.useMemo(() => {
    return boundaryCoords.length > 0 ? boundaryCoords[0] : [11.6643, 78.146];
  }, [boundaryCoords]);

  // Derive mode-specific styling and overlay colors
  const getModeOverlayStyle = () => {
    switch (activeMode) {
      case GisMapMode.NDVI:
        return { fillColor: '#16a34a', color: '#15803d', label: 'NDVI Vegetation Health' };
      case GisMapMode.NDWI:
        return { fillColor: '#0284c7', color: '#0369a1', label: 'NDWI Water Index' };
      case GisMapMode.NDBI:
        return { fillColor: '#ea580c', color: '#c2410c', label: 'NDBI Built-Up Index' };
      case GisMapMode.BSI:
        return { fillColor: '#d97706', color: '#b45309', label: 'BSI Bare Soil Index' };
      case GisMapMode.SAVI:
      case GisMapMode.EVI:
        return { fillColor: '#10b981', color: '#047857', label: `${activeMode} Enhanced Vegetation` };
      case GisMapMode.SAR_VV:
      case GisMapMode.SAR_VH:
      case GisMapMode.SAR_VV_VH:
        return { fillColor: '#9333ea', color: '#7e22ce', label: 'SAR Sentinel-1 Backscatter' };
      case GisMapMode.MINING_ANALYSIS:
        return { fillColor: '#e11d48', color: '#be123c', label: 'Mining & Excavation Footprint' };
      case GisMapMode.CHANGE_DETECTION:
      default:
        return { fillColor: '#ef4444', color: '#dc2626', label: 'Multi-Threshold Change Overlay' };
    }
  };

  const overlayStyle = getModeOverlayStyle();

  // Changed geometry extraction - supports both GeoJSONPolygon and GeoJSONMultiPolygon without synthetic fallbacks
  const changedPolygons: [number, number][][] = React.useMemo(() => {
    const geom = selectedResult?.changedGeometry || changeDetection?.changedGeometry;
    if (!geom || !geom.coordinates || !Array.isArray(geom.coordinates)) {
      return [];
    }

    if (geom.type === 'Polygon') {
      const poly = geom as GeoJSONPolygon;
      if (poly.coordinates && poly.coordinates[0] && Array.isArray(poly.coordinates[0])) {
        const ring = poly.coordinates[0]
          .filter((coord) => Array.isArray(coord) && coord.length >= 2)
          .map(([lng, lat]) => [lat, lng] as [number, number]);
        return ring.length >= 3 ? [ring] : [];
      }
      return [];
    }

    if (geom.type === 'MultiPolygon') {
      const multi = geom as GeoJSONMultiPolygon;
      const polys: [number, number][][] = [];
      for (const polygonCoords of multi.coordinates) {
        if (polygonCoords && polygonCoords[0] && Array.isArray(polygonCoords[0])) {
          const ring = polygonCoords[0]
            .filter((coord) => Array.isArray(coord) && coord.length >= 2)
            .map(([lng, lat]) => [lat, lng] as [number, number]);
          if (ring.length >= 3) {
            polys.push(ring);
          }
        }
      }
      return polys;
    }

    return [];
  }, [selectedResult, changeDetection]);

  const changedAreaHaDisplay =
    selectedResult?.changedAreaHectares !== undefined
      ? selectedResult.changedAreaHectares.toFixed(2)
      : changeDetection?.changedArea !== undefined
      ? changeDetection.changedArea.toFixed(2)
      : undefined;

  const affectedRatioDisplay =
    selectedResult?.affectedAreaPercentage !== undefined
      ? selectedResult.affectedAreaPercentage.toFixed(1)
      : changeDetection?.affectedAreaPercentage !== undefined
      ? changeDetection.affectedAreaPercentage.toFixed(1)
      : undefined;

  const severityDisplay =
    selectedResult?.severity || changeDetection?.severity || undefined;

  const evidenceScoreDisplay =
    selectedResult?.evidenceStrength !== undefined
      ? `${selectedResult.evidenceStrength}/100`
      : changeDetection?.evidenceStrength !== undefined
      ? `${changeDetection.evidenceStrength}/100`
      : undefined;

  // Calculate measurement value
  const totalMeasureDistanceMeters = React.useMemo(() => {
    if (measureMode !== 'DISTANCE' || measurePoints.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < measurePoints.length - 1; i++) {
      dist += calculateDistanceMeters(measurePoints[i], measurePoints[i + 1]);
    }
    return dist;
  }, [measureMode, measurePoints]);

  const totalMeasureAreaM2 = React.useMemo(() => {
    if (measureMode !== 'AREA' || measurePoints.length < 3) return 0;
    return calculateGeodesicArea(measurePoints);
  }, [measureMode, measurePoints]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#020617',
        borderRadius: RADII.lg,
        overflow: 'hidden',
        boxShadow: SHADOWS.md,
        fontFamily: FONT.family,
      }}
    >
      {/* ─── Top Map Overlay Bar ─── */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 10,
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(6px)',
          padding: '6px 12px',
          borderRadius: RADII.md,
          border: '1px solid rgba(51, 65, 85, 0.7)',
          color: '#f8fafc',
          boxShadow: SHADOWS.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeSm }}>
            {areaName}
          </span>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: RADII.sm,
              backgroundColor: isPermanent ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.2)',
              color: isPermanent ? '#86efac' : '#fde047',
              fontWeight: FONT.weightBold,
            }}
          >
            {isPermanent ? 'PERMANENT ZONE' : 'TEMPORARY AREA'}
          </span>
          {selectedResult && (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {selectedResult.source} • {new Date(selectedResult.acquisitionDate).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Action buttons on map bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Measurement Tool Buttons */}
          <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: RADII.sm, padding: '2px' }}>
            <button
              onClick={() => {
                setMeasureMode(measureMode === 'DISTANCE' ? 'NONE' : 'DISTANCE');
                setMeasurePoints([]);
              }}
              style={{
                padding: '3px 8px',
                border: 'none',
                borderRadius: '3px',
                backgroundColor: measureMode === 'DISTANCE' ? '#38bdf8' : 'transparent',
                color: measureMode === 'DISTANCE' ? '#0f172a' : '#94a3b8',
                fontWeight: FONT.weightBold,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="8" x2="2" y2="16"/><line x1="22" y1="8" x2="22" y2="16"/><line x1="7" y1="10" x2="7" y2="14"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="17" y1="10" x2="17" y2="14"/></svg>
              Distance
            </button>
            <button
              onClick={() => {
                setMeasureMode(measureMode === 'AREA' ? 'NONE' : 'AREA');
                setMeasurePoints([]);
              }}
              style={{
                padding: '3px 8px',
                border: 'none',
                borderRadius: '3px',
                backgroundColor: measureMode === 'AREA' ? '#38bdf8' : 'transparent',
                color: measureMode === 'AREA' ? '#0f172a' : '#94a3b8',
                fontWeight: FONT.weightBold,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 3 21 7 17 21 3 17 3 3"/></svg>
              Area
            </button>
          </div>

          {showComparisonToggle && onOpenComparison && (
            <button
              onClick={onOpenComparison}
              style={{
                padding: '4px 10px',
                backgroundColor: '#52b788',
                color: '#0f2b1e',
                border: 'none',
                borderRadius: RADII.sm,
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightBold,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Compare Baseline vs Event
            </button>
          )}
        </div>
      </div>

      {/* ─── Active Measurement Floating Banner ─── */}
      {measureMode !== 'NONE' && (
        <div
          style={{
            position: 'absolute',
            top: 55,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            backgroundColor: '#0284c7',
            color: '#ffffff',
            padding: '6px 14px',
            borderRadius: RADII.full,
            fontSize: FONT.sizeXs,
            fontWeight: FONT.weightBold,
            boxShadow: SHADOWS.md,
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.sm,
          }}
        >
          <span>
            {measureMode === 'DISTANCE'
              ? `Distance Measured: ${(totalMeasureDistanceMeters / 1000).toFixed(2)} km (${totalMeasureDistanceMeters.toFixed(0)} m)`
              : `Polygon Area Measured: ${(totalMeasureAreaM2 / 10000).toFixed(2)} ha (${totalMeasureAreaM2.toLocaleString()} m²)`}
          </span>
          <button
            onClick={() => {
              setMeasureMode('NONE');
              setMeasurePoints([]);
            }}
            style={{
              backgroundColor: '#0369a1',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              cursor: 'pointer',
              fontSize: '11px',
              lineHeight: '1',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Leaflet Map Container ─── */}
      <MapContainer
        center={centerPoint}
        zoom={13}
        style={{ width: '100%', height: '100%', zIndex: 1 }}
      >
        <MapController center={centerPoint} bounds={boundaryCoords.length > 0 ? boundaryCoords : undefined} />
        <MapInteractionEvents
          onMouseMove={(lat, lng) => setCursorPos({ lat, lng })}
          measureMode={measureMode}
          onMeasurePoint={(pt) => setMeasurePoints((prev) => [...prev, pt])}
        />

        {/* Base Map Layers */}
        {baseMap === 'SATELLITE' && (
          <TileLayer
            attribution="&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        {baseMap === 'STREET' && (
          <TileLayer
            attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {baseMap === 'TOPO' && (
          <TileLayer
            attribution="&copy; USGS &mdash; Topographic Relief"
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxZoom={17}
          />
        )}

        {/* Boundary Polygon */}
        {showBoundary && boundaryCoords.length > 0 && (
          <Polygon
            positions={boundaryCoords}
            pathOptions={{
              color: isPermanent ? '#10b981' : '#f59e0b',
              fillColor: isPermanent ? '#10b981' : '#f59e0b',
              fillOpacity: 0.12,
              weight: 2.5,
              dashArray: isPermanent ? undefined : '5, 5',
            }}
          >
            <Popup>
              <div style={{ color: '#0f172a', fontFamily: FONT.family, fontSize: FONT.sizeSm }}>
                <strong>{areaName}</strong>
                <div>Type: {isPermanent ? 'Permanent Zone' : 'Temporary Investigation'}</div>
              </div>
            </Popup>
          </Polygon>
        )}

        {/* Change / Analysis Mask Overlays (Supports Single Polygon & Multi-Region MultiPolygon) */}
        {showChangeOverlay &&
          changedPolygons.map((polyCoords, idx) => (
            <Polygon
              key={`changed-poly-${idx}`}
              positions={polyCoords}
              pathOptions={{
                color: overlayStyle.color,
                fillColor: overlayStyle.fillColor,
                fillOpacity: overlayOpacity,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ color: '#0f172a', fontFamily: FONT.family, fontSize: FONT.sizeSm }}>
                  <strong style={{ color: '#b91c1c' }}>
                    {overlayStyle.label}
                    {changedPolygons.length > 1 ? ` (Region ${idx + 1} of ${changedPolygons.length})` : ''}
                  </strong>
                  {changedAreaHaDisplay && (
                    <div>Changed Area: <strong>{changedAreaHaDisplay} ha</strong></div>
                  )}
                  {affectedRatioDisplay && (
                    <div>Affected Ratio: <strong>{affectedRatioDisplay}%</strong></div>
                  )}
                  {severityDisplay && (
                    <div>Severity: <strong>{severityDisplay}</strong></div>
                  )}
                  {evidenceScoreDisplay && (
                    <div>Evidence Score: <strong>{evidenceScoreDisplay}</strong></div>
                  )}
                </div>
              </Popup>
            </Polygon>
          ))}

        {/* Mining Polygons if enabled */}
        {showMiningLayer &&
          miningEstimate &&
          changedPolygons.map((polyCoords, idx) => (
            <Polygon
              key={`mining-poly-${idx}`}
              positions={polyCoords}
              pathOptions={{
                color: '#e11d48',
                fillColor: '#fda4af',
                fillOpacity: 0.3,
                weight: 1.5,
                dashArray: '4, 4',
              }}
            >
              <Popup>
                <div style={{ color: '#0f172a', fontFamily: FONT.family, fontSize: FONT.sizeSm }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#e11d48' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                    Mining Extraction Area {changedPolygons.length > 1 ? `(Region ${idx + 1})` : ''}
                  </strong>
                  <div>
                    Estimated Volume:{' '}
                    <strong>
                      {miningEstimate.estimatedVolumeCubicMeters?.toLocaleString() || 'N/A'} m³
                    </strong>
                  </div>
                  <div>
                    Mean Bench Depth: <strong>{miningEstimate.estimatedDepthMeters || '3.5'} m</strong>
                  </div>
                </div>
              </Popup>
            </Polygon>
          ))}

        {/* Alert Markers */}
        {showAlerts && alerts.map((al) => (
          <Marker key={al.id} position={centerPoint}>
            <Popup>
              <div style={{ color: '#0f172a', fontFamily: FONT.family, fontSize: FONT.sizeSm }}>
                <strong style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Alert: {al.alertId}
                </strong>
                <div>Severity: <strong>{al.severity}</strong></div>
                <div>Status: {al.status}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Measurement Visualizers */}
        {measureMode === 'DISTANCE' && measurePoints.length > 0 && (
          <>
            <Polyline positions={measurePoints} pathOptions={{ color: '#38bdf8', weight: 3, dashArray: '6, 6' }} />
            {measurePoints.map((pt, idx) => (
              <Marker key={idx} position={pt} />
            ))}
          </>
        )}
        {measureMode === 'AREA' && measurePoints.length > 0 && (
          <>
            {measurePoints.length >= 3 ? (
              <Polygon positions={measurePoints} pathOptions={{ color: '#38bdf8', fillColor: '#bae6fd', fillOpacity: 0.4 }} />
            ) : (
              <Polyline positions={measurePoints} pathOptions={{ color: '#38bdf8', weight: 2 }} />
            )}
            {measurePoints.map((pt, idx) => (
              <Marker key={idx} position={pt} />
            ))}
          </>
        )}
      </MapContainer>

      {/* ─── Bottom Coordinate & Scale Bar ─── */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.md,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(4px)',
          padding: '4px 10px',
          borderRadius: RADII.sm,
          border: '1px solid rgba(51, 65, 85, 0.7)',
          color: '#cbd5e1',
          fontSize: '11px',
          fontFamily: 'monospace',
        }}
      >
        <span>
          LAT: <strong>{cursorPos ? cursorPos.lat.toFixed(5) : centerPoint[0].toFixed(5)}° N</strong>
        </span>
        <span>
          LNG: <strong>{cursorPos ? cursorPos.lng.toFixed(5) : centerPoint[1].toFixed(5)}° E</strong>
        </span>
        <span style={{ color: '#94a3b8' }}>
          CRS: <strong style={{ color: '#38bdf8' }}>EPSG:32643 (UTM Zone 43N)</strong>
        </span>
        <span style={{ color: '#94a3b8' }}>
          BASE: <strong style={{ color: '#86efac' }}>{baseMap}</strong>
        </span>
      </div>
    </div>
  );
};
