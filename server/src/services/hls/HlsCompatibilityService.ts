/**
 * HlsCompatibilityService — Authoritative Sensor Compatibility & Routing Engine
 *
 * Implements Section 5 of the HLS Cross-Sensor Specification:
 *   Case A — Same Compatible Optical Sensor Family (Sentinel-2 ↔ Sentinel-2, Landsat ↔ Landsat)
 *            → NATIVE Normal Optical Pipeline.
 *   Case B — Different Optical Sensor Families (Sentinel-2 ↔ Landsat)
 *            → HLS Cross-Sensor Pipeline.
 *   Case C — Unsupported Combinations (SAR ↔ Optical, DEM ↔ Optical)
 *            → Hard Rejection.
 *
 * INVARIANTS:
 *   1. SAR is NEVER routed through HLS under any circumstances.
 *   2. High cloud cover on same-family images remains NATIVE (HLS is not a cloud fallback).
 *   3. Pure functional, deterministic decisions with complete error attribution.
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
  OpticalComparisonDecisionService,
  type ComparisonObservationInput,
  type ComparisonDecisionOptions,
} from '../spatial/OpticalComparisonDecisionService.js';

export interface HlsRoutingResult {
  route: 'NORMAL_OPTICAL_PIPELINE' | 'HLS_CROSS_SENSOR_PIPELINE' | 'REJECT';
  mode: ComparisonMode;
  isCrossSensor: boolean;
  requiresHLS: boolean;
  isCompatible: boolean;
  baselineProduct?: HLSProduct;
  currentProduct?: HLSProduct;
  reason: string;
  rejectionCode?: HLSRejectionCode | RejectionReasonCode;
}

export class HlsCompatibilityService {
  /**
   * Evaluates sensor compatibility and returns the authoritative routing decision.
   */
  public static routeSensors(
    baseline: ComparisonObservationInput,
    current: ComparisonObservationInput,
    options: ComparisonDecisionOptions = {},
  ): HlsRoutingResult {
    const decision: OpticalComparisonDecision = OpticalComparisonDecisionService.decideComparison(
      baseline,
      current,
      options,
    );

    if (!decision.isCompatible) {
      return {
        route: 'REJECT',
        mode: decision.mode,
        isCrossSensor: false,
        requiresHLS: false,
        isCompatible: false,
        reason: decision.reason,
        rejectionCode: decision.rejectionCode,
      };
    }

    if (decision.mode === ComparisonMode.HLS && decision.requiresHLS) {
      return {
        route: 'HLS_CROSS_SENSOR_PIPELINE',
        mode: ComparisonMode.HLS,
        isCrossSensor: true,
        requiresHLS: true,
        isCompatible: true,
        baselineProduct: decision.baselineHLSProduct,
        currentProduct: decision.currentHLSProduct,
        reason: decision.reason,
      };
    }

    // Default: Same optical sensor family -> NATIVE normal optical pipeline
    return {
      route: 'NORMAL_OPTICAL_PIPELINE',
      mode: ComparisonMode.NATIVE,
      isCrossSensor: false,
      requiresHLS: false,
      isCompatible: true,
      reason: decision.reason,
    };
  }

  /**
   * Helper that asserts whether a given pair is valid for HLS cross-sensor processing.
   */
  public static isHlsEligible(
    baseline: ComparisonObservationInput,
    current: ComparisonObservationInput,
  ): boolean {
    const result = HlsCompatibilityService.routeSensors(baseline, current);
    return result.route === 'HLS_CROSS_SENSOR_PIPELINE' && result.isCompatible;
  }
}
