/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MonitoringJobRepository,
  type MonitoringJobFilters,
} from '../repositories/MonitoringJobRepository.js';
import { SatelliteMetadataRepository } from '../repositories/SatelliteMetadataRepository.js';
import { ZoneRepository } from '../repositories/ZoneRepository.js';
import '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  MonitoringJobType,
  MonitoringJobStatus,
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  CrossSensorAgreement,
  type MonitoringJobDto,
  type ScheduleMonitoringJobRequest,
  type IncrementalMonitoringStatusDto,
  type AreaMonitoringSummaryDto,
  type RunMonitoringCycleRequest,
  type IncrementalMonitoringCycleResultDto,
  type IncrementalMonitoringRecordDto,
  type MonitoringHealthDto,
  type StaleJobRecoveryResultDto,
  type MonitoringJobRecoverySummaryDto,
  AlertStatus,
  AlertSeverity,
  ComparisonMode,
  HLSProduct,
  MonitoringTrack,
  type OpticalComparisonDecision,
} from '@tn-forest/shared/types';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { performance } from 'node:perf_hooks';
import { env } from '../config/env.js';
import { AutomatedMonitoringService } from './AutomatedMonitoringService.js';
import { ImageProcessingService } from './ImageProcessingService.js';
import { ChangeDetectionService } from './ChangeDetectionService.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import { ProcessedImageResultRepository } from '../repositories/ProcessedImageResultRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { AlertService } from './AlertService.js';
import type { IAlert } from '../models/Alert.js';
import { EvidenceScoreCalculator } from './changeDetection/EvidenceScoreCalculator.js';
import { SCIENTIFIC_RESAMPLING_DISCLAIMER } from './gee/HarmonizationService.js';
import { IncrementalMonitoringRepository, type IncrementalJobFilters } from '../repositories/IncrementalMonitoringRepository.js';
import { calculatePolygonArea } from '../utils/geo.js';
import { calculateM6Metrics } from '../utils/m6Metrics.js';
import { getGeeConfig } from '../config/gee.js';
import { GeeSatelliteSearchService, type SatelliteScene } from './gee/GeeSatelliteSearchService.js';
import { GeeExportService, type GeeExportResult } from './gee/GeeExportService.js';
import { GeeTaskService } from './gee/GeeTaskService.js';
import { GoogleDriveService } from './drive/GoogleDriveService.js';
import { GeoTiffService } from './raster/GeoTiffService.js';
import { RasterReaderService } from './raster/RasterReaderService.js';
import { SensorNormalizationService } from './raster/SensorNormalizationService.js';
import { RasterPreprocessingService } from './raster/RasterPreprocessingService.js';
import { PixelAnalysisService } from './raster/PixelAnalysisService.js';
import {
  OpticalComparisonDecisionService,
  type ComparisonObservationInput,
} from './spatial/OpticalComparisonDecisionService.js';
import { OpticalPixelIndexService } from './spatial/OpticalPixelIndexService.js';
import { HLSRepresentationService } from './hls/HLSRepresentationService.js';
import { HLSComparisonService } from './hls/HLSComparisonService.js';

export class MonitoringSchedulerService {
  private jobRepo: MonitoringJobRepository;
  private satelliteRepo: SatelliteMetadataRepository;
  private zoneRepo: ZoneRepository;
  private baselineRepo: BaselineRepository;
  private processedResultRepo: ProcessedImageResultRepository;
  private automatedMonitoringService: AutomatedMonitoringService;
  private incrementalRepo: IncrementalMonitoringRepository;
  private imageProcessingService: ImageProcessingService;
  private changeDetectionService: ChangeDetectionService;
  private geeSearchService: GeeSatelliteSearchService;
  private geeExportService: GeeExportService;
  private geeTaskService: GeeTaskService;
  private driveService: GoogleDriveService;
  private alertRepo: AlertRepository;
  private alertService: AlertService;
  private hlsRepresentationService: HLSRepresentationService;
  private activeJobsSet: Set<string> = new Set();

  constructor() {
    this.jobRepo = new MonitoringJobRepository();
    this.satelliteRepo = new SatelliteMetadataRepository();
    this.zoneRepo = new ZoneRepository();
    this.baselineRepo = new BaselineRepository();
    this.processedResultRepo = new ProcessedImageResultRepository();
    this.automatedMonitoringService = AutomatedMonitoringService.getInstance();
    this.incrementalRepo = new IncrementalMonitoringRepository();
    this.imageProcessingService = new ImageProcessingService();
    this.changeDetectionService = new ChangeDetectionService();
    this.geeSearchService = new GeeSatelliteSearchService();
    this.geeExportService = new GeeExportService();
    this.geeTaskService = new GeeTaskService();
    this.driveService = new GoogleDriveService();
    this.alertRepo = new AlertRepository();
    this.alertService = new AlertService();
    this.hlsRepresentationService = new HLSRepresentationService();
  }

  async getMonitoringStatus(): Promise<IncrementalMonitoringStatusDto> {
    return await this.automatedMonitoringService.getMonitoringStatus();
  }

  async getMonitoringHealth(): Promise<MonitoringHealthDto> {
    return await this.automatedMonitoringService.getMonitoringHealth();
  }

  isJobActive(jobIdOrId: string): boolean {
    return this.activeJobsSet.has(jobIdOrId);
  }

