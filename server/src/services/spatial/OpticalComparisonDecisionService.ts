/**
 * OpticalComparisonDecisionService — Runtime Comparison Strategy Engine
 *
 * Deterministically decides whether an optical baseline-to-candidate comparison
 * must be performed using:
 *
 *   1. ComparisonMode.NATIVE  — Same optical sensor family
 *                               (Sentinel-2 ↔ Sentinel-2, Landsat-8/9 ↔ Landsat-8/9)
 *   2. ComparisonMode.HLS     — Cross-sensor optical pairing
 *                               (Sentinel-2 ↔ Landsat or Landsat ↔ Sentinel-2)
 *
 * ARCHITECTURAL INVARIANTS:
 *   - ComparisonMode is NOT the monitoringTrack.
 *     Optical comparisons remain monitoringTrack: OPTICAL for both NATIVE and HLS modes.
 *   - SAR is NEVER routed through HLS. S1 observations are rejected by this service
 *     and must follow SarCompatibilityService and the independent SAR track.
 *   - HLS is NOT a cloud fallback. High cloud on a same-family pair remains NATIVE.
 *   - The service is purely functional and deterministic:
 *     NO database writes, NO GEE calls, NO network requests, NO raster generation.
 */

import {
  ComparisonMode,
  HLSProduct,
  HLSRejectionCode,
  RejectionReasonCode,
  SatelliteSource,
  SensorType,
  MonitoringTrack,
  type OpticalComparisonDecision,
  OPTICAL_NATIVE_SENSOR_PAIRS,
  HLS_REQUIRED_SENSOR_PAIRS,
  SAR_INCOMPATIBLE_WITH_HLS,
} from '@tn-forest/shared/types';
import {
  OpticalCompatibilityService,
  type OpticalObservationMetadata,
} from './OpticalCompatibilityService.js';

export interface ComparisonObservationInput extends OpticalObservationMetadata {
  zoneId?: string;
  monitoringTrack?: MonitoringTrack | string;
}

export interface ComparisonDecisionOptions {
  /**
   * Optional maximum cloud cover percentage.
   * If provided and candidate cloud cover exceeds this, candidate is flagged
   * with CLOUD_COVER_EXCEEDS_THRESHOLD while preserving comparisonMode.
   */
  maxCloudCoverThreshold?: number;
}

export class OpticalComparisonDecisionService {
  /**
   * Resolves canonical SatelliteSource from observation metadata or imageId.
   */
  public static resolveSatelliteSource(obs: ComparisonObservationInput): SatelliteSource | 'UNKNOWN' {
    if (obs.source) {
      if (Object.values(SatelliteSource).includes(obs.source as SatelliteSource)) {
        return obs.source as SatelliteSource;
      }
    }

    const normId = (obs.imageId || '').trim();
    if (/sentinel-?1|s1[ab]|copernicus\/s1/i.test(normId)) {
      return SatelliteSource.SENTINEL_1;
    }
    if (/sentinel-?2|s2[abc]|copernicus\/s2/i.test(normId)) {
      return SatelliteSource.SENTINEL_2;
    }
    if (/landsat-?8|lc08/i.test(normId)) {
      return SatelliteSource.LANDSAT_8;
    }
    if (/landsat-?9|lc09/i.test(normId)) {
      return SatelliteSource.LANDSAT_9;
    }
    if (/srtm/i.test(normId)) {
      return SatelliteSource.SRTM;
    }

    const parsed = OpticalCompatibilityService.parseOpticalMetadata(obs.imageId, {
      spacecraftName: obs.spacecraftName || obs.platform,
    });
    if (Object.values(SatelliteSource).includes(parsed.source as SatelliteSource)) {
      return parsed.source as SatelliteSource;
    }

    return 'UNKNOWN';
  }

  /**
   * Resolves canonical SensorType from observation metadata.
   */
  public static resolveSensorType(
    obs: ComparisonObservationInput,
    resolvedSource: SatelliteSource | 'UNKNOWN',
  ): SensorType | 'UNKNOWN' {
    if (obs.sensorType) {
      if (Object.values(SensorType).includes(obs.sensorType as SensorType)) {
        return obs.sensorType as SensorType;
      }
    }
    if (obs.monitoringTrack === MonitoringTrack.SAR || resolvedSource === SatelliteSource.SENTINEL_1) {
      return SensorType.SAR;
    }
    if (
      obs.monitoringTrack === MonitoringTrack.OPTICAL ||
      resolvedSource === SatelliteSource.SENTINEL_2 ||
      resolvedSource === SatelliteSource.LANDSAT_8 ||
      resolvedSource === SatelliteSource.LANDSAT_9
    ) {
      return SensorType.OPTICAL;
    }
    if (resolvedSource === SatelliteSource.SRTM) {
      return SensorType.DEM;
    }
    return 'UNKNOWN';
  }

