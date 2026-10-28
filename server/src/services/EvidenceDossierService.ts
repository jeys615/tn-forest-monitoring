import crypto from 'node:crypto';
import { Types } from 'mongoose';
import {
  evidenceDossierRepository,
  EvidenceDossierRepository,
} from '../repositories/EvidenceDossierRepository.js';
import {
  EnforcementCaseRepository,
} from '../repositories/EnforcementCaseRepository.js';
import {
  CaseAuditLogRepository,
} from '../repositories/CaseAuditLogRepository.js';
import {
  ReconciliationReportRepository,
} from '../repositories/ReconciliationReportRepository.js';
import {
  ChangeDetectionRepository,
} from '../repositories/ChangeDetectionRepository.js';
import {
  AlertRepository,
} from '../repositories/AlertRepository.js';
import {
  CheckpointLogRepository,
} from '../repositories/CheckpointLogRepository.js';
import {
  SatelliteMetadataRepository,
} from '../repositories/SatelliteMetadataRepository.js';
import {
  type EvidenceDossierDto,
  type EvidenceDossierCaseDto,
  type EvidenceDossierSatelliteDto,
  type EvidenceDossierChangeDetectionDto,
  type EvidenceDossierAlertDto,
  type EvidenceDossierReconciliationDto,
  type EvidenceDossierTransportDto,
  type EvidenceDossierCheckpointDto,
  type EvidenceDossierUavDto,
  type EvidenceDossierAuditDto,
  type VerifyDossierResponseDto,
  type EvidenceDossierIntegrityDto,
} from '@tn-forest/shared/types';
import { type IEvidenceDossierData, type IEvidenceDossier } from '../models/EvidenceDossier.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';

export class EvidenceDossierService {
  constructor(
    private readonly dossierRepo: EvidenceDossierRepository = evidenceDossierRepository,
    private readonly caseRepo: EnforcementCaseRepository = new EnforcementCaseRepository(),
    private readonly auditRepo: CaseAuditLogRepository = new CaseAuditLogRepository(),
    private readonly reconRepo: ReconciliationReportRepository = new ReconciliationReportRepository(),
    private readonly changeRepo: ChangeDetectionRepository = new ChangeDetectionRepository(),
    private readonly alertRepo: AlertRepository = new AlertRepository(),
    private readonly checkpointLogRepo: CheckpointLogRepository = new CheckpointLogRepository(),
    private readonly satelliteRepo: SatelliteMetadataRepository = new SatelliteMetadataRepository(),
  ) {}

  // ---------------------------------------------------------------------------
  // Canonical Deterministic Serialization & Hashing
  // ---------------------------------------------------------------------------

  /**
   * Deterministically stringifies any JavaScript value for cryptographic sealing.
   * - Keys sorted lexicographically at every nested object level.
   * - Dates converted to standardized ISO-8601 UTC strings.
   * - Numbers formatted consistently to avoid float precision divergence.
   * - Transient metadata ignored.
   */
  public canonicalize(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '0';
      // Normalize float precision to max 6 decimal places to prevent engine variance
      if (Number.isInteger(value)) return String(value);
      return Number(value.toFixed(6)).toString();
    }

    if (typeof value === 'string') {
      return JSON.stringify(value);
    }

    if (value instanceof Date) {
      return JSON.stringify(value.toISOString());
    }

    if (Array.isArray(value)) {
      const items = value.map((item) => this.canonicalize(item));
      return `[${items.join(',')}]`;
    }

    if (typeof value === 'object') {
      // Check for Mongoose ObjectId or similar object with toHexString / toString
      if (value instanceof Types.ObjectId || (value as { _bsontype?: string })._bsontype === 'ObjectId') {
        return JSON.stringify(value.toString());
      }

      const obj = value as Record<string, unknown>;
      // Skip undefined or transient fields
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function' && k !== '__v' && k !== '_id')
        .sort();

      const keyValPairs = keys.map((k) => {
        return `${JSON.stringify(k)}:${this.canonicalize(obj[k])}`;
      });

      return `{${keyValPairs.join(',')}}`;
    }

