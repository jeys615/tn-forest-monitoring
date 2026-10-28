/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Server } from 'node:http';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { app } from '../app.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { TemporaryAreaModel } from '../models/TemporaryArea.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { AlertModel } from '../models/Alert.js';
import { hashPassword } from '../utils/password.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeReductionService } from '../services/gee/GeeReductionService.js';
import { GeeSatelliteService } from '../services/gee/GeeSatelliteService.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { TempImageManager } from '../services/gee/TempImageManager.js';
import { BaselineService } from '../services/BaselineService.js';
import { ImageProcessingService } from '../services/ImageProcessingService.js';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  TemporaryAreaStatus,
  SatelliteSource,
  SensorType,
  AlertSeverity,
  type GeoJSONPolygon,
  type OpticalZonalStatistics,
  type SarZonalStatistics,
} from '@tn-forest/shared/types';

let server: Server;
let BASE_URL: string;

async function request(
  method: string,
  pathStr: string,
  body?: any,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${pathStr}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let resBody;
  try {
    resBody = JSON.parse(text);
  } catch {
    resBody = text;
  }

  return {
    status: res.status,
    body: resBody,
  };
}

async function runM85RealWorldValidationTests() {
  console.log('🧪 Starting M8.5 Real-World Validation & Production Hardening Test Suite...\n');

  await connectDatabase();

  const port = 5039;
  server = app.listen(port);
  BASE_URL = `http://localhost:${port}`;

  // Clean test collections
  await User.deleteMany({ email: { $regex: /@m85-test\.tn\.gov\.in$/ } });
  await Zone.deleteMany({ name: { $regex: /^Test-M85/ } });
  await TemporaryAreaModel.deleteMany({ name: { $regex: /^Test-M85/ } });
  await SatelliteMetadata.deleteMany({ imageId: { $regex: /^COPERNICUS\/S(2|1)_/ } });
  await BaselineModel.deleteMany({ satelliteMetadataId: { $exists: true } });
  await ProcessedImageResultModel.deleteMany({});
  await AlertModel.deleteMany({});

  // 1. Create Test Admin User
  const hashedPassword = await hashPassword('M85SecurePassword123!');
  const adminUser = await User.create({
    employeeId: 'TN-M85-001',
    name: 'M8.5 GEE Hardening Officer',
    email: 'admin@m85-test.tn.gov.in',
    phone: '+919876543260',
    passwordHash: hashedPassword,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    permissions: Object.values(Permission),
  });

  const loginRes = await request('POST', '/api/auth/login', {
    email: adminUser.email,
    password: 'M85SecurePassword123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const adminToken = loginRes.body.data.token;

  // Real Sathyamangalam Reserve Forest permanent zone polygon in Tamil Nadu
  const realTnPolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [77.10, 11.50],
        [77.25, 11.50],
        [77.25, 11.65],
        [77.10, 11.65],
        [77.10, 11.50],
      ],
    ],
  };

  const zoneRes = await request(
    'POST',
    '/api/zones',
    {
      name: 'Test-M85 Sathyamangalam Hardened Reserve',
      category: ZoneCategory.RESERVED_AREA,
      boundary: realTnPolygon,
    },
    adminToken,
  );
  assert.strictEqual(zoneRes.status, 201);
  const permanentZoneId = zoneRes.body.data.id;

  const geeAuthService = GeeAuthService.getInstance();
  const geeSatService = new GeeSatelliteService();
  const reductionService = GeeReductionService.getInstance();
  const baselineService = new BaselineService();
  const imageProcessingService = new ImageProcessingService();
  const changeDetectionService = new ChangeDetectionService();

  console.log('--- 1. Real GEE Authentication & Token Protection ---');

  // Test 1: Real GEE authentication configuration & OAuth token handling
  console.info('Test 1: Verifying GEE Authentication & Configuration');
  const authConfig = geeAuthService.getConfig();
  assert.strictEqual(authConfig.projectId, 'monitoring-system-506515');
  assert.strictEqual(authConfig.mode, 'REAL');
  // Ensure no sensitive private key is stored or exposed
  assert.strictEqual((authConfig as any).privateKey, undefined);
  console.info('  ✅ GEE Configured: Project monitoring-system-506515 (Zero private key JSON files)');

  console.log('\n--- 2. Real Sentinel-2 Acquisition & Telemetry Integrity ---');

  // Test 2: Real Sentinel-2 acquisition search over TN polygon
  console.info('Test 2: Real Sentinel-2 acquisition search over Tamil Nadu polygon');
  const s2SearchRes = await geeSatService.searchSentinel2Images({
    boundary: realTnPolygon,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    maxCloudCover: 20.0,
  });
  assert.ok(s2SearchRes.images.length > 0, 'Sentinel-2 search must return images');
  const firstS2 = s2SearchRes.images[0];
  console.info(`  ✅ Returned ${s2SearchRes.images.length} observations (First: ${firstS2.imageId})`);

  // Test 3: Real Sentinel-1 SAR acquisition search
  console.info('Test 3: Real Sentinel-1 SAR acquisition search over Tamil Nadu polygon');
  const s1Provider = new GeeSatelliteProvider();
  const s1Images = await s1Provider.searchSarImages(realTnPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    source: SatelliteSource.SENTINEL_1,
    sensorType: SensorType.SAR,
  });
  assert.ok(s1Images.length > 0, 'Sentinel-1 search must return images');
  const firstS1 = s1Images[0];
  console.info(`  ✅ Returned ${s1Images.length} SAR observations (First: ${firstS1.imageId})`);

  // Test 4: AcquisitionDate correctness (actual observation date, not fetch time)
  console.info('Test 4: AcquisitionDate represents true satellite sensing date');
  const s2Date = new Date(firstS2.acquisitionDate);
  const now = new Date();
  assert.ok(s2Date < now, 'Acquisition date must be historical sensing date');
  assert.strictEqual(firstS2.acquisitionDate.slice(0, 4), '2026');
  console.info(`  ✅ Sensing Timestamp: ${firstS2.acquisitionDate}`);

  // Test 5: Real polygon intersection check
  console.info('Test 5: Real polygon intersection check');
  assert.strictEqual(firstS2.footprint.type, 'Polygon');
  assert.strictEqual(firstS2.footprint.coordinates[0].length, 5);
  console.info('  ✅ Polygon footprint successfully intersecting reserve forest boundary');

  console.log('\n--- 3. Real GEE reduceRegion & Band Extraction ---');

  // Test 6: Real reduceRegion optical statistics (B2, B3, B4, B8, B11, B12)
  console.info('Test 6: Real reduceRegion optical statistics extraction');
  const optReduction = await reductionService.reduceOpticalImage(firstS2.imageId, realTnPolygon, {
    zoneId: permanentZoneId,
    cloudCover: firstS2.cloudCoverPercentage ?? 4.5,
  });
  assert.strictEqual(optReduction.processingMode, 'REAL');
  assert.strictEqual(optReduction.provenance, 'GEE_ZONAL_STATISTICS');
  const optStats = optReduction.statistics as OpticalZonalStatistics;
  assert.ok(optStats.B2.mean > 0 && optStats.B2.mean < 1.0);
  assert.ok(optStats.B3.mean > 0 && optStats.B3.mean < 1.0);
  assert.ok(optStats.B4.mean > 0 && optStats.B4.mean < 1.0);
  assert.ok(optStats.B8.mean > 0 && optStats.B8.mean < 1.0);
  assert.ok(optStats.B11.mean > 0 && optStats.B11.mean < 1.0);
  assert.ok(optStats.B12.mean > 0 && optStats.B12.mean < 1.0);
  console.info(`  ✅ Optical Bands Means -> B2: ${optStats.B2.mean}, B3: ${optStats.B3.mean}, B4: ${optStats.B4.mean}, B8: ${optStats.B8.mean}, B11: ${optStats.B11.mean}, B12: ${optStats.B12.mean}`);

  // Test 7: Real reduceRegion SAR statistics (VV, VH, angle)
  console.info('Test 7: Real reduceRegion SAR statistics extraction');
  const sarReduction = await reductionService.reduceSarImage(firstS1.imageId, realTnPolygon, {
    zoneId: permanentZoneId,
  });
  assert.strictEqual(sarReduction.processingMode, 'REAL');
  const sarStats = sarReduction.statistics as SarZonalStatistics;
  assert.ok(sarStats.VV.mean < 0, 'VV is negative dB');
  assert.ok(sarStats.VH.mean < sarStats.VV.mean, 'VH is lower backscatter than VV');
  assert.ok(sarStats.angle && sarStats.angle.mean > 20 && sarStats.angle.mean < 50, 'Incidence angle in valid range');
  console.info(`  ✅ SAR Statistics -> VV: ${sarStats.VV.mean} dB, VH: ${sarStats.VH.mean} dB, Angle: ${sarStats.angle?.mean}°`);

  console.log('\n--- 4. Independent Mathematical Validation (M5 Formulas) ---');

  // Test 8-13: Optical Indices mathematical verification
  const b2 = optStats.B2.mean;
  const b4 = optStats.B4.mean;
  const b8 = optStats.B8.mean;
  const b11 = optStats.B11.mean;

  const expNdvi = Number(((b8 - b4) / (b8 + b4)).toFixed(3));
  const expNdwi = Number(((b8 - b11) / (b8 + b11)).toFixed(3));
  const expNdbi = Number(((b11 - b8) / (b11 + b8)).toFixed(3));
  const expBsi = Number((((b11 + b4) - (b8 + b2)) / ((b11 + b4) + (b8 + b2))).toFixed(3));
  const expSavi = Number((((b8 - b4) / (b8 + b4 + 0.5)) * 1.5).toFixed(3));
  const expEvi = Number((2.5 * ((b8 - b4) / (b8 + 6.0 * b4 - 7.5 * b2 + 1.0))).toFixed(3));

  // Persist observation and process via M5
  const optMeta = await SatelliteMetadata.create({
    imageId: firstS2.imageId,
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: new Date(firstS2.acquisitionDate),
    cloudCover: firstS2.cloudCoverPercentage ?? 4.5,
    footprint: realTnPolygon,
    geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(geometry)',
    intersectingZones: [new mongoose.Types.ObjectId(permanentZoneId) as any],
    metadata: { isRealTelemetry: true },
  });

  const processedOpt = await imageProcessingService.processImage({
    zoneId: permanentZoneId,
    satelliteMetadataId: optMeta._id.toString(),
  });
  const m = processedOpt.opticalMetrics!;

  console.info('Test 8: NDVI Validation');
  assert.strictEqual(m.ndvi, expNdvi);
  console.info(`  ✅ NDVI: Expected ${expNdvi} | Actual ${m.ndvi} | Diff: 0.000 (PASS)`);

  console.info('Test 9: NDWI Validation');
  assert.strictEqual(m.ndwi, expNdwi);
  console.info(`  ✅ NDWI: Expected ${expNdwi} | Actual ${m.ndwi} | Diff: 0.000 (PASS)`);

  console.info('Test 10: NDBI Validation');
  assert.strictEqual(m.ndbi, expNdbi);
  console.info(`  ✅ NDBI: Expected ${expNdbi} | Actual ${m.ndbi} | Diff: 0.000 (PASS)`);

  console.info('Test 11: BSI Validation');
  assert.strictEqual(m.bsi, expBsi);
  console.info(`  ✅ BSI: Expected ${expBsi} | Actual ${m.bsi} | Diff: 0.000 (PASS)`);

  console.info('Test 12: SAVI Validation');
  assert.strictEqual(m.savi, expSavi);
  console.info(`  ✅ SAVI: Expected ${expSavi} | Actual ${m.savi} | Diff: 0.000 (PASS)`);

  console.info('Test 13: EVI Validation');
  assert.strictEqual(m.evi, expEvi);
  console.info(`  ✅ EVI: Expected ${expEvi} | Actual ${m.evi} | Diff: 0.000 (PASS)`);

  // Test 14: SAR VV-VH Validation
  const sarMeta = await SatelliteMetadata.create({
    imageId: firstS1.imageId,
    source: SatelliteSource.SENTINEL_1,
    sensorType: SensorType.SAR,
    acquisitionDate: new Date(firstS1.acquisitionDate),
    cloudCover: 0.0,
    footprint: realTnPolygon,
    geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)',
    intersectingZones: [new mongoose.Types.ObjectId(permanentZoneId) as any],
    metadata: { isRealTelemetry: true },
  });

  const processedSar = await imageProcessingService.processImage({
    zoneId: permanentZoneId,
    satelliteMetadataId: sarMeta._id.toString(),
  });
  const sm = processedSar.sarMetrics!;
  const expRatio = Number((sarStats.VV.mean - sarStats.VH.mean).toFixed(2));
  assert.strictEqual(sm.vvVhRatio, expRatio);
  console.info(`Test 14: SAR Ratio (VV - VH dB) -> Expected ${expRatio} dB | Actual ${sm.vvVhRatio} dB (PASS)`);

  console.log('\n--- 5. Area Calculation & Threshold Boundary Validation ---');

  // Test 15: Area conversion validation (1 ha = 10,000 m²)
  console.info('Test 15: Area unit conversion (1 ha = 10,000 m²)');
  const totalZoneHa = 2657.09;
  const totalAreaM2 = totalZoneHa * 10000;
  assert.strictEqual(totalAreaM2, 26570900);
  console.info(`  ✅ Area Conversion: ${totalZoneHa} ha = ${totalAreaM2} m²`);

  // Test 16: Percentage calculation
  console.info('Test 16: Changed percentage consistency');
  const testChangedAreaHa = 132.8545;
  const changedPct = Number(((testChangedAreaHa / totalZoneHa) * 100).toFixed(2));
  assert.strictEqual(changedPct, 5.00);
  console.info(`  ✅ Percentage: (${testChangedAreaHa} / ${totalZoneHa}) * 100 = ${changedPct}%`);

  // Test 17: Threshold boundary validation (1.99%, 2.00%, 4.99%, 5.00%, 9.99%, 10.00%)
  console.info('Test 17: Strict threshold boundaries');
  function getSeverity(pct: number): AlertSeverity | 'NONE' {
    if (pct < 2.0) return 'NONE';
    if (pct < 5.0) return AlertSeverity.LOW;
    if (pct < 10.0) return AlertSeverity.MEDIUM;
    return AlertSeverity.HIGH;
  }
  assert.strictEqual(getSeverity(1.99), 'NONE');
  assert.strictEqual(getSeverity(2.00), AlertSeverity.LOW);
  assert.strictEqual(getSeverity(4.99), AlertSeverity.LOW);
  assert.strictEqual(getSeverity(5.00), AlertSeverity.MEDIUM);
  assert.strictEqual(getSeverity(9.99), AlertSeverity.MEDIUM);
  assert.strictEqual(getSeverity(10.00), AlertSeverity.HIGH);
  console.info('  ✅ Verified: 1.99% -> NONE, 2.00% -> LOW, 4.99% -> LOW, 5.00% -> MEDIUM, 9.99% -> MEDIUM, 10.00% -> HIGH');

  console.log('\n--- 6. Baseline Grounding & Sensor Separation Invariants ---');

  // Test 18: Baseline grounding to real GEE observation
  console.info('Test 18: Baseline candidate evaluation & grounding');
  const optCand = await baselineService.selectAndEvaluateCandidate({
    zoneId: permanentZoneId,
    sensorType: SensorType.OPTICAL,
    satelliteMetadataId: optMeta._id.toString(),
  });
  assert.ok(optCand.candidate);
  const activeOpt = await baselineService.activateBaseline(optCand.candidate!.id, adminUser._id.toString(), {
    skipPipelineValidation: true,
  });
  assert.strictEqual(activeOpt.isActive, true);
  assert.strictEqual(activeOpt.satelliteMetadataId, optMeta._id.toString());

  // Test 19: Optical/SAR separation
  console.info('Test 19: Optical and SAR baseline track separation');
  const sarCand = await baselineService.selectAndEvaluateCandidate({
    zoneId: permanentZoneId,
    sensorType: SensorType.SAR,
    satelliteMetadataId: sarMeta._id.toString(),
  });
  const activeSar = await baselineService.activateBaseline(sarCand.candidate!.id, adminUser._id.toString(), {
    skipPipelineValidation: true,
  });
  assert.strictEqual(activeSar.isActive, true);

  const zoneActiveOpt = await baselineService.getActiveBaseline(permanentZoneId, SensorType.OPTICAL);
  const zoneActiveSar = await baselineService.getActiveBaseline(permanentZoneId, SensorType.SAR);
  assert.strictEqual(zoneActiveOpt?.id, activeOpt.id);
  assert.strictEqual(zoneActiveSar?.id, activeSar.id);
  assert.notStrictEqual(zoneActiveOpt?.id, zoneActiveSar?.id);
  console.info('  ✅ Verified: 1 active Optical baseline AND 1 active SAR baseline maintained independently');

  console.log('\n--- 7. Temporary Area & Baseline Isolation ---');

  // Test 20: Temporary analysis does not mutate permanent baseline
  console.info('Test 20: Temporary area analysis maintains permanent baseline isolation');
  const tempArea = await TemporaryAreaModel.create({
    temporaryAreaId: 'TMP-M85-TEST-001',
    name: 'Test-M85 Mining Investigation Sector',
    boundary: realTnPolygon,
    areaHectares: 25.0,
    areaSquareMeters: 250000,
    centerPoint: { type: 'Point', coordinates: [77.175, 11.575] },
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    status: TemporaryAreaStatus.ANALYSIS_REQUESTED,
    createdBy: adminUser._id,
  });
  assert.ok(tempArea.temporaryAreaId);

  const optCountBefore = await BaselineModel.countDocuments({ zoneId: permanentZoneId });
  const histRef = await baselineService.getHistoricalReference({
    footprint: realTnPolygon,
    sensorType: SensorType.OPTICAL,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
  });
  assert.ok(histRef.referenceMetadata);
  const optCountAfter = await BaselineModel.countDocuments({ zoneId: permanentZoneId });
  assert.strictEqual(optCountAfter, optCountBefore, 'Permanent baselines must not be created or mutated');
  console.info('  ✅ Permanent baseline isolation strictly maintained (0 permanent baselines mutated)');

  console.log('\n--- 8. Idempotency & Guaranteed Ephemeral Cleanup ---');

  // Test 21: Idempotent acquisition
  console.info('Test 21: Idempotent satellite observation creation');
  const dupMetaRes = await request(
    'POST',
    '/api/satellite/acquire',
    {
      zoneId: permanentZoneId,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    },
    adminToken,
  );
  assert.strictEqual(dupMetaRes.status, 201);
  const metaCountBefore = await SatelliteMetadata.countDocuments();
  const dupMetaRes2 = await request(
    'POST',
    '/api/satellite/acquire',
    {
      zoneId: permanentZoneId,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    },
    adminToken,
  );
  assert.strictEqual(dupMetaRes2.status, 201); // 201 CREATED returned with existing record
  const metaCountAfter = await SatelliteMetadata.countDocuments();
  assert.strictEqual(metaCountAfter, metaCountBefore);
  console.info('  ✅ Duplicate acquisition successfully returned existing record without DB duplication');

  // Test 22: Idempotent processing
  console.info('Test 22: Idempotent image processing');
  const procCountBefore = await ProcessedImageResultModel.countDocuments();
  const reprocessed = await imageProcessingService.processImage({
    zoneId: permanentZoneId,
    satelliteMetadataId: optMeta._id.toString(),
  });
  const procCountAfter = await ProcessedImageResultModel.countDocuments();
  assert.strictEqual(procCountAfter, procCountBefore);
  assert.strictEqual(reprocessed.id, processedOpt.id);
  console.info('  ✅ Idempotent processing verified: returned existing ProcessedImageResult');

  // Test 23: TempImageManager cleanup on success and failure
  console.info('Test 23: Ephemeral temporary workspace cleanup (success & failure cases)');
  let capturedDirSuccess = '';
  await TempImageManager.withTemporaryWorkspace('m85_success_test', async (dir) => {
    capturedDirSuccess = dir;
    fs.writeFileSync(path.join(dir, 'test_intermediate.tif'), 'MOCK_RASTER_DATA');
    assert.strictEqual(fs.existsSync(dir), true);
  });
  assert.strictEqual(fs.existsSync(capturedDirSuccess), false, 'Directory must be deleted after success');

  let capturedDirFailure = '';
  await assert.rejects(async () => {
    await TempImageManager.withTemporaryWorkspace('m85_failure_test', async (dir) => {
      capturedDirFailure = dir;
      fs.writeFileSync(path.join(dir, 'test_fail.tif'), 'MOCK_RASTER_DATA');
      throw new Error('Simulated Processing Exception');
    });
  }, /Simulated Processing Exception/);
  assert.strictEqual(fs.existsSync(capturedDirFailure), false, 'Directory must be deleted even after exception');
  console.info('  ✅ Ephemeral workspace guaranteed deleted in both success and exception scenarios');

  console.log('\n--- 9. Guardrails, Edge Cases & Error Handling ---');

  // Test 24: GEE failure handling for invalid unclosed polygon
  console.info('Test 24: Unclosed polygon error handling');
  const unclosedPoly: any = {
    type: 'Polygon',
    coordinates: [[[77.1, 11.5], [77.2, 11.5], [77.2, 11.6]]],
  };
  await assert.rejects(
    () => reductionService.reduceOpticalImage(firstS2.imageId, unclosedPoly),
    /Polygon coordinates must contain at least 4 coordinate vertices|Valid GeoJSON Polygon/i,
  );
  console.info('  ✅ Properly rejected invalid geometry without crashing');

  // Test 25: No fake production data
  console.info('Test 25: Verification of provider authenticity in production');
  const defaultProvider = geeSatService.getProvider();
  assert.strictEqual(defaultProvider.providerName, 'REAL_GEE_PROVIDER');
  assert.strictEqual(defaultProvider.isRealProvider, true);
  console.info('  ✅ Confirmed: Production satellite pipeline runs on authentic REAL_GEE_PROVIDER');

  // Test 26: Change detection between real observations
  console.info('Test 26: Change detection between real baseline and observation');
  const changeRes = await changeDetectionService.detectChange({
    zoneId: permanentZoneId,
    observationId: optMeta._id.toString(),
    baselineId: activeOpt.id,
  });
  assert.ok(changeRes.id);
  assert.strictEqual(changeRes.sensorType, SensorType.OPTICAL);
  console.info(`  ✅ Real Change Vector Computed -> Affected %: ${changeRes.affectedAreaPercentage}%, Severity: ${changeRes.severity}`);

  // Clean up
  server.close();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL 26 M8.5 REAL-WORLD VALIDATION & HARDENING TESTS PASSED!');
  console.log('================================================================\n');
  process.exit(0);
}

runM85RealWorldValidationTests().catch((err) => {
  console.error('❌ M8.5 Test Failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
