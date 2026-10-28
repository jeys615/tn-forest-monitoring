/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { CaseAuditLogModel } from '../models/CaseAuditLog.js';
import { EvidenceDossierModel } from '../models/EvidenceDossier.js';
import { EvidenceDossierService } from '../services/EvidenceDossierService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  ZoneStatus,
  CaseStatus,
  CaseSeverity,
  CaseType,
  CaseAuditAction,
  EnforcementActionType,
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
  console.log('🧪 PHASE 11.1: FORENSIC EVIDENCE DOSSIER ENGINE UNIT & API TESTS');
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

  const dossierService = new EvidenceDossierService();

  try {
    // -------------------------------------------------------------------------
    // Gate 1: Canonical Serialization & Hashing Determinism
    // -------------------------------------------------------------------------
    console.log('▶ Gate 1: Verifying canonical serialization & SHA-256 determinism...');

    const objA = {
      b: 'value_b',
      a: 'value_a',
      nested: { z: 10, y: [3, 2, 1], x: true },
      date: new Date('2026-10-02T12:00:00.000Z'),
    };

    const objB = {
      date: new Date('2026-10-02T12:00:00.000Z'),
      nested: { x: true, z: 10, y: [3, 2, 1] },
      a: 'value_a',
      b: 'value_b',
    };

    const canonA = dossierService.canonicalize(objA);
    const canonB = dossierService.canonicalize(objB);

    assert.strictEqual(canonA, canonB, 'Key ordering in objects must produce identical canonical string');

    const hashA = dossierService.computeHash(canonA);
    const hashB = dossierService.computeHash(canonB);

    assert.strictEqual(hashA, hashB, 'Identical canonical representations must produce identical SHA-256 digest');
    assert.strictEqual(hashA.length, 64, 'SHA-256 digest must be 64 hexadecimal characters');
    console.log('  ✔ Canonical serialization & SHA-256 determinism passed');

    // -------------------------------------------------------------------------
    // Gate 2: Setup Test Data
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 2: Setting up test officer, zone, case, and audit history...');

    const testPassword = await hashPassword('TestPass@123');
    const officerEmail = `dossier_officer_${Date.now()}@forest.tn.gov.in`;

    const officer = await User.create({
      name: 'Thiru R. Senthil Kumar IFS',
      email: officerEmail,
      passwordHash: testPassword,
      role: UserRole.FOREST_OFFICER,
      status: UserStatus.ACTIVE,
      permissions: Object.values(Permission),
    });

    const loginRes = await request('POST', '/api/auth/login', {
      email: officerEmail,
      password: 'TestPass@123',
    });
    assert.strictEqual(loginRes.status, 200, 'Officer login must succeed');
    const authToken = loginRes.body.data.token;

    const zone = await Zone.create({
      zoneId: `ZONE-KOLLI-${Date.now()}`,
      name: 'Kolli Hills Reserve Compartment 4B',
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.33, 11.24],
            [78.37, 11.24],
            [78.37, 11.28],
            [78.33, 11.28],
            [78.33, 11.24],
          ],
        ],
      },
      centerPoint: {
        type: 'Point',
        coordinates: [78.35, 11.26],
      },
      areaHectares: 142.5,
      createdBy: officer._id,
    });

    const testCaseId = `CASE-TEST-${Date.now()}`;
    const testCase = await EnforcementCaseModel.create({
      caseId: testCaseId,
      title: 'Illegal Quartz Surface Quarrying Inside Kolli Hills Protected Zone',
      description: 'Satellite optical anomaly corroborated by UAV ground reconnaissance showing 1.8 ha clearfelling.',
      severity: CaseSeverity.CRITICAL,
      caseType: CaseType.UNRECORDED_EXTRACTION,
      status: CaseStatus.UNDER_INVESTIGATION,
      zoneId: zone._id,
      zoneName: zone.name,
      assignedOfficerId: officer._id,
      assignedOfficerName: officer.name,
      assignedAt: new Date(),
      investigationFindings: [
        'Excavator tracks observed entering via unauthorized jungle path.',
        'Fresh quartzite rubble stockpile measuring ~450 cubic meters.',
      ],
      fieldVerification: {
        verifiedAt: new Date(),
        verifiedBy: officer._id,
        locationCoordinates: [78.3512, 11.2641],
        siteObservations: 'Heavy earth-moving machinery operational within protected reserve.',
        droneSurveyConducted: true,
        groundDisturbanceConfirmed: true,
        photoUrls: ['https://storage.forest.tn.gov.in/uav/drone_survey_01.jpg'],
        notes: 'GPS survey confirms intrusion extends 320m beyond lease boundary.',
      },
      enforcementAction: {
        actionType: EnforcementActionType.SEIZURE_ORDER,
        actionDetails: 'Immediate seizure of Hitachi 210 Excavator and tipper truck TN-28-AB-9876.',
        actionDate: new Date(),
        penaltyAmountInr: 500000,
        officialOrderReference: 'DCO/SLM/2026/089/SZ',
        issuedBy: officer._id,
      },
      createdBy: officer._id,
    });

    await CaseAuditLogModel.create({
      auditId: `AUDIT-${Date.now()}-1`,
      caseId: testCase._id,
      caseNumber: testCaseId,
      actorId: officer._id,
      actorName: officer.name,
      actorRole: officer.role,
      action: CaseAuditAction.CASE_CREATED,
      newStatus: CaseStatus.UNDER_INVESTIGATION,
      remarks: 'Case registered following high-confidence satellite change trigger.',
      timestamp: new Date(),
    });

    console.log('  ✔ Test environment established successfully');

    // -------------------------------------------------------------------------
    // Gate 3: Compile Evidence Dossier via Service
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 3: Compiling Evidence Dossier via EvidenceDossierService...');

    const dossierDto = await dossierService.compileDossier(testCaseId, {
      id: officer._id.toString(),
      name: officer.name,
    });

    assert.ok(dossierDto.dossierId.startsWith(`DOSSIER-${testCaseId}-V1`), 'Dossier ID must contain case number and V1');
    assert.strictEqual(dossierDto.caseNumber, testCaseId);
    assert.strictEqual(dossierDto.dossierVersion, 1);
    assert.strictEqual(dossierDto.isSealed, true);
    assert.strictEqual(dossierDto.hashAlgorithm, 'SHA-256');
    assert.strictEqual(dossierDto.dossierHash.length, 64);
    assert.strictEqual(dossierDto.caseDetails.title, testCase.title);
    assert.strictEqual(dossierDto.caseDetails.severity, CaseSeverity.CRITICAL);
    assert.strictEqual(dossierDto.uavVerification?.droneSurveyConducted, true);
    assert.strictEqual(dossierDto.uavVerification?.groundDisturbanceConfirmed, true);
    assert.strictEqual(dossierDto.auditTrail.length, 1);
    assert.strictEqual(dossierDto.integrity?.isValid, true);
    assert.strictEqual(dossierDto.integrity?.isTampered, false);

    console.log(`  ✔ Dossier compiled & sealed with SHA-256: ${dossierDto.dossierHash}`);

    // -------------------------------------------------------------------------
    // Gate 4: Cryptographic Verification & Tamper Detection
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 4: Testing cryptographic integrity verification & tamper detection...');

    // A. Untampered verification
    const untamperedCheck = await dossierService.verifyDossierIntegrity(dossierDto.dossierId);
    assert.strictEqual(untamperedCheck.isValid, true);
    assert.strictEqual(untamperedCheck.isTampered, false);
    assert.strictEqual(untamperedCheck.storedHash, untamperedCheck.computedHash);
    console.log('  ✔ Untampered verification returned valid');

    // B. Tamper test: direct database tampering of canonicalPayload
    const docInDb = await EvidenceDossierModel.findOne({ dossierId: dossierDto.dossierId });
    assert.ok(docInDb, 'Dossier document must exist in database');

    const originalPayload = docInDb.canonicalPayload;
    // Tamper with a single byte in the canonical payload
    docInDb.canonicalPayload = originalPayload.replace('Kolli Hills', 'Tampered Forest');
    await docInDb.save();

    const tamperedCheck = await dossierService.verifyDossierIntegrity(dossierDto.dossierId);
    assert.strictEqual(tamperedCheck.isValid, false, 'Tampered record must fail verification');
    assert.strictEqual(tamperedCheck.isTampered, true, 'Tampered flag must be true');
    assert.notStrictEqual(tamperedCheck.storedHash, tamperedCheck.computedHash, 'Computed hash must differ from stored hash');
    assert.ok(tamperedCheck.discrepancyDetails?.includes('mismatch'), 'Discrepancy details must be reported');
    console.log('  ✔ Tamper detection successfully flagged payload corruption');

    // Restore original payload
    docInDb.canonicalPayload = originalPayload;
    await docInDb.save();

    const restoredCheck = await dossierService.verifyDossierIntegrity(dossierDto.dossierId);
    assert.strictEqual(restoredCheck.isValid, true, 'Restored payload must verify cleanly');
    console.log('  ✔ Restored payload returned valid');

    // -------------------------------------------------------------------------
    // Gate 5: Immutability & Successive Versioning
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 5: Testing immutability & version incrementing...');

    const dossierV2 = await dossierService.compileDossier(testCaseId, {
      id: officer._id.toString(),
      name: officer.name,
    });

    assert.strictEqual(dossierV2.dossierVersion, 2, 'Second compilation must produce version 2');
    assert.ok(dossierV2.dossierId.startsWith(`DOSSIER-${testCaseId}-V2`));

    // Verify V1 is still present and valid
    const allDossiers = await dossierService.getAllDossiersForCase(testCaseId);
    assert.strictEqual(allDossiers.length, 2, 'Both V1 and V2 must persist');
    assert.strictEqual(allDossiers[0].dossierVersion, 2, 'V2 should be newest');
    assert.strictEqual(allDossiers[1].dossierVersion, 1, 'V1 should be intact');

    console.log('  ✔ Immutability and multi-version tracking verified');

    // -------------------------------------------------------------------------
    // Gate 6: REST API Verification
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 6: Testing REST API endpoints...');

    // A. GET /api/evidence-dossiers/:dossierId
    const getRes = await request('GET', `/api/evidence-dossiers/${dossierV2.dossierId}`, undefined, authToken);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.data.dossierId, dossierV2.dossierId);
    assert.strictEqual(getRes.body.data.integrity.isValid, true);
    console.log('  ✔ GET /api/evidence-dossiers/:dossierId passed');

    // B. POST /api/evidence-dossiers/:dossierId/verify
    const verifyRes = await request('POST', `/api/evidence-dossiers/${dossierV2.dossierId}/verify`, undefined, authToken);
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.data.isValid, true);
    assert.strictEqual(verifyRes.body.data.isTampered, false);
    console.log('  ✔ POST /api/evidence-dossiers/:dossierId/verify passed');

    // C. GET /api/enforcement-cases/:id/dossier
    const caseDossierRes = await request('GET', `/api/enforcement-cases/${testCaseId}/dossier`, undefined, authToken);
    assert.strictEqual(caseDossierRes.status, 200);
    assert.strictEqual(caseDossierRes.body.data.dossierVersion, 2);
    console.log('  ✔ GET /api/enforcement-cases/:id/dossier passed');

    // D. GET /api/enforcement-cases/:id/dossiers (all versions)
    const caseAllDossiersRes = await request('GET', `/api/enforcement-cases/${testCaseId}/dossiers`, undefined, authToken);
    assert.strictEqual(caseAllDossiersRes.status, 200);
    assert.strictEqual(caseAllDossiersRes.body.data.length, 2);
    console.log('  ✔ GET /api/enforcement-cases/:id/dossiers passed');

    console.log('\n================================================================');
    console.log('✅ ALL PHASE 11.1 EVIDENCE DOSSIER ENGINE TESTS PASSED (6/6)');
    console.log('================================================================\n');
  } finally {
    if (server) {
      server.close();
    }
    // Clean up test records
    await EvidenceDossierModel.deleteMany({ caseNumber: { $regex: '^CASE-TEST-' } });
    await EnforcementCaseModel.deleteMany({ caseId: { $regex: '^CASE-TEST-' } });
    await CaseAuditLogModel.deleteMany({ caseNumber: { $regex: '^CASE-TEST-' } });
    await Zone.deleteMany({ name: 'Kolli Hills Reserve Compartment 4B' });
    await User.deleteMany({ email: { $regex: '^dossier_officer_' } });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ Phase 11.1 test failure:', err);
  process.exit(1);
});
