import type { Request, Response, NextFunction } from 'express';
import {
  complianceExportService,
  ComplianceExportService,
} from '../services/ComplianceExportService.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import { AlertSeverity } from '@tn-forest/shared/types';

export class ComplianceExportController {
  constructor(
    private readonly service: ComplianceExportService = complianceExportService,
  ) {}

  /**
   * Retrieves all unique districts persisted on registered checkpoints.
   */
  getDistricts = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const districts = await this.service.getAvailableDistricts();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Districts retrieved successfully',
        data: districts,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Retrieves high-level operational metrics and compliance summary for reports dashboard.
   */
  getReportSummary = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        startDate,
        endDate,
        zoneId,
        district,
        severity,
      } = req.query as {
        startDate?: string;
        endDate?: string;
        zoneId?: string;
        district?: string;
        severity?: AlertSeverity;
      };

      if (startDate && isNaN(Date.parse(startDate))) {
        throw new AppError('Invalid startDate format. Must be a valid ISO date string', HTTP_STATUS.BAD_REQUEST);
      }
      if (endDate && isNaN(Date.parse(endDate))) {
        throw new AppError('Invalid endDate format. Must be a valid ISO date string', HTTP_STATUS.BAD_REQUEST);
      }
      if (severity && !Object.values(AlertSeverity).includes(severity)) {
        throw new AppError(`Invalid severity filter: ${severity}`, HTTP_STATUS.BAD_REQUEST);
      }

      const actor = req.user ? { id: req.user.id, name: req.user.email } : undefined;

      const summary = await this.service.getOperationalSummary(
        {
          startDate,
          endDate,
          zoneId,
          district,
          severity,
        },
        actor,
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Statutory compliance and operational summary retrieved successfully',
        data: summary,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Generates and exports the formal Statutory Compliance Report in JSON or RFC 4180 CSV format.
   */
  getComplianceReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        startDate,
        endDate,
        zoneId,
        district,
        severity,
        format = 'json',
      } = req.query as {
        startDate?: string;
        endDate?: string;
        zoneId?: string;
        district?: string;
        severity?: AlertSeverity;
        format?: string;
      };

      if (startDate && isNaN(Date.parse(startDate))) {
        throw new AppError('Invalid startDate format. Must be a valid ISO date string', HTTP_STATUS.BAD_REQUEST);
      }
      if (endDate && isNaN(Date.parse(endDate))) {
        throw new AppError('Invalid endDate format. Must be a valid ISO date string', HTTP_STATUS.BAD_REQUEST);
      }
      if (format && format !== 'json' && format !== 'csv') {
        throw new AppError('Invalid export format. Must be either json or csv', HTTP_STATUS.BAD_REQUEST);
      }
      if (severity && !Object.values(AlertSeverity).includes(severity)) {
        throw new AppError(`Invalid severity filter: ${severity}`, HTTP_STATUS.BAD_REQUEST);
      }

      const actor = req.user ? { id: req.user.id, name: req.user.email } : undefined;

      const report = await this.service.generateComplianceReport(
        {
          startDate,
          endDate,
          zoneId,
          district,
          severity,
          format: format === 'csv' ? 'csv' : 'json',
        },
        actor,
      );

      if (format === 'csv') {
        const csvContent = this.service.generateComplianceCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="statutory-compliance-report-${report.reportId}.csv"`,
        );
        res.status(HTTP_STATUS.OK).send(csvContent);
        return;
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Statutory compliance report generated successfully',
        data: report,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const complianceExportController = new ComplianceExportController();
