import {
  ChangeCategory,
  ProcessingMode,
  SpatialCalculationSource,
  type OpticalMetrics,
  type ChangeIndicatorDeltas,
  type SpatialChangeResult,
} from '@tn-forest/shared/types';

export interface OpticalDetectionResult {
  changeIndicators: ChangeIndicatorDeltas;
  categories: ChangeCategory[];
  spatialResult: SpatialChangeResult;
  isChangeDetected: boolean;
}

export class OpticalChangeDetector {
  /**
   * Compares current optical spectral metrics against the active optical baseline
   * and computes index deltas, classified change categories, and spatial change area.
   */
  public static detectChange(params: {
    currentMetrics: OpticalMetrics;
    baselineMetrics: OpticalMetrics;
    zoneAreaHectares: number;
    changedPixels?: number;
    validPixels?: number;
    pixelResolutionMeters?: number;
    pixelAreaM2?: number;
    originalCrs?: string;
    normalizedCrs?: string;
    areaCalculationCrs?: string;
    forcedAffectedPercentage?: number; // For test fixtures / direct simulation override
    calculationMode?: ProcessingMode;
    spatialSource?: SpatialCalculationSource;
    isRealTelemetry?: boolean;
  }): OpticalDetectionResult {
    const {
      currentMetrics,
      baselineMetrics,
      zoneAreaHectares,
      changedPixels: inputChangedPixels,
      validPixels: inputValidPixels,
      pixelResolutionMeters = 10,
      pixelAreaM2: inputPixelAreaM2,
      originalCrs,
      normalizedCrs,
      areaCalculationCrs,
      forcedAffectedPercentage,
      calculationMode: inputCalculationMode,
      spatialSource: inputSpatialSource,
      isRealTelemetry,
    } = params;

    const pixelAreaM2 =
      inputPixelAreaM2 && inputPixelAreaM2 > 0
        ? inputPixelAreaM2
        : pixelResolutionMeters * pixelResolutionMeters;
    const validPixels =
      inputValidPixels && inputValidPixels > 0
        ? inputValidPixels
        : Math.max(1, Math.round((zoneAreaHectares * 10000.0) / pixelAreaM2));

    const ndviDelta = Number((currentMetrics.ndvi - baselineMetrics.ndvi).toFixed(3));
    const ndwiDelta = Number((currentMetrics.ndwi - baselineMetrics.ndwi).toFixed(3));
    const ndbiDelta = Number((currentMetrics.ndbi - baselineMetrics.ndbi).toFixed(3));
    const bsiDelta = Number((currentMetrics.bsi - baselineMetrics.bsi).toFixed(3));
    const saviDelta = Number((currentMetrics.savi - baselineMetrics.savi).toFixed(3));
    const eviDelta = Number((currentMetrics.evi - baselineMetrics.evi).toFixed(3));

    const changeIndicators: ChangeIndicatorDeltas = {
      ndviDelta,
      ndwiDelta,
      ndbiDelta,
      bsiDelta,
      saviDelta,
      eviDelta,
    };

    // Classify Change Categories
    const categories: ChangeCategory[] = [];
    if (ndviDelta < -0.04) {
      categories.push(ChangeCategory.VEGETATION_LOSS);
    }
    if (bsiDelta > 0.04) {
      categories.push(ChangeCategory.BARE_SOIL_EXPOSURE);
    }
    if (ndbiDelta > 0.04) {
      categories.push(ChangeCategory.BUILT_UP_CHANGE);
    }
    if (Math.abs(ndwiDelta) > 0.06) {
      categories.push(ChangeCategory.WATER_CHANGE);
    }
    if (categories.length > 1) {
      categories.push(ChangeCategory.MIXED_CHANGE);
    } else if (categories.length === 0) {
      if (Math.abs(ndviDelta) > 0.02 || Math.abs(bsiDelta) > 0.02) {
        categories.push(ChangeCategory.SURFACE_CHANGE);
      } else {
        categories.push(ChangeCategory.UNKNOWN_CHANGE);
      }
    }

    // Spatial Change Calculation with Integrity Abstraction
    let affectedAreaPercentage = 0;
    let changedPixels = 0;
    let changedArea = 0;

    if (forcedAffectedPercentage !== undefined) {
      affectedAreaPercentage = Number(forcedAffectedPercentage.toFixed(3));
      changedPixels = Math.max(0, Math.round((affectedAreaPercentage / 100.0) * validPixels));
      changedArea = Number(((changedPixels * pixelAreaM2) / 10000.0).toFixed(4));
    } else if (inputChangedPixels !== undefined && inputChangedPixels >= 0) {
      changedPixels = Math.round(inputChangedPixels);
      affectedAreaPercentage = Number(((changedPixels / validPixels) * 100.0).toFixed(3));
      changedArea = Number(((changedPixels * pixelAreaM2) / 10000.0).toFixed(4));
    } else {
      // Deterministically derive affected area estimate from change vector magnitude
      const vegLossMag = Math.max(0, -ndviDelta);
      const bareSoilMag = Math.max(0, bsiDelta);
      const builtUpMag = Math.max(0, ndbiDelta);
      const compositeDelta = (vegLossMag * 1.5 + bareSoilMag * 1.2 + builtUpMag * 1.0) / 3.0;

      // 10 changed pixels for subtle ~0.002 delta
      changedPixels = Math.max(1, Math.round(compositeDelta * 4000.0));
      if (changedPixels > validPixels) changedPixels = validPixels;
      changedArea = Number(((changedPixels * pixelAreaM2) / 10000.0).toFixed(4));
      affectedAreaPercentage = Number(((changedPixels / validPixels) * 100.0).toFixed(3));
    }

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
      explanation: `Analyzed ${validPixels} valid pixels (${zoneAreaHectares.toFixed(2)} ha). Detected ${changedPixels} changed pixels (${changedArea.toFixed(4)} ha), resulting in ${affectedAreaPercentage.toFixed(3)}% affected area.`,
      originalCrs,
      normalizedCrs,
      areaCalculationCrs,
      pixelAreaM2,
      changedPixels,
      validPixels,
    };

    return {
      changeIndicators,
      categories,
      spatialResult,
      isChangeDetected,
    };
  }
}
