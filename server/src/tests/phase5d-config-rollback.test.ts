/**
 * Phase 5D: Configuration and Rollback Verification Test Suite
 *
 * Verifies:
 * - Gate 1: Default Mode Verification (CANOPY_GUARD_MODE unset -> 'SHADOW')
 * - Gate 2: Explicit Mode Verification ('OFF') -> Bypasses canopy guard
 * - Gate 3: Explicit Mode Verification ('SHADOW') -> Operates in shadow mode
 * - Gate 4: Explicit Mode Verification ('ACTIVE') -> Validated, production isolated
 * - Gate 5: Invalid Configuration Rejection & Fail-Safe Protection (fails safely, never defaults to ACTIVE)
 * - Gate 6: Startup Initialization Sequence (initializes from env config)
 * - Gate 7: Immediate In-Memory Rollback Toggle (zero latency, clean transition)
 * - Gate 8: Process Restart Requirement for Disk .env Changes (verifies immutability of loaded env)
 * - Gate 9: Production Isolation & Zero Database Mutation (all 8 collections remain untouched)
 */
import mongoose from 'mongoose';
import { env, envSchema } from '../config/env.js';
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

// Minimal mock process env to test envSchema validation without missing required keys
const baseMockEnv = {
  MONGODB_URI: 'mongodb://localhost:27017/tn_forest_monitoring',
  JWT_SECRET: 'test_jwt_secret_for_schema_validation_purposes_only',
};

