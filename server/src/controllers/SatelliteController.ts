import type { Request, Response } from 'express';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import { GeeSatelliteService } from '../services/gee/GeeSatelliteService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import { SatelliteSource, SatelliteProcessingStatus, SensorType } from '@tn-forest/shared/types';

export class SatelliteController {
  private acquisitionService: SatelliteAcquisitionService;
  private geeSatelliteService: GeeSatelliteService;

  constructor() {
    this.acquisitionService = new SatelliteAcquisitionService();
    this.geeSatelliteService = new GeeSatelliteService();
  }

  getImages = async (req: Request, res: Response): Promise<void> => {
    const source = req.query.source as SatelliteSource | undefined;
    const sensorType = req.query.sensorType as SensorType | undefined;
    const processingStatus = req.query.processingStatus as SatelliteProcessingStatus | undefined;
    const zoneId = req.query.zoneId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const exactDate = req.query.exactDate as string | undefined;
    const imageId = req.query.imageId as string | undefined;

    const images = await this.acquisitionService.getAllImages({
      source,
      sensorType,
      processingStatus,
      zoneId,
      startDate,
      endDate,
      exactDate,
      imageId,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Satellite images retrieved successfully',
      data: images,
      timestamp: new Date().toISOString(),
    });
  };

  getImageById = async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const img = await this.acquisitionService.getImageById(id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Satellite image retrieved successfully',
      data: img,
      timestamp: new Date().toISOString(),
    });
  };

  acquireImage = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }

    const img = await this.acquisitionService.acquireImage(req.body);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Satellite image acquired successfully',
      data: img,
      timestamp: new Date().toISOString(),
    });
  };

  queryFootprint = async (req: Request, res: Response): Promise<void> => {
    const images = await this.acquisitionService.queryFootprint(req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Satellite images intersecting footprint retrieved successfully',
      data: images,
      timestamp: new Date().toISOString(),
    });
  };

  searchImages = async (req: Request, res: Response): Promise<void> => {
    const results = await this.geeSatelliteService.searchSentinel2Images(req.body);
    const isSar = req.body.sensor === 'SAR' || req.body.sensor === 'SENTINEL_1' || req.body.sensorType === SensorType.SAR;

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Found ${results.totalFound} real ${isSar ? 'Sentinel-1 SAR' : 'Sentinel-2'} observations from Google Earth Engine`,
      data: results,
      timestamp: new Date().toISOString(),
    });
  };

  exportImage = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { zoneId, sync, force } = req.body || {};

    const exported = await this.acquisitionService.exportSatelliteRaster(id, {
      zoneId,
      sync: sync !== undefined ? sync : false,
      force,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message:
        exported.processingStatus === 'PROCESSED'
          ? 'Satellite raster exported, downloaded, and validated successfully'
          : 'Satellite raster export initiated and running in background',
      data: exported,
      timestamp: new Date().toISOString(),
    });
  };

  reconcilePendingExports = async (req: Request, res: Response): Promise<void> => {
    const { staleThresholdHours, dryRun } = req.body || {};
    const result = await this.acquisitionService.reconcilePendingSatelliteExports({
      staleThresholdHours: staleThresholdHours ? Number(staleThresholdHours) : undefined,
      dryRun: Boolean(dryRun),
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Pending GEE satellite exports reconciled (${result.checked} checked)`,
      data: result,
      timestamp: new Date().toISOString(),
    });
  };
}
