import { BaselineModel, type IBaseline } from '../models/Baseline.js';
import { Zone } from '../models/Zone.js';
import { SensorType, BaselineStatus, type BaselineDto } from '@tn-forest/shared/types';
import { Types } from 'mongoose';

export interface BaselineFilters {
  zoneId?: string;
  sensorType?: SensorType;
  status?: BaselineStatus;
  isActive?: boolean;
}

export class BaselineRepository {
  private async resolveZoneObjectId(zoneId: string): Promise<Types.ObjectId | null> {
    if (Types.ObjectId.isValid(zoneId)) {
      return new Types.ObjectId(zoneId);
    }
    const zone = await Zone.findOne({ zoneId }).select('_id');
    return zone ? (zone._id as Types.ObjectId) : null;
  }

  async create(data: Partial<IBaseline>): Promise<IBaseline> {
    const doc = new BaselineModel(data);
    return await doc.save();
  }

  async findById(id: string): Promise<IBaseline | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await BaselineModel.findById(id).exec();
  }

  async findActiveBaseline(zoneId: string, sensorType?: SensorType): Promise<IBaseline | null> {
    const targetZoneId = await this.resolveZoneObjectId(zoneId);
    if (!targetZoneId) return null;
    const query: Record<string, unknown> = {
      zoneId: targetZoneId,
      isActive: true,
    };
    if (sensorType) {
      query.sensorType = sensorType;
    }
    return await BaselineModel.findOne(query).exec();
  }

  async findByZoneAndSatelliteMetadata(
    zoneId: string,
    satelliteMetadataId: string,
  ): Promise<IBaseline | null> {
    if (!Types.ObjectId.isValid(satelliteMetadataId)) {
      return null;
    }
    const targetZoneId = await this.resolveZoneObjectId(zoneId);
    if (!targetZoneId) return null;
    return await BaselineModel.findOne({
      zoneId: targetZoneId,
      satelliteMetadataId: new Types.ObjectId(satelliteMetadataId),
    }).exec();
  }

  async findByZoneAndSensor(zoneId: string, sensorType: SensorType): Promise<IBaseline[]> {
    const targetZoneId = await this.resolveZoneObjectId(zoneId);
    if (!targetZoneId) return [];
    return await BaselineModel.find({
      zoneId: targetZoneId,
      sensorType,
    })
      .sort({ acquisitionDate: -1 })
      .exec();
  }

  async findAll(filters: BaselineFilters = {}): Promise<IBaseline[]> {
    const query: Record<string, unknown> = {};
    if (filters.zoneId) {
      const targetZoneId = await this.resolveZoneObjectId(filters.zoneId);
      if (targetZoneId) {
        query.zoneId = targetZoneId;
      } else {
        query.zoneId = new Types.ObjectId();
      }
    }
    if (filters.sensorType) {
      query.sensorType = filters.sensorType;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    return await BaselineModel.find(query).sort({ acquisitionDate: -1 }).exec();
  }

  async update(id: string, updates: Partial<IBaseline>): Promise<IBaseline | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return await BaselineModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).exec();
  }

  /**
   * Sets the designated baseline as ACTIVE for the given zone & sensor family,
   * while deactivating (RETIRED status) any previously active baseline for that track.
   */
  async activateBaseline(
    zoneId: string,
    sensorType: SensorType,
    baselineIdToActivate: string,
  ): Promise<IBaseline | null> {
    if (!Types.ObjectId.isValid(zoneId) || !Types.ObjectId.isValid(baselineIdToActivate)) {
      return null;
    }

    const zId = new Types.ObjectId(zoneId);
    const bId = new Types.ObjectId(baselineIdToActivate);

    // Deactivate currently active baseline for this zone & sensor track
    await BaselineModel.updateMany(
      {
        zoneId: zId,
        sensorType,
        isActive: true,
        _id: { $ne: bId },
      },
      {
        $set: {
          isActive: false,
          status: BaselineStatus.RETIRED,
          validUntil: new Date(),
        },
      },
    ).exec();

    // Activate target baseline
    const activated = await BaselineModel.findByIdAndUpdate(
      bId,
      {
        $set: {
          isActive: true,
          status: BaselineStatus.ACTIVE,
          validFrom: new Date(),
          validUntil: undefined,
        },
      },
      { new: true, runValidators: true },
    ).exec();

    return activated;
  }

  public mapToDto(baseline: IBaseline): BaselineDto {
    return baseline.toDto();
  }
}
