/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  ZoneStatus,
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
  console.info('🧪 Starting M2 Zone & Map Management Test Suite...\n');
  await connectDatabase();

  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5002;
  baseUrl = `http://localhost:${port}`;

  let superAdminToken = '';
  let viewerToken = '';
  let testZoneId = '';

  try {
    // Clear test users and zones
    await User.deleteMany({ email: { $regex: /@test-m2\.com$/ } });
    await Zone.deleteMany({ name: { $regex: /^Test-M2/ } });

    // Seed test Admin (With AREA_CREATE, AREA_READ, AREA_UPDATE permissions)
    const adminPassHash = await hashPassword('AdminPass123!');
    await User.create({
      employeeId: 'M2-EMP-01',
      name: 'M2 Admin',
      email: 'admin@test-m2.com',
      passwordHash: adminPassHash,
      role: UserRole.ADMIN,
      permissions: [Permission.AREA_CREATE, Permission.AREA_READ, Permission.AREA_UPDATE],
      status: UserStatus.ACTIVE,
    });

    // Seed test Viewer (No AREA_CREATE/AREA_UPDATE permissions)
    await User.create({
      employeeId: 'M2-EMP-02',
      name: 'M2 Viewer',
      email: 'viewer@test-m2.com',
      passwordHash: adminPassHash,
      role: UserRole.VIEWER,
      permissions: [Permission.AREA_READ],
      status: UserStatus.ACTIVE,
    });

    // Login Admin
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'admin@test-m2.com',
      password: 'AdminPass123!',
    });
    superAdminToken = loginRes.body.data.token;

    // Login Viewer
    const viewerLoginRes = await request('POST', '/api/auth/login', {
      email: 'viewer@test-m2.com',
      password: 'AdminPass123!',
    });
    viewerToken = viewerLoginRes.body.data.token;

    const validPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [80.1234, 13.5678],
          [80.5678, 13.5678],
          [80.5678, 13.1234],
          [80.1234, 13.1234],
          [80.1234, 13.5678], // Closed
        ],
      ],
    };

    // 1. Create Valid Zone
    console.info('Test 1: Create Valid Zone');
    const res1 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Zone 1',
        category: ZoneCategory.PROTECTED_FOREST,
        boundary: validPolygon,
        baselineDate: '2026-08-20',
      },
      superAdminToken,
    );
    if (res1.status === 201 && res1.body.data.id) {
      testZoneId = res1.body.data.id;
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 1 Failed: ${JSON.stringify(res1.body)}`);
    }

    // 2. Reject Unauthenticated Create
    console.info('Test 2: Reject Unauthenticated Create');
    const res2 = await request('POST', '/api/zones', {
      name: 'Test-M2 Unauth',
      category: ZoneCategory.PROTECTED_FOREST,
      boundary: validPolygon,
    });
    if (res2.status === 401) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 2 Failed: Expected 401, got ${res2.status}`);
    }

    // 3. Reject Unauthorized Role
    console.info('Test 3: Reject Unauthorized Role (Viewer cannot create)');
    const res3 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Viewer Create',
        category: ZoneCategory.PROTECTED_FOREST,
        boundary: validPolygon,
      },
      viewerToken,
    );
    if (res3.status === 403) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 3 Failed: Expected 403, got ${res3.status}`);
    }

    // 4. Create Each Valid Category
    console.info('Test 4: Create Each Valid Category');
    const categories = Object.values(ZoneCategory);
    for (const cat of categories) {
      const name = `Test-M2 ${cat}`;
      const res = await request(
        'POST',
        '/api/zones',
        {
          name,
          category: cat,
          boundary: validPolygon,
        },
        superAdminToken,
      );
      if (res.status !== 201) {
        throw new Error(`Test 4 Failed for category ${cat}: ${JSON.stringify(res.body)}`);
      }
    }
    console.info('  ✅ Passed');

    // 5. Reject Invalid Category
    console.info('Test 5: Reject Invalid Category');
    const res5 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Invalid Cat',
        category: 'INVALID_CATEGORY',
        boundary: validPolygon,
      },
      superAdminToken,
    );
    if (res5.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 5 Failed: Expected 400, got ${res5.status}`);
    }

    // 6. Reject Missing Name
    console.info('Test 6: Reject Missing Name');
    const res6 = await request(
      'POST',
      '/api/zones',
      {
        category: ZoneCategory.RESERVED_AREA,
        boundary: validPolygon,
      },
      superAdminToken,
    );
    if (res6.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 6 Failed: Expected 400, got ${res6.status}`);
    }

    // 7. Reject Malformed GeoJSON (coordinates not array)
    console.info('Test 7: Reject Malformed GeoJSON');
    const res7 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Malformed GeoJSON',
        category: ZoneCategory.RESERVED_AREA,
        boundary: {
          type: 'Polygon',
          coordinates: 'not-an-array',
        },
      },
      superAdminToken,
    );
    if (res7.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 7 Failed: Expected 400, got ${res7.status}`);
    }

    // 8. Reject Wrong Geometry Type (Point for zone boundary)
    console.info('Test 8: Reject Wrong Geometry Type');
    const res8 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Point Boundary',
        category: ZoneCategory.RESERVED_AREA,
        boundary: {
          type: 'Point',
          coordinates: [80.1234, 13.5678],
        },
      },
      superAdminToken,
    );
    if (res8.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 8 Failed: Expected 400, got ${res8.status}`);
    }

    // 9. Reject Invalid Longitude
    console.info('Test 9: Reject Invalid Longitude');
    const res9 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Invalid Lng',
        category: ZoneCategory.RESERVED_AREA,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [280.1234, 13.5678],
              [80.5678, 13.5678],
              [80.5678, 13.1234],
              [80.1234, 13.1234],
              [280.1234, 13.5678],
            ],
          ],
        },
      },
      superAdminToken,
    );
    if (res9.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 9 Failed: Expected 400, got ${res9.status}`);
    }

    // 10. Reject Invalid Latitude
    console.info('Test 10: Reject Invalid Latitude');
    const res10 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Invalid Lat',
        category: ZoneCategory.RESERVED_AREA,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [80.1234, 113.5678],
              [80.5678, 13.5678],
              [80.5678, 13.1234],
              [80.1234, 13.1234],
              [80.1234, 113.5678],
            ],
          ],
        },
      },
      superAdminToken,
    );
    if (res10.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 10 Failed: Expected 400, got ${res10.status}`);
    }

    // 11. Reject Unclosed Polygon
    console.info('Test 11: Reject Unclosed Polygon');
    const res11 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Unclosed',
        category: ZoneCategory.RESERVED_AREA,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [80.1234, 13.5678],
              [80.5678, 13.5678],
              [80.5678, 13.1234],
              [80.1234, 13.1234], // Not closed (first was 80.1234, 13.5678)
            ],
          ],
        },
      },
      superAdminToken,
    );
    if (res11.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 11 Failed: Expected 400, got ${res11.status}`);
    }

    // 12. Reject Insufficient Polygon Points
    console.info('Test 12: Reject Insufficient Polygon Points');
    const res12 = await request(
      'POST',
      '/api/zones',
      {
        name: 'Test-M2 Insufficient',
        category: ZoneCategory.RESERVED_AREA,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [80.1234, 13.5678],
              [80.5678, 13.5678],
              [80.1234, 13.5678], // Only 3 points (unclosed if different, closed but less than 4 points)
            ],
          ],
        },
      },
      superAdminToken,
    );
    if (res12.status === 400) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 12 Failed: Expected 400, got ${res12.status}`);
    }

    // 13. Calculate centerPoint
    console.info('Test 13: Calculate centerPoint');
    if (res1.body.data.centerPoint && res1.body.data.centerPoint.type === 'Point') {
      const [lng, lat] = res1.body.data.centerPoint.coordinates;
      // Expect centroid coordinate to be inside bounding box: [80.1234-80.5678, 13.1234-13.5678]
      if (lng > 80.1234 && lng < 80.5678 && lat > 13.1234 && lat < 13.5678) {
        console.info('  ✅ Passed');
      } else {
        throw new Error(`Test 13 Centroid value incorrect: ${lng}, ${lat}`);
      }
    } else {
      throw new Error('Test 13 Failed: centerPoint missing or incorrect shape');
    }

    // 14. Save createdBy from JWT
    console.info('Test 14: Save createdBy from JWT');
    if (res1.body.data.createdBy && res1.body.data.createdBy.email === 'admin@test-m2.com') {
      console.info('  ✅ Passed');
    } else {
      throw new Error(
        `Test 14 Failed: expected creator admin@test-m2.com, got ${JSON.stringify(res1.body.data.createdBy)}`,
      );
    }

    // 15. Get Zones
    console.info('Test 15: Get Zones');
    const res15 = await request('GET', '/api/zones', undefined, viewerToken);
    if (res15.status === 200 && Array.isArray(res15.body.data) && res15.body.data.length > 0) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 15 Failed: ${JSON.stringify(res15.body)}`);
    }

    // 16. Filter by category
    console.info('Test 16: Filter by Category');
    const res16 = await request(
      'GET',
      `/api/zones?category=${ZoneCategory.PROTECTED_FOREST}`,
      undefined,
      viewerToken,
    );
    const allProtected = res16.body.data.every(
      (z: any) => z.category === ZoneCategory.PROTECTED_FOREST,
    );
    if (res16.status === 200 && allProtected) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 16 Failed: ${JSON.stringify(res16.body)}`);
    }

    // 17. Filter by status
    console.info('Test 17: Filter by Status');
    const res17 = await request(
      'GET',
      `/api/zones?status=${ZoneStatus.PROTECTED}`,
      undefined,
      viewerToken,
    );
    const allActive = res17.body.data.every((z: any) => z.status === ZoneStatus.PROTECTED);
    if (res17.status === 200 && allActive) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 17 Failed: ${JSON.stringify(res17.body)}`);
    }

    // 18. Get Zone by ID
    console.info('Test 18: Get Zone by ID');
    const res18 = await request('GET', `/api/zones/${testZoneId}`, undefined, viewerToken);
    if (res18.status === 200 && res18.body.data.id === testZoneId) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 18 Failed: ${JSON.stringify(res18.body)}`);
    }

    // 19. Update Zone (name and category)
    console.info('Test 19: Update Zone Metadata');
    const res19 = await request(
      'PATCH',
      `/api/zones/${testZoneId}`,
      {
        name: 'Test-M2 Zone 1 Updated',
        category: ZoneCategory.SUSPICIOUS_HOTSPOT,
      },
      superAdminToken,
    );
    if (
      res19.status === 200 &&
      res19.body.data.name === 'Test-M2 Zone 1 Updated' &&
      res19.body.data.category === ZoneCategory.SUSPICIOUS_HOTSPOT
    ) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 19 Failed: ${JSON.stringify(res19.body)}`);
    }

    // 20. Update Polygon
    console.info('Test 20: Update Polygon Boundary');
    const newPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [81.0, 14.0],
          [82.0, 14.0],
          [82.0, 13.0],
          [81.0, 13.0],
          [81.0, 14.0], // Closed
        ],
      ],
    };
    const res20 = await request(
      'PATCH',
      `/api/zones/${testZoneId}`,
      { boundary: newPolygon },
      superAdminToken,
    );
    if (res20.status === 200 && res20.body.data.boundary.coordinates[0][0][0] === 81.0) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 20 Failed: ${JSON.stringify(res20.body)}`);
    }

    // 21. Recalculate centerPoint after update
    console.info('Test 21: Recalculate centerPoint after update');
    const [newLng, newLat] = res20.body.data.centerPoint.coordinates;
    // Bounding Box center for [[81.0, 14.0], [82.0, 13.0]] is [81.5, 13.5]
    if (Math.abs(newLng - 81.5) < 0.01 && Math.abs(newLat - 13.5) < 0.01) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(
        `Test 21 Centroid incorrect: expected near [81.5, 13.5], got [${newLng}, ${newLat}]`,
      );
    }

    // 22. Prevent unauthorized update
    console.info('Test 22: Prevent unauthorized update (Viewer cannot update)');
    const res22 = await request(
      'PATCH',
      `/api/zones/${testZoneId}`,
      { name: 'Viewer Hack Name' },
      viewerToken,
    );
    if (res22.status === 403) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 22 Failed: Expected 403, got ${res22.status}`);
    }

    // 23. Status update via suspend endpoint
    console.info('Test 23: Status Update via Suspend Endpoint');
    const res23 = await request('PATCH', `/api/zones/${testZoneId}/suspend`, {}, superAdminToken);
    if (res23.status === 200 && res23.body.data.status === ZoneStatus.SUSPENDED) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(`Test 23 Failed: ${JSON.stringify(res23.body)}`);
    }

    // 24. MongoDB geospatial index exists (We can query MongoDB indexes directly)
    console.info('Test 24: MongoDB geospatial index check');
    const indexes = await Zone.collection.indexes();
    const boundaryIndex = indexes.find((idx) => idx.key.boundary === '2dsphere');
    const centerPointIndex = indexes.find((idx) => idx.key.centerPoint === '2dsphere');

    if (boundaryIndex && centerPointIndex) {
      console.info('  ✅ Passed');
    } else {
      throw new Error(
        'Test 24 Failed: Indexes boundary: "2dsphere" or centerPoint: "2dsphere" missing',
      );
    }

    // 25. Map API response contains valid GeoJSON
    console.info('Test 25: Map API response contains valid GeoJSON');
    if (
      res15.body.data[0].boundary.type === 'Polygon' &&
      Array.isArray(res15.body.data[0].boundary.coordinates) &&
      res15.body.data[0].centerPoint.type === 'Point'
    ) {
      console.info('  ✅ Passed');
    } else {
      throw new Error('Test 25 Failed: Map API data has incorrect GeoJSON format');
    }

    console.info('\n🎉 All M2 Tests Passed Successfully!\n');
  } finally {
    // Cleanup test users and zones
    await User.deleteMany({ email: { $regex: /@test-m2\.com$/ } });
    await Zone.deleteMany({ name: { $regex: /^Test-M2/ } });
    server.close();
    await mongoose.connection.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failure:', err);
  process.exit(1);
});
