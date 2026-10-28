import {
  ProcessedImageResultRepository,
  type ProcessedImageResultFilters,
} from '../repositories/ProcessedImageResultRepository.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import { SatelliteMetadataRepository } from '../repositories/SatelliteMetadataRepository.js';
import { ZoneRepository } from '../repositories/ZoneRepository.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  SensorType,
  SatelliteSource,
  SatelliteProcessingStatus,
  type ProcessedImageResultDto,
  type ProcessImageRequest,
} from '@tn-forest/shared/types';
import { OpticalImageProcessor } from './imageProcessing/OpticalImageProcessor.js';
import { SarImageProcessor } from './imageProcessing/SarImageProcessor.js';
import { GeeReductionService } from './gee/GeeReductionService.js';
import { Types } from 'mongoose';

export class ImageProcessingService {
  private resultRepo: ProcessedImageResultRepository;
  private baselineRepo: BaselineRepository;
  private satelliteRepo: SatelliteMetadataRepository;
  private zoneRepo: ZoneRepository;

  constructor() {
    this.resultRepo = new ProcessedImageResultRepository();
    this.baselineRepo = new BaselineRepository();
    this.satelliteRepo = new SatelliteMetadataRepository();
    this.zoneRepo = new ZoneRepository();
  }

  async getAllResults(
    filters: ProcessedImageResultFilters = {},
  ): Promise<ProcessedImageResultDto[]> {
    const list = await this.resultRepo.findAll(filters);
    return list.map((r) => r.toDto());
  }

  async getResultById(id: string): Promise<ProcessedImageResultDto> {
    const result = await this.resultRepo.findById(id);
    if (!result) {
      throw new AppError('Processed image result not found', HTTP_STATUS.NOT_FOUND);
    }
    return result.toDto();
  }

