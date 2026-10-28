/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';

import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { CaseAuditLogModel } from '../models/CaseAuditLog.js';
import { EnforcementCaseService } from '../services/EnforcementCaseService.js';
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
  ReconciliationStatus,
  ReconciliationReportStatus,
  ReconciliationAnomalyType,
  ReconciliationAnomalySeverity,
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

export async function runM12TestSuite() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING MODULE M12: ENFORCEMENT CASE & INVESTIGATION WORKFLOW TEST SUITE');
  console.log('================================================================\n');

  const mongoUri = env.MONGODB_URI || 'mongodb://localhost:27017/tn_forest_test';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected:', mongoose.connection.host);
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

  const enforcementCaseService = new EnforcementCaseService();
  const testSuffix = Date.now().toString();

  try {
    // -------------------------------------------------------------
    // Setup Test Users & Tokens
    // -------------------------------------------------------------
    console.log('--- Setting up Test Users & Permissions ---');
    const superAdminEmail = `superadmin_m12_${testSuffix}@tnforest.gov.in`;
    const forestOfficerEmail = `forestofficer_m12_${testSuffix}@tnforest.gov.in`;
    const fieldOfficerEmail = `fieldofficer_m12_${testSuffix}@tnforest.gov.in`;
    const viewerEmail = `viewer_m12_${testSuffix}@tnforest.gov.in`;

    const pwdHash = await hashPassword('Password123!');

    const superAdminUser = await User.create({
      name: `Super Admin M12 ${testSuffix}`,
      email: superAdminEmail,
      passwordHash: pwdHash,
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
      status: UserStatus.ACTIVE,
    });

    const forestOfficerUser = await User.create({
      name: `Forest Officer M12 ${testSuffix}`,
      email: forestOfficerEmail,
      passwordHash: pwdHash,
      role: UserRole.FOREST_OFFICER,
      permissions: [
        Permission.ENFORCEMENT_CASE_READ,
        Permission.ENFORCEMENT_CASE_CREATE,
        Permission.ENFORCEMENT_CASE_ASSIGN,
        Permission.ENFORCEMENT_CASE_UPDATE,
        Permission.ENFORCEMENT_CASE_CLOSE,
      ],
      status: UserStatus.ACTIVE,
    });

    const fieldOfficerUser = await User.create({
      name: `Field Officer M12 ${testSuffix}`,
      email: fieldOfficerEmail,
      passwordHash: pwdHash,
      role: UserRole.FIELD_OFFICER,
      permissions: [
        Permission.ENFORCEMENT_CASE_READ,
        Permission.ENFORCEMENT_CASE_UPDATE,
      ],
      status: UserStatus.ACTIVE,
    });

    await User.create({
      name: `Viewer User M12 ${testSuffix}`,
      email: viewerEmail,
      passwordHash: pwdHash,
      role: UserRole.VIEWER,
      permissions: [Permission.ENFORCEMENT_CASE_READ],
      status: UserStatus.ACTIVE,
    });

    // Obtain JWT tokens
    const loginSuperAdmin = await request('POST', '/api/auth/login', {
      email: superAdminEmail,
      password: 'Password123!',
    });
    assert.strictEqual(loginSuperAdmin.status, 200, 'Super admin login should succeed');
    const superAdminToken = loginSuperAdmin.body.data?.token || loginSuperAdmin.body.token;

    const loginOfficer = await request('POST', '/api/auth/login', {
      email: forestOfficerEmail,
      password: 'Password123!',
    });
    assert.strictEqual(loginOfficer.status, 200, 'Forest officer login should succeed');
    const forestOfficerToken = loginOfficer.body.data?.token || loginOfficer.body.token;

    const loginFieldOfficer = await request('POST', '/api/auth/login', {
      email: fieldOfficerEmail,
      password: 'Password123!',
    });
    assert.strictEqual(loginFieldOfficer.status, 200, 'Field officer login should succeed');
    const fieldOfficerToken = loginFieldOfficer.body.data?.token || loginFieldOfficer.body.token;

    const loginViewer = await request('POST', '/api/auth/login', {
      email: viewerEmail,
      password: 'Password123!',
    });
    assert.strictEqual(loginViewer.status, 200, 'Viewer login should succeed');
    const viewerToken = loginViewer.body.data?.token || loginViewer.body.token;


    // -------------------------------------------------------------
    // Base Entities
    // -------------------------------------------------------------
    const testZone = await Zone.create({
      zoneId: `ZONE-M12-${testSuffix}`,
      name: `M12 Reserved Forest Zone ${testSuffix}`,
      category: ZoneCategory.RESERVED_AREA,
      centerPoint: { type: 'Point', coordinates: [76.825, 11.425] },
      createdBy: superAdminUser._id,

      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [76.80, 11.40],
            [76.85, 11.40],
            [76.85, 11.45],
            [76.80, 11.45],
            [76.80, 11.40],
          ],
        ],
      },
      status: ZoneStatus.PROTECTED,
    });


    const testAuth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-${testSuffix}`,
      permitNumber: `TN-M12-AUTH-${testSuffix}`,
      lesseeName: 'Salem Granite Quarry Corp',
      mineralType: 'GRANITE',
      zoneId: testZone._id,
      permittedWeightTonnes: 1000,
      remainingQuota: 200,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 60 * 24 * 3600 * 1000),
      status: 'ACTIVE',
      createdBy: superAdminUser._id,
    });



    const testReconReport = await ReconciliationReportModel.create({
      reconciliationId: `REC-M12-${testSuffix}`,
      zoneId: testZone._id,
      zoneName: testZone.name,
      authorizationId: testAuth._id,
      permitNumber: testAuth.permitNumber,
      periodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      periodEnd: new Date(),
      status: ReconciliationReportStatus.UNDER_INVESTIGATION,
      reconciliationStatus: ReconciliationStatus.CRITICAL_ANOMALY,
      discrepancyScore: 78,
      permitSummary: {
        permitNumber: testAuth.permitNumber,
        lesseeName: testAuth.lesseeName,
        mineralType: testAuth.mineralType,
        permittedWeightTonnes: 1000,
        remainingQuota: 200,
        status: 'ACTIVE',
        validFrom: testAuth.validFrom.toISOString(),
        validUntil: testAuth.validUntil.toISOString(),
      },
      transportSummary: {
        totalPassesIssued: 45,
        totalIssuedTonnage: 1200,
        totalPassesUsed: 35,
        totalVerifiedTonnage: 900,
        totalPassesCancelled: 0,
        totalPassesExpired: 0,
        activePassCount: 10,
      },
      checkpointSummary: {
        totalScans: 35,
        validScans: 35,
        invalidScans: 0,
        outsideGeofenceScans: 0,
        transitPassageCount: 35,
        totalTransitTonnage: 900,
      },
      satelliteSummary: {
        observationCount: 3,
        totalDisturbedAreaHectares: 2.8,
        estimatedExtractionVolumeCubicMeters: 4500,
        estimatedTonnageEquivalent: 11700,
        densityUsedTonnesPerCubicMeter: 2.6,
        maxEvidenceStrength: 92,
        miningClassifications: ['SURFACE_EXCAVATION'],
        disclaimer: 'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
      },
      anomalies: [
        {
          type: ReconciliationAnomalyType.EXCESS_TRANSPORT_OVER_PERMIT,
          severity: ReconciliationAnomalySeverity.CRITICAL,
          title: 'Issued transport exceeds authorized permit quota by 200 tonnes',
          description: '1200 tonnes issued against 1000 tonnes permitted.',
          evidenceScore: 90,
        },
      ],
      findings: [
        'Quota breach of 200 tonnes detected.',
        'Transit gap of 300 tonnes unrecorded at destination checkpoints.',
      ],
      recommendations: [
        'Initiate immediate field verification squad.',
        'Issue notice to lessee Salem Granite Quarry Corp.',
      ],
      generatedBy: forestOfficerUser._id,
    });

    console.log('✅ Base infrastructure entities initialized successfully.');

    // -------------------------------------------------------------
    // Test 1: Manual Enforcement Case Creation
    // -------------------------------------------------------------
    console.log('\n--- 1. Manual Enforcement Case Creation ---');
    console.info('Test 1: Create manual enforcement case with unique CASE-YYYY-XXXX ID');
    const case1 = await enforcementCaseService.createCase(
      {
        title: 'Unlawful Granite Excavation at Nilgiris Forest Buffer',
        description: 'Intelligence report received regarding heavy machinery excavating after sunset.',
        severity: CaseSeverity.HIGH,
        caseType: CaseType.UNRECORDED_EXTRACTION,
        zoneId: testZone._id.toString(),
        investigationFindings: ['Local beat ranger reported nighttime truck movement.'],
      },
      forestOfficerUser._id.toString(),
    );

    assert.ok(case1.caseId.startsWith('CASE-'), 'Case ID must start with CASE-');
    assert.strictEqual(case1.status, CaseStatus.CASE_CREATED, 'Initial status must be CASE_CREATED');
    assert.strictEqual(case1.severity, CaseSeverity.HIGH);
    assert.strictEqual(case1.zoneName, testZone.name);
    console.info(`  ✅ Manual case created: ${case1.caseId} (${case1.title})`);

    // -------------------------------------------------------------
    // Test 2: Case Creation from M11 Reconciliation Report
    // -------------------------------------------------------------
    console.log('\n--- 2. Spawn Enforcement Case from M11 Reconciliation Report ---');
    console.info('Test 2: Create case automatically from M11 discrepancy audit');
    const case2 = await enforcementCaseService.createCaseFromReconciliation(
      {
        reconciliationReportId: testReconReport._id.toString(),
        assignedOfficerId: forestOfficerUser._id.toString(),
      },
      forestOfficerUser._id.toString(),
    );

    assert.strictEqual(case2.reconciliationReportNumber, testReconReport.reconciliationId);
    assert.strictEqual(case2.severity, CaseSeverity.CRITICAL, 'Critical score/anomaly must map to CRITICAL severity');
    assert.strictEqual(case2.caseType, CaseType.OVER_QUOTA_TRANSPORT);
    assert.strictEqual(case2.status, CaseStatus.ASSIGNED, 'When officer is assigned at creation, status must be ASSIGNED');
    assert.strictEqual(case2.assignedOfficerName, forestOfficerUser.name);
    assert.strictEqual(case2.investigationFindings.length, 2);
    console.info(`  ✅ Recon-spawned case created: ${case2.caseId} from ${testReconReport.reconciliationId}`);

    // Verify original M11 document was preserved intact
    const originalReconDoc = await ReconciliationReportModel.findById(testReconReport._id);
    assert.ok(originalReconDoc, 'Original M11 document must still exist');
    assert.strictEqual(originalReconDoc.discrepancyScore, 78, 'Original score preserved');

    // -------------------------------------------------------------
    // Test 3: Duplicate Case Prevention
    // -------------------------------------------------------------
    console.log('\n--- 3. Duplicate Case Prevention ---');
    console.info('Test 3: Prevent duplicate active case creation for the same reconciliation report');
    await assert.rejects(
      async () => {
        await enforcementCaseService.createCaseFromReconciliation(
          {
            reconciliationReportId: testReconReport._id.toString(),
          },
          forestOfficerUser._id.toString(),
        );
      },
      /already exists/,
      'Must reject duplicate active case for same reconciliation report',
    );
    console.info('  ✅ Duplicate case creation correctly rejected with 409 Conflict');

    // -------------------------------------------------------------
    // Test 4: Officer Assignment
    // -------------------------------------------------------------
    console.log('\n--- 4. Officer Assignment & Audit Logging ---');
    console.info('Test 4: Assign field officer to case1 and verify state transition');
    const assignedCase1 = await enforcementCaseService.assignOfficer(
      case1.id,
      {
        assignedOfficerId: fieldOfficerUser._id.toString(),
        remarks: 'Assigned for immediate on-site boundary inspection.',
      },
      forestOfficerUser._id.toString(),
    );

    assert.strictEqual(assignedCase1.status, CaseStatus.ASSIGNED);
    assert.strictEqual(assignedCase1.assignedOfficerName, fieldOfficerUser.name);
    assert.ok(assignedCase1.assignedAt, 'assignedAt must be set');
    console.info(`  ✅ Officer assigned: ${assignedCase1.assignedOfficerName}, Status: ${assignedCase1.status}`);

    // -------------------------------------------------------------
    // Test 5: Investigation & On-Ground Field Verification
    // -------------------------------------------------------------
    console.log('\n--- 5. Investigation Findings & Field Verification ---');
    console.info('Test 5: Log drone survey, coordinates, and ground confirmation');
    const investigatedCase = await enforcementCaseService.updateInvestigation(
      assignedCase1.id,
      {
        findings: ['Site survey revealed 1.8 ha pit beyond permitted marker.'],
        fieldVerification: {
          locationCoordinates: [76.8215, 11.4230],
          siteObservations: 'Excavator actively digging bare granite bedrock without GPS transponder.',
          droneSurveyConducted: true,
          groundDisturbanceConfirmed: true,
          notes: 'High-resolution orthomosaic captured by DJI Mavic 3 Enterprise squad.',
        },
        remarks: 'Field survey completed and disturbance verified on ground.',
      },
      fieldOfficerUser._id.toString(),
    );

    assert.strictEqual(investigatedCase.status, CaseStatus.FIELD_VERIFICATION);
    assert.ok(investigatedCase.fieldVerification?.droneSurveyConducted);
    assert.ok(investigatedCase.fieldVerification?.groundDisturbanceConfirmed);
    assert.deepStrictEqual(investigatedCase.fieldVerification?.locationCoordinates, [76.8215, 11.4230]);
    console.info(`  ✅ Field verification logged: Status transitioned to ${investigatedCase.status}`);

    // -------------------------------------------------------------
    // Test 6: Official Enforcement Action Recording
    // -------------------------------------------------------------
    console.log('\n--- 6. Official Enforcement Action Recording ---');
    console.info('Test 6: Record penalty order and notice of mining halt');
    const actionedCase = await enforcementCaseService.recordEnforcementAction(
      investigatedCase.id,
      {
        actionType: EnforcementActionType.HALT_MINING_ORDER,
        actionDetails: 'Stop-work notice and seizure of two hydraulic excavators under TN Forest Act.',
        penaltyAmountInr: 250000,
        officialOrderReference: 'TN-FD/NLG/ENF/2026/089',
        remarks: 'Order served on site to operator representative.',
      },
      forestOfficerUser._id.toString(),
    );

    assert.strictEqual(actionedCase.status, CaseStatus.ACTION_REQUIRED);
    assert.strictEqual(actionedCase.enforcementAction?.actionType, EnforcementActionType.HALT_MINING_ORDER);
    assert.strictEqual(actionedCase.enforcementAction?.penaltyAmountInr, 250000);
    assert.strictEqual(actionedCase.enforcementAction?.officialOrderReference, 'TN-FD/NLG/ENF/2026/089');
    console.info(`  ✅ Enforcement action recorded: ${actionedCase.enforcementAction?.actionType} (₹${actionedCase.enforcementAction?.penaltyAmountInr})`);

    // -------------------------------------------------------------
    // Test 7: Formal Case Closure & Lock Protection
    // -------------------------------------------------------------
    console.log('\n--- 7. Formal Case Closure & Lock Protection ---');
    console.info('Test 7: Formally resolve and close case, locking it from future standard edits');
    const closedCase = await enforcementCaseService.closeCase(
      actionedCase.id,
      {
        resolutionSummary: 'Penalty of ₹2,50,000 realized via demand draft. Illegal pit backfilled and boundary posts restored.',
        followUpRequired: true,
        remarks: 'Quarterly satellite SAR pass scheduled for reclamation verification.',
      },
      forestOfficerUser._id.toString(),
    );

    assert.strictEqual(closedCase.status, CaseStatus.CLOSED);
    assert.ok(closedCase.closedAt, 'closedAt must be populated');
    assert.strictEqual(closedCase.resolutionInfo?.summary, 'Penalty of ₹2,50,000 realized via demand draft. Illegal pit backfilled and boundary posts restored.');
    assert.strictEqual(closedCase.resolutionInfo?.followUpRequired, true);
    console.info(`  ✅ Case closed: ${closedCase.caseId}, Status: ${closedCase.status}`);

    // Verify mutations on CLOSED case are rejected
    await assert.rejects(
      async () => {
        await enforcementCaseService.updateStatus(
          closedCase.id,
          { status: CaseStatus.UNDER_INVESTIGATION },
          forestOfficerUser._id.toString(),
        );
      },
      /CLOSED case/,
      'Must reject status modifications on a CLOSED case',
    );

    await assert.rejects(
      async () => {
        await enforcementCaseService.assignOfficer(
          closedCase.id,
          { assignedOfficerId: superAdminUser._id.toString() },
          forestOfficerUser._id.toString(),
        );
      },
      /CLOSED case/,
      'Must reject reassignment on a CLOSED case',
    );
    console.info('  ✅ Closed case lock protection verified: Modifications rejected');

    // -------------------------------------------------------------
    // Test 8: Immutable Chronological Audit Trail
    // -------------------------------------------------------------
    console.log('\n--- 8. Immutable Chronological Audit Trail ---');
    console.info('Test 8: Verify complete lifecycle audit trail of case1');
    const auditLogs = await enforcementCaseService.getAuditHistory(case1.caseId);

    assert.ok(auditLogs.length >= 5, 'Must contain at least 5 lifecycle audit events');
    const actions = auditLogs.map((l) => l.action);
    assert.ok(actions.includes(CaseAuditAction.CASE_CREATED), 'Must record CASE_CREATED');
    assert.ok(actions.includes(CaseAuditAction.OFFICER_ASSIGNED), 'Must record OFFICER_ASSIGNED');
    assert.ok(actions.includes(CaseAuditAction.FIELD_VERIFICATION_LOGGED), 'Must record FIELD_VERIFICATION_LOGGED');
    assert.ok(actions.includes(CaseAuditAction.ENFORCEMENT_ACTION_RECORDED), 'Must record ENFORCEMENT_ACTION_RECORDED');
    assert.ok(actions.includes(CaseAuditAction.CASE_CLOSED), 'Must record CASE_CLOSED');

    console.info(`  ✅ Audit trail verified (${auditLogs.length} events logged in chronological order)`);

    // -------------------------------------------------------------
    // Test 9: System-wide KPI Aggregation
    // -------------------------------------------------------------
    console.log('\n--- 9. System-wide KPI Aggregation ---');
    console.info('Test 9: Verify aggregated case KPIs');
    const summary = await enforcementCaseService.getSummary();

    assert.ok(summary.totalCases >= 2, 'Total cases must be >= 2');
    assert.ok(summary.closedCount >= 1, 'Closed count must be >= 1');
    assert.ok(summary.criticalSeverityCount >= 1, 'Critical count must be >= 1');
    console.info(`  ✅ Summary KPIs: Total ${summary.totalCases}, Active: ${summary.activeCases}, Closed: ${summary.closedCount}`);

    // -------------------------------------------------------------
    // Test 10: REST API Endpoints Verification
    // -------------------------------------------------------------
    console.log('\n--- 10. REST API Endpoints Verification ---');
    console.info('Test 10a: POST /api/enforcement-cases');
    const resCreate = await request(
      'POST',
      '/api/enforcement-cases',
      {
        title: 'Over-Quota Transport Interception at Checkpoint Gamma',
        description: 'E-Pass gross tonnage exceeded permit remaining quota by 45 tonnes.',
        severity: CaseSeverity.HIGH,
        caseType: CaseType.OVER_QUOTA_TRANSPORT,
        zoneId: testZone._id.toString(),
      },
      forestOfficerToken,
    );
    assert.strictEqual(resCreate.status, 201);
    assert.strictEqual(resCreate.body.success, true);
    const apiCaseId = resCreate.body.data.id;
    console.info(`  ✅ API POST /api/enforcement-cases -> 201 Created (${resCreate.body.data.caseId})`);

    console.info('Test 10b: GET /api/enforcement-cases listing');
    const resList = await request('GET', '/api/enforcement-cases', undefined, forestOfficerToken);
    assert.strictEqual(resList.status, 200);
    assert.ok(Array.isArray(resList.body.data));
    console.info(`  ✅ API GET /api/enforcement-cases -> 200 OK (${resList.body.data.length} cases)`);

    console.info('Test 10c: GET /api/enforcement-cases/summary');
    const resSummary = await request('GET', '/api/enforcement-cases/summary', undefined, forestOfficerToken);
    assert.strictEqual(resSummary.status, 200);
    assert.strictEqual(typeof resSummary.body.data.totalCases, 'number');
    console.info(`  ✅ API GET /api/enforcement-cases/summary -> 200 OK`);

    console.info('Test 10d: GET /api/enforcement-cases/:id detail');
    const resDetail = await request('GET', `/api/enforcement-cases/${apiCaseId}`, undefined, forestOfficerToken);
    assert.strictEqual(resDetail.status, 200);
    assert.strictEqual(resDetail.body.data.id, apiCaseId);
    console.info(`  ✅ API GET /api/enforcement-cases/:id -> 200 OK`);

    console.info('Test 10e: PATCH /api/enforcement-cases/:id/assign');
    const resAssign = await request(
      'PATCH',
      `/api/enforcement-cases/${apiCaseId}/assign`,
      {
        assignedOfficerId: fieldOfficerUser._id.toString(),
        remarks: 'Assigned via REST endpoint.',
      },
      forestOfficerToken,
    );
    assert.strictEqual(resAssign.status, 200);
    assert.strictEqual(resAssign.body.data.status, CaseStatus.ASSIGNED);
    console.info(`  ✅ API PATCH /api/enforcement-cases/:id/assign -> 200 OK`);

    console.info('Test 10f: PATCH /api/enforcement-cases/:id/status');
    const resStatus = await request(
      'PATCH',
      `/api/enforcement-cases/${apiCaseId}/status`,
      {
        status: CaseStatus.UNDER_INVESTIGATION,
        remarks: 'Transitioned to UNDER_INVESTIGATION via REST endpoint.',
      },
      forestOfficerToken,
    );
    assert.strictEqual(resStatus.status, 200);
    assert.strictEqual(resStatus.body.data.status, CaseStatus.UNDER_INVESTIGATION);
    console.info(`  ✅ API PATCH /api/enforcement-cases/:id/status -> 200 OK`);

    console.info('Test 10g: PATCH /api/enforcement-cases/:id/investigation');
    const resInv = await request(
      'PATCH',
      `/api/enforcement-cases/${apiCaseId}/investigation`,
      {
        findings: ['Transit weight verified on electronic weighbridge.'],
        remarks: 'Investigation note appended.',
      },
      fieldOfficerToken,
    );
    assert.strictEqual(resInv.status, 200);
    console.info(`  ✅ API PATCH /api/enforcement-cases/:id/investigation -> 200 OK`);

    console.info('Test 10h: PATCH /api/enforcement-cases/:id/action');
    const resAction = await request(
      'PATCH',
      `/api/enforcement-cases/${apiCaseId}/action`,
      {
        actionType: EnforcementActionType.PENALTY_LEVIED,
        actionDetails: 'Levied compound penalty for overloaded transit pass.',
        penaltyAmountInr: 50000,
        officialOrderReference: 'TN-FD/MEMO/2026/102',
      },
      forestOfficerToken,
    );
    assert.strictEqual(resAction.status, 200);
    assert.strictEqual(resAction.body.data.status, CaseStatus.ACTION_REQUIRED);
    console.info(`  ✅ API PATCH /api/enforcement-cases/:id/action -> 200 OK`);

    console.info('Test 10i: PATCH /api/enforcement-cases/:id/close');
    const resClose = await request(
      'PATCH',
      `/api/enforcement-cases/${apiCaseId}/close`,
      {
        resolutionSummary: 'Compounded penalty paid in full. Transit pass closed.',
      },
      forestOfficerToken,
    );
    assert.strictEqual(resClose.status, 200);
    assert.strictEqual(resClose.body.data.status, CaseStatus.CLOSED);
    console.info(`  ✅ API PATCH /api/enforcement-cases/:id/close -> 200 OK`);

    console.info('Test 10j: GET /api/enforcement-cases/:id/audit');
    const resAudit = await request('GET', `/api/enforcement-cases/${apiCaseId}/audit`, undefined, forestOfficerToken);
    assert.strictEqual(resAudit.status, 200);
    assert.ok(Array.isArray(resAudit.body.data));
    assert.ok(resAudit.body.data.length >= 4);
    console.info(`  ✅ API GET /api/enforcement-cases/:id/audit -> 200 OK`);

    // -------------------------------------------------------------
    // Test 11: RBAC & Security Verification
    // -------------------------------------------------------------
    console.log('\n--- 11. RBAC & Security Verification ---');
    console.info('Test 11a: Viewer role cannot create case (403 Forbidden)');
    const resForbidden = await request(
      'POST',
      '/api/enforcement-cases',
      {
        title: 'Unauthorized Case Attempt',
        description: 'Should fail with 403',
        severity: CaseSeverity.LOW,
        caseType: CaseType.OTHER,
      },
      viewerToken,
    );
    assert.strictEqual(resForbidden.status, 403, 'Must return 403 Forbidden for Viewer role');
    console.info('  ✅ Viewer role rejected with 403 Forbidden');

    console.info('Test 11b: Unauthenticated request rejected (401 Unauthorized)');
    const resUnauth = await request(
      'POST',
      '/api/enforcement-cases',
      {
        title: 'Unauthenticated Case Attempt',
        description: 'Should fail with 401',
        severity: CaseSeverity.LOW,
        caseType: CaseType.OTHER,
      },
    );
    assert.strictEqual(resUnauth.status, 401, 'Must return 401 Unauthorized for missing token');
    console.info('  ✅ Unauthenticated request rejected with 401 Unauthorized');

    console.log('\n================================================================');
    console.log('🎉 ALL MODULE M12 ENFORCEMENT CASE TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    try {
      await Zone.deleteMany({ zoneId: `ZONE-M12-${testSuffix}` });
      await MiningAuthorizationModel.deleteMany({ authorizationId: `AUTH-${testSuffix}` });
      await ReconciliationReportModel.deleteMany({ reconciliationId: `REC-M12-${testSuffix}` });
      await EnforcementCaseModel.deleteMany({ title: new RegExp(testSuffix) });
      await CaseAuditLogModel.deleteMany({ 'actorName': new RegExp(testSuffix) });
      await User.deleteMany({
        email: {
          $in: [
            `superadmin_m12_${testSuffix}@tnforest.gov.in`,
            `forestofficer_m12_${testSuffix}@tnforest.gov.in`,
            `fieldofficer_m12_${testSuffix}@tnforest.gov.in`,
            `viewer_m12_${testSuffix}@tnforest.gov.in`,
          ],
        },
      });
    } catch (cleanupErr) {
      console.warn('Test cleanup warning:', cleanupErr);
    }
    if (server) {
      server.close();
    }
    if (process.env.NODE_ENV !== 'test' && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('MongoDB disconnected');
    }
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('m12-enforcement-case.test.ts')) {
  runM12TestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ M12 Test Suite Failed:', err);
      process.exit(1);
    });
}
