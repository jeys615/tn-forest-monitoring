import { Types } from 'mongoose';
import {
  MarkedAreaType,
  SensorType,
  SatelliteSource,
  AlertSeverity,
  MiningClassification,
  type MarkedAreaAnalysisRequest,
  type MarkedAreaAnalysisReportDto,
  type MarkedAreaCalculationResultDto,
  type TemporaryAreaTimelineItemDto,
  type BaselineDto,
} from '@tn-forest/shared/types';
import { SatelliteMetadataRepository } from '../repositories/SatelliteMetadataRepository.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import { ProcessedImageResultRepository } from '../repositories/ProcessedImageResultRepository.js';
import { ChangeDetectionRepository } from '../repositories/ChangeDetectionRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { MiningExtractionEstimateRepository } from '../repositories/MiningExtractionEstimateRepository.js';
import { ImageProcessingService } from './ImageProcessingService.js';
import { ChangeDetectionService } from './ChangeDetectionService.js';
import { BaselineService } from './BaselineService.js';
import { MiningEstimationEngine } from './mining/MiningEstimationEngine.js';
import type { ISatelliteMetadata } from '../models/SatelliteMetadata.js';

export class MarkedAreaAnalysisService {
  private satelliteRepo: SatelliteMetadataRepository;
  private baselineRepo: BaselineRepository;
  private processedResultRepo: ProcessedImageResultRepository;
  private changeRepo: ChangeDetectionRepository;
  private alertRepo: AlertRepository;
  private miningEstimateRepo: MiningExtractionEstimateRepository;
  private imageProcessingService: ImageProcessingService;
  private changeDetectionService: ChangeDetectionService;
  private baselineService: BaselineService;

  constructor() {
    this.satelliteRepo = new SatelliteMetadataRepository();
    this.baselineRepo = new BaselineRepository();
    this.processedResultRepo = new ProcessedImageResultRepository();
    this.changeRepo = new ChangeDetectionRepository();
    this.alertRepo = new AlertRepository();
    this.miningEstimateRepo = new MiningExtractionEstimateRepository();
    this.imageProcessingService = new ImageProcessingService();
    this.changeDetectionService = new ChangeDetectionService();
    this.baselineService = new BaselineService();
  }

