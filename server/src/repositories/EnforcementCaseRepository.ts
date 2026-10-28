import { type Types } from 'mongoose';
import {
  EnforcementCaseModel,
  type IEnforcementCase,
} from '../models/EnforcementCase.js';
import {
  CaseStatus,
  CaseSeverity,
  type EnforcementCaseFilters,
  type EnforcementCaseSummaryDto,
} from '@tn-forest/shared/types';

export class EnforcementCaseRepository {
  async create(data: Partial<IEnforcementCase>): Promise<IEnforcementCase> {
    const doc = new EnforcementCaseModel(data);
    return await doc.save();
  }

  async findById(id: string | Types.ObjectId): Promise<IEnforcementCase | null> {
    return await EnforcementCaseModel.findById(id)
      .populate('zoneId')
      .populate('authorizationId')
      .populate('reconciliationReportId')
      .populate('assignedOfficerId', 'name email role')
      .populate('createdBy', 'name email role')
      .populate('closedBy', 'name email role')
      .populate('fieldVerification.verifiedBy', 'name email role')
      .populate('enforcementAction.issuedBy', 'name email role')
      .populate('resolutionInfo.resolvedBy', 'name email role');
  }

  async findByCaseId(caseId: string): Promise<IEnforcementCase | null> {
    return await EnforcementCaseModel.findOne({ caseId: caseId.trim() })
      .populate('zoneId')
      .populate('authorizationId')
      .populate('reconciliationReportId')
      .populate('assignedOfficerId', 'name email role')
      .populate('createdBy', 'name email role')
      .populate('closedBy', 'name email role')
      .populate('fieldVerification.verifiedBy', 'name email role')
      .populate('enforcementAction.issuedBy', 'name email role')
      .populate('resolutionInfo.resolvedBy', 'name email role');
  }

  async findActiveByReconciliationReportId(
    reconciliationReportId: string | Types.ObjectId,
  ): Promise<IEnforcementCase | null> {
    return await EnforcementCaseModel.findOne({
      reconciliationReportId,
      status: { $ne: CaseStatus.CLOSED },
    });
  }

