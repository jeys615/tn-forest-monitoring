import {
  ChangeCategory,
  ProcessingMode,
  SpatialCalculationSource,
  ChangeCalculationMethod,
  SpatialCalculationType,
  type AnalysisGridDto,
  type ChangeIndicatorDeltas,
  type OpticalRasterStatisticsDto,
  type OpticalThresholdConfigDto,
  type SpatialChangeResult,
} from '@tn-forest/shared/types';
import type { OpticalSpectralIndices } from '../spatial/OpticalPixelIndexService.js';
import { PixelVectorizationService } from '../spatial/PixelVectorizationService.js';
import {
  CanopyGuardShadowService,
  type CanopyGuardMode,
  type ShadowAccountingModel,
} from './CanopyGuardShadowService.js';

export const DEFAULT_OPTICAL_THRESHOLD_CONFIG: OpticalThresholdConfigDto = {
  ndviThreshold: -0.15, // A decrease of >= 0.15 in NDVI represents genuine canopy loss / forest disturbance
  ndwiThreshold: -0.10,
  ndbiThreshold: 0.10,
  bsiThreshold: 0.10,
  decisionRule: 'NDVI_DROP',
  changeDirection: 'DECREASE',
};

export interface DetectOpticalPixelChangeOptions {
  baselineIndices: OpticalSpectralIndices;
  currentIndices: OpticalSpectralIndices;
  validMask: Uint8Array;
  grid: AnalysisGridDto;
  zoneAreaHectares: number;
  thresholdConfig?: Partial<OpticalThresholdConfigDto>;
  baselineSensor?: string;
  currentSensor?: string;
  baselineScl?: Float32Array;
  canopyGuardMode?: CanopyGuardMode;
}

export interface OpticalPixelChangeResult {
  spatialResult: SpatialChangeResult;
  changeIndicators: ChangeIndicatorDeltas;
  categories: ChangeCategory[];
  changedMask: Uint8Array;
  rasterStatistics: OpticalRasterStatisticsDto;
  thresholdConfig: OpticalThresholdConfigDto;
  shadowTelemetry?: ShadowAccountingModel;
  preScreenedPixelCount?: number;
  preScreenedAreaHa?: number;
}

/**
 * Production-grade Optical Pixel Change Detector.
 * Executes genuine pixel-by-pixel differential spectral analysis on identical canonical AnalysisGrids.
 *
 * Replaces the unsafe compositeDelta * 4000.0 scalar heuristic with:
 * 1. Per-pixel spectral deltas: ΔNDVI = currentNDVI[i] - baselineNDVI[i].
 * 2. Explicit, configurable directional thresholds (vegetation drop vs increase vs stable).
 * 3. Exact binary change mask: changedMask[i] = 1 if rule satisfied.
 * 4. Ground area derived strictly from physical pixel geometry: changedArea = changedPixels * pixelAreaM2 / 10000.
 * 5. Affected percentage derived strictly from authentic valid pixels: (changedPixels / validPixels) * 100.
 */
export class OpticalPixelChangeDetector {
  public static detectPixelChange(options: DetectOpticalPixelChangeOptions): OpticalPixelChangeResult {
    const {
      baselineIndices,
      currentIndices,
      validMask,
      grid,
      zoneAreaHectares,
      thresholdConfig: customConfig,
      baselineSensor = 'Optical',
      currentSensor = 'Optical',
      baselineScl,
      canopyGuardMode,
    } = options;

    const activeMode: CanopyGuardMode = canopyGuardMode || CanopyGuardShadowService.getMode();

    const config: OpticalThresholdConfigDto = {
      ...DEFAULT_OPTICAL_THRESHOLD_CONFIG,
      ...customConfig,
    };

    const totalPixels = grid.width * grid.height;
    const changedMask = new Uint8Array(totalPixels);

    const ndviDeltas: number[] = [];
    const ndwiDeltas: number[] = [];
    const ndbiDeltas: number[] = [];
    const bsiDeltas: number[] = [];
    const saviDeltas: number[] = [];
    const eviDeltas: number[] = [];

    let validComparisonPixelCount = 0;
    let changedPixelCount = 0;
    let decreasePixelCount = 0;
    let increasePixelCount = 0;
    let stablePixelCount = 0;

    let fullCandidatePool = 0;
    let persistentCount = 0;
    let uncertainCount = 0;
    let preScreenedNonForestCount = 0;
    let malformedSclCount = 0;

    let sumDeltaNdvi = 0;
    let sumDeltaNdwi = 0;
    let sumDeltaNdbi = 0;
    let sumDeltaBsi = 0;
    let sumDeltaSavi = 0;
    let sumDeltaEvi = 0;

    const ndviDropThreshold = config.ndviThreshold <= 0 ? config.ndviThreshold : -config.ndviThreshold;
    const ndviGainThreshold = Math.abs(ndviDropThreshold);

    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        changedMask[i] = 0;
        continue;
      }

