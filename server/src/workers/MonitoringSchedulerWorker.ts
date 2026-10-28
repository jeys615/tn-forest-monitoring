import mongoose from 'mongoose';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { MonitoringSchedulerService } from '../services/MonitoringSchedulerService.js';
import { MonitoringJobStatus, MonitoringJobType, SensorType, ZoneStatus } from '@tn-forest/shared/types';

import { env } from '../config/env.js';

export class MonitoringSchedulerWorker {
  private static instance: MonitoringSchedulerWorker;
  private intervalTimer: NodeJS.Timeout | null = null;
  private initialTimeout: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private intervalMs: number = 60 * 60 * 1000; // 1 hour
  private schedulerService: MonitoringSchedulerService;
  public readonly cronExpression: string = '0 * * * *'; // Equivalent hourly cron expression
  public onCycleComplete?: (summary: any) => void;

  constructor() {
    this.schedulerService = new MonitoringSchedulerService();
  }

  public static getInstance(): MonitoringSchedulerWorker {
    if (!MonitoringSchedulerWorker.instance) {
      MonitoringSchedulerWorker.instance = new MonitoringSchedulerWorker();
    }
    return MonitoringSchedulerWorker.instance;
  }

  public getCronExpression(): string {
    return this.cronExpression;
  }

  /**
   * Starts the hourly background monitoring scheduler.
   */
  public start(intervalMinutes: number = 60, options: { immediate?: boolean } = {}): void {
    if (this.intervalTimer) {
      console.info('[Monitoring Worker] Scheduler is already active.');
      return;
    }

    this.intervalMs = intervalMinutes * 60 * 1000;
    console.info(
      `[Monitoring Worker] Starting automated monitoring scheduler (Cron: "${this.cronExpression}", Frequency: every ${intervalMinutes} minutes)...`,
    );

    // Run first cycle immediately or after brief initialization delay (5s) in production
    if (options.immediate || env.NODE_ENV === 'production') {
      const delay = options.immediate ? 100 : 5000;
      this.initialTimeout = setTimeout(() => {
        this.executeHourlyCycle().catch((err) => {
          console.error('[Monitoring Worker] Initial cycle error:', err);
        });
      }, delay);
    }

    // Setup recurring interval
    this.intervalTimer = setInterval(() => {
      this.executeHourlyCycle().catch((err) => {
        console.error('[Monitoring Worker] Scheduled hourly cycle error:', err);
      });
    }, this.intervalMs);
  }

  /**
   * Stops the background monitoring scheduler.
   */
  public stop(): void {
    if (this.initialTimeout) {
      clearTimeout(this.initialTimeout);
      this.initialTimeout = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.info('[Monitoring Worker] Automated monitoring scheduler stopped.');
    }
  }

  /**
   * Returns whether the worker timer is currently active.
   */
  public isActive(): boolean {
    return this.intervalTimer !== null;
  }

