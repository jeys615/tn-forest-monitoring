import type { Request, Response, NextFunction } from 'express';
import { ImageProcessingService } from '../services/ImageProcessingService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { SensorType, type ProcessImageRequest } from '@tn-forest/shared/types';

export class ImageProcessingController {
  private processingService: ImageProcessingService;

  constructor() {
    this.processingService = new ImageProcessingService();
  }

  getAllResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
      const satelliteMetadataId =
        typeof req.query.satelliteMetadataId === 'string'
          ? req.query.satelliteMetadataId
          : undefined;
      const sensorType =
        typeof req.query.sensorType === 'string' ? (req.query.sensorType as SensorType) : undefined;
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;

      const results = await this.processingService.getAllResults({
        zoneId,
        satelliteMetadataId,
        sensorType,
        limit,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Processed image results retrieved successfully',
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getResultById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await this.processingService.getResultById(id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Processed image result retrieved successfully',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getZoneResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zoneId = Array.isArray(req.params.zoneId) ? req.params.zoneId[0] : req.params.zoneId;
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;

      const results = await this.processingService.getZoneResults(zoneId, limit);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Zone processing results retrieved successfully',
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  processImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body: ProcessImageRequest = req.body;
      const result = await this.processingService.processImage(body);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Image processing pipeline executed successfully',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}
