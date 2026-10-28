import { Types } from 'mongoose';
import { SatelliteMetadata, ISatelliteMetadata } from '../models/SatelliteMetadata.js';
import { Zone } from '../models/Zone.js';
import {
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';

export interface SatelliteMetadataFilters {
  source?: SatelliteSource;
  sensorType?: SensorType;
  processingStatus?: SatelliteProcessingStatus;
  zoneId?: string;
  startDate?: Date;
  endDate?: Date;
  exactDate?: Date;
  imageId?: string;
}

export class SatelliteMetadataRepository {
  async findById(id: string): Promise<ISatelliteMetadata | null> {
    return SatelliteMetadata.findById(id).populate('intersectingZones', 'name zoneId');
  }

  async findByImageId(imageId: string): Promise<ISatelliteMetadata | null> {
    return SatelliteMetadata.findOne({ imageId }).populate('intersectingZones', 'name zoneId');
  }

  async findAll(filters: SatelliteMetadataFilters = {}): Promise<ISatelliteMetadata[]> {
    const query: Record<string, unknown> = {};

    if (filters.source) {
      query.source = filters.source;
    }

    if (filters.sensorType) {
      if (filters.sensorType === SensorType.SAR) {
        query.$or = [
          { sensorType: SensorType.SAR },
          { sensorType: { $exists: false }, source: SatelliteSource.SENTINEL_1 },
          { sensorType: null, source: SatelliteSource.SENTINEL_1 },
        ];
      } else if (filters.sensorType === SensorType.OPTICAL) {
        query.$or = [
          { sensorType: SensorType.OPTICAL },
          { sensorType: { $exists: false }, source: { $in: [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_8, SatelliteSource.LANDSAT_9] } },
          { sensorType: null, source: { $in: [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_8, SatelliteSource.LANDSAT_9] } },
        ];
      } else {
        query.sensorType = filters.sensorType;
      }
    }

    if (filters.processingStatus) {
      query.processingStatus = filters.processingStatus;
    }

    if (filters.zoneId) {
      if (Types.ObjectId.isValid(filters.zoneId)) {
        const zone = await Zone.findOne({
          $or: [{ _id: filters.zoneId }, { zoneId: filters.zoneId }],
        }).select('_id');
        if (zone) {
          query.intersectingZones = zone._id;
        } else {
          query.intersectingZones = new Types.ObjectId(filters.zoneId);
        }
      } else {
        const zone = await Zone.findOne({ zoneId: filters.zoneId }).select('_id');
        if (zone) {
          query.intersectingZones = zone._id;
        } else {
          query.intersectingZones = new Types.ObjectId();
        }
      }
    }

    if (filters.imageId) {
      query.imageId = filters.imageId;
    }

    if (filters.exactDate) {
      const dayStart = new Date(filters.exactDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(filters.exactDate);
      dayEnd.setUTCHours(23, 59, 59, 999);
      query.acquisitionDate = { $gte: dayStart, $lte: dayEnd };
    } else if (filters.startDate || filters.endDate) {
      const dateQuery: Record<string, unknown> = {};
      if (filters.startDate) dateQuery['$gte'] = filters.startDate;
      if (filters.endDate) dateQuery['$lte'] = filters.endDate;
      query.acquisitionDate = dateQuery;
    }

    return SatelliteMetadata.find(query)
      .populate('intersectingZones', 'name zoneId')
      .sort({ acquisitionDate: -1 });
  }

  async findIntersecting(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options?: {
      startDate?: Date;
      endDate?: Date;
      exactDate?: Date;
      source?: SatelliteSource;
      sensorType?: SensorType;
    },
  ): Promise<ISatelliteMetadata[]> {
    const query: Record<string, unknown> = {
      footprint: {
        $geoIntersects: {
          $geometry: geometry,
        },
      },
    };

    if (options?.source) {
      query.source = options.source;
    }

    if (options?.sensorType) {
      if (options.sensorType === SensorType.SAR) {
        query.$or = [
          { sensorType: SensorType.SAR },
          { sensorType: { $exists: false }, source: SatelliteSource.SENTINEL_1 },
          { sensorType: null, source: SatelliteSource.SENTINEL_1 },
        ];
      } else if (options.sensorType === SensorType.OPTICAL) {
        query.$or = [
          { sensorType: SensorType.OPTICAL },
          { sensorType: { $exists: false }, source: { $in: [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_8, SatelliteSource.LANDSAT_9] } },
          { sensorType: null, source: { $in: [SatelliteSource.SENTINEL_2, SatelliteSource.LANDSAT_8, SatelliteSource.LANDSAT_9] } },
        ];
      } else {
        query.sensorType = options.sensorType;
      }
    }

    if (options?.exactDate) {
      const dayStart = new Date(options.exactDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(options.exactDate);
      dayEnd.setUTCHours(23, 59, 59, 999);
      query.acquisitionDate = { $gte: dayStart, $lte: dayEnd };
    } else if (options?.startDate || options?.endDate) {
      const dateQuery: Record<string, unknown> = {};
      if (options.startDate) dateQuery['$gte'] = options.startDate;
      if (options.endDate) dateQuery['$lte'] = options.endDate;
      query.acquisitionDate = dateQuery;
    }

    return SatelliteMetadata.find(query)
      .populate('intersectingZones', 'name zoneId')
      .sort({ acquisitionDate: -1 });
  }

  async create(data: Partial<ISatelliteMetadata>): Promise<ISatelliteMetadata> {
    const doc = new SatelliteMetadata(data);
    return doc.save();
  }

  async update(
    id: string,
    updates: Partial<ISatelliteMetadata>,
  ): Promise<ISatelliteMetadata | null> {
    return SatelliteMetadata.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).populate('intersectingZones', 'name zoneId');
  }

  async delete(id: string): Promise<ISatelliteMetadata | null> {
    return SatelliteMetadata.findByIdAndDelete(id);
  }
}
