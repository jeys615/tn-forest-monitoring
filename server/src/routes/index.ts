import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { userRouter } from './user.routes.js';
import { zoneRouter } from './zone.routes.js';
import { satelliteRouter } from './satellite.routes.js';
import { monitoringRoutes } from './monitoring.routes.js';
import { baselineRouter } from './baseline.routes.js';
import { processingRouter } from './processing.routes.js';
import changeRouter from './change.routes.js';
import alertRouter from './alert.routes.js';
import temporaryAreaRouter from './temporaryArea.routes.js';
import { markedAreaRouter } from './markedArea.routes.js';
import geeRouter from './gee.routes.js';
import { miningAuthorizationRouter } from './miningAuthorization.routes.js';
import {
  vehicleRouter,
  driverRouter,
  transportCompanyRouter,
} from './transportFleet.routes.js';
import { ePassRouter } from './epass.routes.js';
import { checkpointRouter } from './checkpoint.routes.js';
import { reconciliationRouter } from './reconciliation.routes.js';
import enforcementCaseRouter from './enforcementCase.routes.js';
import intelligenceRouter from './intelligence.routes.js';
import { evidenceDossierRouter } from './evidenceDossier.routes.js';
import { complianceReportRouter } from './complianceReport.routes.js';
import { offlineChangeDetectionRouter } from './offlineChangeDetection.routes.js';

const router = Router();


// Health check
router.use('/', healthRouter);

// M1 Routes
router.use('/auth', authRouter);
router.use('/users', userRouter);

// M2 Routes
router.use('/zones', zoneRouter);

// M3 Routes
router.use('/satellite', satelliteRouter);

// M4 Routes
router.use('/monitoring', monitoringRoutes);

// M5 Routes
router.use('/baselines', baselineRouter);
router.use('/processing', processingRouter);

// M6 Routes
router.use('/changes', changeRouter);
router.use('/alerts', alertRouter);

// M7 Routes
router.use('/temporary-analysis', temporaryAreaRouter);
router.use('/marked-areas', markedAreaRouter);

// M8 GEE Routes
router.use('/gee', geeRouter);

// M9 Transport & E-Pass Routes
router.use('/mining-authorizations', miningAuthorizationRouter);
router.use('/vehicles', vehicleRouter);
router.use('/drivers', driverRouter);
router.use('/transport-companies', transportCompanyRouter);
router.use('/epasses', ePassRouter);
router.use('/epass', ePassRouter);

// M10 Checkpoint Enforcement Routes
router.use('/checkpoints', checkpointRouter);

// M11 Mining & Transport Reconciliation Routes
router.use('/reconciliation', reconciliationRouter);

// M12 Enforcement Case Management & Investigation Routes
router.use('/enforcement-cases', enforcementCaseRouter);

// M13 Intelligence Dashboard & Decision Support Routes
router.use('/intelligence', intelligenceRouter);

// Phase 11: Forensic Evidence Dossier & Statutory Reports Routes
router.use('/evidence-dossiers', evidenceDossierRouter);
router.use('/reports', complianceReportRouter);

// Offline Satellite Image Change Detection Routes
router.use('/offline-change-detection', offlineChangeDetectionRouter);

export { router as apiRouter };





