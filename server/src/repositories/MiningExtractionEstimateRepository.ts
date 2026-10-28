import {
  MiningExtractionEstimateModel,
  type IMiningExtractionEstimate,
} from '../models/MiningExtractionEstimate.js';
import { type MiningExtractionEstimateDto, type MarkedAreaType } from '@tn-forest/shared/types';
import { Types } from 'mongoose';

export class MiningExtractionEstimateRepository {
  async create(data: Partial<IMiningExtractionEstimate>): Promise<IMiningExtractionEstimate> {
    const doc = new MiningExtractionEstimateModel(data);
    return await doc.save();
  }

  async findById(id: string): Promise<IMiningExtractionEstimate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await MiningExtractionEstimateModel.findById(id).exec();
  }

  async findByTemporaryAreaId(temporaryAreaId: string): Promise<IMiningExtractionEstimate[]> {
    return await MiningExtractionEstimateModel.find({
      $or: [{ temporaryAreaId }, { markedAreaId: temporaryAreaId }],
    })
      .sort({ observationDate: 1 })
      .exec();
  }

  async findByMarkedAreaId(
    markedAreaId: string,
    areaType?: MarkedAreaType,
  ): Promise<IMiningExtractionEstimate[]> {
    const filter: Record<string, unknown> = {
      $or: [{ markedAreaId }, { temporaryAreaId: markedAreaId }],
    };
    if (areaType) {
      filter.areaType = areaType;
    }
    return await MiningExtractionEstimateModel.find(filter)
      .sort({ observationDate: 1 })
      .exec();
  }

  async findByChangeDetectionId(
    changeDetectionId: string,
  ): Promise<IMiningExtractionEstimate | null> {
    if (!Types.ObjectId.isValid(changeDetectionId)) return null;
    return await MiningExtractionEstimateModel.findOne({
      changeDetectionId: new Types.ObjectId(changeDetectionId),
    }).exec();
  }

  async deleteByTemporaryAreaId(temporaryAreaId: string): Promise<void> {
    await MiningExtractionEstimateModel.deleteMany({
      $or: [{ temporaryAreaId }, { markedAreaId: temporaryAreaId }],
    }).exec();
  }

  async deleteByMarkedAreaId(markedAreaId: string): Promise<void> {
    await MiningExtractionEstimateModel.deleteMany({
      $or: [{ markedAreaId }, { temporaryAreaId: markedAreaId }],
    }).exec();
  }

  public mapToDto(estimate: IMiningExtractionEstimate): MiningExtractionEstimateDto {
    return estimate.toDto();
  }
}
