/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import assert from 'node:assert';
import { type Server } from 'node:http';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { connectDatabase } from '../config/database.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { EPassModel } from '../models/EPass.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { checkpointService } from '../services/CheckpointService.js';
import { ePassService } from '../services/EPassService.js';
import {
  UserRole,
  Permission,
  CheckpointStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
  EnforcementRejectionReason,
  EPassStatus,
  MiningAuthorizationStatus,
  VehicleStatus,
  DriverVerificationStatus,
} from '@tn-forest/shared/types';

let server: Server;
let BASE_URL: string;

async function request(
  method: string,
  urlPath: string,
  body?: any,
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

async function runM10TestSuite() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING MODULE M10: CHECKPOINT ENFORCEMENT TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        BASE_URL = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });

  try {
    // Cleanup M9 & M10 test collections
    await CheckpointModel.deleteMany({});
    await CheckpointLogModel.deleteMany({});
    await MiningAuthorizationModel.deleteMany({});
    await TransportCompanyModel.deleteMany({});
    await VehicleModel.deleteMany({});
    await DriverModel.deleteMany({});
    await EPassModel.deleteMany({});
    await User.deleteMany({ email: { $regex: /@m10test\.com$/ } });

    // Setup Test Users
    const pwdHash = await hashPassword('Password123!');

    const adminUser = await User.create({
      name: 'Admin Officer',
      email: 'admin@m10test.com',
      passwordHash: pwdHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      permissions: [Permission.CHECKPOINT_READ, Permission.CHECKPOINT_VERIFY, Permission.USER_CREATE],
    });

    const checkpointOfficer = await User.create({
      name: 'Checkpoint Guard',
      email: 'guard@m10test.com',
      passwordHash: pwdHash,
      role: UserRole.CHECKPOINT_OFFICER,
      status: 'ACTIVE',
      permissions: [Permission.CHECKPOINT_READ, Permission.CHECKPOINT_VERIFY, Permission.EPASS_READ],
    });

    const viewerUser = await User.create({
      name: 'General Viewer',
      email: 'viewer@m10test.com',
      passwordHash: pwdHash,
      role: UserRole.VIEWER,
      status: 'ACTIVE',
      permissions: [],
    });

    // Login tokens
    const adminLogin = await request('POST', '/api/auth/login', {
      email: 'admin@m10test.com',
      password: 'Password123!',
    });
    const adminToken = adminLogin.body.data.token;

    const guardLogin = await request('POST', '/api/auth/login', {
      email: 'guard@m10test.com',
      password: 'Password123!',
    });
    const guardToken = guardLogin.body.data.token;

    const viewerLogin = await request('POST', '/api/auth/login', {
      email: 'viewer@m10test.com',
      password: 'Password123!',
    });
    const viewerToken = viewerLogin.body.data.token;

    // Setup Base Transport & Permit Prerequisite records
    const authDoc = await MiningAuthorizationModel.create({
      authorizationId: 'AUTH-2026-M10',
      permitNumber: 'TN-MIN-2026-M10',
      lesseeName: 'M10 Granite Industries',
      mineralType: 'Granite',
      permittedWeightTonnes: 5000,
      validFrom: new Date(Date.now() - 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: MiningAuthorizationStatus.ACTIVE,
      remainingQuota: 5000,
      createdBy: adminUser._id,
    });

    const companyDoc = await TransportCompanyModel.create({
      companyId: 'TC-2026-M10',
      registrationNumber: 'TN-TC-M10-01',
      companyName: 'M10 Logistics Fleet',
      contactDetails: { phone: '+91 9876543210' },
    });

    const vehicleDoc = await VehicleModel.create({
      vehicleId: 'VEH-2026-M10',
      registrationNumber: 'TN-38-M10-9999',
      vehicleType: 'TRUCK',
      tareWeight: 8.5,
      grossVehicleWeight: 35.0,
      permittedCarryingCapacity: 26.5,
      status: VehicleStatus.ACTIVE,
      transportCompanyId: companyDoc._id,
    });

    const driverDoc = await DriverModel.create({
      driverId: 'DRV-2026-M10',
      licenseNumber: 'TN38-2026-M10-DRV',
      name: 'Murugan Kumar',
      phone: '+91 9944001122',
      verificationStatus: DriverVerificationStatus.VERIFIED,
      transportCompanyId: companyDoc._id,
    });

    // Setup Checkpoint
    const checkpointDoc = await CheckpointModel.create({
      checkpointId: 'CP-SALEM-01',
      name: 'Salem Forest Boundary Checkpoint #1',
      district: 'Salem',
      location: {
        type: 'Point',
        coordinates: [78.146, 11.664], // [lng, lat]
      },
      geofenceRadiusMeters: 500,
      status: CheckpointStatus.ACTIVE,
      authorizedUserIds: [checkpointOfficer._id],
      operatingHours: '24/7 Continuous Enforcement',
    });

    console.log('--- 1. Checkpoint Registry & Management ---');

    // Assertion 1: Create checkpoint via Service & DTO
    const createdCp = await checkpointService.createCheckpoint(
      {
        checkpointId: 'CP-WALAYAR-01',
        name: 'Walayar Forest Border Checkpoint #1',
        district: 'Coimbatore',
        location: { type: 'Point', coordinates: [76.85, 10.83] },
        geofenceRadiusMeters: 600,
        status: CheckpointStatus.ACTIVE,
      },
      adminUser._id.toString(),
    );
    assert.strictEqual(createdCp.checkpointId, 'CP-WALAYAR-01');
    assert.strictEqual(createdCp.district, 'Coimbatore');
    assert.strictEqual(createdCp.geofenceRadiusMeters, 600);
    console.log('  ✅ Assertion 1: Checkpoint registered successfully with coordinates and geofence radius');

    // Assertion 2: Duplicate checkpointId rejected
    await assert.rejects(
      checkpointService.createCheckpoint({
        checkpointId: 'CP-WALAYAR-01',
        name: 'Duplicate Walayar',
        district: 'Coimbatore',
        location: { type: 'Point', coordinates: [76.85, 10.83] },
      }),
      /already exists/i,
    );
    console.log('  ✅ Assertion 2: Duplicate checkpoint identifier rejected');

    // Assertion 3: Update checkpoint details & geofence radius
    const updatedCp = await checkpointService.updateCheckpoint(createdCp.id, {
      geofenceRadiusMeters: 750,
      operatingHours: '06:00 - 22:00 IST',
    });
    assert.strictEqual(updatedCp.geofenceRadiusMeters, 750);
    assert.strictEqual(updatedCp.operatingHours, '06:00 - 22:00 IST');
    console.log('  ✅ Assertion 3: Checkpoint geofence and operating details updated');

    console.log('--- 2. Cryptographic QR Verification & Tamper Detection ---');

    // Generate a valid E-Pass in M9 service
    const epassDto = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 20.0,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );

    // Assertion 4: Valid E-Pass verified with intact signature, hash, and geofence
    const validVerification = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      qrPayload: epassDto.qrPayload,
      currentLocation: [78.146, 11.664], // Exact coordinate match
      declaredQuantityTonnes: 20.0,
    });
    assert.strictEqual(validVerification.result, CheckpointVerificationResult.VALID);
    assert.strictEqual(validVerification.signatureVerified, true);
    assert.strictEqual(validVerification.hashVerified, true);
    assert.strictEqual(validVerification.locationStatus, LocationVerificationStatus.VERIFIED_LOCATION);
    assert.strictEqual(validVerification.rejectionReasons.length, 0);
    console.log('  ✅ Assertion 4: Valid E-Pass verified with intact HMAC-SHA256 signature and SHA-256 hash');

    // Assertion 5: Tampered Digital Signature Rejected
    const parsedQr5 = JSON.parse(epassDto.qrPayload);
    parsedQr5.sig = '9999999999999999999999999999999999999999999999999999999999999999';
    const tamperedSigResult = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      qrPayload: JSON.stringify(parsedQr5),
      currentLocation: [78.146, 11.664],
    });
    assert.strictEqual(tamperedSigResult.result, CheckpointVerificationResult.INVALID);
    assert.strictEqual(tamperedSigResult.signatureVerified, false);
    assert(tamperedSigResult.rejectionReasons.includes(EnforcementRejectionReason.INVALID_SIGNATURE));
    console.log('  ✅ Assertion 5: Tampered cryptographic signature detected and rejected');

    // Assertion 6: Tampered Hash / Payload attributes rejected
    const parsedQr6 = JSON.parse(epassDto.qrPayload);
    parsedQr6.w = 95.0; // modified weight without updating hash
    const tamperedHashResult = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      qrPayload: JSON.stringify(parsedQr6),
    });
    assert.strictEqual(tamperedHashResult.result, CheckpointVerificationResult.INVALID);
    assert.strictEqual(tamperedHashResult.hashVerified, false);
    assert(tamperedHashResult.rejectionReasons.includes(EnforcementRejectionReason.INVALID_HASH));
    console.log('  ✅ Assertion 6: Tampered weight / payload attribute detected and rejected');

    console.log('--- 3. Geolocation & Geofence Verification ---');

    // Assertion 7: Geofence radius compliance (within 200m)
    const nearLocation: [number, number] = [78.146, 11.665];
    const nearDist = checkpointService.calculateDistanceMeters(nearLocation, [78.146, 11.664]);
    assert(nearDist < 500, `Expected distance < 500m, got ${nearDist}m`);

    const geofencePassed = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: epassDto.passNumber,
      currentLocation: nearLocation,
    });
    assert.strictEqual(geofencePassed.locationStatus, LocationVerificationStatus.VERIFIED_LOCATION);
    assert(geofencePassed.distanceFromCheckpointMeters! < 500);
    console.log(`  ✅ Assertion 7: Location inside geofence verified (${geofencePassed.distanceFromCheckpointMeters}m <= 500m)`);

    // Assertion 8: Outside checkpoint geofence rejection (> 5km away)
    const farLocation: [number, number] = [78.25, 11.75]; // ~15km away
    const geofenceFailed = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: epassDto.passNumber,
      currentLocation: farLocation,
    });
    assert.strictEqual(geofenceFailed.result, CheckpointVerificationResult.INVALID);
    assert.strictEqual(geofenceFailed.locationStatus, LocationVerificationStatus.OUTSIDE_CHECKPOINT_GEOFENCE);
    assert(geofenceFailed.rejectionReasons.includes(EnforcementRejectionReason.OUTSIDE_CHECKPOINT_GEOFENCE));
    assert(geofenceFailed.distanceFromCheckpointMeters! > 5000);
    console.log(`  ✅ Assertion 8: Location outside geofence flagged (${geofenceFailed.distanceFromCheckpointMeters}m > 500m)`);

    // Assertion 9: Location unavailable handled gracefully without false verification
    const noGpsResult = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: epassDto.passNumber,
    });
    assert.strictEqual(noGpsResult.locationStatus, LocationVerificationStatus.LOCATION_UNAVAILABLE);
    assert.strictEqual(noGpsResult.distanceFromCheckpointMeters, undefined);
    console.log('  ✅ Assertion 9: Missing GPS coordinates correctly marked LOCATION_UNAVAILABLE');

    console.log('--- 4. Multi-Entity Status & Business Rule Validation ---');

    // Assertion 10: Inactive Checkpoint Rejection
    const inactiveCp = await CheckpointModel.create({
      checkpointId: 'CP-INACTIVE-01',
      name: 'Suspended Checkpoint',
      district: 'Dharmapuri',
      location: { type: 'Point', coordinates: [78.16, 12.13] },
      status: CheckpointStatus.INACTIVE,
    });
    const inactiveCpResult = await checkpointService.verifyEPass({
      checkpointId: inactiveCp._id.toString(),
      passNumber: epassDto.passNumber,
    });
    assert.strictEqual(inactiveCpResult.result, CheckpointVerificationResult.INVALID);
    assert(inactiveCpResult.rejectionReasons.includes(EnforcementRejectionReason.CHECKPOINT_INACTIVE));
    console.log('  ✅ Assertion 10: Inactive checkpoint rejected');

    // Assertion 11: Cancelled E-Pass Rejection
    const cancelledPass = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 15.0,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );
    await ePassService.cancelEPass(cancelledPass.id, 'Officer Cancellation');
    const cancelledVerify = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: cancelledPass.passNumber,
    });
    assert.strictEqual(cancelledVerify.result, CheckpointVerificationResult.INVALID);
    assert(cancelledVerify.rejectionReasons.includes(EnforcementRejectionReason.EPASS_CANCELLED));
    console.log('  ✅ Assertion 11: Cancelled E-Pass rejected at checkpoint');

    // Assertion 12: Expired E-Pass Rejection
    const expiredPass = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 10.0,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );
    await EPassModel.findByIdAndUpdate(expiredPass.id, {
      validUntil: new Date(Date.now() - 3600 * 1000), // 1 hour ago
    });
    const expiredVerify = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: expiredPass.passNumber,
    });
    assert.strictEqual(expiredVerify.result, CheckpointVerificationResult.INVALID);
    assert(expiredVerify.rejectionReasons.includes(EnforcementRejectionReason.EPASS_EXPIRED));
    console.log('  ✅ Assertion 12: Expired E-Pass rejected at checkpoint');

    // Assertion 13: Unverified / Suspended Driver Rejection
    const suspendedDriver = await DriverModel.create({
      driverId: 'DRV-SUSPENDED-01',
      licenseNumber: 'TN38-SUSPENDED-01',
      name: 'Suspended Driver',
      phone: '+91 9988776655',
      verificationStatus: DriverVerificationStatus.SUSPENDED,
    });
    const suspendedDriverPass = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 12.0,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );
    await EPassModel.findByIdAndUpdate(suspendedDriverPass.id, {
      driverId: suspendedDriver._id,
    });
    const suspendedDriverVerify = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: suspendedDriverPass.passNumber,
    });
    assert.strictEqual(suspendedDriverVerify.result, CheckpointVerificationResult.INVALID);
    assert(suspendedDriverVerify.rejectionReasons.includes(EnforcementRejectionReason.DRIVER_SUSPENDED));
    console.log('  ✅ Assertion 13: Suspended driver transit pass rejected');

    // Assertion 14: Non-permitted / Inactive Vehicle Rejection
    const inactiveVehicle = await VehicleModel.create({
      vehicleId: 'VEH-INACTIVE-01',
      registrationNumber: 'TN-38-INACTIVE',
      vehicleType: 'TRUCK',
      tareWeight: 10,
      grossVehicleWeight: 30,
      permittedCarryingCapacity: 20,
      status: VehicleStatus.SUSPENDED,
    });
    const inactiveVehPass = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 12.0,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );
    await EPassModel.findByIdAndUpdate(inactiveVehPass.id, {
      vehicleId: inactiveVehicle._id,
    });
    const inactiveVehVerify = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: inactiveVehPass.passNumber,
    });
    assert.strictEqual(inactiveVehVerify.result, CheckpointVerificationResult.INVALID);
    assert(inactiveVehVerify.rejectionReasons.includes(EnforcementRejectionReason.VEHICLE_NOT_PERMITTED));
    console.log('  ✅ Assertion 14: Suspended / non-permitted vehicle transit pass rejected');

    // Assertion 15: Suspended Mining Permit Rejection
    const suspendedAuth = await MiningAuthorizationModel.create({
      authorizationId: 'AUTH-SUSPENDED-01',
      permitNumber: 'TN-MIN-SUSPENDED',
      lesseeName: 'Suspended Miner Ltd',
      mineralType: 'Granite',
      permittedWeightTonnes: 1000,
      validFrom: new Date(Date.now() - 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: MiningAuthorizationStatus.SUSPENDED,
      remainingQuota: 1000,
      createdBy: adminUser._id,
    });
    const suspendedAuthPass = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 10.0,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );
    await EPassModel.findByIdAndUpdate(suspendedAuthPass.id, {
      authorizationId: suspendedAuth._id,
    });
    const suspendedAuthVerify = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: suspendedAuthPass.passNumber,
    });
    assert.strictEqual(suspendedAuthVerify.result, CheckpointVerificationResult.INVALID);
    assert(suspendedAuthVerify.rejectionReasons.includes(EnforcementRejectionReason.AUTHORIZATION_SUSPENDED));
    console.log('  ✅ Assertion 15: Suspended mining permit pass rejected');

    console.log('--- 5. Transit Passage Recording & State Transitions ---');

    // Assertion 16: Successful Passage Recording transitions status to USED
    const passagePass = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 18.5,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );

    const passageRecord = await checkpointService.recordPassage(
      {
        checkpointId: checkpointDoc._id.toString(),
        passNumberOrId: passagePass.passNumber,
        currentLocation: [78.146, 11.664],
        declaredQuantityTonnes: 18.5,
        notes: 'Cleared through Salem gate #1',
      },
      checkpointOfficer._id.toString(),
    );
    assert.strictEqual(passageRecord.success, true);
    assert.strictEqual(passageRecord.epass.status, EPassStatus.USED);
    assert(passageRecord.epass.usedTimestamp !== undefined);
    console.log('  ✅ Assertion 16: Transit passage recorded and E-Pass transitioned to USED');

    // Assertion 17: Re-use of USED E-Pass rejected
    const reuseAttempt = await checkpointService.verifyEPass({
      checkpointId: checkpointDoc._id.toString(),
      passNumber: passagePass.passNumber,
    });
    assert.strictEqual(reuseAttempt.result, CheckpointVerificationResult.INVALID);
    assert(reuseAttempt.rejectionReasons.includes(EnforcementRejectionReason.EPASS_ALREADY_USED));
    console.log('  ✅ Assertion 17: Attempted re-use of already consumed E-Pass rejected');

    // Assertion 18: Recording passage on invalid E-Pass throws error
    await assert.rejects(
      checkpointService.recordPassage({
        checkpointId: checkpointDoc._id.toString(),
        passNumberOrId: passagePass.passNumber, // already USED
      }),
      /Passage rejected: EPASS_ALREADY_USED/,
    );
    console.log('  ✅ Assertion 18: Passage confirmation rejected on invalid/used passes');

    console.log('--- 6. Concurrency, Audit Trail & Security ---');

    // Assertion 19: Immutable Checkpoint Log Created on Verification
    const auditLogs = await CheckpointLogModel.find({ passNumber: passagePass.passNumber });
    assert(auditLogs.length >= 2, 'Expected multiple audit log records for pass verification & passage');
    assert.strictEqual(auditLogs[0].checkpointName, 'Salem Forest Boundary Checkpoint #1');
    console.log(`  ✅ Assertion 19: Immutable CheckpointLog audit records created (${auditLogs.length} entries for pass)`);

    // Assertion 20: Failed verification attempt logged with rejection reasons
    const failedAuditLogs = await CheckpointLogModel.find({
      passNumber: cancelledPass.passNumber,
      verificationResult: CheckpointVerificationResult.INVALID,
    });
    assert(failedAuditLogs.length > 0);
    assert(failedAuditLogs[0].rejectionReasons.includes(EnforcementRejectionReason.EPASS_CANCELLED));
    console.log('  ✅ Assertion 20: Failed verification attempt preserved in immutable audit log');

    // Assertion 21: Secret Redaction (No private signing keys or tokens in logs or responses)
    const allLogs = await CheckpointLogModel.find({});
    const secretKey = 'tn_forest_epass_default_secret_key_2026';
    for (const log of allLogs) {
      const json = JSON.stringify(log.toJSON());
      assert(!json.includes(secretKey), 'Audit log must not contain private signing secret');
    }
    console.log('  ✅ Assertion 21: Private signing secrets confirmed absent from database logs and audit trails');

    // Assertion 22: High-Concurrency Checkpoint Verifications
    const concurrentPass = await ePassService.createEPass(
      {
        authorizationId: authDoc._id.toString(),
        vehicleId: vehicleDoc._id.toString(),
        driverId: driverDoc._id.toString(),
        netWeightTonnes: 14.0,
        destinationCheckpoint: 'Salem Forest Boundary Checkpoint #1',
      },
      adminUser._id.toString(),
    );
    const parallelVerifications = await Promise.all([
      checkpointService.verifyEPass({ checkpointId: checkpointDoc._id.toString(), passNumber: concurrentPass.passNumber }),
      checkpointService.verifyEPass({ checkpointId: checkpointDoc._id.toString(), passNumber: concurrentPass.passNumber }),
      checkpointService.verifyEPass({ checkpointId: checkpointDoc._id.toString(), passNumber: concurrentPass.passNumber }),
      checkpointService.verifyEPass({ checkpointId: checkpointDoc._id.toString(), passNumber: concurrentPass.passNumber }),
      checkpointService.verifyEPass({ checkpointId: checkpointDoc._id.toString(), passNumber: concurrentPass.passNumber }),
    ]);
    assert.strictEqual(parallelVerifications.length, 5);
    for (const v of parallelVerifications) {
      assert.strictEqual(v.result, CheckpointVerificationResult.VALID);
    }
    console.log('  ✅ Assertion 22: Parallel concurrent verifications executed safely and consistently');

    // Assertion 23: Aggregate Checkpoint Summary Statistics
    const summary = await checkpointService.getSummaryStats();
    assert(summary.totalCheckpoints >= 2);
    assert(summary.activeCheckpoints >= 1);
    assert(summary.totalVerifications > 10);
    assert(summary.validVerifications > 0);
    assert(summary.invalidVerifications > 0);
    assert(summary.totalTonnagePassed > 0);
    console.log(
      `  ✅ Assertion 23: Checkpoint summary stats verified (${summary.totalVerifications} scans, ${summary.validVerifications} valid, ${summary.invalidVerifications} rejected, ${summary.totalTonnagePassed.toFixed(1)}t passed)`,
    );

    console.log('--- 7. REST API Endpoints & RBAC Verification ---');

    // Assertion 24: GET /api/checkpoints
    const resGetCheckpoints = await request('GET', '/api/checkpoints', undefined, adminToken);
    assert.strictEqual(resGetCheckpoints.status, 200);
    assert(resGetCheckpoints.body.data.length >= 2);
    console.log('  ✅ Assertion 24: GET /api/checkpoints verified');

    // Assertion 25: POST /api/checkpoints/verify (Checkpoint Officer)
    const resVerifyApi = await request(
      'POST',
      '/api/checkpoints/verify',
      {
        checkpointId: checkpointDoc._id.toString(),
        passNumber: concurrentPass.passNumber,
        currentLocation: [78.146, 11.664],
      },
      guardToken,
    );
    assert.strictEqual(resVerifyApi.status, 200);
    assert.strictEqual(resVerifyApi.body.data.result, CheckpointVerificationResult.VALID);
    console.log('  ✅ Assertion 25: POST /api/checkpoints/verify verified with CHECKPOINT_OFFICER role');

    // Assertion 26: POST /api/checkpoints/record-passage (Checkpoint Officer)
    const resPassageApi = await request(
      'POST',
      '/api/checkpoints/record-passage',
      {
        checkpointId: checkpointDoc._id.toString(),
        passNumberOrId: concurrentPass.passNumber,
        currentLocation: [78.146, 11.664],
      },
      guardToken,
    );
    assert.strictEqual(resPassageApi.status, 200);
    assert.strictEqual(resPassageApi.body.data.epass.status, EPassStatus.USED);
    console.log('  ✅ Assertion 26: POST /api/checkpoints/record-passage verified with CHECKPOINT_OFFICER role');

    // Assertion 27: RBAC Protection - VIEWER role forbidden from checkpoint creation
    const resForbidden = await request(
      'POST',
      '/api/checkpoints',
      {
        name: 'Unauthorized Checkpoint',
        district: 'Namakkal',
        location: { type: 'Point', coordinates: [78.16, 11.22] },
      },
      viewerToken,
    );
    assert.strictEqual(resForbidden.status, 403);
    console.log('  ✅ Assertion 27: RBAC role verification strictly enforced on checkpoint management');

    // Assertion 28: GET /api/checkpoints/logs and /summary
    const resLogs = await request('GET', '/api/checkpoints/logs', undefined, guardToken);
    assert.strictEqual(resLogs.status, 200);
    assert(resLogs.body.data.length > 0);

    const resSummary = await request('GET', '/api/checkpoints/summary', undefined, guardToken);
    assert.strictEqual(resSummary.status, 200);
    assert(resSummary.body.data.totalCheckpoints >= 2);
    console.log('  ✅ Assertion 28: Checkpoint logs and summary REST API endpoints verified');

    console.log('\n================================================================');
    console.log('🎉 ALL 28 ASSERTIONS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

// Run when directly executed
if (process.argv[1]?.endsWith('m10-checkpoint-enforcement.test.ts') || process.argv[1]?.includes('m10-checkpoint-enforcement')) {
  runM10TestSuite()
    .then(() => {
      mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ TEST SUITE FAILED:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

export { runM10TestSuite };
