import {
  RejectionReasonCode,
  SensorType,
  SatelliteSource,
} from '@tn-forest/shared/types';
import { getRejectionReasonLabel } from '@tn-forest/shared/constants';

export interface OpticalObservationMetadata {
  imageId: string;
  source?: SatelliteSource | string;
  sensorType?: SensorType | string;
  platform?: string;
  spacecraftName?: string;
  mission?: string;
  instrument?: string;
  productLevel?: string;
  acquisitionDate?: Date | string;
  cloudCover?: number;
  resolutionMeters?: number;
  crs?: string;
  bounds?: [number, number, number, number];
  bands?: string[];
}

export interface OpticalCompatibilityResult {
  isCompatible: boolean;
  rejectionCode?: RejectionReasonCode;
  reason?: string;
  details?: {
    baselineSource?: string;
    candidateSource?: string;
    baselineSensorFamily?: string;
    candidateSensorFamily?: string;
    baselineResolutionMeters?: number;
    candidateResolutionMeters?: number;
    baselineProductLevel?: string;
    candidateProductLevel?: string;
    baselineAcquisitionDate?: string;
    candidateAcquisitionDate?: string;
    temporalGapDays?: number;
  };
}

export interface ParsedOpticalMetadata {
  sensorFamily: 'Sentinel-2' | 'Landsat-8' | 'Landsat-9' | 'UNKNOWN';
  source: SatelliteSource | string;
  platform: string;
  instrument: string;
  productLevel: string;
  nativeResolutionMeters: number;
  acquisitionDate?: Date;
}

export interface OpticalCompatibilityOptions {
  allowCrossSensorWithNormalization?: boolean;
  maxCloudCoverThreshold?: number;
}

/**
 * Production-grade Centralized Optical Compatibility Engine.
 * Enforces strict sensor family, spatial resolution, and radiometric product level
 * comparability between optical baseline and current observations before spatial harmonization
 * or change detection.
 *
 * Supported comparisons:
 *   Sentinel-2 ↔ Sentinel-2
 *   Landsat-8  ↔ Landsat-8
 *   Landsat-9  ↔ Landsat-9
 *
 * Cross-sensor optical comparisons (e.g. Landsat-8 vs Sentinel-2) are strictly rejected
 * with OPTICAL_SENSOR_MISMATCH because spectral response functions, band bandwidths,
 * spatial resolution (30m vs 10m), and atmospheric correction models differ substantially.
 */
