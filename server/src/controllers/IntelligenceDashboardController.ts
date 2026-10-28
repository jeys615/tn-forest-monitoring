import type { Request, Response, NextFunction } from 'express';
import { IntelligenceDashboardService } from '../services/IntelligenceDashboardService.js';
import { HTTP_STATUS } from '../constants/index.js';
import type {
  IntelligenceQueryFilters,
  TimeRangePreset,
} from '@tn-forest/shared/types';

export class IntelligenceDashboardController {
  constructor(private readonly service = new IntelligenceDashboardService()) {}

  getExecutiveSummary = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getExecutiveSummary();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getZoneRiskList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = req.query as unknown as IntelligenceQueryFilters;
      const data = await this.service.getZoneRiskList(filters);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
        count: data.length,
      });
    } catch (err) {
      next(err);
    }
  };

  getZoneRiskDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const zoneId = String(req.params.zoneId);
      const data = await this.service.getZoneRiskDetail(zoneId);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getCrossModuleCorrelation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const zoneId = String(req.params.zoneId);
      const data = await this.service.getCrossModuleCorrelation(zoneId);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getAlertIntelligence = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getAlertIntelligenceSummary();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getTransportIntelligence = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getTransportMiningSummary();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getEnforcementIntelligence = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getEnforcementSummary();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getTrendAnalytics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const preset = req.query.preset as TimeRangePreset | undefined;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

      const data = await this.service.getTrendAnalytics(preset, startDate, endDate);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getHotspotRankings = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getHotspotPriorityRankings();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getDecisionSupport = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.service.getDecisionSupportSummary();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getTimeline = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const zoneId = req.query.zoneId ? String(req.query.zoneId) : undefined;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const eventType = req.query.eventType ? String(req.query.eventType) : undefined;
      const moduleFilter = req.query.module ? String(req.query.module) : undefined;

      const data = await this.service.getInvestigationTimeline({
        zoneId,
        startDate,
        endDate,
        limit,
        eventType,
        module: moduleFilter,
      });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  search = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = String(req.query.q || req.query.query || '');
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

      const data = await this.service.searchIntelligenceEntities(query, { limit });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getAlertDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const alertId = String(req.params.alertId);
      const data = await this.service.getAlertIntelligenceDetail(alertId);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getLeaseDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const leaseId = String(req.params.leaseId);
      const data = await this.service.getLeaseIntelligenceDetail(leaseId);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getVehicleDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const vehicleId = String(req.params.vehicleId);
      const data = await this.service.getVehicleIntelligenceDetail(vehicleId);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };

  getEPassDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const passId = String(req.params.id);
      const data = await this.service.getEPassIntelligenceDetail(passId);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}
