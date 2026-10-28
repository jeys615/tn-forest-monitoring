import { Router } from 'express';
import { TemporaryAreaController } from '../controllers/TemporaryAreaController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  createTemporaryAreaSchema,
  temporaryAreaQuerySchema,
} from '../validators/temporaryArea.validator.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new TemporaryAreaController();

// ─── Temporary Monitoring Area Routes ────────────────────────────────────────

// Create temporary monitoring area (Requires AREA_CREATE permission)
router.post(
  '/',
  requireAuth,
  requirePermission(Permission.AREA_CREATE),
  validateRequest({ body: createTemporaryAreaSchema }),
  controller.createTemporaryArea,
);

// List temporary monitoring areas (Requires MONITORING_READ permission)
router.get(
  '/',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  validateRequest({ query: temporaryAreaQuerySchema }),
  controller.getTemporaryAreas,
);

// Get temporary monitoring area by ID (Requires MONITORING_READ permission)
router.get(
  '/:id',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getTemporaryAreaById,
);

// Query historical satellite observations for the temporary polygon & date range
router.get(
  '/:id/observations',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getHistoricalObservations,
);

// Execute historical analysis & mining estimation workflow (Requires AREA_UPDATE permission)
router.post(
  '/:id/run',
  requireAuth,
  requirePermission(Permission.AREA_UPDATE),
  controller.runHistoricalAnalysis,
);

// Get chronological change timeline for temporary area
router.get(
  '/:id/timeline',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getTimeline,
);

// Get mining and volumetric extraction estimates
router.get(
  '/:id/mining-estimate',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getMiningEstimates,
);

// Get consolidated audit report
router.get(
  '/:id/report',
  requireAuth,
  requirePermission(Permission.MONITORING_READ),
  controller.getReport,
);

export default router;