  async getZoneResults(zoneId: string, limit: number = 20): Promise<ProcessedImageResultDto[]> {
    const zone = await this.zoneRepo.findById(zoneId);
    if (!zone) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }
    const list = await this.resultRepo.findByZoneId(zoneId, limit);
    return list.map((r) => r.toDto());
  }

  /**
   * Core M5 processing pipeline execution for an acquired satellite image.
   */
  async processImage(request: ProcessImageRequest): Promise<ProcessedImageResultDto> {
    const { satelliteMetadataId, zoneId, temporaryAreaId, forceProcessing, referenceMetadataId } =
      request;

    const metadataDoc = await this.satelliteRepo.findById(satelliteMetadataId);
    if (!metadataDoc) {
      throw new AppError('Satellite metadata not found', HTTP_STATUS.NOT_FOUND);
    }

    let zoneDoc = null;
    if (zoneId && Types.ObjectId.isValid(zoneId)) {
      zoneDoc = await this.zoneRepo.findById(zoneId);
    }

    if (!zoneDoc && !temporaryAreaId && !referenceMetadataId && zoneId) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }

    const sensorType =
      request.sensorType ||
      metadataDoc.sensorType ||
      (metadataDoc.source === SatelliteSource.SENTINEL_1 ? SensorType.SAR : SensorType.OPTICAL);

    const startTime = Date.now();
    const maxCloudThreshold = 20.0;

    // Check optical cloud fallback requirement
    let fallbackTriggered = false;
    let fallbackReason: string | undefined;
    let targetMetadataDoc = metadataDoc;
    let effectiveSensorType = sensorType;

    if (
      sensorType === SensorType.OPTICAL &&
      metadataDoc.cloudCover > maxCloudThreshold &&
      !forceProcessing
    ) {
      // RULE 3 & Cloud Fallback Flow: High cloud cover in optical image triggers search for SAR observation
      fallbackTriggered = true;
      fallbackReason = `Optical cloud cover (${metadataDoc.cloudCover.toFixed(1)}%) exceeded maximum threshold (${maxCloudThreshold}%). Triggered independent SAR (Sentinel-1) search.`;

      // Search for available Sentinel-1 SAR metadata for this zone
      const sarRecords = zoneId
        ? await this.satelliteRepo.findAll({
            zoneId,
            source: SatelliteSource.SENTINEL_1,
          })
        : [];

      if (sarRecords.length > 0) {
        targetMetadataDoc = sarRecords[0];
        effectiveSensorType = SensorType.SAR;
      } else {
        // Record unavailability cleanly without creating false data or false alerts
        const durationMs = Date.now() - startTime;
        const failedResult = await this.resultRepo.create({
          zoneId: zoneDoc?._id || (zoneId && Types.ObjectId.isValid(zoneId) ? new Types.ObjectId(zoneId) : undefined),
          temporaryAreaId,
          satelliteMetadataId: metadataDoc._id,
          sensorType: SensorType.OPTICAL,
          source: metadataDoc.source,
          acquisitionDate: metadataDoc.acquisitionDate,
          processingStatus: SatelliteProcessingStatus.FAILED,
          qualityMetrics: {
            cloudCover: metadataDoc.cloudCover,
            validPixelPercentage: Number((100 - metadataDoc.cloudCover).toFixed(1)),
            zoneCoveragePercentage: 100.0,
            imageQuality: 20.0,
          },
          processingDurationMs: durationMs,
          fallbackTriggered: true,
          fallbackReason: `Optical cloud cover (${metadataDoc.cloudCover.toFixed(1)}%) exceeded threshold and no suitable SAR (Sentinel-1) observation was available.`,
        });

        return failedResult.toDto();
      }
    }

    // Retrieve active baseline for the target sensor family track if available
    const activeBaseline = zoneId
      ? await this.baselineRepo.findActiveBaseline(zoneId, effectiveSensorType)
      : null;

    // Idempotency: Return existing processing result if already completed for this specific zone or temporary area
    if (!forceProcessing) {
      const existingResult = await this.resultRepo.findBySatelliteMetadataId(metadataDoc._id.toString());
      if (
        existingResult &&
        existingResult.processingStatus === SatelliteProcessingStatus.PROCESSED &&
        ((zoneDoc && existingResult.zoneId?.toString() === zoneDoc._id.toString()) ||
         (temporaryAreaId && existingResult.temporaryAreaId === temporaryAreaId) ||
         (!zoneDoc && !temporaryAreaId))
      ) {
        return existingResult.toDto();
      }
    }

    // Execute server-side zonal pixel reduction via GEE Reduction Service
    let zonalReduction;
    const boundary = zoneDoc?.boundary || targetMetadataDoc.footprint;

    if (boundary && targetMetadataDoc.imageId) {
      const reductionService = GeeReductionService.getInstance();
      try {
        if (effectiveSensorType === SensorType.OPTICAL) {
          zonalReduction = await reductionService.reduceOpticalImage(
            targetMetadataDoc.imageId,
            boundary,
            {
              zoneId: zoneDoc?._id.toString() || zoneId,
              temporaryAreaId,
              acquisitionDate: targetMetadataDoc.acquisitionDate.toISOString(),
              cloudCover: targetMetadataDoc.cloudCover,
            },
          );
        } else {
          zonalReduction = await reductionService.reduceSarImage(
            targetMetadataDoc.imageId,
            boundary,
            {
              zoneId: zoneDoc?._id.toString() || zoneId,
              temporaryAreaId,
              acquisitionDate: targetMetadataDoc.acquisitionDate.toISOString(),
            },
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`[ImageProcessingService] GEE reduction note: ${msg}`);
      }
    }

    const mergedMetadata = {
      ...(targetMetadataDoc.metadata || {}),
      zonalStatistics: zonalReduction?.statistics,
      provenance: zonalReduction?.provenance || 'GEE_ZONAL_STATISTICS',
      processingMode: zonalReduction?.processingMode || 'REAL',
    };

    let opticalMetrics;
    let sarMetrics;
    let qualityMetrics;

    if (effectiveSensorType === SensorType.OPTICAL) {
      const opticalResult = OpticalImageProcessor.processOpticalImage(
        targetMetadataDoc.source,
        targetMetadataDoc.cloudCover,
        mergedMetadata,
      );
      opticalMetrics = opticalResult.opticalMetrics;
      qualityMetrics = opticalResult.qualityMetrics;
    } else {
      let activeSarBaselineMetrics;
      if (referenceMetadataId) {
        const refResult = await this.resultRepo.findBySatelliteMetadataId(referenceMetadataId);
        if (refResult?.sarMetrics) {
          activeSarBaselineMetrics = refResult.sarMetrics;
        }
      } else if (activeBaseline) {
        // Find processed result for active baseline to compute temporal backscatter diff
        const baselineResult = await this.resultRepo.findBySatelliteMetadataId(
          activeBaseline.satelliteMetadataId.toString(),
        );
        if (baselineResult?.sarMetrics) {
          activeSarBaselineMetrics = baselineResult.sarMetrics;
        } else {
          const baseMeta = await this.satelliteRepo.findById(activeBaseline.satelliteMetadataId.toString());
          if (baseMeta) {
            const baseSarProc = SarImageProcessor.processSarImage(baseMeta.source, baseMeta.metadata);
            activeSarBaselineMetrics = baseSarProc.sarMetrics;
          }
        }
      }

      const sarResult = SarImageProcessor.processSarImage(
        targetMetadataDoc.source,
        mergedMetadata,
        activeSarBaselineMetrics,
      );
      sarMetrics = sarResult.sarMetrics;
      qualityMetrics = sarResult.qualityMetrics;
    }

    const durationMs = Date.now() - startTime;

    const resultDoc = await this.resultRepo.create({
      zoneId: zoneDoc?._id || (zoneId && Types.ObjectId.isValid(zoneId) ? new Types.ObjectId(zoneId) : undefined),
      temporaryAreaId,
      satelliteMetadataId: metadataDoc._id,
      baselineId: activeBaseline ? activeBaseline._id : undefined,
      sensorType: effectiveSensorType,
      source: targetMetadataDoc.source,
      acquisitionDate: targetMetadataDoc.acquisitionDate,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      qualityMetrics,
      opticalMetrics,
      sarMetrics,
      processingDurationMs: durationMs,
      processedImageUrl: `/storage/processed/${targetMetadataDoc.imageId.replace(/\//g, '_')}_${effectiveSensorType.toLowerCase()}.png`,
      fallbackTriggered,
      fallbackReason,
    });

    // Update metadata processingStatus
    await this.satelliteRepo.update(metadataDoc._id.toString(), {
      processingStatus: SatelliteProcessingStatus.PROCESSED,
    });

    return resultDoc.toDto();
  }

  /**
   * Processes all historical observations within a date range for a zone/area.
   */
  async processHistoricalDateRange(options: {
    zoneId: string;
    sensorType?: SensorType;
    startDate: string;
    endDate: string;
    referenceMetadataId?: string;
  }): Promise<ProcessedImageResultDto[]> {
    const { zoneId, sensorType, startDate, endDate, referenceMetadataId } = options;

    const images = await this.satelliteRepo.findAll({
      zoneId,
      sensorType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    const results: ProcessedImageResultDto[] = [];
    for (const img of images) {
      const processed = await this.processImage({
        zoneId,
        satelliteMetadataId: img._id.toString(),
        sensorType: img.sensorType,
        referenceMetadataId,
      });
      results.push(processed);
    }

    return results;
  }
}
