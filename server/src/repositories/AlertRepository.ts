import { AlertModel, type IAlert, type IAlertAuditEntry } from '../models/Alert.js';
import {
  AlertSeverity,
  AlertStatus,
  SensorType,
  MonitoringTrack,
  ChangeCategory,
  ComparisonMode,
  type AlertDto,
  type AlertStatsDto,
} from '@tn-forest/shared/types';
import { Types } from 'mongoose';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface AlertFilters {
  zoneId?: string;
  temporaryAreaId?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  sensorType?: SensorType;
  monitoringTrack?: MonitoringTrack;
  comparisonMode?: ComparisonMode | string;
  category?: ChangeCategory;
  assignedTo?: string;
  fromDate?: Date;
  toDate?: Date;
  /** Legacy: limit without pagination */
  limit?: number;
  /** Pagination */
  page?: number;
  pageSize?: number;
  sortBy?: 'newest' | 'oldest' | 'severity' | 'affectedArea';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMongoQuery(filters: AlertFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId)) {
    query.zoneId = new Types.ObjectId(filters.zoneId);
  }
  if (filters.temporaryAreaId) {
    query.temporaryAreaId = filters.temporaryAreaId;
  }
  if (filters.severity) {
    query.severity = filters.severity;
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.sensorType) {
    query.sensorType = filters.sensorType;
  }
  if (filters.monitoringTrack) {
    query.monitoringTrack = filters.monitoringTrack;
  }
  if (filters.comparisonMode) {
    query.comparisonMode = filters.comparisonMode;
  }
  if (filters.category) {
    query.categories = filters.category;
  }
  if (filters.assignedTo && Types.ObjectId.isValid(filters.assignedTo)) {
    query.assignedTo = new Types.ObjectId(filters.assignedTo);
  }
  if (filters.fromDate || filters.toDate) {
    const dateFilter: Record<string, unknown> = {};
    if (filters.fromDate) dateFilter.$gte = filters.fromDate;
    if (filters.toDate) dateFilter.$lte = filters.toDate;
    query.detectedAt = dateFilter;
  }

  return query;
}

function buildSortSpec(sortBy?: string): Record<string, 1 | -1> {
  switch (sortBy) {
    case 'oldest':
      return { detectedAt: 1 };
    case 'severity':
      // Use affectedAreaPercentage as a proxy for severity weight
      return { affectedAreaPercentage: -1, detectedAt: -1 };
    case 'affectedArea':
      return { affectedAreaPercentage: -1, detectedAt: -1 };
    case 'newest':
    default:
      return { detectedAt: -1 };
  }
}

// ─── Repository ────────────────────────────────────────────────────────────────

export class AlertRepository {
  async create(data: Partial<IAlert>, options?: { allowPreallocatedChangeId?: boolean }): Promise<IAlert> {
    if (!data.changeDetectionId) {
      throw new AppError('Cannot create alert without a valid changeDetectionId', HTTP_STATUS.BAD_REQUEST);
    }
    const changeDoc = await ChangeDetectionModel.findById(data.changeDetectionId).lean();
    if (!changeDoc && !options?.allowPreallocatedChangeId) {
      throw new AppError(
        `Cannot create alert: ChangeDetection record not found for ID ${data.changeDetectionId}`,
        HTTP_STATUS.NOT_FOUND,
      );
    }
    if (
      changeDoc?.auditStatus &&
      [
        'INVALID_FOR_PRODUCTION_CROSS_SENSOR',
        'INVALID_FOR_PRODUCTION_GEOMETRY',
        'RETRACTED',
      ].includes(changeDoc.auditStatus)
    ) {
      throw new AppError(
        `Cannot create alert for change detection record marked as ${changeDoc.auditStatus}`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }
    const doc = new AlertModel(data);
    return await doc.save();
  }

  async findById(id: string): Promise<IAlert | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await AlertModel.findById(id).exec();
  }

  async findByAlertId(alertId: string): Promise<IAlert | null> {
    return await AlertModel.findOne({ alertId }).exec();
  }

  async findByChangeDetectionId(changeDetectionId: string | Types.ObjectId): Promise<IAlert | null> {
    if (!Types.ObjectId.isValid(changeDetectionId.toString())) return null;
    return await AlertModel.findOne({
      changeDetectionId: new Types.ObjectId(changeDetectionId.toString()),
    }).exec();
  }

