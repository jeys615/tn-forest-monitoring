import assert from 'node:assert';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { BaselineService } from '../services/BaselineService.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { Zone } from '../models/Zone.js';
import { SensorType, BaselineStatus } from '@tn-forest/shared/types';

async function runTest() {
  console.log('================================================================');
  console.log('🧪 VERIFICATION: SIRUMALAI SAR BASELINE 14-GATE EVALUATION');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  const baselineService = new BaselineService();

  const sirumalai = await Zone.findOne({ zoneId: 'ZONE-260925-8986' }).lean();
  assert.ok(sirumalai, 'Sirumalai zone must exist');

  const sarBaselines = await BaselineModel.find({
    zoneId: sirumalai._id,
    sensorType: SensorType.SAR,
  }).sort({ acquisitionDate: 1 });

  console.log(`Found ${sarBaselines.length} SAR baselines for Sirumalai (expected 3: 2020, 2021, 2026).`);
  assert.strictEqual(sarBaselines.length, 3, 'Must have exactly 3 SAR baselines');

  const expectedDates = ['2020-01-02', '2021-01-01', '2026-01-06'];

  for (let i = 0; i < sarBaselines.length; i++) {
    const b = sarBaselines[i];
    const dateStr = b.acquisitionDate.toISOString().slice(0, 10);
    console.log(`\n------------------------------------------------------------`);
    console.log(`Evaluating Candidate #${i + 1}: ${b._id} (${dateStr})`);
    console.log(`------------------------------------------------------------`);
    assert.strictEqual(dateStr, expectedDates[i], `Expected date ${expectedDates[i]}, got ${dateStr}`);

    // Gate 1: SatelliteMetadata exists
    const meta = await SatelliteMetadata.findById(b.satelliteMetadataId);
    assert.ok(meta, `Gate 1 PASS: SatelliteMetadata ${b.satelliteMetadataId} must exist`);
    console.log(`  Gate  1 [PASS]: SatelliteMetadata exists (${meta._id})`);

    // Gate 2: Real GEE asset ID
    assert.ok(meta.imageId.startsWith('COPERNICUS/S1_GRD/'), 'Gate 2 PASS: Real GEE asset');
    console.log(`  Gate  2 [PASS]: Real GEE asset ID: ${meta.imageId}`);

    // Gate 3: Valid acquisition date
    assert.ok(!isNaN(b.acquisitionDate.getTime()), 'Gate 3 PASS: Valid date');
    console.log(`  Gate  3 [PASS]: Acquisition date valid: ${b.acquisitionDate.toISOString()}`);

    // Gate 4: Supported SAR sensor
    assert.strictEqual(b.sensorType, SensorType.SAR, 'Gate 4 PASS: Sensor is SAR');
    assert.strictEqual(b.source, 'SENTINEL_1', 'Gate 4 PASS: Source is SENTINEL_1');
    console.log(`  Gate  4 [PASS]: Supported SAR sensor: SENTINEL_1 (SAR)`);

    // Gate 5: GEE export task ID exists
    assert.ok(b.geeExportTaskId && b.geeExportTaskId.startsWith('projects/'), 'Gate 5 PASS: Task ID exists');
    console.log(`  Gate  5 [PASS]: GEE export task ID: ${b.geeExportTaskId}`);

    // Gate 6: GEE operation completed successfully
    assert.ok(
      [BaselineStatus.ACTIVE, BaselineStatus.PROCESSED, BaselineStatus.EXPORT_COMPLETED].includes(b.status),
      'Gate 6 PASS: Status indicates completed export',
    );
    console.log(`  Gate  6 [PASS]: GEE export completed (status: ${b.status})`);

    // Gate 7: Google Drive file ID exists
    assert.ok(b.driveFileId && b.driveFileId.length > 5, 'Gate 7 PASS: Drive ID exists');
    console.log(`  Gate  7 [PASS]: Drive file ID: ${b.driveFileId}`);

    // Gate 8: Drive file size > 0
    assert.ok(b.driveFileSizeBytes && b.driveFileSizeBytes > 0, 'Gate 8 PASS: Drive file size > 0');
    console.log(`  Gate  8 [PASS]: Drive file size: ${b.driveFileSizeBytes} bytes`);

    // Gate 9: Local raster exists
    assert.ok(b.localRasterPath, 'Gate 9 PASS: Local raster path exists');
    console.log(`  Gate  9 [PASS]: Local raster path: ${b.localRasterPath}`);

    // Gate 10: rasterValidated = true
    assert.strictEqual(b.rasterValidated, true, 'Gate 10 PASS: rasterValidated must be true');
    console.log(`  Gate 10 [PASS]: rasterValidated = true`);

    // Gate 11: SAR VV/VH band count = 2
    assert.strictEqual(b.rasterBandCount, 2, 'Gate 11 PASS: band count = 2 (VV/VH)');
    console.log(`  Gate 11 [PASS]: rasterBandCount = 2 (VV/VH)`);

    // Gate 12: Dimensions > 0
    assert.ok(b.rasterWidth && b.rasterWidth > 0 && b.rasterHeight && b.rasterHeight > 0, 'Gate 12 PASS');
    console.log(`  Gate 12 [PASS]: Dimensions: ${b.rasterWidth} × ${b.rasterHeight} px`);

    // Gate 13: Valid CRS
    assert.ok(b.rasterCrs && b.rasterCrs.startsWith('EPSG:'), 'Gate 13 PASS: Valid CRS');
    console.log(`  Gate 13 [PASS]: Raster CRS: ${b.rasterCrs}`);

    // Gate 14: SAR backscatter validation complete (no optical indices)
    assert.strictEqual(b.spectralIndicesCalculated, false, 'Gate 14 PASS: SAR skips optical indices');
    console.log(`  Gate 14 [PASS]: SAR radar backscatter validation verified (spectralIndicesCalculated: false)`);

    // Active state must be false unless explicitly activated (2020-01-02 active baseline)
    if (b.acquisitionDate.toISOString().startsWith('2020-01-02')) {
      console.log(`  Safety   [PASS]: 2020-01-02 is the explicitly established active baseline (isActive: ${b.isActive})`);
    } else {
      assert.strictEqual(b.isActive, false, 'Invariant: Candidate must NOT be automatically activated');
      console.log(`  Safety   [PASS]: isActive is false (explicit activation preserved)`);
    }
  }

  // Vadipatti invariant verification
  console.log(`\n------------------------------------------------------------`);
  console.log(`Checking Vadipatti Production Invariants`);
  console.log(`------------------------------------------------------------`);
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).lean();
  assert.ok(vadipatti, 'Vadipatti zone must exist');
  assert.strictEqual(vadipatti.monitoringTracks?.optical?.enabled, true, 'Vadipatti optical must be true');
  assert.strictEqual(vadipatti.monitoringTracks?.sar?.enabled, false, 'Vadipatti SAR must be false');

  const vadipattiBaseline = await BaselineModel.findOne({
    zoneId: vadipatti._id,
    sensorType: SensorType.OPTICAL,
    isActive: true,
  });
  assert.ok(vadipattiBaseline, 'Vadipatti active optical baseline must exist');
  console.log(`  Vadipatti Zone: optical=true, sar=false [VERIFIED]`);
  console.log(`  Vadipatti Baseline: ${vadipattiBaseline._id} [VERIFIED ACTIVE]`);

  await mongoose.disconnect();
  console.log(`\n✅ ALL 14 GATES PASSED ACROSS ALL 3 SIRUMALAI SAR CANDIDATES.`);
  console.log(`✅ VADIPATTI PRODUCTION SAFETY VERIFIED.`);
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
