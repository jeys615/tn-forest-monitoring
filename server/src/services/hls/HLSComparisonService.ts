import fs from 'node:fs';
import { Types } from 'mongoose';
import {
  SensorType,
  SatelliteSource,
  MonitoringTrack,
  ProcessingMode,
  SpatialCalculationSource,
  ChangeCalculationMethod,
  SpatialCalculationType,
  ComparisonMode,
  CrossSensorAgreement,
  ChangeCategory,
  AlertSeverity,
  type AnalysisGridDto,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type ChangeIndicatorDeltas,
  type OpticalRasterStatisticsDto,
  type OpticalThresholdConfigDto,
  type HLSRepresentationDto,
  type HlsChangeDetectionResult,
} from '@tn-forest/shared/types';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { GeoTiffService, type ParsedGeoTiffRaster } from '../raster/GeoTiffService.js';
import {
  OpticalSpatialHarmonizationService,
  type HarmonizedOpticalRaster,
  type ValidOpticalIntersectionResult,
} from '../spatial/OpticalSpatialHarmonizationService.js';
import {
  OpticalPixelIndexService,
  type OpticalSpectralIndices,
} from '../spatial/OpticalPixelIndexService.js';
import {
  OpticalPixelChangeDetector,
  type OpticalPixelChangeResult,
} from '../changeDetection/OpticalPixelChangeDetector.js';
import {
  ChangeDetectionModel,
  type IChangeDetection,
} from '../../models/ChangeDetection.js';
import type { IHLSRepresentation } from '../../models/HLSRepresentation.js';
import { HlsChangeDetector } from './HlsChangeDetector.js';

export interface HLSComparisonInput {
  baselineRepresentation: IHLSRepresentation | HLSRepresentationDto;
  currentRepresentation: IHLSRepresentation | HLSRepresentationDto;
  zoneBoundary: GeoJSONPolygon;
  zoneAreaHectares?: number;
  zoneId?: string | Types.ObjectId;
  temporaryAreaId?: string;
  targetCrs?: string;
  thresholdConfig?: Partial<OpticalThresholdConfigDto>;
  persistChangeDetection?: boolean;
}

export interface HLSComparisonMetrics {
  totalGridPixels: number;
  zonePixels: number;
  baselineValidPixels: number;
  currentValidPixels: number;
  overlapPixels: number;
  qaMaskedPixels: number;
  validComparisonPixels: number;
  coveragePercentage: number;
  changedPixels: number;
  decreasePixels: number;
  increasePixels: number;
  stablePixels: number;
  changedAreaM2: number;
  changedAreaHectares: number;
  affectedAreaPercentage: number;
  meanDeltaNdvi: number;
  medianDeltaNdvi: number;
  stdDeltaNdvi: number;
  pixelAreaM2: number;
}

export interface HLSComparisonResult {
  metrics: HLSComparisonMetrics;
  grid: AnalysisGridDto;
  baselineHarmonized: HarmonizedOpticalRaster;
  currentHarmonized: HarmonizedOpticalRaster;
  baselineIndices: OpticalSpectralIndices;
  currentIndices: OpticalSpectralIndices;
  validMask: Uint8Array;
  changedMask: Uint8Array;
  changedGeometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
  changeIndicators: ChangeIndicatorDeltas;
  categories: ChangeCategory[];
  rasterStatistics: OpticalRasterStatisticsDto;
  thresholdConfig: OpticalThresholdConfigDto;
  changeDetection?: IChangeDetection;
  hlsChangeResult?: HlsChangeDetectionResult;
  lineage: {
    comparisonMode: ComparisonMode;
    baselineHlsRepresentationId: string;
    currentHlsRepresentationId: string;
    baselineHlsImageId: string;
    currentHlsImageId: string;
    baselineProduct: string;
    currentProduct: string;
    hlsVersion: string;
    processingVersion: string;
    gridCrs: string;
    gridResolutionMeters: number;
    pixelAreaM2: number;
  };
}

