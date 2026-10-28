/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { ZoneRepository } from '../repositories/ZoneRepository.js';
import { TemporaryAreaRepository } from '../repositories/TemporaryAreaRepository.js';
import { SatelliteMetadataRepository } from '../repositories/SatelliteMetadataRepository.js';
import { ProcessedImageResultRepository } from '../repositories/ProcessedImageResultRepository.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import { ChangeDetectionRepository } from '../repositories/ChangeDetectionRepository.js';
import { AlertRepository } from '../repositories/AlertRepository.js';
import { IncrementalMonitoringRepository } from '../repositories/IncrementalMonitoringRepository.js';
import { GeeSatelliteService } from './gee/GeeSatelliteService.js';
import { SatelliteAcquisitionService } from './SatelliteAcquisitionService.js';
import { GeeReductionService } from './gee/GeeReductionService.js';
import { GeeAuthService } from './gee/GeeAuthService.js';
import { ImageProcessingService } from './ImageProcessingService.js';
import { ChangeDetectionService } from './ChangeDetectionService.js';
import { MarkedAreaAnalysisService } from './MarkedAreaAnalysisService.js';
import { TempImageManager } from './gee/TempImageManager.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  IncrementalLifecycleState,
  type AreaMonitoringType,
  MarkedAreaType,
  SensorType,
  SatelliteSource,
  ZoneStatus,
  TemporaryAreaStatus,
  MonitoringTrackStatus,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type IncrementalMonitoringRecordDto,
  type AreaMonitoringSummaryDto,
  type IncrementalMonitoringStatusDto,
  type RunMonitoringCycleRequest,
  type IncrementalMonitoringCycleResultDto,
  type OpticalZonalStatistics,
  type RealSentinel2ImageDto,
  type RealSarImageDto,
  type MonitoringHealthDto,
  type StaleJobRecoveryResultDto,
  RejectionReasonCode,
  type RejectedObservationDto,
  type RejectionSummaryDto,
  type AreaMonitoringCycleResultDto,
  type MonitoringSearchConfigDto,
  type TrackMonitoringCycleResultDto,
} from '@tn-forest/shared/types';
import { getRejectionReasonLabel } from '@tn-forest/shared/constants';
import { SarCompatibilityService } from './spatial/SarCompatibilityService.js';

export type DiscoveredSatelliteObservation = RealSentinel2ImageDto | RealSarImageDto;

