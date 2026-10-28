import { Router } from 'express';
import { miningAuthorizationController } from '../controllers/MiningAuthorizationController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { UserRole } from '@tn-forest/shared/types';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MINING_OFFICER,
    UserRole.FOREST_OFFICER,
  ),
  miningAuthorizationController.createAuthorization,
);

router.get('/', miningAuthorizationController.getAllAuthorizations);
router.get('/:id', miningAuthorizationController.getAuthorizationById);

router.put(
  '/:id',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MINING_OFFICER,
    UserRole.FOREST_OFFICER,
  ),
  miningAuthorizationController.updateAuthorization,
);

export { router as miningAuthorizationRouter };
