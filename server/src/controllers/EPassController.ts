import type { Request, Response, NextFunction } from 'express';
import { ePassService, EPassService } from '../services/EPassService.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  createEPassSchema,
  cancelEPassSchema,
  ePassQuerySchema,
} from '../validators/epass.validator.js';

export class EPassController {
  constructor(private service: EPassService = ePassService) {}

  createEPass = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createEPassSchema.parse(req.body);
      const userId = req.user?.id ?? 'system';
      const created = await this.service.createEPass(validated, userId);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Digital E-Pass generated successfully',
        data: created,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllEPasses = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = ePassQuerySchema.parse(req.query);
      const list = await this.service.getAllEPasses(query);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'E-Passes retrieved successfully',
        data: list,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getEPassById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const epass = await this.service.getEPassById(req.params.id as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'E-Pass retrieved successfully',
        data: epass,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  cancelEPass = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = cancelEPassSchema.parse(req.body);
      const reason = validated.reason || 'Cancelled by user request';
      const updated = await this.service.cancelEPass(req.params.id as string, reason);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'E-Pass cancelled and quota restored successfully',
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  verifyEPass = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const verified = await this.service.verifyEPass(req.params.passNumberOrId as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'E-Pass verified successfully',
        data: verified,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getSummaryStats = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const stats = await this.service.getSummaryStats();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'E-Pass summary statistics retrieved',
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const ePassController = new EPassController();
