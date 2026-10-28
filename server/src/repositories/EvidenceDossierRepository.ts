import { Types } from 'mongoose';
import {
  EvidenceDossierModel,
  type IEvidenceDossier,
} from '../models/EvidenceDossier.js';

export class EvidenceDossierRepository {
  async create(data: Partial<IEvidenceDossier>): Promise<IEvidenceDossier> {
    const doc = new EvidenceDossierModel(data);
    return await doc.save();
  }

  async findByDossierId(dossierId: string): Promise<IEvidenceDossier | null> {
    return await EvidenceDossierModel.findOne({ dossierId }).exec();
  }

  async findById(id: string): Promise<IEvidenceDossier | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await EvidenceDossierModel.findById(id).exec();
  }

  async findLatestByCaseId(caseId: string): Promise<IEvidenceDossier | null> {
    const query: Record<string, unknown> = {};
    if (Types.ObjectId.isValid(caseId)) {
      query.$or = [
        { caseId: new Types.ObjectId(caseId) },
        { caseNumber: caseId },
      ];
    } else {
      query.caseNumber = caseId;
    }

    return await EvidenceDossierModel.findOne(query)
      .sort({ dossierVersion: -1 })
      .exec();
  }

  async findAllByCaseId(caseId: string): Promise<IEvidenceDossier[]> {
    const query: Record<string, unknown> = {};
    if (Types.ObjectId.isValid(caseId)) {
      query.$or = [
        { caseId: new Types.ObjectId(caseId) },
        { caseNumber: caseId },
      ];
    } else {
      query.caseNumber = caseId;
    }

    return await EvidenceDossierModel.find(query)
      .sort({ dossierVersion: -1 })
      .exec();
  }

  async countByCaseId(caseId: string): Promise<number> {
    const query: Record<string, unknown> = {};
    if (Types.ObjectId.isValid(caseId)) {
      query.$or = [
        { caseId: new Types.ObjectId(caseId) },
        { caseNumber: caseId },
      ];
    } else {
      query.caseNumber = caseId;
    }

    return await EvidenceDossierModel.countDocuments(query).exec();
  }
}

export const evidenceDossierRepository = new EvidenceDossierRepository();
