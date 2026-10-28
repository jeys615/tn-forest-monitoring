import { Types } from 'mongoose';
import {
  ReconciliationReportRepository,
  reconciliationReportRepository,
  type ReconciliationReportFilters,
} from '../repositories/ReconciliationReportRepository.js';
import {
  MiningAuthorizationRepository,
  miningAuthorizationRepository,
} from '../repositories/MiningAuthorizationRepository.js';
import {
  EPassRepository,
} from '../repositories/EPassRepository.js';
import {
  CheckpointLogRepository,
} from '../repositories/CheckpointLogRepository.js';
import {
  ZoneRepository,
  zoneRepository,
} from '../repositories/ZoneRepository.js';
import {
  ChangeDetectionRepository,
} from '../repositories/ChangeDetectionRepository.js';
import {
  MiningExtractionEstimateRepository,
} from '../repositories/MiningExtractionEstimateRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import {
  type ReconciliationReportDto,
  type RunReconciliationRequest,
  type UpdateReconciliationStatusRequest,
  type ReconciliationSummaryDto,
  type AuthorizedPermitSummary,
  type TransportSummary,
  type CheckpointSummaryInRecon,
  type SatelliteSummaryInRecon,
  type ReconciliationAnomalyItem,
  ReconciliationStatus,
  ReconciliationReportStatus,
  ReconciliationAnomalyType,
  ReconciliationAnomalySeverity,
  EPassStatus,
  MiningAuthorizationStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
} from '@tn-forest/shared/types';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';

export class ReconciliationService {
  constructor(
    private reconRepo: ReconciliationReportRepository = reconciliationReportRepository,
    private authRepo: MiningAuthorizationRepository = miningAuthorizationRepository,
    private epassRepo: EPassRepository = new EPassRepository(),
    private checkpointLogRepo: CheckpointLogRepository = new CheckpointLogRepository(),
    private zoneRepo: ZoneRepository = zoneRepository,
    private changeRepo: ChangeDetectionRepository = new ChangeDetectionRepository(),
    private miningEstimateRepo: MiningExtractionEstimateRepository = new MiningExtractionEstimateRepository(),
    private userRepo: UserRepository = new UserRepository(),
  ) {}

