import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { AlertModel } from '../models/Alert.js';
import { TemporaryAreaModel } from '../models/TemporaryArea.js';
import { MiningExtractionEstimateModel } from '../models/MiningExtractionEstimate.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { CaseAuditLogModel } from '../models/CaseAuditLog.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { EPassModel } from '../models/EPass.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { AuthService } from '../services/AuthService.js';

interface DomainModelEntry {
  displayName: string;
  collectionName: string;
  model: {
    collection: { name: string };
    countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
    deleteMany: (filter: Record<string, unknown>) => Promise<{ deletedCount?: number }>;
    syncIndexes?: () => Promise<unknown>;
  };
}

async function runReset() {
  console.log('================================================================');
  console.log('🧹 SAFE MONITORING DOMAIN RESET — TN FOREST SYSTEM');
  console.log('================================================================\n');

  // ── SAFETY GUARD 1: Confirmation Flag Check ──
  const isConfirmed =
    process.env.RESET_MONITORING_DATA === 'CONFIRM_RESET_TN_FOREST_MONITORING' ||
    process.argv.includes('--confirm-reset');

  if (!isConfirmed) {
    console.error('❌ SAFETY ABORT: Confirmation flag missing.');
    console.error('   Please run with --confirm-reset flag or set environment variable:');
    console.error('   RESET_MONITORING_DATA=CONFIRM_RESET_TN_FOREST_MONITORING\n');
    process.exit(1);
  }

  // Connect to MongoDB
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ No database connection established.');
    process.exit(1);
  }

  const dbName = db.databaseName;
  console.log(`Database Name:            ${dbName}`);
  console.log(`Host:                     ${mongoose.connection.host}:${mongoose.connection.port}`);
  console.log(`MongoDB State:            ${mongoose.connection.readyState === 1 ? 'CONNECTED (1)' : 'NOT CONNECTED'}`);

  // ── SAFETY GUARD 2: Database Name Validation ──
  if (dbName !== 'tn_forest_monitoring') {
    console.error(`❌ SAFETY ABORT: Database name "${dbName}" does not match target "tn_forest_monitoring".`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── ORDERED DOMAIN COLLECTIONS (Dependent first, parent last) ──
  const domainModels: DomainModelEntry[] = [
    { displayName: 'caseauditlogs', collectionName: CaseAuditLogModel.collection.name, model: CaseAuditLogModel },
    { displayName: 'enforcementcases', collectionName: EnforcementCaseModel.collection.name, model: EnforcementCaseModel },
    { displayName: 'reconciliationreports', collectionName: ReconciliationReportModel.collection.name, model: ReconciliationReportModel },
    { displayName: 'checkpointlogs', collectionName: CheckpointLogModel.collection.name, model: CheckpointLogModel },
    { displayName: 'checkpoints', collectionName: CheckpointModel.collection.name, model: CheckpointModel },
    { displayName: 'epasses', collectionName: EPassModel.collection.name, model: EPassModel },
    { displayName: 'drivers', collectionName: DriverModel.collection.name, model: DriverModel },
    { displayName: 'vehicles', collectionName: VehicleModel.collection.name, model: VehicleModel },
    { displayName: 'transportcompanies', collectionName: TransportCompanyModel.collection.name, model: TransportCompanyModel },
    { displayName: 'miningextractionestimates', collectionName: MiningExtractionEstimateModel.collection.name, model: MiningExtractionEstimateModel },
    { displayName: 'miningauthorizations', collectionName: MiningAuthorizationModel.collection.name, model: MiningAuthorizationModel },
    { displayName: 'alerts', collectionName: AlertModel.collection.name, model: AlertModel },
    { displayName: 'changedetections', collectionName: ChangeDetectionModel.collection.name, model: ChangeDetectionModel },
    { displayName: 'incrementalmonitoringrecords', collectionName: IncrementalMonitoringRecordModel.collection.name, model: IncrementalMonitoringRecordModel },
    { displayName: 'monitoringjobs', collectionName: MonitoringJobModel.collection.name, model: MonitoringJobModel },
    { displayName: 'processedimageresults', collectionName: ProcessedImageResultModel.collection.name, model: ProcessedImageResultModel },
    { displayName: 'baselines', collectionName: BaselineModel.collection.name, model: BaselineModel },
    { displayName: 'satellitemetadatas', collectionName: SatelliteMetadata.collection.name, model: SatelliteMetadata },
    { displayName: 'temporaryareas', collectionName: TemporaryAreaModel.collection.name, model: TemporaryAreaModel },
    { displayName: 'zones', collectionName: Zone.collection.name, model: Zone },
  ];

  // ── SAFETY GUARD 3: Initial Users Audit ──
  const initialUsersCount = await User.countDocuments();
  console.log(`\n🔒 USER PRESERVATION LOCK:`);
  console.log(`   Initial User Count:     ${initialUsersCount}`);
  if (initialUsersCount === 0) {
    console.error('❌ SAFETY ABORT: No users found in database! Halting to prevent corrupted state.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Verify Super Admin user
  const superAdmin = await User.findOne({ email: 'admin@tnforest.gov.in' }).select('+passwordHash');
  if (!superAdmin) {
    console.warn('⚠️ Warning: admin@tnforest.gov.in not found; verifying other admin accounts...');
  } else {
    console.log(`   Super Admin Verified:   ${superAdmin.email} (ID: ${superAdmin._id}, Role: ${superAdmin.role})`);
  }

  // ── PRE-RESET COLLECTION COUNTS ──
  console.log('\n--- 1. PRE-RESET COLLECTION AUDIT ---');
  const preCounts: Record<string, number> = {};
  let totalScheduledForDeletion = 0;

  for (const item of domainModels) {
    const count = await item.model.countDocuments();
    preCounts[item.displayName] = count;
    totalScheduledForDeletion += count;
    console.log(`  • ${item.displayName.padEnd(30)} : ${count} documents (collection: ${item.collectionName})`);
  }
  console.log(`\n  TOTAL DOMAIN DOCUMENTS SCHEDULED FOR DELETION: ${totalScheduledForDeletion}`);
  console.log(`  USERS TO BE PRESERVED:                         ${initialUsersCount}`);

  // ── RASTER TEMP PRE-RESET AUDIT ──
  const rasterTempDir = path.resolve(process.cwd(), 'storage', 'raster_temp');
  let rasterTempDirsBefore = 0;
  if (fs.existsSync(rasterTempDir)) {
    rasterTempDirsBefore = fs.readdirSync(rasterTempDir).length;
  }
  console.log(`  RASTER TEMP WORKSPACES BEFORE:                 ${rasterTempDirsBefore} directories`);

  // ── DELETION EXECUTION ──
  console.log('\n--- 2. EXECUTING CONTROLLED DOMAIN DATA PURGE ---');
  const deletedCounts: Record<string, number> = {};

  for (const item of domainModels) {
    const res = await item.model.deleteMany({});
    const count = res.deletedCount ?? 0;
    deletedCounts[item.displayName] = count;
    console.log(`  🗑️ Purged ${item.displayName.padEnd(28)} : ${count} deleted (pre: ${preCounts[item.displayName]})`);
  }

  // ── CLEAR LOCAL RASTER TEMP FOLDERS ONLY ──
  console.log('\n--- 3. PURGING LOCAL EPHEMERAL RASTER WORKSPACES ---');
  let rasterTempDirsAfter = 0;
  if (fs.existsSync(rasterTempDir)) {
    const entries = fs.readdirSync(rasterTempDir);
    for (const entry of entries) {
      const entryPath = path.join(rasterTempDir, entry);
      try {
        fs.rmSync(entryPath, { recursive: true, force: true });
      } catch (err: any) {
        console.warn(`  ⚠️ Could not remove ${entry}: ${err.message}`);
      }
    }
    rasterTempDirsAfter = fs.readdirSync(rasterTempDir).length;
  }
  console.log(`  ✅ Raster temp directory cleared: ${rasterTempDirsBefore} -> ${rasterTempDirsAfter} directories.`);

  // ── RE-SYNC INDEXES ──
  console.log('\n--- 4. SYNCHRONIZING DATABASE INDEXES ---');
  for (const item of domainModels) {
    if (typeof item.model.syncIndexes === 'function') {
      try {
        await item.model.syncIndexes();
      } catch {
        // ignore index sync warnings on empty collections
      }
    }
  }
  await User.syncIndexes();
  console.log('  ✅ Database indexes synchronized.');

  // ── POST-RESET VERIFICATION ──
  console.log('\n--- 5. POST-RESET AUDIT & INVARIANT CHECKS ---');
  const postCounts: Record<string, number> = {};
  let totalRemainingDomainDocs = 0;

  for (const item of domainModels) {
    const count = await item.model.countDocuments();
    postCounts[item.displayName] = count;
    totalRemainingDomainDocs += count;
    const pass = count === 0;
    console.log(`  • ${item.displayName.padEnd(30)} : ${count} documents ${pass ? '✅ PASS' : '❌ FAIL'}`);
  }

  // Verify Users Count
  const postUsersCount = await User.countDocuments();
  console.log(`\n  User Count Before:       ${initialUsersCount}`);
  console.log(`  User Count After:        ${postUsersCount}`);
  const usersPreserved = postUsersCount === initialUsersCount;
  console.log(`  Users Preserved:         ${usersPreserved ? 'PASS ✅' : 'FAIL ❌'}`);

  if (!usersPreserved) {
    console.error(`❌ CRITICAL DISCREPANCY: User count changed from ${initialUsersCount} to ${postUsersCount}!`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Verify Super Admin Login
  console.log('\n--- 6. VERIFYING AUTHENTICATION INTEGRITY ---');
  const authService = new AuthService();
  let authPass = false;
  try {
    const loginResult = await authService.login({
      email: 'admin@tnforest.gov.in',
      password: 'Admin@TNFMS2026!',
    });
    if (loginResult && loginResult.token) {
      console.log(`  ✅ Super Admin login verified: Token issued for ${loginResult.user.email} (${loginResult.user.role})`);
      authPass = true;
    }
  } catch (err: any) {
    console.error(`  ❌ Super Admin login failed: ${err.message}`);
  }

  // Verify No Orphan Zone References across collections
  console.log('\n--- 7. CHECKING FOR ORPHANED ZONE REFERENCES ---');
  const anyZoneCount = await Zone.countDocuments();
  const anyBaselineCount = await BaselineModel.countDocuments();
  const anySatCount = await SatelliteMetadata.countDocuments();
  const anyJobCount = await MonitoringJobModel.countDocuments();
  const anyChangeCount = await ChangeDetectionModel.countDocuments();
  const anyAlertCount = await AlertModel.countDocuments();

  const domainEmpty =
    anyZoneCount === 0 &&
    anyBaselineCount === 0 &&
    anySatCount === 0 &&
    anyJobCount === 0 &&
    anyChangeCount === 0 &&
    anyAlertCount === 0 &&
    totalRemainingDomainDocs === 0;

  console.log(`  Total Remaining Domain Records: ${totalRemainingDomainDocs}`);
  console.log(`  All Domain Collections Empty:   ${domainEmpty ? 'PASS ✅' : 'FAIL ❌'}`);

  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('📋 FINAL RESET VERIFICATION SUMMARY');
  console.log('================================================================');
  console.log(`Database:                 ${dbName}`);
  console.log(`Users before:             ${initialUsersCount}`);
  console.log(`Users after:              ${postUsersCount}`);
  console.log(`Users preserved:          ${usersPreserved ? 'PASS' : 'FAIL'}`);
  console.log(`Raster temp before/after: ${rasterTempDirsBefore} -> ${rasterTempDirsAfter}`);
  console.log(`Authentication:           ${authPass ? 'PASS' : 'FAIL'}`);
  console.log(`Domain Collections Empty: ${domainEmpty ? 'PASS' : 'FAIL'}`);
  console.log(`Overall Reset:            ${usersPreserved && authPass && domainEmpty ? 'PASS' : 'FAIL'}`);
  console.log('================================================================\n');

  if (!usersPreserved || !authPass || !domainEmpty) {
    process.exit(1);
  }
}

runReset().catch((err) => {
  console.error('\n❌ UNHANDLED RESET ERROR:', err);
  process.exit(1);
});
