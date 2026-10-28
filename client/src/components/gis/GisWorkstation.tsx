import React, { useState } from 'react';
import {
  GisMapMode,
  SensorType,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type ChangeDetectionDto,
  type MarkedAreaCalculationResultDto,
  type MiningExtractionEstimateDto,
  type AlertDto,
  type TemporaryAreaTimelineItemDto,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII, SHADOWS } from '../../styles/theme';
import { GisLayerControl, type BaseMapType } from './GisLayerControl';
import { GisMapViewer } from './GisMapViewer';
import { GisCalculationVerification } from './GisCalculationVerification';
import { GisHistoricalTimeline } from './GisHistoricalTimeline';
import { GisBeforeAfterComparison } from './GisBeforeAfterComparison';
import { GisCalculationValidationModal } from './GisCalculationValidationModal';

export interface GisWorkstationProps {
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  areaName: string;
  areaId?: string;
  isPermanent?: boolean;
  totalAreaM2?: number;
  totalAreaHectares?: number;
  timeline?: TemporaryAreaTimelineItemDto[];
  results?: MarkedAreaCalculationResultDto[];
  changes?: ChangeDetectionDto[];
  miningEstimates?: MiningExtractionEstimateDto[];
  alerts?: AlertDto[];
  onClose?: () => void;
}

