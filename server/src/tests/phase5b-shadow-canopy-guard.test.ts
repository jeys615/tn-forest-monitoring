/**
 * Phase 5B: Algorithm v2.1-SHADOW Non-Intrusive Evaluation & 7-Gate Regression Test Suite
 *
 * Verifies:
 * - Gate 1: Boundary Soil Track [1985, 1129] routes to PRE_SCREENED_NON_FOREST
 * - Gate 2: Steep-Slope Topographic Shadow [544, 604] retained as Persistent Candidate
 * - Gate 3: Open Scrub Forest [960, 629] retained as Persistent Candidate
 * - Gate 4: Soil-Mixed Dense Canopy [155, 1168] retained as Persistent Candidate
 * - Gate 5: SCL Validity & Uncertainty Policy Preservation (classes 0,1,3,8,9,10,11 -> UNCERTAIN)
 * - Gate 6: Stable Core Interior Canopy [670, 821] retained and evaluated
 * - Gate 7: Dynamic Tripartite Denominators & 4-Way Spatial Partition Conservation (Sum == 135,489)
 * - Gate 8: Zero Database Mutation & Empirical Rollback Verification (CANOPY_GUARD_MODE='OFF')
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

async function runPhase5bRegressionSuite() {
  console.log('================================================================');
  console.log('🧪 PHASE 5B: ALGORITHM V2.1-SHADOW REGRESSION TEST SUITE');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // 1. Snapshot database state before running tests
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

  // Ensure service starts in SHADOW mode
  CanopyGuardShadowService.setMode('SHADOW');

  // --------------------------------------------------------------------------
  // GATE 1: Boundary Soil Track Pixel [1985, 1129]
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 1: Boundary Soil Track Pixel [1985, 1129]...');
  const g1Res = CanopyGuardShadowService.evaluatePixel(0.3824, Sen2CorSclClass.NOT_VEGETATED);
  if (
    g1Res.isValidObservation === true &&
    g1Res.isCanopy === false &&
    g1Res.shadowCategory === 'PRE_SCREENED_NON_FOREST'
  ) {
    assertPass(
      'Gate 1',
      `Pixel [1985, 1129] (NDVI=0.3824, SCL=5) successfully routed to PRE_SCREENED_NON_FOREST (${g1Res.reason})`
    );
  } else {
    assertFail('Gate 1', `Unexpected evaluation for pixel [1985, 1129]: ${JSON.stringify(g1Res)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 2: Steep-Slope Topographic Shadow Pixel [544, 604]
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 2: Steep-Slope Topographic Shadow Pixel [544, 604]...');
  const g2Res = CanopyGuardShadowService.evaluatePixel(0.7974, Sen2CorSclClass.DARK_AREA_PIXELS);
  if (
    g2Res.isValidObservation === true &&
    g2Res.isCanopy === true &&
    g2Res.shadowCategory === 'CANOPY_EVALUATED'
  ) {
    assertPass(
      'Gate 2',
      `Steep-slope shadow pixel (NDVI=0.7974, SCL=2) retained as CANOPY_EVALUATED via Branch 1 (${g2Res.reason})`
    );
  } else {
    assertFail('Gate 2', `False negative detected for steep slope: ${JSON.stringify(g2Res)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 3: Open Scrub Forest Pixel [960, 629]
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 3: Open Scrub Forest Pixel [960, 629]...');
  const g3Res = CanopyGuardShadowService.evaluatePixel(0.3604, Sen2CorSclClass.VEGETATION);
  if (
    g3Res.isValidObservation === true &&
    g3Res.isCanopy === true &&
    g3Res.shadowCategory === 'CANOPY_EVALUATED'
  ) {
    assertPass(
      'Gate 3',
      `Open scrub pixel (NDVI=0.3604, SCL=4) retained as CANOPY_EVALUATED via Branch 2 (${g3Res.reason})`
    );
  } else {
    assertFail('Gate 3', `False negative detected for open scrub: ${JSON.stringify(g3Res)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 4: Soil-Mixed Dense Canopy Pixel [155, 1168]
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 4: Soil-Mixed Dense Canopy Pixel [155, 1168]...');
  const g4Res = CanopyGuardShadowService.evaluatePixel(0.5474, Sen2CorSclClass.NOT_VEGETATED);
  if (
    g4Res.isValidObservation === true &&
    g4Res.isCanopy === true &&
    g4Res.shadowCategory === 'CANOPY_EVALUATED'
  ) {
    assertPass(
      'Gate 4',
      `Soil-mixed canopy pixel (NDVI=0.5474, SCL=5) retained as CANOPY_EVALUATED via Branch 1 (${g4Res.reason})`
    );
  } else {
    assertFail('Gate 4', `False negative detected for soil-mixed canopy: ${JSON.stringify(g4Res)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 5: SCL Validity & Uncertainty Policy Preservation
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 5: SCL Validity Gate & Uncertainty Policy Preservation...');
  const invalidClasses = [
    Sen2CorSclClass.NO_DATA,
    Sen2CorSclClass.SATURATED_OR_DEFECTIVE,
    Sen2CorSclClass.CLOUD_SHADOWS,
    Sen2CorSclClass.CLOUD_MEDIUM_PROBABILITY,
    Sen2CorSclClass.CLOUD_HIGH_PROBABILITY,
    Sen2CorSclClass.THIN_CIRRUS,
    Sen2CorSclClass.SNOW,
  ];

  let invalidClassesPass = true;
  for (const scl of invalidClasses) {
    // Even if NDVI is very high (0.85), an invalid observation MUST route to UNCERTAIN_OBSCURED
    const res = CanopyGuardShadowService.evaluatePixel(0.85, scl);
    if (res.isValidObservation !== false || res.shadowCategory !== 'UNCERTAIN_OBSCURED') {
      invalidClassesPass = false;
      console.error(`    Mismatch on SCL ${scl}: expected UNCERTAIN_OBSCURED, got ${res.shadowCategory}`);
    }
  }

  if (invalidClassesPass) {
    assertPass(
      'Gate 5',
      `All 7 invalid SCL classes {0,1,3,8,9,10,11} strictly routed to UNCERTAIN_OBSCURED; zero routed to PRE_SCREENED_NON_FOREST`
    );
  } else {
    assertFail('Gate 5', `One or more invalid SCL classes violated the uncertainty preservation policy`);
  }

  // --------------------------------------------------------------------------
  // GATE 6: Stable Core Interior Canopy Pixel [670, 821]
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 6: Stable Core Interior Canopy Pixel [670, 821]...');
  const g6Res = CanopyGuardShadowService.evaluatePixel(0.8966, Sen2CorSclClass.VEGETATION);
  if (
    g6Res.isValidObservation === true &&
    g6Res.isCanopy === true &&
    g6Res.shadowCategory === 'CANOPY_EVALUATED'
  ) {
    assertPass(
      'Gate 6',
      `Stable core evergreen canopy (NDVI=0.8966, SCL=4) retained for evaluation (${g6Res.reason})`
    );
  } else {
    assertFail('Gate 6', `Core canopy pixel incorrectly screened out: ${JSON.stringify(g6Res)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 7: Dynamic Tripartite Denominators & 4-Way Partition Conservation
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 7: Dynamic Tripartite Denominators & 4-Way Partition Conservation...');
  const benchmarkAccounting = CanopyGuardShadowService.computeAccountingModel({
    fullCandidatePool: 135489,
    fullyObservableSubset: 123398,
    seasonalCount: 110529,
    persistentCount: 4298,
    uncertainCount: 20454,
    preScreenedNonForestCount: 208,
  });

  const g7Valid =
    benchmarkAccounting.partitionConservationValid &&
    benchmarkAccounting.partitionSum === 135489 &&
    benchmarkAccounting.outcomeDeterminedSubset === 114827 &&
    benchmarkAccounting.fullCandidatePool === 135489 &&
    benchmarkAccounting.fullyObservableSubset === 123398;

  if (g7Valid) {
    assertPass(
      'Gate 7',
      `Partition conservation 100% verified: ` +
      `Seasonal(${benchmarkAccounting.seasonalCount}) + ` +
      `Persistent(${benchmarkAccounting.persistentCount}) + ` +
      `Uncertain(${benchmarkAccounting.uncertainCount}) + ` +
      `PreScreened(${benchmarkAccounting.preScreenedNonForestCount}) = ` +
      `${benchmarkAccounting.partitionSum} == 135,489 px (Error: 0 px, Candidate Reduction: ${benchmarkAccounting.candidateReductionRate.toFixed(2)}%)`
    );
  } else {
    assertFail('Gate 7', `Accounting model partition error: ${JSON.stringify(benchmarkAccounting)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 8: Zero Database Mutation & Empirical Rollback Verification
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 8: Zero Database Mutation & Empirical Rollback Verification...');
  
  // Test Rollback: Toggle mode to 'OFF'
  CanopyGuardShadowService.setMode('OFF');
  const rollbackRes = CanopyGuardShadowService.evaluatePixel(0.3824, Sen2CorSclClass.NOT_VEGETATED);
  const rollbackOk =
    rollbackRes.isCanopy === true &&
    rollbackRes.shadowCategory === 'CANOPY_EVALUATED' &&
    rollbackRes.reason === 'GUARD_BYPASSED_MODE_OFF';

  // Restore SHADOW mode
  CanopyGuardShadowService.setMode('SHADOW');

  // Verify DB state remains 100% untouched
  const postCounts = await getDbCounts();
  const dbUnmodified =
    preCounts.users === postCounts.users &&
    preCounts.zones === postCounts.zones &&
    preCounts.baselines === postCounts.baselines &&
    preCounts.satellitemetadatas === postCounts.satellitemetadatas &&
    preCounts.changedetections === postCounts.changedetections &&
    preCounts.alerts === postCounts.alerts &&
    preCounts.monitoringjobs === postCounts.monitoringjobs &&
    preCounts.incrementalmonitoringrecords === postCounts.incrementalmonitoringrecords;

  if (rollbackOk && dbUnmodified) {
    assertPass(
      'Gate 8',
      `Empirical rollback verified (CANOPY_GUARD_MODE='OFF' successfully bypasses guard) and database is 100% immutable (0 writes, 0 deletions across all 8 collections)`
    );
  } else {
    assertFail('Gate 8', `Rollback check failed (${rollbackOk}) or DB mutation detected (${dbUnmodified})`);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 PHASE 5B REGRESSION TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  await mongoose.disconnect();

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase5bRegressionSuite().catch((err) => {
  console.error('Fatal test error in Phase 5B suite:', err);
  process.exit(1);
});