  /**
   * Universal marked-area analysis orchestrator for both PERMANENT zones and TEMPORARY areas.
   * Executes local image processing, change detection, 2%/5%/10% alerting,
   * Evidence Strength scoring, mining classification, and volumetric extraction estimation.
   */
  async analyzeMarkedArea(request: MarkedAreaAnalysisRequest): Promise<MarkedAreaAnalysisReportDto> {
    const {
      areaId,
      areaType,
      areaName = `Marked Area ${areaId}`,
      boundary,
      areaHectares,
      demElevationDataAvailable = false,
      estimatedMeanDepthMeters,
    } = request;

    const isPermanent = areaType === MarkedAreaType.PERMANENT;

    // 1. Resolve date range
    const startDate = request.startDate
      ? new Date(request.startDate)
      : new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const endDate = request.endDate ? new Date(request.endDate) : new Date();

    // 2. Query satellite observations intersecting the polygon boundary
    const intersectingObs = await this.satelliteRepo.findIntersecting(boundary);
    const inRange = intersectingObs.filter((obs: ISatelliteMetadata) => {
      const d = new Date(obs.acquisitionDate);
      return d >= startDate && d <= endDate;
    });

    // Chronological order (earliest first)
    inRange.sort(
      (a: ISatelliteMetadata, b: ISatelliteMetadata) =>
        new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime(),
    );

    // 3. Partition observations by sensor track
    const opticalObservations = inRange.filter(
      (o: ISatelliteMetadata) =>
        o.sensorType === SensorType.OPTICAL ||
        o.source === SatelliteSource.SENTINEL_2 ||
        o.source === SatelliteSource.LANDSAT_8 ||
        o.source === SatelliteSource.LANDSAT_9,
    );

    const sarObservations = inRange.filter(
      (o: ISatelliteMetadata) =>
        o.sensorType === SensorType.SAR || o.source === SatelliteSource.SENTINEL_1,
    );

    // 4. Resolve baseline/reference
    let activeBaseline: BaselineDto | null = null;
    if (isPermanent && Types.ObjectId.isValid(areaId)) {
      activeBaseline = await this.baselineService.getActiveBaseline(areaId, SensorType.OPTICAL);
    }

    const opticalRef =
      opticalObservations.find((o: ISatelliteMetadata) => o.cloudCover <= 20.0) || opticalObservations[0];
    const sarRef = sarObservations[0];

    const allOpticalCloudy =
      opticalObservations.length > 0 && opticalObservations.every((o: ISatelliteMetadata) => o.cloudCover > 20.0);

    // Clean up previous mining estimates for this markedAreaId
    await this.miningEstimateRepo.deleteByMarkedAreaId(areaId);

    const calculationResults: MarkedAreaCalculationResultDto[] = [];
    const timeline: TemporaryAreaTimelineItemDto[] = [];

    // Determine target sequence (fallback to SAR if optical is heavily cloudy/absent)
    const targetSequence =
      allOpticalCloudy || opticalObservations.length === 0 ? sarObservations : opticalObservations;

    const activeRef =
      allOpticalCloudy || opticalObservations.length === 0 ? sarRef : opticalRef;

    let previousAreaHa = 0;
    let cumulativeAreaHa = 0;

    for (let i = 0; i < targetSequence.length; i++) {
      const currentObs = targetSequence[i];
      if (!activeRef && !activeBaseline) continue;

      // Skip self-comparison if list has multiple observations
      if (activeRef && currentObs.id === activeRef.id && targetSequence.length > 1) {
        await this.imageProcessingService.processImage({
          satelliteMetadataId: currentObs.id,
          zoneId: isPermanent ? areaId : undefined,
          temporaryAreaId: !isPermanent ? areaId : undefined,
          sensorType: currentObs.sensorType,
        });
        continue;
      }

      // Execute M6 change detection
      const changeResult = await this.changeDetectionService.detectChange({
        zoneId: isPermanent ? areaId : undefined,
        temporaryAreaId: !isPermanent ? areaId : undefined,
        boundary,
        observationId: currentObs.id,
        baselineId: activeBaseline?.id,
        referenceObservationId: activeRef?.id,
      });

      // Spatial calculations
      const currentChangedAreaHa = changeResult.changedArea;
      const currentChangedAreaM2 = Math.round(changeResult.changedArea * 10000 * 100) / 100;
      const isProgressive = currentChangedAreaHa > previousAreaHa && previousAreaHa > 0;
      previousAreaHa = currentChangedAreaHa;
      cumulativeAreaHa += currentChangedAreaHa;

      // Processed indicator metrics
      const processedObs = await this.processedResultRepo.findBySatelliteMetadataId(currentObs.id);

      // Classify mining activity
      const classificationResult = MiningEstimationEngine.classifyMiningActivity({
        changeDetection: changeResult,
        opticalMetrics: processedObs?.opticalMetrics,
        sarMetrics: processedObs?.sarMetrics,
        isProgressiveExpansion: isProgressive,
        consecutiveChangeObservations: i + 1,
      });

      // Estimate extraction volume
      const volumeResult = MiningEstimationEngine.estimateExtractionVolume({
        changedAreaSquareMeters: currentChangedAreaM2,
        demElevationDataAvailable,
        estimatedMeanDepthMeters,
        evidenceStrength: changeResult.evidenceStrength,
      });

      // Store mining extraction estimate
      const estimateTag = Math.floor(10000 + Math.random() * 90000);
      await this.miningEstimateRepo.create({
        estimateId: `EST-${areaId}-${estimateTag}`,
        areaType,
        markedAreaId: areaId,
        temporaryAreaId: !isPermanent ? areaId : undefined,
        zoneId: isPermanent && Types.ObjectId.isValid(areaId) ? new Types.ObjectId(areaId) : undefined,
        changeDetectionId: new Types.ObjectId(changeResult.id),
        observationId: new Types.ObjectId(currentObs.id),
        observationDate: new Date(currentObs.acquisitionDate),
        changedAreaSquareMeters: currentChangedAreaM2,
        changedAreaHectares: currentChangedAreaHa,
        percentageOfTemporaryArea: changeResult.affectedAreaPercentage,
        miningClassification: classificationResult.classification,
        estimatedDepthMeters: volumeResult.estimatedDepthMeters,
        estimatedVolumeCubicMeters: volumeResult.estimatedVolumeCubicMeters,
        volumeUnit: volumeResult.volumeUnit,
        isVolumeAvailable: volumeResult.isVolumeAvailable,
        volumeUnavailableReason: volumeResult.volumeUnavailableReason,
        estimationMethod: volumeResult.estimationMethod,
        estimationConfidence: volumeResult.estimationConfidence,
        disclaimer: volumeResult.disclaimer,
      });

      // Build unified calculation result
      calculationResults.push({
        observationId: currentObs.id,
        baselineId: changeResult.baselineId,
        referenceId: changeResult.referenceObservationId,
        sensorType: currentObs.sensorType,
        source: currentObs.source,
        acquisitionDate: currentObs.acquisitionDate.toISOString(),
        indicators: {
          opticalMetrics: processedObs?.opticalMetrics,
          sarMetrics: processedObs?.sarMetrics,
        },
        changedAreaM2: currentChangedAreaM2,
        changedAreaHectares: currentChangedAreaHa,
        affectedAreaPercentage: changeResult.affectedAreaPercentage,
        thresholdsCrossed: {
          low: changeResult.affectedAreaPercentage >= 2.0,
          medium: changeResult.affectedAreaPercentage >= 5.0,
          high: changeResult.affectedAreaPercentage >= 10.0,
        },
        severity: changeResult.severity,
        evidenceStrength: changeResult.evidenceStrength,
        changeCategories: changeResult.categories,
        miningActivityClassification: classificationResult.classification,
        estimatedDepth: volumeResult.estimatedDepthMeters,
        estimatedVolume: volumeResult.estimatedVolumeCubicMeters,
        volumeUnit: volumeResult.volumeUnit,
        estimationMethod: volumeResult.estimationMethod,
        estimationConfidence: volumeResult.estimationConfidence,
        explanation: changeResult.explanation,
        changedGeometry: changeResult.changedGeometry || boundary,
      });

      // Build timeline item
      timeline.push({
        stepNumber: i + 1,
        observationId: currentObs.id,
        observationDate: currentObs.acquisitionDate.toISOString(),
        satelliteSource: currentObs.source,
        sensorType: currentObs.sensorType,
        cloudCover: currentObs.cloudCover || 0.0,
        referenceObservationId: activeBaseline ? activeBaseline.id : (activeRef?.id || 'BASELINE'),
        referenceDate: activeBaseline
          ? activeBaseline.createdAt
          : (activeRef ? activeRef.acquisitionDate.toISOString() : 'ACTIVE_BASELINE'),
        changedAreaSquareMeters: currentChangedAreaM2,
        changedAreaHectares: currentChangedAreaHa,
        affectedAreaPercentage: changeResult.affectedAreaPercentage,
        cumulativeChangedAreaHectares: Math.round(cumulativeAreaHa * 100) / 100,
        isProgressiveExpansion: isProgressive,
        severity: changeResult.severity,
        evidenceStrength: changeResult.evidenceStrength,
        miningClassification: classificationResult.classification,
        estimatedVolumeCubicMeters: volumeResult.estimatedVolumeCubicMeters,
        isVolumeAvailable: volumeResult.isVolumeAvailable,
        explanation: changeResult.explanation,
      });
    }

    // 5. Gather all estimates, changes, alerts for report
    const estimateDocs = await this.miningEstimateRepo.findByMarkedAreaId(areaId, areaType);
    const estimates = estimateDocs.map((e) => e.toDto());

    const changeFilter: Record<string, unknown> = isPermanent
      ? { zoneId: new Types.ObjectId(areaId) }
      : { temporaryAreaId: areaId };
    const changeDocs = await this.changeRepo.findAll(changeFilter);
    const changes = changeDocs.map((c) => c.toDto());

    const alertDocs = await this.alertRepo.findAll(
      isPermanent ? { zoneId: areaId } : { temporaryAreaId: areaId },
    );
    const alerts = alertDocs.data.map((a) => a.toDto());

    // 6. Aggregate Summary
    const avgCloud =
      opticalObservations.length > 0
        ? opticalObservations.reduce(
            (acc: number, curr: ISatelliteMetadata) => acc + curr.cloudCover,
            0,
          ) / opticalObservations.length
        : 0;

    let overallSeverity: AlertSeverity | 'NONE' = 'NONE';
    if (changes.some((c) => c.severity === AlertSeverity.HIGH)) {
      overallSeverity = AlertSeverity.HIGH;
    } else if (changes.some((c) => c.severity === AlertSeverity.MEDIUM)) {
      overallSeverity = AlertSeverity.MEDIUM;
    } else if (changes.some((c) => c.severity === AlertSeverity.LOW)) {
      overallSeverity = AlertSeverity.LOW;
    }

    const maxEvidenceStrength =
      changes.length > 0 ? Math.max(...changes.map((c) => c.evidenceStrength || 0)) : 0;
    const maxPctAffected =
      changes.length > 0 ? Math.max(...changes.map((c) => c.affectedAreaPercentage)) : 0;

    // Primary classification with highest confidence
    const primaryClassification =
      estimates.length > 0
        ? estimates.reduce((prev, curr) =>
            curr.estimationConfidence > prev.estimationConfidence ? curr : prev,
          ).miningClassification
        : MiningClassification.NON_MINING_DISTURBANCE;

    const totalVolume = estimates.reduce(
      (sum, e) => (e.isVolumeAvailable && e.estimatedVolumeCubicMeters ? sum + e.estimatedVolumeCubicMeters : sum),
      0,
    );
    const isVolumeAvail = estimates.some((e) => e.isVolumeAvailable);

    const report: MarkedAreaAnalysisReportDto = {
      areaId,
      areaType,
      areaName,
      boundary,
      areaHectares,
      areaSquareMeters: Math.round(areaHectares * 10000 * 100) / 100,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary: {
        totalObservations: inRange.length,
        analyzedObservations: targetSequence.length,
        opticalObservations: opticalObservations.length,
        sarObservations: sarObservations.length,
        cloudCoverAverage: Math.round(avgCloud * 10) / 10,
        overallSeverity,
        maxEvidenceStrength,
        totalCumulativeChangedAreaHectares: Math.round(cumulativeAreaHa * 100) / 100,
        maxPercentageAffected: maxPctAffected,
        primaryClassification,
        totalEstimatedVolumeCubicMeters: isVolumeAvail ? totalVolume : undefined,
        isVolumeAvailable: isVolumeAvail,
        disclaimer:
          'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
        analysisCompletedAt: new Date().toISOString(),
      },
      results: calculationResults,
      timeline,
      miningEstimates: estimates,
      changes,
      alerts,
    };

    return report;
  }
}
