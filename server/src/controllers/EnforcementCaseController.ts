import type { Request, Response, NextFunction } from 'express';
import { EnforcementCaseService } from '../services/EnforcementCaseService.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  type CreateEnforcementCaseRequest,
  type CreateCaseFromReconciliationRequest,
  type AssignOfficerRequest,
  type UpdateCaseStatusRequest,
  type UpdateInvestigationRequest,
  type RecordEnforcementActionRequest,
  type CloseCaseRequest,
  type EnforcementCaseFilters,
} from '@tn-forest/shared/types';

export class EnforcementCaseController {
  constructor(private readonly caseService = new EnforcementCaseService()) {}

  createCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req.body as CreateEnforcementCaseRequest;
      const result = await this.caseService.createCase(data, req.user?.id);
      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  createCaseFromReconciliation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = req.body as CreateCaseFromReconciliationRequest;
      const result = await this.caseService.createCaseFromReconciliation(data, req.user?.id);
      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  getAllCases = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = req.query as unknown as EnforcementCaseFilters;
      const result = await this.caseService.getAllCases(filters);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
        count: result.length,
      });
    } catch (err) {
      next(err);
    }
  };

  getCaseById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const result = await this.caseService.getCaseById(id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  assignOfficer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const data = req.body as AssignOfficerRequest;
      const result = await this.caseService.assignOfficer(id, data, req.user?.id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const data = req.body as UpdateCaseStatusRequest;
      const result = await this.caseService.updateStatus(id, data, req.user?.id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  updateInvestigation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const data = req.body as UpdateInvestigationRequest;
      const result = await this.caseService.updateInvestigation(id, data, req.user?.id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  recordEnforcementAction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = String(req.params.id);
      const data = req.body as RecordEnforcementActionRequest;
      const result = await this.caseService.recordEnforcementAction(id, data, req.user?.id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  closeCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const data = req.body as CloseCaseRequest;
      const result = await this.caseService.closeCase(id, data, req.user?.id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  getAuditHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const result = await this.caseService.getAuditHistory(id);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  getSummary = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.caseService.getSummary();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}
