/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { hashPassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import {
  UserRole,
  UserStatus,
  Permission,
  CaseStatus,
  CaseSeverity,
  CaseType,
} from '@tn-forest/shared/types';
import { HTTP_STATUS } from '../constants/index.js';

let server: Server;
let BASE_URL = '';

async function request(
  method: string,
  urlPath: string,
  body?: unknown,
  token?: string,
  customHeaders?: Record<string, string>,
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let jsonBody;
  try {
    jsonBody = JSON.parse(text);
  } catch {
    jsonBody = text;
  }
  return { status: res.status, body: jsonBody, headers: res.headers };
}

async function runSuite() {
  console.log('================================================================');
  console.log('🔒 RUNNING PHASE 12.1 SECURITY & OPERATIONAL HARDENING SUITE');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5002;
  BASE_URL = `http://127.0.0.1:${port}`;

  let superAdminToken = '';
  let officerToken = '';
  let dynamicUserToken = '';
  let dynamicUserId = '';
  let testCaseId = '';

  try {
    // -------------------------------------------------------------------------
    // Setup Test Users & Data
    // -------------------------------------------------------------------------
    await User.deleteMany({ email: { $regex: /@p12-security-test\.gov\.in$/ } });

    const pwdHash = await hashPassword('P12SecurePass123!');

    const superAdmin = await User.create({
      employeeId: 'P12-ADMIN-01',
      name: 'P12 Super Admin',
      email: 'superadmin@p12-security-test.gov.in',
      passwordHash: pwdHash,
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
      status: UserStatus.ACTIVE,
    });

    const officer = await User.create({
      employeeId: 'P12-OFFICER-01',
      name: 'P12 Checkpoint Officer',
      email: 'officer@p12-security-test.gov.in',
      passwordHash: pwdHash,
      role: UserRole.CHECKPOINT_OFFICER,
      permissions: [Permission.CHECKPOINT_READ, Permission.CHECKPOINT_VERIFY],
      status: UserStatus.ACTIVE,
    });

    const dynamicUser = await User.create({
      employeeId: 'P12-DYNAMIC-01',
      name: 'P12 Dynamic Status User',
      email: 'dynamic@p12-security-test.gov.in',
      passwordHash: pwdHash,
      role: UserRole.FIELD_OFFICER,
      permissions: [Permission.AREA_READ, Permission.MONITORING_READ],
      status: UserStatus.ACTIVE,
    });

    dynamicUserId = dynamicUser._id.toString();

    superAdminToken = generateToken({
      userId: superAdmin._id.toString(),
      role: superAdmin.role,
      email: superAdmin.email,
    });

    officerToken = generateToken({
      userId: officer._id.toString(),
      role: officer.role,
      email: officer.email,
    });

    dynamicUserToken = generateToken({
      userId: dynamicUserId,
      role: dynamicUser.role,
      email: dynamicUser.email,
    });

    const testCase = await EnforcementCaseModel.create({
      caseId: `CASE-P12-${Date.now()}`,
      title: 'P12 Evidence Security Test Case',
      description: 'Testing strict evidence photo URL validation schemes',
      severity: CaseSeverity.HIGH,
      caseType: CaseType.PROTECTED_ZONE_BREACH,
      status: CaseStatus.ASSIGNED,
      assignedOfficerId: superAdmin._id,
      createdBy: superAdmin._id,
    });
    testCaseId = testCase._id.toString();

    // -------------------------------------------------------------------------
    // Gate 1: Login Rate Limit Protection
    // -------------------------------------------------------------------------
    console.log('--- GATE 1: Login Rate Limit Protection ---');
    // Using header x-test-rate-limit: 'true' and x-test-rate-limit-max: '3'
    const loginHeaders = {
      'x-test-rate-limit': 'true',
      'x-test-rate-limit-max': '3',
    };

    // Requests 1, 2, 3 should proceed to normal auth logic (401 invalid password)
    for (let i = 1; i <= 3; i++) {
      const res = await request(
        'POST',
        '/api/auth/login',
        { email: 'superadmin@p12-security-test.gov.in', password: 'WrongPassword!' },
        undefined,
        loginHeaders,
      );
      assert.strictEqual(
        res.status,
        HTTP_STATUS.UNAUTHORIZED,
        `Attempt ${i} should return 401 Unauthorized`,
      );
    }

    // Request 4 should be blocked by rate limiter with 429
    const resBlockedLogin = await request(
      'POST',
      '/api/auth/login',
      { email: 'superadmin@p12-security-test.gov.in', password: 'WrongPassword!' },
      undefined,
      loginHeaders,
    );
    assert.strictEqual(
      resBlockedLogin.status,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      `Attempt 4 must return HTTP 429 Too Many Requests`,
    );
    assert.strictEqual(resBlockedLogin.body.success, false);
    assert.ok(
      resBlockedLogin.body.message.includes('Too many login attempts'),
      `Expected rate limit message, got: ${resBlockedLogin.body.message}`,
    );
    console.log('✅ Gate 1 Passed: Login rate limiter blocks excessive requests with HTTP 429.\n');

    // -------------------------------------------------------------------------
    // Gate 2: Checkpoint Sync Rate Limit Protection
    // -------------------------------------------------------------------------
    console.log('--- GATE 2: Checkpoint Batch Sync Rate Limit Protection ---');
    const checkpointHeaders = {
      'x-test-rate-limit': 'true',
      'x-test-rate-limit-max': '2',
    };

    // Requests 1 and 2 proceed (empty batch returns 400 Bad Request or 200)
    for (let i = 1; i <= 2; i++) {
      const res = await request(
        'POST',
        '/api/checkpoints/sync-batch',
        { scans: [] },
        superAdminToken,
        checkpointHeaders,
      );
      assert.notStrictEqual(
        res.status,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        `Request ${i} must not be rate limited`,
      );
    }

    // Request 3 is blocked by rate limiter with 429
    const resBlockedSync = await request(
      'POST',
      '/api/checkpoints/sync-batch',
      { scans: [] },
      superAdminToken,
      checkpointHeaders,
    );
    assert.strictEqual(
      resBlockedSync.status,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      `Request 3 must return HTTP 429 Too Many Requests`,
    );
    assert.strictEqual(resBlockedSync.body.success, false);
    assert.ok(
      resBlockedSync.body.message.includes('batch sync requests'),
      `Expected batch sync rate limit message, got: ${resBlockedSync.body.message}`,
    );
    console.log('✅ Gate 2 Passed: Checkpoint sync rate limiter blocks excessive requests with HTTP 429.\n');

    // -------------------------------------------------------------------------
    // Gate 3: Satellite Acquisition Rate Limit Protection
    // -------------------------------------------------------------------------
    console.log('--- GATE 3: Satellite Acquisition Rate Limit Protection ---');
    const satelliteHeaders = {
      'x-test-rate-limit': 'true',
      'x-test-rate-limit-max': '2',
    };

    // Requests 1 and 2 proceed (invalid body returns 400 Bad Request)
    for (let i = 1; i <= 2; i++) {
      const res = await request(
        'POST',
        '/api/satellite/acquire',
        { invalid: true },
        superAdminToken,
        satelliteHeaders,
      );
      assert.strictEqual(
        res.status,
        HTTP_STATUS.BAD_REQUEST,
        `Request ${i} must reach validation (400 Bad Request)`,
      );
    }

    // Request 3 is blocked by rate limiter with 429
    const resBlockedSat = await request(
      'POST',
      '/api/satellite/acquire',
      { invalid: true },
      superAdminToken,
      satelliteHeaders,
    );
    assert.strictEqual(
      resBlockedSat.status,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      `Request 3 must return HTTP 429 Too Many Requests`,
    );
    assert.strictEqual(resBlockedSat.body.success, false);
    assert.ok(
      resBlockedSat.body.message.includes('Satellite acquisition rate limit exceeded'),
      `Expected satellite rate limit message, got: ${resBlockedSat.body.message}`,
    );
    console.log('✅ Gate 3 Passed: Satellite acquisition rate limiter blocks excessive requests with HTTP 429.\n');

    // -------------------------------------------------------------------------
    // Gate 4: Active User Allowed Access
    // -------------------------------------------------------------------------
    console.log('--- GATE 4: Active User Allowed Access ---');
    const resActive = await request('GET', '/api/auth/me', undefined, dynamicUserToken);
    assert.strictEqual(resActive.status, HTTP_STATUS.OK, 'Active user must be allowed (HTTP 200)');
    assert.strictEqual(resActive.body.data.email, 'dynamic@p12-security-test.gov.in');
    assert.strictEqual(resActive.body.data.status, UserStatus.ACTIVE);
    console.log('✅ Gate 4 Passed: Active user is granted access.\n');

    // -------------------------------------------------------------------------
    // Gate 5: Suspended/Inactive/Deleted User Rejected Despite Valid JWT
    // -------------------------------------------------------------------------
    console.log('--- GATE 5: Suspended/Inactive User Rejected Despite Valid JWT ---');
    // Sub-case 5a: Change status to SUSPENDED in DB
    await User.findByIdAndUpdate(dynamicUserId, { status: UserStatus.SUSPENDED });
    const resSuspended = await request('GET', '/api/auth/me', undefined, dynamicUserToken);
    assert.strictEqual(
      resSuspended.status,
      HTTP_STATUS.FORBIDDEN,
      'Suspended user must be rejected with HTTP 403 Forbidden',
    );
    assert.ok(
      resSuspended.body.message.toLowerCase().includes('suspended') ||
        resSuspended.body.message.toLowerCase().includes('inactive'),
      `Expected suspended/inactive message, got: ${resSuspended.body.message}`,
    );

    // Sub-case 5b: Change status to INACTIVE in DB
    await User.findByIdAndUpdate(dynamicUserId, { status: UserStatus.INACTIVE });
    const resInactive = await request('GET', '/api/auth/me', undefined, dynamicUserToken);
    assert.strictEqual(
      resInactive.status,
      HTTP_STATUS.FORBIDDEN,
      'Inactive user must be rejected with HTTP 403 Forbidden',
    );

    // Sub-case 5c: Delete user from DB (token still valid signature, but user does not exist)
    await User.findByIdAndDelete(dynamicUserId);
    const resDeleted = await request('GET', '/api/auth/me', undefined, dynamicUserToken);
    assert.strictEqual(
      resDeleted.status,
      HTTP_STATUS.UNAUTHORIZED,
      'Deleted user must be rejected with HTTP 401 Unauthorized',
    );
    console.log(
      '✅ Gate 5 Passed: Deactivated, suspended, and deleted users are immediately rejected regardless of valid JWT.\n',
    );

    // -------------------------------------------------------------------------
    // Gate 6: Existing RBAC Role Verification
    // -------------------------------------------------------------------------
    console.log('--- GATE 6: Existing RBAC Role Verification ---');
    // Officer lacks User creation permission/role
    const resRbacDenied = await request(
      'POST',
      '/api/users',
      {
        name: 'Unauthorized Attempt',
        email: 'unauth@p12-security-test.gov.in',
        password: 'Password123!',
        role: UserRole.VIEWER,
      },
      officerToken,
    );
    assert.strictEqual(
      resRbacDenied.status,
      HTTP_STATUS.FORBIDDEN,
      'Non-admin role must be rejected with 403 Forbidden on admin route',
    );

    // Super Admin has permission
    const resRbacAllowed = await request('GET', '/api/users', undefined, superAdminToken);
    assert.strictEqual(resRbacAllowed.status, HTTP_STATUS.OK, 'Super Admin must be allowed (200 OK)');
    console.log('✅ Gate 6 Passed: Existing RBAC permissions and role enforcement intact.\n');

    // -------------------------------------------------------------------------
    // Gate 7: Valid Evidence Photo URL Accepted
    // -------------------------------------------------------------------------
    console.log('--- GATE 7: Valid Evidence Photo URL Accepted ---');
    const validPhotoUrls = [
      'https://storage.forest.tn.gov.in/uav/drone_survey_01.jpg',
      'https://bhuvan.nrsc.gov.in/data/sar_field.png',
    ];

    const resValidPhotos = await request(
      'PATCH',
      `/api/enforcement-cases/${testCaseId}/investigation`,
      {
        findings: ['Verified ground clearing via drone survey'],
        fieldVerification: {
          siteObservations: 'Tree canopy cleared over 1.2 hectares',
          photoUrls: validPhotoUrls,
          groundDisturbanceConfirmed: true,
        },
      },
      superAdminToken,
    );

    assert.strictEqual(
      resValidPhotos.status,
      HTTP_STATUS.OK,
      `Valid HTTPS evidence photo URLs must be accepted (HTTP 200). Got: ${resValidPhotos.status} - ${JSON.stringify(resValidPhotos.body)}`,
    );
    assert.strictEqual(resValidPhotos.body.success, true);
    assert.deepStrictEqual(
      resValidPhotos.body.data.fieldVerification.photoUrls,
      validPhotoUrls,
      'Saved photo URLs must match provided valid URLs',
    );
    console.log('✅ Gate 7 Passed: Valid secure HTTPS evidence photo URLs accepted.\n');

    // -------------------------------------------------------------------------
    // Gate 8: Unsafe Evidence Photo URLs Rejected
    // -------------------------------------------------------------------------
    console.log('--- GATE 8: Unsafe Evidence Photo URLs Rejected ---');
    const unsafeUrls = [
      { name: 'javascript: scheme', url: 'javascript:alert(document.cookie)' },
      { name: 'data: base64 scheme', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=' },
      { name: 'file: scheme', url: 'file:///etc/passwd' },
      { name: 'ftp: scheme', url: 'ftp://files.tn.gov.in/photo.jpg' },
      { name: 'plain http: scheme', url: 'http://insecure.forest.tn.gov.in/photo.jpg' },
      { name: 'localhost URL', url: 'https://localhost/exploit.jpg' },
      { name: 'loopback IP', url: 'https://127.0.0.1/exploit.jpg' },
      { name: 'HTML injection', url: 'https://storage.forest.tn.gov.in/<script>alert(1)</script>' },
    ];

    for (const testCase of unsafeUrls) {
      const resUnsafe = await request(
        'PATCH',
        `/api/enforcement-cases/${testCaseId}/investigation`,
        {
          fieldVerification: {
            photoUrls: [testCase.url],
          },
        },
        superAdminToken,
      );
      assert.strictEqual(
        resUnsafe.status,
        HTTP_STATUS.BAD_REQUEST,
        `Unsafe URL (${testCase.name}) must be rejected with HTTP 400 Bad Request. Got: ${resUnsafe.status}`,
      );
    }

    // Test exceeding max 10 URLs
    const elevenUrls = Array.from(
      { length: 11 },
      (_, i) => `https://storage.forest.tn.gov.in/uav/photo_${i}.jpg`,
    );
    const resTooMany = await request(
      'PATCH',
      `/api/enforcement-cases/${testCaseId}/investigation`,
      {
        fieldVerification: {
          photoUrls: elevenUrls,
        },
      },
      superAdminToken,
    );
    assert.strictEqual(
      resTooMany.status,
      HTTP_STATUS.BAD_REQUEST,
      'Exceeding 10 photo URLs must be rejected with HTTP 400 Bad Request',
    );

    // Test URL exceeding 500 characters
    const longUrl = `https://storage.forest.tn.gov.in/${'a'.repeat(510)}.jpg`;
    const resTooLong = await request(
      'PATCH',
      `/api/enforcement-cases/${testCaseId}/investigation`,
      {
        fieldVerification: {
          photoUrls: [longUrl],
        },
      },
      superAdminToken,
    );
    assert.strictEqual(
      resTooLong.status,
      HTTP_STATUS.BAD_REQUEST,
      'Photo URL exceeding 500 characters must be rejected with HTTP 400 Bad Request',
    );

    console.log(
      '✅ Gate 8 Passed: All unsafe schemes (javascript:, data:, file:, http:, loopback, >10 count, >500 chars) strictly rejected.\n',
    );

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('================================================================');
    console.log('🎉 ALL 8 GATES IN PHASE 12.1 SUITE PASSED SUCCESSFULLY');
    console.log('================================================================');
  } finally {
    // Clean up test data
    await User.deleteMany({ email: { $regex: /@p12-security-test\.gov\.in$/ } });
    if (testCaseId) {
      await EnforcementCaseModel.findByIdAndDelete(testCaseId);
    }
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  }
}

runSuite().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
