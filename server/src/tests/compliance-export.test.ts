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
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ComplianceExportService } from '../services/ComplianceExportService.js';
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
  VehicleStatus,
  DriverVerificationStatus,
  EPassStatus,
  CheckpointStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
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

async function runTests() {
  console.log('================================================================');
  console.log('🧪 PHASE 11.3: STATUTORY COMPLIANCE EXPORT API UNIT & REST TESTS');
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

  const exportService = new ComplianceExportService();

  try {
    // -------------------------------------------------------------------------
    // Gate 1: Setup Multi-Module Environment
    // -------------------------------------------------------------------------
    console.log('▶ Gate 1: Creating statutory zones, permits, alerts, cases, and logs...');

    const testPassword = await hashPassword('TestPass@123');
    const officerEmail = `statutory_officer_${Date.now()}@forest.tn.gov.in`;

    const officer = await User.create({
      name: 'Dr. V. Murugesan IFS',
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
    assert.strictEqual(loginRes.status, 200);
    const authToken = loginRes.body.data.token;

    // Zone 1: Kolli Hills Reserve (Protected, Disturbed)
    const zoneProtected = await Zone.create({
      zoneId: `ZONE-STAT-PROT-${Date.now()}`,
      name: 'Kolli Hills Evergreen Reserve',
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.3, 11.2],
            [78.4, 11.2],
            [78.4, 11.3],
            [78.3, 11.3],
            [78.3, 11.2],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [78.35, 11.25] },
      areaHectares: 350.0,
      createdBy: officer._id,
    });

    // Zone 2: Namakkal Commercial Lease (Commercial Mining Zone)
    const zoneCommercial = await Zone.create({
      zoneId: `ZONE-STAT-COMM-${Date.now()}`,
      name: 'Namakkal Quartz Lease Site 1',
      category: ZoneCategory.COMMERCIAL_LEASE,
      status: ZoneStatus.PROTECTED,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.1, 11.1],
            [78.2, 11.1],
            [78.2, 11.2],
            [78.1, 11.2],
            [78.1, 11.1],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [78.15, 11.15] },
      areaHectares: 85.0,
      createdBy: officer._id,
    });

    // Mining Authorization on Zone 2
    const auth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-STAT-${Date.now()}`,
      permitNumber: `TN-MIN-STAT-${Date.now()}`,
      zoneId: zoneCommercial._id,
      lesseeName: 'Tamil Nadu Quartz & Minerals Co',
      mineralType: 'Quartz',
      permittedWeightTonnes: 15000,
      remainingQuota: 12500,
      status: MiningAuthorizationStatus.ACTIVE,
      validFrom: new Date(Date.now() - 60 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 180 * 24 * 3600 * 1000),
      createdBy: officer._id,
    });

    // Change Detection in Zone 1 (Illegal Disturbance)
    const changeId = `CHANGE-STAT-${Date.now()}`;
    const changeDoc = await ChangeDetectionModel.create({
      changeId,
      zoneId: zoneProtected._id,
      observationId: new Types.ObjectId(),
      baselineId: new Types.ObjectId(),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      detectedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      zoneArea: 350.0,
      changedArea: 2.85,
      affectedAreaPercentage: 0.81,
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.PIXEL_MASK,
      threshold2Crossed: true,
      threshold5Crossed: true,
      threshold10Crossed: false,
      highestThresholdCrossed: 5,
      severity: AlertSeverity.HIGH,
      evidenceStrength: 88,
      evidenceBreakdown: {
        magnitudeScore: 88,
        dataQualityScore: 92,
        temporalConsistencyScore: 85,
        crossSensorScore: 80,
        totalEvidenceScore: 88,
        explanation: 'High confidence forest canopy loss detected in reserve forest compartment.',
      },
      categories: [ChangeCategory.VEGETATION_LOSS, ChangeCategory.BARE_SOIL_EXPOSURE],
      changeIndicators: { ndviDelta: -0.28 },
      crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
      temporalConsistency: 'HIGH',
      explanation: 'High confidence forest canopy loss detected in reserve forest compartment.',
      alertGenerated: true,
    });

    // Alert for the change detection
    await AlertModel.create({
      alertId: `ALERT-STAT-${Date.now()}`,
      zoneId: zoneProtected._id,
      changeDetectionId: changeDoc._id,
      detectedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      affectedAreaPercentage: 0.81,
      highestThresholdCrossed: 5,
      thresholdsCrossed: [2, 5],
      severity: AlertSeverity.HIGH,
      evidenceStrength: 88,
      calculationMode: ProcessingMode.REAL,
      sensorType: SensorType.OPTICAL,
      evidenceSources: [SensorType.OPTICAL],
      categories: [ChangeCategory.VEGETATION_LOSS],
      explanation: 'Forest canopy degradation alert triggered by Sentinel-2 NDVI change.',
      status: AlertStatus.CONFIRMED,
    });

    // Enforcement Case with formal penalty
    const caseId = `CASE-STAT-${Date.now()}`;
    await EnforcementCaseModel.create({
      caseId,
      title: 'Illegal Commercial Quarrying Incursion in Kolli Hills Reserve',
      description: 'Extensive mechanized clearing and unpermitted stone extraction inside reserve forest.',
      severity: CaseSeverity.CRITICAL,
      caseType: CaseType.UNRECORDED_EXTRACTION,
      status: CaseStatus.UNDER_INVESTIGATION,
      zoneId: zoneProtected._id,
      zoneName: zoneProtected.name,
      assignedOfficerId: officer._id,
      assignedOfficerName: officer.name,
      investigationFindings: ['Heavy machinery operational outside any authorized lease zone.'],
      enforcementAction: {
        actionType: EnforcementActionType.PENALTY_LEVIED,
        actionDetails: 'Statutory environmental restoration penalty imposed under MMDR Act Sec 21.',
        actionDate: new Date(),
        penaltyAmountInr: 250000,
        officialOrderReference: 'TN-FOR-ENF-2026-042',
        issuedBy: officer._id,
      },
      createdBy: officer._id,
    });

    console.log('  ✔ Statutory multi-module records established');

    // -------------------------------------------------------------------------
    // Gate 2: Generate Compliance Report in JSON
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 2: Generating Compliance Report DTO...');

    const reportDto = await exportService.generateComplianceReport(
      {
        startDate: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        endDate: new Date().toISOString(),
      },
      { id: officer._id.toString(), name: officer.name },
    );

    assert.ok(reportDto.reportId.startsWith('COMPL-'));
    assert.strictEqual(reportDto.jurisdiction, 'Tamil Nadu Forest & Mining Enforcement');
    assert.ok(reportDto.statutoryActReference.includes('Tamil Nadu Forest Act 1882'));
    assert.ok(reportDto.summaryMetrics.totalMonitoredZones >= 2);
    assert.ok(reportDto.summaryMetrics.totalEnvironmentalAlerts >= 1);
    assert.ok(reportDto.summaryMetrics.criticalAlertsCount >= 1);
    assert.ok(reportDto.summaryMetrics.totalDisturbedAreaHectares >= 2.8);
    assert.ok(reportDto.summaryMetrics.totalAuthorizedMiningLeases >= 1);
    assert.ok(reportDto.summaryMetrics.penaltiesLeviedInr >= 250000);

    // Verify Zone Compliance Matrix
    const protZoneSummary = reportDto.zoneComplianceSummaries.find(
      (z) => z.zoneId === zoneProtected.zoneId,
    );
    assert.ok(protZoneSummary);
    assert.strictEqual(protZoneSummary.complianceStatus, 'BREACH');
    assert.strictEqual(protZoneSummary.criticalAlertsCount, 1);
    assert.ok(protZoneSummary.disturbedAreaHectares >= 2.8);

    // Verify Statutory Violations
    const violation = reportDto.statutoryViolations.find((v) => v.caseNumber === caseId);
    assert.ok(violation);
    assert.strictEqual(violation.severity, CaseSeverity.CRITICAL);
    assert.strictEqual(violation.penaltyAmountInr, 250000);
    assert.ok(violation.statutoryReference.includes('MMDR Act 1957'));

    // Verify Enforcement Actions
    const action = reportDto.enforcementActionsSummary.find((a) => a.caseNumber === caseId);
    assert.ok(action);
    assert.strictEqual(action.actionType, EnforcementActionType.PENALTY_LEVIED);
    assert.strictEqual(action.penaltyAmountInr, 250000);
    assert.strictEqual(action.officialOrderReference, 'TN-FOR-ENF-2026-042');

    console.log('  ✔ Ground-truth compliance report JSON verified');

    // -------------------------------------------------------------------------
    // Gate 3: Generate Compliance Report in RFC 4180 CSV
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 3: Generating RFC 4180 compliant CSV export...');

    const csvOutput = exportService.generateComplianceCsv(reportDto);

    assert.ok(csvOutput.includes('STATUTORY COMPLIANCE & ENVIRONMENTAL AUDIT REPORT') || csvOutput.includes('Statutory Compliance Report'));
    assert.ok(csvOutput.includes('--- EXECUTIVE SUMMARY METRICS ---'));
    assert.ok(csvOutput.includes('--- ZONE COMPLIANCE MATRIX ---'));
    assert.ok(csvOutput.includes('--- STATUTORY VIOLATIONS & ENFORCEMENT CASES ---'));
    assert.ok(csvOutput.includes('--- RECORDED OFFICIAL ENFORCEMENT ACTIONS ---'));
    assert.ok(csvOutput.includes('Total Penalties Levied (INR)'));
    assert.ok(csvOutput.includes('250000'));
    assert.ok(csvOutput.includes('TN-FOR-ENF-2026-042'));
    assert.ok(csvOutput.includes('Kolli Hills Evergreen Reserve'));

    console.log('  ✔ RFC 4180 CSV export generated with all sections intact');

    // -------------------------------------------------------------------------
    // Gate 4: Filter by Zone
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 4: Testing compliance report zone filtering...');

    const filteredReport = await exportService.generateComplianceReport({
      zoneId: zoneCommercial._id.toString(),
    });

    assert.strictEqual(filteredReport.zoneComplianceSummaries.length, 1);
    assert.strictEqual(filteredReport.zoneComplianceSummaries[0].zoneId, zoneCommercial.zoneId);
    assert.strictEqual(filteredReport.summaryMetrics.totalEnvironmentalAlerts, 0);
    console.log('  ✔ Zone filtering verified');

    // -------------------------------------------------------------------------
    // Gate 5: REST API Endpoint (GET /api/reports/compliance?format=json)
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 5: Testing REST API GET /api/reports/compliance (JSON)...');

    const apiJsonRes = await request('GET', '/api/reports/compliance?format=json', undefined, authToken);
    assert.strictEqual(apiJsonRes.status, 200);
    assert.strictEqual(apiJsonRes.body.success, true);
    assert.ok(apiJsonRes.body.data.summaryMetrics);
    console.log('  ✔ GET /api/reports/compliance (JSON) verified');

    // -------------------------------------------------------------------------
    // Gate 6: REST API Endpoint (GET /api/reports/compliance?format=csv)
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 6: Testing REST API GET /api/reports/compliance (CSV)...');

    const apiCsvRes = await request('GET', '/api/reports/compliance?format=csv', undefined, authToken);
    assert.strictEqual(apiCsvRes.status, 200);
    assert.ok(apiCsvRes.headers.get('content-type')?.includes('text/csv'));
    assert.ok(apiCsvRes.headers.get('content-disposition')?.includes('attachment; filename='));
    assert.ok(typeof apiCsvRes.body === 'string');
    assert.ok(apiCsvRes.body.includes('EXECUTIVE SUMMARY METRICS'));
    console.log('  ✔ GET /api/reports/compliance (CSV download) verified');

    console.log('\n================================================================');
    console.log('✅ ALL PHASE 11.3 STATUTORY COMPLIANCE EXPORT TESTS PASSED (6/6)');
    console.log('================================================================\n');
  } finally {
    if (server) {
      server.close();
    }
    // Cleanup
    await EnforcementCaseModel.deleteMany({ caseId: { $regex: '^CASE-STAT-' } });
    await AlertModel.deleteMany({ alertId: { $regex: '^ALERT-STAT-' } });
    await ChangeDetectionModel.deleteMany({ changeId: { $regex: '^CHANGE-STAT-' } });
    await MiningAuthorizationModel.deleteMany({ authorizationId: { $regex: '^AUTH-STAT-' } });
    await Zone.deleteMany({ zoneId: { $regex: '^ZONE-STAT-' } });
    await User.deleteMany({ email: { $regex: '^statutory_officer_' } });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ Phase 11.3 test failure:', err);
  process.exit(1);
});
