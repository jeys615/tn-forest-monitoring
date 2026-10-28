import { Router } from 'express';
import { IntelligenceDashboardController } from '../controllers/IntelligenceDashboardController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { Permission } from '@tn-forest/shared/types';
import {
  intelligenceQuerySchema,
  trendQuerySchema,
} from '../validators/intelligence.validator.js';

const router = Router();
const controller = new IntelligenceDashboardController();

// Executive summary KPIs
router.get(
  '/summary',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getExecutiveSummary,
);

// Zone risk intelligence rankings & list
router.get(
  '/zones',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  validateRequest({ query: intelligenceQuerySchema }),
  controller.getZoneRiskList,
);

// Single zone risk intelligence detail
router.get(
  '/zones/:zoneId',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getZoneRiskDetail,
);

// Cross-module operational lineage correlation
router.get(
  '/correlation/:zoneId',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getCrossModuleCorrelation,
);

// Alert intelligence summary & aging
router.get(
  '/alerts',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getAlertIntelligence,
);

// Transport & mining intelligence
router.get(
  '/transport',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getTransportIntelligence,
);

// Enforcement case intelligence
router.get(
  '/enforcement',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getEnforcementIntelligence,
);

// Trend analytics
router.get(
  '/trends',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  validateRequest({ query: trendQuerySchema }),
  controller.getTrendAnalytics,
);

// Hotspot / Priority rankings
router.get(
  '/hotspots',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getHotspotRankings,
);

// Decision-support categorization summary
router.get(
  '/decision-support',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getDecisionSupport,
);

// Cross-module investigation timeline
router.get(
  '/timeline',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getTimeline,
);

// Cross-entity intelligence search
router.get(
  '/search',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.search,
);

// Alert intelligence detail & lineage
router.get(
  '/alerts/:alertId',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getAlertDetail,
);

// Mining lease / authorization lineage
router.get(
  '/leases/:leaseId',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getLeaseDetail,
);

// Vehicle intelligence & transport lineage
router.get(
  '/vehicles/:vehicleId',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getVehicleDetail,
);

// E-Pass lineage & checkpoint transit correlation
router.get(
  '/epasses/:id',
  requireAuth,
  requirePermission(Permission.INTELLIGENCE_READ),
  controller.getEPassDetail,
);

export default router;
