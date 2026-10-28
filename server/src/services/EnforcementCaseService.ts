import { Types } from 'mongoose';
import { EnforcementCaseRepository } from '../repositories/EnforcementCaseRepository.js';
import { CaseAuditLogRepository } from '../repositories/CaseAuditLogRepository.js';
import { ReconciliationReportRepository } from '../repositories/ReconciliationReportRepository.js';
import { ZoneRepository } from '../repositories/ZoneRepository.js';
import { MiningAuthorizationRepository } from '../repositories/MiningAuthorizationRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  CaseStatus,
  CaseSeverity,
  CaseType,
  CaseAuditAction,
  ReconciliationAnomalyType,
  type EnforcementCaseDto,
  type CaseAuditLogDto,
  type CreateEnforcementCaseRequest,
  type CreateCaseFromReconciliationRequest,
  type AssignOfficerRequest,
  type UpdateCaseStatusRequest,
  type UpdateInvestigationRequest,
  type RecordEnforcementActionRequest,
  type CloseCaseRequest,
  type EnforcementCaseFilters,
  type EnforcementCaseSummaryDto,
} from '@tn-forest/shared/types';

export class EnforcementCaseService {
  constructor(
    private readonly caseRepo = new EnforcementCaseRepository(),
    private readonly auditRepo = new CaseAuditLogRepository(),
    private readonly reconRepo = new ReconciliationReportRepository(),
    private readonly zoneRepo = new ZoneRepository(),
    private readonly authRepo = new MiningAuthorizationRepository(),
    private readonly userRepo = new UserRepository(),
  ) {}

  private generateCaseId(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `CASE-${year}-${random}`;
  }

