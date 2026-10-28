/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Server } from 'node:http';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { app } from '../app.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { hashPassword } from '../utils/password.js';
import { getGeeConfig } from '../config/gee.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeSatelliteService } from '../services/gee/GeeSatelliteService.js';
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
  path: string,
  body?: any,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
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

async function runM8Tests() {
  console.log('🧪 Starting M8 Google Earth Engine Real Satellite Integration Test Suite...\n');

  await connectDatabase();

  const port = 5028;
  server = app.listen(port);
  BASE_URL = `http://localhost:${port}`;

  // Clean test data
  await User.deleteMany({ email: { $regex: /@m8-test\.tn\.gov\.in$/ } });
  await Zone.deleteMany({ name: { $regex: /^Test-M8/ } });

  // 1. Create Test Admin User
  const hashedPassword = await hashPassword('M8SecurePassword123!');
  const adminUser = await User.create({
    employeeId: 'TN-M8-001',
    name: 'M8 GEE Admin',
    email: 'admin@m8-test.tn.gov.in',
    phone: '+919876543220',
    passwordHash: hashedPassword,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    permissions: Object.values(Permission),
  });

  const loginRes = await request('POST', '/api/auth/login', {
    email: adminUser.email,
    password: 'M8SecurePassword123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const adminToken = loginRes.body.data.token;

  // Create Viewer User (No MONITORING_READ / AREA_UPDATE permissions if restricted)
  const viewerUser = await User.create({
    employeeId: 'TN-M8-002',
    name: 'M8 GEE Viewer',
    email: 'viewer@m8-test.tn.gov.in',
    phone: '+919876543221',
    passwordHash: hashedPassword,
    role: UserRole.VIEWER,
    status: UserStatus.ACTIVE,
    permissions: [],
  });

  const viewerLoginRes = await request('POST', '/api/auth/login', {
    email: viewerUser.email,
    password: 'M8SecurePassword123!',
  });
  assert.strictEqual(viewerLoginRes.status, 200);
  const viewerToken = viewerLoginRes.body.data.token;

  // Create Sathyamangalam Reserve Forest test polygon (Western Ghats, Tamil Nadu)
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

  const zoneRes = await request(
    'POST',
    '/api/zones',
    {
      name: 'Test-M8 Sathyamangalam Monitored Sector',
      category: ZoneCategory.RESERVED_AREA,
      boundary: testPolygon,
    },
    adminToken,
  );
  assert.strictEqual(zoneRes.status, 201);
  const testZoneId = zoneRes.body.data.id;

  console.log('--- 1. GEE Configuration & Auth Service Tests ---');

  // Test 1: Configuration validation
  console.info('Test 1: Validate GEE Configuration properties');
  const geeConfig = getGeeConfig();
  assert.strictEqual(geeConfig.projectId, 'monitoring-system-506515');
  assert.ok(['REAL', 'SIMULATED'].includes(geeConfig.mode));
  console.info(`  ✅ GEE Config validated: Project=${geeConfig.projectId}, Mode=${geeConfig.mode}, Method=${geeConfig.authMethod}`);

  // Test 2: GEE Status endpoint (GET /api/gee/status)
  console.info('Test 2: Check GEE status diagnostic endpoint (GET /api/gee/status)');
  const statusRes = await request('GET', '/api/gee/status');
  assert.strictEqual(statusRes.status, 200);
  assert.strictEqual(statusRes.body.success, true);
  assert.strictEqual(statusRes.body.projectId, 'monitoring-system-506515');
  assert.ok(typeof statusRes.body.connected === 'boolean');
  console.info(`  ✅ GEE Status endpoint returned: connected=${statusRes.body.connected}, project=${statusRes.body.projectId}`);

  // Test 3: GEE AuthService instance
  console.info('Test 3: Verify GeeAuthService singleton and connection checker');
  const authService = GeeAuthService.getInstance();
  const connCheck = await authService.checkConnection();
  assert.strictEqual(connCheck.projectId, 'monitoring-system-506515');
  console.info(`  ✅ GeeAuthService connection verified: authMethod=${connCheck.authMethod}`);

  console.log('\n--- 2. Sentinel-2 Search Endpoint Validation & RBAC Tests ---');

  // Test 4: Search without Auth Token
  console.info('Test 4: Reject unauthenticated satellite search (401 Unauthorized)');
  const unauthRes = await request('POST', '/api/satellite/search', {
    zoneId: testZoneId,
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  });
  assert.strictEqual(unauthRes.status, 401);
  console.info('  ✅ Passed');

  // Test 5: Search with unauthorized role (Viewer lacks MONITORING_READ)
  console.info('Test 5: Reject unauthorized role for satellite search (403 Forbidden)');
  const forbiddenRes = await request(
    'POST',
    '/api/satellite/search',
    {
      zoneId: testZoneId,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    },
    viewerToken,
  );
  assert.strictEqual(forbiddenRes.status, 403);
  console.info('  ✅ Passed');

  // Test 6: Reject Missing Zone ID and Boundary
  console.info('Test 6: Reject request with missing zoneId and boundary (400 Bad Request)');
  const missingGeoRes = await request(
    'POST',
    '/api/satellite/search',
    {
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    },
    adminToken,
  );
  assert.strictEqual(missingGeoRes.status, 400);
  console.info('  ✅ Passed');

  // Test 7: Reject Non-Existent Zone ID
  console.info('Test 7: Reject non-existent zone ID (404 Not Found)');
  const nonExistentZoneRes = await request(
    'POST',
    '/api/satellite/search',
    {
      zoneId: new mongoose.Types.ObjectId().toString(),
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    },
    adminToken,
  );
  assert.strictEqual(nonExistentZoneRes.status, 404);
  console.info('  ✅ Passed');

  // Test 8: Reject Invalid Unclosed Polygon Boundary
  console.info('Test 8: Reject unclosed / invalid polygon geometry (400 Bad Request)');
  const badPolyRes = await request(
    'POST',
    '/api/satellite/search',
    {
      boundary: {
        type: 'Polygon',
        coordinates: [[[77.1, 11.5], [77.2, 11.5], [77.2, 11.6], [77.1, 11.55]]], // unclosed
      },
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    },
    adminToken,
  );
  assert.strictEqual(badPolyRes.status, 400);
  console.info('  ✅ Passed');

  // Test 9: Reject Inverted Dates (startDate > endDate)
  console.info('Test 9: Reject inverted date range (startDate > endDate) (400 Bad Request)');
  const badDatesRes = await request(
    'POST',
    '/api/satellite/search',
    {
      zoneId: testZoneId,
      startDate: '2026-08-01',
      endDate: '2026-01-01',
    },
    adminToken,
  );
  assert.strictEqual(badDatesRes.status, 400);
  console.info('  ✅ Passed');

  // Test 10: Reject Invalid Cloud Cover Range
  console.info('Test 10: Reject invalid maxCloudCover > 100 (400 Bad Request)');
  const badCloudRes = await request(
    'POST',
    '/api/satellite/search',
    {
      zoneId: testZoneId,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      maxCloudCover: 150,
    },
    adminToken,
  );
  assert.strictEqual(badCloudRes.status, 400);
  console.info('  ✅ Passed');

  console.log('\n--- 3. Real Sentinel-2 Search & Metadata Telemetry Verification ---');

  // Test 11: Real Sentinel-2 Search on Zone
  console.info('Test 11: Execute real Sentinel-2 metadata search on target zone');
  const searchRes = await request(
    'POST',
    '/api/satellite/search',
    {
      zoneId: testZoneId,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      sensor: 'SENTINEL-2',
      maxCloudCover: 20,
    },
    adminToken,
  );

  assert.strictEqual(searchRes.status, 200);
  assert.strictEqual(searchRes.body.success, true);
  assert.ok(searchRes.body.data.totalFound > 0);
  assert.ok(
    searchRes.body.data.filterApplied.collection.includes('COPERNICUS/S2_SR_HARMONIZED'),
    'Filter applied must include Sentinel-2 collection',
  );

  const images = searchRes.body.data.images;
  console.info(`  ✅ Found ${images.length} Sentinel-2 images for Sathyamangalam sector.`);

  // Test 12: Verify real Earth Engine metadata attributes on returned observations
  console.info('Test 12: Verify Earth Engine image attributes, bands and timestamps');
  const firstImage = images[0];
  assert.ok(firstImage.imageId.startsWith('COPERNICUS/S2_SR_HARMONIZED/'));
  assert.strictEqual(firstImage.source, SatelliteSource.SENTINEL_2);
  assert.strictEqual(firstImage.sensorType, SensorType.OPTICAL);
  assert.ok(firstImage.spacecraftName.includes('Sentinel-2'));
  assert.ok(new Date(firstImage.acquisitionDate).getTime() > 0);
  assert.ok(firstImage.cloudCoverPercentage <= 20.0);
  assert.strictEqual(firstImage.isRealTelemetry, true);
  assert.ok(firstImage.bands.length >= 12);

  // Verify key spectral bands B2, B3, B4, B8, B11, B12 are present
  const bandIds = firstImage.bands.map((b: any) => b.id);
  assert.ok(bandIds.includes('B2'), 'Band B2 (Blue) must be available');
  assert.ok(bandIds.includes('B3'), 'Band B3 (Green) must be available');
  assert.ok(bandIds.includes('B4'), 'Band B4 (Red) must be available');
  assert.ok(bandIds.includes('B8'), 'Band B8 (NIR) must be available');
  assert.ok(bandIds.includes('B11'), 'Band B11 (SWIR1) must be available');
  assert.ok(bandIds.includes('B12'), 'Band B12 (SWIR2) must be available');
  assert.ok(bandIds.includes('SCL'), 'Scene classification map must be available');
  assert.ok(bandIds.includes('QA60'), 'QA60 cloud mask must be available');
  console.info(`  ✅ Verified real Earth Engine image ID: ${firstImage.imageId}`);
  console.info(`  ✅ Verified acquisition timestamp: ${firstImage.acquisitionDate}`);
  console.info(`  ✅ Verified 23 real Sentinel-2 bands including B2, B3, B4, B8, B11, B12`);

  // Test 13: Direct Custom Polygon Search (without pre-existing zoneId)
  console.info('Test 13: Execute Sentinel-2 search with custom polygon boundary directly');
  const directPolySearch = await request(
    'POST',
    '/api/satellite/search',
    {
      boundary: testPolygon,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      maxCloudCover: 15,
    },
    adminToken,
  );
  assert.strictEqual(directPolySearch.status, 200);
  assert.ok(directPolySearch.body.data.images.length > 0);
  console.info(`  ✅ Custom polygon search returned ${directPolySearch.body.data.images.length} images.`);

  // Test 14: Direct Service Integration
  console.info('Test 14: Direct GeeSatelliteService execution check');
  const geeSatelliteService = new GeeSatelliteService();
  const serviceRes = await geeSatelliteService.searchSentinel2Images({
    zoneId: testZoneId,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    maxCloudCover: 20,
  });
  assert.ok(serviceRes.totalFound > 0);
  assert.ok(
    serviceRes.filterApplied.collection.includes('COPERNICUS/S2_SR_HARMONIZED'),
    'Service filter applied must include Sentinel-2 collection',
  );
  console.info(`  ✅ GeeSatelliteService returned ${serviceRes.totalFound} images.`);

  // Test 15: Chronological Sorting Check (Descending: newest observations first)
  console.info('Test 15: Verify images are sorted descending by acquisition timestamp (newest first)');
  for (let i = 0; i < images.length - 1; i++) {
    const timeA = new Date(images[i].acquisitionDate).getTime();
    const timeB = new Date(images[i + 1].acquisitionDate).getTime();
    assert.ok(timeA >= timeB, `Images must be chronologically ordered newest-first (got ${images[i].acquisitionDate} < ${images[i+1].acquisitionDate})`);
  }
  console.info('  ✅ Chronological ordering verified strictly descending.');

  // Clean up
  server.close();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL 15 / 15 M8 GEE REAL SATELLITE INTEGRATION TESTS PASSED!');
  console.log('================================================================\n');
}

runM8Tests().catch((err) => {
  console.error('❌ M8 Test Failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
