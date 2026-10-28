import { type Types } from 'mongoose';
import { CheckpointModel, type ICheckpoint } from '../models/Checkpoint.js';
import { CheckpointStatus } from '@tn-forest/shared/types';

export class CheckpointRepository {
  async create(data: Partial<ICheckpoint>): Promise<ICheckpoint> {
    const doc = new CheckpointModel(data);
    return await doc.save();
  }

  async findById(id: string | Types.ObjectId): Promise<ICheckpoint | null> {
    return await CheckpointModel.findById(id).populate('authorizedUserIds', 'name email role');
  }

  async findByCheckpointId(checkpointId: string): Promise<ICheckpoint | null> {
    return await CheckpointModel.findOne({
      checkpointId: checkpointId.toUpperCase().trim(),
    }).populate('authorizedUserIds', 'name email role');
  }

  async findAll(filter: {
    status?: CheckpointStatus;
    district?: string;
  } = {}): Promise<ICheckpoint[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.district) query.district = filter.district;

    return await CheckpointModel.find(query)
      .sort({ name: 1 })
      .populate('authorizedUserIds', 'name email role');
  }

  async update(
    id: string | Types.ObjectId,
    data: Partial<ICheckpoint>,
  ): Promise<ICheckpoint | null> {
    return (await CheckpointModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true },
    ).exec()) as unknown as ICheckpoint | null;
  }

  async countTotal(): Promise<number> {
    return await CheckpointModel.countDocuments();
  }

  async countActive(): Promise<number> {
    return await CheckpointModel.countDocuments({ status: CheckpointStatus.ACTIVE });
  }
}

export const checkpointRepository = new CheckpointRepository();