      const bNdvi = baselineIndices.ndvi[i];
      const cNdvi = currentIndices.ndvi[i];

      if (isNaN(bNdvi) || isNaN(cNdvi)) {
        changedMask[i] = 0;
        continue;
      }

      validComparisonPixelCount++;

      const dNdvi = cNdvi - bNdvi;
      const dNdwi = currentIndices.ndwi[i] - baselineIndices.ndwi[i];
      const dNdbi = currentIndices.ndbi[i] - baselineIndices.ndbi[i];
      const dBsi = currentIndices.bsi[i] - baselineIndices.bsi[i];
      const dSavi = currentIndices.savi[i] - baselineIndices.savi[i];
      const dEvi = currentIndices.evi[i] - baselineIndices.evi[i];

      ndviDeltas.push(dNdvi);
      if (!isNaN(dNdwi)) ndwiDeltas.push(dNdwi);
      if (!isNaN(dNdbi)) ndbiDeltas.push(dNdbi);
      if (!isNaN(dBsi)) bsiDeltas.push(dBsi);
      if (!isNaN(dSavi)) saviDeltas.push(dSavi);
      if (!isNaN(dEvi)) eviDeltas.push(dEvi);

      sumDeltaNdvi += dNdvi;
      if (!isNaN(dNdwi)) sumDeltaNdwi += dNdwi;
      if (!isNaN(dNdbi)) sumDeltaNdbi += dNdbi;
      if (!isNaN(dBsi)) sumDeltaBsi += dBsi;
      if (!isNaN(dSavi)) sumDeltaSavi += dSavi;
      if (!isNaN(dEvi)) sumDeltaEvi += dEvi;

      // Directional counting
      if (dNdvi <= ndviDropThreshold) {
        decreasePixelCount++;
      } else if (dNdvi >= ndviGainThreshold) {
        increasePixelCount++;
      } else {
        stablePixelCount++;
      }

      // Evaluate change detection rule
      let isChanged = false;

      if (config.decisionRule === 'NDVI_DROP') {
        // Standard forest canopy loss
        if (config.changeDirection === 'INCREASE') {
          isChanged = dNdvi >= ndviGainThreshold;
        } else if (config.changeDirection === 'ABSOLUTE') {
          isChanged = Math.abs(dNdvi) >= ndviGainThreshold;
        } else {
          isChanged = dNdvi <= ndviDropThreshold;
        }
      } else if (config.decisionRule === 'MULTI_INDEX') {
        // High confidence: vegetation loss accompanied by bare soil or built-up increase
        const isLoss = dNdvi <= ndviDropThreshold;
        const isBareOrBuilt = dBsi >= 0.05 || dNdbi >= 0.05;
        isChanged = isLoss && isBareOrBuilt;
      } else if (config.decisionRule === 'ANY_INDEX') {
        const isLoss = dNdvi <= ndviDropThreshold;
        const isBsiHigh = dBsi >= (config.bsiThreshold || 0.10);
        const isNdbiHigh = dNdbi >= (config.ndbiThreshold || 0.10);
        isChanged = isLoss || isBsiHigh || isNdbiHigh;
      }

