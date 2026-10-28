import { Types } from 'mongoose';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { AlertModel } from '../models/Alert.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { TemporaryAreaModel } from '../models/TemporaryArea.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { EPassModel } from '../models/EPass.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { EvidenceDossierModel } from '../models/EvidenceDossier.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  ZoneCategory,
  ZoneStatus,
  ZoneRiskLevel,
  DecisionSupportCategory,
  TimeRangePreset,
  AlertStatus,
  AlertSeverity,
  CaseStatus,
  CaseSeverity,
  ReconciliationStatus,
  LocationVerificationStatus,
  type ExecutiveIntelligenceSummaryDto,
  type ZoneRiskIntelligenceDto,
  type CrossModuleCorrelationDto,
  type AlertIntelligenceSummaryDto,
  type TransportMiningIntelligenceSummaryDto,
  type EnforcementIntelligenceSummaryDto,
  type TrendAnalyticsDto,
  type HotspotPriorityRankingsDto,
  type DecisionSupportSummaryDto,
  type IntelligenceQueryFilters,
  type EnforcementActionType,
  type InvestigationTimelineItemDto,
  type InvestigationTimelineDto,
  type IntelligenceSearchResultItemDto,
  type IntelligenceSearchDto,
  type AlertLineageCorrelationDto,
  type LeaseLineageCorrelationDto,
  type VehicleLineageCorrelationDto,
  type EPassLineageCorrelationDto,
} from '@tn-forest/shared/types';

const STATUTORY_DISCLAIMER =
  'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.';

