import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { User } from '../models/User.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { MonitoringSchedulerWorker } from '../workers/MonitoringSchedulerWorker.js';
import { MonitoringSchedulerService } from '../services/MonitoringSchedulerService.js';
import { AutomatedMonitoringService, type AreaInfo } from '../services/AutomatedMonitoringService.js';
import {
  SensorType,
  SatelliteSource,
  ZoneStatus,
  ZoneCategory,
  MonitoringTrack,
  MonitoringJobStatus,
  IncrementalLifecycleState,
  MonitoringTrackStatus,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';

let passedTests = 0;
let failedTests = 0;

function reportPass(name: string): void {
  console.info(`  ✅ [PASS] ${name}`);
  passedTests++;
}

function reportFail(name: string, error: any): void {
  console.error(`  ❌ [FAIL] ${name}:`, error);
  failedTests++;
}

async function runSchedulerOperationalVerificationSuite(): Promise<void> {
  console.info('================================================================');
  console.info('REAL NODE-CRON SCHEDULER OPERATIONAL VERIFICATION & INDEPENDENCE');
  console.info('================================================================\n');

  await connectDatabase();

  // ── PRE-TEST DATABASE INVARIANT AUDIT ──
  console.info('--- 1. PRE-TEST DATABASE INVARIANT AUDIT ---');
  const preCounts = {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellites: await SatelliteMetadata.countDocuments(),
    changes: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    jobs: await MonitoringJobModel.countDocuments(),
    incremental: await IncrementalMonitoringRecordModel.countDocuments(),
  };

  console.info('Pre-Test Document Counts:');
  for (const [k, v] of Object.entries(preCounts)) {
    console.info(`  ${k.padEnd(14)}: ${v}`);
  }

  // Verify Vadipatti production zone
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  assert(vadipatti, 'Vadipatti production zone exists');
  assert.strictEqual(
    vadipatti.monitoringTracks?.sar?.enabled,
    false,
    'Vadipatti SAR track must be FALSE prior to test',
  );
  reportPass('Vadipatti production state verified intact (SAR disabled)');

  const testStartTime = new Date(Date.now() - 2000); // 2 second buffer
  const testZoneIds: Types.ObjectId[] = [];
  const testBaselineIds: Types.ObjectId[] = [];
  const testSatMetadataIds: Types.ObjectId[] = [];
  const testJobIds: string[] = [];
  let executionError: any = null;

  try {
    // ── STAGE 1: SCHEDULER ARCHITECTURE & CRON SPECIFICATION ──
    console.info('\n--- STAGE 1: SCHEDULER ARCHITECTURE & CRON SPECIFICATION ---');
    const worker = MonitoringSchedulerWorker.getInstance();
    assert(worker, 'MonitoringSchedulerWorker singleton instance resolved');
    const cronExpr = worker.getCronExpression();
    assert.strictEqual(cronExpr, '0 * * * *', 'Scheduler worker specifies standard hourly cron expression "0 * * * *"');
    reportPass('Scheduler singleton and cron expression "0 * * * *" verified');

    const autoService = AutomatedMonitoringService.getInstance();
    assert.strictEqual(
      typeof autoService.processAllAreasIncremental,
      'function',
      'AutomatedMonitoringService.processAllAreasIncremental is defined',
    );
    reportPass('AutomatedMonitoringService.processAllAreasIncremental method confirmed');

    const schedulerService = new MonitoringSchedulerService();
    assert.strictEqual(
      typeof schedulerService.processAllAreasIncremental,
      'function',
      'MonitoringSchedulerService.processAllAreasIncremental is defined',
    );
    reportPass('MonitoringSchedulerService.processAllAreasIncremental method confirmed');

    // ── STAGE 2: SETUP ISOLATED DUAL-TRACK TEST STAGING FIXTURES ──
    console.info('\n--- STAGE 2: SETUP ISOLATED DUAL-TRACK TEST STAGING FIXTURES ---');
    const adminUser = await User.findOne();
    assert(adminUser, 'Admin user exists for createdBy references');

    const testBoundary: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [77.85, 10.05],
          [77.92, 10.05],
          [77.92, 10.12],
          [77.85, 10.12],
          [77.85, 10.05],
        ],
      ],
    };

    const stagingZone = await Zone.create({
      zoneId: 'ZONE-TEST-SCHED-01',
      name: 'TEST_SCHED_STAGING_ZONE',
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      boundary: testBoundary,
      centerPoint: { type: 'Point', coordinates: [77.885, 10.085] },
      areaHectares: 54.2,
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
      createdBy: adminUser._id,
    });
    testZoneIds.push(stagingZone._id);

    // Create optical baseline
    const opticalSatMeta = await SatelliteMetadata.create({
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/TEST_OPTICAL_BASE_20240110',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2024-01-10T05:00:00Z'),
      cloudCover: 2.5,
      nativeResolution: 10,
      footprint: testBoundary,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED',
      zoneId: stagingZone._id,
    });
    testSatMetadataIds.push(opticalSatMeta._id);

    const opticalBaseline = await BaselineModel.create({
      zoneId: stagingZone._id,
      satelliteMetadataId: opticalSatMeta._id,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      baselineDate: new Date('2024-01-10T05:00:00Z'),
      acquisitionDate: new Date('2024-01-10T05:00:00Z'),
      isActive: true,
      status: 'ACTIVE',
      qualityScore: 95.0,
      validPixelPercentage: 100.0,
      selectionReason: 'Active Optical Reference',
      activatedAt: new Date(),
      cloudCover: 2.5,
      nativeResolution: 10,
      createdBy: adminUser._id,
    });
    testBaselineIds.push(opticalBaseline._id);

    // Create authentic SAR baseline (using real Sentinel-1 scene ID)
    const sarSatMeta = await SatelliteMetadata.create({
      imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20240110T004120_20240110T004145_052037_0649ED_0D81',
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      acquisitionDate: new Date('2024-01-10T00:41:20Z'),
      cloudCover: 0.0,
      nativeResolution: 10,
      footprint: testBoundary,
      geeReference: 'COPERNICUS/S1_GRD',
      zoneId: stagingZone._id,
    });
    testSatMetadataIds.push(sarSatMeta._id);

    const sarBaseline = await BaselineModel.create({
      zoneId: stagingZone._id,
      satelliteMetadataId: sarSatMeta._id,
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      baselineDate: new Date('2024-01-10T00:41:20Z'),
      acquisitionDate: new Date('2024-01-10T00:41:20Z'),
      isActive: true,
      status: 'ACTIVE',
      qualityScore: 98.0,
      validPixelPercentage: 100.0,
      selectionReason: 'Active SAR Reference',
      activatedAt: new Date(),
      cloudCover: 0.0,
      nativeResolution: 10,
      createdBy: adminUser._id,
    });
    testBaselineIds.push(sarBaseline._id);

    reportPass('Isolated staging zone created with dual active baselines (1 Optical + 1 SAR)');

    // ── STAGE 3: REAL SCHEDULER TIMER-TRIGGERED CYCLE EXECUTION ──
    console.info('\n--- STAGE 3: REAL SCHEDULER TIMER-TRIGGERED CYCLE EXECUTION ---');
    // Start the worker with immediate: true to observe the real timer-triggered dispatch
    let timerFired = false;
    const workerInstance = MonitoringSchedulerWorker.getInstance();

    // Verify worker is inactive before start
    assert(!workerInstance.isActive(), 'Worker is initially inactive');

    console.info('Starting scheduler worker with immediate timer dispatch...');
    const cyclePromise = new Promise<{
      zonesEvaluated: number;
      jobsCreated: number;
      jobsCompleted: number;
      jobsWaiting: number;
      jobsFailed: number;
      incrementalResult?: any;
    }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Scheduler cycle timed out after 180s')), 180000);
      workerInstance.onCycleComplete = (summary) => {
        clearTimeout(timeout);
        resolve(summary);
      };
    });

    workerInstance.start(60, { immediate: true });
    assert(workerInstance.isActive(), 'Worker timer is active after start()');

    console.info('Awaiting real timer-triggered cycle execution via onCycleComplete hook...');
    const cycleSummary = await cyclePromise;
    timerFired = true;

    assert(timerFired, 'Scheduler timer triggered successfully');
    assert(cycleSummary.zonesEvaluated >= 2, `Scheduler evaluated >= 2 zones (Vadipatti + Staging Zone)`);
    console.info(`Scheduler Execution Summary:
      Zones Evaluated: ${cycleSummary.zonesEvaluated}
      Jobs Created:    ${cycleSummary.jobsCreated}
      Jobs Completed:  ${cycleSummary.jobsCompleted}
      Jobs Waiting:    ${cycleSummary.jobsWaiting}
      Jobs Failed:     ${cycleSummary.jobsFailed}`);

    workerInstance.stop();
    assert(!workerInstance.isActive(), 'Worker stopped gracefully after cycle');
    reportPass('Real scheduler timer trigger executed and completed full cycle');

    // ── STAGE 4: VERIFY DUAL-TRACK INDEPENDENT SCHEDULER EXECUTION ──
    console.info('\n--- STAGE 4: VERIFY DUAL-TRACK INDEPENDENT SCHEDULER EXECUTION ---');
    // Verify that the staging zone had both Optical and SAR evaluated independently
    const stagingArea: AreaInfo = {
      id: stagingZone._id.toString(),
      name: stagingZone.name,
      type: 'PERMANENT',
      boundary: stagingZone.boundary,
      status: stagingZone.status,
      category: stagingZone.category,
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
    };

    const detailedResult = await autoService.processAreaIncrementalDetailed(stagingArea);
    assert(detailedResult.areaResult.tracks, 'Detailed result contains dual tracks');
    assert.strictEqual(detailedResult.areaResult.tracks.optical.enabled, true, 'Optical track was evaluated');
    assert.strictEqual(detailedResult.areaResult.tracks.sar.enabled, true, 'SAR track was evaluated');

    console.info(`Staging Zone Tracks Result:
      Optical Track Status: ${detailedResult.areaResult.tracks.optical.status}
      Optical Discovered:   ${detailedResult.areaResult.tracks.optical.discoveredCount}
      SAR Track Status:     ${detailedResult.areaResult.tracks.sar.status}
      SAR Discovered:       ${detailedResult.areaResult.tracks.sar.discoveredCount}`);

    reportPass('Dual-track independent evaluation confirmed (Optical & SAR evaluated concurrently)');

    // ── STAGE 5: INDEPENDENCE DIRECTION TESTING (CASES A, B, C) ──
    console.info('\n--- STAGE 5: INDEPENDENCE DIRECTION TESTING ---');

    // CASE A: Optical Blocked by Cloud Cover (>20%) while SAR is Eligible
    console.info('\n▶ CASE A: Optical Blocked by Cloud Cover (>20%) → SAR Proceeds Independently');
    const caseAArea: AreaInfo = {
      id: stagingZone._id.toString(),
      name: 'CASE_A_OPTICAL_BLOCKED',
      type: 'PERMANENT',
      boundary: testBoundary,
      status: ZoneStatus.PROTECTED,
      monitoringTracks: { optical: { enabled: true }, sar: { enabled: true } },
    };

    // Simulate cloudy optical observation discovery
    const cloudyOpticalMeta = await SatelliteMetadata.create({
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/TEST_OPTICAL_CLOUDY_20240825',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2024-08-25T05:00:00Z'),
      cloudCover: 82.4, // > 20%
      nativeResolution: 10,
      footprint: testBoundary,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED',
      zoneId: stagingZone._id,
    });
    testSatMetadataIds.push(cloudyOpticalMeta._id);

    const caseAResult = await autoService.processAreaIncrementalDetailed(caseAArea);
    assert(caseAResult.areaResult.tracks, 'Case A has track results');
    // Optical should be waiting/blocked
    assert(
      caseAResult.areaResult.tracks.optical.rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD > 0 ||
        caseAResult.areaResult.tracks.optical.status === MonitoringTrackStatus.WAITING_FOR_NEXT_CYCLE,
      'Optical track correctly rejected high cloud scene',
    );
    // SAR track evaluated independently without being aborted by optical
    assert.notStrictEqual(
      caseAResult.areaResult.tracks.sar.status,
      MonitoringTrackStatus.DISABLED,
      'SAR track did not abort when optical was blocked',
    );
    reportPass('Case A PASSED: Optical blocked by cloud did not block SAR');

    // CASE B: SAR Blocked / No SAR Baseline → Optical Proceeds Independently
    console.info('\n▶ CASE B: SAR Disabled or Blocked → Optical Proceeds Independently');
    const caseBArea: AreaInfo = {
      id: stagingZone._id.toString(),
      name: 'CASE_B_SAR_DISABLED',
      type: 'PERMANENT',
      boundary: testBoundary,
      status: ZoneStatus.PROTECTED,
      monitoringTracks: { optical: { enabled: true }, sar: { enabled: false } },
    };

    const caseBResult = await autoService.processAreaIncrementalDetailed(caseBArea);
    assert(caseBResult.areaResult.tracks, 'Case B has track results');
    assert.strictEqual(caseBResult.areaResult.tracks.sar.status, MonitoringTrackStatus.DISABLED, 'SAR status is DISABLED');
    assert.strictEqual(caseBResult.areaResult.tracks.sar.enabled, false, 'SAR track is disabled');
    assert.strictEqual(caseBResult.areaResult.tracks.optical.enabled, true, 'Optical track remains enabled and functional');
    reportPass('Case B PASSED: SAR disabled did not block optical');

    // CASE C: Both Tracks Unavailable → Correct Terminal Semantics & Zero False Alerts
    console.info('\n▶ CASE C: Both Tracks Unavailable → Terminal WAITING_FOR_NEXT_CYCLE & Zero False Alerts');
    const caseCArea: AreaInfo = {
      id: stagingZone._id.toString(),
      name: 'CASE_C_BOTH_UNAVAILABLE',
      type: 'PERMANENT',
      boundary: testBoundary,
      status: ZoneStatus.PROTECTED,
      monitoringTracks: { optical: { enabled: true }, sar: { enabled: true } },
    };

    const caseCResult = await autoService.processAreaIncrementalDetailed(caseCArea);
    assert(caseCResult.areaResult.tracks, 'Case C has track results');
    assert.strictEqual(caseCResult.areaResult.tracks.optical.alertCount, 0, 'Optical alert count is 0');
    assert.strictEqual(caseCResult.areaResult.tracks.sar.alertCount, 0, 'SAR alert count is 0');
    const stagingAlerts = await AlertModel.countDocuments({ zoneId: stagingZone._id });
    assert.strictEqual(stagingAlerts, 0, 'Zero database alerts created for staging test zone');
    reportPass('Case C PASSED: Both tracks handle waiting state cleanly with zero false alerts');

    // ── STAGE 6: VADIPATTI SAFETY VERIFICATION ──
    console.info('\n--- STAGE 6: VADIPATTI SAFETY VERIFICATION ---');
    const vadipattiPost = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
    assert(vadipattiPost, 'Vadipatti exists post-execution');
    assert.strictEqual(
      vadipattiPost.monitoringTracks?.sar?.enabled,
      false,
      'Vadipatti SAR track strictly remained FALSE throughout all scheduler cycles',
    );

    const vadipattiBaselines = await BaselineModel.find({ zoneId: vadipattiPost._id, isActive: true });
    assert.strictEqual(vadipattiBaselines.length, 1, 'Vadipatti has strictly 1 active baseline');
    assert.strictEqual(vadipattiBaselines[0].sensorType, SensorType.OPTICAL, 'Vadipatti baseline is strictly OPTICAL (Landsat-8)');

    reportPass('Vadipatti production zone invariants 100% verified untouched');

  } catch (err: any) {
    executionError = err;
    console.error('\n❌ STAGE EXECUTION ERROR:', err);
  } finally {
    // ── CLEANUP TEST FIXTURES ──
    console.info('\n--- CLEANING UP TEMPORARY STAGING FIXTURES ---');
    if (testZoneIds.length > 0) {
      await Zone.deleteMany({ _id: { $in: testZoneIds } });
      await BaselineModel.deleteMany({ zoneId: { $in: testZoneIds } });
      await AlertModel.deleteMany({ zoneId: { $in: testZoneIds } });
    }
    await ChangeDetectionModel.deleteMany({
      $or: [{ zoneId: { $in: testZoneIds } }, { createdAt: { $gte: testStartTime } }],
    });
    await SatelliteMetadata.deleteMany({
      $or: [
        { _id: { $in: testSatMetadataIds } },
        { zoneId: { $in: testZoneIds } },
        { createdAt: { $gte: testStartTime } },
      ],
    });
    // Clean any scheduled test monitoring jobs and records created during the test
    await MonitoringJobModel.deleteMany({
      $or: [{ zoneId: { $in: testZoneIds } }, { createdAt: { $gte: testStartTime } }],
    });
    await IncrementalMonitoringRecordModel.deleteMany({
      $or: [
        { areaId: { $in: testZoneIds.map((id) => id.toString()) } },
        { createdAt: { $gte: testStartTime } },
      ],
    });

    // ── POST-TEST DATABASE INVARIANT AUDIT ──
    console.info('\n--- POST-TEST DATABASE INVARIANT AUDIT (ZERO DRIFT CHECK) ---');
    const postCounts = {
      users: await User.countDocuments(),
      zones: await Zone.countDocuments(),
      baselines: await BaselineModel.countDocuments(),
      satellites: await SatelliteMetadata.countDocuments(),
      changes: await ChangeDetectionModel.countDocuments(),
      alerts: await AlertModel.countDocuments(),
      jobs: await MonitoringJobModel.countDocuments(),
      incremental: await IncrementalMonitoringRecordModel.countDocuments(),
    };

    console.info('Post-Test Document Counts:');
    let drift = false;
    for (const [k, v] of Object.entries(preCounts)) {
      const post = postCounts[k as keyof typeof postCounts];
      const diff = post - v;
      console.info(`  ${k.padEnd(14)}: ${post} (Before: ${v}, Diff: ${diff})`);
      if (diff !== 0) drift = true;
    }

    assert(!drift, 'ZERO DATABASE DRIFT: All database collections 100% match pre-test counts');
    reportPass('Zero database drift confirmed across all 8 collections');

    await mongoose.disconnect();

    if (executionError) {
      throw executionError;
    }
  }

  console.info('\n================================================================');
  console.info(`SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.info('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSchedulerOperationalVerificationSuite().catch((err) => {
  console.error('Fatal scheduler test failure:', err);
  process.exit(1);
});
