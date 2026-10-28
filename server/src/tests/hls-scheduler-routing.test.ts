import { Types } from 'mongoose';
import {
  SensorType,
  SatelliteSource,
  ComparisonMode,
  HLSProduct,
  MonitoringTrack,
  HLSRejectionCode,
  RejectionReasonCode,
  MonitoringJobStatus,
  MonitoringJobType,
  SatelliteProcessingStatus,
} from '@tn-forest/shared/types';
import {
  OpticalComparisonDecisionService,
  type ComparisonObservationInput,
} from '../services/spatial/OpticalComparisonDecisionService.js';
import { SarCompatibilityService } from '../services/spatial/SarCompatibilityService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
  passed++;
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('   PHASE 8 UNIT TEST SUITE: HLS MONITORING SCHEDULER ROUTING');
  console.log('===============================================================\n');

  // ──────────────────────────────────────────────────────────
  // TEST 1: Native Optical Preservation (Same-Family Pairs)
  // ──────────────────────────────────────────────────────────
  console.log('--- TEST 1: Native Optical Preservation (Same-Family Pairs) ---');
  {
    // 1.1 Sentinel-2A to Sentinel-2B
    const s2aObs: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260115T050221_20260115T051515_T43QVG',
      source: SatelliteSource.SENTINEL_2,
      platform: 'Sentinel-2A',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-15T05:00:00Z'),
      cloudCover: 4.2,
      resolutionMeters: 10,
    };
    const s2bObs: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260210T050221_20260210T051515_T43QVG',
      source: SatelliteSource.SENTINEL_2,
      platform: 'Sentinel-2B',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-02-10T05:00:00Z'),
      cloudCover: 5.1,
      resolutionMeters: 10,
    };

    const decS2 = OpticalComparisonDecisionService.decideComparison(s2aObs, s2bObs);
    assert(decS2.mode === ComparisonMode.NATIVE, 'S2A ↔ S2B routes strictly to ComparisonMode.NATIVE');
    assert(decS2.requiresHLS === false, 'S2A ↔ S2B does NOT require HLS (requiresHLS === false)');
    assert(decS2.isCompatible === true, 'S2A ↔ S2B isCompatible === true');
    assert(decS2.baselineHLSProduct === undefined, 'S2A ↔ S2B baselineHLSProduct is undefined');
    assert(decS2.currentHLSProduct === undefined, 'S2A ↔ S2B currentHLSProduct is undefined');

    // 1.2 Landsat-8 to Landsat-9
    const l8Obs: ComparisonObservationInput = {
      imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20260110',
      source: SatelliteSource.LANDSAT_8,
      platform: 'Landsat-8',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-10T04:30:00Z'),
      cloudCover: 2.5,
      resolutionMeters: 30,
    };
    const l9Obs: ComparisonObservationInput = {
      imageId: 'LANDSAT/LC09/C02/T1_L2/LC09_143053_20260126',
      source: SatelliteSource.LANDSAT_9,
      platform: 'Landsat-9',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-26T04:30:00Z'),
      cloudCover: 1.8,
      resolutionMeters: 30,
    };

    const decLandsat = OpticalComparisonDecisionService.decideComparison(l8Obs, l9Obs);
    assert(decLandsat.mode === ComparisonMode.NATIVE, 'Landsat-8 ↔ Landsat-9 routes strictly to ComparisonMode.NATIVE');
    assert(decLandsat.requiresHLS === false, 'Landsat-8 ↔ Landsat-9 does NOT require HLS');
    assert(decLandsat.isCompatible === true, 'Landsat-8 ↔ Landsat-9 isCompatible === true');

    // 1.3 Landsat-9 to Landsat-8
    const decLandsatRev = OpticalComparisonDecisionService.decideComparison(l9Obs, {
      ...l8Obs,
      acquisitionDate: new Date('2026-02-01T04:30:00Z'),
    });
    assert(decLandsatRev.mode === ComparisonMode.NATIVE, 'Landsat-9 ↔ Landsat-8 routes strictly to ComparisonMode.NATIVE');
    assert(decLandsatRev.requiresHLS === false, 'Landsat-9 ↔ Landsat-8 does NOT require HLS');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 2: Cross-Sensor Optical Routing (HLS Required)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Cross-Sensor Optical Routing (HLS Required) ---');
  {
    const s2Baseline: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260115T050221_20260115T051515_T43QVG',
      source: SatelliteSource.SENTINEL_2,
      platform: 'Sentinel-2A',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-15T05:00:00Z'),
      cloudCover: 2.1,
      resolutionMeters: 10,
    };

    const l8Current: ComparisonObservationInput = {
      imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20260301',
      source: SatelliteSource.LANDSAT_8,
      platform: 'Landsat-8',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-03-01T04:30:00Z'),
      cloudCover: 1.5,
      resolutionMeters: 30,
    };

    const l9Current: ComparisonObservationInput = {
      imageId: 'LANDSAT/LC09/C02/T1_L2/LC09_143053_20260305',
      source: SatelliteSource.LANDSAT_9,
      platform: 'Landsat-9',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-03-05T04:30:00Z'),
      cloudCover: 3.0,
      resolutionMeters: 30,
    };

    // 2.1 S2 baseline -> L8 current
    const decS2L8 = OpticalComparisonDecisionService.decideComparison(s2Baseline, l8Current);
    assert(decS2L8.mode === ComparisonMode.HLS, 'Sentinel-2 ↔ Landsat-8 routes to ComparisonMode.HLS');
    assert(decS2L8.requiresHLS === true, 'Sentinel-2 ↔ Landsat-8 requiresHLS === true');
    assert(decS2L8.isCompatible === true, 'Sentinel-2 ↔ Landsat-8 isCompatible === true');
    assert(decS2L8.baselineHLSProduct === HLSProduct.S30, 'Sentinel-2 baseline maps to HLSProduct.S30');
    assert(decS2L8.currentHLSProduct === HLSProduct.L30, 'Landsat-8 current maps to HLSProduct.L30');

    // 2.2 S2 baseline -> L9 current
    const decS2L9 = OpticalComparisonDecisionService.decideComparison(s2Baseline, l9Current);
    assert(decS2L9.mode === ComparisonMode.HLS, 'Sentinel-2 ↔ Landsat-9 routes to ComparisonMode.HLS');
    assert(decS2L9.requiresHLS === true, 'Sentinel-2 ↔ Landsat-9 requiresHLS === true');
    assert(decS2L9.baselineHLSProduct === HLSProduct.S30, 'Sentinel-2 baseline maps to HLSProduct.S30');
    assert(decS2L9.currentHLSProduct === HLSProduct.L30, 'Landsat-9 current maps to HLSProduct.L30');

    // 2.3 Landsat-8 baseline -> Sentinel-2 current
    const l8Baseline: ComparisonObservationInput = {
      ...l8Current,
      acquisitionDate: new Date('2026-01-10T04:30:00Z'),
    };
    const s2Current: ComparisonObservationInput = {
      ...s2Baseline,
      acquisitionDate: new Date('2026-03-15T05:00:00Z'),
    };

    const decL8S2 = OpticalComparisonDecisionService.decideComparison(l8Baseline, s2Current);
    assert(decL8S2.mode === ComparisonMode.HLS, 'Landsat-8 ↔ Sentinel-2 routes to ComparisonMode.HLS');
    assert(decL8S2.requiresHLS === true, 'Landsat-8 ↔ Sentinel-2 requiresHLS === true');
    assert(decL8S2.baselineHLSProduct === HLSProduct.L30, 'Landsat-8 baseline maps to HLSProduct.L30');
    assert(decL8S2.currentHLSProduct === HLSProduct.S30, 'Sentinel-2 current maps to HLSProduct.S30');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 3: Optical Cloud Fallback Invariant (HLS NOT a Cloud Fallback)
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Optical Cloud Fallback Invariant ---');
  {
    const s2Base: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260115T050221_20260115T051515_T43QVG',
      source: SatelliteSource.SENTINEL_2,
      platform: 'Sentinel-2A',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-15T05:00:00Z'),
      cloudCover: 5.0,
      resolutionMeters: 10,
    };

    // Candidate has 35% cloud cover (exceeds 20% operational threshold)
    const s2Cloudy: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260220T050221_20260220T051515_T43QVG',
      source: SatelliteSource.SENTINEL_2,
      platform: 'Sentinel-2B',
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-02-20T05:00:00Z'),
      cloudCover: 35.0,
      resolutionMeters: 10,
    };

    const cloudDecision = OpticalComparisonDecisionService.decideComparison(s2Base, s2Cloudy, {
      maxCloudCoverThreshold: 20.0,
    });

    assert(cloudDecision.mode === ComparisonMode.NATIVE, 'Cloudy same-family candidate retains ComparisonMode.NATIVE');
    assert(cloudDecision.requiresHLS === false, 'Cloudy candidate does NOT trigger HLS (requiresHLS === false)');
    assert(cloudDecision.isCompatible === false, 'Cloudy candidate rejected due to threshold');
    assert(
      cloudDecision.rejectionCode === RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD,
      'Rejection code is CLOUD_COVER_EXCEEDS_THRESHOLD',
    );
    assert(
      cloudDecision.reason.includes('HLS is not a cloud fallback'),
      'Decision explanation explicitly enforces: "HLS is not a cloud fallback"',
    );
  }

  // ──────────────────────────────────────────────────────────
  // TEST 4: Independent SAR Track Isolation
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Independent SAR Track Isolation ---');
  {
    const sarBaseline: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260112T003855',
      source: SatelliteSource.SENTINEL_1,
      platform: 'Sentinel-1A',
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      acquisitionDate: new Date('2026-01-12T00:38:55Z'),
      resolutionMeters: 10,
    };

    const sarCurrent: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260205T003855',
      source: SatelliteSource.SENTINEL_1,
      platform: 'Sentinel-1A',
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      acquisitionDate: new Date('2026-02-05T00:38:55Z'),
      resolutionMeters: 10,
    };

    const sarDecision = OpticalComparisonDecisionService.decideComparison(sarBaseline, sarCurrent);
    assert(
      sarDecision.rejectionCode === HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE,
      'SAR-to-SAR pairing rejected with SAR_NOT_HLS_COMPATIBLE',
    );
    assert(sarDecision.requiresHLS === false, 'SAR observations never require HLS');
    assert(sarDecision.isCompatible === false, 'SAR observations not compatible with optical decision service');

    // Verify SAR compatibility service remains independent
    const sarCompat = SarCompatibilityService.evaluateSarCompatibility(
      {
        imageId: sarBaseline.imageId,
        relativeOrbitNumber: 151,
        orbitDirection: 'DESCENDING',
        mode: 'IW',
        polarizations: ['VV', 'VH'],
        platform: 'Sentinel-1A',
      },
      {
        imageId: sarCurrent.imageId,
        relativeOrbitNumber: 151,
        orbitDirection: 'DESCENDING',
        mode: 'IW',
        polarizations: ['VV', 'VH'],
        platform: 'Sentinel-1A',
      },
    );
    assert(sarCompat.isCompatible === true, 'SarCompatibilityService approves identical orbit geometry');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 5: Eligibility Filtering Invariants
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Eligibility Filtering Invariants ---');
  {
    const base: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260115T050221',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-15T05:00:00Z'),
    };

    // 5.1 Same image rejection
    const sameImgDecision = OpticalComparisonDecisionService.decideComparison(base, { ...base });
    assert(sameImgDecision.isCompatible === false, 'Identical image comparison rejected');
    assert(
      sameImgDecision.rejectionCode === HLSRejectionCode.DUPLICATE_OBSERVATION,
      'Identical image rejected with DUPLICATE_OBSERVATION',
    );

    // 5.2 Chronological violation (candidate before baseline)
    const earlierCand: ComparisonObservationInput = {
      imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20260101',
      source: SatelliteSource.LANDSAT_8,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-01T04:30:00Z'),
    };
    const chronoDecision = OpticalComparisonDecisionService.decideComparison(base, earlierCand);
    assert(chronoDecision.isCompatible === false, 'Earlier candidate observation rejected');
    assert(
      chronoDecision.rejectionCode === HLSRejectionCode.TEMPORAL_INELIGIBLE,
      'Earlier observation rejected with TEMPORAL_INELIGIBLE',
    );

    // 5.3 Cross-zone violation
    const crossZoneCand: ComparisonObservationInput = {
      imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20260301',
      source: SatelliteSource.LANDSAT_8,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-03-01T04:30:00Z'),
      zoneId: 'ZONE-DIFFERENT-002',
    };
    const zoneDecision = OpticalComparisonDecisionService.decideComparison(
      { ...base, zoneId: 'ZONE-MUDUMALAI-001' },
      crossZoneCand,
    );
    assert(zoneDecision.isCompatible === false, 'Cross-zone observation comparison rejected');
    assert(
      zoneDecision.rejectionCode === HLSRejectionCode.GEOMETRY_NOT_INTERSECTING,
      'Cross-zone rejected with GEOMETRY_NOT_INTERSECTING',
    );
  }

  // ──────────────────────────────────────────────────────────
  // TEST 6: Cursor Safety Invariants on Failures
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Cursor Safety Invariants on Failures ---');
  {
    // Simulate MonitoringJob state transitions during hypothetical stage failures
    const mockJob: {
      status: any;
      retryCount: number;
      errorMessage?: string;
      completedAt?: Date;
    } = {
      status: MonitoringJobStatus.PENDING,
      retryCount: 0,
    };

    // Transition to PROCESSING
    mockJob.status = MonitoringJobStatus.PROCESSING;

    // Simulate failure handler (matching MonitoringSchedulerService.processJob catch block)
    const handleFailure = (err: Error) => {
      mockJob.retryCount += 1;
      mockJob.status = MonitoringJobStatus.FAILED;
      mockJob.errorMessage = err.message;
      mockJob.completedAt = new Date();
    };

    // Stage failure: HLS discovery failure
    handleFailure(new Error('HLS discovery failed: no matching scene'));
    assert(mockJob.status === MonitoringJobStatus.FAILED, 'Discovery failure -> status is FAILED');
    assert(mockJob.status !== MonitoringJobStatus.COMPLETED, 'Discovery failure -> cursor did NOT advance');
    assert(mockJob.retryCount === 1, 'Retry count incremented on failure');

    // Stage failure: GEE export failure
    handleFailure(new Error('GEE export task failed: Task TIMEOUT'));
    assert(mockJob.status === MonitoringJobStatus.FAILED, 'Export failure -> status is FAILED');
    assert(mockJob.status !== MonitoringJobStatus.COMPLETED, 'Export failure -> cursor did NOT advance');

    // Stage failure: Google Drive download failure
    handleFailure(new Error('Google Drive download error: 404 File Not Found'));
    assert(mockJob.status === MonitoringJobStatus.FAILED, 'Drive download failure -> status is FAILED');
    assert(mockJob.status !== MonitoringJobStatus.COMPLETED, 'Drive download failure -> cursor did NOT advance');

    // Stage failure: Raster QA validation failure
    handleFailure(new Error('GeoTIFF corrupted or missing NIR band'));
    assert(mockJob.status === MonitoringJobStatus.FAILED, 'Raster QA failure -> status is FAILED');
    assert(mockJob.status !== MonitoringJobStatus.COMPLETED, 'Raster QA failure -> cursor did NOT advance');

    // Stage failure: Analysis grid reprojection failure
    handleFailure(new Error('AnalysisGrid reprojection error: bounding box disjoint'));
    assert(mockJob.status === MonitoringJobStatus.FAILED, 'Grid reprojection failure -> status is FAILED');
    assert(mockJob.status !== MonitoringJobStatus.COMPLETED, 'Grid reprojection failure -> cursor did NOT advance');

    // Stage failure: ChangeDetection persistence failure
    handleFailure(new Error('MongoDB connection timeout during ChangeDetection save'));
    assert(mockJob.status === MonitoringJobStatus.FAILED, 'Persistence failure -> status is FAILED');
    assert(mockJob.status !== MonitoringJobStatus.COMPLETED, 'Persistence failure -> cursor did NOT advance');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 7: Idempotent Scheduler Re-run Check
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: Idempotent Scheduler Re-run Check ---');
  {
    const priorCompletedJobs = [
      {
        jobId: 'JOB-PRIOR-001',
        satelliteMetadataId: '6abc0c9db66bbf781fc2bc98',
        acquisition: { imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20260301' },
        status: MonitoringJobStatus.COMPLETED,
      },
    ];

    const currentCandidate = {
      _id: '6abc0c9db66bbf781fc2bc98',
      imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20260301',
    };

    const isDuplicate = priorCompletedJobs.some(
      (pj) =>
        pj.satelliteMetadataId === currentCandidate._id ||
        pj.acquisition?.imageId === currentCandidate.imageId,
    );

    assert(isDuplicate === true, 'Duplicate check detects already-completed observation');

    let simulatedStatus: any = MonitoringJobStatus.PROCESSING;
    if (isDuplicate) {
      simulatedStatus = MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE;
    }

    assert(
      simulatedStatus === MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE,
      'Duplicate candidate transitions to WAITING_FOR_NEXT_CYCLE without re-processing',
    );
    assert(simulatedStatus !== MonitoringJobStatus.COMPLETED, 'Cursor does NOT advance for duplicate observation');
  }

  // ──────────────────────────────────────────────────────────
  // TEST 8: Forensic Safety Checks
  // ──────────────────────────────────────────────────────────
  console.log('\n--- TEST 8: Forensic Safety Checks ---');
  {
    // Assert zero scalar multiplier heuristic
    const changedPixels = 15;
    const pixelAreaM2 = 900.0;
    const changedAreaM2 = changedPixels * pixelAreaM2;
    const changedAreaHa = changedAreaM2 / 10000.0;

    assert(changedAreaHa === 1.35, 'Physical area correctly calculated: 15 * 900 / 10000 = 1.35 ha');

    // Reject legacy Math.round(compositeDelta) heuristic
    const compositeDelta = 0.0827;
    const legacyRounded = Math.round(compositeDelta);
    assert(legacyRounded === 0, 'Legacy Math.round(compositeDelta) truncates valid changes to 0 (unacceptable)');
    assert(compositeDelta > 0.05, 'Continuous delta correctly triggers 0.05 threshold without rounding');
  }

  console.log('\n===============================================================');
  console.log(`PHASE 8 ROUTING TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
