import { Router } from 'express';
import { SatelliteController } from '../controllers/SatelliteController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { acquireImageSchema, queryFootprintSchema, searchSatelliteSchema } from '../validators/satellite.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { satelliteAcquisitionRateLimiter } from '../middleware/rateLimiter.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new SatelliteController();

// All satellite routes require authentication
router.use(requireAuth);

router.get('/', requirePermission(Permission.MONITORING_READ), asyncHandler(controller.getImages));
router.get('/images', requirePermission(Permission.MONITORING_READ), asyncHandler(controller.getImages));
router.get(
  '/:id',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getImageById),
);
router.post(
  '/acquire',
  satelliteAcquisitionRateLimiter,
  requirePermission(Permission.AREA_UPDATE),
  validateRequest({ body: acquireImageSchema }),
  asyncHandler(controller.acquireImage),
);
router.post(
  '/query-footprint',
  requirePermission(Permission.MONITORING_READ),
  validateRequest({ body: queryFootprintSchema }),
  asyncHandler(controller.queryFootprint),
);
router.post(
  '/search',
  requirePermission(Permission.MONITORING_READ),
  validateRequest({ body: searchSatelliteSchema }),
  asyncHandler(controller.searchImages),
);
router.post(
  '/reconcile-pending',
  requirePermission(Permission.MONITORING_PROCESS),
  asyncHandler(controller.reconcilePendingExports),
);
router.post(
  '/:id/export',
  requirePermission(Permission.AREA_UPDATE),
  asyncHandler(controller.exportImage),
);

export { router as satelliteRouter };
