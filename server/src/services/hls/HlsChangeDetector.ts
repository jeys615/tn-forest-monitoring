/**
 * HlsChangeDetector — Dedicated HLS Cross-Sensor Change Detection Engine
 *
 * Implements Section 24 of the HLS Specification:
 *   - Dedicated cross-sensor optical detector.
 *   - Does NOT replace OpticalPixelChangeDetector or SarChangeDetector.
 *   - Integrates with ChangeDetectionService, AlertService, and Evidence system.
 *   - Strictly enforces scientific threshold: deltaNDVI <= -0.15 for canopy loss.
 *   - Strictly derives physical ground area from pixel accounting: changedPixels * pixelAreaM2 / 10000.
 *   - Full scientific lineage attribution:
 *       monitoringTrack: OPTICAL
 *       processingFamily: HLS
 *       crossSensor: true
 *       hlsAlgorithmVersion: V2.0
 *       hlsProcessingVersion: 2.0.0
 *       qaPolicy: FMASK_4X_CLEAR_ONLY
 */

import {
  MonitoringTrack,
  SensorType,
  AlertSeverity,
  ChangeCategory,
  type AnalysisGridDto,
  type ChangeIndicatorDeltas,
  type HlsChangeDetectionResult,
} from '@tn-forest/shared/types';
import type { OpticalSpectralIndices } from '../spatial/OpticalPixelIndexService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export type { HlsChangeDetectionResult };

export const HLS_ALGORITHM_VERSION = 'V2.0';
export const HLS_PROCESSING_VERSION = '2.0.0';
export const HLS_DEFAULT_NDVI_THRESHOLD = -0.15;
export const HLS_DEFAULT_QA_POLICY = 'FMASK_4X_CLEAR_ONLY';

export interface HlsChangeDetectorInput {
  baselineIndices: OpticalSpectralIndices;
  currentIndices: OpticalSpectralIndices;
  validMask: Uint8Array;
  grid: AnalysisGridDto;
  zoneAreaHectares?: number;
  threshold?: number;
  baselineSensor?: string;
  currentSensor?: string;
  baselineImageId?: string;
  currentImageId?: string;
  qaPolicy?: string;
  bandpassVersion?: string;
  brdfVersion?: string;
}

export class HlsChangeDetector {
  /**
   * Executes authoritative pixel-level HLS cross-sensor difference detection.
   */
  public static detectChange(input: HlsChangeDetectorInput): HlsChangeDetectionResult {
    const {
      baselineIndices,
      currentIndices,
      validMask,
      grid,
      zoneAreaHectares,
      threshold = HLS_DEFAULT_NDVI_THRESHOLD,
      qaPolicy = HLS_DEFAULT_QA_POLICY,
      bandpassVersion = 'HLS_V2.0_CLAVERIE_2018',
      brdfVersion = 'HLS_V2.0_RTLSR_CFACTOR',
    } = input;

    const totalPixels = grid.width * grid.height;

    if (
      baselineIndices.ndvi.length !== totalPixels ||
      currentIndices.ndvi.length !== totalPixels ||
      validMask.length !== totalPixels
    ) {
      throw new AppError(
        `Array dimension mismatch in HlsChangeDetector: grid is ${totalPixels} pixels, ` +
          `baseline is ${baselineIndices.ndvi.length}, current is ${currentIndices.ndvi.length}, mask is ${validMask.length}`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    const changedMask = new Uint8Array(totalPixels);

    let validCount = 0;
    let changedCount = 0;
    let decreaseCount = 0;
    let increaseCount = 0;
    let stableCount = 0;

    let deltaNdviSum = 0;
    const deltaNdviValues: number[] = [];

    let deltaNdwiSum = 0;
    let deltaNdbiSum = 0;
    let deltaBsiSum = 0;
    let deltaEviSum = 0;
    let deltaSaviSum = 0;

    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] !== 1) {
        changedMask[i] = 0;
        continue;
      }

      const baseNdvi = baselineIndices.ndvi[i];
      const curNdvi = currentIndices.ndvi[i];

      if (isNaN(baseNdvi) || isNaN(curNdvi)) {
        changedMask[i] = 0;
        continue;
      }

      validCount++;

      const deltaNdvi = curNdvi - baseNdvi;
      deltaNdviSum += deltaNdvi;
      deltaNdviValues.push(deltaNdvi);

      // Accumulate other spectral indicator deltas if available
      if (baselineIndices.ndwi && currentIndices.ndwi) {
        deltaNdwiSum += (currentIndices.ndwi[i] - baselineIndices.ndwi[i]);
      }
      if (baselineIndices.ndbi && currentIndices.ndbi) {
        deltaNdbiSum += (currentIndices.ndbi[i] - baselineIndices.ndbi[i]);
      }
      if (baselineIndices.bsi && currentIndices.bsi) {
        deltaBsiSum += (currentIndices.bsi[i] - baselineIndices.bsi[i]);
      }
      if (baselineIndices.evi && currentIndices.evi) {
        deltaEviSum += (currentIndices.evi[i] - baselineIndices.evi[i]);
      }
      if (baselineIndices.savi && currentIndices.savi) {
        deltaSaviSum += (currentIndices.savi[i] - baselineIndices.savi[i]);
      }

      // Canopy loss rule: deltaNDVI <= threshold (e.g. -0.15)
      if (deltaNdvi <= threshold) {
        changedMask[i] = 1;
        changedCount++;
        decreaseCount++;
      } else {
        changedMask[i] = 0;
        if (deltaNdvi > 0.05) {
          increaseCount++;
        } else {
          stableCount++;
        }
      }
    }

