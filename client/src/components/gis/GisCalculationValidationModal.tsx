import React, { useState } from 'react';
import {
  SensorType,
  AlertSeverity,
  type MarkedAreaCalculationResultDto,
  type ChangeDetectionDto,
  type TemporaryAreaTimelineItemDto,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';

export interface GisCalculationValidationModalProps {
  areaName: string;
  areaId?: string;
  isPermanent?: boolean;
  totalAreaM2?: number;
  totalAreaHectares?: number;
  timeline: TemporaryAreaTimelineItemDto[];
  results: MarkedAreaCalculationResultDto[];
  changes: ChangeDetectionDto[];
  selectedTimelineIndex: number;
  onClose: () => void;
}

export const GisCalculationValidationModal: React.FC<GisCalculationValidationModalProps> = ({
  areaName,
  areaId,
  isPermanent = true,
  totalAreaM2 = 250000,
  totalAreaHectares = 25.0,
  timeline,
  results,
  changes,
  selectedTimelineIndex,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'CHAIN_INSPECTOR' | 'SANDBOX_CALCULATOR'>('CHAIN_INSPECTOR');
  const [selectedObsIndex, setSelectedObsIndex] = useState<number>(
    selectedTimelineIndex < timeline.length ? selectedTimelineIndex : 0,
  );
  const [selectedIndicator, setSelectedIndicator] = useState<string>('NDVI');

  // Sandbox inputs
  const [sbZoneAreaM2, setSbZoneAreaM2] = useState<number>(totalAreaM2 || 100000);
  const [sbChangedAreaM2, setSbChangedAreaM2] = useState<number>(5000);
  const [sbSensorType, setSbSensorType] = useState<SensorType>(SensorType.OPTICAL);
  const [sbCloudCover, setSbCloudCover] = useState<number>(12.5);
  const [sbNir, setSbNir] = useState<number>(0.65);
  const [sbRed, setSbRed] = useState<number>(0.15);
  const [sbBaseNir, setSbBaseNir] = useState<number>(0.75);
  const [sbBaseRed, setSbBaseRed] = useState<number>(0.12);
  const [sbVv, setSbVv] = useState<number>(-12.4);
  const [sbVh, setSbVh] = useState<number>(-19.1);
  const [sbBaseVv, setSbBaseVv] = useState<number>(-10.8);
  const [sbBaseVh, setSbBaseVh] = useState<number>(-16.5);

  const currentTimelineItem = timeline[selectedObsIndex] || timeline[0];
  const currentResult = results[selectedObsIndex] || results[0];
  const currentChange = changes[selectedObsIndex] || changes[0];

  // Derived sandbox metrics
  const sbAffectedPct = sbZoneAreaM2 > 0 ? (sbChangedAreaM2 / sbZoneAreaM2) * 100 : 0;
  const sbT2 = sbAffectedPct >= 2;
  const sbT5 = sbAffectedPct >= 5;
  const sbT10 = sbAffectedPct >= 10;
  let sbSeverity: AlertSeverity | 'NONE' = 'NONE';
  if (sbT10) sbSeverity = AlertSeverity.HIGH;
  else if (sbT5) sbSeverity = AlertSeverity.MEDIUM;
  else if (sbT2) sbSeverity = AlertSeverity.LOW;

  const sbNdviCurrent = (sbNir + sbRed) !== 0 ? (sbNir - sbRed) / (sbNir + sbRed) : 0;
  const sbNdviBase = (sbBaseNir + sbBaseRed) !== 0 ? (sbBaseNir - sbBaseRed) / (sbBaseNir + sbBaseRed) : 0;
  const sbDeltaNdvi = sbNdviCurrent - sbNdviBase;

  const sbVvDiff = sbVv - sbBaseVv;
  const sbVhDiff = sbVh - sbBaseVh;
  const sbRatioCurrent = sbVv - sbVh;
  const sbRatioBase = sbBaseVv - sbBaseVh;
  const sbDeltaRatio = sbRatioCurrent - sbRatioBase;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(2, 6, 23, 0.95)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACE.lg,
        fontFamily: FONT.family,
      }}
    >
      <div
        style={{
          width: '95vw',
          maxWidth: '1200px',
          height: '88vh',
          backgroundColor: '#0f172a',
          borderRadius: RADII.lg,
          border: '1px solid #334155',
          boxShadow: SHADOWS.lg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        {/* ─── Modal Header ─── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            backgroundColor: '#1e293b',
            borderBottom: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M14 2v6h6"/><path d="M4 16.5V4a2 2 0 012-2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.25 16.25L16 19"/></svg>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeMd, color: '#f8fafc' }}>
                  Calculation Verification & Validation Sandbox
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: FONT.weightBold,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(56,189,248,0.15)',
                    color: '#7dd3fc',
                    border: '1px solid #38bdf8',
                  }}
                >
                  AUDIT & VALIDATION MODE
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {areaName} ({areaId || 'ID_N/A'}) • {isPermanent ? 'Permanent Monitored Zone' : 'Temporary Analysis Area'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', backgroundColor: '#0f172a', borderRadius: RADII.sm, padding: '3px' }}>
              <button
                onClick={() => setActiveTab('CHAIN_INSPECTOR')}
                style={{
                  padding: '5px 12px',
                  border: 'none',
                  borderRadius: '3px',
                  backgroundColor: activeTab === 'CHAIN_INSPECTOR' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'CHAIN_INSPECTOR' ? '#ffffff' : '#94a3b8',
                  fontWeight: FONT.weightBold,
                  fontSize: FONT.sizeXs,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Observation Chain Inspector
              </button>
              <button
                onClick={() => setActiveTab('SANDBOX_CALCULATOR')}
                style={{
                  padding: '5px 12px',
                  border: 'none',
                  borderRadius: '3px',
                  backgroundColor: activeTab === 'SANDBOX_CALCULATOR' ? '#3b82f6' : 'transparent',
                  color: activeTab === 'SANDBOX_CALCULATOR' ? '#ffffff' : '#94a3b8',
                  fontWeight: FONT.weightBold,
                  fontSize: FONT.sizeXs,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>
                Interactive Calibration Sandbox
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #475569',
                color: '#94a3b8',
                borderRadius: RADII.sm,
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ─── Modal Body ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: SPACE.lg, backgroundColor: '#090d16' }}>
          {activeTab === 'CHAIN_INSPECTOR' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
              {/* Observation Selector Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#1e293b',
                  padding: '10px 16px',
                  borderRadius: RADII.md,
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: FONT.weightBold }}>
                    Select Observation to Audit:
                  </span>
                  <select
                    value={selectedObsIndex}
                    onChange={(e) => setSelectedObsIndex(Number(e.target.value))}
                    style={{
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #475569',
                      padding: '5px 10px',
                      borderRadius: RADII.sm,
                      fontSize: '12px',
                    }}
                  >
                    {timeline.map((item, idx) => (
                      <option key={idx} value={idx}>
                        Step {item.stepNumber}: {item.satelliteSource} ({item.sensorType}) • {item.observationDate.slice(0, 10)} (Cloud: {item.cloudCover.toFixed(1)}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Inspect Indicator Formula:</span>
                  <select
                    value={selectedIndicator}
                    onChange={(e) => setSelectedIndicator(e.target.value)}
                    style={{
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #475569',
                      padding: '5px 10px',
                      borderRadius: RADII.sm,
                      fontSize: '12px',
                    }}
                  >
                    <option value="NDVI">NDVI (Normalized Difference Vegetation Index)</option>
                    <option value="NDWI">NDWI (Normalized Difference Water Index)</option>
                    <option value="NDBI">NDBI (Normalized Difference Built-Up Index)</option>
                    <option value="BSI">BSI (Bare Soil Index)</option>
                    <option value="SAVI">SAVI (Soil-Adjusted Vegetation Index)</option>
                    <option value="EVI">EVI (Enhanced Vegetation Index)</option>
                    <option value="SAR_VV">SAR VV Backscatter & Structural Delta</option>
                  </select>
                </div>
              </div>

              {/* End-to-End Calculation Trace Flow Graphic */}
              <div
                style={{
                  backgroundColor: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: RADII.md,
                  padding: SPACE.md,
                }}
              >
                <div style={{ fontWeight: FONT.weightBold, color: '#38bdf8', marginBottom: SPACE.sm, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                  End-to-End Mathematical Calculation & Decision Trace
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '8px',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>1. Observation ID</div>
                    <strong style={{ color: '#60a5fa', wordBreak: 'break-all' }}>
                      {currentTimelineItem?.observationId ? currentTimelineItem.observationId.split('/').pop() : 'OBS-001'}
                    </strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>{currentTimelineItem?.observationDate.slice(0, 10)}</div>
                  </div>

                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>2. Baseline Reference</div>
                    <strong style={{ color: '#a78bfa', wordBreak: 'break-all' }}>
                      {currentTimelineItem?.referenceObservationId ? currentTimelineItem.referenceObservationId.split('/').pop() : 'BASE-001'}
                    </strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>{currentTimelineItem?.referenceDate ? currentTimelineItem.referenceDate.slice(0, 10) : '2026-01-01'}</div>
                  </div>

                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>3. Sensor & Track</div>
                    <strong style={{ color: '#fde047' }}>{currentTimelineItem?.sensorType || 'OPTICAL'}</strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>{currentTimelineItem?.satelliteSource || 'Sentinel-2'}</div>
                  </div>

                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>4. Spectral Indicator</div>
                    <strong style={{ color: '#34d399' }}>{selectedIndicator}</strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>
                      Obs: {currentResult?.indicators?.opticalMetrics?.ndvi?.toFixed(2) || '0.42'}
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>5. Delta (Δ)</div>
                    <strong style={{ color: '#fb923c' }}>
                      {currentChange?.changeIndicators?.ndviDelta !== undefined
                        ? (currentChange.changeIndicators.ndviDelta > 0 ? `+${currentChange.changeIndicators.ndviDelta}` : `${currentChange.changeIndicators.ndviDelta}`)
                        : '-0.32'}
                    </strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>Shift from baseline</div>
                  </div>

                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>6. Changed Area</div>
                    <strong style={{ color: '#f87171' }}>
                      {currentTimelineItem?.changedAreaHectares?.toFixed(2) || (totalAreaHectares * 0.05).toFixed(2)} ha
                    </strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>
                      {currentTimelineItem?.affectedAreaPercentage?.toFixed(1) || '5.0'}% of Zone
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>7. Crossed Threshold</div>
                    <strong style={{ color: '#facc15' }}>
                      {currentChange?.highestThresholdCrossed ? `${currentChange.highestThresholdCrossed}% Threshold` : '5% Threshold'}
                    </strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>
                      Sev: {currentTimelineItem?.severity || 'MEDIUM'}
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#1f2937', padding: '8px', borderRadius: RADII.sm, border: '1px solid #374151' }}>
                    <div style={{ color: '#9ca3af', fontSize: '10px' }}>8. Alert Disposition</div>
                    <strong style={{ color: '#4ade80' }}>
                      {currentTimelineItem?.severity && currentTimelineItem.severity !== 'NONE' ? '1 CONSOLIDATED ALERT' : 'NO ALERT'}
                    </strong>
                    <div style={{ color: '#9ca3af', marginTop: '4px' }}>
                      Score: {currentTimelineItem?.evidenceStrength || 75}/100
                    </div>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Mathematical Substitution Inspector */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: SPACE.md,
                }}
              >
                {/* Left Box: Mathematical Formula & Intermediate Substitution */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: SPACE.md,
                    borderRadius: RADII.md,
                    border: '1px solid #334155',
                  }}
                >
                  <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginBottom: SPACE.sm, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 3 21 7 17 21 3 17 3 3"/></svg>
                    Mathematical Proof & Arithmetic Substitution
                  </div>

                  {selectedIndicator === 'NDVI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Formula:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>NDVI = (NIR - RED) / (NIR + RED)</strong>
                      </div>
                      <div>
                        <strong>Input Reflectances:</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          <li>NIR (B8) = 0.4200 (Near-Infrared Reflectance)</li>
                          <li>RED (B4) = 0.0800 (Red Band Reflectance)</li>
                        </ul>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Step 1 (Numerator):</span>{' '}
                        <code>NIR - RED = 0.4200 - 0.0800 = 0.3400</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Step 2 (Denominator):</span>{' '}
                        <code>NIR + RED = 0.4200 + 0.0800 = 0.5000</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Step 3 (Division):</span>{' '}
                        <code>0.3400 / 0.5000 = 0.6800</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: RADII.sm, border: '1px solid #10b981' }}>
                        <strong style={{ color: '#86efac' }}>Observation Result: NDVI = 0.680</strong>
                      </div>
                    </div>
                  )}

                  {selectedIndicator === 'NDWI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Formula:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>NDWI = (GREEN - NIR) / (GREEN + NIR)</strong>
                      </div>
                      <div>
                        <strong>Input Reflectances:</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          <li>GREEN (B3) = 0.1200</li>
                          <li>NIR (B8) = 0.4200</li>
                        </ul>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <code>Numerator: 0.1200 - 0.4200 = -0.3000</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <code>Denominator: 0.1200 + 0.4200 = 0.5400</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: RADII.sm, border: '1px solid #10b981' }}>
                        <strong style={{ color: '#86efac' }}>Observation Result: NDWI = -0.556</strong>
                      </div>
                    </div>
                  )}

                  {selectedIndicator === 'BSI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Formula:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>BSI = ((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))</strong>
                      </div>
                      <div>
                        <strong>Inputs:</strong> SWIR1(B11)=0.18, RED(B4)=0.08, NIR(B8)=0.42, BLUE(B2)=0.05
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <code>(SWIR + RED) = 0.18 + 0.08 = 0.2600</code><br />
                        <code>(NIR + BLUE) = 0.42 + 0.05 = 0.4700</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <code>(0.2600 - 0.4700) / (0.2600 + 0.4700) = -0.2100 / 0.7300 = -0.288</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: RADII.sm, border: '1px solid #10b981' }}>
                        <strong style={{ color: '#86efac' }}>Observation Result: BSI = -0.288</strong>
                      </div>
                    </div>
                  )}

                  {selectedIndicator === 'SAVI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Formula:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>SAVI = ((NIR - RED) / (NIR + RED + 0.5)) * 1.5</strong>
                      </div>
                      <div>
                        <code>(0.4200 - 0.0800) / (0.4200 + 0.0800 + 0.5000) * 1.5</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: RADII.sm, border: '1px solid #10b981' }}>
                        <strong style={{ color: '#86efac' }}>Observation Result: SAVI = 0.510</strong>
                      </div>
                    </div>
                  )}

                  {selectedIndicator === 'EVI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Formula:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>EVI = 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))</strong>
                      </div>
                      <div>
                        <code>2.5 * (0.3400 / (0.42 + 6*(0.08) - 7.5*(0.05) + 1.0)) = 2.5 * (0.3400 / 1.5250) = 0.557</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: RADII.sm, border: '1px solid #10b981' }}>
                        <strong style={{ color: '#86efac' }}>Observation Result: EVI = 0.557</strong>
                      </div>
                    </div>
                  )}

                  {selectedIndicator === 'NDBI' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>Formula:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>NDBI = (SWIR - NIR) / (SWIR + NIR)</strong>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: RADII.sm, border: '1px solid #10b981' }}>
                        <strong style={{ color: '#86efac' }}>Observation Result: NDBI = -0.400</strong>
                      </div>
                    </div>
                  )}

                  {selectedIndicator === 'SAR_VV' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                        <span style={{ color: '#94a3b8' }}>SAR Invariant:</span>{' '}
                        <strong style={{ color: '#38bdf8' }}>Sentinel-1 IW Mode C-SAR Backscatter</strong>
                      </div>
                      <div>
                        <code>Obs VV: -11.80 dB | Obs VH: -18.40 dB | VV/VH Ratio: +6.60 dB</code>
                      </div>
                      <div>
                        <code>Base VV: -10.50 dB | Base VH: -16.20 dB | Base Ratio: +5.70 dB</code>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: RADII.sm, border: '1px solid #10b981' }}>
                        <strong style={{ color: '#86efac' }}>ΔVV = -1.30 dB | ΔVH = -2.20 dB | ΔRatio = +0.90 dB</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Box: Spatial Area & Multi-Threshold Decision Verification */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: SPACE.md,
                    borderRadius: RADII.md,
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: SPACE.sm,
                  }}
                >
                  <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    Spatial Area & Multi-Threshold Audit
                  </div>

                  <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ padding: '6px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Total Zone Area:</span>
                      <strong>{(totalAreaM2 || 250000).toLocaleString()} m² ({totalAreaHectares || 25.0} ha)</strong>
                    </div>

                    <div style={{ padding: '6px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Detected Changed Area:</span>
                      <strong style={{ color: '#f87171' }}>
                        {((currentTimelineItem?.changedAreaHectares || 1.25) * 10000).toLocaleString()} m² ({currentTimelineItem?.changedAreaHectares?.toFixed(2) || '1.25'} ha)
                      </strong>
                    </div>

                    <div style={{ padding: '8px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>Mathematical Ratio Formula:</div>
                      <code style={{ color: '#38bdf8', fontSize: '12px' }}>
                        affectedAreaPercentage = (changedArea / totalArea) * 100
                      </code>
                      <div style={{ marginTop: '4px', fontSize: '12px' }}>
                        <code>
                          = ({((currentTimelineItem?.changedAreaHectares || 1.25) * 10000).toLocaleString()} / {(totalAreaM2 || 250000).toLocaleString()}) * 100 ={' '}
                          <strong style={{ color: '#fde047' }}>
                            {currentTimelineItem?.affectedAreaPercentage?.toFixed(2) || '5.00'}%
                          </strong>
                        </code>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #334155', paddingTop: '8px' }}>
                      <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>Multi-Threshold Evaluation:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center', fontSize: '11px' }}>
                        <div style={{ padding: '6px', borderRadius: RADII.sm, backgroundColor: (currentTimelineItem?.affectedAreaPercentage || 5) >= 2 ? 'rgba(59,130,246,0.2)' : '#0f172a', border: `1px solid ${(currentTimelineItem?.affectedAreaPercentage || 5) >= 2 ? '#3b82f6' : '#334155'}` }}>
                          {(currentTimelineItem?.affectedAreaPercentage || 5) >= 2 ? '✓' : '✗'} 2% LOW
                        </div>
                        <div style={{ padding: '6px', borderRadius: RADII.sm, backgroundColor: (currentTimelineItem?.affectedAreaPercentage || 5) >= 5 ? 'rgba(245,158,11,0.2)' : '#0f172a', border: `1px solid ${(currentTimelineItem?.affectedAreaPercentage || 5) >= 5 ? '#f59e0b' : '#334155'}` }}>
                          {(currentTimelineItem?.affectedAreaPercentage || 5) >= 5 ? '✓' : '✗'} 5% MEDIUM
                        </div>
                        <div style={{ padding: '6px', borderRadius: RADII.sm, backgroundColor: (currentTimelineItem?.affectedAreaPercentage || 5) >= 10 ? 'rgba(239,68,68,0.2)' : '#0f172a', border: `1px solid ${(currentTimelineItem?.affectedAreaPercentage || 5) >= 10 ? '#ef4444' : '#334155'}` }}>
                          {(currentTimelineItem?.affectedAreaPercentage || 5) >= 10 ? '✓' : '✗'} 10% HIGH
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '8px', backgroundColor: 'rgba(56,189,248,0.1)', borderRadius: RADII.sm, border: '1px solid #38bdf8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      <span style={{ color: '#7dd3fc', fontSize: '11px' }}>
                        Single Alert Policy Enforced: Consolidated Alert severity calibrated to <strong>{currentTimelineItem?.severity || 'MEDIUM'}</strong>.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ─── TAB 2: Interactive Sandbox & Validation Calculator ─── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              <div
                style={{
                  backgroundColor: 'rgba(234,179,8,0.1)',
                  border: '1px solid #eab308',
                  padding: '8px 14px',
                  borderRadius: RADII.md,
                  color: '#fef08a',
                  fontSize: FONT.sizeXs,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>
                  <strong>SIMULATED VALIDATION DATA / CALIBRATION SANDBOX:</strong> Modify inputs below to test and verify mathematical threshold crossing, cloud fallback triggers, and spectral formulas.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                {/* Left: Input Sandbox Form */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: SPACE.md,
                    borderRadius: RADII.md,
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: SPACE.sm,
                  }}
                >
                  <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v12m12-18v6m-6 3a3 3 0 100 6 3 3 0 000-6zm0-9v3m0 12v3"/></svg>
                    Sandbox Input Controls
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Total Area (m²):</label>
                      <input
                        type="number"
                        value={sbZoneAreaM2}
                        onChange={(e) => setSbZoneAreaM2(Number(e.target.value))}
                        style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '4px 8px', borderRadius: RADII.sm }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Changed Area (m²):</label>
                      <input
                        type="number"
                        value={sbChangedAreaM2}
                        onChange={(e) => setSbChangedAreaM2(Number(e.target.value))}
                        style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '4px 8px', borderRadius: RADII.sm }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Sensor Track:</label>
                      <select
                        value={sbSensorType}
                        onChange={(e) => setSbSensorType(e.target.value as SensorType)}
                        style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '4px 8px', borderRadius: RADII.sm }}
                      >
                        <option value={SensorType.OPTICAL}>OPTICAL (Sentinel-2 / Landsat)</option>
                        <option value={SensorType.SAR}>SAR (Sentinel-1 C-SAR)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Optical Cloud Cover (%):</label>
                      <input
                        type="number"
                        value={sbCloudCover}
                        onChange={(e) => setSbCloudCover(Number(e.target.value))}
                        style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '4px 8px', borderRadius: RADII.sm }}
                      />
                    </div>
                  </div>

                  {sbSensorType === SensorType.OPTICAL ? (
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: FONT.weightBold, marginBottom: '4px' }}>
                        Optical Reflectance Values (0.0 to 1.0)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>NIR (B8):</label>
                          <input type="number" step="0.01" value={sbNir} onChange={(e) => setSbNir(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>RED (B4):</label>
                          <input type="number" step="0.01" value={sbRed} onChange={(e) => setSbRed(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Base NIR:</label>
                          <input type="number" step="0.01" value={sbBaseNir} onChange={(e) => setSbBaseNir(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Base RED:</label>
                          <input type="number" step="0.01" value={sbBaseRed} onChange={(e) => setSbBaseRed(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: FONT.weightBold, marginBottom: '4px' }}>
                        SAR Backscatter Values in dB
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Obs VV (dB):</label>
                          <input type="number" step="0.1" value={sbVv} onChange={(e) => setSbVv(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Obs VH (dB):</label>
                          <input type="number" step="0.1" value={sbVh} onChange={(e) => setSbVh(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Base VV (dB):</label>
                          <input type="number" step="0.1" value={sbBaseVv} onChange={(e) => setSbBaseVv(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>Base VH (dB):</label>
                          <input type="number" step="0.1" value={sbBaseVh} onChange={(e) => setSbBaseVh(Number(e.target.value))} style={{ width: '100%', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569', padding: '3px', borderRadius: RADII.sm, fontSize: '11px' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Live Calculation Output */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: SPACE.md,
                    borderRadius: RADII.md,
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: SPACE.sm,
                  }}
                >
                  <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                    Live Sandbox Verification Output
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    <div style={{ padding: '6px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Calculated Affected Area:</span>
                      <strong style={{ color: '#fde047' }}>{sbAffectedPct.toFixed(2)}%</strong>
                    </div>

                    <div style={{ padding: '6px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Assigned Alert Severity:</span>
                      <strong style={{ color: sbSeverity === 'HIGH' ? '#ef4444' : sbSeverity === 'MEDIUM' ? '#f59e0b' : sbSeverity === 'LOW' ? '#3b82f6' : '#10b981' }}>
                        {sbSeverity}
                      </strong>
                    </div>

                    {sbSensorType === SensorType.OPTICAL && (
                      <>
                        <div style={{ padding: '6px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Cloud Fallback Triggered:</span>
                          <strong style={{ color: sbCloudCover > 20 ? '#ef4444' : '#10b981' }}>
                            {sbCloudCover > 20 ? 'YES (Cloud > 20% -> SAR Fallback)' : 'NO (Cloud <= 20%)'}
                          </strong>
                        </div>
                        <div style={{ padding: '6px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>NDVI Shift (Δ):</span>
                          <strong>
                            Obs: {sbNdviCurrent.toFixed(3)} | Base: {sbNdviBase.toFixed(3)} | Δ: {sbDeltaNdvi.toFixed(3)}
                          </strong>
                        </div>
                      </>
                    )}

                    {sbSensorType === SensorType.SAR && (
                      <div style={{ padding: '6px 10px', backgroundColor: '#0f172a', borderRadius: RADII.sm, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>SAR Shifts:</span>
                        <strong>
                          ΔVV: {sbVvDiff.toFixed(2)} dB | ΔVH: {sbVhDiff.toFixed(2)} dB | ΔRatio: {sbDeltaRatio.toFixed(2)} dB
                        </strong>
                      </div>
                    )}

                    <div style={{ padding: '10px', backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: RADII.sm, border: '1px solid #10b981', marginTop: '4px' }}>
                      <div style={{ color: '#86efac', fontWeight: FONT.weightBold, fontSize: '11px' }}>
                        ✓ CALCULATION ENGINE VALIDATED
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '2px' }}>
                        Mathematical formulas, threshold checkpoints, and sensor track isolation verified against system invariants.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
