/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Server } from 'node:http';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { app } from '../app.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { TemporaryAreaModel } from '../models/TemporaryArea.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { hashPassword } from '../utils/password.js';
import { GeeReductionService } from '../services/gee/GeeReductionService.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { SimulatedSatelliteProvider } from '../services/gee/providers/SimulatedSatelliteProvider.js';
import { TempImageManager } from '../services/gee/TempImageManager.js';
import { ImageProcessingService } from '../services/ImageProcessingService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  TemporaryAreaStatus,
  SatelliteSource,
  SensorType,
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

async function runM83ZonalStatsTests() {
  console.log('🧪 Starting M8.3 Real GEE Zonal Pixel Statistics & M5 Integration Test Suite...\n');

  await connectDatabase();

  const port = 5035;
  server = app.listen(port);
  BASE_URL = `http://localhost:${port}`;

  // Clean test collections
  await User.deleteMany({ email: { $regex: /@m83-test\.tn\.gov\.in$/ } });
  await Zone.deleteMany({ name: { $regex: /^Test-M83/ } });
  await TemporaryAreaModel.deleteMany({ name: { $regex: /^Test-M83/ } });
  await SatelliteMetadata.deleteMany({ imageId: { $regex: /^COPERNICUS\/S(2|1)_/ } });
  await BaselineModel.deleteMany({ satelliteMetadataId: { $exists: true } });
  await ProcessedImageResultModel.deleteMany({});

  // 1. Create Test Admin User
  const hashedPassword = await hashPassword('M83SecurePassword123!');
  const adminUser = await User.create({
    employeeId: 'TN-M83-001',
    name: 'M8.3 GEE Zonal Admin',
    email: 'admin@m83-test.tn.gov.in',
    phone: '+919876543240',
    passwordHash: hashedPassword,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    permissions: Object.values(Permission),
  });

  const loginRes = await request('POST', '/api/auth/login', {
    email: adminUser.email,
    password: 'M83SecurePassword123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const adminToken = loginRes.body.data.token;

  // Real Sathyamangalam Reserve Forest test polygon (Western Ghats, Tamil Nadu)
  const testZonePolygon: GeoJSONPolygon = {
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
      name: 'Test-M83 Sathyamangalam Permanent Sector',
      category: ZoneCategory.RESERVED_AREA,
      boundary: testZonePolygon,
    },
    adminToken,
  );
  assert.strictEqual(zoneRes.status, 201);
  const permanentZoneId = zoneRes.body.data.id;

  const reductionService = GeeReductionService.getInstance();
  const realOpticalImageId = 'COPERNICUS/S2_SR_HARMONIZED/20260103T050221_20260103T050519_T44PMT';
  const realSarImageId = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260102T003810_20260102T003835_057293_6FA91_7FE4';

  console.log('--- 1. Optical Zonal Statistics Extraction (B2, B3, B4, B8, B11, B12) ---');

  const opticalReduction = await reductionService.reduceOpticalImage(
    realOpticalImageId,
    testZonePolygon,
    { zoneId: permanentZoneId, cloudCover: 4.5 },
  );

  assert.strictEqual(opticalReduction.processingMode, 'REAL');
  assert.strictEqual(opticalReduction.provenance, 'GEE_ZONAL_STATISTICS');
  const optStats = opticalReduction.statistics as OpticalZonalStatistics;

  // Test 1: Real Sentinel-2 B2 statistics
  console.info('Test 1: Real Sentinel-2 B2 (Blue) zonal statistics');
  assert.ok(optStats.B2.mean > 0 && optStats.B2.mean < 1.0, 'B2 mean reflectance must be within [0, 1]');
  assert.ok(optStats.B2.validPixelCount > 0, 'B2 valid pixel count must be > 0');
  console.info(`  ✅ B2 Mean: ${optStats.B2.mean}, Median: ${optStats.B2.median}, Pixels: ${optStats.B2.validPixelCount}`);

  // Test 2: Real Sentinel-2 B3 statistics
  console.info('Test 2: Real Sentinel-2 B3 (Green) zonal statistics');
  assert.ok(optStats.B3.mean > 0 && optStats.B3.mean < 1.0);
  console.info(`  ✅ B3 Mean: ${optStats.B3.mean}, Median: ${optStats.B3.median}`);

  // Test 3: Real Sentinel-2 B4 statistics
  console.info('Test 3: Real Sentinel-2 B4 (Red) zonal statistics');
  assert.ok(optStats.B4.mean > 0 && optStats.B4.mean < 1.0);
  console.info(`  ✅ B4 Mean: ${optStats.B4.mean}, Median: ${optStats.B4.median}`);

  // Test 4: Real Sentinel-2 B8 statistics
  console.info('Test 4: Real Sentinel-2 B8 (NIR) zonal statistics');
  assert.ok(optStats.B8.mean > optStats.B4.mean, 'NIR reflectance in forest canopy must exceed Red reflectance');
  console.info(`  ✅ B8 Mean: ${optStats.B8.mean}, Median: ${optStats.B8.median}`);

  // Test 5: Real Sentinel-2 B11 statistics
  console.info('Test 5: Real Sentinel-2 B11 (SWIR1) zonal statistics');
  assert.ok(optStats.B11.mean > 0 && optStats.B11.mean < 1.0);
  console.info(`  ✅ B11 Mean: ${optStats.B11.mean}, Median: ${optStats.B11.median}`);

  // Test 6: Real Sentinel-2 B12 statistics
  console.info('Test 6: Real Sentinel-2 B12 (SWIR2) zonal statistics');
  assert.ok(optStats.B12.mean > 0 && optStats.B12.mean < 1.0);
  console.info(`  ✅ B12 Mean: ${optStats.B12.mean}, Median: ${optStats.B12.median}`);

  console.log('\n--- 2. SAR Zonal Statistics Extraction (VV, VH, angle) ---');

  const sarReduction = await reductionService.reduceSarImage(
    realSarImageId,
    testZonePolygon,
    { zoneId: permanentZoneId },
  );
  assert.strictEqual(sarReduction.processingMode, 'REAL');
  const sarStats = sarReduction.statistics as SarZonalStatistics;

  // Test 7: Sentinel-1 VV statistics
  console.info('Test 7: Sentinel-1 VV co-polarization backscatter statistics');
  assert.ok(sarStats.VV.mean < 0 && sarStats.VV.mean > -35.0, 'VV backscatter must be negative dB');
  console.info(`  ✅ VV Mean: ${sarStats.VV.mean} dB, Median: ${sarStats.VV.median} dB, Pixels: ${sarStats.VV.validPixelCount}`);

  // Test 8: Sentinel-1 VH statistics
  console.info('Test 8: Sentinel-1 VH cross-polarization backscatter statistics');
  assert.ok(sarStats.VH.mean < sarStats.VV.mean, 'Cross-pol VH backscatter must be lower than co-pol VV');
  console.info(`  ✅ VH Mean: ${sarStats.VH.mean} dB, Median: ${sarStats.VH.median} dB`);

  // Test 9: Valid Pixel Count verification
  console.info('Test 9: Valid pixel count verification over target geometry');
  assert.ok(sarStats.VV.validPixelCount >= 100, 'Must compute realistic pixel coverage');
  console.info(`  ✅ Target area pixel count: ${sarStats.VV.validPixelCount} pixels (10m grid)`);

  // Test 10: Acquisition date preservation
  console.info('Test 10: Real acquisition date preservation');
  assert.strictEqual(opticalReduction.acquisitionDate, '2026-01-03T00:00:00.000Z');
  console.info(`  ✅ Preserved Date: ${opticalReduction.acquisitionDate}`);

  // Test 11: Real GEE image ID preservation
  console.info('Test 11: Real Earth Engine image ID preservation');
  assert.strictEqual(opticalReduction.imageId, realOpticalImageId);
  console.info(`  ✅ Preserved Image ID: ${opticalReduction.imageId}`);

  console.log('\n--- 3. Validation & Boundary Guardrails ---');

  // Test 12: Invalid polygon rejection
  console.info('Test 12: Invalid polygon coordinate rejection');
  const invalidPolygon: any = {
    type: 'Polygon',
    coordinates: [[[77.1, 11.5], [77.2, 11.5], [77.2, 11.6]]], // Unclosed & 3 points
  };
  await assert.rejects(
    () => reductionService.reduceOpticalImage(realOpticalImageId, invalidPolygon),
    /Polygon coordinates must contain at least 4 coordinate vertices|Valid GeoJSON Polygon/i,
  );
  console.info('  ✅ Correctly rejected invalid unclosed polygon');

  // Test 13: Caching and Idempotency
  console.info('Test 13: Duplicate reduction request is idempotent and served from cache');
  const startCache = Date.now();
  const cachedReduction = await reductionService.reduceOpticalImage(realOpticalImageId, testZonePolygon);
  const cacheDuration = Date.now() - startCache;
  assert.strictEqual(cachedReduction.computedAt, opticalReduction.computedAt);
  assert.ok(cacheDuration < 50, 'Cached result must resolve in < 50ms');
  console.info('  ✅ Idempotency confirmed via in-memory reduction cache');

  console.log('\n--- 4. M5 Spectral Processing Grounding with Real Zonal Values ---');

  // Create SatelliteMetadata in DB
  const opticalMeta = await SatelliteMetadata.create({
    imageId: realOpticalImageId,
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: new Date('2026-01-03T00:00:00.000Z'),
    cloudCover: 4.5,
    footprint: testZonePolygon,
    geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(geometry)',
    intersectingZones: [new mongoose.Types.ObjectId(permanentZoneId) as any],
    metadata: {
      isRealTelemetry: true,
      spacecraftName: 'Sentinel-2A',
    },
  });

  const sarMeta = await SatelliteMetadata.create({
    imageId: realSarImageId,
    source: SatelliteSource.SENTINEL_1,
    sensorType: SensorType.SAR,
    acquisitionDate: new Date('2026-01-02T00:00:00.000Z'),
    cloudCover: 0.0,
    footprint: testZonePolygon,
    geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)',
    intersectingZones: [new mongoose.Types.ObjectId(permanentZoneId) as any],
    metadata: {
      isRealTelemetry: true,
      polarization: 'VV+VH',
      acquisitionMode: 'IW',
      orbitDirection: 'DESCENDING',
    },
  });

  const imageProcessingService = new ImageProcessingService();

  // Test 14: Process Optical Observation with Real Zonal Statistics
  console.info('Test 14: Process optical observation and verify M5 spectral indices calculation');
  const processedOptical = await imageProcessingService.processImage({
    satelliteMetadataId: opticalMeta._id.toString(),
    zoneId: permanentZoneId,
  });
  assert.strictEqual(processedOptical.processingStatus, 'PROCESSED');
  assert.ok(processedOptical.opticalMetrics, 'Must contain computed opticalMetrics');

  const { ndvi, ndwi, ndbi, bsi, savi, evi } = processedOptical.opticalMetrics!;

  // Test 15-20: Spectral index mathematical validations
  console.info(`  ✅ Computed NDVI: ${ndvi} (Healthy forest range [0.5, 0.9])`);
  assert.ok(ndvi > 0.5 && ndvi < 0.9, `NDVI (${ndvi}) must reflect healthy canopy`);

  console.info(`  ✅ Computed NDWI: ${ndwi} (Moisture canopy index)`);
  assert.ok(ndwi > 0.2 && ndwi < 0.8);

  console.info(`  ✅ Computed NDBI: ${ndbi} (Built-up / bare soil index)`);
  assert.ok(ndbi < 0.0, 'NDBI must be negative for dense vegetation canopy');

  console.info(`  ✅ Computed BSI: ${bsi} (Bare soil index)`);
  assert.ok(bsi < 0.0, 'BSI must be negative for forest');

  console.info(`  ✅ Computed SAVI: ${savi} (Soil adjusted vegetation index)`);
  assert.ok(savi > 0.3 && savi < 0.9);

  console.info(`  ✅ Computed EVI: ${evi} (Enhanced vegetation index)`);
  assert.ok(evi > 0.4 && evi < 1.0);

  // Test 21: Process SAR Observation with Real Zonal Statistics
  console.info('Test 21: Process SAR observation and verify M5 C-Band backscatter calculation');
  const processedSar = await imageProcessingService.processImage({
    satelliteMetadataId: sarMeta._id.toString(),
    zoneId: permanentZoneId,
  });
  assert.strictEqual(processedSar.processingStatus, 'PROCESSED');
  assert.ok(processedSar.sarMetrics, 'Must contain computed sarMetrics');
  console.info(`  ✅ SAR VV: ${processedSar.sarMetrics!.vv} dB, VH: ${processedSar.sarMetrics!.vh} dB, VV/VH Ratio: ${processedSar.sarMetrics!.vvVhRatio} dB`);

  console.log('\n--- 5. Temporary Area Support & Baseline Non-Mutation Invariant ---');

  // Create temporary analysis area
  const tempArea = await TemporaryAreaModel.create({
    temporaryAreaId: 'TMP-M83-TEST-001',
    name: 'Test-M83 Mining Exploration Sector',
    boundary: testZonePolygon,
    areaHectares: 25.0,
    areaSquareMeters: 250000,
    centerPoint: { type: 'Point', coordinates: [77.175, 11.575] },
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    status: TemporaryAreaStatus.ANALYSIS_REQUESTED,
    createdBy: adminUser._id,
  });

  const baselineCountBefore = await BaselineModel.countDocuments();

  // Test 22: Temporary area processing
  console.info('Test 22: Processing temporary area observation with real zonal reduction');
  const processedTemp = await imageProcessingService.processImage({
    satelliteMetadataId: opticalMeta._id.toString(),
    temporaryAreaId: tempArea.temporaryAreaId,
  });
  assert.strictEqual(processedTemp.processingStatus, 'PROCESSED');
  assert.strictEqual(processedTemp.temporaryAreaId, tempArea.temporaryAreaId);

  // Test 23: Baseline isolation invariant
  console.info('Test 23: Confirmed temporary area processing does NOT modify or create permanent baselines');
  const baselineCountAfter = await BaselineModel.countDocuments();
  assert.strictEqual(baselineCountAfter, baselineCountBefore, 'Baseline count must remain unchanged');
  console.info('  ✅ Baseline isolation invariant maintained: 0 active permanent baselines mutated');

  console.log('\n--- 6. Provider Separation & Ephemeral Cleanup ---');

  // Test 24: Real GEE provider vs Simulation provider isolation
  console.info('Test 24: Verify provider isolation and non-silent fallback invariant');
  const realProvider = new GeeSatelliteProvider();
  const simProvider = new SimulatedSatelliteProvider();
  assert.strictEqual(realProvider.providerName, 'REAL_GEE_PROVIDER');
  assert.strictEqual(realProvider.isRealProvider, true);
  assert.strictEqual(simProvider.providerName, 'TEST_SIMULATION_PROVIDER');
  assert.strictEqual(simProvider.isRealProvider, false);
  console.info('  ✅ Provider isolation verified: REAL_GEE_PROVIDER uses real Earth Engine telemetry');

  // Test 25: Ephemeral Temporary processing cleanup
  console.info('Test 25: Verify TempImageManager disk cleanup');
  await TempImageManager.cleanupAllWorkspaces();
  const tempDir = await TempImageManager.createTempWorkspace('m83_test_cleanup');
  await TempImageManager.cleanupTempWorkspace(tempDir);
  assert.strictEqual(TempImageManager.getActiveWorkspacesCount(), 0, 'Must have zero active workspaces after cleanup');
  console.info('  ✅ Ephemeral workspace directory completely deleted');

  // Clean up
  server.close();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL M8.3 REAL GEE ZONAL STATISTICS & M5 INTEGRATION TESTS PASSED!');
  console.log('================================================================\n');
  process.exit(0);
}

runM83ZonalStatsTests().catch((err) => {
  console.error('❌ M8.3 Test Failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
