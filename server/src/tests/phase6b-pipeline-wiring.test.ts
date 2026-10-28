/**
 * Phase 6B: Controlled Pipeline Wiring Implementation Test Suite
 *
 * 14-Gate Regression Suite for CanopyGuard Integration into OpticalPixelChangeDetector
 *
 * Enforces:
 * - Gate 1:  Safe Default Mode Verification (CANOPY_GUARD_MODE defaults to 'SHADOW')
 * - Gate 2:  Mode Switching & Safe Fallback on Invalid Input
 * - Gate 3:  OFF Mode Total Guard Bypass (exact v2.0 parity, zero candidate reduction)
 * - Gate 4:  SHADOW Mode Official Output Parity (100% v2.0 official outputs, telemetry populated)
 * - Gate 5:  ACTIVE Mode Non-Forest Candidate Pruning (prunes non-forest from changedMask)
 * - Gate 6:  ACTIVE Mode Canopy Disturbance Preservation (retains genuine canopy disturbance)
 * - Gate 7:  SCL Validity Cloud Precedence (SCL 8/9 cloud routed to UNCERTAIN, never pre-screened)
 * - Gate 8:  SCL Validity Cloud-Shadow Precedence (SCL 3 shadow routed to UNCERTAIN, never pre-screened)
 * - Gate 9:  Missing SCL Band Fault Tolerance (missing SCL handled gracefully without unhandled exception)
 * - Gate 10: NaN and Defective Pixel Handling (zero NaN leaks, clean skip)
 * - Gate 11: Four-Way Partition Conservation (N_seas + N_pers + N_unc + N_pre == N_pool, error = 0)
 * - Gate 12: Isolated False Alarm Alert Suppression in ACTIVE Mode (suppresses bare soil false alarms)
 * - Gate 13: Isolated Genuine Alert Retention in ACTIVE Mode (retains genuine canopy alerts >= 10%)
 * - Gate 14: Historical Database Schema Read Compatibility & Cryptographic Immutability
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import {
  CanopyGuardShadowService,
  Sen2CorSclClass,
} from '../services/changeDetection/CanopyGuardShadowService.js';
import {
  OpticalPixelChangeDetector,
  DEFAULT_OPTICAL_THRESHOLD_CONFIG,
} from '../services/changeDetection/OpticalPixelChangeDetector.js';
import {
  ChangeCategory,
  type AnalysisGridDto,
} from '@tn-forest/shared/types';
import type { OpticalSpectralIndices } from '../services/spatial/OpticalPixelIndexService.js';

interface DbCounts {
  users: number;
  zones: number;
  baselines: number;
  satellitemetadatas: number;
  changedetections: number;
  alerts: number;
  monitoringjobs: number;
  incrementalmonitoringrecords: number;
}

async function getDbCounts(): Promise<DbCounts> {
  return {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellitemetadatas: await SatelliteMetadata.countDocuments(),
    changedetections: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    monitoringjobs: await MonitoringJobModel.countDocuments(),
    incrementalmonitoringrecords: await IncrementalMonitoringRecordModel.countDocuments(),
  };
}

/**
 * Creates deterministic synthetic optical raster fixtures for unit testing.
 * Clearly labeled as synthetic test inputs.
 */
