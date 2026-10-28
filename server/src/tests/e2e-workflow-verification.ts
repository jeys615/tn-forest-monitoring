/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import assert from 'node:assert';
import { type Server } from 'node:http';
import mongoose, { Types } from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { DriverModel } from '../models/Driver.js';
import { VehicleModel } from '../models/Vehicle.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  Permission,
  TransportCompanyStatus,
  VehicleStatus,
  DriverVerificationStatus,
  MiningAuthorizationStatus,
  EPassStatus,
  CheckpointStatus,
  CheckpointVerificationResult,
  CaseStatus,
  CaseSeverity,
  ZoneCategory,
  ZoneStatus,
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

  let resBody: any = null;
  const text = await res.text();
  try {
    resBody = JSON.parse(text);
  } catch {
    resBody = text;
  }
  return { status: res.status, body: resBody };
}

async function runWorkflowAudit() {
  console.log('===============================================================');
  console.log('   STARTING END-TO-END TRANSPORT & ENFORCEMENT AUDIT SUITE    ');
  console.log('===============================================================\n');

  await connectDatabase();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  BASE_URL = `http://localhost:${port}`;
  console.log(`[INFO] Test server mounted on ${BASE_URL}`);

  // Create or retrieve test forest officer
  const officerEmail = `officer_${Date.now()}@test.tnforest.gov.in`;
  const pwHash = await hashPassword('ForestPass@123');
  const officerUser = await User.create({
    email: officerEmail,
    passwordHash: pwHash,
    name: 'Inspector S. Radhakrishnan',
    role: UserRole.FOREST_OFFICER,
    permissions: [
      Permission.AREA_CREATE,
      Permission.AREA_READ,
      Permission.EPASS_CREATE,
      Permission.EPASS_READ,
      Permission.CHECKPOINT_VERIFY,
      Permission.RECONCILIATION_RUN,
      Permission.RECONCILIATION_READ,
      Permission.ENFORCEMENT_CASE_CREATE,
      Permission.ENFORCEMENT_CASE_READ,
      Permission.ENFORCEMENT_CASE_UPDATE,
      Permission.ENFORCEMENT_CASE_ASSIGN,
      Permission.ENFORCEMENT_CASE_CLOSE,
    ],
    status: 'ACTIVE',
  });

  // Login as Officer
  const loginRes = await request('POST', '/api/auth/login', {
    email: officerEmail,
    password: 'ForestPass@123',
  });
  assert.strictEqual(loginRes.status, 200, 'Officer login should succeed');
  const token = loginRes.body.data.token;
  console.log(' [PASS] Step 0: Forest Officer authenticated with RBAC token');

  // Create a test monitored zone
  const testZone = await Zone.create({
    zoneId: `ZN-${Date.now()}`,
    name: `Salem West Mineral Reserve ${Date.now()}`,
    category: ZoneCategory.COMMERCIAL_LEASE,
    status: ZoneStatus.PROTECTED,
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [78.140, 11.660],
          [78.160, 11.660],
          [78.160, 11.680],
          [78.140, 11.680],
          [78.140, 11.660],
        ],
      ],
    },
    centerPoint: { type: 'Point', coordinates: [78.150, 11.670] },
    createdBy: officerUser._id,
  });
  console.log(` [PASS] Step 1: Monitored Zone active (${testZone.name})`);

  // Step 2: Company Registration (Validating Forest Officer Role Access)
  const compReg = `GSTIN-33${Date.now().toString().slice(-10)}`;
  const compRes = await request(
    'POST',
    '/api/transport-companies',
    {
      companyName: 'Kongu Express Heavy Haulage Ltd',
      registrationNumber: compReg,
      contactDetails: {
        phone: '+91 94432 10101',
        email: 'dispatch@konguexpress.in',
        address: 'Bypass Road, Namakkal, TN',
      },
    },
    token,
  );
  assert.strictEqual(compRes.status, 201, 'Transport Company creation must succeed (201)');
  assert.strictEqual(compRes.body.data.companyName, 'Kongu Express Heavy Haulage Ltd');
  const companyId = compRes.body.data.id;
  console.log(` [PASS] Step 2: Transport Company registered (${compRes.body.data.companyName}, ${compReg})`);

  // Step 3: Driver Registration (Linked to Company)
  const licenseNum = `TN-30-${Date.now().toString().slice(-7)}`;
  const driverRes = await request(
    'POST',
    '/api/drivers',
    {
      name: 'P. Subramanian',
      licenseNumber: licenseNum,
      phone: '+91 98421 99882',
      transportCompanyId: companyId,
    },
    token,
  );
  assert.strictEqual(driverRes.status, 201, 'Driver registration must succeed (201)');
  assert.strictEqual(driverRes.body.data.name, 'P. Subramanian');
  assert.strictEqual(driverRes.body.data.transportCompanyName, 'Kongu Express Heavy Haulage Ltd');
  const driverId = driverRes.body.data.id;
  console.log(` [PASS] Step 3: Driver registered and linked to Company with populated name: "${driverRes.body.data.transportCompanyName}"`);

  // Step 4: Vehicle Registration (Linked to Company & Payload auto-calculated)
  const plateNum = `TN-38-BZ-${Date.now().toString().slice(-4)}`;
  const vehicleRes = await request(
    'POST',
    '/api/vehicles',
    {
      registrationNumber: plateNum,
      vehicleType: 'TIPPER',
      tareWeight: 12.0,
      grossVehicleWeight: 37.0,
      permittedCarryingCapacity: 25.0,
      transportCompanyId: companyId,
      gpsTrackerId: `GPS-TN-${Date.now().toString().slice(-6)}`,
    },
    token,
  );
  assert.strictEqual(vehicleRes.status, 201, 'Vehicle registration must succeed (201)');
  assert.strictEqual(vehicleRes.body.data.registrationNumber, plateNum);
  assert.strictEqual(vehicleRes.body.data.permittedCarryingCapacity, 25.0);
  assert.strictEqual(vehicleRes.body.data.transportCompanyName, 'Kongu Express Heavy Haulage Ltd');
  const vehicleId = vehicleRes.body.data.id;
  console.log(` [PASS] Step 4: Vehicle registered with 25t payload and linked to operator: "${vehicleRes.body.data.transportCompanyName}"`);

  // Step 5: Mining Authorization Permit Creation
  const permitNum = `TN-MIN-2026-${Date.now().toString().slice(-5)}`;
  const permitRes = await request(
    'POST',
    '/api/mining-authorizations',
    {
      zoneId: testZone._id.toString(),
      permitNumber: permitNum,
      lesseeName: 'Salem Granite Quarries & Export Corp',
      mineralType: 'Granite (Black / Multi-color)',
      permittedWeightTonnes: 10000,
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    },
    token,
  );
  assert.strictEqual(permitRes.status, 201, 'Mining permit creation must succeed (201)');
  assert.strictEqual(permitRes.body.data.permitNumber, permitNum);
  assert.strictEqual(permitRes.body.data.remainingQuota, 10000);
  const authId = permitRes.body.data.id;
  console.log(` [PASS] Step 5: Mining Authorization active (${permitNum}, 10,000 Tonnes quota)`);

  // Step 6: Transit E-Pass Generation
  const epassRes = await request(
    'POST',
    '/api/epass',
    {
      authorizationId: authId,
      vehicleId: vehicleId,
      driverId: driverId,
      netWeightTonnes: 24.5,
      destinationCheckpoint: 'Salem Border Post #1',
      sourceLocation: 'Salem Granite Quarry Block A',
    },
    token,
  );
  assert.strictEqual(epassRes.status, 201, 'E-Pass creation must succeed (201)');
  assert(epassRes.body.data.passNumber.startsWith('EP-'), 'Pass number should have EP- prefix');
  assert(epassRes.body.data.qrPayload, 'QR payload must be generated');
  assert(epassRes.body.data.digitalSignature, 'Digital HMAC signature must be generated');
  assert.strictEqual(epassRes.body.data.status, EPassStatus.ACTIVE);
  assert.strictEqual(epassRes.body.data.vehicleRegistrationNumber, plateNum);
  assert.strictEqual(epassRes.body.data.driverName, 'P. Subramanian');
  const passNumber = epassRes.body.data.passNumber;
  const qrPayload = epassRes.body.data.qrPayload;
  console.log(` [PASS] Step 6: Cryptographic E-Pass issued (${passNumber}, HMAC-SHA256 signature present)`);

  // Step 7: Create Checkpoint
  const cpRes = await request(
    'POST',
    '/api/checkpoints',
    {
      name: 'Salem-Namakkal Interstate Barrier #4',
      district: 'Salem',
      location: { type: 'Point', coordinates: [78.150, 11.670] },
      geofenceRadiusMeters: 1000,
      operatingHours: '24/7',
    },
    token,
  );
  assert.strictEqual(cpRes.status, 201, 'Checkpoint creation must succeed');
  const checkpointId = cpRes.body.data.id;
  console.log(` [PASS] Step 7: Enforcement Checkpoint deployed (${cpRes.body.data.name})`);

  // Step 8: Verify E-Pass at Checkpoint (via Pass Number)
  const verifyNumRes = await request(
    'POST',
    '/api/checkpoints/verify',
    {
      checkpointId: checkpointId,
      passNumber: passNumber,
      declaredQuantityTonnes: 24.5,
      currentLocation: [78.150, 11.670],
    },
    token,
  );
  assert.strictEqual(verifyNumRes.status, 200, `Verification must return 200: ${JSON.stringify(verifyNumRes.body)}`);
  assert.strictEqual(verifyNumRes.body.data.result, CheckpointVerificationResult.VALID);
  assert.strictEqual(verifyNumRes.body.data.signatureVerified, true, 'Cryptographic signature MUST be verified as authentic');
  assert.strictEqual(verifyNumRes.body.data.hashVerified, true, 'SHA-256 Hash MUST match');
  console.log(` [PASS] Step 8a: Verification via Pass Number: VALID, HMAC Signature AUTHENTIC, Hash MATCHED`);

  // Step 8b: Verify E-Pass at Checkpoint (via Canonical QR Payload)
  const verifyQrRes = await request(
    'POST',
    '/api/checkpoints/verify',
    {
      checkpointId: checkpointId,
      qrPayload: qrPayload,
      declaredQuantityTonnes: 24.5,
      currentLocation: [78.150, 11.670],
    },
    token,
  );
  assert.strictEqual(verifyQrRes.status, 200, 'QR verification must return 200');
  assert.strictEqual(verifyQrRes.body.data.result, CheckpointVerificationResult.VALID);
  assert.strictEqual(verifyQrRes.body.data.signatureVerified, true);
  console.log(` [PASS] Step 8b: Verification via QR Payload: VALID, HMAC Signature AUTHENTIC`);

  // Step 9: Record Official Passage
  const passageRes = await request(
    'POST',
    '/api/checkpoints/record-passage',
    {
      checkpointId: checkpointId,
      passNumberOrId: passNumber,
      declaredQuantityTonnes: 24.5,
      currentLocation: [78.150, 11.670],
      notes: 'Weighbridge matched pass payload. Transit authorized.',
    },
    token,
  );
  assert.strictEqual(passageRes.status, 200, `Passage recording must succeed: ${JSON.stringify(passageRes.body)}`);
  assert.strictEqual(passageRes.body.data.success, true);
  assert.strictEqual(passageRes.body.data.epass.status, EPassStatus.USED);
  console.log(` [PASS] Step 9: Official Passage recorded; pass transitioned to USED`);

  // Step 10: Run Reconciliation Audit
  const reconRes = await request(
    'POST',
    '/api/reconciliation/run',
    {
      zoneId: testZone._id.toString(),
      periodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
      mineralDensityTonnesPerCubicMeter: 2.6,
      discrepancyTolerancePercent: 15.0,
      notes: 'End-to-End automated reconciliation validation',
    },
    token,
  );
  assert.strictEqual(reconRes.status, 201, 'Reconciliation audit run must succeed');
  const reportId = reconRes.body.data.id;
  assert(reportId, 'Report ID must be present');
  console.log(` [PASS] Step 10: Reconciliation audit report generated (ID: ${reportId}, Score: ${reconRes.body.data.discrepancyScore})`);

  // Step 11: Escalate to Enforcement Case from Reconciliation
  const caseRes = await request(
    'POST',
    '/api/enforcement-cases/from-reconciliation',
    {
      reconciliationReportId: reportId,
      assignedOfficerId: officerUser._id.toString(),
      customTitle: `Automated Reconciliation Audit Escalation - Case #${reportId.slice(-6).toUpperCase()}`,
      customDescription: 'Escalated following discrepancies identified in automated reconciliation audit.',
    },
    token,
  );
  assert.strictEqual(caseRes.status, 201, `Case escalation from reconciliation must succeed (201): ${JSON.stringify(caseRes.body)}`);
  assert(caseRes.body.data.caseId.startsWith('CASE-'), 'Case ID must have CASE- prefix');
  assert.strictEqual(caseRes.body.data.status, CaseStatus.ASSIGNED);
  assert.strictEqual(caseRes.body.data.reconciliationReportId, reportId);
  const caseId = caseRes.body.data.id;
  console.log(` [PASS] Step 11: Enforcement Case created (${caseRes.body.data.caseId}) linked to Reconciliation Report`);

  // Step 12: Record Enforcement Action
  const actionRes = await request(
    'PATCH',
    `/api/enforcement-cases/${caseId}/action`,
    {
      actionType: 'NOTICE_ISSUED',
      actionDetails: 'Show-cause notice issued under Tamil Nadu Minor Mineral Concession Rules.',
      penaltyAmountInr: 50000,
      officialOrderReference: 'TN-FOR-ORD-2026-99',
    },
    token,
  );
  assert.strictEqual(actionRes.status, 200, 'Action recording must succeed');
  console.log(` [PASS] Step 12: Enforcement action recorded with penalty`);

  // Step 13: Close Case
  const closeRes = await request(
    'PATCH',
    `/api/enforcement-cases/${caseId}/close`,
    {
      resolutionSummary: 'Penalty deposited, compliance verified by divisional officer.',
      followUpRequired: false,
    },
    token,
  );
  assert.strictEqual(closeRes.status, 200, `Case closure must succeed: ${JSON.stringify(closeRes.body)}`);
  assert.strictEqual(closeRes.body.data.status, CaseStatus.CLOSED);
  console.log(` [PASS] Step 13: Enforcement Case formally resolved and closed`);

  console.log('\n===============================================================');
  console.log('   ALL 13 WORKFLOW AUDIT ASSERTIONS COMPLETED SUCCESSFULLY!    ');
  console.log('===============================================================\n');

  // Teardown
  server.close();
  await mongoose.disconnect();
}

runWorkflowAudit()
  .then(() => {
    console.log('[SUCCESS] Verification completed with zero failures.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[FAILED] Verification error:', err);
    if (server) server.close();
    mongoose.disconnect().finally(() => process.exit(1));
  });
