/**
 * Optical Comparison Decision Service Test Suite (Phase 4)
 *
 * Verifies the deterministic decision service:
 *   - NATIVE cases: same optical sensor family (Sentinel-2, Landsat)
 *   - HLS cases: cross-sensor optical pairing (S2 ↔ Landsat) with S30/L30 product mapping
 *   - SAR rejection: SAR observations strictly rejected from HLS routing
 *   - Geometry rejection: cross-zone and non-intersecting footprints rejected
 *   - Temporal rejection: current older than baseline rejected
 *   - Duplicate rejection: same observation rejected
 *   - Unsupported sensor rejection: DEM/unknown rejected
 *   - Cloud fallback rule: High cloud cover NEVER switches same-family pair to HLS
 */

import {
  ComparisonMode,
  HLSProduct,
  HLSRejectionCode,
  RejectionReasonCode,
  SatelliteSource,
  SensorType,
  MonitoringTrack,
} from '@tn-forest/shared/types';
import { OpticalComparisonDecisionService } from '../services/spatial/OpticalComparisonDecisionService.js';

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

async function runComparisonDecisionTests(): Promise<void> {
  console.log('\n==================================================');
  console.log('OPTICAL COMPARISON DECISION TEST SUITE (PHASE 4)');
  console.log('==================================================\n');

  const baseZone = 'ZONE-001';
  const candZone = 'ZONE-001';
  const baseDate = '2026-01-01T05:00:00.000Z';
  const currDate = '2026-01-15T05:00:00.000Z';

  // ── SECTION 1: NATIVE Optical Cases (Same Family) ──────────────────────────
  console.log('\n▶ Section 1: NATIVE Optical Cases (Same Family)');

  // Test 1: S2A → S2A = NATIVE
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_CURR',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '1. S2A → S2A: mode is NATIVE');
    assert(decision.requiresHLS === false, '1. S2A → S2A: requiresHLS is false');
    assert(decision.isCompatible === true, '1. S2A → S2A: isCompatible is true');
    assert(decision.baselineHLSProduct === undefined, '1. S2A → S2A: baselineHLSProduct is undefined');
    assert(decision.currentHLSProduct === undefined, '1. S2A → S2A: currentHLSProduct is undefined');
  }

  // Test 2: S2A → S2B = NATIVE
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2B_CURR',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2B',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '2. S2A → S2B: mode is NATIVE');
    assert(decision.requiresHLS === false, '2. S2A → S2B: requiresHLS is false');
    assert(decision.isCompatible === true, '2. S2A → S2B: isCompatible is true');
  }

  // Test 3: S2B → S2A = NATIVE
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2B_BASE',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2B',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_CURR',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '3. S2B → S2A: mode is NATIVE');
    assert(decision.requiresHLS === false, '3. S2B → S2A: requiresHLS is false');
    assert(decision.isCompatible === true, '3. S2B → S2A: isCompatible is true');
  }

  // Test 4: L8 → L8 = NATIVE
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_BASE',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_CURR',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '4. L8 → L8: mode is NATIVE');
    assert(decision.requiresHLS === false, '4. L8 → L8: requiresHLS is false');
    assert(decision.isCompatible === true, '4. L8 → L8: isCompatible is true');
  }

  // Test 5: L8 → L9 = NATIVE
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_BASE',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'LANDSAT/LC09/C02/T1_L2/L9_CURR',
        source: SatelliteSource.LANDSAT_9,
        platform: 'Landsat-9',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '5. L8 → L9: mode is NATIVE');
    assert(decision.requiresHLS === false, '5. L8 → L9: requiresHLS is false');
    assert(decision.isCompatible === true, '5. L8 → L9: isCompatible is true');
  }

  // Test 6: L9 → L8 = NATIVE
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'LANDSAT/LC09/C02/T1_L2/L9_BASE',
        source: SatelliteSource.LANDSAT_9,
        platform: 'Landsat-9',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_CURR',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '6. L9 → L8: mode is NATIVE');
    assert(decision.requiresHLS === false, '6. L9 → L8: requiresHLS is false');
    assert(decision.isCompatible === true, '6. L9 → L8: isCompatible is true');
  }

  // Test 7: L9 → L9 = NATIVE
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'LANDSAT/LC09/C02/T1_L2/L9_BASE',
        source: SatelliteSource.LANDSAT_9,
        platform: 'Landsat-9',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'LANDSAT/LC09/C02/T1_L2/L9_CURR',
        source: SatelliteSource.LANDSAT_9,
        platform: 'Landsat-9',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '7. L9 → L9: mode is NATIVE');
    assert(decision.requiresHLS === false, '7. L9 → L9: requiresHLS is false');
    assert(decision.isCompatible === true, '7. L9 → L9: isCompatible is true');
  }

  // ── SECTION 2: HLS Cross-Sensor Optical Cases ──────────────────────────────
  console.log('\n▶ Section 2: HLS Cross-Sensor Optical Cases (S2 ↔ Landsat)');

  // Test 8: S2A → L8 = HLS (S30 → L30)
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_CURR',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.HLS, '8. S2A → L8: mode is HLS');
    assert(decision.requiresHLS === true, '8. S2A → L8: requiresHLS is true');
    assert(decision.isCompatible === true, '8. S2A → L8: isCompatible is true');
    assert(decision.baselineHLSProduct === HLSProduct.S30, '8. S2A → L8: baselineHLSProduct is S30');
    assert(decision.currentHLSProduct === HLSProduct.L30, '8. S2A → L8: currentHLSProduct is L30');
    assert(decision.reason.includes('HLS_REQUIRED'), '8. S2A → L8: reason mentions HLS_REQUIRED');
  }

  // Test 9: S2A → L9 = HLS (S30 → L30)
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'LANDSAT/LC09/C02/T1_L2/L9_CURR',
        source: SatelliteSource.LANDSAT_9,
        platform: 'Landsat-9',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.HLS, '9. S2A → L9: mode is HLS');
    assert(decision.requiresHLS === true, '9. S2A → L9: requiresHLS is true');
    assert(decision.baselineHLSProduct === HLSProduct.S30, '9. S2A → L9: baseline is S30');
    assert(decision.currentHLSProduct === HLSProduct.L30, '9. S2A → L9: current is L30');
  }

  // Test 10: S2B → L8 = HLS (S30 → L30)
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2B_BASE',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2B',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_CURR',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.HLS, '10. S2B → L8: mode is HLS');
    assert(decision.requiresHLS === true, '10. S2B → L8: requiresHLS is true');
    assert(decision.baselineHLSProduct === HLSProduct.S30, '10. S2B → L8: baseline is S30');
    assert(decision.currentHLSProduct === HLSProduct.L30, '10. S2B → L8: current is L30');
  }

  // Test 11: L8 → S2A = HLS (L30 → S30)
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_BASE',
        source: SatelliteSource.LANDSAT_8,
        platform: 'Landsat-8',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_CURR',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.HLS, '11. L8 → S2A: mode is HLS');
    assert(decision.requiresHLS === true, '11. L8 → S2A: requiresHLS is true');
    assert(decision.baselineHLSProduct === HLSProduct.L30, '11. L8 → S2A: baseline is L30');
    assert(decision.currentHLSProduct === HLSProduct.S30, '11. L8 → S2A: current is S30');
  }

  // Test 12: L9 → S2B = HLS (L30 → S30)
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'LANDSAT/LC09/C02/T1_L2/L9_BASE',
        source: SatelliteSource.LANDSAT_9,
        platform: 'Landsat-9',
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2B_CURR',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2B',
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.mode === ComparisonMode.HLS, '12. L9 → S2B: mode is HLS');
    assert(decision.requiresHLS === true, '12. L9 → S2B: requiresHLS is true');
    assert(decision.baselineHLSProduct === HLSProduct.L30, '12. L9 → S2B: baseline is L30');
    assert(decision.currentHLSProduct === HLSProduct.S30, '12. L9 → S2B: current is S30');
  }

  // ── SECTION 3: SAR Rejection (SAR Safety Guard) ───────────────────────────
  console.log('\n▶ Section 3: SAR Rejection (SAR Must Never Use HLS)');

  // Test 13: S1 → S2 = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S1_GRD/S1A_BASE',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: baseDate,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_CURR',
        source: SatelliteSource.SENTINEL_2,
        sensorType: SensorType.OPTICAL,
        acquisitionDate: currDate,
      },
    );
    assert(decision.isCompatible === false, '13. S1 → S2: isCompatible is false');
    assert(decision.requiresHLS === false, '13. S1 → S2: requiresHLS is false');
    assert(decision.rejectionCode === HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE, '13. S1 → S2: SAR_NOT_HLS_COMPATIBLE');
  }

  // Test 14: S2 → S1 = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        sensorType: SensorType.OPTICAL,
        acquisitionDate: baseDate,
      },
      {
        imageId: 'COPERNICUS/S1_GRD/S1A_CURR',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: currDate,
      },
    );
    assert(decision.isCompatible === false, '14. S2 → S1: isCompatible is false');
    assert(decision.requiresHLS === false, '14. S2 → S1: requiresHLS is false');
    assert(decision.rejectionCode === HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE, '14. S2 → S1: SAR_NOT_HLS_COMPATIBLE');
  }

  // Test 15: S1 → L8 = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S1_GRD/S1A_BASE',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: baseDate,
      },
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_CURR',
        source: SatelliteSource.LANDSAT_8,
        sensorType: SensorType.OPTICAL,
        acquisitionDate: currDate,
      },
    );
    assert(decision.isCompatible === false, '15. S1 → L8: isCompatible is false');
    assert(decision.requiresHLS === false, '15. S1 → L8: requiresHLS is false');
    assert(decision.rejectionCode === HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE, '15. S1 → L8: SAR_NOT_HLS_COMPATIBLE');
  }

  // Test 16: L8 → S1 = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'LANDSAT/LC08/C02/T1_L2/L8_BASE',
        source: SatelliteSource.LANDSAT_8,
        sensorType: SensorType.OPTICAL,
        acquisitionDate: baseDate,
      },
      {
        imageId: 'COPERNICUS/S1_GRD/S1A_CURR',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: currDate,
      },
    );
    assert(decision.isCompatible === false, '16. L8 → S1: isCompatible is false');
    assert(decision.requiresHLS === false, '16. L8 → S1: requiresHLS is false');
    assert(decision.rejectionCode === HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE, '16. L8 → S1: SAR_NOT_HLS_COMPATIBLE');
  }

  // Test 17: S1 → S1 continues through SAR logic and is NOT routed to HLS
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S1_GRD/S1A_BASE',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        monitoringTrack: MonitoringTrack.SAR,
        acquisitionDate: baseDate,
      },
      {
        imageId: 'COPERNICUS/S1_GRD/S1A_CURR',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        monitoringTrack: MonitoringTrack.SAR,
        acquisitionDate: currDate,
      },
    );
    assert(decision.requiresHLS === false, '17. S1 → S1: requiresHLS is false');
    assert(decision.isCompatible === false, '17. S1 → S1: isCompatible is false for optical service');
    assert(decision.rejectionCode === HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE, '17. S1 → S1: not routed to HLS');
  }

  // ── SECTION 4: Geometry & Temporal Rejections ─────────────────────────────
  console.log('\n▶ Section 4: Geometry & Temporal Rejections');

  // Test 18: Cross-zone = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        acquisitionDate: baseDate,
        zoneId: 'ZONE-A',
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_CURR',
        source: SatelliteSource.SENTINEL_2,
        acquisitionDate: currDate,
        zoneId: 'ZONE-B', // Different zone!
      },
    );
    assert(decision.isCompatible === false, '18. Cross-zone: isCompatible is false');
    assert(decision.rejectionCode === HLSRejectionCode.GEOMETRY_NOT_INTERSECTING, '18. Cross-zone: GEOMETRY_NOT_INTERSECTING');
  }

  // Test 19: Current older than baseline = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        acquisitionDate: '2026-05-15T00:00:00.000Z',
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_CURR',
        source: SatelliteSource.SENTINEL_2,
        acquisitionDate: '2026-05-01T00:00:00.000Z', // 14 days older!
        zoneId: candZone,
      },
    );
    assert(decision.isCompatible === false, '19. Current older: isCompatible is false');
    assert(decision.rejectionCode === HLSRejectionCode.TEMPORAL_INELIGIBLE, '19. Current older: TEMPORAL_INELIGIBLE');
  }

  // Test 20: Same baseline observation = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/SAME_OBS_ID',
        source: SatelliteSource.SENTINEL_2,
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/SAME_OBS_ID', // Identical imageId!
        source: SatelliteSource.SENTINEL_2,
        acquisitionDate: baseDate,
        zoneId: candZone,
      },
    );
    assert(decision.isCompatible === false, '20. Same observation: isCompatible is false');
    assert(decision.rejectionCode === HLSRejectionCode.DUPLICATE_OBSERVATION, '20. Same observation: DUPLICATE_OBSERVATION');
  }

  // Test 21: Unsupported sensor = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'USGS/SRTMGL1_003',
        source: SatelliteSource.SRTM, // DEM!
        sensorType: SensorType.DEM,
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.isCompatible === false, '21. Unsupported sensor: isCompatible is false');
    assert(decision.rejectionCode === HLSRejectionCode.UNSUPPORTED_SENSOR_COMBINATION, '21. Unsupported sensor: UNSUPPORTED_SENSOR_COMBINATION');
  }

  // Test 22: Invalid monitoring-track pairing = reject
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        monitoringTrack: MonitoringTrack.OPTICAL,
        acquisitionDate: baseDate,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S1_GRD/S1_CURR',
        source: SatelliteSource.SENTINEL_1,
        monitoringTrack: MonitoringTrack.SAR, // Incompatible track!
        acquisitionDate: currDate,
        zoneId: candZone,
      },
    );
    assert(decision.isCompatible === false, '22. Incompatible track: isCompatible is false');
    assert(
      decision.rejectionCode === HLSRejectionCode.SAR_NOT_HLS_COMPATIBLE ||
        decision.rejectionCode === HLSRejectionCode.SENSOR_TRACK_MISMATCH,
      '22. Incompatible track rejected',
    );
  }

  // ── SECTION 5: Mandatory Cloud Fallback Rule ───────────────────────────────
  console.log('\n▶ Section 5: Mandatory Cloud Fallback Rule (RULE 9)');

  // Test 23: Same-family optical observation with high cloud does NOT switch to HLS
  {
    const decision = OpticalComparisonDecisionService.decideComparison(
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2A_BASE',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2A',
        acquisitionDate: baseDate,
        cloudCover: 5.0,
        zoneId: baseZone,
      },
      {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2B_HIGH_CLOUD',
        source: SatelliteSource.SENTINEL_2,
        platform: 'Sentinel-2B',
        acquisitionDate: currDate,
        cloudCover: 85.0, // High cloud!
        zoneId: candZone,
      },
      { maxCloudCoverThreshold: 20 },
    );
    assert(decision.mode === ComparisonMode.NATIVE, '23. High cloud: comparisonMode is strictly NATIVE');
    assert(decision.requiresHLS === false, '23. High cloud: requiresHLS is strictly false (NEVER switches to HLS)');
    assert(decision.isCompatible === false, '23. High cloud: isCompatible is false due to cloud threshold');
    assert(decision.rejectionCode === RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD, '23. High cloud: rejectionCode is CLOUD_COVER_EXCEEDS_THRESHOLD');
    assert(decision.reason.includes('HLS is not a cloud fallback'), '23. High cloud: reason confirms HLS is not a cloud fallback');
  }

  // ── SUMMARY ──
  console.log('\n==================================================');
  console.log(`OPTICAL COMPARISON DECISION TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

runComparisonDecisionTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Test suite failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
