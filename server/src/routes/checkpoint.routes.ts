import { Router } from 'express';
import { checkpointController } from '../controllers/CheckpointController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { checkpointBatchSyncRateLimiter } from '../middleware/rateLimiter.js';
import { UserRole } from '@tn-forest/shared/types';

const router = Router();

router.use(requireAuth);

// Summary KPIs
router.get('/summary', checkpointController.getSummaryStats);

// Logs
router.get('/logs', checkpointController.getLogs);
router.get('/logs/epass/:passNumber', checkpointController.getPassVerificationHistory);

// Verification and Passage Recording
router.post(
  '/verify',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.CHECKPOINT_OFFICER,
    UserRole.MINING_OFFICER,
    UserRole.FIELD_OFFICER,
  ),
  checkpointController.verifyEPass,
);

router.post(
  '/record-passage',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.CHECKPOINT_OFFICER,
  ),
  checkpointController.recordPassage,
);

// Offline Batch Synchronization
router.post(
  '/sync-batch',
  checkpointBatchSyncRateLimiter,
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FOREST_OFFICER,
    UserRole.CHECKPOINT_OFFICER,
  ),
  checkpointController.syncBatch,
);

// Checkpoint CRUD
router.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FOREST_OFFICER),
  checkpointController.createCheckpoint,
);

router.get('/', checkpointController.getAllCheckpoints);
router.get('/:id', checkpointController.getCheckpointById);
router.put(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FOREST_OFFICER),
  checkpointController.updateCheckpoint,
);

export const checkpointRouter = router;
