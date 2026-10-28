import { Router } from 'express';
import { BaselineController } from '../controllers/BaselineController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new BaselineController();

router.use(requireAuth);

router.get(
  '/',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getAllBaselines),
);
router.get(
  '/candidates',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getAvailableCandidates),
);
router.get(
  '/:id',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getBaselineById),
);
router.post(
  '/evaluate',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.evaluateCandidate),
);
router.post(
  '/select',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.selectBaselineCandidate),
);
router.post(
  '/historical-reference',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getHistoricalReference),
);
router.post(
  '/:id/activate',
  requirePermission(Permission.AREA_UPDATE),
  asyncHandler(controller.activateBaseline),
);

export { router as baselineRouter };
