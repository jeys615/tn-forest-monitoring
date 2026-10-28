import { Router } from 'express';
import { GeeController } from '../controllers/GeeController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new GeeController();

// Diagnostic status is accessible for health checks
router.get('/status', asyncHandler(controller.getStatus));

// Protected operations require authentication
router.post(
  '/discover-multisource',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.discoverMultiSource),
);

router.post(
  '/harmonize',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.harmonize),
);

router.post(
  '/validate-compatibility',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.validateCompatibility),
);

export default router;
