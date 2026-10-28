/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, Permission } from '@tn-forest/shared/types';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;

async function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
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
  console.info('🧪 Starting M1 User & Access Management Test Suite...\n');
  await connectDatabase();

  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5001;
  baseUrl = `http://localhost:${port}`;

  let superAdminToken = '';
  let officerToken = '';
  let createdUserId = '';

  try {
    // Clear test users
    await User.deleteMany({ email: { $regex: /@test\.com$/ } });

    // Seed test Super Admin
    const superAdminPassHash = await hashPassword('SuperAdmin123!');
    await User.create({
      employeeId: 'TEST-EMP-01',
      name: 'Test Super Admin',
      email: 'admin@test.com',
      passwordHash: superAdminPassHash,
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
      status: UserStatus.ACTIVE,
    });

    // Seed test Officer (Limited permissions)
    const officerPassHash = await hashPassword('Officer123!');
    await User.create({
      employeeId: 'TEST-EMP-02',
      name: 'Test Officer',
      email: 'officer@test.com',
      passwordHash: officerPassHash,
      role: UserRole.VIEWER,
      permissions: [Permission.USER_READ],
      status: UserStatus.ACTIVE,
    });

    // Seed Inactive User
    await User.create({
      employeeId: 'TEST-EMP-03',
      name: 'Test Inactive',
      email: 'inactive@test.com',
      passwordHash: officerPassHash,
      role: UserRole.VIEWER,
      permissions: [],
      status: UserStatus.INACTIVE,
    });

    // Seed Suspended User
    await User.create({
      employeeId: 'TEST-EMP-04',
      name: 'Test Suspended',
      email: 'suspended@test.com',
      passwordHash: officerPassHash,
      role: UserRole.VIEWER,
      permissions: [],
      status: UserStatus.SUSPENDED,
    });

    // 1. Valid Login
    console.info('Test 1: Valid Login');
    const res1 = await request('POST', '/api/auth/login', {
      email: 'admin@test.com',
      password: 'SuperAdmin123!',
    });
    if (res1.status === 200 && res1.body.data.token) {
      superAdminToken = res1.body.data.token;
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 1 Failed: ${JSON.stringify(res1.body)}`);
    }

    // Login for Officer
    const resOfficerLogin = await request('POST', '/api/auth/login', {
      email: 'officer@test.com',
      password: 'Officer123!',
    });
    officerToken = resOfficerLogin.body.data.token;

    // 2. Invalid Password
    console.info('Test 2: Invalid Password');
    const res2 = await request('POST', '/api/auth/login', {
      email: 'admin@test.com',
      password: 'WrongPassword123!',
    });
    if (res2.status === 401) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 2 Failed: Expected 401 got ${res2.status}`);
    }

    // 3. Unknown User Login
    console.info('Test 3: Unknown User Login');
    const res3 = await request('POST', '/api/auth/login', {
      email: 'unknown@test.com',
      password: 'SomePassword123!',
    });
    if (res3.status === 401 && res3.body.message === 'Invalid email or password') {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 3 Failed: ${JSON.stringify(res3.body)}`);
    }

    // 4. Inactive User Login Rejection
    console.info('Test 4: Inactive User Login Rejection');
    const res4 = await request('POST', '/api/auth/login', {
      email: 'inactive@test.com',
      password: 'Officer123!',
    });
    if (res4.status === 401 && res4.body.message.includes('inactive')) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 4 Failed: Expected 401 got ${res4.status}`);
    }

    // 5. Suspended User Login Rejection
    console.info('Test 5: Suspended User Login Rejection');
    const res5 = await request('POST', '/api/auth/login', {
      email: 'suspended@test.com',
      password: 'Officer123!',
    });
    if (res5.status === 403 && res5.body.message.includes('suspended')) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 5 Failed: Expected 403 got ${res5.status}`);
    }

    // 6. Protected Endpoint Without Token
    console.info('Test 6: Protected Endpoint Without Token');
    const res6 = await request('GET', '/api/auth/me');
    if (res6.status === 401) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 6 Failed: Expected 401 got ${res6.status}`);
    }

    // 7. Protected Endpoint With Invalid Token
    console.info('Test 7: Protected Endpoint With Invalid Token');
    const res7 = await request('GET', '/api/auth/me', undefined, 'invalid-jwt-token');
    if (res7.status === 401) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 7 Failed: Expected 401 got ${res7.status}`);
    }

    // 8. Protected Endpoint With Valid Token
    console.info('Test 8: Protected Endpoint With Valid Token');
    const res8 = await request('GET', '/api/auth/me', undefined, superAdminToken);
    if (
      res8.status === 200 &&
      res8.body.data.email === 'admin@test.com' &&
      !res8.body.data.passwordHash
    ) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 8 Failed: ${JSON.stringify(res8.body)}`);
    }

    // 9. Insufficient Permission Enforcement
    console.info('Test 9: Insufficient Permission Enforcement');
    // Officer lacks USER_CREATE permission
    const res9 = await request(
      'POST',
      '/api/users',
      {
        name: 'Unauthorized User',
        email: 'unauth@test.com',
        password: 'Password123!',
        role: UserRole.VIEWER,
      },
      officerToken,
    );
    if (res9.status === 403) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 9 Failed: Expected 403 got ${res9.status}`);
    }

    // 10. Authorized User Access
    console.info('Test 10: Authorized User Access');
    const res10 = await request('GET', '/api/users', undefined, superAdminToken);
    if (res10.status === 200 && Array.isArray(res10.body.data)) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 10 Failed: ${JSON.stringify(res10.body)}`);
    }

    // 11. User Creation
    console.info('Test 11: User Creation');
    const res11 = await request(
      'POST',
      '/api/users',
      {
        employeeId: 'TEST-EMP-99',
        name: 'New Test User',
        email: 'newuser@test.com',
        password: 'Password123!',
        role: UserRole.FIELD_OFFICER,
      },
      superAdminToken,
    );
    if (res11.status === 201 && res11.body.data.id) {
      createdUserId = res11.body.data.id;
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 11 Failed: ${JSON.stringify(res11.body)}`);
    }

    // 12. Duplicate Email User Creation
    console.info('Test 12: Duplicate Email Rejection');
    const res12 = await request(
      'POST',
      '/api/users',
      {
        name: 'Duplicate Email User',
        email: 'newuser@test.com',
        password: 'Password123!',
        role: UserRole.VIEWER,
      },
      superAdminToken,
    );
    if (res12.status === 409) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 12 Failed: Expected 409 got ${res12.status}`);
    }

    // 13. Duplicate Employee ID Rejection
    console.info('Test 13: Duplicate Employee ID Rejection');
    const res13 = await request(
      'POST',
      '/api/users',
      {
        employeeId: 'TEST-EMP-99',
        name: 'Duplicate Emp User',
        email: 'uniqueemp@test.com',
        password: 'Password123!',
        role: UserRole.VIEWER,
      },
      superAdminToken,
    );
    if (res13.status === 409) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 13 Failed: Expected 409 got ${res13.status}`);
    }

    // 14. Unauthorized Privilege Escalation Attempt
    console.info('Test 14: Unauthorized Privilege Escalation Block');
    const res14 = await request(
      'POST',
      '/api/users',
      {
        name: 'Escalated Admin',
        email: 'escalated@test.com',
        password: 'Password123!',
        role: UserRole.SUPER_ADMIN,
      },
      officerToken,
    );
    if (res14.status === 403) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 14 Failed: Expected 403 got ${res14.status}`);
    }

    // 15. Password Change
    console.info('Test 15: Password Change');
    const res15 = await request(
      'POST',
      '/api/auth/change-password',
      {
        currentPassword: 'Officer123!',
        newPassword: 'NewOfficerPass123!',
      },
      officerToken,
    );
    if (res15.status === 200) {
      // Test login with new password
      const relogin = await request('POST', '/api/auth/login', {
        email: 'officer@test.com',
        password: 'NewOfficerPass123!',
      });
      if (relogin.status === 200) {
        console.info('  ✅ Passed');
      } else {
        throw new Error('Test 15 Failed: Could not login with new password');
      }
    } else {
      throw new Error(`Test 15 Failed: ${JSON.stringify(res15.body)}`);
    }

    // 16. User Deactivation
    console.info('Test 16: User Deactivation');
    const res16 = await request(
      'PATCH',
      `/api/users/${createdUserId}/status`,
      { status: UserStatus.INACTIVE },
      superAdminToken,
    );
    if (res16.status === 200 && res16.body.data.status === UserStatus.INACTIVE) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 16 Failed: ${JSON.stringify(res16.body)}`);
    }

    console.info('\n🎉 All 16 M1 Tests Passed Successfully!\n');
  } finally {
    // Cleanup test users
    await User.deleteMany({ email: { $regex: /@test\.com$/ } });
    server.close();
    await mongoose.connection.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failure:', err);
  process.exit(1);
});
