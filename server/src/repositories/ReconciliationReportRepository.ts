import { type Types } from 'mongoose';
import {
  ReconciliationReportModel,
  type IReconciliationReport,
} from '../models/ReconciliationReport.js';
import {
  ReconciliationStatus,
  ReconciliationReportStatus,
  type ReconciliationSummaryDto,
} from '@tn-forest/shared/types';

export interface ReconciliationReportFilters {
  zoneId?: string;
  authorizationId?: string;
  status?: ReconciliationReportStatus;
  reconciliationStatus?: ReconciliationStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  skip?: number;
}

export class ReconciliationReportRepository {
  async create(data: Partial<IReconciliationReport>): Promise<IReconciliationReport> {
    const doc = new ReconciliationReportModel(data);
    return await doc.save();
  }

  async findById(id: string | Types.ObjectId): Promise<IReconciliationReport | null> {
    return await ReconciliationReportModel.findById(id)
      .populate('zoneId')
      .populate('authorizationId')
      .populate('generatedBy', 'name email role')
      .populate('resolvedBy', 'name email role');
  }

  async findByReconciliationId(reconciliationId: string): Promise<IReconciliationReport | null> {
    return await ReconciliationReportModel.findOne({ reconciliationId: reconciliationId.trim() })
      .populate('zoneId')
      .populate('authorizationId')
      .populate('generatedBy', 'name email role')
      .populate('resolvedBy', 'name email role');
  }

  async findAll(filters: ReconciliationReportFilters = {}): Promise<IReconciliationReport[]> {
    const query: Record<string, unknown> = {};

    if (filters.zoneId) query.zoneId = filters.zoneId;
    if (filters.authorizationId) query.authorizationId = filters.authorizationId;
    if (filters.status) query.status = filters.status;
    if (filters.reconciliationStatus) query.reconciliationStatus = filters.reconciliationStatus;

    if (filters.startDate || filters.endDate) {
      const dateQuery: Record<string, Date> = {};
      if (filters.startDate) dateQuery.$gte = filters.startDate;
      if (filters.endDate) dateQuery.$lte = filters.endDate;
      query.createdAt = dateQuery;
    }

    const q = ReconciliationReportModel.find(query)
      .sort({ createdAt: -1 })
      .populate('generatedBy', 'name email role')
      .populate('resolvedBy', 'name email role');

    if (filters.skip && filters.skip > 0) {
      q.skip(filters.skip);
    }
    if (filters.limit && filters.limit > 0) {
      q.limit(filters.limit);
    }

    return await q.exec();
  }

  async update(
    id: string | Types.ObjectId,
    data: Partial<IReconciliationReport>,
  ): Promise<IReconciliationReport | null> {
    return await ReconciliationReportModel.findByIdAndUpdate(id, data, { new: true })
      .populate('zoneId')
      .populate('authorizationId')
      .populate('generatedBy', 'name email role')
      .populate('resolvedBy', 'name email role');
  }

  async getSummary(): Promise<ReconciliationSummaryDto> {
    const reports = await ReconciliationReportModel.find();

    let compliantCount = 0;
    let discrepancyCount = 0;
    let criticalAnomalyCount = 0;
    let underInvestigationCount = 0;
    let resolvedCount = 0;
    let totalPermittedTonnage = 0;
    let totalIssuedTonnage = 0;
    let totalVerifiedTonnage = 0;

    for (const r of reports) {
      if (r.reconciliationStatus === ReconciliationStatus.COMPLIANT) compliantCount++;
      if (r.reconciliationStatus === ReconciliationStatus.FLAGGED_DISCREPANCY) discrepancyCount++;
      if (r.reconciliationStatus === ReconciliationStatus.CRITICAL_ANOMALY) criticalAnomalyCount++;

      if (r.status === ReconciliationReportStatus.UNDER_INVESTIGATION) underInvestigationCount++;
      if (r.status === ReconciliationReportStatus.RESOLVED) resolvedCount++;

      if (r.permitSummary?.permittedWeightTonnes) {
        totalPermittedTonnage += r.permitSummary.permittedWeightTonnes;
      }
      if (r.transportSummary?.totalIssuedTonnage) {
        totalIssuedTonnage += r.transportSummary.totalIssuedTonnage;
      }
      if (r.transportSummary?.totalVerifiedTonnage) {
        totalVerifiedTonnage += r.transportSummary.totalVerifiedTonnage;
      }
    }

    const unverifiedTransitGapTonnage = Math.max(0, totalIssuedTonnage - totalVerifiedTonnage);

    return {
      totalReports: reports.length,
      compliantCount,
      discrepancyCount,
      criticalAnomalyCount,
      underInvestigationCount,
      resolvedCount,
      totalPermittedTonnage,
      totalIssuedTonnage,
      totalVerifiedTonnage,
      unverifiedTransitGapTonnage,
    };
  }
}

export const reconciliationReportRepository = new ReconciliationReportRepository();
