import {
  TemporaryAreaRepository,
  type TemporaryAreaFilters,
} from '../repositories/TemporaryAreaRepository.js';
import { MiningExtractionEstimateRepository } from '../repositories/MiningExtractionEstimateRepository.js';
import { SatelliteMetadataRepository } from '../repositories/SatelliteMetadataRepository.js';
import { ProcessedImageResultRepository } from '../repositories/ProcessedImageResultRepository.js';
import { ChangeDetectionRepository } from '../repositories/ChangeDetectionRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { ChangeDetectionService } from './ChangeDetectionService.js';
import { ImageProcessingService } from './ImageProcessingService.js';
import { BaselineService } from './BaselineService.js';
import { calculateCentroid, calculatePolygonArea } from '../utils/geo.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import { MarkedAreaAnalysisService } from './MarkedAreaAnalysisService.js';
import {
  type TemporaryAreaDto,
  type CreateTemporaryAreaRequest,
  type MiningExtractionEstimateDto,
  type TemporaryAreaTimelineItemDto,
  type TemporaryAreaAnalysisReportDto,
  type SatelliteMetadataDto,
  TemporaryAreaStatus,
  SensorType,
  SatelliteSource,
  AlertSeverity,
  MiningClassification,
  MarkedAreaType,
  type GeoJSONPoint,
} from '@tn-forest/shared/types';
import { Types } from 'mongoose';

export class TemporaryAreaAnalysisService {
  private temporaryAreaRepo: TemporaryAreaRepository;
  private miningEstimateRepo: MiningExtractionEstimateRepository;
  private satelliteRepo: SatelliteMetadataRepository;
  private processedResultRepo: ProcessedImageResultRepository;
  private changeRepo: ChangeDetectionRepository;
  private alertRepo: AlertRepository;
  private changeDetectionService: ChangeDetectionService;
  private imageProcessingService: ImageProcessingService;
  private baselineService: BaselineService;

  constructor() {
    this.temporaryAreaRepo = new TemporaryAreaRepository();
    this.miningEstimateRepo = new MiningExtractionEstimateRepository();
    this.satelliteRepo = new SatelliteMetadataRepository();
    this.processedResultRepo = new ProcessedImageResultRepository();
    this.changeRepo = new ChangeDetectionRepository();
    this.alertRepo = new AlertRepository();
    this.changeDetectionService = new ChangeDetectionService();
    this.imageProcessingService = new ImageProcessingService();
    this.baselineService = new BaselineService();
  }

  async createTemporaryArea(
    creatorId: string,
    data: CreateTemporaryAreaRequest,
  ): Promise<TemporaryAreaDto> {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError('Invalid startDate or endDate format', HTTP_STATUS.BAD_REQUEST);
    }
    if (startDate >= endDate) {
      throw new AppError('startDate must be before endDate', HTTP_STATUS.BAD_REQUEST);
    }

