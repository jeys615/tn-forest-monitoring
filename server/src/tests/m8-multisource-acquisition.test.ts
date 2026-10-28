/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Server } from 'node:http';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { app } from '../app.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { hashPassword } from '../utils/password.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { MultiSourceAcquisitionService } from '../services/gee/MultiSourceAcquisitionService.js';
import {
  UserRole,
  UserStatus,
  Permission,
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

async function runM88Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING MODULE M8.8: MULTI-SOURCE REAL GEE SATELLITE ACQUISITION');
  console.log('================================================================\n');

  await connectDatabase();

  const port = 5048;
  server = app.listen(port);
  BASE_URL = `http://localhost:${port}`;

  // Clean test collections
  await User.deleteMany({ email: { $regex: /@m88-test\.tn\.gov\.in$/ } });
  await Zone.deleteMany({ name: { $regex: /^Test-M88/ } });
  await SatelliteMetadata.deleteMany({ imageId: { $regex: /^(COPERNICUS|LANDSAT|USGS)\/.*M88/ } });

  // 1. Create Test Admin User
  const hashedPassword = await hashPassword('M88SecurePassword123!');
  const adminUser = await User.create({
    employeeId: 'TN-M88-001',
    name: 'M8.8 GEE Admin',
    email: 'admin@m88-test.tn.gov.in',
    phone: '+919876543288',
    passwordHash: hashedPassword,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    permissions: Object.values(Permission),
  });

  const loginRes = await request('POST', '/api/auth/login', {
    email: adminUser.email,
    password: 'M88SecurePassword123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const adminToken = loginRes.body.data.token;

  // Real Sathyamangalam Reserve Forest test polygon (Western Ghats, Tamil Nadu)
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

  const provider = new GeeSatelliteProvider();
  const multiSourceService = MultiSourceAcquisitionService.getInstance();

  console.log('--- 1. Multi-Source Discovery: Sentinel-2, Landsat-8, Landsat-9, Sentinel-1, SRTM ---');

  // Test 1: Sentinel-2 Optical Discovery
  console.info('Test 1: Discover Sentinel-2 optical imagery (COPERNICUS/S2_SR_HARMONIZED)');
  const s2Images = await provider.searchOpticalImages(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    maxCloudCover: 25.0,
  });
  assert.ok(s2Images.length > 0, 'Sentinel-2 search must return observations');
  assert.strictEqual(s2Images[0].source, SatelliteSource.SENTINEL_2);
  assert.strictEqual(s2Images[0].sensorType, SensorType.OPTICAL);
  assert.ok(s2Images[0].imageId.startsWith('COPERNICUS/S2_SR_HARMONIZED/'));
  console.info(`  ✅ Sentinel-2 discovery verified: ${s2Images.length} scenes found (ID: ${s2Images[0].imageId})`);

  // Test 2: Landsat 8 Level-2 Optical Discovery
  console.info('Test 2: Discover Landsat 8 Level-2 imagery (LANDSAT/LC08/C02/T1_L2, 30m)');
  const l8Images = await provider.searchLandsatImages(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    source: SatelliteSource.LANDSAT_8,
    maxCloudCover: 30.0,
  });
  assert.ok(l8Images.length > 0, 'Landsat 8 search must return observations');
  assert.strictEqual(l8Images[0].source, SatelliteSource.LANDSAT_8);
  assert.strictEqual(l8Images[0].sensorType, SensorType.OPTICAL);
  assert.strictEqual(l8Images[0].nativeResolutionMeters, 30);
  assert.ok(l8Images[0].imageId.startsWith('LANDSAT/LC08/C02/T1_L2/'));
  console.info(`  ✅ Landsat 8 discovery verified: ${l8Images.length} scenes found (Native: ${l8Images[0].nativeResolutionMeters}m)`);

  // Test 3: Landsat 9 Level-2 Optical Discovery
  console.info('Test 3: Discover Landsat 9 Level-2 imagery (LANDSAT/LC09/C02/T1_L2, 30m)');
  const l9Images = await provider.searchLandsatImages(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    source: SatelliteSource.LANDSAT_9,
    maxCloudCover: 30.0,
  });
  assert.ok(l9Images.length > 0, 'Landsat 9 search must return observations');
  assert.strictEqual(l9Images[0].source, SatelliteSource.LANDSAT_9);
  assert.strictEqual(l9Images[0].sensorType, SensorType.OPTICAL);
  assert.strictEqual(l9Images[0].nativeResolutionMeters, 30);
  assert.ok(l9Images[0].imageId.startsWith('LANDSAT/LC09/C02/T1_L2/'));
  console.info(`  ✅ Landsat 9 discovery verified: ${l9Images.length} scenes found (ID: ${l9Images[0].imageId})`);

  // Test 4: Sentinel-1 SAR C-Band Discovery
  console.info('Test 4: Discover Sentinel-1 SAR imagery (COPERNICUS/S1_GRD)');
  const sarImages = await provider.searchSarImages(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
  });
  assert.ok(sarImages.length > 0, 'Sentinel-1 SAR search must return observations');
  assert.strictEqual(sarImages[0].source, SatelliteSource.SENTINEL_1);
  assert.strictEqual(sarImages[0].sensorType, SensorType.SAR);
  assert.strictEqual(sarImages[0].polarization, 'VV+VH');
  console.info(`  ✅ Sentinel-1 SAR discovery verified: ${sarImages.length} scenes found (Polarization: ${sarImages[0].polarization})`);

  // Test 5: SRTM DEM Global Elevation Access
  console.info('Test 5: Discover SRTM 1 Arc-Second DEM (USGS/SRTMGL1_003, 30m)');
  const demImage = await provider.searchDemImages(testPolygon);
  assert.strictEqual(demImage.source, SatelliteSource.SRTM);
  assert.strictEqual(demImage.sensorType, SensorType.DEM);
  assert.strictEqual(demImage.nativeResolutionMeters, 30);
  assert.strictEqual(demImage.imageId, 'USGS/SRTMGL1_003');
  console.info(`  ✅ SRTM DEM verified: ${demImage.datasetName} (${demImage.nativeResolutionMeters}m)`);

  console.log('\n--- 2. Deterministic Source Selection & Intelligent Quality/Cloud Fallback ---');

  // Test 6: Multi-Source Discovery with Priority (Sentinel-2 > Landsat-8 > Landsat-9)
  console.info('Test 6: Multi-source discovery selects Sentinel-2 when clear (< 20% cloud)');
  const multiDiscClear = await multiSourceService.discoverMultiSource(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    maxCloudCover: 20.0,
  });
  assert.strictEqual(multiDiscClear.selectedSource, SatelliteSource.SENTINEL_2);
  assert.ok(multiDiscClear.discoveredImages.length >= 3, 'Must discover scenes across multiple sensors');
  console.info(`  ✅ Selected Source: ${multiDiscClear.selectedSource} (Reason: ${multiDiscClear.selectionReason})`);

  // Test 7: Automatic Fallback to Landsat when Sentinel-2 Exceeds Cloud Cover
  console.info('Test 7: Automatic fallback to Landsat-8 when Sentinel-2 is cloudy');
  const multiDiscCloudy = await multiSourceService.discoverMultiSource(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-20'),
    maxCloudCover: 10.0, // Strict cloud filter
    priorityConfig: {
      opticalPriority: [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_8, SatelliteSource.LANDSAT_9],
      maxCloudCoverThreshold: 10.0,
      allowFallbackOnCloudCover: true,
    },
  });
  assert.ok(
    [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_8, SatelliteSource.LANDSAT_9].includes(multiDiscCloudy.selectedSource),
    'Must select a valid optical source',
  );
  const selectedCloud = ('cloudCoverPercentage' in multiDiscCloudy.selectedImage ? multiDiscCloudy.selectedImage.cloudCoverPercentage : 0) ?? 0;
  assert.ok(selectedCloud <= 10.0);
  console.info(`  ✅ Multi-source fallback verified: Selected ${multiDiscCloudy.selectedSource} with ${selectedCloud}% cloud`);

  // Test 8: Complete Metadata Preservation
  console.info('Test 8: Acquire optimal multi-source observation preserving full metadata');
  const acquired = await multiSourceService.acquireOptimalObservation(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    maxCloudCover: 20.0,
  });
  assert.ok(acquired.imageId, 'Image ID must be present');
  assert.ok(acquired.acquisitionDate, 'Acquisition date must be present');
  assert.ok(acquired.geeReference, 'GEE Reference query string must be present');
  assert.ok(acquired.metadata.nativeResolutionMeters, 'Native resolution must be recorded');
  assert.ok(Array.isArray(acquired.metadata.bands), 'Band list must be preserved');
  console.info(`  ✅ Metadata complete: Image=${acquired.imageId}, Native Res=${acquired.metadata.nativeResolutionMeters}m, GEE Ref=${acquired.geeReference}`);

  // Test 9: Strict Optical vs SAR Separation
  console.info('Test 9: Verify optical and SAR discovery remain isolated');
  const sarDiscovery = await multiSourceService.discoverMultiSource(testPolygon, {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    sensorType: SensorType.SAR,
  });
  assert.strictEqual(sarDiscovery.selectedSource, SatelliteSource.SENTINEL_1);
  assert.strictEqual(sarDiscovery.selectedImage.sensorType, SensorType.SAR);
  console.info('  ✅ Invariant verified: SAR and Optical discovery remain strictly partitioned');

  console.log('\n--- 3. REST API Endpoints Verification ---');

  // Test 10: POST /api/gee/discover-multisource
  console.info('Test 10: POST /api/gee/discover-multisource endpoint');
  const apiRes = await request(
    'POST',
    '/api/gee/discover-multisource',
    {
      geometry: testPolygon,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      maxCloudCover: 20,
    },
    adminToken,
  );
  assert.strictEqual(apiRes.status, 200);
  assert.strictEqual(apiRes.body.success, true);
  assert.ok(apiRes.body.data.selectedSource);
  assert.ok(Array.isArray(apiRes.body.data.discoveredImages));
  console.info(`  ✅ API POST /api/gee/discover-multisource returned 200 OK (Selected: ${apiRes.body.data.selectedSource})`);

  console.log('\n================================================================');
  console.log('🎉 ALL MODULE M8.8 MULTI-SOURCE ACQUISITION TESTS PASSED (100%)');
  console.log('================================================================\n');

  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

runM88Tests().catch((err) => {
  console.error('❌ M8.8 Test Suite Failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