  /**
   * Runs multi-dimensional reconciliation for a Monitored Zone or Mining Authorization.
   */
  async runReconciliation(
    data: RunReconciliationRequest,
    userId?: string,
  ): Promise<ReconciliationReportDto> {
    const {
      zoneId,
      authorizationId,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      mineralDensityTonnesPerCubicMeter = 2.6,
      discrepancyTolerancePercent = 15.0,
      notes,
    } = data;

    if (!zoneId && !authorizationId) {
      throw new AppError('Either zoneId or authorizationId must be provided', HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Resolve Period
    const now = new Date();
    const periodEnd = periodEndStr ? new Date(periodEndStr) : now;
    const periodStart = periodStartStr
      ? new Date(periodStartStr)
      : new Date(periodEnd.getTime() - 90 * 24 * 3600 * 1000); // default past 90 days

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      throw new AppError('Invalid periodStart or periodEnd date format', HTTP_STATUS.BAD_REQUEST);
    }
    if (periodStart >= periodEnd) {
      throw new AppError('periodStart must be strictly before periodEnd', HTTP_STATUS.BAD_REQUEST);
    }

    // 2. Resolve Monitored Zone & Mining Authorization
    let zoneDoc = null;
    let authDoc = null;
    let resolvedZoneId = zoneId;
    let resolvedAuthId = authorizationId;

    if (authorizationId) {
      authDoc = await this.authRepo.findById(authorizationId);
      if (!authDoc) {
        authDoc = await this.authRepo.findByPermitNumber(authorizationId);
      }
      if (!authDoc) {
        throw new AppError(`Mining authorization "${authorizationId}" not found`, HTTP_STATUS.NOT_FOUND);
      }
      resolvedAuthId = authDoc._id.toString();
      if (authDoc.zoneId) {
        const rawZoneId = authDoc.zoneId as unknown;
        resolvedZoneId =
          typeof rawZoneId === 'object' && rawZoneId !== null && '_id' in rawZoneId
            ? String((rawZoneId as { _id: unknown })._id)
            : String(rawZoneId);
      }
    }

    if (resolvedZoneId) {
      zoneDoc = await this.zoneRepo.findById(resolvedZoneId);
      if (!zoneDoc && !authDoc) {
        throw new AppError(`Monitored zone "${resolvedZoneId}" not found`, HTTP_STATUS.NOT_FOUND);
      }
      // If we didn't have an authorizationId, find authorizations on this zone
      if (!authDoc && resolvedZoneId) {
        const zoneAuths = await this.authRepo.findAll({ zoneId: resolvedZoneId });
        if (zoneAuths.length > 0) {
          authDoc = zoneAuths[0];
          resolvedAuthId = authDoc._id.toString();
        }
      }
    }

    const zoneName = zoneDoc ? zoneDoc.name : undefined;
    const permitNumber = authDoc ? authDoc.permitNumber : undefined;

    // 3. Compile Dimension 1: Mining Authorization Summary
    let permitSummary: AuthorizedPermitSummary | undefined = undefined;
    if (authDoc) {
      permitSummary = {
        permitNumber: authDoc.permitNumber,
        lesseeName: authDoc.lesseeName,
        mineralType: authDoc.mineralType,
        permittedWeightTonnes: authDoc.permittedWeightTonnes,
        remainingQuota: authDoc.remainingQuota,
        status: authDoc.status,
        validFrom: authDoc.validFrom instanceof Date ? authDoc.validFrom.toISOString() : String(authDoc.validFrom),
        validUntil: authDoc.validUntil instanceof Date ? authDoc.validUntil.toISOString() : String(authDoc.validUntil),
      };
    }

    // 4. Compile Dimension 2: E-Pass Transport Logistics Summary
    let epasses: Array<{ passNumber: string; netWeightTonnes?: number; status: EPassStatus; createdAt: Date }> = [];
    if (resolvedAuthId) {
      epasses = await this.epassRepo.findAll({
        authorizationId: resolvedAuthId,
        startDate: periodStart,
        endDate: periodEnd,
      });
    } else if (resolvedZoneId) {
      const zoneAuths = await this.authRepo.findAll({ zoneId: resolvedZoneId });
      if (zoneAuths.length > 0) {
        for (const za of zoneAuths) {
          const passes = await this.epassRepo.findAll({
            authorizationId: za._id.toString(),
            startDate: periodStart,
            endDate: periodEnd,
          });
          epasses.push(...passes);
        }
      }
    }



    let totalIssuedTonnage = 0;
    let totalVerifiedTonnage = 0;
    let totalPassesUsed = 0;
    let totalPassesCancelled = 0;
    let totalPassesExpired = 0;
    let activePassCount = 0;

    for (const ep of epasses) {
      if (ep.status === EPassStatus.CANCELLED) {
        totalPassesCancelled++;
        continue;
      }
      totalIssuedTonnage += ep.netWeightTonnes || 0;

      if (ep.status === EPassStatus.USED) {
        totalPassesUsed++;
        totalVerifiedTonnage += ep.netWeightTonnes || 0;
      } else if (ep.status === EPassStatus.ACTIVE) {
        activePassCount++;
      } else if (ep.status === EPassStatus.EXPIRED) {
        totalPassesExpired++;
      }
    }

    const transportSummary: TransportSummary = {
      totalPassesIssued: epasses.length,
      totalIssuedTonnage: Math.round(totalIssuedTonnage * 100) / 100,
      totalPassesUsed,
      totalVerifiedTonnage: Math.round(totalVerifiedTonnage * 100) / 100,
      totalPassesCancelled,
      totalPassesExpired,
      activePassCount,
    };

    // 5. Compile Dimension 3: Checkpoint Verified Passages
    const checkpointLogs = await this.checkpointLogRepo.findAll({
      startDate: periodStart,
      endDate: periodEnd,
    });

    // Filter logs relevant to these passes / permit
    const relevantPassNumbers = new Set(epasses.map((e) => e.passNumber));
    const relevantLogs = checkpointLogs.filter(
      (log) =>
        (log.permitNumber && log.permitNumber === permitNumber) ||
        (log.passNumber && relevantPassNumbers.has(log.passNumber)),
    );

    let validScans = 0;
    let invalidScans = 0;
    let outsideGeofenceScans = 0;
    let transitPassageCount = 0;
    let totalTransitTonnage = 0;

    for (const log of relevantLogs) {
      if (log.verificationResult === CheckpointVerificationResult.VALID) {
        validScans++;
      } else {
        invalidScans++;
      }

      if (log.locationStatus === LocationVerificationStatus.OUTSIDE_CHECKPOINT_GEOFENCE) {
        outsideGeofenceScans++;
      }

      // Check if passage recorded
      if (log.declaredQuantityTonnes && log.declaredQuantityTonnes > 0) {
        transitPassageCount++;
        totalTransitTonnage += log.declaredQuantityTonnes;
      }
    }

    const checkpointSummary: CheckpointSummaryInRecon = {
      totalScans: relevantLogs.length,
      validScans,
      invalidScans,
      outsideGeofenceScans,
      transitPassageCount,
      totalTransitTonnage: Math.round(totalTransitTonnage * 100) / 100,
    };

    // 6. Compile Dimension 4: Satellite Environmental Observations
    let totalDisturbedAreaHectares = 0;
    let maxEvidenceStrength = 0;
    let observationCount = 0;
    const miningClassificationsSet = new Set<string>();

    if (resolvedZoneId) {
      const changeDetections = await this.changeRepo.findAll({ zoneId: resolvedZoneId });
      const inRangeChanges = changeDetections.filter((c) => {
        const d = new Date(c.detectedAt);
        return d >= periodStart && d <= periodEnd;
      });

      observationCount = inRangeChanges.length;
      for (const ch of inRangeChanges) {
        if (ch.changedArea) {
          totalDisturbedAreaHectares += ch.changedArea;
        }
        if (ch.evidenceStrength && ch.evidenceStrength > maxEvidenceStrength) {
          maxEvidenceStrength = ch.evidenceStrength;
        }
        if (ch.categories && ch.categories.length > 0) {
          for (const cat of ch.categories) {
            miningClassificationsSet.add(cat);
          }
        }
      }
    }

    // Check DEM Volumetric extraction if available
    let estimatedExtractionVolumeCubicMeters: number | undefined = undefined;
    let estimatedTonnageEquivalent: number | undefined = undefined;

    if (resolvedZoneId) {
      const estimates = await this.miningEstimateRepo.findByMarkedAreaId(resolvedZoneId);
      const inRangeEstimates = estimates.filter((e) => {
        const d = new Date(e.observationDate);
        return d >= periodStart && d <= periodEnd;
      });

      let sumVolume = 0;
      for (const est of inRangeEstimates) {
        if (est.isVolumeAvailable && est.estimatedVolumeCubicMeters) {
          sumVolume += est.estimatedVolumeCubicMeters;
        }
      }

      if (sumVolume > 0) {
        estimatedExtractionVolumeCubicMeters = Math.round(sumVolume * 100) / 100;
        estimatedTonnageEquivalent =
          Math.round(sumVolume * mineralDensityTonnesPerCubicMeter * 100) / 100;
      }
    }

    const satelliteSummary: SatelliteSummaryInRecon = {
      observationCount,
      totalDisturbedAreaHectares: Math.round(totalDisturbedAreaHectares * 100) / 100,
      estimatedExtractionVolumeCubicMeters,
      estimatedTonnageEquivalent,
      densityUsedTonnesPerCubicMeter: mineralDensityTonnesPerCubicMeter,
      maxEvidenceStrength,
      miningClassifications: Array.from(miningClassificationsSet),
      disclaimer:
        'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
    };

    // 7. Multi-Factor Anomaly Detection Engine
    const anomalies: ReconciliationAnomalyItem[] = [];
    const findings: string[] = [];
    const recommendations: string[] = [];

    // Anomaly Check 1: Permit Validity & Status
    if (authDoc) {
      if (
        authDoc.status === MiningAuthorizationStatus.SUSPENDED ||
        authDoc.status === MiningAuthorizationStatus.REVOKED
      ) {
        if (transportSummary.totalPassesIssued > 0 || checkpointSummary.validScans > 0) {
          anomalies.push({
            type: ReconciliationAnomalyType.SUSPENDED_MINING_ACTIVITY,
            severity: ReconciliationAnomalySeverity.CRITICAL,
            title: `Transport activity detected under ${authDoc.status} permit`,
            description: `Mining permit "${authDoc.permitNumber}" has status ${authDoc.status}, but ${transportSummary.totalPassesIssued} E-Passes and ${checkpointSummary.validScans} checkpoint passages were recorded.`,
            evidenceScore: 95,
            details: { permitStatus: authDoc.status, totalIssuedTonnage },
          });
          findings.push(`Permit ${authDoc.permitNumber} is ${authDoc.status}, yet transport activity was logged.`);
          recommendations.push('Immediately issue halt order and dispatch field enforcement squad to inspect quarry boundary.');
        }
      }

      const validUntilDate = new Date(authDoc.validUntil);
      if (validUntilDate < now && (transportSummary.activePassCount > 0 || totalIssuedTonnage > 0)) {
        // Check if any passes were created after expiration
        const expiredPasses = epasses.filter((ep) => new Date(ep.createdAt) > validUntilDate);
        if (expiredPasses.length > 0) {
          anomalies.push({
            type: ReconciliationAnomalyType.EXPIRED_PERMIT_TRANSIT,
            severity: ReconciliationAnomalySeverity.HIGH,
            title: 'E-Passes issued after authorization expiration',
            description: `${expiredPasses.length} E-Passes were generated after the permit expiry date (${validUntilDate.toISOString().slice(0, 10)}).`,
            evidenceScore: 85,
            details: { expiredPassCount: expiredPasses.length },
          });
          findings.push(`Found ${expiredPasses.length} E-Passes issued past permit expiration date.`);
          recommendations.push('Cancel active passes associated with expired permit and audit issuing officer records.');
        }
      }
    }

    // Anomaly Check 2: Transport Over-Quota Breach
    if (authDoc && authDoc.permittedWeightTonnes) {
      if (transportSummary.totalIssuedTonnage > authDoc.permittedWeightTonnes) {
        const excess = transportSummary.totalIssuedTonnage - authDoc.permittedWeightTonnes;
        const excessPercent = Math.round((excess / authDoc.permittedWeightTonnes) * 100);
        const severity =
          excessPercent > 20
            ? ReconciliationAnomalySeverity.CRITICAL
            : ReconciliationAnomalySeverity.HIGH;

        anomalies.push({
          type: ReconciliationAnomalyType.EXCESS_TRANSPORT_OVER_PERMIT,
          severity,
          title: `Issued transport exceeds authorized permit quota by ${excessPercent}%`,
          description: `Total issued E-Pass weight (${transportSummary.totalIssuedTonnage} tonnes) exceeds permitted lease quota (${authDoc.permittedWeightTonnes} tonnes) by ${excess.toFixed(1)} tonnes.`,
          evidenceScore: Math.min(100, 70 + excessPercent),
          details: { permittedWeightTonnes: authDoc.permittedWeightTonnes, totalIssuedTonnage, excessTonnes: excess },
        });
        findings.push(`Permitted quota of ${authDoc.permittedWeightTonnes} tonnes exceeded by ${excess.toFixed(1)} tonnes (${excessPercent}% excess).`);
        recommendations.push('Freeze authorization remaining quota and conduct on-site volumetric audit.');
      }
    }

    // Anomaly Check 3: Unverified Transit Gap (Issued vs Checkpoint Verified)
    if (transportSummary.totalIssuedTonnage > 0) {
      const transitGapTonnage = transportSummary.totalIssuedTonnage - transportSummary.totalVerifiedTonnage;
      const unverifiedRatio = transitGapTonnage / transportSummary.totalIssuedTonnage;

      if (transitGapTonnage > 10.0 && unverifiedRatio > 0.25) {
        const gapPercent = Math.round(unverifiedRatio * 100);
        anomalies.push({
          type: ReconciliationAnomalyType.UNVERIFIED_TRANSIT_GAP,
          severity: gapPercent > 50 ? ReconciliationAnomalySeverity.HIGH : ReconciliationAnomalySeverity.MEDIUM,
          title: `Unverified transit gap of ${transitGapTonnage.toFixed(1)} tonnes (${gapPercent}%)`,
          description: `${transitGapTonnage.toFixed(1)} tonnes across ${transportSummary.totalPassesIssued - transportSummary.totalPassesUsed} E-Passes were issued but never scanned/recorded at destination checkpoints.`,
          evidenceScore: Math.min(100, 50 + gapPercent / 2),
          details: { transitGapTonnage, unverifiedRatio: gapPercent },
        });
        findings.push(`${gapPercent}% of issued transport tonnage (${transitGapTonnage.toFixed(1)} tonnes) bypassed checkpoint verification.`);
        recommendations.push('Cross-reference vehicle registration numbers against regional automated number plate recognition (ANPR) cameras.');
      }
    }

    // Anomaly Check 4: Satellite Disturbance with Zero / Low Transport (Illicit Extraction)
    if (satelliteSummary.totalDisturbedAreaHectares >= 0.2 || (estimatedExtractionVolumeCubicMeters && estimatedExtractionVolumeCubicMeters > 200)) {
      if (transportSummary.totalIssuedTonnage < 5.0) {
        anomalies.push({
          type: ReconciliationAnomalyType.EXCESS_EXTRACTION_UNRECORDED_TRANSPORT,
          severity: ReconciliationAnomalySeverity.CRITICAL,
          title: 'Satellite detects significant excavation with zero/low declared transport',
          description: `Satellite observations detected ${satelliteSummary.totalDisturbedAreaHectares} ha of ground disturbance (Evidence score: ${satelliteSummary.maxEvidenceStrength}), but declared transport is only ${transportSummary.totalIssuedTonnage} tonnes.`,
          evidenceScore: Math.min(100, satelliteSummary.maxEvidenceStrength || 80),
          details: {
            totalDisturbedAreaHectares: satelliteSummary.totalDisturbedAreaHectares,
            totalIssuedTonnage: transportSummary.totalIssuedTonnage,
          },
        });
        findings.push(`Physical disturbance of ${satelliteSummary.totalDisturbedAreaHectares} ha identified without corresponding transport E-Passes.`);
        recommendations.push('Initiate unrecorded extraction investigation and deploy UAV drone mapping team.');
      }
    }

    // Anomaly Check 5: Extraction on Protected Zone without Mining Authorization
    if (zoneDoc && !authDoc && satelliteSummary.totalDisturbedAreaHectares >= 0.2) {
      anomalies.push({
        type: ReconciliationAnomalyType.EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY,
        severity: ReconciliationAnomalySeverity.CRITICAL,
        title: `Disturbance detected on protected zone "${zoneDoc.name}" without mining permit`,
        description: `Satellite telemetry indicates ${satelliteSummary.totalDisturbedAreaHectares} ha disturbance in non-mining zone ${zoneDoc.name}.`,
        evidenceScore: 90,
        details: { zoneName: zoneDoc.name, totalDisturbedAreaHectares: satelliteSummary.totalDisturbedAreaHectares },
      });
      findings.push(`Unauthorized ground disturbance on protected forest zone (${zoneDoc.name}).`);
      recommendations.push('File immediate FIR under Tamil Nadu Forest Act and dispatch rapid response patrol.');
    }

    // Anomaly Check 6: DEM Volume vs Declared Transport Disproportion
    if (estimatedTonnageEquivalent && estimatedTonnageEquivalent > 50 && transportSummary.totalIssuedTonnage > 0) {
      const maxVal = Math.max(estimatedTonnageEquivalent, transportSummary.totalIssuedTonnage);
      const minVal = Math.min(estimatedTonnageEquivalent, transportSummary.totalIssuedTonnage);
      const diffPercent = Math.round(((maxVal - minVal) / maxVal) * 100);

      if (diffPercent > discrepancyTolerancePercent) {
        anomalies.push({
          type: ReconciliationAnomalyType.VOLUME_TONNAGE_DISPROPORTION,
          severity: diffPercent > 40 ? ReconciliationAnomalySeverity.HIGH : ReconciliationAnomalySeverity.MEDIUM,
          title: `DEM volumetric estimation diverges from declared weight by ${diffPercent}%`,
          description: `DEM estimated extraction volume (${estimatedExtractionVolumeCubicMeters} m³ ≈ ${estimatedTonnageEquivalent} tonnes at density ${mineralDensityTonnesPerCubicMeter} t/m³) diverges from declared transport (${transportSummary.totalIssuedTonnage} tonnes) beyond the ${discrepancyTolerancePercent}% tolerance limit.`,
          evidenceScore: Math.min(100, 40 + diffPercent / 2),
          details: {
            estimatedVolumeCubicMeters: estimatedExtractionVolumeCubicMeters,
            estimatedTonnageEquivalent,
            totalIssuedTonnage: transportSummary.totalIssuedTonnage,
            divergencePercent: diffPercent,
          },
        });
        findings.push(`Volumetric elevation extraction estimate (${estimatedTonnageEquivalent} tonnes) differs from transport log (${transportSummary.totalIssuedTonnage} tonnes) by ${diffPercent}%.`);
        recommendations.push('Conduct ground-truth topographical survey to calibrate DEM elevation benchmarks.');
      }
    }

    // 8. Compute Discrepancy Score (0–100) & Reconciliation Status
    let scoreAccumulator = 0;
    for (const an of anomalies) {
      if (an.severity === ReconciliationAnomalySeverity.CRITICAL) scoreAccumulator += 35;
      else if (an.severity === ReconciliationAnomalySeverity.HIGH) scoreAccumulator += 20;
      else if (an.severity === ReconciliationAnomalySeverity.MEDIUM) scoreAccumulator += 10;
      else if (an.severity === ReconciliationAnomalySeverity.LOW) scoreAccumulator += 5;
    }

    const discrepancyScore = Math.min(100, Math.max(0, scoreAccumulator));

    let reconciliationStatus = ReconciliationStatus.COMPLIANT;
    if (discrepancyScore >= 50 || anomalies.some((a) => a.severity === ReconciliationAnomalySeverity.CRITICAL)) {
      reconciliationStatus = ReconciliationStatus.CRITICAL_ANOMALY;
    } else if (discrepancyScore >= 15 || anomalies.length > 0) {
      reconciliationStatus = ReconciliationStatus.FLAGGED_DISCREPANCY;
    }

    if (findings.length === 0) {
      findings.push('All satellite observations, mining authorizations, E-Passes, and checkpoint verifications are within legal tolerance limits.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Continue routine automated monitoring and schedule standard periodic audit.');
    }

    // 9. Persist Reconciliation Report
    const reconciliationId = `REC-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const reportDoc = await this.reconRepo.create({
      reconciliationId,
      zoneId: resolvedZoneId ? new Types.ObjectId(resolvedZoneId) : undefined,
      zoneName,
      authorizationId: resolvedAuthId ? new Types.ObjectId(resolvedAuthId) : undefined,
      permitNumber,
      periodStart,
      periodEnd,
      status:
        reconciliationStatus === ReconciliationStatus.COMPLIANT
          ? ReconciliationReportStatus.FINALIZED
          : ReconciliationReportStatus.UNDER_INVESTIGATION,
      reconciliationStatus,
      discrepancyScore,
      permitSummary,
      transportSummary,
      checkpointSummary,
      satelliteSummary,
      anomalies,
      findings,
      recommendations,
      investigationNotes: notes,
      generatedBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    return reportDoc.toDto();
  }

  async getAllReports(filters: ReconciliationReportFilters = {}): Promise<ReconciliationReportDto[]> {
    const list = await this.reconRepo.findAll(filters);
    return list.map((r) => r.toDto());
  }

  async getReportById(id: string): Promise<ReconciliationReportDto> {
    let report = null;
    if (Types.ObjectId.isValid(id)) {
      report = await this.reconRepo.findById(id);
    }
    if (!report) {
      report = await this.reconRepo.findByReconciliationId(id);
    }
    if (!report) {
      throw new AppError(`Reconciliation report "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    return report.toDto();
  }


  async updateReportStatus(
    id: string,
    data: UpdateReconciliationStatusRequest,
    userId?: string,
  ): Promise<ReconciliationReportDto> {
    let report = null;
    if (Types.ObjectId.isValid(id)) {
      report = await this.reconRepo.findById(id);
    }
    if (!report) {
      report = await this.reconRepo.findByReconciliationId(id);
    }
    if (!report) {
      throw new AppError(`Reconciliation report "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    const updateFields: Partial<{
      status: ReconciliationReportStatus;
      investigationNotes: string;
      resolvedBy: Types.ObjectId;
      resolvedAt: Date;
    }> = {
      status: data.status,
    };

    if (data.investigationNotes) {
      updateFields.investigationNotes = data.investigationNotes;
    }

    if (data.status === ReconciliationReportStatus.RESOLVED) {
      if (userId) updateFields.resolvedBy = new Types.ObjectId(userId);
      updateFields.resolvedAt = new Date();
    }

    const updated = await this.reconRepo.update(report._id, updateFields);
    if (!updated) {
      throw new AppError('Failed to update reconciliation report status', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    return updated.toDto();
  }

  async getSummary(): Promise<ReconciliationSummaryDto> {
    return await this.reconRepo.getSummary();
  }

  async getZoneReconciliationHistory(zoneId: string): Promise<ReconciliationReportDto[]> {
    const list = await this.reconRepo.findAll({ zoneId });
    return list.map((r) => r.toDto());
  }
}

export const reconciliationService = new ReconciliationService();
