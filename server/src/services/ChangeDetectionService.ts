import {
  ChangeDetectionRepository,
  type ChangeDetectionFilters,
} from '../repositories/ChangeDetectionRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { ZoneRepository } from '../repositories/ZoneRepository.js';
import { SatelliteMetadataRepository } from '../repositories/SatelliteMetadataRepository.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import { ProcessedImageResultRepository } from '../repositories/ProcessedImageResultRepository.js';
import { ImageProcessingService } from './ImageProcessingService.js';
import { OpticalChangeDetector } from './changeDetection/OpticalChangeDetector.js';
import { SarChangeDetector } from './changeDetection/SarChangeDetector.js';
import { EvidenceFusionEngine } from './changeDetection/EvidenceFusionEngine.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  SensorType,
  SatelliteSource,
  AlertStatus,
  AlertSeverity,
  ChangeCategory,
  MonitoringTrack,
  ChangeCalculationMethod,
  SpatialCalculationType,
  SarChangeDirection,
  ComparisonMode,
  type ChangeDetectionDto,
  type DetectChangeRequest,
  type SpatialChangeResult,
  type ChangeIndicatorDeltas,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';
import { type IAlert } from '../models/Alert.js';
import { Types } from 'mongoose';
import fs from 'node:fs';
import { GeoTiffService } from './raster/GeoTiffService.js';
import { AnalysisGridService } from './spatial/AnalysisGridService.js';
import { SpatialHarmonizationService } from './spatial/SpatialHarmonizationService.js';
import { SarPixelChangeDetector } from './changeDetection/SarPixelChangeDetector.js';
import { SarCompatibilityService } from './spatial/SarCompatibilityService.js';
import { OpticalCompatibilityService } from './spatial/OpticalCompatibilityService.js';
import { OpticalSpatialHarmonizationService } from './spatial/OpticalSpatialHarmonizationService.js';
import { OpticalPixelIndexService } from './spatial/OpticalPixelIndexService.js';
import { OpticalPixelChangeDetector, DEFAULT_OPTICAL_THRESHOLD_CONFIG } from './changeDetection/OpticalPixelChangeDetector.js';
import { OpticalComparisonDecisionService } from './spatial/OpticalComparisonDecisionService.js';
import { HLSRepresentationService } from './hls/HLSRepresentationService.js';
import { HLSComparisonService } from './hls/HLSComparisonService.js';
import { CanopyGuardShadowService } from './changeDetection/CanopyGuardShadowService.js';

export class ChangeDetectionService {
  private static readonly imageBufferCache = new Map<string, Buffer>();
  private changeRepo: ChangeDetectionRepository;
  private alertRepo: AlertRepository;
  private zoneRepo: ZoneRepository;
  private satelliteRepo: SatelliteMetadataRepository;
  private baselineRepo: BaselineRepository;
  private processedResultRepo: ProcessedImageResultRepository;
  private imageProcessingService: ImageProcessingService;

  constructor() {
    this.changeRepo = new ChangeDetectionRepository();
    this.alertRepo = new AlertRepository();
    this.zoneRepo = new ZoneRepository();
    this.satelliteRepo = new SatelliteMetadataRepository();
    this.baselineRepo = new BaselineRepository();
    this.processedResultRepo = new ProcessedImageResultRepository();
    this.imageProcessingService = new ImageProcessingService();
  }

  async getChanges(filters: ChangeDetectionFilters = {}): Promise<ChangeDetectionDto[]> {
    const list = await this.changeRepo.findAll(filters);
    return list.map((c) => c.toDto());
  }

  async getChangeById(id: string): Promise<ChangeDetectionDto> {
    const change = (await this.changeRepo.findById(id)) || (await this.changeRepo.findByChangeId(id));
    if (!change) {
      throw new AppError(`Change detection record not found: ${id}`, HTTP_STATUS.NOT_FOUND);
    }
    return change.toDto();
  }

