import {
  ChangeDetectionModel,
  type IChangeDetection,
} from '../models/ChangeDetection.js';
import { Zone } from '../models/Zone.js';
import {
  SensorType,
  SatelliteSource,
  AlertSeverity,
  type ChangeDetectionDto,
} from '@tn-forest/shared/types';
import { Types } from 'mongoose';

export interface ChangeDetectionFilters {
  zoneId?: string;
  temporaryAreaId?: string;
  sensorType?: SensorType;
  source?: SatelliteSource;
  severity?: AlertSeverity | 'NONE';
  alertGenerated?: boolean;
  threshold?: number;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

export class ChangeDetectionRepository {
  async create(data: Partial<IChangeDetection>): Promise<IChangeDetection> {
    const doc = new ChangeDetectionModel(data);
    return await doc.save();
  }

  async findById(id: string): Promise<IChangeDetection | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await ChangeDetectionModel.findById(id).exec();
  }

  async findByChangeId(changeId: string): Promise<IChangeDetection | null> {
    return await ChangeDetectionModel.findOne({ changeId }).exec();
  }

  async findByObservationAndBaseline(
    zoneId: string | undefined,
    observationId: string,
    baselineOrRefId: string,
    temporaryAreaId?: string,
    calculationMethod?: string,
  ): Promise<IChangeDetection | null> {
    if (!Types.ObjectId.isValid(observationId) || !Types.ObjectId.isValid(baselineOrRefId)) {
      return null;
    }

    const query: Record<string, unknown> = {
      observationId: new Types.ObjectId(observationId),
      $or: [
        { baselineId: new Types.ObjectId(baselineOrRefId) },
        { referenceObservationId: new Types.ObjectId(baselineOrRefId) },
      ],
    };

    if (zoneId && Types.ObjectId.isValid(zoneId)) {
      query.zoneId = new Types.ObjectId(zoneId);
    }
    if (temporaryAreaId) {
      query.temporaryAreaId = temporaryAreaId;
    }
    if (calculationMethod) {
      query.calculationMethod = calculationMethod;
    }

    return await ChangeDetectionModel.findOne(query).sort({ createdAt: -1 }).exec();
  }

  async findByZoneId(zoneId: string, limit: number = 20): Promise<IChangeDetection[]> {
    if (!Types.ObjectId.isValid(zoneId)) return [];
    return await ChangeDetectionModel.find({
      zoneId: new Types.ObjectId(zoneId),
    })
      .sort({ detectedAt: -1 })
      .limit(limit)
      .exec();
  }

  async findByTemporaryAreaId(temporaryAreaId: string, limit: number = 20): Promise<IChangeDetection[]> {
    return await ChangeDetectionModel.find({
      temporaryAreaId,
    })
      .sort({ detectedAt: -1 })
      .limit(limit)
      .exec();
  }

  async findAll(filters: ChangeDetectionFilters = {}): Promise<IChangeDetection[]> {
    const query: Record<string, unknown> = {};

    if (filters.zoneId) {
      if (Types.ObjectId.isValid(filters.zoneId)) {
        const zone = await Zone.findOne({
          $or: [{ _id: filters.zoneId }, { zoneId: filters.zoneId }],
        }).select('_id');
        if (zone) {
          query.zoneId = zone._id;
        } else {
          query.zoneId = new Types.ObjectId(filters.zoneId);
        }
      } else {
        const zone = await Zone.findOne({ zoneId: filters.zoneId }).select('_id');
        if (zone) {
          query.zoneId = zone._id;
        }
      }
    }
    if (filters.temporaryAreaId) {
      query.temporaryAreaId = filters.temporaryAreaId;
    }
    if (filters.sensorType) {
      query.sensorType = filters.sensorType;
    }
    if (filters.source) {
      query.source = filters.source;
    }
    if (filters.severity) {
      query.severity = filters.severity;
    }
    if (filters.alertGenerated !== undefined) {
      query.alertGenerated = filters.alertGenerated;
    }
    if (filters.threshold !== undefined) {
      query.highestThresholdCrossed = { $gte: filters.threshold };
    }
    if (filters.fromDate || filters.toDate) {
      query.detectedAt = {};
      if (filters.fromDate) {
        (query.detectedAt as Record<string, unknown>).$gte = filters.fromDate;
      }
      if (filters.toDate) {
        (query.detectedAt as Record<string, unknown>).$lte = filters.toDate;
      }
    }

    const q = ChangeDetectionModel.find(query).sort({ detectedAt: -1 });
    if (filters.limit && filters.limit > 0) {
      q.limit(filters.limit);
    }

    return await q.exec();
  }

  async count(filters: ChangeDetectionFilters = {}): Promise<number> {
    const query: Record<string, unknown> = {};
    if (filters.zoneId && Types.ObjectId.isValid(filters.zoneId)) {
      query.zoneId = new Types.ObjectId(filters.zoneId);
    }
    if (filters.severity) {
      query.severity = filters.severity;
    }
    if (filters.alertGenerated !== undefined) {
      query.alertGenerated = filters.alertGenerated;
    }
    return await ChangeDetectionModel.countDocuments(query).exec();
  }

  async update(id: string, updates: Partial<IChangeDetection>): Promise<IChangeDetection | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await ChangeDetectionModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).exec();
  }

  public mapToDto(doc: IChangeDetection): ChangeDetectionDto {
    return doc.toDto();
  }
}
