import {
  CrossSensorAgreement,
  type EvidenceBreakdownDto,
} from '@tn-forest/shared/types';

export class EvidenceScoreCalculator {
  /**
   * Computes a deterministic, fully explainable Evidence Strength Score (0–100)
   * composed of Change Magnitude (40%), Data Quality (20%), Temporal Consistency (20%),
   * and Cross-Sensor Agreement (20%).
   */
  public static calculateEvidenceScore(params: {
    affectedAreaPercentage: number;
    imageQualityScore: number; // 0–100
    hasTemporalHistory: boolean;
    isTemporallyConsistent: boolean;
    crossSensorAgreement: CrossSensorAgreement;
  }): EvidenceBreakdownDto {
    const {
      affectedAreaPercentage,
      imageQualityScore,
      hasTemporalHistory,
      isTemporallyConsistent,
      crossSensorAgreement,
    } = params;

    // 1. Change Magnitude Score (Weight: 40%)
    let magnitudeScore = 0;
    if (affectedAreaPercentage < 2.0) {
      magnitudeScore = (affectedAreaPercentage / 2.0) * 10.0; // 0–10 pts
    } else if (affectedAreaPercentage < 5.0) {
      magnitudeScore = 10.0 + ((affectedAreaPercentage - 2.0) / 3.0) * 15.0; // 10–25 pts
    } else if (affectedAreaPercentage < 10.0) {
      magnitudeScore = 25.0 + ((affectedAreaPercentage - 5.0) / 5.0) * 10.0; // 25–35 pts
    } else {
      magnitudeScore = Math.min(40.0, 35.0 + ((affectedAreaPercentage - 10.0) / 10.0) * 5.0); // 35–40 pts
    }
    magnitudeScore = Number(magnitudeScore.toFixed(1));

    // 2. Data Quality Score (Weight: 20%)
    const clampedQuality = Math.max(0, Math.min(100, imageQualityScore));
    const dataQualityScore = Number(((clampedQuality / 100.0) * 20.0).toFixed(1));

    // 3. Temporal Consistency Score (Weight: 20%)
    let temporalConsistencyScore = 10.0; // Neutral baseline for single/unconfirmed observation
    if (hasTemporalHistory) {
      if (isTemporallyConsistent) {
        temporalConsistencyScore = 20.0; // High confidence from multi-pass confirmation
      } else {
        temporalConsistencyScore = 5.0; // Inconsistent temporal pattern
      }
    }
    temporalConsistencyScore = Number(temporalConsistencyScore.toFixed(1));

    // 4. Cross-Sensor Agreement Score (Weight: 20%)
    let crossSensorScore = 10.0; // Default for single sensor track
    switch (crossSensorAgreement) {
      case CrossSensorAgreement.HIGH:
        crossSensorScore = 20.0;
        break;
      case CrossSensorAgreement.MODERATE:
        crossSensorScore = 14.0;
        break;
      case CrossSensorAgreement.SINGLE_SENSOR:
        crossSensorScore = 10.0;
        break;
      case CrossSensorAgreement.LOW:
        crossSensorScore = 5.0;
        break;
      case CrossSensorAgreement.DISAGREEMENT:
        crossSensorScore = 2.0;
        break;
    }

    const totalEvidenceScore = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          magnitudeScore + dataQualityScore + temporalConsistencyScore + crossSensorScore,
        ),
      ),
    );

    const explanation = `Evidence Strength: ${totalEvidenceScore}/100 [Magnitude: ${magnitudeScore}/40, Data Quality: ${dataQualityScore}/20, Temporal: ${temporalConsistencyScore}/20, Cross-Sensor: ${crossSensorScore}/20]`;

    return {
      magnitudeScore,
      dataQualityScore,
      temporalConsistencyScore,
      crossSensorScore,
      totalEvidenceScore,
      explanation,
    };
  }
}
