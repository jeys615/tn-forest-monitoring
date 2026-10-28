import { AlertRepository, type AlertFilters } from '../repositories/AlertRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { ZoneRepository } from '../repositories/ZoneRepository.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import { resolveActionTarget, isTerminalStatus } from '../utils/alertLifecycle.js';
import type { IAlert, IAlertAuditEntry } from '../models/Alert.js';
import { Types } from 'mongoose';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import {
  AlertStatus,
  AlertAction,
  AlertSeverity,
  ComparisonMode,
  SensorType,
  MonitoringTrack,
  ChangeCategory,
  ProcessingMode,
  type AlertDto,
  type AlertAuditEntryDto,
  type AlertStatsDto,
  type AlertListResponseDto,
  type UpdateAlertStatusRequest,
} from '@tn-forest/shared/types';

export class AlertService {
  private alertRepo: AlertRepository;
  private zoneRepo: ZoneRepository;
  private userRepo: UserRepository;

  constructor() {
    this.alertRepo = new AlertRepository();
    this.zoneRepo = new ZoneRepository();
    this.userRepo = new UserRepository();
  }

  // ─── List & Detail ──────────────────────────────────────────────────────────

  async getAlerts(filters: AlertFilters = {}): Promise<AlertListResponseDto> {
    const result = await this.alertRepo.findAll(filters);
    return {
      data: result.data.map((a) => a.toDto()),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  }

  async getAlertById(id: string): Promise<AlertDto> {
    const alert = await this.alertRepo.findById(id);
    if (!alert) {
      throw new AppError('Alert not found', HTTP_STATUS.NOT_FOUND);
    }
    return alert.toDto();
  }

  async getZoneAlerts(zoneId: string, limit: number = 20): Promise<AlertDto[]> {
    const zone = await this.zoneRepo.findById(zoneId);
    if (!zone) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }
    const list = await this.alertRepo.findByZoneId(zoneId, limit);
    return list.map((a) => a.toDto());
  }

  // ─── ChangeDetection → Alert Integration ────────────────────────────────────

