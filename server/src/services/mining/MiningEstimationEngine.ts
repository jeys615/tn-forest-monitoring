import {
  MiningClassification,
  type OpticalMetrics,
  type SarMetrics,
  type ChangeDetectionDto,
} from '@tn-forest/shared/types';

export interface MiningClassificationInput {
  changeDetection: ChangeDetectionDto;
  opticalMetrics?: OpticalMetrics;
  sarMetrics?: SarMetrics;
  isProgressiveExpansion?: boolean;
  consecutiveChangeObservations?: number;
}

export interface VolumeEstimationInput {
  changedAreaSquareMeters: number;
  demElevationDataAvailable?: boolean;
  estimatedMeanDepthMeters?: number;
  evidenceStrength?: number;
}

export interface VolumeEstimationOutput {
  isVolumeAvailable: boolean;
  volumeUnavailableReason?: string;
  estimatedDepthMeters?: number;
  estimatedVolumeCubicMeters?: number;
  volumeUnit: string;
  estimationMethod: string;
  estimationConfidence: number;
  disclaimer: string;
}

export class MiningEstimationEngine {
  /**
   * Evaluates spectral indicators, SAR shifts, and multi-temporal patterns
   * to deterministically classify land disturbance and extraction activities.
   *
   * Crucial rule: Does NOT classify every bare soil change as mining.
   */
  public static classifyMiningActivity(input: MiningClassificationInput): {
    classification: MiningClassification;
    confidence: number;
    explanation: string;
  } {
    const { changeDetection, opticalMetrics, sarMetrics, isProgressiveExpansion, consecutiveChangeObservations = 1 } =
      input;

    const affectedPct = changeDetection.affectedAreaPercentage;
    const evidenceStrength = changeDetection.evidenceStrength || 50;

    // Check optical indicators
    const ndvi = opticalMetrics?.ndvi ?? 0.5;
    const bsi = opticalMetrics?.bsi ?? 0.0;
    const ndbi = opticalMetrics?.ndbi ?? 0.0;

    // Check SAR indicators
    const vhDiff = sarMetrics?.vhDifference ?? 0.0;
    const ratioDiff = sarMetrics?.ratioDifference ?? 0.0;

    // 1. Excavation expansion / quarry expansion:
    // Requires high affected area, strong evidence, persistent progressive expansion or major SAR backscatter delta
    if (
      (affectedPct >= 10.0 && (isProgressiveExpansion || consecutiveChangeObservations >= 2)) ||
      (bsi > 0.35 && ndbi > 0.25 && Math.abs(vhDiff) > 2.0)
    ) {
      if (Math.abs(ratioDiff) > 1.5 || bsi > 0.4) {
        return {
          classification: MiningClassification.QUARRY_EXPANSION,
          confidence: Math.min(95, evidenceStrength + 10),
          explanation: `Strong multi-sensor signature indicating active quarry excavation expansion (Affected: ${affectedPct.toFixed(1)}%, high bare soil index ${bsi.toFixed(2)}, structural SAR shift ${vhDiff.toFixed(1)} dB).`,
        };
      }
      return {
        classification: MiningClassification.EXCAVATION_EXPANSION,
        confidence: Math.min(90, evidenceStrength + 5),
        explanation: `Progressive spatial enlargement with sustained surface excavation signature across observations (Affected: ${affectedPct.toFixed(1)}%).`,
      };
    }

    // 2. Stockpile change / Heavy Surface Disturbance
    if (Math.abs(vhDiff) > 2.5 && affectedPct >= 5.0) {
      return {
        classification: MiningClassification.STOCKPILE_CHANGE,
        confidence: Math.min(85, evidenceStrength),
        explanation: `Volumetric displacement and rough surface texture alteration consistent with material stockpile or overburden dump modification.`,
      };
    }

    // 3. Possible Mining Activity vs General Bare Soil
    // When bare soil is elevated but evidence is moderate or unconfirmed
    if (bsi > 0.25 || ndbi > 0.15) {
      if (affectedPct >= 5.0 && evidenceStrength >= 65) {
        return {
          classification: MiningClassification.POSSIBLE_MINING_ACTIVITY,
          confidence: Math.max(50, Math.min(75, evidenceStrength)),
          explanation: `Moderate surface bareness and structural disturbance indicating possible mining or extraction activity; ground verification recommended.`,
        };
      }
      return {
        classification: MiningClassification.BARE_SOIL_EXPOSURE,
        confidence: Math.max(40, Math.min(70, evidenceStrength)),
        explanation: `Increased bare soil reflectance detected without definitive excavation or structural mining indicators.`,
      };
    }

    // 4. Vegetation clearance
    if (ndvi < 0.3 && changeDetection.categories.some((c) => c.includes('VEGETATION'))) {
      return {
        classification: MiningClassification.VEGETATION_CLEARANCE,
        confidence: Math.min(85, evidenceStrength),
        explanation: `Significant canopy loss and vegetation index depletion observed.`,
      };
    }

    // 5. General surface disturbance
    if (affectedPct >= 2.0) {
      return {
        classification: MiningClassification.SURFACE_DISTURBANCE,
        confidence: Math.min(65, evidenceStrength),
        explanation: `Measurable surface alteration above threshold (${affectedPct.toFixed(1)}%), but characteristic mining patterns are unconfirmed.`,
      };
    }

    return {
      classification: MiningClassification.NON_MINING_DISTURBANCE,
      confidence: 50,
      explanation: `Minor environmental fluctuation below actionable extraction thresholds.`,
    };
  }

  /**
   * Calculates satellite-derived volumetric extraction estimate.
   *
   * Invariant: Never fabricates depth. If elevation/DEM data is missing,
   * explicitly reports volume unavailable.
   */
  public static estimateExtractionVolume(input: VolumeEstimationInput): VolumeEstimationOutput {
    const {
      changedAreaSquareMeters,
      demElevationDataAvailable,
      estimatedMeanDepthMeters,
      evidenceStrength = 50,
    } = input;

    const disclaimer =
      'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.';

    if (
      !demElevationDataAvailable ||
      estimatedMeanDepthMeters === undefined ||
      estimatedMeanDepthMeters <= 0
    ) {
      return {
        isVolumeAvailable: false,
        volumeUnavailableReason:
          'Volume estimation unavailable — elevation/depth data required.',
        volumeUnit: 'CUBIC_METERS',
        estimationMethod: 'UNAVAILABLE',
        estimationConfidence: 0,
        disclaimer,
      };
    }

    // V = Area (m2) * Depth (m)
    const volumeCubicMeters = Math.round(changedAreaSquareMeters * estimatedMeanDepthMeters * 100) / 100;
    const confidence = Math.min(85, Math.max(30, Math.round(evidenceStrength * 0.85)));

    return {
      isVolumeAvailable: true,
      estimatedDepthMeters: estimatedMeanDepthMeters,
      estimatedVolumeCubicMeters: volumeCubicMeters,
      volumeUnit: 'CUBIC_METERS',
      estimationMethod: 'DEM_ELEVATION_DIFFERENCE',
      estimationConfidence: confidence,
      disclaimer,
    };
  }
}