    const { coordinates } = data.boundary;
    if (!coordinates || coordinates.length === 0 || coordinates[0].length < 4) {
      throw new AppError(
        'Invalid polygon geometry: polygon must have at least 4 coordinate pairs (closed ring)',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const centroidCoords = calculateCentroid(coordinates as [number, number][][]);
    const { areaSquareMeters, areaHectares } = calculatePolygonArea(
      coordinates as [number, number][][],
    );

    const centerPoint: GeoJSONPoint = {
      type: 'Point',
      coordinates: centroidCoords,
    };

    const dateTag = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randTag = Math.floor(1000 + Math.random() * 9000);
    const temporaryAreaId = `TMP-${dateTag}-${randTag}`;

    const doc = await this.temporaryAreaRepo.create({
      temporaryAreaId,
      name: data.name.trim(),
      boundary: data.boundary,
      areaHectares,
      areaSquareMeters,
      centerPoint,
      startDate,
      endDate,
      reason: data.reason?.trim(),
      status: TemporaryAreaStatus.ANALYSIS_REQUESTED,
      createdBy: new Types.ObjectId(creatorId),
      demElevationDataAvailable: Boolean(data.demElevationDataAvailable),
      estimatedMeanDepthMeters: data.estimatedMeanDepthMeters,
      zoneId: data.zoneId && Types.ObjectId.isValid(data.zoneId) ? new Types.ObjectId(data.zoneId) : undefined,
    });

    return doc.toDto();
  }

  async getAllTemporaryAreas(filters: TemporaryAreaFilters = {}): Promise<TemporaryAreaDto[]> {
    const list = await this.temporaryAreaRepo.findAll(filters);
    return list.map((a) => a.toDto());
  }

  async getTemporaryAreaById(idOrTempId: string): Promise<TemporaryAreaDto> {
    let doc = null;
    if (Types.ObjectId.isValid(idOrTempId)) {
      doc = await this.temporaryAreaRepo.findById(idOrTempId);
    }
    if (!doc) {
      doc = await this.temporaryAreaRepo.findByTemporaryAreaId(idOrTempId);
    }
    if (!doc) {
      throw new AppError('Temporary monitoring area not found', HTTP_STATUS.NOT_FOUND);
    }
    return doc.toDto();
  }

  async getHistoricalObservations(idOrTempId: string): Promise<SatelliteMetadataDto[]> {
    const area = await this.getTemporaryAreaById(idOrTempId);
    const startDate = new Date(area.startDate);
    const endDate = new Date(area.endDate);

    const intersecting = await this.satelliteRepo.findIntersecting(area.boundary);
    const inRange = intersecting.filter((obs) => {
      const d = new Date(obs.acquisitionDate);
      return d >= startDate && d <= endDate;
    });

    inRange.sort(
      (a, b) => new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime(),
    );
    return inRange.map((obs) => obs.toDto());
  }

  async runHistoricalAnalysis(idOrTempId: string): Promise<TemporaryAreaAnalysisReportDto> {
    const area = await this.getTemporaryAreaById(idOrTempId);
    await this.temporaryAreaRepo.updateByTemporaryAreaId(area.temporaryAreaId, {
      status: TemporaryAreaStatus.PROCESSING,
    });

    try {
      const markedAreaService = new MarkedAreaAnalysisService();
      await markedAreaService.analyzeMarkedArea({
        areaId: area.temporaryAreaId,
        areaType: MarkedAreaType.TEMPORARY,
        areaName: area.name,
        boundary: area.boundary,
        areaHectares: area.areaHectares,
        startDate: new Date(area.startDate).toISOString(),
        endDate: new Date(area.endDate).toISOString(),
        demElevationDataAvailable: area.demElevationDataAvailable,
        estimatedMeanDepthMeters: area.estimatedMeanDepthMeters,
      });

      await this.temporaryAreaRepo.updateByTemporaryAreaId(area.temporaryAreaId, {
        status: TemporaryAreaStatus.COMPLETED,
      });

      return await this.getReport(area.temporaryAreaId);
    } catch (err) {
      await this.temporaryAreaRepo.updateByTemporaryAreaId(area.temporaryAreaId, {
        status: TemporaryAreaStatus.FAILED,
      });
      throw err;
    }
  }

  async getTimeline(idOrTempId: string): Promise<TemporaryAreaTimelineItemDto[]> {
    const area = await this.getTemporaryAreaById(idOrTempId);
    const changes = await this.changeRepo.findAll({ temporaryAreaId: area.temporaryAreaId });
    const estimates = await this.miningEstimateRepo.findByTemporaryAreaId(area.temporaryAreaId);

    // Sort chronologically
    changes.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    let cumulativeHa = 0;
    let prevHa = 0;

    const timeline: TemporaryAreaTimelineItemDto[] = [];

    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      const obsMeta = await this.satelliteRepo.findById(c.observationId.toString());
      const refMeta = c.referenceObservationId
        ? await this.satelliteRepo.findById(c.referenceObservationId.toString())
        : null;

      const estimate = estimates.find(
        (e) => e.observationId.toString() === c.observationId.toString(),
      );

      const areaHa = c.changedArea;
      const areaM2 = Math.round(c.changedArea * 10000 * 100) / 100;
      const isProgressive = areaHa > prevHa && prevHa > 0;
      prevHa = areaHa;
      cumulativeHa += areaHa;

      timeline.push({
        stepNumber: i + 1,
        observationId: c.observationId.toString(),
        observationDate: obsMeta ? obsMeta.acquisitionDate.toISOString() : c.createdAt.toISOString(),
        satelliteSource: obsMeta ? obsMeta.source : SatelliteSource.SENTINEL_2,
        sensorType: c.sensorType,
        cloudCover: obsMeta?.cloudCover || 0.0,
        referenceObservationId: c.referenceObservationId?.toString() || 'BASELINE',
        referenceDate: refMeta ? refMeta.acquisitionDate.toISOString() : 'ACTIVE_BASELINE',
        changedAreaSquareMeters: areaM2,
        changedAreaHectares: areaHa,
        affectedAreaPercentage: c.affectedAreaPercentage,
        cumulativeChangedAreaHectares: Math.round(cumulativeHa * 100) / 100,
        isProgressiveExpansion: isProgressive,
        severity: c.severity,
        evidenceStrength: c.evidenceStrength,
        miningClassification:
          estimate?.miningClassification || MiningClassification.SURFACE_DISTURBANCE,
        estimatedVolumeCubicMeters: estimate?.estimatedVolumeCubicMeters,
        isVolumeAvailable: estimate?.isVolumeAvailable ?? false,
        explanation: c.explanation,
      });
    }

    return timeline;
  }

