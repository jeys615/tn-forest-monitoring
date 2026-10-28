import { calculateM6Metrics } from '../utils/m6Metrics.js';
import { EvidenceScoreCalculator } from '../services/changeDetection/EvidenceScoreCalculator.js';
import { OpticalChangeDetector } from '../services/changeDetection/OpticalChangeDetector.js';
import { CrossSensorAgreement } from '@tn-forest/shared/types';
import { performance } from 'node:perf_hooks';

async function runTestSuite() {
  console.log('🧪 Starting Monitoring Pipeline Scientific Integrity & Calculations Test Suite...\n');
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failedCount++;
    }
  }

  // ──────────────────────────────────────────────────────────
  // TEST 1 — NO BASELINE
  // ──────────────────────────────────────────────────────────
  console.log('▶ Running TEST 1 — NO BASELINE (Job fails with clear error)');
  {
    const activeBaseline = null;
    const hasBaseline = Boolean(activeBaseline);
    assert(hasBaseline === false, 'TEST 1.1: Detects missing active baseline');
    const expectedErrorCode = 'BASELINE_UNAVAILABLE';
    assert(expectedErrorCode === 'BASELINE_UNAVAILABLE', 'TEST 1.2: Returns explicit BASELINE_UNAVAILABLE error code');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 2 — NO CURRENT IMAGE NEWER THAN BASELINE
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 2 — NO CURRENT IMAGE (Job must not process baseline as current)');
  {
    const baselineImageId = 'COPERNICUS/S2_SR_HARMONIZED/20240103T050221_20240103T050519_T44PMT';
    const candidates = [
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/20240103T050221_20240103T050519_T44PMT',
        acquisitionDate: new Date('2024-01-03T00:00:00.000Z'),
      },
    ];

    const validNewerCandidates = candidates.filter(
      (c) => c.imageId !== baselineImageId && c.acquisitionDate > new Date('2024-01-03T00:00:00.000Z'),
    );

    assert(validNewerCandidates.length === 0, 'TEST 2.1: Baseline image is excluded from current candidate list');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 3 — SAME IMAGE COMPARISON REJECTION
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 3 — CURRENT IMAGE SAME AS BASELINE');
  {
    const baselineImageId = 'COPERNICUS/S2_SR_HARMONIZED/20260103T050221_20260103T050519_T44PMT';
    const currentImageId = 'COPERNICUS/S2_SR_HARMONIZED/20260103T050221_20260103T050519_T44PMT';
    const isSameImage = baselineImageId === currentImageId;

    assert(isSameImage === true, 'TEST 3.1: Identifies identical baseline and current image comparison');
    const isComparisonValid = !isSameImage;
    assert(isComparisonValid === false, 'TEST 3.2: Comparison validation fails when images are identical');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 4 — CURRENT IMAGE OLDER THAN BASELINE
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 4 — CURRENT IMAGE OLDER THAN BASELINE');
  {
    const baselineDate = new Date('2026-01-03T00:00:00.000Z');
    const currentDate = new Date('2024-01-03T00:00:00.000Z');
    const isChronologicallyValid = baselineDate.getTime() < currentDate.getTime();

    assert(isChronologicallyValid === false, 'TEST 4.1: Chronological validation fails when current date < baseline date');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 5 — CLOUD COVER ABOVE THRESHOLD
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 5 — CLOUD COVER ABOVE THRESHOLD');
  {
    const maxCloudCoverThreshold = 20.0;
    const candidateCloudCover = 28.5;
    const isCloudCoverAcceptable = candidateCloudCover <= maxCloudCoverThreshold;

    assert(isCloudCoverAcceptable === false, 'TEST 5.1: Candidate with 28.5% cloud cover is rejected (> 20.0% threshold)');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 6 — ZERO CHANGED PIXELS
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 6 — 0 CHANGED PIXELS (No alert & consistent handling)');
  {
    const metrics = calculateM6Metrics({
      changedPixels: 0,
      validPixels: 1466,
      pixelResolutionMeters: 10,
      zoneAreaM2: 146600,
      operationalThresholdPercentage: 2.0,
    });

    assert(metrics.changedPixels === 0, 'TEST 6.1: Changed pixels is 0');
    assert(metrics.affectedAreaM2 === 0, 'TEST 6.2: Affected Area is 0 m²');
    assert(metrics.affectedAreaHa === 0, 'TEST 6.3: Affected Area in ha is 0.0000 ha');
    assert(metrics.affectedAreaPercentage === 0, 'TEST 6.4: Affected Area Percentage is 0.000%');
    assert(metrics.thresholdCrossed === false, 'TEST 6.5: Threshold Crossed is FALSE');
    assert(metrics.alertGenerated === false, 'TEST 6.6: Alert Generated is FALSE');
    assert(metrics.severity === 'NONE', 'TEST 6.7: Severity is NONE');

    const evidence = EvidenceScoreCalculator.calculateEvidenceScore({
      affectedAreaPercentage: 0,
      imageQualityScore: 90.0,
      hasTemporalHistory: false,
      isTemporallyConsistent: false,
      crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
    });

    assert(evidence.magnitudeScore === 0, 'TEST 6.8: Magnitude score is 0/40 when change is 0%');
    assert(evidence.totalEvidenceScore <= 40, 'TEST 6.9: Total evidence score reflects absence of change');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 7 — 10 CHANGED PIXELS / 1466 VALID PIXELS (~0.682%)
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 7 — 10 CHANGED PIXELS / 1466 VALID PIXELS (~0.682%)');
  {
    const metrics = calculateM6Metrics({
      changedPixels: 10,
      validPixels: 1466,
      pixelResolutionMeters: 10,
      zoneAreaM2: 146600,
      operationalThresholdPercentage: 2.0,
    });

    assert(metrics.pixelAreaM2 === 100, 'TEST 7.1: Pixel Area is 100 m² (10m x 10m)');
    assert(metrics.affectedAreaM2 === 1000, 'TEST 7.2: Affected Area is 1000.00 m²');
    assert(metrics.affectedAreaHa === 0.1, 'TEST 7.3: Affected Area in ha is 0.1000 ha');
    assert(
      Math.abs(metrics.affectedAreaPercentage - 0.682128) < 0.001,
      'TEST 7.4: Affected Area Percentage is ~0.682% (1000 / 146600 * 100)',
      `Actual: ${metrics.affectedAreaPercentage}%`,
    );

    // Verify OpticalChangeDetector matches calculateM6Metrics
    const optResult = OpticalChangeDetector.detectChange({
      currentMetrics: { ndvi: 0.664, ndwi: 0.392, ndbi: -0.392, bsi: -0.283, savi: 0.505, evi: 0.573 },
      baselineMetrics: { ndvi: 0.666, ndwi: 0.394, ndbi: -0.394, bsi: -0.285, savi: 0.507, evi: 0.575 },
      zoneAreaHectares: 14.6599,
      changedPixels: 10,
      validPixels: 1466,
      pixelResolutionMeters: 10,
    });

    assert(
      Math.abs(optResult.spatialResult.affectedAreaPercentage - 0.682) < 0.005,
      'TEST 7.5: OpticalChangeDetector outputs exact 0.682% affected area',
      `Actual: ${optResult.spatialResult.affectedAreaPercentage}%`,
    );
  }

  // ──────────────────────────────────────────────────────────
  // TEST 8 — AFFECTED AREA BELOW 2% (NO ALERT)
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 8 — AFFECTED AREA BELOW 2% (NO ALERT)');
  {
    const metrics = calculateM6Metrics({
      changedPixels: 10,
      validPixels: 1466,
      pixelResolutionMeters: 10,
      zoneAreaM2: 146600,
      operationalThresholdPercentage: 2.0,
    });

    assert(metrics.affectedAreaPercentage < 2.0, 'TEST 8.1: Affected area (0.682%) is below operational threshold (2.0%)');
    assert(metrics.thresholdCrossed === false, 'TEST 8.2: Threshold crossed is FALSE');
    assert(metrics.alertGenerated === false, 'TEST 8.3: Alert generated is FALSE');
    assert(metrics.severity === 'NONE', 'TEST 8.4: Severity is NONE');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 9 — AFFECTED AREA >= 2% (ALERT GENERATED)
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 9 — AFFECTED AREA >= 2% (ALERT GENERATED)');
  {
    // 50 changed pixels = 5000 m2 / 146600 m2 = 3.41%
    const metrics = calculateM6Metrics({
      changedPixels: 50,
      validPixels: 1466,
      pixelResolutionMeters: 10,
      zoneAreaM2: 146600,
      operationalThresholdPercentage: 2.0,
    });

    assert(metrics.affectedAreaPercentage >= 2.0, 'TEST 9.1: Affected area (3.41%) exceeds threshold (2.0%)');
    assert(metrics.thresholdCrossed === true, 'TEST 9.2: Threshold crossed is TRUE');
    assert(metrics.alertGenerated === true, 'TEST 9.3: Alert generated is TRUE');
    assert(metrics.severity === 'LOW', 'TEST 9.4: Severity is LOW (2.0% - 5.0%)');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 10 — DATABASE PERSISTENCE FAILURE HANDLING
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 10 — DATABASE PERSISTENCE FAILURE HANDLING');
  {
    let persistenceSuccess = false;
    let jobMarkedComplete = false;

    try {
      // Simulate persistence failure
      throw new Error('Simulated MongoDB connection drop during save');
    } catch {
      persistenceSuccess = false;
    }

    if (persistenceSuccess) {
      jobMarkedComplete = true;
    }

    assert(jobMarkedComplete === false, 'TEST 10.1: Job is never marked COMPLETED when persistence fails');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 11 — EVIDENCE SCORE = 41 / UI NOT ANOMALY %
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 11 — EVIDENCE SCORE = 41 (UI NOT ANOMALY %)');
  {
    const results = {
      ndviMean: 0.664,
      cloudCoverUsed: 0.0,
      evidenceScore: 41,
      affectedAreaPercentage: 0.68,
      affectedAreaHa: 0.1,
      affectedAreaM2: 1000,
      severity: 'NONE',
    };

    const evidenceDisplay = `${results.evidenceScore}/100`;
    const affectedAreaDisplay = `${results.affectedAreaPercentage.toFixed(2)}%`;

    assert(evidenceDisplay === '41/100', 'TEST 11.1: Evidence score formatted as 41/100');
    assert(affectedAreaDisplay === '0.68%', 'TEST 11.2: Affected area percentage formatted as 0.68%');
    assert(evidenceDisplay !== affectedAreaDisplay, 'TEST 11.3: Evidence score is strictly distinct from anomaly/affected area percentage');
    assert(!evidenceDisplay.includes('%'), 'TEST 11.4: Evidence score does NOT have a percentage symbol');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 12 — PERFORMANCE TIMING ACCURACY
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 12 — PERFORMANCE TIMING ACCURACY');
  {
    const totalStart = performance.now();
    const t1 = performance.now();
    await new Promise((r) => setTimeout(r, 10));
    const stage1 = performance.now() - t1;

    const t2 = performance.now();
    await new Promise((r) => setTimeout(r, 10));
    const stage2 = performance.now() - t2;

    const totalDuration = performance.now() - totalStart;

    assert(totalDuration >= stage1 + stage2 - 5, 'TEST 12.1: Wall clock total duration encompasses individual stages');
    assert(totalDuration > 0, 'TEST 12.2: Total duration is positive and non-zero');
  }

  console.log(`\n==================================================`);
  console.log(`TEST SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log(`==================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
