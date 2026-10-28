import { Router } from 'express';
import { getDatabaseStatus } from '../config/database.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    data: {
      status: 'healthy',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: getDatabaseStatus(),
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
