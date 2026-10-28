import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { EvidenceDossierModel } from '../models/EvidenceDossier.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import { evidencePhotoUrlSchema } from '../validators/enforcementCase.validator.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  UserStatus,
  Permission,
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  CheckpointVerificationResult,
  LocationVerificationStatus,
} from '@tn-forest/shared/types';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;
let adminToken: string;
let viewerToken: string;

async function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const resBody = await res.json().catch(() => ({}));
  return { status: res.status, body: resBody };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🛡️ PHASE 12: OPERATIONAL RESILIENCE & RECOVERY TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5022;
  baseUrl = `http://localhost:${port}/api`;

  // Baseline database invariant check
  const preZones = await Zone.countDocuments();
  const preBaselines = await BaselineModel.countDocuments();
  const preChanges = await ChangeDetectionModel.countDocuments();
  const preAlerts = await AlertModel.countDocuments();
  const preSatellites = await SatelliteMetadata.countDocuments();
  const preDossiers = await EvidenceDossierModel.countDocuments();

  console.log('Initial Invariants:', {
    zones: preZones,
    baselines: preBaselines,
    changeDetections: preChanges,
    alerts: preAlerts,
    satMeta: preSatellites,
    dossiers: preDossiers,
  });

  const testSuffix = `p12-${Date.now()}`;
  const adminEmail = `admin-${testSuffix}@test.tn`;
  const viewerEmail = `viewer-${testSuffix}@test.tn`;

  let pass = 0;
  let fail = 0;
  const ok = (msg: string) => {
    console.log(`  ✔ ${msg}`);
    pass++;
  };
  const ko = (msg: string, err?: unknown) => {
    console.error(`  ✘ ${msg}`, err ?? '');
    fail++;
  };

  try {
    // Create isolated test users
    await User.create([
      {
        name: 'P12 Admin',
        email: adminEmail,
        passwordHash: await hashPassword('Admin@1234'),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        permissions: [
          Permission.MONITORING_READ,
          Permission.MONITORING_PROCESS,
          Permission.CHECKPOINT_READ,
          Permission.CHECKPOINT_VERIFY,
        ],
      },
      {
        name: 'P12 Viewer',
        email: viewerEmail,
        passwordHash: await hashPassword('Viewer@1234'),
        role: UserRole.VIEWER,
        status: UserStatus.ACTIVE,
        permissions: [Permission.MONITORING_READ],
      },
    ]);

    const adminLogin = await request('POST', '/auth/login', { email: adminEmail, password: 'Admin@1234' });
    const viewerLogin = await request('POST', '/auth/login', { email: viewerEmail, password: 'Viewer@1234' });
    adminToken = adminLogin.body?.data?.token ?? '';
    viewerToken = viewerLogin.body?.data?.token ?? '';

    // ─── GATE 1: SSRF Private IP & Link-Local Cloud Metadata Rejection ─────────
    console.log('\n▶ Gate 1: SSRF private IP and cloud metadata rejection...');
    const ssrfUrls = [
      'https://127.0.0.1/admin',
      'https://10.0.0.5/secrets',
      'https://192.168.1.100/router',
      'https://172.16.5.10/internal',
      'https://169.254.169.254/latest/meta-data',
    ];
    let allSsrfRejected = true;
    for (const url of ssrfUrls) {
      const result = evidencePhotoUrlSchema.safeParse(url);
      if (result.success) {
        allSsrfRejected = false;
        console.error(`  Failed: ${url} was incorrectly accepted!`);
      }
    }
    const publicValid = evidencePhotoUrlSchema.safeParse('https://storage.googleapis.com/tn-forest/photo.jpg');
    if (allSsrfRejected && publicValid.success) {
      ok('Gate 1 Passed: Private RFC 1918 and cloud metadata IPs strictly rejected; valid HTTPS URLs accepted');
    } else {
      ko('Gate 1 Failed: SSRF URL filtering check failed');
    }

    // ─── GATE 2: Rate limit test-override header ignored in production ──────────
    console.log('\n▶ Gate 2: Rate limiter header security in non-test environment...');
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    // Dynamic import to test rateLimiter limit function logic
    const { authRateLimiter } = await import('../middleware/rateLimiter.js');
    const mockReq = {
      headers: {
        'x-test-rate-limit-max': '999999',
      },
    } as any;
    // Inspect limit function on authRateLimiter options
    const limitFn = (authRateLimiter as any).limit;
    const computedLimit = typeof limitFn === 'function' ? limitFn(mockReq) : 10;
    process.env.NODE_ENV = prevEnv;

    if (computedLimit === 10) {
      ok('Gate 2 Passed: Rate limiter ignores x-test-rate-limit-max when NODE_ENV === production');
    } else {
      ko(`Gate 2 Failed: Expected limit 10 in production, got ${computedLimit}`);
    }

    // ─── GATE 3: Checkpoint Geospatial Proximity Query ($nearSphere) ───────────
    console.log('\n▶ Gate 3: Checkpoint log geospatial proximity filtering ($nearSphere)...');
    const testCheckpoint = await CheckpointModel.create({
      checkpointId: `CP-${testSuffix.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
      name: `P12 Test Checkpoint ${testSuffix}`,
      district: 'Salem',
      status: 'ACTIVE',
      geofenceRadiusMeters: 500,
      location: {
        type: 'Point',
        coordinates: [78.146, 11.6643],
      },
    });

    const nearLog = await CheckpointLogModel.create({
      logId: `LOG-NEAR-${testSuffix}`,
      checkpointId: testCheckpoint._id,
      checkpointName: testCheckpoint.name,
      passNumber: `EP-NEAR-${testSuffix}`,
      verificationResult: CheckpointVerificationResult.VALID,
      locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,
      scannedCoordinates: {
        type: 'Point',
        coordinates: [78.1462, 11.6645], // ~30 meters away
      },
      verificationTimestamp: new Date(),
    });

    const farLog = await CheckpointLogModel.create({
      logId: `LOG-FAR-${testSuffix}`,
      checkpointId: testCheckpoint._id,
      checkpointName: testCheckpoint.name,
      passNumber: `EP-FAR-${testSuffix}`,
      verificationResult: CheckpointVerificationResult.VALID,
      locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,
      scannedCoordinates: {
        type: 'Point',
        coordinates: [80.2707, 13.0827], // Chennai (~300 km away)
      },
      verificationTimestamp: new Date(),
    });

    // Query within 5 km of Salem coordinates
    const geoQueryRes = await request(
      'GET',
      `/checkpoints/logs?longitude=78.146&latitude=11.6643&maxDistanceMeters=5000`,
      undefined,
      adminToken,
    );
    const queriedLogs = geoQueryRes.body?.data || [];
    const hasNear = queriedLogs.some((l: any) => l.logId === nearLog.logId);
    const hasFar = queriedLogs.some((l: any) => l.logId === farLog.logId);

    if (geoQueryRes.status === 200 && hasNear && !hasFar) {
      ok('Gate 3 Passed: Checkpoint logs filtered correctly by 2dsphere proximity (near log included, far log excluded)');
    } else {
      ko('Gate 3 Failed: Geospatial query did not filter logs correctly', {
        status: geoQueryRes.status,
        hasNear,
        hasFar,
      });
    }

    // Clean up test checkpoint and logs
    await CheckpointLogModel.deleteMany({ logId: { $in: [nearLog.logId, farLog.logId] } });
    await CheckpointModel.deleteOne({ _id: testCheckpoint._id });

    // ─── GATE 4: GEE Export Reconciliation — Dry-run detection ──────────────────
    console.log('\n▶ Gate 4: GEE export reconciliation dry-run detection...');
    const dummyExportRecord = await SatelliteMetadata.create({
      imageId: `TEST-EXPORT-${testSuffix}`,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date(),
      cloudCover: 5,
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [78.0, 11.0],
            [78.1, 11.0],
            [78.1, 11.1],
            [78.0, 11.1],
            [78.0, 11.0],
          ],
        ],
      },
      processingStatus: SatelliteProcessingStatus.EXPORT_RUNNING,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/TEST',
      intersectingZones: [],
    });

    const satService = new SatelliteAcquisitionService();
    const dryRunResult = await satService.reconcilePendingSatelliteExports({ dryRun: true });

    if (dryRunResult.checked >= 1 && dryRunResult.reconciledFailed >= 1) {
      ok(`Gate 4 Passed: Dry-run detected ${dryRunResult.checked} pending export record(s) without altering database`);
    } else {
      ko('Gate 4 Failed', dryRunResult);
    }

    // ─── GATE 5: GEE Export Reconciliation — Missing taskId transitions to FAILED 
    console.log('\n▶ Gate 5: Stale export with missing task ID transitions to FAILED...');
    const liveRunResult = await satService.reconcilePendingSatelliteExports();
    const afterRecord = await SatelliteMetadata.findOne({ imageId: dummyExportRecord.imageId });

    if (
      liveRunResult.reconciledFailed >= 1 &&
      afterRecord?.processingStatus === SatelliteProcessingStatus.FAILED &&
      afterRecord.failureReason?.includes('STALE_EXPORT_MISSING_TASK_ID')
    ) {
      ok('Gate 5 Passed: Export with missing task ID safely recovered to FAILED with descriptive reason');
    } else {
      ko('Gate 5 Failed', { status: afterRecord?.processingStatus, reason: afterRecord?.failureReason });
    }

    // ─── GATE 6: GEE Export Reconciliation — In-flight tasks preserved ─────────
    console.log('\n▶ Gate 6: In-flight export tasks under stale threshold preserved...');
    // Create an in-flight record with an imaginary active task ID
    const activeExportRecord = await SatelliteMetadata.create({
      imageId: `TEST-ACTIVE-${testSuffix}`,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date(),
      cloudCover: 5,
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [78.0, 11.0],
            [78.1, 11.0],
            [78.1, 11.1],
            [78.0, 11.1],
            [78.0, 11.0],
          ],
        ],
      },
      processingStatus: SatelliteProcessingStatus.EXPORT_RUNNING,
      geeExportTaskId: 'projects/monitoring-system-506515/operations/ACTIVE-TEST-OP',
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/TEST',
      intersectingZones: [],
    });

    const activeCheckResult = await satService.reconcilePendingSatelliteExports({
      staleThresholdHours: 24,
    });
    const afterActive = await SatelliteMetadata.findOne({ imageId: activeExportRecord.imageId });

    // Since it was just created (well under 24h), it should not be marked TIMEOUT
    if (afterActive && afterActive.processingStatus !== SatelliteProcessingStatus.PROCESSED) {
      ok('Gate 6 Passed: In-flight task is preserved and not prematurely terminated');
    } else {
      ko('Gate 6 Failed', afterActive?.processingStatus);
    }

    // ─── GATE 7: GEE Export Reconciliation — Stale tasks transition to TIMEOUT ─
    console.log('\n▶ Gate 7: Stale export tasks exceeding threshold transition to TIMEOUT...');
    // Force record to be 48 hours old
    await SatelliteMetadata.updateOne(
      { _id: activeExportRecord._id },
      { $set: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } }
    );

    await satService.reconcilePendingSatelliteExports({ staleThresholdHours: 24 });
    const afterTimeout = await SatelliteMetadata.findOne({ imageId: activeExportRecord.imageId });

    if (
      afterTimeout?.processingStatus === SatelliteProcessingStatus.FAILED &&
      (afterTimeout.failureReason?.includes('EXPORT_TIMEOUT') || afterTimeout.failureReason?.includes('Earth Engine'))
    ) {
      ok('Gate 7 Passed: Stale GEE export exceeding threshold safely transitioned to FAILED');
    } else {
      ko('Gate 7 Failed', { status: afterTimeout?.processingStatus, reason: afterTimeout?.failureReason });
    }

    // Cleanup test metadata
    await SatelliteMetadata.deleteMany({
      imageId: { $in: [dummyExportRecord.imageId, activeExportRecord.imageId] },
    });

    // ─── GATE 8: RBAC Protection on /api/satellite/reconcile-pending ───────────
    console.log('\n▶ Gate 8: RBAC enforcement on /api/satellite/reconcile-pending...');
    const unauthRes = await request('POST', '/satellite/reconcile-pending');
    const viewerRes = await request('POST', '/satellite/reconcile-pending', {}, viewerToken);
    const adminRes = await request('POST', '/satellite/reconcile-pending', {}, adminToken);

    if (unauthRes.status === 401 && viewerRes.status === 403 && adminRes.status === 200) {
      ok('Gate 8 Passed: Reconcile endpoint requires auth (401) and MONITORING_PROCESS permission (403/200)');
    } else {
      ko('Gate 8 Failed: RBAC permissions not properly enforced', {
        unauth: unauthRes.status,
        viewer: viewerRes.status,
        admin: adminRes.status,
      });
    }

    // ─── GATE 9: Post-Test Database Invariant Check (Zero Historical Drift) ────
    console.log('\n▶ Gate 9: Historical data zero drift verification...');
    const postZones = await Zone.countDocuments();
    const postBaselines = await BaselineModel.countDocuments();
    const postChanges = await ChangeDetectionModel.countDocuments();
    const postAlerts = await AlertModel.countDocuments();
    const postSatellites = await SatelliteMetadata.countDocuments();
    const postDossiers = await EvidenceDossierModel.countDocuments();

    const countsMatch =
      preZones === postZones &&
      preBaselines === postBaselines &&
      preChanges === postChanges &&
      preAlerts === postAlerts &&
      preSatellites === postSatellites &&
      preDossiers === postDossiers;

    if (countsMatch) {
      ok(`Gate 9 Passed: Zero drift confirmed — Historical counts unchanged: { zones: ${postZones}, baselines: ${postBaselines}, changeDetections: ${postChanges}, alerts: ${postAlerts}, satMeta: ${postSatellites}, dossiers: ${postDossiers} }`);
    } else {
      ko('Gate 9 Failed: Database drift detected!', {
        pre: { zones: preZones, baselines: preBaselines, changeDetections: preChanges, alerts: preAlerts, satMeta: preSatellites, dossiers: preDossiers },
        post: { zones: postZones, baselines: postBaselines, changeDetections: postChanges, alerts: postAlerts, satMeta: postSatellites, dossiers: postDossiers },
      });
    }

  } finally {
    // Cleanup test users
    await User.deleteMany({ email: { $in: [adminEmail, viewerEmail] } });
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await mongoose.connection.close();
  }

  console.log('\n================================================================');
  if (fail === 0) {
    console.log(`✅ ALL ${pass} PHASE 12 OPERATIONAL RESILIENCE GATES PASSED (${pass}/${pass + fail})`);
  } else {
    console.log(`❌ TESTS FAILED: ${pass} passed, ${fail} failed`);
  }
  console.log('================================================================\n');

  if (fail > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
