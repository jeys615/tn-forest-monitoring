import { Router } from 'express';
import { EnforcementCaseController } from '../controllers/EnforcementCaseController.js';
import { evidenceDossierController } from '../controllers/EvidenceDossierController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { Permission } from '@tn-forest/shared/types';
import {
  createCaseSchema,
  createFromReconciliationSchema,
  assignOfficerSchema,
  updateCaseStatusSchema,
  updateInvestigationSchema,
  recordEnforcementActionSchema,
  closeCaseSchema,
  queryCaseSchema,
} from '../validators/enforcementCase.validator.js';

const router = Router();
const controller = new EnforcementCaseController();

// Create manual case
router.post(
  '/',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_CREATE),
  validateRequest({ body: createCaseSchema }),
  controller.createCase,
);

// Create case from M11 Reconciliation Report
router.post(
  '/from-reconciliation',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_CREATE),
  validateRequest({ body: createFromReconciliationSchema }),
  controller.createCaseFromReconciliation,
);

// Get summary metrics
router.get(
  '/summary',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  controller.getSummary,
);

// List cases
router.get(
  '/',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  validateRequest({ query: queryCaseSchema }),
  controller.getAllCases,
);

// Get case detail
router.get(
  '/:id',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  controller.getCaseById,
);

// Assign officer
router.patch(
  '/:id/assign',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_ASSIGN),
  validateRequest({ body: assignOfficerSchema }),
  controller.assignOfficer,
);

// Update status
router.patch(
  '/:id/status',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_UPDATE),
  validateRequest({ body: updateCaseStatusSchema }),
  controller.updateStatus,
);

// Update investigation & field verification
router.patch(
  '/:id/investigation',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_UPDATE),
  validateRequest({ body: updateInvestigationSchema }),
  controller.updateInvestigation,
);

// Record official enforcement action
router.patch(
  '/:id/action',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_UPDATE),
  validateRequest({ body: recordEnforcementActionSchema }),
  controller.recordEnforcementAction,
);

// Formally close case
router.patch(
  '/:id/close',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_CLOSE),
  validateRequest({ body: closeCaseSchema }),
  controller.closeCase,
);

// Get audit history
router.get(
  '/:id/audit',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  controller.getAuditHistory,
);

// Evidence Dossier compilation & retrieval
router.post(
  '/:id/dossier',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_UPDATE),
  evidenceDossierController.compileDossier,
);

router.get(
  '/:id/dossier',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.getLatestDossierForCase,
);

router.get(
  '/:id/dossiers',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.getAllDossiersForCase,
);

router.post(
  '/:id/dossier/verify',
  requireAuth,
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.verifyDossier,
);

export default router;
