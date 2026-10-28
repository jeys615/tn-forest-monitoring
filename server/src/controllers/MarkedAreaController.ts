import type { Request, Response } from 'express';
import { MarkedAreaAnalysisService } from '../services/MarkedAreaAnalysisService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import { MarkedAreaType, type MarkedAreaAnalysisRequest } from '@tn-forest/shared/types';

export class MarkedAreaController {
  private markedAreaService: MarkedAreaAnalysisService;

  constructor() {
    this.markedAreaService = new MarkedAreaAnalysisService();
  }

  analyzeMarkedArea = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as MarkedAreaAnalysisRequest;
    if (!body || !body.areaId || !body.areaType || !body.boundary) {
      throw new AppError(
        'Missing required fields: areaId, areaType, boundary are mandatory',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (
      body.areaType !== MarkedAreaType.PERMANENT &&
      body.areaType !== MarkedAreaType.TEMPORARY
    ) {
      throw new AppError(
        `Invalid areaType: must be ${MarkedAreaType.PERMANENT} or ${MarkedAreaType.TEMPORARY}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const report = await this.markedAreaService.analyzeMarkedArea(body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Marked area analysis completed successfully',
      data: report,
      timestamp: new Date().toISOString(),
    });
  };
}
