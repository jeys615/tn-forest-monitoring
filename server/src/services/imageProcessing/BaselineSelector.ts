import { SensorType, SatelliteSource, BaselineStatus } from '@tn-forest/shared/types';
import { type ISatelliteMetadata } from '../../models/SatelliteMetadata.js';

export interface CandidateEvaluationResult {
  isEligible: boolean;
  qualityScore: number;
  status: BaselineStatus;
  selectionReason: string;
  cloudCover: number | null;
  validPixelPercentage: number;
}

export class BaselineSelector {
  public static evaluateOpticalCandidate(
    metadata: ISatelliteMetadata,
    maxCloudThreshold: number = 20.0,
    hasUnresolvedIncident: boolean = false,
  ): CandidateEvaluationResult {
    const cloudCover = metadata.cloudCover;

    // RULE 3: Cloudy optical imagery failing quality threshold must NOT become an optical baseline
    if (cloudCover > maxCloudThreshold) {
      return {
        isEligible: false,
        qualityScore: Math.max(0, 100 - cloudCover * 2),
        status: BaselineStatus.REJECTED,
        selectionReason: `Optical cloud cover ${cloudCover.toFixed(1)}% exceeds configured baseline threshold of ${maxCloudThreshold}%`,
        cloudCover,
        validPixelPercentage: Number((100 - cloudCover).toFixed(1)),
      };
    }

    // RULE 8: If the zone has an unresolved incident/alert, freeze/block baseline candidate
    if (hasUnresolvedIncident) {
      return {
        isEligible: false,
        qualityScore: Number((100 - cloudCover).toFixed(1)),
        status: BaselineStatus.FROZEN,
        selectionReason: `Automatic optical baseline replacement blocked: zone has active unresolved incident/alert`,
        cloudCover,
        validPixelPercentage: Number((100 - cloudCover).toFixed(1)),
      };
    }

    // Deterministic scoring formulation
    const cloudScore = (100 - cloudCover) * 0.5; // Max 50 pts
    const sensorWeight =
      metadata.source === SatelliteSource.SENTINEL_2
        ? 40
        : metadata.source === SatelliteSource.LANDSAT_9
          ? 38
          : 35; // Max 40 pts
    const completenessScore = 10; // 10 pts

    const totalScore = Number((cloudScore + sensorWeight + completenessScore).toFixed(1));

    return {
      isEligible: true,
      qualityScore: totalScore,
      status: BaselineStatus.CANDIDATE,
      selectionReason: `High-quality optical candidate selected (${metadata.source}, Cloud Cover: ${cloudCover.toFixed(1)}%, Score: ${totalScore})`,
      cloudCover,
      validPixelPercentage: Number((100 - cloudCover).toFixed(1)),
    };
  }

  public static evaluateSarCandidate(
    metadata: ISatelliteMetadata,
    hasUnresolvedIncident: boolean = false,
  ): CandidateEvaluationResult {
    // RULE 4: SAR imagery is independent of optical cloud cover

    if (hasUnresolvedIncident) {
      return {
        isEligible: false,
        qualityScore: 90.0,
        status: BaselineStatus.FROZEN,
        selectionReason: `Automatic SAR baseline replacement blocked: zone has active unresolved incident/alert`,
        cloudCover: null,
        validPixelPercentage: 100.0,
      };
    }

    const polarization = String(metadata.metadata?.polarization || 'VV+VH');
    const polScore = polarization.includes('VV') && polarization.includes('VH') ? 50 : 35;
    const modeScore = metadata.metadata?.acquisitionMode === 'IW' ? 40 : 30;
    const qualityScore = Number((polScore + modeScore + 10).toFixed(1));

    return {
      isEligible: true,
      qualityScore,
      status: BaselineStatus.CANDIDATE,
      selectionReason: `Valid SAR candidate selected (${metadata.source}, Mode: ${metadata.metadata?.acquisitionMode || 'IW'}, Polarization: ${polarization}, Score: ${qualityScore})`,
      cloudCover: null,
      validPixelPercentage: 100.0,
    };
  }

  public static evaluateCandidate(
    metadata: ISatelliteMetadata,
    maxCloudThreshold: number = 20.0,
    hasUnresolvedIncident: boolean = false,
  ): CandidateEvaluationResult {
    const sensor =
      metadata.sensorType ||
      (metadata.source === SatelliteSource.SENTINEL_1 ? SensorType.SAR : SensorType.OPTICAL);
    if (sensor === SensorType.SAR) {
      return this.evaluateSarCandidate(metadata, hasUnresolvedIncident);
    }
    return this.evaluateOpticalCandidate(metadata, maxCloudThreshold, hasUnresolvedIncident);
  }
}
