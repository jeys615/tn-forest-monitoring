import {
  ProcessedImageResultModel,
  type IProcessedImageResult,
} from '../models/ProcessedImageResult.js';
import { SensorType, type ProcessedImageResultDto } from '@tn-forest/shared/types';
import { Types } from 'mongoose';

export interface ProcessedImageResultFilters {
  zoneId?: string;
  satelliteMetadataId?: string;
  sensorType?: SensorType;
  limit?: number;
}

export class ProcessedImageResultRepository {
  async create(data: Partial<IProcessedImageResult>): Promise<IProcessedImageResult> {
    const doc = new ProcessedImageResultModel(data);
    return await doc.save();
  }

  async findById(id: string): Promise<IProcessedImageResult | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await ProcessedImageResultModel.findById(id).exec();
  }

  async findBySatelliteMetadataId(
    satelliteMetadataId: string,
  ): Promise<IProcessedImageResult | null> {
    if (!Types.ObjectId.isValid(satelliteMetadataId)) return null;
    return await ProcessedImageResultModel.findOne({
      satelliteMetadataId: new Types.ObjectId(satelliteMetadataId),
    }).exec();
  }

  async findByZoneId(zoneId: string, limit: number = 20): Promise<IProcessedImageResult[]> {
    if (!Types.ObjectId.isValid(zoneId)) return [];
    return await ProcessedImageResultModel.find({
      zoneId: new Types.ObjectId(zoneId),
    })
      .sort({ acquisitionDate: -1 })
      .limit(limit)
      .exec();
  }

  async findAll(filters: ProcessedImageResultFilters = {}): Promise<IProcessedImageResult[]> {
    const query: Record<string, unknown> = {};

    if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId)) {
      query.zoneId = new Types.ObjectId(filters.zoneId);
    }
    if (filters.satelliteMetadataId && Types.ObjectId.isValid(filters.satelliteMetadataId)) {
      query.satelliteMetadataId = new Types.ObjectId(filters.satelliteMetadataId);
    }
    if (filters.sensorType) {
      query.sensorType = filters.sensorType;
    }

    const q = ProcessedImageResultModel.find(query).sort({ acquisitionDate: -1 });
    if (filters.limit && filters.limit > 0) {
      q.limit(filters.limit);
    }

    return await q.exec();
  }

  public mapToDto(result: IProcessedImageResult): ProcessedImageResultDto {
    return result.toDto();
  }
}
