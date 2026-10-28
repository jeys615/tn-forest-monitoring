import { Router } from 'express';
import { MarkedAreaController } from '../controllers/MarkedAreaController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new MarkedAreaController();

router.use(requireAuth);

// Analyze any marked area (Permanent zone or Temporary area)
router.post(
  '/analyze',
  requirePermission(Permission.AREA_UPDATE),
  asyncHandler(controller.analyzeMarkedArea),
);

export { router as markedAreaRouter };
