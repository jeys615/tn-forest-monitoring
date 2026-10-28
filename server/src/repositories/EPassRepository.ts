import { type Types, type ClientSession, type QueryOptions, type SaveOptions } from 'mongoose';
import { EPassModel, type IEPass } from '../models/EPass.js';
import { EPassStatus } from '@tn-forest/shared/types';

export class EPassRepository {
  async create(data: Partial<IEPass>, session?: ClientSession): Promise<IEPass> {
    const doc = new EPassModel(data);
    const options: SaveOptions = {};
    if (session) options.session = session;
    return await doc.save(options);
  }

  async findById(id: string | Types.ObjectId): Promise<IEPass | null> {
    return await EPassModel.findById(id)
      .populate('authorizationId')
      .populate('vehicleId')
      .populate('driverId')
      .populate('createdBy', 'name email role');
  }

  async findByPassNumber(passNumber: string): Promise<IEPass | null> {
    return await EPassModel.findOne({ passNumber })
      .populate('authorizationId')
      .populate('vehicleId')
      .populate('driverId')
      .populate('createdBy', 'name email role');
  }

  async findAll(filter: {
    status?: EPassStatus;
    authorizationId?: string;
    authorizationIds?: (string | Types.ObjectId)[];
    vehicleId?: string;
    driverId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<IEPass[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.authorizationIds !== undefined) {
      query.authorizationId = { $in: filter.authorizationIds };
    } else if (filter.authorizationId) {
      query.authorizationId = filter.authorizationId;
    }
    if (filter.vehicleId) query.vehicleId = filter.vehicleId;
    if (filter.driverId) query.driverId = filter.driverId;
    if (filter.startDate || filter.endDate) {
      const dateQuery: Record<string, Date> = {};
      if (filter.startDate) dateQuery.$gte = filter.startDate;
      if (filter.endDate) dateQuery.$lte = filter.endDate;
      query.createdAt = dateQuery;
    }

    return await EPassModel.find(query)
      .sort({ createdAt: -1 })
      .populate('authorizationId', 'permitNumber lesseeName mineralType')
      .populate('vehicleId', 'registrationNumber vehicleType permittedCarryingCapacity')
      .populate('driverId', 'name licenseNumber phone')
      .populate('createdBy', 'name email');
  }

  async updateStatus(
    id: string | Types.ObjectId,
    status: EPassStatus,
    extraFields: Partial<IEPass> = {},
    session?: ClientSession,
  ): Promise<IEPass | null> {
    const options: QueryOptions = { new: true };
    if (session) options.session = session;

    return (await EPassModel.findByIdAndUpdate(
      id,
      { status, ...extraFields },
      options,
    ).exec()) as unknown as IEPass | null;
  }

  async countTotal(): Promise<number> {
    return await EPassModel.countDocuments();
  }

  async countByStatus(status: EPassStatus): Promise<number> {
    return await EPassModel.countDocuments({ status });
  }

  async getAggregateStats(): Promise<{
    totalIssued: number;
    activeCount: number;
    usedCount: number;
    expiredCount: number;
    cancelledCount: number;
    totalTransportedTonnes: number;
  }> {
    const [counts, tonnage] = await Promise.all([
      EPassModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      EPassModel.aggregate([
        {
          $match: {
            status: { $in: [EPassStatus.ACTIVE, EPassStatus.USED] },
          },
        },
        {
          $group: {
            _id: null,
            totalTonnes: { $sum: '$netWeightTonnes' },
          },
        },
      ]),
    ]);

    const countMap: Record<string, number> = {};
    let totalIssued = 0;
    for (const c of counts) {
      countMap[c._id] = c.count;
      totalIssued += c.count;
    }

    return {
      totalIssued,
      activeCount: countMap[EPassStatus.ACTIVE] || 0,
      usedCount: countMap[EPassStatus.USED] || 0,
      expiredCount: countMap[EPassStatus.EXPIRED] || 0,
      cancelledCount: countMap[EPassStatus.CANCELLED] || 0,
      totalTransportedTonnes: tonnage.length > 0 ? tonnage[0].totalTonnes : 0,
    };
  }
}

export const ePassRepository = new EPassRepository();
