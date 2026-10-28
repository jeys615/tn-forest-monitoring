/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { EPassModel } from '../models/EPass.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { CheckpointService } from '../services/CheckpointService.js';
import { ePassService } from '../services/EPassService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  CheckpointStatus,
  CheckpointVerificationResult,
  MiningAuthorizationStatus,
  VehicleStatus,
  DriverVerificationStatus,
  EPassStatus,
  EnforcementRejectionReason,
} from '@tn-forest/shared/types';
import { hashPassword } from '../utils/password.js';

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

  const text = await res.text();
  let jsonBody;
  try {
    jsonBody = JSON.parse(text);
  } catch {
    jsonBody = text;
  }
  return { status: res.status, body: jsonBody };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 PHASE 11.2: BATCH CHECKPOINT SYNCHRONIZATION UNIT & API TESTS');
  console.log('================================================================\n');

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGODB_URI);
  }

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        BASE_URL = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });

  const checkpointService = new CheckpointService();

  try {
    // -------------------------------------------------------------------------
    // Gate 1: Setup Environment
    // -------------------------------------------------------------------------
    console.log('▶ Gate 1: Establishing checkpoint officer, checkpoint, vehicle, driver, and e-passes...');

    const testPassword = await hashPassword('TestPass@123');
    const officerEmail = `batch_officer_${Date.now()}@forest.tn.gov.in`;

    const officer = await User.create({
      name: 'Selvi M. Kausalya Forest Guard',
      email: officerEmail,
      passwordHash: testPassword,
      role: UserRole.CHECKPOINT_OFFICER,
      status: UserStatus.ACTIVE,
      permissions: Object.values(Permission),
    });

    const loginRes = await request('POST', '/api/auth/login', {
      email: officerEmail,
      password: 'TestPass@123',
    });
    assert.strictEqual(loginRes.status, 200, 'Officer login must succeed');
    const authToken = loginRes.body.data.token;

    // Checkpoint at [78.1198, 9.9252] (Madurai Checkpost)
    const cpId = `CP-BATCH-${Date.now()}`;
    const checkpoint = await CheckpointModel.create({
      checkpointId: cpId,
      name: 'Madurai Forest Border Post #03',
      district: 'Madurai',
      location: {
        type: 'Point',
        coordinates: [78.1198, 9.9252],
      },
      geofenceRadiusMeters: 500,
      status: CheckpointStatus.ACTIVE,
      authorizedUserIds: [officer._id],
    });

    // Transport Company
    const company = await TransportCompanyModel.create({
      companyId: `TC-BATCH-${Date.now()}`,
      registrationNumber: `TN-TC-${Math.floor(1000 + Math.random() * 9000)}`,
      companyName: 'Tamil Nadu Logistics Fleet',
      contactDetails: { phone: '+91 9876543210' },
    });

    // Mining Authorization
    const auth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-BATCH-${Date.now()}`,
      permitNumber: `PERMIT-BATCH-${Date.now()}`,
      lesseeName: 'Tamil Nadu Minerals Ltd',
      mineralType: 'Granite',
      permittedWeightTonnes: 10000,
      remainingQuota: 9500,
      status: MiningAuthorizationStatus.ACTIVE,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 180 * 24 * 3600 * 1000),
      createdBy: officer._id,
    });

    // Vehicle & Driver
    const vehicle = await VehicleModel.create({
      vehicleId: `VEH-BATCH-${Date.now()}`,
      registrationNumber: `TN-59-BZ-${Math.floor(1000 + Math.random() * 9000)}`,
      vehicleType: 'TRUCK',
      tareWeight: 8.5,
      grossVehicleWeight: 35.0,
      permittedCarryingCapacity: 25,
      status: VehicleStatus.ACTIVE,
      transportCompanyId: company._id,
    });

    const driver = await DriverModel.create({
      driverId: `DRV-BATCH-${Date.now()}`,
      name: 'K. Murugan',
      licenseNumber: `DL-TN-59-${Math.floor(100000 + Math.random() * 900000)}`,
      phone: '+91 9944001122',
      verificationStatus: DriverVerificationStatus.VERIFIED,
      transportCompanyId: company._id,
    });

    // E-Passes via ePassService
    const epass01Dto = await ePassService.createEPass(
      {
        authorizationId: auth._id.toString(),
        vehicleId: vehicle._id.toString(),
        driverId: driver._id.toString(),
        netWeightTonnes: 18.5,
        destinationCheckpoint: checkpoint.name,
      },
      officer._id.toString(),
    );
    // Backdate validFrom to 2 hours ago so an offline scan 15 mins ago is valid
    await EPassModel.findByIdAndUpdate(epass01Dto.id, {
      validFrom: new Date(Date.now() - 2 * 3600 * 1000),
    });
    const pass01Num = epass01Dto.passNumber;

    const epassExpiredDto = await ePassService.createEPass(
      {
        authorizationId: auth._id.toString(),
        vehicleId: vehicle._id.toString(),
        driverId: driver._id.toString(),
        netWeightTonnes: 15.0,
        destinationCheckpoint: checkpoint.name,
      },
      officer._id.toString(),
    );
    // Mark expired
    await EPassModel.findByIdAndUpdate(epassExpiredDto.id, {
      status: EPassStatus.EXPIRED,
      validUntil: new Date(Date.now() - 2 * 3600 * 1000),
    });
    const passExpiredNum = epassExpiredDto.passNumber;

    console.log('  ✔ Checkpoint test environment established');

    // -------------------------------------------------------------------------
    // Gate 2: Batch Sync Mixed Status Processing
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 2: Testing batch sync with mixed results (ACCEPTED, REJECTED, NOT_FOUND)...');

    const offlineTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago

    const batchSyncResult = await checkpointService.syncBatchPassages(
      {
        checkpointId: checkpoint.checkpointId,
        syncBatchId: `OFFLINE-BATCH-${Date.now()}`,
        passages: [
          {
            clientLogId: 'CLIENT-OFFLINE-001',
            syncNonce: 'NONCE-001',
            passNumberOrId: pass01Num,
            passageTimestamp: offlineTimestamp,
            currentLocation: [78.1199, 9.9251], // within 20m of checkpoint
            declaredQuantityTonnes: 18.5,
            notes: 'Offline scan at south barrier',
          },
          {
            clientLogId: 'CLIENT-OFFLINE-002',
            syncNonce: 'NONCE-002',
            passNumberOrId: passExpiredNum,
            passageTimestamp: offlineTimestamp,
            currentLocation: [78.1199, 9.9251],
            declaredQuantityTonnes: 15.0,
            notes: 'Attempted passage with expired permit',
          },
          {
            clientLogId: 'CLIENT-OFFLINE-003',
            syncNonce: 'NONCE-003',
            passNumberOrId: 'PASS-NONEXISTENT-999',
            passageTimestamp: offlineTimestamp,
            currentLocation: [78.1199, 9.9251],
            declaredQuantityTonnes: 10.0,
          },
        ],
      },
      officer._id.toString(),
    );

    assert.strictEqual(batchSyncResult.totalSubmitted, 3);
    assert.strictEqual(batchSyncResult.acceptedCount, 1, 'Exactly 1 passage must be accepted');
    assert.strictEqual(batchSyncResult.rejectedCount, 2, 'Exactly 2 passages must be rejected');
    assert.strictEqual(batchSyncResult.duplicateCount, 0, 'Initial submission should have 0 duplicates');
    assert.strictEqual(batchSyncResult.failedCount, 0);

    // Verify first passage details
    const res1 = batchSyncResult.results.find((r) => r.clientLogId === 'CLIENT-OFFLINE-001');
    assert.ok(res1);
    assert.strictEqual(res1.status, 'ACCEPTED');
    assert.strictEqual(res1.verificationResult, CheckpointVerificationResult.VALID);

    // Verify E-Pass state transitioned to USED
    const updatedEpass01 = await EPassModel.findById(epass01Dto.id);
    assert.strictEqual(updatedEpass01?.status, EPassStatus.USED);

    // Verify second passage was rejected with reason
    const res2 = batchSyncResult.results.find((r) => r.clientLogId === 'CLIENT-OFFLINE-002');
    assert.ok(res2);
    assert.strictEqual(res2.status, 'REJECTED');
    assert.strictEqual(res2.verificationResult, CheckpointVerificationResult.INVALID);
    assert.ok(res2.rejectionReasons?.includes(EnforcementRejectionReason.EPASS_EXPIRED));

    // Verify third passage was rejected as not found
    const res3 = batchSyncResult.results.find((r) => r.clientLogId === 'CLIENT-OFFLINE-003');
    assert.ok(res3);
    assert.strictEqual(res3.status, 'REJECTED');
    assert.ok(res3.rejectionReasons?.includes(EnforcementRejectionReason.EPASS_NOT_FOUND));

    console.log('  ✔ Batch sync mixed status processing verified');

    // -------------------------------------------------------------------------
    // Gate 3: Idempotency & Duplicate Re-sync Protection
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 3: Testing idempotency and duplicate re-sync protection...');

    // Re-send the same batch containing CLIENT-OFFLINE-001
    const duplicateBatchResult = await checkpointService.syncBatchPassages(
      {
        checkpointId: checkpoint.checkpointId,
        syncBatchId: `OFFLINE-BATCH-RETRY-${Date.now()}`,
        passages: [
          {
            clientLogId: 'CLIENT-OFFLINE-001',
            syncNonce: 'NONCE-001',
            passNumberOrId: pass01Num,
            passageTimestamp: offlineTimestamp,
            currentLocation: [78.1199, 9.9251],
            declaredQuantityTonnes: 18.5,
          },
        ],
      },
      officer._id.toString(),
    );

    assert.strictEqual(duplicateBatchResult.totalSubmitted, 1);
    assert.strictEqual(duplicateBatchResult.acceptedCount, 0, 'Duplicate re-sync must not be accepted again');
    assert.strictEqual(duplicateBatchResult.duplicateCount, 1, 'Must be flagged as DUPLICATE');
    assert.strictEqual(duplicateBatchResult.results[0].status, 'DUPLICATE');

    // Confirm that the log count for this passNumber at this checkpoint did NOT increase
    const logsForPass = await CheckpointLogModel.find({
      checkpointId: checkpoint._id,
      passNumber: pass01Num,
    });
    assert.strictEqual(logsForPass.length, 1, 'Only exactly 1 log record must exist');

    console.log('  ✔ Idempotency & duplicate protection verified');

    // -------------------------------------------------------------------------
    // Gate 4: Geofence Validation During Batch Sync
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 4: Testing geofence validation for batch passage...');

    const epass02Dto = await ePassService.createEPass(
      {
        authorizationId: auth._id.toString(),
        vehicleId: vehicle._id.toString(),
        driverId: driver._id.toString(),
        netWeightTonnes: 12.0,
        destinationCheckpoint: checkpoint.name,
      },
      officer._id.toString(),
    );
    const pass02Num = epass02Dto.passNumber;

    const geofenceResult = await checkpointService.syncBatchPassages(
      {
        checkpointId: checkpoint.checkpointId,
        passages: [
          {
            clientLogId: 'CLIENT-GEOFENCE-001',
            passNumberOrId: pass02Num,
            passageTimestamp: new Date().toISOString(),
            currentLocation: [80.2707, 13.0827], // Chennai (~450 km away from Madurai checkpoint!)
            declaredQuantityTonnes: 12.0,
          },
        ],
      },
      officer._id.toString(),
    );

    assert.strictEqual(geofenceResult.rejectedCount, 1);
    assert.strictEqual(geofenceResult.results[0].status, 'REJECTED');
    assert.ok(
      geofenceResult.results[0].rejectionReasons?.includes(
        EnforcementRejectionReason.OUTSIDE_CHECKPOINT_GEOFENCE,
      ),
      'Must reject due to outside geofence',
    );
    console.log('  ✔ Geofence enforcement during batch sync verified');

    // -------------------------------------------------------------------------
    // Gate 5: Inactive Checkpoint Safety
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 5: Testing inactive checkpoint guard...');

    const inactiveCpId = `CP-INACTIVE-${Date.now()}`;
    await CheckpointModel.create({
      checkpointId: inactiveCpId,
      name: 'Decommissioned Post',
      district: 'Theni',
      location: { type: 'Point', coordinates: [77.48, 10.01] },
      status: CheckpointStatus.INACTIVE,
    });

    await assert.rejects(
      async () => {
        await checkpointService.syncBatchPassages({
          checkpointId: inactiveCpId,
          passages: [
            {
              passNumberOrId: pass02Num,
              passageTimestamp: new Date().toISOString(),
            },
          ],
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('not ACTIVE'));
        return true;
      },
    );
    console.log('  ✔ Inactive checkpoint guard verified');

    // -------------------------------------------------------------------------
    // Gate 6: REST API Endpoint (POST /api/checkpoints/sync-batch)
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 6: Testing REST API POST /api/checkpoints/sync-batch...');

    const epassApiDto = await ePassService.createEPass(
      {
        authorizationId: auth._id.toString(),
        vehicleId: vehicle._id.toString(),
        driverId: driver._id.toString(),
        netWeightTonnes: 20.0,
        destinationCheckpoint: checkpoint.name,
      },
      officer._id.toString(),
    );
    const passApiNum = epassApiDto.passNumber;

    const apiRes = await request(
      'POST',
      '/api/checkpoints/sync-batch',
      {
        checkpointId: checkpoint.checkpointId,
        syncBatchId: `API-BATCH-${Date.now()}`,
        passages: [
          {
            clientLogId: 'API-SCAN-001',
            syncNonce: 'NONCE-API-001',
            passNumberOrId: passApiNum,
            passageTimestamp: new Date().toISOString(),
            currentLocation: [78.1198, 9.9252],
            declaredQuantityTonnes: 20.0,
            notes: 'Field sync via REST API',
          },
        ],
      },
      authToken,
    );

    assert.strictEqual(apiRes.status, 200);
    assert.strictEqual(apiRes.body.success, true);
    assert.strictEqual(apiRes.body.data.acceptedCount, 1);
    assert.strictEqual(apiRes.body.data.results[0].status, 'ACCEPTED');
    console.log('  ✔ POST /api/checkpoints/sync-batch REST endpoint verified');

    console.log('\n================================================================');
    console.log('✅ ALL PHASE 11.2 BATCH CHECKPOINT SYNC TESTS PASSED (6/6)');
    console.log('================================================================\n');
  } finally {
    if (server) {
      server.close();
    }
    // Cleanup
    await CheckpointModel.deleteMany({ checkpointId: { $regex: '^CP-(BATCH|INACTIVE)-' } });
    await CheckpointLogModel.deleteMany({ passNumber: { $regex: '^PASS-SYNC-' } });
    await EPassModel.deleteMany({ passNumber: { $regex: '^PASS-SYNC-' } });
    await MiningAuthorizationModel.deleteMany({ permitNumber: { $regex: '^PERMIT-BATCH-' } });
    await VehicleModel.deleteMany({ registrationNumber: { $regex: '^TN-59-BZ-' } });
    await DriverModel.deleteMany({ licenseNumber: { $regex: '^DL-TN-59-' } });
    await User.deleteMany({ email: { $regex: '^batch_officer_' } });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ Phase 11.2 test failure:', err);
  process.exit(1);
});
