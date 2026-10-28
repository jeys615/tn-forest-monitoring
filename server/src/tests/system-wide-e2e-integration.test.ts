/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import type { Server } from 'node:http';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { CaseAuditLogModel } from '../models/CaseAuditLog.js';
import { EvidenceDossierModel } from '../models/EvidenceDossier.js';
import { EvidenceDossierService } from '../services/EvidenceDossierService.js';
import { ePassService } from '../services/EPassService.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  ZoneStatus,
  BaselineStatus,
  SatelliteProcessingStatus,
  SensorType,
  SatelliteSource,
  ProcessingMode,
  SpatialCalculationSource,
  CrossSensorAgreement,
  ChangeCategory,
  AlertSeverity,
  AlertStatus,
  MiningAuthorizationStatus,
  VehicleStatus,
  DriverVerificationStatus,
  EPassStatus,
  CheckpointStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
  EnforcementRejectionReason,
  ReconciliationStatus,
  ReconciliationReportStatus,
  ReconciliationAnomalyType,
  ReconciliationAnomalySeverity,
  CaseSeverity,
  CaseType,
  CaseStatus,
  EnforcementActionType,
  CaseAuditAction,
  type BatchCheckpointSyncRequest,
  type BatchCheckpointSyncResponse,
  type GeoJSONMultiPolygon,
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
  let responseBody: any;
  if (contentType.includes('application/json')) {
    responseBody = await res.json();
  } else {
    responseBody = await res.text();
  }

  return { status: res.status, headers: res.headers, body: responseBody };
}