  async getMiningEstimates(idOrTempId: string): Promise<MiningExtractionEstimateDto[]> {
    const area = await this.getTemporaryAreaById(idOrTempId);
    const list = await this.miningEstimateRepo.findByTemporaryAreaId(area.temporaryAreaId);
    return list.map((e) => e.toDto());
  }

  async getReport(idOrTempId: string): Promise<TemporaryAreaAnalysisReportDto> {
    const area = await this.getTemporaryAreaById(idOrTempId);
    const observations = await this.getHistoricalObservations(area.temporaryAreaId);
    const timeline = await this.getTimeline(area.temporaryAreaId);
    const estimates = await this.getMiningEstimates(area.temporaryAreaId);
    const changeDocs = await this.changeRepo.findAll({ temporaryAreaId: area.temporaryAreaId });
    const changes = changeDocs.map((c) => c.toDto());
    const alertDocs = await this.alertRepo.findAll({ temporaryAreaId: area.temporaryAreaId });
    const alerts = alertDocs.data.map((a) => a.toDto());

    const opticalObs = observations.filter((o) => o.sensorType === SensorType.OPTICAL);
    const sarObs = observations.filter((o) => o.sensorType === SensorType.SAR);
    const avgCloud =
      opticalObs.length > 0
        ? opticalObs.reduce((acc, curr) => acc + curr.cloudCover, 0) / opticalObs.length
        : 0;

    let overallSeverity: AlertSeverity | 'NONE' = 'NONE';
    if (changes.some((c) => c.severity === AlertSeverity.HIGH)) {
      overallSeverity = AlertSeverity.HIGH;
    } else if (changes.some((c) => c.severity === AlertSeverity.MEDIUM)) {
      overallSeverity = AlertSeverity.MEDIUM;
    } else if (changes.some((c) => c.severity === AlertSeverity.LOW)) {
      overallSeverity = AlertSeverity.LOW;
    }

    const maxEvidence = changes.reduce((max, c) => Math.max(max, c.evidenceStrength), 0);
    const maxPct = changes.reduce((max, c) => Math.max(max, c.affectedAreaPercentage), 0);
    const cumulativeHa = timeline.length > 0 ? timeline[timeline.length - 1].cumulativeChangedAreaHectares : 0;

    let totalVolume: number | undefined;
    let isVolumeAvailable = false;

    if (estimates.some((e) => e.isVolumeAvailable && e.estimatedVolumeCubicMeters)) {
      totalVolume = estimates.reduce((acc, curr) => acc + (curr.estimatedVolumeCubicMeters || 0), 0);
      isVolumeAvailable = true;
    }

    const primaryClassification =
      estimates.length > 0
        ? estimates[estimates.length - 1].miningClassification
        : MiningClassification.NON_MINING_DISTURBANCE;

    return {
      temporaryArea: area,
      summary: {
        totalObservations: observations.length,
        analyzedObservations: timeline.length,
        opticalObservations: opticalObs.length,
        sarObservations: sarObs.length,
        cloudCoverAverage: Math.round(avgCloud * 10) / 10,
        overallSeverity,
        maxEvidenceStrength: maxEvidence,
        totalCumulativeChangedAreaHectares: cumulativeHa,
        maxPercentageAffected: maxPct,
        primaryClassification,
        totalEstimatedVolumeCubicMeters: totalVolume ? Math.round(totalVolume * 100) / 100 : undefined,
        isVolumeAvailable,
        disclaimer:
          'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
        analysisCompletedAt: new Date().toISOString(),
      },
      timeline,
      miningEstimates: estimates,
      changes,
      alerts,
    };
  }
}
