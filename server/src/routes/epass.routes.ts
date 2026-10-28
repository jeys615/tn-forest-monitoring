import { Router } from 'express';
import { ePassController } from '../controllers/EPassController.js';
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
  ePassController.createEPass,
);

router.get('/summary', ePassController.getSummaryStats);
router.get('/verify/:passNumberOrId', ePassController.verifyEPass);
router.get('/', ePassController.getAllEPasses);
router.get('/:id', ePassController.getEPassById);

router.put(
  '/:id/cancel',
  requireRole(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MINING_OFFICER,
    UserRole.FOREST_OFFICER,
  ),
  ePassController.cancelEPass,
);

export { router as ePassRouter };