  /**
   * Resolves corresponding HLS product (S30 or L30) for an optical observation.
   * Returns undefined for non-optical or unsupported sources.
   */
  public static resolveHLSProduct(
    source: SatelliteSource | string,
    platform?: string,
  ): HLSProduct | undefined {
    if (source === SatelliteSource.SENTINEL_2) return HLSProduct.S30;
    if (source === SatelliteSource.LANDSAT_8 || source === SatelliteSource.LANDSAT_9) {
      return HLSProduct.L30;
    }

    if (platform) {
      if (/sentinel-?2/i.test(platform)) return HLSProduct.S30;
      if (/landsat/i.test(platform)) return HLSProduct.L30;
    }
    return undefined;
  }

  /**
   * Checks whether two satellite sources belong to the same optical sensor family.
   */
  public static isSameOpticalFamily(sourceA: SatelliteSource, sourceB: SatelliteSource): boolean {
    return OPTICAL_NATIVE_SENSOR_PAIRS.some(
      ([a, b]) => (a === sourceA && b === sourceB) || (a === sourceB && b === sourceA),
    );
  }

  /**
   * Checks whether two satellite sources represent an allowed cross-sensor optical pairing
   * that requires HLS harmonization.
   */
  public static isCrossSensorOpticalPair(sourceA: SatelliteSource, sourceB: SatelliteSource): boolean {
    return HLS_REQUIRED_SENSOR_PAIRS.some(
      ([a, b]) => (a === sourceA && b === sourceB) || (a === sourceB && b === sourceA),
    );
  }

