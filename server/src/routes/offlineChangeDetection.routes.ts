import { Router } from 'express';
import { OfflineChangeDetectionController } from '../controllers/OfflineChangeDetectionController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new OfflineChangeDetectionController();

router.use(requireAuth);

router.get(
  '/local-catalog',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getLocalCatalog),
);

router.post(
  '/upload',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.uploadRaster),
);

router.post(
  '/inspect',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.inspectRaster),
);

router.post(
  '/process',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.executeChangeDetection),
);

router.get(
  '/jobs/:jobId',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.getJobResult),
);

router.get(
  '/jobs/:jobId/artifacts/:artifactName',
  requirePermission(Permission.MONITORING_READ),
  asyncHandler(controller.downloadArtifact),
);

export { router as offlineChangeDetectionRouter };
