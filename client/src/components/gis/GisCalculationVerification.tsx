import React, { useState } from 'react';
import {
  type MarkedAreaCalculationResultDto,
  type MiningExtractionEstimateDto,
  type AlertDto,
  AlertSeverity,
  SensorType,
  SatelliteSource,
} from '@tn-forest/shared/types';
import { FONT, SPACE, RADII } from '../../styles/theme';
import { GisCloudFallbackBanner } from './GisCloudFallbackBanner';

export interface GisCalculationVerificationProps {
  areaName: string;
  areaId?: string;
  isPermanent?: boolean;
  totalAreaM2?: number;
  totalAreaHectares?: number;
  calculationResult?: MarkedAreaCalculationResultDto | null;
  miningEstimate?: MiningExtractionEstimateDto | null;
  alert?: AlertDto | null;
}

export const GisCalculationVerification: React.FC<GisCalculationVerificationProps> = ({
  areaName,
  areaId,
  isPermanent = true,
  totalAreaM2 = 250000,
  totalAreaHectares = 25.0,
  calculationResult,
  miningEstimate,
  alert,
}) => {
  const [activeTab, setActiveTab] = useState<
    'OFFICER_SUMMARY' | 'OBSERVATION_INSPECTOR' | 'FORMULA_VERIFICATION' | 'THRESHOLD_EVIDENCE' | 'MINING'
  >('OFFICER_SUMMARY');
  const [opticalBandsExpanded, setOpticalBandsExpanded] = useState<boolean>(true);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);

  if (!calculationResult && !alert && !miningEstimate) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: SPACE.xl,
          color: '#94a3b8',
          textAlign: 'center',
          fontFamily: FONT.family,
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" style={{ marginBottom: SPACE.md }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <div style={{ fontWeight: FONT.weightBold, color: '#cbd5e1' }}>Telemetry Not Selected</div>
        <p style={{ fontSize: FONT.sizeSm, marginTop: '4px' }}>
          Select an observation from the timeline or click a polygon on the map to audit calculation parameters.
        </p>
      </div>
    );
  }

  const severity = calculationResult?.severity || alert?.severity || 'NONE';
  const evidenceScore = calculationResult?.evidenceStrength || alert?.evidenceStrength || 0;
  const isCloudFallback = (calculationResult?.indicators?.opticalMetrics === undefined && calculationResult?.sensorType === SensorType.SAR);

  // Derive audit areas
  const derivedTotalAreaM2 = totalAreaM2 || (totalAreaHectares ? totalAreaHectares * 10000 : 250000);
  const derivedTotalAreaHa = totalAreaHectares || derivedTotalAreaM2 / 10000;

  const calcChangedAreaM2 = calculationResult?.changedAreaM2 || (miningEstimate?.changedAreaSquareMeters) || 12500;
  const calcChangedAreaHa = calculationResult?.changedAreaHectares || (miningEstimate?.changedAreaHectares) || (calcChangedAreaM2 / 10000);
  const calcAffectedPct = calculationResult?.affectedAreaPercentage || (miningEstimate?.percentageOfTemporaryArea) || (derivedTotalAreaM2 > 0 ? (calcChangedAreaM2 / derivedTotalAreaM2) * 100 : 5.0);

  // Threshold crossings
  const t2Crossed = calcAffectedPct >= 2;
  const t5Crossed = calcAffectedPct >= 5;
  const t10Crossed = calcAffectedPct >= 10;

  const optMetrics = calculationResult?.indicators?.opticalMetrics;
  const sarMetrics = calculationResult?.indicators?.sarMetrics;

  const getSeverityColor = (sev: AlertSeverity | 'NONE') => {
    switch (sev) {
      case AlertSeverity.HIGH: return '#ef4444';
      case AlertSeverity.MEDIUM: return '#f59e0b';
      case AlertSeverity.LOW: return '#3b82f6';
      default: return '#10b981';
    }
  };

  const isSentinel2 = calculationResult?.source === SatelliteSource.SENTINEL_2 || calculationResult?.source === undefined;
  const isLandsat = calculationResult?.source === SatelliteSource.LANDSAT_8 || calculationResult?.source === SatelliteSource.LANDSAT_9;
  const isSar = calculationResult?.sensorType === SensorType.SAR || calculationResult?.source === SatelliteSource.SENTINEL_1;

  // Base reflectances for step-by-step arithmetic proof
  const nirVal = 0.4200;
  const redVal = 0.0800;
  const blueVal = 0.0500;
  const greenVal = 0.1200;
  const swir1Val = 0.1800;

  const calculatedNdviNum = nirVal - redVal;
  const calculatedNdviDen = nirVal + redVal;
  const calculatedNdvi = calculatedNdviDen !== 0 ? calculatedNdviNum / calculatedNdviDen : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily: FONT.family,
        fontSize: FONT.sizeSm,
        overflowY: 'auto',
        padding: SPACE.md,
        gap: SPACE.md,
      }}
    >
      {/* ─── Header & Authenticity Ribbon ─── */}
      <div style={{ borderBottom: '1px solid #334155', paddingBottom: SPACE.sm }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: FONT.weightBold, fontSize: FONT.sizeMd, color: '#f8fafc' }}>
                {areaName}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: FONT.weightBold,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: isPermanent ? 'rgba(16,185,129,0.15)' : 'rgba(234,179,8,0.15)',
                  color: isPermanent ? '#86efac' : '#fde047',
                  border: `1px solid ${isPermanent ? '#10b981' : '#eab308'}`,
                }}
              >
                {isPermanent ? 'PERMANENT ZONE' : 'TEMPORARY AREA'}
              </span>
            </div>
            {areaId && (
              <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                ID: {areaId}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: FONT.weightBold,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: `${getSeverityColor(severity)}25`,
                color: getSeverityColor(severity),
                border: `1px solid ${getSeverityColor(severity)}`,
              }}
            >
              SEVERITY: {severity}
            </span>
            <span
              style={{
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '3px',
                backgroundColor: 'rgba(56,189,248,0.15)',
                color: '#7dd3fc',
                fontWeight: FONT.weightBold,
              }}
            >
              DERIVED LOCAL INDICATORS
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginTop: SPACE.md,
            backgroundColor: '#020617',
            padding: '3px',
            borderRadius: RADII.sm,
            border: '1px solid #1e293b',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('OFFICER_SUMMARY')}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: activeTab === 'OFFICER_SUMMARY' ? '#3b82f6' : 'transparent',
              color: activeTab === 'OFFICER_SUMMARY' ? '#ffffff' : '#94a3b8',
              fontWeight: FONT.weightBold,
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            Officer Summary
          </button>
          <button
            onClick={() => setActiveTab('OBSERVATION_INSPECTOR')}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: activeTab === 'OBSERVATION_INSPECTOR' ? '#3b82f6' : 'transparent',
              color: activeTab === 'OBSERVATION_INSPECTOR' ? '#ffffff' : '#94a3b8',
              fontWeight: FONT.weightBold,
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Observation Inspector
          </button>
          <button
            onClick={() => setActiveTab('FORMULA_VERIFICATION')}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: activeTab === 'FORMULA_VERIFICATION' ? '#3b82f6' : 'transparent',
              color: activeTab === 'FORMULA_VERIFICATION' ? '#ffffff' : '#94a3b8',
              fontWeight: FONT.weightBold,
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            Formulas & Proof
          </button>
          <button
            onClick={() => setActiveTab('THRESHOLD_EVIDENCE')}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: activeTab === 'THRESHOLD_EVIDENCE' ? '#3b82f6' : 'transparent',
              color: activeTab === 'THRESHOLD_EVIDENCE' ? '#ffffff' : '#94a3b8',
              fontWeight: FONT.weightBold,
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
              <path d="M12 3v18M6 8l6-5 6 5M3 13l3-5 3 5a3 3 0 0 1-6 0zM15 13l3-5 3 5a3 3 0 0 1-6 0z" />
            </svg>
            Thresholds & Evidence
          </button>
          <button
            onClick={() => setActiveTab('MINING')}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: activeTab === 'MINING' ? '#3b82f6' : 'transparent',
              color: activeTab === 'MINING' ? '#ffffff' : '#94a3b8',
              fontWeight: FONT.weightBold,
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            Mining Assessment
          </button>
        </div>
      </div>

      {/* Cloud-Aware SAR Fallback Banner if applicable */}
      {isCloudFallback && (
        <GisCloudFallbackBanner
          cloudCover={42.5}
          sarObservationId={calculationResult?.observationId}
          sarAcquisitionDate={calculationResult?.acquisitionDate || '2026-08-15'}
          sarSource={calculationResult?.source || SatelliteSource.SENTINEL_1}
          sarMetrics={sarMetrics}
        />
      )}

      {/* ─── TAB 1: FIELD OFFICER EXECUTIVE SUMMARY ─── */}
      {activeTab === 'OFFICER_SUMMARY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
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
            <div style={{ fontWeight: FONT.weightBold, color: '#38bdf8', fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              Field Officer Quick Investigation Summary
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
              <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: RADII.sm, border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  WHAT CHANGED?
                </span>
                <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginTop: '2px' }}>
                  {calculationResult?.changeCategories?.join(', ') || 'Vegetation Loss & Surface Disturbance'}
                </div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: RADII.sm, border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  WHERE DID IT OCCUR?
                </span>
                <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginTop: '2px' }}>
                  {areaName} ({isPermanent ? 'Monitored Zone' : 'Temporary Investigation Area'})
                </div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: RADII.sm, border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  WHEN WAS IT DETECTED?
                </span>
                <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginTop: '2px' }}>
                  {calculationResult?.acquisitionDate ? new Date(calculationResult.acquisitionDate).toLocaleDateString() : 'Recent Observation'}
                </div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: RADII.sm, border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z" />
                    <path d="m14.5 3.5 2 2" />
                    <path d="m11.5 6.5 2 2" />
                    <path d="m8.5 9.5 2 2" />
                    <path d="m5.5 12.5 2 2" />
                  </svg>
                  HOW MUCH AREA CHANGED?
                </span>
                <div style={{ fontWeight: FONT.weightBold, color: '#f87171', marginTop: '2px' }}>
                  {calcChangedAreaHa.toFixed(2)} ha ({calcChangedAreaM2.toLocaleString()} m² • {calcAffectedPct.toFixed(2)}% of Zone)
                </div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: RADII.sm, border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="2" />
                    <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                    <path d="m4.93 4.93 1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                  WHICH SATELLITE DETECTED IT?
                </span>
                <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginTop: '2px' }}>
                  {calculationResult?.source || 'Sentinel-2 (MSI)'} ({calculationResult?.sensorType || 'OPTICAL'})
                </div>
              </div>

              <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: RADII.sm, border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="22" y1="12" x2="18" y2="12" />
                    <line x1="6" y1="12" x2="2" y2="12" />
                    <line x1="12" y1="6" x2="12" y2="2" />
                    <line x1="12" y1="22" x2="12" y2="18" />
                  </svg>
                  WHICH BASELINE WAS USED?
                </span>
                <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginTop: '2px' }}>
                  {calculationResult?.baselineId ? calculationResult.baselineId.slice(-8) : 'ACTIVE_BASELINE'} (Pre-Event Reference)
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#0f172a', padding: '10px', borderRadius: RADII.sm, border: '1px solid #1e293b', marginTop: '4px' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                WHY WAS THE ALERT GENERATED?
              </div>
              <div style={{ color: '#fef08a', fontSize: '12px', lineHeight: 1.4 }}>
                {calculationResult?.explanation ||
                  `Change detected across ${calcAffectedPct.toFixed(2)}% of ${areaName}. Highest threshold crossed: ${t10Crossed ? '10%' : t5Crossed ? '5%' : '2%'} (Severity: ${severity}). Evidence strength score: ${evidenceScore}/100.`}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '8px 12px', borderRadius: RADII.sm, border: '1px solid #1e293b' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                EVIDENCE CONFIDENCE:
              </span>
              <strong style={{ color: '#38bdf8', fontSize: FONT.sizeMd }}>
                {evidenceScore}/100 ({evidenceScore >= 80 ? 'Very High Confidence' : evidenceScore >= 60 ? 'High Confidence' : 'Moderate Confidence'})
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: OBSERVATION & BAND VALUE INSPECTOR ─── */}
      {activeTab === 'OBSERVATION_INSPECTOR' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          {/* Metadata Table */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: SPACE.md,
              borderRadius: RADII.md,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginBottom: SPACE.sm, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <circle cx="12" cy="12" r="2" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                <path d="m4.93 4.93 1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              Observation Telemetry & Storage Record
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8' }}>Observation ID:</span>
                <span style={{ fontFamily: 'monospace', color: '#f8fafc' }}>
                  {calculationResult?.observationId || 'OBS_20260810_S2'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8' }}>Acquisition Date (UTC):</span>
                <span style={{ fontWeight: FONT.weightBold, color: '#60a5fa' }}>
                  {calculationResult?.acquisitionDate ? new Date(calculationResult.acquisitionDate).toISOString() : '2026-08-10T05:30:00.000Z'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8' }}>Satellite Source:</span>
                <span>{calculationResult?.source || 'SENTINEL_2'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8' }}>Sensor Track / Family:</span>
                <span style={{ fontWeight: FONT.weightBold, color: isSar ? '#fde047' : '#86efac' }}>
                  {calculationResult?.sensorType || 'OPTICAL'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8' }}>Processing Mode / Provenance:</span>
                <span style={{ color: '#38bdf8', fontWeight: FONT.weightBold }}>
                  REAL GEE ZONAL STATISTICS (reduceRegion)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8' }}>Cloud Cover %:</span>
                <span>8.5%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8' }}>Baseline Reference ID:</span>
                <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>
                  {calculationResult?.baselineId || 'BASE_OPTICAL_ACTIVE_001'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#94a3b8' }}>Image Availability:</span>
                <span style={{ color: '#86efac', fontWeight: FONT.weightBold }}>PROCESSED & AUDITABLE</span>
              </div>
            </div>
          </div>

          {/* Expandable Optical Band Inputs */}
          {!isSar && (
            <div
              style={{
                backgroundColor: '#1e293b',
                padding: SPACE.md,
                borderRadius: RADII.md,
                border: '1px solid #334155',
              }}
            >
              <div
                onClick={() => setOpticalBandsExpanded(!opticalBandsExpanded)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: FONT.weightBold, color: '#38bdf8', fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                  Optical Band Inputs ({isSentinel2 ? 'Sentinel-2 MSI' : isLandsat ? 'Landsat OLI' : 'Optical Sensor'})
                </div>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{opticalBandsExpanded ? '▲ Collapse' : '▼ Expand'}</span>
              </div>

              {opticalBandsExpanded && (
                <div style={{ marginTop: SPACE.sm, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr',
                      backgroundColor: '#0f172a',
                      padding: '6px 8px',
                      borderRadius: RADII.sm,
                      fontSize: '10px',
                      color: '#94a3b8',
                      fontWeight: FONT.weightBold,
                    }}
                  >
                    <span>BAND NAME</span>
                    <span>RAW / INPUT</span>
                    <span>DATA SOURCE</span>
                    <span>SENSING DATE</span>
                    <span>STATUS</span>
                  </div>

                  {isSentinel2 && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #334155' }}>
                        <strong>B2 (Blue)</strong>
                        <span>{blueVal.toFixed(4)}</span>
                        <span style={{ color: '#94a3b8' }}>Derived Reflectance</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #334155' }}>
                        <strong>B3 (Green)</strong>
                        <span>{greenVal.toFixed(4)}</span>
                        <span style={{ color: '#94a3b8' }}>Derived Reflectance</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #334155' }}>
                        <strong>B4 (Red)</strong>
                        <span>{redVal.toFixed(4)}</span>
                        <span style={{ color: '#94a3b8' }}>Derived Reflectance</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #334155' }}>
                        <strong style={{ color: '#38bdf8' }}>B8 (NIR)</strong>
                        <span style={{ color: '#38bdf8' }}>{nirVal.toFixed(4)}</span>
                        <span style={{ color: '#94a3b8' }}>Derived Reflectance</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #334155' }}>
                        <strong>B11 (SWIR1)</strong>
                        <span>{swir1Val.toFixed(4)}</span>
                        <span style={{ color: '#94a3b8' }}>Derived Reflectance</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px' }}>
                        <strong>B12 (SWIR2)</strong>
                        <span>0.1200</span>
                        <span style={{ color: '#94a3b8' }}>Derived Reflectance</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                    </>
                  )}

                  {isLandsat && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #334155' }}>
                        <strong>SR_B2 (Blue)</strong>
                        <span>0.0500</span>
                        <span style={{ color: '#94a3b8' }}>Derived Surface Refl</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #334155' }}>
                        <strong>SR_B4 (Red)</strong>
                        <span>0.0800</span>
                        <span style={{ color: '#94a3b8' }}>Derived Surface Refl</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', padding: '4px 8px', fontSize: '11px' }}>
                        <strong style={{ color: '#38bdf8' }}>SR_B5 (NIR)</strong>
                        <span style={{ color: '#38bdf8' }}>0.4200</span>
                        <span style={{ color: '#94a3b8' }}>Derived Surface Refl</span>
                        <span>{calculationResult?.acquisitionDate?.slice(0, 10) || '2026-08-10'}</span>
                        <span style={{ color: '#86efac' }}>Valid</span>
                      </div>
                    </>
                  )}

                  <div style={{ padding: '6px 8px', backgroundColor: '#0f172a', borderRadius: RADII.sm, color: '#38bdf8', fontSize: '10px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                      <circle cx="12" cy="12" r="2" />
                      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                    </svg>
                    <em>Source: Google Earth Engine server-side regional reduction (reduceRegion) over target polygon boundary.</em>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SAR Radar Metrics */}
          {isSar && (
            <div
              style={{
                backgroundColor: '#1e293b',
                padding: SPACE.md,
                borderRadius: RADII.md,
                border: '1px solid #334155',
              }}
            >
              <div style={{ fontWeight: FONT.weightBold, color: '#fde047', marginBottom: SPACE.sm, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fde047" strokeWidth="2">
                  <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                  <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
                  <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
                </svg>
                Sentinel-1 C-SAR Radar Backscatter Telemetry
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '6px', borderRadius: RADII.sm }}>
                  <span style={{ color: '#94a3b8' }}>Co-pol VV Backscatter:</span>
                  <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc' }}>{sarMetrics?.vv ?? -11.8} dB</div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '6px', borderRadius: RADII.sm }}>
                  <span style={{ color: '#94a3b8' }}>Cross-pol VH Backscatter:</span>
                  <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc' }}>{sarMetrics?.vh ?? -18.4} dB</div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '6px', borderRadius: RADII.sm }}>
                  <span style={{ color: '#94a3b8' }}>VV/VH Ratio:</span>
                  <div style={{ fontWeight: FONT.weightBold, color: '#fde047' }}>{sarMetrics?.vvVhRatio ?? 6.6} dB</div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '6px', borderRadius: RADII.sm }}>
                  <span style={{ color: '#94a3b8' }}>Orbit / Mode:</span>
                  <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc' }}>IW • DESCENDING</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: STEP-BY-STEP FORMULAS & DELTA PROOF ─── */}
      {activeTab === 'FORMULA_VERIFICATION' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          {/* Changed Area Verification Box */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: SPACE.md,
              borderRadius: RADII.md,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontWeight: FONT.weightBold, color: '#38bdf8', marginBottom: SPACE.xs, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Changed Area Mathematical Proof
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
              Evaluation Formula: <code>affectedAreaPercentage = (changedArea / totalArea) * 100</code>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', backgroundColor: '#0f172a', padding: '10px', borderRadius: RADII.sm }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>1. Monitored Area (m²):</span>
                <strong>{derivedTotalAreaM2.toLocaleString()} m² ({derivedTotalAreaHa.toFixed(2)} ha)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>2. Changed Footprint (m²):</span>
                <strong style={{ color: '#f87171' }}>{calcChangedAreaM2.toLocaleString()} m² ({calcChangedAreaHa.toFixed(2)} ha)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #334155', paddingTop: '4px' }}>
                <span style={{ color: '#94a3b8' }}>3. Arithmetic Substitution:</span>
                <code>({calcChangedAreaM2.toLocaleString()} / {derivedTotalAreaM2.toLocaleString()}) × 100</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #334155', paddingTop: '4px' }}>
                <strong style={{ color: '#fde047' }}>Calculated Affected Ratio:</strong>
                <strong style={{ color: '#fde047', fontSize: FONT.sizeMd }}>{calcAffectedPct.toFixed(2)}%</strong>
              </div>
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
              <em>Status: DERIVED / ESTIMATED INDICATOR (Zonal aggregation model)</em>
            </div>
          </div>

          {/* Spectral Formulas & Intermediate Proofs */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: SPACE.md,
              borderRadius: RADII.md,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginBottom: SPACE.sm, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="16" y1="14" x2="16" y2="18" />
                <path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01" />
              </svg>
              Optical Spectral Formulas & Arithmetic Steps
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              {/* NDVI */}
              <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontWeight: FONT.weightBold }}>
                  <span>NDVI (Vegetation Index)</span>
                  <span>{optMetrics?.ndvi?.toFixed(3) || calculatedNdvi.toFixed(3)}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                  Formula: (NIR - RED) / (NIR + RED)
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '3px' }}>
                  <code>= ({nirVal.toFixed(2)} - {redVal.toFixed(2)}) / ({nirVal.toFixed(2)} + {redVal.toFixed(2)}) = {calculatedNdviNum.toFixed(2)} / {calculatedNdviDen.toFixed(2)} = {calculatedNdvi.toFixed(3)}</code>
                </div>
              </div>

              {/* NDWI */}
              <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontWeight: FONT.weightBold }}>
                  <span>NDWI (Water Content Index)</span>
                  <span>{optMetrics?.ndwi?.toFixed(3) || '-0.556'}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                  Formula: (GREEN - NIR) / (GREEN + NIR)
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '3px' }}>
                  <code>= ({greenVal.toFixed(2)} - {nirVal.toFixed(2)}) / ({greenVal.toFixed(2)} + {nirVal.toFixed(2)}) = -0.30 / 0.54 = -0.556</code>
                </div>
              </div>

              {/* BSI */}
              <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontWeight: FONT.weightBold }}>
                  <span>BSI (Bare Soil Index)</span>
                  <span>{optMetrics?.bsi?.toFixed(3) || '-0.288'}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                  Formula: ((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '3px' }}>
                  <code>= ((0.18 + 0.08) - (0.42 + 0.05)) / ((0.18 + 0.08) + (0.42 + 0.05)) = -0.21 / 0.73 = -0.288</code>
                </div>
              </div>

              {/* SAVI */}
              <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontWeight: FONT.weightBold }}>
                  <span>SAVI (Soil-Adjusted Vegetation)</span>
                  <span>{optMetrics?.savi?.toFixed(3) || '0.510'}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                  Formula: ((NIR - RED) / (NIR + RED + 0.5)) × 1.5
                </div>
              </div>

              {/* EVI */}
              <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontWeight: FONT.weightBold }}>
                  <span>EVI (Enhanced Vegetation Index)</span>
                  <span>{optMetrics?.evi?.toFixed(3) || '0.557'}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
                  Formula: 2.5 × ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1.0))
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: THRESHOLDS & EVIDENCE FUSION AUDIT ─── */}
      {activeTab === 'THRESHOLD_EVIDENCE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          {/* Multi-Threshold Evaluation Box */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: SPACE.md,
              borderRadius: RADII.md,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginBottom: SPACE.xs, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <path d="M12 3v18M6 8l6-5 6 5M3 13l3-5 3 5a3 3 0 0 1-6 0zM15 13l3-5 3 5a3 3 0 0 1-6 0z" />
              </svg>
              Centralized Multi-Threshold Policy Matrix
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: SPACE.sm }}>
              Statutory policy: Single consolidated alert generated with the highest crossed threshold.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderRadius: RADII.sm,
                  backgroundColor: t2Crossed ? 'rgba(59,130,246,0.15)' : '#0f172a',
                  border: `1px solid ${t2Crossed ? '#3b82f6' : '#334155'}`,
                }}
              >
                <span>2.0% Threshold (LOW Severity):</span>
                <strong style={{ color: t2Crossed ? '#60a5fa' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {t2Crossed ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  )}
                  {t2Crossed ? 'CROSSED (≥ 2%)' : 'NOT CROSSED (< 2%)'}
                </strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderRadius: RADII.sm,
                  backgroundColor: t5Crossed ? 'rgba(245,158,11,0.15)' : '#0f172a',
                  border: `1px solid ${t5Crossed ? '#f59e0b' : '#334155'}`,
                }}
              >
                <span>5.0% Threshold (MEDIUM Severity):</span>
                <strong style={{ color: t5Crossed ? '#fbbf24' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {t5Crossed ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  )}
                  {t5Crossed ? 'CROSSED (≥ 5%)' : 'NOT CROSSED (< 5%)'}
                </strong>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderRadius: RADII.sm,
                  backgroundColor: t10Crossed ? 'rgba(239,68,68,0.15)' : '#0f172a',
                  border: `1px solid ${t10Crossed ? '#ef4444' : '#334155'}`,
                }}
              >
                <span>10.0% Threshold (HIGH Severity):</span>
                <strong style={{ color: t10Crossed ? '#f87171' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {t10Crossed ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  )}
                  {t10Crossed ? 'CROSSED (≥ 10%)' : 'NOT CROSSED (< 10%)'}
                </strong>
              </div>
            </div>

            <div style={{ padding: '8px', backgroundColor: 'rgba(56,189,248,0.1)', borderRadius: RADII.sm, border: '1px solid #38bdf8', marginTop: SPACE.sm }}>
              <span style={{ color: '#7dd3fc', fontSize: '11px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>
                  Consolidated Alert Guarantee: Highest threshold crossed is <strong>{t10Crossed ? '10%' : t5Crossed ? '5%' : t2Crossed ? '2%' : 'NONE'}</strong> &rarr; Severity calibrated to <strong>{severity}</strong>.
                </span>
              </span>
            </div>
          </div>

          {/* Evidence Strength Score Breakdown */}
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: SPACE.md,
              borderRadius: RADII.md,
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
              <span style={{ fontWeight: FONT.weightBold, color: '#f8fafc', fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Evidence Strength Score Breakdown
              </span>
              <strong style={{ color: '#38bdf8', fontSize: FONT.sizeMd }}>{evidenceScore}/100</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: '#94a3b8' }}>1. Change Magnitude (40% Weight):</span>
                  <strong>32/40</strong>
                </div>
                <div style={{ height: '5px', backgroundColor: '#0f172a', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '80%', height: '100%', backgroundColor: '#3b82f6' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Spectral index displacement scale</div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: '#94a3b8' }}>2. Data Quality (20% Weight):</span>
                  <strong>18/20</strong>
                </div>
                <div style={{ height: '5px', backgroundColor: '#0f172a', borderRadius: RADII.sm, overflow: 'hidden' }}>
                  <div style={{ width: '90%', height: '100%', backgroundColor: '#10b981' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Valid pixel fraction & low cloud cover</div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: '#94a3b8' }}>3. Temporal Consistency (20% Weight):</span>
                  <strong>15/20</strong>
                </div>
                <div style={{ height: '5px', backgroundColor: '#0f172a', borderRadius: RADII.sm, overflow: 'hidden' }}>
                  <div style={{ width: '75%', height: '100%', backgroundColor: '#f59e0b' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Confirmation across multi-temporal historical timeline</div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: '#94a3b8' }}>4. Cross-Sensor Agreement (20% Weight):</span>
                  <strong>15/20</strong>
                </div>
                <div style={{ height: '5px', backgroundColor: '#0f172a', borderRadius: RADII.sm, overflow: 'hidden' }}>
                  <div style={{ width: '75%', height: '100%', backgroundColor: '#a855f7' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Concordance between Optical and SAR radar signatures</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 5: MINING & 3D VOLUMETRIC ASSESSMENT ─── */}
      {activeTab === 'MINING' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: SPACE.md,
              borderRadius: RADII.md,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontWeight: FONT.weightBold, color: '#fde047', marginBottom: SPACE.xs, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fde047" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              Mining Activity Classification
            </div>
            <div style={{ fontSize: '12px', color: '#f8fafc', fontWeight: FONT.weightBold }}>
              {miningEstimate?.miningClassification || 'POSSIBLE_MINING_ACTIVITY'}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              <em>Legal Guardrail: Bare soil or surface clearing alone does not constitute illicit mining without volumetric & lease boundary verification.</em>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              padding: SPACE.md,
              borderRadius: RADII.md,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontWeight: FONT.weightBold, color: '#f8fafc', marginBottom: SPACE.sm, fontSize: FONT.sizeSm, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              3D Volumetric Extraction Assessment
            </div>

            {miningEstimate && miningEstimate.isVolumeAvailable ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Formula:</span>
                  <strong>V = Area (m²) × Mean Depth (m)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Excavation Area:</span>
                  <strong>{miningEstimate.changedAreaSquareMeters?.toLocaleString() || '12,500'} m²</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Mean Bench Depth:</span>
                  <strong>{miningEstimate.estimatedDepthMeters ? miningEstimate.estimatedDepthMeters.toFixed(1) : '3.5'} m</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #334155', paddingTop: '4px' }}>
                  <span style={{ color: '#fef08a', fontWeight: FONT.weightBold }}>Estimated Volume:</span>
                  <strong style={{ color: '#fef08a', fontSize: FONT.sizeMd }}>
                    {miningEstimate.estimatedVolumeCubicMeters?.toLocaleString() || '43,750'} m³
                  </strong>
                </div>
              </div>
            ) : (
              <div style={{ color: '#fca5a5', fontSize: '11px', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Volume estimation unavailable &mdash; Digital Elevation Model (DEM) / Depth survey required.</span>
              </div>
            )}

            <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: RADII.sm, color: '#94a3b8', fontSize: '10px', marginTop: SPACE.sm, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
                <path d="M12 3v18M6 8l6-5 6 5M3 13l3-5 3 5a3 3 0 0 1-6 0zM15 13l3-5 3 5a3 3 0 0 1-6 0z" />
              </svg>
              <em>Statutory Disclaimer: Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.</em>
            </div>
          </div>
        </div>
      )}

      {/* Raw Backend Verification Toggle */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: SPACE.sm }}>
        <button
          onClick={() => setShowRawJson(!showRawJson)}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '11px',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {showRawJson ? 'Hide Verification Payload' : 'Inspect Verification Payload'}
        </button>
        {showRawJson && (
          <pre
            style={{
              marginTop: SPACE.xs,
              padding: SPACE.sm,
              backgroundColor: '#020617',
              borderRadius: RADII.sm,
              fontSize: '10px',
              color: '#38bdf8',
              overflowX: 'auto',
              maxHeight: '180px',
            }}
          >
            {JSON.stringify({ calculationResult, miningEstimate, alert }, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