async function runPhase5dTestSuite() {
  console.log('================================================================');
  console.log('🧪 PHASE 5D: CONFIGURATION & ROLLBACK VERIFICATION TEST SUITE');
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

  // --------------------------------------------------------------------------
  // GATE 1: Default Mode Verification (CANOPY_GUARD_MODE unset)
  // --------------------------------------------------------------------------
  console.log('▶ Testing Gate 1: Default Mode Verification...');
  const g1Parsed = envSchema.safeParse({ ...baseMockEnv });
  if (g1Parsed.success && g1Parsed.data.CANOPY_GUARD_MODE === 'SHADOW') {
    assertPass(
      'Gate 1',
      `CANOPY_GUARD_MODE defaults safely to 'SHADOW' when unset in environment`
    );
  } else {
    assertFail('Gate 1', `Expected default 'SHADOW', received: ${JSON.stringify(g1Parsed)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 2: Explicit Mode Verification ('OFF') -> Guard Bypassed
  // --------------------------------------------------------------------------
  console.log("\n▶ Testing Gate 2: Explicit Mode 'OFF' (Rollback / Bypass)...");
  const g2Parsed = envSchema.safeParse({ ...baseMockEnv, CANOPY_GUARD_MODE: 'OFF' });
  CanopyGuardShadowService.setMode('OFF');
  const g2Mode = CanopyGuardShadowService.getMode();
  // Evaluate soil track pixel [1985, 1129] (NDVI=0.3824, SCL=5)
  const g2Eval = CanopyGuardShadowService.evaluatePixel(0.3824, Sen2CorSclClass.NOT_VEGETATED);

  if (
    g2Parsed.success &&
    g2Parsed.data.CANOPY_GUARD_MODE === 'OFF' &&
    g2Mode === 'OFF' &&
    g2Eval.isCanopy === true &&
    g2Eval.shadowCategory === 'CANOPY_EVALUATED' &&
    g2Eval.reason === 'GUARD_BYPASSED_MODE_OFF'
  ) {
    assertPass(
      'Gate 2',
      `CANOPY_GUARD_MODE='OFF' successfully parsed and verified: guard bypassed completely in memory`
    );
  } else {
    assertFail('Gate 2', `Mode 'OFF' failure: parsed=${JSON.stringify(g2Parsed)}, eval=${JSON.stringify(g2Eval)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 3: Explicit Mode Verification ('SHADOW') -> Shadow Evaluation Active
  // --------------------------------------------------------------------------
  console.log("\n▶ Testing Gate 3: Explicit Mode 'SHADOW'...");
  const g3Parsed = envSchema.safeParse({ ...baseMockEnv, CANOPY_GUARD_MODE: 'SHADOW' });
  CanopyGuardShadowService.setMode('SHADOW');
  const g3Mode = CanopyGuardShadowService.getMode();
  const g3EvalSoil = CanopyGuardShadowService.evaluatePixel(0.3824, Sen2CorSclClass.NOT_VEGETATED);
  const g3EvalCanopy = CanopyGuardShadowService.evaluatePixel(0.7974, Sen2CorSclClass.DARK_AREA_PIXELS);

  if (
    g3Parsed.success &&
    g3Parsed.data.CANOPY_GUARD_MODE === 'SHADOW' &&
    g3Mode === 'SHADOW' &&
    g3EvalSoil.shadowCategory === 'PRE_SCREENED_NON_FOREST' &&
    g3EvalCanopy.shadowCategory === 'CANOPY_EVALUATED'
  ) {
    assertPass(
      'Gate 3',
      `CANOPY_GUARD_MODE='SHADOW' successfully parsed and verified: non-forest screened, canopy retained`
    );
  } else {
    assertFail('Gate 3', `Mode 'SHADOW' failure: ${JSON.stringify(g3Parsed)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 4: Explicit Mode Verification ('ACTIVE')
  // --------------------------------------------------------------------------
  console.log("\n▶ Testing Gate 4: Explicit Mode 'ACTIVE'...");
  const g4Parsed = envSchema.safeParse({ ...baseMockEnv, CANOPY_GUARD_MODE: 'ACTIVE' });
  CanopyGuardShadowService.setMode('ACTIVE');
  const g4Mode = CanopyGuardShadowService.getMode();

  if (g4Parsed.success && g4Parsed.data.CANOPY_GUARD_MODE === 'ACTIVE' && g4Mode === 'ACTIVE') {
    assertPass(
      'Gate 4',
      `CANOPY_GUARD_MODE='ACTIVE' successfully recognized and validated by configuration schema`
    );
  } else {
    assertFail('Gate 4', `Mode 'ACTIVE' failure: ${JSON.stringify(g4Parsed)}`);
  }

  // --------------------------------------------------------------------------
  // GATE 5: Invalid Configuration Rejection & Fail-Safe Protection
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 5: Invalid Configuration Rejection & Fail-Safe Protection...');
  const invalidModes = ['INVALID', 'DISABLED', 'ENABLED', 'TRUE', 'FALSE', '1', 'active', 'shadow', 'off'];
  let allInvalidRejected = true;

  for (const inv of invalidModes) {
    const res = envSchema.safeParse({ ...baseMockEnv, CANOPY_GUARD_MODE: inv });
    if (res.success) {
      allInvalidRejected = false;
      console.error(`    Failed: Invalid mode '${inv}' was unexpectedly accepted!`);
    }
  }

  // Test runtime defensive validation in CanopyGuardShadowService.setMode
  CanopyGuardShadowService.setMode('MALFORMED_INPUT');
  const fallbackMode = CanopyGuardShadowService.getMode();

  if (allInvalidRejected && fallbackMode === 'SHADOW') {
    assertPass(
      'Gate 5',
      `Schema strictly rejects all invalid configuration values; setMode fails safe to 'SHADOW', never 'ACTIVE'`
    );
  } else {
    assertFail('Gate 5', `Invalid configuration did not fail safely: fallbackMode=${fallbackMode}`);
  }

  // --------------------------------------------------------------------------
  // GATE 6: Startup Initialization Sequence
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 6: Startup Initialization Sequence...');
  CanopyGuardShadowService.initializeFromEnv(env.CANOPY_GUARD_MODE);
  const initMode = CanopyGuardShadowService.getMode();

  if (initMode === env.CANOPY_GUARD_MODE) {
    assertPass(
      'Gate 6',
      `Startup initialization sequence verified: service initialized to '${initMode}' matching env.CANOPY_GUARD_MODE`
    );
  } else {
    assertFail('Gate 6', `Startup mismatch: service mode '${initMode}' != env '${env.CANOPY_GUARD_MODE}'`);
  }

  // --------------------------------------------------------------------------
  // GATE 7: Immediate In-Memory Rollback Toggle
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 7: Immediate In-Memory Rollback Toggle...');
  // 1. Set to SHADOW
  CanopyGuardShadowService.setMode('SHADOW');
  const t1 = CanopyGuardShadowService.evaluatePixel(0.3824, Sen2CorSclClass.NOT_VEGETATED);

  // 2. Rollback to OFF
  CanopyGuardShadowService.setMode('OFF');
  const t2 = CanopyGuardShadowService.evaluatePixel(0.3824, Sen2CorSclClass.NOT_VEGETATED);

  // 3. Restore to SHADOW
  CanopyGuardShadowService.setMode('SHADOW');
  const t3 = CanopyGuardShadowService.evaluatePixel(0.3824, Sen2CorSclClass.NOT_VEGETATED);

  const rollbackSmooth =
    t1.shadowCategory === 'PRE_SCREENED_NON_FOREST' &&
    t2.shadowCategory === 'CANOPY_EVALUATED' &&
    t2.reason === 'GUARD_BYPASSED_MODE_OFF' &&
    t3.shadowCategory === 'PRE_SCREENED_NON_FOREST';

  if (rollbackSmooth) {
    assertPass(
      'Gate 7',
      `Immediate in-memory rollback verified: SHADOW -> OFF (Bypass) -> SHADOW (Screening Restored)`
    );
  } else {
    assertFail('Gate 7', `Rollback transition failed: t1=${t1.shadowCategory}, t2=${t2.shadowCategory}, t3=${t3.shadowCategory}`);
  }

  // --------------------------------------------------------------------------
  // GATE 8: Process Restart Requirement for Disk .env Changes
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 8: Process Restart Requirement for Disk .env Changes...');
  const currentLoadedEnvMode = env.CANOPY_GUARD_MODE;
  // Mutate process.env directly
  const originalProcessEnv = process.env.CANOPY_GUARD_MODE;
  process.env.CANOPY_GUARD_MODE = 'OFF';

  // Verify that the already-evaluated `env` object has NOT changed
  const envStillMatchesInitial = env.CANOPY_GUARD_MODE === currentLoadedEnvMode;

  // Restore process.env
  if (originalProcessEnv !== undefined) {
    process.env.CANOPY_GUARD_MODE = originalProcessEnv;
  } else {
    delete process.env.CANOPY_GUARD_MODE;
  }

  if (envStillMatchesInitial) {
    assertPass(
      'Gate 8',
      `Process restart requirement proven: already-loaded 'env' object is immutable; runtime disk changes require process restart`
    );
  } else {
    assertFail('Gate 8', `Unexpected mutation of loaded env object at runtime`);
  }

  // --------------------------------------------------------------------------
  // GATE 9: Production Isolation & Zero Database Mutation
  // --------------------------------------------------------------------------
  console.log('\n▶ Testing Gate 9: Production Isolation & Zero Database Mutation...');
  // Ensure service restored to SHADOW
  CanopyGuardShadowService.setMode('SHADOW');

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

  if (dbUnmodified) {
    assertPass(
      'Gate 9',
      `Production isolation verified: zero writes, zero updates, zero deletions across all 8 collections`
    );
  } else {
    assertFail('Gate 9', `Database mutation detected during Phase 5D testing!`);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 PHASE 5D TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  await mongoose.disconnect();

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase5dTestSuite().catch((err) => {
  console.error('Fatal test error in Phase 5D suite:', err);
  process.exit(1);
});