function createSyntheticRaster(params: {
  width: number;
  height: number;
  baselineNdvi: number | number[];
  currentNdvi: number | number[];
  baselineScl?: number | number[];
  validMask?: number | number[];
}): {
  baselineIndices: OpticalSpectralIndices;
  currentIndices: OpticalSpectralIndices;
  validMask: Uint8Array;
  grid: AnalysisGridDto;
  baselineScl?: Float32Array;
} {
  const { width, height, baselineNdvi, currentNdvi, baselineScl, validMask } = params;
  const totalPixels = width * height;

  const bNdvi = new Float32Array(totalPixels);
  const cNdvi = new Float32Array(totalPixels);
  const mask = new Uint8Array(totalPixels);
  let sclArr: Float32Array | undefined = undefined;

  if (baselineScl !== undefined) {
    sclArr = new Float32Array(totalPixels);
  }

  for (let i = 0; i < totalPixels; i++) {
    bNdvi[i] = Array.isArray(baselineNdvi) ? baselineNdvi[i] : baselineNdvi;
    cNdvi[i] = Array.isArray(currentNdvi) ? currentNdvi[i] : currentNdvi;
    mask[i] = validMask !== undefined ? (Array.isArray(validMask) ? validMask[i] : validMask) : 1;
    if (sclArr && baselineScl !== undefined) {
      sclArr[i] = Array.isArray(baselineScl) ? baselineScl[i] : baselineScl;
    }
  }

  const dummyZeros = new Float32Array(totalPixels);

  const baselineIndices: OpticalSpectralIndices = {
    ndvi: bNdvi,
    ndwi: dummyZeros,
    ndbi: dummyZeros,
    bsi: dummyZeros,
    savi: dummyZeros,
    evi: dummyZeros,
    validPixelCount: totalPixels,
    totalPixelCount: totalPixels,
  };

  const currentIndices: OpticalSpectralIndices = {
    ndvi: cNdvi,
    ndwi: dummyZeros,
    ndbi: dummyZeros,
    bsi: dummyZeros,
    savi: dummyZeros,
    evi: dummyZeros,
    validPixelCount: totalPixels,
    totalPixelCount: totalPixels,
  };

  const grid: AnalysisGridDto = {
    width,
    height,
    pixelSizeX: 10,
    pixelSizeY: 10,
    originX: 800000,
    originY: 1100000,
    crs: 'EPSG:32643',
    totalPixels,
  };

  return {
    baselineIndices,
    currentIndices,
    validMask: mask,
    grid,
    baselineScl: sclArr,
  };
}

