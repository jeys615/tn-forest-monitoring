import { TemporaryAreaModel, type ITemporaryArea } from '../models/TemporaryArea.js';
import {
  type TemporaryAreaDto,
  TemporaryAreaStatus,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';
import { Types } from 'mongoose';

export interface TemporaryAreaFilters {
  status?: TemporaryAreaStatus;
  createdBy?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export class TemporaryAreaRepository {
  async create(data: Partial<ITemporaryArea>): Promise<ITemporaryArea> {
    const doc = new TemporaryAreaModel(data);
    return await doc.save();
  }

  async findById(id: string): Promise<ITemporaryArea | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await TemporaryAreaModel.findById(id).exec();
  }

  async findByTemporaryAreaId(temporaryAreaId: string): Promise<ITemporaryArea | null> {
    return await TemporaryAreaModel.findOne({ temporaryAreaId }).exec();
  }

  async findIntersecting(geometry: GeoJSONPolygon): Promise<ITemporaryArea[]> {
    return await TemporaryAreaModel.find({
      boundary: {
        $geoIntersects: {
          $geometry: geometry,
        },
      },
    }).exec();
  }

  async findAll(filters: TemporaryAreaFilters = {}): Promise<ITemporaryArea[]> {
    const query: Record<string, unknown> = {};

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.createdBy && Types.ObjectId.isValid(filters.createdBy)) {
      query.createdBy = new Types.ObjectId(filters.createdBy);
    }
    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.$gte = filters.startDate;
      if (filters.endDate) dateFilter.$lte = filters.endDate;
      query.createdAt = dateFilter;
    }

    const q = TemporaryAreaModel.find(query).sort({ createdAt: -1 });
    if (filters.limit && filters.limit > 0) {
      q.limit(filters.limit);
    }

    return await q.exec();
  }

  async update(id: string, updateData: Partial<ITemporaryArea>): Promise<ITemporaryArea | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await TemporaryAreaModel.findByIdAndUpdate(id, { $set: updateData }, { new: true }).exec();
  }

  async updateByTemporaryAreaId(
    temporaryAreaId: string,
    updateData: Partial<ITemporaryArea>,
  ): Promise<ITemporaryArea | null> {
    return await TemporaryAreaModel.findOneAndUpdate(
      { temporaryAreaId },
      { $set: updateData },
      { new: true },
    ).exec();
  }

  public mapToDto(area: ITemporaryArea): TemporaryAreaDto {
    return area.toDto();
  }
}

export const temporaryAreaRepository = new TemporaryAreaRepository();
