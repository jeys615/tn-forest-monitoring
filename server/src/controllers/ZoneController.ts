import type { Request, Response } from 'express';
import { ZoneService } from '../services/ZoneService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import { ZoneCategory, ZoneStatus } from '@tn-forest/shared/types';

export class ZoneController {
  private zoneService: ZoneService;

  constructor() {
    this.zoneService = new ZoneService();
  }

  getZones = async (req: Request, res: Response): Promise<void> => {
    const category = req.query.category as ZoneCategory | undefined;
    const status = req.query.status as ZoneStatus | undefined;
    const search = req.query.search as string | undefined;

    const zones = await this.zoneService.getAllZones({ category, status, search });
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Zones retrieved successfully',
      data: zones,
      timestamp: new Date().toISOString(),
    });
  };

  getZoneById = async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const zone = await this.zoneService.getZoneById(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Zone retrieved successfully',
      data: zone,
      timestamp: new Date().toISOString(),
    });
  };

  createZone = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    const zone = await this.zoneService.createZone(req.user.id, req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Zone created successfully',
      data: zone,
      timestamp: new Date().toISOString(),
    });
  };

  updateZone = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const zone = await this.zoneService.updateZone(req.user.id, id, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Zone updated successfully',
      data: zone,
      timestamp: new Date().toISOString(),
    });
  };

  suspendZone = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const zone = await this.zoneService.suspendZone(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Zone suspended successfully',
      data: zone,
      timestamp: new Date().toISOString(),
    });
  };

  runZoneAnalysis = async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { startDate, endDate, demElevationDataAvailable, estimatedMeanDepthMeters } = req.body || {};
    const report = await this.zoneService.runZoneAnalysis(id, {
      startDate,
      endDate,
      demElevationDataAvailable,
      estimatedMeanDepthMeters,
    });
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Zone analysis executed successfully',
      data: report,
      timestamp: new Date().toISOString(),
    });
  };
}
