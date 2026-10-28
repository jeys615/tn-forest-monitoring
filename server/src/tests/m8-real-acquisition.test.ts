/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Server } from 'node:http';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { app } from '../app.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { hashPassword } from '../utils/password.js';
import { GeeSatelliteProvider, REQUIRED_SENTINEL2_BANDS } from '../services/gee/providers/GeeSatelliteProvider.js';
import { SimulatedSatelliteProvider } from '../services/gee/providers/SimulatedSatelliteProvider.js';
import { TempImageManager } from '../services/gee/TempImageManager.js';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  SatelliteSource,
  SensorType,
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

async function runM82AcquisitionTests() {
  console.log('🧪 Starting M8.2 Real Google Earth Engine Satellite Acquisition Test Suite...\n');

  await connectDatabase();

  const port = 5032;
  server = app.listen(port);
  BASE_URL = `http://localhost:${port}`;

  // Clean test collections
  await User.deleteMany({ email: { $regex: /@m82-test\.tn\.gov\.in$/ } });
  await Zone.deleteMany({ name: { $regex: /^Test-M82/ } });
  await SatelliteMetadata.deleteMany({ imageId: { $regex: /^COPERNICUS\/S(2|1)_/ } });

  // 1. Create Test Admin User
  const hashedPassword = await hashPassword('M82SecurePassword123!');
  const adminUser = await User.create({
    employeeId: 'TN-M82-001',
    name: 'M8.2 GEE Admin',
    email: 'admin@m82-test.tn.gov.in',
    phone: '+919876543230',
    passwordHash: hashedPassword,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    permissions: Object.values(Permission),
  });

  const loginRes = await request('POST', '/api/auth/login', {
    email: adminUser.email,
    password: 'M82SecurePassword123!',
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
      name: 'Test-M82 Sathyamangalam Reserve Sector',
      category: ZoneCategory.RESERVED_AREA,
      boundary: testZonePolygon,
    },
    adminToken,
  );
  assert.strictEqual(zoneRes.status, 201);
  const testZoneId = zoneRes.body.data.id;

  console.log('--- 1. GEE Provider Initialization & Real Metadata Search ---');

  // Test 1: GEE provider initializes correctly
  console.info('Test 1: GEE Provider initializes as REAL_GEE_PROVIDER');
  const geeProvider = new GeeSatelliteProvider();
  assert.strictEqual(geeProvider.providerName, 'REAL_GEE_PROVIDER');
  assert.strictEqual(geeProvider.isRealProvider, true);
  console.info('  ✅ GEE Provider initialized with isRealProvider = true');

  // Test 2: Real GEE image search
  console.info('Test 2: Real GEE Sentinel-2 image search over test polygon');
  const opticalImages = await geeProvider.searchOpticalImages(testZonePolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    maxCloudCover: 20,
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
  });
  assert.ok(opticalImages.length > 0, 'Must return at least 1 real Sentinel-2 image');
  console.info(`  ✅ Returned ${opticalImages.length} real Sentinel-2 observations.`);

  // Test 3: Real GEE image ID format
  console.info('Test 3: Real Earth Engine Image ID structure verification');
  const firstOpt = opticalImages[0];
  assert.ok(firstOpt.imageId.startsWith('COPERNICUS/S2_SR_HARMONIZED/'));
  assert.strictEqual(firstOpt.source, SatelliteSource.SENTINEL_2);
  assert.strictEqual(firstOpt.sensorType, SensorType.OPTICAL);
  assert.strictEqual(firstOpt.isRealTelemetry, true);
  console.info(`  ✅ Real GEE Image ID: ${firstOpt.imageId}`);

  // Test 4: Real acquisition timestamp format (ISO/UTC from metadata)
  console.info('Test 4: Real acquisition timestamp preservation');
  assert.ok(new Date(firstOpt.acquisitionDate).getTime() > 0);
  assert.ok(!isNaN(Date.parse(firstOpt.acquisitionDate)));
  console.info(`  ✅ Real Acquisition Timestamp: ${firstOpt.acquisitionDate}`);

  // Test 5: Real Band Metadata verification (B2, B3, B4, B8, B11, B12)
  console.info('Test 5: Required spectral bands availability check');
  const availableBands = firstOpt.bands.map((b) => b.id);
  for (const b of REQUIRED_SENTINEL2_BANDS) {
    assert.ok(availableBands.includes(b), `Band ${b} must be present in Sentinel-2 metadata`);
  }
  console.info(`  ✅ Verified required spectral bands: ${REQUIRED_SENTINEL2_BANDS.join(', ')}`);

  // Test 6: Real Sentinel-1 SAR acquisition check
  console.info('Test 6: Real Sentinel-1 SAR acquisition query (COPERNICUS/S1_GRD)');
  const sarImages = await geeProvider.searchSarImages(testZonePolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    source: SatelliteSource.SENTINEL_1,
    sensorType: SensorType.SAR,
  });
  assert.ok(sarImages.length > 0, 'Must return at least 1 real Sentinel-1 SAR image');
  const firstSar = sarImages[0];
  assert.ok(firstSar.imageId.startsWith('COPERNICUS/S1_GRD/'));
  assert.strictEqual(firstSar.source, SatelliteSource.SENTINEL_1);
  assert.strictEqual(firstSar.sensorType, SensorType.SAR);
  assert.strictEqual(firstSar.polarization, 'VV+VH');
  assert.strictEqual(firstSar.acquisitionMode, 'IW');
  console.info(`  ✅ Real Sentinel-1 Image ID: ${firstSar.imageId} (Polarization: ${firstSar.polarization})`);

  console.log('\n--- 2. Observation Persistence & Deduplication Invariants ---');

  // Test 7: Acquire satellite image via API and persist to MongoDB
  console.info('Test 7: POST /api/satellite/acquire creates observation with real GEE telemetry');
  const acqRes = await request(
    'POST',
    '/api/satellite/acquire',
    {
      zoneId: testZoneId,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      maxCloudCover: 20,
    },
    adminToken,
  );
  assert.strictEqual(acqRes.status, 201);
  assert.strictEqual(acqRes.body.success, true);
  const observationDto = acqRes.body.data;
  assert.ok(observationDto.imageId.startsWith('COPERNICUS/S2_SR_HARMONIZED/'));
  assert.strictEqual(observationDto.source, SatelliteSource.SENTINEL_2);
  console.info(`  ✅ Created Observation in MongoDB with ID: ${observationDto.id} (Image: ${observationDto.imageId})`);

  // Test 8: Duplicate observation prevention (idempotency)
  console.info('Test 8: Re-acquiring identical observation returns existing record without duplication');
  const initialCount = await SatelliteMetadata.countDocuments();
  const dupAcqRes = await request(
    'POST',
    '/api/satellite/acquire',
    {
      zoneId: testZoneId,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      maxCloudCover: 20,
    },
    adminToken,
  );
  assert.strictEqual(dupAcqRes.status, 201);
  const finalCount = await SatelliteMetadata.countDocuments();
  assert.strictEqual(finalCount, initialCount, 'Database record count must not increase on duplicate acquisition');
  assert.strictEqual(dupAcqRes.body.data.id, observationDto.id, 'Must return the existing observation record');
  console.info('  ✅ Duplicate prevention verified: returned existing record without DB duplication');

  console.log('\n--- 3. Ephemeral Temporary Processing & Guaranteed Cleanup ---');

  // Test 9: Temporary workspace creation and guaranteed cleanup on success
  console.info('Test 9: Temporary workspace cleanup on successful processing');
  let observedTempDir = '';
  const successResult = await TempImageManager.withTemporaryWorkspace('m8_test_success', async (tempDir) => {
    observedTempDir = tempDir;
    assert.ok(fsSync.existsSync(tempDir), 'Temporary directory must exist during execution');
    
    // Simulate writing temporary GeoTIFF tiles / intermediate raster files
    const dummyFile = path.join(tempDir, 'tile_b4_temp.tif');
    await fs.writeFile(dummyFile, Buffer.from('mock_geotiff_stream_data'));
    assert.ok(fsSync.existsSync(dummyFile));

    return 'processing_success_output';
  });

  assert.strictEqual(successResult, 'processing_success_output');
  assert.strictEqual(fsSync.existsSync(observedTempDir), false, 'Temporary directory must be deleted immediately after success');
  console.info('  ✅ Temporary directory and intermediate files automatically cleaned up on success');

  // Test 10: Temporary workspace cleanup on failure / exception
  console.info('Test 10: Temporary workspace cleanup on processing failure/exception');
  let failedTempDir = '';
  try {
    await TempImageManager.withTemporaryWorkspace('m8_test_fail', async (tempDir) => {
      failedTempDir = tempDir;
      const dummyFile = path.join(tempDir, 'crash_temp_data.bin');
      await fs.writeFile(dummyFile, Buffer.from('unprocessed_bytes'));
      throw new Error('Simulated GEE processing crash / network timeout');
    });
  } catch (err: any) {
    assert.strictEqual(err.message, 'Simulated GEE processing crash / network timeout');
  }

  assert.strictEqual(fsSync.existsSync(failedTempDir), false, 'Temporary directory must be deleted even when exception is thrown');
  console.info('  ✅ Temporary directory guaranteed deleted even after unhandled processing exception');

  console.log('\n--- 4. Provider Separation & Non-Silent Fallback Invariants ---');

  // Test 11: Real GEE provider vs Simulation provider isolation
  console.info('Test 11: Provider isolation check (Real GEE vs Test Simulation)');
  const simProvider = new SimulatedSatelliteProvider();
  assert.strictEqual(simProvider.providerName, 'TEST_SIMULATION_PROVIDER');
  assert.strictEqual(simProvider.isRealProvider, false);
  
  const acqService = new SatelliteAcquisitionService();
  assert.strictEqual(acqService.getProvider().providerName, 'REAL_GEE_PROVIDER');
  console.info('  ✅ SatelliteAcquisitionService uses REAL_GEE_PROVIDER by default');

  // Clean up
  server.close();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL 11 / 11 M8.2 GEE SATELLITE ACQUISITION TESTS PASSED!');
  console.log('================================================================\n');
}

runM82AcquisitionTests().catch((err) => {
  console.error('❌ M8.2 Test Failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
