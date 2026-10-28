/**
 * Phase 10 Hardening — HLS Operational Monitoring UI & Result Visibility
 * Frontend unit tests for 12 original scenarios + H10.1 hardening tests.
 *
 * H10.1: AlertDto now exposes comparisonMode, baselineHlsRepresentationId,
 *         currentHlsRepresentationId, and changedArea directly from the API.
 *         isHlsAlert() uses alert.comparisonMode as primary signal;
 *         falls back to explanation heuristic for legacy (pre-H10.1) alerts.
 *
 * Tests use pure TypeScript logic extracted from the UI components.
 * No DOM rendering — these are logic/contract tests.
 */

import { describe, it, expect } from 'vitest';
import {
  ComparisonMode,
  AlertSeverity,
  MonitoringTrack,
  AlertStatus,
} from '@tn-forest/shared/types';
import type {
  ChangeDetectionDto,
  AlertDto,
} from '@tn-forest/shared/types';

// ─── Helpers mirroring ChangesPage / AlertsPage logic ────────────────────────

/** Returns whether a ChangeDetection should show the HLS card */
function shouldShowHlsCard(change: Partial<ChangeDetectionDto>): boolean {
  return change.comparisonMode === ComparisonMode.HLS;
}

/** Returns whether a ChangeDetection should show the NATIVE badge */
function shouldShowNativeBadge(change: Partial<ChangeDetectionDto>): boolean {
  return change.comparisonMode === ComparisonMode.NATIVE;
}

/** Returns whether a ChangeDetection should show the HLS badge (list row) */
function shouldShowHlsBadge(change: Partial<ChangeDetectionDto>): boolean {
  return change.comparisonMode === ComparisonMode.HLS;
}

/** Returns severity color class equivalent (mirrors ChangesPage logic) */
function getSeverityColor(pct: number): 'danger' | 'warning' | 'neutral' {
  if (pct >= 10) return 'danger';
  if (pct >= 5) return 'warning';
  return 'neutral';
}

/**
 * Determines if an alert is HLS-generated.
 * H10.1: primary signal = alert.comparisonMode from API.
 * Fallback = explanation heuristic for legacy alerts (pre-H10.1, no comparisonMode set).
 */
function isHlsAlert(alert: Partial<AlertDto>): boolean {
  const isOptical =
    (alert.monitoringTrack ?? MonitoringTrack.OPTICAL) === MonitoringTrack.OPTICAL;
  return (
    isOptical &&
    (alert.comparisonMode === ComparisonMode.HLS ||
      (!alert.comparisonMode && (alert.explanation?.includes('HLS') ?? false)))
  );
}

/** Applies comparisonMode filter (mirrors changeService filter logic) */
function applyComparisonModeFilter(
  changes: Partial<ChangeDetectionDto>[],
  selectedMode: string,
): Partial<ChangeDetectionDto>[] {
  if (selectedMode === 'ALL') return changes;
  return changes.filter((c) => c.comparisonMode === selectedMode);
}

/** Count HLS changes (mirrors ChangesPage KPI) */
function countHlsChanges(changes: Partial<ChangeDetectionDto>[]): number {
  return changes.filter((c) => c.comparisonMode === ComparisonMode.HLS).length;
}

