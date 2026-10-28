import type { Request, Response, NextFunction } from 'express';
import {
  miningAuthorizationService,
  MiningAuthorizationService,
} from '../services/MiningAuthorizationService.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  createMiningAuthorizationSchema,
  updateMiningAuthorizationSchema,
} from '../validators/miningAuthorization.validator.js';
import { MiningAuthorizationStatus } from '@tn-forest/shared/types';

export class MiningAuthorizationController {
  constructor(private authService: MiningAuthorizationService = miningAuthorizationService) {}

  createAuthorization = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = createMiningAuthorizationSchema.parse(req.body);
      const userId = req.user?.id ?? 'system';
      const created = await this.authService.createAuthorization(validated, userId);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Mining authorization permit created successfully',
        data: created,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllAuthorizations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as MiningAuthorizationStatus | undefined;
      const zoneId = req.query.zoneId as string | undefined;
      const temporaryAreaId = req.query.temporaryAreaId as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const list = await this.authService.getAllAuthorizations({
        status,
        zoneId,
        temporaryAreaId,
        startDate,
        endDate,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Mining authorizations retrieved successfully',
        data: list,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAuthorizationById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const auth = await this.authService.getAuthorizationById(req.params.id as string);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Mining authorization retrieved successfully',
        data: auth,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  updateAuthorization = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = updateMiningAuthorizationSchema.parse(req.body);
      const updated = await this.authService.updateAuthorization(req.params.id as string, validated);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Mining authorization updated successfully',
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const miningAuthorizationController = new MiningAuthorizationController();
