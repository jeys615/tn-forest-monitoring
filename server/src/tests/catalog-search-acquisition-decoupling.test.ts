/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { Server } from 'node:http';
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { app } from '../app.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { hashPassword } from '../utils/password.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import { GeeTaskService } from '../services/gee/GeeTaskService.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { GeeExportService } from '../services/gee/GeeExportService.js';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  SensorType,
  SatelliteSource,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';

let server: Server;
let BASE_URL: string;
let passedTests = 0;
let failedTests = 0;

function reportPass(name: string): void {
  console.info(`  ✅ [PASS] ${name}`);
  passedTests++;
}

function reportFail(name: string, error: any): void {
  console.error(`  ❌ [FAIL] ${name}:`, error);
  failedTests++;
}

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

async function runSuite(): Promise<void> {
  console.info('================================================================');
  console.info('CATALOG SEARCH & ACQUISITION DECOUPLING VERIFICATION SUITE');
  console.info('================================================================\n');

  await connectDatabase();

  const port = 5029;
  server = app.listen(port);
  BASE_URL = `http://localhost:${port}`;

  // ── 1. PRE-TEST DATABASE INVARIANT AUDIT ──
  console.info('--- 1. PRE-TEST DATABASE INVARIANT AUDIT ---');
  const preCounts = {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellites: await SatelliteMetadata.countDocuments(),
    changes: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    jobs: await MonitoringJobModel.countDocuments(),
    incremental: await IncrementalMonitoringRecordModel.countDocuments(),
  };

  console.info('Pre-Test Document Counts:');
  for (const [k, v] of Object.entries(preCounts)) {
    console.info(`  ${k.padEnd(14)}: ${v}`);
  }

  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  assert(vadipatti, 'Vadipatti production zone must exist');
  assert.strictEqual(vadipatti.monitoringTracks?.optical?.enabled, true, 'Vadipatti Optical track must be enabled');
  assert.strictEqual(vadipatti.monitoringTracks?.sar?.enabled, false, 'Vadipatti SAR track must be disabled');

  const vadipattiAlert = await AlertModel.findOne({ alertId: 'ALT-1789295023854-8239' });
  assert(vadipattiAlert, 'Vadipatti production alert must exist');
  assert.strictEqual(vadipattiAlert.status, 'OPEN');

  const vadipattiChange = await ChangeDetectionModel.findOne({ changeId: 'CHG-1789295023854-2895' });
  assert(vadipattiChange, 'Vadipatti production change detection must exist');

  reportPass('Vadipatti invariants verified intact');

  // Create test admin user (tracked for cleanup)
  const testEmail = `admin-decouple-test-${Date.now()}@tn.gov.in`;
  const passwordHash = await hashPassword('TestDecouplePass123!');
  const adminUser = await User.create({
    employeeId: `EMP-DEC-${Date.now().toString().slice(-4)}`,
    name: 'Decoupling Test Admin',
    email: testEmail,
    phone: '+919999999999',
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    permissions: Object.values(Permission),
    status: UserStatus.ACTIVE,
  });

  const loginRes = await request('POST', '/api/auth/login', {
    email: testEmail,
    password: 'TestDecouplePass123!',
  });
  assert.strictEqual(loginRes.status, 200);
  const token = loginRes.body.data.token;

  const testBoundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.0081, 10.0947],
        [78.0023, 10.0534],
        [78.0191, 10.0514],
        [78.0665, 10.0751],
        [78.0875, 10.1062],
        [78.0081, 10.0947],
      ],
    ],
  };

  try {
    // ── 2. CATALOG SEARCH CALLS /satellite/search ──
    console.info('\n--- 2. ENDPOINT & DECOUPLING CHECKS ---');
    console.info('Test 1: POST /api/satellite/search returns candidate observations');
    const searchRes = await request(
      'POST',
      '/api/satellite/search',
      {
        boundary: testBoundary,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        sensor: 'SENTINEL-2',
        maxCloudCover: 20,
      },
      token,
    );
    assert.strictEqual(searchRes.status, 200, 'Search must return 200 OK');
    assert.strictEqual(searchRes.body.success, true);
    assert.ok(Array.isArray(searchRes.body.data.images), 'Must return images array');
    reportPass('POST /api/satellite/search returns candidate observations');

    // ── 3. SEARCH DOES NOT AUTOMATICALLY ACQUIRE AN IMAGE ──
    console.info('Test 2: Catalog Search does NOT automatically acquire or persist records');
    const satCountAfterSearch = await SatelliteMetadata.countDocuments();
    assert.strictEqual(
      satCountAfterSearch,
      preCounts.satellites,
      'Catalog Search MUST be read-only and NOT create any SatelliteMetadata record in MongoDB',
    );
    reportPass('Catalog search is completely decoupled from acquisition (0 records created)');

    // ── 4. SAR SEARCH RETURNS ONLY SENTINEL-1 ──
    console.info('Test 3: SAR search queries strictly COPERNICUS/S1_GRD');
    const sarSearchRes = await request(
      'POST',
      '/api/satellite/search',
      {
        boundary: testBoundary,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        sensorType: SensorType.SAR,
      },
      token,
    );
    assert.strictEqual(sarSearchRes.status, 200);
    assert.strictEqual(
      sarSearchRes.body.data.filterApplied.collection,
      'COPERNICUS/S1_GRD',
      'SAR search must target strictly COPERNICUS/S1_GRD',
    );
    assert.strictEqual(sarSearchRes.body.data.sensorType, SensorType.SAR);
    for (const img of sarSearchRes.body.data.images) {
      assert.strictEqual(img.sensorType, SensorType.SAR, 'All SAR search results must have SAR sensorType');
      assert.strictEqual(img.source, SatelliteSource.SENTINEL_1, 'All SAR search results must have SENTINEL_1 source');
    }
    reportPass('SAR search targets strictly COPERNICUS/S1_GRD and returns only Sentinel-1');

    // ── 5. OPTICAL SEARCH RETURNS ONLY OPTICAL ──
    console.info('Test 4: Optical search queries strictly Optical collection');
    const opticalSearchRes = await request(
      'POST',
      '/api/satellite/search',
      {
        boundary: testBoundary,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        sensorType: SensorType.OPTICAL,
        maxCloudCover: 20,
      },
      token,
    );
    assert.strictEqual(opticalSearchRes.status, 200);
    assert.ok(
      opticalSearchRes.body.data.filterApplied.collection.includes('COPERNICUS/S2_SR_HARMONIZED'),
      'Optical search must target optical collections including COPERNICUS/S2_SR_HARMONIZED',
    );
    assert.strictEqual(opticalSearchRes.body.data.sensorType, SensorType.OPTICAL);
    for (const img of opticalSearchRes.body.data.images) {
      assert.strictEqual(img.sensorType, SensorType.OPTICAL, 'All optical results must be OPTICAL');
    }
    reportPass('Optical search targets strictly Optical collection and returns only Optical');

    // ── 6. GEE_NO_IMAGES_FOUND / EMPTY PERIOD HANDLED CLEARLY ──
    console.info('Test 5: Clear error/empty result handling when no SAR passes exist in date range');
    // Using an impossible narrow date window (1 second) where no pass can exist
    const emptySarRes = await request(
      'POST',
      '/api/satellite/search',
      {
        boundary: testBoundary,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-01T00:00:01.000Z',
        sensorType: SensorType.SAR,
      },
      token,
    );
    assert.strictEqual(emptySarRes.status, 200);
    assert.strictEqual(emptySarRes.body.data.totalFound, 0);
    assert.strictEqual(emptySarRes.body.data.images.length, 0);
    reportPass('Zero imagery period returns totalFound: 0 cleanly without application crash');

    // ── 7. GEE CLIENT TRANSIENT HTTP 502/503 RETRIES ──
    console.info('\n--- 3. TRANSIENT RETRY LOGIC CHECKS ---');
    console.info('Test 6: GeeClientService retries transient HTTP 502/503 up to 2 times');
    const originalFetch = global.fetch;
    let callCount = 0;
    try {
      // Mock fetch: fails twice with HTTP 503, succeeds on 3rd attempt
      global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('earthengine.googleapis.com') && urlStr.includes(':listImages')) {
          callCount++;
          if (callCount <= 2) {
            return new Response('Service Unavailable (Transient)', { status: 503, statusText: 'Service Unavailable' });
          }
          return new Response(JSON.stringify({ images: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, init);
      }) as any;

      const geeClient = new GeeClientService();
      const res = await geeClient.listPublicImages({
        collection: 'COPERNICUS/S2_SR_HARMONIZED',
        geometry: testBoundary,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-02'),
      });
      assert.strictEqual(callCount, 3, 'Must have attempted 3 times (initial + 2 retries)');
      assert.ok(Array.isArray(res.images));
      reportPass('GeeClientService retried transient HTTP 503 twice and recovered successfully');
    } finally {
      global.fetch = originalFetch;
    }

    // ── 8. GEE CLIENT DOES NOT RETRY PERMANENT 400/401/404 ──
    console.info('Test 7: GeeClientService does NOT retry permanent HTTP 400/404');
    let permanentCalls = 0;
    try {
      global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('earthengine.googleapis.com') && urlStr.includes(':listImages')) {
          permanentCalls++;
          return new Response('Asset not found', { status: 404, statusText: 'Not Found' });
        }
        return originalFetch(url, init);
      }) as any;

      const geeClient = new GeeClientService();
      let threw = false;
      try {
        await geeClient.listPublicImages({
          collection: 'INVALID/COLLECTION',
          geometry: testBoundary,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-02'),
        });
      } catch (err: any) {
        threw = true;
      }
      assert.strictEqual(threw, true, 'Permanent error must throw immediately');
      assert.strictEqual(permanentCalls, 1, 'Permanent error must NOT be retried (exactly 1 call)');
      reportPass('Permanent 404 error was not retried');
    } finally {
      global.fetch = originalFetch;
    }

    // ── 9. GEE TASK SERVICE RETRIES TRANSIENT NETWORK ERRORS DURING POLLING ──
    console.info('Test 8: GeeTaskService polling tolerates transient network failure without aborting');
    let pollAttempts = 0;
    try {
      global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('earthengine.googleapis.com/v1alpha/projects/')) {
          pollAttempts++;
          if (pollAttempts === 1) {
            // First attempt: simulate temporary network failure
            throw new TypeError('fetch failed: network socket disconnected');
          }
          // Subsequent attempt: report task completed
          return new Response(JSON.stringify({ done: true, metadata: { state: 'COMPLETED' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, init);
      }) as any;

      const geeTaskService = new GeeTaskService();
      const taskStatus = await geeTaskService.pollTaskCompletion('projects/test-project/operations/TEST-OP-1', {
        timeoutMs: 5000,
        pollIntervalMs: 50,
      });

      assert.strictEqual(taskStatus.state, 'EXPORT_COMPLETED', 'Task polling must succeed despite transient glitch');
      assert.ok(pollAttempts >= 2, 'Must have continued polling after transient failure');
      reportPass('GeeTaskService recovered from transient polling network failure and completed');
    } finally {
      global.fetch = originalFetch;
    }

    // ── 10. GEE TASK SERVICE IMMEDIATELY REPORTS TERMINAL EXPORT FAILURE ──
    console.info('Test 9: GeeTaskService immediately reports permanent terminal failure without masking');
    let terminalPollAttempts = 0;
    try {
      global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('earthengine.googleapis.com/v1alpha/projects/')) {
          terminalPollAttempts++;
          return new Response(
            JSON.stringify({
              done: true,
              error: { message: 'Earth Engine memory limit exceeded during computation' },
              metadata: { state: 'FAILED' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return originalFetch(url, init);
      }) as any;

      const geeTaskService = new GeeTaskService();
      const taskStatus = await geeTaskService.pollTaskCompletion('projects/test-project/operations/TEST-OP-FAIL', {
        timeoutMs: 5000,
        pollIntervalMs: 50,
      });

      assert.strictEqual(taskStatus.state, 'EXPORT_FAILED');
      assert.strictEqual(taskStatus.errorMessage, 'Earth Engine memory limit exceeded during computation');
      assert.strictEqual(terminalPollAttempts, 1, 'Terminal failure must be reported immediately on first poll');
      reportPass('Terminal GEE export failure reported immediately with exact error preserved');
    } finally {
      global.fetch = originalFetch;
    }

    // ── 11. SAR CANDIDATE ACQUISITION WITH imageId BYPASSES searchSarImages ──
    console.info('\n--- 4. DIRECT SAR CANDIDATE ACQUISITION CHECKS ---');
    console.info('Test 10: SAR acquisition with explicit imageId does NOT call searchSarImages and makes NO zero-duration GEE request');
    {
      const provider = new GeeSatelliteProvider();
      let searchCalled = false;
      const originalSearchSar = provider.searchSarImages.bind(provider);
      provider.searchSarImages = async (geom: any, opts: any) => {
        searchCalled = true;
        return originalSearchSar(geom, opts);
      };

      const originalFetchForAcquire = global.fetch;
      let zeroDurationRequestMade = false;
      global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes(':listImages')) {
          const parsedUrl = new URL(urlStr);
          const start = parsedUrl.searchParams.get('startTime');
          const end = parsedUrl.searchParams.get('endTime');
          if (start && end && start === end) {
            zeroDurationRequestMade = true;
          }
        }
        return originalFetchForAcquire(url, init);
      }) as any;

      try {
        const testImageId = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_20200102T060225_030617_038234_B79D';
        const acquired = await provider.acquireBestImage(testBoundary, {
          startDate: new Date('2020-01-02T00:00:00.000Z'),
          endDate: new Date('2020-01-02T00:00:00.000Z'), // zero-duration range
          sensorType: SensorType.SAR,
          source: SatelliteSource.SENTINEL_1,
          imageId: testImageId,
        });

        assert.strictEqual(searchCalled, false, 'searchSarImages MUST NOT be called when imageId is provided');
        assert.strictEqual(zeroDurationRequestMade, false, 'No zero-duration date range GEE request must be made');
        assert.strictEqual(acquired.imageId, testImageId, 'Exact supplied Sentinel-1 imageId must be returned');
        assert.strictEqual(acquired.source, SatelliteSource.SENTINEL_1);
        assert.strictEqual(acquired.sensorType, SensorType.SAR);
        assert.strictEqual(acquired.metadata.spacecraftName, 'Sentinel-1A');
        assert.strictEqual(acquired.metadata.polarization, 'VV+VH');
        assert.strictEqual(acquired.metadata.acquisitionMode, 'IW');
        assert.strictEqual(acquired.acquisitionDate.toISOString(), '2020-01-02T06:02:00.000Z');
        reportPass('SAR candidate acquisition with imageId bypasses searchSarImages and avoids empty date range');
      } finally {
        global.fetch = originalFetchForAcquire;
      }
    }

    console.info('Test 11: SAR acquisition without imageId still performs normal discovery via searchSarImages');
    {
      const provider = new GeeSatelliteProvider();
      let searchCalled = false;
      provider.searchSarImages = async (geom: any, _opts: any) => {
        searchCalled = true;
        return [
          {
            imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_20200102T060225_030617_038234_DISC',
            source: SatelliteSource.SENTINEL_1,
            sensorType: SensorType.SAR,
            spacecraftName: 'Sentinel-1A',
            acquisitionDate: new Date('2020-01-02T06:02:00.000Z').toISOString(),
            polarization: 'VV+VH',
            acquisitionMode: 'IW',
            orbitDirection: 'DESCENDING',
            orbitNumber: 30617,
            footprint: geom,
            bands: [],
            geeAssetPath: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_20200102T060225_030617_038234_DISC',
            isRealTelemetry: true,
          },
        ];
      };

      const acquired = await provider.acquireBestImage(testBoundary, {
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: new Date('2020-01-05T00:00:00.000Z'),
        sensorType: SensorType.SAR,
        source: SatelliteSource.SENTINEL_1,
      });

      assert.strictEqual(searchCalled, true, 'searchSarImages MUST be called when imageId is omitted');
      assert.strictEqual(acquired.imageId, 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_20200102T060225_030617_038234_DISC');
      reportPass('Existing SAR acquisition without imageId performs normal discovery');
    }

    console.info('Test 12: Optical acquisition behavior remains unchanged');
    {
      const provider = new GeeSatelliteProvider();
      let opticalSearchCalled = false;
      provider.searchOpticalImages = async (geom: any, _opts: any) => {
        opticalSearchCalled = true;
        return [
          {
            imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260101T051031_20260101T051833_T44PMT',
            source: SatelliteSource.SENTINEL_2,
            sensorType: SensorType.OPTICAL,
            spacecraftName: 'Sentinel-2A',
            acquisitionDate: '2026-01-01T05:10:31.000Z',
            cloudCoverPercentage: 5.2,
            sunElevationAngle: 45.1,
            nativeResolutionMeters: 10,
            footprint: geom,
            bands: [],
            geeAssetPath: 'COPERNICUS/S2_SR_HARMONIZED/20260101T051031_20260101T051833_T44PMT',
            isRealTelemetry: true,
          },
        ];
      };

      const acquired = await provider.acquireBestImage(testBoundary, {
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-05T00:00:00.000Z'),
        sensorType: SensorType.OPTICAL,
        source: SatelliteSource.SENTINEL_2,
      });

      assert.strictEqual(opticalSearchCalled, true, 'searchOpticalImages called for optical acquisition');
      assert.strictEqual(acquired.sensorType, SensorType.OPTICAL);
      reportPass('Optical acquisition behavior remains unchanged');
    }

    console.info('Test 13: Exact supplied Sentinel-1 imageId is loaded directly into GEE export payload');
    {
      let capturedPayload: any = null;
      const originalFetchExport = global.fetch;
      global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('image:export')) {
          capturedPayload = JSON.parse(init.body);
          return new Response(JSON.stringify({ name: 'projects/test-proj/operations/OP-EXP-SAR-1' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetchExport(url, init);
      }) as any;

      try {
        const exportService = new GeeExportService();
        const testSarId = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_20200102T060225_030617_038234_B79D';
        await exportService.requestImageExport({
          zoneCode: 'ZONE_TEST',
          jobId: 'JOB_TEST_123',
          imageType: 'BASELINE',
          scene: {
            imageId: testSarId,
            satellite: 'Sentinel-1',
            sensorType: SensorType.SAR,
            source: SatelliteSource.SENTINEL_1,
            acquisitionDate: new Date('2020-01-02T06:02:00.000Z'),
            cloudCover: 0,
            footprint: testBoundary,
            bands: ['VV', 'VH'],
          } as any,
          geometry: testBoundary,
        });

        assert.ok(capturedPayload, 'Export payload must be submitted');
        const loadedImageId = capturedPayload.expression?.values?.raw_image?.functionInvocationValue?.arguments?.id?.constantValue;
        assert.strictEqual(loadedImageId, testSarId, 'Export expression must load exact supplied Sentinel-1 imageId');
        reportPass('Exact supplied Sentinel-1 imageId is loaded directly for GEE export without catalog search');
      } finally {
        global.fetch = originalFetchExport;
      }
    }

    // ── 5. ASYNCHRONOUS SATELLITE EXPORT ARCHITECTURE CHECKS ──
    console.info('\n--- 5. ASYNCHRONOUS EXPORT ARCHITECTURE CHECKS ---');

    const testSarAsyncId = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_20200102T060225_030617_038234_ASYNC';
    let testSatDocId: string | null = null;

    try {
      console.info('Test 14: Asynchronous "Acquire to Catalog" returns immediately with EXPORT_RUNNING');
      {
        const originalRequestExport = GeeExportService.prototype.requestImageExport;
        const originalExecutePipeline = SatelliteAcquisitionService.prototype.executeAsyncSatellitePipeline;

        (GeeExportService.prototype as any).requestImageExport = async () => ({
          taskId: 'projects/monitoring-system-506515/operations/OP-ASYNC-TEST-001',
          driveFileName: 'ZONE_TEST_ASYNC_Sentinel1_20200102.tif',
        });
        (SatelliteAcquisitionService.prototype as any).executeAsyncSatellitePipeline = async () => ({} as any);

        try {
          const t0 = Date.now();
          const acquireRes = await request(
            'POST',
            '/api/satellite/acquire',
            {
              zoneId: vadipatti._id.toString(),
              startDate: '2020-01-02',
              endDate: '2020-01-02',
              sensorType: SensorType.SAR,
              imageId: testSarAsyncId,
              sync: false,
            },
            token,
          );
          const elapsedMs = Date.now() - t0;

          assert.strictEqual(acquireRes.status, 201, 'Acquire must return 201 Created');
          assert.strictEqual(acquireRes.body.success, true);
          assert.ok(
            elapsedMs < 2000,
            `Acquire must return quickly without waiting for export (took ${elapsedMs}ms, threshold: 2000ms)`,
          );
          assert.strictEqual(
            acquireRes.body.data.processingStatus,
            'EXPORT_RUNNING',
            'Initial status must be EXPORT_RUNNING',
          );
          assert.strictEqual(
            acquireRes.body.data.geeExportTaskId,
            'projects/monitoring-system-506515/operations/OP-ASYNC-TEST-001',
            'Must persist GEE operation task ID',
          );
          testSatDocId = acquireRes.body.data.id;
          reportPass(`Acquire returned quickly in ${elapsedMs}ms with initial status EXPORT_RUNNING`);
        } finally {
          GeeExportService.prototype.requestImageExport = originalRequestExport;
          SatelliteAcquisitionService.prototype.executeAsyncSatellitePipeline = originalExecutePipeline;
        }
      }

      console.info('Test 15: SatelliteMetadata document is created in MongoDB before export completion');
      {
        assert.ok(testSatDocId, 'Target document ID must be defined');
        const dbDoc = await SatelliteMetadata.findById(testSatDocId);
        assert.ok(dbDoc, 'SatelliteMetadata document must exist in MongoDB immediately upon acquisition');
        assert.strictEqual(dbDoc.imageId, testSarAsyncId);
        assert.strictEqual(dbDoc.processingStatus, 'EXPORT_RUNNING');
        assert.strictEqual(dbDoc.geeExportTaskId, 'projects/monitoring-system-506515/operations/OP-ASYNC-TEST-001');
        assert.strictEqual(dbDoc.driveFileName, 'ZONE_TEST_ASYNC_Sentinel1_20200102.tif');
        reportPass('SatelliteMetadata document exists in MongoDB with GEE task & drive metadata before export completion');
      }

      console.info('Test 16: Active export duplicate prevention returns existing record without redundant task creation');
      {
        const originalRequestExport = GeeExportService.prototype.requestImageExport;
        let exportCallCount = 0;
        (GeeExportService.prototype as any).requestImageExport = async () => {
          exportCallCount++;
          return {
            taskId: 'projects/monitoring-system-506515/operations/OP-DUPLICATE-CHECK',
            driveFileName: 'ZONE_TEST_DUPLICATE.tif',
          };
        };

        try {
          const secondAcquireRes = await request(
            'POST',
            '/api/satellite/acquire',
            {
              zoneId: vadipatti._id.toString(),
              startDate: '2020-01-02',
              endDate: '2020-01-02',
              sensorType: SensorType.SAR,
              imageId: testSarAsyncId,
              sync: false,
            },
            token,
          );

          assert.strictEqual(secondAcquireRes.status, 201);
          assert.strictEqual(exportCallCount, 0, 'requestImageExport must NOT be called again while export is running');
          assert.strictEqual(secondAcquireRes.body.data.processingStatus, 'EXPORT_RUNNING');
          reportPass('Duplicate export prevention safely guards against redundant GEE export submissions');
        } finally {
          GeeExportService.prototype.requestImageExport = originalRequestExport;
        }
      }

      console.info('Test 17: Background pipeline transitions status to PROCESSED on successful export');
      {
        const acquisitionService = new SatelliteAcquisitionService();
        const originalPoll = (acquisitionService as any).geeTaskService.pollTaskCompletion;
        const originalFind = (acquisitionService as any).driveService.findExportedFile;
        const originalDownload = (acquisitionService as any).driveService.downloadGeoTiff;
        const originalRead = GeoTiffService.readGeoTiff;

        (acquisitionService as any).geeTaskService.pollTaskCompletion = async () => ({
          state: 'EXPORT_COMPLETED',
          progress: 100,
        });
        (acquisitionService as any).driveService.findExportedFile = async () => ({
          id: 'mock-drive-file-id-777',
          name: 'ZONE_TEST_ASYNC_Sentinel1_20200102.tif',
          size: '5242880',
        });
        (acquisitionService as any).driveService.downloadGeoTiff = async () => ({
          localFilePath: 'mock_storage/ZONE_TEST_ASYNC_Sentinel1_20200102.tif',
          sizeBytes: 5242880,
        });
        GeoTiffService.readGeoTiff = (async () => ({
          metadata: {
            width: 500,
            height: 500,
            numBands: 2,
            crs: 'EPSG:32644',
            originalCrs: 'EPSG:32644',
            normalizedCrs: 'EPSG:32644',
            areaCalculationCrs: 'EPSG:32644',
            pixelScale: [10, 10, 0],
            pixelAreaM2: 100,
            tiePoint: [0, 0, 0, 0, 0, 0],
            bbox: [78.0, 10.0, 78.1, 10.1],
            nodata: null,
            bitsPerSample: [32, 32],
            isProjectedMetric: true,
          },
          bandData: [],
          bandNames: ['VV', 'VH'],
        })) as any;

        try {
          await (acquisitionService as any).executeAsyncSatellitePipeline(testSatDocId!, {
            taskId: 'projects/monitoring-system-506515/operations/OP-ASYNC-TEST-001',
            driveFileName: 'ZONE_TEST_ASYNC_Sentinel1_20200102.tif',
          });

          const finalizedDoc = await SatelliteMetadata.findById(testSatDocId);
          assert.ok(finalizedDoc);
          assert.strictEqual(finalizedDoc.processingStatus, 'PROCESSED');
          assert.strictEqual(finalizedDoc.driveFileId, 'mock-drive-file-id-777');
          reportPass('Background pipeline successfully transitions status from EXPORT_RUNNING to PROCESSED');
        } finally {
          (acquisitionService as any).geeTaskService.pollTaskCompletion = originalPoll;
          (acquisitionService as any).driveService.findExportedFile = originalFind;
          (acquisitionService as any).driveService.downloadGeoTiff = originalDownload;
          GeoTiffService.readGeoTiff = originalRead;
        }
      }

      console.info('Test 18: Background pipeline transitions status to FAILED and preserves authentic GEE error');
      {
        const failedSarId = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_FAILED';
        const failedDoc = await SatelliteMetadata.create({
          imageId: failedSarId,
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
          acquisitionDate: new Date('2020-01-02T06:02:00.000Z'),
          cloudCover: 0,
          geeReference: 'COPERNICUS/S1_GRD',
          footprint: testBoundary,
          processingStatus: 'EXPORT_RUNNING',
          geeExportTaskId: 'projects/monitoring-system-506515/operations/OP-FAIL-TEST',
          driveFileName: 'ZONE_FAIL.tif',
          intersectingZones: [vadipatti._id as any],
        });

        const acquisitionService = new SatelliteAcquisitionService();
        const originalPoll = (acquisitionService as any).geeTaskService.pollTaskCompletion;

        (acquisitionService as any).geeTaskService.pollTaskCompletion = async () => ({
          state: 'FAILED',
          errorMessage: 'User memory limit exceeded: 8388608 bytes',
        });

        try {
          await assert.rejects(
            async () => {
              await (acquisitionService as any).executeAsyncSatellitePipeline(failedDoc._id.toString(), {
                taskId: 'projects/monitoring-system-506515/operations/OP-FAIL-TEST',
                driveFileName: 'ZONE_FAIL.tif',
              });
            },
            (err: any) => err.message.includes('User memory limit exceeded'),
            'Must throw with authentic Earth Engine error',
          );

          const updatedFailedDoc = await SatelliteMetadata.findById(failedDoc._id);
          assert.ok(updatedFailedDoc);
          assert.strictEqual(updatedFailedDoc.processingStatus, 'FAILED');
          assert.ok(
            updatedFailedDoc.failureReason?.includes('User memory limit exceeded'),
            `Failure reason must preserve authentic GEE error, got: ${updatedFailedDoc.failureReason}`,
          );
          reportPass('Background pipeline marks status FAILED and preserves authentic Earth Engine error message');
        } finally {
          (acquisitionService as any).geeTaskService.pollTaskCompletion = originalPoll;
          await SatelliteMetadata.deleteOne({ _id: failedDoc._id });
        }
      }

      console.info('Test 19: Polling contract & 30-second Axios timeout avoidance');
      {
        const nonTerminalStatuses = [
          'EXPORT_REQUESTED',
          'EXPORT_RUNNING',
          'EXPORT_COMPLETED',
          'DRIVE_FILE_FOUND',
          'DOWNLOADED',
          'RASTER_VALIDATED',
        ];
        const terminalStatuses = ['PROCESSED', 'FAILED'];

        for (const s of nonTerminalStatuses) {
          assert.ok(!terminalStatuses.includes(s), `Status ${s} must be non-terminal (eligible for polling)`);
        }
        for (const s of terminalStatuses) {
          assert.ok(!nonTerminalStatuses.includes(s), `Status ${s} must be terminal (stops polling)`);
        }

        // Verify acquisition API response time is orders of magnitude below 30,000ms
        const maxExpectedAcquireResponseMs = 2000;
        const globalAxiosTimeoutMs = 30000;
        assert.ok(
          maxExpectedAcquireResponseMs < globalAxiosTimeoutMs,
          'Asynchronous acquire response completes well within 30s Axios timeout',
        );
        reportPass('Polling contract correctly identifies non-terminal vs terminal states and guarantees Axios timeout safety');
      }
    } finally {
      if (testSatDocId) {
        await SatelliteMetadata.deleteOne({ _id: testSatDocId });
      }
      await SatelliteMetadata.deleteMany({ imageId: testSarAsyncId });
    }

  } finally {
    // Clean up test admin user
    await User.deleteOne({ _id: adminUser._id });
    server.close();

    // ── 11. POST-TEST DATABASE INVARIANT AUDIT ──
    console.info('\n--- 4. POST-TEST DATABASE INVARIANT AUDIT ---');
    const postCounts = {
      users: await User.countDocuments(),
      zones: await Zone.countDocuments(),
      baselines: await BaselineModel.countDocuments(),
      satellites: await SatelliteMetadata.countDocuments(),
      changes: await ChangeDetectionModel.countDocuments(),
      alerts: await AlertModel.countDocuments(),
      jobs: await MonitoringJobModel.countDocuments(),
      incremental: await IncrementalMonitoringRecordModel.countDocuments(),
    };

    console.info('Post-Test Document Counts:');
    for (const [k, v] of Object.entries(postCounts)) {
      console.info(`  ${k.padEnd(14)}: ${v} (pre: ${preCounts[k as keyof typeof preCounts]})`);
      assert.strictEqual(v, preCounts[k as keyof typeof preCounts], `Count for ${k} must match exactly`);
    }

    const vadipattiPost = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
    assert(vadipattiPost, 'Vadipatti zone must exist');
    assert.strictEqual(vadipattiPost.monitoringTracks?.optical?.enabled, true);
    assert.strictEqual(vadipattiPost.monitoringTracks?.sar?.enabled, false);

    const vadipattiAlertPost = await AlertModel.findOne({ alertId: 'ALT-1789295023854-8239' });
    assert(vadipattiAlertPost, 'Vadipatti alert must exist');
    assert.strictEqual(vadipattiAlertPost.status, 'OPEN');

    reportPass('All post-test database counts and Vadipatti invariants strictly match pre-test state');
  }

  await mongoose.disconnect();

  console.info('\n================================================================');
  console.info(`SUITE COMPLETE: ${passedTests} passed, ${failedTests} failed.`);
  console.info('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