  async findAll(filters: EnforcementCaseFilters = {}): Promise<IEnforcementCase[]> {
    const query: Record<string, unknown> = {};

    if (filters.status) query.status = filters.status;
    if (filters.severity) query.severity = filters.severity;
    if (filters.caseType) query.caseType = filters.caseType;
    if (filters.zoneId) query.zoneId = filters.zoneId;
    if (filters.authorizationId) query.authorizationId = filters.authorizationId;
    if (filters.assignedOfficerId) query.assignedOfficerId = filters.assignedOfficerId;
    if (filters.reconciliationReportId) query.reconciliationReportId = filters.reconciliationReportId;

    if (filters.search) {
      const s = filters.search.trim();
      query.$or = [
        { caseId: { $regex: s, $options: 'i' } },
        { title: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
        { permitNumber: { $regex: s, $options: 'i' } },
        { zoneName: { $regex: s, $options: 'i' } },
      ];
    }

    if (filters.startDate || filters.endDate) {
      const dateQuery: Record<string, Date> = {};
      if (filters.startDate) dateQuery.$gte = filters.startDate;
      if (filters.endDate) dateQuery.$lte = filters.endDate;
      query.createdAt = dateQuery;
    }

    const q = EnforcementCaseModel.find(query)
      .sort({ createdAt: -1 })
      .populate('zoneId')
      .populate('authorizationId')
      .populate('assignedOfficerId', 'name email role')
      .populate('createdBy', 'name email role')
      .populate('closedBy', 'name email role');

    if (filters.skip && filters.skip > 0) {
      q.skip(filters.skip);
    }
    if (filters.limit && filters.limit > 0) {
      q.limit(filters.limit);
    }

    return await q.exec();
  }

  async count(filters: EnforcementCaseFilters = {}): Promise<number> {
    const query: Record<string, unknown> = {};

    if (filters.status) query.status = filters.status;
    if (filters.severity) query.severity = filters.severity;
    if (filters.caseType) query.caseType = filters.caseType;
    if (filters.zoneId) query.zoneId = filters.zoneId;
    if (filters.authorizationId) query.authorizationId = filters.authorizationId;
    if (filters.assignedOfficerId) query.assignedOfficerId = filters.assignedOfficerId;
    if (filters.reconciliationReportId) query.reconciliationReportId = filters.reconciliationReportId;

    if (filters.search) {
      const s = filters.search.trim();
      query.$or = [
        { caseId: { $regex: s, $options: 'i' } },
        { title: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
      ];
    }

    return await EnforcementCaseModel.countDocuments(query);
  }

  async updateById(
    id: string | Types.ObjectId,
    updateData: Record<string, unknown>,
  ): Promise<IEnforcementCase | null> {
    return await EnforcementCaseModel.findByIdAndUpdate(id, updateData, { new: true })
      .populate('zoneId')
      .populate('authorizationId')
      .populate('reconciliationReportId')
      .populate('assignedOfficerId', 'name email role')
      .populate('createdBy', 'name email role')
      .populate('closedBy', 'name email role')
      .populate('fieldVerification.verifiedBy', 'name email role')
      .populate('enforcementAction.issuedBy', 'name email role')
      .populate('resolutionInfo.resolvedBy', 'name email role');
  }

  async getSummary(): Promise<EnforcementCaseSummaryDto> {
    const agg = await EnforcementCaseModel.aggregate([
      {
        $group: {
          _id: null,
          totalCases: { $sum: 1 },
          activeCases: {
            $sum: {
              $cond: [{ $ne: ['$status', CaseStatus.CLOSED] }, 1, 0],
            },
          },
          underInvestigationCount: {
            $sum: {
              $cond: [{ $eq: ['$status', CaseStatus.UNDER_INVESTIGATION] }, 1, 0],
            },
          },
          fieldVerificationCount: {
            $sum: {
              $cond: [{ $eq: ['$status', CaseStatus.FIELD_VERIFICATION] }, 1, 0],
            },
          },
          actionRequiredCount: {
            $sum: {
              $cond: [{ $eq: ['$status', CaseStatus.ACTION_REQUIRED] }, 1, 0],
            },
          },
          resolvedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', CaseStatus.RESOLVED] }, 1, 0],
            },
          },
          closedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', CaseStatus.CLOSED] }, 1, 0],
            },
          },
          criticalSeverityCount: {
            $sum: {
              $cond: [{ $eq: ['$severity', CaseSeverity.CRITICAL] }, 1, 0],
            },
          },
          highSeverityCount: {
            $sum: {
              $cond: [{ $eq: ['$severity', CaseSeverity.HIGH] }, 1, 0],
            },
          },
          mediumSeverityCount: {
            $sum: {
              $cond: [{ $eq: ['$severity', CaseSeverity.MEDIUM] }, 1, 0],
            },
          },
          lowSeverityCount: {
            $sum: {
              $cond: [{ $eq: ['$severity', CaseSeverity.LOW] }, 1, 0],
            },
          },
        },
      },
    ]);

    if (!agg || agg.length === 0) {
      return {
        totalCases: 0,
        activeCases: 0,
        underInvestigationCount: 0,
        fieldVerificationCount: 0,
        actionRequiredCount: 0,
        resolvedCount: 0,
        closedCount: 0,
        criticalSeverityCount: 0,
        highSeverityCount: 0,
        mediumSeverityCount: 0,
        lowSeverityCount: 0,
      };
    }

    const row = agg[0];
    return {
      totalCases: row.totalCases || 0,
      activeCases: row.activeCases || 0,
      underInvestigationCount: row.underInvestigationCount || 0,
      fieldVerificationCount: row.fieldVerificationCount || 0,
      actionRequiredCount: row.actionRequiredCount || 0,
      resolvedCount: row.resolvedCount || 0,
      closedCount: row.closedCount || 0,
      criticalSeverityCount: row.criticalSeverityCount || 0,
      highSeverityCount: row.highSeverityCount || 0,
      mediumSeverityCount: row.mediumSeverityCount || 0,
      lowSeverityCount: row.lowSeverityCount || 0,
    };
  }
}
