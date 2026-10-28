import mongoose, { Types } from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { BaselineModel } from '../models/Baseline.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  SatelliteSource,
  SatelliteProcessingStatus,
  MonitoringJobType,
  MonitoringJobStatus,
  BaselineStatus,
  SensorType,
} from '@tn-forest/shared/types';
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
  process.env.PROCESSING_MODE = 'SIMULATED';
  console.info('🧪 Starting M4 Monitoring Scheduler & Processing Test Suite...\n');
  await connectDatabase();

  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5004;
  baseUrl = `http://localhost:${port}`;

  await User.deleteMany({});
  await Zone.deleteMany({});
  await SatelliteMetadata.deleteMany({});
  await MonitoringJobModel.deleteMany({});

  const superAdminPassword = await hashPassword('Test@1234');
  const superAdmin = await User.create({
    name: 'M4 Super Admin',
    email: 'm4admin@test.com',
    passwordHash: superAdminPassword,
    role: UserRole.SUPER_ADMIN,
    permissions: [Permission.MONITORING_READ, Permission.AREA_READ, Permission.AREA_UPDATE],
    status: UserStatus.ACTIVE,
  });

  const viewerPassword = await hashPassword('Test@1234');
  const viewer = await User.create({
    name: 'M4 Viewer',
    email: 'm4viewer@test.com',
    passwordHash: viewerPassword,
    role: UserRole.VIEWER,
    permissions: [],
    status: UserStatus.ACTIVE,
  });

  const loginAdminRes = await request('POST', '/api/auth/login', {
    email: 'm4admin@test.com',
    password: 'Test@1234',
  });
  const adminToken = loginAdminRes.body.data.token;

  const loginViewerRes = await request('POST', '/api/auth/login', {
    email: 'm4viewer@test.com',
    password: 'Test@1234',
  });
  const viewerToken = loginViewerRes.body.data.token;

  // Create a test zone
  const zoneData = {
    name: 'M4 Test Zone',
    category: ZoneCategory.PROTECTED_FOREST,
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [78.6, 11.1],
          [78.7, 11.1],
          [78.7, 11.2],
          [78.6, 11.2],
          [78.6, 11.1],
        ],
      ],
    },
  };
  const createZoneRes = await request('POST', '/api/zones', zoneData, adminToken);
  const testZoneId = createZoneRes.body.data.id;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.info(`  ✅ ${message}`);
      passed++;
    } else {
      console.error(`  ❌ ${message}`);
      failed++;
    }
  }

  try {
    console.info('\n--- M4 Monitoring Scheduler ---');

    // Test 1: Schedule Job (Viewer - unauthorized)
    const t1 = await request(
      'POST',
      '/api/monitoring/schedule',
      {
        type: MonitoringJobType.TARGETED_ACQUISITION,
        zoneId: testZoneId,
      },
      viewerToken,
    );
    assert(t1.status === 403, 'Viewer cannot schedule monitoring jobs (403)');

    // Test 2: Schedule Job (Admin)
    const t2 = await request(
      'POST',
      '/api/monitoring/schedule',
      {
        type: MonitoringJobType.TARGETED_ACQUISITION,
        zoneId: testZoneId,
      },
      adminToken,
    );
    assert(t2.status === 201, 'Admin can schedule a monitoring job');
    assert(t2.body.data.status === MonitoringJobStatus.PENDING, 'Job created in PENDING status');
    assert(!!t2.body.data.jobId, 'Job ID generated');
    const jobId = t2.body.data.id;

    // Test 3: List Jobs
    const t3 = await request('GET', '/api/monitoring/jobs', undefined, adminToken);
    assert(t3.status === 200, 'Can list jobs');
    assert(t3.body.data.length >= 1, 'Job list includes the new job');

    // Test 4: Get Job by ID
    const t4 = await request('GET', `/api/monitoring/jobs/${jobId}`, undefined, adminToken);
    assert(t4.status === 200, 'Can fetch specific job');
    assert(t4.body.data.id === jobId, 'Job ID matches');

    console.info('\n--- M4 Local Image Processing Workflow ---');

    const baselineMeta = await SatelliteMetadata.create({
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20240101T050221_T44PMT',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2024-01-01T05:00:00Z'),
      cloudCover: 5.0,
      footprint: zoneData.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'test',
      intersectingZones: [testZoneId],
    });

    await BaselineModel.create({
      zoneId: new Types.ObjectId(testZoneId),
      satelliteMetadataId: baselineMeta._id,
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: baselineMeta.acquisitionDate,
      status: BaselineStatus.ACTIVE,
      isActive: true,
      qualityScore: 95,
      cloudCover: 5.0,
      validPixelPercentage: 95.0,
      selectionReason: 'Test baseline',
    });

    // We need a current SatelliteMetadata record acquired after baseline
    await SatelliteMetadata.create({
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20240105T050221_T44PMT',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2024-01-05T05:00:00Z'),
      cloudCover: 10.0,
      footprint: zoneData.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'test',
      intersectingZones: [testZoneId],
    });

    // Test 5: Process Job (Local ML simulation)
    console.info('  ⏳ Triggering local image processing (simulated ML delay...)');
    const t5 = await request(
      'POST',
      `/api/monitoring/jobs/${jobId}/process`,
      undefined,
      adminToken,
    );
    assert(t5.status === 200, 'Job successfully processed');
    assert(t5.body.data.status === MonitoringJobStatus.COMPLETED, 'Job status is COMPLETED');
    assert(
      t5.body.data.results !== undefined,
      'Job contains computational results (NDVI, CloudCover, AnomalyScore)',
    );
    assert(typeof t5.body.data.results.ndviMean === 'number', 'NDVI mean calculated successfully');

    // Test 6: Prevent reprocessing completed job
    const t6 = await request(
      'POST',
      `/api/monitoring/jobs/${jobId}/process`,
      undefined,
      adminToken,
    );
    assert(t6.status === 400, 'Cannot re-process an already completed job (400)');
  } catch (error) {
    console.error('Test execution failed:', error);
    failed++;
  } finally {
    server.close();
    await mongoose.connection.close();
    console.info(`\n📊 M4 Test Summary: ${passed} passed, ${failed} failed.\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
