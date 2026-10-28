import type { Request, Response, NextFunction } from 'express';
import {
  evidenceDossierService,
  EvidenceDossierService,
} from '../services/EvidenceDossierService.js';
import { HTTP_STATUS } from '../constants/index.js';

export class EvidenceDossierController {
  constructor(
    private readonly service: EvidenceDossierService = evidenceDossierService,
  ) {}

  compileDossier = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const caseIdentifier = String(req.params.caseId || req.params.id);
      const actor = req.user ? { id: req.user.id, name: req.user.email } : undefined;

      const dossier = await this.service.compileDossier(caseIdentifier, actor);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Evidence Dossier compiled and cryptographically sealed successfully',
        data: dossier,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getLatestDossierForCase = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const caseIdentifier = String(req.params.caseId || req.params.id);
      const dossier = await this.service.getLatestDossierForCase(caseIdentifier);

      if (!dossier) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: `No evidence dossier found for case "${caseIdentifier}"`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Latest evidence dossier retrieved successfully',
        data: dossier,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllDossiersForCase = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const caseIdentifier = String(req.params.caseId || req.params.id);
      const dossiers = await this.service.getAllDossiersForCase(caseIdentifier);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'All evidence dossiers retrieved successfully',
        data: dossiers,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getDossierById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dossierId = String(req.params.dossierId || req.params.id);
      const dossier = await this.service.getDossierById(dossierId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Evidence dossier retrieved successfully',
        data: dossier,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  verifyDossier = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dossierId = String(req.params.dossierId || req.params.id);
      const result = await this.service.verifyDossierIntegrity(dossierId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: result.isValid
          ? 'Cryptographic integrity verified: Document uncompromised'
          : 'Cryptographic integrity check FAILED: Discrepancy detected',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const evidenceDossierController = new EvidenceDossierController();
