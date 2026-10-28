/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Server } from 'node:http';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { app } from '../app.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { GeeReductionService } from '../services/gee/GeeReductionService.js';
import { HarmonizationService, SCIENTIFIC_RESAMPLING_DISCLAIMER } from '../services/gee/HarmonizationService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  SatelliteSource,
  SensorType,
  LogicalOpticalBand,
  LogicalSarBand,
  LogicalDemBand,
  ResamplingMethod,
  type GeoJSONPolygon,
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

async function runM89Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING MODULE M8.9: RESOLUTION / PROJECTION / BAND HARMONIZATION');
  console.log('================================================================\n');

  await connectDatabase();

  const port = 5049;
  server = app.listen(port);
  BASE_URL = `http://localhost:${port}`;

  // Create Test Admin User
  await User.deleteMany({ email: { $regex: /@m89-test\.tn\.gov\.in$/ } });
  const hashedPassword = await hashPassword('M89SecurePassword123!');
  const adminUser = await User.create({
    employeeId: 'TN-M89-001',
    name: 'M8.9 Harmonization Admin',
    email: 'admin@m89-test.tn.gov.in',
    phone: '+919876543289',
    passwordHash: hashedPassword,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    permissions: Object.values(Permission),
  });

  const loginRes = await request('POST', '/api/auth/login', {
    email: adminUser.email,
    password: 'M89SecurePassword123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const adminToken = loginRes.body.data.token;

  const testPolygon: GeoJSONPolygon = {
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

  const reductionService = GeeReductionService.getInstance();
  const harmonizationService = HarmonizationService.getInstance();

  console.log('--- 1. Optical Band Harmonization & Logical Band Mapping ---');

  // Test 1: Sentinel-2 Harmonization
  console.info('Test 1: Harmonize Sentinel-2 optical imagery to common logical band model');
  const s2RawStats = await reductionService.reduceOpticalImage(
    'COPERNICUS/S2_SR_HARMONIZED/20260115T050221_20260115T050519_T44PMT',
    testPolygon,
    { cloudCover: 2.0 },
  );
  const s2Harmonized = harmonizationService.harmonizeOptical(s2RawStats, testPolygon, {
    targetResolutionMeters: 10,
    targetCrs: 'EPSG:4326',
  });

  assert.strictEqual(s2Harmonized.sensorType, SensorType.OPTICAL);
  assert.strictEqual(s2Harmonized.source, SatelliteSource.SENTINEL_2);
  assert.strictEqual(s2Harmonized.harmonization.nativeResolutionMeters, 10);
  assert.strictEqual(s2Harmonized.harmonization.targetResolutionMeters, 10);
  assert.strictEqual(s2Harmonized.harmonization.isResampled, false);
  assert.ok(s2Harmonized.normalizedBands[LogicalOpticalBand.BLUE], 'Must have normalized BLUE');
  assert.ok(s2Harmonized.normalizedBands[LogicalOpticalBand.GREEN], 'Must have normalized GREEN');
  assert.ok(s2Harmonized.normalizedBands[LogicalOpticalBand.RED], 'Must have normalized RED');
  assert.ok(s2Harmonized.normalizedBands[LogicalOpticalBand.NIR], 'Must have normalized NIR');
  assert.ok(s2Harmonized.normalizedBands[LogicalOpticalBand.SWIR1], 'Must have normalized SWIR1');
  assert.ok(s2Harmonized.normalizedBands[LogicalOpticalBand.SWIR2], 'Must have normalized SWIR2');
  console.info(`  ✅ Sentinel-2 Harmonized: Logical Bands [BLUE..SWIR2], Native: 10m, Target: 10m, NDVI=${s2Harmonized.calculatedIndices?.ndvi}`);

  // Test 2: Landsat 8 Harmonization & 30m -> 10m Resampling
  console.info('Test 2: Harmonize Landsat 8 imagery (30m -> 10m grid, Bilinear resampling)');
  const l8RawStats = await reductionService.reduceOpticalImage(
    'LANDSAT/LC08/C02/T1_L2/LC08_L2SP_144053_20260112_02_T1',
    testPolygon,
    { source: SatelliteSource.LANDSAT_8, cloudCover: 5.0 },
  );
  const l8Harmonized = harmonizationService.harmonizeOptical(l8RawStats, testPolygon, {
    targetResolutionMeters: 10,
    targetCrs: 'EPSG:4326',
    resamplingMethod: ResamplingMethod.BILINEAR,
  });

  assert.strictEqual(l8Harmonized.sensorType, SensorType.OPTICAL);
  assert.strictEqual(l8Harmonized.source, SatelliteSource.LANDSAT_8);
  assert.strictEqual(l8Harmonized.harmonization.nativeResolutionMeters, 30);
  assert.strictEqual(l8Harmonized.harmonization.targetResolutionMeters, 10);
  assert.strictEqual(l8Harmonized.harmonization.isResampled, true);
  assert.strictEqual(l8Harmonized.harmonization.resamplingMethod, ResamplingMethod.BILINEAR);
  assert.strictEqual(l8Harmonized.harmonization.scientificDisclaimer, SCIENTIFIC_RESAMPLING_DISCLAIMER);
  console.info(`  ✅ Landsat 8 Harmonized: Native 30m -> Target 10m grid (Bilinear), Disclaimer preserved`);

  // Test 3: Landsat 9 Harmonization
  console.info('Test 3: Harmonize Landsat 9 imagery (30m -> 10m grid)');
  const l9RawStats = await reductionService.reduceOpticalImage(
    'LANDSAT/LC09/C02/T1_L2/LC09_L2SP_144053_20260120_02_T1',
    testPolygon,
    { source: SatelliteSource.LANDSAT_9, cloudCover: 4.5 },
  );
  const l9Harmonized = harmonizationService.harmonizeOptical(l9RawStats, testPolygon, {
    targetResolutionMeters: 10,
  });
  assert.strictEqual(l9Harmonized.source, SatelliteSource.LANDSAT_9);
  assert.strictEqual(l9Harmonized.harmonization.nativeResolutionMeters, 30);
  assert.ok(l9Harmonized.calculatedIndices?.ndvi !== undefined);
  console.info(`  ✅ Landsat 9 Harmonized: NDVI=${l9Harmonized.calculatedIndices?.ndvi}, EVI=${l9Harmonized.calculatedIndices?.evi}`);

  // Test 4: Sentinel-1 SAR Harmonization
  console.info('Test 4: Harmonize Sentinel-1 SAR C-Band backscatter (independent track)');
  const sarRawStats = await reductionService.reduceSarImage(
    'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260110T003810_20260110T003835_057288_06FA92_7FE4',
    testPolygon,
  );
  const sarHarmonized = harmonizationService.harmonizeSar(sarRawStats, testPolygon);
  assert.strictEqual(sarHarmonized.sensorType, SensorType.SAR);
  assert.ok(sarHarmonized.normalizedBands[LogicalSarBand.VV]);
  assert.ok(sarHarmonized.normalizedBands[LogicalSarBand.VH]);
  assert.ok(sarHarmonized.calculatedIndices?.vvVhRatio !== undefined);
  console.info(`  ✅ SAR Harmonized: VV=${sarHarmonized.normalizedBands.VV.mean} dB, VH=${sarHarmonized.normalizedBands.VH.mean} dB, VV/VH Ratio=${sarHarmonized.calculatedIndices?.vvVhRatio}`);

  // Test 5: SRTM DEM Harmonization
  console.info('Test 5: Harmonize SRTM DEM Global Elevation');
  const demRawStats = await reductionService.reduceDemImage('USGS/SRTMGL1_003', testPolygon);
  const demHarmonized = harmonizationService.harmonizeDem(demRawStats, testPolygon);
  assert.strictEqual(demHarmonized.sensorType, SensorType.DEM);
  assert.ok(demHarmonized.normalizedBands[LogicalDemBand.ELEVATION]);
  assert.ok(demHarmonized.normalizedBands[LogicalDemBand.SLOPE]);
  assert.ok(demHarmonized.normalizedBands[LogicalDemBand.ASPECT]);
  console.info(`  ✅ DEM Harmonized: Elevation=${demHarmonized.normalizedBands.ELEVATION.mean} m, Slope=${demHarmonized.normalizedBands.SLOPE.mean}°`);

  console.log('\n--- 2. Normalization Validation Layer & Incompatibility Checks ---');

  // Test 6: Incompatible Sensor Track Rejection (Optical vs SAR)
  console.info('Test 6: Reject direct comparison between Optical and SAR datasets');
  const crossTrackCheck = harmonizationService.validateCompatibility(s2Harmonized, sarHarmonized);
  assert.strictEqual(crossTrackCheck.compatible, false);
  assert.ok(crossTrackCheck.errors.some((e) => e.includes('Incompatible sensor tracks')));
  console.info(`  ✅ Incompatible track correctly rejected: ${crossTrackCheck.errors[0]}`);

  // Test 7: Incompatible Sensor Track Rejection (Optical vs DEM)
  console.info('Test 7: Reject direct comparison between Optical and DEM datasets');
  const crossDemCheck = harmonizationService.validateCompatibility(s2Harmonized, demHarmonized);
  assert.strictEqual(crossDemCheck.compatible, false);
  console.info('  ✅ Optical vs DEM comparison correctly rejected');

  // Test 8: Cross-Source Optical Compatibility (Sentinel-2 Baseline vs Landsat-8 Current)
  console.info('Test 8: Validate cross-source optical comparison (S2 baseline vs L8 current on normalized 10m grid)');
  const crossSourceCheck = harmonizationService.validateCompatibility(s2Harmonized, l8Harmonized);
  assert.strictEqual(crossSourceCheck.compatible, true);
  assert.strictEqual(crossSourceCheck.crossSource, true);
  assert.ok(crossSourceCheck.warnings.length > 0, 'Must record resampling warning for cross-source comparison');
  console.info(`  ✅ Cross-source comparison validated: Compatible=true, Warning: ${crossSourceCheck.warnings[0]}`);

  console.log('\n--- 3. REST API Endpoints Verification ---');

  // Test 9: POST /api/gee/harmonize
  console.info('Test 9: POST /api/gee/harmonize endpoint');
  const harmRes = await request(
    'POST',
    '/api/gee/harmonize',
    {
      zonalStats: l8RawStats,
      extent: testPolygon,
      options: { targetResolutionMeters: 10 },
      track: 'OPTICAL',
    },
    adminToken,
  );
  assert.strictEqual(harmRes.status, 200);
  assert.strictEqual(harmRes.body.success, true);
  assert.strictEqual(harmRes.body.data.source, SatelliteSource.LANDSAT_8);
  assert.strictEqual(harmRes.body.data.harmonization.isResampled, true);
  console.info(`  ✅ API POST /api/gee/harmonize returned 200 OK (Dataset: ${harmRes.body.data.datasetId})`);

  // Test 10: POST /api/gee/validate-compatibility
  console.info('Test 10: POST /api/gee/validate-compatibility endpoint');
  const valRes = await request(
    'POST',
    '/api/gee/validate-compatibility',
    {
      baseline: s2Harmonized,
      current: l8Harmonized,
    },
    adminToken,
  );
  assert.strictEqual(valRes.status, 200);
  assert.strictEqual(valRes.body.success, true);
  assert.strictEqual(valRes.body.data.compatible, true);
  console.info(`  ✅ API POST /api/gee/validate-compatibility returned 200 OK (Compatible: ${valRes.body.data.compatible})`);

  console.log('\n================================================================');
  console.log('🎉 ALL MODULE M8.9 RESOLUTION & HARMONIZATION TESTS PASSED (100%)');
  console.log('================================================================\n');

  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

runM89Tests().catch((err) => {
  console.error('❌ M8.9 Test Suite Failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
