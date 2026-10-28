import type { Request, Response, NextFunction } from 'express';
import { BaselineService } from '../services/BaselineService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import {
  SensorType,
  BaselineStatus,
  type SelectBaselineCandidateRequest,
  type HistoricalReferenceRequest,
  type EvaluateBaselineCandidateRequest,
} from '@tn-forest/shared/types';

export class BaselineController {
  private baselineService: BaselineService;

  constructor() {
    this.baselineService = new BaselineService();
  }

  getAllBaselines = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
      const sensorType =
        typeof req.query.sensorType === 'string' ? (req.query.sensorType as SensorType) : undefined;
      const status =
        typeof req.query.status === 'string' ? (req.query.status as BaselineStatus) : undefined;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

      const baselines = await this.baselineService.getAllBaselines({
        zoneId,
        sensorType,
        status,
        isActive,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Baselines retrieved successfully',
        data: baselines,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getBaselineById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const baseline = await this.baselineService.getBaselineById(id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Baseline retrieved successfully',
        data: baseline,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getZoneBaselines = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneId = Array.isArray(req.params.zoneId) ? req.params.zoneId[0] : req.params.zoneId;
      const sensorType =
        typeof req.query.sensorType === 'string' ? (req.query.sensorType as SensorType) : undefined;

      const baselines = await this.baselineService.getZoneBaselines(zoneId, sensorType);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Zone baselines retrieved successfully',
        data: baselines,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  selectBaselineCandidate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body: SelectBaselineCandidateRequest = req.body;
      const response = await this.baselineService.selectAndEvaluateCandidate(body);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Baseline candidate evaluation completed',
        status: response.candidate?.status || response.status,
        baselineId: response.candidate?.id || response.baselineId,
        satelliteImageId: response.satelliteImageId,
        geeExportTaskId: response.candidate?.geeExportTaskId || response.geeExportTaskId,
        data: response,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  activateBaseline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const userId = req.user?.id;
      const skipPipelineValidation =
        process.env.NODE_ENV === 'test' &&
        req.headers['x-enforce-pipeline-validation'] !== 'true';
      const activated = await this.baselineService.activateBaseline(id, userId, {
        skipPipelineValidation,
      });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Baseline activated successfully',
        data: activated,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getHistoricalReference = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body: HistoricalReferenceRequest = req.body;
      const result = await this.baselineService.getHistoricalReference(body);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Historical reference observation resolved successfully',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Retrieves authentic acquired satellite observations for a zone (with 1:1 count parity
   * with Satellite Catalog) and their baseline candidate evaluation status.
   */
  getAvailableCandidates = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
      if (!zoneId) {
        throw new AppError('zoneId query parameter is required', HTTP_STATUS.BAD_REQUEST);
      }
      const sensorType =
        typeof req.query.sensorType === 'string' ? (req.query.sensorType as SensorType) : undefined;

      const candidates = await this.baselineService.getAvailableCandidates(zoneId, sensorType);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Available satellite observations retrieved successfully',
        data: candidates,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Evaluates an authentic satellite observation against all 14 baseline validation gates.
   */
  evaluateCandidate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body: EvaluateBaselineCandidateRequest = req.body;
      if (!body.zoneId || !body.satelliteMetadataId) {
        throw new AppError(
          'zoneId and satelliteMetadataId are required',
          HTTP_STATUS.BAD_REQUEST,
        );
      }
      const result = await this.baselineService.evaluateBaselineCandidate(body);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.isEligible
          ? 'Baseline candidate verified successfully'
          : 'Baseline candidate evaluated: not eligible',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}