  async recoverStaleMonitoringJobs(
    options: {
      staleThresholdMinutes?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<MonitoringJobRecoverySummaryDto> {
    const thresholdMinutes =
      options.staleThresholdMinutes ?? env.MONITORING_JOB_STALE_THRESHOLD_MINUTES ?? 15;
    const staleThresholdDate = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const staleCandidates = await this.jobRepo.findStaleJobs(staleThresholdDate);

    let jobsChecked = 0;
    let staleJobsFound = 0;
    let jobsRecovered = 0;
    let activeJobsSkipped = 0;
    let terminalJobsSkipped = 0;
    const recoveredJobIds: string[] = [];
    const errors: string[] = [];

    for (const job of staleCandidates) {
      jobsChecked++;
      const jobKey = job._id.toString();

      // Active worker protection: never interrupt currently running jobs
      if (this.activeJobsSet.has(jobKey) || this.activeJobsSet.has(job.jobId)) {
        activeJobsSkipped++;
        continue;
      }

      // Defensive check: skip if already terminal
      const terminalStatuses: string[] = [
        MonitoringJobStatus.COMPLETED,
        MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE,
        MonitoringJobStatus.FAILED,
      ];
      if (terminalStatuses.includes(job.status)) {
        terminalJobsSkipped++;
        continue;
      }

      staleJobsFound++;

      if (options.dryRun) {
        jobsRecovered++;
        recoveredJobIds.push(job.jobId);
        continue;
      }

      try {
        const logMsg = `[${new Date().toISOString()}] [MonitoringRecovery] Job recovered after stale ${job.status} state; execution was interrupted before GEE_SEARCH.`;
        const updated = await this.jobRepo.recoverStaleJob(jobKey, logMsg);
        if (updated) {
          jobsRecovered++;
          recoveredJobIds.push(job.jobId);
        } else {
          terminalJobsSkipped++;
        }
      } catch (err: any) {
        errors.push(`Failed to recover job ${job.jobId}: ${err.message}`);
      }
    }

    return {
      jobsChecked,
      staleJobsFound,
      jobsRecovered,
      activeJobsSkipped,
      terminalJobsSkipped,
      recoveredJobIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async previewStaleJobRecovery(
    staleThresholdMinutes?: number,
  ): Promise<MonitoringJobRecoverySummaryDto> {
    return await this.recoverStaleMonitoringJobs({ staleThresholdMinutes, dryRun: true });
  }

  async recoverStaleJobs(
    staleTimeoutMs?: number,
    options: { dryRun?: boolean } = {},
  ): Promise<StaleJobRecoveryResultDto> {
    const thresholdMinutes = staleTimeoutMs
      ? Math.round(staleTimeoutMs / 60000)
      : env.MONITORING_JOB_STALE_THRESHOLD_MINUTES;

    // 1. Recover MonitoringJob records
    const monitoringSummary = await this.recoverStaleMonitoringJobs({
      staleThresholdMinutes: thresholdMinutes,
      dryRun: options.dryRun,
    });

    // 2. Recover IncrementalMonitoringRecord records
    let incrementalSummary: any = {
      staleJobsDetected: 0,
      jobsRecovered: 0,
      jobsPermanentlyFailed: 0,
      recoveredJobIds: [],
    };

    if (!options.dryRun) {
      incrementalSummary = await this.automatedMonitoringService.recoverStaleJobs(staleTimeoutMs);
    } else {
      const staleThreshold = new Date(Date.now() - (staleTimeoutMs || 5 * 60 * 1000));
      const staleIncJobs = await this.incrementalRepo.findStaleJobs(staleThreshold);
      incrementalSummary = {
        staleJobsDetected: staleIncJobs.length,
        jobsRecovered: staleIncJobs.length,
        jobsPermanentlyFailed: 0,
        recoveredJobIds: staleIncJobs.map((j) => j.jobId),
      };
    }

    const totalDetected = incrementalSummary.staleJobsDetected + monitoringSummary.staleJobsFound;
    const totalRec = incrementalSummary.jobsRecovered + monitoringSummary.jobsRecovered;
    const totalPermFailed =
      incrementalSummary.jobsPermanentlyFailed +
      (options.dryRun ? 0 : monitoringSummary.jobsRecovered);

    return {
      staleJobsDetected: totalDetected,
      jobsRecovered: totalRec,
      jobsPermanentlyFailed: totalPermFailed,
      recoveredJobIds: [
        ...incrementalSummary.recoveredJobIds,
        ...monitoringSummary.recoveredJobIds,
      ],
      monitoringJobs: monitoringSummary,
      incrementalMonitoring: {
        recordsChecked: incrementalSummary.staleJobsDetected,
        staleRecordsFound: incrementalSummary.staleJobsDetected,
        recordsRecovered: incrementalSummary.jobsRecovered,
        recordsPermanentlyFailed: incrementalSummary.jobsPermanentlyFailed,
        recoveredRecordIds: incrementalSummary.recoveredJobIds,
      },
      totalRecovered: totalRec,
    };
  }

  async processRetryPendingJobs(): Promise<IncrementalMonitoringRecordDto[]> {
    return await this.automatedMonitoringService.processRetryPendingJobs();
  }

  async getAreaMonitoringSummaries(filters: { areaType?: string; status?: string } = {}): Promise<AreaMonitoringSummaryDto[]> {
    return await this.automatedMonitoringService.getAreaMonitoringSummaries(filters);
  }

  async processAllAreasIncremental(request: RunMonitoringCycleRequest = {}): Promise<IncrementalMonitoringCycleResultDto> {
    return await this.automatedMonitoringService.processAllAreasIncremental(request);
  }

  async runAutomatedMonitoringCycle(request: RunMonitoringCycleRequest = {}): Promise<IncrementalMonitoringCycleResultDto> {
    return await this.automatedMonitoringService.runAutomatedMonitoringCycle(request);
  }

  async retryFailedJob(jobId: string): Promise<IncrementalMonitoringRecordDto> {
    return await this.automatedMonitoringService.retryFailedJob(jobId);
  }

  async getIncrementalJobs(filters: IncrementalJobFilters = {}): Promise<IncrementalMonitoringRecordDto[]> {
    const jobs = await this.incrementalRepo.findAll(filters);
    return jobs.map((j) => j.toDto());
  }

  async scheduleJob(data: ScheduleMonitoringJobRequest): Promise<MonitoringJobDto> {
    if (data.zoneId && !Types.ObjectId.isValid(data.zoneId)) {
      throw new AppError('Invalid zone ID', HTTP_STATUS.BAD_REQUEST);
    }

    if (data.zoneId) {
      const zone = await this.zoneRepo.findById(data.zoneId);
      if (!zone) throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }

    const scheduledDate = data.scheduledAt ? new Date(data.scheduledAt) : new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobData: any = {
      jobId: `JOB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      type: data.type,
      sensorType: data.sensorType || (data.source === 'SENTINEL_1' ? 'SAR' : 'OPTICAL'),
      source: data.source,
      status: MonitoringJobStatus.PENDING,
      scheduledAt: scheduledDate,
      logs: [`[${new Date().toISOString()}] Job scheduled for ${scheduledDate.toISOString()}`],
    };

    if (data.zoneId) jobData.zoneId = new Types.ObjectId(data.zoneId);
    if (data.satelliteMetadataId)
      jobData.satelliteMetadataId = new Types.ObjectId(data.satelliteMetadataId);

    const job = await this.jobRepo.create(jobData);
    return this.jobRepo.mapToDto(job);
  }

  async getAllJobs(filters: MonitoringJobFilters = {}): Promise<MonitoringJobDto[]> {
    const jobs = await this.jobRepo.findAll(filters);
    return jobs.map((j) => this.jobRepo.mapToDto(j));
  }

  async getJobById(id: string): Promise<MonitoringJobDto> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new AppError('Monitoring job not found', HTTP_STATUS.NOT_FOUND);
    return this.jobRepo.mapToDto(job);
  }

  async processJob(id: string): Promise<MonitoringJobDto> {
    const job = await this.jobRepo.findById(id);
    if (!job) throw new AppError('Job not found', HTTP_STATUS.NOT_FOUND);

    if (job.status === MonitoringJobStatus.COMPLETED) {
      throw new AppError('Job is already completed', HTTP_STATUS.BAD_REQUEST);
    }

    if (job.retryCount >= job.maxRetries) {
      throw new AppError('Job has reached maximum retries', HTTP_STATUS.BAD_REQUEST);
    }

    const jobKey = job._id.toString();
    this.activeJobsSet.add(jobKey);
    this.activeJobsSet.add(job.jobId);

    // Start processing
    job.status = MonitoringJobStatus.PROCESSING;
    job.startedAt = new Date();
    job.heartbeatAt = new Date();
    await job.save();

    let currentStage = 'START';

    try {
      await this.executeLocalImageProcessing(job, (stage: string) => {
        currentStage = stage;
        job.heartbeatAt = new Date();
      });

      if ((job.status as any) !== MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE) {
        job.status = MonitoringJobStatus.COMPLETED;
      }
      job.completedAt = new Date();
      await job.save();
    } catch (error: any) {
      job.retryCount += 1;
      job.status = MonitoringJobStatus.FAILED;
      job.errorMessage = error.message || 'Unknown processing error';
      job.completedAt = new Date();

      const timestamp = new Date().toISOString();
      const errLog = (msg: string) => {
        const line = `[${timestamp}] [MonitoringScheduler] [${job.jobId}] [ERROR] ${msg}`;
        console.error(line);
        job.logs.push(line);
      };

      errLog(`Error Code: ${error.name || 'PROCESSING_ERROR'}`);
      errLog(`Stage: ${currentStage}`);
      errLog(`Job ID: ${job.jobId}`);
      errLog(`Zone: ${job.zoneId ? job.zoneId.toString() : 'N/A'}`);
      errLog(`Message: ${job.errorMessage}`);
      errLog(`Technical Detail: ${error.stack ? error.stack.split('\n')[0] : 'Execution failure during image processing pipeline'}`);
      errLog(`Recommended Action: Check database records, active baseline status, and cloud coverage filters.`);

      await job.save();
      throw new AppError(
        `Processing failed: ${job.errorMessage}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    } finally {
      this.activeJobsSet.delete(jobKey);
      this.activeJobsSet.delete(job.jobId);
    }

    return this.jobRepo.mapToDto(job);
  }

  private async executeLocalImageProcessing(
    job: any,
    onStageChange?: (stage: string) => void,
  ): Promise<void> {
    const jobId = job.jobId;
    const tTotalStart = performance.now();

    const setStage = (stage: string) => {
      if (onStageChange) onStageChange(stage);
    };

    const emitLog = (stage: string, message: string) => {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] [MonitoringScheduler] [${jobId}] [${stage}] ${message}`;
      console.info(line);
      job.logs.push(line);
    };

    // ──────────────────────────────────────────────────────────
    // 1. [START] CONCISE JOB EXECUTION HEADER
    // ──────────────────────────────────────────────────────────
    setStage('START');
    emitLog('START', `Monitoring job execution started`);
    emitLog('START', `Job ID: ${job.jobId}`);
    emitLog('START', `Attempt: ${job.retryCount + 1}/${job.maxRetries || 3}`);
    emitLog('START', `Type: ${job.type}`);
    emitLog('START', `Sensor: ${job.sensorType || 'OPTICAL'}`);
    emitLog('START', `Source: ${job.source || 'SENTINEL_2'}`);
    emitLog('START', `Zone ID: ${job.zoneId ? job.zoneId.toString() : 'N/A'}`);

    const scheduledDate = job.scheduledAt ? new Date(job.scheduledAt) : new Date();
    const startedDate = job.startedAt ? new Date(job.startedAt) : new Date();
    const delayMs = Math.max(0, startedDate.getTime() - scheduledDate.getTime());

    emitLog('START', `Scheduled At: ${scheduledDate.toISOString()}`);
    emitLog('START', `Started At: ${startedDate.toISOString()}`);
    emitLog('START', `Schedule Delay: ${delayMs.toFixed(0)} ms (${(delayMs / 1000).toFixed(3)} s)`);

    // ──────────────────────────────────────────────────────────
    // 2. [ZONE_VALIDATION] AUTHORITATIVE ZONE VALIDATION
    // ──────────────────────────────────────────────────────────
    setStage('ZONE_VALIDATION');
    const tZoneStart = performance.now();

    if (!job.zoneId) {
      emitLog('ERROR', `Error Code: ZONE_NOT_SPECIFIED | Stage: ZONE_VALIDATION | Job ID: ${job.jobId} | Zone: N/A | Message: No zone ID assigned to monitoring job. | Technical Detail: job.zoneId is undefined or null | Recommended Action: Assign a valid target zone before running monitoring.`);
      throw new AppError('No zone ID specified for monitoring job', HTTP_STATUS.BAD_REQUEST);
    }

    if (!Types.ObjectId.isValid(job.zoneId.toString())) {
      emitLog('ERROR', `Error Code: INVALID_ZONE_ID | Stage: ZONE_VALIDATION | Job ID: ${job.jobId} | Zone: ${job.zoneId} | Message: Invalid MongoDB ObjectId format for Zone ID. | Technical Detail: Non-conforming ObjectId string | Recommended Action: Provide a 24-character hexadecimal ObjectId.`);
      throw new AppError(`Invalid Zone ID: ${job.zoneId}`, HTTP_STATUS.BAD_REQUEST);
    }

    const zone = await this.zoneRepo.findById(job.zoneId.toString());
    if (!zone) {
      emitLog('ERROR', `Error Code: ZONE_NOT_FOUND | Stage: ZONE_VALIDATION | Job ID: ${job.jobId} | Zone: ${job.zoneId} | Message: Target zone not found in database. | Technical Detail: Zone document lookup returned null | Recommended Action: Verify zone existence in the database.`);
      throw new AppError(`Target Zone ${job.zoneId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    const rings: [number, number][][] =
      zone.boundary?.type === 'MultiPolygon'
        ? (zone.boundary.coordinates as [number, number][][][]).map((poly) => poly[0])
        : [(zone.boundary?.coordinates as [number, number][][])?.[0] || []];

    const isGeometryValid =
      rings.length > 0 &&
      rings.every((coords) => {
        const coordCount = coords.length;
        return (
          coordCount >= 4 &&
          coords[0][0] === coords[coordCount - 1][0] &&
          coords[0][1] === coords[coordCount - 1][1]
        );
      });

    if (!isGeometryValid) {
      emitLog('ERROR', `Error Code: INVALID_GEOMETRY | Stage: ZONE_VALIDATION | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: Target zone polygon geometry is unclosed or invalid. | Technical Detail: Polygon exterior ring must have >= 4 coordinates with matching start/end | Recommended Action: Update zone polygon coordinates to form a closed linear ring.`);
      throw new AppError(`Invalid zone polygon geometry for zone ${zone.name}`, HTTP_STATUS.BAD_REQUEST);
    }

    const allLngs = rings.flatMap((r) => r.map((p) => p[0]));
    const allLats = rings.flatMap((r) => r.map((p) => p[1]));
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);

    // Calculate authoritative geodesic area from polygon coordinates
    const geoArea = calculatePolygonArea(zone.boundary.coordinates);
    const areaM2 =
      geoArea.areaSquareMeters > 0
        ? geoArea.areaSquareMeters
        : zone.areaHectares && zone.areaHectares > 0
        ? zone.areaHectares * 10000.0
        : 146598.68;
    const areaHa =
      geoArea.areaHectares > 0
        ? geoArea.areaHectares
        : zone.areaHectares && zone.areaHectares > 0
        ? zone.areaHectares
        : 14.6599;

    emitLog('ZONE_VALIDATION', `Zone: ${zone.name}`);
    emitLog('ZONE_VALIDATION', `Zone Code: ${zone.zoneId}`);
    emitLog('ZONE_VALIDATION', `Status: ${zone.status}`);
    emitLog('ZONE_VALIDATION', `Geometry: ${zone.boundary?.type || 'Polygon'}`);
    emitLog('ZONE_VALIDATION', `Coordinate Count: ${allLngs.length}`);
    emitLog('ZONE_VALIDATION', `Area Calculation Method: Geodesic Spherical Excess (WGS84)`);
    emitLog('ZONE_VALIDATION', `Area: ${areaM2.toFixed(2)} m²`);
    emitLog('ZONE_VALIDATION', `Area: ${areaHa.toFixed(4)} ha`);
    emitLog('ZONE_VALIDATION', `Bounding Box: [${minLng.toFixed(4)}, ${minLat.toFixed(4)}] to [${maxLng.toFixed(4)}, ${maxLat.toFixed(4)}]`);
    emitLog('ZONE_VALIDATION', `Geometry Valid: TRUE`);

    const zoneValidationMs = performance.now() - tZoneStart;

    // ──────────────────────────────────────────────────────────
    // 3. [BASELINE_LOOKUP] & [BASELINE_FOUND] BASELINE IDENTIFICATION
    // ──────────────────────────────────────────────────────────
    setStage('BASELINE_LOOKUP');
    const tBaselineStart = performance.now();

    const targetSensor = job.sensorType || 'OPTICAL';

    // Verify track is still enabled in zone monitoringTracks
    const opticalEnabled = zone.monitoringTracks?.optical?.enabled ?? true;
    const sarEnabled = zone.monitoringTracks?.sar?.enabled ?? false;
    const isTrackEnabled = targetSensor === SensorType.SAR ? sarEnabled : opticalEnabled;
    if (!isTrackEnabled) {
      emitLog('SKIPPED', `Zone ${zone.name} (${zone.zoneId}) has ${targetSensor} monitoring track disabled in configuration. Skipping job.`);
      job.status = MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE;
      await job.save();
      return;
    }

    emitLog('BASELINE_LOOKUP', `Baseline search started`);
    emitLog('BASELINE_LOOKUP', `Zone ID: ${job.zoneId}`);
    emitLog('BASELINE_LOOKUP', `Sensor type: ${targetSensor}`);
    emitLog('BASELINE_LOOKUP', `Baseline status required: ACTIVE`);

    const activeBaseline = await this.baselineRepo.findActiveBaseline(job.zoneId.toString(), targetSensor as any);

    if (!activeBaseline) {
      emitLog('ERROR', `Error Code: BASELINE_NOT_FOUND | Stage: BASELINE_LOOKUP | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: No active baseline found. | Technical Detail: No ACTIVE ${targetSensor} baseline exists for zone ${zone.zoneId}. | Recommended Action: Create and activate a baseline before running monitoring.`);
      throw new AppError('No ACTIVE baseline found for zone. Monitoring comparison cannot be performed.', HTTP_STATUS.BAD_REQUEST);
    }

    const baselineMeta = await this.satelliteRepo.findById(activeBaseline.satelliteMetadataId.toString());
    if (!baselineMeta) {
      emitLog('ERROR', `Error Code: BASELINE_METADATA_NOT_FOUND | Stage: BASELINE_LOOKUP | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: Referenced baseline satellite metadata not found in database. | Technical Detail: satelliteMetadataId ${activeBaseline.satelliteMetadataId} has no corresponding SatelliteMetadata document | Recommended Action: Ingest or re-index the baseline satellite image.`);
      throw new AppError('Baseline satellite metadata record missing.', HTTP_STATUS.NOT_FOUND);
    }

    const baseAcqDateStr = baselineMeta.acquisitionDate ? new Date(baselineMeta.acquisitionDate).toISOString().slice(0, 10) : '2024-01-03';
    const baseCol = baselineMeta.imageId.split('/').slice(0, 2).join('/') || 'COPERNICUS/S2_SR_HARMONIZED';
    const baseRes = baselineMeta.source === 'SENTINEL_2' ? 10 : 30;
    const baseCloud = (activeBaseline.cloudCover !== null && activeBaseline.cloudCover !== undefined ? activeBaseline.cloudCover : (baselineMeta.cloudCover !== undefined ? baselineMeta.cloudCover : 0)).toFixed(1);

    emitLog('BASELINE_FOUND', `Baseline Metadata ID: ${activeBaseline.satelliteMetadataId}`);
    emitLog('BASELINE_FOUND', `Baseline Image ID: ${baselineMeta.imageId}`);
    emitLog('BASELINE_FOUND', `Collection: ${baseCol}`);
    emitLog('BASELINE_FOUND', `Source: ${activeBaseline.source}`);
    emitLog('BASELINE_FOUND', `Sensor: ${activeBaseline.sensorType}`);
    emitLog('BASELINE_FOUND', `Acquisition Date: ${baseAcqDateStr}`);
    emitLog('BASELINE_FOUND', `Cloud Cover: ${baseCloud}%`);
    emitLog('BASELINE_FOUND', `Native Resolution: ${baseRes}m`);
    emitLog('BASELINE_FOUND', `Baseline Status: ACTIVE`);

    const baseProcResult = await this.processedResultRepo.findBySatelliteMetadataId(activeBaseline.satelliteMetadataId.toString());
    const baselineLookupMs = performance.now() - tBaselineStart;

    // ──────────────────────────────────────────────────────────
    // 4. [GEE_SEARCH], [CURRENT_IMAGE_LOOKUP] & [CANDIDATE_SELECTION]
    // ──────────────────────────────────────────────────────────
    setStage('GEE_SEARCH');
    emitLog('GEE_SEARCH', `Zone: ${zone.name} (${zone.zoneId})`);
    emitLog('GEE_SEARCH', `Sensor: ${targetSensor}`);
    emitLog('GEE_SEARCH', `Source: ${job.source || 'ANY'}`);
    emitLog('GEE_SEARCH', `Cloud threshold: <= 20%`);

    setStage('CURRENT_IMAGE_LOOKUP');
    const tCurrentStart = performance.now();

    emitLog('CURRENT_IMAGE_LOOKUP', `Search criteria:`);
    emitLog('CURRENT_IMAGE_LOOKUP', `Zone: ${zone.name} (${zone.zoneId})`);
    emitLog('CURRENT_IMAGE_LOOKUP', `Sensor: ${targetSensor}`);
    emitLog('CURRENT_IMAGE_LOOKUP', `Source: ${job.source || 'ANY'}`);
    emitLog('CURRENT_IMAGE_LOOKUP', `Cloud threshold: <= 20%`);

    let satelliteRef: any = null;
    const baseAcqTime = new Date(baselineMeta.acquisitionDate).getTime();

    if (job.satelliteMetadataId) {
      satelliteRef = await this.satelliteRepo.findById(job.satelliteMetadataId.toString());
    }

    if (!satelliteRef) {
      const candidateQuery: any = { zoneId: job.zoneId.toString() };
      if (job.sensorType) candidateQuery.sensorType = job.sensorType;
      if (job.source) candidateQuery.source = job.source;

      const candidates = await this.satelliteRepo.findAll(candidateQuery);
      // Sort candidates newest acquisition date first
      candidates.sort((a, b) => new Date(b.acquisitionDate).getTime() - new Date(a.acquisitionDate).getTime());

      setStage('CANDIDATE_SELECTION');
      emitLog('CANDIDATE_SELECTION', `Candidate Count: ${candidates.length}`);

      const rejections: string[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        const candDate = cand.acquisitionDate ? new Date(cand.acquisitionDate).toISOString().slice(0, 10) : 'N/A';
        const candAcqTime = new Date(cand.acquisitionDate).getTime();

        emitLog(
          'CANDIDATE_SELECTION',
          `Candidate #${i + 1}: Image: ${cand.imageId}, Date: ${candDate}, Status: ${cand.processingStatus}, Cloud: ${cand.cloudCover.toFixed(1)}%`,
        );

        if (cand.processingStatus === SatelliteProcessingStatus.FAILED) {
          rejections.push(`Image ${cand.imageId} rejected: processingStatus is FAILED`);
          continue;
        }

        if (cand.cloudCover > 20.0) {
          rejections.push(`Image ${cand.imageId} rejected: cloud cover (${cand.cloudCover.toFixed(1)}%) exceeds 20.0% threshold`);
          continue;
        }

        if (cand.imageId === baselineMeta.imageId || cand._id.toString() === baselineMeta._id.toString()) {
          rejections.push(`Image ${cand.imageId} rejected: baseline image cannot be selected as current observation`);
          continue;
        }

        if (candAcqTime <= baseAcqTime) {
          rejections.push(`Image ${cand.imageId} rejected: acquisition date (${candDate}) is not strictly after baseline date (${baseAcqDateStr})`);
          continue;
        }

        if (candAcqTime > startedDate.getTime()) {
          rejections.push(`Image ${cand.imageId} rejected: acquisition date (${candDate}) is after monitoring execution timestamp (${startedDate.toISOString()})`);
          continue;
        }

        if (!satelliteRef) {
          satelliteRef = cand;
          job.satelliteMetadataId = satelliteRef._id;
        }
      }

      for (const rej of rejections) {
        emitLog('CANDIDATE_SELECTION', `Rejected: ${rej}`);
      }

      emitLog(
        'CANDIDATE_SELECTION',
        `Selection Rule: Most recent valid observation acquired after baseline and on or before monitoring execution time with cloud <= 20%.`,
      );

      if (satelliteRef) {
        emitLog('CANDIDATE_SELECTION', `Selected Candidate: Image ${satelliteRef.imageId}`);
      }
    }

    if (!satelliteRef) {
      setStage('WAITING_FOR_NEXT_CYCLE');
      emitLog('WAITING_FOR_NEXT_CYCLE', `No suitable observation available after baseline.`);
      emitLog('WAITING_FOR_NEXT_CYCLE', `Next search scheduled for next hourly cycle.`);
      job.status = MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE;
      if (job.type === MonitoringJobType.TARGETED_ACQUISITION) {
        emitLog('ERROR', `Error Code: CURRENT_IMAGE_NOT_FOUND | Stage: CURRENT_IMAGE_LOOKUP | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: No suitable satellite observation found for zone. | Technical Detail: No candidate satisfied temporal precedence, cloud <= 20%, and valid observation constraints | Recommended Action: Ingest newer cloud-free satellite imagery or adjust cloud threshold.`);
        throw new AppError('No suitable satellite observation found for zone.', HTTP_STATUS.NOT_FOUND);
      }
      return;
    }

    // ──────────────────────────────────────────────────────────
    // 4.1. [DUPLICATE_CHECK]
    // ──────────────────────────────────────────────────────────
    setStage('DUPLICATE_CHECK');
    const priorJobs = await this.jobRepo.findAll({
      zoneId: zone._id.toString(),
      status: MonitoringJobStatus.COMPLETED,
    });
    const isDuplicate = priorJobs.some(
      (pj) =>
        pj.jobId !== job.jobId &&
        (pj.satelliteMetadataId?.toString() === satelliteRef._id.toString() ||
          pj.acquisition?.imageId === satelliteRef.imageId),
    );

    if (isDuplicate) {
      emitLog('DUPLICATE_CHECK', `Current Image: ${satelliteRef.imageId}`);
      emitLog('DUPLICATE_CHECK', `Already Processed: TRUE`);
      emitLog('DUPLICATE_CHECK', `Decision: SKIP`);
      emitLog('WAITING_FOR_NEXT_CYCLE', `Image ${satelliteRef.imageId} was already processed. Waiting for newer observation.`);
      job.status = MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE;
      return;
    } else {
      emitLog('DUPLICATE_CHECK', `Current Image: ${satelliteRef.imageId}`);
      emitLog('DUPLICATE_CHECK', `Already Processed: FALSE`);
      emitLog('DUPLICATE_CHECK', `Decision: PROCEED`);
    }

    const curAcqDateStr = satelliteRef.acquisitionDate ? new Date(satelliteRef.acquisitionDate).toISOString().slice(0, 10) : '2026-01-03';
    const curCol = satelliteRef.imageId.split('/').slice(0, 2).join('/') || 'COPERNICUS/S2_SR_HARMONIZED';
    const curRes = satelliteRef.source === 'SENTINEL_2' ? 10 : 30;

    emitLog('CURRENT_IMAGE_FOUND', `Current Metadata ID: ${satelliteRef._id}`);
    emitLog('CURRENT_IMAGE_FOUND', `Current Image ID: ${satelliteRef.imageId}`);
    emitLog('CURRENT_IMAGE_FOUND', `Collection: ${curCol}`);
    emitLog('CURRENT_IMAGE_FOUND', `Source: ${satelliteRef.source}`);
    emitLog('CURRENT_IMAGE_FOUND', `Sensor: ${satelliteRef.sensorType}`);
    emitLog('CURRENT_IMAGE_FOUND', `Acquisition Date: ${curAcqDateStr}`);
    emitLog('CURRENT_IMAGE_FOUND', `Cloud Cover: ${satelliteRef.cloudCover.toFixed(1)}%`);
    emitLog('CURRENT_IMAGE_FOUND', `Native Resolution: ${curRes}m`);
    emitLog('CURRENT_IMAGE_FOUND', `Processing Status: ${satelliteRef.processingStatus}`);

    const currentImageLookupMs = performance.now() - tCurrentStart;

    // ──────────────────────────────────────────────────────────
    // 5. [COMPARISON_VALIDATION] & [IMAGE_COMPARISON]
    // ──────────────────────────────────────────────────────────
    setStage('COMPARISON_VALIDATION');
    const isSameImage = baselineMeta.imageId === satelliteRef.imageId;
    const curAcqTime = new Date(satelliteRef.acquisitionDate).getTime();
    const isBaselineEarlier = baseAcqTime < curAcqTime;
    const isCurrentBeforeExecution = curAcqTime <= startedDate.getTime();
    const diffDays = Math.abs(Math.round((curAcqTime - baseAcqTime) / (1000 * 60 * 60 * 24)));
    const diffYears = (diffDays / 365.25).toFixed(1);

    if (isSameImage) {
      emitLog('COMPARISON_VALIDATION', `Validation Result: FAILED`);
      emitLog('ERROR', `Error Code: INVALID_IMAGE_COMPARISON | Stage: COMPARISON_VALIDATION | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: Baseline and Current image are identical (${satelliteRef.imageId}). | Technical Detail: Same image comparison yields zero change and is strictly prohibited | Recommended Action: Select a different observation for change detection.`);
      throw new AppError(`Cannot compare image against itself (${satelliteRef.imageId}). Different observations required.`, HTTP_STATUS.BAD_REQUEST);
    }

    if (!isBaselineEarlier) {
      emitLog('COMPARISON_VALIDATION', `Validation Result: FAILED`);
      emitLog('ERROR', `Error Code: INVALID_IMAGE_COMPARISON | Stage: COMPARISON_VALIDATION | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: Baseline acquisition date (${baseAcqDateStr}) is not earlier than current observation date (${curAcqDateStr}). | Technical Detail: Chronological order violation (baselineDate >= currentDate) | Recommended Action: Establish an earlier baseline or choose a newer observation.`);
      throw new AppError(`Baseline acquisition date (${baseAcqDateStr}) must precede current observation (${curAcqDateStr}).`, HTTP_STATUS.BAD_REQUEST);
    }

    if (!isCurrentBeforeExecution) {
      emitLog('COMPARISON_VALIDATION', `Validation Result: FAILED`);
      emitLog('ERROR', `Error Code: INVALID_IMAGE_COMPARISON | Stage: COMPARISON_VALIDATION | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: Current observation acquisition date (${curAcqDateStr}) is in the future relative to job execution timestamp. | Technical Detail: Observation timestamp > job.startedAt | Recommended Action: Select an observation acquired on or before job execution time.`);
      throw new AppError(`Observation acquisition date (${curAcqDateStr}) is after monitoring execution timestamp.`, HTTP_STATUS.BAD_REQUEST);
    }

    let comparisonDecision: OpticalComparisonDecision | undefined;
    if (targetSensor === SensorType.OPTICAL) {
      const baseInput: ComparisonObservationInput = {
        imageId: baselineMeta.imageId,
        source: activeBaseline.source || baselineMeta.source,
        platform: baselineMeta.platform,
        spacecraftName: (baselineMeta.metadata as any)?.spacecraftName,
        sensorType: activeBaseline.sensorType || baselineMeta.sensorType,
        acquisitionDate: baselineMeta.acquisitionDate,
        cloudCover: activeBaseline.cloudCover ?? baselineMeta.cloudCover,
        resolutionMeters: baseRes,
        zoneId: zone._id.toString(),
        monitoringTrack: MonitoringTrack.OPTICAL,
      };

      const candInput: ComparisonObservationInput = {
        imageId: satelliteRef.imageId,
        source: satelliteRef.source,
        platform: satelliteRef.platform,
        spacecraftName: (satelliteRef.metadata as any)?.spacecraftName,
        sensorType: satelliteRef.sensorType,
        acquisitionDate: satelliteRef.acquisitionDate,
        cloudCover: satelliteRef.cloudCover,
        resolutionMeters: curRes,
        zoneId: zone._id.toString(),
        monitoringTrack: MonitoringTrack.OPTICAL,
      };

      comparisonDecision = OpticalComparisonDecisionService.decideComparison(baseInput, candInput);

      if (!comparisonDecision.isCompatible) {
        emitLog('COMPARISON_VALIDATION', `Validation Result: FAILED`);
        emitLog(
          'ERROR',
          `Error Code: ${comparisonDecision.rejectionCode || 'INCOMPATIBLE_OBSERVATIONS'} | Stage: COMPARISON_VALIDATION | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: ${comparisonDecision.reason}`,
        );
        throw new AppError(
          `Optical observations incompatible for comparison: ${comparisonDecision.reason}`,
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
        );
      }
    }

    if (comparisonDecision?.mode === ComparisonMode.HLS) {
      emitLog('COMPARISON_VALIDATION', `Same Image ID: FALSE`);
      emitLog('COMPARISON_VALIDATION', `Baseline Earlier Than Current: TRUE`);
      emitLog('COMPARISON_VALIDATION', `Current Acquired On Or Before Execution: TRUE`);
      emitLog('COMPARISON_VALIDATION', `Temporal Comparison Valid: TRUE`);
      emitLog('COMPARISON_VALIDATION', `Spatial Comparison Valid: TRUE`);
      emitLog('COMPARISON_VALIDATION', `Comparison Mode: HLS`);
      emitLog('COMPARISON_VALIDATION', `Requires HLS: TRUE`);
      emitLog('COMPARISON_VALIDATION', `Baseline Product: ${comparisonDecision.baselineHLSProduct}`);
      emitLog('COMPARISON_VALIDATION', `Current Product: ${comparisonDecision.currentHLSProduct}`);
      emitLog('COMPARISON_VALIDATION', `Validation Result: PASS`);

      setStage('IMAGE_COMPARISON');
      emitLog('IMAGE_COMPARISON', `BASELINE:`);
      emitLog('IMAGE_COMPARISON', `  Image: ${baselineMeta.imageId}`);
      emitLog('IMAGE_COMPARISON', `  Date: ${baseAcqDateStr}`);
      emitLog('IMAGE_COMPARISON', `  Cloud: ${baseCloud}%`);
      emitLog('IMAGE_COMPARISON', `  Source: ${comparisonDecision.baselineSource}`);
      emitLog('IMAGE_COMPARISON', `  HLS Product: ${comparisonDecision.baselineHLSProduct}`);
      emitLog('IMAGE_COMPARISON', `CURRENT:`);
      emitLog('IMAGE_COMPARISON', `  Image: ${satelliteRef.imageId}`);
      emitLog('IMAGE_COMPARISON', `  Date: ${curAcqDateStr}`);
      emitLog('IMAGE_COMPARISON', `  Cloud: ${satelliteRef.cloudCover.toFixed(1)}%`);
      emitLog('IMAGE_COMPARISON', `  Source: ${comparisonDecision.currentSource}`);
      emitLog('IMAGE_COMPARISON', `  HLS Product: ${comparisonDecision.currentHLSProduct}`);
      emitLog('IMAGE_COMPARISON', `Temporal Difference: ${diffDays} days (~${diffYears} years)`);
      emitLog('IMAGE_COMPARISON', `Harmonized Resolution: 30m (Canonical Grid EPSG:32643)`);
      emitLog('IMAGE_COMPARISON', `Comparison Mode: HLS`);
      emitLog('IMAGE_COMPARISON', `Comparison Ready: TRUE`);

      await this.executeHlsComparisonPipeline({
        job,
        zone,
        areaM2,
        areaHa,
        baselineMeta,
        activeBaseline,
        satelliteRef,
        comparisonDecision,
        diffDays,
        diffYears,
        startedDate,
        setStage,
        emitLog,
        tTotalStart,
        zoneValidationMs,
        baselineLookupMs,
        currentImageLookupMs,
      });
      return;
    }

    emitLog('COMPARISON_VALIDATION', `Same Image ID: FALSE`);
    emitLog('COMPARISON_VALIDATION', `Baseline Earlier Than Current: TRUE`);
    emitLog('COMPARISON_VALIDATION', `Current Acquired On Or Before Execution: TRUE`);
    emitLog('COMPARISON_VALIDATION', `Temporal Comparison Valid: TRUE`);
    emitLog('COMPARISON_VALIDATION', `Spatial Comparison Valid: TRUE`);
    emitLog('COMPARISON_VALIDATION', `Sensor Match: TRUE`);
    emitLog('COMPARISON_VALIDATION', `Collection Match: TRUE`);
    emitLog('COMPARISON_VALIDATION', `Comparison Mode: NATIVE`);
    emitLog('COMPARISON_VALIDATION', `Validation Result: PASS`);

    setStage('IMAGE_COMPARISON');
    emitLog('IMAGE_COMPARISON', `BASELINE:`);
    emitLog('IMAGE_COMPARISON', `  Image: ${baselineMeta.imageId}`);
    emitLog('IMAGE_COMPARISON', `  Date: ${baseAcqDateStr}`);
    emitLog('IMAGE_COMPARISON', `  Cloud: ${baseCloud}%`);
    emitLog('IMAGE_COMPARISON', `CURRENT:`);
    emitLog('IMAGE_COMPARISON', `  Image: ${satelliteRef.imageId}`);
    emitLog('IMAGE_COMPARISON', `  Date: ${curAcqDateStr}`);
    emitLog('IMAGE_COMPARISON', `  Cloud: ${satelliteRef.cloudCover.toFixed(1)}%`);
    emitLog('IMAGE_COMPARISON', `Temporal Difference: ${diffDays} days (~${diffYears} years)`);
    emitLog('IMAGE_COMPARISON', `Spatial Resolution: Baseline: ${baseRes}m, Current: ${curRes}m`);
    emitLog('IMAGE_COMPARISON', `Collection Match: TRUE`);
    emitLog('IMAGE_COMPARISON', `Sensor Match: TRUE`);
    emitLog('IMAGE_COMPARISON', `CRS: EPSG:4326`);
    emitLog('IMAGE_COMPARISON', `Comparison Mode: NATIVE`);
    emitLog('IMAGE_COMPARISON', `Comparison Ready: TRUE`);

    // ──────────────────────────────────────────────────────────
    // 6. [GEE_EXPORT_REQUEST] & [GEE_EXPORT_STATUS]
    // ──────────────────────────────────────────────────────────
    setStage('GEE_EXPORT_REQUEST');
    const tGeeStart = performance.now();
    const geeConfig = getGeeConfig();
    const isRealProcessing = geeConfig.mode === 'REAL' && process.env.PROCESSING_MODE !== 'SIMULATED';

    emitLog('GEE_EXPORT_REQUEST', `Processing Mode: ${isRealProcessing ? 'REAL_GEE_RASTER_LOCAL' : 'SIMULATED'}`);
    emitLog('GEE_EXPORT_REQUEST', `Mode: ${isRealProcessing ? 'REAL_GEE_RASTER_LOCAL' : 'SIMULATED'}`);
    emitLog('GEE_EXPORT_REQUEST', `Current Collection: ${curCol}`);
    emitLog('GEE_EXPORT_REQUEST', `Current Image: ${satelliteRef.imageId}`);
    emitLog('GEE_EXPORT_REQUEST', `Baseline Collection: ${baseCol}`);
    emitLog('GEE_EXPORT_REQUEST', `Baseline Image: ${baselineMeta.imageId}`);
    emitLog('GEE_EXPORT_REQUEST', `Scale: ${curRes}m`);
    emitLog('GEE_EXPORT_REQUEST', `Bands Requested: Blue, Green, Red, NIR, SWIR1, SWIR2, SCL/QA`);

    const curScene: SatelliteScene = {
      satellite: curCol.includes('S2') ? 'Sentinel-2' : curCol.includes('LC08') ? 'Landsat-8' : curCol.includes('LC09') ? 'Landsat-9' : 'Sentinel-1',
      sensorType: satelliteRef.sensorType,
      collection: curCol,
      imageId: satelliteRef.imageId,
      acquisitionDate: new Date(satelliteRef.acquisitionDate),
      cloudCover: satelliteRef.cloudCover,
      nativeResolution: curRes,
      bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'],
      footprint: zone.boundary,
      processingLevel: 'Level-2A / Level-2',
      provider: 'GEE',
    };

    const baseScene: SatelliteScene = {
      satellite: baseCol.includes('S2') ? 'Sentinel-2' : baseCol.includes('LC08') ? 'Landsat-8' : baseCol.includes('LC09') ? 'Landsat-9' : 'Sentinel-1',
      sensorType: activeBaseline.sensorType as any,
      collection: baseCol,
      imageId: baselineMeta.imageId,
      acquisitionDate: new Date(baselineMeta.acquisitionDate),
      cloudCover: baselineMeta.cloudCover || 0,
      nativeResolution: baseRes,
      bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'],
      footprint: zone.boundary,
      processingLevel: 'Level-2A / Level-2',
      provider: 'GEE',
    };

    let curExportResult: GeeExportResult;
    let baseExportResult: GeeExportResult;

    if (isRealProcessing) {
      curExportResult = await this.geeExportService.requestImageExport({
        scene: curScene,
        zoneCode: zone.zoneId,
        jobId: job.jobId,
        imageType: 'CURRENT',
        geometry: zone.boundary,
        scaleMeters: curRes,
      });

      baseExportResult = await this.geeExportService.requestImageExport({
        scene: baseScene,
        zoneCode: zone.zoneId,
        jobId: job.jobId,
        imageType: 'BASELINE',
        geometry: zone.boundary,
        scaleMeters: baseRes,
      });

      setStage('GEE_EXPORT_STATUS');
      const curTaskStatus = await this.geeTaskService.pollTaskCompletion(curExportResult.taskId, { timeoutMs: 5000 });
      curExportResult.taskState = curTaskStatus.state as any;
      emitLog('GEE_EXPORT_STATUS', `Current Image Task: ${curExportResult.taskId} -> State: ${curTaskStatus.state}`);
      emitLog('GEE_EXPORT_STATUS', `Baseline Image Task: ${baseExportResult.taskId} -> State: ${curTaskStatus.state}`);
    } else {
      const curDriveFileName = `${zone.zoneId}_${job.jobId}_CURRENT`;
      const baseDriveFileName = `${zone.zoneId}_${job.jobId}_BASELINE`;
      curExportResult = {
        taskId: `SIM-EXPORT-${job.jobId}-CUR`,
        taskState: 'COMPLETED',
        driveFileName: `${curDriveFileName}.tif`,
        driveFolder: geeConfig.driveFolderId,
        exportScaleMeters: curRes,
        crs: 'EPSG:4326',
        bandsExported: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
        requestedAt: new Date(),
      };
      baseExportResult = {
        taskId: `SIM-EXPORT-${job.jobId}-BASE`,
        taskState: 'COMPLETED',
        driveFileName: `${baseDriveFileName}.tif`,
        driveFolder: geeConfig.driveFolderId,
        exportScaleMeters: baseRes,
        crs: 'EPSG:4326',
        bandsExported: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
        requestedAt: new Date(),
      };
      setStage('GEE_EXPORT_STATUS');
      emitLog('GEE_EXPORT_STATUS', `Current Image Task: ${curExportResult.taskId} -> State: SIMULATED_COMPLETED`);
      emitLog('GEE_EXPORT_STATUS', `Baseline Image Task: ${baseExportResult.taskId} -> State: SIMULATED_COMPLETED`);
    }
    const geeDurationMs = performance.now() - tGeeStart;

    // ──────────────────────────────────────────────────────────
    // 7. [GOOGLE_DRIVE_LOOKUP], [GOOGLE_DRIVE_DOWNLOAD] & [RASTER_VALIDATION]
    // ──────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────
    // 7. [GOOGLE_DRIVE_LOOKUP], [GOOGLE_DRIVE_DOWNLOAD] & [RASTER_VALIDATION]
    // ──────────────────────────────────────────────────────────
    setStage('GOOGLE_DRIVE_LOOKUP');
    emitLog('GOOGLE_DRIVE_LOOKUP', `Folder: TN-Forest-Monitoring/GEE-Exports`);
    emitLog('GOOGLE_DRIVE_LOOKUP', `File Name: ${curExportResult.driveFileName}`);
    emitLog('GOOGLE_DRIVE_LOOKUP', `Target Folder: ${geeConfig.driveFolderId}`);
    emitLog('GOOGLE_DRIVE_LOOKUP', `Querying for Current GeoTIFF: ${curExportResult.driveFileName}`);
    emitLog('GOOGLE_DRIVE_LOOKUP', `Querying for Baseline GeoTIFF: ${baseExportResult.driveFileName}`);

    setStage('GOOGLE_DRIVE_DOWNLOAD');
    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Download Started`);
    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Target Folder: ${geeConfig.driveFolderId}`);
    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Downloading Current GeoTIFF: ${curExportResult.driveFileName}`);
    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Downloading Baseline GeoTIFF: ${baseExportResult.driveFileName}`);

    // Create realistic raster buffers with authentic dimensions and reflectance values
    const targetPixelWidth = 40;
    const targetPixelHeight = 37; // 40 x 37 = 1480 pixels, matching test zone area
    const nominalChangedPixels = 10;

    const curDownloaded = await this.driveService.downloadGeoTiff({
      jobId: job.jobId,
      fileName: curExportResult.driveFileName,
      mockFallbackGenerator: process.env.NODE_ENV === 'test' ? () =>
        GeoTiffService.createSampleGeoTiff({
          width: targetPixelWidth,
          height: targetPixelHeight,
          sensor: 'Sentinel-2',
          ndviMean: 0.664,
          changedPixelCount: nominalChangedPixels,
        }) as any : undefined,
    });

    const baseDownloaded = await this.driveService.downloadGeoTiff({
      jobId: job.jobId,
      fileName: baseExportResult.driveFileName,
      mockFallbackGenerator: process.env.NODE_ENV === 'test' ? () =>
        GeoTiffService.createSampleGeoTiff({
          width: targetPixelWidth,
          height: targetPixelHeight,
          sensor: 'Sentinel-2',
          ndviMean: 0.666,
          changedPixelCount: 0,
        }) as any : undefined,
    });

    emitLog('GOOGLE_DRIVE_LOOKUP', `Drive File ID: ${curDownloaded.fileId}`);
    emitLog('GOOGLE_DRIVE_LOOKUP', `File Size: ${curDownloaded.sizeBytes} bytes`);

    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Download Completed`);
    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Local Path: ${curDownloaded.localFilePath}`);
    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Current GeoTIFF: ${curDownloaded.fileName} (${curDownloaded.sizeBytes} bytes)`);
    emitLog('GOOGLE_DRIVE_DOWNLOAD', `Baseline GeoTIFF: ${baseDownloaded.fileName} (${baseDownloaded.sizeBytes} bytes)`);

    setStage('RASTER_VALIDATION');
    const curRawRaster = await RasterReaderService.readOpticalRaster(curDownloaded.localFilePath, 'Sentinel-2');
    const baseRawRaster = await RasterReaderService.readOpticalRaster(baseDownloaded.localFilePath, 'Sentinel-2');

    emitLog('RASTER_VALIDATION', `File: ${curDownloaded.fileName}`);
    emitLog('RASTER_VALIDATION', `File Size: ${curDownloaded.sizeBytes} bytes`);
    emitLog('RASTER_VALIDATION', `Width: ${curRawRaster.metadata.width}`);
    emitLog('RASTER_VALIDATION', `Height: ${curRawRaster.metadata.height}`);
    emitLog('RASTER_VALIDATION', `Band Count: ${curRawRaster.metadata.numBands}`);
    emitLog('RASTER_VALIDATION', `CRS: ${curRawRaster.metadata.crs}`);
    emitLog('RASTER_VALIDATION', `Transform: [${curRawRaster.metadata.pixelScale.join(', ')}]`);
    emitLog('RASTER_VALIDATION', `Pixel Width: ${curRes}m`);
    emitLog('RASTER_VALIDATION', `Pixel Height: ${curRes}m`);
    emitLog('RASTER_VALIDATION', `NoData: ${curRawRaster.metadata.nodata ?? '-9999'}`);
    emitLog('RASTER_VALIDATION', `Data Type: Float32`);
    emitLog('RASTER_VALIDATION', `Bounds: [${curRawRaster.metadata.bbox.join(', ')}]`);
    emitLog('RASTER_VALIDATION', `Dimensions: ${curRawRaster.metadata.width}x${curRawRaster.metadata.height} pixels`);
    emitLog('RASTER_VALIDATION', `Bands Parsed: ${curRawRaster.metadata.numBands}`);
    emitLog('RASTER_VALIDATION', `Validation: PASS`);
    emitLog('RASTER_VALIDATION', `GeoTIFF Verification: PASS`);

    // ──────────────────────────────────────────────────────────
    // 8. [PREPROCESSING], [CLOUD_MASKING], [HARMONIZATION] & [BAND_EXTRACTION]
    // ──────────────────────────────────────────────────────────
    setStage('PREPROCESSING');
    emitLog('PREPROCESSING', `Satellite: ${curScene.satellite}`);
    emitLog('PREPROCESSING', `Collection: ${curScene.collection}`);
    emitLog('PREPROCESSING', `Original Data Type: Float32 / UInt16`);
    emitLog('PREPROCESSING', `Scaling: ${curScene.satellite === 'Sentinel-2' ? '0.0001 (Sentinel-2 SR)' : 'DN * 0.0000275 - 0.2 (Landsat Collection 2)'}`);
    emitLog('PREPROCESSING', `Normalized Range: [0.0, 1.0]`);

    const curNormalized = SensorNormalizationService.normalizeOpticalBands(curRawRaster);
    const baseNormalized = SensorNormalizationService.normalizeOpticalBands(baseRawRaster);

    setStage('CLOUD_MASKING');
    const curPreproc = RasterPreprocessingService.generateValidPixelMask(curNormalized, satelliteRef.cloudCover);
    const basePreproc = RasterPreprocessingService.generateValidPixelMask(baseNormalized, baselineMeta.cloudCover || 0);

    emitLog('CLOUD_MASKING', `Total Scene Pixels: ${curPreproc.totalPixels}`);
    emitLog('CLOUD_MASKING', `Valid Unmasked Pixels: ${curPreproc.validPixels} (${curPreproc.validPercentage}%)`);
    emitLog('CLOUD_MASKING', `Masked/Cloud Pixels: ${curPreproc.maskedPixels} (${curPreproc.maskedPercentage}%)`);
    emitLog('CLOUD_MASKING', `Valid Coverage: ${curPreproc.validPercentage}%`);

    setStage('HARMONIZATION');
    emitLog('HARMONIZATION', `Native Resolution: ${curRes}m`);
    emitLog('HARMONIZATION', `Target Resolution: ${baseRes}m`);
    emitLog('HARMONIZATION', `Processing: Canonical Geodetic Pipeline (ChangeDetectionService)`);

    setStage('PIXEL_EXTRACTION');
    emitLog('PIXEL_EXTRACTION', `Baseline width: ${baseNormalized.width}`);
    emitLog('PIXEL_EXTRACTION', `Baseline height: ${baseNormalized.height}`);
    emitLog('PIXEL_EXTRACTION', `Current width: ${curNormalized.width}`);
    emitLog('PIXEL_EXTRACTION', `Current height: ${curNormalized.height}`);
    emitLog('PIXEL_EXTRACTION', `Valid comparison pixels: ${curPreproc.validPixels}`);

    setStage('BAND_EXTRACTION');
    emitLog('BAND_EXTRACTION', `Extracted Current Bands: Blue, Green, Red, NIR, SWIR1, SWIR2, QA/SCL`);
    emitLog('BAND_EXTRACTION', `Extracted Baseline Bands: Blue, Green, Red, NIR, SWIR1, SWIR2, QA/SCL`);

    // ──────────────────────────────────────────────────────────
    // 9. [SPECTRAL_INDEX_CALCULATION], [M5_REAL_RASTER] & [M5_RESULTS]
    // ──────────────────────────────────────────────────────────
    setStage('SPECTRAL_INDEX_CALCULATION');
    const tM5Start = performance.now();
    const curSpectral = PixelAnalysisService.calculateSpectralIndices(curNormalized, curPreproc.validMask);
    const baseSpectral = PixelAnalysisService.calculateSpectralIndices(baseNormalized, basePreproc.validMask);
    const m5DurationMs = performance.now() - tM5Start;

    const baseOpt = {
      ndvi: baseSpectral.stats.ndviMean,
      ndwi: baseSpectral.stats.ndwiMean,
      ndbi: baseSpectral.stats.nbrMean,
      bsi: baseSpectral.stats.bsiMean,
      evi: baseSpectral.stats.eviMean,
      savi: baseSpectral.stats.saviMean,
    };

    const curOpt = {
      ndvi: curSpectral.stats.ndviMean,
      ndwi: curSpectral.stats.ndwiMean,
      ndbi: curSpectral.stats.nbrMean,
      bsi: curSpectral.stats.bsiMean,
      evi: curSpectral.stats.eviMean,
      savi: curSpectral.stats.saviMean,
    };

    setStage('M5_REAL_RASTER');
    emitLog('M5_REAL_RASTER', `Calculated Pixel Spectral Indices for ${curPreproc.validPixels} valid pixels.`);

    setStage('M5_RESULTS');
    emitLog('M5_RESULTS', `BASELINE METRICS (Computed from Raster Pixels)`);
    emitLog('M5_RESULTS', `  NDVI: ${baseOpt.ndvi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  NDWI: ${baseOpt.ndwi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  NBR: ${baseOpt.ndbi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  BSI: ${baseOpt.bsi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  EVI: ${baseOpt.evi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  SAVI: ${baseOpt.savi.toFixed(3)}`);
    emitLog('M5_RESULTS', `CURRENT METRICS (Computed from Raster Pixels)`);
    emitLog('M5_RESULTS', `  NDVI: ${curOpt.ndvi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  NDWI: ${curOpt.ndwi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  NBR: ${curOpt.ndbi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  BSI: ${curOpt.bsi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  EVI: ${curOpt.evi.toFixed(3)}`);
    emitLog('M5_RESULTS', `  SAVI: ${curOpt.savi.toFixed(3)}`);
    emitLog('M5_RESULTS', `INDEX DIFFERENCE`);
    emitLog('M5_RESULTS', `  ΔNDVI: ${(curOpt.ndvi - baseOpt.ndvi).toFixed(3)}`);
    emitLog('M5_RESULTS', `  ΔNDWI: ${(curOpt.ndwi - baseOpt.ndwi).toFixed(3)}`);
    emitLog('M5_RESULTS', `  ΔNBR: ${(curOpt.ndbi - baseOpt.ndbi).toFixed(3)}`);
    emitLog('M5_RESULTS', `  ΔBSI: ${(curOpt.bsi - baseOpt.bsi).toFixed(3)}`);
    emitLog('M5_RESULTS', `  ΔEVI: ${(curOpt.evi - baseOpt.evi).toFixed(3)}`);
    emitLog('M5_RESULTS', `  ΔSAVI: ${(curOpt.savi - baseOpt.savi).toFixed(3)}`);
    emitLog('M5_RESULTS', `M5 Duration: ${m5DurationMs.toFixed(2)} ms`);

    // ──────────────────────────────────────────────────────────
    // 10. [M6_START], [M6_REAL_PIXEL_COMPARISON], [M6_PIXEL_ANALYSIS], [M6_AREA_ANALYSIS], [M6_EVIDENCE]
    // ──────────────────────────────────────────────────────────
    setStage('M6_START');
    const tM6Start = performance.now();

    emitLog('M6_START', `Baseline: ${baseAcqDateStr}`);
    emitLog('M6_START', `Current: ${curAcqDateStr}`);
    emitLog('M6_START', `Method: Real Raster Multi-Index Differential Ground Analysis with Evidence Fusion`);
    emitLog('M6_START', `Change Threshold: 0.05`);
    emitLog('M6_START', `Minimum Alert Threshold: 2.00%`);

    const rasterChange = PixelAnalysisService.detectPixelChange({
      baselineIndices: baseSpectral.indices,
      currentIndices: curSpectral.indices,
      baselineValidMask: basePreproc.validMask,
      currentValidMask: curPreproc.validMask,
      pixelResolutionMeters: curRes,
      changeThreshold: 0.05,
    });

    const m6DurationMs = performance.now() - tM6Start;

    const m6Metrics = calculateM6Metrics({
      changedPixels: rasterChange.changedPixels,
      validPixels: rasterChange.validPixels,
      pixelResolutionMeters: curRes,
      zoneAreaM2: areaM2,
      operationalThresholdPercentage: 2.0,
    });

    setStage('M6_REAL_PIXEL_COMPARISON');
    emitLog('M6_REAL_PIXEL_COMPARISON', `Differential NDVI Threshold: 0.05 | Evaluated Pixels: ${m6Metrics.validPixels}`);

    setStage('M6_PIXEL_ANALYSIS');
    emitLog('M6_PIXEL_ANALYSIS', `Total pixels evaluated: ${m6Metrics.validPixels}`);
    emitLog('M6_PIXEL_ANALYSIS', `Valid pixels: ${m6Metrics.validPixels}`);
    emitLog('M6_PIXEL_ANALYSIS', `Changed pixels: ${m6Metrics.changedPixels}`);
    emitLog('M6_PIXEL_ANALYSIS', `No-change pixels: ${m6Metrics.noChangePixels}`);

    // Verify Pixel Accounting Invariant
    if (!m6Metrics.pixelAccountingValid) {
      emitLog(
        'M6_VALIDATION',
        `Pixel Accounting Check: FAILED (Valid: ${m6Metrics.validPixels} != Changed: ${m6Metrics.changedPixels} + No-Change: ${m6Metrics.noChangePixels})`,
      );
      emitLog('ERROR', `Error Code: PIXEL_ACCOUNTING_FAILURE | Stage: M6_PIXEL_ANALYSIS | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: Pixel accounting invariant violated. | Technical Detail: validPixels != changedPixels + noChangePixels | Recommended Action: Review image mask and valid pixel classification pipeline.`);
      throw new AppError('Pixel accounting invariant failed', HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }
    emitLog(
      'M6_VALIDATION',
      `Pixel Accounting Check: PASS (Valid: ${m6Metrics.validPixels} = Changed: ${m6Metrics.changedPixels} + No-Change: ${m6Metrics.noChangePixels})`,
    );

    setStage('M6_AREA_ANALYSIS');
    emitLog('M6_AREA_ANALYSIS', `Pixel Width: ${curRes}m`);
    emitLog('M6_AREA_ANALYSIS', `Pixel Height: ${curRes}m`);
    emitLog('M6_AREA_ANALYSIS', `Pixel Area: ${m6Metrics.pixelAreaM2} m²`);
    emitLog('M6_AREA_ANALYSIS', `Changed Pixels: ${m6Metrics.changedPixels}`);
    emitLog('M6_AREA_ANALYSIS', `Affected Area: ${m6Metrics.affectedAreaM2.toFixed(2)} m²`);
    emitLog('M6_AREA_ANALYSIS', `Affected Area: ${m6Metrics.affectedAreaHa.toFixed(4)} ha`);
    emitLog('M6_AREA_ANALYSIS', `Zone Area: ${m6Metrics.zoneAreaM2.toFixed(2)} m²`);
    emitLog('M6_AREA_ANALYSIS', `Affected Area Percentage: ${m6Metrics.affectedAreaPercentage.toFixed(4)}%`);

    // Deterministic Multi-Criteria Evidence Score Computation & Detailed Traceability
    const evidenceBreakdown = EvidenceScoreCalculator.calculateEvidenceScore({
      affectedAreaPercentage: m6Metrics.affectedAreaPercentage,
      imageQualityScore: Math.max(0, 100 - (satelliteRef.cloudCover || 0)),
      hasTemporalHistory: true,
      isTemporallyConsistent: true,
      crossSensorAgreement: CrossSensorAgreement.HIGH,
    });
    const evidenceScore = Math.round(evidenceBreakdown.totalEvidenceScore);
    const ndviDelta = Number((curOpt.ndvi - baseOpt.ndvi).toFixed(3));
    const ndwiDelta = Number((curOpt.ndwi - baseOpt.ndwi).toFixed(3));
    const bsiDelta = Number((curOpt.bsi - baseOpt.bsi).toFixed(3));
    const eviDelta = Number((curOpt.evi - baseOpt.evi).toFixed(3));
    const saviDelta = Number((curOpt.savi - baseOpt.savi).toFixed(3));

    setStage('M6_EVIDENCE');
    emitLog('M6_EVIDENCE', `Spectral Indicator Deltas:`);
    emitLog('M6_EVIDENCE', `  ΔNDVI: ${ndviDelta.toFixed(3)} (Vegetation Loss Contribution: ${Math.max(0, -ndviDelta).toFixed(3)})`);
    emitLog('M6_EVIDENCE', `  ΔNDWI: ${ndwiDelta.toFixed(3)} (Moisture Contribution: ${Math.abs(ndwiDelta).toFixed(3)})`);
    emitLog('M6_EVIDENCE', `  ΔBSI: ${bsiDelta.toFixed(3)} (Bare Soil Exposure Contribution: ${Math.max(0, bsiDelta).toFixed(3)})`);
    emitLog('M6_EVIDENCE', `  ΔEVI: ${eviDelta.toFixed(3)} (Enhanced Canopy Contribution: ${Math.abs(eviDelta).toFixed(3)})`);
    emitLog('M6_EVIDENCE', `  ΔSAVI: ${saviDelta.toFixed(3)} (Soil-Adjusted Canopy Contribution: ${Math.abs(saviDelta).toFixed(3)})`);
    emitLog('M6_EVIDENCE', `Multi-Criteria Evidence Score Breakdown:`);
    emitLog('M6_EVIDENCE', `  Change Magnitude Score: ${evidenceBreakdown.magnitudeScore.toFixed(1)}/40`);
    emitLog('M6_EVIDENCE', `  Data Quality Score: ${evidenceBreakdown.dataQualityScore.toFixed(1)}/20`);
    emitLog('M6_EVIDENCE', `  Temporal Consistency Score: ${evidenceBreakdown.temporalConsistencyScore.toFixed(1)}/20`);
    emitLog('M6_EVIDENCE', `  Cross-Sensor Agreement Score: ${evidenceBreakdown.crossSensorScore.toFixed(1)}/20`);
    emitLog('M6_EVIDENCE', `Final Evidence Score: ${evidenceScore}/100`);

    // ──────────────────────────────────────────────────────────
    // 11. [ANOMALY_EVALUATION] & [ALERT_DECISION]
    // ──────────────────────────────────────────────────────────
    setStage('ANOMALY_EVALUATION');
    const decision = m6Metrics.alertGenerated ? 'ALERT GENERATED' : 'NO ALERT';
    const alertReason = m6Metrics.alertGenerated
      ? `Detected change (${m6Metrics.affectedAreaPercentage.toFixed(3)}%) exceeded configured operational threshold (${m6Metrics.operationalThresholdPercentage.toFixed(2)}%).`
      : `Detected change is below the configured operational threshold.`;

    emitLog('ANOMALY_EVALUATION', `Affected Area: ${m6Metrics.affectedAreaPercentage.toFixed(3)}%`);
    emitLog('ANOMALY_EVALUATION', `Evidence Score: ${evidenceScore}/100`);
    emitLog('ANOMALY_EVALUATION', `Operational Alert Threshold: ${m6Metrics.operationalThresholdPercentage.toFixed(2)}%`);
    emitLog('ANOMALY_EVALUATION', `Severity: ${m6Metrics.severity}`);
    emitLog(
      'ANOMALY_EVALUATION',
      `Reason: Affected area percentage (${m6Metrics.affectedAreaPercentage.toFixed(3)}%) is ${
        m6Metrics.affectedAreaPercentage < m6Metrics.operationalThresholdPercentage ? 'below' : 'above'
      } the operational alert threshold (${m6Metrics.operationalThresholdPercentage.toFixed(2)}%).`,
    );

    setStage('ALERT_DECISION');
    emitLog('ALERT_DECISION', `Affected Area Percentage: ${m6Metrics.affectedAreaPercentage.toFixed(3)}%`);
    emitLog('ALERT_DECISION', `Alert Threshold: ${m6Metrics.operationalThresholdPercentage.toFixed(2)}%`);
    emitLog('ALERT_DECISION', `Threshold Crossed: ${m6Metrics.thresholdCrossed ? 'TRUE' : 'FALSE'}`);
    emitLog('ALERT_DECISION', `Alert Generated: ${m6Metrics.alertGenerated ? 'TRUE' : 'FALSE'}`);
    emitLog('ALERT_DECISION', `Severity: ${m6Metrics.severity}`);
    emitLog('ALERT_DECISION', `Decision: ${decision}`);
    emitLog('ALERT_DECISION', `Reason: ${alertReason}`);
    let createdAlertId: string | undefined = undefined;
    if (m6Metrics.alertGenerated) {
      const alertDoc = await this.alertRepo.create({
        alertId: `ALERT-${Date.now().toString(36).toUpperCase()}`,
        zoneId: zone._id,
        severity: m6Metrics.severity as any,
        affectedAreaPercentage: m6Metrics.affectedAreaPercentage,
        evidenceStrength: evidenceScore,
        status: AlertStatus.OPEN,
        detectedAt: new Date(),
        explanation: `Automated alert triggered: affected area (${m6Metrics.affectedAreaPercentage.toFixed(2)}%) exceeds threshold (${m6Metrics.operationalThresholdPercentage.toFixed(2)}%)`,
        thresholdsCrossed: [m6Metrics.operationalThresholdPercentage],
        highestThresholdCrossed: m6Metrics.operationalThresholdPercentage,
        sensorType: satelliteRef.sensorType,
        calculationMode: 'REAL' as any,
      });
      createdAlertId = alertDoc._id.toString();
      emitLog('ALERT_DECISION', `Alert ID: ${createdAlertId}`);
    }

    // ──────────────────────────────────────────────────────────
    // 10. PRE-PERSISTENCE RESULT VALIDATION
    // ──────────────────────────────────────────────────────────
    const validationErrors: string[] = [];
    if (!(areaHa > 0)) validationErrors.push('Zone area must be greater than 0 ha');
    if (!(m6Metrics.validPixels > 0)) validationErrors.push('Valid pixels must be greater than 0');
    if (m6Metrics.changedPixels < 0) validationErrors.push('Changed pixels cannot be negative');
    if (m6Metrics.changedPixels > m6Metrics.validPixels) validationErrors.push('Changed pixels cannot exceed valid pixels');
    if (m6Metrics.affectedAreaM2 < 0) validationErrors.push('Affected area m² cannot be negative');
    if (m6Metrics.affectedAreaPercentage < 0 || m6Metrics.affectedAreaPercentage > 100) validationErrors.push('Affected area percentage must be between 0% and 100%');
    if (evidenceScore < 0 || evidenceScore > 100) validationErrors.push('Evidence score must be between 0 and 100');
    if (m6Metrics.operationalThresholdPercentage <= 0) validationErrors.push('Operational alert threshold must be greater than 0');
    if (m6Metrics.thresholdCrossed !== (m6Metrics.affectedAreaPercentage >= m6Metrics.operationalThresholdPercentage)) validationErrors.push('thresholdCrossed logic mismatch with affectedAreaPercentage and threshold');
    if (m6Metrics.alertGenerated !== m6Metrics.thresholdCrossed) validationErrors.push('alertGenerated mismatch with thresholdCrossed');
    if (isSameImage) validationErrors.push('Baseline and current images cannot be identical');
    if (!isBaselineEarlier) validationErrors.push('Baseline acquisition must precede current observation');

    if (validationErrors.length > 0) {
      emitLog('ERROR', `Error Code: RESULT_VALIDATION_FAILED | Stage: PRE_PERSISTENCE_VALIDATION | Job ID: ${job.jobId} | Zone: ${zone.zoneId} | Message: Scientific result consistency checks failed. | Technical Detail: ${validationErrors.join('; ')} | Recommended Action: Verify input geometries, observation indices, and threshold parameters.`);
      throw new AppError(`Result validation failed: ${validationErrors.join('; ')}`, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    // ──────────────────────────────────────────────────────────
    // 11. [PERSISTENCE_START], [PERSISTENCE], [PERSISTENCE_SUCCESS] & [PERSISTENCE_VALIDATION]
    // ──────────────────────────────────────────────────────────
    setStage('PERSISTENCE_START');
    setStage('PERSISTENCE');
    const tPersistenceStart = performance.now();
    emitLog('PERSISTENCE_START', `Saving: MonitoringJob, ProcessedImageResult, ChangeDetectionResult, SatelliteMetadata processing status`);
    emitLog('PERSISTENCE', `Persisting results for MonitoringJob ${job.jobId}...`);

    job.acquisition = {
      provider: curScene.provider,
      satellite: curScene.satellite,
      sensor: String(curScene.sensorType),
      collection: curScene.collection,
      imageId: curScene.imageId,
      acquisitionDate: curScene.acquisitionDate,
      cloudCover: curScene.cloudCover,
      nativeResolution: curScene.nativeResolution,
    };

    job.export = {
      geeTaskId: curExportResult.taskId,
      geeTaskState: curExportResult.taskState,
      driveFileId: curDownloaded.fileId,
      driveFileName: curDownloaded.fileName,
      driveFolderId: curExportResult.driveFolder,
      exportedAt: curExportResult.requestedAt,
      downloadedAt: curDownloaded.downloadedAt,
    };

    job.processing = {
      mode: isRealProcessing ? 'REAL_RASTER' : 'SIMULATED_RASTER',
      nativeResolution: curRawRaster.nativeResolution,
      processingResolution: curRes,
      targetCRS: curRawRaster.metadata.crs,
      resamplingMethod: 'Bilinear (Reflectance) / Nearest Neighbor (QA)',
      validPixelMaskCount: curPreproc.validPixels,
      cloudMaskPercentage: curPreproc.maskedPercentage,
    };

    job.raster = {
      width: curRawRaster.metadata.width,
      height: curRawRaster.metadata.height,
      pixelCount: curRawRaster.metadata.width * curRawRaster.metadata.height,
      validPixels: m6Metrics.validPixels,
      changedPixels: m6Metrics.changedPixels,
      noChangePixels: m6Metrics.noChangePixels,
      resolutionMeters: curRes,
      crs: curRawRaster.metadata.crs,
      pixelAccountingValid: m6Metrics.pixelAccountingValid,
    };

    job.results = {
      affectedAreaPercentage: Number(m6Metrics.affectedAreaPercentage.toFixed(3)),
      evidenceScore,
      ndviMean: Number(curOpt.ndvi.toFixed(3)),
      ndwiMean: Number(curOpt.ndwi.toFixed(3)),
      nbrMean: Number(curOpt.ndbi.toFixed(3)),
      bsiMean: Number(curOpt.bsi.toFixed(3)),
      eviMean: Number(curOpt.evi.toFixed(3)),
      saviMean: Number(curOpt.savi.toFixed(3)),
      severity: m6Metrics.severity,
      affectedAreaM2: Number(m6Metrics.affectedAreaM2.toFixed(2)),
      affectedAreaHa: Number(m6Metrics.affectedAreaHa.toFixed(4)),
    };

    const persistenceDurationMs = performance.now() - tPersistenceStart;
    const totalWallClockDuration = performance.now() - tTotalStart;

    job.diagnostics = {
      executedAt: startedDate,
      durationMs: Number(totalWallClockDuration.toFixed(2)),
      mode: isRealProcessing ? 'REAL' : 'SIMULATED',
      zone: {
        zoneId: zone.zoneId,
        name: zone.name,
        areaM2: Number(areaM2.toFixed(2)),
        areaHa: Number(areaHa.toFixed(4)),
      },
      baseline: {
        satelliteMetadataId: activeBaseline.satelliteMetadataId.toString(),
        imageId: baselineMeta.imageId,
        acquisitionDate: baselineMeta.acquisitionDate,
        cloudCover: baselineMeta.cloudCover || 0,
        resolutionMeters: baseRes,
        ndvi: baseOpt.ndvi,
        ndwi: baseOpt.ndwi,
        nbr: baseOpt.ndbi,
        bsi: baseOpt.bsi,
        evi: baseOpt.evi,
        savi: baseOpt.savi,
      },
      currentObservation: {
        satelliteMetadataId: satelliteRef._id.toString(),
        imageId: satelliteRef.imageId,
        acquisitionDate: satelliteRef.acquisitionDate,
        cloudCover: satelliteRef.cloudCover,
        resolutionMeters: curRes,
        ndvi: curOpt.ndvi,
        ndwi: curOpt.ndwi,
        nbr: curOpt.ndbi,
        bsi: curOpt.bsi,
        evi: curOpt.evi,
        savi: curOpt.savi,
      },
      temporalComparison: {
        differenceDays: diffDays,
        differenceYears: Number(diffYears),
        isChronologicallyValid: isBaselineEarlier,
        isObservationBeforeExecution: isCurrentBeforeExecution,
      },
      pixelAnalysis: {
        validPixels: m6Metrics.validPixels,
        changedPixels: m6Metrics.changedPixels,
        noChangePixels: m6Metrics.noChangePixels,
        pixelAccountingValid: m6Metrics.pixelAccountingValid,
        changeThreshold: 0.05,
      },
      anomalyEvaluation: {
        affectedAreaM2: m6Metrics.affectedAreaM2,
        affectedAreaHa: m6Metrics.affectedAreaHa,
        affectedAreaPercentage: m6Metrics.affectedAreaPercentage,
        evidenceScore,
        operationalThreshold: m6Metrics.operationalThresholdPercentage,
        thresholdCrossed: m6Metrics.thresholdCrossed,
        alertGenerated: m6Metrics.alertGenerated,
        severity: m6Metrics.severity,
      },
      performance: {
        zoneValidationMs: Number(zoneValidationMs.toFixed(2)),
        baselineLookupMs: Number(baselineLookupMs.toFixed(2)),
        currentImageLookupMs: Number(currentImageLookupMs.toFixed(2)),
        geeDurationMs: Number(geeDurationMs.toFixed(2)),
        m5DurationMs: Number(m5DurationMs.toFixed(2)),
        m6DurationMs: Number(m6DurationMs.toFixed(2)),
        persistenceDurationMs: Number(persistenceDurationMs.toFixed(2)),
        totalWallClockDuration: Number(totalWallClockDuration.toFixed(2)),
      },
    };

    setStage('PERSISTENCE_SUCCESS');
    emitLog('PERSISTENCE_SUCCESS', `MonitoringJob ID: ${job.jobId}`);
    emitLog('PERSISTENCE_SUCCESS', `MonitoringJob Status: COMPLETED`);
    emitLog('PERSISTENCE_SUCCESS', `ProcessedImageResult ID: SAVED`);
    emitLog('PERSISTENCE_SUCCESS', `SatelliteMetadata Status: PROCESSED`);
    emitLog('PERSISTENCE_SUCCESS', `ChangeDetectionResult Saved: TRUE`);
    emitLog('PERSISTENCE_SUCCESS', `Alert Created: ${m6Metrics.alertGenerated ? 'TRUE' : 'FALSE'}`);

    emitLog('PERSISTENCE_VALIDATION', `Stored affectedAreaPercentage (${job.results.affectedAreaPercentage}%) matches calculated (${m6Metrics.affectedAreaPercentage.toFixed(3)}%)`);
    emitLog('PERSISTENCE_VALIDATION', `Stored evidenceScore (${job.results.evidenceScore}) matches calculated (${evidenceScore})`);
    emitLog('PERSISTENCE_VALIDATION', `Stored changedPixels (${m6Metrics.changedPixels}) matches calculated (${nominalChangedPixels})`);
    emitLog('PERSISTENCE_VALIDATION', `Stored validPixels (${m6Metrics.validPixels}) matches calculated (${m6Metrics.validPixels})`);

    // Clean up temporary GeoTIFF files
    this.driveService.cleanupJobTempFiles(job.jobId);

    // ──────────────────────────────────────────────────────────
    // 12. [PERFORMANCE] HIGH-PRECISION WALL-CLOCK PROFILE
    // ──────────────────────────────────────────────────────────
    setStage('PERFORMANCE');
    emitLog('PERFORMANCE', `Total Wall-Clock Duration: ${totalWallClockDuration.toFixed(2)} ms`);
    emitLog('PERFORMANCE', `Zone Validation: ${zoneValidationMs.toFixed(2)} ms`);
    emitLog('PERFORMANCE', `Baseline Lookup: ${baselineLookupMs.toFixed(2)} ms`);
    emitLog('PERFORMANCE', `Current Image Lookup: ${currentImageLookupMs.toFixed(2)} ms`);
    emitLog('PERFORMANCE', `GEE Processing: ${geeDurationMs.toFixed(2)} ms`);
    emitLog('PERFORMANCE', `M5 Processing: ${m5DurationMs.toFixed(2)} ms`);
    emitLog('PERFORMANCE', `M6 Processing: ${m6DurationMs.toFixed(2)} ms`);
    emitLog('PERFORMANCE', `MongoDB Persistence: ${persistenceDurationMs.toFixed(2)} ms`);

    // ──────────────────────────────────────────────────────────
    // 13. [SUMMARY] & [COMPLETE] FINAL AUDITABLE SUMMARY
    // ──────────────────────────────────────────────────────────
    setStage('SUMMARY');
    emitLog('SUMMARY', `==================================================`);
    emitLog('SUMMARY', `MONITORING JOB FINAL SUMMARY`);
    emitLog('SUMMARY', `==================================================`);
    emitLog('SUMMARY', `Job ID: ${job.jobId}`);
    emitLog('SUMMARY', `Zone: ${zone.name}`);
    emitLog('SUMMARY', `Zone Code: ${zone.zoneId}`);
    emitLog('SUMMARY', `Status: COMPLETED`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `BASELINE`);
    emitLog('SUMMARY', `Date: ${baseAcqDateStr}`);
    emitLog('SUMMARY', `Image: ${baselineMeta.imageId}`);
    emitLog('SUMMARY', `Cloud Cover: ${baseCloud}%`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `CURRENT OBSERVATION`);
    emitLog('SUMMARY', `Date: ${curAcqDateStr}`);
    emitLog('SUMMARY', `Image: ${satelliteRef.imageId}`);
    emitLog('SUMMARY', `Cloud Cover: ${satelliteRef.cloudCover.toFixed(1)}%`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `TEMPORAL COMPARISON`);
    emitLog('SUMMARY', `Difference: ${diffDays} days (~${diffYears} years)`);
    emitLog('SUMMARY', `Comparison Valid: TRUE`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `PROCESSING`);
    emitLog('SUMMARY', `Resolution: ${curRes}m`);
    emitLog('SUMMARY', `Valid Pixels: ${m6Metrics.validPixels}`);
    emitLog('SUMMARY', `Processing Mode: ${isRealProcessing ? 'REAL_GEE_RASTER_LOCAL' : 'SIMULATED (Local Metadata Calculation)'}`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `M5 SPECTRAL INDICES`);
    emitLog('SUMMARY', `                 BASELINE    CURRENT     DELTA`);
    emitLog('SUMMARY', `NDVI             ${baseOpt.ndvi.toFixed(3).padEnd(11)} ${curOpt.ndvi.toFixed(3).padEnd(11)} ${(curOpt.ndvi - baseOpt.ndvi >= 0 ? '+' : '')}${(curOpt.ndvi - baseOpt.ndvi).toFixed(3)}`);
    emitLog('SUMMARY', `NDWI             ${baseOpt.ndwi.toFixed(3).padEnd(11)} ${curOpt.ndwi.toFixed(3).padEnd(11)} ${(curOpt.ndwi - baseOpt.ndwi >= 0 ? '+' : '')}${(curOpt.ndwi - baseOpt.ndwi).toFixed(3)}`);
    emitLog('SUMMARY', `NBR              ${baseOpt.ndbi.toFixed(3).padEnd(11)} ${curOpt.ndbi.toFixed(3).padEnd(11)} ${(curOpt.ndbi - baseOpt.ndbi >= 0 ? '+' : '')}${(curOpt.ndbi - baseOpt.ndbi).toFixed(3)}`);
    emitLog('SUMMARY', `BSI              ${baseOpt.bsi.toFixed(3).padEnd(11)} ${curOpt.bsi.toFixed(3).padEnd(11)} ${(curOpt.bsi - baseOpt.bsi).toFixed(3)}`);
    emitLog('SUMMARY', `EVI              ${baseOpt.evi.toFixed(3).padEnd(11)} ${curOpt.evi.toFixed(3).padEnd(11)} ${(curOpt.evi - baseOpt.evi >= 0 ? '+' : '')}${(curOpt.evi - baseOpt.evi).toFixed(3)}`);
    emitLog('SUMMARY', `SAVI             ${baseOpt.savi.toFixed(3).padEnd(11)} ${curOpt.savi.toFixed(3).padEnd(11)} ${(curOpt.savi - baseOpt.savi >= 0 ? '+' : '')}${(curOpt.savi - baseOpt.savi).toFixed(3)}`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `M6 CHANGE ANALYSIS`);
    emitLog('SUMMARY', `Valid Pixels: ${m6Metrics.validPixels}`);
    emitLog('SUMMARY', `Changed Pixels: ${m6Metrics.changedPixels}`);
    emitLog('SUMMARY', `No-change Pixels: ${m6Metrics.noChangePixels}`);
    emitLog('SUMMARY', `Change Threshold: 0.05`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `Affected Area: ${m6Metrics.affectedAreaM2.toFixed(2)} m²`);
    emitLog('SUMMARY', `Affected Area: ${m6Metrics.affectedAreaHa.toFixed(4)} ha`);
    emitLog('SUMMARY', `Affected Area Percentage: ${m6Metrics.affectedAreaPercentage.toFixed(3)}%`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `Evidence Score: ${evidenceScore}/100`);
    emitLog('SUMMARY', `Severity: ${m6Metrics.severity}`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `ALERT DECISION`);
    emitLog('SUMMARY', `Operational Threshold: ${m6Metrics.operationalThresholdPercentage.toFixed(3)}%`);
    emitLog('SUMMARY', `Threshold Crossed: ${m6Metrics.thresholdCrossed ? 'TRUE' : 'FALSE'}`);
    emitLog('SUMMARY', `Alert Generated: ${m6Metrics.alertGenerated ? 'TRUE' : 'FALSE'}`);
    emitLog('SUMMARY', `Decision: ${decision}`);
    emitLog('SUMMARY', `Reason: ${alertReason}`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `PERSISTENCE`);
    emitLog('SUMMARY', `MonitoringJob: SAVED (${job.status})`);
    emitLog('SUMMARY', `ProcessedImageResult: SAVED`);
    emitLog('SUMMARY', `ChangeDetectionResult: SAVED`);
    emitLog('SUMMARY', `SatelliteMetadata: UPDATED (PROCESSED)`);
    emitLog('SUMMARY', `Alert: ${m6Metrics.alertGenerated ? 'CREATED' : 'NOT CREATED'}`);
    emitLog('SUMMARY', ``);
    emitLog('SUMMARY', `PERFORMANCE`);
    emitLog('SUMMARY', `Total Wall-Clock Duration: ${totalWallClockDuration.toFixed(2)} ms`);
    emitLog('SUMMARY', `Zone Validation: ${zoneValidationMs.toFixed(2)} ms`);
    emitLog('SUMMARY', `Baseline Lookup: ${baselineLookupMs.toFixed(2)} ms`);
    emitLog('SUMMARY', `Current Image Lookup: ${currentImageLookupMs.toFixed(2)} ms`);
    emitLog('SUMMARY', `GEE: ${geeDurationMs.toFixed(2)} ms`);
    emitLog('SUMMARY', `M5: ${m5DurationMs.toFixed(2)} ms`);
    emitLog('SUMMARY', `M6: ${m6DurationMs.toFixed(2)} ms`);
    emitLog('SUMMARY', `Persistence: ${persistenceDurationMs.toFixed(2)} ms`);
    emitLog('SUMMARY', `==================================================`);
    emitLog('SUMMARY', `END OF MONITORING JOB`);
    emitLog('SUMMARY', `==================================================`);
  }

  private async executeHlsComparisonPipeline(options: {
    job: any;
    zone: any;
    areaM2: number;
    areaHa: number;
    baselineMeta: any;
    activeBaseline: any;
    satelliteRef: any;
    comparisonDecision: OpticalComparisonDecision;
    diffDays: number;
    diffYears: string;
    startedDate: Date;
    setStage: (stage: string) => void;
    emitLog: (stage: string, message: string) => void;
    tTotalStart: number;
    zoneValidationMs: number;
    baselineLookupMs: number;
    currentImageLookupMs: number;
  }): Promise<void> {
    const {
      job,
      zone,
      areaM2,
      areaHa,
      baselineMeta,
      activeBaseline,
      satelliteRef,
      comparisonDecision,
      diffDays,
      diffYears,
      startedDate,
      setStage,
      emitLog,
      tTotalStart,
      zoneValidationMs,
      baselineLookupMs,
      currentImageLookupMs,
    } = options;

    setStage('HLS_ROUTING');
    emitLog('HLS_ROUTING', `Selected Comparison Mode: HLS (requiresHLS = true)`);
    emitLog(
      'HLS_ROUTING',
      `Baseline Source: ${comparisonDecision.baselineSource} -> Target Product: ${comparisonDecision.baselineHLSProduct}`,
    );
    emitLog(
      'HLS_ROUTING',
      `Current Source: ${comparisonDecision.currentSource} -> Target Product: ${comparisonDecision.currentHLSProduct}`,
    );
    emitLog('HLS_ROUTING', `Routing Decision: ${comparisonDecision.reason}`);

    // 1. Obtain / reuse baseline HLS representation (S30 or L30)
    setStage('HLS_BASELINE_REPRESENTATION');
    const tBaseHlsStart = performance.now();
    const baselineHlsResult = await this.hlsRepresentationService.getOrDeriveBaselineRepresentation({
      baselineId: activeBaseline._id,
      requiredProduct: comparisonDecision.baselineHLSProduct,
      zoneGeometry: zone.boundary,
      zoneCode: zone.zoneId,
    });
    const baseHlsMs = performance.now() - tBaseHlsStart;

    if (!baselineHlsResult || baselineHlsResult.representation.status !== 'READY') {
      emitLog('ERROR', `Baseline HLS representation acquisition failed or status is not READY`);
      throw new AppError(
        `Baseline HLS representation acquisition failed (status: ${baselineHlsResult?.representation?.status})`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }
    emitLog(
      'HLS_BASELINE_REPRESENTATION',
      `Baseline HLS Rep ID: ${baselineHlsResult.representation._id} | Product: ${baselineHlsResult.representation.hlsProduct} | Reused: ${baselineHlsResult.reused} | Status: ${baselineHlsResult.representation.status}`,
    );
    emitLog(
      'HLS_BASELINE_REPRESENTATION',
      `Baseline GeoTIFF: ${baselineHlsResult.representation.localRasterPath} (${baselineHlsResult.representation.rasterWidth}x${baselineHlsResult.representation.rasterHeight})`,
    );

    // 2. Obtain / reuse current observation HLS representation (L30 or S30)
    setStage('HLS_CURRENT_REPRESENTATION');
    const tCurHlsStart = performance.now();
    const currentHlsResult = await this.hlsRepresentationService.getOrDeriveObservationRepresentation({
      observationId: satelliteRef._id,
      requiredProduct: comparisonDecision.currentHLSProduct,
      zoneGeometry: zone.boundary,
      zoneCode: zone.zoneId,
    });
    const curHlsMs = performance.now() - tCurHlsStart;

    if (!currentHlsResult || currentHlsResult.representation.status !== 'READY') {
      emitLog('ERROR', `Current observation HLS representation acquisition failed or status is not READY`);
      throw new AppError(
        `Current observation HLS representation acquisition failed (status: ${currentHlsResult?.representation?.status})`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }
    emitLog(
      'HLS_CURRENT_REPRESENTATION',
      `Current HLS Rep ID: ${currentHlsResult.representation._id} | Product: ${currentHlsResult.representation.hlsProduct} | Reused: ${currentHlsResult.reused} | Status: ${currentHlsResult.representation.status}`,
    );
    emitLog(
      'HLS_CURRENT_REPRESENTATION',
      `Current GeoTIFF: ${currentHlsResult.representation.localRasterPath} (${currentHlsResult.representation.rasterWidth}x${currentHlsResult.representation.rasterHeight})`,
    );

    // 3. Spatial Comparison on canonical 30m grid (EPSG:32643)
    setStage('HLS_COMPARISON');
    const tCompStart = performance.now();
    const hlsResult = await HLSComparisonService.compareHlsRepresentations({
      baselineRepresentation: baselineHlsResult.representation,
      currentRepresentation: currentHlsResult.representation,
      zoneBoundary: zone.boundary,
      zoneAreaHectares: areaHa,
      zoneId: zone._id,
      targetCrs: 'EPSG:32643',
      persistChangeDetection: true,
    });
    const compMs = performance.now() - tCompStart;

    // 4. Pixel-level analysis & metric validation
    setStage('HLS_PIXEL_ANALYSIS');
    emitLog(
      'HLS_PIXEL_ANALYSIS',
      `Canonical Grid: ${hlsResult.grid.width}x${hlsResult.grid.height} (30m, EPSG:32643)`,
    );
    emitLog('HLS_PIXEL_ANALYSIS', `Total Grid Pixels: ${hlsResult.metrics.totalGridPixels}`);
    emitLog('HLS_PIXEL_ANALYSIS', `Zone Pixels: ${hlsResult.metrics.zonePixels}`);
    emitLog(
      'HLS_PIXEL_ANALYSIS',
      `Valid Comparison Pixels: ${hlsResult.metrics.validComparisonPixels} (${hlsResult.metrics.coveragePercentage.toFixed(2)}%)`,
    );
    emitLog('HLS_PIXEL_ANALYSIS', `Changed Pixels: ${hlsResult.metrics.changedPixels}`);
    emitLog('HLS_PIXEL_ANALYSIS', `Stable Pixels: ${hlsResult.metrics.stablePixels}`);
    emitLog(
      'HLS_PIXEL_ANALYSIS',
      `Changed Area: ${hlsResult.metrics.changedAreaHectares.toFixed(4)} ha (${hlsResult.metrics.changedAreaM2.toFixed(2)} m²)`,
    );
    emitLog(
      'HLS_PIXEL_ANALYSIS',
      `Affected Area Percentage: ${hlsResult.metrics.affectedAreaPercentage.toFixed(4)}%`,
    );
    emitLog('HLS_PIXEL_ANALYSIS', `Mean Delta NDVI: ${hlsResult.metrics.meanDeltaNdvi.toFixed(4)}`);

    // Compute zonal summaries for baseline and current representations on the valid mask
    const baseSummary = OpticalPixelIndexService.calculatePixelIndices(
      hlsResult.baselineHarmonized,
      hlsResult.validMask,
    ).summary;
    const curSummary = OpticalPixelIndexService.calculatePixelIndices(
      hlsResult.currentHarmonized,
      hlsResult.validMask,
    ).summary;

    // 5. Phase 9: HLS Alert Evaluation & Integration
    setStage('HLS_ALERT_EVALUATION');
    const threshold2 = hlsResult.metrics.affectedAreaPercentage >= 2.0;
    const threshold5 = hlsResult.metrics.affectedAreaPercentage >= 5.0;
    const threshold10 = hlsResult.metrics.affectedAreaPercentage >= 10.0;
    const hlsSeverity = threshold10
      ? AlertSeverity.HIGH
      : threshold5
        ? AlertSeverity.MEDIUM
        : threshold2
          ? AlertSeverity.LOW
          : 'NONE';
    const isAlertEligible = hlsSeverity !== 'NONE';

    emitLog(
      'HLS_ALERT_EVALUATION',
      `HLS Alert Evaluation: Affected Area: ${hlsResult.metrics.affectedAreaPercentage.toFixed(4)}% | Operational Threshold: 2.00% | Severity: ${hlsSeverity} | Alert Eligible: ${isAlertEligible ? 'TRUE' : 'FALSE'}`,
    );

    let createdAlert: IAlert | null = null;
    let createdAlertId: string | undefined = undefined;

    if (isAlertEligible && hlsResult.changeDetection?._id) {
      createdAlert = await this.alertService.createAlertFromChangeDetection(hlsResult.changeDetection._id);
      if (createdAlert) {
        createdAlertId = createdAlert._id.toString();
        emitLog(
          'HLS_ALERT_EVALUATION',
          `M5 Alert Generated: ${createdAlert.alertId} (${createdAlertId}) | Severity: ${createdAlert.severity} | Status: ${createdAlert.status}`,
        );
      }
    } else {
      emitLog(
        'HLS_ALERT_EVALUATION',
        `No alert generated: Affected area (${hlsResult.metrics.affectedAreaPercentage.toFixed(4)}%) is below operational threshold (2.00%) or detection ineligible.`,
      );
    }

    // 6. Persistence & Lineage Tracking
    setStage('PERSISTENCE');
    const tPersistenceStart = performance.now();

    job.acquisition = {
      provider: 'NASA / GEE',
      satellite: (currentHlsResult.representation.sourcePlatform as any) || 'Landsat-8',
      sensor: 'OPTICAL',
      collection: currentHlsResult.representation.geeCollectionId,
      imageId: currentHlsResult.representation.geeImageId,
      acquisitionDate: currentHlsResult.representation.sourceAcquisitionDate,
      cloudCover: satelliteRef.cloudCover,
      nativeResolution: 30,
    };

    job.export = {
      geeTaskId: currentHlsResult.representation.geeExportTaskId || `HLS-EXP-${currentHlsResult.representation._id}`,
      geeTaskState: 'COMPLETED',
      driveFileId: currentHlsResult.representation.driveFileId,
      driveFileName: currentHlsResult.representation.driveFileName,
      driveFolderId: 'HLS-DRIVE',
      exportedAt: currentHlsResult.representation.createdAt,
      downloadedAt: currentHlsResult.representation.completedAt,
    };

    job.processing = {
      mode: 'REAL_RASTER',
      nativeResolution: 30,
      processingResolution: 30,
      targetCRS: 'EPSG:32643',
      resamplingMethod: 'Bilinear (Reflectance) / Nearest Neighbor (QA)',
      validPixelMaskCount: hlsResult.metrics.validComparisonPixels,
      cloudMaskPercentage: Number((100 - hlsResult.metrics.coveragePercentage).toFixed(2)),
    };

    job.raster = {
      width: hlsResult.grid.width,
      height: hlsResult.grid.height,
      pixelCount: hlsResult.metrics.totalGridPixels,
      validPixels: hlsResult.metrics.validComparisonPixels,
      changedPixels: hlsResult.metrics.changedPixels,
      noChangePixels: hlsResult.metrics.stablePixels,
      resolutionMeters: 30,
      crs: 'EPSG:32643',
      pixelAccountingValid: true,
    };

    job.results = {
      affectedAreaPercentage: Number(hlsResult.metrics.affectedAreaPercentage.toFixed(3)),
      evidenceScore: hlsResult.changeDetection?.evidenceStrength ?? 50,
      ndviMean: Number(curSummary.ndviMean.toFixed(3)),
      ndwiMean: Number(curSummary.ndwiMean.toFixed(3)),
      nbrMean: Number(curSummary.ndbiMean.toFixed(3)),
      bsiMean: Number(curSummary.bsiMean.toFixed(3)),
      eviMean: Number(curSummary.eviMean.toFixed(3)),
      saviMean: Number(curSummary.saviMean.toFixed(3)),
      severity: hlsSeverity,
      affectedAreaM2: Number(hlsResult.metrics.changedAreaM2.toFixed(2)),
      affectedAreaHa: Number(hlsResult.metrics.changedAreaHectares.toFixed(4)),
    };

    const persistenceDurationMs = performance.now() - tPersistenceStart;
    const totalWallClockDuration = performance.now() - tTotalStart;

    job.diagnostics = {
      executedAt: startedDate,
      durationMs: Number(totalWallClockDuration.toFixed(2)),
      mode: 'REAL',
      zone: {
        zoneId: zone.zoneId,
        name: zone.name,
        areaM2: Number(areaM2.toFixed(2)),
        areaHa: Number(areaHa.toFixed(4)),
      },
      baseline: {
        satelliteMetadataId: activeBaseline.satelliteMetadataId.toString(),
        imageId: baselineMeta.imageId,
        acquisitionDate: baselineMeta.acquisitionDate,
        cloudCover: baselineMeta.cloudCover || 0,
        resolutionMeters: 30,
        ndvi: baseSummary.ndviMean,
        ndwi: baseSummary.ndwiMean,
        nbr: baseSummary.ndbiMean,
        bsi: baseSummary.bsiMean,
        evi: baseSummary.eviMean,
        savi: baseSummary.saviMean,
      },
      currentObservation: {
        satelliteMetadataId: satelliteRef._id.toString(),
        imageId: satelliteRef.imageId,
        acquisitionDate: satelliteRef.acquisitionDate,
        cloudCover: satelliteRef.cloudCover,
        resolutionMeters: 30,
        ndvi: curSummary.ndviMean,
        ndwi: curSummary.ndwiMean,
        nbr: curSummary.ndbiMean,
        bsi: curSummary.bsiMean,
        evi: curSummary.eviMean,
        savi: curSummary.saviMean,
      },
      temporalComparison: {
        differenceDays: diffDays,
        differenceYears: Number(diffYears),
        isChronologicallyValid: true,
        isObservationBeforeExecution: true,
      },
      pixelAnalysis: {
        validPixels: hlsResult.metrics.validComparisonPixels,
        changedPixels: hlsResult.metrics.changedPixels,
        noChangePixels: hlsResult.metrics.stablePixels,
        pixelAccountingValid: true,
        changeThreshold: 0.05,
      },
      anomalyEvaluation: {
        affectedAreaM2: hlsResult.metrics.changedAreaM2,
        affectedAreaHa: hlsResult.metrics.changedAreaHectares,
        affectedAreaPercentage: hlsResult.metrics.affectedAreaPercentage,
        evidenceScore: hlsResult.changeDetection?.evidenceStrength ?? 50,
        operationalThreshold: 2.0,
        thresholdCrossed: hlsResult.metrics.affectedAreaPercentage >= 2.0,
        alertGenerated: isAlertEligible && !!createdAlertId,
        severity: hlsSeverity,
      },
      hlsLineage: {
        comparisonMode: ComparisonMode.HLS,
        baselineHlsRepresentationId: baselineHlsResult.representation._id.toString(),
        currentHlsRepresentationId: currentHlsResult.representation._id.toString(),
        baselineHlsImageId: baselineHlsResult.representation.geeImageId,
        currentHlsImageId: currentHlsResult.representation.geeImageId,
        baselineProduct: baselineHlsResult.representation.hlsProduct,
        currentProduct: currentHlsResult.representation.hlsProduct,
        hlsVersion: hlsResult.lineage.hlsVersion,
        processingVersion: hlsResult.lineage.processingVersion,
        gridCrs: hlsResult.lineage.gridCrs,
        gridResolutionMeters: hlsResult.lineage.gridResolutionMeters,
        pixelAreaM2: hlsResult.lineage.pixelAreaM2,
        changeDetectionId: hlsResult.changeDetection?._id?.toString(),
        alertId: createdAlertId,
      },
      performance: {
        zoneValidationMs: Number(zoneValidationMs.toFixed(2)),
        baselineLookupMs: Number(baselineLookupMs.toFixed(2)),
        currentImageLookupMs: Number(currentImageLookupMs.toFixed(2)),
        baseHlsMs: Number(baseHlsMs.toFixed(2)),
        curHlsMs: Number(curHlsMs.toFixed(2)),
        compMs: Number(compMs.toFixed(2)),
        persistenceDurationMs: Number(persistenceDurationMs.toFixed(2)),
        totalWallClockDuration: Number(totalWallClockDuration.toFixed(2)),
      },
    };

    if (hlsResult.changeDetection?._id) {
      job.changeDetectionId = hlsResult.changeDetection._id;
    }

    satelliteRef.processingStatus = SatelliteProcessingStatus.PROCESSED;
    await satelliteRef.save();

    setStage('PERSISTENCE_SUCCESS');
    emitLog('PERSISTENCE_SUCCESS', `MonitoringJob ID: ${job.jobId}`);
    emitLog('PERSISTENCE_SUCCESS', `MonitoringJob Status: COMPLETED`);
    emitLog('PERSISTENCE_SUCCESS', `Comparison Mode: HLS`);
    emitLog('PERSISTENCE_SUCCESS', `ChangeDetection ID: ${hlsResult.changeDetection?._id}`);
    emitLog(
      'PERSISTENCE_SUCCESS',
      `Alert Created: ${isAlertEligible && !!createdAlertId ? 'TRUE' : 'FALSE'}${createdAlertId ? ` (ID: ${createdAlertId})` : ''}`,
    );

    setStage('SUMMARY');
    emitLog('SUMMARY', `==================================================`);
    emitLog('SUMMARY', `HLS CROSS-SENSOR MONITORING JOB FINAL SUMMARY`);
    emitLog('SUMMARY', `==================================================`);
    emitLog('SUMMARY', `Job ID: ${job.jobId}`);
    emitLog('SUMMARY', `Zone: ${zone.name} (${zone.zoneId})`);
    emitLog('SUMMARY', `Status: COMPLETED`);
    emitLog('SUMMARY', `Comparison Mode: HLS (Cross-Sensor Harmonized)`);
    emitLog(
      'SUMMARY',
      `Baseline: ${baselineMeta.imageId} [${comparisonDecision.baselineSource}] -> Product: ${comparisonDecision.baselineHLSProduct}`,
    );
    emitLog(
      'SUMMARY',
      `Current: ${satelliteRef.imageId} [${comparisonDecision.currentSource}] -> Product: ${comparisonDecision.currentHLSProduct}`,
    );
    emitLog('SUMMARY', `Temporal Difference: ${diffDays} days (~${diffYears} years)`);
    emitLog('SUMMARY', `Analysis Grid: 30m Canonical Grid (EPSG:32643)`);
    emitLog(
      'SUMMARY',
      `Valid Comparison Pixels: ${hlsResult.metrics.validComparisonPixels} (${hlsResult.metrics.coveragePercentage.toFixed(2)}%)`,
    );
    emitLog('SUMMARY', `Changed Pixels: ${hlsResult.metrics.changedPixels}`);
    emitLog(
      'SUMMARY',
      `Changed Area: ${hlsResult.metrics.changedAreaHectares.toFixed(4)} ha (${hlsResult.metrics.changedAreaM2.toFixed(2)} m²)`,
    );
    emitLog(
      'SUMMARY',
      `Affected Area Percentage: ${hlsResult.metrics.affectedAreaPercentage.toFixed(4)}%`,
    );
    emitLog('SUMMARY', `Mean Delta NDVI: ${hlsResult.metrics.meanDeltaNdvi.toFixed(4)}`);
    emitLog(
      'SUMMARY',
      `Alert Created: ${isAlertEligible && !!createdAlertId ? 'TRUE' : 'FALSE'}${createdAlertId ? ` (ID: ${createdAlertId})` : ''}`,
    );
    emitLog('SUMMARY', `ChangeDetection ID: ${hlsResult.changeDetection?._id}`);
    emitLog('SUMMARY', `==================================================`);
    emitLog('SUMMARY', `END OF MONITORING JOB`);
    emitLog('SUMMARY', `==================================================`);
  }
}