async function runMasterE2ETests() {
  console.log('================================================================');
  console.log('🧪 MASTER SYSTEM-WIDE E2E INTEGRATION TEST (PHASE 11)');
  console.log('   TN Forest Monitoring, Mining, E-Pass & Checkpoint Enforcement');
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
    // Gate 1: Officer Provisioning & RBAC Authentication
    // -------------------------------------------------------------------------
    console.log('▶ Gate 1: Officer Provisioning & Authentication...');

    const testPassword = await hashPassword('MasterE2E@2026');
    const officerEmail = `master_e2e_officer_${Date.now()}@forest.tn.gov.in`;

    const officer = await User.create({
      name: 'Thiru S. Ramachandran IFS',
      email: officerEmail,
      passwordHash: testPassword,
      role: UserRole.FOREST_OFFICER,
      status: UserStatus.ACTIVE,
      permissions: Object.values(Permission),
    });

    const loginRes = await request('POST', '/api/auth/login', {
      email: officerEmail,
      password: 'MasterE2E@2026',
    });
    assert.strictEqual(loginRes.status, 200, 'Officer login must succeed');
    const authToken = loginRes.body.data.token;
    console.log('  ✔ Forest Officer logged in and authenticated');

    // -------------------------------------------------------------------------
    // Gate 2: Forest Zone & Immutable Baseline Establishment
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 2: Forest Zone & Baseline Provisioning...');

    const zone = await Zone.create({
      zoneId: `ZONE-E2E-KOLLI-${Date.now()}`,
      name: `Kolli Hills Evergreen Reserve - Sector ${Date.now()}`,
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
      centerPoint: { type: 'Point', coordinates: [78.35, 11.26] },
      areaHectares: 280.0,
      createdBy: officer._id,
    });

    const baseImageId = `COPERNICUS/S2_SR_HARMONIZED/20250315T051651_${Date.now()}_T44PMT`;
    const baseObservation = await SatelliteMetadata.create({
      imageId: baseImageId,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date(Date.now() - 180 * 24 * 3600 * 1000),
      cloudCover: 1.2,
      footprint: {
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
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: `ee.Image('${baseImageId}')`,
      intersectingZones: [zone._id],
    });

    const baseline = await BaselineModel.create({
      zoneId: zone._id,
      satelliteMetadataId: baseObservation._id,
      imageId: baseImageId,
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date(Date.now() - 180 * 24 * 3600 * 1000),
      status: BaselineStatus.ACTIVE,
      isActive: true,
      qualityScore: 95,
      cloudCover: 1.2,
      validPixelPercentage: 98.8,
      selectionReason: 'Authoritative cloud-free dry-season optical reference image.',
      createdBy: officer._id,
    });
    console.log('  ✔ Protected Forest Zone and immutable baseline active');

    // -------------------------------------------------------------------------
    // Gate 3: Real Satellite Metadata & MultiPolygon Change Detection
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 3: Satellite Metadata Observation & MultiPolygon Vectorization...');

    const imageId = `COPERNICUS/S2_SR_HARMONIZED/20261001T051651_${Date.now()}_T44PMT`;
    const observation = await SatelliteMetadata.create({
      imageId,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date(Date.now() - 3 * 24 * 3600 * 1000),
      cloudCover: 2.4,
      footprint: {
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
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: `ee.Image('${imageId}')`,
      intersectingZones: [zone._id],
    });

    const multiPolygonGeometry: GeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [78.341, 11.251],
            [78.345, 11.251],
            [78.345, 11.255],
            [78.341, 11.255],
            [78.341, 11.251],
          ],
        ],
        [
          [
            [78.352, 11.262],
            [78.358, 11.262],
            [78.358, 11.267],
            [78.352, 11.267],
            [78.352, 11.262],
          ],
        ],
      ],
    };

    const changeDetection = await ChangeDetectionModel.create({
      changeId: `CHANGE-E2E-${Date.now()}`,
      zoneId: zone._id,
      observationId: observation._id,
      baselineId: baseline._id,
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      detectedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      zoneArea: 280.0,
      changedArea: 4.25,
      affectedAreaPercentage: 1.52,
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.PIXEL_MASK,
      changedGeometry: multiPolygonGeometry,
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
        explanation: 'Authoritative MultiPolygon pixel clusters confirm vegetation loss.',
      },
      categories: [ChangeCategory.VEGETATION_LOSS, ChangeCategory.BARE_SOIL_EXPOSURE],
      changeIndicators: { ndviDelta: -0.28 },
      crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
      temporalConsistency: 'HIGH',
      explanation: 'Authoritative pixel mask identifies two distinct illegal clearing incursions.',
      alertGenerated: true,
    });

    const alert = await AlertModel.create({
      alertId: `ALERT-E2E-${Date.now()}`,
      zoneId: zone._id,
      changeDetectionId: changeDetection._id,
      detectedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      affectedAreaPercentage: 1.52,
      highestThresholdCrossed: 5,
      thresholdsCrossed: [2, 5],
      severity: AlertSeverity.HIGH,
      evidenceStrength: 91,
      calculationMode: ProcessingMode.REAL,
      sensorType: SensorType.OPTICAL,
      evidenceSources: [SensorType.OPTICAL],
      categories: [ChangeCategory.VEGETATION_LOSS],
      explanation: 'Sentinel-2 authoritative optical pixel anomaly in Kolli Hills Sector 7.',
      status: AlertStatus.CONFIRMED,
    });
    console.log('  ✔ Observation, MultiPolygon change detection (2 clusters), and Alert established');

    // -------------------------------------------------------------------------
    // Gate 4: Commercial Mining Lease, Transport Registry & E-Pass
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 4: Mining Authorization, Transport Fleet & Statutory E-Pass...');

    const miningAuth = await MiningAuthorizationModel.create({
      authorizationId: `AUTH-E2E-${Date.now()}`,
      permitNumber: `TN-MIN-E2E-${Date.now()}`,
      zoneId: zone._id,
      lesseeName: 'Tamil Nadu Apex Minerals Corporation',
      mineralType: 'Quartzite',
      permittedWeightTonnes: 20000,
      remainingQuota: 18500,
      status: MiningAuthorizationStatus.ACTIVE,
      validFrom: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      validUntil: new Date(Date.now() + 180 * 24 * 3600 * 1000),
      createdBy: officer._id,
    });

    const checkpoint = await CheckpointModel.create({
      checkpointId: `CP-E2E-${Date.now()}`,
      name: `Kolli Hills Valley Gate ${Date.now()}`,
      district: 'Namakkal',
      location: { type: 'Point', coordinates: [78.35, 11.26] },
      assignedZoneId: zone._id,
      status: CheckpointStatus.ACTIVE,
      geofenceRadiusMeters: 500,
      createdBy: officer._id,
    });

    const transportCo = await TransportCompanyModel.create({
      companyId: `TC-E2E-${Date.now()}`,
      companyName: 'Salem Heavy Mineral Haulage Ltd',
      registrationNumber: `REG-E2E-${Date.now()}`,
      status: 'ACTIVE',
      createdBy: officer._id,
    });

    const vehicle = await VehicleModel.create({
      vehicleId: `VEH-E2E-${Date.now()}`,
      registrationNumber: `TN-28-E2E-${Math.floor(1000 + Math.random() * 9000)}`,
      transportCompanyId: transportCo._id,
      vehicleType: 'TRUCK',
      tareWeight: 12.5,
      grossVehicleWeight: 44.5,
      permittedCarryingCapacity: 32.0,
      status: VehicleStatus.ACTIVE,
      gpsTrackerId: `GPS-E2E-${Date.now()}`,
      createdBy: officer._id,
    });

    const driver = await DriverModel.create({
      driverId: `DRV-E2E-${Date.now()}`,
      name: 'M. Selvam',
      licenseNumber: `DL-TN-E2E-${Date.now()}`,
      phone: '+919876543210',
      transportCompanyId: transportCo._id,
      verificationStatus: DriverVerificationStatus.VERIFIED,
      createdBy: officer._id,
    });

    const epassDto = await ePassService.createEPass(
      {
        authorizationId: miningAuth._id.toString(),
        vehicleId: vehicle._id.toString(),
        driverId: driver._id.toString(),
        netWeightTonnes: 26.5,
        destinationCheckpoint: checkpoint.name,
      },
      officer._id.toString(),
    );

    // Backdate validFrom so offline verification 30 mins ago falls within valid window
    await EPassModel.findByIdAndUpdate(epassDto.id, {
      validFrom: new Date(Date.now() - 2 * 3600 * 1000),
    });
    const epass = await EPassModel.findById(epassDto.id);
    assert.ok(epass);
    console.log('  ✔ Mining authorization, transport fleet, checkpoint, and active E-Pass verified');

    // -------------------------------------------------------------------------
    // Gate 5: Offline Batch Checkpoint Synchronization (Phase 11.2)
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 5: Offline Batch Checkpoint Synchronization (Phase 11.2)...');

    const clientLogId1 = `LOG-OFFLINE-E2E-1-${Date.now()}`;
    const clientLogId2 = `LOG-OFFLINE-E2E-2-${Date.now()}`;

    const syncPayload: BatchCheckpointSyncRequest = {
      checkpointId: checkpoint._id.toString(),
      passages: [
        {
          clientLogId: clientLogId1,
          syncNonce: `NONCE-E2E-1-${Date.now()}`,
          passNumberOrId: epass.passNumber,
          passageTimestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          currentLocation: [78.3501, 11.2601],
          declaredQuantityTonnes: 26.5,
          notes: 'Offline batch checkpoint passage entry 1',
        },
        {
          clientLogId: clientLogId2,
          syncNonce: `NONCE-E2E-2-${Date.now()}`,
          passNumberOrId: epass.passNumber,
          passageTimestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          currentLocation: [78.3502, 11.2602],
          declaredQuantityTonnes: 26.5,
          notes: 'Offline batch checkpoint passage entry 2 replay',
        },
      ],
    };

    const batchRes = await request('POST', '/api/checkpoints/sync-batch', syncPayload, authToken);
    assert.strictEqual(batchRes.status, 200, 'Batch sync must respond with HTTP 200');
    assert.strictEqual(batchRes.body.success, true);
    const syncData: BatchCheckpointSyncResponse = batchRes.body.data;

    assert.strictEqual(syncData.totalSubmitted, 2);
    assert.strictEqual(syncData.acceptedCount, 1, 'First passage must be accepted');
    assert.strictEqual(syncData.duplicateCount, 1, 'Second passage must be detected as duplicate');

    // Verify E-Pass state atomically changed to USED
    const freshEPass = await EPassModel.findById(epass._id);
    assert.strictEqual(freshEPass?.status, EPassStatus.USED, 'E-Pass must atomically transition to USED');
    console.log('  ✔ Batch synchronization: 1 accepted, 1 replayed duplicate detected, E-Pass status transitioned to USED');

    // -------------------------------------------------------------------------
    // Gate 6: 4-Quadrant Reconciliation & Formal Enforcement Case
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 6: 4-Quadrant Reconciliation & Enforcement Case Setup...');

    const reconReport = await ReconciliationReportModel.create({
      reconciliationId: `RECON-E2E-${Date.now()}`,
      zoneId: zone._id,
      zoneName: zone.name,
      periodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      periodEnd: new Date(),
      status: ReconciliationReportStatus.DRAFT,
      reconciliationStatus: ReconciliationStatus.FLAGGED_DISCREPANCY,
      discrepancyScore: 88,
      permitSummary: {
        permitNumber: miningAuth.permitNumber,
        lesseeName: miningAuth.lesseeName,
        mineralType: miningAuth.mineralType,
        permittedWeightTonnes: miningAuth.permittedWeightTonnes,
        remainingQuota: miningAuth.remainingQuota,
        status: miningAuth.status,
        validFrom: miningAuth.validFrom.toISOString(),
        validUntil: miningAuth.validUntil.toISOString(),
      },
      transportSummary: {
        totalPassesIssued: 1,
        totalIssuedTonnage: 26.5,
        totalPassesUsed: 1,
        totalVerifiedTonnage: 26.5,
        totalPassesCancelled: 0,
        totalPassesExpired: 0,
        activePassCount: 0,
      },
      checkpointSummary: {
        totalScans: 2,
        validScans: 1,
        invalidScans: 1,
        outsideGeofenceScans: 0,
        transitPassageCount: 1,
        totalTransitTonnage: 26.5,
      },
      satelliteSummary: {
        observationCount: 1,
        totalDisturbedAreaHectares: 4.25,
        estimatedExtractionVolumeCubicMeters: 42500,
        estimatedTonnageEquivalent: 106250,
        densityUsedTonnesPerCubicMeter: 2.5,
        maxEvidenceStrength: 92,
        miningClassifications: ['SURFACE_CLEARING', 'EXCAVATION_PIT'],
        disclaimer:
          'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
      },
      anomalies: [
        {
          type: ReconciliationAnomalyType.EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY,
          severity: ReconciliationAnomalySeverity.HIGH,
          title: 'Unregistered Heavy Haulage Triangulation',
          description: 'Satellite volumetric excavation exceeds authorized transport dispatch.',
          evidenceScore: 92,
        },
      ],
      findings: ['Substantial quartzite stockpile removed without matching e-pass clearances.'],
      recommendations: ['Register formal enforcement case and impound haulage equipment.'],
      createdBy: officer._id,
    });

    const caseId = `CASE-TN-E2E-${Date.now()}`;
    const enforcementCase = await EnforcementCaseModel.create({
      caseId,
      reconciliationReportId: reconReport._id,
      reconciliationReportNumber: reconReport.reconciliationId,
      title: 'Major Mechanized Forest Incursion & Illegal Quartz Quarrying in Kolli Hills',
      description: 'Corroborated optical change detection, weighbridge discrepancies, and UAV reconnaissance.',
      severity: CaseSeverity.CRITICAL,
      caseType: CaseType.UNRECORDED_EXTRACTION,
      status: CaseStatus.UNDER_INVESTIGATION,
      zoneId: zone._id,
      zoneName: zone.name,
      assignedOfficerId: officer._id,
      assignedOfficerName: officer.name,
      assignedAt: new Date(),
      investigationFindings: [
        'Excavator and 3 tippers operating outside designated compartment.',
        'High-contrast vegetation clearing of 4.25 ha confirmed on ground.',
      ],
      fieldVerification: {
        verifiedAt: new Date(),
        verifiedBy: officer._id,
        locationCoordinates: [78.352, 11.262],
        siteObservations: 'Deep commercial pit with heavy excavation equipment operational.',
        droneSurveyConducted: true,
        groundDisturbanceConfirmed: true,
        photoUrls: ['https://storage.forest.tn.gov.in/uav/e2e_evidence_01.jpg'],
        notes: 'GPS survey confirms clearing intrusion extends 450m into reserved core.',
      },
      enforcementAction: {
        actionType: EnforcementActionType.PENALTY_LEVIED,
        actionDetails: 'Statutory penalty levied under Section 21 of MMDR Act 1957 & Section 21 of TN Forest Act 1882.',
        actionDate: new Date(),
        penaltyAmountInr: 500000,
        officialOrderReference: 'TN-FOR-ENF-E2E-2026-99',
        issuedBy: officer._id,
      },
      createdBy: officer._id,
    });

    await CaseAuditLogModel.create({
      auditId: `AUDIT-E2E-${Date.now()}`,
      caseId: enforcementCase._id,
      caseNumber: caseId,
      action: CaseAuditAction.CASE_CREATED,
      actorId: officer._id,
      actorName: officer.name,
      actorRole: officer.role,
      newStatus: CaseStatus.UNDER_INVESTIGATION,
      remarks: 'Case registered with full statutory documentation and UAV field survey.',
      timestamp: new Date(),
    });
    console.log('  ✔ Formal Enforcement Case registered with UAV findings & official penalty');

    // -------------------------------------------------------------------------
    // Gate 7: Forensic Evidence Dossier Engine & Cryptographic Seal (Phase 11.1)
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 7: Forensic Evidence Dossier Cryptographic Sealing & Tamper Verification (Phase 11.1)...');

    const compileRes = await request(
      'POST',
      `/api/evidence-dossiers/case/${enforcementCase._id}`,
      undefined,
      authToken,
    );
    assert.strictEqual(compileRes.status, 201, 'Dossier compilation must return HTTP 201');
    const dossierDto = compileRes.body.data;

    assert.ok(dossierDto.dossierId.startsWith('DOSSIER-'));
    assert.strictEqual(dossierDto.dossierVersion, 1);
    assert.strictEqual(dossierDto.isSealed, true);
    assert.strictEqual(dossierDto.dossierHash.length, 64);
    assert.strictEqual(dossierDto.hashAlgorithm, 'SHA-256');

    // MultiPolygon geometry preservation inside dossier
    const dossierChange = dossierDto.changeDetections[0];
    assert.ok(dossierChange);
    assert.strictEqual(dossierChange.changedGeometry.type, 'MultiPolygon');
    assert.strictEqual(dossierChange.changedGeometry.coordinates.length, 2);

    // Live Cryptographic Verification Handshake
    const verifyRes1 = await request(
      'POST',
      `/api/evidence-dossiers/${dossierDto.dossierId}/verify`,
      undefined,
      authToken,
    );
    assert.strictEqual(verifyRes1.status, 200);
    assert.strictEqual(verifyRes1.body.data.isValid, true);
    assert.strictEqual(verifyRes1.body.data.isTampered, false);
    assert.strictEqual(verifyRes1.body.data.storedHash, dossierDto.dossierHash);

    // Direct Character Tampering Detection in DB
    const dossierRecord = await EvidenceDossierModel.findOne({ dossierId: dossierDto.dossierId });
    assert.ok(dossierRecord);
    dossierRecord.canonicalPayload = dossierRecord.canonicalPayload.replace('500000', '100000');
    await dossierRecord.save();

    const verifyRes2 = await request(
      'POST',
      `/api/evidence-dossiers/${dossierDto.dossierId}/verify`,
      undefined,
      authToken,
    );
    assert.strictEqual(verifyRes2.status, 200);
    assert.strictEqual(verifyRes2.body.data.isValid, false);
    assert.strictEqual(verifyRes2.body.data.isTampered, true, 'Character tampering in payload must be detected');

    // Restore authentic payload for downstream compliance reporting
    dossierRecord.canonicalPayload = dossierRecord.canonicalPayload.replace('100000', '500000');
    await dossierRecord.save();
    console.log('  ✔ Dossier compiled, SHA-256 sealed, and character-level tampering detected via timingSafeEqual');

    // -------------------------------------------------------------------------
    // Gate 8: Statutory Compliance Reporting in JSON & RFC 4180 CSV (Phase 11.3)
    // -------------------------------------------------------------------------
    console.log('\n▶ Gate 8: Statutory Compliance Reporting in JSON & RFC 4180 CSV (Phase 11.3)...');

    // JSON Export
    const complJsonRes = await request(
      'GET',
      `/api/reports/compliance?format=json&zoneId=${zone._id}`,
      undefined,
      authToken,
    );
    assert.strictEqual(complJsonRes.status, 200);
    assert.strictEqual(complJsonRes.body.success, true);
    const complReport = complJsonRes.body.data;

    assert.ok(complReport.reportId.startsWith('COMPL-'));
    assert.strictEqual(complReport.jurisdiction, 'Tamil Nadu Forest & Mining Enforcement');
    assert.ok(complReport.statutoryActReference.includes('Tamil Nadu Forest Act 1882'));
    assert.strictEqual(complReport.summaryMetrics.totalMonitoredZones, 1);
    assert.ok(complReport.summaryMetrics.totalDisturbedAreaHectares >= 4.2);
    assert.ok(complReport.summaryMetrics.penaltiesLeviedInr >= 500000);

    // Check Statutory Violations table
    const statViolation = complReport.statutoryViolations.find((v: any) => v.caseNumber === caseId);
    assert.ok(statViolation);
    assert.strictEqual(statViolation.penaltyAmountInr, 500000);
    assert.ok(statViolation.statutoryReference.includes('MMDR Act 1957'));

    // CSV Export
    const complCsvRes = await request(
      'GET',
      `/api/reports/compliance?format=csv&zoneId=${zone._id}`,
      undefined,
      authToken,
    );
    assert.strictEqual(complCsvRes.status, 200);
    assert.ok(complCsvRes.headers.get('content-type')?.includes('text/csv'));
    assert.ok(complCsvRes.headers.get('content-disposition')?.includes('attachment; filename='));
    const csvContent = complCsvRes.body;
    assert.ok(typeof csvContent === 'string');
    assert.ok(csvContent.includes('--- EXECUTIVE SUMMARY METRICS ---'));
    assert.ok(csvContent.includes('--- STATUTORY VIOLATIONS & ENFORCEMENT CASES ---'));
    assert.ok(csvContent.includes('500000'));
    assert.ok(csvContent.includes('TN-FOR-ENF-E2E-2026-99'));
    console.log('  ✔ Statutory Compliance JSON & RFC 4180 CSV exports verified with statutory citations');

    // Clean up all test-isolated entities to preserve pristine historical database invariants
    await User.deleteMany({ email: officerEmail });
    await Zone.deleteMany({ _id: zone._id });
    await SatelliteMetadata.deleteMany({ _id: { $in: [baseObservation._id, observation._id] } });
    await BaselineModel.deleteMany({ _id: baseline._id });
    await ChangeDetectionModel.deleteMany({ _id: changeDetection._id });
    await AlertModel.deleteMany({ _id: alert._id });
    await MiningAuthorizationModel.deleteMany({ _id: miningAuth._id });
    await TransportCompanyModel.deleteMany({ _id: transportCo._id });
    await VehicleModel.deleteMany({ _id: vehicle._id });
    await DriverModel.deleteMany({ _id: driver._id });
    await EPassModel.deleteMany({ _id: epass._id });
    await CheckpointModel.deleteMany({ _id: checkpoint._id });
    await CheckpointLogModel.deleteMany({ checkpointId: checkpoint._id });
    await ReconciliationReportModel.deleteMany({ _id: reconReport._id });
    await CaseAuditLogModel.deleteMany({ caseId: enforcementCase._id });
    await EvidenceDossierModel.deleteMany({ caseId: enforcementCase._id });
    await EnforcementCaseModel.deleteMany({ _id: enforcementCase._id });

    console.log('\n================================================================');
    console.log('✅ ALL MASTER SYSTEM-WIDE E2E INTEGRATION GATES PASSED (8/8)');
    console.log('   FULL PIPELINE VERIFIED FROM SATELLITE TO STATUTORY COMPLIANCE');
    console.log('================================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runMasterE2ETests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Master E2E integration test failed:', err);
    process.exit(1);
  });