    return JSON.stringify(String(value));
  }

  /**
   * Computes the authoritative SHA-256 cryptographic hash over a canonical string.
   */
  public computeHash(canonicalString: string): string {
    return crypto
      .createHash('sha256')
      .update(Buffer.from(canonicalString, 'utf8'))
      .digest('hex');
  }

  // ---------------------------------------------------------------------------
  // Compilation Engine
  // ---------------------------------------------------------------------------

  /**
   * Compiles an immutable, tamper-evident Forensic Evidence Dossier for an enforcement case.
   */
  async compileDossier(
    caseIdentifier: string,
    actor?: { id?: string; name?: string },
  ): Promise<EvidenceDossierDto> {
    // 1. Fetch Case
    let caseDoc = await this.caseRepo.findByCaseId(caseIdentifier);
    if (!caseDoc && Types.ObjectId.isValid(caseIdentifier)) {
      caseDoc = await this.caseRepo.findById(caseIdentifier);
    }

    if (!caseDoc) {
      throw new AppError(
        `Enforcement Case "${caseIdentifier}" not found`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const caseId = caseDoc._id.toString();
    const caseNumber = caseDoc.caseId;

    // 2. Fetch Case Audit Trail
    const auditLogs = await this.auditRepo.findByCaseNumber(caseNumber);
    const auditTrail: EvidenceDossierAuditDto[] = auditLogs.map((log) => ({
      auditId: log.auditId,
      timestamp: log.timestamp.toISOString(),
      actorName: log.actorName,
      actorRole: log.actorRole,
      action: log.action,
      previousStatus: log.previousStatus,
      newStatus: log.newStatus,
      remarks: log.remarks,
    }));

    // 3. Extract Case Details
    const rawCase = caseDoc as unknown as Record<string, unknown>;
    const zoneObj = rawCase.zoneId as Record<string, unknown> | undefined;
    const authObj = rawCase.authorizationId as Record<string, unknown> | undefined;
    const officerObj = rawCase.assignedOfficerId as Record<string, unknown> | undefined;

    const caseDetails: EvidenceDossierCaseDto = {
      caseId,
      caseNumber,
      title: caseDoc.title,
      description: caseDoc.description,
      severity: caseDoc.severity,
      caseType: caseDoc.caseType,
      status: caseDoc.status,
      zoneId: zoneObj?._id ? String(zoneObj._id) : (caseDoc.zoneId ? String(caseDoc.zoneId) : undefined),
      zoneName: zoneObj?.name ? String(zoneObj.name) : caseDoc.zoneName,
      authorizationId: authObj?._id ? String(authObj._id) : (caseDoc.authorizationId ? String(caseDoc.authorizationId) : undefined),
      permitNumber: authObj?.permitNumber ? String(authObj.permitNumber) : caseDoc.permitNumber,
      assignedOfficerId: officerObj?._id ? String(officerObj._id) : (caseDoc.assignedOfficerId ? String(caseDoc.assignedOfficerId) : undefined),
      assignedOfficerName: officerObj?.name ? String(officerObj.name) : caseDoc.assignedOfficerName,
      assignedAt: caseDoc.assignedAt?.toISOString(),
      investigationFindings: caseDoc.investigationFindings ?? [],
      fieldVerification: caseDoc.fieldVerification ? {
        verifiedAt: caseDoc.fieldVerification.verifiedAt?.toISOString(),
        locationCoordinates: caseDoc.fieldVerification.locationCoordinates,
        siteObservations: caseDoc.fieldVerification.siteObservations,
        photoUrls: caseDoc.fieldVerification.photoUrls,
        droneSurveyConducted: caseDoc.fieldVerification.droneSurveyConducted,
        groundDisturbanceConfirmed: caseDoc.fieldVerification.groundDisturbanceConfirmed,
        notes: caseDoc.fieldVerification.notes,
      } : undefined,
      enforcementAction: caseDoc.enforcementAction ? {
        actionType: caseDoc.enforcementAction.actionType!,
        actionDetails: caseDoc.enforcementAction.actionDetails!,
        actionDate: caseDoc.enforcementAction.actionDate?.toISOString() ?? new Date().toISOString(),
        penaltyAmountInr: caseDoc.enforcementAction.penaltyAmountInr,
        officialOrderReference: caseDoc.enforcementAction.officialOrderReference,
      } : undefined,
      resolutionInfo: caseDoc.resolutionInfo ? {
        resolvedAt: caseDoc.resolutionInfo.resolvedAt?.toISOString() ?? new Date().toISOString(),
        summary: caseDoc.resolutionInfo.summary,
        followUpRequired: caseDoc.resolutionInfo.followUpRequired,
      } : undefined,
      closedAt: caseDoc.closedAt?.toISOString(),
      createdAt: caseDoc.createdAt.toISOString(),
    };

    // 4. Reconciliation Details (if linked)
    let reconciliation: EvidenceDossierReconciliationDto | undefined;
    let transportSummary: EvidenceDossierTransportDto | undefined;

    const reconRaw = rawCase.reconciliationReportId as any;
    let reconDoc: any = null;
    if (reconRaw) {
      if (reconRaw.reconciliationId) {
        reconDoc = reconRaw;
      } else {
        const reconIdStr = reconRaw._id ? String(reconRaw._id) : String(reconRaw);
        if (Types.ObjectId.isValid(reconIdStr)) {
          reconDoc = await this.reconRepo.findById(reconIdStr);
        }
      }
    }

    if (reconDoc) {
      const periodStartIso =
        reconDoc.periodStart instanceof Date
          ? reconDoc.periodStart.toISOString()
          : new Date(reconDoc.periodStart).toISOString();
      const periodEndIso =
        reconDoc.periodEnd instanceof Date
          ? reconDoc.periodEnd.toISOString()
          : new Date(reconDoc.periodEnd).toISOString();

      reconciliation = {
        reconciliationId: reconDoc.reconciliationId,
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        discrepancyScore: reconDoc.discrepancyScore,
        reconciliationStatus: reconDoc.reconciliationStatus,
        anomaliesCount: reconDoc.anomalies?.length ?? 0,
        anomalies: (reconDoc.anomalies ?? []).map((a: any) => ({
          type: a.type,
          severity: a.severity,
          title: a.title,
          description: a.description,
          evidenceScore: a.evidenceScore,
          details: a.details,
        })),
        findings: reconDoc.findings ?? [],
        recommendations: reconDoc.recommendations ?? [],
      };

      if (reconDoc.permitSummary) {
        transportSummary = {
          permitNumber: reconDoc.permitSummary.permitNumber,
          mineralType: reconDoc.permitSummary.mineralType,
          authorizedQuantityTonnes: reconDoc.permitSummary.permittedWeightTonnes,
          declaredQuantityTonnes: reconDoc.transportSummary?.totalIssuedTonnage,
        };
      }
    }

    // 5. Change Detections & Alerts for Zone
    const changeDetections: EvidenceDossierChangeDetectionDto[] = [];
    const alerts: EvidenceDossierAlertDto[] = [];
    const satelliteLineage: EvidenceDossierSatelliteDto[] = [];

    const zoneIdStr = caseDetails.zoneId;
    if (zoneIdStr && Types.ObjectId.isValid(zoneIdStr)) {
      // Find change detections
      const changes = await this.changeRepo.findAll({
        zoneId: zoneIdStr,
        limit: 20,
      });

      for (const ch of changes) {
        changeDetections.push({
          changeId: ch.changeId,
          detectedAt: ch.detectedAt.toISOString(),
          sensorType: ch.sensorType,
          source: ch.source,
          monitoringTrack: ch.monitoringTrack,
          comparisonMode: ch.comparisonMode,
          zoneArea: ch.zoneArea,
          changedArea: ch.changedArea,
          affectedAreaPercentage: ch.affectedAreaPercentage,
          severity: ch.severity,
          highestThresholdCrossed: ch.highestThresholdCrossed,
          changedGeometry: ch.changedGeometry,
          rasterStatistics: ch.rasterStatistics,
          categories: ch.categories,
          auditStatus: ch.auditStatus,
        });

        // Collect satellite lineage if observation metadata exists
        if (ch.observationId) {
          const satMeta = await this.satelliteRepo.findById(ch.observationId.toString());
          if (satMeta) {
            const alreadyAdded = satelliteLineage.some((s) => s.imageId === satMeta.imageId);
            if (!alreadyAdded) {
              satelliteLineage.push({
                imageId: satMeta.imageId,
                source: satMeta.source,
                sensorType: satMeta.sensorType,
                acquisitionDate: satMeta.acquisitionDate.toISOString(),
                cloudCover: satMeta.cloudCover,
                geeReference: satMeta.geeReference,
                processingMode: satMeta.mode as any,
              });
            }
          }
        }
      }

      // Find alerts
      const alertDocs = await this.alertRepo.findByZoneId(zoneIdStr, 20);

      for (const al of alertDocs) {
        alerts.push({
          alertId: al.alertId,
          detectedAt: al.detectedAt.toISOString(),
          severity: al.severity,
          thresholdsCrossed: al.thresholdsCrossed,
          highestThresholdCrossed: al.highestThresholdCrossed,
          evidenceStrength: al.evidenceStrength,
          status: al.status,
          explanation: al.explanation,
          comparisonMode: al.comparisonMode,
        });
      }
    }

    // 6. Checkpoint Logs
    const checkpointPassages: EvidenceDossierCheckpointDto[] = [];
    if (caseDetails.permitNumber) {
      const logs = await this.checkpointLogRepo.findAll({
        limit: 50,
      });
      const matching = logs.filter((l) => l.permitNumber === caseDetails.permitNumber);
      for (const l of matching) {
        checkpointPassages.push({
          logId: l.logId,
          checkpointName: l.checkpointName,
          passNumber: l.passNumber,
          verificationTimestamp: l.verificationTimestamp.toISOString(),
          verificationResult: l.verificationResult,
          rejectionReasons: l.rejectionReasons ?? [],
          locationStatus: l.locationStatus,
          distanceFromCheckpointMeters: l.distanceFromCheckpointMeters,
          scannedCoordinates: l.scannedCoordinates,
        });
      }
    }

    // 7. UAV / Field Verification
    let uavVerification: EvidenceDossierUavDto | undefined;
    if (caseDoc.fieldVerification) {
      uavVerification = {
        droneSurveyConducted: caseDoc.fieldVerification.droneSurveyConducted ?? false,
        groundDisturbanceConfirmed: caseDoc.fieldVerification.groundDisturbanceConfirmed ?? false,
        siteObservations: caseDoc.fieldVerification.siteObservations,
        locationCoordinates: caseDoc.fieldVerification.locationCoordinates,
        photoCount: caseDoc.fieldVerification.photoUrls?.length ?? 0,
        photoUrls: caseDoc.fieldVerification.photoUrls,
        verifiedAt: caseDoc.fieldVerification.verifiedAt?.toISOString(),
      };
    }

    // 8. Assemble structured dossier data
    const dossierData: IEvidenceDossierData = {
      caseDetails,
      satelliteLineage,
      changeDetections,
      alerts,
      reconciliation,
      transportSummary,
      checkpointPassages,
      uavVerification,
      auditTrail,
    };

    // 9. Determine version number
    const count = await this.dossierRepo.countByCaseId(caseId);
    const dossierVersion = count + 1;
    const dossierId = `DOSSIER-${caseNumber}-V${dossierVersion}-${Date.now()}`;

    // 10. Generate Deterministic Canonical String & SHA-256 Hash
    const canonicalPayload = this.canonicalize({
      dossierId,
      caseNumber,
      dossierVersion,
      dossierData,
    });

    const dossierHash = this.computeHash(canonicalPayload);

    // 11. Create & Seal Dossier Record
    const created = await this.dossierRepo.create({
      dossierId,
      caseId: new Types.ObjectId(caseId),
      caseNumber,
      dossierVersion,
      dossierHash,
      hashAlgorithm: 'SHA-256',
      isSealed: true,
      sealedAt: new Date(),
      sealedBy: actor?.id && Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined,
      sealedByName: actor?.name ?? 'System Officer',
      canonicalPayload,
      dossierData,
    });

    const dto = created.toDto();
    dto.integrity = {
      isValid: true,
      isTampered: false,
      storedHash: dossierHash,
      computedHash: dossierHash,
      algorithm: 'SHA-256',
      verifiedAt: new Date().toISOString(),
      message: 'Cryptographic signature is authoritative and uncompromised.',
    };

    return dto;
  }

  // ---------------------------------------------------------------------------
  // Integrity Verification
  // ---------------------------------------------------------------------------

  /**
   * Verifies the cryptographic integrity of a sealed Evidence Dossier.
   * If any character in canonicalPayload or storedHash differs, flags as TAMPERED.
   */
  async verifyDossierIntegrity(dossierIdentifier: string): Promise<VerifyDossierResponseDto> {
    let dossier = await this.dossierRepo.findByDossierId(dossierIdentifier);
    if (!dossier && Types.ObjectId.isValid(dossierIdentifier)) {
      dossier = await this.dossierRepo.findById(dossierIdentifier);
    }

    if (!dossier) {
      throw new AppError(
        `Evidence Dossier "${dossierIdentifier}" not found`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const computedHash = this.computeHash(dossier.canonicalPayload);
    const storedHash = dossier.dossierHash;

    const storedBuf = Buffer.from(storedHash, 'hex');
    const computedBuf = Buffer.from(computedHash, 'hex');

    let isValid = false;
    if (storedBuf.length === computedBuf.length && crypto.timingSafeEqual(storedBuf, computedBuf)) {
      isValid = true;
    }

    const verifiedAt = new Date().toISOString();

    if (!isValid) {
      return {
        dossierId: dossier.dossierId,
        isValid: false,
        isTampered: true,
        storedHash,
        computedHash,
        algorithm: dossier.hashAlgorithm,
        verifiedAt,
        discrepancyDetails: `Cryptographic digest mismatch: Expected ${storedHash}, computed ${computedHash}`,
      };
    }

    return {
      dossierId: dossier.dossierId,
      isValid: true,
      isTampered: false,
      storedHash,
      computedHash,
      algorithm: dossier.hashAlgorithm,
      verifiedAt,
    };
  }

  /**
   * Retrieves the latest sealed dossier for an enforcement case, attaching live verification.
   */
  async getLatestDossierForCase(caseIdentifier: string): Promise<EvidenceDossierDto | null> {
    const dossier = await this.dossierRepo.findLatestByCaseId(caseIdentifier);
    if (!dossier) return null;

    const dto = dossier.toDto();
    const verification = await this.verifyDossierIntegrity(dossier.dossierId);
    dto.integrity = {
      isValid: verification.isValid,
      isTampered: verification.isTampered,
      storedHash: verification.storedHash,
      computedHash: verification.computedHash,
      algorithm: verification.algorithm,
      verifiedAt: verification.verifiedAt,
      message: verification.isValid
        ? 'Cryptographic seal verified successfully.'
        : 'CRITICAL WARNING: Dossier content has been altered post-sealing!',
      discrepancyDetails: verification.discrepancyDetails,
    };

    return dto;
  }

  /**
   * Retrieves all historical sealed dossiers for an enforcement case.
   */
  async getAllDossiersForCase(caseIdentifier: string): Promise<EvidenceDossierDto[]> {
    const list = await this.dossierRepo.findAllByCaseId(caseIdentifier);
    return list.map((d) => d.toDto());
  }

  /**
   * Retrieves a dossier by dossierId.
   */
  async getDossierById(dossierId: string): Promise<EvidenceDossierDto> {
    const dossier = await this.dossierRepo.findByDossierId(dossierId);
    if (!dossier) {
      throw new AppError(`Evidence Dossier "${dossierId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    const dto = dossier.toDto();
    const verification = await this.verifyDossierIntegrity(dossier.dossierId);
    dto.integrity = {
      isValid: verification.isValid,
      isTampered: verification.isTampered,
      storedHash: verification.storedHash,
      computedHash: verification.computedHash,
      algorithm: verification.algorithm,
      verifiedAt: verification.verifiedAt,
      message: verification.isValid
        ? 'Cryptographic seal verified successfully.'
        : 'CRITICAL WARNING: Dossier content has been altered post-sealing!',
      discrepancyDetails: verification.discrepancyDetails,
    };

    return dto;
  }
}

export const evidenceDossierService = new EvidenceDossierService();
