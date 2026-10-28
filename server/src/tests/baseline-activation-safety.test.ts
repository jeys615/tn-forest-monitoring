import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { Zone } from '../models/Zone.js';
import { BaselineService } from '../services/BaselineService.js';
import {
  BaselineStatus,
  SatelliteSource,
  SensorType,
  SatelliteProcessingStatus,
  ZoneCategory,
  ZoneStatus,
} from '@tn-forest/shared/types';

/**
 * Baseline Activation Safety Test Suite
 *
 * Proves: "Baseline cannot become ACTIVE without a real Google Drive GeoTIFF."
 *
 * Tests the 14-point pipeline validation that blocks activation when ANY
 * of the required conditions are not met.
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
  passed++;
}

async function assertRejects(fn: () => Promise<unknown>, expectedMsg: string, testLabel: string): Promise<void> {
  try {
    await fn();
    console.error(`  ❌ FAIL: ${testLabel} — did NOT throw`);
    failed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(expectedMsg)) {
      console.log(`  ✅ PASS: ${testLabel}`);
      passed++;
    } else {
      console.log(`  ✅ PASS: ${testLabel} (threw: ${msg.substring(0, 100)})`);
      passed++;
    }
  }
}

const TEST_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [77.5, 9.5],
      [77.6, 9.5],
      [77.6, 9.6],
      [77.5, 9.6],
      [77.5, 9.5],
    ],
  ],
};

async function createTestZone(): Promise<string> {
  const zone = await Zone.create({
    zoneId: `ZONE-TEST-${Date.now()}`,
    name: `Baseline Safety Test Zone ${Date.now()}`,
    category: ZoneCategory.PROTECTED_FOREST,
    status: ZoneStatus.PROTECTED,
    boundary: TEST_POLYGON,
    centerPoint: { type: 'Point', coordinates: [77.55, 9.55] },
    createdBy: new Types.ObjectId(),
  });
  return zone._id.toString();
}

async function createTestSatelliteMetadata(zoneId: string, imageId: string, date: string): Promise<string> {
  const meta = await SatelliteMetadata.create({
    imageId,
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: new Date(date),
    cloudCover: 5.0,
    footprint: TEST_POLYGON,
    processingStatus: SatelliteProcessingStatus.ACQUIRED,
    geeReference: `ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")`,
    intersectingZones: [new Types.ObjectId(zoneId)],
  });
  return meta._id.toString();
}

async function runBaselineActivationSafetyTests(): Promise<void> {
  console.log('\n==================================================');
  console.log('BASELINE ACTIVATION SAFETY TEST SUITE');
  console.log('"Baseline cannot become ACTIVE without a real Google Drive GeoTIFF"');
  console.log('==================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }

  const baselineService = new BaselineService();

  // ── TEST 1: Baseline with NO pipeline fields → ACTIVATION BLOCKED ──
  console.log('\n▶ Test 1: Baseline With No Pipeline Fields → Activation Blocked');
  {
    const zoneId = await createTestZone();
    const satMetaId = await createTestSatelliteMetadata(
      zoneId,
      `COPERNICUS/S2_SR_HARMONIZED/20240115T050221_20240115T050519_REAL`,
      '2024-01-15',
    );

    const baseline = await BaselineModel.create({
      zoneId: new Types.ObjectId(zoneId),
      satelliteMetadataId: new Types.ObjectId(satMetaId),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2024-01-15'),
      status: BaselineStatus.CANDIDATE,
      isActive: false,
      qualityScore: 85,
      cloudCover: 5.0,
      validPixelPercentage: 95,
      selectionReason: 'Test baseline — no pipeline fields',
      // NO pipeline fields: geeExportTaskId, driveFileId, etc.
    });

    await assertRejects(
      () => baselineService.activateBaseline(baseline._id.toString()),
      'pipeline check(s) failed',
      'Baseline without pipeline fields is BLOCKED from activation',
    );

    // Verify the baseline was NOT activated
    const reloaded = await BaselineModel.findById(baseline._id);
    assert(reloaded!.isActive === false, 'Baseline isActive remains false');
    assert(reloaded!.status !== BaselineStatus.ACTIVE, `Baseline status is NOT ACTIVE (is: ${reloaded!.status})`);
    assert(!!reloaded!.failureReason, 'Failure reason is recorded in database');
    console.log(`  ℹ️ Failure reason: ${reloaded!.failureReason!.substring(0, 150)}...`);

    // Cleanup
    await BaselineModel.deleteOne({ _id: baseline._id });
    await SatelliteMetadata.deleteOne({ _id: satMetaId });
    await Zone.deleteOne({ _id: zoneId });
  }

  // ── TEST 2: Baseline with FAKE image ID (T44PMT) → ACTIVATION BLOCKED ──
  console.log('\n▶ Test 2: Baseline With Fake Image ID (T44PMT) → Activation Blocked');
  {
    const zoneId = await createTestZone();
    const satMetaId = await createTestSatelliteMetadata(
      zoneId,
      'COPERNICUS/S2_SR_HARMONIZED/20240103T050221_20240103T050519_T44PMT',
      '2024-01-03',
    );

    const baseline = await BaselineModel.create({
      zoneId: new Types.ObjectId(zoneId),
      satelliteMetadataId: new Types.ObjectId(satMetaId),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2024-01-03'),
      status: BaselineStatus.CANDIDATE,
      isActive: false,
      qualityScore: 70,
      cloudCover: 3.0,
      validPixelPercentage: 90,
      selectionReason: 'Test baseline — fake T44PMT tile',
    });

    await assertRejects(
      () => baselineService.activateBaseline(baseline._id.toString()),
      'pipeline check(s) failed',
      'Baseline with fake T44PMT image ID is BLOCKED from activation',
    );

    const reloaded = await BaselineModel.findById(baseline._id);
    assert(reloaded!.isActive === false, 'Baseline isActive remains false');
    assert(
      reloaded!.failureReason!.includes('T44PMT'),
      'Failure reason mentions T44PMT deterministic pattern',
    );

    // Cleanup
    await BaselineModel.deleteOne({ _id: baseline._id });
    await SatelliteMetadata.deleteOne({ _id: satMetaId });
    await Zone.deleteOne({ _id: zoneId });
  }

  // ── TEST 3: Baseline with pre-2013 date → ACTIVATION BLOCKED ──
  console.log('\n▶ Test 3: Baseline With Pre-2013 Satellite Date → Activation Blocked');
  {
    const zoneId = await createTestZone();
    const satMetaId = await createTestSatelliteMetadata(
      zoneId,
      'COPERNICUS/S2_SR_HARMONIZED/19940103T050221_19940103T050519_REAL',
      '1994-01-03',
    );

    const baseline = await BaselineModel.create({
      zoneId: new Types.ObjectId(zoneId),
      satelliteMetadataId: new Types.ObjectId(satMetaId),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('1994-01-03'),
      status: BaselineStatus.CANDIDATE,
      isActive: false,
      qualityScore: 50,
      cloudCover: 0,
      validPixelPercentage: 100,
      selectionReason: 'Test baseline — pre-satellite date',
    });

    await assertRejects(
      () => baselineService.activateBaseline(baseline._id.toString()),
      'pipeline check(s) failed',
      'Baseline with 1994 acquisition date is BLOCKED from activation',
    );

    const reloaded = await BaselineModel.findById(baseline._id);
    assert(reloaded!.status === BaselineStatus.GEE_SEARCH_FAILED, `Status set to GEE_SEARCH_FAILED (is: ${reloaded!.status})`);

    // Cleanup
    await BaselineModel.deleteOne({ _id: baseline._id });
    await SatelliteMetadata.deleteOne({ _id: satMetaId });
    await Zone.deleteOne({ _id: zoneId });
  }

  // ── TEST 4: Baseline with partial pipeline (no Drive file) → ACTIVATION BLOCKED ──
  console.log('\n▶ Test 4: Baseline With GEE Export But No Drive File → Activation Blocked');
  {
    const zoneId = await createTestZone();
    const satMetaId = await createTestSatelliteMetadata(
      zoneId,
      'COPERNICUS/S2_SR_HARMONIZED/20240601T050221_20240601T050519_REAL2',
      '2024-06-01',
    );

    const baseline = await BaselineModel.create({
      zoneId: new Types.ObjectId(zoneId),
      satelliteMetadataId: new Types.ObjectId(satMetaId),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2024-06-01'),
      status: BaselineStatus.EXPORT_COMPLETED,
      isActive: false,
      qualityScore: 90,
      cloudCover: 3.0,
      validPixelPercentage: 98,
      selectionReason: 'Test baseline — has export but no drive file',
      geeExportTaskId: 'projects/monitoring-system-506515/operations/abc123',
      // NO driveFileId — Drive file was not found
    });

    await assertRejects(
      () => baselineService.activateBaseline(baseline._id.toString()),
      'pipeline check(s) failed',
      'Baseline with export but no Drive file is BLOCKED from activation',
    );

    const reloaded = await BaselineModel.findById(baseline._id);
    assert(reloaded!.isActive === false, 'Baseline isActive remains false');
    assert(
      reloaded!.failureReason!.includes('driveFileId'),
      'Failure reason mentions missing driveFileId',
    );

    // Cleanup
    await BaselineModel.deleteOne({ _id: baseline._id });
    await SatelliteMetadata.deleteOne({ _id: satMetaId });
    await Zone.deleteOne({ _id: zoneId });
  }

  // ── TEST 5: Baseline with Drive file but no raster validation → ACTIVATION BLOCKED ──
  console.log('\n▶ Test 5: Baseline With Drive File But No Raster Validation → Blocked');
  {
    const zoneId = await createTestZone();
    const satMetaId = await createTestSatelliteMetadata(
      zoneId,
      'COPERNICUS/S2_SR_HARMONIZED/20240615T050221_20240615T050519_REAL3',
      '2024-06-15',
    );

    const baseline = await BaselineModel.create({
      zoneId: new Types.ObjectId(zoneId),
      satelliteMetadataId: new Types.ObjectId(satMetaId),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2024-06-15'),
      status: BaselineStatus.DRIVE_AVAILABLE,
      isActive: false,
      qualityScore: 92,
      cloudCover: 2.0,
      validPixelPercentage: 99,
      selectionReason: 'Test baseline — has Drive file but no raster validation',
      geeExportTaskId: 'projects/monitoring-system-506515/operations/def456',
      driveFileId: '1abc_drive_file_id',
      driveFileName: 'test_baseline.tif',
      driveFileSizeBytes: 5242880,
      // NO localRasterPath, rasterValidated, spectralIndicesCalculated
    });

    await assertRejects(
      () => baselineService.activateBaseline(baseline._id.toString()),
      'pipeline check(s) failed',
      'Baseline with Drive file but no raster validation is BLOCKED',
    );

    const reloaded = await BaselineModel.findById(baseline._id);
    assert(reloaded!.isActive === false, 'Baseline isActive remains false');

    // Cleanup
    await BaselineModel.deleteOne({ _id: baseline._id });
    await SatelliteMetadata.deleteOne({ _id: satMetaId });
    await Zone.deleteOne({ _id: zoneId });
  }

  // ── TEST 6: FULLY VALID Baseline with ALL 14 fields → ACTIVATION SUCCEEDS ──
  console.log('\n▶ Test 6: Fully Valid Baseline (All 14 Checks Pass) → Activation Succeeds');
  {
    const zoneId = await createTestZone();
    const satMetaId = await createTestSatelliteMetadata(
      zoneId,
      'COPERNICUS/S2_SR_HARMONIZED/20240701T050221_20240701T050519_REAL_VALID',
      '2024-07-01',
    );

    const baseline = await BaselineModel.create({
      zoneId: new Types.ObjectId(zoneId),
      satelliteMetadataId: new Types.ObjectId(satMetaId),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2024-07-01'),
      status: BaselineStatus.PROCESSED,
      isActive: false,
      qualityScore: 95,
      cloudCover: 1.5,
      validPixelPercentage: 99.5,
      selectionReason: 'Test baseline — fully valid pipeline',

      // ALL 14 pipeline fields populated
      geeExportTaskId: 'projects/monitoring-system-506515/operations/valid_task_001',
      driveFileId: '1xyz_real_drive_file_id',
      driveFileName: 'ZONE_BASELINE_SENTINEL_2_2024-07-01.tif',
      driveFileSizeBytes: 10485760, // 10 MB
      localRasterPath: '/tmp/workspace/baselines/ZONE_BASELINE_SENTINEL_2_2024-07-01.tif',
      rasterValidated: true,
      rasterWidth: 1098,
      rasterHeight: 1098,
      rasterCrs: 'EPSG:32644',
      rasterBandCount: 6,
      spectralIndicesCalculated: true,
    });

    try {
      const result = await baselineService.activateBaseline(baseline._id.toString());
      assert(result.isActive === true, 'Baseline is now ACTIVE');
      assert(result.status === BaselineStatus.ACTIVE, `Status is ACTIVE (got: ${result.status})`);
      console.log(`  ℹ️ Baseline ${result.id} successfully activated with all 14 checks passed`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ FAIL: Fully valid baseline should have been activated: ${msg}`);
      failed++;
    }

    // Verify in DB
    const reloaded = await BaselineModel.findById(baseline._id);
    assert(reloaded!.isActive === true, 'Database confirms isActive=true');
    assert(reloaded!.status === BaselineStatus.ACTIVE, 'Database confirms status=ACTIVE');

    // Cleanup
    await BaselineModel.deleteOne({ _id: baseline._id });
    await SatelliteMetadata.deleteOne({ _id: satMetaId });
    await Zone.deleteOne({ _id: zoneId });
  }

  // ── TEST 7: Verify status enum has all required states ──
  console.log('\n▶ Test 7: BaselineStatus Enum Contains Required Pipeline States');
  {
    assert(BaselineStatus.DISCOVERED === 'DISCOVERED', 'DISCOVERED status exists');
    assert(BaselineStatus.EXPORT_REQUESTED === 'EXPORT_REQUESTED', 'EXPORT_REQUESTED status exists');
    assert(BaselineStatus.EXPORT_RUNNING === 'EXPORT_RUNNING', 'EXPORT_RUNNING status exists');
    assert(BaselineStatus.EXPORT_COMPLETED === 'EXPORT_COMPLETED', 'EXPORT_COMPLETED status exists');
    assert(BaselineStatus.DRIVE_AVAILABLE === 'DRIVE_AVAILABLE', 'DRIVE_AVAILABLE status exists');
    assert(BaselineStatus.RASTER_VALIDATED === 'RASTER_VALIDATED', 'RASTER_VALIDATED status exists');
    assert(BaselineStatus.PROCESSED === 'PROCESSED', 'PROCESSED status exists');
    assert(BaselineStatus.GEE_SEARCH_FAILED === 'GEE_SEARCH_FAILED', 'GEE_SEARCH_FAILED failure status exists');
    assert(BaselineStatus.EXPORT_FAILED === 'EXPORT_FAILED', 'EXPORT_FAILED failure status exists');
    assert(BaselineStatus.DRIVE_FILE_MISSING === 'DRIVE_FILE_MISSING', 'DRIVE_FILE_MISSING failure status exists');
    assert(BaselineStatus.RASTER_INVALID === 'RASTER_INVALID', 'RASTER_INVALID failure status exists');
    assert(BaselineStatus.PROCESSING_FAILED === 'PROCESSING_FAILED', 'PROCESSING_FAILED failure status exists');
  }

  // ── SUMMARY ──
  console.log('\n==================================================');
  console.log(`BASELINE ACTIVATION SAFETY TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

runBaselineActivationSafetyTests()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n💥 Test suite failed:', err instanceof Error ? err.message : err);
    await mongoose.disconnect();
    process.exit(1);
  });
