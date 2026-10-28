import type { Request, Response } from 'express';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class ChangeDetectionController {
  private changeService: ChangeDetectionService;

  constructor() {
    this.changeService = new ChangeDetectionService();
  }

  getChanges = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as Record<string, unknown>;
    const changes = await this.changeService.getChanges(filters);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: changes,
      count: changes.length,
    });
  });

  getChangeById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const change = await this.changeService.getChangeById(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: change,
    });
  });

  getZoneChanges = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const zoneId = Array.isArray(req.params.zoneId) ? req.params.zoneId[0] : req.params.zoneId;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const changes = await this.changeService.getZoneChanges(zoneId, limit);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: changes,
      count: changes.length,
    });
  });

  detectChange = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await this.changeService.detectChange(req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Change detection evaluated successfully',
      data: result,
    });
  });

  getComparisonMetadata = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const metadata = await this.changeService.getComparisonMetadata(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metadata,
    });
  });

  getBaselineImage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const band = (req.query.band as 'VV' | 'VH') || undefined;
    const buffer = await this.changeService.getBaselineImageBuffer(id, band);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(HTTP_STATUS.OK).send(buffer);
  });

  getCurrentImage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const band = (req.query.band as 'VV' | 'VH') || undefined;
    const buffer = await this.changeService.getCurrentImageBuffer(id, band);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(HTTP_STATUS.OK).send(buffer);
  });
}