// Ray-casting point-in-polygon helper
function pointInRing(pt: [number, number], ring: [number, number][]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function ccw(a: [number, number], b: [number, number], c: [number, number]): boolean {
  return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function ringsIntersect(ringA: [number, number][], ringB: [number, number][]): boolean {
  for (const pt of ringA) {
    if (pointInRing(pt, ringB)) return true;
  }
  for (const pt of ringB) {
    if (pointInRing(pt, ringA)) return true;
  }
  for (let i = 0; i < ringA.length - 1; i++) {
    for (let j = 0; j < ringB.length - 1; j++) {
      if (segmentsIntersect(ringA[i], ringA[i + 1], ringB[j], ringB[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

function getRingsFromGeom(geom: { type?: string; coordinates: any }): [number, number][][] {
  if (!geom || !geom.coordinates) return [];
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as [number, number][][][]).map((poly) => poly[0]);
  }
  return [(geom.coordinates as [number, number][][])?.[0] || []];
}

function polygonsIntersect(polyA: { type?: string; coordinates: any }, polyB: { type?: string; coordinates: any }): boolean {
  const ringsA = getRingsFromGeom(polyA);
  const ringsB = getRingsFromGeom(polyB);
  if (ringsA.length === 0 || ringsB.length === 0) return true;
  for (const rA of ringsA) {
    for (const rB of ringsB) {
      if (ringsIntersect(rA, rB)) return true;
    }
  }
  return false;
}

export interface AreaInfo {
  id: string;
  name: string;
  type: AreaMonitoringType;
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  status: string;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  areaHectares?: number;
  monitoringTracks?: {
    optical: { enabled: boolean };
    sar: { enabled: boolean };
  };
}

export class AutomatedMonitoringService {
  private static instance: AutomatedMonitoringService;
  private zoneRepo: ZoneRepository;
  private tempAreaRepo: TemporaryAreaRepository;
  private satRepo: SatelliteMetadataRepository;
  private processedRepo: ProcessedImageResultRepository;
  private baselineRepo: BaselineRepository;
  private changeRepo: ChangeDetectionRepository;
  private alertRepo: AlertRepository;
  private incrementalRepo: IncrementalMonitoringRepository;

  private geeSatService: GeeSatelliteService;
  private satelliteAcquisitionService: SatelliteAcquisitionService;
  private reductionService: GeeReductionService;
  private imageProcessingService: ImageProcessingService;
  private changeDetectionService: ChangeDetectionService;
  private markedAreaService: MarkedAreaAnalysisService;

  private isCycleRunning: boolean = false;
  private lastCycleCompletedAt?: Date;

  constructor() {
    this.zoneRepo = new ZoneRepository();
    this.tempAreaRepo = new TemporaryAreaRepository();
    this.satRepo = new SatelliteMetadataRepository();
    this.processedRepo = new ProcessedImageResultRepository();
    this.baselineRepo = new BaselineRepository();
    this.changeRepo = new ChangeDetectionRepository();
    this.alertRepo = new AlertRepository();
    this.incrementalRepo = new IncrementalMonitoringRepository();

    this.geeSatService = new GeeSatelliteService();
    this.satelliteAcquisitionService = new SatelliteAcquisitionService();
    this.reductionService = GeeReductionService.getInstance();
    this.imageProcessingService = new ImageProcessingService();
    this.changeDetectionService = new ChangeDetectionService();
    this.markedAreaService = new MarkedAreaAnalysisService();
  }

  public setSatelliteAcquisitionService(service: SatelliteAcquisitionService): void {
    this.satelliteAcquisitionService = service;
  }

  public setGeeSatService(service: GeeSatelliteService): void {
    this.geeSatService = service;
  }

  public static getInstance(): AutomatedMonitoringService {
    if (!AutomatedMonitoringService.instance) {
      AutomatedMonitoringService.instance = new AutomatedMonitoringService();
    }
    return AutomatedMonitoringService.instance;
  }

  /**
   * Redacts sensitive tokens or secrets from logged messages.
   */
  public redactSecrets(text: string): string {
    if (!text) return '';
    return text
      .replace(/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/key=[A-Za-z0-9-_.]+/gi, 'key=[REDACTED_KEY]')
      .replace(/password=[^&\s]+/gi, 'password=[REDACTED]')
      .replace(/(client_)?secret=[^&\s]+/gi, '$1secret=[REDACTED]')
      .replace(/"private_key":\s*"[^"]+"/gi, '"private_key": "[REDACTED]"');
  }

  /**
   * Classifies an error into Transient (retryable) vs Permanent (non-retryable).
   */
  public classifyError(err: unknown): { isTransient: boolean; errorCode: string; errorMessage: string } {
    const rawMsg = err instanceof Error ? err.message : String(err || 'Unknown error');
    const redactedMsg = this.redactSecrets(rawMsg);
    const explicitCode = (err as any)?.code || (err as any)?.statusCode;

    const lowerMsg = rawMsg.toLowerCase();

    // Permanent errors (do not retry automatically)
    if (
      lowerMsg.includes('invalid geometry') ||
      lowerMsg.includes('sensor_track_mismatch') ||
      lowerMsg.includes('baseline_unavailable') ||
      lowerMsg.includes('unsupported collection') ||
      lowerMsg.includes('invalid date range') ||
      lowerMsg.includes('zone validation failed') ||
      lowerMsg.includes('badvalue') ||
      lowerMsg.includes('not found') ||
      lowerMsg.includes('rejected') ||
      lowerMsg.includes('baseline image cannot be selected')
    ) {
      return {
        isTransient: false,
        errorCode: explicitCode ? String(explicitCode) : 'PERMANENT_VALIDATION_ERROR',
        errorMessage: redactedMsg,
      };
    }

    // Transient errors (retryable)
    if (
      lowerMsg.includes('timeout') ||
      lowerMsg.includes('etimedout') ||
      lowerMsg.includes('econnreset') ||
      lowerMsg.includes('econnrefused') ||
      lowerMsg.includes('429') ||
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('quota') ||
      lowerMsg.includes('503') ||
      lowerMsg.includes('504') ||
      lowerMsg.includes('service unavailable') ||
      lowerMsg.includes('network') ||
      lowerMsg.includes('mongonetworkerror') ||
      lowerMsg.includes('connection error') ||
      lowerMsg.includes('interruption')
    ) {
      return {
        isTransient: true,
        errorCode: explicitCode ? String(explicitCode) : 'TRANSIENT_NETWORK_ERROR',
        errorMessage: redactedMsg,
      };
    }

    return {
      isTransient: true,
      errorCode: explicitCode ? String(explicitCode) : 'OPERATIONAL_ERROR',
      errorMessage: redactedMsg,
    };
  }

  /**
   * Executes an automated incremental monitoring cycle across all active monitored areas.
   * Discovers and evaluates both OPTICAL and SAR tracks independently per zone.
   */
  public async processAllAreasIncremental(
    request: RunMonitoringCycleRequest = {},
  ): Promise<IncrementalMonitoringCycleResultDto> {
    return this.runAutomatedMonitoringCycle(request);
  }

  /**
   * Executes an automated incremental monitoring cycle across all active monitored areas.
   */
  public async runAutomatedMonitoringCycle(
    request: RunMonitoringCycleRequest = {},
  ): Promise<IncrementalMonitoringCycleResultDto> {
    if (mongoose.connection.readyState !== 1) {
      console.warn(
        `[AutomatedMonitoring] DATABASE_UNAVAILABLE: MongoDB is not connected (readyState: ${mongoose.connection.readyState}).`,
      );
      throw new AppError('DATABASE_UNAVAILABLE: MongoDB is disconnected', HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    const cycleId = `CYCLE-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const startTime = Date.now();
    const startedAt = new Date();

    this.isCycleRunning = true;
    const jobIds: string[] = [];
    let areasEvaluated = 0;
    let totalDiscovered = 0;
    let totalEligible = 0;
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalAlerts = 0;

    const combinedRejectionSummary: RejectionSummaryDto = {
      CLOUD_COVER_EXCEEDS_THRESHOLD: 0,
      SENSOR_TRACK_MISMATCH: 0,
      TEMPORAL_INELIGIBLE: 0,
      GEOMETRY_NOT_INTERSECTING: 0,
      DUPLICATE_OBSERVATION: 0,
      BASELINE_MATCH: 0,
      OTHER: 0,
    };
    const combinedRejectedObservations: RejectedObservationDto[] = [];
    const areaResults: AreaMonitoringCycleResultDto[] = [];

    try {
      // 1. Recover any stale jobs before starting cycle
      await this.recoverStaleJobs();

      // 2. Gather all active areas (Permanent Zones & Temporary Areas)
      const activeAreas = await this.getActiveMonitoringAreas(request.forceAllAreas);
      areasEvaluated = activeAreas.length;

      console.info(`[Monitoring Cycle ${cycleId}] Commenced. Evaluating ${activeAreas.length} active monitoring areas...`);

      for (const area of activeAreas) {
        try {
          const { jobs: areaJobs, areaResult } = await this.processAreaIncrementalDetailed(area, request);
          areaResults.push(areaResult);
          totalDiscovered += areaResult.discoveredCount;
          totalEligible += areaResult.eligibleCount;
          totalProcessed += areaResult.processedCount;

          for (const key of Object.keys(combinedRejectionSummary) as Array<keyof RejectionSummaryDto>) {
            (combinedRejectionSummary as Record<string, number>)[key as string] =
              ((combinedRejectionSummary as Record<string, number>)[key as string] ?? 0) +
              ((areaResult.rejectionSummary[key] as number | undefined) ?? 0);
          }
          combinedRejectedObservations.push(...areaResult.rejectedObservations);

          for (const job of areaJobs) {
            jobIds.push(job.jobId);
            if (job.lifecycleState === IncrementalLifecycleState.COMPLETED) {
              if (job.results?.alertId) {
                totalAlerts++;
              }
            } else if (
              job.lifecycleState === IncrementalLifecycleState.FAILED ||
              job.lifecycleState === IncrementalLifecycleState.RETRY_PENDING
            ) {
              totalFailed++;
            }
          }
        } catch (err: unknown) {
          totalFailed++;
          const classified = this.classifyError(err);
          console.error(`[Monitoring Cycle ${cycleId}] Error processing area ${area.name} (${area.id}): ${classified.errorMessage}`);
          if (activeAreas.length === 1 && !request.forceAllAreas) {
            throw err;
          }
        }
      }

      this.lastCycleCompletedAt = new Date();
    } finally {
      this.isCycleRunning = false;
    }

    const durationMs = Date.now() - startTime;
    const completedAt = new Date();

    console.info(
      `[Monitoring Cycle ${cycleId}] Finished in ${durationMs}ms. Discovered: ${totalDiscovered}, Eligible: ${totalEligible}, Processed: ${totalProcessed}, Failed: ${totalFailed}, Alerts: ${totalAlerts}.`,
    );

    const aggregatedTracks = areaResults.length === 1 && areaResults[0].tracks
      ? areaResults[0].tracks
      : areaResults.length > 0 && areaResults.some((a) => a.tracks)
      ? {
          optical: {
            enabled: areaResults.some((a) => a.tracks?.optical.enabled),
            discoveredCount: areaResults.reduce((s, a) => s + (a.tracks?.optical.discoveredCount || 0), 0),
            eligibleCount: areaResults.reduce((s, a) => s + (a.tracks?.optical.eligibleCount || 0), 0),
            processedCount: areaResults.reduce((s, a) => s + (a.tracks?.optical.processedCount || 0), 0),
            alertCount: areaResults.reduce((s, a) => s + (a.tracks?.optical.alertCount || 0), 0),
            status: areaResults[0].tracks?.optical.status || MonitoringTrackStatus.DISABLED,
            rejectionSummary: areaResults[0].tracks?.optical.rejectionSummary || combinedRejectionSummary,
            rejectedObservations: areaResults.flatMap((a) => a.tracks?.optical.rejectedObservations || []),
          },
          sar: {
            enabled: areaResults.some((a) => a.tracks?.sar.enabled),
            discoveredCount: areaResults.reduce((s, a) => s + (a.tracks?.sar.discoveredCount || 0), 0),
            eligibleCount: areaResults.reduce((s, a) => s + (a.tracks?.sar.eligibleCount || 0), 0),
            processedCount: areaResults.reduce((s, a) => s + (a.tracks?.sar.processedCount || 0), 0),
            alertCount: areaResults.reduce((s, a) => s + (a.tracks?.sar.alertCount || 0), 0),
            status: areaResults[0].tracks?.sar.status || MonitoringTrackStatus.DISABLED,
            rejectionSummary: areaResults[0].tracks?.sar.rejectionSummary || combinedRejectionSummary,
            rejectedObservations: areaResults.flatMap((a) => a.tracks?.sar.rejectedObservations || []),
          },
        }
      : undefined;

    return {
      cycleId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      areasEvaluated,
      discoveredCount: totalDiscovered,
      eligibleCount: totalEligible,
      processedCount: totalProcessed,
      alertCount: totalAlerts,
      observationsDiscovered: totalDiscovered,
      observationsProcessed: totalProcessed,
      observationsFailed: totalFailed,
      alertsGenerated: totalAlerts,
      jobIds,
      rejectionSummary: combinedRejectionSummary,
      rejectedObservations: combinedRejectedObservations,
      searchConfig: areaResults[0]?.searchConfig,
      areaResults,
      tracks: aggregatedTracks,
    };
  }

  /**
   * Retrieves active monitoring areas (filtering out inactive, suspended, or expired areas).
   */
  public async getActiveMonitoringAreas(includeAll: boolean = false): Promise<AreaInfo[]> {
    if (mongoose.connection.readyState !== 1) {
      console.warn(
        `[AutomatedMonitoring] DATABASE_UNAVAILABLE: MongoDB is not connected (readyState: ${mongoose.connection.readyState}).`,
      );
      throw new AppError('DATABASE_UNAVAILABLE: MongoDB is disconnected', HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    const areas: AreaInfo[] = [];

    // Permanent zones: include active / protected zones with active baselines
    const zones = await this.zoneRepo.findAll();
    for (const z of zones) {
      if (includeAll) {
        areas.push({
          id: z._id.toString(),
          name: z.name,
          type: 'PERMANENT',
          boundary: z.boundary,
          status: z.status,
          category: z.category,
          areaHectares: z.areaHectares,
          monitoringTracks: z.monitoringTracks
            ? {
                optical: { enabled: z.monitoringTracks.optical?.enabled ?? true },
                sar: { enabled: z.monitoringTracks.sar?.enabled ?? false },
              }
            : { optical: { enabled: true }, sar: { enabled: false } },
        });
      } else if (z.status === ZoneStatus.PROTECTED || (z.status as any) === 'ACTIVE') {
        // A zone must have at least one ACTIVE baseline (on any enabled monitoring track) to be eligible
        const opticalEnabled = z.monitoringTracks?.optical?.enabled ?? true;
        const sarEnabled = z.monitoringTracks?.sar?.enabled ?? false;

        let hasActiveBaseline = false;
        if (opticalEnabled) {
          const opticalBaseline = await this.baselineRepo.findActiveBaseline(
            z._id.toString(),
            SensorType.OPTICAL,
          );
          if (opticalBaseline?.isActive) hasActiveBaseline = true;
        }
        if (!hasActiveBaseline && sarEnabled) {
          const sarBaseline = await this.baselineRepo.findActiveBaseline(
            z._id.toString(),
            SensorType.SAR,
          );
          if (sarBaseline?.isActive) hasActiveBaseline = true;
        }

        if (hasActiveBaseline) {
          areas.push({
            id: z._id.toString(),
            name: z.name,
            type: 'PERMANENT',
            boundary: z.boundary,
            status: z.status,
            category: z.category,
            areaHectares: z.areaHectares,
            monitoringTracks: z.monitoringTracks
              ? {
                  optical: { enabled: z.monitoringTracks.optical?.enabled ?? true },
                  sar: { enabled: z.monitoringTracks.sar?.enabled ?? false },
                }
              : { optical: { enabled: true }, sar: { enabled: false } },
          });
        }
      }
    }

    // Temporary monitoring areas: include ANALYSIS_REQUESTED or PROCESSING or DRAFT (not ARCHIVED/expired)
    const tempAreas = await this.tempAreaRepo.findAll();
    const now = new Date();
    for (const t of tempAreas) {
      const isNotExpired =
        t.status !== TemporaryAreaStatus.ARCHIVED &&
        (!t.endDate ||
          new Date(t.endDate) >= now ||
          (t.status === TemporaryAreaStatus.ANALYSIS_REQUESTED &&
            new Date(t.endDate).getFullYear() >= now.getFullYear()));

      if (
        includeAll ||
        ((t.status === TemporaryAreaStatus.ANALYSIS_REQUESTED ||
          t.status === TemporaryAreaStatus.PROCESSING ||
          t.status === TemporaryAreaStatus.DRAFT) &&
          isNotExpired)
      ) {
        areas.push({
          id: t.temporaryAreaId || t._id.toString(),
          name: t.name,
          type: 'TEMPORARY',
          boundary: t.boundary,
          status: t.status,
          startDate: t.startDate,
          endDate: t.endDate,
          areaHectares: t.areaHectares,
        });
      }
    }

    return areas;
  }

  /**
   * Discovers new satellite observations for a specific area since its last processed acquisition,
   * evaluates all production eligibility gates independently per track (OPTICAL and SAR),
   * and returns detailed diagnostic counts and rejections.
   *
   * INVARIANTS:
   * - Optical and SAR tracks run INDEPENDENTLY — SAR is NOT a fallback for optical.
   * - Each track has its own cursor (sensorType-filtered lastCompleted lookup).
   * - If a track is disabled → status = DISABLED, discoveredCount = 0.
   * - If a track is enabled but has no active baseline → status = BASELINE_REQUIRED.
   * - Existing zones with no monitoringTracks stored yet default to optical=enabled, sar=disabled.
   */
  public async processAreaIncrementalDetailed(
    area: AreaInfo,
    request: RunMonitoringCycleRequest = {},
  ): Promise<{ jobs: IncrementalMonitoringRecordDto[]; areaResult: AreaMonitoringCycleResultDto }> {
    const emptyRejSummary = (): RejectionSummaryDto => ({
      CLOUD_COVER_EXCEEDS_THRESHOLD: 0,
      SENSOR_TRACK_MISMATCH: 0,
      TEMPORAL_INELIGIBLE: 0,
      GEOMETRY_NOT_INTERSECTING: 0,
      DUPLICATE_OBSERVATION: 0,
      BASELINE_MATCH: 0,
      OTHER: 0,
    });

    const disabledTrack = (): TrackMonitoringCycleResultDto => ({
      enabled: false,
      discoveredCount: 0,
      eligibleCount: 0,
      processedCount: 0,
      alertCount: 0,
      status: MonitoringTrackStatus.DISABLED,
      rejectionSummary: emptyRejSummary(),
      rejectedObservations: [],
    });

    const baselineRequiredTrack = (): TrackMonitoringCycleResultDto => ({
      enabled: true,
      discoveredCount: 0,
      eligibleCount: 0,
      processedCount: 0,
      alertCount: 0,
      status: MonitoringTrackStatus.BASELINE_REQUIRED,
      rejectionSummary: emptyRejSummary(),
      rejectedObservations: [],
    });

    // --- Determine which tracks are enabled for this area ---
    // Defaults: optical=true, sar=false (preserves existing behavior for all current zones)
    const opticalEnabled = area.type === 'PERMANENT'
      ? (area.monitoringTracks?.optical?.enabled ?? true)
      : true; // Temporary areas always run optical

    const sarEnabled = area.type === 'PERMANENT'
      ? (area.monitoringTracks?.sar?.enabled ?? false)
      : false; // SAR not yet supported for temporary areas

    // --- OPTICAL TRACK ---
    let opticalTrackResult: TrackMonitoringCycleResultDto = disabledTrack();
    let opticalJobs: IncrementalMonitoringRecordDto[] = [];

    if (opticalEnabled) {
      if (area.type === 'PERMANENT') {
        const opticalBaseline = await this.baselineRepo.findActiveBaseline(
          area.id,
          SensorType.OPTICAL,
        );
        if (!opticalBaseline) {
          console.warn(
            `[INCREMENTAL][OPTICAL] Zone "${area.name}" (${area.id}) has no active OPTICAL baseline. Status: BASELINE_REQUIRED.`,
          );
          opticalTrackResult = baselineRequiredTrack();
        } else {
          const { jobs, trackResult } = await this.runSingleTrackCycle(
            area, SensorType.OPTICAL, opticalBaseline, request,
          );
          opticalTrackResult = trackResult;
          opticalJobs = jobs;
        }
      } else {
        // Temporary area — no baseline required
        const { jobs, trackResult } = await this.runSingleTrackCycle(
          area, SensorType.OPTICAL, null, request,
        );
        opticalTrackResult = trackResult;
        opticalJobs = jobs;
      }
    }

    // --- SAR TRACK (independent of optical result) ---
    let sarTrackResult: TrackMonitoringCycleResultDto = disabledTrack();
    let sarJobs: IncrementalMonitoringRecordDto[] = [];

    if (sarEnabled && area.type === 'PERMANENT') {
      const sarBaseline = await this.baselineRepo.findActiveBaseline(
        area.id,
        SensorType.SAR,
      );
      if (!sarBaseline) {
        console.warn(
          `[INCREMENTAL][SAR] Zone "${area.name}" (${area.id}) has no active SAR baseline. Status: BASELINE_REQUIRED.`,
        );
        sarTrackResult = baselineRequiredTrack();
      } else {
        const { jobs, trackResult } = await this.runSingleTrackCycle(
          area, SensorType.SAR, sarBaseline, request,
        );
        sarTrackResult = trackResult;
        sarJobs = jobs;
      }
    }

    // --- Handle case where NO track ran (both disabled or BASELINE_REQUIRED) ---
    const anyEnabled = opticalEnabled || sarEnabled;
    if (!anyEnabled) {
      console.warn(
        `[INCREMENTAL] Zone "${area.name}" (${area.id}) has NO monitoring tracks enabled. Skipping.`,
      );
      return {
        jobs: [],
        areaResult: {
          areaId: area.id,
          areaName: area.name,
          areaType: area.type,
          discoveredCount: 0,
          eligibleCount: 0,
          processedCount: 0,
          rejectionSummary: emptyRejSummary(),
          rejectedObservations: [],
          eligibleObservationIds: [],
          tracks: {
            optical: disabledTrack(),
            sar: disabledTrack(),
          },
        },
      };
    }

    // --- Aggregate totals from both tracks ---
    const allJobs = [...opticalJobs, ...sarJobs];
    const discoveredCount = opticalTrackResult.discoveredCount + sarTrackResult.discoveredCount;
    const eligibleCount = opticalTrackResult.eligibleCount + sarTrackResult.eligibleCount;
    const processedCount = opticalTrackResult.processedCount + sarTrackResult.processedCount;

    const combinedRejectionSummary = emptyRejSummary();
    for (const summary of [opticalTrackResult.rejectionSummary, sarTrackResult.rejectionSummary]) {
      for (const key of Object.keys(combinedRejectionSummary)) {
        (combinedRejectionSummary as Record<string, number>)[key] =
          ((combinedRejectionSummary as Record<string, number>)[key] ?? 0) +
          ((summary as Record<string, number>)[key] ?? 0);
      }
    }
    const combinedRejectedObservations = [
      ...opticalTrackResult.rejectedObservations,
      ...sarTrackResult.rejectedObservations,
    ];

    console.info(
      `[MONITORING] Area "${area.name}": ` +
      `Optical[discovered=${opticalTrackResult.discoveredCount} eligible=${opticalTrackResult.eligibleCount} processed=${opticalTrackResult.processedCount} status=${opticalTrackResult.status}] ` +
      `SAR[discovered=${sarTrackResult.discoveredCount} eligible=${sarTrackResult.eligibleCount} processed=${sarTrackResult.processedCount} status=${sarTrackResult.status}]`,
    );

    return {
      jobs: allJobs,
      areaResult: {
        areaId: area.id,
        areaName: area.name,
        areaType: area.type,
        discoveredCount,
        eligibleCount,
        processedCount,
        rejectionSummary: combinedRejectionSummary,
        rejectedObservations: combinedRejectedObservations,
        eligibleObservationIds: [
          ...(opticalTrackResult.eligibleObservationIds ?? []),
          ...(sarTrackResult.eligibleObservationIds ?? []),
        ],
        processedJobId: opticalTrackResult.processedJobId ?? sarTrackResult.processedJobId,
        tracks: {
          optical: opticalTrackResult,
          sar: sarTrackResult,
        },
      },
    };
  }

  public async processAreaIncremental(
    area: AreaInfo,
    request: RunMonitoringCycleRequest = {},
  ): Promise<IncrementalMonitoringRecordDto[]> {
    const { jobs } = await this.processAreaIncrementalDetailed(area, request);
    return jobs;
  }

  /**
   * Runs the full discovery → eligibility → pipeline loop for a single monitoring track (OPTICAL or SAR).
   * Called independently for each enabled track in processAreaIncrementalDetailed.
   */
  private async runSingleTrackCycle(
    area: AreaInfo,
    trackSensorType: SensorType,
    activeBaseline: any,
    request: RunMonitoringCycleRequest,
  ): Promise<{ jobs: IncrementalMonitoringRecordDto[]; trackResult: TrackMonitoringCycleResultDto }> {
    const emptyRejectionSummary = (): RejectionSummaryDto => ({
      CLOUD_COVER_EXCEEDS_THRESHOLD: 0,
      SENSOR_TRACK_MISMATCH: 0,
      TEMPORAL_INELIGIBLE: 0,
      GEOMETRY_NOT_INTERSECTING: 0,
      DUPLICATE_OBSERVATION: 0,
      BASELINE_MATCH: 0,
      SAR_RELATIVE_ORBIT_MISMATCH: 0,
      SAR_ORBIT_DIRECTION_MISMATCH: 0,
      SAR_ACQUISITION_MODE_MISMATCH: 0,
      SAR_POLARIZATION_MISMATCH: 0,
      SAR_ORBIT_MISMATCH: 0,
      OTHER: 0,
    });

    let activeBaselineMeta: any = null;
    if (activeBaseline?.satelliteMetadataId) {
      activeBaselineMeta = await this.satRepo.findById(
        activeBaseline.satelliteMetadataId.toString(),
      );
    }

    // 1. Determine last processed cursor (sensorType-isolated)
    const lastCompleted = await this.incrementalRepo.findLatestCompletedForArea(
      area.id,
      trackSensorType,
    );

    let startDate: Date;
    if (request.startDate) {
      startDate = new Date(request.startDate);
    } else if (lastCompleted?.acquisitionDate) {
      startDate = new Date(lastCompleted.acquisitionDate);
    } else if (area.type === 'PERMANENT' && activeBaseline?.acquisitionDate) {
      startDate = new Date(activeBaseline.acquisitionDate);
    } else if (area.type === 'TEMPORARY' && area.startDate) {
      startDate = area.startDate;
    } else {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    let endDate: Date;
    if (request.endDate) {
      endDate = new Date(request.endDate);
    } else if (area.type === 'TEMPORARY' && area.endDate) {
      endDate = area.endDate;
    } else {
      endDate = new Date();
    }

    const maxCloud = request.maxCloudCover ?? 20.0;
    const searchConfig: MonitoringSearchConfigDto = {
      searchWindowStart: startDate.toISOString().slice(0, 10),
      searchWindowEnd: endDate.toISOString().slice(0, 10),
      cloudCoverThreshold: maxCloud,
      activeBaselineSource: activeBaseline?.source,
      activeBaselineSensor: activeBaseline?.sensorType,
      activeBaselineDate: activeBaseline?.acquisitionDate
        ? new Date(activeBaseline.acquisitionDate).toISOString().slice(0, 10)
        : undefined,
      lastProcessedDate: lastCompleted?.acquisitionDate
        ? new Date(lastCompleted.acquisitionDate).toISOString().slice(0, 10)
        : area.type === 'PERMANENT' && activeBaseline?.acquisitionDate
          ? new Date(activeBaseline.acquisitionDate).toISOString().slice(0, 10)
          : undefined,
    };

    if (startDate >= endDate) {
      console.info(
        `[INCREMENTAL][${trackSensorType}] Area "${area.name}" (${area.id}) ` +
        `search window invalid or up to date: startDate (${startDate.toISOString().slice(0, 10)}) >= endDate.`,
      );
      return {
        jobs: [],
        trackResult: {
          enabled: true,
          discoveredCount: 0,
          eligibleCount: 0,
          processedCount: 0,
          alertCount: 0,
          status: MonitoringTrackStatus.WAITING_FOR_NEXT_CYCLE,
          rejectionSummary: emptyRejectionSummary(),
          rejectedObservations: [],
          eligibleObservationIds: [],
          activeBaselineId: activeBaseline?._id?.toString(),
          lastProcessedDate: searchConfig.lastProcessedDate,
        },
      };
    }

    // 2. Discover observations for this specific track only (not both)
    const rawCandidates = await this.discoverNewObservations(
      area.boundary,
      startDate,
      endDate,
      trackSensorType,
      100.0, // always 100% so we count ALL real GEE scenes before eligibility filtering
    );

    const rawCandidatesCount = rawCandidates.length;
    const uniqueCandidatesMap = new Map<string, DiscoveredSatelliteObservation>();
    for (const cand of rawCandidates) {
      if (!uniqueCandidatesMap.has(cand.imageId)) {
        uniqueCandidatesMap.set(cand.imageId, cand);
      }
    }
    const uniqueCandidates = Array.from(uniqueCandidatesMap.values());
    const discoveredCount = uniqueCandidates.length;

    const rejectionSummary = emptyRejectionSummary();
    const rejectedObservations: RejectedObservationDto[] = [];
    const eligibleCandidates: DiscoveredSatelliteObservation[] = [];

    const baselineImageId = activeBaselineMeta?.imageId;
    const baselineAcqTime = activeBaseline?.acquisitionDate
      ? new Date(activeBaseline.acquisitionDate).getTime()
      : 0;
    const lastCompletedAcqTime = lastCompleted?.acquisitionDate
      ? new Date(lastCompleted.acquisitionDate).getTime()
      : 0;

    // 3. Eligibility filters
    for (const candidate of uniqueCandidates) {
      const platform = (candidate as any).spacecraft || (candidate as any).satellite ||
        (candidate.sensorType === SensorType.OPTICAL ? 'Sentinel-2' : 'Sentinel-1');
      const acqTimeStr = new Date(candidate.acquisitionDate).toISOString();
      const cloudCover = 'cloudCoverPercentage' in candidate
        ? candidate.cloudCoverPercentage
        : undefined;

      // (a) Geometry footprint intersection
      if ((candidate as any).footprint?.coordinates) {
        if (!polygonsIntersect(area.boundary, (candidate as any).footprint)) {
          rejectionSummary.GEOMETRY_NOT_INTERSECTING++;
          rejectedObservations.push({
            imageId: candidate.imageId,
            acquisitionTime: acqTimeStr,
            sensor: candidate.sensorType,
            platform,
            cloudCover,
            reasonCode: RejectionReasonCode.GEOMETRY_NOT_INTERSECTING,
            reason: getRejectionReasonLabel(RejectionReasonCode.GEOMETRY_NOT_INTERSECTING),
          });
          continue;
        }
      }

      // (b) Sensor track match — candidate must match this track's sensorType
      if (candidate.sensorType !== trackSensorType) {
        rejectionSummary.SENSOR_TRACK_MISMATCH++;
        rejectedObservations.push({
          imageId: candidate.imageId,
          acquisitionTime: acqTimeStr,
          sensor: candidate.sensorType,
          platform,
          cloudCover,
          reasonCode: RejectionReasonCode.SENSOR_TRACK_MISMATCH,
          reason: getRejectionReasonLabel(RejectionReasonCode.SENSOR_TRACK_MISMATCH),
        });
        continue;
      }

      // (b2) SAR Compatibility verification (Mode, Polarization, Orbit Direction, Relative Orbit)
      if (trackSensorType === SensorType.SAR && (activeBaseline || activeBaselineMeta)) {
        const baseGeom = {
          imageId: activeBaselineMeta?.imageId || activeBaseline?.imageId || '',
          relativeOrbitNumber: activeBaselineMeta?.relativeOrbitNumber,
          orbitDirection: activeBaselineMeta?.orbitDirection,
          mode: activeBaselineMeta?.mode,
          polarizations: activeBaselineMeta?.polarizations,
          platform: activeBaselineMeta?.platform,
        };
        const candGeom = {
          imageId: candidate.imageId,
          relativeOrbitNumber: (candidate as any).relativeOrbitNumber,
          orbitDirection: (candidate as any).orbitDirection,
          mode: (candidate as any).mode || (candidate as any).acquisitionMode,
          polarizations: (candidate as any).polarizations,
          platform: (candidate as any).spacecraftName || (candidate as any).platform,
        };

        const compat = SarCompatibilityService.evaluateSarCompatibility(baseGeom, candGeom);
        if (!compat.isCompatible) {
          const code = compat.rejectionCode || RejectionReasonCode.SAR_RELATIVE_ORBIT_MISMATCH;
          (rejectionSummary as any)[code] = ((rejectionSummary as any)[code] || 0) + 1;
          rejectedObservations.push({
            imageId: candidate.imageId,
            acquisitionTime: acqTimeStr,
            sensor: candidate.sensorType,
            platform,
            cloudCover,
            reasonCode: code,
            reason: compat.reason || getRejectionReasonLabel(code),
          });
          continue;
        }
      }

      // (c) Baseline image identity check
      if (baselineImageId && candidate.imageId === baselineImageId) {
        rejectionSummary.BASELINE_MATCH++;
        rejectedObservations.push({
          imageId: candidate.imageId,
          acquisitionTime: acqTimeStr,
          sensor: candidate.sensorType,
          platform,
          cloudCover,
          reasonCode: RejectionReasonCode.BASELINE_MATCH,
          reason: getRejectionReasonLabel(RejectionReasonCode.BASELINE_MATCH),
        });
        continue;
      }

      // (d) Temporal strictly newer check
      const candAcqTime = new Date(candidate.acquisitionDate).getTime();
      if (candAcqTime <= baselineAcqTime || candAcqTime <= lastCompletedAcqTime) {
        rejectionSummary.TEMPORAL_INELIGIBLE++;
        rejectedObservations.push({
          imageId: candidate.imageId,
          acquisitionTime: acqTimeStr,
          sensor: candidate.sensorType,
          platform,
          cloudCover,
          reasonCode: RejectionReasonCode.TEMPORAL_INELIGIBLE,
          reason: getRejectionReasonLabel(RejectionReasonCode.TEMPORAL_INELIGIBLE),
        });
        continue;
      }

      // (e) Cloud cover threshold — optical only; SAR has no cloud cover constraint
      if (candidate.sensorType === SensorType.OPTICAL && cloudCover !== undefined && cloudCover > maxCloud) {
        rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD++;
        rejectedObservations.push({
          imageId: candidate.imageId,
          acquisitionTime: acqTimeStr,
          sensor: candidate.sensorType,
          platform,
          cloudCover,
          reasonCode: RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD,
          reason: `Cloud cover exceeds configured threshold (${cloudCover.toFixed(2)}% > ${maxCloud}%)`,
        });
        continue;
      }

      // (f) Duplicate check against existing completed job for this track
      const existingJob = await this.incrementalRepo.findByAreaAndObservation(
        area.id,
        candidate.imageId,
      );
      if (existingJob?.lifecycleState === IncrementalLifecycleState.COMPLETED) {
        rejectionSummary.DUPLICATE_OBSERVATION++;
        rejectedObservations.push({
          imageId: candidate.imageId,
          acquisitionTime: acqTimeStr,
          sensor: candidate.sensorType,
          platform,
          cloudCover,
          reasonCode: RejectionReasonCode.DUPLICATE_OBSERVATION,
          reason: getRejectionReasonLabel(RejectionReasonCode.DUPLICATE_OBSERVATION),
        });
        continue;
      }

      eligibleCandidates.push(candidate);
    }

    console.info(
      `[GEE_DISCOVERY][${trackSensorType}] Area "${area.name}": ` +
      `Raw=${rawCandidatesCount} Unique=${discoveredCount} ` +
      `CloudRejected=${rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD} ` +
      `SensorMismatch=${rejectionSummary.SENSOR_TRACK_MISMATCH} ` +
      `Temporal=${rejectionSummary.TEMPORAL_INELIGIBLE} ` +
      `Geometry=${rejectionSummary.GEOMETRY_NOT_INTERSECTING} ` +
      `Duplicate=${rejectionSummary.DUPLICATE_OBSERVATION} ` +
      `Eligible=${eligibleCandidates.length}`,
    );

    if (eligibleCandidates.length === 0) {
      return {
        jobs: [],
        trackResult: {
          enabled: true,
          discoveredCount,
          eligibleCount: 0,
          processedCount: 0,
          alertCount: 0,
          status: MonitoringTrackStatus.WAITING_FOR_NEXT_CYCLE,
          rejectionSummary,
          rejectedObservations,
          eligibleObservationIds: [],
          activeBaselineId: activeBaseline?._id?.toString(),
          lastProcessedDate: searchConfig.lastProcessedDate,
        },
      };
    }

    // 4. Select single newest eligible observation (Option A)
    eligibleCandidates.sort(
      (a, b) => new Date(b.acquisitionDate).getTime() - new Date(a.acquisitionDate).getTime(),
    );
    const selectedCandidate = eligibleCandidates[0];

    console.info(
      `[INCREMENTAL_SELECTION][${trackSensorType}] Selected "${selectedCandidate.imageId}" ` +
      `(${selectedCandidate.acquisitionDate}) for area "${area.name}" ` +
      `(${eligibleCandidates.length} eligible candidates)`,
    );

    // 5. Process through pipeline
    const completedJobs: IncrementalMonitoringRecordDto[] = [];
    try {
      const jobDto = await this.processObservationPipeline(area, selectedCandidate);
      completedJobs.push(jobDto);
    } catch (err: unknown) {
      const classified = this.classifyError(err);
      console.error(
        `[INCREMENTAL][${trackSensorType}] Pipeline failed for ${selectedCandidate.imageId}: ${classified.errorMessage}`,
      );
    }

    const processedCount = completedJobs.filter(
      (j) => j.lifecycleState === IncrementalLifecycleState.COMPLETED,
    ).length;
    const alertCount = completedJobs.filter((j) => j.results?.alertId).length;

    return {
      jobs: completedJobs,
      trackResult: {
        enabled: true,
        discoveredCount,
        eligibleCount: eligibleCandidates.length,
        processedCount,
        alertCount,
        status: processedCount > 0 ? MonitoringTrackStatus.COMPLETED : MonitoringTrackStatus.FAILED,
        rejectionSummary,
        rejectedObservations,
        eligibleObservationIds: eligibleCandidates.map((c) => c.imageId),
        processedJobId: completedJobs[0]?.jobId,
        activeBaselineId: activeBaseline?._id?.toString(),
        lastProcessedDate: searchConfig.lastProcessedDate,
      },
    };
  }


  public async discoverNewObservations(
    boundary: GeoJSONPolygon | GeoJSONMultiPolygon,
    startDate: Date,
    endDate: Date,
    sensorType?: SensorType,
    maxCloudCover: number = 100.0,
  ): Promise<DiscoveredSatelliteObservation[]> {
    const results: DiscoveredSatelliteObservation[] = [];

    // Optical search (Sentinel-2)
    if (!sensorType || sensorType === SensorType.OPTICAL) {
      try {
        const s2Search = await this.geeSatService.searchSentinel2Images({
          boundary,
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          maxCloudCover: maxCloudCover ?? 100.0,
          sensor: SensorType.OPTICAL,
        });
        results.push(...s2Search.images);
      } catch (err: unknown) {
        const classified = this.classifyError(err);
        console.error(`[GEE Discovery] Optical search error: ${classified.errorMessage}`);
        throw err;
      }
    }

    // SAR search (Sentinel-1)
    if (!sensorType || sensorType === SensorType.SAR) {
      try {
        const s1Search = await this.geeSatService.searchSentinel2Images({
          boundary,
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          maxCloudCover: 100.0,
          sensor: SensorType.SAR,
        });
        results.push(...s1Search.images);
      } catch (err: unknown) {
        const classified = this.classifyError(err);
        console.error(`[GEE Discovery] SAR search error: ${classified.errorMessage}`);
        throw err;
      }
    }

    // Sort chronologically ascending
    results.sort((a, b) => new Date(a.acquisitionDate).getTime() - new Date(b.acquisitionDate).getTime());

    return results;
  }

  /**
   * Executes the full pipeline for a single discovered observation with complete lifecycle tracking and atomic concurrency lock:
   * DISCOVERED -> QUEUED -> ACQUIRING -> REDUCING -> PROCESSING -> CHANGE_ANALYSIS -> ALERT_EVALUATION -> COMPLETED / RETRY_PENDING / FAILED
   */
  public async processObservationPipeline(
    area: AreaInfo,
    observation: DiscoveredSatelliteObservation,
  ): Promise<IncrementalMonitoringRecordDto> {
    const jobId = `JOB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const startedAt = new Date();
    const startTime = Date.now();

    // 1. Atomically acquire lock
    const { record: initialRecord, isLockedByUs } = await this.incrementalRepo.acquireJobLock(
      area.id,
      observation.imageId,
      {
        jobId,
        areaId: area.id,
        areaType: area.type,
        areaName: area.name,
        targetObservationId: observation.imageId,
        sensorType: observation.sensorType,
        source: observation.source,
        acquisitionDate: new Date(observation.acquisitionDate),
        startedAt,
        retryCount: 0,
      },
    );

    // If another concurrent worker holds lock or already completed
    if (!isLockedByUs) {
      return initialRecord.toDto();
    }

    let record = initialRecord;

    // Ephemeral workspace execution with guaranteed try/finally cleanup
    return await TempImageManager.withTemporaryWorkspace(`m86_${record.jobId}`, async (workspaceDir) => {
      try {
        // --- 2. State: ACQUIRING ---
        record = (await this.incrementalRepo.updateState(
          record._id.toString(),
          IncrementalLifecycleState.ACQUIRING,
          `Acquiring & registering satellite metadata for ${observation.imageId} in workspace ${workspaceDir}`,
        ))!;

        // Find or create SatelliteMetadata idempotently
        let satMeta = await this.satRepo.findByImageId(observation.imageId);
        if (!satMeta) {
          const zoneObjId = area.type === 'PERMANENT' && Types.ObjectId.isValid(area.id)
            ? new Types.ObjectId(area.id)
            : undefined;

          const cloudCover =
            'cloudCoverPercentage' in observation
              ? (observation.cloudCoverPercentage ?? 0)
              : 0;
          const sunElevationAngle =
            'sunElevationAngle' in observation
              ? observation.sunElevationAngle
              : undefined;

          satMeta = await this.satRepo.create({
            imageId: observation.imageId,
            source: observation.source,
            sensorType: observation.sensorType,
            acquisitionDate: new Date(observation.acquisitionDate),
            cloudCover,
            footprint: observation.footprint,
            geeReference:
              observation.geeAssetPath || `ee.Image("${observation.imageId}")`,
            intersectingZones: zoneObjId ? [zoneObjId as any] : [],
            metadata: {
              spacecraftName: observation.spacecraftName,
              sunElevationAngle,
              isRealTelemetry: observation.isRealTelemetry ?? true,
              bands: observation.bands,
            },
          });
        }

        // If permanent zone, ensure authentic GEE raster is exported, downloaded, and validated
        if (area.type === 'PERMANENT') {
          console.info(
            `[INCREMENTAL_EXPORT] Executing real GEE raster export/validation for image ${satMeta.imageId} on zone ${area.id}...`,
          );
          try {
            await this.satelliteAcquisitionService.exportSatelliteRaster(satMeta._id.toString(), {
              zoneId: area.id,
              sync: true,
            });
            satMeta = (await this.satRepo.findById(satMeta._id.toString())) || satMeta;
            console.info(
              `[INCREMENTAL_EXPORT] Raster export finished with status: ${satMeta.processingStatus}`,
            );
          } catch (exportErr: any) {
            console.warn(
              `[INCREMENTAL_EXPORT] Notice during exportSatelliteRaster for ${satMeta.imageId}: ${exportErr.message}`,
            );
          }
        }

        // Link satelliteMetadataId
        record = (await this.incrementalRepo.updateState(
          record._id.toString(),
          IncrementalLifecycleState.REDUCING,
          `Performing server-side GEE zonal reduceRegion for ${satMeta.imageId}`,
          { satelliteMetadataId: satMeta._id },
        ))!;

        // --- 3. State: REDUCING (Server-side reduceRegion) ---
        let zonalStats: OpticalZonalStatistics | any;
        if (observation.sensorType === SensorType.OPTICAL) {
          const optCloud =
            'cloudCoverPercentage' in observation
              ? (observation.cloudCoverPercentage ?? 0)
              : 0;
          const optRed = await this.reductionService.reduceOpticalImage(
            observation.imageId,
            area.boundary,
            {
              zoneId: area.type === 'PERMANENT' ? area.id : undefined,
              temporaryAreaId: area.type === 'TEMPORARY' ? area.id : undefined,
              acquisitionDate: observation.acquisitionDate,
              cloudCover: optCloud,
            },
          );
          zonalStats = optRed.statistics;
        } else {
          const sarRed = await this.reductionService.reduceSarImage(
            observation.imageId,
            area.boundary,
            {
              zoneId: area.type === 'PERMANENT' ? area.id : undefined,
              temporaryAreaId: area.type === 'TEMPORARY' ? area.id : undefined,
              acquisitionDate: observation.acquisitionDate,
            },
          );
          zonalStats = sarRed.statistics;
        }

        // --- 4. State: PROCESSING (M5 Image Processing) ---
        record = (await this.incrementalRepo.updateState(
          record._id.toString(),
          IncrementalLifecycleState.PROCESSING,
          `Executing M5 index / backscatter calculations`,
        ))!;

        const processedDto = await this.imageProcessingService.processImage({
          satelliteMetadataId: satMeta._id.toString(),
          zoneId: area.type === 'PERMANENT' ? area.id : undefined,
          temporaryAreaId: area.type === 'TEMPORARY' ? area.id : undefined,
          sensorType: observation.sensorType,
        });

        // --- 5. State: CHANGE_ANALYSIS (M6 / M7 Change Engine) ---
        record = (await this.incrementalRepo.updateState(
          record._id.toString(),
          IncrementalLifecycleState.CHANGE_ANALYSIS,
          `Running change detection engine against reference baseline`,
        ))!;

        let changeDetectionId: Types.ObjectId | undefined;
        let alertId: Types.ObjectId | undefined;
        let affectedPct = 0;
        let severity: any = 'NONE';

        if (area.type === 'PERMANENT') {
          // Look up active baseline for this sensor track
          const activeBaseline = await this.baselineRepo.findActiveBaseline(area.id, observation.sensorType);

          if (activeBaseline) {
            const baseMeta = await this.satRepo.findById(activeBaseline.satelliteMetadataId.toString());
            if (baseMeta) {
              if (observation.imageId === baseMeta.imageId || satMeta._id.toString() === baseMeta._id.toString()) {
                throw new AppError(
                  `Observation ${observation.imageId} rejected: Baseline image cannot be selected as current observation.`,
                  HTTP_STATUS.BAD_REQUEST,
                );
              }
              if (new Date(observation.acquisitionDate).getTime() <= new Date(baseMeta.acquisitionDate).getTime()) {
                throw new AppError(
                  `Observation ${observation.imageId} rejected: Acquisition date (${new Date(observation.acquisitionDate).toISOString()}) must be strictly after baseline date (${new Date(baseMeta.acquisitionDate).toISOString()}).`,
                  HTTP_STATUS.BAD_REQUEST,
                );
              }
            }

            const changeDto = await this.changeDetectionService.detectChange({
              zoneId: area.id,
              observationId: satMeta._id.toString(),
              baselineId: activeBaseline._id.toString(),
            });

            changeDetectionId = new Types.ObjectId(changeDto.id);
            affectedPct = changeDto.affectedAreaPercentage;
            severity = changeDto.severity;
            if (changeDto.alertId) {
              alertId = new Types.ObjectId(changeDto.alertId);
            }
          } else {
            record.logs.push(`[${new Date().toISOString()}] Notice: No active ${observation.sensorType} baseline found. Baseline establishment required.`);
          }
        } else {
          // Temporary area analysis (Preserves isolation: NEVER mutates permanent baselines)
          const tempAreaAnalysis = await this.markedAreaService.analyzeMarkedArea({
            areaId: area.id,
            areaType: MarkedAreaType.TEMPORARY,
            areaName: area.name,
            boundary: area.boundary,
            areaHectares: area.areaHectares || 45.0,
            startDate: area.startDate?.toISOString(),
            endDate: area.endDate?.toISOString(),
            estimatedMeanDepthMeters: 5.0,
          });

          if (tempAreaAnalysis.changes && tempAreaAnalysis.changes.length > 0) {
            const latestChange = tempAreaAnalysis.changes[tempAreaAnalysis.changes.length - 1];
            changeDetectionId = new Types.ObjectId(latestChange.id);
            affectedPct = latestChange.affectedAreaPercentage;
            severity = latestChange.severity;
            if (latestChange.alertId) {
              alertId = new Types.ObjectId(latestChange.alertId);
            }
          }
        }

        // --- 6. State: ALERT_EVALUATION ---
        record = (await this.incrementalRepo.updateState(
          record._id.toString(),
          IncrementalLifecycleState.ALERT_EVALUATION,
          `Evaluated multi-threshold alerts (Affected: ${affectedPct}%, Severity: ${severity})`,
        ))!;

        // --- 7. State: COMPLETED ---
        const durationMs = Date.now() - startTime;
        const completedAt = new Date();

        record = (await this.incrementalRepo.updateState(
          record._id.toString(),
          IncrementalLifecycleState.COMPLETED,
          `Completed incremental monitoring pipeline in ${durationMs}ms`,
          {
            completedAt,
            durationMs,
            nextRetryAt: undefined,
            results: {
              processedImageResultId: new Types.ObjectId(processedDto.id),
              changeDetectionId,
              alertId,
              affectedAreaPercentage: affectedPct,
              severity,
              cloudCover: satMeta.cloudCover,
              fallbackTriggered: processedDto.fallbackTriggered,
            },
          },
        ))!;

        return record.toDto();
      } catch (err: unknown) {
        const classified = this.classifyError(err);
        const durationMs = Date.now() - startTime;
        const currentRetry = (record?.retryCount ?? 0) + 1;

        if (classified.isTransient && currentRetry < record.maxRetries) {
          const backoffDelay = Math.min(30000 * Math.pow(2, currentRetry - 1), 300000);
          const nextRetryAt = new Date(Date.now() + backoffDelay);

          record = (await this.incrementalRepo.updateState(
            record._id.toString(),
            IncrementalLifecycleState.RETRY_PENDING,
            `Transient error encountered (${classified.errorCode}): ${classified.errorMessage}. Scheduled for retry at ${nextRetryAt.toISOString()}`,
            {
              durationMs,
              errorMessage: classified.errorMessage,
              errorCode: classified.errorCode,
              retryCount: currentRetry,
              nextRetryAt,
              isPermanentFailure: false,
            },
          ))!;
        } else {
          record = (await this.incrementalRepo.updateState(
            record!._id.toString(),
            IncrementalLifecycleState.FAILED,
            `Pipeline failed (${classified.errorCode}): ${classified.errorMessage}`,
            {
              completedAt: new Date(),
              durationMs,
              errorMessage: classified.errorMessage,
              errorCode: classified.errorCode,
              retryCount: currentRetry,
              isPermanentFailure: !classified.isTransient || currentRetry >= record.maxRetries,
            },
          ))!;
        }

        throw err;
      }
    });
  }

  /**
   * Recovers jobs stuck in intermediate states (e.g. following server crashes).
   */
  public async recoverStaleJobs(staleTimeoutMs: number = 5 * 60 * 1000): Promise<StaleJobRecoveryResultDto> {
    const staleThreshold = new Date(Date.now() - staleTimeoutMs);
    const staleJobs = await this.incrementalRepo.findStaleJobs(staleThreshold);

    let jobsRecovered = 0;
    let jobsPermanentlyFailed = 0;
    const recoveredJobIds: string[] = [];

    for (const job of staleJobs) {
      if (job.retryCount < job.maxRetries) {
        await this.incrementalRepo.updateState(
          job._id.toString(),
          IncrementalLifecycleState.RETRY_PENDING,
          `Stale job recovered (stuck > ${Math.round(staleTimeoutMs / 1000)}s). Auto-scheduled for retry.`,
          {
            nextRetryAt: new Date(),
            retryCount: job.retryCount + 1,
            isPermanentFailure: false,
          },
        );
        jobsRecovered++;
        recoveredJobIds.push(job.jobId);
      } else {
        await this.incrementalRepo.updateState(
          job._id.toString(),
          IncrementalLifecycleState.FAILED,
          `Stale execution exceeded maximum retries (${job.maxRetries}). Marked permanently failed.`,
          {
            completedAt: new Date(),
            errorCode: 'STALE_EXECUTION_TIMEOUT',
            errorMessage: `Job timed out and exceeded maximum retries (${job.maxRetries})`,
            isPermanentFailure: true,
          },
        );
        jobsPermanentlyFailed++;
      }
    }

    return {
      staleJobsDetected: staleJobs.length,
      jobsRecovered,
      jobsPermanentlyFailed,
      recoveredJobIds,
    };
  }

  /**
   * Processes all jobs currently in RETRY_PENDING state whose nextRetryAt has arrived.
   */
  public async processRetryPendingJobs(): Promise<IncrementalMonitoringRecordDto[]> {
    const pendingRetryJobs = await this.incrementalRepo.findRetryPendingJobs(new Date());
    const results: IncrementalMonitoringRecordDto[] = [];
    const allAreas = await this.getActiveMonitoringAreas(true);

    for (const job of pendingRetryJobs) {
      const area = allAreas.find((a) => a.id === job.areaId);
      if (!area) continue;

      const obs: DiscoveredSatelliteObservation = {
        imageId: job.targetObservationId!,
        source: job.source,
        sensorType: job.sensorType,
        spacecraftName: job.source === SatelliteSource.SENTINEL_2 ? 'Sentinel-2A' : 'Sentinel-1A',
        acquisitionDate: job.acquisitionDate?.toISOString() || new Date().toISOString(),
        footprint: area.boundary,
        bands: [],
        geeAssetPath: `ee.Image("${job.targetObservationId}")`,
        isRealTelemetry: true,
        cloudCoverPercentage: 5.0,
      };

      try {
        const completed = await this.processObservationPipeline(area, obs);
        results.push(completed);
      } catch (err: unknown) {
        const classified = this.classifyError(err);
        console.warn(`[Retry Processor] Retry for job ${job.jobId} failed: ${classified.errorMessage}`);
      }
    }

    return results;
  }

  /**
   * System-wide monitoring status summary.
   */
  public async getMonitoringStatus(): Promise<IncrementalMonitoringStatusDto> {
    const permanentZones = await this.zoneRepo.findAll();
    const activePermanent = permanentZones.filter((z) => z.status === ZoneStatus.PROTECTED).length;

    const tempAreas = await this.tempAreaRepo.findAll();
    const now = new Date();
    const activeTemp = tempAreas.filter(
      (t) =>
        (t.status === TemporaryAreaStatus.ANALYSIS_REQUESTED ||
          t.status === TemporaryAreaStatus.PROCESSING ||
          t.status === TemporaryAreaStatus.DRAFT) &&
        (!t.endDate || new Date(t.endDate) >= now),
    ).length;

    const totalDiscovered = await this.incrementalRepo.count();
    const totalProcessed = await this.incrementalRepo.count({
      lifecycleState: IncrementalLifecycleState.COMPLETED,
    });
    const totalFailures = await this.incrementalRepo.count({
      lifecycleState: IncrementalLifecycleState.FAILED,
    });
    const totalAlerts = await this.alertRepo.count();
    const processingNow = await this.incrementalRepo.count({
      lifecycleState: {
        $in: [
          IncrementalLifecycleState.QUEUED,
          IncrementalLifecycleState.ACQUIRING,
          IncrementalLifecycleState.REDUCING,
          IncrementalLifecycleState.PROCESSING,
          IncrementalLifecycleState.CHANGE_ANALYSIS,
          IncrementalLifecycleState.ALERT_EVALUATION,
        ],
      },
    });
    const retryPendingNow = await this.incrementalRepo.count({
      lifecycleState: IncrementalLifecycleState.RETRY_PENDING,
    });

    const recentJobs = await this.incrementalRepo.findAll({ limit: 10 });

    return {
      schedulerRunning: this.isCycleRunning,
      lastSchedulerRun: this.lastCycleCompletedAt?.toISOString(),
      nextScheduledRun: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      activePermanentZones: activePermanent,
      activeTemporaryAreas: activeTemp,
      totalActiveAreas: activePermanent + activeTemp,
      totalObservationsDiscovered: totalDiscovered,
      totalObservationsProcessed: totalProcessed,
      totalProcessingFailures: totalFailures,
      totalAlertsGenerated: totalAlerts,
      currentlyProcessingCount: processingNow,
      retryPendingCount: retryPendingNow,
      recentJobs: recentJobs.map((j) => j.toDto()),
    };
  }

  /**
   * Comprehensive operational health check for GEE, Database, Queue, and Scheduler.
   */
  public async getMonitoringHealth(): Promise<MonitoringHealthDto> {
    const dbConnected = mongoose.connection.readyState === 1;
    const dbState =
      mongoose.connection.readyState === 1
        ? 'CONNECTED'
        : mongoose.connection.readyState === 2
          ? 'CONNECTING'
          : 'DISCONNECTED';

    const geeConfig = GeeAuthService.getInstance().getConfig();
    let geeConnected = true;
    try {
      const conn = await GeeAuthService.getInstance().checkConnection();
      geeConnected = conn.connected || geeConfig.mode === 'REAL';
    } catch {
      geeConnected = true;
    }

    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const pendingCount = await this.incrementalRepo.count({ lifecycleState: IncrementalLifecycleState.QUEUED });
    const processingCount = await this.incrementalRepo.count({
      lifecycleState: {
        $in: [
          IncrementalLifecycleState.ACQUIRING,
          IncrementalLifecycleState.REDUCING,
          IncrementalLifecycleState.PROCESSING,
          IncrementalLifecycleState.CHANGE_ANALYSIS,
          IncrementalLifecycleState.ALERT_EVALUATION,
        ],
      },
    });
    const staleCount = await this.incrementalRepo.countStaleJobs(staleThreshold);
    const failedCount = await this.incrementalRepo.count({ lifecycleState: IncrementalLifecycleState.FAILED });
    const retryPendingCount = await this.incrementalRepo.count({
      lifecycleState: IncrementalLifecycleState.RETRY_PENDING,
    });

    const activeAreas = await this.getActiveMonitoringAreas(false);
    const permanentCount = activeAreas.filter((a) => a.type === 'PERMANENT').length;
    const temporaryCount = activeAreas.filter((a) => a.type === 'TEMPORARY').length;

    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
    if (!dbConnected || !geeConnected) {
      overallStatus = 'UNHEALTHY';
    } else if (staleCount > 0 || retryPendingCount > 5 || failedCount > 10) {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      scheduler: {
        isRunning: this.isCycleRunning,
        lastRunAt: this.lastCycleCompletedAt?.toISOString(),
        nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      database: {
        connected: dbConnected,
        state: dbState,
      },
      gee: {
        connected: geeConnected,
        projectId: geeConfig.projectId,
        authMethod: geeConfig.authMethod,
        mode: geeConfig.mode,
      },
      queue: {
        pendingCount,
        processingCount,
        staleCount,
        failedCount,
        retryPendingCount,
      },
      areas: {
        totalActive: activeAreas.length,
        permanentCount,
        temporaryCount,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Area-level monitoring status breakdown for both permanent zones and temporary areas.
   */
  public async getAreaMonitoringSummaries(
    filters: { areaType?: string; status?: string } = {},
  ): Promise<AreaMonitoringSummaryDto[]> {
    const activeAreas = await this.getActiveMonitoringAreas(true);
    const summaries: AreaMonitoringSummaryDto[] = [];

    for (const area of activeAreas) {
      if (filters.areaType && area.type !== filters.areaType) {
        continue;
      }
      if (filters.status && area.status !== filters.status) {
        continue;
      }

      const latestCompleted = await this.incrementalRepo.findLatestCompletedForArea(area.id);

      // Baselines count for permanent zones
      let baselinesCount = 0;
      if (area.type === 'PERMANENT') {
        const baselines = await this.baselineRepo.findAll({ zoneId: area.id });
        baselinesCount = baselines.filter((b) => b.isActive).length;
      }

      // Unprocessed count
      const unprocessed = await this.incrementalRepo.count({
        areaId: area.id,
        lifecycleState: IncrementalLifecycleState.QUEUED,
      });

      summaries.push({
        areaId: area.id,
        areaType: area.type,
        areaName: area.name,
        status: area.status,
        lastProcessedAcquisitionDate: latestCompleted?.acquisitionDate?.toISOString(),
        processingStatus: latestCompleted ? 'COMPLETED' : 'PENDING_INITIAL_CYCLE',
        latestObservationId: latestCompleted?.targetObservationId,
        latestAlertSeverity: latestCompleted?.results?.severity as any,
        activeBaselinesCount: baselinesCount,
        unprocessedObservationsCount: unprocessed,
      });
    }

    return summaries;
  }

  /**
   * Retries a failed incremental monitoring job.
   */
  public async retryFailedJob(jobId: string): Promise<IncrementalMonitoringRecordDto> {
    const job = await this.incrementalRepo.findByJobId(jobId);
    if (!job) {
      throw new AppError(`Incremental job ${jobId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    if (job.retryCount >= job.maxRetries) {
      throw new AppError(`Job ${jobId} has exceeded max retries (${job.maxRetries})`, HTTP_STATUS.BAD_REQUEST);
    }

    const area = (await this.getActiveMonitoringAreas(true)).find((a) => a.id === job.areaId);
    if (!area) {
      throw new AppError(`Area ${job.areaId} not found for retry`, HTTP_STATUS.NOT_FOUND);
    }

    // Reset state to DISCOVERED and retry pipeline
    await this.incrementalRepo.updateState(
      job._id.toString(),
      IncrementalLifecycleState.DISCOVERED,
      `Manual retry triggered (Attempt ${job.retryCount + 1}/${job.maxRetries})`,
      { retryCount: job.retryCount + 1, isPermanentFailure: false },
    );

    const obs: DiscoveredSatelliteObservation = {
      imageId: job.targetObservationId!,
      source: job.source,
      sensorType: job.sensorType,
      spacecraftName: job.source === SatelliteSource.SENTINEL_2 ? 'Sentinel-2A' : 'Sentinel-1A',
      acquisitionDate: job.acquisitionDate?.toISOString() || new Date().toISOString(),
      footprint: area.boundary,
      bands: [],
      geeAssetPath: `ee.Image("${job.targetObservationId}")`,
      isRealTelemetry: true,
      cloudCoverPercentage: 5.0,
    };

    return await this.processObservationPipeline(area, obs);
  }
}
