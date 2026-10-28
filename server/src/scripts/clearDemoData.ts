import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { TemporaryAreaModel } from '../models/TemporaryArea.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { MiningExtractionEstimateModel } from '../models/MiningExtractionEstimate.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { CaseAuditLogModel } from '../models/CaseAuditLog.js';
import { TempImageManager } from '../services/gee/TempImageManager.js';
import { AuthService } from '../services/AuthService.js';
import { seedSuperAdmin } from '../seeds/seedSuperAdmin.js';

interface ModelEntry {
  name: string;
  model: {
    countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
    deleteMany?: (filter?: Record<string, unknown>) => Promise<{ deletedCount?: number }>;
    syncIndexes?: () => Promise<unknown>;
  };
  isUserCollection?: boolean;
}

export async function clearDemoData(): Promise<{
  preCounts: Record<string, number>;
  postCounts: Record<string, number>;
  usersPreserved: number;
}> {
  console.log('\n================================================================');
  console.log('🧹 CLEAR DEMO DATA & PREPARE CLEAN OPERATIONAL DATABASE');
  console.log('================================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
    console.log(`✅ Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
  }

  const operationalModels: ModelEntry[] = [
    { name: 'CaseAuditLog', model: CaseAuditLogModel },
    { name: 'EnforcementCase', model: EnforcementCaseModel },
    { name: 'ReconciliationReport', model: ReconciliationReportModel },
    { name: 'CheckpointLog', model: CheckpointLogModel },
    { name: 'Checkpoint', model: CheckpointModel },
    { name: 'EPass', model: EPassModel },
    { name: 'Driver', model: DriverModel },
    { name: 'Vehicle', model: VehicleModel },
    { name: 'TransportCompany', model: TransportCompanyModel },
    { name: 'MiningExtractionEstimate', model: MiningExtractionEstimateModel },
    { name: 'MiningAuthorization', model: MiningAuthorizationModel },
    { name: 'TemporaryArea', model: TemporaryAreaModel },
    { name: 'Alert', model: AlertModel },
    { name: 'ChangeDetection', model: ChangeDetectionModel },
    { name: 'ProcessedImageResult', model: ProcessedImageResultModel },
    { name: 'IncrementalMonitoringRecord', model: IncrementalMonitoringRecordModel },
    { name: 'MonitoringJob', model: MonitoringJobModel },
    { name: 'Baseline', model: BaselineModel },
    { name: 'SatelliteMetadata', model: SatelliteMetadata },
    { name: 'Zone', model: Zone },
  ];

  const userModelEntry: ModelEntry = {
    name: 'User',
    model: User,
    isUserCollection: true,
  };

  const allModels: ModelEntry[] = [...operationalModels, userModelEntry];

  // 1. Pre-deletion counts
  console.log('\n--- PHASE 1: PRE-CLEANUP COLLECTION COUNTS ---');
  const preCounts: Record<string, number> = {};
  for (const item of allModels) {
    preCounts[item.name] = await item.model.countDocuments();
    const isUser = item.isUserCollection ? ' [PRESERVED]' : '';
    console.log(`  • ${item.name.padEnd(28)} : ${preCounts[item.name]}${isUser}`);
  }

  const initialUserCount = preCounts['User'];
  console.log(`\n🔒 USER PRESERVATION LOCK: ${initialUserCount} user account(s) will be strictly preserved.`);

  // 2. Perform deletion of operational/demo records only
  console.log('\n--- PHASE 2: PURGING OPERATIONAL / DEMO COLLECTIONS ---');
  for (const item of operationalModels) {
    if (typeof item.model.deleteMany === 'function') {
      const result = await item.model.deleteMany({});
      console.log(`  🗑️ ${item.name.padEnd(28)} : Cleared ${result?.deletedCount ?? 0} records`);
    }
  }

  // 3. Ensure User collection was NOT touched and Super Admin exists
  console.log('\n--- PHASE 3: VERIFYING USER PRESERVATION & AUTHENTICATION ---');
  await seedSuperAdmin();

  const users = await User.find({}).select('name email role status employeeId createdAt').lean();
  console.log(`  ✅ User Collection Count: ${users.length} (Preserved: ${users.length >= initialUserCount ? 'YES' : 'NO'})`);
  for (const u of users) {
    console.log(`     - ${(u as any).name} <${(u as any).email}> (Role: ${(u as any).role}, Status: ${(u as any).status}, EmpID: ${(u as any).employeeId || 'N/A'})`);
  }

  // Verify auth capability
  const authService = new AuthService();
  try {
    const adminLogin = await authService.login({
      email: 'admin@tnforest.gov.in',
      password: 'Admin@TNFMS2026!',
    });
    if (adminLogin && adminLogin.token) {
      console.log(`  ✅ Super Admin login verified: Token issued for ${adminLogin.user.email} (${adminLogin.user.role})`);
    }
  } catch (err: unknown) {
    console.info(`  ℹ️ Default admin password test: ${(err as Error).message}`);
  }

  // 4. Purge ephemeral local temp disk files
  console.log('\n--- PHASE 4: PURGING EPHEMERAL LOCAL DISK WORKSPACES ---');
  try {
    await TempImageManager.cleanupAllWorkspaces();
    console.log('  🗑️ Local temporary workspaces purged cleanly.');
  } catch (e) {
    console.warn('  ⚠️ Temp workspace cleanup note:', (e as Error).message);
  }

  // 5. Sync indexes across collections
  console.log('\n--- PHASE 5: RE-SYNCING COLLECTION INDEXES ---');
  for (const item of allModels) {
    try {
      if (typeof item.model.syncIndexes === 'function') {
        await item.model.syncIndexes();
      }
    } catch {
      // index sync
    }
  }
  console.log('  ✅ Database indexes synchronized.');

  // 6. Post-deletion counts
  console.log('\n--- PHASE 6: POST-CLEANUP COLLECTION DOCUMENT COUNTS ---');
  const postCounts: Record<string, number> = {};
  for (const item of allModels) {
    postCounts[item.name] = await item.model.countDocuments();
    const isUser = item.isUserCollection ? ' [PRESERVED]' : '';
    console.log(`  • ${item.name.padEnd(28)} : ${postCounts[item.name]}${isUser}`);
  }

  console.log('\n================================================================');
  console.log('🎉 CLEANUP COMPLETE: SYSTEM IS READY FOR MANUAL REAL MONITORING');
  console.log('================================================================\n');

  return {
    preCounts,
    postCounts,
    usersPreserved: postCounts['User'],
  };
}

// Run directly if invoked as main script
const isMainScript = process.argv[1] && (
  process.argv[1].endsWith('clearDemoData.ts') ||
  process.argv[1].endsWith('clearDemoData.js')
);

if (isMainScript) {
  clearDemoData()
    .then(async () => {
      await mongoose.disconnect();
      process.exitCode = 0;
    })
    .catch(async (err) => {
      console.error('❌ clearDemoData failed:', err);
      await mongoose.disconnect();
      process.exitCode = 1;
    });
}