  private generateAuditId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(100 + Math.random() * 900);
    return `AUD-${timestamp}-${random}`;
  }

  private async logAudit(params: {
    caseId: Types.ObjectId;
    caseNumber: string;
    actorId?: string;
    action: CaseAuditAction;
    previousStatus?: CaseStatus;
    newStatus?: CaseStatus;
    remarks?: string;
    changes?: Record<string, { old: unknown; new: unknown }>;
  }): Promise<void> {
    let actorName = 'System';
    let actorRole = 'SYSTEM';

    if (params.actorId && Types.ObjectId.isValid(params.actorId)) {
      const u = await this.userRepo.findById(params.actorId);
      if (u) {
        actorName = u.name;
        actorRole = u.role;
      }
    }

    await this.auditRepo.create({
      auditId: this.generateAuditId(),
      caseId: params.caseId,
      caseNumber: params.caseNumber,
      actorId: params.actorId && Types.ObjectId.isValid(params.actorId) ? new Types.ObjectId(params.actorId) : undefined,
      actorName,
      actorRole,
      action: params.action,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      remarks: params.remarks || `Action ${params.action} performed`,
      changes: params.changes,
      timestamp: new Date(),
    });
  }

  async createCase(
    data: CreateEnforcementCaseRequest,
    userId?: string,
  ): Promise<EnforcementCaseDto> {
    let zoneName: string | undefined = undefined;
    if (data.zoneId && Types.ObjectId.isValid(data.zoneId)) {
      const z = await this.zoneRepo.findById(data.zoneId);
      if (z) zoneName = z.name;
    }

    let permitNumber: string | undefined = undefined;
    if (data.authorizationId && Types.ObjectId.isValid(data.authorizationId)) {
      const a = await this.authRepo.findById(data.authorizationId);
      if (a) {
        permitNumber = a.permitNumber;
        if (!zoneName && a.zoneId) {
          const rawZ: unknown = a.zoneId;
          const zId = typeof rawZ === 'object' && rawZ !== null && '_id' in rawZ
            ? String((rawZ as { _id: unknown })._id)
            : String(rawZ);
          const z = await this.zoneRepo.findById(zId);
          if (z) zoneName = z.name;
        }
      }
    }

    let assignedOfficerName: string | undefined = undefined;
    let assignedAt: Date | undefined = undefined;
    let initialStatus = CaseStatus.CASE_CREATED;

    if (data.assignedOfficerId && Types.ObjectId.isValid(data.assignedOfficerId)) {
      const officer = await this.userRepo.findById(data.assignedOfficerId);
      if (!officer) {
        throw new AppError(`Assigned officer "${data.assignedOfficerId}" not found`, HTTP_STATUS.NOT_FOUND);
      }
      assignedOfficerName = officer.name;
      assignedAt = new Date();
      initialStatus = CaseStatus.ASSIGNED;
    }

    const caseDoc = await this.caseRepo.create({
      caseId: this.generateCaseId(),
      reconciliationReportId: data.reconciliationReportId && Types.ObjectId.isValid(data.reconciliationReportId)
        ? new Types.ObjectId(data.reconciliationReportId)
        : undefined,
      zoneId: data.zoneId && Types.ObjectId.isValid(data.zoneId) ? new Types.ObjectId(data.zoneId) : undefined,
      zoneName,
      authorizationId: data.authorizationId && Types.ObjectId.isValid(data.authorizationId)
        ? new Types.ObjectId(data.authorizationId)
        : undefined,
      permitNumber,
      severity: data.severity,
      caseType: data.caseType,
      title: data.title.trim(),
      description: data.description.trim(),
      status: initialStatus,
      assignedOfficerId: data.assignedOfficerId && Types.ObjectId.isValid(data.assignedOfficerId)
        ? new Types.ObjectId(data.assignedOfficerId)
        : undefined,
      assignedOfficerName,
      assignedAt,
      investigationFindings: data.investigationFindings || [],
      createdBy: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    });

    await this.logAudit({
      caseId: caseDoc._id as Types.ObjectId,
      caseNumber: caseDoc.caseId,
      actorId: userId,
      action: CaseAuditAction.CASE_CREATED,
      newStatus: initialStatus,
      remarks: `Enforcement case ${caseDoc.caseId} initiated: "${caseDoc.title}"`,
    });

    return caseDoc.toDto();
  }

  async createCaseFromReconciliation(
    data: CreateCaseFromReconciliationRequest,
    userId?: string,
  ): Promise<EnforcementCaseDto> {
    if (!Types.ObjectId.isValid(data.reconciliationReportId)) {
      throw new AppError(`Invalid reconciliation report ID: "${data.reconciliationReportId}"`, HTTP_STATUS.BAD_REQUEST);
    }

    const reconReport = await this.reconRepo.findById(data.reconciliationReportId);
    if (!reconReport) {
      throw new AppError(`Reconciliation report "${data.reconciliationReportId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    // Duplicate prevention: check if an active case already exists for this report
    const existingActiveCase = await this.caseRepo.findActiveByReconciliationReportId(reconReport._id);
    if (existingActiveCase) {
      throw new AppError(
        `Active enforcement case "${existingActiveCase.caseId}" already exists for Reconciliation Report "${reconReport.reconciliationId}"`,
        HTTP_STATUS.CONFLICT,
      );
    }

    // Determine CaseSeverity based on anomalies or discrepancy score
    let severity = CaseSeverity.MEDIUM;
    if (reconReport.discrepancyScore >= 50) {
      severity = CaseSeverity.CRITICAL;
    } else if (reconReport.discrepancyScore >= 25) {
      severity = CaseSeverity.HIGH;
    } else if (reconReport.discrepancyScore < 15) {
      severity = CaseSeverity.LOW;
    }

    const hasCriticalAnomaly = reconReport.anomalies.some((a) => a.severity === 'CRITICAL');
    if (hasCriticalAnomaly) {
      severity = CaseSeverity.CRITICAL;
    }

    // Determine primary CaseType
    let caseType = CaseType.OTHER;
    const primaryAnomaly = reconReport.anomalies[0];
    if (primaryAnomaly) {
      switch (primaryAnomaly.type) {
        case ReconciliationAnomalyType.EXCESS_EXTRACTION_UNRECORDED_TRANSPORT:
          caseType = CaseType.UNRECORDED_EXTRACTION;
          break;
        case ReconciliationAnomalyType.EXCESS_TRANSPORT_OVER_PERMIT:
          caseType = CaseType.OVER_QUOTA_TRANSPORT;
          break;
        case ReconciliationAnomalyType.UNVERIFIED_TRANSIT_GAP:
          caseType = CaseType.UNVERIFIED_TRANSIT_GAP;
          break;
        case ReconciliationAnomalyType.EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY:
          caseType = CaseType.PROTECTED_ZONE_BREACH;
          break;
        case ReconciliationAnomalyType.VOLUME_TONNAGE_DISPROPORTION:
          caseType = CaseType.VOLUME_DISPROPORTION;
          break;
        case ReconciliationAnomalyType.SUSPENDED_MINING_ACTIVITY:
        case ReconciliationAnomalyType.EXPIRED_PERMIT_TRANSIT:
          caseType = CaseType.PERMIT_VIOLATION;
          break;
        default:
          caseType = CaseType.OTHER;
      }
    }

    const zoneIdStr = reconReport.zoneId
      ? typeof reconReport.zoneId === 'object' && '_id' in (reconReport.zoneId as unknown as { _id: unknown })
        ? String((reconReport.zoneId as unknown as { _id: unknown })._id)
        : String(reconReport.zoneId)
      : undefined;

    const authIdStr = reconReport.authorizationId
      ? typeof reconReport.authorizationId === 'object' && '_id' in (reconReport.authorizationId as unknown as { _id: unknown })
        ? String((reconReport.authorizationId as unknown as { _id: unknown })._id)
        : String(reconReport.authorizationId)
      : undefined;

    const defaultTitle = primaryAnomaly
      ? `Enforcement Investigation: ${primaryAnomaly.title}`
      : `Reconciliation Discrepancy Case - ${reconReport.reconciliationId}`;

    const defaultDescription = [
      `Enforcement investigation initiated from Reconciliation Report ${reconReport.reconciliationId}.`,
      `Discrepancy Score: ${reconReport.discrepancyScore}/100.`,
      reconReport.findings.length > 0 ? `Findings: ${reconReport.findings.join(' | ')}` : '',
      reconReport.recommendations.length > 0 ? `Recommendations: ${reconReport.recommendations.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    let assignedOfficerName: string | undefined = undefined;
    let assignedAt: Date | undefined = undefined;
    let initialStatus = CaseStatus.CASE_CREATED;

    if (data.assignedOfficerId && Types.ObjectId.isValid(data.assignedOfficerId)) {
      const officer = await this.userRepo.findById(data.assignedOfficerId);
      if (officer) {
        assignedOfficerName = officer.name;
        assignedAt = new Date();
        initialStatus = CaseStatus.ASSIGNED;
      }
    }

    const caseDoc = await this.caseRepo.create({
      caseId: this.generateCaseId(),
      reconciliationReportId: reconReport._id as Types.ObjectId,
      reconciliationReportNumber: reconReport.reconciliationId,
      zoneId: zoneIdStr && Types.ObjectId.isValid(zoneIdStr) ? new Types.ObjectId(zoneIdStr) : undefined,
      zoneName: reconReport.zoneName,
      authorizationId: authIdStr && Types.ObjectId.isValid(authIdStr) ? new Types.ObjectId(authIdStr) : undefined,
      permitNumber: reconReport.permitNumber,
      severity,
      caseType,
      title: data.customTitle || defaultTitle,
      description: data.customDescription || defaultDescription,
      status: initialStatus,
      assignedOfficerId: data.assignedOfficerId && Types.ObjectId.isValid(data.assignedOfficerId)
        ? new Types.ObjectId(data.assignedOfficerId)
        : undefined,
      assignedOfficerName,
      assignedAt,
      investigationFindings: reconReport.findings || [],
      createdBy: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    });

    await this.logAudit({
      caseId: caseDoc._id as Types.ObjectId,
      caseNumber: caseDoc.caseId,
      actorId: userId,
      action: CaseAuditAction.CASE_CREATED,
      newStatus: initialStatus,
      remarks: `Case spawned from M11 report ${reconReport.reconciliationId} (Score: ${reconReport.discrepancyScore})`,
    });

    return caseDoc.toDto();
  }

  async assignOfficer(
    id: string,
    data: AssignOfficerRequest,
    actorId?: string,
  ): Promise<EnforcementCaseDto> {
    const caseDoc = await this.getCaseEntity(id);
    if (caseDoc.status === CaseStatus.CLOSED) {
      throw new AppError('Cannot reassign an officer to a CLOSED case', HTTP_STATUS.BAD_REQUEST);
    }

    if (!Types.ObjectId.isValid(data.assignedOfficerId)) {
      throw new AppError('Invalid assigned officer ID', HTTP_STATUS.BAD_REQUEST);
    }

    const officer = await this.userRepo.findById(data.assignedOfficerId);
    if (!officer) {
      throw new AppError(`Officer "${data.assignedOfficerId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    const prevOfficer = caseDoc.assignedOfficerName;
    const prevStatus = caseDoc.status;
    const newStatus = caseDoc.status === CaseStatus.CASE_CREATED ? CaseStatus.ASSIGNED : caseDoc.status;

    const updated = await this.caseRepo.updateById(caseDoc._id as Types.ObjectId, {
      assignedOfficerId: officer._id,
      assignedOfficerName: officer.name,
      assignedAt: new Date(),
      status: newStatus,
    });

    if (!updated) {
      throw new AppError('Failed to update case assignment', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    await this.logAudit({
      caseId: caseDoc._id as Types.ObjectId,
      caseNumber: caseDoc.caseId,
      actorId,
      action: CaseAuditAction.OFFICER_ASSIGNED,
      previousStatus: prevStatus,
      newStatus,
      remarks: data.remarks || `Assigned to ${officer.name} (${officer.role})`,
      changes: {
        assignedOfficer: { old: prevOfficer, new: officer.name },
        status: { old: prevStatus, new: newStatus },
      },
    });

    return updated.toDto();
  }

  async updateStatus(
    id: string,
    data: UpdateCaseStatusRequest,
    actorId?: string,
  ): Promise<EnforcementCaseDto> {
    const caseDoc = await this.getCaseEntity(id);

    if (caseDoc.status === CaseStatus.CLOSED && data.status !== CaseStatus.CLOSED) {
      throw new AppError('Cannot modify status of a CLOSED case without administrative override', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate valid lifecycle transition
    this.validateStatusTransition(caseDoc.status, data.status);

    const prevStatus = caseDoc.status;
    const updatePayload: Record<string, unknown> = {
      status: data.status,
    };

    if (data.status === CaseStatus.CLOSED) {
      updatePayload.closedAt = new Date();
      if (actorId && Types.ObjectId.isValid(actorId)) {
        updatePayload.closedBy = new Types.ObjectId(actorId);
      }
    }

    const updated = await this.caseRepo.updateById(caseDoc._id as Types.ObjectId, updatePayload);
    if (!updated) {
      throw new AppError('Failed to update case status', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    await this.logAudit({
      caseId: caseDoc._id as Types.ObjectId,
      caseNumber: caseDoc.caseId,
      actorId,
      action: data.status === CaseStatus.CLOSED ? CaseAuditAction.CASE_CLOSED : CaseAuditAction.STATUS_UPDATED,
      previousStatus: prevStatus,
      newStatus: data.status,
      remarks: data.remarks || `Status transitioned from ${prevStatus} to ${data.status}`,
      changes: {
        status: { old: prevStatus, new: data.status },
      },
    });

    return updated.toDto();
  }

  async updateInvestigation(
    id: string,
    data: UpdateInvestigationRequest,
    actorId?: string,
  ): Promise<EnforcementCaseDto> {
    const caseDoc = await this.getCaseEntity(id);
    if (caseDoc.status === CaseStatus.CLOSED) {
      throw new AppError('Cannot update investigation on a CLOSED case', HTTP_STATUS.BAD_REQUEST);
    }

    const updatePayload: Record<string, unknown> = {};

    if (data.findings && data.findings.length > 0) {
      const merged = Array.from(new Set([...caseDoc.investigationFindings, ...data.findings]));
      updatePayload.investigationFindings = merged;
    }

    let isFieldVerificationLogged = false;
    if (data.fieldVerification) {
      isFieldVerificationLogged = true;
      const fv = data.fieldVerification;
      if (fv.photoUrls && Array.isArray(fv.photoUrls)) {
        if (fv.photoUrls.length > 10) {
          throw new AppError('Maximum of 10 evidence photo URLs allowed', HTTP_STATUS.BAD_REQUEST);
        }
        for (const url of fv.photoUrls) {
          if (typeof url !== 'string' || !url.startsWith('https://') || url.length > 500) {
            throw new AppError('Invalid evidence photo URL scheme or length: only secure HTTPS URLs are permitted', HTTP_STATUS.BAD_REQUEST);
          }
        }
      }
      updatePayload.fieldVerification = {
        verifiedAt: fv.verifiedAt ? new Date(fv.verifiedAt) : new Date(),
        verifiedBy: actorId && Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
        locationCoordinates: fv.locationCoordinates,
        siteObservations: fv.siteObservations,
        photoUrls: fv.photoUrls || [],
        droneSurveyConducted: fv.droneSurveyConducted || false,
        groundDisturbanceConfirmed: fv.groundDisturbanceConfirmed || false,
        notes: fv.notes,
      };
    }

    const prevStatus = caseDoc.status;
    let nextStatus = caseDoc.status;

    if (isFieldVerificationLogged && (caseDoc.status === CaseStatus.ASSIGNED || caseDoc.status === CaseStatus.UNDER_INVESTIGATION)) {
      nextStatus = CaseStatus.FIELD_VERIFICATION;
      updatePayload.status = nextStatus;
    } else if (caseDoc.status === CaseStatus.ASSIGNED) {
      nextStatus = CaseStatus.UNDER_INVESTIGATION;
      updatePayload.status = nextStatus;
    }

    const updated = await this.caseRepo.updateById(caseDoc._id as Types.ObjectId, updatePayload);
    if (!updated) {
      throw new AppError('Failed to update investigation', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    await this.logAudit({
      caseId: caseDoc._id as Types.ObjectId,
      caseNumber: caseDoc.caseId,
      actorId,
      action: isFieldVerificationLogged ? CaseAuditAction.FIELD_VERIFICATION_LOGGED : CaseAuditAction.INVESTIGATION_UPDATED,
      previousStatus: prevStatus,
      newStatus: nextStatus,
      remarks: data.remarks || (isFieldVerificationLogged ? 'Field verification data logged' : 'Investigation findings updated'),
      changes: {
        status: { old: prevStatus, new: nextStatus },
      },
    });

    return updated.toDto();
  }

  async recordEnforcementAction(
    id: string,
    data: RecordEnforcementActionRequest,
    actorId?: string,
  ): Promise<EnforcementCaseDto> {
    const caseDoc = await this.getCaseEntity(id);
    if (caseDoc.status === CaseStatus.CLOSED) {
      throw new AppError('Cannot record enforcement action on a CLOSED case', HTTP_STATUS.BAD_REQUEST);
    }

    const prevStatus = caseDoc.status;
    const nextStatus = caseDoc.status === CaseStatus.RESOLVED ? CaseStatus.RESOLVED : CaseStatus.ACTION_REQUIRED;

    const actionPayload = {
      actionType: data.actionType,
      actionDetails: data.actionDetails,
      actionDate: data.actionDate ? new Date(data.actionDate) : new Date(),
      penaltyAmountInr: data.penaltyAmountInr,
      officialOrderReference: data.officialOrderReference,
      issuedBy: actorId && Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
    };

    const updated = await this.caseRepo.updateById(caseDoc._id as Types.ObjectId, {
      enforcementAction: actionPayload,
      status: nextStatus,
    });

    if (!updated) {
      throw new AppError('Failed to record enforcement action', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    await this.logAudit({
      caseId: caseDoc._id as Types.ObjectId,
      caseNumber: caseDoc.caseId,
      actorId,
      action: CaseAuditAction.ENFORCEMENT_ACTION_RECORDED,
      previousStatus: prevStatus,
      newStatus: nextStatus,
      remarks: data.remarks || `Enforcement action recorded: ${data.actionType} (${data.actionDetails})`,
      changes: {
        enforcementAction: { old: null, new: data.actionType },
        status: { old: prevStatus, new: nextStatus },
      },
    });

    return updated.toDto();
  }

  async closeCase(
    id: string,
    data: CloseCaseRequest,
    actorId?: string,
  ): Promise<EnforcementCaseDto> {
    const caseDoc = await this.getCaseEntity(id);
    if (caseDoc.status === CaseStatus.CLOSED) {
      throw new AppError('Case is already CLOSED', HTTP_STATUS.BAD_REQUEST);
    }

    const prevStatus = caseDoc.status;
    const now = new Date();

    const resolutionPayload = {
      resolvedAt: now,
      resolvedBy: actorId && Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
      summary: data.resolutionSummary,
      followUpRequired: data.followUpRequired || false,
    };

    const updated = await this.caseRepo.updateById(caseDoc._id as Types.ObjectId, {
      status: CaseStatus.CLOSED,
      resolutionInfo: resolutionPayload,
      closedAt: now,
      closedBy: actorId && Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined,
    });

    if (!updated) {
      throw new AppError('Failed to close case', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    await this.logAudit({
      caseId: caseDoc._id as Types.ObjectId,
      caseNumber: caseDoc.caseId,
      actorId,
      action: CaseAuditAction.CASE_CLOSED,
      previousStatus: prevStatus,
      newStatus: CaseStatus.CLOSED,
      remarks: data.remarks || `Case formally closed: ${data.resolutionSummary}`,
      changes: {
        status: { old: prevStatus, new: CaseStatus.CLOSED },
      },
    });

    return updated.toDto();
  }

  async getAllCases(filters: EnforcementCaseFilters = {}): Promise<EnforcementCaseDto[]> {
    const list = await this.caseRepo.findAll(filters);
    return list.map((c) => c.toDto());
  }

  async getCaseById(id: string): Promise<EnforcementCaseDto> {
    const caseDoc = await this.getCaseEntity(id);
    return caseDoc.toDto();
  }

  async getAuditHistory(caseId: string): Promise<CaseAuditLogDto[]> {
    let targetCase = null;
    if (Types.ObjectId.isValid(caseId)) {
      targetCase = await this.caseRepo.findById(caseId);
    }
    if (!targetCase) {
      targetCase = await this.caseRepo.findByCaseId(caseId);
    }
    if (!targetCase) {
      throw new AppError(`Enforcement case "${caseId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    const logs = await this.auditRepo.findByCaseId(targetCase._id as Types.ObjectId);
    return logs.map((l) => l.toDto());
  }

  async getSummary(): Promise<EnforcementCaseSummaryDto> {
    return await this.caseRepo.getSummary();
  }

  private async getCaseEntity(id: string) {
    let caseDoc = null;
    if (Types.ObjectId.isValid(id)) {
      caseDoc = await this.caseRepo.findById(id);
    }
    if (!caseDoc) {
      caseDoc = await this.caseRepo.findByCaseId(id);
    }
    if (!caseDoc) {
      throw new AppError(`Enforcement case "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }
    return caseDoc;
  }

  private validateStatusTransition(currentStatus: CaseStatus, nextStatus: CaseStatus): void {
    if (currentStatus === nextStatus) return;

    const allowedTransitions: Record<CaseStatus, CaseStatus[]> = {
      [CaseStatus.DETECTED]: [CaseStatus.CASE_CREATED, CaseStatus.ASSIGNED, CaseStatus.CLOSED],
      [CaseStatus.CASE_CREATED]: [CaseStatus.ASSIGNED, CaseStatus.UNDER_INVESTIGATION, CaseStatus.CLOSED],
      [CaseStatus.ASSIGNED]: [CaseStatus.UNDER_INVESTIGATION, CaseStatus.FIELD_VERIFICATION, CaseStatus.CLOSED],
      [CaseStatus.UNDER_INVESTIGATION]: [CaseStatus.FIELD_VERIFICATION, CaseStatus.ACTION_REQUIRED, CaseStatus.RESOLVED, CaseStatus.CLOSED],
      [CaseStatus.FIELD_VERIFICATION]: [CaseStatus.ACTION_REQUIRED, CaseStatus.RESOLVED, CaseStatus.UNDER_INVESTIGATION, CaseStatus.CLOSED],
      [CaseStatus.ACTION_REQUIRED]: [CaseStatus.RESOLVED, CaseStatus.UNDER_INVESTIGATION, CaseStatus.CLOSED],
      [CaseStatus.RESOLVED]: [CaseStatus.CLOSED, CaseStatus.UNDER_INVESTIGATION],
      [CaseStatus.CLOSED]: [], // Locked
    };

    const allowed = allowedTransitions[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        `Invalid case lifecycle status transition from "${currentStatus}" to "${nextStatus}"`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }
  }
}
