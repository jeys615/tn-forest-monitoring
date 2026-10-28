import {
  ChangeCategory,
  ProcessingMode,
  SpatialCalculationSource,
  ChangeCalculationMethod,
  SpatialCalculationType,
  SarChangeDirection,
  type SpatialChangeResult,
  type SarThresholdConfigDto,
  type SarRasterStatisticsDto,
  type ChangeIndicatorDeltas,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';
import type { HarmonizedSarRaster, ValidDataIntersectionResult } from '../spatial/SpatialHarmonizationService.js';
import { CrsTransformService } from '../spatial/CrsTransformService.js';
import { PixelVectorizationService } from '../spatial/PixelVectorizationService.js';

export interface SarPixelDetectionResult {
  changeIndicators: ChangeIndicatorDeltas;
  categories: ChangeCategory[];
  spatialResult: SpatialChangeResult;
  isChangeDetected: boolean;
  changedMask: Uint8Array; // 1 where change detected on analysis grid, 0 otherwise
}

export interface SarPixelDetectionParams {
  baselineHarmonized: HarmonizedSarRaster;
  currentHarmonized: HarmonizedSarRaster;
  intersection: ValidDataIntersectionResult;
  zoneAreaHectares: number;
  thresholdConfig?: Partial<SarThresholdConfigDto>;
  minClusterPixels?: number; // Minimum contiguous changed pixels to form a change polygon (speckle filter, default 5)
}

/**
 * Production-grade Pixel-Level SAR Change Detector.
 * Performs true cell-by-cell raster differencing across identical canonical AnalysisGrids,
 * enforces multi-source NoData intersection masking, applies calibrated decibel thresholds,
 * and derives physically grounded changed pixel counts and spatial geometries.
 */
export class SarPixelChangeDetector {
  /**
   * Executes pixel-by-pixel SAR change detection over valid intersection pixels.
   */
  public static detectPixelChange(params: SarPixelDetectionParams): SarPixelDetectionResult {
    const {
      baselineHarmonized,
      currentHarmonized,
      intersection,
      zoneAreaHectares,
      thresholdConfig: userThresholds,
      minClusterPixels = 5,
    } = params;

    const grid = baselineHarmonized.grid;
    const { width, height, pixelSizeX, pixelSizeY, crs } = grid;
    const totalPixels = width * height;

    const thresholdConfig: SarThresholdConfigDto = {
      vvThresholdDb: userThresholds?.vvThresholdDb ?? 2.0,
      vhThresholdDb: userThresholds?.vhThresholdDb ?? 2.0,
      vvVhRatioThresholdDb: userThresholds?.vvVhRatioThresholdDb ?? 1.5,
      decisionRule: userThresholds?.decisionRule ?? 'ANY_BAND',
      changeDirection: userThresholds?.changeDirection ?? SarChangeDirection.DECREASE,
    };

    const baseVv = baselineHarmonized.vv;
    const baseVh = baselineHarmonized.vh;
    const curVv = currentHarmonized.vv;
    const curVh = currentHarmonized.vh;
    const validMask = intersection.validComparisonMask;

    const changedMask = new Uint8Array(totalPixels);

    const deltaVvVals: number[] = [];
    const deltaVhVals: number[] = [];

    let changedPixelCount = 0;
    let changedVvPixelCount = 0;
    let changedVhPixelCount = 0;
    let negativeChangePixelCount = 0;
    let positiveChangePixelCount = 0;
    let stablePixelCount = 0;

    let sumDeltaVv = 0;
    let sumDeltaVh = 0;

    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        continue; // Exclude NoData or outside zone/overlap
      }

      const dVv = curVv[i] - baseVv[i];
      const dVh = curVh[i] - baseVh[i];

      deltaVvVals.push(dVv);
      deltaVhVals.push(dVh);

      sumDeltaVv += dVv;
      sumDeltaVh += dVh;

      // Drop conditions (negative backscatter delta: current <= baseline - threshold)
      const isVvDrop = dVv <= -thresholdConfig.vvThresholdDb;
      const isVhDrop = dVh <= -thresholdConfig.vhThresholdDb;

      // Gain conditions (positive backscatter delta: current >= baseline + threshold)
      const isVvGain = dVv >= thresholdConfig.vvThresholdDb;
      const isVhGain = dVh >= thresholdConfig.vhThresholdDb;

      if (isVvDrop || isVvGain) changedVvPixelCount++;
      if (isVhDrop || isVhGain) changedVhPixelCount++;

      // Directional evaluation based on decision rule
      let isDrop = false;
      let isGain = false;

      if (thresholdConfig.decisionRule === 'BOTH_BANDS') {
        isDrop = isVvDrop && isVhDrop;
        isGain = isVvGain && isVhGain;
      } else if (thresholdConfig.decisionRule === 'COMBINED_MAGNITUDE') {
        const mag = Math.sqrt(dVv * dVv + dVh * dVh);
        const thresh = Math.sqrt(
          thresholdConfig.vvThresholdDb * thresholdConfig.vvThresholdDb +
            thresholdConfig.vhThresholdDb * thresholdConfig.vhThresholdDb,
        );
        isDrop = (dVv < 0 || dVh < 0) && mag >= thresh;
        isGain = (dVv > 0 || dVh > 0) && mag >= thresh;
      } else {
        // ANY_BAND (Default production rule)
        isDrop = isVvDrop || isVhDrop;
        isGain = isVvGain || isVhGain;
      }

      if (isDrop) {
        negativeChangePixelCount++;
      }
      if (isGain) {
        positiveChangePixelCount++;
      }
      if (!isDrop && !isGain) {
        stablePixelCount++;
      }

      // Filter active change mask according to configured changeDirection
      let isPixelChanged = false;
      const dir = thresholdConfig.changeDirection || SarChangeDirection.DECREASE;
      if (dir === SarChangeDirection.DECREASE) {
        isPixelChanged = isDrop;
      } else if (dir === SarChangeDirection.INCREASE) {
        isPixelChanged = isGain;
      } else {
        // ABSOLUTE: either drop or gain
        isPixelChanged = isDrop || isGain;
      }

      if (isPixelChanged) {
        changedMask[i] = 1;
        changedPixelCount++;
      }
    }

    const validComparisonCount = intersection.comparisonPixelCount;

    // Calculate statistical moments of deltas
    const meanDeltaVv = validComparisonCount > 0 ? sumDeltaVv / validComparisonCount : 0;
    const meanDeltaVh = validComparisonCount > 0 ? sumDeltaVh / validComparisonCount : 0;

    // Median
    deltaVvVals.sort((a, b) => a - b);
    deltaVhVals.sort((a, b) => a - b);
    const medianDeltaVv =
      deltaVvVals.length > 0 ? deltaVvVals[Math.floor(deltaVvVals.length / 2)] : 0;
    const medianDeltaVh =
      deltaVhVals.length > 0 ? deltaVhVals[Math.floor(deltaVhVals.length / 2)] : 0;

    // Standard deviation
    let varVv = 0;
    let varVh = 0;
    for (let i = 0; i < deltaVvVals.length; i++) {
      varVv += Math.pow(deltaVvVals[i] - meanDeltaVv, 2);
      varVh += Math.pow(deltaVhVals[i] - meanDeltaVh, 2);
    }
    const stdDeltaVv = deltaVvVals.length > 0 ? Math.sqrt(varVv / deltaVvVals.length) : 0;
    const stdDeltaVh = deltaVhVals.length > 0 ? Math.sqrt(varVh / deltaVhVals.length) : 0;

    // Physically grounded directional affected area percentages
    const negativeAffectedAreaPercentage =
      validComparisonCount > 0
        ? Number(((negativeChangePixelCount / validComparisonCount) * 100.0).toFixed(2))
        : 0.0;
    const positiveAffectedAreaPercentage =
      validComparisonCount > 0
        ? Number(((positiveChangePixelCount / validComparisonCount) * 100.0).toFixed(2))
        : 0.0;

    const rasterStatistics: SarRasterStatisticsDto = {
      meanDeltaVv: Number(meanDeltaVv.toFixed(3)),
      medianDeltaVv: Number(medianDeltaVv.toFixed(3)),
      stdDeltaVv: Number(stdDeltaVv.toFixed(3)),
      meanDeltaVh: Number(meanDeltaVh.toFixed(3)),
      medianDeltaVh: Number(medianDeltaVh.toFixed(3)),
      stdDeltaVh: Number(stdDeltaVh.toFixed(3)),
      changedVvPixelCount,
      changedVhPixelCount,
      combinedChangedPixelCount: changedPixelCount,
      validComparisonPixelCount: validComparisonCount,
      negativeChangePixelCount,
      positiveChangePixelCount,
      stablePixelCount,
      negativeAffectedAreaPercentage,
      positiveAffectedAreaPercentage,
    };

    // Primary disturbance criterion:
    // If changeDirection is DECREASE, affectedAreaPercentage directly measures negative backscatter drop
    const affectedAreaPercentage =
      validComparisonCount > 0
        ? Number(((changedPixelCount / validComparisonCount) * 100.0).toFixed(2))
        : 0.0;

    const pixelAreaM2 = pixelSizeX * pixelSizeY;
    const changedAreaHectares = Number(((changedPixelCount * pixelAreaM2) / 10000.0).toFixed(2));
    const isChangeDetected = affectedAreaPercentage >= 2.0;

    // Classify Change Categories:
    // "The production forest-disturbance detector must use BACKSCATTER_DROP as the primary disturbance criterion."
    // "Do not classify a positive backscatter increase as forest loss."
    const categories: ChangeCategory[] = [];
    const activeDir = thresholdConfig.changeDirection || SarChangeDirection.DECREASE;
    if (activeDir === SarChangeDirection.DECREASE) {
      if (negativeChangePixelCount > 0 && medianDeltaVh <= -1.2) {
        categories.push(ChangeCategory.SAR_STRUCTURAL_CHANGE);
      }
      if (negativeChangePixelCount > 0 && medianDeltaVv <= -1.2) {
        categories.push(ChangeCategory.VEGETATION_LOSS);
      }
      if (categories.length === 0 && changedPixelCount > 0) {
        categories.push(ChangeCategory.SAR_STRUCTURAL_CHANGE);
      }
    } else if (activeDir === SarChangeDirection.INCREASE) {
      // Positive backscatter changes are NOT forest loss (surface roughness, moisture, or structure addition)
      categories.push(ChangeCategory.SURFACE_CHANGE);
    } else {
      // ABSOLUTE mode
      if (negativeChangePixelCount > 0 && medianDeltaVh <= -1.2) {
        categories.push(ChangeCategory.SAR_STRUCTURAL_CHANGE);
      }
      if (positiveChangePixelCount > 0) {
        categories.push(ChangeCategory.SURFACE_CHANGE);
      }
      if (categories.length > 1) {
        categories.push(ChangeCategory.MIXED_CHANGE);
      }
    }
    if (categories.length === 0) {
      categories.push(changedPixelCount > 0 ? ChangeCategory.SURFACE_CHANGE : ChangeCategory.UNKNOWN_CHANGE);
    }

    const changeIndicators: ChangeIndicatorDeltas = {
      vvDelta: Number(medianDeltaVv.toFixed(2)),
      vhDelta: Number(medianDeltaVh.toFixed(2)),
      vvVhRatioDelta: Number((medianDeltaVv - medianDeltaVh).toFixed(2)),
    };

    // Vectorize significant changed pixel clusters into GeoJSON polygons
    const changedGeometry = this.vectorizeChangedPixels(
      changedMask,
      grid,
      minClusterPixels,
    );

    const spatialResult: SpatialChangeResult = {
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.RASTER,
      calculationMethod: ChangeCalculationMethod.SAR_PIXEL_DIFFERENCE,
      spatialCalculation: SpatialCalculationType.PIXEL_GRID,
      analysisGrid: {
        ...grid,
        comparisonPixelCount: validComparisonCount,
        validBaselinePixelCount: intersection.validBaselinePixelCount,
        validCurrentPixelCount: intersection.validCurrentPixelCount,
        overlapPixelCount: intersection.overlapPixelCount,
        coveragePercentage: intersection.coveragePercentage,
      },
      thresholdConfig,
      rasterStatistics,
      zoneArea: zoneAreaHectares,
      changedArea: changedAreaHectares,
      affectedAreaPercentage,
      changedPixels: changedPixelCount,
      validPixels: validComparisonCount,
      pixelAreaM2,
      originalCrs: baselineHarmonized.sourceCrs,
      normalizedCrs: crs,
      areaCalculationCrs: crs,
      changedGeometry,
      explanation: `SAR pixel-level differencing [Direction: ${thresholdConfig.changeDirection || 'DECREASE'}] detected ${changedPixelCount} changed pixels (${affectedAreaPercentage}%, ${changedAreaHectares} ha) [Drops: ${negativeChangePixelCount} px (${negativeAffectedAreaPercentage}%), Gains: ${positiveChangePixelCount} px (${positiveAffectedAreaPercentage}%), Stable: ${stablePixelCount} px] across ${validComparisonCount} valid comparison pixels (${intersection.coveragePercentage}% zone coverage) on canonical analysis grid ${grid.crs} (${grid.width}x${grid.height}, ${grid.pixelSizeX}m).`,
    };

    return {
      changeIndicators,
      categories,
      spatialResult,
      isChangeDetected,
      changedMask,
    };
  }

  /**
   * Vectorizes clusters of changed pixels into GeoJSON polygons.
   * Delegates to shared PixelVectorizationService using connected-component labeling.
   */
  private static vectorizeChangedPixels(
    changedMask: Uint8Array,
    grid: import('@tn-forest/shared/types').AnalysisGridDto,
    minClusterPixels: number,
  ): GeoJSONPolygon | GeoJSONMultiPolygon | undefined {
    return PixelVectorizationService.vectorizeChangedPixels(changedMask, grid, minClusterPixels);
  }
}
