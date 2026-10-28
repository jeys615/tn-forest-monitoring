import { Router } from 'express';
import { ZoneController } from '../controllers/ZoneController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { createZoneSchema, updateZoneSchema } from '../validators/zone.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new ZoneController();

// All zone routes require authentication
router.use(requireAuth);

router.get('/', requirePermission(Permission.AREA_READ), asyncHandler(controller.getZones));
router.get('/:id', requirePermission(Permission.AREA_READ), asyncHandler(controller.getZoneById));
router.post(
  '/',
  requirePermission(Permission.AREA_CREATE),
  validateRequest({ body: createZoneSchema }),
  asyncHandler(controller.createZone),
);
router.patch(
  '/:id',
  requirePermission(Permission.AREA_UPDATE),
  validateRequest({ body: updateZoneSchema }),
  asyncHandler(controller.updateZone),
);
router.patch(
  '/:id/suspend',
  requirePermission(Permission.AREA_UPDATE),
  asyncHandler(controller.suspendZone),
);

import { BaselineController } from '../controllers/BaselineController.js';
import { ImageProcessingController } from '../controllers/ImageProcessingController.js';
import { ChangeDetectionController } from '../controllers/ChangeDetectionController.js';
import { AlertController } from '../controllers/AlertController.js';

const baselineCtrl = new BaselineController();
const processingCtrl = new ImageProcessingController();
const changeCtrl = new ChangeDetectionController();
const alertCtrl = new AlertController();

router.get(
  '/:zoneId/baselines',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(baselineCtrl.getZoneBaselines),
);
router.get(
  '/:zoneId/processing-results',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(processingCtrl.getZoneResults),
);
router.get(
  '/:zoneId/changes',
  requirePermission(Permission.MONITORING_READ),
  changeCtrl.getZoneChanges,
);
router.get(
  '/:zoneId/alerts',
  requirePermission(Permission.ALERT_READ),
  alertCtrl.getZoneAlerts,
);
router.post(
  '/:id/analysis',
  requirePermission(Permission.AREA_UPDATE),
  asyncHandler(controller.runZoneAnalysis),
);

export { router as zoneRouter };
