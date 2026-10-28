import { Router } from 'express';
import { ChangeDetectionController } from '../controllers/ChangeDetectionController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  detectChangeSchema,
  changeQuerySchema,
} from '../validators/change.validator.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new ChangeDetectionController();

router.get(
  '/',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  validateRequest({ query: changeQuerySchema }),
  controller.getChanges,
);

router.get(
  '/:id',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getChangeById,
);

router.get(
  '/:id/comparison-metadata',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getComparisonMetadata,
);

router.get(
  '/:id/baseline-image',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getBaselineImage,
);

router.get(
  '/:id/current-image',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getCurrentImage,
);

router.post(
  '/detect',
  requireAuth,
  requirePermission(Permission.AREA_UPDATE),
  validateRequest({ body: detectChangeSchema }),
  controller.detectChange,
);

export default router;
