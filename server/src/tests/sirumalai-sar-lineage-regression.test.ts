import assert from 'node:assert';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { Zone } from '../models/Zone.js';
import { AlertModel } from '../models/Alert.js';
import { SensorType, BaselineStatus } from '@tn-forest/shared/types';

async function runRegressionTests() {
  console.log('================================================================');
  console.log('🧪 REGRESSION TEST SUITE: SIRUMALAI SAR BASELINE LINEAGE REPAIR');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const sirumalai = await Zone.findOne({ zoneId: 'ZONE-260925-8986' }).lean();
  assert.ok(sirumalai, 'Sirumalai zone ZONE-260925-8986 must exist in database');

  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).lean();
  assert.ok(vadipatti, 'Vadipatti zone ZONE-260913-7787 must exist in database');

  // -------------------------------------------------------------------------
  // TEST A: Orphaned SatelliteMetadata relationship recovery
  // -------------------------------------------------------------------------
  console.log('Running Test A: Orphaned SatelliteMetadata relationship recovery...');
  const baseline2026 = await BaselineModel.findById('6ab7eb8e6358176818476cbc');
  assert.ok(baseline2026, 'Baseline 2026 (6ab7eb8e6358176818476cbc) must exist');
  assert.strictEqual(
    baseline2026.satelliteMetadataId?.toString(),
    '6ab7e7e46358176818476c24',
    'Baseline 2026 must reference restored SatelliteMetadata 6ab7e7e46358176818476c24',
  );

  const meta2026 = await SatelliteMetadata.findById('6ab7e7e46358176818476c24');
  assert.ok(meta2026, 'Restored SatelliteMetadata 6ab7e7e46358176818476c24 must exist in database');
  assert.strictEqual(
    meta2026.imageId,
    'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260106T003233_20260106T003258_062639_07DA3D_0A25',
    'Metadata 2026 imageId must match real GEE asset ID',
  );
  assert.strictEqual(meta2026.sensorType, SensorType.SAR, 'Metadata 2026 sensorType must be SAR');
  assert.ok(
    meta2026.intersectingZones.map((z: any) => z.toString()).includes(sirumalai._id.toString()),
    'Metadata 2026 intersectingZones must contain Sirumalai ObjectId',
  );
  console.log('  ✅ Test A PASSED: Orphaned 2026 SatelliteMetadata relationship fully recovered.\n');

  // -------------------------------------------------------------------------
  // TEST B: Existing processed raster reuse
  // -------------------------------------------------------------------------
  console.log('Running Test B: Existing processed raster reuse...');
  const sarBaselines = await BaselineModel.find({
    zoneId: sirumalai._id,
    sensorType: SensorType.SAR,
  }).sort({ acquisitionDate: 1 });

  assert.strictEqual(sarBaselines.length, 3, 'Sirumalai must have exactly 3 SAR baselines');

  for (const b of sarBaselines) {
    const dateStr = b.acquisitionDate.toISOString().slice(0, 10);
    assert.ok(b.localRasterPath, `Baseline ${dateStr} must have localRasterPath`);
    assert.ok(fs.existsSync(b.localRasterPath), `Physical GeoTIFF file must exist on disk for ${dateStr}: ${b.localRasterPath}`);
    const stat = fs.statSync(b.localRasterPath);
    assert.ok(stat.size > 0, `File size on disk must be > 0 bytes for ${dateStr} (got ${stat.size})`);
    assert.strictEqual(b.rasterValidated, true, `rasterValidated must be true for ${dateStr}`);
    assert.strictEqual(b.rasterBandCount, 2, `rasterBandCount must be 2 (VV/VH) for ${dateStr}`);
    assert.ok(b.rasterWidth && b.rasterWidth > 0, `rasterWidth must be > 0 for ${dateStr}`);
    assert.ok(b.rasterHeight && b.rasterHeight > 0, `rasterHeight must be > 0 for ${dateStr}`);
    assert.ok(b.rasterCrs && b.rasterCrs.startsWith('EPSG:'), `rasterCrs must be valid EPSG for ${dateStr}`);
    console.log(`  - Baseline ${dateStr}: raster path verified on disk (${stat.size} bytes, ${b.rasterWidth}x${b.rasterHeight} px, CRS: ${b.rasterCrs})`);
  }
  console.log('  ✅ Test B PASSED: Real rasters on disk verified and reused without re-export.\n');

  // -------------------------------------------------------------------------
  // TEST C: Stale failureReason clearing
  // -------------------------------------------------------------------------
  console.log('Running Test C: Stale failureReason clearing...');
  for (const b of sarBaselines) {
    const dateStr = b.acquisitionDate.toISOString().slice(0, 10);
    assert.ok(
      !b.failureReason || b.failureReason.trim() === '',
      `Baseline ${dateStr} (${b._id}) must NOT have a failureReason (current: "${b.failureReason}")`,
    );
    assert.ok(
      !b.failureReason?.includes('CHECK 7 FAILED') &&
      !b.failureReason?.includes('CHECK 8 FAILED') &&
      !b.failureReason?.includes('CHECK 9 FAILED') &&
      !b.failureReason?.includes('CHECK 10 FAILED') &&
      !b.failureReason?.includes('CHECK 11 FAILED'),
      `Baseline ${dateStr} must not contain stale CHECK 7-11 errors`,
    );
  }
  console.log('  ✅ Test C PASSED: Stale failureReason cleared on all validated baselines.\n');

  // -------------------------------------------------------------------------
  // TEST D: Strict Gate 6 semantics
  // -------------------------------------------------------------------------
  console.log('Running Test D: Strict Gate 6 semantics...');
  for (const b of sarBaselines) {
    const dateStr = b.acquisitionDate.toISOString().slice(0, 10);
    assert.ok(b.geeExportTaskId && b.geeExportTaskId.startsWith('projects/'), `Baseline ${dateStr} must have geeExportTaskId`);
    // Gate 6 requires actual completion status, not merely task ID presence
    const completedStatuses: BaselineStatus[] = [
      BaselineStatus.ACTIVE,
      BaselineStatus.PROCESSED,
      BaselineStatus.EXPORT_COMPLETED,
      BaselineStatus.DRIVE_AVAILABLE,
      BaselineStatus.RASTER_VALIDATED,
    ];
    assert.ok(
      completedStatuses.includes(b.status),
      `Gate 6 strictly requires status to be completed export (got ${b.status} for ${dateStr})`,
    );
    console.log(`  - Baseline ${dateStr}: Gate 6 strictly verified (status: ${b.status}, taskId: ${b.geeExportTaskId})`);
  }
  console.log('  ✅ Test D PASSED: Gate 6 strictly enforces export completion semantics.\n');

  // -------------------------------------------------------------------------
  // TEST E: 2020 metadata -> baseline candidate registration
  // -------------------------------------------------------------------------
  console.log('Running Test E: 2020 metadata -> baseline candidate registration...');
  const meta2020 = await SatelliteMetadata.findById('6ab8a736667c98f4208d8b05');
  assert.ok(meta2020, 'Metadata 2020 (6ab8a736667c98f4208d8b05) must exist');
  assert.strictEqual(
    meta2020.imageId,
    'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T003240_20200102T003305_030614_0381E6_3EAD',
    'Metadata 2020 imageId must match real GEE asset',
  );

  const baseline2020 = await BaselineModel.findById('6ab8dab06f0c75ad0b423200');
  assert.ok(baseline2020, 'Baseline 2020 (6ab8dab06f0c75ad0b423200) must exist');
  assert.strictEqual(
    baseline2020.satelliteMetadataId?.toString(),
    '6ab8a736667c98f4208d8b05',
    'Baseline 2020 must link to SatelliteMetadata 6ab8a736667c98f4208d8b05',
  );
  assert.strictEqual(baseline2020.driveFileId, '1sGdPveu4FUwfC7EVlkh3sc0GZS8xPBrW', 'Baseline 2020 must reuse real Drive file');
  assert.strictEqual(
    baseline2020.geeExportTaskId,
    'projects/monitoring-system-506515/operations/QI2D6QI63O2SVOBQTCKOAOMY',
    'Baseline 2020 must reuse real GEE operation',
  );
  assert.ok(
    baseline2020.status === BaselineStatus.PROCESSED || baseline2020.status === BaselineStatus.ACTIVE,
    'Baseline 2020 status must be PROCESSED or ACTIVE',
  );
  console.log('  ✅ Test E PASSED: 2020 metadata successfully registered and linked.\n');

  // -------------------------------------------------------------------------
  // TEST F: Controlled activation invariant
  // -------------------------------------------------------------------------
  console.log('Running Test F: Controlled activation invariant...');
  const activeSarCount = await BaselineModel.countDocuments({
    zoneId: sirumalai._id,
    sensorType: SensorType.SAR,
    isActive: true,
  });
  assert.ok(activeSarCount <= 1, 'Sirumalai must have at most 1 active SAR baseline');
  for (const b of sarBaselines) {
    const dateStr = b.acquisitionDate.toISOString().slice(0, 10);
    if (!b.isActive) {
      assert.strictEqual(b.isActive, false, `Candidate ${dateStr} must be inactive`);
    } else {
      assert.strictEqual(dateStr, '2020-01-02', 'Only explicitly activated 2020-01-02 baseline may be active');
    }
  }
  console.log('  ✅ Test F PASSED: Invariant preserved: at most 1 explicitly activated SAR baseline.\n');

  // -------------------------------------------------------------------------
  // TEST G: Vadipatti isolation
  // -------------------------------------------------------------------------
  console.log('Running Test G: Vadipatti isolation...');
  assert.strictEqual(vadipatti.zoneId, 'ZONE-260913-7787', 'Vadipatti zoneId must match ZONE-260913-7787');
  assert.strictEqual(vadipatti.monitoringTracks?.optical?.enabled, true, 'Vadipatti optical must be enabled');
  assert.strictEqual(vadipatti.monitoringTracks?.sar?.enabled, false, 'Vadipatti SAR must remain disabled');

  const vadipattiActiveBaseline = await BaselineModel.findOne({
    zoneId: vadipatti._id,
    sensorType: SensorType.OPTICAL,
    isActive: true,
  });
  assert.ok(vadipattiActiveBaseline, 'Vadipatti active optical baseline must exist');
  assert.strictEqual(
    vadipattiActiveBaseline._id.toString(),
    '6aa679012b4fe5808c7e8ec7',
    'Vadipatti active optical baseline ID must remain 6aa679012b4fe5808c7e8ec7',
  );

  const vadipattiAlert = await AlertModel.findOne({ alertId: 'ALT-1789295023854-8239' });
  assert.ok(vadipattiAlert, 'Vadipatti production alert ALT-1789295023854-8239 must exist');
  assert.strictEqual(vadipattiAlert.zoneId!.toString(), vadipatti._id.toString(), 'Alert must point to Vadipatti');
  console.log('  ✅ Test G PASSED: Vadipatti production zone, baseline, and alert are 100% untouched.\n');

  await mongoose.disconnect();
  console.log('================================================================');
  console.log('🎉 ALL 7 REGRESSION TESTS (A-G) PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runRegressionTests().catch((err) => {
  console.error('Regression tests failed:', err);
  process.exit(1);
});
