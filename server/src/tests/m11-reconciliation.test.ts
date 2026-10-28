/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import assert from 'node:assert';
import { type Server } from 'node:http';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { Zone } from '../models/Zone.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { MiningExtractionEstimateModel } from '../models/MiningExtractionEstimate.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { reconciliationService } from '../services/ReconciliationService.js';
import {
  UserRole,
  Permission,
  ZoneCategory,
  ZoneStatus,
  ReconciliationStatus,
  ReconciliationReportStatus,
  ReconciliationAnomalyType,
  EPassStatus,
  MiningAuthorizationStatus,
  CheckpointStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
  VehicleType,
  VehicleStatus,
  DriverVerificationStatus,
  SensorType,
  SatelliteSource,
  ProcessingMode,
  SpatialCalculationSource,
  AlertSeverity,
  ChangeCategory,
  CrossSensorAgreement,
  MarkedAreaType,
  MiningClassification,
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

async function runM11TestSuite() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING MODULE M11: MINING & TRANSPORT RECONCILIATION TEST SUITE');
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

  const testSuffix = Date.now();
  let adminToken = '';
  let miningOfficerToken = '';
  let viewerToken = '';
  let adminUserId = '';

  let zone1Id = '';
  let protectedZoneId = '';
  let auth1Id = '';
  let vehicle1Id = '';
  let driver1Id = '';
  let checkpoint1Id = '';

  try {
    // -------------------------------------------------------------
    // Setup Test Users
    // -------------------------------------------------------------
    console.log('--- Setting up Test Users & Permissions ---');
    const pwdHash = await hashPassword('Password123!');

    const adminUser = await User.create({
      employeeId: `EMP-ADM-${testSuffix}`,
      name: `Admin Officer ${testSuffix}`,
      email: `admin_${testSuffix}@tnforest.gov.in`,
      passwordHash: pwdHash,
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
    });
    adminUserId = adminUser._id.toString();

    await User.create({
      employeeId: `EMP-MNG-${testSuffix}`,
      name: `Mining Officer ${testSuffix}`,
      email: `miningofficer_${testSuffix}@tnforest.gov.in`,
      passwordHash: pwdHash,
      role: UserRole.MINING_OFFICER,
      permissions: [Permission.EPASS_READ, Permission.EPASS_CREATE, Permission.RECONCILIATION_READ, Permission.RECONCILIATION_RUN],
    });

    await User.create({
      employeeId: `EMP-VIW-${testSuffix}`,
      name: `Viewer ${testSuffix}`,
      email: `viewer_${testSuffix}@tnforest.gov.in`,
      passwordHash: pwdHash,
      role: UserRole.VIEWER,
      permissions: [Permission.AREA_READ],
    });

    const adminLogin = await request('POST', '/api/auth/login', {
      email: `admin_${testSuffix}@tnforest.gov.in`,
      password: 'Password123!',
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login should succeed');
    adminToken = adminLogin.body.data.token;

    const miningLogin = await request('POST', '/api/auth/login', {
      email: `miningofficer_${testSuffix}@tnforest.gov.in`,
      password: 'Password123!',
    });
    assert.strictEqual(miningLogin.status, 200, 'Mining officer login should succeed');
    miningOfficerToken = miningLogin.body.data.token;

    const viewerLogin = await request('POST', '/api/auth/login', {
      email: `viewer_${testSuffix}@tnforest.gov.in`,
      password: 'Password123!',
    });
    assert.strictEqual(viewerLogin.status, 200, 'Viewer login should succeed');
    viewerToken = viewerLogin.body.data.token;

    // Setup Zones
    const zoneDoc1 = await Zone.create({
      zoneId: `ZONE-M11-1-${testSuffix}`,
      name: `Salem Granite Quarry Zone ${testSuffix}`,
      category: ZoneCategory.RESERVED_AREA,
      status: ZoneStatus.PROTECTED,
      district: 'Salem',
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.14, 11.66],
            [78.15, 11.66],
            [78.15, 11.67],
            [78.14, 11.67],
            [78.14, 11.66],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [78.145, 11.665] },
      areaHectares: 120.0,
      createdBy: adminUser._id,
    });
    zone1Id = zoneDoc1._id.toString();

    const protectedZoneDoc = await Zone.create({
      zoneId: `ZONE-M11-PROT-${testSuffix}`,
      name: `Mudumalai Core Sanctuary ${testSuffix}`,
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      district: 'Nilgiris',
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [76.5, 11.55],
            [76.52, 11.55],
            [76.52, 11.57],
            [76.5, 11.57],
            [76.5, 11.55],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [76.51, 11.56] },
      areaHectares: 250.0,
      createdBy: adminUser._id,
    });
    protectedZoneId = protectedZoneDoc._id.toString();

    // Setup Mining Authorization (1000 Tonnes)
    const authDoc1 = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-M11-1-${testSuffix}`,
      permitNumber: `TN-MIN-M11-${testSuffix}`,
      lesseeName: `Salem Granite Mining Ltd ${testSuffix}`,
      mineralType: 'Granite',
      permittedWeightTonnes: 1000.0,
      remainingQuota: 960.0,
      zoneId: zoneDoc1._id,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 60 * 24 * 3600 * 1000),
      status: MiningAuthorizationStatus.ACTIVE,
      createdBy: adminUser._id,
    });
    auth1Id = authDoc1._id.toString();

    // Setup Transport Fleet
    const company1 = await TransportCompanyModel.create({
      companyId: `TC-${testSuffix}`,
      registrationNumber: `TN-TC-M11-${testSuffix}`,
      companyName: `Salem Transport Logistics ${testSuffix}`,
      status: 'ACTIVE',
    });

    const vehicle1 = await VehicleModel.create({
      vehicleId: `VEH-M11-${testSuffix}`,
      registrationNumber: `TN-30-XY-${testSuffix.toString().slice(-4)}`,
      vehicleType: VehicleType.TRUCK,
      tareWeight: 10.0,
      grossVehicleWeight: 35.0,
      permittedCarryingCapacity: 25.0,
      transportCompanyId: company1._id,
      status: VehicleStatus.ACTIVE,
    });

    vehicle1Id = vehicle1._id.toString();

    const driver1 = await DriverModel.create({
      driverId: `DRV-${testSuffix}`,
      name: `K. Mani ${testSuffix}`,
      licenseNumber: `TN-DL-M11-${testSuffix}`,
      phone: '+91 9876543210',
      transportCompanyId: company1._id,
      verificationStatus: DriverVerificationStatus.VERIFIED,
    });
    driver1Id = driver1._id.toString();

    // Setup Checkpoint
    const checkpoint1 = await CheckpointModel.create({
      checkpointId: `CP-M11-${testSuffix}`,
      name: `Salem North Checkpoint ${testSuffix}`,
      district: 'Salem',
      location: { type: 'Point', coordinates: [78.145, 11.665] },
      geofenceRadiusMeters: 500,
      status: CheckpointStatus.ACTIVE,
    });
    checkpoint1Id = checkpoint1._id.toString();

    console.log('✅ Base infrastructure entities initialized successfully.');

    // -------------------------------------------------------------
    // Test 1: Compliant Scenario Reconciliation Run
    // -------------------------------------------------------------
    console.log('\n--- 1. Compliant Scenario Reconciliation ---');
    // Create 2 E-Passes (20 tonnes each, both USED)
    const pass1 = await EPassModel.create({
      passNumber: `EP-M11-01-${testSuffix}`,
      authorizationId: authDoc1._id,
      vehicleId: vehicle1._id,
      driverId: driver1._id,
      mineralType: 'Granite',
      sourceLocation: 'Salem Quarry 1',
      destinationCheckpoint: 'Salem North Checkpoint',
      netWeightTonnes: 20.0,
      status: EPassStatus.USED,
      validFrom: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      qrPayload: 'VALID_QR_1',
      qrCodeHash: 'HASH_1',
      digitalSignature: 'SIG_1',
    });

    const pass2 = await EPassModel.create({
      passNumber: `EP-M11-02-${testSuffix}`,
      authorizationId: authDoc1._id,
      vehicleId: vehicle1._id,
      driverId: driver1._id,
      mineralType: 'Granite',
      sourceLocation: 'Salem Quarry 1',
      destinationCheckpoint: 'Salem North Checkpoint',
      netWeightTonnes: 20.0,
      status: EPassStatus.USED,
      validFrom: new Date(Date.now() - 4 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 6 * 24 * 3600 * 1000),
      qrPayload: 'VALID_QR_2',
      qrCodeHash: 'HASH_2',
      digitalSignature: 'SIG_2',
    });

    // Checkpoint passages recorded for both
    await CheckpointLogModel.create({
      logId: `LOG-01-${testSuffix}`,
      checkpointId: checkpoint1._id,
      checkpointName: checkpoint1.name,
      epassId: pass1._id,
      passNumber: pass1.passNumber,
      declaredQuantityTonnes: 20.0,
      verificationResult: CheckpointVerificationResult.VALID,
      locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,
      verificationTimestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000),
      rejectionReasons: [],
      signatureVerified: true,
      hashVerified: true,
    });

    await CheckpointLogModel.create({
      logId: `LOG-02-${testSuffix}`,
      checkpointId: checkpoint1._id,
      checkpointName: checkpoint1.name,
      epassId: pass2._id,
      passNumber: pass2.passNumber,
      declaredQuantityTonnes: 20.0,
      verificationResult: CheckpointVerificationResult.VALID,
      locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,
      verificationTimestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      rejectionReasons: [],
      signatureVerified: true,
      hashVerified: true,
    });

    console.info('Test 1: Run reconciliation on compliant permit');
    const compReport = await reconciliationService.runReconciliation({
      authorizationId: authDoc1._id.toString(),
      periodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      periodEnd: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
    });

    assert.strictEqual(compReport.reconciliationStatus, ReconciliationStatus.COMPLIANT);
    assert.strictEqual(compReport.anomalies.length, 0, 'No anomalies should be flagged');
    assert.strictEqual(compReport.transportSummary.totalIssuedTonnage, 40.0);
    assert.strictEqual(compReport.transportSummary.totalVerifiedTonnage, 40.0);
    assert.strictEqual(compReport.status, ReconciliationReportStatus.FINALIZED);
    console.info(`  ✅ Compliant audit verified: Score ${compReport.discrepancyScore}/100, Status: ${compReport.reconciliationStatus}`);

    // -------------------------------------------------------------
    // Test 2: Over-Quota Transport Breach
    // -------------------------------------------------------------
    console.log('\n--- 2. Over-Quota Transport Breach Detection ---');
    // Create Permit with small quota (50t)
    const overQuotaAuth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-OVER-${testSuffix}`,
      permitNumber: `TN-MIN-OVER-${testSuffix}`,
      lesseeName: `Over Quota Corp ${testSuffix}`,
      mineralType: 'Granite',
      permittedWeightTonnes: 50.0,
      remainingQuota: 0.0,
      validFrom: new Date(Date.now() - 20 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 40 * 24 * 3600 * 1000),
      status: MiningAuthorizationStatus.ACTIVE,
      createdBy: adminUser._id,
    });

    // Create 3 passes totaling 75 tonnes (50% over limit)
    for (let i = 1; i <= 3; i++) {
      await EPassModel.create({
        passNumber: `EP-OVER-${i}-${testSuffix}`,
        authorizationId: overQuotaAuth._id,
        vehicleId: vehicle1._id,
        driverId: driver1._id,
        mineralType: 'Granite',
        sourceLocation: 'Salem Quarry 1',
        destinationCheckpoint: 'Salem North Checkpoint',
        netWeightTonnes: 25.0,
        status: EPassStatus.USED,
        validFrom: new Date(Date.now() - 10 * 24 * 3600 * 1000),
        validUntil: new Date(Date.now() + 10 * 24 * 3600 * 1000),
        qrPayload: `OVER_QR_${i}`,
        qrCodeHash: `HASH_OVER_${i}`,
        digitalSignature: `SIG_OVER_${i}`,
      });
    }

    console.info('Test 2: Detect excess transport over permitted quota');
    const overReport = await reconciliationService.runReconciliation({
      authorizationId: overQuotaAuth._id.toString(),
    });

    assert.ok(
      overReport.reconciliationStatus === ReconciliationStatus.CRITICAL_ANOMALY ||
        overReport.reconciliationStatus === ReconciliationStatus.FLAGGED_DISCREPANCY,
    );
    const overAnomaly = overReport.anomalies.find(
      (a) => a.type === ReconciliationAnomalyType.EXCESS_TRANSPORT_OVER_PERMIT,
    );
    assert.ok(overAnomaly, 'EXCESS_TRANSPORT_OVER_PERMIT anomaly must be detected');
    assert.strictEqual(overReport.transportSummary.totalIssuedTonnage, 75.0);
    console.info(`  ✅ Over-quota anomaly detected: ${overAnomaly.title}`);

    // -------------------------------------------------------------
    // Test 3: Unverified Transit Gap Detection
    // -------------------------------------------------------------
    console.log('\n--- 3. Unverified Transit Gap Detection ---');
    const gapAuth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-GAP-${testSuffix}`,
      permitNumber: `TN-MIN-GAP-${testSuffix}`,
      lesseeName: `Transit Gap Corp ${testSuffix}`,
      mineralType: 'Granite',
      permittedWeightTonnes: 500.0,
      remainingQuota: 400.0,
      validFrom: new Date(Date.now() - 20 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 40 * 24 * 3600 * 1000),
      status: MiningAuthorizationStatus.ACTIVE,
      createdBy: adminUser._id,
    });

    // Create 4 passes of 25t each (100t total), but only 1 is used at checkpoint (25t verified, 75t unverified gap = 75%)
    await EPassModel.create({
      passNumber: `EP-GAP-USED-${testSuffix}`,
      authorizationId: gapAuth._id,
      vehicleId: vehicle1._id,
      driverId: driver1._id,
      mineralType: 'Granite',
      sourceLocation: 'Salem Quarry 1',
      destinationCheckpoint: 'Salem North Checkpoint',
      netWeightTonnes: 25.0,
      status: EPassStatus.USED,
      validFrom: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      qrPayload: 'QR_GAP_1',
      qrCodeHash: 'HASH_GAP_1',
      digitalSignature: 'SIG_GAP_1',
    });

    for (let i = 2; i <= 4; i++) {
      await EPassModel.create({
        passNumber: `EP-GAP-UNVERIFIED-${i}-${testSuffix}`,
        authorizationId: gapAuth._id,
        vehicleId: vehicle1._id,
        driverId: driver1._id,
        mineralType: 'Granite',
        sourceLocation: 'Salem Quarry 1',
        destinationCheckpoint: 'Salem North Checkpoint',
        netWeightTonnes: 25.0,
        status: EPassStatus.ACTIVE,
        validFrom: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        validUntil: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        qrPayload: `QR_GAP_${i}`,
        qrCodeHash: `HASH_GAP_${i}`,
        digitalSignature: `SIG_GAP_${i}`,
      });
    }

    console.info('Test 3: Detect unverified transit gap between issued and checkpoint-scanned passes');
    const gapReport = await reconciliationService.runReconciliation({
      authorizationId: gapAuth._id.toString(),
    });

    const gapAnomaly = gapReport.anomalies.find(
      (a) => a.type === ReconciliationAnomalyType.UNVERIFIED_TRANSIT_GAP,
    );
    assert.ok(gapAnomaly, 'UNVERIFIED_TRANSIT_GAP anomaly must be detected');
    assert.strictEqual(gapReport.transportSummary.totalIssuedTonnage, 100.0);
    assert.strictEqual(gapReport.transportSummary.totalVerifiedTonnage, 25.0);
    console.info(`  ✅ Unverified transit gap flagged: ${gapAnomaly.title}`);

    // -------------------------------------------------------------
    // Test 4: Satellite Disturbance with Zero / Low Transport (Illicit Extraction)
    // -------------------------------------------------------------
    console.log('\n--- 4. Satellite Disturbance with Unrecorded Transport ---');
    const unrecordedZone = await Zone.create({
      zoneId: `ZONE-M11-UNREC-${testSuffix}`,
      name: `Unrecorded Mining Zone ${testSuffix}`,
      category: ZoneCategory.RESERVED_AREA,
      status: ZoneStatus.PROTECTED,
      district: 'Dharmapuri',
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.0, 12.0],
            [78.02, 12.0],
            [78.02, 12.02],
            [78.0, 12.02],
            [78.0, 12.0],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [78.01, 12.01] },
      areaHectares: 80.0,
      createdBy: adminUser._id,
    });

    // Create 1.5 ha change detection
    await ChangeDetectionModel.create({
      changeId: `CHG-UNREC-${testSuffix}`,
      zoneId: unrecordedZone._id,
      observationId: new mongoose.Types.ObjectId(),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      detectedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      zoneArea: 80.0,
      changedArea: 1.5,
      affectedAreaPercentage: 1.875,
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.DERIVED_INDICATORS,
      threshold2Crossed: false,
      threshold5Crossed: false,
      threshold10Crossed: false,
      highestThresholdCrossed: 0,
      severity: AlertSeverity.LOW,
      evidenceStrength: 85,
      evidenceBreakdown: {
        magnitudeScore: 35,
        dataQualityScore: 20,
        temporalConsistencyScore: 15,
        crossSensorScore: 15,
        totalEvidenceScore: 85,
        explanation: 'Heavy spectral shift indicating surface excavation',
      },
      categories: [ChangeCategory.BARE_SOIL_EXPOSURE],
      changeIndicators: {
        deltaNdvi: -0.35,
        deltaBsi: 0.4,
      },
      crossSensorAgreement: CrossSensorAgreement.HIGH,
      temporalConsistency: 'SUSTAINED',
      explanation: 'High surface disturbance with no declared permit transit',
      alertGenerated: true,
    });

    console.info('Test 4: Detect unrecorded extraction when satellite disturbance exists but transport is 0');
    const unrecReport = await reconciliationService.runReconciliation({
      zoneId: unrecordedZone._id.toString(),
    });

    assert.ok(

      unrecReport.reconciliationStatus === ReconciliationStatus.CRITICAL_ANOMALY,
      'Must be marked CRITICAL_ANOMALY',
    );
    const unrecAnomaly = unrecReport.anomalies.find(
      (a) => a.type === ReconciliationAnomalyType.EXCESS_EXTRACTION_UNRECORDED_TRANSPORT,
    );
    assert.ok(unrecAnomaly, 'EXCESS_EXTRACTION_UNRECORDED_TRANSPORT anomaly must be detected');

    assert.strictEqual(unrecReport.satelliteSummary.totalDisturbedAreaHectares, 1.5);
    console.info(`  ✅ Unrecorded extraction detected: ${unrecAnomaly.title}`);

    // -------------------------------------------------------------
    // Test 5: Disturbance on Protected Zone without Mining Permit
    // -------------------------------------------------------------
    console.log('\n--- 5. Extraction on Protected Zone without Permit ---');
    await ChangeDetectionModel.create({
      changeId: `CHG-PROT-${testSuffix}`,
      zoneId: protectedZoneDoc._id,
      observationId: new mongoose.Types.ObjectId(),
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      detectedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      zoneArea: 250.0,
      changedArea: 0.8,
      affectedAreaPercentage: 0.32,
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.DERIVED_INDICATORS,
      threshold2Crossed: false,
      threshold5Crossed: false,
      threshold10Crossed: false,
      highestThresholdCrossed: 0,
      severity: AlertSeverity.LOW,
      evidenceStrength: 90,
      evidenceBreakdown: {
        magnitudeScore: 38,
        dataQualityScore: 20,
        temporalConsistencyScore: 16,
        crossSensorScore: 16,
        totalEvidenceScore: 90,
        explanation: 'Encroachment disturbance inside National Park core',
      },
      categories: [ChangeCategory.SURFACE_CHANGE],
      changeIndicators: { deltaNdvi: -0.4, deltaBsi: 0.45 },
      crossSensorAgreement: CrossSensorAgreement.HIGH,
      temporalConsistency: 'RAPID',
      explanation: 'Disturbance detected in protected national park sanctuary',
      alertGenerated: true,
    });

    console.info('Test 5: Detect boundary encroachment on protected forest zone');
    const protReport = await reconciliationService.runReconciliation({
      zoneId: protectedZoneDoc._id.toString(),
    });

    const protAnomaly = protReport.anomalies.find(
      (a) => a.type === ReconciliationAnomalyType.EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY,
    );
    assert.ok(protAnomaly, 'EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY anomaly must be detected');
    console.info(`  ✅ Protected zone breach detected: ${protAnomaly.title}`);

    // -------------------------------------------------------------
    // Test 6: DEM Volume vs Declared Transport Disproportion
    // -------------------------------------------------------------
    console.log('\n--- 6. DEM Volumetric Disproportion Detection ---');
    const demZone = await Zone.create({
      zoneId: `ZONE-M11-DEM-${testSuffix}`,
      name: `DEM Volumetric Test Zone ${testSuffix}`,
      category: ZoneCategory.RESERVED_AREA,
      status: ZoneStatus.PROTECTED,
      district: 'Salem',
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.2, 11.7],
            [78.22, 11.7],
            [78.22, 11.72],
            [78.2, 11.72],
            [78.2, 11.7],
          ],
        ],
      },
      centerPoint: { type: 'Point', coordinates: [78.21, 11.71] },
      areaHectares: 100.0,
      createdBy: adminUser._id,
    });

    const demAuth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-DEM-${testSuffix}`,
      permitNumber: `TN-MIN-DEM-${testSuffix}`,
      lesseeName: `DEM Quarry Corp ${testSuffix}`,
      mineralType: 'Granite',
      permittedWeightTonnes: 5000.0,
      remainingQuota: 4950.0,
      zoneId: demZone._id,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 60 * 24 * 3600 * 1000),
      status: MiningAuthorizationStatus.ACTIVE,
      createdBy: adminUser._id,
    });

    // Create 1 pass with 50 tonnes
    await EPassModel.create({
      passNumber: `EP-DEM-${testSuffix}`,
      authorizationId: demAuth._id,
      vehicleId: vehicle1._id,
      driverId: driver1._id,
      mineralType: 'Granite',
      sourceLocation: 'Salem Quarry 1',
      destinationCheckpoint: 'Salem North Checkpoint',
      netWeightTonnes: 50.0,
      status: EPassStatus.USED,
      validFrom: new Date(Date.now() - 10 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 10 * 24 * 3600 * 1000),
      qrPayload: 'QR_DEM',
      qrCodeHash: 'HASH_DEM',
      digitalSignature: 'SIG_DEM',
    });

    // Create DEM volumetric estimate of 1000 m3 (approx 2600 tonnes at 2.6 density) -> 52x larger than declared 50t
    await MiningExtractionEstimateModel.create({
      estimateId: `EST-DEM-${testSuffix}`,
      markedAreaId: demZone._id.toString(),
      areaType: MarkedAreaType.PERMANENT,
      observationId: new mongoose.Types.ObjectId(),
      observationDate: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      changedAreaSquareMeters: 5000,
      changedAreaHectares: 0.5,
      percentageOfTemporaryArea: 0.5,
      miningClassification: MiningClassification.EXCAVATION_EXPANSION,
      isVolumeAvailable: true,
      estimatedDepthMeters: 2.0,
      estimatedVolumeCubicMeters: 1000.0,
      volumeUnit: 'm3',
      estimationMethod: 'DEM_DIFFERENCING',
      estimationConfidence: 90,
      disclaimer: 'Satellite estimate',
    });

    console.info('Test 6: Detect DEM volumetric vs declared transport weight divergence');
    const demReport = await reconciliationService.runReconciliation({
      authorizationId: demAuth._id.toString(),
      discrepancyTolerancePercent: 15.0,
    });

    const volAnomaly = demReport.anomalies.find(
      (a) => a.type === ReconciliationAnomalyType.VOLUME_TONNAGE_DISPROPORTION,
    );
    assert.ok(volAnomaly, 'VOLUME_TONNAGE_DISPROPORTION anomaly must be detected');
    assert.strictEqual(demReport.satelliteSummary.estimatedExtractionVolumeCubicMeters, 1000.0);
    assert.strictEqual(demReport.satelliteSummary.estimatedTonnageEquivalent, 2600.0);
    console.info(`  ✅ Volume disproportion detected: ${volAnomaly.title}`);

    // -------------------------------------------------------------
    // Test 7: Suspended Permit Violation
    // -------------------------------------------------------------
    console.log('\n--- 7. Suspended Permit Activity Detection ---');
    const suspAuth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-SUSP-${testSuffix}`,
      permitNumber: `TN-MIN-SUSP-${testSuffix}`,
      lesseeName: `Suspended Lease Corp ${testSuffix}`,
      mineralType: 'Granite',
      permittedWeightTonnes: 1000.0,
      remainingQuota: 500.0,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 60 * 24 * 3600 * 1000),
      status: MiningAuthorizationStatus.SUSPENDED,
      createdBy: adminUser._id,
    });

    await EPassModel.create({
      passNumber: `EP-SUSP-${testSuffix}`,
      authorizationId: suspAuth._id,
      vehicleId: vehicle1._id,
      driverId: driver1._id,
      mineralType: 'Granite',
      sourceLocation: 'Salem Quarry 1',
      destinationCheckpoint: 'Salem North Checkpoint',
      netWeightTonnes: 20.0,
      status: EPassStatus.ACTIVE,
      validFrom: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      qrPayload: 'QR_SUSP',
      qrCodeHash: 'HASH_SUSP',
      digitalSignature: 'SIG_SUSP',
    });

    console.info('Test 7: Detect transport activities on SUSPENDED permit');
    const suspReport = await reconciliationService.runReconciliation({
      authorizationId: suspAuth._id.toString(),
    });

    const suspAnomaly = suspReport.anomalies.find(
      (a) => a.type === ReconciliationAnomalyType.SUSPENDED_MINING_ACTIVITY,
    );
    assert.ok(suspAnomaly, 'SUSPENDED_MINING_ACTIVITY anomaly must be detected');
    console.info(`  ✅ Suspended permit activity detected: ${suspAnomaly.title}`);

    // -------------------------------------------------------------
    // Test 8: Report Status Lifecycle Transitions
    // -------------------------------------------------------------
    console.log('\n--- 8. Report Status Lifecycle Transitions ---');
    console.info('Test 8: Transition report to UNDER_INVESTIGATION and then RESOLVED');
    const underInvestReport = await reconciliationService.updateReportStatus(
      overReport.id,
      {
        status: ReconciliationReportStatus.UNDER_INVESTIGATION,
        investigationNotes: 'Dispatched Salem Circle Flying Squad for quarry inspection',
      },
      adminUserId,
    );
    assert.strictEqual(underInvestReport.status, ReconciliationReportStatus.UNDER_INVESTIGATION);
    assert.strictEqual(underInvestReport.investigationNotes, 'Dispatched Salem Circle Flying Squad for quarry inspection');

    const resolvedReport = await reconciliationService.updateReportStatus(
      overReport.id,
      {
        status: ReconciliationReportStatus.RESOLVED,
        investigationNotes: 'Penalty compounded and unauthorized excess quota regularized',
      },
      adminUserId,
    );
    assert.strictEqual(resolvedReport.status, ReconciliationReportStatus.RESOLVED);
    assert.ok(resolvedReport.resolvedAt, 'resolvedAt timestamp must be recorded');
    console.info(`  ✅ Status transitioned to RESOLVED with notes and timestamp`);

    // -------------------------------------------------------------
    // Test 9: Summary KPIs Aggregation
    // -------------------------------------------------------------
    console.log('\n--- 9. Summary KPI Aggregation ---');
    console.info('Test 9: Verify aggregated reconciliation KPIs');
    const summaryKpis = await reconciliationService.getSummary();
    assert(summaryKpis.totalReports >= 6, 'Total reports count should reflect runs');
    assert(summaryKpis.compliantCount >= 1, 'Compliant count should be at least 1');
    assert(summaryKpis.resolvedCount >= 1, 'Resolved count should be at least 1');
    console.info(`  ✅ Summary KPIs: Total ${summaryKpis.totalReports}, Compliant: ${summaryKpis.compliantCount}, Anomalies: ${summaryKpis.criticalAnomalyCount}, Transit Gap: ${summaryKpis.unverifiedTransitGapTonnage} t`);

    // -------------------------------------------------------------
    // Test 10: REST API Endpoints Verification
    // -------------------------------------------------------------
    console.log('\n--- 10. REST API Endpoints Verification ---');
    console.info('Test 10a: POST /api/reconciliation/run via Mining Officer');
    const apiRun = await request(
      'POST',
      '/api/reconciliation/run',
      {
        authorizationId: auth1Id,
        periodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        periodEnd: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
      },
      miningOfficerToken,
    );
    assert.strictEqual(apiRun.status, 201);
    assert.ok(apiRun.body.data.reconciliationId);

    console.info('Test 10b: GET /api/reconciliation/reports listing');
    const apiList = await request('GET', '/api/reconciliation/reports', undefined, adminToken);
    assert.strictEqual(apiList.status, 200);
    assert(Array.isArray(apiList.body.data));

    console.info('Test 10c: GET /api/reconciliation/reports/:id detail');
    const apiDetail = await request('GET', `/api/reconciliation/reports/${compReport.id}`, undefined, adminToken);
    assert.strictEqual(apiDetail.status, 200);
    assert.strictEqual(apiDetail.body.data.reconciliationId, compReport.reconciliationId);

    console.info('Test 10d: PATCH /api/reconciliation/reports/:id/status');
    const apiPatch = await request(
      'PATCH',
      `/api/reconciliation/reports/${compReport.id}/status`,
      {
        status: ReconciliationReportStatus.UNDER_INVESTIGATION,
        investigationNotes: 'Periodic audit check',
      },
      adminToken,
    );
    assert.strictEqual(apiPatch.status, 200);
    assert.strictEqual(apiPatch.body.data.status, ReconciliationReportStatus.UNDER_INVESTIGATION);

    console.info('Test 10e: GET /api/reconciliation/summary');
    const apiSummary = await request('GET', '/api/reconciliation/summary', undefined, adminToken);
    assert.strictEqual(apiSummary.status, 200);
    assert(apiSummary.body.data.totalReports >= 1);

    console.info('Test 10f: GET /api/reconciliation/zone/:zoneId');
    const apiZone = await request('GET', `/api/reconciliation/zone/${zone1Id}`, undefined, adminToken);
    assert.strictEqual(apiZone.status, 200);

    // -------------------------------------------------------------
    // Test 11: RBAC Enforcement
    // -------------------------------------------------------------
    console.log('\n--- 11. RBAC & Security Verification ---');
    console.info('Test 11a: Viewer role cannot run reconciliation (403 Forbidden)');
    const viewerForbidden = await request(
      'POST',
      '/api/reconciliation/run',
      { authorizationId: auth1Id },
      viewerToken,
    );
    assert.strictEqual(viewerForbidden.status, 403);

    console.info('Test 11b: Unauthenticated request rejected (401 Unauthorized)');
    const unauthReq = await request('POST', '/api/reconciliation/run', { authorizationId: auth1Id });
    assert.strictEqual(unauthReq.status, 401);

    console.log('\n================================================================');
    console.log('🎉 ALL MODULE M11 RECONCILIATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    // Cleanup test data
    await ReconciliationReportModel.deleteMany({
      reconciliationId: { $regex: /^REC-/ },
    });
    await EPassModel.deleteMany({ passNumber: { $regex: /^EP-/ } });
    await CheckpointLogModel.deleteMany({ logId: { $regex: /^LOG-/ } });
    await CheckpointModel.deleteMany({ checkpointId: { $regex: /^CP-M11-/ } });
    await MiningAuthorizationModel.deleteMany({ permitNumber: { $regex: /^TN-MIN-/ } });
    await VehicleModel.deleteMany({ registrationNumber: { $regex: /^TN-30-XY-/ } });
    await DriverModel.deleteMany({ driverId: { $regex: /^DRV-/ } });
    await TransportCompanyModel.deleteMany({ companyId: { $regex: /^TC-/ } });
    await ChangeDetectionModel.deleteMany({ changeId: { $regex: /^CHG-/ } });
    await MiningExtractionEstimateModel.deleteMany({ estimateId: { $regex: /^EST-/ } });
    await Zone.deleteMany({ name: { $regex: /Test|Salem|Mudumalai|Unrecorded|DEM/ } });
    await User.deleteMany({ email: { $regex: /@tnforest\.gov\.in$/ } });

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await mongoose.disconnect();
  }
}

runM11TestSuite().catch((err) => {
  console.error('❌ M11 Test Suite Failed:', err);
  process.exit(1);
});