  async getZoneChanges(zoneId: string, limit: number = 20): Promise<ChangeDetectionDto[]> {
    const zone = await this.zoneRepo.findById(zoneId);
    if (!zone) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }
    const list = await this.changeRepo.findByZoneId(zoneId, limit);
    return list.map((c) => c.toDto());
  }

  /**
   * Core M6 Change Detection & Multi-Threshold Alerting Pipeline.
   */
  async detectChange(
    request: DetectChangeRequest,
    simulationOverridePercentage?: number,
  ): Promise<ChangeDetectionDto> {
    const {
      zoneId,
      temporaryAreaId,
      boundary,
      observationId,
      baselineId,
      referenceObservationId,
      forceSensorType,
    } = request;

    if (!zoneId && !temporaryAreaId && !boundary) {
      throw new AppError(
        'Either zoneId, temporaryAreaId, or boundary must be provided',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 1. Retrieve and validate Zone or Temporary Area
    let zoneName = 'Temporary Monitoring Area';
    let zoneIdentifier = temporaryAreaId || 'TEMP-AREA';
    let zoneAreaHectares = 100.0;
    let zoneDoc;

    if (zoneId && Types.ObjectId.isValid(zoneId)) {
      zoneDoc = await this.zoneRepo.findById(zoneId);
      if (zoneDoc) {
        zoneName = zoneDoc.name;
        zoneIdentifier = zoneDoc.zoneId;
        zoneAreaHectares = zoneDoc.areaHectares || 100.0;
      } else if (!temporaryAreaId) {
        throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
      }
    }

    // 2. Retrieve Observation Metadata
    const observationMeta = await this.satelliteRepo.findById(observationId);
    if (!observationMeta) {
      throw new AppError('Observation satellite metadata not found', HTTP_STATUS.NOT_FOUND);
    }

    const sensorType =
      forceSensorType ||
      observationMeta.sensorType ||
      (observationMeta.source === SatelliteSource.SENTINEL_1 ? SensorType.SAR : SensorType.OPTICAL);

    // 3. Resolve Reference Observation or Baseline
    let activeBaseline = null;
    let referenceObservationMeta = null;
    let effectiveBaselineOrRefId: string | undefined;

    if (referenceObservationId) {
      referenceObservationMeta = await this.satelliteRepo.findById(referenceObservationId);
      if (!referenceObservationMeta) {
        throw new AppError(
          'Reference observation satellite metadata not found',
          HTTP_STATUS.NOT_FOUND,
        );
      }
      const refSensorType =
        referenceObservationMeta.sensorType ||
        (referenceObservationMeta.source === SatelliteSource.SENTINEL_1
          ? SensorType.SAR
          : SensorType.OPTICAL);
      if (sensorType !== refSensorType) {
        throw new AppError(
          `SENSOR_TRACK_MISMATCH: Direct comparison between ${sensorType} and ${refSensorType} is strictly prohibited. Optical must compare with Optical, and SAR with SAR.`,
          HTTP_STATUS.BAD_REQUEST,
        );
      }
      effectiveBaselineOrRefId = referenceObservationId;
    } else if (baselineId) {
      activeBaseline = await this.baselineRepo.findById(baselineId);
      if (!activeBaseline) {
        throw new AppError('Specified baseline not found', HTTP_STATUS.NOT_FOUND);
      }
      effectiveBaselineOrRefId = baselineId;
    } else if (zoneId) {
      activeBaseline = await this.baselineRepo.findActiveBaseline(zoneId, sensorType);
      if (!activeBaseline) {
        throw new AppError(
          `BASELINE_UNAVAILABLE: No active ${sensorType} baseline found for zone ${zoneName} (${zoneIdentifier}). Please establish and activate a baseline first.`,
          HTTP_STATUS.BAD_REQUEST,
        );
      }
      effectiveBaselineOrRefId = activeBaseline._id.toString();
    } else {
      throw new AppError(
        'A baselineId or referenceObservationId is required for temporary area change detection',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 4. Alert / Change Deduplication Check
    if (effectiveBaselineOrRefId && !request.forceRecalculate) {
      const existingDetection = await this.changeRepo.findByObservationAndBaseline(
        zoneId,
        observationId,
        effectiveBaselineOrRefId,
        temporaryAreaId,
      );
      if (existingDetection) {
        return existingDetection.toDto();
      }
    }

    // Resolve authoritative baseline SatelliteMetadata doc if active baseline exists
    let baselineMeta = null;
    if (activeBaseline?.satelliteMetadataId) {
      baselineMeta = await this.satelliteRepo.findById(activeBaseline.satelliteMetadataId.toString());
    } else if (referenceObservationMeta) {
      baselineMeta = referenceObservationMeta;
    }

    // 5. Ensure M5 processing results exist for observation & active baseline / reference
    let observationProcessed = await this.processedResultRepo.findBySatelliteMetadataId(
      observationId,
    );
    if (!observationProcessed) {
      const pDto = await this.imageProcessingService.processImage({
        satelliteMetadataId: observationId,
        zoneId: zoneId || (zoneDoc?._id ? zoneDoc._id.toString() : undefined),
        temporaryAreaId,
        sensorType,
        referenceMetadataId: referenceObservationId,
      });
      observationProcessed = await this.processedResultRepo.findById(pDto.id);
    }

    let baselineProcessed = null;
    if (referenceObservationMeta) {
      baselineProcessed = await this.processedResultRepo.findBySatelliteMetadataId(
        referenceObservationMeta._id.toString(),
      );
      if (!baselineProcessed) {
        const bDto = await this.imageProcessingService.processImage({
          satelliteMetadataId: referenceObservationMeta._id.toString(),
          zoneId: zoneId || (zoneDoc?._id ? zoneDoc._id.toString() : undefined),
          temporaryAreaId,
          sensorType,
        });
        baselineProcessed = await this.processedResultRepo.findById(bDto.id);
      }
    } else if (activeBaseline) {
      baselineProcessed = await this.processedResultRepo.findBySatelliteMetadataId(
        activeBaseline.satelliteMetadataId.toString(),
      );
      if (!baselineProcessed) {
        const bDto = await this.imageProcessingService.processImage({
          satelliteMetadataId: activeBaseline.satelliteMetadataId.toString(),
          zoneId: zoneId || (zoneDoc?._id ? zoneDoc._id.toString() : undefined),
          sensorType,
        });
        baselineProcessed = await this.processedResultRepo.findById(bDto.id);
      }
    }

    // 6. Handle Cloud-Aware Fallback Flow if Optical observation is degraded
    let isCloudFallback = false;
    let opticalEvidence: 'CLEAN' | 'CLOUD_DEGRADED' | 'UNAVAILABLE' = 'CLEAN';
    let sarEvidence: 'AVAILABLE' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let effectiveSensorType = sensorType;

    let primarySpatialResult!: SpatialChangeResult;
    let changeIndicators: ChangeIndicatorDeltas = {};
    let categories: ChangeCategory[] = [];
    let secondarySpatialResult: SpatialChangeResult | undefined;

    const isRealTelemetry =
      simulationOverridePercentage === undefined &&
      Boolean(
        observationMeta.metadata?.isRealTelemetry ??
          (observationMeta.processingStatus === 'PROCESSED' || observationMeta.rasterValidated),
      );

    const checkBaseRaster =
      activeBaseline?.localRasterPath || (baselineMeta ? baselineMeta.localRasterPath : undefined);
    const checkCurRaster = observationMeta.localRasterPath;
    const checkBoundary = zoneDoc?.boundary;
    const hasRealOpticalRasters = Boolean(
      simulationOverridePercentage === undefined &&
      checkBaseRaster &&
      fs.existsSync(checkBaseRaster) &&
      checkCurRaster &&
      fs.existsSync(checkCurRaster) &&
      checkBoundary,
    );

    if (sensorType === SensorType.OPTICAL && !hasRealOpticalRasters && observationMeta.cloudCover > 20.0) {
      opticalEvidence = 'CLOUD_DEGRADED';
      isCloudFallback = true;

      // Search for available Sentinel-1 SAR observation for this zone/area
      const sarRecords = zoneId
        ? await this.satelliteRepo.findAll({
            zoneId,
            source: SatelliteSource.SENTINEL_1,
          })
        : [];

      const activeSarBaseline = zoneId
        ? await this.baselineRepo.findActiveBaseline(zoneId, SensorType.SAR)
        : null;

      if (sarRecords.length > 0 && activeSarBaseline) {
        sarEvidence = 'AVAILABLE';
        effectiveSensorType = SensorType.SAR;

        // Process SAR observation vs SAR baseline
        let sarObsProcessed = await this.processedResultRepo.findBySatelliteMetadataId(
          sarRecords[0]._id.toString(),
        );
        if (!sarObsProcessed) {
          const sDto = await this.imageProcessingService.processImage({
            satelliteMetadataId: sarRecords[0]._id.toString(),
            zoneId: zoneId || (zoneDoc?._id ? zoneDoc._id.toString() : undefined),
            temporaryAreaId,
            sensorType: SensorType.SAR,
          });
          sarObsProcessed = await this.processedResultRepo.findById(sDto.id);
        }

        let sarBaseProcessed = await this.processedResultRepo.findBySatelliteMetadataId(
          activeSarBaseline.satelliteMetadataId.toString(),
        );
        if (!sarBaseProcessed) {
          const sbDto = await this.imageProcessingService.processImage({
            satelliteMetadataId: activeSarBaseline.satelliteMetadataId.toString(),
            zoneId: zoneId || (zoneDoc?._id ? zoneDoc._id.toString() : undefined),
            temporaryAreaId,
            sensorType: SensorType.SAR,
          });
          sarBaseProcessed = await this.processedResultRepo.findById(sbDto.id);
        }

        const sarDet = SarChangeDetector.detectChange({
          currentMetrics: sarObsProcessed?.sarMetrics || { vv: -11.5, vh: -18.2, vvVhRatio: 6.7 },
          baselineMetrics: sarBaseProcessed?.sarMetrics || { vv: -12.0, vh: -18.0, vvVhRatio: 6.0 },
          zoneAreaHectares,
          forcedAffectedPercentage: simulationOverridePercentage,
          isRealTelemetry,
        });

        primarySpatialResult = sarDet.spatialResult;
        changeIndicators = sarDet.changeIndicators;
        categories = sarDet.categories;
      } else {
        // Run degraded optical detection
        const optDet = OpticalChangeDetector.detectChange({
          currentMetrics: observationProcessed?.opticalMetrics || {
            ndvi: 0.35,
            ndwi: 0.1,
            ndbi: 0.1,
            bsi: 0.15,
            savi: 0.35,
            evi: 0.3,
          },
          baselineMetrics: baselineProcessed?.opticalMetrics || {
            ndvi: 0.45,
            ndwi: 0.1,
            ndbi: 0.05,
            bsi: 0.08,
            savi: 0.45,
            evi: 0.4,
          },
          zoneAreaHectares,
          forcedAffectedPercentage: simulationOverridePercentage,
          isRealTelemetry,
        });

        primarySpatialResult = optDet.spatialResult;
        changeIndicators = optDet.changeIndicators;
        categories = optDet.categories;
      }
    } else if (sensorType === SensorType.OPTICAL) {
      if (observationMeta.cloudCover > 20.0) {
        opticalEvidence = 'CLOUD_DEGRADED';
      }
      // Production Optical Change Detection
      const baselineRasterPath =
        activeBaseline?.localRasterPath || (baselineMeta ? baselineMeta.localRasterPath : undefined);
      const currentRasterPath = observationMeta.localRasterPath;
      const boundary = zoneDoc?.boundary;

      let pixelDetectionSucceeded = false;

      if (
        simulationOverridePercentage === undefined &&
        baselineRasterPath &&
        fs.existsSync(baselineRasterPath) &&
        currentRasterPath &&
        fs.existsSync(currentRasterPath) &&
        boundary
      ) {
        try {
          console.info(
            `[ChangeDetectionService] Executing production-grade pixel-level Optical differencing for zone ${zoneName}...`,
          );

          // Centralized Optical Compatibility Verification
          const baseGeom = {
            imageId: baselineMeta?.imageId || activeBaseline?.imageId || '',
            source: baselineMeta?.source || activeBaseline?.source,
            platform: baselineMeta?.platform,
            spacecraftName: (baselineMeta?.metadata as Record<string, unknown>)?.spacecraftName as string,
            resolutionMeters:
              baselineMeta?.resolutionMeters ||
              (activeBaseline as { resolutionMeters?: number })?.resolutionMeters ||
              (activeBaseline?.pixelAreaM2 ? Math.round(Math.sqrt(activeBaseline.pixelAreaM2)) : 10),
            acquisitionDate: baselineMeta?.acquisitionDate || activeBaseline?.acquisitionDate,
            cloudCover: baselineMeta?.cloudCover,
            crs: baselineMeta?.rasterCrs || activeBaseline?.rasterCrs,
          };
          const candGeom = {
            imageId: observationMeta.imageId,
            source: observationMeta.source,
            platform: observationMeta.platform,
            spacecraftName: (observationMeta.metadata as Record<string, unknown>)?.spacecraftName as string,
            resolutionMeters: observationMeta.resolutionMeters,
            acquisitionDate: observationMeta.acquisitionDate,
            cloudCover: observationMeta.cloudCover,
            crs: observationMeta.rasterCrs,
          };

          // Centralized Optical Comparison Strategy Decision (NATIVE vs HLS)
          const baseInput = {
            ...baseGeom,
            zoneId: zoneDoc?._id?.toString(),
            monitoringTrack: MonitoringTrack.OPTICAL,
          };
          const candInput = {
            ...candGeom,
            zoneId: zoneDoc?._id?.toString(),
            monitoringTrack: MonitoringTrack.OPTICAL,
          };

          const decision = OpticalComparisonDecisionService.decideComparison(baseInput, candInput);
          if (activeBaseline && decision.mode === ComparisonMode.HLS && decision.requiresHLS) {
            console.info(
              `[ChangeDetectionService] Routing cross-sensor optical pair to HLS comparison engine (${decision.baselineHLSProduct} ↔ ${decision.currentHLSProduct})...`,
            );
            const hlsRepService = new HLSRepresentationService();
            const baseHlsResult = await hlsRepService.getOrDeriveBaselineRepresentation({
              baselineId: activeBaseline._id,
              requiredProduct: decision.baselineHLSProduct,
              zoneGeometry: boundary as GeoJSONPolygon,
              zoneCode: zoneDoc?.zoneId,
            });
            const curHlsResult = await hlsRepService.getOrDeriveObservationRepresentation({
              observationId: observationMeta._id,
              requiredProduct: decision.currentHLSProduct,
              zoneGeometry: boundary as GeoJSONPolygon,
              zoneCode: zoneDoc?.zoneId,
            });

            const hlsCompResult = await HLSComparisonService.compareHlsRepresentations({
              baselineRepresentation: baseHlsResult.representation,
              currentRepresentation: curHlsResult.representation,
              zoneBoundary: boundary as GeoJSONPolygon,
              zoneAreaHectares,
              zoneId: zoneDoc?._id,
              temporaryAreaId,
              targetCrs: 'EPSG:32643',
              persistChangeDetection: true,
            });

            if (hlsCompResult.changeDetection) {
              return hlsCompResult.changeDetection.toDto();
            }
          }

          const compat = OpticalCompatibilityService.evaluateOpticalCompatibility(baseGeom, candGeom);
          if (!compat.isCompatible) {
            console.warn(
              `[ChangeDetectionService] Incompatible Optical observation pair rejected: ${compat.reason}`,
            );
            throw new AppError(
              `Optical observations incompatible for production change detection: ${compat.reason}`,
              HTTP_STATUS.UNPROCESSABLE_ENTITY,
            );
          }

          // 1. Create canonical AnalysisGrid for the zone
          const analysisGrid = AnalysisGridService.createAnalysisGrid(boundary as GeoJSONPolygon, {
            targetCrs: activeBaseline?.rasterCrs || observationMeta.rasterCrs,
            pixelSizeMeters: 10,
          });

          // 2. Read authentic GeoTIFFs
          const baseParsed = await GeoTiffService.readGeoTiff(baselineRasterPath);
          const curParsed = await GeoTiffService.readGeoTiff(currentRasterPath);

          // 3. True Geographic Reprojection & Resampling to common analysis grid
          const baseHarmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
            baseParsed,
            analysisGrid,
            { satellite: String(baselineMeta?.source || activeBaseline?.source || 'Sentinel-2') },
          );
          const curHarmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
            curParsed,
            analysisGrid,
            { satellite: String(observationMeta.source || 'Sentinel-2') },
          );

          // 4. Valid-data multi-criteria intersection mask (baseline AND current AND quality AND zone)
          const intersection = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(
            baseHarmonized,
            curHarmonized,
            boundary as GeoJSONPolygon,
            analysisGrid,
          );

          // 5. Per-pixel spectral index calculation
          const baseIndices = OpticalPixelIndexService.calculatePixelIndices(
            baseHarmonized,
            intersection.validComparisonMask,
          );
          const curIndices = OpticalPixelIndexService.calculatePixelIndices(
            curHarmonized,
            intersection.validComparisonMask,
          );

          // 6. Pixel-level Optical change detection
          const pixelDet = OpticalPixelChangeDetector.detectPixelChange({
            baselineIndices: baseIndices.indices,
            currentIndices: curIndices.indices,
            validMask: intersection.validComparisonMask,
            grid: analysisGrid,
            zoneAreaHectares,
            thresholdConfig: DEFAULT_OPTICAL_THRESHOLD_CONFIG,
            baselineSensor: String(baselineMeta?.source || activeBaseline?.source || 'Optical'),
            currentSensor: String(observationMeta.source || 'Optical'),
            baselineScl: baseHarmonized.qa,
            canopyGuardMode: CanopyGuardShadowService.getMode(),
          });

          primarySpatialResult = pixelDet.spatialResult;
          changeIndicators = pixelDet.changeIndicators;
          categories = pixelDet.categories;
          opticalEvidence = intersection.cloudMaskedPixelCount > 0 ? 'CLOUD_DEGRADED' : 'CLEAN';
          pixelDetectionSucceeded = true;
          console.info(
            `[ChangeDetectionService] Optical pixel differencing completed: ${pixelDet.spatialResult.changedPixels} changed / ${pixelDet.spatialResult.validPixels} valid pixels (${pixelDet.spatialResult.affectedAreaPercentage}%)`,
          );
        } catch (err: unknown) {
          if (err instanceof AppError && err.statusCode === HTTP_STATUS.UNPROCESSABLE_ENTITY) {
            throw err; // Strict compatibility rejections must bubble up
          }
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.warn(`[ChangeDetectionService] Optical pixel differencing error: ${msg}. Utilizing zonal summary.`);
        }
      }

      if (!pixelDetectionSucceeded) {
        // Fallback for simulation or legacy test mock calls
        const optDet = OpticalChangeDetector.detectChange({
          currentMetrics: observationProcessed?.opticalMetrics || {
            ndvi: 0.4,
            ndwi: 0.1,
            ndbi: 0.08,
            bsi: 0.1,
            savi: 0.4,
            evi: 0.35,
          },
          baselineMetrics: baselineProcessed?.opticalMetrics || {
            ndvi: 0.45,
            ndwi: 0.1,
            ndbi: 0.05,
            bsi: 0.08,
            savi: 0.45,
            evi: 0.4,
          },
          zoneAreaHectares,
          forcedAffectedPercentage: simulationOverridePercentage,
          isRealTelemetry,
          originalCrs: activeBaseline?.originalCrs || activeBaseline?.rasterCrs,
          normalizedCrs: activeBaseline?.rasterCrs,
          areaCalculationCrs: activeBaseline?.areaCalculationCrs || activeBaseline?.rasterCrs,
          pixelAreaM2: activeBaseline?.pixelAreaM2,
        });

        primarySpatialResult = {
          ...optDet.spatialResult,
          calculationMethod: ChangeCalculationMethod.OPTICAL_ZONAL_SUMMARY,
          spatialCalculation: SpatialCalculationType.ZONAL_STATISTICS,
        };
        changeIndicators = optDet.changeIndicators;
        categories = optDet.categories;
      }

      // Check if SAR active baseline exists to evaluate cross-sensor agreement
      const activeSarBaseline = zoneId
        ? await this.baselineRepo.findActiveBaseline(zoneId, SensorType.SAR)
        : null;
      if (activeSarBaseline) {
        sarEvidence = 'AVAILABLE';
        secondarySpatialResult = {
          calculationMode: primarySpatialResult.calculationMode,
          spatialSource: primarySpatialResult.spatialSource,
          zoneArea: zoneAreaHectares,
          changedArea: primarySpatialResult.changedArea,
          affectedAreaPercentage: primarySpatialResult.affectedAreaPercentage,
          explanation: 'SAR cross-sensor reference',
        };
      }
    } else {
      // SAR Change Detection
      const baselineRasterPath =
        activeBaseline?.localRasterPath || (baselineMeta ? baselineMeta.localRasterPath : undefined);
      const currentRasterPath = observationMeta.localRasterPath;
      const boundary = zoneDoc?.boundary;

      let pixelDetectionSucceeded = false;

      if (
        simulationOverridePercentage === undefined &&
        baselineRasterPath &&
        fs.existsSync(baselineRasterPath) &&
        currentRasterPath &&
        fs.existsSync(currentRasterPath) &&
        boundary
      ) {
        try {
          console.info(
            `[ChangeDetectionService] Executing production-grade pixel-level SAR differencing for zone ${zoneName}...`,
          );

          // Centralized SAR Compatibility Verification
          const baseGeom = {
            imageId: baselineMeta?.imageId || activeBaseline?.imageId || '',
            relativeOrbitNumber: baselineMeta?.relativeOrbitNumber,
            orbitDirection: baselineMeta?.orbitDirection,
            mode: baselineMeta?.mode,
            polarizations: baselineMeta?.polarizations,
            platform: baselineMeta?.platform,
          };
          const candGeom = {
            imageId: observationMeta.imageId,
            relativeOrbitNumber: observationMeta.relativeOrbitNumber,
            orbitDirection: observationMeta.orbitDirection,
            mode: observationMeta.mode,
            polarizations: observationMeta.polarizations,
            platform: observationMeta.platform,
          };
          const compat = SarCompatibilityService.evaluateSarCompatibility(baseGeom, candGeom);
          if (!compat.isCompatible) {
            console.warn(
              `[ChangeDetectionService] Incompatible SAR observation pair rejected: ${compat.reason}`,
            );
            throw new AppError(
              `SAR observations incompatible for production change detection: ${compat.reason}`,
              HTTP_STATUS.UNPROCESSABLE_ENTITY,
            );
          }

          // 1. Create canonical AnalysisGrid for the zone
          const analysisGrid = AnalysisGridService.createAnalysisGrid(boundary as GeoJSONPolygon, {
            targetCrs: activeBaseline?.rasterCrs,
            pixelSizeMeters: 10,
          });

          // 2. Read authentic GeoTIFFs
          const baseParsed = await GeoTiffService.readGeoTiff(baselineRasterPath);
          const curParsed = await GeoTiffService.readGeoTiff(currentRasterPath);

          // 3. True Geographic Reprojection & Resampling to common analysis grid
          const baseHarmonized = SpatialHarmonizationService.reprojectSarToGrid(baseParsed, analysisGrid);
          const curHarmonized = SpatialHarmonizationService.reprojectSarToGrid(curParsed, analysisGrid);

          // 4. Valid-data intersection mask (baseline AND current AND zone)
          const intersection = SpatialHarmonizationService.createValidIntersectionMask(
            baseHarmonized,
            curHarmonized,
            boundary as GeoJSONPolygon,
            analysisGrid,
          );

          // 5. Pixel-level SAR change detection with explicit DECREASE direction
          const pixelDet = SarPixelChangeDetector.detectPixelChange({
            baselineHarmonized: baseHarmonized,
            currentHarmonized: curHarmonized,
            intersection,
            zoneAreaHectares,
            thresholdConfig: {
              changeDirection: SarChangeDirection.DECREASE,
              vvThresholdDb: 2.0,
              vhThresholdDb: 2.0,
              decisionRule: 'ANY_BAND',
            },
          });

          primarySpatialResult = pixelDet.spatialResult;
          changeIndicators = pixelDet.changeIndicators;
          categories = pixelDet.categories;
          sarEvidence = 'AVAILABLE';
          pixelDetectionSucceeded = true;
          console.info(
            `[ChangeDetectionService] Pixel differencing completed: ${pixelDet.spatialResult.changedPixels} changed / ${pixelDet.spatialResult.validPixels} valid pixels (${pixelDet.spatialResult.affectedAreaPercentage}%)`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.warn(`[ChangeDetectionService] SAR pixel differencing error: ${msg}. Utilizing zonal summary.`);
        }
      }

      if (!pixelDetectionSucceeded) {
        const sarDet = SarChangeDetector.detectChange({
          currentMetrics: observationProcessed?.sarMetrics || {
            vv: -11.5,
            vh: -18.2,
            vvVhRatio: 6.7,
          },
          baselineMetrics: baselineProcessed?.sarMetrics || {
            vv: -12.0,
            vh: -18.0,
            vvVhRatio: 6.0,
          },
          zoneAreaHectares,
          forcedAffectedPercentage: simulationOverridePercentage,
          isRealTelemetry,
        });

        primarySpatialResult = {
          ...sarDet.spatialResult,
          calculationMethod: ChangeCalculationMethod.SAR_ZONAL_SUMMARY,
          spatialCalculation: SpatialCalculationType.ZONAL_STATISTICS,
        };
        changeIndicators = sarDet.changeIndicators;
        categories = sarDet.categories;
        sarEvidence = 'AVAILABLE';
      }
    }

    // 7. Retrieve historical changes for zone temporal consistency analysis
    const historicalChanges = zoneId ? await this.changeRepo.findByZoneId(zoneId, 10) : [];

    // 8. Run Evidence Fusion Engine
    const imageQuality = observationProcessed?.qualityMetrics.imageQuality || 85.0;
    const fusion = EvidenceFusionEngine.evaluateFusion({
      zoneName,
      zoneIdStr: zoneIdentifier,
      primarySensorType: effectiveSensorType,
      primarySpatialResult,
      secondarySpatialResult,
      imageQualityScore: imageQuality,
      categories,
      historicalChanges,
      isCloudFallbackTriggered: isCloudFallback,
      cloudCover: observationMeta.cloudCover,
    });

    const changeId = `CHG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const changeObjectId = new Types.ObjectId();

    let alertDoc: IAlert | null = null;

    // 9. If thresholds are crossed, generate exactly ONE Alert
    if (fusion.shouldGenerateAlert) {
      const alertId = `ALT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const evidenceSources = [effectiveSensorType];
      if (secondarySpatialResult) {
        evidenceSources.push(
          effectiveSensorType === SensorType.OPTICAL ? SensorType.SAR : SensorType.OPTICAL,
        );
      }

      alertDoc = await this.alertRepo.create(
        {
          alertId,
          zoneId: zoneId && Types.ObjectId.isValid(zoneId) ? new Types.ObjectId(zoneId) : undefined,
          temporaryAreaId,
          changeDetectionId: changeObjectId,
          detectedAt: observationMeta.acquisitionDate,
          affectedAreaPercentage: primarySpatialResult.affectedAreaPercentage,
          highestThresholdCrossed: fusion.highestThresholdCrossed,
          thresholdsCrossed: fusion.thresholdsCrossed,
          severity: fusion.severity as AlertSeverity,
          evidenceStrength: fusion.evidenceStrength,
          calculationMode: primarySpatialResult.calculationMode,
          sensorType: effectiveSensorType,
          monitoringTrack:
            effectiveSensorType === SensorType.SAR
              ? MonitoringTrack.SAR
              : MonitoringTrack.OPTICAL,
          evidenceSources,
          categories,
          explanation: fusion.explanation,
          status: AlertStatus.OPEN,
        },
        { allowPreallocatedChangeId: true },
      );
    }

    // 10. Persist ChangeDetection record
    let changeDoc;
    if (request.forceRecalculate && effectiveBaselineOrRefId) {
      const existing = await this.changeRepo.findByObservationAndBaseline(
        zoneId,
        observationId,
        effectiveBaselineOrRefId,
        temporaryAreaId,
        primarySpatialResult.calculationMethod,
      );
      if (existing) {
        Object.assign(existing, {
          detectedAt: observationMeta.acquisitionDate,
          zoneArea: primarySpatialResult.zoneArea,
          changedArea: primarySpatialResult.changedArea,
          affectedAreaPercentage: primarySpatialResult.affectedAreaPercentage,
          calculationMode: primarySpatialResult.calculationMode,
          spatialSource: primarySpatialResult.spatialSource,
          calculationMethod: primarySpatialResult.calculationMethod,
          spatialCalculation: primarySpatialResult.spatialCalculation,
          analysisGrid: primarySpatialResult.analysisGrid,
          thresholdConfig: primarySpatialResult.thresholdConfig,
          rasterStatistics: primarySpatialResult.rasterStatistics,
          changedGeometry: primarySpatialResult.changedGeometry,
          threshold2Crossed: fusion.threshold2Crossed,
          threshold5Crossed: fusion.threshold5Crossed,
          threshold10Crossed: fusion.threshold10Crossed,
          highestThresholdCrossed: fusion.highestThresholdCrossed,
          severity: fusion.severity,
          evidenceStrength: fusion.evidenceStrength,
          evidenceBreakdown: fusion.evidenceBreakdown,
          categories,
          changeIndicators,
          opticalEvidence,
          sarEvidence,
          crossSensorAgreement: fusion.crossSensorAgreement,
          temporalConsistency: fusion.temporalConsistency,
          explanation: fusion.explanation,
          alertGenerated: fusion.shouldGenerateAlert,
          alertId: alertDoc ? alertDoc._id : undefined,
        });
        changeDoc = await existing.save();
      }
    }

    if (!changeDoc) {
      changeDoc = await this.changeRepo.create({
        _id: changeObjectId,
        changeId,
        zoneId: zoneId && Types.ObjectId.isValid(zoneId) ? new Types.ObjectId(zoneId) : undefined,
        temporaryAreaId,
        observationId: observationMeta._id,
        baselineId: activeBaseline ? activeBaseline._id : undefined,
        referenceObservationId: referenceObservationMeta ? referenceObservationMeta._id : undefined,
        sensorType: effectiveSensorType,
        monitoringTrack:
          effectiveSensorType === SensorType.SAR
            ? MonitoringTrack.SAR
            : MonitoringTrack.OPTICAL,
        source: observationMeta.source,
        detectedAt: observationMeta.acquisitionDate,
        zoneArea: primarySpatialResult.zoneArea,
        changedArea: primarySpatialResult.changedArea,
        affectedAreaPercentage: primarySpatialResult.affectedAreaPercentage,
        calculationMode: primarySpatialResult.calculationMode,
        spatialSource: primarySpatialResult.spatialSource,
        calculationMethod: primarySpatialResult.calculationMethod,
        spatialCalculation: primarySpatialResult.spatialCalculation,
        analysisGrid: primarySpatialResult.analysisGrid,
        thresholdConfig: primarySpatialResult.thresholdConfig,
        rasterStatistics: primarySpatialResult.rasterStatistics,
        changedGeometry: primarySpatialResult.changedGeometry,
        threshold2Crossed: fusion.threshold2Crossed,
        threshold5Crossed: fusion.threshold5Crossed,
        threshold10Crossed: fusion.threshold10Crossed,
        highestThresholdCrossed: fusion.highestThresholdCrossed,
        severity: fusion.severity,
        evidenceStrength: fusion.evidenceStrength,
        evidenceBreakdown: fusion.evidenceBreakdown,
        categories,
        changeIndicators,
        opticalEvidence,
        sarEvidence,
        crossSensorAgreement: fusion.crossSensorAgreement,
        temporalConsistency: fusion.temporalConsistency,
        explanation: fusion.explanation,
        alertGenerated: fusion.shouldGenerateAlert,
        alertId: alertDoc ? alertDoc._id : undefined,
        shadowTelemetry: primarySpatialResult.shadowTelemetry,
        preScreenedAreaHa: primarySpatialResult.preScreenedAreaHa,
      });
    }

    return changeDoc.toDto();
  }

  /**
   * Resolves the immutable baseline and current observation comparison metadata
   * strictly referenced by this specific ChangeDetection event.
   */
  async getComparisonMetadata(id: string) {
    const change =
      (await this.changeRepo.findById(id)) || (await this.changeRepo.findByChangeId(id));
    if (!change) {
      throw new AppError(`Change detection record not found: ${id}`, HTTP_STATUS.NOT_FOUND);
    }

    // 1. Resolve Current Observation strictly from change.observationId
    const currentMeta = await this.satelliteRepo.findById(change.observationId.toString());
    if (!currentMeta) {
      throw new AppError(
        `Current observation metadata (${change.observationId}) referenced by change ${change.changeId} not found`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // 2. Resolve Baseline strictly from change.baselineId or change.referenceObservationId
    let baselineMeta = null;
    let baselineDoc = null;
    if (change.baselineId) {
      baselineDoc = await this.baselineRepo.findById(change.baselineId.toString());
      if (baselineDoc?.satelliteMetadataId) {
        baselineMeta = await this.satelliteRepo.findById(baselineDoc.satelliteMetadataId.toString());
      }
    } else if (change.referenceObservationId) {
      baselineMeta = await this.satelliteRepo.findById(change.referenceObservationId.toString());
    }

    if (!baselineMeta) {
      throw new AppError(
        `Baseline reference (${change.baselineId || change.referenceObservationId}) referenced by change ${change.changeId} not found`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // 3. Resolve Zone strictly from change.zoneId
    const zone = change.zoneId ? await this.zoneRepo.findById(change.zoneId.toString()) : null;

    // 4. Resolve Processed Image Results strictly for these two specific metadata IDs
    const currentProcessed = await this.processedResultRepo.findBySatelliteMetadataId(
      currentMeta._id.toString(),
    );
    const baselineProcessed = await this.processedResultRepo.findBySatelliteMetadataId(
      baselineMeta._id.toString(),
    );

    // 5. Calculate temporal observation gap
    const baseDate = new Date(baselineMeta.acquisitionDate);
    const currDate = new Date(currentMeta.acquisitionDate);
    const gapMs = Math.abs(currDate.getTime() - baseDate.getTime());
    const gapDays = Math.round(gapMs / (1000 * 60 * 60 * 24));

    const years = Math.floor(gapDays / 365.25);
    const remainingDaysAfterYears = gapDays - Math.floor(years * 365.25);
    const months = Math.floor(remainingDaysAfterYears / 30.44);
    const days = Math.round(remainingDaysAfterYears - Math.floor(months * 30.44));
    const gapFormatted =
      years > 0
        ? `${gapDays.toLocaleString()} days (${years} years, ${months} months, ${days} days)`
        : `${gapDays.toLocaleString()} days (${months} months, ${days} days)`;

    // Check raster file availability on disk without leaking paths
    const baselineRasterPath = baselineDoc?.localRasterPath || baselineMeta.localRasterPath;
    const currentRasterPath = currentMeta.localRasterPath;

    const baselineRasterExists = Boolean(baselineRasterPath && fs.existsSync(baselineRasterPath));
    const currentRasterExists = Boolean(currentRasterPath && fs.existsSync(currentRasterPath));

    return {
      changeId: change.changeId,
      zoneId: change.zoneId ? change.zoneId.toString() : undefined,
      zoneName: zone?.name || 'Protected Area',
      zoneCode: zone?.zoneId || 'ZONE-UNKNOWN',
      zoneBoundary: zone?.boundary,
      detectionDate: change.detectedAt,
      calculationMode: change.calculationMode,
      spatialSource: change.spatialSource,
      calculationMethod: change.calculationMethod,
      spatialCalculation: change.spatialCalculation,
      analysisGrid: change.analysisGrid,
      thresholdConfig: change.thresholdConfig,
      rasterStatistics: change.rasterStatistics,
      auditStatus: change.auditStatus,
      changedGeometry: change.changedGeometry,
      affectedAreaPercentage: change.affectedAreaPercentage,
      changedArea: change.changedArea,
      zoneArea: change.zoneArea,
      severity: change.severity,
      evidenceStrength: change.evidenceStrength,
      evidenceBreakdown: change.evidenceBreakdown,
      categories: change.categories,
      spectralDeltas: change.changeIndicators,
      crossSensorAgreement: change.crossSensorAgreement,
      temporalConsistency: change.temporalConsistency,
      explanation: change.explanation,
      alertGenerated: change.alertGenerated,
      temporalGap: {
        days: gapDays,
        formatted: gapFormatted,
      },
      baseline: {
        id: baselineMeta._id.toString(),
        imageId: baselineMeta.imageId,
        acquisitionDate: baselineMeta.acquisitionDate,
        acquisitionTimeUtc: baseDate.toISOString(),
        sensor: baselineMeta.sensorType || 'OPTICAL',
        source: baselineMeta.source,
        spacecraftName:
          baselineMeta.source === 'SENTINEL_1'
            ? 'Sentinel-1A (SAR)'
            : (baselineMeta.metadata as Record<string, unknown>)?.spacecraftName ||
              (baselineMeta.source === 'SENTINEL_2' ? 'Sentinel-2A' : baselineMeta.source),
        platform: baselineMeta.platform,
        mode: baselineMeta.mode,
        polarizations: baselineMeta.polarizations,
        orbitDirection: baselineMeta.orbitDirection,
        absoluteOrbitNumber: baselineMeta.absoluteOrbitNumber,
        relativeOrbitNumber: baselineMeta.relativeOrbitNumber,
        cloudCover: baselineMeta.cloudCover,
        crs: baselineMeta.areaCalculationCrs || baselineMeta.rasterCrs || 'EPSG:32643',
        resolutionMeters: baselineMeta.resolutionMeters || 10,
        pixelAreaM2: baselineMeta.pixelAreaM2 || 100,
        width: baselineMeta.rasterWidth || 492,
        height: baselineMeta.rasterHeight || 388,
        rasterAvailable: baselineRasterExists,
        hasLocalRaster: baselineRasterExists,
        geeExportTaskId: baselineMeta.geeExportTaskId ? 'COMPLETED' : undefined,
        driveFileId: baselineMeta.driveFileId ? 'AVAILABLE' : undefined,
        spectralIndices: baselineProcessed?.opticalMetrics,
      },
      current: {
        id: currentMeta._id.toString(),
        imageId: currentMeta.imageId,
        acquisitionDate: currentMeta.acquisitionDate,
        acquisitionTimeUtc: currDate.toISOString(),
        sensor: currentMeta.sensorType || 'OPTICAL',
        source: currentMeta.source,
        spacecraftName:
          currentMeta.source === 'SENTINEL_1'
            ? 'Sentinel-1A (SAR)'
            : (currentMeta.metadata as Record<string, unknown>)?.spacecraftName ||
              (currentMeta.source === 'SENTINEL_2' ? 'Sentinel-2B' : currentMeta.source),
        platform: currentMeta.platform,
        mode: currentMeta.mode,
        polarizations: currentMeta.polarizations,
        orbitDirection: currentMeta.orbitDirection,
        absoluteOrbitNumber: currentMeta.absoluteOrbitNumber,
        relativeOrbitNumber: currentMeta.relativeOrbitNumber,
        cloudCover: currentMeta.cloudCover,
        crs: currentMeta.areaCalculationCrs || currentMeta.rasterCrs || 'EPSG:32643',
        resolutionMeters: currentMeta.resolutionMeters || 10,
        pixelAreaM2: currentMeta.pixelAreaM2 || 100,
        width: currentMeta.rasterWidth || 492,
        height: currentMeta.rasterHeight || 388,
        rasterAvailable: currentRasterExists,
        hasLocalRaster: currentRasterExists,
        geeExportTaskId: currentMeta.geeExportTaskId ? 'COMPLETED' : undefined,
        driveFileId: currentMeta.driveFileId ? 'AVAILABLE' : undefined,
        spectralIndices: currentProcessed?.opticalMetrics,
      },
    };
  }

  /**
   * Serves authentic image PNG buffer rendered directly from the baseline raster
   * strictly associated with this ChangeDetection event.
   * Automatically selects SAR backscatter rendering (dB stretch) for Sentinel-1 / SAR rasters.
   */
  async getBaselineImageBuffer(id: string, band?: 'VV' | 'VH'): Promise<Buffer> {
    const change =
      (await this.changeRepo.findById(id)) || (await this.changeRepo.findByChangeId(id));
    if (!change) {
      throw new AppError(`Change detection record not found: ${id}`, HTTP_STATUS.NOT_FOUND);
    }

    let baselineMeta = null;
    let baselineDoc = null;
    if (change.baselineId) {
      baselineDoc = await this.baselineRepo.findById(change.baselineId.toString());
      if (baselineDoc?.satelliteMetadataId) {
        baselineMeta = await this.satelliteRepo.findById(baselineDoc.satelliteMetadataId.toString());
      }
    } else if (change.referenceObservationId) {
      baselineMeta = await this.satelliteRepo.findById(change.referenceObservationId.toString());
    }

    if (!baselineMeta) {
      throw new AppError(
        `Baseline metadata referenced by change ${change.changeId} not found`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const rasterPath = baselineDoc?.localRasterPath || baselineMeta.localRasterPath;
    if (!rasterPath || !fs.existsSync(rasterPath)) {
      throw new AppError(
        `Baseline satellite raster is currently unavailable for ${baselineMeta.imageId}`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const cacheKey = `baseline:${change.changeId}:${rasterPath}:${band || 'default'}`;
    const cached = ChangeDetectionService.imageBufferCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const isSar =
      change.sensorType === SensorType.SAR ||
      baselineMeta.sensorType === 'SAR' ||
      baselineMeta.source === 'SENTINEL_1';

    let buffer: Buffer;
    if (isSar) {
      if (change.analysisGrid) {
        // Render on Canonical Analysis Grid for pixel-perfect geospatial registration
        const parsed = await GeoTiffService.readGeoTiff(rasterPath);
        const harmonized = SpatialHarmonizationService.reprojectSarToGrid(parsed, change.analysisGrid);
        const data = band === 'VH' ? harmonized.vh : harmonized.vv;
        buffer = await GeoTiffService.encodeSarGridToPng(
          data,
          harmonized.validMask,
          change.analysisGrid.width,
          change.analysisGrid.height,
        );
      } else {
        buffer = await GeoTiffService.renderSarPng(rasterPath, {
          band: band || 'VV',
        });
      }
    } else if (change.analysisGrid) {
      // Render on Canonical Analysis Grid for pixel-perfect geospatial registration
      const parsed = await GeoTiffService.readGeoTiff(rasterPath);
      const harmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
        parsed,
        change.analysisGrid,
        { satellite: baselineMeta.source },
      );
      buffer = GeoTiffService.encodeOpticalGridToPng(
        harmonized.red,
        harmonized.green,
        harmonized.blue,
        harmonized.footprintMask,
        change.analysisGrid.width,
        change.analysisGrid.height,
        { satellite: baselineMeta.source },
      );
    } else {
      buffer = await GeoTiffService.renderTrueColorPng(rasterPath, {
        satellite: baselineMeta.source,
      });
    }

    ChangeDetectionService.imageBufferCache.set(cacheKey, buffer);
    return buffer;
  }

  /**
   * Serves authentic image PNG buffer rendered directly from the current observation raster
   * strictly associated with this ChangeDetection event.
   * Automatically selects SAR backscatter rendering (dB stretch) for Sentinel-1 / SAR rasters.
   */
  async getCurrentImageBuffer(id: string, band?: 'VV' | 'VH'): Promise<Buffer> {
    const change =
      (await this.changeRepo.findById(id)) || (await this.changeRepo.findByChangeId(id));
    if (!change) {
      throw new AppError(`Change detection record not found: ${id}`, HTTP_STATUS.NOT_FOUND);
    }

    const currentMeta = await this.satelliteRepo.findById(change.observationId.toString());
    if (!currentMeta) {
      throw new AppError(
        `Current observation metadata referenced by change ${change.changeId} not found`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const rasterPath = currentMeta.localRasterPath;
    if (!rasterPath || !fs.existsSync(rasterPath)) {
      throw new AppError(
        `Current satellite raster is currently unavailable for ${currentMeta.imageId}`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const cacheKey = `current:${change.changeId}:${rasterPath}:${band || 'default'}`;
    const cached = ChangeDetectionService.imageBufferCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const isSar =
      change.sensorType === SensorType.SAR ||
      currentMeta.sensorType === 'SAR' ||
      currentMeta.source === 'SENTINEL_1';

    let buffer: Buffer;
    if (isSar) {
      if (change.analysisGrid) {
        // Render on Canonical Analysis Grid for pixel-perfect geospatial registration
        const parsed = await GeoTiffService.readGeoTiff(rasterPath);
        const harmonized = SpatialHarmonizationService.reprojectSarToGrid(parsed, change.analysisGrid);
        const data = band === 'VH' ? harmonized.vh : harmonized.vv;
        buffer = await GeoTiffService.encodeSarGridToPng(
          data,
          harmonized.validMask,
          change.analysisGrid.width,
          change.analysisGrid.height,
        );
      } else {
        buffer = await GeoTiffService.renderSarPng(rasterPath, {
          band: band || 'VV',
        });
      }
    } else if (change.analysisGrid) {
      // Render on Canonical Analysis Grid for pixel-perfect geospatial registration
      const parsed = await GeoTiffService.readGeoTiff(rasterPath);
      const harmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
        parsed,
        change.analysisGrid,
        { satellite: currentMeta.source },
      );
      buffer = GeoTiffService.encodeOpticalGridToPng(
        harmonized.red,
        harmonized.green,
        harmonized.blue,
        harmonized.footprintMask,
        change.analysisGrid.width,
        change.analysisGrid.height,
        { satellite: currentMeta.source },
      );
    } else {
      buffer = await GeoTiffService.renderTrueColorPng(rasterPath, {
        satellite: currentMeta.source,
      });
    }

    ChangeDetectionService.imageBufferCache.set(cacheKey, buffer);
    return buffer;
  }
}
