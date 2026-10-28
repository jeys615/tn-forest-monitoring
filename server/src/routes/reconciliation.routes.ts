import { Router } from 'express';
import { reconciliationController } from '../controllers/ReconciliationController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { UserRole } from '@tn-forest/shared/types';

const router = Router();

router.use(requireAuth);

// Summary KPIs
router.get('/summary', reconciliationController.getSummary);

// Zone history
router.get('/zone/:zoneId', reconciliationController.getZoneHistory);

// Reports listing and detail
router.get('/reports', reconciliationController.getAllReports);
router.get('/reports/:id', reconciliationController.getReportById);

// Run on-demand reconciliation audit
router.post(
  '/run',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.MINING_OFFICER,
  ),
  reconciliationController.runReconciliation,
);

// Update investigation status
router.patch(
  '/reports/:id/status',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.MINING_OFFICER,
  ),
  reconciliationController.updateReportStatus,
);

export const reconciliationRouter = router;
