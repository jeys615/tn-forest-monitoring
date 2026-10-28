/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { AlertModel } from '../models/Alert.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { EvidenceDossierModel } from '../models/EvidenceDossier.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, Permission } from '@tn-forest/shared/types';

let server: Server;
let BASE_URL = '';

async function request(
  method: string,
  urlPath: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

async function runZoneScopedIsolationTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING ZONE-SCOPED DATA ISOLATION INTEGRATION SUITE');
  console.log('================================================================');

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Record baseline document counts to ensure ZERO drift
  const preCounts = {
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    changeDetections: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    satMeta: await SatelliteMetadata.countDocuments(),
    dossiers: await EvidenceDossierModel.countDocuments(),
    enforcementcases: await EnforcementCaseModel.countDocuments(),
  };

  console.log('Pre-test Database Invariant Counts:', JSON.stringify(preCounts));

  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5013;
  BASE_URL = `http://localhost:${port}/api`;

  let passCount = 0;
  let failCount = 0;
  const testGate = (name: string, ok: boolean, detail?: any) => {
    if (ok) {
      console.log(`  ✅ [PASS] ${name}`);
      passCount++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`, detail || '');
      failCount++;
    }
  };

  const adminEmail = `zone-iso-admin-${Date.now()}@test.tn`;
  const superAdminRole = UserRole.SUPER_ADMIN;

  // Create temporary test admin
  const testAdmin = await User.create({
    name: 'Zone Isolation Test Admin',
    email: adminEmail,
    passwordHash: await hashPassword('SuperAdmin@1234'),
    role: superAdminRole,
    status: UserStatus.ACTIVE,
    permissions: Object.values(Permission),
  });

  try {
    // Login
    const loginRes = await request('POST', '/auth/login', {
      email: adminEmail,
      password: 'SuperAdmin@1234',
    });
    const token = loginRes.body?.data?.token;
    assert(token, 'Failed to obtain test admin token');

    // Fetch registered zones
    const zonesRes = await request('GET', '/zones', undefined, token);
    const zones = zonesRes.body?.data || [];
    testGate('Zone list retrieved successfully', zones.length >= 2, { count: zones.length });

    if (zones.length >= 2) {
      const zoneA = zones[0];
      const zoneB = zones[1];
      const zoneAId = zoneA.id || zoneA.zoneId;
      const zoneBId = zoneB.id || zoneB.zoneId;

      console.log(`\nTesting Zone A (${zoneA.name}: ${zoneAId}) vs Zone B (${zoneB.name}: ${zoneBId})\n`);

      // ─── GATE 1: Change Detection Zone Scoping ─────────────────
      const changesAll = await request('GET', '/changes', undefined, token);
      const changesA = await request('GET', `/changes?zoneId=${zoneAId}`, undefined, token);
      const changesB = await request('GET', `/changes?zoneId=${zoneBId}`, undefined, token);

      const allChangesList = changesAll.body?.data || [];
      const aChangesList = changesA.body?.data || [];
      const bChangesList = changesB.body?.data || [];

      const aOnlyA = aChangesList.every((c: any) => c.zoneId === zoneAId || c.zoneId === zoneA.id || c.zoneId === zoneA.zoneId);
      const bOnlyB = bChangesList.every((c: any) => c.zoneId === zoneBId || c.zoneId === zoneB.id || c.zoneId === zoneB.zoneId);
      testGate('Gate 1: Change Detection strictly filtered by zoneId (zero cross-zone leakage)', aOnlyA && bOnlyB, {
        total: allChangesList.length,
        zoneA: aChangesList.length,
        zoneB: bChangesList.length,
      });

      // ─── GATE 2: Alerts Zone Scoping ───────────────────────────
      const alertsAll = await request('GET', '/alerts', undefined, token);
      const alertsA = await request('GET', `/alerts?zoneId=${zoneAId}`, undefined, token);
      const alertsB = await request('GET', `/alerts?zoneId=${zoneBId}`, undefined, token);

      const aAlertsList = alertsA.body?.data || [];
      const bAlertsList = alertsB.body?.data || [];

      const aOnlyAlerts = aAlertsList.every((al: any) => al.zoneId === zoneAId || al.zoneId === zoneA.id || al.zoneId === zoneA.zoneId);
      const bOnlyAlerts = bAlertsList.every((al: any) => al.zoneId === zoneBId || al.zoneId === zoneB.id || al.zoneId === zoneB.zoneId);
      testGate('Gate 2: Alerts strictly filtered by zoneId', aOnlyAlerts && bOnlyAlerts, {
        total: (alertsAll.body?.data || []).length,
        zoneA: aAlertsList.length,
        zoneB: bAlertsList.length,
      });

      // ─── GATE 3: Baselines Zone Scoping ────────────────────────
      const baselinesA = await request('GET', `/baselines/zone/${zoneAId}`, undefined, token);
      const baselinesB = await request('GET', `/baselines/zone/${zoneBId}`, undefined, token);

      const aBaselinesList = baselinesA.body?.data || [];
      const bBaselinesList = baselinesB.body?.data || [];
      const aOnlyBaselines = aBaselinesList.every((b: any) => b.zoneId === zoneAId || b.zoneId === zoneA.id || b.zoneId === zoneA.zoneId);
      const bOnlyBaselines = bBaselinesList.every((b: any) => b.zoneId === zoneBId || b.zoneId === zoneB.id || b.zoneId === zoneB.zoneId);
      testGate('Gate 3: Baselines isolated per zone', aOnlyBaselines && bOnlyBaselines, {
        zoneA: aBaselinesList.length,
        zoneB: bBaselinesList.length,
      });

      // ─── GATE 4: Monitoring Jobs Zone Scoping ──────────────────
      const jobsA = await request('GET', `/monitoring/jobs?zoneId=${zoneAId}`, undefined, token);
      const jobsB = await request('GET', `/monitoring/jobs?zoneId=${zoneBId}`, undefined, token);

      const aJobsList = jobsA.body?.data || [];
      const bJobsList = jobsB.body?.data || [];
      const aOnlyJobs = aJobsList.every((j: any) => !j.zoneId || j.zoneId === zoneAId || j.zoneId === zoneA.id || j.zoneId === zoneA.zoneId);
      const bOnlyJobs = bJobsList.every((j: any) => !j.zoneId || j.zoneId === zoneBId || j.zoneId === zoneB.id || j.zoneId === zoneB.zoneId);
      testGate('Gate 4: Monitoring Jobs filtered by zoneId', aOnlyJobs && bOnlyJobs, {
        zoneA: aJobsList.length,
        zoneB: bJobsList.length,
      });

      // ─── GATE 5: Mining Authorizations Zone Scoping ────────────
      const permitsA = await request('GET', `/mining-authorizations?zoneId=${zoneAId}`, undefined, token);
      const permitsB = await request('GET', `/mining-authorizations?zoneId=${zoneBId}`, undefined, token);

      const aPermitsList = permitsA.body?.data || [];
      const bPermitsList = permitsB.body?.data || [];
      const aOnlyPermits = aPermitsList.every((p: any) => p.zoneId === zoneAId || p.zoneId === zoneA.id || p.zoneId === zoneA.zoneId);
      const bOnlyPermits = bPermitsList.every((p: any) => p.zoneId === zoneBId || p.zoneId === zoneB.id || p.zoneId === zoneB.zoneId);
      testGate('Gate 5: Mining Authorizations isolated by zoneId', aOnlyPermits && bOnlyPermits, {
        zoneA: aPermitsList.length,
        zoneB: bPermitsList.length,
      });

      // ─── GATE 6: E-Passes Zone Scoping ─────────────────────────
      const epassA = await request('GET', `/epass?zoneId=${zoneAId}`, undefined, token);
      const epassB = await request('GET', `/epass?zoneId=${zoneBId}`, undefined, token);
      testGate('Gate 6: E-Passes query accepts zoneId filter with HTTP 200', epassA.status === 200 && epassB.status === 200, {
        statusA: epassA.status,
        statusB: epassB.status,
      });

      // ─── GATE 7: Vehicle Fleet Zone Scoping ────────────────────
      const vehiclesA = await request('GET', `/vehicles?zoneId=${zoneAId}`, undefined, token);
      const vehiclesB = await request('GET', `/vehicles?zoneId=${zoneBId}`, undefined, token);
      testGate('Gate 7: Vehicle fleet query accepts zoneId filter with HTTP 200', vehiclesA.status === 200 && vehiclesB.status === 200, {
        statusA: vehiclesA.status,
        statusB: vehiclesB.status,
      });

      // ─── GATE 8: Driver Fleet Zone Scoping ─────────────────────
      const driversA = await request('GET', `/drivers?zoneId=${zoneAId}`, undefined, token);
      const driversB = await request('GET', `/drivers?zoneId=${zoneBId}`, undefined, token);
      testGate('Gate 8: Driver fleet query accepts zoneId filter with HTTP 200', driversA.status === 200 && driversB.status === 200, {
        statusA: driversA.status,
        statusB: driversB.status,
      });

      // ─── GATE 9: Checkpoint Logs Zone Scoping ──────────────────
      const logsA = await request('GET', `/checkpoints/logs?zoneId=${zoneAId}`, undefined, token);
      const logsB = await request('GET', `/checkpoints/logs?zoneId=${zoneBId}`, undefined, token);
      testGate('Gate 9: Checkpoint logs query accepts zoneId filter with HTTP 200', logsA.status === 200 && logsB.status === 200, {
        statusA: logsA.status,
        statusB: logsB.status,
      });

      // ─── GATE 10: Enforcement Cases Zone Scoping ───────────────
      const casesA = await request('GET', `/enforcement-cases?zoneId=${zoneAId}`, undefined, token);
      const casesB = await request('GET', `/enforcement-cases?zoneId=${zoneBId}`, undefined, token);
      const aCasesList = casesA.body?.data || [];
      const bCasesList = casesB.body?.data || [];
      const aOnlyCases = aCasesList.every((c: any) => c.zoneId === zoneAId || c.zoneId === zoneA.id || c.zoneId === zoneA.zoneId);
      const bOnlyCases = bCasesList.every((c: any) => c.zoneId === zoneBId || c.zoneId === zoneB.id || c.zoneId === zoneB.zoneId);
      testGate('Gate 10: Enforcement cases filtered by zoneId with zero leakage', aOnlyCases && bOnlyCases, {
        zoneA: aCasesList.length,
        zoneB: bCasesList.length,
      });

      // ─── GATE 11: Reconciliation Reports Zone Scoping ──────────
      const reconA = await request('GET', `/reconciliation/reports?zoneId=${zoneAId}`, undefined, token);
      const reconB = await request('GET', `/reconciliation/reports?zoneId=${zoneBId}`, undefined, token);
      const aReconList = reconA.body?.data || [];
      const bReconList = reconB.body?.data || [];
      const aOnlyRecon = aReconList.every((r: any) => r.zoneId === zoneAId || r.zoneId === zoneA.id || r.zoneId === zoneA.zoneId);
      const bOnlyRecon = bReconList.every((r: any) => r.zoneId === zoneBId || r.zoneId === zoneB.id || r.zoneId === zoneB.zoneId);
      testGate('Gate 11: Reconciliation reports filtered by zoneId with zero leakage', aOnlyRecon && bOnlyRecon, {
        zoneA: aReconList.length,
        zoneB: bReconList.length,
      });

      // ─── GATE 12: Satellite Metadata Spatial Scoping ───────────
      const satA = await request('GET', `/satellite?zoneId=${zoneAId}`, undefined, token);
      const satB = await request('GET', `/satellite?zoneId=${zoneBId}`, undefined, token);
      testGate('Gate 12: Satellite catalog accepts zoneId filter with HTTP 200', satA.status === 200 && satB.status === 200, {
        statusA: satA.status,
        statusB: satB.status,
      });

      // ─── GATE 13: Temporal Window Date Filtering ───────────────
      const pastDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateFilteredChanges = await request(
        'GET',
        `/changes?zoneId=${zoneAId}&startDate=${pastDate}&endDate=${futureDate}`,
        undefined,
        token,
      );
      testGate('Gate 13: Combined zoneId and Date Range filtering functional', dateFilteredChanges.status === 200, {
        count: (dateFilteredChanges.body?.data || []).length,
      });

      // ─── GATE 14: Cross-Module Correlation in M13 ──────────────
      const corrA = await request('GET', `/intelligence/correlation/${zoneAId}`, undefined, token);
      testGate('Gate 14: M13 Cross-module correlation by zone returns authoritative synthesis', corrA.status === 200 && corrA.body?.data?.zone?.zoneId !== undefined, {
        status: corrA.status,
        zone: corrA.body?.data?.zone?.name,
      });
    }

    // ─── GATE 15: Database Invariant Integrity Check ────────────
    const postCounts = {
      zones: await Zone.countDocuments(),
      baselines: await BaselineModel.countDocuments(),
      changeDetections: await ChangeDetectionModel.countDocuments(),
      alerts: await AlertModel.countDocuments(),
      satMeta: await SatelliteMetadata.countDocuments(),
      dossiers: await EvidenceDossierModel.countDocuments(),
      enforcementcases: await EnforcementCaseModel.countDocuments(),
    };

    const isPreserved =
      postCounts.zones === preCounts.zones &&
      postCounts.baselines === preCounts.baselines &&
      postCounts.changeDetections === preCounts.changeDetections &&
      postCounts.alerts === preCounts.alerts &&
      postCounts.satMeta === preCounts.satMeta &&
      postCounts.dossiers === preCounts.dossiers &&
      postCounts.enforcementcases === preCounts.enforcementcases;

    testGate(
      'Gate 15: Complete Database Count Invariant Preserved (Zero Drift)',
      isPreserved,
      { pre: preCounts, post: postCounts },
    );
  } finally {
    // Cleanup temporary admin
    await User.deleteOne({ _id: testAdmin._id });
    server.close();
    await mongoose.disconnect();
  }

  console.log('\n================================================================');
  console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runZoneScopedIsolationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
