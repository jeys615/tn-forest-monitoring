import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import { UserStatus } from '@tn-forest/shared/types';

const userRepository = new UserRepository();

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      throw new AppError('Authentication required. Missing token.', HTTP_STATUS.UNAUTHORIZED);
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new AppError('Invalid or expired authentication token.', HTTP_STATUS.UNAUTHORIZED);
    }

    const user = await userRepository.findById(payload.userId);
    if (!user) {
      throw new AppError(
        'User belonging to this token no longer exists.',
        HTTP_STATUS.UNAUTHORIZED,
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError('Account is inactive or suspended.', HTTP_STATUS.FORBIDDEN);
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      status: user.status,
    };

    next();
  } catch (error) {
    next(error);
  }
}
