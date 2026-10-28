import type { Request, Response } from 'express';
import { TemporaryAreaAnalysisService } from '../services/TemporaryAreaAnalysisService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export class TemporaryAreaController {
  private service: TemporaryAreaAnalysisService;

  constructor() {
    this.service = new TemporaryAreaAnalysisService();
  }

  createTemporaryArea = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || '000000000000000000000000';
    const result = await this.service.createTemporaryArea(userId, req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Temporary monitoring area created successfully',
      data: result,
    });
  });

  getTemporaryAreas = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filters = req.query as Record<string, unknown>;
    const areas = await this.service.getAllTemporaryAreas(filters);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: areas,
      count: areas.length,
    });
  });

  getTemporaryAreaById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const area = await this.service.getTemporaryAreaById(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: area,
    });
  });

  getHistoricalObservations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const observations = await this.service.getHistoricalObservations(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: observations,
      count: observations.length,
    });
  });

  runHistoricalAnalysis = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const report = await this.service.runHistoricalAnalysis(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Historical area analysis completed successfully',
      data: report,
    });
  });

  getTimeline = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const timeline = await this.service.getTimeline(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: timeline,
      count: timeline.length,
    });
  });

  getMiningEstimates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const estimates = await this.service.getMiningEstimates(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: estimates,
      count: estimates.length,
    });
  });

  getReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const report = await this.service.getReport(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: report,
    });
  });
}
