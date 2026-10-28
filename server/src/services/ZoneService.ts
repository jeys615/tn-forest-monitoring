import { ZoneRepository, ZoneFilters } from '../repositories/ZoneRepository.js';
import { calculateCentroid } from '../utils/geo.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import { MarkedAreaAnalysisService } from './MarkedAreaAnalysisService.js';
import {
  ZoneStatus,
  MarkedAreaType,
  type ZoneDto,
  type CreateZoneRequest,
  type UpdateZoneRequest,
} from '@tn-forest/shared/types';
import type { IZone } from '../models/Zone.js';
import { Types, type Schema } from 'mongoose';

export class ZoneService {
  private zoneRepository: ZoneRepository;

  constructor() {
    this.zoneRepository = new ZoneRepository();
  }

  async getAllZones(filters: ZoneFilters = {}): Promise<ZoneDto[]> {
    const zones = await this.zoneRepository.findAll(filters);
    return zones.map((z) => {
      const creator = z.createdBy as unknown as {
        _id: Schema.Types.ObjectId;
        name: string;
        email: string;
      } | null;
      return z.toZoneDto({
        id: creator && creator._id ? creator._id.toString() : z.createdBy?.toString() || 'unknown',
        name: creator?.name || 'Unknown',
        email: creator?.email || 'unknown@tnforest.gov.in',
      });
    });
  }

