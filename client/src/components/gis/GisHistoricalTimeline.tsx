import React from 'react';
import {
  type TemporaryAreaTimelineItemDto,
  AlertSeverity,
  MiningClassification,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';

export interface GisHistoricalTimelineProps {
  timeline: TemporaryAreaTimelineItemDto[];
  selectedStepNumber?: number;
  onSelectStep?: (item: TemporaryAreaTimelineItemDto) => void;
}

export const GisHistoricalTimeline: React.FC<GisHistoricalTimelineProps> = ({
  timeline,
  selectedStepNumber,
  onSelectStep,
}) => {
  if (!timeline || timeline.length === 0) {
    return (
      <div
        style={{
          padding: SPACE.md,
          backgroundColor: '#1e293b',
          borderRadius: RADII.md,
          color: '#94a3b8',
          fontSize: FONT.sizeSm,
          textAlign: 'center',
        }}
      >
        No historical observation timeline recorded yet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
        fontFamily: FONT.family,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}
      >
        <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          CHRONOLOGICAL OBSERVATION TIMELINE ({timeline.length} Steps)
        </span>
        <span style={{ fontSize: FONT.sizeXs, color: '#94a3b8' }}>
          Earliest Baseline → Recent Change Detection
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          gap: SPACE.md,
          padding: `${SPACE.sm} 4px`,
          scrollbarWidth: 'thin',
        }}
      >
        {timeline.map((item) => {
          const isSelected = selectedStepNumber === item.stepNumber;
          const obsDate = new Date(item.observationDate).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return (
            <div
              key={item.stepNumber}
              onClick={() => onSelectStep && onSelectStep(item)}
              style={{
                minWidth: '220px',
                maxWidth: '260px',
                padding: SPACE.md,
                backgroundColor: isSelected ? '#1b4332' : '#1e293b',
                border: isSelected ? '2px solid #52b788' : '1px solid #334155',
                borderRadius: RADII.md,
                cursor: onSelectStep ? 'pointer' : 'default',
                boxShadow: isSelected ? SHADOWS.md : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Step & Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: FONT.weightBold,
                    padding: '1px 6px',
                    borderRadius: RADII.sm,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: '#94a3b8',
                  }}
                >
                  STEP #{item.stepNumber}
                </span>
                <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: '#f8fafc' }}>
                  {obsDate}
                </span>
              </div>

              {/* Satellite Source & Cloud */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#cbd5e1' }}>
                <span>{item.satelliteSource} ({item.sensorType})</span>
                {item.sensorType === 'OPTICAL' && (
                  <span style={{ color: item.cloudCover > 20 ? '#f87171' : '#86efac', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>
                    {item.cloudCover.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Affected Area & Severity Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: '#f8fafc' }}>
                  {item.changedAreaHectares.toFixed(2)} ha ({item.affectedAreaPercentage.toFixed(1)}%)
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: FONT.weightBold,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor:
                      item.severity === AlertSeverity.HIGH
                        ? '#ef4444'
                        : item.severity === AlertSeverity.MEDIUM
                        ? '#f97316'
                        : item.severity === AlertSeverity.LOW
                        ? '#eab308'
                        : '#22c55e',
                    color: '#ffffff',
                  }}
                >
                  {item.severity}
                </span>
              </div>

              {/* Cumulative & Progressive Expansion */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                <span>Cumulative: {item.cumulativeChangedAreaHectares.toFixed(2)} ha</span>
                {item.isProgressiveExpansion && (
                  <span style={{ color: '#fca5a5', fontWeight: FONT.weightBold, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    PROGRESSIVE EXPANSION
                  </span>
                )}
              </div>

              {/* Evidence Strength & Mining Classification */}
              <div
                style={{
                  fontSize: '10px',
                  color: '#52b788',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Evidence: {item.evidenceStrength} / 100</span>
                <span style={{ color: '#94a3b8' }}>
                  {item.miningClassification === MiningClassification.NON_MINING_DISTURBANCE
                    ? 'Non-mining'
                    : item.miningClassification.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
