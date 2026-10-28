import { Router } from 'express';
import { evidenceDossierController } from '../controllers/EvidenceDossierController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();

router.use(requireAuth);

// Compile a new sealed dossier for a case
router.post(
  '/case/:caseId',
  requirePermission(Permission.ENFORCEMENT_CASE_UPDATE),
  evidenceDossierController.compileDossier,
);

// Get latest sealed dossier for a case
router.get(
  '/case/:caseId',
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.getLatestDossierForCase,
);

// Get all historical versions of dossiers for a case
router.get(
  '/case/:caseId/all',
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.getAllDossiersForCase,
);

// Verify cryptographic integrity of a dossier
router.post(
  '/:dossierId/verify',
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.verifyDossier,
);
router.get(
  '/:dossierId/verify',
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.verifyDossier,
);

// Retrieve dossier by dossier ID
router.get(
  '/:dossierId',
  requirePermission(Permission.ENFORCEMENT_CASE_READ),
  evidenceDossierController.getDossierById,
);

export const evidenceDossierRouter = router;
