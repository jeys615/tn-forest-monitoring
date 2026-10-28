/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { AlertModel } from '../models/Alert.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { BaselineModel } from '../models/Baseline.js';
import { EvidenceDossierModel } from '../models/EvidenceDossier.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  ZoneStatus,
  ZoneRiskLevel,
  DecisionSupportCategory,
  TimeRangePreset,
  AlertSeverity,
  AlertStatus,
  CaseSeverity,
  CaseStatus,
  CaseType,
  ReconciliationStatus,
  ReconciliationReportStatus,
  SensorType,
  SatelliteSource,
  SatelliteProcessingStatus,
  LocationVerificationStatus,
  CheckpointVerificationResult,
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

export async function runM13TestSuite() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING MODULE M13: INTELLIGENCE DASHBOARD & DECISION SUPPORT TEST SUITE');
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
        console.log(`✅ Test server running on ${BASE_URL}`);
      }
      resolve();
    });
  });

  let testSuffix = '';
  try {
    testSuffix = `M13_${Date.now()}`;
    const passwordHash = await hashPassword('Test@123456');

    // 1. Create Super Admin User
    const superAdmin = await User.create({
      employeeId: `EMP-INT-SA-${testSuffix}`,
      name: 'M13 Super Admin',
      email: `superadmin_${testSuffix}@forest.tn.gov.in`,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
      status: UserStatus.ACTIVE,
    });

    // 2. Create Viewer User (No INTELLIGENCE_READ permission)
    const unauthorizedUser = await User.create({
      employeeId: `EMP-INT-UNAUTH-${testSuffix}`,
      name: 'M13 Unauthorized User',
      email: `unauth_${testSuffix}@forest.tn.gov.in`,
      passwordHash,
      role: UserRole.VIEWER,
      permissions: [Permission.USER_READ], // Deliberately lacks INTELLIGENCE_READ
      status: UserStatus.ACTIVE,
    });

    // Login Super Admin
    const loginRes = await request('POST', '/api/auth/login', {
      email: `superadmin_${testSuffix}@forest.tn.gov.in`,
      password: 'Test@123456',
    });
    assert.strictEqual(loginRes.status, 200, 'Super admin login must succeed');
    const adminToken = loginRes.body.data.token;

    // Login Unauthorized User
    const unauthLoginRes = await request('POST', '/api/auth/login', {
      email: `unauth_${testSuffix}@forest.tn.gov.in`,
      password: 'Test@123456',
    });
    assert.strictEqual(unauthLoginRes.status, 200, 'Unauthorized user login succeeds');
    const unauthToken = unauthLoginRes.body.data.token;


    // 3. Create Monitored Test Zones
    const criticalZone = await Zone.create({
      zoneId: `ZONE-CRIT-${testSuffix}`,
      name: `Critical Reserve Zone ${testSuffix}`,
      category: ZoneCategory.PROTECTED_FOREST,
      centerPoint: { type: 'Point', coordinates: [76.95, 11.05] },
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [76.90, 11.00],
            [77.00, 11.00],
            [77.00, 11.10],
            [76.90, 11.10],
            [76.90, 11.00],
          ],
        ],
      },
      status: ZoneStatus.PROTECTED,
      createdBy: superAdmin._id,
    });

    const highRiskZone = await Zone.create({
      zoneId: `ZONE-HIGH-${testSuffix}`,
      name: `High Risk Lease Zone ${testSuffix}`,
      category: ZoneCategory.COMMERCIAL_LEASE,
      centerPoint: { type: 'Point', coordinates: [77.50, 11.50] },
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [77.45, 11.45],
            [77.55, 11.45],
            [77.55, 11.55],
            [77.45, 11.55],
            [77.45, 11.45],
          ],
        ],
      },
      status: ZoneStatus.PROTECTED,
      createdBy: superAdmin._id,
    });

    const normalZone = await Zone.create({
      zoneId: `ZONE-NORM-${testSuffix}`,
      name: `Normal Sanctuary Zone ${testSuffix}`,
      category: ZoneCategory.RESERVED_AREA,
      centerPoint: { type: 'Point', coordinates: [78.00, 12.00] },
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [77.95, 11.95],
            [78.05, 11.95],
            [78.05, 12.05],
            [77.95, 12.05],
            [77.95, 11.95],
          ],
        ],
      },
      status: ZoneStatus.PROTECTED,
      createdBy: superAdmin._id,
    });

    // 4. Create Linked Satellite Metadata & Change Detections
    // 4. Create Linked Satellite Metadata & Change Detections
    const satMeta = await SatelliteMetadata.create({
      imageId: `SAT-M13-${testSuffix}`,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date(),
      cloudCover: 5.0,
      footprint: {
        type: 'Polygon',
        coordinates: [
          [
            [76.90, 11.00],
            [77.00, 11.00],
            [77.00, 11.10],
            [76.90, 11.10],
            [76.90, 11.00],
          ],
        ],
      },
      intersectingZones: [criticalZone._id],
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: `COPERNICUS/S2_SR_HARMONIZED/SAT-M13-${testSuffix}`,
    });


    await ChangeDetectionModel.create({
      changeId: `CD-M13-${testSuffix}`,
      zoneId: criticalZone._id,
      baselineId: new mongoose.Types.ObjectId(),
      observationId: satMeta._id,
      zoneArea: 100,
      changedArea: 14.5,
      affectedAreaPercentage: 14.5,
      evidenceStrength: 88,
      evidenceBreakdown: {
        magnitudeScore: 40,
        dataQualityScore: 20,
        temporalConsistencyScore: 18,
        crossSensorScore: 10,
        totalEvidenceScore: 88,
        explanation: 'Strong spectral shift across optical bands',
      },
      calculationMode: 'REAL',
      detectedAt: new Date(),
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      threshold2Crossed: true,
      threshold5Crossed: true,
      threshold10Crossed: true,
      highestThresholdCrossed: 10,
      severity: AlertSeverity.HIGH,
      alertGenerated: true,
      crossSensorAgreement: 'SINGLE_SENSOR',
      temporalConsistency: 'CONSISTENT',
      explanation: 'Extensive vegetation reduction detected',
    });


    // 5. Create Linked Alerts
    await AlertModel.create({
      alertId: `ALT-CRIT-${testSuffix}`,
      zoneId: criticalZone._id,
      changeDetectionId: new mongoose.Types.ObjectId(),
      severity: AlertSeverity.HIGH,
      status: AlertStatus.OPEN,
      highestThresholdCrossed: 10,
      thresholdsCrossed: [2, 5, 10],
      evidenceStrength: 92,
      detectedAt: new Date(),
      affectedAreaPercentage: 14.5,
      calculationMode: 'REAL',
      sensorType: SensorType.OPTICAL,
      evidenceSources: [SensorType.OPTICAL],
      categories: ['VEGETATION_LOSS'],
      explanation: 'Major forest cover loss detected in northern sector',
    });

    await AlertModel.create({
      alertId: `ALT-HIGH-${testSuffix}`,
      zoneId: highRiskZone._id,
      changeDetectionId: new mongoose.Types.ObjectId(),
      severity: AlertSeverity.HIGH,
      status: AlertStatus.ACKNOWLEDGED,
      highestThresholdCrossed: 5,
      thresholdsCrossed: [2, 5],
      evidenceStrength: 75,
      detectedAt: new Date(),
      affectedAreaPercentage: 6.2,
      calculationMode: 'REAL',
      sensorType: SensorType.OPTICAL,
      evidenceSources: [SensorType.OPTICAL],
      categories: ['BARE_SOIL_EXPOSURE'],
      explanation: 'Elevated bare ground detected at quarry perimeter',
    });

    // 6. Create Mining Authorization, E-Passes & Checkpoint Logs
    const auth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-${testSuffix}`,
      permitNumber: `TN-MINING-${testSuffix}`,
      lesseeName: 'Tamil Nadu Granites Ltd',
      mineralType: 'GRANITE',
      permittedWeightTonnes: 1000,
      remainingQuota: 300,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      zoneId: highRiskZone._id,
      status: 'ACTIVE',
      createdBy: superAdmin._id,
    });


    await EPassModel.create({
      passNumber: `EPASS-1-${testSuffix}`,
      authorizationId: auth._id,
      vehicleId: new mongoose.Types.ObjectId(),
      driverId: new mongoose.Types.ObjectId(),
      mineralType: 'GRANITE',
      netWeightTonnes: 450,
      sourceLocation: 'Quarry Pit A',
      destinationCheckpoint: 'Attur Checkpoint A1',
      validFrom: new Date(Date.now() - 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 24 * 3600 * 1000),
      qrPayload: 'sample-qr-payload',
      qrCodeHash: 'sample-hash',
      digitalSignature: 'sha256-signature',
      status: 'USED',
      createdBy: superAdmin._id,
    });

    await CheckpointLogModel.create({
      logId: `CPLOG-1-${testSuffix}`,
      checkpointId: new mongoose.Types.ObjectId(),
      checkpointName: 'Attur Checkpoint A1',
      authorizationId: auth._id,
      passNumber: `EPASS-1-${testSuffix}`,
      vehicleRegistrationNumber: 'TN-38-AB-1234',
      declaredQuantityTonnes: 448.5,
      verificationResult: CheckpointVerificationResult.VALID,
      locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,

      verificationTimestamp: new Date(),

      signatureVerified: true,
      hashVerified: true,
      verifiedBy: superAdmin._id,
    });

    // 7. Create Linked Reconciliation Report
    await ReconciliationReportModel.create({
      reconciliationId: `RECON-M13-${testSuffix}`,
      zoneId: criticalZone._id,
      zoneName: criticalZone.name,
      authorizationId: auth._id,
      permitNumber: auth.permitNumber,
      periodStart: new Date(Date.now() - 15 * 24 * 3600 * 1000),
      periodEnd: new Date(),
      status: ReconciliationReportStatus.UNDER_INVESTIGATION,
      reconciliationStatus: ReconciliationStatus.CRITICAL_ANOMALY,
      discrepancyScore: 85,
      permitSummary: {
        permitNumber: auth.permitNumber,
        lesseeName: auth.lesseeName,
        mineralType: auth.mineralType,
        permittedWeightTonnes: 1000,
        remainingQuota: 300,
        status: 'ACTIVE',
        validFrom: auth.validFrom.toISOString(),
        validUntil: auth.validUntil.toISOString(),
      },
      transportSummary: {
        totalPassesIssued: 1,
        totalIssuedTonnage: 450,
        totalPassesUsed: 1,
        totalVerifiedTonnage: 448.5,
        totalPassesCancelled: 0,
        totalPassesExpired: 0,
        activePassCount: 0,
      },
      checkpointSummary: {
        totalScans: 1,
        validScans: 1,
        invalidScans: 0,
        outsideGeofenceScans: 0,
        transitPassageCount: 1,
        totalTransitTonnage: 448.5,
      },
      satelliteSummary: {
        observationCount: 1,
        totalDisturbedAreaHectares: 14.5,
        estimatedExtractionVolumeCubicMeters: 25000,
        estimatedTonnageEquivalent: 65000,
        densityUsedTonnesPerCubicMeter: 2.6,
        maxEvidenceStrength: 88,
        miningClassifications: ['SURFACE_EXCAVATION'],
        disclaimer: 'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
      },
      anomalies: [
        {
          type: 'EXCESS_EXTRACTION_UNRECORDED_TRANSPORT',
          severity: 'CRITICAL',
          title: 'Major unrecorded extraction anomaly',
          description: 'Satellite area disturbance exceeds reported transport volume',
          evidenceScore: 88,
        },
      ],
      findings: ['Severe environmental disturbance with zero transport verification'],
      createdBy: superAdmin._id,
    });


    // 8. Create Linked Enforcement Case
    await EnforcementCaseModel.create({
      caseId: `CASE-M13-${testSuffix}`,
      title: 'Illegal Excavation in Northern Sector',
      description: 'Satellite confirmed clearance with high discrepancy score',
      severity: CaseSeverity.CRITICAL,
      status: CaseStatus.ACTION_REQUIRED,
      caseType: CaseType.UNRECORDED_EXTRACTION,
      zoneId: criticalZone._id,
      zoneName: criticalZone.name,
      assignedOfficerId: superAdmin._id,
      assignedOfficerName: superAdmin.name,
      enforcementAction: {
        actionType: 'HALT_MINING_ORDER',
        actionDetails: 'Immediate stop-work order issued under TN Forest Act',
        penaltyAmountInr: 250000,
        officialOrderReference: `ORD-TN-${testSuffix}`,
        actionDate: new Date(),
      },
      createdBy: superAdmin._id,
    });

    console.log('✅ Test records seeded successfully.');


    // -------------------------------------------------------------
    // SCENARIO 1: Summary KPI Aggregation
    // -------------------------------------------------------------
    console.log('Running Scenario 1: Executive Summary KPI Aggregation...');
    const sumRes = await request('GET', '/api/intelligence/summary', undefined, adminToken);
    assert.strictEqual(sumRes.status, 200, 'Summary API returns 200 OK');
    assert.strictEqual(sumRes.body.success, true);
    assert.ok(sumRes.body.data.totalMonitoredZones >= 3, 'Counts monitored zones');
    assert.ok(sumRes.body.data.criticalAlertsCount >= 1, 'Counts critical alerts');
    assert.ok(sumRes.body.data.activeEnforcementCasesCount >= 1, 'Counts active enforcement cases');
    console.log('✅ Scenario 1 PASS');

    // -------------------------------------------------------------
    // SCENARIO 2: Zone Risk Classification
    // -------------------------------------------------------------
    console.log('Running Scenario 2: Zone Risk Classification...');
    const zonesRes = await request('GET', '/api/intelligence/zones', undefined, adminToken);
    assert.strictEqual(zonesRes.status, 200);
    const critRiskZone = zonesRes.body.data.find((z: any) => z.zoneId === criticalZone.zoneId);
    assert.ok(critRiskZone, 'Critical zone present in risk list');
    assert.strictEqual(critRiskZone.riskLevel, ZoneRiskLevel.CRITICAL, 'Critical zone is classified CRITICAL');
    assert.strictEqual(critRiskZone.decisionSupportCategory, DecisionSupportCategory.CRITICAL_ATTENTION);
    console.log('✅ Scenario 2 PASS');

    // -------------------------------------------------------------
    // SCENARIO 3: Critical Alert Prioritization
    // -------------------------------------------------------------
    console.log('Running Scenario 3: Critical Alert Prioritization...');
    assert.ok(critRiskZone.riskScore >= 70, 'Zone with critical alert has composite score >= 70');
    assert.ok(critRiskZone.unresolvedAlertCount >= 1, 'Unresolved alert count is tracked');
    console.log('✅ Scenario 3 PASS');

    // -------------------------------------------------------------
    // SCENARIO 4: High-Risk Zone Ranking
    // -------------------------------------------------------------
    console.log('Running Scenario 4: High-Risk Zone Ranking...');
    const rankedZones = zonesRes.body.data;
    for (let i = 0; i < rankedZones.length - 1; i++) {
      assert.ok(
        rankedZones[i].riskScore >= rankedZones[i + 1].riskScore,
        'Risk list is sorted strictly descending by composite risk score',
      );
    }
    console.log('✅ Scenario 4 PASS');

    // -------------------------------------------------------------
    // SCENARIO 5: Reconciliation Aggregation
    // -------------------------------------------------------------
    console.log('Running Scenario 5: Reconciliation Aggregation...');
    assert.strictEqual(critRiskZone.reconciliationDiscrepancyScore, 85, 'Captures reconciliation score 85');
    console.log('✅ Scenario 5 PASS');

    // -------------------------------------------------------------
    // SCENARIO 6: Transport/Checkpoint Discrepancy Aggregation
    // -------------------------------------------------------------
    console.log('Running Scenario 6: Transport & Mining Intelligence...');
    const transRes = await request('GET', '/api/intelligence/transport', undefined, adminToken);
    assert.strictEqual(transRes.status, 200);
    assert.ok(transRes.body.data.totalAuthorizedQuotaTonnes >= 1000, 'Total quota aggregated');
    assert.ok(transRes.body.data.totalIssuedTransportTonnes >= 450, 'Total transported aggregated');
    console.log('✅ Scenario 6 PASS');

    // -------------------------------------------------------------
    // SCENARIO 7: Enforcement Case Aggregation
    // -------------------------------------------------------------
    console.log('Running Scenario 7: Enforcement Intelligence Summary...');
    const enfRes = await request('GET', '/api/intelligence/enforcement', undefined, adminToken);
    assert.strictEqual(enfRes.status, 200);
    assert.ok(enfRes.body.data.activeCases >= 1, 'Active cases count is aggregated');
    assert.ok(enfRes.body.data.recentActions.length >= 1, 'Recent actions recorded');
    console.log('✅ Scenario 7 PASS');

    // -------------------------------------------------------------
    // SCENARIO 8: Trend Calculation
    // -------------------------------------------------------------
    console.log('Running Scenario 8: Trend Analytics Calculation...');
    const trendRes = await request('GET', '/api/intelligence/trends?preset=30d', undefined, adminToken);
    assert.strictEqual(trendRes.status, 200);
    assert.strictEqual(trendRes.body.data.preset, TimeRangePreset.THIRTY_DAYS);
    assert.ok(trendRes.body.data.dataPoints.length >= 30, 'Daily data points generated');
    assert.strictEqual(trendRes.body.data.isDataSufficient, true, 'Data sufficient flag is true');
    console.log('✅ Scenario 8 PASS');

    // -------------------------------------------------------------
    // SCENARIO 9: Date-Range Filtering
    // -------------------------------------------------------------
    console.log('Running Scenario 9: Preset & Date-Range Filtering...');
    const trend7d = await request('GET', '/api/intelligence/trends?preset=7d', undefined, adminToken);
    assert.strictEqual(trend7d.status, 200);
    assert.strictEqual(trend7d.body.data.preset, TimeRangePreset.SEVEN_DAYS);
    assert.ok(trend7d.body.data.dataPoints.length >= 7 && trend7d.body.data.dataPoints.length <= 9);
    console.log('✅ Scenario 9 PASS');

    // -------------------------------------------------------------
    // SCENARIO 10: Zone Filtering
    // -------------------------------------------------------------
    console.log('Running Scenario 10: Zone Intelligence Filtering...');
    const filterRes = await request(
      'GET',
      `/api/intelligence/zones?riskLevel=${ZoneRiskLevel.CRITICAL}`,
      undefined,
      adminToken,
    );
    assert.strictEqual(filterRes.status, 200);
    for (const z of filterRes.body.data) {
      assert.strictEqual(z.riskLevel, ZoneRiskLevel.CRITICAL, 'Only returns critical zones');
    }
    console.log('✅ Scenario 10 PASS');

    // -------------------------------------------------------------
    // SCENARIO 11: Cross-Module Correlation
    // -------------------------------------------------------------
    console.log('Running Scenario 11: Cross-Module Operational Lineage...');
    const corrRes = await request(
      'GET',
      `/api/intelligence/correlation/${criticalZone._id}`,
      undefined,
      adminToken,
    );
    assert.strictEqual(corrRes.status, 200);
    assert.strictEqual(corrRes.body.data.zone.zoneId, criticalZone.zoneId);
    assert.ok(corrRes.body.data.satelliteObservations.length >= 1, 'Correlates satellite observation');
    assert.ok(corrRes.body.data.alerts.length >= 1, 'Correlates alert');
    assert.ok(corrRes.body.data.reconciliationReports.length >= 1, 'Correlates reconciliation report');
    assert.ok(corrRes.body.data.enforcementCases.length >= 1, 'Correlates enforcement case');
    console.log('✅ Scenario 11 PASS');

    // -------------------------------------------------------------
    // SCENARIO 12: Missing Relationship Handling
    // -------------------------------------------------------------
    console.log('Running Scenario 12: Missing Relationship Handling...');
    const normCorr = await request(
      'GET',
      `/api/intelligence/correlation/${normalZone._id}`,
      undefined,
      adminToken,
    );
    assert.strictEqual(normCorr.status, 200);
    assert.strictEqual(normCorr.body.data.alerts.length, 0, 'Empty alerts array for normal zone');
    assert.strictEqual(normCorr.body.data.enforcementCases.length, 0, 'Empty cases array');
    console.log('✅ Scenario 12 PASS');

    // -------------------------------------------------------------
    // SCENARIO 13: Empty Database Handling
    // -------------------------------------------------------------
    console.log('Running Scenario 13: Empty / Non-Existent Zone Handling...');
    const fakeId = new mongoose.Types.ObjectId();
    const notFoundRes = await request('GET', `/api/intelligence/zones/${fakeId}`, undefined, adminToken);
    assert.strictEqual(notFoundRes.status, 404, 'Returns 404 Not Found for non-existent zone');
    console.log('✅ Scenario 13 PASS');

    // -------------------------------------------------------------
    // SCENARIO 14: Insufficient Historical Data Handling
    // -------------------------------------------------------------
    console.log('Running Scenario 14: Insufficient Historical Data Handling...');
    const oldTrend = await request(
      'GET',
      '/api/intelligence/trends?startDate=2010-01-01&endDate=2010-01-07',
      undefined,
      adminToken,
    );
    assert.strictEqual(oldTrend.status, 200);
    assert.strictEqual(oldTrend.body.data.isDataSufficient, false, 'Flags insufficient data');
    console.log('✅ Scenario 14 PASS');

    // -------------------------------------------------------------
    // SCENARIO 15: Pagination
    // -------------------------------------------------------------
    console.log('Running Scenario 15: Pagination Handling...');
    const pageRes = await request('GET', '/api/intelligence/zones?limit=1&skip=0', undefined, adminToken);
    assert.strictEqual(pageRes.status, 200);
    assert.strictEqual(pageRes.body.data.length, 1, 'Limit restricts result count to 1');
    console.log('✅ Scenario 15 PASS');

    // -------------------------------------------------------------
    // SCENARIO 16: RBAC Protection
    // -------------------------------------------------------------
    console.log('Running Scenario 16: RBAC Enforcement...');
    const unauthSummary = await request('GET', '/api/intelligence/summary', undefined, unauthToken);
    assert.strictEqual(unauthSummary.status, 403, 'Returns 403 Forbidden without INTELLIGENCE_READ');
    console.log('✅ Scenario 16 PASS');

    // -------------------------------------------------------------
    // SCENARIO 17: Authentication Required
    // -------------------------------------------------------------
    console.log('Running Scenario 17: Authentication Requirement...');
    const noAuth = await request('GET', '/api/intelligence/summary');
    assert.strictEqual(noAuth.status, 401, 'Returns 401 Unauthorized without token');
    console.log('✅ Scenario 17 PASS');

    // -------------------------------------------------------------
    // SCENARIO 18: Invalid Query Validation
    // -------------------------------------------------------------
    console.log('Running Scenario 18: Input & Query Validation...');
    const invalidQuery = await request('GET', '/api/intelligence/zones?limit=-5', undefined, adminToken);
    assert.strictEqual(invalidQuery.status, 400, 'Returns 400 Bad Request on invalid limit');
    console.log('✅ Scenario 18 PASS');

    // -------------------------------------------------------------
    // SCENARIO 19: Unit Separation Invariant
    // -------------------------------------------------------------
    console.log('Running Scenario 19: Unit Separation Invariant...');
    assert.strictEqual(transRes.body.data.units.area, 'hectares (ha)');
    assert.strictEqual(transRes.body.data.units.mass, 'metric tonnes (t)');
    assert.strictEqual(transRes.body.data.units.currency, 'INR (₹)');
    console.log('✅ Scenario 19 PASS');

    // -------------------------------------------------------------
    // SCENARIO 20: Satellite Disclaimer Invariant
    // -------------------------------------------------------------
    console.log('Running Scenario 20: Satellite Disclaimer Invariant...');
    const disclaimerExpected =
      'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.';
    assert.strictEqual(sumRes.body.data.disclaimer, disclaimerExpected);
    assert.strictEqual(critRiskZone.disclaimer, disclaimerExpected);
    assert.strictEqual(corrRes.body.data.disclaimer, disclaimerExpected);
    console.log('✅ Scenario 20 PASS');

    // -------------------------------------------------------------
    // SCENARIO 21: No Mutation of Source Records
    // -------------------------------------------------------------
    console.log('Running Scenario 21: Source Record Immutability Verification...');
    const alertBefore = await AlertModel.findOne({ alertId: `ALT-CRIT-${testSuffix}` }).lean();
    await request('GET', '/api/intelligence/alerts', undefined, adminToken);
    const alertAfter = await AlertModel.findOne({ alertId: `ALT-CRIT-${testSuffix}` }).lean();
    assert.deepStrictEqual(alertBefore?.status, alertAfter?.status, 'Intelligence queries do not mutate alerts');
    console.log('✅ Scenario 21 PASS');


    // -------------------------------------------------------------
    // SCENARIO 22: Deterministic Ranking
    // -------------------------------------------------------------
    console.log('Running Scenario 22: Deterministic Ranking Verification...');
    const run1 = await request('GET', '/api/intelligence/zones', undefined, adminToken);
    const run2 = await request('GET', '/api/intelligence/zones', undefined, adminToken);
    assert.deepStrictEqual(
      run1.body.data.map((z: any) => z.zoneId),
      run2.body.data.map((z: any) => z.zoneId),
      'Consecutive ranking executions produce identical rankings',
    );
    console.log('✅ Scenario 22 PASS');

    // -------------------------------------------------------------
    // SCENARIO 23: All API Endpoints Verification
    // -------------------------------------------------------------
    console.log('Running Scenario 23: All API Endpoints Verification...');
    const hotspotsRes = await request('GET', '/api/intelligence/hotspots', undefined, adminToken);
    assert.strictEqual(hotspotsRes.status, 200, 'Hotspots API returns 200');
    assert.ok(hotspotsRes.body.data.highestRiskZones.length >= 1);

    const decisionRes = await request('GET', '/api/intelligence/decision-support', undefined, adminToken);
    assert.strictEqual(decisionRes.status, 200, 'Decision-support API returns 200');
    assert.ok(decisionRes.body.data.criticalAttention.length >= 1);
    console.log('✅ Scenario 23 PASS');

    // -------------------------------------------------------------
    // SCENARIO 24: Dashboard Summary Consistency
    // -------------------------------------------------------------
    console.log('Running Scenario 24: Dashboard Summary Consistency...');
    const dist = sumRes.body.data.riskDistribution;
    const totalDistributed = dist.critical + dist.high + dist.medium + dist.low;
    assert.strictEqual(
      totalDistributed,
      sumRes.body.data.totalMonitoredZones,
      'Sum of risk distribution matches total monitored zones',
    );
    console.log('✅ Scenario 24 PASS');

    // -------------------------------------------------------------
    // SCENARIO 25: Multi-Source Chronological Investigation Timeline
    // -------------------------------------------------------------
    console.log('Running Scenario 25: Multi-Source Investigation Timeline...');
    const timelineRes = await request('GET', '/api/intelligence/timeline', undefined, adminToken);
    assert.strictEqual(timelineRes.status, 200, 'Timeline returns 200');
    assert.ok(typeof timelineRes.body.data.totalEvents === 'number', 'Total events is number');
    assert.ok(Array.isArray(timelineRes.body.data.events), 'Timeline events is array');
    assert.strictEqual(timelineRes.body.data.disclaimer, disclaimerExpected, 'Timeline has statutory disclaimer');

    // Test timeline module filter
    const alertTimeline = await request('GET', '/api/intelligence/timeline?module=ALERT', undefined, adminToken);
    assert.strictEqual(alertTimeline.status, 200);
    assert.ok(Array.isArray(alertTimeline.body.data.events));
    for (const evt of alertTimeline.body.data.events) {
      assert.ok(evt.sourceModule.includes('ALERT'), 'Only ALERT events returned when filtered by module');
    }
    console.log('✅ Scenario 25 PASS');

    // -------------------------------------------------------------
    // SCENARIO 26: Cross-Entity Global Intelligence Search
    // -------------------------------------------------------------
    console.log('Running Scenario 26: Cross-Entity Global Intelligence Search...');
    const searchRes = await request('GET', `/api/intelligence/search?q=${criticalZone.name}`, undefined, adminToken);
    assert.strictEqual(searchRes.status, 200, 'Search returns 200');
    assert.ok(searchRes.body.data.totalMatches >= 1, 'Search finds matches for created zone');
    assert.ok(Array.isArray(searchRes.body.data.results), 'Search results is array');
    const hasZoneMatch = searchRes.body.data.results.some(
      (r: any) => r.entityType === 'ZONE' && r.referenceId === criticalZone.zoneId,
    );
    assert.ok(hasZoneMatch, 'Zone found in search results');
    console.log('✅ Scenario 26 PASS');

    // -------------------------------------------------------------
    // SCENARIO 27: Alert Operational Lineage Detail
    // -------------------------------------------------------------
    console.log('Running Scenario 27: Alert Operational Lineage Detail...');
    const alertDetail = await request('GET', `/api/intelligence/alerts/ALT-CRIT-${testSuffix}`, undefined, adminToken);
    assert.strictEqual(alertDetail.status, 200, 'Alert detail returns 200');
    assert.strictEqual(alertDetail.body.data.alert.alertId, `ALT-CRIT-${testSuffix}`);
    assert.ok(alertDetail.body.data.zone, 'Zone linked in alert detail');
    assert.strictEqual(alertDetail.body.data.zone.zoneId, criticalZone.zoneId);
    console.log('✅ Scenario 27 PASS');

    // -------------------------------------------------------------
    // SCENARIO 28: Mining Lease Intelligence Lineage
    // -------------------------------------------------------------
    console.log('Running Scenario 28: Mining Lease Intelligence Lineage...');
    const leaseDetail = await request('GET', `/api/intelligence/leases/AUTH-${testSuffix}`, undefined, adminToken);
    assert.strictEqual(leaseDetail.status, 200, 'Lease detail returns 200');
    assert.strictEqual(leaseDetail.body.data.lease.permitNumber, `TN-MINING-${testSuffix}`);
    assert.ok(Array.isArray(leaseDetail.body.data.ePasses), 'Linked e-passes returned');
    assert.ok(leaseDetail.body.data.ePasses.length >= 1, 'At least 1 linked e-pass');
    console.log('✅ Scenario 28 PASS');

    // -------------------------------------------------------------
    // SCENARIO 29: Vehicle & Transport Intelligence Lineage
    // -------------------------------------------------------------
    console.log('Running Scenario 29: Vehicle & Transport Intelligence Lineage...');
    const epassDetail = await request('GET', `/api/intelligence/epasses/EPASS-1-${testSuffix}`, undefined, adminToken);
    assert.strictEqual(epassDetail.status, 200, 'E-Pass detail returns 200');
    assert.strictEqual(epassDetail.body.data.ePass.passNumber, `EPASS-1-${testSuffix}`);
    assert.ok(epassDetail.body.data.authorization, 'Authorization linked');
    assert.ok(Array.isArray(epassDetail.body.data.checkpointPassages), 'Checkpoint passages returned');
    assert.ok(epassDetail.body.data.checkpointPassages.length >= 1, 'At least 1 checkpoint passage');
    console.log('✅ Scenario 29 PASS');

    // -------------------------------------------------------------
    // SCENARIO 30: Active Baseline and Evidence Dossier Correlation Linkage
    // -------------------------------------------------------------
    console.log('Running Scenario 30: Active Baseline and Evidence Dossier Correlation Linkage...');
    assert.ok(corrRes.body.data.zone.boundary !== undefined, 'Zone boundary is included in correlation');
    assert.ok(Array.isArray(corrRes.body.data.evidenceDossiers), 'Evidence dossiers array returned');
    assert.strictEqual(corrRes.body.data.disclaimer, disclaimerExpected, 'Disclaimer verified');
    console.log('✅ Scenario 30 PASS');

    console.log('\n================================================================');
    console.log('🎉 MODULE M13: ALL 30 TEST SCENARIOS PASSED PERFECTLY (100%)');
    console.log('================================================================\n');
  } finally {
    // Clean up test records created for M13 test
    try {
      await Zone.deleteMany({ zoneId: { $in: [`ZONE-CRIT-${testSuffix}`, `ZONE-HIGH-${testSuffix}`, `ZONE-NORM-${testSuffix}`] } });
      await SatelliteMetadata.deleteMany({ imageId: `SAT-M13-${testSuffix}` });
      await ChangeDetectionModel.deleteMany({ changeId: `CD-M13-${testSuffix}` });
      await AlertModel.deleteMany({ alertId: { $in: [`ALT-CRIT-${testSuffix}`, `ALT-HIGH-${testSuffix}`] } });
      await MiningAuthorizationModel.deleteMany({ authorizationId: `AUTH-${testSuffix}` });
      await EPassModel.deleteMany({ passNumber: `EPASS-1-${testSuffix}` });
      await CheckpointLogModel.deleteMany({ logId: `CPLOG-1-${testSuffix}` });
      await ReconciliationReportModel.deleteMany({ reconciliationId: `RECON-M13-${testSuffix}` });
      await EnforcementCaseModel.deleteMany({ caseId: `CASE-M13-${testSuffix}` });
      await User.deleteMany({ email: { $in: [`superadmin_${testSuffix}@forest.tn.gov.in`, `unauth_${testSuffix}@forest.tn.gov.in`] } });
      console.log('🧹 Test data successfully cleaned up.');
    } catch (cleanupErr) {
      console.warn('Test cleanup warning:', cleanupErr);
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

if (process.argv[1]?.endsWith('m13-intelligence-dashboard.test.ts')) {
  runM13TestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ M13 Test failed:', err);
      process.exit(1);
    });
}
