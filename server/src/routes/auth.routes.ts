import { Router } from 'express';
import { AuthController } from '../controllers/AuthController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { loginSchema, changePasswordSchema } from '../validators/auth.validator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const controller = new AuthController();

router.post('/login', authRateLimiter, validateRequest({ body: loginSchema }), asyncHandler(controller.login));
router.post('/register-company', authRateLimiter, asyncHandler(controller.registerCompany));
router.get('/me', requireAuth, asyncHandler(controller.me));
router.post('/logout', requireAuth, asyncHandler(controller.logout));
router.post(
  '/change-password',
  requireAuth,
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(controller.changePassword),
);

export { router as authRouter };
