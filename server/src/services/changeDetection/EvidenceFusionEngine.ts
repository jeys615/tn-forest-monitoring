import {
  AlertSeverity,
  CrossSensorAgreement,
  SensorType,
  type EvidenceBreakdownDto,
  type SpatialChangeResult,
  type ChangeCategory,
} from '@tn-forest/shared/types';
import { CHANGE_THRESHOLDS } from '@tn-forest/shared/constants';
import { EvidenceScoreCalculator } from './EvidenceScoreCalculator.js';
import { type IChangeDetection } from '../../models/ChangeDetection.js';

export interface FusionEvaluationResult {
  threshold2Crossed: boolean;
  threshold5Crossed: boolean;
  threshold10Crossed: boolean;
  highestThresholdCrossed: number;
  thresholdsCrossed: number[];
  severity: AlertSeverity | 'NONE';
  evidenceStrength: number;
  evidenceBreakdown: EvidenceBreakdownDto;
  crossSensorAgreement: CrossSensorAgreement;
  temporalConsistency: string;
  explanation: string;
  shouldGenerateAlert: boolean;
}

export class EvidenceFusionEngine {
  /**
   * Evaluates multi-thresholds (2%, 5%, 10%), cross-sensor consistency, temporal history,
   * and evidence strength to generate an explainable fusion result.
   */
  public static evaluateFusion(params: {
    zoneName: string;
    zoneIdStr: string;
    primarySensorType: SensorType;
    primarySpatialResult: SpatialChangeResult;
    secondarySpatialResult?: SpatialChangeResult;
    imageQualityScore: number;
    categories: ChangeCategory[];
    historicalChanges: IChangeDetection[];
    isCloudFallbackTriggered?: boolean;
    cloudCover?: number;
  }): FusionEvaluationResult {
    const {
      zoneName,
      zoneIdStr,
      primarySensorType,
      primarySpatialResult,
      secondarySpatialResult,
      imageQualityScore,
      categories,
      historicalChanges,
      isCloudFallbackTriggered,
      cloudCover,
    } = params;

    const area = primarySpatialResult.affectedAreaPercentage;

    // 1. Evaluate Multi-Thresholds
    const threshold2Crossed = area >= CHANGE_THRESHOLDS.LOW;
    const threshold5Crossed = area >= CHANGE_THRESHOLDS.MEDIUM;
    const threshold10Crossed = area >= CHANGE_THRESHOLDS.HIGH;

    const thresholdsCrossed: number[] = [];
    if (threshold2Crossed) thresholdsCrossed.push(CHANGE_THRESHOLDS.LOW);
    if (threshold5Crossed) thresholdsCrossed.push(CHANGE_THRESHOLDS.MEDIUM);
    if (threshold10Crossed) thresholdsCrossed.push(CHANGE_THRESHOLDS.HIGH);

    let highestThresholdCrossed = 0;
    let severity: AlertSeverity | 'NONE' = 'NONE';

    if (threshold10Crossed) {
      highestThresholdCrossed = CHANGE_THRESHOLDS.HIGH;
      severity = AlertSeverity.HIGH;
    } else if (threshold5Crossed) {
      highestThresholdCrossed = CHANGE_THRESHOLDS.MEDIUM;
      severity = AlertSeverity.MEDIUM;
    } else if (threshold2Crossed) {
      highestThresholdCrossed = CHANGE_THRESHOLDS.LOW;
      severity = AlertSeverity.LOW;
    }

    const shouldGenerateAlert = severity !== 'NONE';

    // 2. Evaluate Cross-Sensor Agreement
    let crossSensorAgreement: CrossSensorAgreement = CrossSensorAgreement.SINGLE_SENSOR;
    if (secondarySpatialResult) {
      const diff = Math.abs(area - secondarySpatialResult.affectedAreaPercentage);
      if (diff <= 2.0) {
        crossSensorAgreement = CrossSensorAgreement.HIGH;
      } else if (diff <= 4.0) {
        crossSensorAgreement = CrossSensorAgreement.MODERATE;
      } else if (diff <= 6.0) {
        crossSensorAgreement = CrossSensorAgreement.LOW;
      } else {
        crossSensorAgreement = CrossSensorAgreement.DISAGREEMENT;
      }
    }

    // 3. Evaluate Temporal Consistency
    let hasTemporalHistory = false;
    let isTemporallyConsistent = false;
    let temporalConsistency = 'INSUFFICIENT_HISTORY';

    if (historicalChanges && historicalChanges.length > 0) {
      hasTemporalHistory = true;
      const recentChanges = historicalChanges.slice(0, 3);
      const consistentCount = recentChanges.filter(
        (c) => Math.abs(c.affectedAreaPercentage - area) <= 4.0,
      ).length;

      if (consistentCount >= 1) {
        isTemporallyConsistent = true;
        temporalConsistency = `CONFIRMED_BY_HISTORY (${consistentCount} recent matching observations)`;
      } else {
        isTemporallyConsistent = false;
        temporalConsistency = 'TEMPORALLY_INCONSISTENT_TREND';
      }
    }

    // 4. Calculate Explainable Evidence Strength Score
    const evidenceBreakdown = EvidenceScoreCalculator.calculateEvidenceScore({
      affectedAreaPercentage: area,
      imageQualityScore,
      hasTemporalHistory,
      isTemporallyConsistent,
      crossSensorAgreement,
    });

    // 5. Construct Human-Readable Explanation
    const categoryLabels = categories.map((c) => c.replace(/_/g, ' ')).join(', ');
    const simDisclaimer =
      primarySpatialResult.calculationMode === 'SIMULATED'
        ? ' Derived from simulated/local processing (not confirmed raw changed-pixel mask).'
        : ' Confirmed via real satellite raster analysis.';

    let explanation = '';
    if (isCloudFallbackTriggered && primarySensorType === SensorType.SAR) {
      explanation = `Optical observation was degraded by ${cloudCover?.toFixed(1) || 'high'}% cloud cover. Sentinel-1 SAR observation was used as an independent evidence source and detected surface change affecting approximately ${area}% of monitored zone ${zoneName} (${zoneIdStr}). Highest crossed threshold: ${highestThresholdCrossed}%. Category: ${categoryLabels}.${simDisclaimer} ${evidenceBreakdown.explanation}`;
    } else if (shouldGenerateAlert) {
      let crossSensorNarrative = '';
      if (secondarySpatialResult) {
        crossSensorNarrative = ` Cross-sensor agreement between Optical and SAR is ${crossSensorAgreement}.`;
      }
      explanation = `Change detected across approximately ${area}% of monitored zone ${zoneName} (${zoneIdStr}). Primary evidence source: ${primarySensorType}. Detected patterns: ${categoryLabels}. Highest threshold crossed: ${highestThresholdCrossed}% (Severity: ${severity}).${crossSensorNarrative}${simDisclaimer} ${evidenceBreakdown.explanation}`;
    } else {
      explanation = `Observation evaluated for zone ${zoneName} (${zoneIdStr}). Detected change of ${area}% is below the minimum alert threshold (${CHANGE_THRESHOLDS.LOW}%). No alert generated.${simDisclaimer} ${evidenceBreakdown.explanation}`;
    }

    return {
      threshold2Crossed,
      threshold5Crossed,
      threshold10Crossed,
      highestThresholdCrossed,
      thresholdsCrossed,
      severity,
      evidenceStrength: evidenceBreakdown.totalEvidenceScore,
      evidenceBreakdown,
      crossSensorAgreement,
      temporalConsistency,
      explanation,
      shouldGenerateAlert,
    };
  }
}
