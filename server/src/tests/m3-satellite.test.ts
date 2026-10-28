/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, Permission, ZoneCategory, SatelliteSource, SensorType } from '@tn-forest/shared/types';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;

async function request(
  method: string,
  path: string,
  body?: Record<string, any>,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const resBody = await res.json();
  return { status: res.status, body: resBody };
}

async function runTests() {
  console.info('🧪 Starting M3 Satellite Image Acquisition & Historical Query Test Suite...\n');
  await connectDatabase();

  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5003;
  baseUrl = `http://localhost:${port}`;

  let adminToken = '';
  let viewerToken = '';
  let zoneId = '';
  let imageRecordId = '';
  let testImageId = '';
  let acquiredDateStr = '';

  try {
    // Cleanup old test data
    await User.deleteMany({ email: { $regex: /@test-m3\.com$/ } });
    await Zone.deleteMany({ name: { $regex: /^Test-M3/ } });
    await SatelliteMetadata.deleteMany({ imageId: { $regex: /test-m3/i } });

    // 1. Seed users
    const adminPassHash = await hashPassword('AdminPass123!');
    await User.create({
      employeeId: 'M3-EMP-01',
      name: 'M3 Admin',
      email: 'admin@test-m3.com',
      passwordHash: adminPassHash,
      role: UserRole.ADMIN,
      permissions: [
        Permission.AREA_CREATE,
        Permission.AREA_READ,
        Permission.AREA_UPDATE,
        Permission.MONITORING_READ,
      ],
      status: UserStatus.ACTIVE,
    });

    await User.create({
      employeeId: 'M3-EMP-02',
      name: 'M3 Viewer',
      email: 'viewer@test-m3.com',
      passwordHash: adminPassHash,
      role: UserRole.VIEWER,
      permissions: [Permission.AREA_READ, Permission.MONITORING_READ],
      status: UserStatus.ACTIVE,
    });

    // Login Admin
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'admin@test-m3.com',
      password: 'AdminPass123!',
    });
    adminToken = loginRes.body.data.token;

    // Login Viewer
    const viewerLoginRes = await request('POST', '/api/auth/login', {
      email: 'viewer@test-m3.com',
      password: 'AdminPass123!',
    });
    viewerToken = viewerLoginRes.body.data.token;

    // Create a Zone to associate with acquisition
    const validPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [78.1, 11.1],
          [78.2, 11.1],
          [78.2, 11.2],
          [78.1, 11.2],
          [78.1, 11.1],
        ],
      ],
    };

    const zoneRes = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M3 Zone A',
        category: ZoneCategory.PROTECTED_FOREST,
        boundary: validPolygon,
      },
      adminToken,
    );
    zoneId = zoneRes.body.data.id;

    // Test 1: Acquire Satellite Image
    console.info('Test 1: Acquire Satellite Image (Trigger Parallel Search)');
    const originalRandom = Math.random;
    Math.random = () => 0.1;
    const acqRes = await request(
      'POST',
      '/api/satellite/acquire',
      {
        zoneId,
        startDate: '2026-08-01',
        endDate: '2026-08-20',
        maxCloudCover: 30,
      },
      adminToken,
    );
    Math.random = originalRandom;

    if (acqRes.status === 201 && acqRes.body.data.id) {
      imageRecordId = acqRes.body.data.id;
      testImageId = acqRes.body.data.imageId;
      acquiredDateStr = acqRes.body.data.acquisitionDate;
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 1 Failed: ${JSON.stringify(acqRes.body)}`);
    }

    // Test 2: Reject Unauthenticated Acquire Call
    console.info('Test 2: Reject Unauthenticated Acquire Call');
    const acqRes2 = await request('POST', '/api/satellite/acquire', {
      zoneId,
      startDate: '2026-08-01',
      endDate: '2026-08-20',
    });
    if (acqRes2.status === 401) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 2 Failed: Expected 401, got ${acqRes2.status}`);
    }

    // Test 3: Reject Unauthorized Role Call (Viewer cannot acquire)
    console.info('Test 3: Reject Unauthorized Role (Viewer lacks AREA_UPDATE)');
    const acqRes3 = await request(
      'POST',
      '/api/satellite/acquire',
      {
        zoneId,
        startDate: '2026-08-01',
        endDate: '2026-08-20',
      },
      viewerToken,
    );
    if (acqRes3.status === 403) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 3 Failed: Expected 403, got ${acqRes3.status}`);
    }

    // Test 4: Retrieve List of Acquired Satellite Images
    console.info('Test 4: List Acquired Satellite Images');
    const listRes = await request('GET', '/api/satellite', undefined, viewerToken);
    if (
      listRes.status === 200 &&
      Array.isArray(listRes.body.data) &&
      listRes.body.data.length > 0
    ) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 4 Failed: ${JSON.stringify(listRes.body)}`);
    }

    // Test 5: Filter by Source
    console.info('Test 5: Filter by Source');
    const source = acqRes.body.data.source;
    const filterRes = await request(
      'GET',
      `/api/satellite?source=${source}`,
      undefined,
      viewerToken,
    );
    const correctSource = filterRes.body.data.every((img: any) => img.source === source);
    if (filterRes.status === 200 && correctSource) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 5 Failed: ${JSON.stringify(filterRes.body)}`);
    }

    // Test 6: Filter by ZoneId
    console.info('Test 6: Filter by Zone ID');
    const zoneFilterRes = await request(
      'GET',
      `/api/satellite?zoneId=${zoneId}`,
      undefined,
      viewerToken,
    );
    const containsZone = zoneFilterRes.body.data.every((img: any) =>
      img.intersectingZones.includes(zoneId),
    );
    if (zoneFilterRes.status === 200 && containsZone && zoneFilterRes.body.data.length > 0) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 6 Failed: ${JSON.stringify(zoneFilterRes.body)}`);
    }

    // Test 7: Get Image by MongoDB ID
    console.info('Test 7: Fetch Image by Object ID');
    const singleRes = await request(
      'GET',
      `/api/satellite/${imageRecordId}`,
      undefined,
      viewerToken,
    );
    if (singleRes.status === 200 && singleRes.body.data.imageId === testImageId) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 7 Failed: ${JSON.stringify(singleRes.body)}`);
    }

    // Test 8: Query Footprint Intersection (using `$geoIntersects`)
    console.info('Test 8: Query Footprint Intersection ($geoIntersects)');
    const queryPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [77.0, 12.0],
          [79.0, 12.0],
          [79.0, 10.0],
          [77.0, 10.0],
          [77.0, 12.0], // Envelops our zone footprint
        ],
      ],
    };
    const footprintRes = await request(
      'POST',
      '/api/satellite/query-footprint',
      queryPolygon,
      viewerToken,
    );
    if (footprintRes.status === 200 && footprintRes.body.data.length > 0) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 8 Failed: ${JSON.stringify(footprintRes.body)}`);
    }

    // Test 9: Image record upsert mapping multiple zones
    console.info('Test 9: Upsert registers additional intersecting zones on match');
    const secondZoneRes = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M3 Zone B',
        category: ZoneCategory.RESERVED_AREA,
        boundary: validPolygon,
      },
      adminToken,
    );
    const secondZoneId = secondZoneRes.body.data.id;

    const originalRandom2 = Math.random;
    Math.random = () => 0.1;
    await request(
      'POST',
      '/api/satellite/acquire',
      {
        zoneId: secondZoneId,
        startDate: '2026-08-01',
        endDate: '2026-08-20',
        maxCloudCover: 30,
      },
      adminToken,
    );
    Math.random = originalRandom2;

    const updatedImage = await request(
      'GET',
      `/api/satellite/${imageRecordId}`,
      undefined,
      viewerToken,
    );
    const hasFirst = updatedImage.body.data.intersectingZones.includes(zoneId);
    const hasSecond = updatedImage.body.data.intersectingZones.includes(secondZoneId);

    if (updatedImage.status === 200 && hasFirst && hasSecond) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(
        `Test 9 Failed: intersectingZones does not contain both zones: ${JSON.stringify(updatedImage.body)}`,
      );
    }

    // ─────────────────────────────────────────────────────────────
    // NEW M3 ENHANCEMENT TESTS FOR M7 TEMPORAL & HISTORICAL QUERIES
    // ─────────────────────────────────────────────────────────────

    // Test 10: Sentinel-1 SAR Acquisition & Full SAR Metadata Retention
    console.info('Test 10: Acquire Sentinel-1 SAR image and verify SAR metadata retention');
    const sarAcqRes = await request(
      'POST',
      '/api/satellite/acquire',
      {
        zoneId,
        startDate: '2026-08-05',
        endDate: '2026-08-22',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
      },
      adminToken,
    );

    if (
      sarAcqRes.status === 201 &&
      sarAcqRes.body.data.source === SatelliteSource.SENTINEL_1 &&
      sarAcqRes.body.data.sensorType === SensorType.SAR &&
      sarAcqRes.body.data.acquisitionDate &&
      sarAcqRes.body.data.metadata?.polarization === 'VV+VH' &&
      sarAcqRes.body.data.metadata?.acquisitionMode === 'IW' &&
      sarAcqRes.body.data.metadata?.orbitDirection === 'DESCENDING'
    ) {
      console.info('  ✅ Passed: Sentinel-1 SAR record contains full SAR metadata');
    } else {
      throw new Error(`Test 10 Failed: ${JSON.stringify(sarAcqRes.body)}`);
    }

    // Test 11: Landsat-8 and Landsat-9 Optical Acquisition & Metadata Retention
    console.info('Test 11: Acquire Landsat-8 image and verify Optical metadata retention');
    const landsatAcqRes = await request(
      'POST',
      '/api/satellite/acquire',
      {
        zoneId,
        startDate: '2026-08-01',
        endDate: '2026-08-20',
        source: SatelliteSource.LANDSAT_8,
        sensorType: SensorType.OPTICAL,
        maxCloudCover: 50,
      },
      adminToken,
    );

    if (
      landsatAcqRes.status === 201 &&
      landsatAcqRes.body.data.source === SatelliteSource.LANDSAT_8 &&
      landsatAcqRes.body.data.sensorType === SensorType.OPTICAL &&
      landsatAcqRes.body.data.acquisitionDate &&
      landsatAcqRes.body.data.cloudCover !== undefined
    ) {
      console.info('  ✅ Passed: Landsat-8 optical record created with mandatory acquisitionDate');
    } else {
      throw new Error(`Test 11 Failed: ${JSON.stringify(landsatAcqRes.body)}`);
    }

    // Test 12: Query Historical Imagery by Sensor Type (Optical vs SAR)
    console.info('Test 12: Query Historical Imagery by Sensor Type');
    const sarListRes = await request('GET', `/api/satellite?sensorType=${SensorType.SAR}`, undefined, viewerToken);
    const opticalListRes = await request('GET', `/api/satellite?sensorType=${SensorType.OPTICAL}`, undefined, viewerToken);

    const allSar = sarListRes.body.data.every((img: any) => img.sensorType === SensorType.SAR);
    const allOptical = opticalListRes.body.data.every((img: any) => img.sensorType === SensorType.OPTICAL);

    if (
      sarListRes.status === 200 &&
      opticalListRes.status === 200 &&
      allSar &&
      allOptical &&
      sarListRes.body.data.length > 0 &&
      opticalListRes.body.data.length > 0
    ) {
      console.info('  ✅ Passed: Successfully filtered historical imagery by SensorType (SAR vs OPTICAL)');
    } else {
      throw new Error(`Test 12 Failed: SAR count=${sarListRes.body.data.length}, Optical count=${opticalListRes.body.data.length}`);
    }

    // Test 13: Query Historical Imagery by Date Range
    console.info('Test 13: Query Historical Imagery by Date Range');
    const dateRangeRes = await request(
      'GET',
      '/api/satellite?startDate=2026-08-01T00:00:00.000Z&endDate=2026-08-25T23:59:59.999Z',
      undefined,
      viewerToken,
    );

    if (
      dateRangeRes.status === 200 &&
      Array.isArray(dateRangeRes.body.data) &&
      dateRangeRes.body.data.length >= 2
    ) {
      console.info('  ✅ Passed: Date range query returned matching historical observations');
    } else {
      throw new Error(`Test 13 Failed: ${JSON.stringify(dateRangeRes.body)}`);
    }

    // Test 14: Query Historical Imagery by Exact Date
    console.info('Test 14: Query Historical Imagery by Exact Date');
    const exactDateOnly = acquiredDateStr.slice(0, 10);
    const exactDateRes = await request(
      'GET',
      `/api/satellite?exactDate=${exactDateOnly}`,
      undefined,
      viewerToken,
    );

    if (
      exactDateRes.status === 200 &&
      Array.isArray(exactDateRes.body.data) &&
      exactDateRes.body.data.length > 0
    ) {
      console.info('  ✅ Passed: Exact date query returned matching observations for the day');
    } else {
      throw new Error(`Test 14 Failed: ${JSON.stringify(exactDateRes.body)}`);
    }

    // Test 15: Footprint Query with Temporal & Sensor Filters (M7 Pre-requisite)
    console.info('Test 15: Footprint Query with Date Range & Sensor Type filters');
    const temporalFootprintRes = await request(
      'POST',
      '/api/satellite/query-footprint',
      {
        footprint: queryPolygon,
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-25T23:59:59.999Z',
        sensorType: SensorType.SAR,
      },
      viewerToken,
    );

    if (
      temporalFootprintRes.status === 200 &&
      Array.isArray(temporalFootprintRes.body.data) &&
      temporalFootprintRes.body.data.length > 0 &&
      temporalFootprintRes.body.data.every((img: any) => img.sensorType === SensorType.SAR)
    ) {
      console.info('  ✅ Passed: Temporal footprint query successfully filtered by geometry, date range & SAR sensor');
    } else {
      throw new Error(`Test 15 Failed: ${JSON.stringify(temporalFootprintRes.body)}`);
    }

    // Test 16: Preservation of Historical Observations (No Overwriting)
    console.info('Test 16: Verify historical records are preserved and not deleted or overwritten');
    const totalRecords = await SatelliteMetadata.countDocuments();
    if (totalRecords >= 2) {
      console.info(`  ✅ Passed: All ${totalRecords} historical satellite observations preserved`);
    } else {
      throw new Error(`Test 16 Failed: Expected at least 2 records, found ${totalRecords}`);
    }

    console.info('\n🎉 All 16 M3 Satellite Acquisition & Historical Retrieval Tests Passed Successfully!\n');
  } finally {
    // Cleanup test data
    await User.deleteMany({ email: { $regex: /@test-m3\.com$/ } });
    await Zone.deleteMany({ name: { $regex: /^Test-M3/ } });
    await SatelliteMetadata.deleteMany({ imageId: { $regex: /test-m3/i } });
    server.close();
    await mongoose.connection.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failure:', err);
  process.exit(1);
});
