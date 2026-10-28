import type { Request, Response, NextFunction } from 'express';
import {
  reconciliationService,
  ReconciliationService,
} from '../services/ReconciliationService.js';
import {
  runReconciliationSchema,
  updateReconciliationStatusSchema,
  queryReconciliationSchema,
} from '../validators/reconciliation.validator.js';
import { HTTP_STATUS } from '../constants/index.js';

export class ReconciliationController {
  constructor(private readonly service: ReconciliationService = reconciliationService) {}

  runReconciliation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validated = runReconciliationSchema.parse(req.body);
      const userId = req.user?.id;
      const report = await this.service.runReconciliation(validated, userId);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Reconciliation audit completed successfully',
        data: report,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllReports = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = queryReconciliationSchema.parse(req.query);
      const reports = await this.service.getAllReports({
        ...filters,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Reconciliation reports retrieved successfully',
        data: reports,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getReportById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = String(req.params.id);
      const report = await this.service.getReportById(id);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Reconciliation report retrieved successfully',
        data: report,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  updateReportStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = String(req.params.id);
      const validated = updateReconciliationStatusSchema.parse(req.body);
      const userId = req.user?.id;
      const updated = await this.service.updateReportStatus(id, validated, userId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Reconciliation report status updated successfully',
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getSummary = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const summary = await this.service.getSummary();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Reconciliation summary KPIs retrieved successfully',
        data: summary,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getZoneHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const zoneId = String(req.params.zoneId);
      const history = await this.service.getZoneReconciliationHistory(zoneId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Zone reconciliation history retrieved successfully',
        data: history,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const reconciliationController = new ReconciliationController();

