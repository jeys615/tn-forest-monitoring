import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, Permission } from '@tn-forest/shared/types';
import type { Server } from 'node:http';
import mongoose from 'mongoose';

async function verifyAllZones() {
  console.log('================================================================');
  console.log('🔍 VERIFYING GLOBAL SATELLITE CATALOG API FOR ALL ZONES');
  console.log('================================================================\n');

  await connectDatabase();
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5099;
  const baseUrl = `http://localhost:${port}/api`;

  // Get or create admin user for token
  const email = 'verify-admin@tnforest.gov.in';
  let admin = await User.findOne({ email });
  if (!admin) {
    admin = await User.create({
      name: 'Verify Admin',
      email,
      passwordHash: await hashPassword('Admin@1234'),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      permissions: Object.values(Permission),
    });
  }

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Admin@1234' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.token;

  if (!token) {
    throw new Error('Failed to obtain auth token: ' + JSON.stringify(loginData));
  }

  const zones = await Zone.find({});
  console.log(`Testing ${zones.length} zones:\n`);

  for (const zone of zones) {
    console.log(`----------------------------------------------------------------`);
    console.log(`Testing Zone: "${zone.name}" (${zone.zoneId})`);
    console.log(`Geometry Type: ${zone.boundary?.type}, Points: ${zone.boundary?.coordinates?.[0]?.length}`);

    // 1. Query by ObjectId
    const resId = await fetch(`${baseUrl}/satellite/images?zoneId=${zone._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dataId = await resId.json();
    console.log(`Query by ObjectId (${zone._id}): HTTP ${resId.status}, Returned ${dataId.data?.length} records`);

    // 2. Query by Zone Code (e.g. ZONE-261007-2771)
    const resCode = await fetch(`${baseUrl}/satellite/images?zoneId=${zone.zoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dataCode = await resCode.json();
    console.log(`Query by Zone Code (${zone.zoneId}): HTTP ${resCode.status}, Returned ${dataCode.data?.length} records`);

    if (dataId.data?.length !== dataCode.data?.length) {
      throw new Error(`Mismatch between ObjectId query and Zone Code query for ${zone.name}!`);
    }

    if (!dataId.data || dataId.data.length === 0) {
      throw new Error(`Zero records returned for zone ${zone.name}!`);
    }

    // Verify properties of each observation
    for (const obs of dataId.data) {
      console.log(`  - Image: ${obs.imageId}`);
      console.log(`    Date: ${obs.acquisitionDate} | Sensor: ${obs.sensorType} | Source: ${obs.source}`);
      console.log(`    Status: ${obs.processingStatus} | Cloud: ${obs.cloudCover}% | CRS: ${obs.rasterCrs || obs.originalCrs}`);
      console.log(`    Zones: ${obs.intersectingZones.length} (${obs.intersectingZones.join(', ')})`);
      
      // Verification assertions
      if (!obs.imageId) throw new Error('Missing imageId!');
      if (!obs.acquisitionDate) throw new Error('Missing acquisitionDate!');
      if (!obs.sensorType) throw new Error('Missing sensorType!');
      if (!obs.source) throw new Error('Missing source!');
      if (!obs.processingStatus) throw new Error('Missing processingStatus!');
      if (!obs.footprint || !obs.footprint.coordinates) throw new Error('Missing footprint coordinates!');
      if (!obs.intersectingZones.includes(zone._id.toString())) {
        throw new Error(`Observation ${obs.imageId} does not include zone ${zone._id} in intersectingZones!`);
      }
    }
  }

  console.log(`\n----------------------------------------------------------------`);
  console.log('✅ ALL ZONES SUCCESSFULLY VERIFIED VIA REST API');
  console.log('----------------------------------------------------------------\n');

  server.close();
  await mongoose.connection.close();
  process.exit(0);
}

verifyAllZones().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