export class IntelligenceDashboardService {
  /**
   * 1. Executive Intelligence Dashboard Summary
   */
  async getExecutiveSummary(): Promise<ExecutiveIntelligenceSummaryDto> {
    const [
      zones,
      recentScansCount,
      recentAlertsCount,
      criticalAlertsCount,
      highAlertsCount,
      tempAreasCount,
      activeAuthorizationsCount,
      activeEPassesCount,
      checkpointPassagesCount,
      reconciliationReportsCount,
      criticalDiscrepanciesCount,
      activeEnforcementCasesCount,
      investigationRequiredCasesCount,
      closedEnforcementCasesCount,
      recentEnforcementActionsCount,
    ] = await Promise.all([
      Zone.find({}).lean(),
      SatelliteMetadata.countDocuments({
        acquisitionDate: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      }),
      AlertModel.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      }),
      AlertModel.countDocuments({
        severity: AlertSeverity.HIGH,
        highestThresholdCrossed: { $gte: 10 },
        status: { $ne: AlertStatus.RESOLVED },
      }),
      AlertModel.countDocuments({
        severity: AlertSeverity.HIGH,
        highestThresholdCrossed: { $lt: 10 },
        status: { $ne: AlertStatus.RESOLVED },
      }),
      TemporaryAreaModel.countDocuments({}),
      MiningAuthorizationModel.countDocuments({ status: 'ACTIVE' }),
      EPassModel.countDocuments({ status: 'ACTIVE' }),
      CheckpointLogModel.countDocuments({}),
      ReconciliationReportModel.countDocuments({}),
      ReconciliationReportModel.countDocuments({
        reconciliationStatus: ReconciliationStatus.CRITICAL_ANOMALY,
      }),
      EnforcementCaseModel.countDocuments({
        status: { $ne: CaseStatus.CLOSED },
      }),
      EnforcementCaseModel.countDocuments({
        status: {
          $in: [
            CaseStatus.UNDER_INVESTIGATION,
            CaseStatus.FIELD_VERIFICATION,
            CaseStatus.ACTION_REQUIRED,
          ],
        },
      }),
      EnforcementCaseModel.countDocuments({
        status: CaseStatus.CLOSED,
      }),
      EnforcementCaseModel.countDocuments({
        'enforcementAction.actionType': { $exists: true, $ne: null },
      }),
    ]);

    const totalMonitoredZones = zones.length;
    const activeZones = zones.filter((z) => z.status === ZoneStatus.PROTECTED).length;
    const suspiciousZones = zones.filter((z) => z.status === ZoneStatus.SUSPICIOUS).length;

    // Calculate risk distribution across all zones
    const zoneRiskList = await this.getZoneRiskList({ limit: 500 });
    const riskDistribution = {
      critical: zoneRiskList.filter((z) => z.riskLevel === ZoneRiskLevel.CRITICAL).length,
      high: zoneRiskList.filter((z) => z.riskLevel === ZoneRiskLevel.HIGH).length,
      medium: zoneRiskList.filter((z) => z.riskLevel === ZoneRiskLevel.MEDIUM).length,
      low: zoneRiskList.filter((z) => z.riskLevel === ZoneRiskLevel.LOW).length,
    };

    return {
      totalMonitoredZones,
      activeZones,
      suspiciousZones,
      recentSatelliteScansCount: recentScansCount,
      recentAlertsCount,
      criticalAlertsCount,
      highAlertsCount,
      temporaryMarkedAreasCount: tempAreasCount,
      activeMiningAuthorizationsCount: activeAuthorizationsCount,
      activeEPassesCount,
      checkpointPassagesCount,
      totalReconciliationReportsCount: reconciliationReportsCount,
      criticalDiscrepanciesCount,
      activeEnforcementCasesCount,
      investigationRequiredCasesCount,
      closedEnforcementCasesCount,
      recentEnforcementActionsCount,
      riskDistribution,
      disclaimer: STATUTORY_DISCLAIMER,
    };

  }

  /**
   * 2. Zone Risk Intelligence Ranking & List
   */
  async getZoneRiskList(filters: IntelligenceQueryFilters = {}): Promise<ZoneRiskIntelligenceDto[]> {
    const zoneQuery: Record<string, unknown> = {};
    if (filters.zoneId) {
      if (Types.ObjectId.isValid(filters.zoneId)) {
        zoneQuery._id = new Types.ObjectId(filters.zoneId);
      } else {
        zoneQuery.zoneId = filters.zoneId;
      }
    }
    if (filters.category) zoneQuery.category = filters.category;
    if (filters.status) zoneQuery.status = filters.status;

    const zones = await Zone.find(zoneQuery).lean();
    if (zones.length === 0) return [];

    const zoneObjectIds = zones.map((z) => z._id);

    // Fetch cross-module records in parallel
    const [
      allAlerts,
      allReconReports,
      allCases,
      allAuthorizations,
      allPasses,
      allLogs,
      allChanges,
    ] = await Promise.all([
      AlertModel.find({ zoneId: { $in: zoneObjectIds } }).lean(),
      ReconciliationReportModel.find({ zoneId: { $in: zoneObjectIds } })
        .sort({ createdAt: -1 })
        .lean(),
      EnforcementCaseModel.find({ zoneId: { $in: zoneObjectIds } })
        .sort({ createdAt: -1 })
        .lean(),
      MiningAuthorizationModel.find({ zoneId: { $in: zoneObjectIds } }).lean(),
      EPassModel.find({}).lean(),
      CheckpointLogModel.find({}).lean(),
      ChangeDetectionModel.find({ zoneId: { $in: zoneObjectIds } })
        .sort({ detectedAt: -1 })
        .lean(),
    ]);

    const result: ZoneRiskIntelligenceDto[] = [];

    for (const zone of zones) {
      const zIdStr = zone._id.toString();

      // Alerts for zone
      const zoneAlerts = allAlerts.filter((a) => a.zoneId?.toString() === zIdStr);
      const unresolvedAlerts = zoneAlerts.filter((a) => a.status !== AlertStatus.RESOLVED);
      const latestAlert = zoneAlerts.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

      // Reconciliation reports for zone
      const zoneRecons = allReconReports.filter((r) => r.zoneId?.toString() === zIdStr);
      const latestRecon = zoneRecons[0];

      // Enforcement cases for zone
      const zoneCases = allCases.filter((c) => c.zoneId?.toString() === zIdStr);
      const activeCases = zoneCases.filter((c) => c.status !== CaseStatus.CLOSED);
      const latestCase = zoneCases[0];

      // Authorizations & transport for zone
      const zoneAuths = allAuthorizations.filter((a) => a.zoneId?.toString() === zIdStr);
      const zoneAuthIds = new Set(zoneAuths.map((a) => a._id.toString()));

      const zonePasses = allPasses.filter(
        (p) => p.authorizationId && zoneAuthIds.has(p.authorizationId.toString()),
      );
      const zoneLogs = allLogs.filter(
        (l) => l.authorizationId && zoneAuthIds.has(l.authorizationId.toString()),
      );

      const zoneChanges = allChanges.filter((ch) => ch.zoneId?.toString() === zIdStr);
      const latestChange = zoneChanges[0];

      const authQuota = zoneAuths.reduce((acc, a) => acc + (a.permittedWeightTonnes || 0), 0);
      const transportTonnage = zonePasses.reduce(
        (acc, p) => acc + (p.netWeightTonnes || 0),
        0,
      );
      const verifiedTonnage = zoneLogs.reduce(
        (acc, l) => acc + (l.declaredQuantityTonnes || 0),
        0,
      );

      // --- Calculate Deterministic Risk Score ---
      let alertScore = 0;
      const riskFactors: string[] = [];

      const highAlerts = unresolvedAlerts.filter((a) => a.severity === AlertSeverity.HIGH);
      const medAlerts = unresolvedAlerts.filter((a) => a.severity === AlertSeverity.MEDIUM);
      const lowAlerts = unresolvedAlerts.filter((a) => a.severity === AlertSeverity.LOW);

      if (highAlerts.length > 0) {
        alertScore += 35;
        riskFactors.push(`${highAlerts.length} unresolved HIGH change alert(s)`);
      } else if (medAlerts.length > 0) {
        alertScore += 15;
        riskFactors.push(`${medAlerts.length} unresolved MEDIUM change alert(s)`);
      } else if (lowAlerts.length > 0) {
        alertScore += 5;
        riskFactors.push(`${lowAlerts.length} unresolved LOW change alert(s)`);
      }

      if (unresolvedAlerts.length > 2) {
        alertScore = Math.min(35, alertScore + 10);
        riskFactors.push(`Multiple cumulative active alerts (${unresolvedAlerts.length} total)`);
      }

      // Reconciliation component (0–30 pts)
      let reconScore = 0;
      if (latestRecon) {
        reconScore = Math.min(30, Math.round((latestRecon.discrepancyScore || 0) * 0.3));
        if (latestRecon.discrepancyScore >= 50) {
          riskFactors.push(
            `High discrepancy score (${latestRecon.discrepancyScore}/100) in audit ${latestRecon.reconciliationId}`,
          );
        }
      }

      // Enforcement component (0–25 pts)
      let enfScore = 0;
      const critCases = activeCases.filter((c) => c.severity === CaseSeverity.CRITICAL);
      const highCases = activeCases.filter((c) => c.severity === CaseSeverity.HIGH);
      const medCases = activeCases.filter((c) => c.severity === CaseSeverity.MEDIUM);

      if (critCases.length > 0) {
        enfScore += 25;
        riskFactors.push(`${critCases.length} active CRITICAL enforcement case(s)`);
      } else if (highCases.length > 0) {
        enfScore += 18;
        riskFactors.push(`${highCases.length} active HIGH enforcement case(s)`);
      } else if (medCases.length > 0) {
        enfScore += 10;
        riskFactors.push(`${medCases.length} active MEDIUM enforcement case(s)`);
      }

      const actionCases = activeCases.filter(
        (c) =>
          c.status === CaseStatus.ACTION_REQUIRED || c.status === CaseStatus.FIELD_VERIFICATION,
      );
      if (actionCases.length > 0) {
        enfScore = Math.min(25, enfScore + 5);
        riskFactors.push(`${actionCases.length} case(s) awaiting urgent field action/order`);
      }

      // Transport discrepancy component (0–10 pts)
      let transScore = 0;
      if (authQuota > 0 && transportTonnage > authQuota) {
        transScore += 10;
        riskFactors.push(`Transport volume exceeds authorized quota by ${(transportTonnage - authQuota).toFixed(1)} t`);
      } else if (transportTonnage > verifiedTonnage && (transportTonnage - verifiedTonnage) > 50) {
        transScore += 5;
        riskFactors.push(`Unverified transit gap of ${(transportTonnage - verifiedTonnage).toFixed(1)} t`);
      }

      const totalRiskScore = Math.min(100, alertScore + reconScore + enfScore + transScore);

      // Map to Risk Level
      let riskLevel = ZoneRiskLevel.LOW;
      let decisionCategory = DecisionSupportCategory.NO_CURRENT_ACTION;

      if (totalRiskScore >= 70) {
        riskLevel = ZoneRiskLevel.CRITICAL;
        decisionCategory = DecisionSupportCategory.CRITICAL_ATTENTION;
      } else if (totalRiskScore >= 45) {
        riskLevel = ZoneRiskLevel.HIGH;
        decisionCategory = DecisionSupportCategory.HIGH_PRIORITY;
      } else if (totalRiskScore >= 20) {
        riskLevel = ZoneRiskLevel.MEDIUM;
        decisionCategory = DecisionSupportCategory.MONITOR;
      }

      // Decision Support Rationale
      const decisionRationale =
        riskFactors.length > 0
          ? riskFactors.join('; ')
          : 'Zone operating within standard baseline parameters; no active discrepancies detected.';

      result.push({
        zoneId: zone.zoneId,
        zoneObjectId: zone._id.toString(),
        zoneName: zone.name,
        category: zone.category,
        status: zone.status,
        riskLevel,
        riskScore: totalRiskScore,
        riskFactors,
        decisionSupportCategory: decisionCategory,
        decisionSupportRationale: decisionRationale,
        latestScanDate: zone.baselineDate ? zone.baselineDate.toISOString() : latestChange?.detectedAt ? new Date(latestChange.detectedAt).toISOString() : undefined,
        latestDetectedChangePercentage: latestChange?.affectedAreaPercentage,
        latestAlertSeverity: latestAlert?.severity || null,
        unresolvedAlertCount: unresolvedAlerts.length,
        reconciliationDiscrepancyScore: latestRecon?.discrepancyScore ?? null,
        reconciliationStatus: latestRecon?.reconciliationStatus ?? null,
        activeEnforcementCaseCount: activeCases.length,
        latestEnforcementStatus: latestCase?.status || null,
        authorizedMiningQuotaTonnes: authQuota > 0 ? authQuota : undefined,
        transportedTonnage: transportTonnage > 0 ? transportTonnage : undefined,
        checkpointVerifiedTonnage: verifiedTonnage > 0 ? verifiedTonnage : undefined,
        disclaimer: STATUTORY_DISCLAIMER,
      });
    }

    // Filter by riskLevel if specified
    let filtered = result;
    if (filters.riskLevel) {
      filtered = filtered.filter((r) => r.riskLevel === filters.riskLevel);
    }

    // Sort descending by risk score
    filtered.sort((a, b) => b.riskScore - a.riskScore);

    // Apply pagination
    const skip = filters.skip || 0;
    const limit = filters.limit || 50;
    return filtered.slice(skip, skip + limit);
  }

  /**
   * 3. Single Zone Risk Intelligence Detail
   */
  async getZoneRiskDetail(zoneId: string): Promise<ZoneRiskIntelligenceDto> {
    const list = await this.getZoneRiskList({ zoneId, limit: 1 });
    if (list.length === 0) {
      throw new AppError(`Zone with ID ${zoneId} not found`, HTTP_STATUS.NOT_FOUND);
    }
    return list[0];
  }

  /**
   * 4. Cross-Module Risk Correlation
   */
  async getCrossModuleCorrelation(zoneId: string): Promise<CrossModuleCorrelationDto> {
    let zoneDoc;
    if (Types.ObjectId.isValid(zoneId)) {
      zoneDoc = await Zone.findById(zoneId).lean();
    }
    if (!zoneDoc) {
      zoneDoc = await Zone.findOne({ zoneId }).lean();
    }
    if (!zoneDoc) {
      throw new AppError(`Zone ${zoneId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    const zObjectId = zoneDoc._id;

    const [
      observations,
      changeDetections,
      alerts,
      miningAuthorizations,
      reconciliationReports,
      enforcementCases,
    ] = await Promise.all([
      SatelliteMetadata.find({ intersectingZones: zObjectId })
        .sort({ acquisitionDate: -1 })
        .limit(10)
        .lean(),
      ChangeDetectionModel.find({ zoneId: zObjectId })
        .sort({ detectedAt: -1 })
        .limit(10)
        .lean(),
      AlertModel.find({ zoneId: zObjectId })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      MiningAuthorizationModel.find({ zoneId: zObjectId }).lean(),
      ReconciliationReportModel.find({ zoneId: zObjectId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      EnforcementCaseModel.find({ zoneId: zObjectId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const authIds = miningAuthorizations.map((ma) => ma._id);
    const caseIds = enforcementCases.map((c) => c._id);
    const caseNumbers = enforcementCases.map((c) => c.caseId);

    const [ePasses, checkpointLogs, activeBaseline, evidenceDossiers] = await Promise.all([
      EPassModel.find({ authorizationId: { $in: authIds } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      CheckpointLogModel.find({ authorizationId: { $in: authIds } })
        .sort({ verificationTimestamp: -1 })
        .limit(20)
        .lean(),
      BaselineModel.findOne({ zoneId: zObjectId, isActive: true }).lean(),
      EvidenceDossierModel.find({
        $or: [
          { caseId: { $in: caseIds } },
          { caseNumber: { $in: caseNumbers } },
          { 'dossierData.caseDetails.zoneId': zoneDoc.zoneId },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      zone: {
        id: zoneDoc._id.toString(),
        zoneId: zoneDoc.zoneId,
        name: zoneDoc.name,
        category: zoneDoc.category,
        status: zoneDoc.status,
        boundary: zoneDoc.boundary,
      },
      satelliteObservations: observations.map((o) => ({
        id: o._id.toString(),
        observationId: o.imageId || o._id.toString(),
        source: o.source,
        sensorType: o.sensorType,
        acquisitionDate: o.acquisitionDate.toISOString(),
        cloudCover: o.cloudCover,
      })),
      changeDetections: changeDetections.map((cd) => ({
        id: cd._id.toString(),
        affectedAreaPercentage: cd.affectedAreaPercentage,
        maxEvidenceStrength: cd.evidenceStrength,
        calculationMode: cd.calculationMode,
        detectedAt: cd.detectedAt ? new Date(cd.detectedAt).toISOString() : new Date().toISOString(),
      })),
      alerts: alerts.map((a) => ({
        id: a._id.toString(),
        alertId: a.alertId,
        severity: a.severity,
        status: a.status,
        highestThresholdCrossed: a.highestThresholdCrossed,
        evidenceScore: a.evidenceStrength,
        createdAt: a.createdAt.toISOString(),
      })),
      miningAuthorizations: miningAuthorizations.map((ma) => ({
        id: ma._id.toString(),
        permitNumber: ma.permitNumber,
        lesseeName: ma.lesseeName,
        mineralType: ma.mineralType,
        permittedWeightTonnes: ma.permittedWeightTonnes,
        remainingQuota: ma.remainingQuota,
        status: ma.status,
      })),
      ePasses: ePasses.map((ep) => ({
        id: ep._id.toString(),
        ePassNumber: ep.passNumber,
        vehicleNumber: ep.vehicleId?.toString() || 'Registered Vehicle',
        declaredNetWeightTonnes: ep.netWeightTonnes,
        status: ep.status,
        validUntil: ep.validUntil.toISOString(),
      })),
      checkpointPassages: checkpointLogs.map((cl) => ({
        id: cl._id.toString(),
        checkpointName: cl.checkpointName,
        vehicleNumber: cl.vehicleRegistrationNumber || cl.passNumber,
        verifiedWeightTonnes: cl.declaredQuantityTonnes,
        status: cl.verificationResult,
        scannedAt: cl.verificationTimestamp ? cl.verificationTimestamp.toISOString() : cl.createdAt.toISOString(),
        isGeofenceValid: cl.locationStatus === LocationVerificationStatus.VERIFIED_LOCATION,
      })),

      reconciliationReports: reconciliationReports.map((rr) => ({
        id: rr._id.toString(),
        reconciliationId: rr.reconciliationId,
        reconciliationStatus: rr.reconciliationStatus,
        discrepancyScore: rr.discrepancyScore,
        status: rr.status,
        createdAt: rr.createdAt.toISOString(),
      })),
      enforcementCases: enforcementCases.map((ec) => ({
        id: ec._id.toString(),
        caseId: ec.caseId,
        title: ec.title,
        severity: ec.severity,
        status: ec.status,
        caseType: ec.caseType,
        createdAt: ec.createdAt.toISOString(),
      })),
      activeBaseline: activeBaseline
        ? {
            id: activeBaseline._id.toString(),
            baselineId: activeBaseline.imageId || activeBaseline._id.toString(),
            sensorType: activeBaseline.sensorType,
            effectiveDate: activeBaseline.acquisitionDate
              ? new Date(activeBaseline.acquisitionDate).toISOString()
              : new Date().toISOString(),
          }
        : undefined,
      evidenceDossiers: evidenceDossiers.map((ed) => ({
        id: ed._id.toString(),
        dossierId: ed.dossierId,
        caseNumber: ed.caseNumber,
        dossierVersion: ed.dossierVersion,
        dossierHash: ed.dossierHash,
        isSealed: ed.isSealed,
        sealedAt: ed.sealedAt ? new Date(ed.sealedAt).toISOString() : undefined,
      })),
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 5. Alert Intelligence Summary
   */
  async getAlertIntelligenceSummary(): Promise<AlertIntelligenceSummaryDto> {
    const alerts = await AlertModel.find({}).populate('zoneId', 'name').lean();

    const totalAlerts = alerts.length;
    const unresolvedAlerts = alerts.filter((a) => a.status !== AlertStatus.RESOLVED).length;

    const alertsBySeverity = {
      low: alerts.filter((a) => a.severity === AlertSeverity.LOW).length,
      medium: alerts.filter((a) => a.severity === AlertSeverity.MEDIUM).length,
      high: alerts.filter((a) => a.severity === AlertSeverity.HIGH).length,
      critical: alerts.filter(
        (a) => a.severity === AlertSeverity.HIGH && a.highestThresholdCrossed >= 10,
      ).length,
    };

    const recentCriticalAlerts = alerts
      .filter((a) => a.severity === AlertSeverity.HIGH)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((a) => ({
        id: a._id.toString(),
        alertId: a.alertId,
        zoneName: (a.zoneId as unknown as { name?: string })?.name || 'Monitored Zone',
        severity: a.severity,
        evidenceScore: a.evidenceStrength,
        createdAt: a.createdAt.toISOString(),
      }));

    const now = Date.now();
    const alertAging = {
      lessThan24Hours: 0,
      oneToSevenDays: 0,
      sevenToThirtyDays: 0,
      overThirtyDays: 0,
    };

    for (const a of alerts) {
      const ageHours = (now - new Date(a.createdAt).getTime()) / (1000 * 3600);
      if (ageHours < 24) alertAging.lessThan24Hours++;
      else if (ageHours < 168) alertAging.oneToSevenDays++;
      else if (ageHours < 720) alertAging.sevenToThirtyDays++;
      else alertAging.overThirtyDays++;
    }

    return {
      totalAlerts,
      unresolvedAlerts,
      alertsBySeverity,
      recentCriticalAlerts,
      alertAging,
    };
  }

  /**
   * 6. Transport & Mining Intelligence Summary
   */
  async getTransportMiningSummary(): Promise<TransportMiningIntelligenceSummaryDto> {
    const [authorizations, ePasses, checkpointLogs] = await Promise.all([
      MiningAuthorizationModel.find({}).lean(),
      EPassModel.find({}).lean(),
      CheckpointLogModel.find({}).lean(),
    ]);

    const totalAuthorizedQuotaTonnes = authorizations.reduce(
      (acc, a) => acc + (a.permittedWeightTonnes || 0),
      0,
    );
    const totalRemainingQuotaTonnes = authorizations.reduce(
      (acc, a) => acc + (a.remainingQuota || 0),
      0,
    );
    const totalIssuedTransportTonnes = ePasses.reduce(
      (acc, p) => acc + (p.netWeightTonnes || 0),
      0,
    );
    const totalCheckpointVerifiedTonnes = checkpointLogs.reduce(
      (acc, l) => acc + (l.declaredQuantityTonnes || 0),
      0,
    );
    const totalUnverifiedTransitGapTonnes = Math.max(
      0,
      totalIssuedTransportTonnes - totalCheckpointVerifiedTonnes,
    );

    const overallQuotaUtilizationPercent =
      totalAuthorizedQuotaTonnes > 0
        ? Math.round((totalIssuedTransportTonnes / totalAuthorizedQuotaTonnes) * 100 * 10) / 10
        : 0;

    const ePassCounts = {
      draft: ePasses.filter((p) => p.status === 'DRAFT').length,
      active: ePasses.filter((p) => p.status === 'ACTIVE').length,
      used: ePasses.filter((p) => p.status === 'USED').length,
      expired: ePasses.filter((p) => p.status === 'EXPIRED').length,
      cancelled: ePasses.filter((p) => p.status === 'CANCELLED').length,
    };

    return {
      totalAuthorizedQuotaTonnes,
      totalIssuedTransportTonnes,
      totalRemainingQuotaTonnes,
      totalCheckpointVerifiedTonnes,
      totalUnverifiedTransitGapTonnes,
      overallQuotaUtilizationPercent,
      ePassCounts,
      units: {
        area: 'hectares (ha)',
        volume: 'cubic meters (m³)',
        mass: 'metric tonnes (t)',
        currency: 'INR (₹)',
      },
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 7. Enforcement Intelligence Summary
   */
  async getEnforcementSummary(): Promise<EnforcementIntelligenceSummaryDto> {
    const cases = await EnforcementCaseModel.find({}).lean();

    const totalCases = cases.length;
    const activeCases = cases.filter((c) => c.status !== CaseStatus.CLOSED).length;
    const criticalCases = cases.filter((c) => c.severity === CaseSeverity.CRITICAL).length;
    const assignedCases = cases.filter((c) => c.status === CaseStatus.ASSIGNED).length;
    const fieldVerificationCases = cases.filter((c) => c.status === CaseStatus.FIELD_VERIFICATION).length;
    const actionRequiredCases = cases.filter((c) => c.status === CaseStatus.ACTION_REQUIRED).length;
    const resolvedCases = cases.filter((c) => c.status === CaseStatus.RESOLVED).length;
    const closedCases = cases.filter((c) => c.status === CaseStatus.CLOSED).length;

    const casesByType: Record<string, number> = {};
    const casesBySeverity: Record<string, number> = {};
    const casesByStatus: Record<string, number> = {};

    let totalOpenAgeDays = 0;
    let openCount = 0;
    const now = Date.now();

    for (const c of cases) {
      casesByType[c.caseType] = (casesByType[c.caseType] || 0) + 1;
      casesBySeverity[c.severity] = (casesBySeverity[c.severity] || 0) + 1;
      casesByStatus[c.status] = (casesByStatus[c.status] || 0) + 1;

      if (c.status !== CaseStatus.CLOSED) {
        const ageDays = (now - new Date(c.createdAt).getTime()) / (1000 * 3600 * 24);
        totalOpenAgeDays += ageDays;
        openCount++;
      }
    }

    const averageOpenCaseAgeDays =
      openCount > 0 ? Math.round((totalOpenAgeDays / openCount) * 10) / 10 : 0;

    const recentActions = cases
      .filter((c) => Boolean(c.enforcementAction?.actionType))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10)
      .map((c) => ({
        caseId: c.caseId,
        actionType: c.enforcementAction!.actionType as EnforcementActionType,
        actionDetails: c.enforcementAction!.actionDetails || '',
        penaltyAmountInr: c.enforcementAction!.penaltyAmountInr,
        orderRef: c.enforcementAction!.officialOrderReference,
        actionDate: c.enforcementAction!.actionDate
          ? new Date(c.enforcementAction!.actionDate).toISOString()
          : c.updatedAt.toISOString(),
      }));

    return {
      totalCases,
      activeCases,
      criticalCases,
      assignedCases,
      fieldVerificationCases,
      actionRequiredCases,
      resolvedCases,
      closedCases,
      casesByType,
      casesBySeverity,
      casesByStatus,
      averageOpenCaseAgeDays,
      recentActions,
    };
  }

  /**
   * 8. Trend Analytics
   */
  async getTrendAnalytics(
    preset: TimeRangePreset = TimeRangePreset.THIRTY_DAYS,
    startDateStr?: string,
    endDateStr?: string,
  ): Promise<TrendAnalyticsDto> {
    let days = 30;
    if (preset === TimeRangePreset.SEVEN_DAYS) days = 7;
    else if (preset === TimeRangePreset.NINETY_DAYS) days = 90;

    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(endDate.getTime() - days * 24 * 3600 * 1000);

    const [alerts, changes, passes, logs, cases, reports] = await Promise.all([
      AlertModel.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean(),
      ChangeDetectionModel.find({ detectedAt: { $gte: startDate, $lte: endDate } }).lean(),
      EPassModel.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean(),
      CheckpointLogModel.find({ verificationTimestamp: { $gte: startDate, $lte: endDate } }).lean(),
      EnforcementCaseModel.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean(),
      ReconciliationReportModel.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean(),
    ]);

    // Group by day YYYY-MM-DD
    const dateMap = new Map<
      string,
      {
        alertsCount: number;
        criticalAlertsCount: number;
        disturbedAreaHectares: number;
        discrepancyScores: number[];
        transportIssuedTonnes: number;
        checkpointVerifiedTonnes: number;
        enforcementCasesCreated: number;
      }
    >();

    // Initialize all daily buckets
    const iter = new Date(startDate);
    while (iter <= endDate) {
      const dStr = iter.toISOString().split('T')[0];
      dateMap.set(dStr, {
        alertsCount: 0,
        criticalAlertsCount: 0,
        disturbedAreaHectares: 0,
        discrepancyScores: [],
        transportIssuedTonnes: 0,
        checkpointVerifiedTonnes: 0,
        enforcementCasesCreated: 0,
      });
      iter.setDate(iter.getDate() + 1);
    }

    for (const a of alerts) {
      const dStr = a.createdAt.toISOString().split('T')[0];
      const bucket = dateMap.get(dStr);
      if (bucket) {
        bucket.alertsCount++;
        if (a.severity === AlertSeverity.HIGH && a.highestThresholdCrossed >= 10) {
          bucket.criticalAlertsCount++;
        }
      }
    }

    for (const ch of changes) {
      if (ch.detectedAt) {
        const dStr = new Date(ch.detectedAt).toISOString().split('T')[0];
        const bucket = dateMap.get(dStr);
        if (bucket) {
          bucket.disturbedAreaHectares += ch.affectedAreaPercentage || 0;
        }
      }
    }

    for (const p of passes) {
      const dStr = p.createdAt.toISOString().split('T')[0];
      const bucket = dateMap.get(dStr);
      if (bucket) {
        bucket.transportIssuedTonnes += p.netWeightTonnes || 0;
      }
    }

    for (const l of logs) {
      const logDate = l.verificationTimestamp || l.createdAt;
      const dStr = logDate.toISOString().split('T')[0];
      const bucket = dateMap.get(dStr);
      if (bucket) {
        bucket.checkpointVerifiedTonnes += l.declaredQuantityTonnes || 0;
      }
    }

    for (const c of cases) {
      const dStr = c.createdAt.toISOString().split('T')[0];
      const bucket = dateMap.get(dStr);
      if (bucket) {
        bucket.enforcementCasesCreated++;
      }
    }

    for (const r of reports) {
      const dStr = r.createdAt.toISOString().split('T')[0];
      const bucket = dateMap.get(dStr);
      if (bucket && typeof r.discrepancyScore === 'number') {
        bucket.discrepancyScores.push(r.discrepancyScore);
      }
    }

    const dataPoints = Array.from(dateMap.entries()).map(([date, data]) => {
      const avgDisc =
        data.discrepancyScores.length > 0
          ? Math.round(
              (data.discrepancyScores.reduce((a, b) => a + b, 0) /
                data.discrepancyScores.length) *
                10,
            ) / 10
          : 0;

      return {
        date,
        alertsCount: data.alertsCount,
        criticalAlertsCount: data.criticalAlertsCount,
        disturbedAreaHectares: Math.round(data.disturbedAreaHectares * 100) / 100,
        discrepancyScoreAvg: avgDisc,
        transportIssuedTonnes: Math.round(data.transportIssuedTonnes * 10) / 10,
        checkpointVerifiedTonnes: Math.round(data.checkpointVerifiedTonnes * 10) / 10,
        enforcementCasesCreated: data.enforcementCasesCreated,
      };
    });

    const totalEvents =
      alerts.length + changes.length + passes.length + logs.length + cases.length + reports.length;
    const isDataSufficient = totalEvents > 0;

    return {
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
      preset,
      dataPoints,
      isDataSufficient,
      message: isDataSufficient
        ? undefined
        : 'Insufficient operational records in the selected time range.',
      units: {
        area: 'hectares (ha)',
        volume: 'cubic meters (m³)',
        mass: 'metric tonnes (t)',
      },
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 9. Hotspot / Priority Ranking
   */
  async getHotspotPriorityRankings(): Promise<HotspotPriorityRankingsDto> {
    const allZoneRisks = await this.getZoneRiskList({ limit: 100 });
    const highestRiskZones = allZoneRisks.slice(0, 5);

    const [reconReports, alerts, cases, passes, logs, auths] = await Promise.all([
      ReconciliationReportModel.find({})
        .sort({ discrepancyScore: -1 })
        .limit(5)
        .lean(),
      AlertModel.find({ status: { $ne: AlertStatus.RESOLVED } })
        .populate('zoneId', 'name zoneId')
        .lean(),
      EnforcementCaseModel.find({
        severity: CaseSeverity.CRITICAL,
        status: { $ne: CaseStatus.CLOSED },
      })
        .populate('zoneId', 'name zoneId')
        .lean(),
      EPassModel.find({}).lean(),
      CheckpointLogModel.find({}).lean(),
      MiningAuthorizationModel.find({}).lean(),
    ]);

    const highestDiscrepancyZones = reconReports.map((r) => ({
      zoneId: r.zoneId?.toString() || r.reconciliationId,
      zoneName: r.zoneName || 'Monitored Zone',
      discrepancyScore: r.discrepancyScore,
      status: r.status,
      reportId: r.reconciliationId,
    }));

    // Repeated alert zones
    const zoneAlertCounts = new Map<
      string,
      { zoneName: string; count: number; critCount: number; lastAlertAt: string }
    >();
    for (const a of alerts) {
      const zName = (a.zoneId as unknown as { name?: string })?.name || 'Monitored Zone';
      const zIdStr = (a.zoneId as unknown as { _id?: string })?._id?.toString() || a.zoneId?.toString() || 'unknown';
      const entry = zoneAlertCounts.get(zIdStr) || {
        zoneName: zName,
        count: 0,
        critCount: 0,
        lastAlertAt: a.createdAt.toISOString(),
      };
      entry.count++;
      if (a.severity === AlertSeverity.HIGH && a.highestThresholdCrossed >= 10) entry.critCount++;
      if (new Date(a.createdAt).getTime() > new Date(entry.lastAlertAt).getTime()) {
        entry.lastAlertAt = a.createdAt.toISOString();
      }
      zoneAlertCounts.set(zIdStr, entry);
    }

    const repeatedAlertZones = Array.from(zoneAlertCounts.entries())
      .map(([zoneId, val]) => ({
        zoneId,
        zoneName: val.zoneName,
        alertCount: val.count,
        criticalCount: val.critCount,
        lastAlertAt: val.lastAlertAt,
      }))
      .sort((a, b) => b.alertCount - a.alertCount)
      .slice(0, 5);

    const unresolvedCriticalCaseZones = cases.slice(0, 5).map((c) => ({
      zoneId: c.zoneId?.toString() || c.caseId,
      zoneName: (c.zoneId as unknown as { name?: string })?.name || 'Monitored Zone',
      caseId: c.caseId,
      caseTitle: c.title,
      severity: c.severity,
      status: c.status,
    }));

    // Transport mismatches
    const authToZoneMap = new Map<string, { zoneId: string; zoneName: string }>();
    for (const a of auths) {
      authToZoneMap.set(a._id.toString(), {
        zoneId: a.zoneId?.toString() || 'unknown',
        zoneName: a.lesseeName || 'Monitored Zone',
      });
    }

    const zoneMismatchMap = new Map<string, { zoneName: string; issued: number; verified: number }>();
    for (const p of passes) {
      const authInfo = p.authorizationId ? authToZoneMap.get(p.authorizationId.toString()) : undefined;
      const zId = authInfo?.zoneId || 'unknown';
      const zName = authInfo?.zoneName || 'Monitored Zone';
      const entry = zoneMismatchMap.get(zId) || { zoneName: zName, issued: 0, verified: 0 };
      entry.issued += p.netWeightTonnes || 0;
      zoneMismatchMap.set(zId, entry);
    }
    for (const l of logs) {
      const authInfo = l.authorizationId ? authToZoneMap.get(l.authorizationId.toString()) : undefined;
      const zId = authInfo?.zoneId || 'unknown';
      const zName = l.checkpointName || authInfo?.zoneName || 'Monitored Zone';
      const entry = zoneMismatchMap.get(zId) || { zoneName: zName, issued: 0, verified: 0 };
      entry.verified += l.declaredQuantityTonnes || 0;
      zoneMismatchMap.set(zId, entry);
    }

    const transportMismatchZones = Array.from(zoneMismatchMap.entries())
      .map(([zoneId, data]) => ({
        zoneId,
        zoneName: data.zoneName,
        issuedTonnes: Math.round(data.issued * 10) / 10,
        verifiedTonnes: Math.round(data.verified * 10) / 10,
        gapTonnes: Math.round(Math.max(0, data.issued - data.verified) * 10) / 10,
      }))
      .filter((m) => m.gapTonnes > 0)
      .sort((a, b) => b.gapTonnes - a.gapTonnes)
      .slice(0, 5);

    return {
      highestRiskZones,
      highestDiscrepancyZones,
      repeatedAlertZones,
      unresolvedCriticalCaseZones,
      transportMismatchZones,
      rankingCriteriaDocumentation: {
        riskScore: 'Composite 0-100: Alert Severity (35%) + M11 Discrepancy (30%) + Enforcement State (25%) + Transport Gap (10%)',
        discrepancyScore: 'Direct M11 audit discrepancy score evaluated across quota, transit, and satellite indicators',
        repeatedAlerts: 'Count of active unresolved alerts in chronological order',
        transportGap: 'Declared issued E-Pass weight vs physical checkpoint verified electronic weighbridge mass',
      },
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 10. Decision-Support Summary Categories
   */
  async getDecisionSupportSummary(): Promise<DecisionSupportSummaryDto> {
    const allZoneRisks = await this.getZoneRiskList({ limit: 500 });

    const criticalAttention: DecisionSupportSummaryDto['criticalAttention'] = [];
    const highPriority: DecisionSupportSummaryDto['highPriority'] = [];
    const monitor: DecisionSupportSummaryDto['monitor'] = [];
    const noCurrentAction: DecisionSupportSummaryDto['noCurrentAction'] = [];

    for (const z of allZoneRisks) {
      const item = {
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        rationale: z.decisionSupportRationale,
        metrics: {
          riskScore: z.riskScore,
          alerts: z.unresolvedAlertCount,
          cases: z.activeEnforcementCaseCount,
        },
      };

      switch (z.decisionSupportCategory) {
        case DecisionSupportCategory.CRITICAL_ATTENTION:
          criticalAttention.push(item);
          break;
        case DecisionSupportCategory.HIGH_PRIORITY:
          highPriority.push(item);
          break;
        case DecisionSupportCategory.MONITOR:
          monitor.push(item);
          break;
        case DecisionSupportCategory.NO_CURRENT_ACTION:
        default:
          noCurrentAction.push({
            zoneId: z.zoneId,
            zoneName: z.zoneName,
            rationale: z.decisionSupportRationale,
          });
          break;
      }
    }

    return {
      criticalAttention,
      highPriority,
      monitor,
      noCurrentAction,
      statutoryDisclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 11. Cross-Module Investigation Timeline
   */
  async getInvestigationTimeline(filters: {
    zoneId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    eventType?: string;
    module?: string;
  } = {}): Promise<InvestigationTimelineDto> {
    const limit = Math.min(Math.max(filters.limit || 50, 1), 200);
    const dateFilter: Record<string, unknown> = {};
    if (filters.startDate || filters.endDate) {
      if (filters.startDate) dateFilter.$gte = new Date(filters.startDate);
      if (filters.endDate) dateFilter.$lte = new Date(filters.endDate);
    }

    let zoneDoc = null;
    let zoneObjectId: Types.ObjectId | null = null;
    if (filters.zoneId) {
      if (Types.ObjectId.isValid(filters.zoneId)) {
        zoneDoc = await Zone.findById(filters.zoneId).lean();
      }
      if (!zoneDoc) {
        zoneDoc = await Zone.findOne({ zoneId: filters.zoneId }).lean();
      }
      if (zoneDoc) {
        zoneObjectId = zoneDoc._id;
      }
    }

    const events: InvestigationTimelineItemDto[] = [];

    // 1. Satellite Acquisitions
    const satQuery: Record<string, unknown> = {};
    if (zoneObjectId) satQuery.intersectingZones = zoneObjectId;
    if (Object.keys(dateFilter).length > 0) satQuery.acquisitionDate = dateFilter;
    const satellites = await SatelliteMetadata.find(satQuery).sort({ acquisitionDate: -1 }).limit(limit).lean();
    for (const sat of satellites) {
      events.push({
        id: sat._id.toString(),
        eventType: 'SATELLITE_ACQUISITION',
        timestamp: sat.acquisitionDate ? new Date(sat.acquisitionDate).toISOString() : new Date().toISOString(),
        entityId: sat.imageId || sat._id.toString(),
        sourceModule: 'M3_SATELLITE',
        title: `Satellite Acquisition: ${sat.source} (${sat.sensorType})`,
        description: `Cloud cover: ${sat.cloudCover ?? 0}% • Status: ${sat.processingStatus || 'DISCOVERED'}`,
        metadata: {
          cloudCover: sat.cloudCover,
          source: sat.source,
          sensorType: sat.sensorType,
        },
      });
    }

    // 2. Change Detections
    const cdQuery: Record<string, unknown> = {};
    if (zoneObjectId) cdQuery.zoneId = zoneObjectId;
    if (Object.keys(dateFilter).length > 0) cdQuery.detectedAt = dateFilter;
    const changes = await ChangeDetectionModel.find(cdQuery).sort({ detectedAt: -1 }).limit(limit).lean();
    for (const cd of changes) {
      events.push({
        id: cd._id.toString(),
        eventType: 'CHANGE_DETECTION',
        timestamp: cd.detectedAt ? new Date(cd.detectedAt).toISOString() : new Date().toISOString(),
        entityId: cd.changeId || cd._id.toString(),
        sourceModule: 'M4_MONITORING',
        title: `Physical Change Detected (${cd.affectedAreaPercentage.toFixed(1)}% area)`,
        description: `Evidence Strength: ${cd.evidenceStrength}/100 • Severity: ${cd.severity || 'UNKNOWN'}`,
        severity: cd.severity,
        metadata: {
          affectedAreaPercentage: cd.affectedAreaPercentage,
          evidenceStrength: cd.evidenceStrength,
        },
      });
    }

    // 3. Alerts
    const alertQuery: Record<string, unknown> = {};
    if (zoneObjectId) alertQuery.zoneId = zoneObjectId;
    if (Object.keys(dateFilter).length > 0) alertQuery.createdAt = dateFilter;
    const alerts = await AlertModel.find(alertQuery).sort({ createdAt: -1 }).limit(limit).lean();
    for (const a of alerts) {
      events.push({
        id: a._id.toString(),
        eventType: 'ALERT_TRIGGERED',
        timestamp: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
        entityId: a.alertId,
        sourceModule: 'M5_ALERTS',
        title: `Environmental Alert: ${a.alertId} [${a.severity}]`,
        description: a.explanation || `Categories: ${a.categories?.join(', ') || 'N/A'} • Evidence: ${a.evidenceStrength}/100`,
        severity: a.severity,
        status: a.status,
        metadata: {
          categories: a.categories,
          highestThresholdCrossed: a.highestThresholdCrossed,
          evidenceStrength: a.evidenceStrength,
        },
      });
    }

    // 4. Mining Authorizations
    const authQuery: Record<string, unknown> = {};
    if (zoneObjectId) authQuery.zoneId = zoneObjectId;
    if (Object.keys(dateFilter).length > 0) authQuery.createdAt = dateFilter;
    const auths = await MiningAuthorizationModel.find(authQuery).sort({ createdAt: -1 }).limit(limit).lean();
    const authIds = auths.map((a) => a._id);
    for (const ma of auths) {
      events.push({
        id: ma._id.toString(),
        eventType: 'MINING_PERMIT_ISSUED',
        timestamp: ma.validFrom ? new Date(ma.validFrom).toISOString() : new Date(ma.createdAt).toISOString(),
        entityId: ma.authorizationId || ma.permitNumber,
        sourceModule: 'M7_MINING_LEASE',
        title: `Mining Permit: ${ma.permitNumber} (${ma.lesseeName})`,
        description: `Mineral: ${ma.mineralType} • Quota: ${ma.permittedWeightTonnes}t (Remaining: ${ma.remainingQuota}t)`,
        status: ma.status,
        metadata: {
          lesseeName: ma.lesseeName,
          permittedWeightTonnes: ma.permittedWeightTonnes,
          remainingQuota: ma.remainingQuota,
        },
      });
    }

    // 5. E-Passes
    const epassQuery: Record<string, unknown> = {};
    if (authIds.length > 0) epassQuery.authorizationId = { $in: authIds };
    if (Object.keys(dateFilter).length > 0) epassQuery.createdAt = dateFilter;
    const epasses = await EPassModel.find(epassQuery).sort({ createdAt: -1 }).limit(limit).lean();
    for (const ep of epasses) {
      events.push({
        id: ep._id.toString(),
        eventType: 'EPASS_ISSUED',
        timestamp: ep.createdAt ? new Date(ep.createdAt).toISOString() : new Date().toISOString(),
        entityId: ep.passNumber,
        sourceModule: 'M9_EPASS',
        title: `Digital E-Pass Issued: ${ep.passNumber}`,
        description: `Weight: ${ep.netWeightTonnes}t • Status: ${ep.status} • Destination: ${ep.destinationCheckpoint || 'N/A'}`,
        status: ep.status,
        metadata: {
          netWeightTonnes: ep.netWeightTonnes,
          mineralType: ep.mineralType,
        },
      });
    }

    // 6. Checkpoint Logs
    const cpQuery: Record<string, unknown> = {};
    if (authIds.length > 0) cpQuery.authorizationId = { $in: authIds };
    if (Object.keys(dateFilter).length > 0) cpQuery.verificationTimestamp = dateFilter;
    const cpLogs = await CheckpointLogModel.find(cpQuery).sort({ verificationTimestamp: -1 }).limit(limit).lean();
    for (const cp of cpLogs) {
      events.push({
        id: cp._id.toString(),
        eventType: 'CHECKPOINT_PASSAGE',
        timestamp: cp.verificationTimestamp ? new Date(cp.verificationTimestamp).toISOString() : new Date(cp.createdAt).toISOString(),
        entityId: cp.logId || cp.passNumber,
        sourceModule: 'M8_CHECKPOINT',
        title: `Checkpoint Verification: ${cp.checkpointName}`,
        description: `Vehicle: ${cp.vehicleRegistrationNumber || cp.passNumber} • Verified: ${cp.declaredQuantityTonnes || 0}t • Result: ${cp.verificationResult}`,
        status: cp.verificationResult,
        metadata: {
          declaredQuantityTonnes: cp.declaredQuantityTonnes,
          locationStatus: cp.locationStatus,
        },
      });
    }

    // 7. Reconciliation Reports
    const reconQuery: Record<string, unknown> = {};
    if (zoneObjectId) reconQuery.zoneId = zoneObjectId;
    if (Object.keys(dateFilter).length > 0) reconQuery.createdAt = dateFilter;
    const recons = await ReconciliationReportModel.find(reconQuery).sort({ createdAt: -1 }).limit(limit).lean();
    for (const rr of recons) {
      events.push({
        id: rr._id.toString(),
        eventType: 'RECONCILIATION_AUDIT',
        timestamp: rr.createdAt ? new Date(rr.createdAt).toISOString() : new Date().toISOString(),
        entityId: rr.reconciliationId,
        sourceModule: 'M10_RECONCILIATION',
        title: `Reconciliation Audit: ${rr.reconciliationId} (Score: ${rr.discrepancyScore}/100)`,
        description: `Status: ${rr.reconciliationStatus} • Findings: ${rr.findings?.length || 0} noted`,
        severity: rr.reconciliationStatus === ReconciliationStatus.CRITICAL_ANOMALY ? 'CRITICAL' : 'MEDIUM',
        status: rr.status,
        metadata: {
          discrepancyScore: rr.discrepancyScore,
          reconciliationStatus: rr.reconciliationStatus,
        },
      });
    }

    // 8. Enforcement Cases
    const caseQuery: Record<string, unknown> = {};
    if (zoneObjectId) caseQuery.zoneId = zoneObjectId;
    if (Object.keys(dateFilter).length > 0) caseQuery.createdAt = dateFilter;
    const cases = await EnforcementCaseModel.find(caseQuery).sort({ createdAt: -1 }).limit(limit).lean();
    const caseIds = cases.map((c) => c._id);
    for (const ec of cases) {
      events.push({
        id: ec._id.toString(),
        eventType: 'ENFORCEMENT_CASE',
        timestamp: ec.createdAt ? new Date(ec.createdAt).toISOString() : new Date().toISOString(),
        entityId: ec.caseId,
        sourceModule: 'M6_ENFORCEMENT',
        title: `Enforcement Case: ${ec.caseId} — ${ec.title}`,
        description: `Severity: ${ec.severity} • Status: ${ec.status} • Type: ${ec.caseType}`,
        severity: ec.severity,
        status: ec.status,
        metadata: {
          caseType: ec.caseType,
          penaltyAmountInr: ec.enforcementAction?.penaltyAmountInr,
          actionType: ec.enforcementAction?.actionType,
        },
      });
    }

    // 9. Evidence Dossiers
    const dossierQuery: Record<string, unknown> = {};
    if (caseIds.length > 0) dossierQuery.caseId = { $in: caseIds };
    if (zoneDoc?.zoneId) dossierQuery['dossierData.caseDetails.zoneId'] = zoneDoc.zoneId;
    if (Object.keys(dateFilter).length > 0) dossierQuery.createdAt = dateFilter;
    const dossiers = await EvidenceDossierModel.find(dossierQuery).sort({ createdAt: -1 }).limit(limit).lean();
    for (const ed of dossiers) {
      events.push({
        id: ed._id.toString(),
        eventType: 'EVIDENCE_DOSSIER_SEALED',
        timestamp: ed.sealedAt ? new Date(ed.sealedAt).toISOString() : new Date(ed.createdAt).toISOString(),
        entityId: ed.dossierId,
        sourceModule: 'PHASE11_EVIDENCE',
        title: `Forensic Evidence Dossier: ${ed.dossierId} (v${ed.dossierVersion})`,
        description: `Case: ${ed.caseNumber} • Sealed: ${ed.isSealed ? 'YES' : 'NO'} • SHA-256: ${ed.dossierHash?.substring(0, 16)}...`,
        status: ed.isSealed ? 'SEALED' : 'DRAFT',
        metadata: {
          dossierVersion: ed.dossierVersion,
          dossierHash: ed.dossierHash,
        },
      });
    }

    // Sort strictly chronological descending (newest first)
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let filteredEvents = events;
    if (filters.eventType) {
      filteredEvents = filteredEvents.filter((e) => e.eventType === filters.eventType);
    }
    if (filters.module) {
      const mod = filters.module.toUpperCase();
      filteredEvents = filteredEvents.filter((e) =>
        e.sourceModule.toUpperCase().includes(mod) || e.eventType.toUpperCase().includes(mod),
      );
    }

    const pagedEvents = filteredEvents.slice(0, limit);

    return {
      totalEvents: pagedEvents.length,
      events: pagedEvents,
      period: {
        from: filters.startDate,
        to: filters.endDate,
      },
      filterApplied: {
        zoneId: filters.zoneId,
        module: filters.module,
        eventType: filters.eventType,
      },
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 12. Cross-Entity Search
   */
  async searchIntelligenceEntities(
    rawQuery: string,
    options: { limit?: number } = {},
  ): Promise<IntelligenceSearchDto> {
    const q = rawQuery?.trim();
    if (!q) {
      return { query: '', totalMatches: 0, results: [], disclaimer: STATUTORY_DISCLAIMER };
    }
    const maxLimit = Math.min(Math.max(options.limit || 20, 1), 50);
    const regex = new RegExp(q, 'i');
    const results: IntelligenceSearchResultItemDto[] = [];

    // 1. Zones
    const zones = await Zone.find({
      $or: [{ name: regex }, { zoneId: regex }, { category: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const z of zones) {
      results.push({
        entityType: 'ZONE',
        id: z._id.toString(),
        referenceId: z.zoneId,
        title: z.name,
        subtitle: `Category: ${z.category} • Status: ${z.status}`,
        status: z.status,
        timestamp: z.createdAt?.toISOString(),
        details: { category: z.category },
      });
    }

    // 2. Alerts
    const alerts = await AlertModel.find({
      $or: [{ alertId: regex }, { categories: regex }, { explanation: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const a of alerts) {
      results.push({
        entityType: 'ALERT',
        id: a._id.toString(),
        referenceId: a.alertId,
        title: `Alert ${a.alertId}`,
        subtitle: a.explanation || `Categories: ${a.categories?.join(', ')}`,
        status: a.status,
        severity: a.severity,
        timestamp: a.createdAt?.toISOString(),
        details: { evidenceStrength: a.evidenceStrength },
      });
    }

    // 3. Enforcement Cases
    const cases = await EnforcementCaseModel.find({
      $or: [{ caseId: regex }, { title: regex }, { description: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const c of cases) {
      results.push({
        entityType: 'CASE',
        id: c._id.toString(),
        referenceId: c.caseId,
        title: c.title,
        subtitle: `Severity: ${c.severity} • Status: ${c.status}`,
        status: c.status,
        severity: c.severity,
        timestamp: c.createdAt?.toISOString(),
        details: { caseType: c.caseType },
      });
    }

    // 4. Mining Authorizations
    const auths = await MiningAuthorizationModel.find({
      $or: [{ permitNumber: regex }, { lesseeName: regex }, { mineralType: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const m of auths) {
      results.push({
        entityType: 'MINING_LEASE',
        id: m._id.toString(),
        referenceId: m.permitNumber,
        title: `${m.permitNumber} — ${m.lesseeName}`,
        subtitle: `Mineral: ${m.mineralType} • Quota: ${m.permittedWeightTonnes}t`,
        status: m.status,
        timestamp: m.createdAt?.toISOString(),
        details: { remainingQuota: m.remainingQuota },
      });
    }

    // 5. Vehicles
    const vehicles = await VehicleModel.find({
      $or: [{ registrationNumber: regex }, { vehicleId: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const v of vehicles) {
      results.push({
        entityType: 'VEHICLE',
        id: v._id.toString(),
        referenceId: v.registrationNumber,
        title: `Vehicle ${v.registrationNumber}`,
        subtitle: `Type: ${v.vehicleType} • Capacity: ${v.permittedCarryingCapacity}t`,
        status: v.status,
        timestamp: v.createdAt?.toISOString(),
        details: { vehicleType: v.vehicleType },
      });
    }

    // 6. E-Passes
    const passes = await EPassModel.find({
      $or: [{ passNumber: regex }, { mineralType: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const p of passes) {
      results.push({
        entityType: 'EPASS',
        id: p._id.toString(),
        referenceId: p.passNumber,
        title: `E-Pass ${p.passNumber}`,
        subtitle: `Mineral: ${p.mineralType} • Weight: ${p.netWeightTonnes}t`,
        status: p.status,
        timestamp: p.createdAt?.toISOString(),
        details: { netWeightTonnes: p.netWeightTonnes },
      });
    }

    // 7. Checkpoints
    const checkpoints = await CheckpointModel.find({
      $or: [{ name: regex }, { checkpointId: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const cp of checkpoints) {
      results.push({
        entityType: 'CHECKPOINT',
        id: cp._id.toString(),
        referenceId: cp.checkpointId || cp.name,
        title: cp.name,
        subtitle: `District: ${cp.district || 'N/A'} • Status: ${cp.status}`,
        status: cp.status,
        timestamp: cp.createdAt?.toISOString(),
      });
    }

    // 8. Reconciliation Reports
    const recons = await ReconciliationReportModel.find({
      $or: [{ reconciliationId: regex }, { permitNumber: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const r of recons) {
      results.push({
        entityType: 'RECONCILIATION',
        id: r._id.toString(),
        referenceId: r.reconciliationId,
        title: `Recon Audit ${r.reconciliationId}`,
        subtitle: `Discrepancy Score: ${r.discrepancyScore}/100 • Status: ${r.reconciliationStatus}`,
        status: r.status,
        severity: r.reconciliationStatus === ReconciliationStatus.CRITICAL_ANOMALY ? 'CRITICAL' : 'NORMAL',
        timestamp: r.createdAt?.toISOString(),
        details: { discrepancyScore: r.discrepancyScore },
      });
    }

    // 9. Evidence Dossiers
    const dossiers = await EvidenceDossierModel.find({
      $or: [{ dossierId: regex }, { caseNumber: regex }],
    })
      .limit(maxLimit)
      .lean();
    for (const d of dossiers) {
      results.push({
        entityType: 'EVIDENCE_DOSSIER',
        id: d._id.toString(),
        referenceId: d.dossierId,
        title: `Evidence Dossier ${d.dossierId}`,
        subtitle: `Case: ${d.caseNumber} • Sealed: ${d.isSealed ? 'YES' : 'NO'}`,
        status: d.isSealed ? 'SEALED' : 'DRAFT',
        timestamp: d.createdAt?.toISOString(),
        details: { dossierVersion: d.dossierVersion },
      });
    }

    return {
      query: q,
      totalMatches: results.length,
      results: results.slice(0, maxLimit),
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 13. Alert Lineage Correlation Detail
   */
  async getAlertIntelligenceDetail(alertId: string): Promise<AlertLineageCorrelationDto> {
    let alertDoc;
    if (Types.ObjectId.isValid(alertId)) {
      alertDoc = await AlertModel.findById(alertId).lean();
    }
    if (!alertDoc) {
      alertDoc = await AlertModel.findOne({ alertId }).lean();
    }
    if (!alertDoc) {
      throw new AppError(`Alert ${alertId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    const [zone, changeDetection] = await Promise.all([
      alertDoc.zoneId ? Zone.findById(alertDoc.zoneId).lean() : null,
      alertDoc.changeDetectionId ? ChangeDetectionModel.findById(alertDoc.changeDetectionId).lean() : null,
    ]);

    let baseline = null;
    let observation = null;
    if (changeDetection) {
      if (changeDetection.baselineId) {
        baseline = await BaselineModel.findById(changeDetection.baselineId).lean();
      }
      if (changeDetection.observationId) {
        observation = await SatelliteMetadata.findById(changeDetection.observationId).lean();
      }
    }

    const zObjectId = alertDoc.zoneId;
    const [enforcementCases, reconciliationReports, evidenceDossiers] = await Promise.all([
      zObjectId ? EnforcementCaseModel.find({ zoneId: zObjectId }).sort({ createdAt: -1 }).limit(10).lean() : [],
      zObjectId ? ReconciliationReportModel.find({ zoneId: zObjectId }).sort({ createdAt: -1 }).limit(10).lean() : [],
      EvidenceDossierModel.find({ 'dossierData.alerts.alertId': alertDoc.alertId }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return {
      alert: {
        id: alertDoc._id.toString(),
        alertId: alertDoc.alertId,
        severity: alertDoc.severity,
        status: alertDoc.status,
        evidenceScore: alertDoc.evidenceStrength,
        affectedAreaPercentage: alertDoc.affectedAreaPercentage,
        createdAt: alertDoc.createdAt.toISOString(),
        explanation: alertDoc.explanation,
      },
      zone: zone
        ? {
            id: zone._id.toString(),
            zoneId: zone.zoneId,
            name: zone.name,
            category: zone.category,
          }
        : undefined,
      changeDetection: changeDetection
        ? {
            id: changeDetection._id.toString(),
            affectedAreaPercentage: changeDetection.affectedAreaPercentage,
            evidenceStrength: changeDetection.evidenceStrength,
            detectedAt: changeDetection.detectedAt ? new Date(changeDetection.detectedAt).toISOString() : new Date().toISOString(),
            sensorType: changeDetection.sensorType,
            source: changeDetection.source,
          }
        : undefined,
      baseline: baseline
        ? {
            id: baseline._id.toString(),
            baselineId: baseline.imageId || baseline._id.toString(),
            effectiveDate: baseline.acquisitionDate ? new Date(baseline.acquisitionDate).toISOString() : undefined,
          }
        : undefined,
      observation: observation
        ? {
            id: observation._id.toString(),
            observationId: observation.imageId || observation._id.toString(),
            source: observation.source,
            acquisitionDate: observation.acquisitionDate ? new Date(observation.acquisitionDate).toISOString() : new Date().toISOString(),
          }
        : undefined,
      enforcementCases: enforcementCases.map((c) => ({
        id: c._id.toString(),
        caseId: c.caseId,
        title: c.title,
        status: c.status,
        severity: c.severity,
      })),
      reconciliationReports: reconciliationReports.map((r) => ({
        id: r._id.toString(),
        reconciliationId: r.reconciliationId,
        discrepancyScore: r.discrepancyScore,
        status: r.status,
      })),
      evidenceDossiers: evidenceDossiers.map((d) => ({
        id: d._id.toString(),
        dossierId: d.dossierId,
        dossierHash: d.dossierHash,
        isSealed: d.isSealed,
      })),
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 14. Mining Lease Lineage Detail
   */
  async getLeaseIntelligenceDetail(leaseId: string): Promise<LeaseLineageCorrelationDto> {
    let leaseDoc;
    if (Types.ObjectId.isValid(leaseId)) {
      leaseDoc = await MiningAuthorizationModel.findById(leaseId).lean();
    }
    if (!leaseDoc) {
      leaseDoc = await MiningAuthorizationModel.findOne({
        $or: [{ authorizationId: leaseId }, { permitNumber: leaseId }],
      }).lean();
    }
    if (!leaseDoc) {
      throw new AppError(`Mining Lease / Authorization ${leaseId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    const [zone, ePasses, checkpointLogs, recons, cases] = await Promise.all([
      leaseDoc.zoneId ? Zone.findById(leaseDoc.zoneId).lean() : null,
      EPassModel.find({ authorizationId: leaseDoc._id }).sort({ createdAt: -1 }).limit(20).lean(),
      CheckpointLogModel.find({ authorizationId: leaseDoc._id }).sort({ verificationTimestamp: -1 }).limit(20).lean(),
      ReconciliationReportModel.find({
        $or: [{ authorizationId: leaseDoc._id }, { permitNumber: leaseDoc.permitNumber }],
      }).sort({ createdAt: -1 }).limit(10).lean(),
      leaseDoc.zoneId ? EnforcementCaseModel.find({ zoneId: leaseDoc.zoneId }).sort({ createdAt: -1 }).limit(10).lean() : [],
    ]);

    return {
      lease: {
        id: leaseDoc._id.toString(),
        permitNumber: leaseDoc.permitNumber,
        lesseeName: leaseDoc.lesseeName,
        mineralType: leaseDoc.mineralType,
        permittedWeightTonnes: leaseDoc.permittedWeightTonnes,
        remainingQuota: leaseDoc.remainingQuota,
        status: leaseDoc.status,
        validFrom: leaseDoc.validFrom ? new Date(leaseDoc.validFrom).toISOString() : new Date().toISOString(),
        validUntil: leaseDoc.validUntil ? new Date(leaseDoc.validUntil).toISOString() : new Date().toISOString(),
      },
      zone: zone
        ? {
            id: zone._id.toString(),
            zoneId: zone.zoneId,
            name: zone.name,
          }
        : undefined,
      ePasses: ePasses.map((p) => ({
        id: p._id.toString(),
        passNumber: p.passNumber,
        vehicleId: p.vehicleId?.toString(),
        netWeightTonnes: p.netWeightTonnes,
        status: p.status,
      })),
      checkpointPassages: checkpointLogs.map((c) => ({
        id: c._id.toString(),
        passNumber: c.passNumber,
        checkpointName: c.checkpointName,
        declaredQuantityTonnes: c.declaredQuantityTonnes ?? 0,
        verificationResult: String(c.verificationResult || ''),
        verificationTimestamp: c.verificationTimestamp ? new Date(c.verificationTimestamp).toISOString() : new Date().toISOString(),
      })),
      reconciliationReports: recons.map((r) => ({
        id: r._id.toString(),
        reconciliationId: r.reconciliationId,
        discrepancyScore: r.discrepancyScore,
        reconciliationStatus: r.reconciliationStatus,
      })),
      enforcementCases: cases.map((c) => ({
        id: c._id.toString(),
        caseId: c.caseId,
        title: c.title,
        status: c.status,
        severity: c.severity,
      })),
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 15. Vehicle Lineage Detail
   */
  async getVehicleIntelligenceDetail(vehicleId: string): Promise<VehicleLineageCorrelationDto> {
    let vehicleDoc;
    if (Types.ObjectId.isValid(vehicleId)) {
      vehicleDoc = await VehicleModel.findById(vehicleId).lean();
    }
    if (!vehicleDoc) {
      vehicleDoc = await VehicleModel.findOne({
        $or: [{ vehicleId }, { registrationNumber: vehicleId.toUpperCase() }],
      }).lean();
    }
    if (!vehicleDoc) {
      throw new AppError(`Vehicle ${vehicleId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    const [ePasses, checkpointLogs] = await Promise.all([
      EPassModel.find({ vehicleId: vehicleDoc._id }).sort({ createdAt: -1 }).limit(20).lean(),
      CheckpointLogModel.find({
        $or: [{ vehicleId: vehicleDoc._id }, { vehicleRegistrationNumber: vehicleDoc.registrationNumber }],
      }).sort({ verificationTimestamp: -1 }).limit(20).lean(),
    ]);

    const passNumbers = ePasses.map((p) => p.passNumber);
    const [recons, cases] = await Promise.all([
      ReconciliationReportModel.find({
        'transportSummary.passNumbers': { $in: passNumbers },
      }).sort({ createdAt: -1 }).limit(10).lean(),
      EnforcementCaseModel.find({
        $or: [
          { 'investigationDetails.vehicleRegistrations': vehicleDoc.registrationNumber },
          { description: new RegExp(vehicleDoc.registrationNumber, 'i') },
        ],
      }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return {
      vehicle: {
        id: vehicleDoc._id.toString(),
        vehicleId: vehicleDoc.vehicleId,
        registrationNumber: vehicleDoc.registrationNumber,
        vehicleType: vehicleDoc.vehicleType,
        status: vehicleDoc.status,
        tareWeight: vehicleDoc.tareWeight,
        grossVehicleWeight: vehicleDoc.grossVehicleWeight,
        permittedCarryingCapacity: vehicleDoc.permittedCarryingCapacity,
      },
      ePasses: ePasses.map((p) => ({
        id: p._id.toString(),
        passNumber: p.passNumber,
        mineralType: p.mineralType,
        netWeightTonnes: p.netWeightTonnes,
        status: p.status,
        validUntil: p.validUntil ? new Date(p.validUntil).toISOString() : new Date().toISOString(),
      })),
      checkpointLogs: checkpointLogs.map((c) => ({
        id: c._id.toString(),
        checkpointName: c.checkpointName,
        passNumber: c.passNumber,
        declaredQuantityTonnes: c.declaredQuantityTonnes ?? 0,
        verificationResult: String(c.verificationResult || ''),
        locationStatus: String(c.locationStatus || ''),
        verificationTimestamp: c.verificationTimestamp ? new Date(c.verificationTimestamp).toISOString() : new Date().toISOString(),
      })),
      reconciliationReports: recons.map((r) => ({
        id: r._id.toString(),
        reconciliationId: r.reconciliationId,
        discrepancyScore: r.discrepancyScore,
        reconciliationStatus: r.reconciliationStatus,
      })),
      enforcementCases: cases.map((c) => ({
        id: c._id.toString(),
        caseId: c.caseId,
        title: c.title,
        status: c.status,
        severity: c.severity,
      })),
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }

  /**
   * 16. E-Pass Lineage Detail
   */
  async getEPassIntelligenceDetail(passId: string): Promise<EPassLineageCorrelationDto> {
    let epassDoc;
    if (Types.ObjectId.isValid(passId)) {
      epassDoc = await EPassModel.findById(passId).lean();
    }
    if (!epassDoc) {
      epassDoc = await EPassModel.findOne({ passNumber: passId }).lean();
    }
    if (!epassDoc) {
      throw new AppError(`E-Pass ${passId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    const [auth, vehicle, driver, checkpointLogs, recons] = await Promise.all([
      epassDoc.authorizationId ? MiningAuthorizationModel.findById(epassDoc.authorizationId).lean() : null,
      epassDoc.vehicleId ? VehicleModel.findById(epassDoc.vehicleId).lean() : null,
      epassDoc.driverId ? DriverModel.findById(epassDoc.driverId).lean() : null,
      CheckpointLogModel.find({ passNumber: epassDoc.passNumber }).sort({ verificationTimestamp: -1 }).limit(10).lean(),
      ReconciliationReportModel.find({
        $or: [
          { authorizationId: epassDoc.authorizationId },
          { 'transportSummary.passNumbers': epassDoc.passNumber },
        ],
      }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return {
      ePass: {
        id: epassDoc._id.toString(),
        passNumber: epassDoc.passNumber,
        mineralType: epassDoc.mineralType,
        netWeightTonnes: epassDoc.netWeightTonnes,
        status: epassDoc.status,
        validFrom: epassDoc.validFrom ? new Date(epassDoc.validFrom).toISOString() : new Date().toISOString(),
        validUntil: epassDoc.validUntil ? new Date(epassDoc.validUntil).toISOString() : new Date().toISOString(),
        sourceLocation: epassDoc.sourceLocation,
        destinationCheckpoint: epassDoc.destinationCheckpoint,
      },
      authorization: auth
        ? {
            id: auth._id.toString(),
            permitNumber: auth.permitNumber,
            lesseeName: auth.lesseeName,
            mineralType: auth.mineralType,
            permittedWeightTonnes: auth.permittedWeightTonnes,
            remainingQuota: auth.remainingQuota,
          }
        : undefined,
      vehicle: vehicle
        ? {
            id: vehicle._id.toString(),
            vehicleId: vehicle.vehicleId,
            registrationNumber: vehicle.registrationNumber,
          }
        : undefined,
      driver: driver
        ? {
            id: driver._id.toString(),
            driverId: driver.driverId,
            name: driver.name,
            licenseNumber: driver.licenseNumber,
          }
        : undefined,
      checkpointPassages: checkpointLogs.map((c) => ({
        id: c._id.toString(),
        checkpointName: c.checkpointName,
        verificationResult: c.verificationResult,
        locationStatus: c.locationStatus,
        verificationTimestamp: c.verificationTimestamp ? new Date(c.verificationTimestamp).toISOString() : new Date().toISOString(),
      })),
      reconciliationReports: recons.map((r) => ({
        id: r._id.toString(),
        reconciliationId: r.reconciliationId,
        discrepancyScore: r.discrepancyScore,
      })),
      disclaimer: STATUTORY_DISCLAIMER,
    };
  }
}