  /**
   * Evaluates comparison feasibility and selects ComparisonMode.NATIVE vs ComparisonMode.HLS.
   *
   * Pure, deterministic function.
   */
  public static decideComparison(
    baseline: ComparisonObservationInput,
    current: ComparisonObservationInput,
    options: ComparisonDecisionOptions = {},
  ): OpticalComparisonDecision {
    const baseSource = OpticalComparisonDecisionService.resolveSatelliteSource(baseline);
    const currSource = OpticalComparisonDecisionService.resolveSatelliteSource(current);

    const baseSensor = OpticalComparisonDecisionService.resolveSensorType(baseline, baseSource);
    const currSensor = OpticalComparisonDecisionService.resolveSensorType(current, currSource);

    const safeBaseSource = baseSource !== 'UNKNOWN' ? baseSource : SatelliteSource.SENTINEL_2;
    const safeCurrSource = currSource !== 'UNKNOWN' ? currSource : SatelliteSource.SENTINEL_2;

    // ─── RULE 5 & RULE 6: SAR REJECTION & MONITORING TRACK CHECK ─────────────
    const isBaseSar =
      baseSensor === SensorType.SAR ||
      baseline.monitoringTrack === MonitoringTrack.SAR ||
      SAR_INCOMPATIBLE_WITH_HLS.includes(baseSource as SatelliteSource);

    const isCurrSar =
      currSensor === SensorType.SAR ||
      current.monitoringTrack === MonitoringTrack.SAR ||
      SAR_INCOMPATIBLE_WITH_HLS.includes(currSource as SatelliteSource);

    if (isBaseSar || isCurrSar) {
      if (isBaseSar && isCurrSar) {
        return {
          mode: ComparisonMode.NATIVE,
          isCompatible: false,
          requiresHLS: false,
          baselineSource: safeBaseSource,
          currentSource: safeCurrSource,
          baselineSensor: SensorType.SAR,
          currentSensor: SensorType.SAR,
          rejectionCode: HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE,
          reason:
            'SAR-to-SAR observations must not be routed through HLS or OpticalComparisonDecisionService. Use SarCompatibilityService.',
        };
      }

      return {
        mode: ComparisonMode.NATIVE,
        isCompatible: false,
        requiresHLS: false,
        baselineSource: safeBaseSource,
        currentSource: safeCurrSource,
        baselineSensor: isBaseSar ? SensorType.SAR : SensorType.OPTICAL,
        currentSensor: isCurrSar ? SensorType.SAR : SensorType.OPTICAL,
        rejectionCode: HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE,
        reason:
          'SAR observation cannot be paired with optical observation. Cross-track SAR-to-optical comparison is forbidden and must never use HLS.',
      };
    }

    // Explicit monitoring-track mismatch check if tracks are provided
    if (
      baseline.monitoringTrack &&
      current.monitoringTrack &&
      baseline.monitoringTrack !== current.monitoringTrack
    ) {
      return {
        mode: ComparisonMode.NATIVE,
        isCompatible: false,
        requiresHLS: false,
        baselineSource: safeBaseSource,
        currentSource: safeCurrSource,
        baselineSensor: baseSensor !== 'UNKNOWN' ? baseSensor : undefined,
        currentSensor: currSensor !== 'UNKNOWN' ? currSensor : undefined,
        rejectionCode: HLSRejectionCode.SENSOR_TRACK_MISMATCH,
        reason: `Monitoring track mismatch: baseline track (${baseline.monitoringTrack}) does not match current track (${current.monitoringTrack})`,
      };
    }

    // ─── UNSUPPORTED SENSOR COMBINATIONS ──────────────────────────────────────
    if (
      baseSource === SatelliteSource.SRTM ||
      currSource === SatelliteSource.SRTM ||
      baseSensor === SensorType.DEM ||
      currSensor === SensorType.DEM
    ) {
      return {
        mode: ComparisonMode.NATIVE,
        isCompatible: false,
        requiresHLS: false,
        baselineSource: safeBaseSource,
        currentSource: safeCurrSource,
        baselineSensor: baseSensor !== 'UNKNOWN' ? baseSensor : undefined,
        currentSensor: currSensor !== 'UNKNOWN' ? currSensor : undefined,
        rejectionCode: HLSRejectionCode.UNSUPPORTED_SENSOR_COMBINATION,
        reason: 'DEM (SRTM) is not an optical sensor and cannot participate in optical comparison',
      };
    }

    if (baseSource === 'UNKNOWN' || currSource === 'UNKNOWN') {
      return {
        mode: ComparisonMode.NATIVE,
        isCompatible: false,
        requiresHLS: false,
        baselineSource: safeBaseSource,
        currentSource: safeCurrSource,
        baselineSensor: baseSensor !== 'UNKNOWN' ? baseSensor : undefined,
        currentSensor: currSensor !== 'UNKNOWN' ? currSensor : undefined,
        rejectionCode: HLSRejectionCode.UNSUPPORTED_SENSOR_COMBINATION,
        reason: `Cannot resolve satellite source for optical comparison (${baseSource} vs ${currSource})`,
      };
    }

    // ─── RULE 7: GEOMETRY & ZONE INTEGRITY ───────────────────────────────────
    if (baseline.zoneId && current.zoneId && baseline.zoneId !== current.zoneId) {
      return {
        mode: ComparisonMode.NATIVE,
        isCompatible: false,
        requiresHLS: false,
        baselineSource: baseSource,
        currentSource: currSource,
        baselineSensor: SensorType.OPTICAL,
        currentSensor: SensorType.OPTICAL,
        rejectionCode: HLSRejectionCode.GEOMETRY_NOT_INTERSECTING,
        reason: `Cross-zone observation comparison is forbidden: baseline zone (${baseline.zoneId}) does not match current zone (${current.zoneId})`,
      };
    }

    // Footprint bounding-box overlap check
    if (baseline.bounds && current.bounds) {
      const [bMinX, bMinY, bMaxX, bMaxY] = baseline.bounds;
      const [cMinX, cMinY, cMaxX, cMaxY] = current.bounds;
      const hasOverlap = bMinX < cMaxX && bMaxX > cMinX && bMinY < cMaxY && bMaxY > cMinY;
      if (!hasOverlap) {
        return {
          mode: ComparisonMode.NATIVE,
          isCompatible: false,
          requiresHLS: false,
          baselineSource: baseSource,
          currentSource: currSource,
          baselineSensor: SensorType.OPTICAL,
          currentSensor: SensorType.OPTICAL,
          rejectionCode: HLSRejectionCode.GEOMETRY_NOT_INTERSECTING,
          reason: 'Baseline and candidate observation footprints do not intersect geographically',
        };
      }
    }

    // ─── RULE 8: TEMPORAL VALIDITY & DUPLICATE CHECKS ────────────────────────
    const baseIdNorm = (baseline.imageId || '').trim();
    const currIdNorm = (current.imageId || '').trim();

    if (baseIdNorm && currIdNorm && baseIdNorm === currIdNorm) {
      return {
        mode: ComparisonMode.NATIVE,
        isCompatible: false,
        requiresHLS: false,
        baselineSource: baseSource,
        currentSource: currSource,
        baselineSensor: SensorType.OPTICAL,
        currentSensor: SensorType.OPTICAL,
        rejectionCode: HLSRejectionCode.DUPLICATE_OBSERVATION,
        reason: 'Current observation is identical to the baseline observation (same imageId)',
      };
    }

    if (baseline.acquisitionDate && current.acquisitionDate) {
      const baseTime = new Date(baseline.acquisitionDate).getTime();
      const currTime = new Date(current.acquisitionDate).getTime();

      if (!isNaN(baseTime) && !isNaN(currTime)) {
        if (currTime === baseTime && baseIdNorm === currIdNorm) {
          return {
            mode: ComparisonMode.NATIVE,
            isCompatible: false,
            requiresHLS: false,
            baselineSource: baseSource,
            currentSource: currSource,
            baselineSensor: SensorType.OPTICAL,
            currentSensor: SensorType.OPTICAL,
            rejectionCode: HLSRejectionCode.DUPLICATE_OBSERVATION,
            reason: 'Current observation acquisition timestamp is identical to baseline (duplicate observation)',
          };
        }

        if (currTime <= baseTime) {
          return {
            mode: ComparisonMode.NATIVE,
            isCompatible: false,
            requiresHLS: false,
            baselineSource: baseSource,
            currentSource: currSource,
            baselineSensor: SensorType.OPTICAL,
            currentSensor: SensorType.OPTICAL,
            rejectionCode: HLSRejectionCode.TEMPORAL_INELIGIBLE,
            reason: `Current observation acquisition date (${new Date(currTime).toISOString()}) must be strictly after baseline date (${new Date(baseTime).toISOString()})`,
          };
        }
      }
    }

    // ─── RULE 1 & 2: SAME OPTICAL SENSOR FAMILY → NATIVE ─────────────────────
    if (OpticalComparisonDecisionService.isSameOpticalFamily(baseSource, currSource)) {
      // RULE 9: Cloud cover is NOT a fallback to HLS!
      // High cloud remains NATIVE mode.
      const isS2 = baseSource === SatelliteSource.SENTINEL_2;
      const familyName = isS2 ? 'Sentinel-2' : 'Landsat';

      if (
        options.maxCloudCoverThreshold !== undefined &&
        current.cloudCover !== undefined &&
        current.cloudCover > options.maxCloudCoverThreshold
      ) {
        return {
          mode: ComparisonMode.NATIVE,
          isCompatible: false,
          requiresHLS: false,
          baselineSource: baseSource,
          currentSource: currSource,
          baselineSensor: SensorType.OPTICAL,
          currentSensor: SensorType.OPTICAL,
          rejectionCode: RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD,
          reason: `Same-family optical comparison (${familyName}) retained as NATIVE, but cloud cover (${current.cloudCover.toFixed(1)}%) exceeds threshold of ${options.maxCloudCoverThreshold}%. HLS is not a cloud fallback.`,
        };
      }

      return {
        mode: ComparisonMode.NATIVE,
        isCompatible: true,
        requiresHLS: false,
        baselineSource: baseSource,
        currentSource: currSource,
        baselineSensor: SensorType.OPTICAL,
        currentSensor: SensorType.OPTICAL,
        reason: `Same ${familyName} optical sensor family — NATIVE comparison applicable`,
      };
    }

    // ─── RULE 3 & 4: CROSS-SENSOR OPTICAL PAIRING → HLS ───────────────────────
    if (OpticalComparisonDecisionService.isCrossSensorOpticalPair(baseSource, currSource)) {
      const baseProduct = OpticalComparisonDecisionService.resolveHLSProduct(baseSource, baseline.platform);
      const currProduct = OpticalComparisonDecisionService.resolveHLSProduct(currSource, current.platform);

      const baseLabel = baseSource === SatelliteSource.SENTINEL_2 ? 'Sentinel-2' : 'Landsat';
      const currLabel = currSource === SatelliteSource.SENTINEL_2 ? 'Sentinel-2' : 'Landsat';

      return {
        mode: ComparisonMode.HLS,
        isCompatible: true,
        requiresHLS: true,
        baselineSource: baseSource,
        currentSource: currSource,
        baselineSensor: SensorType.OPTICAL,
        currentSensor: SensorType.OPTICAL,
        baselineHLSProduct: baseProduct,
        currentHLSProduct: currProduct,
        reason: `Cross-sensor optical comparison (${baseLabel} vs ${currLabel}) — HLS_REQUIRED`,
      };
    }

    // ─── FALLBACK REJECTION ──────────────────────────────────────────────────
    return {
      mode: ComparisonMode.NATIVE,
      isCompatible: false,
      requiresHLS: false,
      baselineSource: baseSource,
      currentSource: currSource,
      baselineSensor: SensorType.OPTICAL,
      currentSensor: SensorType.OPTICAL,
      rejectionCode: HLSRejectionCode.UNSUPPORTED_SENSOR_COMBINATION,
      reason: `Unsupported optical sensor pair: ${baseSource} ↔ ${currSource}`,
    };
  }

  /**
   * Instance method delegating to static decideComparison for dependency-injection flexibility.
   */
  public decideComparison(
    baseline: ComparisonObservationInput,
    current: ComparisonObservationInput,
    options?: ComparisonDecisionOptions,
  ): OpticalComparisonDecision {
    return OpticalComparisonDecisionService.decideComparison(baseline, current, options);
  }
}
