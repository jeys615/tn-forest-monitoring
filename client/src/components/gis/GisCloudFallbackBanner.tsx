import React from 'react';
import { FONT, SPACE, RADII } from '../../styles/theme';
import type { SarMetrics } from '@tn-forest/shared/types';

export interface GisCloudFallbackBannerProps {
  cloudCover: number;
  sarObservationId?: string;
  sarSource?: string;
  sarAcquisitionDate?: string;
  sarMetrics?: SarMetrics;
}

export const GisCloudFallbackBanner: React.FC<GisCloudFallbackBannerProps> = ({
  cloudCover,
  sarObservationId,
  sarSource = 'Sentinel-1 GRD',
  sarAcquisitionDate,
  sarMetrics,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.xs,
        padding: SPACE.sm,
        backgroundColor: 'rgba(124, 58, 237, 0.12)',
        borderRadius: RADII.md,
        border: '1px solid rgba(167, 139, 250, 0.4)',
        color: '#f8fafc',
        fontFamily: FONT.family,
        fontSize: FONT.sizeXs,
      }}
    >
      {/* Badge Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              fontWeight: FONT.weightBold,
              fontSize: '10px',
              letterSpacing: '0.05em',
            }}
          >
            SAR FALLBACK ACTIVE
          </span>
          <span style={{ fontWeight: FONT.weightBold, color: '#c4b5fd' }}>
            Cloud-Aware Microwave Sensor Transition
          </span>
        </div>
        <span style={{ color: '#fca5a5', fontWeight: FONT.weightBold }}>
          Optical Cloud: {cloudCover.toFixed(1)}% (&gt;20%)
        </span>
      </div>

      {/* Pipeline Diagram Graphic */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          backgroundColor: '#0f172a',
          borderRadius: RADII.sm,
          border: '1px solid #334155',
          marginTop: '2px',
          fontSize: '10px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8' }}>Optical Sensor</div>
          <div style={{ fontWeight: FONT.weightBold, color: '#fca5a5' }}>Cloud {cloudCover.toFixed(0)}%</div>
        </div>
        <span style={{ color: '#64748b' }}>➔</span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8' }}>Threshold</div>
          <div style={{ color: '#ef4444', fontWeight: FONT.weightBold }}>&gt;20% Exceeded</div>
        </div>
        <span style={{ color: '#64748b' }}>➔</span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8' }}>Optical Status</div>
          <div style={{ color: '#f59e0b', fontWeight: FONT.weightBold }}>Rejected for Baseline</div>
        </div>
        <span style={{ color: '#64748b' }}>➔</span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8' }}>Fallback Sensor</div>
          <div style={{ color: '#a78bfa', fontWeight: FONT.weightBold }}>{sarSource}</div>
        </div>
        <span style={{ color: '#64748b' }}>➔</span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#94a3b8' }}>Microwave</div>
          <div style={{ color: '#4ade80', fontWeight: FONT.weightBold }}>SAR Analysis Active</div>
        </div>
      </div>

      {/* SAR Telemetry Metrics */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#cbd5e1',
          marginTop: '2px',
        }}
      >
        <div>
          <span>SAR Observation: </span>
          <strong style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>
            {sarObservationId ? sarObservationId.split('/').pop() : 'S1A_IW_GRDH'}
          </strong>
          {sarAcquisitionDate && (
            <span style={{ color: '#94a3b8', marginLeft: '6px' }}>
              ({new Date(sarAcquisitionDate).toLocaleDateString()})
            </span>
          )}
        </div>

        {sarMetrics && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <span>VV: <strong style={{ color: '#a78bfa' }}>{sarMetrics.vv.toFixed(1)} dB</strong></span>
            <span>VH: <strong style={{ color: '#a78bfa' }}>{sarMetrics.vh.toFixed(1)} dB</strong></span>
            <span>VV/VH: <strong style={{ color: '#a78bfa' }}>{sarMetrics.vvVhRatio.toFixed(2)}</strong></span>
          </div>
        )}
      </div>

      <div style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>
        * Invariant Enforced: Optical and SAR operate on dedicated sensor-specific indicators; direct optical-vs-SAR pixel subtraction is prohibited.
      </div>
    </div>
  );
};
