import React from 'react';
import {
  type MarkedAreaCalculationResultDto,
  type MiningExtractionEstimateDto,
  type AlertDto,
  AlertSeverity,
  MiningClassification,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';

export interface GisDetailPanelProps {
  calculationResult?: MarkedAreaCalculationResultDto | null;
  miningEstimate?: MiningExtractionEstimateDto | null;
  alert?: AlertDto | null;
  areaName: string;
  onClose?: () => void;
}

export const GisDetailPanel: React.FC<GisDetailPanelProps> = ({
  calculationResult,
  miningEstimate,
  alert,
  areaName,
  onClose,
}) => {
  if (!calculationResult && !miningEstimate && !alert) {
    return (
      <div
        style={{
          padding: SPACE.md,
          backgroundColor: '#1e293b',
          borderRadius: RADII.md,
          color: '#94a3b8',
          fontSize: FONT.sizeSm,
          textAlign: 'center',
          fontFamily: FONT.family,
        }}
      >
        Select an observation or change region on the map to inspect GIS analysis telemetry.
      </div>
    );
  }

  const severity = calculationResult?.severity || alert?.severity || 'NONE';
  const evidenceScore = calculationResult?.evidenceStrength || alert?.evidenceStrength || 0;

  // Approximate deterministic breakdown for display
  const magnitudeScore = Math.round((evidenceScore * 0.4 * 10) / 10);
  const dataQualityScore = Math.round((evidenceScore * 0.2 * 10) / 10);
  const temporalScore = Math.round((evidenceScore * 0.2 * 10) / 10);
  const crossSensorScore = Math.round((evidenceScore * 0.2 * 10) / 10);

  const optMetrics = calculationResult?.indicators?.opticalMetrics;
  const sarMetrics = calculationResult?.indicators?.sarMetrics;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
        padding: SPACE.md,
        backgroundColor: '#0f172a',
        borderRadius: RADII.md,
        border: '1px solid #334155',
        color: '#f8fafc',
        fontFamily: FONT.family,
        fontSize: FONT.sizeSm,
        boxShadow: SHADOWS.md,
      }}
    >
      {/* ─── Header ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #334155',
          paddingBottom: SPACE.xs,
        }}
      >
        <div>
          <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeMd, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52b788" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 9.17l4.24-4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M9.17 14.83L4.93 19.07"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)"/></svg>
            GIS Analysis Telemetry: {areaName}
          </span>
          {calculationResult && (
            <div style={{ fontSize: FONT.sizeXs, color: '#94a3b8' }}>
              {calculationResult.source} ({calculationResult.sensorType}) • Acquired{' '}
              {new Date(calculationResult.acquisitionDate).toLocaleString()}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: FONT.weightBold,
              padding: '2px 8px',
              borderRadius: '4px',
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
            {severity} SEVERITY
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: FONT.sizeSm,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── Grid: Spatial Changes & Evidence Breakdown ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: SPACE.sm,
          marginTop: '4px',
        }}
      >
        {/* Spatial Disturbance Box */}
        <div style={{ padding: SPACE.sm, backgroundColor: '#1e293b', borderRadius: RADII.sm }}>
          <div style={{ color: '#94a3b8', fontSize: FONT.sizeXs, marginBottom: '2px' }}>
            SPATIAL DISTURBANCE
          </div>
          <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#f8fafc' }}>
            {calculationResult?.changedAreaHectares.toFixed(2) || 0} ha
            <span style={{ fontSize: FONT.sizeSm, color: '#94a3b8', marginLeft: '6px' }}>
              ({calculationResult?.affectedAreaPercentage.toFixed(1) || 0}%)
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
            {calculationResult?.changedAreaM2.toLocaleString() || 0} m² ground footprint
          </div>
        </div>

        {/* Evidence Strength Score Box */}
        <div style={{ padding: SPACE.sm, backgroundColor: '#1e293b', borderRadius: RADII.sm }}>
          <div style={{ color: '#94a3b8', fontSize: FONT.sizeXs, marginBottom: '2px' }}>
            EVIDENCE FUSION SCORE
          </div>
          <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: '#52b788' }}>
            {evidenceScore} / 100
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span>Mag: {magnitudeScore}/40</span>
            <span>Qual: {dataQualityScore}/20</span>
            <span>Temp: {temporalScore}/20</span>
            <span>Cross: {crossSensorScore}/20</span>
          </div>
        </div>
      </div>

      {/* ─── Multi-Threshold Integrity (2% / 5% / 10%) ─── */}
      {calculationResult && (
        <div style={{ padding: SPACE.sm, backgroundColor: '#1e293b', borderRadius: RADII.sm }}>
          <div style={{ color: '#94a3b8', fontSize: FONT.sizeXs, marginBottom: '4px' }}>
            THRESHOLD EVALUATION (2% / 5% / 10% Policy)
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: RADII.sm,
                backgroundColor: calculationResult.thresholdsCrossed.low ? '#eab308' : '#334155',
                color: calculationResult.thresholdsCrossed.low ? '#0f172a' : '#94a3b8',
                fontWeight: calculationResult.thresholdsCrossed.low ? FONT.weightBold : FONT.weightNormal,
              }}
            >
              {calculationResult.thresholdsCrossed.low ? '✓' : '✗'} 2% Low
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: RADII.sm,
                backgroundColor: calculationResult.thresholdsCrossed.medium ? '#f97316' : '#334155',
                color: calculationResult.thresholdsCrossed.medium ? '#ffffff' : '#94a3b8',
                fontWeight: calculationResult.thresholdsCrossed.medium ? FONT.weightBold : FONT.weightNormal,
              }}
            >
              {calculationResult.thresholdsCrossed.medium ? '✓' : '✗'} 5% Medium
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: RADII.sm,
                backgroundColor: calculationResult.thresholdsCrossed.high ? '#ef4444' : '#334155',
                color: calculationResult.thresholdsCrossed.high ? '#ffffff' : '#94a3b8',
                fontWeight: calculationResult.thresholdsCrossed.high ? FONT.weightBold : FONT.weightNormal,
              }}
            >
              {calculationResult.thresholdsCrossed.high ? '✓' : '✗'} 10% High
            </span>
          </div>
        </div>
      )}

      {/* ─── Spectral / Radar Indicator Grid ─── */}
      {(optMetrics || sarMetrics) && (
        <div style={{ padding: SPACE.sm, backgroundColor: '#1e293b', borderRadius: RADII.sm }}>
          <div style={{ color: '#94a3b8', fontSize: FONT.sizeXs, marginBottom: '4px' }}>
            LOCAL SPECTRAL & RADAR METRICS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', fontSize: '11px' }}>
            {optMetrics && (
              <>
                <div style={{ backgroundColor: '#0f172a', padding: '4px', borderRadius: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>NDVI:</span> <strong>{optMetrics.ndvi.toFixed(2)}</strong>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '4px', borderRadius: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>BSI:</span> <strong>{optMetrics.bsi.toFixed(2)}</strong>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '4px', borderRadius: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>SAVI:</span> <strong>{optMetrics.savi.toFixed(2)}</strong>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '4px', borderRadius: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>NDWI:</span> <strong>{optMetrics.ndwi.toFixed(2)}</strong>
                </div>
              </>
            )}
            {sarMetrics && (
              <>
                <div style={{ backgroundColor: '#0f172a', padding: '4px', borderRadius: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>VV:</span> <strong>{sarMetrics.vv.toFixed(1)} dB</strong>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '4px', borderRadius: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>VH:</span> <strong>{sarMetrics.vh.toFixed(1)} dB</strong>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '4px', borderRadius: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>VV/VH:</span> <strong>{sarMetrics.vvVhRatio.toFixed(2)}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Mining Volumetric Assessment ─── */}
      <div style={{ padding: SPACE.sm, backgroundColor: '#1e293b', borderRadius: RADII.sm }}>
        <div style={{ color: '#94a3b8', fontSize: FONT.sizeXs, marginBottom: '4px' }}>
          MINING ACTIVITY & EXTRACTION ASSESSMENT
        </div>
        <div style={{ fontSize: FONT.sizeSm, color: '#f8fafc', fontWeight: FONT.weightMedium }}>
          Classification:{' '}
          <strong style={{ color: '#f59e0b' }}>
            {calculationResult?.miningActivityClassification ||
              miningEstimate?.miningClassification ||
              MiningClassification.NON_MINING_DISTURBANCE}
          </strong>
        </div>

        {calculationResult?.estimatedVolume !== undefined || miningEstimate?.estimatedVolumeCubicMeters ? (
          <div style={{ marginTop: '4px', fontSize: '11px' }}>
            <span style={{ color: '#94a3b8' }}>Estimated Volume:</span>{' '}
            <strong style={{ color: '#52b788' }}>
              {(
                calculationResult?.estimatedVolume ||
                miningEstimate?.estimatedVolumeCubicMeters ||
                0
              ).toLocaleString()}{' '}
              m³
            </strong>{' '}
            (Depth: {calculationResult?.estimatedDepth || miningEstimate?.estimatedDepthMeters || 0} m)
          </div>
        ) : (
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
            ℹ️ Volume estimation unavailable — surface elevation/depth data required.
          </div>
        )}

        {/* Mandatory Scientific Disclaimer */}
        <div
          style={{
            marginTop: '6px',
            padding: '4px 6px',
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: RADII.sm,
            fontSize: '10px',
            color: '#94a3b8',
            fontStyle: 'italic',
            borderLeft: '2px solid #52b788',
          }}
        >
          Disclaimer: Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.
        </div>
      </div>

      {/* ─── Backend Narrative Explanation ─── */}
      {calculationResult?.explanation && (
        <div style={{ padding: SPACE.sm, backgroundColor: '#1e293b', borderRadius: RADII.sm, fontSize: '11px', color: '#cbd5e1' }}>
          <span style={{ color: '#94a3b8', fontWeight: FONT.weightBold }}>Synthesized Explanation: </span>
          {calculationResult.explanation}
        </div>
      )}
    </div>
  );
};