export class OpticalCompatibilityService {
  /**
   * Parses canonical metadata from Earth Engine image IDs or satellite scene strings.
   * e.g.:
   *   COPERNICUS/S2_SR/20260906T050649_20260906T052219_T43PHM -> Sentinel-2 (MSI, L2A, 10m)
   *   LANDSAT/LC08/C02/T1_L2/LC08_143053_20150106 -> Landsat-8 (OLI/TIRS, C2 L2, 30m)
   *   LANDSAT/LC09/C02/T1_L2/LC09_143053_20220215 -> Landsat-9 (OLI-2/TIRS-2, C2 L2, 30m)
   */
  public static parseOpticalMetadata(
    imageId: string,
    rawProperties?: Record<string, unknown>,
  ): ParsedOpticalMetadata {
    const normId = (imageId || '').trim();

    if (/sentinel-?2|s2[ab]|copernicus\/s2/i.test(normId)) {
      const isS2B = /s2b/i.test(normId);
      const isL2A = /_sr|_l2a|level-2a/i.test(normId);
      return {
        sensorFamily: 'Sentinel-2',
        source: SatelliteSource.SENTINEL_2,
        platform: isS2B ? 'Sentinel-2B' : 'Sentinel-2A',
        instrument: 'MSI',
        productLevel: isL2A ? 'L2A_BOA_SR' : 'L1C_TOA_REFLECTANCE',
        nativeResolutionMeters: 10,
      };
    }

    if (/landsat-?8|lc08/i.test(normId)) {
      const isL2 = /c02\/t1_l2|level-2|_sr/i.test(normId);
      return {
        sensorFamily: 'Landsat-8',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        instrument: 'OLI_TIRS',
        productLevel: isL2 ? 'C2_L2_SR' : 'C2_L1_TOA',
        nativeResolutionMeters: 30,
      };
    }

    if (/landsat-?9|lc09/i.test(normId)) {
      const isL2 = /c02\/t1_l2|level-2|_sr/i.test(normId);
      return {
        sensorFamily: 'Landsat-9',
        source: SatelliteSource.LANDSAT_9,
        platform: 'Landsat-9',
        instrument: 'OLI2_TIRS2',
        productLevel: isL2 ? 'C2_L2_SR' : 'C2_L1_TOA',
        nativeResolutionMeters: 30,
      };
    }

    // Fallback checks from rawProperties or spacecraft names
    const sc = String(rawProperties?.spacecraftName || rawProperties?.SPACECRAFT_NAME || '');
    if (/sentinel-?2/i.test(sc)) {
      return {
        sensorFamily: 'Sentinel-2',
        source: SatelliteSource.SENTINEL_2,
        platform: sc,
        instrument: 'MSI',
        productLevel: 'L2A_BOA_SR',
        nativeResolutionMeters: 10,
      };
    }
    if (/landsat.*8/i.test(sc)) {
      return {
        sensorFamily: 'Landsat-8',
        source: SatelliteSource.LANDSAT_8,
        platform: sc,
        instrument: 'OLI_TIRS',
        productLevel: 'C2_L2_SR',
        nativeResolutionMeters: 30,
      };
    }
    if (/landsat.*9/i.test(sc)) {
      return {
        sensorFamily: 'Landsat-9',
        source: SatelliteSource.LANDSAT_9,
        platform: sc,
        instrument: 'OLI2_TIRS2',
        productLevel: 'C2_L2_SR',
        nativeResolutionMeters: 30,
      };
    }

    return {
      sensorFamily: 'UNKNOWN',
      source: 'UNKNOWN',
      platform: 'UNKNOWN',
      instrument: 'UNKNOWN',
      productLevel: 'UNKNOWN',
      nativeResolutionMeters: 10,
    };
  }

  /**
   * Resolves sensor family identifier for compatibility evaluation.
   */
  public static resolveSensorFamily(
    meta: OpticalObservationMetadata,
  ): 'Sentinel-2' | 'Landsat-8' | 'Landsat-9' | 'UNKNOWN' {
    if (meta.source === SatelliteSource.SENTINEL_2) return 'Sentinel-2';
    if (meta.source === SatelliteSource.LANDSAT_8) return 'Landsat-8';
    if (meta.source === SatelliteSource.LANDSAT_9) return 'Landsat-9';

    const parsed = OpticalCompatibilityService.parseOpticalMetadata(meta.imageId, {
      spacecraftName: meta.spacecraftName || meta.platform,
    });
    return parsed.sensorFamily;
  }