  async getZoneById(id: string): Promise<ZoneDto> {
    const zone = await this.zoneRepository.findById(id);
    if (!zone) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }
    const creator = zone.createdBy as unknown as {
      _id: Schema.Types.ObjectId;
      name: string;
      email: string;
    } | null;
    return zone.toZoneDto({
      id: creator && creator._id ? creator._id.toString() : zone.createdBy?.toString() || 'unknown',
      name: creator?.name || 'Unknown',
      email: creator?.email || 'unknown@tnforest.gov.in',
    });
  }

  async createZone(creatorId: string, data: CreateZoneRequest): Promise<ZoneDto> {
    // Check duplicate zone name
    const existingName = await this.zoneRepository.findByName(data.name);
    if (existingName) {
      throw new AppError('Zone name already exists', HTTP_STATUS.CONFLICT);
    }

    // Generate unique zoneId: ZONE-YYMMDD-XXXX
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randStr = Math.floor(1000 + Math.random() * 9000);
    const zoneId = `ZONE-${dateStr}-${randStr}`;

    // Calculate center point from exterior ring coordinates
    const centroidCoords = calculateCentroid(data.boundary.coordinates);

    if (data.baselineDate) {
      const bDate = new Date(data.baselineDate);
      if (bDate < new Date('2013-02-11')) {
        throw new AppError('Baseline date cannot be before 2013-02-11. No satellite imagery is available before this date.', HTTP_STATUS.BAD_REQUEST);
      }
    }

    const zoneDoc: Partial<IZone> = {
      zoneId,
      name: data.name.trim(),
      category: data.category,
      status: ZoneStatus.PROTECTED,
      boundary: data.boundary,
      centerPoint: {
        type: 'Point',
        coordinates: centroidCoords,
      },
      baselineDate: data.baselineDate ? new Date(data.baselineDate) : undefined,
      baselineImageUrl: data.baselineImageUrl,
      baselineImageRef: data.baselineImageRef,
      monitoringTracks: data.monitoringTracks ?? {
        optical: { enabled: true },
        sar: { enabled: false },
      },
      createdBy: new Types.ObjectId(creatorId) as unknown as Schema.Types.ObjectId,
    };

    const newZone = await this.zoneRepository.create(zoneDoc);
    const populatedZone = await this.zoneRepository.findById(newZone._id.toString());
    if (!populatedZone) {
      throw new AppError('Error creating zone', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const creator = populatedZone.createdBy as unknown as {
      _id?: Schema.Types.ObjectId;
      name?: string;
      email?: string;
    } | null;
    return populatedZone.toZoneDto({
      id: creator?._id ? creator._id.toString() : populatedZone.createdBy?.toString() || 'unknown',
      name: creator?.name || 'Unknown',
      email: creator?.email || 'unknown@tnforest.gov.in',
    });
  }

  async updateZone(editorId: string, id: string, data: UpdateZoneRequest): Promise<ZoneDto> {
    const zone = await this.zoneRepository.findById(id);
    if (!zone) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }

    const updates: Partial<IZone> = {};

    if (data.name !== undefined) {
      const nameTrimmed = data.name.trim();
      if (nameTrimmed !== zone.name) {
        const existingName = await this.zoneRepository.findByName(nameTrimmed);
        if (existingName) {
          throw new AppError('Zone name already exists', HTTP_STATUS.CONFLICT);
        }
        updates.name = nameTrimmed;
      }
    }

    if (data.category !== undefined) {
      updates.category = data.category;
    }

    if (data.status !== undefined) {
      updates.status = data.status;
    }

    if (data.baselineDate !== undefined) {
      updates.baselineDate = data.baselineDate ? new Date(data.baselineDate) : undefined;
    }

    if (data.baselineImageUrl !== undefined) {
      updates.baselineImageUrl = data.baselineImageUrl;
    }

    if (data.baselineImageRef !== undefined) {
      updates.baselineImageRef = data.baselineImageRef;
    }

    if (data.boundary !== undefined) {
      updates.boundary = data.boundary;
      // Recalculate center point
      const centroidCoords = calculateCentroid(data.boundary.coordinates);
      updates.centerPoint = {
        type: 'Point',
        coordinates: centroidCoords,
      };
    }

    if (data.monitoringTracks !== undefined) {
      const currentOptical = zone.monitoringTracks?.optical?.enabled ?? true;
      const currentSar = zone.monitoringTracks?.sar?.enabled ?? false;

      updates.monitoringTracks = {
        optical: {
          enabled:
            data.monitoringTracks.optical?.enabled !== undefined
              ? data.monitoringTracks.optical.enabled
              : currentOptical,
        },
        sar: {
          enabled:
            data.monitoringTracks.sar?.enabled !== undefined
              ? data.monitoringTracks.sar.enabled
              : currentSar,
        },
      };
    }

    const updatedZone = await this.zoneRepository.update(id, updates);
    if (!updatedZone) {
      throw new AppError('Zone update failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const creator = updatedZone.createdBy as unknown as {
      _id?: Schema.Types.ObjectId;
      name?: string;
      email?: string;
    } | null;
    return updatedZone.toZoneDto({
      id: creator?._id ? creator._id.toString() : updatedZone.createdBy?.toString() || 'unknown',
      name: creator?.name || 'Unknown',
      email: creator?.email || 'unknown@tnforest.gov.in',
    });
  }

  async suspendZone(id: string): Promise<ZoneDto> {
    const zone = await this.zoneRepository.findById(id);
    if (!zone) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }

    const updatedZone = await this.zoneRepository.update(id, { status: ZoneStatus.SUSPENDED });
    if (!updatedZone) {
      throw new AppError('Zone suspension failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const creator = updatedZone.createdBy as unknown as {
      _id?: Schema.Types.ObjectId;
      name?: string;
      email?: string;
    } | null;
    return updatedZone.toZoneDto({
      id: creator?._id ? creator._id.toString() : updatedZone.createdBy?.toString() || 'unknown',
      name: creator?.name || 'Unknown',
      email: creator?.email || 'unknown@tnforest.gov.in',
    });
  }

  async runZoneAnalysis(
    id: string,
    options: {
      startDate?: string;
      endDate?: string;
      demElevationDataAvailable?: boolean;
      estimatedMeanDepthMeters?: number;
    } = {},
  ) {
    const zone = await this.getZoneById(id);
    const markedAreaService = new MarkedAreaAnalysisService();
    return await markedAreaService.analyzeMarkedArea({
      areaId: zone.id,
      areaType: MarkedAreaType.PERMANENT,
      areaName: zone.name,
      boundary: zone.boundary,
      areaHectares: 100.0, // or calculated polygon area
      startDate: options.startDate,
      endDate: options.endDate,
      demElevationDataAvailable: options.demElevationDataAvailable,
      estimatedMeanDepthMeters: options.estimatedMeanDepthMeters,
    });
  }
}
