import { type Types, type ClientSession, type QueryOptions } from 'mongoose';
import {
  MiningAuthorizationModel,
  type IMiningAuthorization,
} from '../models/MiningAuthorization.js';
import { MiningAuthorizationStatus } from '@tn-forest/shared/types';

export class MiningAuthorizationRepository {
  async create(data: Partial<IMiningAuthorization>): Promise<IMiningAuthorization> {
    const doc = new MiningAuthorizationModel(data);
    return await doc.save();
  }

  async findById(id: string | Types.ObjectId): Promise<IMiningAuthorization | null> {
    return await MiningAuthorizationModel.findById(id)
      .populate('zoneId', 'name category status')
      .populate('temporaryAreaId', 'name status');
  }

  async findByPermitNumber(permitNumber: string): Promise<IMiningAuthorization | null> {
    return await MiningAuthorizationModel.findOne({ permitNumber });
  }

  async findAll(filter: {
    status?: MiningAuthorizationStatus;
    zoneId?: string;
    temporaryAreaId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<IMiningAuthorization[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.zoneId) query.zoneId = filter.zoneId;
    if (filter.temporaryAreaId) query.temporaryAreaId = filter.temporaryAreaId;
    if (filter.startDate || filter.endDate) {
      const dateQuery: Record<string, unknown> = {};
      if (filter.startDate) dateQuery.$gte = new Date(filter.startDate);
      if (filter.endDate) dateQuery.$lte = new Date(filter.endDate);
      query.validFrom = dateQuery;
    }

    return await MiningAuthorizationModel.find(query)
      .sort({ createdAt: -1 })
      .populate('zoneId', 'name category status')
      .populate('temporaryAreaId', 'name status');
  }

  async deductQuotaAtomic(
    authorizationId: string | Types.ObjectId,
    quantityTonnes: number,
    session?: ClientSession,
  ): Promise<IMiningAuthorization | null> {
    const now = new Date();
    const query: Record<string, unknown> = {
      _id: authorizationId,
      status: MiningAuthorizationStatus.ACTIVE,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      remainingQuota: { $gte: quantityTonnes },
    };

    const update = {
      $inc: { remainingQuota: -quantityTonnes },
    };

    const options: QueryOptions = { new: true };
    if (session) options.session = session;

    return (await MiningAuthorizationModel.findOneAndUpdate(query, update, options).exec()) as unknown as IMiningAuthorization | null;
  }

  async restoreQuotaAtomic(
    authorizationId: string | Types.ObjectId,
    quantityTonnes: number,
    session?: ClientSession,
  ): Promise<IMiningAuthorization | null> {
    const options: QueryOptions = { new: true };
    if (session) options.session = session;

    return (await MiningAuthorizationModel.findByIdAndUpdate(
      authorizationId,
      { $inc: { remainingQuota: quantityTonnes } },
      options,
    ).exec()) as unknown as IMiningAuthorization | null;
  }

  async updateStatus(
    id: string | Types.ObjectId,
    status: MiningAuthorizationStatus,
  ): Promise<IMiningAuthorization | null> {
    return (await MiningAuthorizationModel.findByIdAndUpdate(id, { status }, { new: true }).exec()) as unknown as IMiningAuthorization | null;
  }

  async countActive(): Promise<number> {
    return await MiningAuthorizationModel.countDocuments({ status: MiningAuthorizationStatus.ACTIVE });
  }
}

export const miningAuthorizationRepository = new MiningAuthorizationRepository();
