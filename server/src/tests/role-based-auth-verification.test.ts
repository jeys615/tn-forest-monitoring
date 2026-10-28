import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { DEV_ACCOUNTS, seedDevUsers } from '../seeds/seedDevUsers.js';
import { UserRole } from '@tn-forest/shared/types';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;

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

async function runRoleAuthTests() {
  console.log('\n================================================================');
  console.log('🔐 ROLE-BASED AUTHENTICATION & ACCESS CONTROL VERIFICATION');
  console.log('================================================================\n');

  await connectDatabase();
  await seedDevUsers();

  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5099;
  baseUrl = `http://localhost:${port}/api`;

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

  const tokensByRole: Record<string, string> = {};

  // ─── GATE 1: All 7 Roles Login Successfully ───────────────────
  console.log('\n▶ Gate 1: Login validation for all 7 supported roles...');
  for (const account of DEV_ACCOUNTS) {
    const res = await request('POST', '/auth/login', {
      email: account.email,
      password: account.password,
    });

    if (res.status === 200 && res.body?.success && res.body?.data?.token) {
      const user = res.body.data.user;
      if (user.role === account.role && user.email === account.email) {
        ok(`Role ${account.role} logged in successfully (${account.email})`);
        tokensByRole[account.role] = res.body.data.token;
      } else {
        ko(`Role ${account.role} returned unexpected user data`, user);
      }
    } else {
      ko(`Failed to login as ${account.role} (${account.email})`, res.body);
    }
  }

  // Also check backward compatibility with legacy admin
  const legacyLogin = await request('POST', '/auth/login', {
    email: 'admin@tnforest.gov.in',
    password: 'Admin@TNFMS2026!',
  });
  if (legacyLogin.status === 200 && legacyLogin.body?.success) {
    ok('Legacy admin account (admin@tnforest.gov.in) backwards compatibility verified');
  } else {
    ko('Legacy admin login failed', legacyLogin.body);
  }

  // ─── GATE 2: Token Verification via /auth/me ──────────────────
  console.log('\n▶ Gate 2: Profile retrieval via /auth/me for each role token...');
  for (const account of DEV_ACCOUNTS) {
    const token = tokensByRole[account.role];
    const meRes = await request('GET', '/auth/me', undefined, token);
    if (meRes.status === 200 && meRes.body?.data?.role === account.role) {
      ok(`Profile /auth/me valid for ${account.role} (${meRes.body.data.permissions?.length} permissions)`);
    } else {
      ko(`Profile /auth/me failed for ${account.role}`, meRes.body);
    }
  }

  // ─── GATE 3: Super Admin Access Rights (Unrestricted) ──────────
  console.log('\n▶ Gate 3: SUPER_ADMIN unrestricted access...');
  const superToken = tokensByRole[UserRole.SUPER_ADMIN];
  const superUsersRes = await request('GET', '/users', undefined, superToken);
  const superMonRes = await request('GET', '/monitoring/jobs', undefined, superToken);
  const superZonesRes = await request('GET', '/zones', undefined, superToken);
  if (superUsersRes.status === 200 && superMonRes.status === 200 && superZonesRes.status === 200) {
    ok('SUPER_ADMIN permitted across administrative, monitoring, and zone domains');
  } else {
    ko('SUPER_ADMIN access was unexpectedly blocked', {
      users: superUsersRes.status,
      monitoring: superMonRes.status,
      zones: superZonesRes.status,
    });
  }

  // ─── GATE 4: Checkpoint Officer Role Boundaries ───────────────
  console.log('\n▶ Gate 4: CHECKPOINT_OFFICER RBAC enforcement...');
  const cpToken = tokensByRole[UserRole.CHECKPOINT_OFFICER];
  // CHECKPOINT_OFFICER should NOT have AREA_READ (gets 403 on /zones)
  const cpZonesRes = await request('GET', '/zones', undefined, cpToken);
  // CHECKPOINT_OFFICER should NOT have MONITORING_READ (gets 403 on /monitoring/jobs)
  const cpMonRes = await request('GET', '/monitoring/jobs', undefined, cpToken);
  // CHECKPOINT_OFFICER should NOT have USER_CREATE (gets 403 on POST /users)
  const cpUserCreateRes = await request('POST', '/users', { name: 'Unauthorized User' }, cpToken);
  // CHECKPOINT_OFFICER DOES have CHECKPOINT_READ (gets 200 on /checkpoints)
  const cpCheckpointsRes = await request('GET', '/checkpoints', undefined, cpToken);

  if (
    cpZonesRes.status === 403 &&
    cpMonRes.status === 403 &&
    cpUserCreateRes.status === 403 &&
    cpCheckpointsRes.status === 200
  ) {
    ok('CHECKPOINT_OFFICER permitted for checkpoints (200) and restricted with 403 on zones, monitoring, user-creation');
  } else {
    ko('CHECKPOINT_OFFICER permissions boundary check failed', {
      zones: cpZonesRes.status,
      monitoring: cpMonRes.status,
      userCreate: cpUserCreateRes.status,
      checkpoints: cpCheckpointsRes.status,
    });
  }

  // ─── GATE 5: Viewer Role Boundaries (Read-Only) ───────────────
  console.log('\n▶ Gate 5: VIEWER read-only enforcement...');
  const viewerToken = tokensByRole[UserRole.VIEWER];
  // VIEWER can read monitoring jobs (200)
  const viewerMonRes = await request('GET', '/monitoring/jobs', undefined, viewerToken);
  // VIEWER cannot execute monitoring cycle (POST /monitoring/run-cycle -> 403)
  const viewerCycleRes = await request('POST', '/monitoring/run-cycle', {}, viewerToken);
  // VIEWER cannot create zone (POST /zones -> 403)
  const viewerZoneRes = await request('POST', '/zones', { name: 'Illegal Zone' }, viewerToken);

  if (viewerMonRes.status === 200 && viewerCycleRes.status === 403 && viewerZoneRes.status === 403) {
    ok('VIEWER allowed read access (200) but blocked on write/execute operations (403)');
  } else {
    ko('VIEWER write-protection check failed', {
      readJobs: viewerMonRes.status,
      runCycle: viewerCycleRes.status,
      createZone: viewerZoneRes.status,
    });
  }

  // ─── GATE 6: Invalid Credentials & Suspended States ───────────
  console.log('\n▶ Gate 6: Invalid password rejection...');
  const badLogin = await request('POST', '/auth/login', {
    email: 'admin@monitoring.system',
    password: 'WrongPassword@123',
  });
  if (badLogin.status === 401) {
    ok('Invalid credentials rejected with HTTP 401 Unauthorized');
  } else {
    ko('Invalid credentials check failed', badLogin.status);
  }

  console.log('\n================================================================');
  if (fail === 0) {
    console.log(`✅ ALL ${pass} ROLE-BASED AUTHENTICATION TEST GATES PASSED!`);
  } else {
    console.log(`❌ ROLE AUTH TESTS: ${pass} passed, ${fail} FAILED`);
  }
  console.log('================================================================\n');

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.connection.close();

  if (fail > 0) process.exit(1);
}

runRoleAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
