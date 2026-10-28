import type { Request, Response, NextFunction } from 'express';
import { MonitoringSchedulerService } from '../services/MonitoringSchedulerService.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  type ScheduleMonitoringJobRequest,
  type AreaMonitoringType,
  IncrementalLifecycleState,
  SensorType,
} from '@tn-forest/shared/types';

export class MonitoringController {
  private monitoringService: MonitoringSchedulerService;

  constructor() {
    this.monitoringService = new MonitoringSchedulerService();
  }

  scheduleJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: ScheduleMonitoringJobRequest = req.body;
      const job = await this.monitoringService.scheduleJob(data);
      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Job scheduled successfully',
        data: job,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getAllJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const sensorType =
        typeof req.query.sensorType === 'string' ? req.query.sensorType : undefined;
      const source = typeof req.query.source === 'string' ? req.query.source : undefined;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

      const jobs = await this.monitoringService.getAllJobs({
        status,
        zoneId,
        type,
        sensorType,
        source,
        startDate,
        endDate,
      });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Monitoring jobs retrieved',
        data: jobs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getJobById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const job = await this.monitoringService.getJobById(id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Monitoring job retrieved',
        data: job,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  processJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const job = await this.monitoringService.processJob(id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Job processing completed',
        data: job,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getMonitoringStatus = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await this.monitoringService.getMonitoringStatus();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Monitoring status retrieved successfully',
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getAreaMonitoringSummaries = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const areaType = typeof req.query.areaType === 'string' ? req.query.areaType : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const summaries = await this.monitoringService.getAreaMonitoringSummaries({ areaType, status });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Area monitoring summaries retrieved successfully',
        data: summaries,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  runMonitoringCycle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.monitoringService.runAutomatedMonitoringCycle(req.body);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Automated monitoring cycle completed successfully',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  retryJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const job = await this.monitoringService.retryFailedJob(jobId);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Incremental job retried successfully',
        data: job,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getIncrementalJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
      const areaType =
        typeof req.query.areaType === 'string'
          ? (req.query.areaType as AreaMonitoringType)
          : undefined;
      const lifecycleState =
        typeof req.query.lifecycleState === 'string'
          ? (req.query.lifecycleState as IncrementalLifecycleState)
          : undefined;
      const sensorType =
        typeof req.query.sensorType === 'string'
          ? (req.query.sensorType as SensorType)
          : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

      const jobs = await this.monitoringService.getIncrementalJobs({
        areaId,
        areaType,
        lifecycleState,
        sensorType,
        limit,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Incremental monitoring jobs retrieved',
        data: jobs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getMonitoringHealth = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await this.monitoringService.getMonitoringHealth();
      const statusCode = health.status === 'UNHEALTHY' ? HTTP_STATUS.SERVICE_UNAVAILABLE : HTTP_STATUS.OK;
      res.status(statusCode).json({
        success: true,
        message: 'Monitoring operational health retrieved',
        data: health,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getSystemStatus = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await this.monitoringService.getMonitoringHealth();
      // Redact sensitive config: only expose GEE mode, not projectId or authMethod
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'System operational status retrieved',
        data: {
          status: health.status,
          scheduler: health.scheduler,
          database: health.database,
          gee: {
            mode: health.gee.mode,
            configured: !!health.gee.projectId,
          },
          queue: health.queue,
          areas: health.areas,
          checkedAt: health.checkedAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  recoverStaleJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawTimeout = req.body?.staleTimeoutMs ?? req.query?.staleTimeoutMs;
      const staleTimeoutMs = rawTimeout ? parseInt(String(rawTimeout), 10) : undefined;
      const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
      const result = await this.monitoringService.recoverStaleJobs(staleTimeoutMs, { dryRun });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: dryRun
          ? 'Stale job recovery preview completed (dry run)'
          : 'Stale job recovery completed',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}
