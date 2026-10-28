import type { Request, Response, NextFunction } from 'express';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { MultiSourceAcquisitionService } from '../services/gee/MultiSourceAcquisitionService.js';
import { HarmonizationService } from '../services/gee/HarmonizationService.js';
import { HTTP_STATUS } from '../constants/index.js';

export class GeeController {
  private authService: GeeAuthService;

  constructor() {
    this.authService = GeeAuthService.getInstance();
  }

  getStatus = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.authService.checkConnection();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        ...status,
      });
    } catch (err) {
      next(err);
    }
  };

  discoverMultiSource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { geometry, startDate, endDate, maxCloudCover, sensorType, preferredSource, priorityConfig } = req.body;
      const service = MultiSourceAcquisitionService.getInstance();
      const result = await service.discoverMultiSource(geometry, {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxCloudCover,
        sensorType,
        preferredSource,
        priorityConfig,
      });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  harmonize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { zonalStats, extent, options, track } = req.body;
      const service = HarmonizationService.getInstance();
      let result;
      if (track === 'SAR') {
        result = service.harmonizeSar(zonalStats, extent, options);
      } else if (track === 'DEM') {
        result = service.harmonizeDem(zonalStats, extent, options);
      } else {
        result = service.harmonizeOptical(zonalStats, extent, options);
      }
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  validateCompatibility = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { baseline, current } = req.body;
      const service = HarmonizationService.getInstance();
      const result = service.validateCompatibility(baseline, current);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}