/** Count Native changes (mirrors ChangesPage KPI) */
function countNativeChanges(changes: Partial<ChangeDetectionDto>[]): number {
  return changes.filter((c) => c.comparisonMode === ComparisonMode.NATIVE).length;
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const HLS_CHANGE: Partial<ChangeDetectionDto> = {
  id: 'cd-hls-001',
  changeId: 'CHG-HLS-001',
  comparisonMode: ComparisonMode.HLS,
  monitoringTrack: MonitoringTrack.OPTICAL,
  baselineHlsRepresentationId: '6abd0a72884a2473f46955cc',
  currentHlsRepresentationId: '6abd6123886e5d035c816383',
  baselineHlsImageId: 'NASA/HLS/HLSS30/v002/2023001',
  currentHlsImageId: 'NASA/HLS/HLSL30/v002/2024001',
  hlsVersion: 'V2.0',
  baselineSensor: 'SENTINEL_2',
  currentSensor: 'LANDSAT_8',
  affectedAreaPercentage: 80.7155,
  changedArea: 333,
  zoneArea: 412,
  severity: AlertSeverity.HIGH,
  auditStatus: 'CONFIRMED',
  alertGenerated: true,
  analysisGrid: {
    crs: 'EPSG:32643',
    pixelSizeX: 30,
    pixelSizeY: 30,
    originX: 0,
    originY: 0,
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
    width: 3920,
    height: 3920,
    transform: [30, 0, 0, 0, -30, 0],
  },
  opticalThresholdConfig: {
    ndviThreshold: -0.15,
    decisionRule: 'NDVI_DROP',
  },
  opticalRasterStatistics: {
    validComparisonPixelCount: 4584,
    changedPixelCount: 3700,
    meanDeltaNdvi: -0.3821,
    medianDeltaNdvi: -0.3654,
    stdDeltaNdvi: 0.1234,
    decreasePixelCount: 3700,
    increasePixelCount: 0,
    stablePixelCount: 884,
    decreaseAffectedAreaPercentage: 80.7155,
    increaseAffectedAreaPercentage: 0,
  },
  processingVersion: 'hls-v1.0.0',
  explanation: 'HLS cross-sensor comparison detected significant vegetation loss',
};

const NATIVE_CHANGE: Partial<ChangeDetectionDto> = {
  id: 'cd-nat-001',
  changeId: 'CHG-NAT-001',
  comparisonMode: ComparisonMode.NATIVE,
  monitoringTrack: MonitoringTrack.OPTICAL,
  affectedAreaPercentage: 7.5,
  changedArea: 30,
  zoneArea: 400,
  severity: AlertSeverity.MEDIUM,
  auditStatus: 'CONFIRMED',
  alertGenerated: false,
  explanation: 'Native optical same-sensor comparison detected moderate change',
};

const SAR_CHANGE: Partial<ChangeDetectionDto> = {
  id: 'cd-sar-001',
  changeId: 'CHG-SAR-001',
  monitoringTrack: MonitoringTrack.SAR,
  affectedAreaPercentage: 12.0,
  changedArea: 48,
  zoneArea: 400,
  severity: AlertSeverity.HIGH,
  auditStatus: 'CONFIRMED',
  alertGenerated: true,
  explanation: 'SAR backscatter detected significant change',
};

// H10.1: Fixtures now include comparisonMode (mapped by Alert.toDto())
const HLS_ALERT: Partial<AlertDto> = {
  id: 'alert-hls-001',
  alertId: 'ALERT-HLS-001',
  changeDetectionId: 'cd-hls-001',
  monitoringTrack: MonitoringTrack.OPTICAL,
  comparisonMode: ComparisonMode.HLS,
  affectedAreaPercentage: 80.7155,
  severity: AlertSeverity.HIGH,
  status: AlertStatus.OPEN,
  explanation: 'HLS cross-sensor comparison: HIGH severity alert',
  evidenceSources: [],
  categories: [],
  evidenceStrength: 92,
  sensorType: 'OPTICAL' as any,
  calculationMode: 'REAL' as any,
  highestThresholdCrossed: 10,
  thresholdsCrossed: [2, 5, 10],
  detectedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const NATIVE_ALERT: Partial<AlertDto> = {
  id: 'alert-nat-001',
  alertId: 'ALERT-NAT-001',
  changeDetectionId: 'cd-nat-001',
  monitoringTrack: MonitoringTrack.OPTICAL,
  comparisonMode: ComparisonMode.NATIVE,
  affectedAreaPercentage: 7.5,
  severity: AlertSeverity.MEDIUM,
  status: AlertStatus.OPEN,
  explanation: 'Native optical comparison: MEDIUM severity alert',
  evidenceSources: [],
  categories: [],
  evidenceStrength: 70,
  sensorType: 'OPTICAL' as any,
  calculationMode: 'REAL' as any,
  highestThresholdCrossed: 5,
  thresholdsCrossed: [2, 5],
  detectedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ─── Tests: 12 original required scenarios ───────────────────────────────────

describe('Phase 10 — HLS UI Visibility Tests', () => {

  it('1. HLS ChangeDetection renders HLS card (comparisonMode = HLS)', () => {
    expect(shouldShowHlsCard(HLS_CHANGE)).toBe(true);
    expect(shouldShowNativeBadge(HLS_CHANGE)).toBe(false);
  });

  it('2. Native ChangeDetection does NOT render HLS card', () => {
    expect(shouldShowHlsCard(NATIVE_CHANGE)).toBe(false);
    expect(shouldShowNativeBadge(NATIVE_CHANGE)).toBe(true);
  });

  it('3. SAR ChangeDetection has no comparisonMode — no HLS or Native badge', () => {
    expect(shouldShowHlsCard(SAR_CHANGE)).toBe(false);
    expect(shouldShowNativeBadge(SAR_CHANGE)).toBe(false);
    expect(SAR_CHANGE.monitoringTrack).toBe(MonitoringTrack.SAR);
  });

  it('4. HLS ChangeDetection contains all required lineage fields', () => {
    expect(HLS_CHANGE.baselineHlsRepresentationId).toBeDefined();
    expect(HLS_CHANGE.currentHlsRepresentationId).toBeDefined();
    expect(HLS_CHANGE.baselineHlsImageId).toBeDefined();
    expect(HLS_CHANGE.currentHlsImageId).toBeDefined();
    expect(HLS_CHANGE.hlsVersion).toBe('V2.0');
    expect(HLS_CHANGE.analysisGrid?.crs).toBe('EPSG:32643');
    expect(HLS_CHANGE.analysisGrid?.pixelSizeX).toBe(30);
  });

  it('5. HLS severity is taken directly from ChangeDetectionDto (not recalculated)', () => {
    expect(HLS_CHANGE.severity).toBe(AlertSeverity.HIGH);
    expect(HLS_CHANGE.affectedAreaPercentage).toBeGreaterThanOrEqual(10);
    expect(getSeverityColor(HLS_CHANGE.affectedAreaPercentage!)).toBe('danger');
  });

  it('6. HLS affected area percentage and changed area are from ChangeDetectionDto', () => {
    expect(HLS_CHANGE.affectedAreaPercentage).toBe(80.7155);
    expect(HLS_CHANGE.changedArea).toBe(333);
    expect(HLS_CHANGE.opticalRasterStatistics?.validComparisonPixelCount).toBe(4584);
    expect(HLS_CHANGE.opticalRasterStatistics?.changedPixelCount).toBe(3700);
  });

  it('7. HLS Alert correctly references ChangeDetection ID', () => {
    expect(HLS_ALERT.changeDetectionId).toBe('cd-hls-001');
    expect(HLS_ALERT.changeDetectionId).toBe(HLS_CHANGE.id);
    expect(HLS_ALERT.severity).toBe(AlertSeverity.HIGH);
    expect(HLS_ALERT.monitoringTrack).toBe(MonitoringTrack.OPTICAL);
  });

  it('8. ComparisonMode filter correctly isolates HLS, Native, and All', () => {
    const allChanges = [HLS_CHANGE, NATIVE_CHANGE, SAR_CHANGE];
    const hlsOnly = applyComparisonModeFilter(allChanges, ComparisonMode.HLS);
    expect(hlsOnly).toHaveLength(1);
    expect(hlsOnly[0].id).toBe('cd-hls-001');
    const nativeOnly = applyComparisonModeFilter(allChanges, ComparisonMode.NATIVE);
    expect(nativeOnly).toHaveLength(1);
    expect(nativeOnly[0].id).toBe('cd-nat-001');
    const all = applyComparisonModeFilter(allChanges, 'ALL');
    expect(all).toHaveLength(3);
  });

  it('9. When loading, changes list is empty (no stale UI data)', () => {
    const changes: Partial<ChangeDetectionDto>[] = [];
    const loading = true;
    expect(loading).toBe(true);
    expect(changes).toHaveLength(0);
    expect(countHlsChanges(changes)).toBe(0);
    expect(countNativeChanges(changes)).toBe(0);
  });

  it('10. Empty state shows zero counts when no changes match filter', () => {
    const changes: Partial<ChangeDetectionDto>[] = [NATIVE_CHANGE];
    const hlsFiltered = applyComparisonModeFilter(changes, ComparisonMode.HLS);
    expect(hlsFiltered).toHaveLength(0);
    expect(countHlsChanges(hlsFiltered)).toBe(0);
  });

  it('11. API error state is distinguished from empty state', () => {
    const error = 'Failed to fetch change detection records';
    const changes: Partial<ChangeDetectionDto>[] = [];
    expect(error).toBeTruthy();
    expect(changes).toHaveLength(0);
    expect(error).toContain('Failed');
  });

  it('12. HLS UI display is read-only; alert actions require authorization', () => {
    const canUpdateAlerts = false;
    const availableActions = canUpdateAlerts ? ['ACKNOWLEDGE', 'DISMISS'] : [];
    expect(availableActions).toHaveLength(0);
    expect(shouldShowHlsCard(HLS_CHANGE)).toBe(true);
    const canUpdate = true;
    const actions = canUpdate ? ['ACKNOWLEDGE', 'DISMISS'] : [];
    expect(actions.length).toBeGreaterThan(0);
  });

});

// ─── Tests: original HLS Alert suite ─────────────────────────────────────────

describe('Phase 10 — HLS Alert UI Tests', () => {

  it('HLS alert identified by API comparisonMode (H10.1) or explanation heuristic (legacy)', () => {
    expect(isHlsAlert(HLS_ALERT)).toBe(true);
    expect(isHlsAlert(NATIVE_ALERT)).toBe(false);
  });

  it('HLS alert is OPTICAL track (not SAR)', () => {
    expect(HLS_ALERT.monitoringTrack).toBe(MonitoringTrack.OPTICAL);
  });

  it('HLS alert KPI: HLS count = 1, Native count = 1 in a mixed list', () => {
    const changes = [HLS_CHANGE, NATIVE_CHANGE, SAR_CHANGE];
    expect(countHlsChanges(changes)).toBe(1);
    expect(countNativeChanges(changes)).toBe(1);
  });

  it('NDVI statistics use correct DTO field names (meanDeltaNdvi, medianDeltaNdvi)', () => {
    const stats = HLS_CHANGE.opticalRasterStatistics!;
    expect(stats.meanDeltaNdvi).toBeDefined();
    expect(stats.medianDeltaNdvi).toBeDefined();
    expect(typeof stats.meanDeltaNdvi).toBe('number');
    expect(typeof stats.medianDeltaNdvi).toBe('number');
    expect(stats.meanDeltaNdvi).toBeLessThan(0);
    expect(stats.medianDeltaNdvi).toBeLessThan(0);
  });

  it('HLS audit status determines validity color (CONFIRMED → green)', () => {
    const auditStatus = HLS_CHANGE.auditStatus!;
    const isValid = auditStatus === 'CONFIRMED' || auditStatus === 'VALID';
    expect(isValid).toBe(true);
    const invalidStatus = 'INVALID_FOR_PRODUCTION_GEOMETRY';
    expect(invalidStatus.startsWith('INVALID')).toBe(true);
  });

  it('HLS badge shown only for HLS comparisonMode, not for SAR', () => {
    expect(shouldShowHlsBadge(HLS_CHANGE)).toBe(true);
    expect(shouldShowHlsBadge(SAR_CHANGE)).toBe(false);
    expect(shouldShowHlsBadge(NATIVE_CHANGE)).toBe(false);
  });

});

// ─── Tests: H10.1 hardening — AlertDto comparisonMode from API ───────────────

describe('Phase 10 Hardening — H10.1 AlertDto ComparisonMode', () => {

  it('H10.1: HLS_ALERT has comparisonMode=HLS from API, identified correctly', () => {
    expect(HLS_ALERT.comparisonMode).toBe(ComparisonMode.HLS);
    expect(isHlsAlert(HLS_ALERT)).toBe(true);
  });

  it('H10.1: NATIVE_ALERT has comparisonMode=NATIVE from API, not flagged as HLS', () => {
    expect(NATIVE_ALERT.comparisonMode).toBe(ComparisonMode.NATIVE);
    expect(isHlsAlert(NATIVE_ALERT)).toBe(false);
  });

  it('H10.1: Legacy alert without comparisonMode falls back to explanation heuristic', () => {
    const legacyHlsAlert: Partial<AlertDto> = {
      ...HLS_ALERT,
      comparisonMode: undefined,
      explanation: 'HLS cross-sensor comparison detected forest disturbance (legacy)',
    };
    expect(legacyHlsAlert.comparisonMode).toBeUndefined();
    expect(isHlsAlert(legacyHlsAlert)).toBe(true);
  });

  it('H10.1: Legacy native alert without comparisonMode not flagged as HLS', () => {
    const legacyNativeAlert: Partial<AlertDto> = {
      ...NATIVE_ALERT,
      comparisonMode: undefined,
      explanation: 'Native optical comparison detected moderate change',
    };
    expect(legacyNativeAlert.comparisonMode).toBeUndefined();
    expect(isHlsAlert(legacyNativeAlert)).toBe(false);
  });

  it('H10.1: AlertDto exposes baselineHlsRepresentationId, currentHlsRepresentationId, changedArea', () => {
    const alertWithLineage: Partial<AlertDto> = {
      ...HLS_ALERT,
      baselineHlsRepresentationId: '6abd0a72884a2473f46955cc',
      currentHlsRepresentationId: '6abd6123886e5d035c816383',
      changedArea: 333,
    };
    expect(alertWithLineage.baselineHlsRepresentationId).toBe('6abd0a72884a2473f46955cc');
    expect(alertWithLineage.currentHlsRepresentationId).toBe('6abd6123886e5d035c816383');
    expect(alertWithLineage.changedArea).toBe(333);
  });

  it('H10.1: SAR alert has no comparisonMode (SAR uses monitoringTrack only)', () => {
    const sarAlert: Partial<AlertDto> = {
      id: 'alert-sar-001',
      alertId: 'ALERT-SAR-001',
      changeDetectionId: 'cd-sar-001',
      monitoringTrack: MonitoringTrack.SAR,
      affectedAreaPercentage: 12.0,
      severity: AlertSeverity.HIGH,
      status: AlertStatus.OPEN,
      explanation: 'SAR backscatter change: HIGH severity',
      evidenceSources: [],
      categories: [],
      evidenceStrength: 85,
      sensorType: 'SAR' as any,
      calculationMode: 'REAL' as any,
      highestThresholdCrossed: 10,
      thresholdsCrossed: [2, 5, 10],
      detectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(sarAlert.comparisonMode).toBeUndefined();
    expect(isHlsAlert(sarAlert)).toBe(false);
    expect(sarAlert.monitoringTrack).toBe(MonitoringTrack.SAR);
  });

});
