import { Router } from 'express';
import { ImageProcessingController } from '../controllers/ImageProcessingController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new ImageProcessingController();

router.use(requireAuth);

router.get(
  '/results',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getAllResults),
);
router.get(
  '/results/:id',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getResultById),
);
router.post(
  '/process',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.processImage),
);

export { router as processingRouter };
