import { type Types } from 'mongoose';
import { CheckpointLogModel, type ICheckpointLog } from '../models/CheckpointLog.js';
import {
  CheckpointVerificationResult,
  type CheckpointSummaryDto,
} from '@tn-forest/shared/types';
import { CheckpointModel } from '../models/Checkpoint.js';

export class CheckpointLogRepository {
  async create(data: Partial<ICheckpointLog>): Promise<ICheckpointLog> {
    const doc = new CheckpointLogModel(data);
    return await doc.save();
  }

  async findById(id: string | Types.ObjectId): Promise<ICheckpointLog | null> {
    return await CheckpointLogModel.findById(id)
      .populate('checkpointId')
      .populate('epassId')
      .populate('vehicleId')
      .populate('driverId')
      .populate('verifiedBy', 'name email role');
  }

  async findAll(filter: {
    checkpointId?: string;
    passNumber?: string;
    verificationResult?: CheckpointVerificationResult;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    longitude?: number;
    latitude?: number;
    maxDistanceMeters?: number;
  } = {}): Promise<ICheckpointLog[]> {
    const query: Record<string, unknown> = {};
    if (filter.checkpointId) query.checkpointId = filter.checkpointId;
    if (filter.passNumber) query.passNumber = { $regex: filter.passNumber.trim(), $options: 'i' };
    if (filter.verificationResult) query.verificationResult = filter.verificationResult;
    if (filter.startDate || filter.endDate) {
      const dateQuery: Record<string, Date> = {};
      if (filter.startDate) dateQuery.$gte = filter.startDate;
      if (filter.endDate) dateQuery.$lte = filter.endDate;
      query.verificationTimestamp = dateQuery;
    }
    if (filter.longitude !== undefined && filter.latitude !== undefined) {
      query.scannedCoordinates = {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [filter.longitude, filter.latitude],
          },
          $maxDistance: filter.maxDistanceMeters ?? 50000,
        },
      };
    }

    const q = CheckpointLogModel.find(query);
    if (filter.longitude === undefined || filter.latitude === undefined) {
      q.sort({ verificationTimestamp: -1 });
    }
    q.populate('checkpointId', 'name district location')
      .populate('verifiedBy', 'name email role');

    if (filter.limit && filter.limit > 0) {
      q.limit(filter.limit);
    }

    return await q.exec();
  }

  async findByPassNumber(passNumber: string): Promise<ICheckpointLog[]> {
    return await CheckpointLogModel.find({ passNumber: passNumber.trim() })
      .sort({ verificationTimestamp: -1 })
      .populate('checkpointId', 'name district location')
      .populate('verifiedBy', 'name email role');
  }

  async getSummaryStats(): Promise<CheckpointSummaryDto> {
    const [totalCPs, activeCPs, totalLogs, validLogs, invalidLogs, tonnageAgg] = await Promise.all([
      CheckpointModel.countDocuments(),
      CheckpointModel.countDocuments({ status: 'ACTIVE' }),
      CheckpointLogModel.countDocuments(),
      CheckpointLogModel.countDocuments({ verificationResult: CheckpointVerificationResult.VALID }),
      CheckpointLogModel.countDocuments({ verificationResult: CheckpointVerificationResult.INVALID }),
      CheckpointLogModel.aggregate([
        {
          $match: {
            verificationResult: CheckpointVerificationResult.VALID,
          },
        },
        {
          $group: {
            _id: null,
            totalTonnage: { $sum: '$authorizedQuantityTonnes' },
          },
        },
      ]),
    ]);

    return {
      totalCheckpoints: totalCPs,
      activeCheckpoints: activeCPs,
      totalVerifications: totalLogs,
      validVerifications: validLogs,
      invalidVerifications: invalidLogs,
      totalTonnagePassed: tonnageAgg.length > 0 ? (tonnageAgg[0].totalTonnage || 0) : 0,
    };
  }
}

export const checkpointLogRepository = new CheckpointLogRepository();
