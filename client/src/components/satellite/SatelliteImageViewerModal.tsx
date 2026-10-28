import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  changeService,
  type ChangeComparisonMetadataDto,
} from '../../services/change.service';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';

export interface SatelliteImageViewerModalProps {
  changeId: string;
  zoneName?: string;
  initialMode?: 'BASELINE' | 'CURRENT' | 'SIDE_BY_SIDE' | 'SLIDER';
  onClose: () => void;
}

export const SatelliteImageViewerModal: React.FC<SatelliteImageViewerModalProps> = ({
  changeId,
  zoneName,
  initialMode = 'SIDE_BY_SIDE',
  onClose,
}) => {
  const [mode, setMode] = useState<'BASELINE' | 'CURRENT' | 'SIDE_BY_SIDE' | 'SLIDER'>(initialMode);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sliderPos, setSliderPos] = useState<number>(50); // 0-100%
  const [isDraggingPan, setIsDraggingPan] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [metadata, setMetadata] = useState<ChangeComparisonMetadataDto | null>(null);
  const [sarBand, setSarBand] = useState<'VV' | 'VH'>('VV');
  const [baselineUrl, setBaselineUrl] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const sliderBoxRef = useRef<HTMLDivElement>(null);
  const isDraggingSliderRef = useRef<boolean>(false);
  const baselineBlobUrlRef = useRef<string | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  const isSar =
    metadata?.baseline?.sensor === 'SAR' ||
    metadata?.current?.sensor === 'SAR' ||
    metadata?.baseline?.source === 'SENTINEL_1' ||
    metadata?.current?.source === 'SENTINEL_1';

  // Sync mode whenever initialMode prop changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (baselineBlobUrlRef.current) {
        URL.revokeObjectURL(baselineBlobUrlRef.current);
        baselineBlobUrlRef.current = null;
      }
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, []);

  // Load Metadata and Authenticated Images
  useEffect(() => {
    let active = true;

    setLoading(true);
    setBaselineError(null);
    setCurrentError(null);
    setZoom(1.0);
    setPan({ x: 0, y: 0 });

    const loadData = async () => {
      try {
        const meta = await changeService.getComparisonMetadata(changeId);
        if (!active) return;
        setMetadata(meta);

        const isSarRaster =
          meta?.baseline?.sensor === 'SAR' ||
          meta?.current?.sensor === 'SAR' ||
          meta?.baseline?.source === 'SENTINEL_1' ||
          meta?.current?.source === 'SENTINEL_1';
        const bandParam = isSarRaster ? sarBand : undefined;

        // Fetch Baseline and Current Images concurrently
        const [baselineRes, currentRes] = await Promise.allSettled([
          changeService.fetchBaselineImageBlobUrl(changeId, bandParam),
          changeService.fetchCurrentImageBlobUrl(changeId, bandParam),
        ]);

        if (!active) {
          if (baselineRes.status === 'fulfilled') URL.revokeObjectURL(baselineRes.value);
          if (currentRes.status === 'fulfilled') URL.revokeObjectURL(currentRes.value);
          return;
        }

        if (baselineRes.status === 'fulfilled') {
          if (baselineBlobUrlRef.current) {
            URL.revokeObjectURL(baselineBlobUrlRef.current);
          }
          baselineBlobUrlRef.current = baselineRes.value;
          setBaselineUrl(baselineRes.value);
        } else {
          const msg =
            (baselineRes.reason as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            'Baseline satellite raster is currently unavailable.';
          setBaselineError(msg);
        }

        if (currentRes.status === 'fulfilled') {
          if (currentBlobUrlRef.current) {
            URL.revokeObjectURL(currentBlobUrlRef.current);
          }
          currentBlobUrlRef.current = currentRes.value;
          setCurrentUrl(currentRes.value);
        } else {
          const msg =
            (currentRes.reason as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            'Current satellite raster is currently unavailable.';
          setCurrentError(msg);
        }
      } catch (err: unknown) {
        console.error('Failed to load comparison metadata:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [changeId, sarBand]);

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Pan and Slider Drag controls
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDraggingSliderRef.current) return;
    setIsDraggingPan(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingSliderRef.current) {
        const targetEl = sliderBoxRef.current || containerRef.current;
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));
          setSliderPos(pct);
          return;
        }
      }
      if (isDraggingPan) {
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDraggingPan, dragStart],
  );

  const handleMouseUp = () => {
    setIsDraggingPan(false);
    isDraggingSliderRef.current = false;
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingSliderRef.current) {
        const targetEl = sliderBoxRef.current || containerRef.current;
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));
          setSliderPos(pct);
        }
      }
    };
    const handleGlobalMouseUp = () => {
      isDraggingSliderRef.current = false;
      setIsDraggingPan(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: SPACE.md,
      }}
      onMouseUp={handleMouseUp}
    >
      <div
        style={{
          width: '96vw',
          maxWidth: '1350px',
          height: '92vh',
          backgroundColor: '#0b1329',
          border: '1px solid #1e293b',
          borderRadius: RADII.xl,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: SHADOWS.lg,
          color: '#f8fafc',
          fontFamily: FONT.family,
        }}
      >
        {/* ─── Header & Mode Select ─── */}
        <div
          style={{
            padding: `${SPACE.sm} ${SPACE.md}`,
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.sm,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span style={{ fontSize: '16px', fontWeight: FONT.weightBold, color: '#52b788', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 9.17l4.24-4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M9.17 14.83L4.93 19.07"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)"/></svg>
              Satellite Observation Viewer
            </span>
            <span style={{ fontSize: FONT.sizeSm, color: '#94a3b8' }}>
              {metadata ? `${metadata.zoneName} (${metadata.zoneCode})` : (zoneName ? `${zoneName} (Protected Area)` : 'Loading...')}
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: RADII.full,
                backgroundColor: isSar ? '#1e3a8a' : '#166534',
                color: isSar ? '#bfdbfe' : '#dcfce7',
                fontWeight: FONT.weightBold,
              }}
            >
              {isSar ? 'AUTHENTIC SAR BACKSCATTER (dB)' : 'AUTHENTIC GEE RASTER'}
            </span>
            {metadata?.analysisGrid && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: RADII.full,
                  backgroundColor: '#065f46',
                  color: '#a7f3d0',
                  fontWeight: FONT.weightBold,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                HARMONIZED GRID ({metadata.analysisGrid.crs})
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
            {/* View Mode Switcher */}
            <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: RADII.sm, padding: '2px' }}>
              <button
                onClick={() => setMode('BASELINE')}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: RADII.sm,
                  fontSize: FONT.sizeXs,
                  fontWeight: mode === 'BASELINE' ? FONT.weightBold : FONT.weightNormal,
                  backgroundColor: mode === 'BASELINE' ? '#2d6a4f' : 'transparent',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
                Baseline {metadata?.baseline?.acquisitionTimeUtc ? `(${new Date(metadata.baseline.acquisitionTimeUtc).getFullYear()})` : ''}
              </button>
              <button
                onClick={() => setMode('CURRENT')}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: RADII.sm,
                  fontSize: FONT.sizeXs,
                  fontWeight: mode === 'CURRENT' ? FONT.weightBold : FONT.weightNormal,
                  backgroundColor: mode === 'CURRENT' ? '#2d6a4f' : 'transparent',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
                Current {metadata?.current?.acquisitionTimeUtc ? `(${new Date(metadata.current.acquisitionTimeUtc).getFullYear()})` : ''}
              </button>
              <button
                onClick={() => setMode('SIDE_BY_SIDE')}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: RADII.sm,
                  fontSize: FONT.sizeXs,
                  fontWeight: mode === 'SIDE_BY_SIDE' ? FONT.weightBold : FONT.weightNormal,
                  backgroundColor: mode === 'SIDE_BY_SIDE' ? '#2d6a4f' : 'transparent',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>
                Side-by-Side Dual
              </button>
              <button
                onClick={() => setMode('SLIDER')}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: RADII.sm,
                  fontSize: FONT.sizeXs,
                  fontWeight: mode === 'SLIDER' ? FONT.weightBold : FONT.weightNormal,
                  backgroundColor: mode === 'SLIDER' ? '#2d6a4f' : 'transparent',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="3" x2="12" y2="21"/><polygon points="8 8 4 12 8 16 8 8"/><polygon points="16 8 20 12 16 16 16 8"/></svg>
                Curtain Slider
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                padding: '4px 12px',
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: RADII.sm,
                fontSize: FONT.sizeSm,
                fontWeight: FONT.weightBold,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Close
            </button>
          </div>
        </div>

        {/* ─── Toolbar: Zoom & Temporal Gap ─── */}
        <div
          style={{
            padding: '6px 16px',
            backgroundColor: '#131d35',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: FONT.sizeXs,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span style={{ color: '#94a3b8' }}>Zoom & Pan:</span>
            <button
              onClick={handleZoomOut}
              style={{
                padding: '2px 8px',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: RADII.sm,
                cursor: 'pointer',
              }}
            >
              - Zoom Out
            </button>
            <span style={{ fontWeight: FONT.weightBold, minWidth: '40px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              style={{
                padding: '2px 8px',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: RADII.sm,
                cursor: 'pointer',
              }}
            >
              + Zoom In
            </button>
            <button
              onClick={handleResetZoom}
              style={{
                padding: '2px 8px',
                backgroundColor: '#1e293b',
                color: '#52b788',
                border: '1px solid #334155',
                borderRadius: RADII.sm,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
              Fit / Reset
            </button>
            <span style={{ color: '#64748b', fontSize: '11px', marginLeft: SPACE.xs }}>
              (Click and drag image to pan)
            </span>

            {isSar && (
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, marginLeft: SPACE.md }}>
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>SAR Polarization:</span>
                <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: RADII.sm, padding: '2px' }}>
                  <button
                    onClick={() => setSarBand('VV')}
                    style={{
                      padding: '2px 8px',
                      border: 'none',
                      borderRadius: RADII.sm,
                      fontSize: '11px',
                      fontWeight: sarBand === 'VV' ? FONT.weightBold : FONT.weightNormal,
                      backgroundColor: sarBand === 'VV' ? '#2563eb' : 'transparent',
                      color: '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    VV
                  </button>
                  <button
                    onClick={() => setSarBand('VH')}
                    style={{
                      padding: '2px 8px',
                      border: 'none',
                      borderRadius: RADII.sm,
                      fontSize: '11px',
                      fontWeight: sarBand === 'VH' ? FONT.weightBold : FONT.weightNormal,
                      backgroundColor: sarBand === 'VH' ? '#2563eb' : 'transparent',
                      color: '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    VH
                  </button>
                </div>
                <span style={{ color: '#60a5fa', fontSize: '11px', fontWeight: FONT.weightBold }}>
                  SAR Backscatter ({sarBand})
                </span>
              </div>
            )}
          </div>

          {metadata && (
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Observation Gap:</span>{' '}
                <strong style={{ color: '#f59e0b' }}>{metadata.temporalGap.formatted}</strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Affected Area:</span>{' '}
                <strong style={{ color: '#52b788' }}>
                  {metadata.affectedAreaPercentage}% ({metadata.changedArea} ha)
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* ─── Production Geometry Audit Warning Banner ─── */}
        {(metadata?.auditStatus === 'INVALID_FOR_PRODUCTION_GEOMETRY' ||
          (metadata?.baseline?.relativeOrbitNumber &&
            metadata?.current?.relativeOrbitNumber &&
            metadata.baseline.relativeOrbitNumber !== metadata.current.relativeOrbitNumber)) && (
          <div
            style={{
              padding: '8px 16px',
              backgroundColor: '#450a0a',
              borderBottom: '2px solid #ef4444',
              color: '#fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              fontWeight: FONT.weightMedium,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <strong style={{ color: '#f87171', letterSpacing: '0.04em' }}>
                  AUDIT STATUS: INVALID_FOR_PRODUCTION_GEOMETRY
                </strong>{' '}
                &mdash; Baseline is Track {metadata?.baseline?.relativeOrbitNumber ?? 92} ({metadata?.baseline?.orbitDirection || 'DESCENDING'}) whereas Current is Track {metadata?.current?.relativeOrbitNumber ?? 165} ({metadata?.current?.orbitDirection || 'DESCENDING'}).
                <span style={{ display: 'block', fontSize: '11px', color: '#fca5a5', marginTop: '2px' }}>
                  Differing incidence angles (~11° variance) produce false-positive backscatter variation. For forest disturbance monitoring, identical relative orbit tracks are required.
                </span>
              </div>
            </div>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: RADII.sm,
                backgroundColor: '#7f1d1d',
                color: '#fee2e2',
                fontSize: '10px',
                fontWeight: FONT.weightBold,
                border: '1px solid #ef4444',
                whiteSpace: 'nowrap',
              }}
            >
              NON-PRODUCTION GEOMETRY
            </span>
          </div>
        )}

        {/* ─── Main Image Canvas Viewport ─── */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#020617',
            cursor: isDraggingPan ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
        >
          {loading && (
            <div style={{ color: '#94a3b8', fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #52b788', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
              Loading authentic satellite rasters directly from server storage...
            </div>
          )}

          {!loading && (
            <>
              {/* SINGLE BASELINE VIEW */}
              {mode === 'BASELINE' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {baselineUrl ? (
                    <img
                      src={baselineUrl}
                      alt={`Baseline ${metadata?.baseline.spacecraftName || 'Satellite'} Raster`}
                      style={{
                        maxWidth: '90%',
                        maxHeight: '90%',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transition: isDraggingPan ? 'none' : 'transform 0.1s ease-out',
                        boxShadow: SHADOWS.lg,
                        borderRadius: RADII.sm,
                        border: '1px solid #1e3a8a',
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div style={{ padding: SPACE.xl, backgroundColor: '#1e293b', borderRadius: RADII.md, textAlign: 'center', border: '1px solid #ef4444' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SPACE.xs }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <div style={{ fontWeight: FONT.weightBold, color: '#f87171' }}>Baseline Raster Unavailable</div>
                      <div style={{ fontSize: FONT.sizeXs, color: '#94a3b8', marginTop: SPACE.xs }}>
                        {baselineError || 'The raster file for this baseline observation could not be located on disk.'}
                      </div>
                      {metadata?.baseline && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: SPACE.sm }}>
                          Asset ID: {metadata.baseline.imageId}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SINGLE CURRENT VIEW */}
              {mode === 'CURRENT' && (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {currentUrl ? (
                    <img
                      src={currentUrl}
                      alt={`Current ${metadata?.current.spacecraftName || 'Satellite'} Raster`}
                      style={{
                        maxWidth: '90%',
                        maxHeight: '90%',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transition: isDraggingPan ? 'none' : 'transform 0.1s ease-out',
                        boxShadow: SHADOWS.lg,
                        borderRadius: RADII.sm,
                        border: '1px solid #b91c1c',
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div style={{ padding: SPACE.xl, backgroundColor: '#1e293b', borderRadius: RADII.md, textAlign: 'center', border: '1px solid #ef4444' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SPACE.xs }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <div style={{ fontWeight: FONT.weightBold, color: '#f87171' }}>Current Raster Unavailable</div>
                      <div style={{ fontSize: FONT.sizeXs, color: '#94a3b8', marginTop: SPACE.xs }}>
                        {currentError || 'The raster file for this observation could not be located on disk.'}
                      </div>
                      {metadata?.current && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: SPACE.sm }}>
                          Asset ID: {metadata.current.imageId}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SIDE-BY-SIDE DUAL VIEW */}
              {mode === 'SIDE_BY_SIDE' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100%' }}>
                  {/* Left: Baseline */}
                  <div style={{ position: 'relative', overflow: 'hidden', borderRight: '2px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        zIndex: 10,
                        backgroundColor: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid #3b82f6',
                        borderRadius: RADII.sm,
                        padding: '4px 10px',
                        fontSize: '11px',
                      }}
                    >
                      <span style={{ color: '#60a5fa', fontWeight: FONT.weightBold }}>
                        {isSar ? `BASELINE: ${metadata?.baseline.spacecraftName || 'Sentinel-1A (SAR)'} [${sarBand}]` : `BASELINE: ${metadata?.baseline.spacecraftName || 'Baseline'}`}
                      </span>
                      <div style={{ color: '#cbd5e1', fontSize: '10px' }}>
                        {metadata?.baseline.acquisitionTimeUtc
                           ? new Date(metadata.baseline.acquisitionTimeUtc).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : 'Baseline Reference'}
                        {metadata?.baseline.acquisitionTimeUtc &&
                          ` (${new Date(metadata.baseline.acquisitionTimeUtc).toISOString().slice(11, 16)} UTC)`}
                      </div>
                    </div>
                    {baselineUrl ? (
                      <img
                        src={baselineUrl}
                        alt={`Baseline ${metadata?.baseline.spacecraftName || 'Satellite'} Raster`}
                        style={{
                          maxWidth: '90%',
                          maxHeight: '90%',
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                          transition: isDraggingPan ? 'none' : 'transform 0.1s ease-out',
                          borderRadius: RADII.sm,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div style={{ color: '#f87171', fontSize: FONT.sizeXs, textAlign: 'center', padding: SPACE.md, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Baseline raster currently unavailable
                      </div>
                    )}
                  </div>

                  {/* Right: Current */}
                  <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        zIndex: 10,
                        backgroundColor: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid #ef4444',
                        borderRadius: RADII.sm,
                        padding: '4px 10px',
                        fontSize: '11px',
                      }}
                    >
                      <span style={{ color: '#f87171', fontWeight: FONT.weightBold }}>
                        {isSar ? `CURRENT: ${metadata?.current.spacecraftName || 'Sentinel-1A (SAR)'} [${sarBand}]` : `CURRENT: ${metadata?.current.spacecraftName || 'Current'}`}
                      </span>
                      <div style={{ color: '#cbd5e1', fontSize: '10px' }}>
                        {metadata?.current.acquisitionTimeUtc
                          ? new Date(metadata.current.acquisitionTimeUtc).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : 'Current Observation'}
                        {metadata?.current.acquisitionTimeUtc &&
                          ` (${new Date(metadata.current.acquisitionTimeUtc).toISOString().slice(11, 16)} UTC)`}
                      </div>
                    </div>
                    {currentUrl ? (
                      <img
                        src={currentUrl}
                        alt={`Current ${metadata?.current.spacecraftName || 'Satellite'} Raster`}
                        style={{
                          maxWidth: '90%',
                          maxHeight: '90%',
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                          transition: isDraggingPan ? 'none' : 'transform 0.1s ease-out',
                          borderRadius: RADII.sm,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div style={{ color: '#f87171', fontSize: FONT.sizeXs, textAlign: 'center', padding: SPACE.md, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Current raster currently unavailable
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CURTAIN SLIDER VIEW */}
              {mode === 'SLIDER' && (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {baselineUrl && currentUrl ? (
                    <div ref={sliderBoxRef} style={{ position: 'relative', width: '85%', height: '85%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {/* Under image: Baseline */}
                      <img
                        src={baselineUrl}
                        alt="Baseline"
                        style={{
                          position: 'absolute',
                          maxWidth: '100%',
                          maxHeight: '100%',
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                          transition: isDraggingPan ? 'none' : 'transform 0.1s ease-out',
                          borderRadius: RADII.sm,
                        }}
                        draggable={false}
                      />

                      {/* Top image clipped: Current */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          clipPath: `polygon(${sliderPos}% 0, 100% 0, 100% 100%, ${sliderPos}% 100%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img
                          src={currentUrl}
                          alt="Current"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transition: isDraggingPan ? 'none' : 'transform 0.1s ease-out',
                            borderRadius: RADII.sm,
                          }}
                          draggable={false}
                        />
                      </div>

                      {/* Draggable vertical divider line */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${sliderPos}%`,
                          width: '3px',
                          backgroundColor: '#ffffff',
                          boxShadow: '0 0 10px rgba(0,0,0,0.8)',
                          cursor: 'ew-resize',
                          zIndex: 20,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          isDraggingSliderRef.current = true;
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: '#ffffff',
                            color: '#0f172a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            boxShadow: SHADOWS.md,
                          }}
                        >
                          ↔
                        </div>
                      </div>

                      {/* Labels */}
                      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 30, backgroundColor: 'rgba(15,23,42,0.85)', padding: '2px 8px', borderRadius: RADII.sm, fontSize: '11px', color: '#60a5fa' }}>
                        ◀ BEFORE ({isSar ? `SAR ${sarBand} ` : ''}{metadata?.baseline.acquisitionTimeUtc ? new Date(metadata.baseline.acquisitionTimeUtc).toLocaleDateString() : '2020'})
                      </div>
                      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 30, backgroundColor: 'rgba(15,23,42,0.85)', padding: '2px 8px', borderRadius: RADII.sm, fontSize: '11px', color: '#f87171' }}>
                        AFTER ({isSar ? `SAR ${sarBand} ` : ''}{metadata?.current.acquisitionTimeUtc ? new Date(metadata.current.acquisitionTimeUtc).toLocaleDateString() : '2026'}) ▶
                      </div>
                      {metadata?.analysisGrid && (
                        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 30, backgroundColor: 'rgba(15,23,42,0.92)', padding: '3px 12px', borderRadius: RADII.md, fontSize: '11px', color: '#34d399', border: '1px solid #059669', pointerEvents: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                          Pixel-Registered Analysis Grid ({metadata.analysisGrid.crs} · {metadata.analysisGrid.width}×{metadata.analysisGrid.height} · {metadata.analysisGrid.pixelSizeX}m)
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#f87171', fontSize: FONT.sizeXs, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      Both baseline and current rasters must be available for curtain slider.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── Footer: Provenance & Metadata Ribbon ─── */}
        {metadata && (
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: '#0f172a',
              borderTop: '1px solid #1e293b',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: SPACE.md,
              fontSize: '11px',
            }}
          >
            {/* Raw Baseline Scene Footprint Card */}
            <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: SPACE.sm }}>
              <div style={{ color: '#60a5fa', fontWeight: FONT.weightBold }}>
                RAW SCENE FOOTPRINT: BASELINE
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '10px' }}>
                {metadata.baseline.spacecraftName} ({metadata.baseline.sensor})
              </div>
              <div style={{ color: '#cbd5e1' }}>
                Acquisition: {metadata.baseline.acquisitionTimeUtc ? new Date(metadata.baseline.acquisitionTimeUtc).toUTCString() : 'N/A'}
              </div>
              {metadata.baseline.relativeOrbitNumber && (
                <div style={{ color: '#93c5fd', fontWeight: FONT.weightBold }}>
                  Track {metadata.baseline.relativeOrbitNumber} ({metadata.baseline.orbitDirection || 'DESCENDING'})
                </div>
              )}
              <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                Native CRS: <strong>{metadata.baseline.crs}</strong> | Footprint: {metadata.baseline.width}×{metadata.baseline.height} px ({metadata.baseline.resolutionMeters}m)
              </div>
              <div style={{ color: '#64748b', wordBreak: 'break-all', fontSize: '10px', marginTop: '1px' }}>
                Asset: {metadata.baseline.imageId.split('/').pop()}
              </div>
            </div>

            {/* Raw Current Scene Footprint Card */}
            <div style={{ borderLeft: '3px solid #ef4444', paddingLeft: SPACE.sm }}>
              <div style={{ color: '#f87171', fontWeight: FONT.weightBold }}>
                RAW SCENE FOOTPRINT: CURRENT
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '10px' }}>
                {metadata.current.spacecraftName} ({metadata.current.sensor})
              </div>
              <div style={{ color: '#cbd5e1' }}>
                Acquisition: {metadata.current.acquisitionTimeUtc ? new Date(metadata.current.acquisitionTimeUtc).toUTCString() : 'N/A'}
              </div>
              {metadata.current.relativeOrbitNumber && (
                <div style={{ color: metadata.current.relativeOrbitNumber === metadata.baseline.relativeOrbitNumber ? '#86efac' : '#fca5a5', fontWeight: FONT.weightBold }}>
                  Track {metadata.current.relativeOrbitNumber} ({metadata.current.orbitDirection || 'DESCENDING'})
                  {metadata.baseline.relativeOrbitNumber && metadata.current.relativeOrbitNumber !== metadata.baseline.relativeOrbitNumber && (
                    <span style={{ color: '#f87171', fontSize: '10px', marginLeft: '4px' }}>[MISMATCH]</span>
                  )}
                </div>
              )}
              <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                Native CRS: <strong>{metadata.current.crs}</strong> | Footprint: {metadata.current.width}×{metadata.current.height} px ({metadata.current.resolutionMeters}m)
              </div>
              <div style={{ color: '#64748b', wordBreak: 'break-all', fontSize: '10px', marginTop: '1px' }}>
                Asset: {metadata.current.imageId.split('/').pop()}
              </div>
            </div>

            {/* Canonical Analysis Grid Card */}
            {metadata.analysisGrid && (
              <div style={{ borderLeft: '3px solid #10b981', paddingLeft: SPACE.sm }}>
                <div style={{ color: '#34d399', fontWeight: FONT.weightBold }}>
                  CANONICAL ANALYSIS GRID ({metadata.analysisGrid.crs})
                </div>
                <div style={{ color: '#cbd5e1' }}>
                  Target Grid: {metadata.analysisGrid.width} × {metadata.analysisGrid.height} px @ {metadata.analysisGrid.pixelSizeX}m resolution
                </div>
                <div style={{ color: '#a7f3d0', fontSize: '10px', marginTop: '2px', fontWeight: FONT.weightBold }}>
                  Valid Comparison Intersection: {metadata.rasterStatistics ? `${metadata.rasterStatistics.validComparisonPixelCount.toLocaleString()} px` : '100%'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '1px' }}>
                  Method: <strong style={{ color: '#6ee7b7' }}>{metadata.calculationMethod || 'SAR_PIXEL_DIFFERENCE'}</strong> ({metadata.spatialCalculation || 'PIXEL_GRID'})
                </div>
                {metadata.thresholdConfig && (
                  <div style={{ color: '#94a3b8', fontSize: '10px' }}>
                    {isSar ? (
                      <>
                        Thresholds: ΔVV &lt; -{((metadata.thresholdConfig as any).vvThresholdDb)?.toFixed(1) ?? '2.0'} dB | ΔVH &lt; -{((metadata.thresholdConfig as any).vhThresholdDb)?.toFixed(1) ?? '2.0'} dB ({metadata.thresholdConfig.decisionRule || 'ANY_BAND'})
                      </>
                    ) : (
                      <>
                        Thresholds: NDVI &lt; {((metadata.thresholdConfig as any).ndviThreshold)?.toFixed(2) ?? '-0.15'} | NDWI &lt; {((metadata.thresholdConfig as any).ndwiThreshold)?.toFixed(2) ?? '-0.10'} ({metadata.thresholdConfig.decisionRule || 'NDVI_DROP'})
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Change Vector & Directional Statistics Card */}
            <div style={{ borderLeft: `3px solid ${isSar ? '#3b82f6' : '#52b788'}`, paddingLeft: SPACE.sm }}>
              <div style={{ color: isSar ? '#60a5fa' : '#52b788', fontWeight: FONT.weightBold }}>
                {isSar ? 'DIRECTIONAL STATS & EVIDENCE' : 'SPECTRAL EVIDENCE & VECTORS'}
              </div>
              {isSar && metadata.rasterStatistics ? (
                <>
                  <div style={{ color: '#cbd5e1', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                    Drops (Loss / Disturbance): <strong style={{ color: '#f87171' }}>
                      {metadata.rasterStatistics.negativeChangePixelCount?.toLocaleString() ?? '—'} px ({metadata.rasterStatistics.negativeAffectedAreaPercentage?.toFixed(2) ?? '—'}%)
                    </strong>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    Increases (Moisture / Regrowth): <strong style={{ color: '#60a5fa' }}>
                      {metadata.rasterStatistics.positiveChangePixelCount?.toLocaleString() ?? '—'} px ({metadata.rasterStatistics.positiveAffectedAreaPercentage?.toFixed(2) ?? '—'}%)
                    </strong>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#34d399', borderRadius: '1px' }} />
                    Stable: <strong>{metadata.rasterStatistics.stablePixelCount?.toLocaleString() ?? '—'} px</strong> · Direction: <strong style={{ color: '#34d399' }}>{metadata.thresholdConfig?.changeDirection || 'DECREASE'}</strong>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                    VV Δ: {metadata.spectralDeltas.vvDelta !== undefined ? `${metadata.spectralDeltas.vvDelta > 0 ? '+' : ''}${metadata.spectralDeltas.vvDelta.toFixed(2)} dB` : '—'} | VH Δ: {metadata.spectralDeltas.vhDelta !== undefined ? `${metadata.spectralDeltas.vhDelta > 0 ? '+' : ''}${metadata.spectralDeltas.vhDelta.toFixed(2)} dB` : '—'}
                  </div>
                </>
              ) : isSar ? (
                <>
                  <div style={{ color: '#cbd5e1' }}>
                    VV Δ: <strong style={{ color: '#60a5fa' }}>
                      {metadata.spectralDeltas.vvDelta !== undefined ? `${metadata.spectralDeltas.vvDelta > 0 ? '+' : ''}${metadata.spectralDeltas.vvDelta.toFixed(2)} dB` : '—'}
                    </strong> | VH Δ: <strong style={{ color: '#60a5fa' }}>
                      {metadata.spectralDeltas.vhDelta !== undefined ? `${metadata.spectralDeltas.vhDelta > 0 ? '+' : ''}${metadata.spectralDeltas.vhDelta.toFixed(2)} dB` : '—'}
                    </strong>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                    Sensor: Sentinel-1A (SAR) | Display: SAR Backscatter ({sarBand})
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: '#cbd5e1' }}>
                    NDVI Δ: <strong style={{ color: metadata.spectralDeltas.ndviDelta && metadata.spectralDeltas.ndviDelta < 0 ? '#f87171' : '#52b788' }}>{metadata.spectralDeltas.ndviDelta ?? '—'}</strong> | NDWI Δ: {metadata.spectralDeltas.ndwiDelta ?? '—'} | NDBI Δ: {metadata.spectralDeltas.ndbiDelta ?? '—'}
                  </div>
                  <div style={{ color: '#cbd5e1' }}>
                    BSI Δ: {metadata.spectralDeltas.bsiDelta ?? '—'} | SAVI Δ: {metadata.spectralDeltas.saviDelta ?? '—'} | EVI Δ: {metadata.spectralDeltas.eviDelta ?? '—'}
                  </div>
                </>
              )}
              <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                Evidence Score: {metadata.evidenceStrength}/100 | Agreement: {metadata.crossSensorAgreement}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SatelliteImageViewerModal;
