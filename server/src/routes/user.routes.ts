import { Router } from 'express';
import { UserController } from '../controllers/UserController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/roleMiddleware.js';
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from '../validators/user.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Permission } from '@tn-forest/shared/types';

const router = Router();
const controller = new UserController();

router.use(requireAuth);

router.get('/', requirePermission(Permission.USER_READ), asyncHandler(controller.getUsers));
router.get('/:id', requirePermission(Permission.USER_READ), asyncHandler(controller.getUserById));
router.post(
  '/',
  requirePermission(Permission.USER_CREATE),
  validateRequest({ body: createUserSchema }),
  asyncHandler(controller.createUser),
);
router.patch(
  '/:id',
  requirePermission(Permission.USER_UPDATE),
  validateRequest({ body: updateUserSchema }),
  asyncHandler(controller.updateUser),
);
router.patch(
  '/:id/status',
  requirePermission(Permission.USER_DEACTIVATE),
  validateRequest({ body: updateUserStatusSchema }),
  asyncHandler(controller.updateUserStatus),
);

export { router as userRouter };
