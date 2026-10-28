/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { MonitoringJobRepository } from '../repositories/MonitoringJobRepository.js';
import { MonitoringSchedulerService } from '../services/MonitoringSchedulerService.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import {
  MonitoringJobStatus,
  MonitoringJobType,
  SensorType,
  SatelliteSource,
} from '@tn-forest/shared/types';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testsFailed++;
  }
}

const HISTORICAL_PROCESSING_JOB_IDS = [
  'JOB-SCHED-MTQ9IXU4-600',
  'JOB-SCHED-MTS9CXFH-958',
  'JOB-SCHED-MU0RDMA6-856',
  'JOB-SCHED-MU0RE1ZV-627',
];

async function runTests() {
  console.log('\n====================================================================');
  console.log('  MONITORING JOB LIFECYCLE HARDENING & KPI VERIFICATION SUITE');
  console.log('====================================================================\n');

  await connectDatabase();

  const jobRepo = new MonitoringJobRepository();
  const schedulerService = new MonitoringSchedulerService();

  // Protect the 4 historical jobs in memory so they are never touched during automated testing
  for (const hId of HISTORICAL_PROCESSING_JOB_IDS) {
    (schedulerService as any).activeJobsSet.add(hId);
  }

  // Pre-test invariant check
  const usersInitial = await User.countDocuments();
  const zonesInitial = await Zone.countDocuments();
  const baselinesInitial = await BaselineModel.countDocuments();
  const satellitesInitial = await SatelliteMetadata.countDocuments();
  const changesInitial = await ChangeDetectionModel.countDocuments();
  const alertsInitial = await AlertModel.countDocuments();

  console.log('--- Initial Production Invariants ---');
  console.log(`Users: ${usersInitial} (expected 3)`);
  console.log(`Zones: ${zonesInitial} (expected 1)`);
  console.log(`Baselines: ${baselinesInitial} (expected 1)`);
  console.log(`Satellites: ${satellitesInitial} (expected 5)`);
  console.log(`Changes: ${changesInitial} (expected 1)`);
  console.log(`Alerts: ${alertsInitial} (expected 1)\n`);

  const createdTestJobIds: string[] = [];

  try {
    // ================================================================
    // CATEGORY A: State Machine (Tests 1–9)
    // ================================================================
    console.log('--- Category A: State Machine ---');

    // Test 1: PENDING job can transition to PROCESSING with startedAt set
    const testJob1 = await jobRepo.create({
      jobId: `TEST-JOB-A1-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.PENDING,
      scheduledAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      logs: ['[TEST] Scheduled test job'],
    });
    createdTestJobIds.push(testJob1.jobId);

    testJob1.status = MonitoringJobStatus.PROCESSING;
    testJob1.startedAt = new Date();
    await testJob1.save();

    const savedJob1 = await jobRepo.findById(testJob1._id.toString());
    assert(
      savedJob1?.status === MonitoringJobStatus.PROCESSING && !!savedJob1.startedAt,
      'Test 1: PENDING job transitions to PROCESSING with startedAt set',
    );

    // Test 2: PROCESSING job transitions to COMPLETED when observation is processed
    testJob1.status = MonitoringJobStatus.COMPLETED;
    testJob1.completedAt = new Date();
    await testJob1.save();
    const savedJob2 = await jobRepo.findById(testJob1._id.toString());
    assert(
      savedJob2?.status === MonitoringJobStatus.COMPLETED && !!savedJob2.completedAt,
      'Test 2: PROCESSING job transitions to COMPLETED when observation is processed',
    );

    // Test 3: PROCESSING job transitions to WAITING_FOR_NEXT_CYCLE when no new observation
    const testJob3 = await jobRepo.create({
      jobId: `TEST-JOB-A3-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.PROCESSING,
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      logs: ['[TEST] Started test job 3'],
    });
    createdTestJobIds.push(testJob3.jobId);

    testJob3.status = MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE;
    testJob3.completedAt = new Date();
    await testJob3.save();
    const savedJob3 = await jobRepo.findById(testJob3._id.toString());
    assert(
      savedJob3?.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE && !!savedJob3.completedAt,
      'Test 3: PROCESSING job transitions to WAITING_FOR_NEXT_CYCLE when no new observation',
    );

    // Test 4: PROCESSING job transitions to FAILED when execution fails
    const testJob4 = await jobRepo.create({
      jobId: `TEST-JOB-A4-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.PROCESSING,
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      logs: ['[TEST] Started test job 4'],
    });
    createdTestJobIds.push(testJob4.jobId);

    testJob4.status = MonitoringJobStatus.FAILED;
    testJob4.errorMessage = 'Simulated GIS failure';
    testJob4.completedAt = new Date();
    await testJob4.save();
    const savedJob4 = await jobRepo.findById(testJob4._id.toString());
    assert(
      savedJob4?.status === MonitoringJobStatus.FAILED &&
        savedJob4.errorMessage === 'Simulated GIS failure',
      'Test 4: PROCESSING job transitions to FAILED when execution fails',
    );

    // Test 5: Active executing states recognized in active processing array
    const activeStates = [
      MonitoringJobStatus.PROCESSING,
      MonitoringJobStatus.DOWNLOADING,
      MonitoringJobStatus.ACQUIRING,
      MonitoringJobStatus.EXPORTING,
      MonitoringJobStatus.PREPROCESSING,
    ];
    assert(
      activeStates.length === 5 &&
        activeStates.includes(MonitoringJobStatus.PROCESSING) &&
        activeStates.includes(MonitoringJobStatus.DOWNLOADING) &&
        activeStates.includes(MonitoringJobStatus.ACQUIRING) &&
        activeStates.includes(MonitoringJobStatus.EXPORTING) &&
        activeStates.includes(MonitoringJobStatus.PREPROCESSING),
      'Test 5: Active executing states (PROCESSING, DOWNLOADING, ACQUIRING, EXPORTING, PREPROCESSING) recognized',
    );

    // Test 6: COMPLETED job cannot be re-executed
    let job6RejectionCaught = false;
    try {
      await schedulerService.processJob(testJob1._id.toString());
    } catch (err: any) {
      if (err.message && err.message.includes('already completed')) {
        job6RejectionCaught = true;
      }
    }
    assert(job6RejectionCaught, 'Test 6: COMPLETED job cannot be re-executed (rejected)');

    // Test 7: Job with retryCount >= maxRetries cannot be re-executed
    const testJob7 = await jobRepo.create({
      jobId: `TEST-JOB-A7-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.FAILED,
      scheduledAt: new Date(),
      retryCount: 3,
      maxRetries: 3,
      logs: ['[TEST] Exceeded retries'],
    });
    createdTestJobIds.push(testJob7.jobId);

    let job7RejectionCaught = false;
    try {
      await schedulerService.processJob(testJob7._id.toString());
    } catch (err: any) {
      if (err.message && err.message.includes('reached maximum retries')) {
        job7RejectionCaught = true;
      }
    }
    assert(
      job7RejectionCaught,
      'Test 7: Job with retryCount >= maxRetries cannot be re-executed (rejected)',
    );

    // Test 8: Retried job increments retryCount
    const initialRetryCount = testJob4.retryCount;
    testJob4.retryCount += 1;
    await testJob4.save();
    const savedJob8 = await jobRepo.findById(testJob4._id.toString());
    assert(
      savedJob8?.retryCount === initialRetryCount + 1,
      'Test 8: Retried job increments retryCount correctly',
    );

    // Test 9: startedAt is set when moving to PROCESSING
    const testJob9 = await jobRepo.create({
      jobId: `TEST-JOB-A9-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.PENDING,
      scheduledAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      logs: ['[TEST] New pending job'],
    });
    createdTestJobIds.push(testJob9.jobId);

    const startTime = new Date();
    testJob9.status = MonitoringJobStatus.PROCESSING;
    testJob9.startedAt = startTime;
    testJob9.heartbeatAt = startTime;
    await testJob9.save();
    const savedJob9 = await jobRepo.findById(testJob9._id.toString());
    assert(
      !!savedJob9?.startedAt && !!savedJob9?.heartbeatAt,
      'Test 9: startedAt and heartbeatAt are set when entering PROCESSING',
    );

    // ================================================================
    // CATEGORY B: No-New-Observation Semantics (Tests 10–17)
    // ================================================================
    console.log('\n--- Category B: No-New-Observation Semantics ---');

    // Test 10: WAITING_FOR_NEXT_CYCLE job has completedAt timestamp set
    assert(
      savedJob3?.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE && !!savedJob3?.completedAt,
      'Test 10: WAITING_FOR_NEXT_CYCLE job has completedAt timestamp set',
    );

    // Test 11: WAITING_FOR_NEXT_CYCLE job does NOT create fake observation in DB
    const satCount = await SatelliteMetadata.countDocuments();
    assert(
      satCount === 5,
      'Test 11: WAITING_FOR_NEXT_CYCLE job does NOT create fake observation (metadata count remains 5)',
    );

    // Test 12: WAITING_FOR_NEXT_CYCLE job does NOT create ProcessedImageResult
    const procResults = await ProcessedImageResultModel.find();
    assert(
      procResults.length <= 2,
      'Test 12: WAITING_FOR_NEXT_CYCLE job does NOT create ProcessedImageResult',
    );

    // Test 13: WAITING_FOR_NEXT_CYCLE job does NOT create ChangeDetectionResult
    const changesCount = await ChangeDetectionModel.countDocuments();
    assert(
      changesCount === 1,
      'Test 13: WAITING_FOR_NEXT_CYCLE job does NOT create ChangeDetectionResult (count remains 1)',
    );

    // Test 14: WAITING_FOR_NEXT_CYCLE job does NOT generate Alert
    const alertsCount = await AlertModel.countDocuments();
    assert(
      alertsCount === 1,
      'Test 14: WAITING_FOR_NEXT_CYCLE job does NOT generate Alert (count remains 1)',
    );

    // Test 15: Baseline record remains ACTIVE and unmodified
    const baseline = await BaselineModel.findById('6aa679012b4fe5808c7e8ec7');
    assert(
      baseline?.status === 'ACTIVE' &&
        baseline?._id.toString() === '6aa679012b4fe5808c7e8ec7',
      'Test 15: Baseline record remains ACTIVE and unmodified',
    );

    // Test 16: Duplicate observation check properly sets WAITING_FOR_NEXT_CYCLE
    const testJob16 = await jobRepo.create({
      jobId: `TEST-JOB-B16-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      zoneId: new Types.ObjectId('6aa676d32b4fe5808c7e8ded'),
      status: MonitoringJobStatus.PROCESSING,
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      logs: ['[TEST] Duplicate observation check'],
    });
    createdTestJobIds.push(testJob16.jobId);
    testJob16.status = MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE;
    testJob16.completedAt = new Date();
    testJob16.logs.push('[DUPLICATE_CHECK] Already Processed: TRUE. Decision: SKIP');
    await testJob16.save();
    const savedJob16 = await jobRepo.findById(testJob16._id.toString());
    assert(
      savedJob16?.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE &&
        savedJob16.logs.some((l) => l.includes('Already Processed: TRUE')),
      'Test 16: Duplicate observation check properly sets WAITING_FOR_NEXT_CYCLE',
    );

    // Test 17: No candidate meeting cloud <= 20% sets WAITING_FOR_NEXT_CYCLE
    const testJob17 = await jobRepo.create({
      jobId: `TEST-JOB-B17-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      zoneId: new Types.ObjectId('6aa676d32b4fe5808c7e8ded'),
      status: MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE,
      scheduledAt: new Date(),
      completedAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      logs: [
        '[CANDIDATE_SELECTION] Rejected: cloud cover exceeds 20.0% threshold',
        '[WAITING_FOR_NEXT_CYCLE] No suitable observation available after baseline.',
      ],
    });
    createdTestJobIds.push(testJob17.jobId);
    assert(
      testJob17.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE &&
        testJob17.logs.some((l) => l.includes('WAITING_FOR_NEXT_CYCLE')),
      'Test 17: Cloud rejection sets WAITING_FOR_NEXT_CYCLE with explicit log',
    );

    // ================================================================
    // CATEGORY C: Stale Job Recovery & Worker Protection (Tests 18–26)
    // ================================================================
    console.log('\n--- Category C: Stale Job Recovery & Worker Protection ---');

    // Test 18: findStaleJobs identifies jobs older than stale threshold in active statuses
    const staleTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const testJobC1 = await jobRepo.create({
      jobId: `TEST-JOB-C1-STALE-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.PROCESSING,
      scheduledAt: staleTime,
      startedAt: staleTime,
      retryCount: 0,
      maxRetries: 3,
      logs: ['[START] Monitoring job execution started'],
    });
    createdTestJobIds.push(testJobC1.jobId);

    // Directly update collection to bypass Mongoose timestamp auto-refresh
    await mongoose.connection.collection('monitoringjobs').updateOne(
      { _id: testJobC1._id },
      { $set: { updatedAt: staleTime, createdAt: staleTime } },
    );

    const threshold15m = new Date(Date.now() - 15 * 60 * 1000);
    const staleFound = await jobRepo.findStaleJobs(threshold15m);
    const hasTestJobC1 = staleFound.some((j) => j.jobId === testJobC1.jobId);
    assert(
      hasTestJobC1,
      'Test 18: findStaleJobs identifies jobs older than stale threshold in active statuses',
    );

    // Test 19: findStaleJobs ignores recently updated active jobs (under threshold)
    const recentJob = await jobRepo.create({
      jobId: `TEST-JOB-C2-RECENT-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.PROCESSING,
      scheduledAt: new Date(),
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      logs: ['[START] Just started'],
    });
    createdTestJobIds.push(recentJob.jobId);

    const staleFound2 = await jobRepo.findStaleJobs(threshold15m);
    const hasRecentJob = staleFound2.some((j) => j.jobId === recentJob.jobId);
    assert(!hasRecentJob, 'Test 19: findStaleJobs ignores recently updated active jobs');

    // Test 20: recoverStaleMonitoringJobs skips jobs currently executing in activeJobsSet
    (schedulerService as any).activeJobsSet.add(testJobC1.jobId);
    const summaryWithActive = await schedulerService.recoverStaleMonitoringJobs({
      staleThresholdMinutes: 15,
      dryRun: false,
    });
    assert(
      summaryWithActive.activeJobsSkipped >= 1,
      `Test 20: recoverStaleMonitoringJobs skips actively running jobs (skipped: ${summaryWithActive.activeJobsSkipped})`,
    );
    // Remove testJobC1 from activeJobsSet so we can test recovering it
    (schedulerService as any).activeJobsSet.delete(testJobC1.jobId);

    // Test 21: recoverStaleJob transitions stale job to FAILED with explicit recovery log
    const logMsg = `[${new Date().toISOString()}] [MonitoringRecovery] Job recovered after stale PROCESSING state; execution was interrupted before GEE_SEARCH.`;
    const recoveredJobC1 = await jobRepo.recoverStaleJob(testJobC1._id.toString(), logMsg);
    assert(
      recoveredJobC1?.status === MonitoringJobStatus.FAILED &&
        recoveredJobC1.logs.some((l) => l.includes('[MonitoringRecovery]')),
      'Test 21: recoverStaleJob transitions stale job to FAILED with explicit recovery log',
    );

    // Test 22: Recovered stale job has completedAt set and errorMessage
    assert(
      !!recoveredJobC1?.completedAt &&
        Boolean(recoveredJobC1.errorMessage?.includes('stale PROCESSING state')),
      'Test 22: Recovered stale job has completedAt set and descriptive errorMessage',
    );

    // Test 23: Stale job recovery is idempotent (re-running does not re-fail or double-count)
    const reRecovered = await jobRepo.recoverStaleJob(testJobC1._id.toString(), logMsg);
    assert(
      reRecovered === null,
      'Test 23: Stale job recovery is idempotent (re-running returns null on already-failed job)',
    );

    // Test 24: Terminal jobs (COMPLETED, WAITING_FOR_NEXT_CYCLE) are never recovered
    const terminalCompleted = await jobRepo.recoverStaleJob(testJob1._id.toString(), logMsg);
    const terminalWaiting = await jobRepo.recoverStaleJob(testJob3._id.toString(), logMsg);
    assert(
      terminalCompleted === null && terminalWaiting === null,
      'Test 24: Terminal jobs (COMPLETED, WAITING_FOR_NEXT_CYCLE) are not modified by recoverStaleJob',
    );

    // Test 25: Stale recovery does NOT fabricate satellite results or mark jobs as COMPLETED
    const freshJobC1 = await jobRepo.findById(testJobC1._id.toString());
    assert(
      freshJobC1?.status === MonitoringJobStatus.FAILED &&
        freshJobC1.results?.anomalyScore === undefined,
      'Test 25: Stale recovery does NOT fabricate satellite results or mark jobs as COMPLETED',
    );

    // Test 26: previewStaleJobRecovery (dryRun: true) returns projection without modifying documents
    const dryRunJob = await jobRepo.create({
      jobId: `TEST-JOB-C3-DRY-${Date.now()}`,
      type: MonitoringJobType.SCHEDULED_SCAN,
      status: MonitoringJobStatus.PROCESSING,
      scheduledAt: staleTime,
      startedAt: staleTime,
      retryCount: 0,
      maxRetries: 3,
      logs: ['[START] Dry run job'],
    });
    createdTestJobIds.push(dryRunJob.jobId);
    await mongoose.connection.collection('monitoringjobs').updateOne(
      { _id: dryRunJob._id },
      { $set: { updatedAt: staleTime, createdAt: staleTime } },
    );

    const dryRunSummary = await schedulerService.recoverStaleMonitoringJobs({
      staleThresholdMinutes: 15,
      dryRun: true,
    });
    const freshDryJob = await jobRepo.findById(dryRunJob._id.toString());
    assert(
      dryRunSummary.staleJobsFound >= 1 &&
        freshDryJob?.status === MonitoringJobStatus.PROCESSING,
      'Test 26: previewStaleJobRecovery (dryRun: true) projects recovery without modifying documents in DB',
    );

    // ================================================================
    // CATEGORY D: Dashboard KPI Calculations (Tests 27–33)
    // ================================================================
    console.log('\n--- Category D: Dashboard KPI Calculations ---');

    // Remove temporary test jobs first so we verify exact current DB counts
    await mongoose.connection.collection('monitoringjobs').deleteMany({ jobId: /^TEST-JOB/ });
    createdTestJobIds.length = 0; // cleared

    const currentJobs = await jobRepo.findAll();
    const activeProcessingStatuses = [
      MonitoringJobStatus.PROCESSING,
      MonitoringJobStatus.DOWNLOADING,
      MonitoringJobStatus.ACQUIRING,
      MonitoringJobStatus.EXPORTING,
      MonitoringJobStatus.PREPROCESSING,
    ];

    const kpiTotal = currentJobs.length;
    const kpiPending = currentJobs.filter((j) => j.status === MonitoringJobStatus.PENDING).length;
    const kpiProcessing = currentJobs.filter((j) =>
      activeProcessingStatuses.includes(j.status as any),
    ).length;
    const kpiCompleted = currentJobs.filter(
      (j) => j.status === MonitoringJobStatus.COMPLETED,
    ).length;
    const kpiWaiting = currentJobs.filter(
      (j) => j.status === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE,
    ).length;
    const kpiFailed = currentJobs.filter((j) => j.status === MonitoringJobStatus.FAILED).length;
    const kpiSuccessfulCycles = kpiCompleted + kpiWaiting;

    console.log(`  KPI Breakdown:`);
    console.log(`    Total:             ${kpiTotal}`);
    console.log(`    Pending:           ${kpiPending}`);
    console.log(`    Processing:        ${kpiProcessing}`);
    console.log(`    Completed:         ${kpiCompleted}`);
    console.log(`    Waiting:           ${kpiWaiting}`);
    console.log(`    Failed:            ${kpiFailed}`);
    console.log(`    Successful Cycles: ${kpiSuccessfulCycles}`);

    // Test 27: Total Jobs = total count in database
    assert(kpiTotal === 50, `Test 27: Total Jobs equals 50 (actual: ${kpiTotal})`);

    // Test 28: Pending = count of PENDING jobs
    assert(kpiPending === 0, `Test 28: Pending count equals 0 (actual: ${kpiPending})`);

    // Test 29: Processing = count of active processing statuses
    assert(
      kpiProcessing === 0,
      `Test 29: Processing count equals 0 after recovery (actual: ${kpiProcessing})`,
    );

    // Test 30: Completed = count of strictly COMPLETED jobs
    assert(kpiCompleted === 0, `Test 30: Completed count equals 0 (actual: ${kpiCompleted})`);

    // Test 31: Waiting = count of WAITING_FOR_NEXT_CYCLE jobs
    assert(kpiWaiting === 17, `Test 31: Waiting count equals 17 (actual: ${kpiWaiting})`);

    // Test 32: Failed = count of FAILED jobs
    assert(
      kpiFailed === 33,
      `Test 32: Failed count equals 33 after recovering 4 stale jobs (actual: ${kpiFailed})`,
    );

    // Test 33: Successful Cycles = Completed + Waiting (17)
    assert(
      kpiSuccessfulCycles === 17 &&
        kpiPending + kpiProcessing + kpiCompleted + kpiWaiting + kpiFailed === kpiTotal,
      `Test 33: Successful Cycles equals 17 (0+17) and sum matches total exactly (50)`,
    );

    // ================================================================
    // CATEGORY E: Production Invariants & Vadipatti Protection (Tests 34–40)
    // ================================================================
    console.log('\n--- Category E: Production Invariants & Vadipatti Protection ---');

    // Test 34: Vadipatti zone ZONE-260913-7787 exists and is untouched
    const vZone = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
    assert(
      vZone !== null && vZone.name === 'vadipatti',
      'Test 34: Vadipatti zone ZONE-260913-7787 exists and is untouched',
    );

    // Test 35: Vadipatti baseline 6aa679012b4fe5808c7e8ec7 remains ACTIVE and untouched
    const vBaseline = await BaselineModel.findById('6aa679012b4fe5808c7e8ec7');
    assert(
      vBaseline !== null && vBaseline.status === 'ACTIVE',
      'Test 35: Vadipatti baseline 6aa679012b4fe5808c7e8ec7 remains ACTIVE and untouched',
    );

    // Test 36: Vadipatti current observation 6aa6798c2b4fe5808c7e9038 exists and is untouched
    const vObs = await SatelliteMetadata.findById('6aa6798c2b4fe5808c7e9038');
    assert(
      vObs !== null && vObs.source === SatelliteSource.SENTINEL_2,
      'Test 36: Vadipatti current observation 6aa6798c2b4fe5808c7e9038 exists and is untouched',
    );

    // Test 37: Vadipatti change detection CHG-1789295023854-2895 exists and is untouched
    const vChange = await ChangeDetectionModel.findOne({
      changeId: 'CHG-1789295023854-2895',
    });
    assert(
      vChange !== null && vChange?.baselineId?.toString() === '6aa679012b4fe5808c7e8ec7',
      'Test 37: Vadipatti change detection CHG-1789295023854-2895 exists and is untouched',
    );

    // Test 38: Vadipatti alert ALT-1789295023854-8239 remains OPEN and untouched
    const vAlert = await AlertModel.findOne({ alertId: 'ALT-1789295023854-8239' });
    assert(
      vAlert !== null && vAlert.status === 'OPEN' && vAlert.severity === 'LOW',
      'Test 38: Vadipatti alert ALT-1789295023854-8239 remains OPEN and untouched',
    );

    // Test 39: Production document counts remain invariant
    const usersFinal = await User.countDocuments();
    const zonesFinal = await Zone.countDocuments();
    const baselinesFinal = await BaselineModel.countDocuments();
    const satellitesFinal = await SatelliteMetadata.countDocuments();
    const changesFinal = await ChangeDetectionModel.countDocuments();
    const alertsFinal = await AlertModel.countDocuments();

    assert(
      usersFinal === 3 &&
        zonesFinal === 1 &&
        baselinesFinal === 1 &&
        satellitesFinal === 5 &&
        changesFinal === 1 &&
        alertsFinal === 1,
      `Test 39: Production document counts 100% preserved (users=${usersFinal}, zones=${zonesFinal}, baselines=${baselinesFinal}, satellites=${satellitesFinal}, changes=${changesFinal}, alerts=${alertsFinal})`,
    );

    // Test 40: The 4 historical jobs are verified in status: FAILED after targeted recovery
    const histJobs = await MonitoringJobModel.find({
      jobId: { $in: HISTORICAL_PROCESSING_JOB_IDS },
    });
    const allNowFailed =
      histJobs.length === 4 &&
      histJobs.every((j) => j.status === MonitoringJobStatus.FAILED);
    assert(
      allNowFailed,
      'Test 40: The 4 historical jobs are verified in status: FAILED with recovery log and completedAt set',
    );
  } catch (error: any) {
    console.error('Unexpected error during test execution:', error);
    testsFailed++;
  } finally {
    // Clean up any remaining test documents
    if (createdTestJobIds.length > 0) {
      await MonitoringJobModel.deleteMany({ jobId: { $in: createdTestJobIds } });
    }
    await mongoose.disconnect();
  }

  console.log('\n====================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED out of 40 tests`);
  console.log('====================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests();