  async findByZoneId(zoneId: string, limit: number = 20): Promise<IAlert[]> {
    if (!Types.ObjectId.isValid(zoneId)) return [];
    return await AlertModel.find({
      zoneId: new Types.ObjectId(zoneId),
    })
      .sort({ detectedAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Paginated list with full filter and sort support.
   * Returns `{ data, total, page, pageSize, totalPages }`.
   */
  async findAll(
    filters: AlertFilters = {},
  ): Promise<{ data: IAlert[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const query = buildMongoQuery(filters);
    const sort = buildSortSpec(filters.sortBy);

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? (filters.limit ?? 50)));

    const [data, total] = await Promise.all([
      AlertModel.find(query)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      AlertModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async count(filters: AlertFilters = {}): Promise<number> {
    const query = buildMongoQuery(filters);
    return await AlertModel.countDocuments(query).exec();
  }

  // ─── Alert stats ─────────────────────────────────────────────────────────────

  async getStats(filters: Pick<AlertFilters, 'zoneId' | 'fromDate' | 'toDate'> = {}): Promise<AlertStatsDto> {
    const baseQuery = buildMongoQuery(filters);

    const [
      total,
      open,
      acknowledged,
      underReview,
      confirmed,
      resolved,
      dismissed,
      highSeverity,
      mediumSeverity,
      lowSeverity,
    ] = await Promise.all([
      AlertModel.countDocuments(baseQuery),
      AlertModel.countDocuments({ ...baseQuery, status: AlertStatus.OPEN }),
      AlertModel.countDocuments({ ...baseQuery, status: AlertStatus.ACKNOWLEDGED }),
      AlertModel.countDocuments({ ...baseQuery, status: AlertStatus.UNDER_REVIEW }),
      AlertModel.countDocuments({ ...baseQuery, status: AlertStatus.CONFIRMED }),
      AlertModel.countDocuments({ ...baseQuery, status: AlertStatus.RESOLVED }),
      AlertModel.countDocuments({ ...baseQuery, status: AlertStatus.DISMISSED }),
      AlertModel.countDocuments({ ...baseQuery, severity: AlertSeverity.HIGH }),
      AlertModel.countDocuments({ ...baseQuery, severity: AlertSeverity.MEDIUM }),
      AlertModel.countDocuments({ ...baseQuery, severity: AlertSeverity.LOW }),
    ]);

    return {
      total,
      open,
      acknowledged,
      underReview,
      confirmed,
      resolved,
      dismissed,
      highSeverity,
      mediumSeverity,
      lowSeverity,
    };
  }

  // ─── Lifecycle action (atomic update + audit append) ──────────────────────────

  async applyAction(
    id: string,
    newStatus: AlertStatus,
    auditEntry: IAlertAuditEntry,
    extraUpdates: Record<string, unknown> = {},
  ): Promise<IAlert | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    return await AlertModel.findByIdAndUpdate(
      id,
      {
        $set: { status: newStatus, ...extraUpdates },
        $push: { auditHistory: auditEntry },
      },
      { new: true, runValidators: true },
    ).exec();
  }

  // ─── Assignment ───────────────────────────────────────────────────────────────

  async assignAlert(
    id: string,
    assigneeId: string,
    auditEntry: IAlertAuditEntry,
    notes?: string,
  ): Promise<IAlert | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const extraSet: Record<string, unknown> = {
      assignedTo: Types.ObjectId.isValid(assigneeId) ? new Types.ObjectId(assigneeId) : undefined,
    };
    if (notes !== undefined) extraSet.notes = notes;

    return await AlertModel.findByIdAndUpdate(
      id,
      {
        $set: extraSet,
        $push: { auditHistory: auditEntry },
      },
      { new: true, runValidators: true },
    ).exec();
  }

  // ─── Audit history ────────────────────────────────────────────────────────────

  async getAuditHistory(id: string): Promise<IAlertAuditEntry[]> {
    if (!Types.ObjectId.isValid(id)) return [];
    const doc = await AlertModel.findById(id).select('auditHistory').exec();
    return doc?.auditHistory ?? [];
  }

  // ─── Legacy updateStatus (kept for backward compat) ───────────────────────────

  async updateStatus(
    id: string,
    status: AlertStatus,
    userId?: string,
    notes?: string,
  ): Promise<IAlert | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const updates: Record<string, unknown> = { status };
    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (status === AlertStatus.ACKNOWLEDGED) {
      updates.acknowledgedAt = new Date();
      if (userId && Types.ObjectId.isValid(userId)) {
        updates.acknowledgedBy = new Types.ObjectId(userId);
      }
    } else if (status === AlertStatus.RESOLVED) {
      updates.resolvedAt = new Date();
      if (userId && Types.ObjectId.isValid(userId)) {
        updates.resolvedBy = new Types.ObjectId(userId);
      }
    }

    return await AlertModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).exec();
  }

  public mapToDto(doc: IAlert): AlertDto {
    return doc.toDto();
  }
}
