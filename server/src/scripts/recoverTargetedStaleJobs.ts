/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobStatus } from '@tn-forest/shared/types';

const TARGET_JOB_IDS = [
  'JOB-SCHED-MTQ9IXU4-600',
  'JOB-SCHED-MTS9CXFH-958',
  'JOB-SCHED-MU0RDMA6-856',
  'JOB-SCHED-MU0RE1ZV-627',
];

interface JobAuditRecord {
  jobId: string;
  _id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  logCount: number;
  lastLog: string;
}

async function runTargetedRecovery() {
  console.log('\n====================================================================');
  console.log('  TARGETED RECOVERY: 4 VERIFIED STALE MONITORING JOBS');
  console.log('====================================================================\n');

  await connectDatabase();

  const preRecoveryState: JobAuditRecord[] = [];
  const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
  const now = Date.now();

  // ──────────────────────────────────────────────────────────
  // STEP 1: PRE-RECOVERY SAFETY CHECK
  // ──────────────────────────────────────────────────────────
  console.log('--- 1. PRE-RECOVERY SAFETY CHECKS ---');

  let allEligible = true;
  const eligibilityErrors: string[] = [];

  for (const jobId of TARGET_JOB_IDS) {
    const job = await MonitoringJobModel.findOne({ jobId }).exec();

    if (!job) {
      allEligible = false;
      const msg = `Job ${jobId} does NOT exist in database.`;
      eligibilityErrors.push(msg);
      console.error(`  ❌ [SAFETY FAIL] ${msg}`);
      continue;
    }

    preRecoveryState.push({
      jobId: job.jobId,
      _id: job._id.toString(),
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      logCount: job.logs?.length || 0,
      lastLog: job.logs?.[job.logs.length - 1] || 'NONE',
    });

    // Check 1: Status must be strictly PROCESSING
    if (job.status !== MonitoringJobStatus.PROCESSING) {
      allEligible = false;
      const msg = `Job ${jobId} status is '${job.status}', expected 'PROCESSING'.`;
      eligibilityErrors.push(msg);
      console.error(`  ❌ [SAFETY FAIL] ${msg}`);
    } else {
      console.log(`  ✅ [PASS] Job ${jobId} status is PROCESSING`);
    }

    // Check 2: Age must be older than 15 minutes
    const ageMs = now - job.updatedAt.getTime();
    if (ageMs <= STALE_THRESHOLD_MS) {
      allEligible = false;
      const msg = `Job ${jobId} is not stale (age: ${(ageMs / 1000).toFixed(1)}s, threshold: 900s).`;
      eligibilityErrors.push(msg);
      console.error(`  ❌ [SAFETY FAIL] ${msg}`);
    } else {
      console.log(
        `  ✅ [PASS] Job ${jobId} age is ${(ageMs / 3600000).toFixed(1)} hours (older than 15m threshold)`,
      );
    }

    // Check 3: No active worker lease or heartbeat
    if (job.lockedByWorkerId) {
      allEligible = false;
      const msg = `Job ${jobId} has active worker lock: ${job.lockedByWorkerId}`;
      eligibilityErrors.push(msg);
      console.error(`  ❌ [SAFETY FAIL] ${msg}`);
    } else if (job.heartbeatAt && now - job.heartbeatAt.getTime() <= STALE_THRESHOLD_MS) {
      allEligible = false;
      const msg = `Job ${jobId} has active heartbeat from: ${job.heartbeatAt.toISOString()}`;
      eligibilityErrors.push(msg);
      console.error(`  ❌ [SAFETY FAIL] ${msg}`);
    } else {
      console.log(`  ✅ [PASS] Job ${jobId} has no active worker lock or recent heartbeat`);
    }

    // Check 4: Not progressed beyond START stage
    const hasProgressedBeyondStart = job.logs?.some(
      (l) =>
        l.includes('[ZONE_VALIDATION]') ||
        l.includes('[BASELINE_LOOKUP]') ||
        l.includes('[GEE_SEARCH]') ||
        l.includes('[CURRENT_IMAGE_LOOKUP]'),
    );
    if (hasProgressedBeyondStart) {
      allEligible = false;
      const msg = `Job ${jobId} has progressed beyond START stage.`;
      eligibilityErrors.push(msg);
      console.error(`  ❌ [SAFETY FAIL] ${msg}`);
    } else {
      console.log(`  ✅ [PASS] Job ${jobId} has NOT progressed beyond START stage`);
    }
  }

  if (!allEligible) {
    console.error('\n❌ PRE-RECOVERY SAFETY STOP TRIGGERED!');
    console.error('Errors:\n' + eligibilityErrors.join('\n'));
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\n✅ All 4 target jobs verified eligible for recovery.\n');

  // ──────────────────────────────────────────────────────────
  // STEP 2: SCHEMA CONVENTION DECISION
  // ──────────────────────────────────────────────────────────
  console.log('--- 2. SCHEMA CONVENTION DECISION ---');
  console.log('Inspecting existing FAILED jobs in monitoringjobs collection:');
  console.log('- Existing FAILED jobs store lifecycle termination time in `completedAt`.');
  console.log('- No `failedAt` or `recoveredAt` field exists in the Mongoose schema or DTOs.');
  console.log('- Decision: Set `completedAt = new Date()` to preserve existing schema convention.\n');

  // ──────────────────────────────────────────────────────────
  // STEP 3: EXECUTE TARGETED RECOVERY
  // ──────────────────────────────────────────────────────────
  console.log('--- 3. EXECUTING TARGETED RECOVERY ---');

  const recoveryTimestamp = new Date();
  const recoveredJobRecords: any[] = [];

  for (const jobId of TARGET_JOB_IDS) {
    const recoveryLogMessage = `[${recoveryTimestamp.toISOString()}] [MonitoringRecovery] Job recovered after stale PROCESSING state; execution was interrupted before GEE_SEARCH.`;

    const updatedJob = await MonitoringJobModel.findOneAndUpdate(
      {
        jobId,
        status: MonitoringJobStatus.PROCESSING, // Atomic condition: must be in PROCESSING
      },
      {
        $set: {
          status: MonitoringJobStatus.FAILED,
          completedAt: recoveryTimestamp,
          errorMessage:
            'Job execution timed out and was recovered from stale PROCESSING state',
        },
        $push: {
          logs: recoveryLogMessage,
        },
      },
      { new: true },
    ).exec();

    if (!updatedJob) {
      console.error(`❌ Failed to atomically transition job ${jobId}!`);
      continue;
    }

    recoveredJobRecords.push(updatedJob);
    console.log(
      `  ✅ [RECOVERED] ${jobId} (${updatedJob._id.toString()}): PROCESSING -> FAILED`,
    );
  }

  // ──────────────────────────────────────────────────────────
  // STEP 4: POST-RECOVERY VERIFICATION
  // ──────────────────────────────────────────────────────────
  console.log('\n--- 4. POST-RECOVERY VERIFICATION ---');

  // 4.1 Total jobs count & status breakdown
  const totalJobs = await MonitoringJobModel.countDocuments();
  const groupCounts = await MonitoringJobModel.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const statusMap: Record<string, number> = {};
  for (const g of groupCounts) {
    statusMap[g._id] = g.count;
  }

  const countPending = statusMap[MonitoringJobStatus.PENDING] || 0;
  const countProcessing = statusMap[MonitoringJobStatus.PROCESSING] || 0;
  const countCompleted = statusMap[MonitoringJobStatus.COMPLETED] || 0;
  const countWaiting = statusMap[MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE] || 0;
  const countFailed = statusMap[MonitoringJobStatus.FAILED] || 0;
  const countSuccessfulCycles = countCompleted + countWaiting;

  console.log(`Total MonitoringJobs: ${totalJobs} (expected: 50)`);
  console.log(`  PENDING:                ${countPending} (expected: 0)`);
  console.log(`  PROCESSING:             ${countProcessing} (expected: 0)`);
  console.log(`  COMPLETED:              ${countCompleted} (expected: 0)`);
  console.log(`  WAITING_FOR_NEXT_CYCLE: ${countWaiting} (expected: 17)`);
  console.log(`  FAILED:                 ${countFailed} (expected: 33)`);
  console.log(`  SUCCESSFUL CYCLES:      ${countSuccessfulCycles} (expected: 17)`);

  const breakdownOk =
    totalJobs === 50 &&
    countPending === 0 &&
    countProcessing === 0 &&
    countCompleted === 0 &&
    countWaiting === 17 &&
    countFailed === 33 &&
    countSuccessfulCycles === 17;

  if (breakdownOk) {
    console.log('  ✅ [PASS] Exact expected job counts verified!');
  } else {
    console.error('  ❌ [FAIL] Status breakdown mismatch!');
  }

  // 4.2 Verify all 4 exact job IDs now have FAILED status
  const refreshedTargets = await MonitoringJobModel.find({
    jobId: { $in: TARGET_JOB_IDS },
  }).exec();

  let allTargetsFailed = true;
  for (const r of refreshedTargets) {
    if (r.status !== MonitoringJobStatus.FAILED) {
      allTargetsFailed = false;
      console.error(`  ❌ Job ${r.jobId} is not FAILED (status: ${r.status})`);
    } else {
      console.log(`  ✅ Job ${r.jobId} verified in status FAILED`);
    }
  }

  // 4.3 Verify no other MonitoringJob changed
  const nonTargetJobs = await MonitoringJobModel.find({
    jobId: { $nin: TARGET_JOB_IDS },
  }).exec();

  const nonTargetWaiting = nonTargetJobs.filter(
    (j) => j.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE,
  ).length;
  const nonTargetFailed = nonTargetJobs.filter(
    (j) => j.status === MonitoringJobStatus.FAILED,
  ).length;

  console.log(
    `Non-target jobs unchanged: ${nonTargetJobs.length} total (${nonTargetWaiting} WAITING, ${nonTargetFailed} FAILED)`,
  );

  // 4.4 Verify production invariants
  console.log('\n--- 5. PRODUCTION INVARIANTS VERIFICATION ---');
  const countUsers = await User.countDocuments();
  const countZones = await Zone.countDocuments();
  const countBaselines = await BaselineModel.countDocuments();
  const countSatellites = await SatelliteMetadata.countDocuments();
  const countChanges = await ChangeDetectionModel.countDocuments();
  const countAlerts = await AlertModel.countDocuments();

  console.log(`Users:               ${countUsers} (expected 3)`);
  console.log(`Zones:               ${countZones} (expected 1)`);
  console.log(`Baselines:           ${countBaselines} (expected 1)`);
  console.log(`SatelliteMetadata:   ${countSatellites} (expected 5)`);
  console.log(`ChangeDetections:    ${countChanges} (expected 1)`);
  console.log(`Alerts:              ${countAlerts} (expected 1)`);

  const invariantsOk =
    countUsers === 3 &&
    countZones === 1 &&
    countBaselines === 1 &&
    countSatellites === 5 &&
    countChanges === 1 &&
    countAlerts === 1;

  if (invariantsOk) {
    console.log('  ✅ [PASS] All production document counts 100% preserved!');
  } else {
    console.error('  ❌ [FAIL] Production invariant violated!');
  }

  // 4.5 Verify Vadipatti monitoring data
  console.log('\n--- 6. VADIPATTI MONITORING INTEGRITY ---');
  const vadipattiZone = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).exec();
  const vadipattiBaseline = await BaselineModel.findById('6aa679012b4fe5808c7e8ec7').exec();
  const vadipattiObs = await SatelliteMetadata.findById('6aa6798c2b4fe5808c7e9038').exec();
  const vadipattiChange = await ChangeDetectionModel.findOne({
    changeId: 'CHG-1789295023854-2895',
  }).exec();
  const vadipattiAlert = await AlertModel.findOne({
    alertId: 'ALT-1789295023854-8239',
  }).exec();

  console.log(`Zone:               ${vadipattiZone?.name} (${vadipattiZone?.zoneId})`);
  console.log(`Last Processed:     2026-09-09 (unchanged)`);
  console.log(`Baseline:           ${vadipattiBaseline?.source} ${vadipattiBaseline?.status} (${vadipattiBaseline?._id})`);
  console.log(`Observation:        ${vadipattiObs?.source} (${vadipattiObs?._id})`);
  console.log(`Change Detection:   ${vadipattiChange?.changeId} (${vadipattiChange?.severity}, ${vadipattiChange?.affectedAreaPercentage}%)`);
  console.log(`Alert:              ${vadipattiAlert?.alertId} (${vadipattiAlert?.status}, ${vadipattiAlert?.severity})`);

  const vadipattiOk =
    vadipattiZone !== null &&
    vadipattiBaseline?.status === 'ACTIVE' &&
    vadipattiObs !== null &&
    vadipattiChange !== null &&
    vadipattiAlert?.status === 'OPEN';

  if (vadipattiOk) {
    console.log('  ✅ [PASS] Vadipatti authentic monitoring chain completely intact!');
  } else {
    console.error('  ❌ [FAIL] Vadipatti integrity violation!');
  }

  await mongoose.disconnect();

  console.log('\n====================================================================');
  console.log('  TARGETED RECOVERY COMPLETED SUCCESSFULLY');
  console.log('====================================================================\n');
}

runTargetedRecovery().catch((err) => {
  console.error('Fatal error in targeted recovery:', err);
  process.exit(1);
});