  /**
   * Connect an eligible ChangeDetection result (such as verified HLS cross-sensor comparison)
   * to the authoritative M5 Alert lifecycle.
   *
   * Enforces:
   * 1. ChangeDetection existence & ID validity (Orphan alert protection)
   * 2. Audit status validity (rejects INVALID_FOR_PRODUCTION_GEOMETRY, INVALID_FOR_PRODUCTION_CROSS_SENSOR, RETRACTED)
   * 3. HLS lineage validation if comparisonMode === ComparisonMode.HLS
   * 4. Duplicate prevention (idempotent, returns existing alert if already created)
   * 5. Production severity thresholds (<2%: NONE, 2-4.99%: LOW, 5-9.99%: MEDIUM, >=10%: HIGH)
   * 6. Alert persistence and reciprocal ChangeDetection linking
   */
  async createAlertFromChangeDetection(
    changeDetectionId: string | Types.ObjectId,
    options?: {
      userId?: string;
      notes?: string;
    },
  ): Promise<IAlert | null> {
    if (!changeDetectionId || !Types.ObjectId.isValid(changeDetectionId.toString())) {
      throw new AppError('Valid changeDetectionId is required to create an alert', HTTP_STATUS.BAD_REQUEST);
    }

    const changeDoc = await ChangeDetectionModel.findById(changeDetectionId).exec();
    if (!changeDoc) {
      throw new AppError(
        `Cannot create alert: ChangeDetection record not found for ID ${changeDetectionId.toString()}`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // 1. Audit status validation (Production policy)
    const invalidStatuses = [
      'INVALID_FOR_PRODUCTION_CROSS_SENSOR',
      'INVALID_FOR_PRODUCTION_GEOMETRY',
      'RETRACTED',
    ];
    if (changeDoc.auditStatus && invalidStatuses.includes(changeDoc.auditStatus)) {
      throw new AppError(
        `Cannot create alert for change detection record marked as ${changeDoc.auditStatus}`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    // 2. Lineage validation for HLS comparisons
    if (changeDoc.comparisonMode === ComparisonMode.HLS) {
      if (!changeDoc.baselineHlsRepresentationId || !changeDoc.currentHlsRepresentationId) {
        throw new AppError(
          'Cannot create alert: HLS ChangeDetection is missing required HLS representation lineage',
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
        );
      }
    }

    // 3. Duplicate prevention: check if alert already exists for this change detection
    const existingByChangeId = await this.alertRepo.findByChangeDetectionId(changeDoc._id);
    if (existingByChangeId) {
      return existingByChangeId;
    }

    if (changeDoc.alertId && Types.ObjectId.isValid(changeDoc.alertId.toString())) {
      const existingById = await this.alertRepo.findById(changeDoc.alertId.toString());
      if (existingById) {
        return existingById;
      }
    }

    // 4. Authoritative M5 Severity Evaluation
    // < 2%: NONE (no alert generated)
    // 2–4.99%: LOW (threshold 2 crossed)
    // 5–9.99%: MEDIUM (thresholds 2, 5 crossed)
    // >= 10%: HIGH (thresholds 2, 5, 10 crossed)
    const affectedAreaPercentage = changeDoc.affectedAreaPercentage ?? 0;
    if (affectedAreaPercentage < 2.0) {
      // Ineligible for alert creation under M5 rules
      return null;
    }

    const is10 = affectedAreaPercentage >= 10.0;
    const is5 = affectedAreaPercentage >= 5.0;
    const is2 = affectedAreaPercentage >= 2.0;

    const severity = is10
      ? AlertSeverity.HIGH
      : is5
        ? AlertSeverity.MEDIUM
        : AlertSeverity.LOW;

    const highestThresholdCrossed = is10 ? 10 : is5 ? 5 : is2 ? 2 : 0;
    const thresholdsCrossed = is10 ? [2, 5, 10] : is5 ? [2, 5] : is2 ? [2] : [];

    // 5. Build Alert document
    const alertId = `ALT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const categories =
      changeDoc.categories && changeDoc.categories.length > 0
        ? changeDoc.categories
        : [ChangeCategory.VEGETATION_LOSS];

    const explanation =
      changeDoc.explanation ||
      `Automated ${changeDoc.comparisonMode ?? 'cross-sensor'} alert: affected area (${affectedAreaPercentage.toFixed(2)}%) exceeds ${highestThresholdCrossed}% threshold`;

    const alertData: Partial<IAlert> = {
      alertId,
      zoneId: changeDoc.zoneId,
      temporaryAreaId: changeDoc.temporaryAreaId,
      changeDetectionId: changeDoc._id,
      baselineId: changeDoc.baselineId,
      observationId: changeDoc.observationId,
      comparisonMode: changeDoc.comparisonMode as any,
      baselineHlsRepresentationId: changeDoc.baselineHlsRepresentationId,
      currentHlsRepresentationId: changeDoc.currentHlsRepresentationId,
      changedArea: changeDoc.changedArea,
      detectedAt: changeDoc.detectedAt || new Date(),
      affectedAreaPercentage: Number(affectedAreaPercentage.toFixed(4)),
      highestThresholdCrossed,
      thresholdsCrossed,
      severity,
      evidenceStrength: changeDoc.evidenceStrength ?? 50,
      calculationMode: (changeDoc.calculationMode as any) || ProcessingMode.REAL,
      sensorType: changeDoc.sensorType || SensorType.OPTICAL,
      monitoringTrack: changeDoc.monitoringTrack || MonitoringTrack.OPTICAL,
      evidenceSources: [changeDoc.sensorType || SensorType.OPTICAL],
      categories,
      explanation,
      status: AlertStatus.OPEN,
      notes: options?.notes,
      auditHistory: [],
    };

    const createdAlert = await this.alertRepo.create(alertData);

    // 6. Reciprocal lineage update on ChangeDetection document
    changeDoc.alertGenerated = true;
    changeDoc.alertId = createdAlert._id;
    changeDoc.severity = severity;
    await changeDoc.save();

    return createdAlert;
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  async getAlertStats(
    filters: Pick<AlertFilters, 'zoneId' | 'fromDate' | 'toDate'> = {},
  ): Promise<AlertStatsDto> {
    return this.alertRepo.getStats(filters);
  }

  // ─── Audit history ──────────────────────────────────────────────────────────

  async getAlertAuditHistory(id: string): Promise<AlertAuditEntryDto[]> {
    const alert = await this.alertRepo.findById(id);
    if (!alert) {
      throw new AppError('Alert not found', HTTP_STATUS.NOT_FOUND);
    }
    const entries = await this.alertRepo.getAuditHistory(id);
    return entries.map((e) => ({
      action: e.action,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      performedBy: e.performedBy.toString(),
      performedAt: e.performedAt.toISOString(),
      notes: e.notes,
    }));
  }

  // ─── Lifecycle actions ──────────────────────────────────────────────────────

  private async _requireUser(userId: string): Promise<void> {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new AppError('Valid user ID is required for alert actions', HTTP_STATUS.UNAUTHORIZED);
    }
  }

  private async _performAction(
    id: string,
    action: AlertAction,
    userId: string,
    extraUpdates: Record<string, unknown> = {},
    notes?: string,
  ): Promise<AlertDto> {
    await this._requireUser(userId);

    const alert = await this.alertRepo.findById(id);
    if (!alert) {
      throw new AppError('Alert not found', HTTP_STATUS.NOT_FOUND);
    }

    // Validate transition (throws on invalid)
    const targetStatus = resolveActionTarget(alert.status, action);

    if (targetStatus === null) {
      throw new AppError(`Action ${action} does not produce a status transition`, HTTP_STATUS.BAD_REQUEST);
    }

    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();

    const auditEntry: IAlertAuditEntry = {
      action,
      fromStatus: alert.status,
      toStatus: targetStatus,
      performedBy: userObjectId,
      performedAt: now,
      notes,
    };

    const statusFields: Record<string, unknown> = {};
    switch (targetStatus) {
      case AlertStatus.ACKNOWLEDGED:
        statusFields.acknowledgedAt = now;
        statusFields.acknowledgedBy = userObjectId;
        break;
      case AlertStatus.UNDER_REVIEW:
        statusFields.reviewedAt = now;
        statusFields.reviewedBy = userObjectId;
        break;
      case AlertStatus.CONFIRMED:
        statusFields.confirmedAt = now;
        statusFields.confirmedBy = userObjectId;
        break;
      case AlertStatus.DISMISSED:
        statusFields.dismissedAt = now;
        statusFields.dismissedBy = userObjectId;
        break;
      case AlertStatus.RESOLVED:
        statusFields.resolvedAt = now;
        statusFields.resolvedBy = userObjectId;
        break;
    }

    if (notes !== undefined) statusFields.notes = notes;

    const updated = await this.alertRepo.applyAction(
      id,
      targetStatus,
      auditEntry,
      { ...statusFields, ...extraUpdates },
    );

    if (!updated) {
      throw new AppError('Alert not found', HTTP_STATUS.NOT_FOUND);
    }
    return updated.toDto();
  }

  async acknowledgeAlert(id: string, userId: string, notes?: string): Promise<AlertDto> {
    return this._performAction(id, AlertAction.ACKNOWLEDGE, userId, {}, notes);
  }

  async startReview(id: string, userId: string, notes?: string): Promise<AlertDto> {
    return this._performAction(id, AlertAction.START_REVIEW, userId, {}, notes);
  }

  async confirmAlert(id: string, userId: string, notes?: string): Promise<AlertDto> {
    return this._performAction(id, AlertAction.CONFIRM, userId, {}, notes);
  }

  async dismissAlert(
    id: string,
    userId: string,
    dismissalReason: string,
    notes?: string,
  ): Promise<AlertDto> {
    if (!dismissalReason?.trim()) {
      throw new AppError('dismissalReason is required to dismiss an alert', HTTP_STATUS.BAD_REQUEST);
    }
    return this._performAction(
      id,
      AlertAction.DISMISS,
      userId,
      { dismissalReason: dismissalReason.trim() },
      notes,
    );
  }

  async resolveAlert(
    id: string,
    userId: string,
    resolutionInfo: string,
    notes?: string,
  ): Promise<AlertDto> {
    if (!resolutionInfo?.trim()) {
      throw new AppError('resolutionInfo is required to resolve an alert', HTTP_STATUS.BAD_REQUEST);
    }
    return this._performAction(
      id,
      AlertAction.RESOLVE,
      userId,
      { resolutionInfo: resolutionInfo.trim() },
      notes,
    );
  }

  async assignAlert(id: string, assigneeId: string, assignerId: string, notes?: string): Promise<AlertDto> {
    await this._requireUser(assignerId);

    const alert = await this.alertRepo.findById(id);
    if (!alert) {
      throw new AppError('Alert not found', HTTP_STATUS.NOT_FOUND);
    }

    if (isTerminalStatus(alert.status)) {
      throw new AppError(
        `Cannot assign an alert in terminal state: ${alert.status}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (!Types.ObjectId.isValid(assigneeId)) {
      throw new AppError('Invalid assigneeId', HTTP_STATUS.BAD_REQUEST);
    }

    // Verify assignee exists
    const assignee = await this.userRepo.findById(assigneeId);
    if (!assignee) {
      throw new AppError('Assignee user not found', HTTP_STATUS.NOT_FOUND);
    }

    const auditEntry: IAlertAuditEntry = {
      action: AlertAction.ASSIGN,
      fromStatus: alert.status,
      toStatus: alert.status,
      performedBy: new Types.ObjectId(assignerId),
      performedAt: new Date(),
      notes: notes ?? `Assigned to ${assignee.name}`,
    };

    const updated = await this.alertRepo.assignAlert(id, assigneeId, auditEntry, notes);
    if (!updated) {
      throw new AppError('Alert not found', HTTP_STATUS.NOT_FOUND);
    }
    return updated.toDto();
  }

  // ─── Dispatched action handler (single endpoint) ────────────────────────────

  async performAction(
    id: string,
    action: AlertAction,
    userId: string,
    opts: {
      notes?: string;
      dismissalReason?: string;
      resolutionInfo?: string;
      assigneeId?: string;
    } = {},
  ): Promise<AlertDto> {
    switch (action) {
      case AlertAction.ACKNOWLEDGE:
        return this.acknowledgeAlert(id, userId, opts.notes);
      case AlertAction.START_REVIEW:
        return this.startReview(id, userId, opts.notes);
      case AlertAction.CONFIRM:
        return this.confirmAlert(id, userId, opts.notes);
      case AlertAction.DISMISS:
        return this.dismissAlert(id, userId, opts.dismissalReason ?? '', opts.notes);
      case AlertAction.RESOLVE:
        return this.resolveAlert(id, userId, opts.resolutionInfo ?? '', opts.notes);
      case AlertAction.ASSIGN:
        if (!opts.assigneeId) {
          throw new AppError('assigneeId is required for ASSIGN action', HTTP_STATUS.BAD_REQUEST);
        }
        return this.assignAlert(id, opts.assigneeId, userId, opts.notes);
      default:
        throw new AppError(`Unknown action: ${action as string}`, HTTP_STATUS.BAD_REQUEST);
    }
  }

  // ─── Legacy updateAlertStatus (backward compat) ─────────────────────────────

  async updateAlertStatus(
    id: string,
    request: UpdateAlertStatusRequest,
    userId?: string,
  ): Promise<AlertDto> {
    const { status, notes } = request;

    if (!Object.values(AlertStatus).includes(status)) {
      throw new AppError(`Invalid alert status: ${status}`, HTTP_STATUS.BAD_REQUEST);
    }

    const updated = await this.alertRepo.updateStatus(id, status, userId, notes);
    if (!updated) {
      throw new AppError('Alert not found', HTTP_STATUS.NOT_FOUND);
    }

    return updated.toDto();
  }
}
