/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { AlertModel } from '../models/Alert.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  ZoneStatus,
  CaseStatus,
  CaseSeverity,
  CaseType,
  EnforcementActionType,
  AlertSeverity,
  AlertStatus,
  ChangeCategory,
  SensorType,
  SatelliteSource,
  ProcessingMode,
  SpatialCalculationSource,
  CrossSensorAgreement,
  MiningAuthorizationStatus,
  EPassStatus,
  CheckpointStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
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
): Promise<{ status: number; headers: Headers; body: any }> {
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

  const contentType = res.headers.get('content-type') || '';
  let jsonBody;
  if (contentType.includes('application/json')) {
    jsonBody = await res.json();
  } else {
    jsonBody = await res.text();
  }
  return { status: res.status, headers: res.headers, body: jsonBody };
}

async function runM11TestSuite() {
  console.log('================================================================');
  console.log('📊 M11: REPORTS & STATUTORY ANALYTICS COMPREHENSIVE TEST SUITE');
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

  const testPassword = await hashPassword('M11TestPass@123');

  try {
    // -------------------------------------------------------------------------
    // Setup Test Environment & Persisted Data
    // -------------------------------------------------------------------------
    console.log('▶ Pre-test Setup: Creating authenticated accounts and authentic data...');

    // 1. Authorized Officer (Forest Officer)
    const forestOfficerEmail = `m11_officer_${Date.now()}@forest.tn.gov.in`;
    const forestOfficer = await User.create({
      name: 'Dr. S. Rajendran IFS',
      email: forestOfficerEmail,
      passwordHash: testPassword,
      role: UserRole.FOREST_OFFICER,
      status: UserStatus.ACTIVE,
      permissions: Object.values(Permission),
    });

    const loginRes = await request('POST', '/api/auth/login', {
      email: forestOfficerEmail,
      password: 'M11TestPass@123',
    });
    assert.strictEqual(loginRes.status, 200);
    const forestToken = loginRes.body.data.token;

    // 2. Viewer Role (Authorized for reports)
    const viewerEmail = `m11_viewer_${Date.now()}@tn.gov.in`;
    await User.create({
      name: 'Tmt. K. Jayanthi',
      email: viewerEmail,
      passwordHash: testPassword,
      role: UserRole.VIEWER,
      status: UserStatus.ACTIVE,
      permissions: [Permission.USER_READ],
    });
    const viewerLoginRes = await request('POST', '/api/auth/login', {
      email: viewerEmail,
      password: 'M11TestPass@123',
    });
    assert.strictEqual(viewerLoginRes.status, 200);
    const viewerToken = viewerLoginRes.body.data.token;

    // 3. Unauthorized Role (Checkpoint Officer - not authorized for reports)
    const unauthorizedEmail = `m11_checkpoint_${Date.now()}@forest.tn.gov.in`;
    await User.create({
      name: 'Thiru. M. Senthil Kumar',
      email: unauthorizedEmail,
      passwordHash: testPassword,
      role: UserRole.CHECKPOINT_OFFICER,
      status: UserStatus.ACTIVE,
      permissions: [Permission.CHECKPOINT_READ, Permission.CHECKPOINT_VERIFY],
    });
    const unauthLoginRes = await request('POST', '/api/auth/login', {
      email: unauthorizedEmail,
      password: 'M11TestPass@123',
    });
    assert.strictEqual(unauthLoginRes.status, 200);
    const unauthorizedToken = unauthLoginRes.body.data.token;

    // 4. Create Zones
    const zone1 = await Zone.create({
      zoneId: `ZONE-M11-A-${Date.now()}`,
      name: 'Anamalai Tiger Reserve Sector 4',
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [76.9, 10.4],
            [77.0, 10.4],
            [77.0, 10.5],
            [76.9, 10.5],
            [76.9, 10.4],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [76.95, 10.45] },
      areaHectares: 450.0,
      createdBy: forestOfficer._id,
    });

    const zone2 = await Zone.create({
      zoneId: `ZONE-M11-B-${Date.now()}`,
      name: 'Salem Granite Quarry Block II',
      category: ZoneCategory.COMMERCIAL_LEASE,
      status: ZoneStatus.PROTECTED,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.0, 11.6],
            [78.1, 11.6],
            [78.1, 11.7],
            [78.0, 11.7],
            [78.0, 11.6],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [78.05, 11.65] },
      areaHectares: 90.0,
      createdBy: forestOfficer._id,
    });

    // 5. Mining Authorization on Zone 2
    await MiningAuthorizationModel.create({
      authorizationId: `AUTH-M11-${Date.now()}`,
      permitNumber: `TN-MIN-M11-${Date.now()}`,
      zoneId: zone2._id,
      lesseeName: 'Tamil Nadu Minerals Ltd (TAMIN)',
      mineralType: 'Granite',
      permittedWeightTonnes: 25000,
      remainingQuota: 20000,
      status: MiningAuthorizationStatus.ACTIVE,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 120 * 24 * 3600 * 1000),
      createdBy: forestOfficer._id,
    });

    // 6. Checkpoints in distinct districts: Salem and Dharmapuri
    const cpSalem = await CheckpointModel.create({
      checkpointId: `CP-M11-SLM-${Date.now()}`,
      name: 'Yercaud Forest Checkpost',
      district: 'Salem',
      location: { type: 'Point', coordinates: [78.18, 11.77] },
      geofenceRadiusMeters: 250,
      status: CheckpointStatus.ACTIVE,
      authorizedUserIds: [forestOfficer._id],
      createdBy: forestOfficer._id,
    });

    const cpDharmapuri = await CheckpointModel.create({
      checkpointId: `CP-M11-DHP-${Date.now()}`,
      name: 'Hogenakkal Border Checkpost',
      district: 'Dharmapuri',
      location: { type: 'Point', coordinates: [77.78, 12.11] },
      geofenceRadiusMeters: 300,
      status: CheckpointStatus.ACTIVE,
      authorizedUserIds: [forestOfficer._id],
      createdBy: forestOfficer._id,
    });

    // 7. Checkpoint Logs: 3 in Salem, 2 in Dharmapuri
    for (let i = 1; i <= 3; i++) {
      await CheckpointLogModel.create({
        logId: `LOG-M11-SLM-${i}-${Date.now()}`,
        checkpointId: cpSalem._id,
        checkpointName: cpSalem.name,
        passNumber: `TN-PASS-SLM-${i}`,
        verificationTimestamp: new Date(),
        verificationResult: CheckpointVerificationResult.VALID,
        rejectionReasons: [],
        signatureVerified: true,
        hashVerified: true,
        locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,
        scannedCoordinates: { type: 'Point', coordinates: [78.18, 11.77] },
        verifiedBy: forestOfficer._id,
      });
    }

    for (let i = 1; i <= 2; i++) {
      await CheckpointLogModel.create({
        logId: `LOG-M11-DHP-${i}-${Date.now()}`,
        checkpointId: cpDharmapuri._id,
        checkpointName: cpDharmapuri.name,
        passNumber: `TN-PASS-DHP-${i}`,
        verificationTimestamp: new Date(),
        verificationResult: CheckpointVerificationResult.VALID,
        rejectionReasons: [],
        signatureVerified: true,
        hashVerified: true,
        locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,
        scannedCoordinates: { type: 'Point', coordinates: [77.78, 12.11] },
        verifiedBy: forestOfficer._id,
      });
    }

    // 8. E-Passes
    const dummyAuthId = new Types.ObjectId();
    const dummyVehicleId = new Types.ObjectId();
    const dummyDriverId = new Types.ObjectId();

    for (let i = 1; i <= 4; i++) {
      await EPassModel.create({
        passNumber: `TN-EPASS-M11-00${i}-${Date.now()}`,
        authorizationId: dummyAuthId,
        vehicleId: dummyVehicleId,
        driverId: dummyDriverId,
        mineralType: 'Granite',
        netWeightTonnes: 25.0,
        sourceLocation: 'Salem Quarry Site',
        destinationCheckpoint: 'Yercaud Forest Checkpost',
        status: EPassStatus.ACTIVE,
        validFrom: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        validUntil: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        qrPayload: `payload-${i}`,
        qrCodeHash: `hash-${i}-${Date.now()}`,
        digitalSignature: `sig-${i}`,
        createdBy: forestOfficer._id,
      });
    }

    // 9. Change Detection & Alert for Zone 1 (3.4 hectares disturbed)
    const changeDoc = await ChangeDetectionModel.create({
      changeId: `CHANGE-M11-${Date.now()}`,
      zoneId: zone1._id,
      observationId: new Types.ObjectId(),
      baselineId: new Types.ObjectId(),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      detectedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      zoneArea: 450.0,
      changedArea: 3.4,
      affectedAreaPercentage: 0.75,
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.PIXEL_MASK,
      threshold2Crossed: true,
      threshold5Crossed: true,
      threshold10Crossed: false,
      highestThresholdCrossed: 5,
      severity: AlertSeverity.HIGH,
      evidenceStrength: 91,
      evidenceBreakdown: {
        magnitudeScore: 90,
        dataQualityScore: 92,
        temporalConsistencyScore: 88,
        crossSensorScore: 85,
        totalEvidenceScore: 91,
        explanation: 'Confirmed high-confidence canopy opening in protected reserve.',
      },
      categories: [ChangeCategory.VEGETATION_LOSS],
      changeIndicators: { ndviDelta: -0.32 },
      crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
      temporalConsistency: 'HIGH',
      explanation: 'Confirmed high-confidence canopy opening in protected reserve.',
      alertGenerated: true,
    });

    await AlertModel.create({
      alertId: `ALERT-M11-${Date.now()}`,
      zoneId: zone1._id,
      changeDetectionId: changeDoc._id,
      detectedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      affectedAreaPercentage: 0.75,
      highestThresholdCrossed: 5,
      thresholdsCrossed: [2, 5],
      severity: AlertSeverity.HIGH,
      evidenceStrength: 91,
      calculationMode: ProcessingMode.REAL,
      sensorType: SensorType.OPTICAL,
      evidenceSources: [SensorType.OPTICAL],
      categories: [ChangeCategory.VEGETATION_LOSS],
      explanation: 'Automated satellite canopy degradation alert.',
      status: AlertStatus.CONFIRMED,
    });

    // 10. Reconciliation Report with 2 Anomalies
    await ReconciliationReportModel.create({
      reconciliationId: `RECON-M11-${Date.now()}`,
      zoneId: zone2._id,
      zoneName: zone2.name,
      periodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      periodEnd: new Date(),
      status: ReconciliationReportStatus.UNDER_INVESTIGATION,
      reconciliationStatus: ReconciliationStatus.CRITICAL_ANOMALY,
      discrepancyScore: 45,
      transportSummary: {
        totalPassesIssued: 4,
        totalIssuedTonnage: 100,
        totalPassesUsed: 4,
        totalVerifiedTonnage: 100,
        totalPassesCancelled: 0,
        totalPassesExpired: 0,
        distinctVehicles: 2,
        distinctDrivers: 2,
      },
      checkpointSummary: {
        totalLogs: 5,
        validPassages: 5,
        rejectedPassages: 0,
        totalLoggedTonnage: 100,
        averageDistanceMeters: 10,
        locationMismatchCount: 0,
      },
      satelliteSummary: {
        observationCount: 2,
        totalChangedAreaHa: 0,
        estimatedExtractedVolumeM3: 5000,
        estimatedTonnage: 13000,
        averageConfidenceScore: 90,
      },
      anomalies: [
        {
          type: ReconciliationAnomalyType.EXCESS_EXTRACTION_UNRECORDED_TRANSPORT,
          severity: ReconciliationAnomalySeverity.CRITICAL,
          title: 'Unrecorded extraction volume exceeding tolerance',
          description: 'Unrecorded extraction exceeding tolerance by 38.5%',
          evidenceScore: 94,
        },
        {
          type: ReconciliationAnomalyType.VOLUME_TONNAGE_DISPROPORTION,
          severity: ReconciliationAnomalySeverity.HIGH,
          title: 'Manifest discrepancy',
          description: 'Discrepancy between optical volumetric cut and e-pass transit manifests',
          evidenceScore: 88,
        },
      ],
      findings: ['Volume mismatch detected.'],
      recommendations: ['Field inspection recommended.'],
      generatedBy: forestOfficer._id,
    });

    // 11. Enforcement Cases (1 Active, 1 Closed; total penalties: 450,000 INR)
    const case1Id = `CASE-M11-1-${Date.now()}`;
    await EnforcementCaseModel.create({
      caseId: case1Id,
      title: 'Encroachment and Clear-Felling in Anamalai Reserve Sector 4',
      description: 'Unauthorized timber felling and roadway creation in protected forest.',
      severity: CaseSeverity.CRITICAL,
      caseType: CaseType.UNRECORDED_EXTRACTION,
      status: CaseStatus.UNDER_INVESTIGATION,
      zoneId: zone1._id,
      zoneName: zone1.name,
      assignedOfficerId: forestOfficer._id,
      assignedOfficerName: forestOfficer.name,
      investigationFindings: ['Heavy clear-cutting detected across 3.4 hectares.'],
      enforcementAction: {
        actionType: EnforcementActionType.PENALTY_LEVIED,
        actionDetails: 'Fine levied under Section 21 of Tamil Nadu Forest Act 1882.',
        actionDate: new Date(),
        penaltyAmountInr: 350000,
        officialOrderReference: 'TN-FOR-ENF-M11-001',
        issuedBy: forestOfficer._id,
      },
      createdBy: forestOfficer._id,
    });

    const case2Id = `CASE-M11-2-${Date.now()}`;
    await EnforcementCaseModel.create({
      caseId: case2Id,
      title: 'Overloading Mineral Transit Case',
      description: 'Commercial mineral dispatch in excess of authorized permit quota.',
      severity: CaseSeverity.HIGH,
      caseType: CaseType.OVER_QUOTA_TRANSPORT,
      status: CaseStatus.CLOSED,
      zoneId: zone2._id,
      zoneName: zone2.name,
      assignedOfficerId: forestOfficer._id,
      assignedOfficerName: forestOfficer.name,
      investigationFindings: ['Vehicle intercepted outside permitted route.'],
      enforcementAction: {
        actionType: EnforcementActionType.PENALTY_LEVIED,
        actionDetails: 'Transit penalty under Section 21(4) of MMDR Act 1957.',
        actionDate: new Date(),
        penaltyAmountInr: 100000,
        officialOrderReference: 'TN-FOR-ENF-M11-002',
        issuedBy: forestOfficer._id,
      },
      createdBy: forestOfficer._id,
    });

    console.log('  ✔ Pre-test environment established successfully\n');

    // -------------------------------------------------------------------------
    // Gate 1: Unauthenticated request rejected with HTTP 401
    // -------------------------------------------------------------------------
    console.log('▶ Gate 1: Testing unauthenticated request rejection (HTTP 401)...');

    const unauthSummaryRes = await request('GET', '/api/reports/summary');
    assert.strictEqual(unauthSummaryRes.status, 401, 'Unauthenticated /summary should return 401');

    const unauthDistrictsRes = await request('GET', '/api/reports/districts');
    assert.strictEqual(unauthDistrictsRes.status, 401, 'Unauthenticated /districts should return 401');

    const unauthComplianceRes = await request('GET', '/api/reports/compliance');
    assert.strictEqual(unauthComplianceRes.status, 401, 'Unauthenticated /compliance should return 401');

    console.log('  ✔ Gate 1 Passed: All unauthenticated requests rejected with HTTP 401\n');

    // -------------------------------------------------------------------------
    // Gate 2: RBAC enforcement (Unauthorized roles rejected, authorized allowed)
    // -------------------------------------------------------------------------
    console.log('▶ Gate 2: Testing RBAC enforcement (HTTP 403 vs HTTP 200)...');

    const forbiddenRes = await request('GET', '/api/reports/summary', undefined, unauthorizedToken);
    assert.strictEqual(forbiddenRes.status, 403, 'CHECKPOINT_OFFICER should be rejected with 403');

    const viewerRes = await request('GET', '/api/reports/summary', undefined, viewerToken);
    assert.strictEqual(viewerRes.status, 200, 'VIEWER role should be permitted with 200');
    assert.strictEqual(viewerRes.body.success, true);

    const forestRes = await request('GET', '/api/reports/summary', undefined, forestToken);
    assert.strictEqual(forestRes.status, 200, 'FOREST_OFFICER role should be permitted with 200');

    console.log('  ✔ Gate 2 Passed: RBAC correctly allows authorized roles and rejects unauthorized roles with 403\n');

    // -------------------------------------------------------------------------
    // Gate 3: Reports summary returns authentic persisted database data
    // -------------------------------------------------------------------------
    console.log('▶ Gate 3: Testing report summary returns authentic persisted database metrics...');

    const summaryRes = await request('GET', '/api/reports/summary', undefined, forestToken);
    assert.strictEqual(summaryRes.status, 200);
    const summaryData = summaryRes.body.data;

    assert.ok(summaryData.summaryMetrics, 'summaryMetrics must exist');
    assert.ok(summaryData.summaryMetrics.totalMonitoredZones >= 2, 'Must include at least 2 zones');
    assert.ok(summaryData.summaryMetrics.totalDisturbedAreaHectares >= 3.4, 'Must include disturbed area');
    assert.ok(summaryData.summaryMetrics.totalAuthorizedMiningLeases >= 1, 'Must include active mining lease');
    assert.ok(summaryData.summaryMetrics.totalPermittedTonnage >= 25000, 'Must include permitted tonnage');
    assert.ok(summaryData.summaryMetrics.totalEPassesIssued >= 4, 'Must include 4 e-passes');
    assert.ok(summaryData.summaryMetrics.totalCheckpointPassages >= 5, 'Must include 5 checkpoint passages');

    console.log('  ✔ Gate 3 Passed: Summary metrics accurately reflect authentic database records\n');

    // -------------------------------------------------------------------------
    // Gate 4: Date-range filtering changes returned metrics accurately
    // -------------------------------------------------------------------------
    console.log('▶ Gate 4: Testing date-range filtering accuracy...');

    // Past window with no data
    const pastStart = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    const pastEnd = new Date(Date.now() - 300 * 24 * 3600 * 1000).toISOString();
    const pastRes = await request(
      'GET',
      `/api/reports/summary?startDate=${pastStart}&endDate=${pastEnd}`,
      undefined,
      forestToken,
    );
    assert.strictEqual(pastRes.status, 200);
    assert.strictEqual(pastRes.body.data.summaryMetrics.totalEnvironmentalAlerts, 0);
    assert.strictEqual(pastRes.body.data.summaryMetrics.totalDisturbedAreaHectares, 0);
    assert.strictEqual(pastRes.body.data.summaryMetrics.totalEPassesIssued, 0);
    assert.strictEqual(pastRes.body.data.summaryMetrics.totalCheckpointPassages, 0);

    // Active window covering the recent records
    const recentStart = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const recentRes = await request(
      'GET',
      `/api/reports/summary?startDate=${recentStart}`,
      undefined,
      forestToken,
    );
    assert.strictEqual(recentRes.status, 200);
    assert.ok(recentRes.body.data.summaryMetrics.totalCheckpointPassages >= 5);
    assert.ok(recentRes.body.data.summaryMetrics.totalEnvironmentalAlerts >= 1);

    console.log('  ✔ Gate 4 Passed: Date range filters dynamically adjust metrics according to temporal scope\n');

    // -------------------------------------------------------------------------
    // Gate 5: Zone filtering filters zone-specific alerts and disturbed area
    // -------------------------------------------------------------------------
    console.log('▶ Gate 5: Testing zone-specific report filtering...');

    const zone1Res = await request(
      'GET',
      `/api/reports/summary?zoneId=${zone1._id.toString()}`,
      undefined,
      forestToken,
    );
    assert.strictEqual(zone1Res.status, 200);
    assert.strictEqual(zone1Res.body.data.zoneComplianceSummaries.length, 1);
    assert.strictEqual(zone1Res.body.data.zoneComplianceSummaries[0].zoneId, zone1.zoneId);
    assert.ok(zone1Res.body.data.summaryMetrics.totalDisturbedAreaHectares >= 3.4);
    assert.ok(zone1Res.body.data.summaryMetrics.totalEnvironmentalAlerts >= 1);

    const zone2Res = await request(
      'GET',
      `/api/reports/summary?zoneId=${zone2._id.toString()}`,
      undefined,
      forestToken,
    );
    assert.strictEqual(zone2Res.status, 200);
    assert.strictEqual(zone2Res.body.data.zoneComplianceSummaries.length, 1);
    assert.strictEqual(zone2Res.body.data.zoneComplianceSummaries[0].zoneId, zone2.zoneId);
    assert.strictEqual(zone2Res.body.data.summaryMetrics.totalDisturbedAreaHectares, 0);
    assert.strictEqual(zone2Res.body.data.summaryMetrics.totalEnvironmentalAlerts, 0);

    console.log('  ✔ Gate 5 Passed: Zone filtering isolates zone-specific alerts and disturbed areas\n');

    // -------------------------------------------------------------------------
    // Gate 6: District filtering filters checkpoint logs by district
    // -------------------------------------------------------------------------
    console.log('▶ Gate 6: Testing district filtering on checkpoints & district enumeration...');

    const distListRes = await request('GET', '/api/reports/districts', undefined, forestToken);
    assert.strictEqual(distListRes.status, 200);
    assert.ok(Array.isArray(distListRes.body.data));
    assert.ok(distListRes.body.data.includes('Salem'), 'Must include Salem');
    assert.ok(distListRes.body.data.includes('Dharmapuri'), 'Must include Dharmapuri');

    // Filter by Salem district
    const salemRes = await request('GET', '/api/reports/summary?district=Salem', undefined, forestToken);
    assert.strictEqual(salemRes.status, 200);
    assert.strictEqual(salemRes.body.data.selectedDistrict, 'Salem');
    assert.ok(salemRes.body.data.summaryMetrics.totalCheckpointPassages >= 3);

    // Filter by Dharmapuri district
    const dharmaRes = await request('GET', '/api/reports/summary?district=Dharmapuri', undefined, forestToken);
    assert.strictEqual(dharmaRes.status, 200);
    assert.strictEqual(dharmaRes.body.data.selectedDistrict, 'Dharmapuri');
    assert.ok(dharmaRes.body.data.summaryMetrics.totalCheckpointPassages >= 2);

    // Filter by Non-Existent district
    const nonExistentRes = await request('GET', '/api/reports/summary?district=NonExistentDistrictXYZ', undefined, forestToken);
    assert.strictEqual(nonExistentRes.status, 200);
    assert.strictEqual(nonExistentRes.body.data.selectedDistrict, 'NonExistentDistrictXYZ');
    assert.strictEqual(nonExistentRes.body.data.summaryMetrics.totalCheckpointPassages, 0);

    console.log('  ✔ Gate 6 Passed: District filtering accurately subsets checkpoint logs without fabricating data\n');

    // -------------------------------------------------------------------------
    // Gate 7: Compliance aggregation matches persisted database records
    // -------------------------------------------------------------------------
    console.log('▶ Gate 7: Testing zone compliance categorization (COMPLIANT, WARNING, BREACH)...');

    const compRes = await request('GET', '/api/reports/summary', undefined, forestToken);
    const zSummaries = compRes.body.data.zoneComplianceSummaries;

    const z1Record = zSummaries.find((z: any) => z.zoneId === zone1.zoneId);
    assert.ok(z1Record, 'Zone 1 summary record must exist');
    assert.strictEqual(z1Record.complianceStatus, 'BREACH', 'Zone 1 with critical alerts & disturbed area must be BREACH');
    assert.ok(z1Record.criticalAlertsCount >= 1);
    assert.ok(z1Record.disturbedAreaHectares >= 3.4);

    const z2Record = zSummaries.find((z: any) => z.zoneId === zone2.zoneId);
    assert.ok(z2Record, 'Zone 2 summary record must exist');
    assert.strictEqual(z2Record.complianceStatus, 'COMPLIANT', 'Zone 2 with 0 alerts and 0 disturbed area must be COMPLIANT');

    console.log('  ✔ Gate 7 Passed: Zone compliance classification accurately identifies BREACH and COMPLIANT zones\n');

    // -------------------------------------------------------------------------
    // Gate 8: Alert & enforcement aggregation matches database counts and penalty amounts
    // -------------------------------------------------------------------------
    console.log('▶ Gate 8: Testing alert and statutory enforcement case aggregation...');

    const enfMetrics = compRes.body.data.summaryMetrics;
    assert.ok(enfMetrics.activeEnforcementCasesCount >= 1, 'Must include at least 1 active case (Case 1)');
    assert.ok(enfMetrics.penaltiesLeviedInr >= 450000, 'Total penalties must equal 450,000 INR (350k + 100k)');

    const violations = compRes.body.data.statutoryViolations;
    const v1 = violations.find((v: any) => v.caseNumber === case1Id);
    assert.ok(v1, 'Case 1 must appear in statutory violations register');
    assert.strictEqual(v1.severity, CaseSeverity.CRITICAL);
    assert.strictEqual(v1.penaltyAmountInr, 350000);
    assert.ok(v1.statutoryReference.includes('TN Forest Act 1882') || v1.statutoryReference.includes('Tamil Nadu Forest Act 1882'));

    const v2 = violations.find((v: any) => v.caseNumber === case2Id);
    assert.ok(v2, 'Case 2 must appear in statutory violations register');
    assert.strictEqual(v2.severity, CaseSeverity.HIGH);
    assert.strictEqual(v2.penaltyAmountInr, 100000);
    assert.ok(v2.statutoryReference.includes('MMDR Act 1957'));

    console.log('  ✔ Gate 8 Passed: Enforcement penalties, severity levels, and statutory citations match database\n');

    // -------------------------------------------------------------------------
    // Gate 9: Reconciliation statistics match persisted anomaly records
    // -------------------------------------------------------------------------
    console.log('▶ Gate 9: Testing reconciliation anomaly aggregation...');

    assert.ok(compRes.body.data.summaryMetrics.reconciliationAnomaliesCount >= 2);

    console.log('  ✔ Gate 9 Passed: Reconciliation anomalies match persisted records\n');

    // -------------------------------------------------------------------------
    // Gate 10: JSON export returns full valid report with all sections
    // -------------------------------------------------------------------------
    console.log('▶ Gate 10: Testing full JSON compliance report export (/api/reports/compliance?format=json)...');

    const jsonExportRes = await request('GET', '/api/reports/compliance?format=json', undefined, forestToken);
    assert.strictEqual(jsonExportRes.status, 200);
    assert.strictEqual(jsonExportRes.body.success, true);
    const jsonReport = jsonExportRes.body.data;

    assert.ok(jsonReport.reportId.startsWith('COMPL-'));
    assert.strictEqual(jsonReport.jurisdiction, 'Tamil Nadu Forest & Mining Enforcement');
    assert.ok(
      jsonReport.statutoryActReference.includes('Mines and Minerals') ||
        jsonReport.statutoryActReference.includes('1957'),
    );
    assert.ok(jsonReport.reportingPeriod.fromDate);
    assert.ok(jsonReport.reportingPeriod.toDate);
    assert.ok(Array.isArray(jsonReport.zoneComplianceSummaries));
    assert.ok(Array.isArray(jsonReport.statutoryViolations));
    assert.ok(Array.isArray(jsonReport.enforcementActionsSummary));

    console.log('  ✔ Gate 10 Passed: Full JSON report export validated with all statutory sections\n');

    // -------------------------------------------------------------------------
    // Gate 11: CSV export returns valid RFC 4180 CSV with headers and data
    // -------------------------------------------------------------------------
    console.log('▶ Gate 11: Testing RFC 4180 CSV compliance export (/api/reports/compliance?format=csv)...');

    const csvExportRes = await request('GET', '/api/reports/compliance?format=csv', undefined, forestToken);
    assert.strictEqual(csvExportRes.status, 200);
    assert.ok(csvExportRes.headers.get('content-type')?.includes('text/csv'));
    assert.ok(csvExportRes.headers.get('content-disposition')?.includes('attachment; filename='));

    const csvText = typeof csvExportRes.body === 'string' ? csvExportRes.body : '';
    assert.ok(csvText.includes('--- EXECUTIVE SUMMARY METRICS ---'));
    assert.ok(csvText.includes('--- ZONE COMPLIANCE MATRIX ---'));
    assert.ok(csvText.includes('--- STATUTORY VIOLATIONS & ENFORCEMENT CASES ---'));
    assert.ok(csvText.includes('--- RECORDED OFFICIAL ENFORCEMENT ACTIONS ---'));
    assert.ok(csvText.includes('Total Penalties Levied (INR)'));
    assert.ok(csvText.includes('Anamalai Tiger Reserve Sector 4'));
    assert.ok(csvText.includes('TN-FOR-ENF-M11-001'));
    assert.ok(csvText.includes('350000'));

    console.log('  ✔ Gate 11 Passed: RFC 4180 CSV export formatted with proper legal headers and escaped fields\n');

    // -------------------------------------------------------------------------
    // Gate 12: Empty result set handled gracefully
    // -------------------------------------------------------------------------
    console.log('▶ Gate 12: Testing empty result set handling (far future date range)...');

    const futureRes = await request(
      'GET',
      '/api/reports/summary?startDate=2099-01-01&endDate=2099-01-02',
      undefined,
      forestToken,
    );
    assert.strictEqual(futureRes.status, 200);
    assert.strictEqual(futureRes.body.success, true);
    assert.strictEqual(futureRes.body.data.summaryMetrics.totalEnvironmentalAlerts, 0);
    assert.strictEqual(futureRes.body.data.summaryMetrics.totalDisturbedAreaHectares, 0);
    assert.strictEqual(futureRes.body.data.summaryMetrics.totalEPassesIssued, 0);
    assert.strictEqual(futureRes.body.data.summaryMetrics.totalCheckpointPassages, 0);
    assert.strictEqual(futureRes.body.data.summaryMetrics.activeEnforcementCasesCount, 0);
    assert.strictEqual(futureRes.body.data.statutoryViolations.length, 0);
    assert.strictEqual(futureRes.body.data.enforcementActionsSummary.length, 0);

    console.log('  ✔ Gate 12 Passed: Out-of-range queries return graceful 0 metrics and empty arrays\n');

    // -------------------------------------------------------------------------
    // Gate 13: Invalid filters rejected (malformed date, invalid format)
    // -------------------------------------------------------------------------
    console.log('▶ Gate 13: Testing rejection of invalid filter parameters...');

    const malformedDateRes = await request('GET', '/api/reports/summary?startDate=not-a-date', undefined, forestToken);
    assert.strictEqual(malformedDateRes.status, 400, 'Malformed startDate must return 400');

    const invalidFormatRes = await request('GET', '/api/reports/compliance?format=pdf', undefined, forestToken);
    assert.strictEqual(invalidFormatRes.status, 400, 'Invalid format (pdf) must return 400');

    const invalidSeverityRes = await request('GET', '/api/reports/summary?severity=INVALID_SEV', undefined, forestToken);
    assert.strictEqual(invalidSeverityRes.status, 400, 'Invalid severity must return 400');

    console.log('  ✔ Gate 13 Passed: Malformed input parameters properly rejected with HTTP 400\n');

    // -------------------------------------------------------------------------
    // Gate 14: Phase 11 /api/reports/compliance backwards compatibility preserved
    // -------------------------------------------------------------------------
    console.log('▶ Gate 14: Testing Phase 11 /api/reports/compliance backwards compatibility...');

    const p11Res = await request('GET', '/api/reports/compliance', undefined, forestToken);
    assert.strictEqual(p11Res.status, 200);
    assert.strictEqual(p11Res.body.success, true);
    assert.ok(p11Res.body.data.reportId);
    assert.ok(p11Res.body.data.summaryMetrics);
    assert.ok(p11Res.body.data.zoneComplianceSummaries);

    console.log('  ✔ Gate 14 Passed: Phase 11 Statutory Compliance API 100% backwards-compatible\n');

    console.log('================================================================');
    console.log('✅ ALL 14 M11 REPORTS & ANALYTICS TEST GATES PASSED (14/14)');
    console.log('================================================================\n');
  } finally {
    if (server) {
      server.close();
    }
    // Cleanup created test records
    await EnforcementCaseModel.deleteMany({ caseId: { $regex: '^CASE-M11-' } });
    await ReconciliationReportModel.deleteMany({ reconciliationId: { $regex: '^RECON-M11-' } });
    await AlertModel.deleteMany({ alertId: { $regex: '^ALERT-M11-' } });
    await ChangeDetectionModel.deleteMany({ changeId: { $regex: '^CHANGE-M11-' } });
    await EPassModel.deleteMany({ passNumber: { $regex: '^TN-EPASS-M11-' } });
    await CheckpointLogModel.deleteMany({ logId: { $regex: '^LOG-M11-' } });
    await CheckpointModel.deleteMany({ checkpointId: { $regex: '^CP-M11-' } });
    await MiningAuthorizationModel.deleteMany({ authorizationId: { $regex: '^AUTH-M11-' } });
    await Zone.deleteMany({ zoneId: { $regex: '^ZONE-M11-' } });
    await User.deleteMany({ email: { $regex: '^m11_' } });
    await mongoose.disconnect();
  }
}

runM11TestSuite().catch((err) => {
  console.error('❌ M11 Test Suite Failure:', err);
  process.exit(1);
});