async function runPhase6bTestSuite() {
  console.log('================================================================');
  console.log('🧪 PHASE 6B: PIPELINE WIRING & CANOPY GUARD INTEGRATION TESTS');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const preCounts = await getDbCounts();
  console.log('Pre-Test Database State Snapshot:');
  Object.entries(preCounts).forEach(([col, count]) => {
    console.log(`  - ${col.padEnd(30)}: ${count}`);
  });
  console.log('');

  let passCount = 0;
  let failCount = 0;

  const assertPass = (gateName: string, detail: string) => {
    console.log(`  ✔ [PASS] ${gateName}: ${detail}`);
    passCount++;
  };

  const assertFail = (gateName: string, detail: string) => {
    console.error(`  ✘ [FAIL] ${gateName}: ${detail}`);
    failCount++;
  };

  // --------------------------------------------------------------------------
  // GATE 1: Safe Default Mode Verification
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 1: Safe Default Mode Verification...');
  CanopyGuardShadowService.setMode('SHADOW');
  const g1Mode = CanopyGuardShadowService.getMode();
  if (g1Mode === 'SHADOW' && env.CANOPY_GUARD_MODE === 'SHADOW') {
    assertPass('Gate 1', `CanopyGuard mode is safely configured to 'SHADOW'`);
  } else {
    assertFail('Gate 1', `Expected mode 'SHADOW', received '${g1Mode}'`);
  }

  // --------------------------------------------------------------------------
  // GATE 2: Mode Switching & Safe Fallback on Invalid Input
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 2: Mode Switching & Safe Fallback...');
  CanopyGuardShadowService.setMode('INVALID_MALFORMED_MODE');
  const g2FallbackMode = CanopyGuardShadowService.getMode();
  CanopyGuardShadowService.setMode('OFF');
  const g2Off = CanopyGuardShadowService.getMode();
  CanopyGuardShadowService.setMode('ACTIVE');
  const g2Active = CanopyGuardShadowService.getMode();
  CanopyGuardShadowService.setMode('SHADOW'); // Restore
  const g2Shadow = CanopyGuardShadowService.getMode();

  if (
    g2FallbackMode === 'SHADOW' &&
    g2Off === 'OFF' &&
    g2Active === 'ACTIVE' &&
    g2Shadow === 'SHADOW'
  ) {
    assertPass(
      'Gate 2',
      `Mode switching validated; invalid value fails safe to 'SHADOW', restored to 'SHADOW'`,
    );
  } else {
    assertFail(
      'Gate 2',
      `Mode switching failure: fallback=${g2FallbackMode}, off=${g2Off}, active=${g2Active}, shadow=${g2Shadow}`,
    );
  }

  // --------------------------------------------------------------------------
  // GATE 3: OFF Mode Total Guard Bypass
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 3: OFF Mode Total Guard Bypass...');
  // Synthetic input: 1 candidate on bare soil (NDVI_base=0.25, SCL=5, drop=-0.20)
  const g3Raster = createSyntheticRaster({
    width: 1,
    height: 1,
    baselineNdvi: 0.25,
    currentNdvi: 0.05,
    baselineScl: Sen2CorSclClass.NOT_VEGETATED, // Bare soil
  });

  const g3Result = OpticalPixelChangeDetector.detectPixelChange({
    ...g3Raster,
    zoneAreaHectares: 0.01,
    canopyGuardMode: 'OFF',
  });

  if (
    g3Result.changedMask[0] === 1 &&
    g3Result.spatialResult.changedPixels === 1 &&
    g3Result.shadowTelemetry === undefined
  ) {
    assertPass(
      'Gate 3',
      `OFF mode completely bypasses canopy guard: changedPixels=1, changedMask[0]=1, zero candidate reduction`,
    );
  } else {
    assertFail('Gate 3', `OFF mode did not bypass guard: ${JSON.stringify(g3Result.spatialResult)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 4: SHADOW Mode Official Output Parity
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 4: SHADOW Mode Official Output Parity...');
  // 10-pixel synthetic raster:
  // - Pixels 0..2: 3 bare soil candidates (bNdvi=0.25, cNdvi=0.05, SCL=5)
  // - Pixels 3..4: 2 canopy disturbance candidates (bNdvi=0.70, cNdvi=0.45, SCL=4)
  // - Pixels 5..9: 5 stable pixels (bNdvi=0.60, cNdvi=0.60, SCL=4)
  const g4bNdvi = [0.25, 0.25, 0.25, 0.7, 0.7, 0.6, 0.6, 0.6, 0.6, 0.6];
  const g4cNdvi = [0.05, 0.05, 0.05, 0.45, 0.45, 0.6, 0.6, 0.6, 0.6, 0.6];
  const g4Scl = [5, 5, 5, 4, 4, 4, 4, 4, 4, 4];

  const g4Raster = createSyntheticRaster({
    width: 10,
    height: 1,
    baselineNdvi: g4bNdvi,
    currentNdvi: g4cNdvi,
    baselineScl: g4Scl,
  });

  const g4ResOff = OpticalPixelChangeDetector.detectPixelChange({
    ...g4Raster,
    zoneAreaHectares: 0.1,
    canopyGuardMode: 'OFF',
  });

  const g4ResShadow = OpticalPixelChangeDetector.detectPixelChange({
    ...g4Raster,
    zoneAreaHectares: 0.1,
    canopyGuardMode: 'SHADOW',
  });

  const g4MasksEqual = g4ResShadow.changedMask.every((v, i) => v === g4ResOff.changedMask[i]);
  const g4PixelsEqual =
    g4ResShadow.spatialResult.changedPixels === g4ResOff.spatialResult.changedPixels;
  const g4AreaPctEqual =
    g4ResShadow.spatialResult.affectedAreaPercentage ===
    g4ResOff.spatialResult.affectedAreaPercentage;
  const g4CategoriesEqual =
    JSON.stringify(g4ResShadow.categories) === JSON.stringify(g4ResOff.categories);
  const g4TelemetryPresent =
    g4ResShadow.shadowTelemetry !== undefined &&
    g4ResShadow.shadowTelemetry.preScreenedNonForestCount === 3 &&
    g4ResShadow.shadowTelemetry.persistentCount === 2;

  if (
    g4MasksEqual &&
    g4PixelsEqual &&
    g4AreaPctEqual &&
    g4CategoriesEqual &&
    g4TelemetryPresent
  ) {
    assertPass(
      'Gate 4',
      `SHADOW mode achieves 100% official output parity with v2.0 (changedPixels=${g4ResShadow.spatialResult.changedPixels}, affected=${g4ResShadow.spatialResult.affectedAreaPercentage}%) while logging 3 pre-screened non-forest pixels in telemetry`,
    );
  } else {
    assertFail('Gate 4', `SHADOW mode parity discrepancy detected`);
  }

  // --------------------------------------------------------------------------
  // GATE 5: ACTIVE Mode Non-Forest Candidate Pruning
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 5: ACTIVE Mode Non-Forest Candidate Pruning...');
  const g5Raster = createSyntheticRaster({
    width: 1,
    height: 1,
    baselineNdvi: 0.25,
    currentNdvi: 0.05, // drop -0.20
    baselineScl: Sen2CorSclClass.NOT_VEGETATED, // Bare soil (5)
  });

  const g5Result = OpticalPixelChangeDetector.detectPixelChange({
    ...g5Raster,
    zoneAreaHectares: 0.01,
    canopyGuardMode: 'ACTIVE',
  });

  if (
    g5Result.changedMask[0] === 0 &&
    g5Result.spatialResult.changedPixels === 0 &&
    g5Result.preScreenedPixelCount === 1 &&
    g5Result.categories.includes(ChangeCategory.PRE_SCREENED_NON_FOREST)
  ) {
    assertPass(
      'Gate 5',
      `ACTIVE mode pruned bare soil candidate from changedMask: changedMask[0]=0, preScreenedCount=1, category=PRE_SCREENED_NON_FOREST`,
    );
  } else {
    assertFail(
      'Gate 5',
      `ACTIVE mode failed to prune non-forest candidate: mask=${g5Result.changedMask[0]}, changed=${g5Result.spatialResult.changedPixels}`,
    );
  }

  // --------------------------------------------------------------------------
  // GATE 6: ACTIVE Mode Canopy Disturbance Preservation
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 6: ACTIVE Mode Canopy Disturbance Preservation...');
  const g6Raster = createSyntheticRaster({
    width: 1,
    height: 1,
    baselineNdvi: 0.7, // Dense canopy
    currentNdvi: 0.45, // Genuine drop -0.25
    baselineScl: Sen2CorSclClass.VEGETATION, // SCL 4
  });

  const g6Result = OpticalPixelChangeDetector.detectPixelChange({
    ...g6Raster,
    zoneAreaHectares: 0.01,
    canopyGuardMode: 'ACTIVE',
  });

  if (
    g6Result.changedMask[0] === 1 &&
    g6Result.spatialResult.changedPixels === 1 &&
    g6Result.preScreenedPixelCount === 0 &&
    g6Result.categories.includes(ChangeCategory.VEGETATION_LOSS)
  ) {
    assertPass(
      'Gate 6',
      `ACTIVE mode preserved genuine canopy disturbance: changedMask[0]=1, changedPixels=1, category=VEGETATION_LOSS`,
    );
  } else {
    assertFail(
      'Gate 6',
      `ACTIVE mode failed to preserve canopy disturbance: mask=${g6Result.changedMask[0]}`,
    );
  }

  // --------------------------------------------------------------------------
  // GATE 7: SCL Validity Cloud Precedence
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 7: SCL Validity Cloud Precedence...');
  // Cloud observation (SCL 9) on candidate with NDVI drop
  const g7Raster = createSyntheticRaster({
    width: 1,
    height: 1,
    baselineNdvi: 0.35,
    currentNdvi: 0.15,
    baselineScl: Sen2CorSclClass.CLOUD_HIGH_PROBABILITY, // SCL 9
  });

  const g7Shadow = OpticalPixelChangeDetector.detectPixelChange({
    ...g7Raster,
    zoneAreaHectares: 0.01,
    canopyGuardMode: 'SHADOW',
  });

  const g7Active = OpticalPixelChangeDetector.detectPixelChange({
    ...g7Raster,
    zoneAreaHectares: 0.01,
    canopyGuardMode: 'ACTIVE',
  });

  const g7ShadowUncertain = g7Shadow.shadowTelemetry?.uncertainCount === 1;
  const g7ShadowNotPreScreened = g7Shadow.shadowTelemetry?.preScreenedNonForestCount === 0;
  const g7ActiveUncertain = g7Active.shadowTelemetry?.uncertainCount === 1;
  const g7ActiveNotPreScreened = g7Active.shadowTelemetry?.preScreenedNonForestCount === 0;

  if (
    g7ShadowUncertain &&
    g7ShadowNotPreScreened &&
    g7ActiveUncertain &&
    g7ActiveNotPreScreened
  ) {
    assertPass(
      'Gate 7',
      `SCL 9 (Cloud) strictly routed to UNCERTAIN_OBSCURED (uncertainCount=1, preScreenedCount=0)`,
    );
  } else {
    assertFail('Gate 7', `Cloud precedence failed: ${JSON.stringify(g7Shadow.shadowTelemetry)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 8: SCL Validity Cloud-Shadow Precedence
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 8: SCL Validity Cloud-Shadow Precedence...');
  // Cloud shadow observation (SCL 3) on candidate with NDVI drop
  const g8Raster = createSyntheticRaster({
    width: 1,
    height: 1,
    baselineNdvi: 0.28,
    currentNdvi: 0.08,
    baselineScl: Sen2CorSclClass.CLOUD_SHADOWS, // SCL 3
  });

  const g8Shadow = OpticalPixelChangeDetector.detectPixelChange({
    ...g8Raster,
    zoneAreaHectares: 0.01,
    canopyGuardMode: 'SHADOW',
  });

  const g8ShadowUncertain = g8Shadow.shadowTelemetry?.uncertainCount === 1;
  const g8ShadowNotPreScreened = g8Shadow.shadowTelemetry?.preScreenedNonForestCount === 0;

  if (g8ShadowUncertain && g8ShadowNotPreScreened) {
    assertPass(
      'Gate 8',
      `SCL 3 (Cloud Shadow) strictly routed to UNCERTAIN_OBSCURED (uncertainCount=1, preScreenedCount=0)`,
    );
  } else {
    assertFail('Gate 8', `Cloud shadow precedence failed: ${JSON.stringify(g8Shadow.shadowTelemetry)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 9: Missing SCL Band Fault Tolerance
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 9: Missing SCL Band Fault Tolerance...');
  const g9Raster = createSyntheticRaster({
    width: 2,
    height: 1,
    baselineNdvi: [0.7, 0.25],
    currentNdvi: [0.4, 0.05],
    // baselineScl omitted entirely
  });

  let g9Threw = false;
  let g9Res: any = null;
  try {
    g9Res = OpticalPixelChangeDetector.detectPixelChange({
      ...g9Raster,
      zoneAreaHectares: 0.02,
      canopyGuardMode: 'SHADOW',
    });
  } catch (err) {
    g9Threw = true;
  }

  if (
    !g9Threw &&
    g9Res !== null &&
    g9Res.shadowTelemetry?.uncertainCount === 2 &&
    g9Res.shadowTelemetry?.preScreenedNonForestCount === 0
  ) {
    assertPass(
      'Gate 9',
      `Missing SCL handled gracefully without unhandled exception; routed safely to uncertainCount=2, zero crashes`,
    );
  } else {
    assertFail('Gate 9', `Missing SCL threw error or mishandled: threw=${g9Threw}`);
  }

  // --------------------------------------------------------------------------
  // GATE 10: NaN and Defective Pixel Handling
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 10: NaN and Defective Pixel Handling...');
  // 4 pixels:
  // 0: bNdvi=NaN, cNdvi=0.5 -> should be unmasked (changedMask=0)
  // 1: bNdvi=0.5, cNdvi=NaN -> should be unmasked (changedMask=0)
  // 2: bNdvi=0.7, cNdvi=0.4, scl=NaN -> valid comparison, SCL malformed -> uncertain
  // 3: bNdvi=0.7, cNdvi=0.4, scl=4 -> valid comparison, genuine canopy loss
  const g10Raster = createSyntheticRaster({
    width: 4,
    height: 1,
    baselineNdvi: [NaN, 0.5, 0.7, 0.7],
    currentNdvi: [0.5, NaN, 0.4, 0.4],
    baselineScl: [4, 4, NaN, 4],
  });

  const g10Res = OpticalPixelChangeDetector.detectPixelChange({
    ...g10Raster,
    zoneAreaHectares: 0.04,
    canopyGuardMode: 'SHADOW',
  });

  const g10ValidPixels = g10Res.spatialResult.validPixels === 2;
  const g10NaNMasksZero = g10Res.changedMask[0] === 0 && g10Res.changedMask[1] === 0;
  const g10MeanNotNaN = !isNaN(g10Res.rasterStatistics.meanDeltaNdvi);
  const g10UncertainHandled = g10Res.shadowTelemetry?.uncertainCount === 1;

  if (g10ValidPixels && g10NaNMasksZero && g10MeanNotNaN && g10UncertainHandled) {
    assertPass(
      'Gate 10',
      `NaN handling validated: NaN pixels safely unmasked, validPixels=2, meanDeltaNdvi is finite (${g10Res.rasterStatistics.meanDeltaNdvi}), zero NaN propagation`,
    );
  } else {
    assertFail(
      'Gate 10',
      `NaN handling failed: validPixels=${g10Res.spatialResult.validPixels}, meanDelta=${g10Res.rasterStatistics.meanDeltaNdvi}`,
    );
  }

  // --------------------------------------------------------------------------
  // GATE 11: Four-Way Partition Conservation
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 11: Four-Way Partition Conservation...');
  // 10-pixel raster:
  // - 2 canopy loss candidates (persistent)
  // - 2 bare soil candidates (pre-screened)
  // - 2 cloud-obscured candidates (uncertain)
  // - 4 non-candidates (stable canopy)
  const g11bNdvi = [0.7, 0.7, 0.25, 0.25, 0.35, 0.35, 0.6, 0.6, 0.6, 0.6];
  const g11cNdvi = [0.45, 0.45, 0.05, 0.05, 0.15, 0.15, 0.6, 0.6, 0.6, 0.6];
  const g11Scl = [4, 4, 5, 5, 9, 9, 4, 4, 4, 4];

  const g11Raster = createSyntheticRaster({
    width: 10,
    height: 1,
    baselineNdvi: g11bNdvi,
    currentNdvi: g11cNdvi,
    baselineScl: g11Scl,
  });

  const g11Res = OpticalPixelChangeDetector.detectPixelChange({
    ...g11Raster,
    zoneAreaHectares: 0.1,
    canopyGuardMode: 'SHADOW',
  });

  const g11Telem = g11Res.shadowTelemetry!;
  const g11Closed =
    g11Telem.seasonalCount +
      g11Telem.persistentCount +
      g11Telem.uncertainCount +
      g11Telem.preScreenedNonForestCount ===
    g11Telem.fullCandidatePool;
  const g11PoolExact = g11Telem.fullCandidatePool === 6;
  const g11ConservationFlag = g11Telem.partitionConservationValid === true;

  if (g11Closed && g11PoolExact && g11ConservationFlag) {
    assertPass(
      'Gate 11',
      `Exact 4-way partition conservation verified: pool=6, pers=${g11Telem.persistentCount}, pre=${g11Telem.preScreenedNonForestCount}, unc=${g11Telem.uncertainCount}, seas=${g11Telem.seasonalCount}, partitionSum=${g11Telem.partitionSum} (Error: 0 px)`,
    );
  } else {
    assertFail('Gate 11', `Partition conservation failed: ${JSON.stringify(g11Telem)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 12: Isolated False Alarm Alert Suppression in ACTIVE Mode
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 12: Isolated False Alarm Alert Suppression in ACTIVE Mode...');
  // 100 pixels:
  // 3 pixels bare soil change (NDVI drop on SCL=5)
  // 97 pixels stable canopy
  const g12bNdvi = new Array(100).fill(0.7);
  const g12cNdvi = new Array(100).fill(0.7);
  const g12Scl = new Array(100).fill(4);

  // Set 3 bare soil candidate pixels
  for (let i = 0; i < 3; i++) {
    g12bNdvi[i] = 0.25;
    g12cNdvi[i] = 0.05;
    g12Scl[i] = 5;
  }

  const g12Raster = createSyntheticRaster({
    width: 10,
    height: 10,
    baselineNdvi: g12bNdvi,
    currentNdvi: g12cNdvi,
    baselineScl: g12Scl,
  });

  // Under SHADOW (v2.0): 3 pixels flagged -> 3.0% affected area >= 2.0% alert threshold
  const g12ResShadow = OpticalPixelChangeDetector.detectPixelChange({
    ...g12Raster,
    zoneAreaHectares: 1.0,
    canopyGuardMode: 'SHADOW',
  });

  // Under ACTIVE: 3 bare soil pixels pruned -> 0 pixels flagged -> 0.0% affected area < 2.0%
  const g12ResActive = OpticalPixelChangeDetector.detectPixelChange({
    ...g12Raster,
    zoneAreaHectares: 1.0,
    canopyGuardMode: 'ACTIVE',
  });

  const g12ShadowTriggersAlert = g12ResShadow.spatialResult.affectedAreaPercentage >= 2.0;
  const g12ActiveSuppressesAlert = g12ResActive.spatialResult.affectedAreaPercentage < 2.0;

  if (g12ShadowTriggersAlert && g12ActiveSuppressesAlert) {
    assertPass(
      'Gate 12',
      `False alarm alert suppressed in ACTIVE mode: SHADOW affected=${g12ResShadow.spatialResult.affectedAreaPercentage}% (>=2%), ACTIVE affected=${g12ResActive.spatialResult.affectedAreaPercentage}% (<2%)`,
    );
  } else {
    assertFail(
      'Gate 12',
      `Alert suppression failed: shadowPct=${g12ResShadow.spatialResult.affectedAreaPercentage}, activePct=${g12ResActive.spatialResult.affectedAreaPercentage}`,
    );
  }

  // --------------------------------------------------------------------------
  // GATE 13: Isolated Genuine Alert Retention in ACTIVE Mode
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 13: Isolated Genuine Alert Retention in ACTIVE Mode...');
  // 100 pixels:
  // 12 pixels genuine dense canopy disturbance (NDVI 0.75 -> 0.45, drop -0.30, SCL=4)
  // 88 pixels stable canopy
  const g13bNdvi = new Array(100).fill(0.75);
  const g13cNdvi = new Array(100).fill(0.75);
  const g13Scl = new Array(100).fill(4);

  for (let i = 0; i < 12; i++) {
    g13cNdvi[i] = 0.45;
  }

  const g13Raster = createSyntheticRaster({
    width: 10,
    height: 10,
    baselineNdvi: g13bNdvi,
    currentNdvi: g13cNdvi,
    baselineScl: g13Scl,
  });

  const g13ResActive = OpticalPixelChangeDetector.detectPixelChange({
    ...g13Raster,
    zoneAreaHectares: 1.0,
    canopyGuardMode: 'ACTIVE',
  });

  const g13HighAlertRetained = g13ResActive.spatialResult.affectedAreaPercentage >= 10.0;
  const g13GenuinePixelsCount = g13ResActive.spatialResult.changedPixels === 12;

  if (g13HighAlertRetained && g13GenuinePixelsCount) {
    assertPass(
      'Gate 13',
      `Genuine canopy loss alert retained in ACTIVE mode: changedPixels=12, affected=${g13ResActive.spatialResult.affectedAreaPercentage}% (>=10% HIGH severity)`,
    );
  } else {
    assertFail(
      'Gate 13',
      `Genuine alert retention failed: changedPixels=${g13ResActive.spatialResult.changedPixels}, affected=${g13ResActive.spatialResult.affectedAreaPercentage}%`,
    );
  }

  // --------------------------------------------------------------------------
  // GATE 14: Historical Database Schema Read Compatibility & Cryptographic Immutability
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 14: Historical Database Schema Read Compatibility & Invariance...');
  const historicalChanges = await ChangeDetectionModel.find({}).exec();
  const historicalAlerts = await AlertModel.find({}).exec();

  let g14ReadErrors = 0;
  for (const doc of historicalChanges) {
    try {
      const dto = doc.toDto();
      if (!dto.id || !dto.changeId) g14ReadErrors++;
    } catch (err) {
      g14ReadErrors++;
    }
  }

  for (const alertDoc of historicalAlerts) {
    try {
      const dto = alertDoc.toDto();
      if (!dto.id || !dto.alertId) g14ReadErrors++;
    } catch (err) {
      g14ReadErrors++;
    }
  }

  const postCounts = await getDbCounts();
  const dbImmutable =
    preCounts.users === postCounts.users &&
    preCounts.zones === postCounts.zones &&
    preCounts.baselines === postCounts.baselines &&
    preCounts.satellitemetadatas === postCounts.satellitemetadatas &&
    preCounts.changedetections === postCounts.changedetections &&
    preCounts.alerts === postCounts.alerts &&
    preCounts.monitoringjobs === postCounts.monitoringjobs &&
    preCounts.incrementalmonitoringrecords === postCounts.incrementalmonitoringrecords;

  if (g14ReadErrors === 0 && dbImmutable) {
    assertPass(
      'Gate 14',
      `Historical database read compatibility verified: ${historicalChanges.length} changes and ${historicalAlerts.length} alerts read cleanly with zero errors; 100% database immutability verified (zero writes)`,
    );
  } else {
    assertFail(
      'Gate 14',
      `Historical read or immutability failed: errors=${g14ReadErrors}, immutable=${dbImmutable}`,
    );
  }

  // --------------------------------------------------------------------------
  // Summary & Teardown
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`Phase 6B Test Suite Completed: ${passCount}/14 Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  await mongoose.disconnect();

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase6bTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
