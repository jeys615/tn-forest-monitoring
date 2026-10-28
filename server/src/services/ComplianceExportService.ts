import { Types } from 'mongoose';
import { Zone } from '../models/Zone.js';
import { AlertModel } from '../models/Alert.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import {
  AlertSeverity,
  CaseStatus,
  MiningAuthorizationStatus,
  type ComplianceReportFilters,
  type ComplianceReportDto,
  type ZoneComplianceRecordDto,
  type StatutoryViolationRecordDto,
  type EnforcementActionRecordDto,
  type ComplianceSummaryMetricsDto,
} from '@tn-forest/shared/types';

export class ComplianceExportService {
  /**
   * Generates a comprehensive, ground-truth Statutory Compliance Report
   * aggregating environmental satellite metrics, transport e-passes,
   * checkpoint passages, reconciliation findings, and formal enforcement cases.
   */
  async generateComplianceReport(
    filters: ComplianceReportFilters = {},
    actor?: { id?: string; name?: string },
  ): Promise<ComplianceReportDto> {
    const fromDate = filters.startDate ? new Date(filters.startDate) : new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const toDate = filters.endDate ? new Date(filters.endDate) : new Date();

    // 1. Monitored Zones
    const zoneQuery: Record<string, unknown> = {};
    if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId)) {
      zoneQuery._id = new Types.ObjectId(filters.zoneId);
    }
    const zones = await Zone.find(zoneQuery).exec();

    // 2. Environmental Alerts
    const alertQuery: Record<string, unknown> = {
      detectedAt: { $gte: fromDate, $lte: toDate },
    };
    if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId)) {
      alertQuery.zoneId = new Types.ObjectId(filters.zoneId);
    }
    if (filters.severity) {
      alertQuery.severity = filters.severity;
    }
    const alerts = await AlertModel.find(alertQuery).exec();
    const criticalAlertsCount = alerts.filter((a) => a.severity === AlertSeverity.HIGH).length;

    // 3. Change Detections & Disturbed Area
    const changeQuery: Record<string, unknown> = {
      detectedAt: { $gte: fromDate, $lte: toDate },
    };
    if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId)) {
      changeQuery.zoneId = new Types.ObjectId(filters.zoneId);
    }
    const changes = await ChangeDetectionModel.find(changeQuery).exec();
    const totalDisturbedArea = changes.reduce((acc, c) => acc + (c.changedArea || 0), 0);

    // 4. Mining Leases / Authorizations
    const authQuery: Record<string, unknown> = {};
    const authorizations = await MiningAuthorizationModel.find(authQuery).exec();
    const activeLeases = authorizations.filter((a) => a.status === MiningAuthorizationStatus.ACTIVE);
    const totalPermittedTonnage = authorizations.reduce((acc, a) => acc + (a.permittedWeightTonnes || 0), 0);

    // 5. E-Passes
    const epassQuery: Record<string, unknown> = {
      createdAt: { $gte: fromDate, $lte: toDate },
    };
    const epassCount = await EPassModel.countDocuments(epassQuery).exec();

    // 6. Checkpoint Logs
    const checkpointLogQuery: Record<string, unknown> = {
      verificationTimestamp: { $gte: fromDate, $lte: toDate },
    };
    if (filters.district && typeof filters.district === 'string' && filters.district.trim().length > 0) {
      const trimmedDistrict = filters.district.trim();
      const matchingCheckpoints = await CheckpointModel.find({
        district: { $regex: new RegExp(`^${trimmedDistrict}$`, 'i') },
      })
        .select('_id')
        .exec();
      const checkpointIds = matchingCheckpoints.map((c) => c._id);
      checkpointLogQuery.checkpointId = { $in: checkpointIds };
    }
    const checkpointPassageCount = await CheckpointLogModel.countDocuments(checkpointLogQuery).exec();

    // 7. Reconciliation Reports & Anomalies
    const reconQuery: Record<string, unknown> = {
      createdAt: { $gte: fromDate, $lte: toDate },
    };
    const recons = await ReconciliationReportModel.find(reconQuery).exec();
    const reconciliationAnomaliesCount = recons.reduce((acc, r) => acc + (r.anomalies?.length || 0), 0);

    // 8. Enforcement Cases
    const caseQuery: Record<string, unknown> = {
      createdAt: { $gte: fromDate, $lte: toDate },
    };
    if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId)) {
      caseQuery.zoneId = new Types.ObjectId(filters.zoneId);
    }
    const cases = await EnforcementCaseModel.find(caseQuery)
      .populate('assignedOfficerId', 'name email role')
      .populate('zoneId', 'name category')
      .exec();

    const activeCasesCount = cases.filter((c) => c.status !== CaseStatus.CLOSED).length;
    const penaltiesLeviedInr = cases.reduce(
      (acc, c) => acc + (c.enforcementAction?.penaltyAmountInr || 0),
      0,
    );

    // 9. Zone-by-Zone Compliance Summaries
    const zoneComplianceSummaries: ZoneComplianceRecordDto[] = zones.map((z) => {
      const zoneIdStr = z._id.toString();
      const zoneAlerts = alerts.filter((a) => a.zoneId && a.zoneId.toString() === zoneIdStr);
      const zoneCriticalAlerts = zoneAlerts.filter((a) => a.severity === AlertSeverity.HIGH).length;
      const zoneChanges = changes.filter((c) => c.zoneId && c.zoneId.toString() === zoneIdStr);
      const zoneDisturbedArea = zoneChanges.reduce((acc, c) => acc + (c.changedArea || 0), 0);
      const zoneLeases = authorizations.filter(
        (a) => a.zoneId && a.zoneId.toString() === zoneIdStr && a.status === MiningAuthorizationStatus.ACTIVE,
      ).length;

      let complianceStatus: 'COMPLIANT' | 'WARNING' | 'BREACH' = 'COMPLIANT';
      if (zoneCriticalAlerts > 0 || zoneDisturbedArea > 1.0) {
        complianceStatus = 'BREACH';
      } else if (zoneAlerts.length > 0 || zoneDisturbedArea > 0) {
        complianceStatus = 'WARNING';
      }

      return {
        zoneId: z.zoneId,
        zoneName: z.name,
        category: z.category,
        totalAreaHectares: z.areaHectares ?? 0,
        status: z.status,
        activeLeasesCount: zoneLeases,
        alertsCount: zoneAlerts.length,
        criticalAlertsCount: zoneCriticalAlerts,
        disturbedAreaHectares: Number(zoneDisturbedArea.toFixed(2)),
        complianceStatus,
      };
    });

    // 10. Statutory Violations
    const statutoryViolations: StatutoryViolationRecordDto[] = cases.map((c) => {
      const zName = (c.zoneId as any)?.name ?? c.zoneName ?? 'State Reserved Forest';
      let statutoryRef = 'Section 21 of Tamil Nadu Forest Act 1882';
      if (c.caseType.includes('MINING') || c.caseType.includes('EXTRACTION')) {
        statutoryRef = 'Section 4(1) & 21(1) of MMDR Act 1957 & Section 21 of TN Forest Act 1882';
      } else if (c.caseType.includes('TRANSPORT')) {
        statutoryRef = 'Section 4(1A) & 21(4) of MMDR Act 1957';
      }

      return {
        caseId: c._id.toString(),
        caseNumber: c.caseId,
        zoneName: zName,
        violationType: c.caseType,
        severity: c.severity,
        detectedAt: c.createdAt.toISOString(),
        status: c.status,
        penaltyAmountInr: c.enforcementAction?.penaltyAmountInr,
        statutoryReference: statutoryRef,
      };
    });

    // 11. Enforcement Actions Summary
    const enforcementActionsSummary: EnforcementActionRecordDto[] = cases
      .filter((c) => c.enforcementAction?.actionType)
      .map((c) => ({
        caseId: c._id.toString(),
        caseNumber: c.caseId,
        actionType: c.enforcementAction!.actionType!,
        actionDate: c.enforcementAction!.actionDate?.toISOString() ?? c.createdAt.toISOString(),
        penaltyAmountInr: c.enforcementAction!.penaltyAmountInr,
        officialOrderReference: c.enforcementAction!.officialOrderReference,
        officerName: (c.assignedOfficerId as any)?.name ?? c.assignedOfficerName ?? 'Authorized Forest Officer',
      }));

    const summaryMetrics: ComplianceSummaryMetricsDto = {
      totalMonitoredZones: zones.length,
      totalEnvironmentalAlerts: alerts.length,
      criticalAlertsCount,
      totalDisturbedAreaHectares: Number(totalDisturbedArea.toFixed(2)),
      totalAuthorizedMiningLeases: activeLeases.length,
      totalPermittedTonnage: Number(totalPermittedTonnage.toFixed(2)),
      totalEPassesIssued: epassCount,
      totalCheckpointPassages: checkpointPassageCount,
      reconciliationAnomaliesCount,
      activeEnforcementCasesCount: activeCasesCount,
      penaltiesLeviedInr,
    };

    return {
      reportId: `COMPL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      title: 'Tamil Nadu Forest & Mining Enforcement Statutory Compliance Report',
      generatedAt: new Date().toISOString(),
      generatedBy: actor?.name ?? 'State Environmental Enforcement Directorate',
      jurisdiction: 'Tamil Nadu Forest & Mining Enforcement',
      statutoryActReference:
        'Tamil Nadu Forest Act 1882 & Mines and Minerals (Development and Regulation) Act 1957',
      reportingPeriod: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
      },
      selectedDistrict: filters.district,
      selectedZoneId: filters.zoneId,
      summaryMetrics,
      zoneComplianceSummaries,
      statutoryViolations,
      enforcementActionsSummary,
    };
  }

  // ---------------------------------------------------------------------------
  // CSV Serialization (RFC 4180 Compliant)
  // ---------------------------------------------------------------------------

  private escapeCsv(val: unknown): string {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  }

  /**
   * Formats the ComplianceReportDto into a structured, RFC 4180 CSV document.
   */
  generateComplianceCsv(report: ComplianceReportDto): string {
    const lines: string[] = [];

    // Header & Legal Mandate
    lines.push(this.escapeCsv(report.title));
    lines.push(`${this.escapeCsv('Report ID')},${this.escapeCsv(report.reportId)}`);
    lines.push(`${this.escapeCsv('Generated At')},${this.escapeCsv(report.generatedAt)}`);
    lines.push(`${this.escapeCsv('Generated By')},${this.escapeCsv(report.generatedBy ?? 'Enforcement Directorate')}`);
    lines.push(`${this.escapeCsv('Statutory Acts')},${this.escapeCsv(report.statutoryActReference)}`);
    lines.push(
      `${this.escapeCsv('Reporting Period')},${this.escapeCsv(
        `${report.reportingPeriod.fromDate} to ${report.reportingPeriod.toDate}`,
      )}`,
    );
    if (report.selectedDistrict) {
      lines.push(`${this.escapeCsv('Filtered District')},${this.escapeCsv(report.selectedDistrict)}`);
    }
    if (report.selectedZoneId) {
      lines.push(`${this.escapeCsv('Filtered Zone ID')},${this.escapeCsv(report.selectedZoneId)}`);
    }
    lines.push('');

    // Summary Metrics Section
    lines.push(this.escapeCsv('--- EXECUTIVE SUMMARY METRICS ---'));
    lines.push(`${this.escapeCsv('Metric')},${this.escapeCsv('Value')}`);
    lines.push(`${this.escapeCsv('Total Monitored Zones')},${report.summaryMetrics.totalMonitoredZones}`);
    lines.push(`${this.escapeCsv('Total Environmental Alerts')},${report.summaryMetrics.totalEnvironmentalAlerts}`);
    lines.push(`${this.escapeCsv('Critical Severity Alerts')},${report.summaryMetrics.criticalAlertsCount}`);
    lines.push(
      `${this.escapeCsv('Total Disturbed Forest Area (Hectares)')},${report.summaryMetrics.totalDisturbedAreaHectares}`,
    );
    lines.push(`${this.escapeCsv('Active Mining Leases')},${report.summaryMetrics.totalAuthorizedMiningLeases}`);
    lines.push(
      `${this.escapeCsv('Total Permitted Quota (Tonnes)')},${report.summaryMetrics.totalPermittedTonnage}`,
    );
    lines.push(`${this.escapeCsv('Total E-Passes Issued')},${report.summaryMetrics.totalEPassesIssued}`);
    lines.push(`${this.escapeCsv('Total Checkpoint Passages')},${report.summaryMetrics.totalCheckpointPassages}`);
    lines.push(
      `${this.escapeCsv('Reconciliation Anomalies Detected')},${report.summaryMetrics.reconciliationAnomaliesCount}`,
    );
    lines.push(
      `${this.escapeCsv('Active Enforcement Cases Under Investigation')},${report.summaryMetrics.activeEnforcementCasesCount}`,
    );
    lines.push(`${this.escapeCsv('Total Penalties Levied (INR)')},${report.summaryMetrics.penaltiesLeviedInr}`);
    lines.push('');

    // Zone Compliance Matrix
    lines.push(this.escapeCsv('--- ZONE COMPLIANCE MATRIX ---'));
    lines.push(
      [
        'Zone ID',
        'Zone Name',
        'Category',
        'Area (ha)',
        'Status',
        'Active Leases',
        'Alerts',
        'Critical Alerts',
        'Disturbed Area (ha)',
        'Compliance Status',
      ]
        .map(this.escapeCsv)
        .join(','),
    );

    for (const z of report.zoneComplianceSummaries) {
      lines.push(
        [
          z.zoneId,
          z.zoneName,
          z.category,
          z.totalAreaHectares,
          z.status,
          z.activeLeasesCount,
          z.alertsCount,
          z.criticalAlertsCount,
          z.disturbedAreaHectares,
          z.complianceStatus,
        ]
          .map(this.escapeCsv)
          .join(','),
      );
    }
    lines.push('');

    // Statutory Violations
    lines.push(this.escapeCsv('--- STATUTORY VIOLATIONS & ENFORCEMENT CASES ---'));
    lines.push(
      [
        'Case Number',
        'Zone Name',
        'Violation Type',
        'Severity',
        'Detected At',
        'Status',
        'Penalty Levied (INR)',
        'Statutory Reference',
      ]
        .map(this.escapeCsv)
        .join(','),
    );

    for (const v of report.statutoryViolations) {
      lines.push(
        [
          v.caseNumber,
          v.zoneName,
          v.violationType,
          v.severity,
          v.detectedAt,
          v.status,
          v.penaltyAmountInr ?? 0,
          v.statutoryReference,
        ]
          .map(this.escapeCsv)
          .join(','),
      );
    }
    lines.push('');

    // Enforcement Actions
    lines.push(this.escapeCsv('--- RECORDED OFFICIAL ENFORCEMENT ACTIONS ---'));
    lines.push(
      [
        'Case Number',
        'Action Type',
        'Action Date',
        'Penalty Amount (INR)',
        'Official Order Reference',
        'Issuing Officer',
      ]
        .map(this.escapeCsv)
        .join(','),
    );

    for (const a of report.enforcementActionsSummary) {
      lines.push(
        [
          a.caseNumber,
          a.actionType,
          a.actionDate,
          a.penaltyAmountInr ?? 0,
          a.officialOrderReference ?? 'N/A',
          a.officerName ?? 'Authorized Officer',
        ]
          .map(this.escapeCsv)
          .join(','),
      );
    }

    return lines.join('\r\n');
  }

  /**
   * Retrieves unique districts persisted across registered checkpoints.
   */
  async getAvailableDistricts(): Promise<string[]> {
    const districts = await CheckpointModel.distinct('district').exec();
    return (districts as string[])
      .filter((d) => typeof d === 'string' && d.trim().length > 0)
      .map((d) => d.trim())
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Retrieves high-level operational and statutory summary metrics for dashboard display.
   */
  async getOperationalSummary(
    filters: ComplianceReportFilters = {},
    actor?: { id?: string; name?: string },
  ): Promise<ComplianceReportDto> {
    return this.generateComplianceReport(filters, actor);
  }
}

export const complianceExportService = new ComplianceExportService();
