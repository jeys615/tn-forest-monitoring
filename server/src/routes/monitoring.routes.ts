import { Router } from 'express';
import { MonitoringController } from '../controllers/MonitoringController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const monitoringController = new MonitoringController();

// Protect all monitoring routes
router.use(requireAuth);

// Base route: /api/monitoring

// Operational health check
router.get(
  '/health',
  requirePermission(Permission.MONITORING_READ),
  monitoringController.getMonitoringHealth,
);

// Recover stale monitoring jobs
router.post(
  '/recover-stale',
  requirePermission(Permission.MONITORING_PROCESS),
  monitoringController.recoverStaleJobs,
);

// System-wide monitoring status
router.get(
  '/status',
  requirePermission(Permission.MONITORING_READ),
  monitoringController.getMonitoringStatus,
);

// Area-level incremental monitoring summaries
router.get(
  '/areas',
  requirePermission(Permission.MONITORING_READ),
  monitoringController.getAreaMonitoringSummaries,
);

// Trigger automated monitoring cycle on demand
router.post(
  '/run-cycle',
  requirePermission(Permission.MONITORING_PROCESS),
  monitoringController.runMonitoringCycle,
);

// Retry a failed incremental monitoring job
router.post(
  '/retry/:jobId',
  requirePermission(Permission.MONITORING_PROCESS),
  monitoringController.retryJob,
);

// List incremental monitoring jobs
router.get(
  '/incremental-jobs',
  requirePermission(Permission.MONITORING_READ),
  monitoringController.getIncrementalJobs,
);

// Schedule a new scan job
router.post(
  '/schedule',
  requirePermission(Permission.MONITORING_PROCESS),
  monitoringController.scheduleJob,
);

// Get all jobs
router.get('/jobs', requirePermission(Permission.MONITORING_READ), monitoringController.getAllJobs);

// Get specific job by ID
router.get(
  '/jobs/:id',
  requirePermission(Permission.MONITORING_READ),
  monitoringController.getJobById,
);

// Force execute/process a job (trigger local ML/NDVI computation)
router.post(
  '/jobs/:id/process',
  requirePermission(Permission.MONITORING_PROCESS),
  monitoringController.processJob,
);

// Lightweight system operational status (no GEE calls)
router.get(
  '/system-status',
  requirePermission(Permission.MONITORING_READ),
  monitoringController.getSystemStatus,
);

export const monitoringRoutes = router;

