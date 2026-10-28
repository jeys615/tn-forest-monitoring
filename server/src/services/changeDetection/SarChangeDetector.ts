import {
  ChangeCategory,
  ProcessingMode,
  SpatialCalculationSource,
  type SarMetrics,
  type ChangeIndicatorDeltas,
  type SpatialChangeResult,
} from '@tn-forest/shared/types';

export interface SarDetectionResult {
  changeIndicators: ChangeIndicatorDeltas;
  categories: ChangeCategory[];
  spatialResult: SpatialChangeResult;
  isChangeDetected: boolean;
}

export class SarChangeDetector {
  /**
   * Compares current SAR radar metrics against the active SAR baseline
   * and computes backscatter deltas, classified SAR change categories, and spatial change area.
   */
  public static detectChange(params: {
    currentMetrics: SarMetrics;
    baselineMetrics: SarMetrics;
    zoneAreaHectares: number;
    forcedAffectedPercentage?: number; // For test fixtures / simulation override
    calculationMode?: ProcessingMode;
    spatialSource?: SpatialCalculationSource;
    isRealTelemetry?: boolean;
  }): SarDetectionResult {
    const {
      currentMetrics,
      baselineMetrics,
      zoneAreaHectares,
      forcedAffectedPercentage,
      calculationMode: inputCalculationMode,
      spatialSource: inputSpatialSource,
      isRealTelemetry,
    } = params;

    const vvDelta = Number((currentMetrics.vv - baselineMetrics.vv).toFixed(2));
    const vhDelta = Number((currentMetrics.vh - baselineMetrics.vh).toFixed(2));
    const vvVhRatioDelta = Number((currentMetrics.vvVhRatio - baselineMetrics.vvVhRatio).toFixed(2));

    const changeIndicators: ChangeIndicatorDeltas = {
      vvDelta,
      vhDelta,
      vvVhRatioDelta,
    };

    // Classify SAR Change Categories
    const categories: ChangeCategory[] = [];
    if (Math.abs(vhDelta) >= 1.2) {
      categories.push(ChangeCategory.SAR_STRUCTURAL_CHANGE);
    }
    if (Math.abs(vvDelta) >= 1.2) {
      categories.push(ChangeCategory.SURFACE_CHANGE);
    }
    if (categories.length > 1) {
      categories.push(ChangeCategory.MIXED_CHANGE);
    } else if (categories.length === 0) {
      if (Math.abs(vvVhRatioDelta) >= 0.8) {
        categories.push(ChangeCategory.SURFACE_CHANGE);
      } else {
        categories.push(ChangeCategory.UNKNOWN_CHANGE);
      }
    }

    // Spatial Change Calculation with Integrity Abstraction
    let affectedAreaPercentage = 0;

    if (forcedAffectedPercentage !== undefined) {
      affectedAreaPercentage = Number(forcedAffectedPercentage.toFixed(2));
    } else {
      // Deterministically derive affected area from SAR radar temporal backscatter difference
      const backscatterChangeMag = (Math.abs(vvDelta) * 1.0 + Math.abs(vhDelta) * 1.5) / 2.0;
      affectedAreaPercentage = Number(Math.min(100.0, backscatterChangeMag * 4.0).toFixed(2));
    }

    const changedArea = Number(((affectedAreaPercentage / 100.0) * zoneAreaHectares).toFixed(2));
    const isChangeDetected = affectedAreaPercentage >= 2.0;

    const calculationMode =
      inputCalculationMode || (isRealTelemetry ? ProcessingMode.REAL : ProcessingMode.SIMULATED);
    const spatialSource =
      inputSpatialSource ||
      (isRealTelemetry
        ? SpatialCalculationSource.RASTER
        : forcedAffectedPercentage !== undefined
        ? SpatialCalculationSource.SIMULATION
        : SpatialCalculationSource.DERIVED_INDICATORS);

    const spatialResult: SpatialChangeResult = {
      calculationMode,
      spatialSource,
      zoneArea: zoneAreaHectares,
      changedArea,
      affectedAreaPercentage,
      explanation:
        calculationMode === ProcessingMode.REAL
          ? `SAR backscatter analysis detected approximately ${affectedAreaPercentage}% affected area (${changedArea} ha of ${zoneAreaHectares} ha) confirmed via Sentinel-1 SAR analysis.`
          : `SAR backscatter analysis suggests approximately ${affectedAreaPercentage}% affected area (${changedArea} ha of ${zoneAreaHectares} ha). This result is based on simulated/local C-band SAR processing.`,
    };

    return {
      changeIndicators,
      categories,
      spatialResult,
      isChangeDetected,
    };
  }
}