    if (validCount === 0) {
      throw new AppError(
        'Zero valid overlapping comparison pixels inside monitored zone boundary for HLS change detection',
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    // Physical ground area calculation: strictly changedPixels * cellArea / 10000
    const pixelScaleX = grid.pixelSizeX || 30.0;
    const pixelScaleY = grid.pixelSizeY || 30.0;
    const pixelAreaM2 = Number((pixelScaleX * pixelScaleY).toFixed(4)); // 900.0 m2

    const changedAreaM2 = Number((changedCount * pixelAreaM2).toFixed(4));
    const changedAreaHectares = Number((changedAreaM2 / 10000.0).toFixed(4));
    const affectedAreaPercentage = Number(((changedCount / validCount) * 100.0).toFixed(4));

    // Distribution statistics
    const meanDeltaNdvi = Number((deltaNdviSum / validCount).toFixed(4));

    // Median & standard deviation
    deltaNdviValues.sort((a, b) => a - b);
    const mid = Math.floor(deltaNdviValues.length / 2);
    const medianDeltaNdvi = Number(
      (deltaNdviValues.length % 2 !== 0
        ? deltaNdviValues[mid]
        : (deltaNdviValues[mid - 1] + deltaNdviValues[mid]) / 2
      ).toFixed(4),
    );

    let varianceSum = 0;
    for (const d of deltaNdviValues) {
      varianceSum += Math.pow(d - meanDeltaNdvi, 2);
    }
    const stdDeltaNdvi = Number(Math.sqrt(varianceSum / validCount).toFixed(4));

    const changeIndicators: ChangeIndicatorDeltas = {
      ndviDelta: meanDeltaNdvi,
      ndwiDelta: Number((deltaNdwiSum / validCount).toFixed(4)),
      ndbiDelta: Number((deltaNdbiSum / validCount).toFixed(4)),
      bsiDelta: Number((deltaBsiSum / validCount).toFixed(4)),
      eviDelta: Number((deltaEviSum / validCount).toFixed(4)),
      saviDelta: Number((deltaSaviSum / validCount).toFixed(4)),
    };

    const categories: ChangeCategory[] = [];
    if (changedCount > 0) {
      categories.push(ChangeCategory.VEGETATION_LOSS);
      categories.push(ChangeCategory.SURFACE_CHANGE);
    }

    const thresholdCrossed = changedCount > 0;

    return {
      changedPixels: changedCount,
      validComparisonPixels: validCount,
      stablePixels: stableCount,
      decreasePixels: decreaseCount,
      increasePixels: increaseCount,
      changedAreaM2,
      changedAreaHectares,
      affectedAreaPercentage,
      meanDeltaNdvi,
      medianDeltaNdvi,
      stdDeltaNdvi,
      thresholdCrossed,
      threshold,
      categories,
      changeIndicators,
      processingFamily: 'HLS',
      crossSensor: true,
      hlsAlgorithmVersion: HLS_ALGORITHM_VERSION,
      hlsProcessingVersion: HLS_PROCESSING_VERSION,
      bandpassVersion,
      brdfVersion,
      gridDefinition: {
        crs: grid.crs,
        resolutionMeters: pixelScaleX,
        pixelAreaM2,
        width: grid.width,
        height: grid.height,
      },
      qaPolicy,
      changedMask,
      validMask,
    };
  }
}