  /**
   * Executes one full monitoring scan cycle across all active marked zones.
   * INVARIANTS:
   * 1. Evaluates OPTICAL and SAR monitoring tracks INDEPENDENTLY per zone.
   * 2. Runs incremental automated monitoring cycle via processAllAreasIncremental().
   * 3. Complete error isolation: one zone or track failure never blocks another.
   */
  public async executeHourlyCycle(): Promise<{
    zonesEvaluated: number;
    jobsCreated: number;
    jobsCompleted: number;
    jobsWaiting: number;
    jobsFailed: number;
    incrementalResult?: any;
  }> {
    if (this.isRunning) {
      console.warn('[Monitoring Worker] Previous cycle is still running. Skipping concurrent trigger.');
      return { zonesEvaluated: 0, jobsCreated: 0, jobsCompleted: 0, jobsWaiting: 0, jobsFailed: 0 };
    }

    this.isRunning = true;
    const cycleStartTime = Date.now();
    console.info(`\n[Monitoring Worker] === COMMENCING AUTOMATED HOURLY MONITORING CYCLE (Cron: "${this.cronExpression}") ===`);

    let zonesEvaluated = 0;
    let jobsCreated = 0;
    let jobsCompleted = 0;
    let jobsWaiting = 0;
    let jobsFailed = 0;
    let incrementalResult: any = undefined;

    try {
      // 0. Check database connectivity
      if (mongoose.connection.readyState !== 1) {
        console.warn(
          `[Monitoring Worker] DATABASE_UNAVAILABLE: MongoDB is not connected (readyState: ${mongoose.connection.readyState}). Skipping cycle.`,
        );
        return { zonesEvaluated: 0, jobsCreated: 0, jobsCompleted: 0, jobsWaiting: 0, jobsFailed: 0 };
      }

      console.info(`[Monitoring Worker] DATABASE_CONNECTED`);

      // 1. Discover all active marked monitoring zones (Protected or Active)
      const activeZones = await Zone.find({
        status: { $in: [ZoneStatus.PROTECTED, 'ACTIVE'] },
      }).exec();
      zonesEvaluated = activeZones.length;
      console.info(`[Monitoring Worker] ACTIVE_MONITORING_ZONES: ${activeZones.length}`);

      for (const zone of activeZones) {
        try {
          const opticalEnabled = zone.monitoringTracks?.optical?.enabled ?? true;
          const sarEnabled = zone.monitoringTracks?.sar?.enabled ?? false;

          const tracksToEvaluate: { track: 'OPTICAL' | 'SAR'; sensorType: SensorType }[] = [];
          if (opticalEnabled) {
            tracksToEvaluate.push({ track: 'OPTICAL', sensorType: SensorType.OPTICAL });
          }
          if (sarEnabled) {
            tracksToEvaluate.push({ track: 'SAR', sensorType: SensorType.SAR });
          }

          for (const trackConfig of tracksToEvaluate) {
            try {
              // Check for active baseline for this specific sensor track
              const activeBaseline = await BaselineModel.findOne({
                zoneId: zone._id,
                sensorType: trackConfig.sensorType,
                isActive: true,
              }).exec();

              if (!activeBaseline) {
                console.info(
                  `[Monitoring Worker] Zone ${zone.name} (${zone.zoneId}) has no ACTIVE ${trackConfig.track} baseline. Skipping ${trackConfig.track} track.`,
                );
                continue;
              }

              // Create scheduled job for zone and track
              const jobId = `JOB-SCHED-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
              const scheduledDate = new Date();

              const job = await MonitoringJobModel.create({
                jobId,
                type: MonitoringJobType.SCHEDULED_SCAN,
                scheduledAt: scheduledDate,
                zoneId: zone._id,
                sensorType: trackConfig.sensorType,
                status: MonitoringJobStatus.PENDING,
                logs: [
                  `[${scheduledDate.toISOString()}] [MonitoringScheduler] [${jobId}] [START] Automatic hourly monitoring job scheduled for ${trackConfig.track} track`,
                ],
              });
              jobsCreated++;

              console.info(
                `[Monitoring Worker] Processing Zone: ${zone.name} (${zone.zoneId}) [${trackConfig.track}] -> Job: ${jobId}`,
              );

              // Execute the complete raster GIS & GEE processing pipeline
              try {
                await this.schedulerService.processJob(job._id.toString());
                const refreshedJob = await MonitoringJobModel.findById(job._id);
                if (refreshedJob?.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE) {
                  jobsWaiting++;
                } else {
                  jobsCompleted++;
                }
              } catch (jobErr: unknown) {
                const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
                console.error(
                  `[Monitoring Worker] Job ${jobId} failed for zone ${zone.zoneId} [${trackConfig.track}]: ${msg}`,
                );
                jobsFailed++;
              }
            } catch (trackErr: unknown) {
              console.error(
                `[Monitoring Worker] Error evaluating ${trackConfig.track} track for zone ${zone.zoneId}:`,
                trackErr,
              );
            }
          }
        } catch (zoneErr: unknown) {
          console.error(`[Monitoring Worker] Error evaluating zone ${zone.zoneId}:`, zoneErr);
        }
      }

      // 2. Execute automated incremental monitoring cycle across all active areas
      try {
        console.info(`[Monitoring Worker] Commencing automated incremental monitoring cycle across all areas...`);
        incrementalResult = await this.schedulerService.processAllAreasIncremental();
        console.info(
          `[Monitoring Worker] Incremental Cycle ${incrementalResult.cycleId} completed. Areas evaluated: ${incrementalResult.areasEvaluated}, Discovered: ${incrementalResult.discoveredCount}, Processed: ${incrementalResult.processedCount}`,
        );
      } catch (incErr: unknown) {
        console.error(`[Monitoring Worker] Incremental monitoring cycle encountered an error:`, incErr);
      }
    } finally {
      this.isRunning = false;
      const durationMs = Date.now() - cycleStartTime;
      console.info(
        `[Monitoring Worker] === COMPLETED HOURLY CYCLE in ${durationMs}ms: Evaluated: ${zonesEvaluated}, Created: ${jobsCreated}, Completed: ${jobsCompleted}, Waiting: ${jobsWaiting}, Failed: ${jobsFailed} ===\n`,
      );
    }

    const summaryResult = { zonesEvaluated, jobsCreated, jobsCompleted, jobsWaiting, jobsFailed, incrementalResult };
    if (this.onCycleComplete) {
      try {
        this.onCycleComplete(summaryResult);
      } catch (err) {
        console.error('[Monitoring Worker] onCycleComplete handler error:', err);
      }
    }

    return summaryResult;
  }
}
