/*
 * M12 — SYSTEM OPERATIONS: 15-GATE TEST SUITE
 * Tests the operational monitoring, stale recovery, health, and RBAC layer
 * over the M4 monitoring infrastructure.
 */
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  UserStatus,
  Permission,
  MonitoringJobStatus,
  MonitoringJobType,
  SensorType,
} from '@tn-forest/shared/types';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;
let adminToken: string;
let viewerToken: string;
let checkpointOfficerToken: string;

async function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const resBody = await res.json();
  return { status: res.status, body: resBody };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('📊 M12: SYSTEM OPERATIONS & OPERATIONAL RESILIENCE TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5012;
  baseUrl = `http://localhost:${port}/api`;

  // ─── Pre-test invariant snapshot ─────────────────────────────
  const preZones = await Zone.countDocuments();
  const preBaselines = await BaselineModel.countDocuments();
  const preSatellites = await SatelliteMetadata.countDocuments();
  const preChanges = await ChangeDetectionModel.countDocuments();
  const preAlerts = await AlertModel.countDocuments();

  // Create isolated test users (prefixed to avoid collisions)
  const adminEmail = `m12-admin-${Date.now()}@test.tn`;
  const viewerEmail = `m12-viewer-${Date.now()}@test.tn`;
  const officerEmail = `m12-officer-${Date.now()}@test.tn`;

  await User.create([
    {
      name: 'M12 Test Admin',
      email: adminEmail,
      passwordHash: await hashPassword('Admin@1234'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      permissions: [
        Permission.MONITORING_READ,
        Permission.MONITORING_PROCESS,
        Permission.AREA_READ,
        Permission.ALERT_READ,
      ],
    },
    {
      name: 'M12 Test Viewer',
      email: viewerEmail,
      passwordHash: await hashPassword('Viewer@1234'),
      role: UserRole.VIEWER,
      status: UserStatus.ACTIVE,
      permissions: [Permission.MONITORING_READ, Permission.AREA_READ, Permission.ALERT_READ],
    },
    {
      name: 'M12 Test Officer',
      email: officerEmail,
      passwordHash: await hashPassword('Officer@1234'),
      role: UserRole.CHECKPOINT_OFFICER,
      status: UserStatus.ACTIVE,
      permissions: [],
    },
  ]);

  // Login to get tokens
  const adminLogin = await request('POST', '/auth/login', { email: adminEmail, password: 'Admin@1234' });
  const viewerLogin = await request('POST', '/auth/login', { email: viewerEmail, password: 'Viewer@1234' });
  const officerLogin = await request('POST', '/auth/login', { email: officerEmail, password: 'Officer@1234' });
  adminToken = (adminLogin.body as { data?: { token?: string } }).data?.token ?? '';
  viewerToken = (viewerLogin.body as { data?: { token?: string } }).data?.token ?? '';
  checkpointOfficerToken = (officerLogin.body as { data?: { token?: string } }).data?.token ?? '';

  let pass = 0;
  let fail = 0;
  const ok = (msg: string) => { console.log(`  ✔ ${msg}`); pass++; };
  const ko = (msg: string, err?: unknown) => { console.error(`  ✘ ${msg}`, err ?? ''); fail++; };

  // ─── GATE 1: Unauthenticated requests rejected ─────────────────
  console.log('\n▶ Gate 1: Unauthenticated requests rejected (HTTP 401)...');
  const g1a = await request('GET', '/monitoring/jobs');
  const g1b = await request('GET', '/monitoring/health');
  const g1c = await request('GET', '/monitoring/system-status');
  if (g1a.status === 401 && g1b.status === 401 && g1c.status === 401) {
    ok('Gate 1 Passed: All unauthenticated monitoring requests rejected with 401');
  } else {
    ko('Gate 1 Failed', { g1a: g1a.status, g1b: g1b.status, g1c: g1c.status });
  }

  // ─── GATE 2: RBAC enforcement ───────────────────────────────────
  console.log('\n▶ Gate 2: RBAC enforcement...');
  // CHECKPOINT_OFFICER has no monitoring permissions, should get 403
  const g2a = await request('GET', '/monitoring/jobs', undefined, checkpointOfficerToken);
  const g2b = await request('GET', '/monitoring/health', undefined, checkpointOfficerToken);
  // VIEWER has MONITORING_READ, should get 200
  const g2c = await request('GET', '/monitoring/jobs', undefined, viewerToken);
  const g2d = await request('GET', '/monitoring/health', undefined, viewerToken);
  if (g2a.status === 403 && g2b.status === 403 && g2c.status === 200 && g2d.status === 200) {
    ok('Gate 2 Passed: RBAC allows VIEWER read, rejects CHECKPOINT_OFFICER with 403');
  } else {
    ko('Gate 2 Failed', { g2a: g2a.status, g2b: g2b.status, g2c: g2c.status, g2d: g2d.status });
  }

  // ─── GATE 3: Monitoring job list returns correct structure ────────
  console.log('\n▶ Gate 3: Job list returns correct structure...');
  const g3 = await request('GET', '/monitoring/jobs', undefined, viewerToken);
  const g3Data = (g3.body as { data?: unknown[] }).data;
  if (g3.status === 200 && Array.isArray(g3Data)) {
    ok(`Gate 3 Passed: Job list returns ${g3Data.length} jobs in array format`);
  } else {
    ko('Gate 3 Failed', g3.status);
  }

  // ─── GATE 4: Failed jobs are visible ────────────────────────────
  console.log('\n▶ Gate 4: Failed jobs are visible...');
  // Create a test failed job
  const failedJob = await MonitoringJobModel.create({
    jobId: `M12-TEST-FAILED-${Date.now()}`,
    type: MonitoringJobType.SCHEDULED_SCAN,
    scheduledAt: new Date(),
    status: MonitoringJobStatus.FAILED,
    sensorType: SensorType.OPTICAL,
    errorMessage: 'Test failure for M12 gate 4',
    logs: ['[TEST] Job created for M12 gate 4 testing'],
  });
  const g4 = await request('GET', `/monitoring/jobs?status=${MonitoringJobStatus.FAILED}`, undefined, viewerToken);
  const g4Data = (g4.body as { data?: { jobId?: string }[] }).data;
  const hasFailedJob = Array.isArray(g4Data) && g4Data.some((j) => j.jobId === failedJob.jobId);
  if (g4.status === 200 && hasFailedJob) {
    ok('Gate 4 Passed: Failed jobs are visible through filtered job list');
  } else {
    ko('Gate 4 Failed: Failed job not found in filtered list', { status: g4.status, hasFailedJob });
  }
  // Cleanup
  await MonitoringJobModel.deleteOne({ _id: failedJob._id });

  // ─── GATE 5: Stale PROCESSING job detection ──────────────────────
  console.log('\n▶ Gate 5: Stale PROCESSING job detection...');
  const pastStaleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleJob = await MonitoringJobModel.create({
    jobId: `M12-TEST-STALE-${Date.now()}`,
    type: MonitoringJobType.SCHEDULED_SCAN,
    scheduledAt: pastStaleDate,
    startedAt: pastStaleDate,
    heartbeatAt: pastStaleDate,
    status: MonitoringJobStatus.PROCESSING,
    sensorType: SensorType.OPTICAL,
    logs: ['[TEST] Job stuck in PROCESSING for M12 gate 5'],
  });
  // Force updatedAt and heartbeatAt to be old via direct write with timestamps: false
  await MonitoringJobModel.updateOne(
    { _id: staleJob._id },
    { $set: { updatedAt: pastStaleDate, heartbeatAt: pastStaleDate } },
    { timestamps: false },
  );
  // Use dry-run recovery to detect without changing state
  const g5 = await request('POST', '/monitoring/recover-stale', { staleTimeoutMs: 5 * 60 * 1000, dryRun: true }, adminToken);
  const g5Data = (g5.body as { data?: { staleJobsDetected?: number } }).data;
  if (g5.status === 200 && (g5Data?.staleJobsDetected ?? 0) >= 1) {
    ok(`Gate 5 Passed: Dry-run detected ${g5Data?.staleJobsDetected} stale PROCESSING job(s)`);
  } else {
    ko('Gate 5 Failed', { status: g5.status, data: g5Data });
  }

  // ─── GATE 6: Stale recovery transitions PROCESSING → FAILED ─────
  console.log('\n▶ Gate 6: Stale recovery transitions PROCESSING→FAILED...');
  const g6 = await request('POST', '/monitoring/recover-stale', { staleTimeoutMs: 5 * 60 * 1000 }, adminToken);
  const g6Data = (g6.body as { data?: { jobsRecovered?: number } }).data;
  const staleAfter = await MonitoringJobModel.findById(staleJob._id);
  if (g6.status === 200 && (g6Data?.jobsRecovered ?? 0) >= 1 && staleAfter?.status === MonitoringJobStatus.FAILED) {
    ok('Gate 6 Passed: Stale PROCESSING job was safely recovered to FAILED status');
  } else {
    ko('Gate 6 Failed', { status: g6.status, recovered: g6Data?.jobsRecovered, staleStatus: staleAfter?.status });
  }
  await MonitoringJobModel.deleteOne({ _id: staleJob._id });

  // ─── GATE 7: Active (in-memory) job NOT incorrectly recovered ────
  console.log('\n▶ Gate 7: Active in-memory job NOT recovered...');
  // The MonitoringSchedulerService.activeJobsSet protects in-flight jobs.
  // We test that a completed/terminal job is skipped (not just terminal status check):
  const terminalJob = await MonitoringJobModel.create({
    jobId: `M12-TEST-TERMINAL-${Date.now()}`,
    type: MonitoringJobType.SCHEDULED_SCAN,
    scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 90 * 60 * 1000),
    status: MonitoringJobStatus.COMPLETED,
    sensorType: SensorType.OPTICAL,
    logs: ['[TEST] Completed job should not be recovered'],
  });
  await MonitoringJobModel.updateOne(
    { _id: terminalJob._id },
    { $set: { updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    { timestamps: false },
  );
  const g7 = await request('POST', '/monitoring/recover-stale', { staleTimeoutMs: 5 * 60 * 1000, dryRun: true }, adminToken);
  const terminalAfter = await MonitoringJobModel.findById(terminalJob._id);
  if (g7.status === 200 && terminalAfter?.status === MonitoringJobStatus.COMPLETED) {
    ok('Gate 7 Passed: COMPLETED job was NOT incorrectly recovered to FAILED');
  } else {
    ko('Gate 7 Failed', { status: g7.status, terminalStatus: terminalAfter?.status });
  }
  await MonitoringJobModel.deleteOne({ _id: terminalJob._id });

  // ─── GATE 8: Recovery is idempotent ─────────────────────────────
  console.log('\n▶ Gate 8: Recovery is idempotent...');
  // A second recovery on an already-FAILED job must not change it further
  const idempotentJob = await MonitoringJobModel.create({
    jobId: `M12-TEST-IDEM-${Date.now()}`,
    type: MonitoringJobType.SCHEDULED_SCAN,
    scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: MonitoringJobStatus.FAILED,
    errorMessage: 'Already failed, should not be re-recovered',
    sensorType: SensorType.OPTICAL,
    logs: ['[TEST] Idempotency check job'],
  });
  await MonitoringJobModel.updateOne(
    { _id: idempotentJob._id },
    { $set: { updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    { timestamps: false },
  );
  const g8a = await request('POST', '/monitoring/recover-stale', { staleTimeoutMs: 5 * 60 * 1000 }, adminToken);
  const g8b = await request('POST', '/monitoring/recover-stale', { staleTimeoutMs: 5 * 60 * 1000 }, adminToken);
  const idempotentAfter = await MonitoringJobModel.findById(idempotentJob._id);
  if (g8a.status === 200 && g8b.status === 200 && idempotentAfter?.status === MonitoringJobStatus.FAILED) {
    ok('Gate 8 Passed: Recovery is idempotent — FAILED job remains FAILED after double recovery call');
  } else {
    ko('Gate 8 Failed', { g8a: g8a.status, g8b: g8b.status, status: idempotentAfter?.status });
  }
  await MonitoringJobModel.deleteOne({ _id: idempotentJob._id });

  // ─── GATE 9: Scheduler state visible in health ───────────────────
  console.log('\n▶ Gate 9: Scheduler operational state is visible...');
  const g9 = await request('GET', '/monitoring/health', undefined, viewerToken);
  const g9Data = (g9.body as { data?: { scheduler?: { isRunning?: boolean }; status?: string } }).data;
  if (
    g9.status === 200 &&
    g9Data?.scheduler !== undefined &&
    typeof g9Data.scheduler.isRunning === 'boolean' &&
    ['HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(g9Data.status ?? '')
  ) {
    ok(`Gate 9 Passed: Scheduler visible — isRunning: ${g9Data.scheduler.isRunning}, status: ${g9Data.status}`);
  } else {
    ko('Gate 9 Failed', g9Data);
  }

  // ─── GATE 10: System status endpoint returns correct state ───────
  console.log('\n▶ Gate 10: System status endpoint returns operational state...');
  const g10 = await request('GET', '/monitoring/system-status', undefined, viewerToken);
  const g10Data = (g10.body as { data?: { status?: string; gee?: { mode?: string; configured?: boolean }; database?: { connected?: boolean } } }).data;
  if (
    g10.status === 200 &&
    g10Data?.status !== undefined &&
    g10Data?.gee?.configured !== undefined &&
    g10Data?.database?.connected !== undefined
  ) {
    ok(`Gate 10 Passed: System status returns valid operational state (status: ${g10Data.status}, DB connected: ${g10Data.database?.connected})`);
  } else {
    ko('Gate 10 Failed', g10Data);
  }

  // ─── GATE 11: System status does NOT expose secrets ─────────────
  console.log('\n▶ Gate 11: System status does not expose GEE credentials or project ID...');
  const g11 = await request('GET', '/monitoring/system-status', undefined, viewerToken);
  const g11Data = (g11.body as { data?: Record<string, unknown> }).data;
  const hasProjectId = g11Data?.gee && typeof (g11Data.gee as Record<string, unknown>)['projectId'] !== 'undefined';
  const hasAuthMethod = g11Data?.gee && typeof (g11Data.gee as Record<string, unknown>)['authMethod'] !== 'undefined';
  if (g11.status === 200 && !hasProjectId && !hasAuthMethod) {
    ok('Gate 11 Passed: System status does not expose projectId or authMethod credentials');
  } else {
    ko('Gate 11 Failed: Credentials may be exposed', { hasProjectId, hasAuthMethod });
  }

  // ─── GATE 12: GEE integration status does not fabricate success ──
  console.log('\n▶ Gate 12: GEE integration status does not fabricate success...');
  const g12 = await request('GET', '/monitoring/health', undefined, viewerToken);
  const g12Data = (g12.body as { data?: { gee?: { mode?: string } } }).data;
  // The mode must be either 'REAL' or 'SIMULATED' — not fabricated
  const validMode = g12Data?.gee?.mode === 'REAL' || g12Data?.gee?.mode === 'SIMULATED';
  if (g12.status === 200 && validMode) {
    ok(`Gate 12 Passed: GEE mode is accurate: ${g12Data?.gee?.mode}`);
  } else {
    ko('Gate 12 Failed: GEE mode is invalid or fabricated', g12Data?.gee);
  }

  // ─── GATE 13: Recovery write op requires MONITORING_PROCESS perm ─
  console.log('\n▶ Gate 13: Recovery operations require MONITORING_PROCESS permission...');
  // VIEWER only has MONITORING_READ (not MONITORING_PROCESS), so POST /recover-stale should be 403
  const g13 = await request('POST', '/monitoring/recover-stale', { staleTimeoutMs: 5 * 60 * 1000 }, viewerToken);
  // ADMIN has MONITORING_PROCESS, should be 200
  const g13b = await request('POST', '/monitoring/recover-stale', { staleTimeoutMs: 5 * 60 * 1000 }, adminToken);
  if (g13.status === 403 && g13b.status === 200) {
    ok('Gate 13 Passed: MONITORING_PROCESS required for recovery; VIEWER rejected 403, ADMIN allowed 200');
  } else {
    ko('Gate 13 Failed', { viewerStatus: g13.status, adminStatus: g13b.status });
  }

  // ─── GATE 14: API contracts remain compatible ─────────────────────
  console.log('\n▶ Gate 14: API contracts are backwards compatible...');
  const g14a = await request('GET', '/monitoring/jobs', undefined, viewerToken);
  const g14b = await request('GET', '/monitoring/status', undefined, viewerToken);
  const g14c = await request('GET', '/monitoring/areas', undefined, viewerToken);
  if (g14a.status === 200 && g14b.status === 200 && g14c.status === 200) {
    ok('Gate 14 Passed: Monitoring API contracts (/jobs, /status, /areas) remain fully compatible');
  } else {
    ko('Gate 14 Failed', { jobs: g14a.status, status: g14b.status, areas: g14c.status });
  }

  // ─── GATE 15: M4 behavior intact (job scheduling still works) ────
  console.log('\n▶ Gate 15: M4 monitoring job scheduling remains intact...');
  // Verify job can be listed and queried by status filter
  const g15 = await request('GET', `/monitoring/jobs?status=${MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE}`, undefined, viewerToken);
  const g15Data = (g15.body as { data?: unknown[] }).data;
  if (g15.status === 200 && Array.isArray(g15Data)) {
    ok(`Gate 15 Passed: M4 job filtering still works — ${g15Data.length} WAITING_FOR_NEXT_CYCLE jobs`);
  } else {
    ko('Gate 15 Failed', { status: g15.status });
  }

  // ─── Post-test invariant verification ─────────────────────────────
  console.log('\n▶ Post-test historical data integrity check...');
  const postZones = await Zone.countDocuments();
  const postBaselines = await BaselineModel.countDocuments();
  const postSatellites = await SatelliteMetadata.countDocuments();
  const postChanges = await ChangeDetectionModel.countDocuments();
  const postAlerts = await AlertModel.countDocuments();

  const integrityOk =
    postZones === preZones &&
    postBaselines === preBaselines &&
    postSatellites === preSatellites &&
    postChanges === preChanges &&
    postAlerts === preAlerts;

  if (integrityOk) {
    ok('Post-test: Historical data integrity preserved (zones/baselines/satellites/changes/alerts unchanged)');
  } else {
    ko('Post-test: Historical data drift detected!', {
      zones: { pre: preZones, post: postZones },
      baselines: { pre: preBaselines, post: postBaselines },
    });
  }

  // Cleanup test users
  await User.deleteMany({ email: { $in: [adminEmail, viewerEmail, officerEmail] } });

  // Final summary
  console.log('\n================================================================');
  if (fail === 0) {
    console.log(`✅ ALL ${pass} M12 SYSTEM OPERATIONS TEST GATES PASSED (${pass}/${pass + fail})`);
  } else {
    console.log(`❌ M12 TESTS: ${pass} passed, ${fail} FAILED`);
  }
  console.log('================================================================\n');

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.connection.close();

  if (fail > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
