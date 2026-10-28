import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { seedSuperAdmin } from './seeds/seedSuperAdmin.js';
import { seedDevUsers } from './seeds/seedDevUsers.js';
import { MonitoringSchedulerWorker } from './workers/MonitoringSchedulerWorker.js';
import { CanopyGuardShadowService } from './services/changeDetection/CanopyGuardShadowService.js';
import mongoose from 'mongoose';

const PORT = env.PORT;

async function startServer(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  // Seed default admin and development role accounts
  await seedSuperAdmin();
  await seedDevUsers();

  // Startup stale recovery: recover any MonitoringJobs stuck in PROCESSING state from a prior server crash
  try {
    const { MonitoringSchedulerService } = await import('./services/MonitoringSchedulerService.js');
    const schedulerSvc = new MonitoringSchedulerService();
    const recoveryResult = await schedulerSvc.recoverStaleMonitoringJobs({ staleThresholdMinutes: 15 });
    if (recoveryResult.staleJobsFound > 0) {
      console.warn(`[Startup Recovery] Recovered ${recoveryResult.jobsRecovered} stale PROCESSING jobs (${recoveryResult.staleJobsFound} detected, ${recoveryResult.activeJobsSkipped} active skipped).`);
    } else {
      console.info('[Startup Recovery] No stale jobs found. System state is clean.');
    }
  } catch (startupRecoveryErr: unknown) {
    const msg = startupRecoveryErr instanceof Error ? startupRecoveryErr.message : String(startupRecoveryErr);
    console.warn(`[Startup Recovery] Non-fatal startup recovery error: ${msg}`);
  }

  // Startup GEE export reconciliation: reconcile any SatelliteMetadata exports stuck in EXPORT_REQUESTED/EXPORT_RUNNING
  try {
    const { SatelliteAcquisitionService } = await import('./services/SatelliteAcquisitionService.js');
    const satSvc = new SatelliteAcquisitionService();
    const exportRecovery = await satSvc.reconcilePendingSatelliteExports();
    if (exportRecovery.checked > 0) {
      console.warn(`[Startup GEE Recovery] Reconciled ${exportRecovery.checked} pending export(s) (${exportRecovery.reconciledCompleted} completed, ${exportRecovery.reconciledFailed} failed, ${exportRecovery.inFlightRemaining} in-flight).`);
    } else {
      console.info('[Startup GEE Recovery] No pending GEE exports found. Export pipeline state is clean.');
    }
  } catch (satRecoveryErr: unknown) {
    const msg = satRecoveryErr instanceof Error ? satRecoveryErr.message : String(satRecoveryErr);
    console.warn(`[Startup GEE Recovery] Non-fatal startup export recovery error: ${msg}`);
  }

  // Initialize Canopy Guard operational mode from validated env config
  CanopyGuardShadowService.initializeFromEnv(env.CANOPY_GUARD_MODE);
  console.info(`[Startup] Canopy Guard operational mode: ${CanopyGuardShadowService.getMode()} (Source: CANOPY_GUARD_MODE in env)`);

  // Start HTTP server
  const server = app.listen(PORT, () => {
    console.info(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
    console.info(`📋 Health check: http://localhost:${PORT}/api/health`);
  });

  // Start Automated Hourly Monitoring Scheduler (Runs every 60 minutes)
  const schedulerWorker = MonitoringSchedulerWorker.getInstance();
  schedulerWorker.start(60);

  // Graceful shutdown
  const gracefulShutdown = async (signal: string): Promise<void> => {
    console.info(`\n${signal} received. Starting graceful shutdown...`);

    // Stop background monitoring scheduler
    schedulerWorker.stop();

    server.close(async () => {
      console.info('HTTP server closed');

      try {
        await mongoose.connection.close();
        console.info('MongoDB connection closed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
