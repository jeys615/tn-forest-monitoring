import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import { UserRole, Permission } from '@tn-forest/shared/types';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED));
      return;
    }

    if (req.user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError('Forbidden. Insufficient role permissions.', HTTP_STATUS.FORBIDDEN));
      return;
    }

    next();
  };
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('Authentication required', HTTP_STATUS.UNAUTHORIZED));
      return;
    }

    if (req.user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }

    const hasPermission = permissions.every((p) => req.user?.permissions.includes(p));

    if (!hasPermission) {
      next(new AppError('Forbidden. Insufficient permissions.', HTTP_STATUS.FORBIDDEN));
      return;
    }

    next();
  };
}