/**
 * Production-grade HLS Cross-Sensor Spatial Comparison Engine.
 *
 * Implements authoritative optical cross-sensor comparison:
 * 1. Resampling source S30 and L30 HLS rasters to a shared canonical 30m analysis grid.
 * 2. Continuous bilinear resampling for surface reflectance bands; categorical nearest-neighbor for Fmask QA.
 * 3. 5-way valid intersection masking (baseline footprint & current footprint & baseline QA & current QA & zone boundary).
 * 4. Harmonized surface reflectance scaling (0.0001) and standardized spectral indices (NDVI, NDWI, etc.).
 * 5. Differential pixel analysis (deltaNDVI = currentNDVI - baselineNDVI) with forest canopy loss rules.
 * 6. Physical ground area strictly derived as changedPixels * 900 m2 / 10000.
 * 7. Lineage tracking and optional ChangeDetection record persistence with comparisonMode: HLS.
 */
export class HLSComparisonService {
  /**
   * Executes cross-sensor spatial comparison between two READY HLS representations.
   */
  public static async compareHlsRepresentations(
    input: HLSComparisonInput,
  ): Promise<HLSComparisonResult> {
    const {
      baselineRepresentation: baseRep,
      currentRepresentation: curRep,
      zoneBoundary,
      zoneAreaHectares: inputZoneArea,
      zoneId,
      temporaryAreaId,
      targetCrs = 'EPSG:32643',
      thresholdConfig,
      persistChangeDetection = false,
    } = input;

    // 1. Validate representations
    if (!baseRep || !curRep) {
      throw new AppError('Both baseline and current HLS representations are required for comparison', HTTP_STATUS.BAD_REQUEST);
    }

    const getRepId = (rep: IHLSRepresentation | HLSRepresentationDto): string =>
      ('_id' in rep && rep._id ? rep._id.toString() : 'id' in rep && rep.id ? rep.id.toString() : '');

    const baseRepId = getRepId(baseRep);
    const curRepId = getRepId(curRep);

    if (baseRep.status !== 'READY') {
      throw new AppError(
        `Baseline HLS representation ${baseRepId} is not READY (status: ${baseRep.status})`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    if (curRep.status !== 'READY') {
      throw new AppError(
        `Current HLS representation ${curRepId} is not READY (status: ${curRep.status})`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    // 2. Reject SAR representations
    if (baseRep.sourceSensorType === SensorType.SAR || curRep.sourceSensorType === SensorType.SAR) {
      throw new AppError(
        'SAR representations cannot be compared using HLS optical comparison engine',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (!baseRep.localRasterPath || !fs.existsSync(baseRep.localRasterPath)) {
      throw new AppError(
        `Local GeoTIFF raster not found for baseline HLS representation: ${baseRep.localRasterPath}`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    if (!curRep.localRasterPath || !fs.existsSync(curRep.localRasterPath)) {
      throw new AppError(
        `Local GeoTIFF raster not found for current HLS representation: ${curRep.localRasterPath}`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // 3. Construct canonical 30m AnalysisGrid
    const { AnalysisGridService } = await import('../spatial/AnalysisGridService.js');
    const grid: AnalysisGridDto = AnalysisGridService.createAnalysisGrid(zoneBoundary, {
      pixelSizeMeters: 30.0,
      targetCrs,
      zoneId: zoneId ? zoneId.toString() : undefined,
    });

    // 4. Load both GeoTIFF rasters
    const baselineParsed: ParsedGeoTiffRaster = await GeoTiffService.readGeoTiff(baseRep.localRasterPath);
    const currentParsed: ParsedGeoTiffRaster = await GeoTiffService.readGeoTiff(curRep.localRasterPath);

    // 5. Harmonize and resample onto common 30m grid
    // Options pass satellite with 'HLS' prefix to trigger HLS Fmask QA bitmask evaluation
    const baselineHarmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
      baselineParsed,
      grid,
      { satellite: `HLS-${baseRep.hlsProduct}` },
    );

    const currentHarmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
      currentParsed,
      grid,
      { satellite: `HLS-${curRep.hlsProduct}` },
    );

    // 6. Generate 5-way valid optical intersection mask
    const intersection: ValidOpticalIntersectionResult =
      OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(
        baselineHarmonized,
        currentHarmonized,
        zoneBoundary,
        grid,
      );

    if (intersection.comparisonPixelCount === 0) {
      throw new AppError(
        'Zero valid overlapping comparison pixels between baseline and current HLS rasters within zone boundary',
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    // 7. Calculate pixel-level spectral indices
    const baselineIndicesResult = OpticalPixelIndexService.calculatePixelIndices(
      baselineHarmonized,
      intersection.validComparisonMask,
    );

    const currentIndicesResult = OpticalPixelIndexService.calculatePixelIndices(
      currentHarmonized,
      intersection.validComparisonMask,
    );

    // 8. Derive zone area
    const pixelScaleX = grid.pixelSizeX || 30.0;
    const pixelScaleY = grid.pixelSizeY || 30.0;
    const pixelAreaM2 = Number((pixelScaleX * pixelScaleY).toFixed(4)); // 900.0 m2

    const derivedZoneAreaHa =
      inputZoneArea && inputZoneArea > 0
        ? inputZoneArea
        : Number(((intersection.zonePixelCount * pixelAreaM2) / 10000.0).toFixed(4));

    // 9. Execute per-pixel change detection via authoritative HlsChangeDetector and OpticalPixelChangeDetector
    const hlsChange: HlsChangeDetectionResult = HlsChangeDetector.detectChange({
      baselineIndices: baselineIndicesResult.indices,
      currentIndices: currentIndicesResult.indices,
      validMask: intersection.validComparisonMask,
      grid,
      zoneAreaHectares: derivedZoneAreaHa,
      threshold: thresholdConfig?.ndviThreshold ?? -0.15,
      baselineSensor: `HLS-${baseRep.hlsProduct}`,
      currentSensor: `HLS-${curRep.hlsProduct}`,
      qaPolicy: 'FMASK_4X_CLEAR_ONLY',
      bandpassVersion: baseRep.bandpassVersion || 'HLS_V2.0_CLAVERIE_2018',
      brdfVersion: baseRep.brdfVersion || 'HLS_V2.0_RTLSR_CFACTOR',
    });

    const pixelChange: OpticalPixelChangeResult = OpticalPixelChangeDetector.detectPixelChange({
      baselineIndices: baselineIndicesResult.indices,
      currentIndices: currentIndicesResult.indices,
      validMask: intersection.validComparisonMask,
      grid,
      zoneAreaHectares: derivedZoneAreaHa,
      thresholdConfig,
      baselineSensor: `HLS-${baseRep.hlsProduct}`,
      currentSensor: `HLS-${curRep.hlsProduct}`,
    });

    // 10. Extract metrics
    const qaMaskedPixels =
      intersection.zonePixelCount - intersection.comparisonPixelCount > 0
        ? intersection.zonePixelCount - intersection.comparisonPixelCount
        : 0;

    const changedAreaM2 = Number((pixelChange.rasterStatistics.changedPixelCount * pixelAreaM2).toFixed(4));
    const changedAreaHectares = Number((changedAreaM2 / 10000.0).toFixed(4));

    const metrics: HLSComparisonMetrics = {
      totalGridPixels: grid.width * grid.height,
      zonePixels: intersection.zonePixelCount,
      baselineValidPixels: intersection.validBaselinePixelCount,
      currentValidPixels: intersection.validCurrentPixelCount,
      overlapPixels: intersection.overlapPixelCount,
      qaMaskedPixels,
      validComparisonPixels: intersection.comparisonPixelCount,
      coveragePercentage: intersection.coveragePercentage,
      changedPixels: pixelChange.rasterStatistics.changedPixelCount,
      decreasePixels: pixelChange.rasterStatistics.decreasePixelCount,
      increasePixels: pixelChange.rasterStatistics.increasePixelCount,
      stablePixels: pixelChange.rasterStatistics.stablePixelCount,
      changedAreaM2,
      changedAreaHectares,
      affectedAreaPercentage: pixelChange.spatialResult.affectedAreaPercentage,
      meanDeltaNdvi: pixelChange.rasterStatistics.meanDeltaNdvi,
      medianDeltaNdvi: pixelChange.rasterStatistics.medianDeltaNdvi,
      stdDeltaNdvi: pixelChange.rasterStatistics.stdDeltaNdvi,
      pixelAreaM2,
    };

    const baseRepIdStr = baseRepId;
    const curRepIdStr = curRepId;

    const lineage = {
      comparisonMode: ComparisonMode.HLS,
      baselineHlsRepresentationId: baseRepIdStr,
      currentHlsRepresentationId: curRepIdStr,
      baselineHlsImageId: baseRep.geeImageId || '',
      currentHlsImageId: curRep.geeImageId || '',
      baselineProduct: baseRep.hlsProduct,
      currentProduct: curRep.hlsProduct,
      hlsVersion: baseRep.hlsVersion || 'v002',
      processingVersion: baseRep.processingVersion || 'v2.0',
      gridCrs: grid.crs,
      gridResolutionMeters: pixelScaleX,
      pixelAreaM2,
    };

    let persistedChangeDetection: IChangeDetection | undefined;

    // 11. Optionally persist ChangeDetection record
    if (persistChangeDetection) {
      const changeId = `CD-HLS-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      const rawObsId =
        curRep.satelliteMetadataId ||
        (curRep as any).observationId ||
        baseRep.satelliteMetadataId;
      const observationObjectId =
        rawObsId && Types.ObjectId.isValid(rawObsId.toString())
          ? new Types.ObjectId(rawObsId.toString())
          : new Types.ObjectId();

      const rawBaseId = baseRep.baselineId || curRep.baselineId;
      const baselineObjectId =
        rawBaseId && Types.ObjectId.isValid(rawBaseId.toString())
          ? new Types.ObjectId(rawBaseId.toString())
          : undefined;

      const validZoneId =
        zoneId && Types.ObjectId.isValid(zoneId.toString())
          ? new Types.ObjectId(zoneId.toString())
          : undefined;

      const validBaseRepId =
        baseRepIdStr && Types.ObjectId.isValid(baseRepIdStr)
          ? new Types.ObjectId(baseRepIdStr)
          : undefined;

      const validCurRepId =
        curRepIdStr && Types.ObjectId.isValid(curRepIdStr)
          ? new Types.ObjectId(curRepIdStr)
          : undefined;

      const threshold2 = metrics.affectedAreaPercentage >= 2.0;
      const threshold5 = metrics.affectedAreaPercentage >= 5.0;
      const threshold10 = metrics.affectedAreaPercentage >= 10.0;
      const highestThreshold = threshold10 ? 10 : threshold5 ? 5 : threshold2 ? 2 : 0;
      const evaluatedSeverity = threshold10
        ? AlertSeverity.HIGH
        : threshold5
          ? AlertSeverity.MEDIUM
          : threshold2
            ? AlertSeverity.LOW
            : 'NONE';

      // Idempotency: Reuse existing ChangeDetection if already computed for this tuple
      const existingChange = await ChangeDetectionModel.findOne({
        zoneId: validZoneId,
        observationId: observationObjectId,
        baselineId: baselineObjectId,
        calculationMethod: ChangeCalculationMethod.OPTICAL_PIXEL_DIFFERENCE,
      }).exec();

      if (existingChange) {
        let needsSave = false;
        if (existingChange.severity === 'NONE' && evaluatedSeverity !== 'NONE') {
          existingChange.severity = evaluatedSeverity as any;
          needsSave = true;
        }
        if (!existingChange.changedGeometry && pixelChange.spatialResult.changedGeometry) {
          existingChange.changedGeometry = pixelChange.spatialResult.changedGeometry;
          needsSave = true;
        }
        if (needsSave) {
          await existingChange.save();
        }
        persistedChangeDetection = existingChange;
      } else {
        const changeDoc = new ChangeDetectionModel({
          changeId,
          zoneId: validZoneId,
          temporaryAreaId,
          observationId: observationObjectId,
          baselineId: baselineObjectId,
          sensorType: SensorType.OPTICAL,
          monitoringTrack: MonitoringTrack.OPTICAL,
          source: curRep.sourceSatelliteSource || SatelliteSource.LANDSAT_8,
          detectedAt: curRep.sourceAcquisitionDate ? new Date(curRep.sourceAcquisitionDate) : new Date(),
          zoneArea: derivedZoneAreaHa,
          changedArea: changedAreaHectares,
          affectedAreaPercentage: metrics.affectedAreaPercentage,
          calculationMode: ProcessingMode.REAL,
          spatialSource: SpatialCalculationSource.RASTER,
          calculationMethod: ChangeCalculationMethod.OPTICAL_PIXEL_DIFFERENCE,
          spatialCalculation: SpatialCalculationType.PIXEL_GRID,
          comparisonMode: ComparisonMode.HLS,
          processingFamily: 'HLS',
          crossSensor: true,
          baselineSensor: baseRep.hlsProduct,
          currentSensor: curRep.hlsProduct,
          hlsMode: (baseRep as any).hlsMode || (curRep as any).hlsMode || 'OFFICIAL_HLS',
          qaPolicy: 'FMASK_4X_CLEAR_ONLY',
          baselineHlsRepresentationId: validBaseRepId,
          currentHlsRepresentationId: validCurRepId,
          baselineHlsImageId: baseRep.geeImageId,
          currentHlsImageId: curRep.geeImageId,
          hlsVersion: lineage.hlsVersion,
          processingVersion: lineage.processingVersion,
          analysisGrid: grid,
          thresholdConfig: pixelChange.thresholdConfig,
          rasterStatistics: pixelChange.rasterStatistics,
          changedGeometry: pixelChange.spatialResult.changedGeometry,
          threshold2Crossed: threshold2,
          threshold5Crossed: threshold5,
          threshold10Crossed: threshold10,
          highestThresholdCrossed: highestThreshold,
          severity: evaluatedSeverity,
          evidenceStrength: Math.min(100, Math.round(metrics.affectedAreaPercentage * 10)),
          evidenceBreakdown: {
            magnitudeScore: Math.min(40, Math.round(metrics.affectedAreaPercentage * 4)),
            dataQualityScore: 30,
            temporalConsistencyScore: 15,
            crossSensorScore: 15,
            totalEvidenceScore: Math.min(100, Math.round(metrics.affectedAreaPercentage * 4 + 60)),
            explanation: `HLS cross-sensor comparison: S30 baseline vs L30 current. Coverage: ${metrics.coveragePercentage}%. Valid pixels: ${metrics.validComparisonPixels}.`,
          },
          categories: pixelChange.categories.length > 0 ? pixelChange.categories : [ChangeCategory.SURFACE_CHANGE],
          changeIndicators: pixelChange.changeIndicators,
          opticalEvidence: 'CLEAN',
          crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
          temporalConsistency: 'Cross-sensor HLS harmonized temporal pair',
          explanation: pixelChange.spatialResult.explanation,
          alertGenerated: false,
        });

        persistedChangeDetection = await changeDoc.save();
      }
    }

    return {
      metrics,
      grid,
      baselineHarmonized,
      currentHarmonized,
      baselineIndices: baselineIndicesResult.indices,
      currentIndices: currentIndicesResult.indices,
      validMask: intersection.validComparisonMask,
      changedMask: pixelChange.changedMask,
      changedGeometry: pixelChange.spatialResult.changedGeometry,
      changeIndicators: pixelChange.changeIndicators,
      categories: pixelChange.categories,
      rasterStatistics: pixelChange.rasterStatistics,
      thresholdConfig: pixelChange.thresholdConfig,
      changeDetection: persistedChangeDetection,
      hlsChangeResult: hlsChange,
      lineage,
    };
  }
}