export const GisWorkstation: React.FC<GisWorkstationProps> = ({
  boundary,
  areaName,
  areaId,
  isPermanent = true,
  totalAreaM2,
  totalAreaHectares,
  timeline = [],
  results = [],
  changes = [],
  miningEstimates = [],
  alerts = [],
  onClose,
}) => {
  // State for Workstation Controls
  const [baseMap, setBaseMap] = useState<BaseMapType>('SATELLITE');
  const [activeMode, setActiveMode] = useState<GisMapMode>(GisMapMode.SATELLITE);
  const [sensorFilter, setSensorFilter] = useState<'ALL' | SensorType>('ALL');
  const [showBoundary, setShowBoundary] = useState<boolean>(true);
  const [showChangeOverlay, setShowChangeOverlay] = useState<boolean>(true);
  const [showAlerts, setShowAlerts] = useState<boolean>(true);
  const [showMiningLayer, setShowMiningLayer] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);

  // Selected Timeline Index
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState<number>(
    timeline.length > 0 ? timeline.length - 1 : 0,
  );

  // Modal States
  const [showComparisonModal, setShowComparisonModal] = useState<boolean>(false);
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);

  // Derived current observation & result
  const currentResult: MarkedAreaCalculationResultDto | null =
    results.length > 0
      ? results[Math.min(selectedTimelineIndex, results.length - 1)]
      : null;

  const currentChange: ChangeDetectionDto | null =
    changes.length > 0
      ? changes[Math.min(selectedTimelineIndex, changes.length - 1)]
      : null;

  const currentMining: MiningExtractionEstimateDto | null =
    miningEstimates.length > 0
      ? miningEstimates[Math.min(selectedTimelineIndex, miningEstimates.length - 1)]
      : null;

  const currentAlert: AlertDto | null = alerts.length > 0 ? alerts[0] : null;

  const handleTimelineSelect = (_item: TemporaryAreaTimelineItemDto, index: number) => {
    setSelectedTimelineIndex(index);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '750px',
        backgroundColor: '#020617',
        color: '#f8fafc',
        fontFamily: FONT.family,
        borderRadius: RADII.lg,
        overflow: 'hidden',
        boxShadow: SHADOWS.lg,
        border: '1px solid #334155',
      }}
    >
      {/* ─── Top Workstation Header ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52B788" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="2"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 9.17l4.24-4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M9.17 14.83L4.93 19.07"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(45 12 12)"/></svg>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeLg, color: '#f8fafc' }}>
                Remote-Sensing Investigation Workstation: {areaName}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: FONT.weightBold,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: isPermanent ? 'rgba(16,185,129,0.15)' : 'rgba(234,179,8,0.15)',
                  color: isPermanent ? '#86efac' : '#fde047',
                  border: `1px solid ${isPermanent ? '#10b981' : '#eab308'}`,
                }}
              >
                {isPermanent ? 'PERMANENT MONITORED ZONE' : 'TEMPORARY ANALYSIS AREA'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: FONT.weightBold,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(56,189,248,0.15)',
                  color: '#7dd3fc',
                  border: '1px solid #38bdf8',
                }}
              >
                REAL TELEMETRY
              </span>
            </div>
            {areaId && (
              <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                Identifier: {areaId}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          {/* Validation Tool Button */}
          <button
            onClick={() => setShowValidationModal(true)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1px solid #38bdf8',
              borderRadius: RADII.sm,
              fontSize: FONT.sizeXs,
              fontWeight: FONT.weightBold,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2v6h6"/><path d="M4 16.5V4a2 2 0 012-2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.25 16.25L16 19"/></svg>
            Calculation Validation & Sandbox Tool
          </button>

          {/* Before/After Comparison Trigger */}
          {timeline.length >= 2 && (
            <button
              onClick={() => setShowComparisonModal(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#047857',
                color: '#ffffff',
                border: 'none',
                borderRadius: RADII.sm,
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightBold,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="3" x2="12" y2="21"/><polygon points="8 8 4 12 8 16 8 8"/><polygon points="16 8 20 12 16 16 16 8"/></svg>
              Draggable Before / After Curtain
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #475569',
                color: '#94a3b8',
                borderRadius: RADII.sm,
                padding: '6px 12px',
                fontSize: FONT.sizeXs,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* ─── Main 3-Pane Body ─── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ─── LEFT PANE: Layer Control & Analysis Selector (280px) ─── */}
        <div
          style={{
            width: '290px',
            minWidth: '290px',
            borderRight: '1px solid #334155',
            backgroundColor: '#0f172a',
            overflowY: 'auto',
          }}
        >
          <GisLayerControl
            baseMap={baseMap}
            onBaseMapChange={setBaseMap}
            activeMode={activeMode}
            onModeChange={setActiveMode}
            sensorFilter={sensorFilter}
            onSensorFilterChange={setSensorFilter}
            showBoundary={showBoundary}
            onToggleBoundary={setShowBoundary}
            showChangeOverlay={showChangeOverlay}
            onToggleChangeOverlay={setShowChangeOverlay}
            showAlerts={showAlerts}
            onToggleAlerts={setShowAlerts}
            showMiningLayer={showMiningLayer}
            onToggleMiningLayer={setShowMiningLayer}
            overlayOpacity={overlayOpacity}
            onOpacityChange={setOverlayOpacity}
          />
        </div>

        {/* ─── CENTER PANE: Map Viewer (Flex) ─── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <GisMapViewer
            boundary={boundary}
            areaName={areaName}
            isPermanent={isPermanent}
            baseMap={baseMap}
            activeMode={activeMode}
            onModeChange={setActiveMode}
            selectedResult={currentResult}
            changeDetection={currentChange}
            miningEstimate={currentMining}
            alerts={alerts}
            showBoundary={showBoundary}
            showChangeOverlay={showChangeOverlay}
            showAlerts={showAlerts}
            showMiningLayer={showMiningLayer}
            overlayOpacity={overlayOpacity}
            showComparisonToggle={timeline.length >= 2}
            onOpenComparison={() => setShowComparisonModal(true)}
          />
        </div>

        {/* ─── RIGHT PANE: Calculation Verification Panel (380px) ─── */}
        <div
          style={{
            width: '390px',
            minWidth: '390px',
            borderLeft: '1px solid #334155',
            backgroundColor: '#0f172a',
            overflowY: 'auto',
          }}
        >
          <GisCalculationVerification
            areaName={areaName}
            areaId={areaId}
            isPermanent={isPermanent}
            totalAreaM2={totalAreaM2}
            totalAreaHectares={totalAreaHectares}
            calculationResult={currentResult}
            miningEstimate={currentMining}
            alert={currentAlert}
          />
        </div>
      </div>

      {/* ─── BOTTOM PANE: Historical Observation Chronological Timeline ─── */}
      {timeline.length > 0 && (
        <div
          style={{
            borderTop: '1px solid #334155',
            backgroundColor: '#0f172a',
            padding: `${SPACE.xs} ${SPACE.md}`,
          }}
        >
          <GisHistoricalTimeline
            timeline={timeline}
            selectedStepNumber={timeline[selectedTimelineIndex]?.stepNumber}
            onSelectStep={(item) => {
              const idx = timeline.findIndex((t) => t.stepNumber === item.stepNumber);
              if (idx !== -1) handleTimelineSelect(item, idx);
            }}
          />
        </div>
      )}

      {/* ─── Before / After Split Slider Modal ─── */}
      {showComparisonModal && timeline.length >= 2 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(2, 6, 23, 0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: SPACE.lg,
          }}
        >
          <div
            style={{
              width: '95vw',
              maxWidth: '1300px',
              height: '85vh',
              backgroundColor: '#0f172a',
              borderRadius: RADII.lg,
              boxShadow: SHADOWS.lg,
              border: '1px solid #334155',
              overflow: 'hidden',
            }}
          >
            <GisBeforeAfterComparison
              boundary={boundary}
              areaName={areaName}
              beforeDate={timeline[0].observationDate.slice(0, 10) + ' (Baseline Reference)'}
              beforeSource={timeline[0].satelliteSource}
              beforeSensor={timeline[0].sensorType}
              currentDate={timeline[timeline.length - 1].observationDate.slice(0, 10) + ' (Recent Event)'}
              currentSource={timeline[timeline.length - 1].satelliteSource}
              currentSensor={timeline[timeline.length - 1].sensorType}
              onClose={() => setShowComparisonModal(false)}
            />
          </div>
        </div>
      )}

      {/* ─── Calculation Validation & Sandbox Tool Modal ─── */}
      {showValidationModal && (
        <GisCalculationValidationModal
          areaName={areaName}
          areaId={areaId}
          isPermanent={isPermanent}
          totalAreaM2={totalAreaM2}
          totalAreaHectares={totalAreaHectares}
          timeline={timeline}
          results={results}
          changes={changes}
          selectedTimelineIndex={selectedTimelineIndex}
          onClose={() => setShowValidationModal(false)}
        />
      )}
    </div>
  );
};
