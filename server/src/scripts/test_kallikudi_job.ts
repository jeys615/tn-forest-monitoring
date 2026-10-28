import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { MonitoringSchedulerService } from '../services/MonitoringSchedulerService.js';
import { MonitoringJobType, MonitoringJobStatus, SensorType, SatelliteSource } from '@tn-forest/shared/types';

async function main() {
  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected to MongoDB:', env.MONGODB_URI);

  const zone = await Zone.findOne({ name: 'Kallikudi Quarry Change Detection Test Zone' });
  if (!zone) {
    console.error('❌ Zone "Kallikudi Quarry Change Detection Test Zone" not found.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`📍 Found Zone: ${zone.name} (ID: ${zone._id}, Code: ${zone.zoneId})`);

  const monitoringService = new MonitoringSchedulerService();

  console.log('\n--- 1. Creating Monitoring Job ---');
  const job = await MonitoringJobModel.create({
    jobId: `JOB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    type: MonitoringJobType.TARGETED_ACQUISITION,
    zoneId: zone._id,
    sensorType: SensorType.OPTICAL,
    source: SatelliteSource.SENTINEL_2,
    status: MonitoringJobStatus.PENDING,
    scheduledAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
    logs: [`[${new Date().toISOString()}] Job created via test runner`],
  });

  console.log(`✅ Job Created: ${job.jobId} (ID: ${job._id})`);
  console.log(`Initial Status: ${job.status}`);

  console.log('\n--- 2. Processing Monitoring Job ---');
  const processedJob = await monitoringService.processJob(job._id.toString());

  console.log(`\n✅ Processing Finished! Final Status: ${processedJob.status}`);

  console.log('\n--- 3. Fetching Fresh Job Document from MongoDB ---');
  const freshJob = await MonitoringJobModel.findById(job._id);
  if (!freshJob) {
    console.error('❌ Failed to reload job from MongoDB');
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`COMPLETE JOB LOGS FROM MONGODB (${freshJob.logs.length} lines)`);
  console.log(`==================================================\n`);

  freshJob.logs.forEach((logLine, idx) => {
    console.log(`${(idx + 1).toString().padStart(2, '0')} | ${logLine}`);
  });

  console.log(`\n==================================================`);
  console.log(`SCIENTIFIC TRACEABILITY & STRUCTURED LOG AUDIT`);
  console.log(`==================================================`);

  const logsText = freshJob.logs.join('\n');

  const checkItem = (question: string, pattern: RegExp | string) => {
    const passed = typeof pattern === 'string' ? logsText.includes(pattern) : pattern.test(logsText);
    console.log(`${passed ? '✅' : '❌'} ${question}`);
    return passed;
  };

  const results = [
    checkItem('1. [START] Concise job execution header & schedule delay', /\[START\] Job ID: JOB-/),
    checkItem('2. [ZONE_VALIDATION] Authoritative geodesic area calculation', /\[ZONE_VALIDATION\] Area Calculation Method: Geodesic Spherical Excess/),
    checkItem('3. [BASELINE_LOOKUP] & [BASELINE_FOUND] Active baseline identified', /\[BASELINE_FOUND\] Baseline Image ID: COPERNICUS\/S2_SR_HARMONIZED\//),
    checkItem('4. [CURRENT_IMAGE_LOOKUP] & [CURRENT_IMAGE_FOUND] Current observation identified', /\[CURRENT_IMAGE_FOUND\] Current Image ID: COPERNICUS\/S2_SR_HARMONIZED\//),
    checkItem('5. [CANDIDATE_SELECTION] Candidates and selection rule logged', /\[CANDIDATE_SELECTION\] Candidate Count:/),
    checkItem('6. [COMPARISON_VALIDATION] Temporal & Spatial validity confirmed', /\[COMPARISON_VALIDATION\] Validation Result: PASS/),
    checkItem('7. [IMAGE_COMPARISON] Baseline vs Current comparison summary', /\[IMAGE_COMPARISON\] Temporal Difference:/),
    checkItem('8. [GEE_EXPORT_REQUEST] / [GEE_REQUEST] Truthful export/mode & valid pixels', /\[GEE_EXPORT_REQUEST\]|\[GEE_REQUEST\]/),
    checkItem('9. [RASTER_VALIDATION] / [LOCAL_PROCESSING_START] Raster processing mode logged', /\[RASTER_VALIDATION\]|\[LOCAL_PROCESSING_START\]/),
    checkItem('10. [M5_START] & [M5_RESULTS] Baseline vs Current spectral indices & deltas', /\[M5_RESULTS\]\s+ΔNDVI:/),
    checkItem('11. [M6_START] & [M6_PIXEL_ANALYSIS] Pixel evaluation (valid, 10 changed)', /\[M6_PIXEL_ANALYSIS\] Changed pixels: 10/),
    checkItem('12. [M6_VALIDATION] Pixel Accounting Check invariant verified', /\[M6_VALIDATION\] Pixel Accounting Check: PASS/),
    checkItem('13. [M6_AREA_ANALYSIS] Affected Area 1000.00 m² (0.1000 ha) and ~0.682%', /\[M6_AREA_ANALYSIS\] Affected Area Percentage: 0\.68/),
    checkItem('14. [M6_EVIDENCE] Deterministic multi-criteria evidence breakdown logged', /\[M6_EVIDENCE\] Final Evidence Score: (41|50)\/100/),
    checkItem('15. [ANOMALY_EVALUATION] Evidence score 41/100 & Operational threshold 2.00%', /\[ANOMALY_EVALUATION\] Evidence Score: (41|50)\/100/),
    checkItem('16. [ALERT_DECISION] Threshold crossed FALSE & Decision NO ALERT', /\[ALERT_DECISION\] Decision: NO ALERT/),
    checkItem('17. [PERSISTENCE_START] & [PERSISTENCE_SUCCESS] MongoDB persistence verified', /\[PERSISTENCE_SUCCESS\] ChangeDetectionResult Saved: TRUE/),
    checkItem('18. [PERSISTENCE_VALIDATION] Stored values match calculated results', /\[PERSISTENCE_VALIDATION\] Stored affectedAreaPercentage/),
    checkItem('19. [PERFORMANCE] High-precision wall-clock timing profile breakdown', /\[PERFORMANCE\] Total Wall-Clock Duration:/),
    checkItem('20. [SUMMARY] Final structured markdown/plain summary matching template', /\[SUMMARY\] MONITORING JOB FINAL SUMMARY/),
    checkItem('21. Consistent [TIMESTAMP] [MODULE] [JOB-ID] [STAGE] prefix', /\[\d{4}-\d{2}-\d{2}T.*\] \[MonitoringScheduler\] \[JOB-[A-Z0-9]+\] \[[A-Z_]+\]/),
    (() => {
      const hasDiagnostics = Boolean(freshJob.diagnostics && typeof freshJob.diagnostics === 'object');
      console.log(`${hasDiagnostics ? '✅' : '❌'} 22. Structured diagnostics JSON saved on job`);
      return hasDiagnostics;
    })(),
    (() => {
      const r = freshJob.results;
      const pass = Boolean(
        r &&
        r.affectedAreaPercentage !== undefined &&
        Math.abs(r.affectedAreaPercentage - 0.682) < 0.05 &&
        (r.evidenceScore === 41 || r.evidenceScore === 50) &&
        r.ndviMean !== undefined &&
        r.severity === 'NONE' &&
        r.affectedAreaM2 === 1000
      );
      console.log(`${pass ? '✅' : '❌'} 23. Results document consistency in MongoDB (affectedArea: ${r?.affectedAreaPercentage}%, evidence: ${r?.evidenceScore}/100, NDVI: ${r?.ndviMean}, severity: ${r?.severity}, areaM2: ${r?.affectedAreaM2} m²)`);
      return pass;
    })(),
  ];

  const allPassed = results.every(Boolean);
  console.log(`\nAudit Result: ${allPassed ? 'ALL AUDIT CHECKS PASSED ✅' : 'SOME AUDIT CHECKS FAILED ❌'}`);

  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
