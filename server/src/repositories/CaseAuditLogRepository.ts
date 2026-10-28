import { type Types } from 'mongoose';
import { CaseAuditLogModel, type ICaseAuditLog } from '../models/CaseAuditLog.js';

export class CaseAuditLogRepository {
  async create(data: Partial<ICaseAuditLog>): Promise<ICaseAuditLog> {
    const doc = new CaseAuditLogModel(data);
    return await doc.save();
  }

  async findByCaseId(caseId: string | Types.ObjectId): Promise<ICaseAuditLog[]> {
    return await CaseAuditLogModel.find({ caseId })
      .sort({ timestamp: 1 })
      .populate('actorId', 'name email role');
  }

  async findByCaseNumber(caseNumber: string): Promise<ICaseAuditLog[]> {
    return await CaseAuditLogModel.find({ caseNumber: caseNumber.trim() })
      .sort({ timestamp: 1 })
      .populate('actorId', 'name email role');
  }
}
