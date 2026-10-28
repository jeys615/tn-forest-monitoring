import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../constants/index.js';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
}

function createLimiter(config: RateLimitConfig) {
  return rateLimit({
    windowMs: config.windowMs,
    limit: (req: Request) => {
      // Allow overriding max limit in tests via custom header only in non-production environments
      if (process.env.NODE_ENV !== 'production' && req.headers['x-test-rate-limit-max']) {
        const customMax = Number(req.headers['x-test-rate-limit-max']);
        if (!isNaN(customMax) && customMax > 0) return customMax;
      }
      return config.max;
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
      // In test environment, bypass rate limiting to protect regression suites
      // UNLESS explicitly testing rate limits with the x-test-rate-limit header
      if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
        return true;
      }
      return false;
    },
    message: config.message,
    handler: (req: Request, res: Response) => {
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message: config.message,
      });
    },
  });
}

/**
 * Rate limiter for authentication login endpoint (POST /api/auth/login).
 * Protects against brute-force attacks by limiting to 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many login attempts. Please try again after 15 minutes.',
});

/**
 * Rate limiter for checkpoint offline batch sync endpoint (POST /api/checkpoints/sync-batch).
 * Protects against denial of service and database saturation with 60 requests per 1 minute per IP.
 */
export const checkpointBatchSyncRateLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: 'Too many checkpoint batch sync requests. Please try again later.',
});

/**
 * Rate limiter for satellite acquisition endpoint (POST /api/satellite/acquire).
 * Protects GEE quota and background workers with 10 requests per 1 minute per IP.
 */
export const satelliteAcquisitionRateLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Satellite acquisition rate limit exceeded. Please try again later.',
});