  /**
   * Evaluates pairwise compatibility between baseline and candidate optical observations.
   */
  public static evaluateOpticalCompatibility(
    baseline: OpticalObservationMetadata,
    candidate: OpticalObservationMetadata,
    options: OpticalCompatibilityOptions = {},
  ): OpticalCompatibilityResult {
    const baseFamily = OpticalCompatibilityService.resolveSensorFamily(baseline);
    const candFamily = OpticalCompatibilityService.resolveSensorFamily(candidate);

    const baseParsed = OpticalCompatibilityService.parseOpticalMetadata(baseline.imageId, {
      spacecraftName: baseline.spacecraftName || baseline.platform,
    });
    const candParsed = OpticalCompatibilityService.parseOpticalMetadata(candidate.imageId, {
      spacecraftName: candidate.spacecraftName || candidate.platform,
    });

    const baseRes = baseline.resolutionMeters || baseParsed.nativeResolutionMeters;
    const candRes = candidate.resolutionMeters || candParsed.nativeResolutionMeters;

    const baseProduct = baseline.productLevel || baseParsed.productLevel;
    const candProduct = candidate.productLevel || candParsed.productLevel;

    const baseAcq = baseline.acquisitionDate ? new Date(baseline.acquisitionDate) : undefined;
    const candAcq = candidate.acquisitionDate ? new Date(candidate.acquisitionDate) : undefined;

    let temporalGapDays: number | undefined;
    if (baseAcq && candAcq && !isNaN(baseAcq.getTime()) && !isNaN(candAcq.getTime())) {
      temporalGapDays = Math.round((candAcq.getTime() - baseAcq.getTime()) / (1000 * 60 * 60 * 24));
    }

    const details = {
      baselineSource: String(baseline.source || baseParsed.source),
      candidateSource: String(candidate.source || candParsed.source),
      baselineSensorFamily: baseFamily,
      candidateSensorFamily: candFamily,
      baselineResolutionMeters: baseRes,
      candidateResolutionMeters: candRes,
      baselineProductLevel: baseProduct,
      candidateProductLevel: candProduct,
      baselineAcquisitionDate: baseAcq ? baseAcq.toISOString() : undefined,
      candidateAcquisitionDate: candAcq ? candAcq.toISOString() : undefined,
      temporalGapDays,
    };

    // 1. Evaluate Sensor Family Compatibility
    if (baseFamily === 'UNKNOWN' || candFamily === 'UNKNOWN') {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.OTHER,
        reason: `Could not definitively determine optical sensor family for comparison (${baseFamily} vs ${candFamily})`,
        details,
      };
    }

    const isCrossSensor = baseFamily !== candFamily;
    if (isCrossSensor) {
      if (!options.allowCrossSensorWithNormalization) {
        return {
          isCompatible: false,
          rejectionCode: RejectionReasonCode.OPTICAL_SENSOR_MISMATCH,
          reason: `Cross-sensor optical comparison (${baseFamily} vs ${candFamily}) is rejected without validated cross-sensor radiometric normalization`,
          details,
        };
      }
    }

    // 2. Spatial Resolution Evaluation
    if (Math.abs(baseRes - candRes) > 5 && !options.allowCrossSensorWithNormalization) {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.OPTICAL_RESOLUTION_MISMATCH,
        reason: `Spatial resolution mismatch (${baseRes}m vs ${candRes}m) exceeds acceptable single-sensor tolerance`,
        details,
      };
    }

    // 3. Product Level Evaluation (ensure surface reflectance is compared with surface reflectance)
    const isBaseL2 = /sr|l2|c2_l2/i.test(baseProduct);
    const isCandL2 = /sr|l2|c2_l2/i.test(candProduct);
    if (isBaseL2 !== isCandL2 && baseProduct !== 'UNKNOWN' && candProduct !== 'UNKNOWN') {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.OPTICAL_PRODUCT_LEVEL_MISMATCH,
        reason: `Reflectance product level mismatch: baseline is ${baseProduct} while current observation is ${candProduct}`,
        details,
      };
    }

    // 4. Cloud Cover Filtering (if configured)
    if (
      options.maxCloudCoverThreshold !== undefined &&
      candidate.cloudCover !== undefined &&
      candidate.cloudCover > options.maxCloudCoverThreshold
    ) {
      return {
        isCompatible: false,
        rejectionCode: RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD,
        reason: `Current observation cloud cover (${candidate.cloudCover.toFixed(1)}%) exceeds threshold of ${options.maxCloudCoverThreshold}%`,
        details,
      };
    }

    // 5. Geographic Bounding Box Overlap Check (if bounds available: [minX, minY, maxX, maxY])
    if (baseline.bounds && candidate.bounds) {
      const [bMinX, bMinY, bMaxX, bMaxY] = baseline.bounds;
      const [cMinX, cMinY, cMaxX, cMaxY] = candidate.bounds;
      const hasOverlap = bMinX < cMaxX && bMaxX > cMinX && bMinY < cMaxY && bMaxY > cMinY;
      if (!hasOverlap) {
        return {
          isCompatible: false,
          rejectionCode: RejectionReasonCode.GEOMETRY_NOT_INTERSECTING,
          reason: 'Baseline and candidate observation footprints do not intersect geographically',
          details,
        };
      }
    }

    return {
      isCompatible: true,
      details,
    };
  }
}