      if (isChanged) {
        fullCandidatePool++;

        // Safe SCL extraction with boundary and NaN diagnostics
        let sclVal: number | undefined = undefined;
        if (baselineScl) {
          if (i < baselineScl.length) {
            const rawScl = baselineScl[i];
            if (isNaN(rawScl)) {
              malformedSclCount++;
            } else {
              sclVal = rawScl;
            }
          } else {
            malformedSclCount++;
          }
        } else {
          malformedSclCount++;
        }

        // Evaluate Canopy Guard with the effective mode
        const guardRes = CanopyGuardShadowService.evaluatePixel(bNdvi, sclVal, activeMode);

        // Track 4-way accounting partition
        if (guardRes.shadowCategory === 'PRE_SCREENED_NON_FOREST') {
          preScreenedNonForestCount++;
        } else if (guardRes.shadowCategory === 'UNCERTAIN_OBSCURED') {
          uncertainCount++;
        } else {
          persistentCount++;
        }

        // Mode-dependent changedMask assignment
        if (activeMode === 'ACTIVE') {
          // In ACTIVE mode: only verified canopy disturbance is officially flagged
          if (guardRes.isCanopy) {
            changedMask[i] = 1;
            changedPixelCount++;
          } else {
            changedMask[i] = 0; // Pruned as non-forest or uncertain
          }
        } else {
          // In OFF and SHADOW modes: 100% legacy v2.0 official behavior
          changedMask[i] = 1;
          changedPixelCount++;
        }
      } else {
        changedMask[i] = 0;
      }
    }

    const n = validComparisonPixelCount > 0 ? validComparisonPixelCount : 1;
    const meanDeltaNdvi = sumDeltaNdvi / n;
    const meanDeltaNdwi = ndwiDeltas.length > 0 ? sumDeltaNdwi / ndwiDeltas.length : 0;
    const meanDeltaNdbi = ndbiDeltas.length > 0 ? sumDeltaNdbi / ndbiDeltas.length : 0;
    const meanDeltaBsi = bsiDeltas.length > 0 ? sumDeltaBsi / bsiDeltas.length : 0;
    const meanDeltaSavi = saviDeltas.length > 0 ? sumDeltaSavi / saviDeltas.length : 0;
    const meanDeltaEvi = eviDeltas.length > 0 ? sumDeltaEvi / eviDeltas.length : 0;

    // Median and Standard Deviation for ΔNDVI
    let medianDeltaNdvi = 0;
    let stdDeltaNdvi = 0;
    if (ndviDeltas.length > 0) {
      ndviDeltas.sort((a, b) => a - b);
      const mid = Math.floor(ndviDeltas.length / 2);
      medianDeltaNdvi = ndviDeltas.length % 2 === 0 ? (ndviDeltas[mid - 1] + ndviDeltas[mid]) / 2 : ndviDeltas[mid];

      let varianceSum = 0;
      for (const d of ndviDeltas) {
        const diff = d - meanDeltaNdvi;
        varianceSum += diff * diff;
      }
      stdDeltaNdvi = Math.sqrt(varianceSum / ndviDeltas.length);
    }

    // Diagnostic logging for malformed/missing SCL
    if (malformedSclCount > 0 && activeMode !== 'OFF') {
      console.warn(
        `[CanopyGuard] Optical change detection encountered ${malformedSclCount} missing or malformed SCL observations across ${validComparisonPixelCount} valid pixels.`,
      );
    }

    // Physical ground area calculation from canonical AnalysisGrid cell dimensions
    const pixelScaleX = grid.pixelSizeX || 10.0;
    const pixelScaleY = grid.pixelSizeY || 10.0;
    const pixelAreaM2 = Number((pixelScaleX * pixelScaleY).toFixed(4));

    const changedAreaHa = Number(((changedPixelCount * pixelAreaM2) / 10000.0).toFixed(4));
    const preScreenedAreaHa = Number(((preScreenedNonForestCount * pixelAreaM2) / 10000.0).toFixed(4));
    const affectedAreaPercentage =
      validComparisonPixelCount > 0
        ? Number(((changedPixelCount / validComparisonPixelCount) * 100.0).toFixed(4))
        : 0.0;

    const decreaseAffectedAreaPercentage =
      validComparisonPixelCount > 0
        ? Number(((decreasePixelCount / validComparisonPixelCount) * 100.0).toFixed(4))
        : 0.0;

    const increaseAffectedAreaPercentage =
      validComparisonPixelCount > 0
        ? Number(((increasePixelCount / validComparisonPixelCount) * 100.0).toFixed(4))
        : 0.0;

    const rasterStatistics: OpticalRasterStatisticsDto = {
      meanDeltaNdvi: Number(meanDeltaNdvi.toFixed(4)),
      medianDeltaNdvi: Number(medianDeltaNdvi.toFixed(4)),
      stdDeltaNdvi: Number(stdDeltaNdvi.toFixed(4)),
      meanDeltaNdwi: Number(meanDeltaNdwi.toFixed(4)),
      meanDeltaNdbi: Number(meanDeltaNdbi.toFixed(4)),
      meanDeltaBsi: Number(meanDeltaBsi.toFixed(4)),
      meanDeltaSavi: Number(meanDeltaSavi.toFixed(4)),
      meanDeltaEvi: Number(meanDeltaEvi.toFixed(4)),
      changedPixelCount,
      validComparisonPixelCount,
      decreasePixelCount,
      increasePixelCount,
      stablePixelCount,
      decreaseAffectedAreaPercentage,
      increaseAffectedAreaPercentage,
    };

    // Calculate shadow accounting telemetry if not OFF
    let shadowTelemetry: ShadowAccountingModel | undefined = undefined;
    if (activeMode !== 'OFF') {
      shadowTelemetry = CanopyGuardShadowService.computeAccountingModel({
        fullCandidatePool,
        fullyObservableSubset: fullCandidatePool - uncertainCount,
        seasonalCount: 0,
        persistentCount,
        uncertainCount,
        preScreenedNonForestCount,
      });
    }

    // Determine categorized disturbance types
    const categories: ChangeCategory[] = [];
    if (changedPixelCount > 0) {
      if (decreasePixelCount > 0) {
        categories.push(ChangeCategory.VEGETATION_LOSS);
      }
      if (meanDeltaBsi > 0.05) {
        categories.push(ChangeCategory.BARE_SOIL_EXPOSURE);
      }
      if (meanDeltaNdbi > 0.05) {
        categories.push(ChangeCategory.BUILT_UP_CHANGE);
      }
      if (categories.length === 0) {
        categories.push(ChangeCategory.SURFACE_CHANGE);
      }
    }
    // In ACTIVE mode only, record that non-forest was pre-screened if applicable
    if (activeMode === 'ACTIVE' && preScreenedNonForestCount > 0) {
      categories.push(ChangeCategory.PRE_SCREENED_NON_FOREST);
    }

    const explanation =
      changedPixelCount > 0
        ? `Optical per-pixel change detection: ${changedPixelCount} changed pixels (${affectedAreaPercentage}%) identified across ${validComparisonPixelCount} valid comparison pixels. Forest canopy loss (ΔNDVI <= ${ndviDropThreshold}) detected over ${changedAreaHa} ha.`
        : `Optical per-pixel change detection: Stable forest canopy. 0 changed pixels across ${validComparisonPixelCount} valid comparison pixels.`;

    // Vectorize significant changed pixel clusters into GeoJSON polygons
    const changedGeometry = PixelVectorizationService.vectorizeChangedPixels(
      changedMask,
      grid,
      1,
    );

    const spatialResult: SpatialChangeResult = {
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.RASTER,
      calculationMethod: ChangeCalculationMethod.OPTICAL_PIXEL_DIFFERENCE,
      spatialCalculation: SpatialCalculationType.PIXEL_GRID,
      analysisGrid: grid,
      thresholdConfig: config,
      rasterStatistics,
      opticalThresholdConfig: config,
      opticalRasterStatistics: rasterStatistics,
      baselineSensor,
      currentSensor,
      decreasePixelCount,
      increasePixelCount,
      stablePixelCount,
      zoneArea: zoneAreaHectares,
      changedArea: changedAreaHa,
      affectedAreaPercentage,
      pixelAreaM2,
      changedPixels: changedPixelCount,
      validPixels: validComparisonPixelCount,
      changedGeometry,
      explanation,
      shadowTelemetry,
      preScreenedPixels: preScreenedNonForestCount,
      preScreenedAreaHa,
    };

    const changeIndicators: ChangeIndicatorDeltas = {
      ndviDelta: Number(meanDeltaNdvi.toFixed(4)),
      ndwiDelta: Number(meanDeltaNdwi.toFixed(4)),
      ndbiDelta: Number(meanDeltaNdbi.toFixed(4)),
      bsiDelta: Number(meanDeltaBsi.toFixed(4)),
      saviDelta: Number(meanDeltaSavi.toFixed(4)),
      eviDelta: Number(meanDeltaEvi.toFixed(4)),
    };

    return {
      spatialResult,
      changeIndicators,
      categories,
      changedMask,
      rasterStatistics,
      thresholdConfig: config,
      shadowTelemetry,
      preScreenedPixelCount: preScreenedNonForestCount,
      preScreenedAreaHa,
    };
  }
}
