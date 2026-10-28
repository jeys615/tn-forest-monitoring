import { Router } from 'express';
import { complianceExportController } from '../controllers/ComplianceExportController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { UserRole } from '@tn-forest/shared/types';

const router = Router();

router.use(requireAuth);

router.get(
  '/districts',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.MINING_OFFICER,
    UserRole.VIEWER,
  ),
  complianceExportController.getDistricts,
);

router.get(
  '/summary',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.MINING_OFFICER,
    UserRole.VIEWER,
  ),
  complianceExportController.getReportSummary,
);

router.get(
  '/compliance',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.MINING_OFFICER,
    UserRole.VIEWER,
  ),
  complianceExportController.getComplianceReport,
);

export const complianceReportRouter = router;
