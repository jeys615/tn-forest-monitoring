import { Router } from 'express';
import { AlertController } from '../controllers/AlertController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  updateAlertStatusSchema,
  alertQuerySchema,
  alertActionSchema,
  alertAssignSchema,
  alertStatsQuerySchema,
} from '../validators/change.validator.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new AlertController();

// ─── Stats (before /:id to avoid route conflict) ─────────────────────────────

router.get(
  '/stats',
  requireAuth,
  requirePermission(Permission.ALERT_READ),
  validateRequest({ query: alertStatsQuerySchema }),
  controller.getAlertStats,
);

// ─── List ─────────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireAuth,
  requirePermission(Permission.ALERT_READ),
  validateRequest({ query: alertQuerySchema }),
  controller.getAlerts,
);

// ─── Single alert ──────────────────────────────────────────────────────────────

router.get(
  '/:id',
  requireAuth,
  requirePermission(Permission.ALERT_READ),
  controller.getAlertById,
);

// ─── Audit history ────────────────────────────────────────────────────────────

router.get(
  '/:id/audit',
  requireAuth,
  requirePermission(Permission.ALERT_READ),
  controller.getAlertAuditHistory,
);

// ─── Lifecycle action ─────────────────────────────────────────────────────────

router.patch(
  '/:id/action',
  requireAuth,
  requirePermission(Permission.ALERT_UPDATE),
  validateRequest({ body: alertActionSchema }),
  controller.performAction,
);

// ─── Assignment ───────────────────────────────────────────────────────────────

router.patch(
  '/:id/assign',
  requireAuth,
  requirePermission(Permission.ALERT_UPDATE),
  validateRequest({ body: alertAssignSchema }),
  controller.assignAlert,
);

// ─── Legacy status update (backward compat) ───────────────────────────────────

router.patch(
  '/:id/status',
  requireAuth,
  requirePermission(Permission.ALERT_UPDATE),
  validateRequest({ body: updateAlertStatusSchema }),
  controller.updateAlertStatus,
);

export default router;
