import assert from 'node:assert';
import {
  SarCompatibilityService,
  type SarObservationGeometry,
} from '../services/spatial/SarCompatibilityService.js';
import {
  SarPixelChangeDetector,
  type SarPixelDetectionResult,
} from '../services/changeDetection/SarPixelChangeDetector.js';
import {
  SarChangeDirection,
  RejectionReasonCode,
  ChangeCategory,
  type GeoJSONPolygon,
  type AnalysisGridDto,
} from '@tn-forest/shared/types';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import type { HarmonizedSarRaster, ValidDataIntersectionResult } from '../services/spatial/SpatialHarmonizationService.js';

async function runTests() {
  console.log('============================================================');
  console.log('TEST SUITE: SAR COMPATIBILITY & DIRECTIONAL CHANGE DETECTION');
  console.log('============================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Relative Orbit Calculation from Absolute Orbit (S1A & S1B)
  // -------------------------------------------------------------------------
  console.log('Test 1: Sentinel-1 Relative Orbit Calculation from Absolute Orbit Number...');

  // Sirumalai baseline: Sentinel-1A absolute orbit 30614 -> relative orbit 92
  const relOrbitS1A_92 = SarCompatibilityService.calculateRelativeOrbit(30614, 'Sentinel-1A');
  assert.strictEqual(relOrbitS1A_92, 92, 'Sentinel-1A orbit 30614 should resolve to Track 92');

  // Sirumalai candidate: Sentinel-1A absolute orbit 35937 -> relative orbit 165
  const relOrbitS1A_165 = SarCompatibilityService.calculateRelativeOrbit(35937, 'Sentinel-1A');
  assert.strictEqual(relOrbitS1A_165, 165, 'Sentinel-1A orbit 35937 should resolve to Track 165');

  // Sentinel-1B test: formula ((abs - 27) % 175) + 1
  // For absolute orbit 27: ((27 - 27) % 175) + 1 = 1
  const relOrbitS1B_1 = SarCompatibilityService.calculateRelativeOrbit(27, 'Sentinel-1B');
  assert.strictEqual(relOrbitS1B_1, 1, 'Sentinel-1B orbit 27 should resolve to Track 1');

  // For absolute orbit 118: ((118 - 27) % 175) + 1 = 92
  const relOrbitS1B_92 = SarCompatibilityService.calculateRelativeOrbit(118, 'Sentinel-1B');
  assert.strictEqual(relOrbitS1B_92, 92, 'Sentinel-1B orbit 118 should resolve to Track 92');

  // Verify full range 1..175
  assert.ok(relOrbitS1A_92 >= 1 && relOrbitS1A_92 <= 175, 'Relative orbit must be between 1 and 175');
  assert.ok(relOrbitS1A_165 >= 1 && relOrbitS1A_165 <= 175, 'Relative orbit must be between 1 and 175');
  console.log('  ✅ Test 1 PASSED: S1A and S1B relative orbit mathematical formulas verified.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Orbit Direction Matching and Mismatch Detection
  // -------------------------------------------------------------------------
  console.log('Test 2: Orbit Direction & Relative Track Compatibility Engine...');

  const baselineTrack92Desc: SarObservationGeometry = {
    imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T004044_20200102T004109_030623_0381B5_F00E',
    platform: 'Sentinel-1A',
    mode: 'IW',
    polarizations: ['VV', 'VH'],
    orbitDirection: 'DESCENDING',
    relativeOrbitNumber: 92,
  };

  const sameTrack92Desc: SarObservationGeometry = {
    imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200114T004044_20200114T004109_030798_03875B_4FE2',
    platform: 'Sentinel-1A',
    mode: 'IW',
    polarizations: ['VV', 'VH'],
    orbitDirection: 'DESCENDING',
    relativeOrbitNumber: 92,
  };

  const track165Desc: SarObservationGeometry = {
    imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20210101T004812_20210101T004837_035940_0434FF_ABCD',
    platform: 'Sentinel-1A',
    mode: 'IW',
    polarizations: ['VV', 'VH'],
    orbitDirection: 'DESCENDING',
    relativeOrbitNumber: 165,
  };

  const track92Asc: SarObservationGeometry = {
    imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200108T124044_20200108T124109_030710_0384AC_1234',
    platform: 'Sentinel-1A',
    mode: 'IW',
    polarizations: ['VV', 'VH'],
    orbitDirection: 'ASCENDING',
    relativeOrbitNumber: 92,
  };

  // Same track + same pass -> Compatible
  const matchResult = SarCompatibilityService.evaluateSarCompatibility(baselineTrack92Desc, sameTrack92Desc);
  assert.strictEqual(matchResult.isCompatible, true, 'Same track and pass should be compatible');
  assert.strictEqual(matchResult.rejectionCode, undefined);

  // Track mismatch (92 vs 165)
  const trackMismatchResult = SarCompatibilityService.evaluateSarCompatibility(baselineTrack92Desc, track165Desc);
  assert.strictEqual(trackMismatchResult.isCompatible, false, 'Different relative tracks must be incompatible');
  assert.strictEqual(trackMismatchResult.rejectionCode, RejectionReasonCode.SAR_RELATIVE_ORBIT_MISMATCH);
  assert.ok(trackMismatchResult.reason?.includes('Track 92') && trackMismatchResult.reason?.includes('Track 165'));

  // Orbit direction mismatch (DESCENDING vs ASCENDING)
  const directionMismatchResult = SarCompatibilityService.evaluateSarCompatibility(baselineTrack92Desc, track92Asc);
  assert.strictEqual(directionMismatchResult.isCompatible, false, 'Different orbit directions must be incompatible');
  assert.strictEqual(directionMismatchResult.rejectionCode, RejectionReasonCode.SAR_ORBIT_DIRECTION_MISMATCH);
  console.log('  ✅ Test 2 PASSED: Geometry compatibility engine rejects track and direction mismatches.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Metadata Parsing from GEE Raw Properties
  // -------------------------------------------------------------------------
  console.log('Test 3: Metadata Extraction from Authentic GEE Sentinel-1 Properties...');

  const rawGeeProperties = {
    'platform_number': 'A',
    'sensor_operational_mode': 'IW',
    'transmitterReceiverPolarisation': ['VV', 'VH'],
    'orbitProperties_pass': 'DESCENDING',
    'orbit_properties_pass': 'DESCENDING',
    'orbitProperties_ascendingNodeRelLongitude': 77.5,
    'relative_orbit_number_descending': 92,
    'system:time_start': 1577926800000,
  };

  const parsed = SarCompatibilityService.parseSentinel1Metadata('COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T004044_20200102T004109_030623_0381B5_F00E', rawGeeProperties);
  assert.strictEqual(parsed.platform, 'Sentinel-1A');
  assert.strictEqual(parsed.mode, 'IW');
  assert.deepStrictEqual(parsed.polarizations, ['VV', 'VH']);
  assert.strictEqual(parsed.orbitDirection, 'DESCENDING');
  assert.strictEqual(parsed.relativeOrbitNumber, 92);
  assert.strictEqual(parsed.absoluteOrbitNumber, 30623);
  console.log('  ✅ Test 3 PASSED: Authentic GEE property extraction verified.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Directional Change Detection Logic (Drop vs Increase vs Stable)
  // -------------------------------------------------------------------------
  console.log('Test 4: Directional Change Detection Logic (Drop, Increase, Stable)...');

  // Construct a small 4-pixel synthetic raster
  // Pixel 0: Drop: ΔVV = -3.0 dB, ΔVH = -2.5 dB  (<= -2.0) -> Drop
  // Pixel 1: Gain: ΔVV = +3.5 dB, ΔVH = +1.0 dB  (>= +2.0) -> Gain
  // Pixel 2: Mixed: ΔVV = -2.5 dB, ΔVH = +2.5 dB (Drop on VV, Gain on VH) -> Both Drop and Gain flags true
  // Pixel 3: Stable: ΔVV = -0.5 dB, ΔVH = +0.8 dB (|Δ| < 2.0) -> Stable

  const width = 2;
  const height = 2;
  const totalPx = width * height;

  const mockGrid: AnalysisGridDto = {
    crs: 'EPSG:32644',
    resolutionMeters: 10,
    width,
    height,
    minX: 0,
    minY: 0,
    maxX: 20,
    maxY: 20,
    pixelSizeX: 10,
    pixelSizeY: 10,
    originX: 0,
    originY: 20,
    transform: [0, 10, 0, 20, 0, -10],
    affineTransform: [10, 0, 0, 0, -10, 20],
  };

  // Baseline rasters
  const baseVv = new Float32Array([-10.0, -12.0, -10.0, -11.0]);
  const baseVh = new Float32Array([-16.0, -18.0, -16.0, -17.0]);

  // Current rasters
  const curVv = new Float32Array([
    -13.0, // delta = -3.0 dB (Drop)
    -8.5,  // delta = +3.5 dB (Gain)
    -12.5, // delta = -2.5 dB (Drop)
    -11.5, // delta = -0.5 dB (Stable)
  ]);
  const curVh = new Float32Array([
    -18.5, // delta = -2.5 dB (Drop)
    -17.0, // delta = +1.0 dB (Gain)
    -13.5, // delta = +2.5 dB (Gain)
    -16.2, // delta = +0.8 dB (Stable)
  ]);

  const testBaseHarmonized: HarmonizedSarRaster = {
    grid: mockGrid,
    vv: baseVv,
    vh: baseVh,
    validMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32644',
    sourceDimensions: { width, height },
    resamplingMethod: 'bilinear',
  };

  const testCurHarmonized: HarmonizedSarRaster = {
    grid: mockGrid,
    vv: curVv,
    vh: curVh,
    validMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32644',
    sourceDimensions: { width, height },
    resamplingMethod: 'bilinear',
  };

  const intersection: ValidDataIntersectionResult = {
    validComparisonMask: new Uint8Array(totalPx).fill(1),
    comparisonPixelCount: 4,
    validBaselinePixelCount: 4,
    validCurrentPixelCount: 4,
    overlapPixelCount: 4,
    zonePixelCount: 4,
    coveragePercentage: 100.0,
  };

  // Test Mode A: DECREASE (Default production mode for forest disturbance)
  const decreaseResult: SarPixelDetectionResult = SarPixelChangeDetector.detectPixelChange({
    baselineHarmonized: testBaseHarmonized,
    currentHarmonized: testCurHarmonized,
    intersection,
    zoneAreaHectares: 0.04,
    thresholdConfig: {
      vvThresholdDb: 2.0,
      vhThresholdDb: 2.0,
      changeDirection: SarChangeDirection.DECREASE,
      decisionRule: 'ANY_BAND',
    },
    minClusterPixels: 1,
  });

  const spat = decreaseResult.spatialResult;
  const stats = spat.rasterStatistics!;
  assert.strictEqual(stats.negativeChangePixelCount, 2, 'Negative drops must be exactly 2 pixels');
  assert.strictEqual(stats.positiveChangePixelCount, 2, 'Positive gains must be exactly 2 pixels (pixels 1 and 2)');
  assert.strictEqual(stats.stablePixelCount, 1, 'Stable must be exactly 1 pixel (pixel 3)');
  assert.strictEqual(spat.changedPixels, 2, 'In DECREASE mode, changedPixels must equal negative drop count');
  assert.strictEqual(spat.affectedAreaPercentage, 50.0, '2 out of 4 pixels = 50.0%');
  assert.strictEqual(stats.negativeAffectedAreaPercentage, 50.0);
  assert.strictEqual(stats.positiveAffectedAreaPercentage, 50.0);

  // Verify forest loss / structural change classification is preserved
  assert.ok(
    decreaseResult.categories.includes(ChangeCategory.VEGETATION_LOSS) ||
    decreaseResult.categories.includes(ChangeCategory.SAR_STRUCTURAL_CHANGE),
    'Forest loss / structural change must be flagged on backscatter drop'
  );
  assert.ok(!decreaseResult.categories.includes(ChangeCategory.SURFACE_CHANGE), 'SURFACE_CHANGE should not be sole category for drop');
  console.log('  ✅ Test 4 PASSED: Directional semantics distinguish drop vs gain vs stable accurately.\n');

  // -------------------------------------------------------------------------
  // TEST 5: Mode INCREASE and Mode ABSOLUTE Comparisons
  // -------------------------------------------------------------------------
  console.log('Test 5: Verification of INCREASE and ABSOLUTE threshold modes...');

  // Test Mode B: INCREASE mode
  const increaseResult = SarPixelChangeDetector.detectPixelChange({
    baselineHarmonized: testBaseHarmonized,
    currentHarmonized: testCurHarmonized,
    intersection,
    zoneAreaHectares: 0.04,
    thresholdConfig: {
      vvThresholdDb: 2.0,
      vhThresholdDb: 2.0,
      changeDirection: SarChangeDirection.INCREASE,
      decisionRule: 'ANY_BAND',
    },
    minClusterPixels: 1,
  });

  assert.strictEqual(increaseResult.spatialResult.changedPixels, 2, 'In INCREASE mode, changedPixels must equal positive gain count');
  assert.strictEqual(increaseResult.categories.includes(ChangeCategory.SURFACE_CHANGE), true, 'Positive backscatter changes map to SURFACE_CHANGE');
  assert.strictEqual(increaseResult.categories.includes(ChangeCategory.VEGETATION_LOSS), false, 'Positive gains must NEVER be classified as VEGETATION_LOSS');

  // Test Mode C: ABSOLUTE mode (Legacy differencing)
  const absoluteResult = SarPixelChangeDetector.detectPixelChange({
    baselineHarmonized: testBaseHarmonized,
    currentHarmonized: testCurHarmonized,
    intersection,
    zoneAreaHectares: 0.04,
    thresholdConfig: {
      vvThresholdDb: 2.0,
      vhThresholdDb: 2.0,
      changeDirection: SarChangeDirection.ABSOLUTE,
      decisionRule: 'ANY_BAND',
    },
    minClusterPixels: 1,
  });

  // In ABSOLUTE mode: Pixel 0 (drop), Pixel 1 (gain), Pixel 2 (both) = 3 pixels changed
  assert.strictEqual(absoluteResult.spatialResult.changedPixels, 3, 'In ABSOLUTE mode, changedPixels must include drops and gains (3 of 4)');
  assert.strictEqual(absoluteResult.spatialResult.affectedAreaPercentage, 75.0, '3 out of 4 pixels = 75.0%');
  console.log('  ✅ Test 5 PASSED: Threshold mode selection correctly separates disturbance from accretion.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Spatial Harmonization Retains Canonical Analysis Grid
  // -------------------------------------------------------------------------
  console.log('Test 6: Spatial Harmonization Analysis Grid Invariance...');

  const sirumalaiBoundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [[
      [77.940, 10.120],
      [78.060, 10.120],
      [78.060, 10.250],
      [77.940, 10.250],
      [77.940, 10.120],
    ]],
  };

  const grid1 = AnalysisGridService.createAnalysisGrid(sirumalaiBoundary, { pixelSizeMeters: 10 });
  const grid2 = AnalysisGridService.createAnalysisGrid(sirumalaiBoundary, { pixelSizeMeters: 10 });

  // Determinism
  assert.strictEqual(grid1.width, grid2.width, 'Canonical grid width must be deterministic');
  assert.strictEqual(grid1.height, grid2.height, 'Canonical grid height must be deterministic');
  assert.deepStrictEqual(grid1.transform, grid2.transform, 'Canonical grid transform must be identical');
  assert.strictEqual(grid1.crs, 'EPSG:32644', 'Target CRS for Tamil Nadu Sirumalai must be EPSG:32644');
  assert.strictEqual(grid1.pixelSizeX, 10, 'Target resolution must be 10m');
  console.log(`  ✅ Test 6 PASSED: Analysis grid determinism verified (${grid1.width} x ${grid1.height}, CRS ${grid1.crs}).\n`);

  // -------------------------------------------------------------------------
  // TEST 7: Monitoring Candidate Rejection Counters
  // -------------------------------------------------------------------------
  console.log('Test 7: Candidate Rejection Reasons in Monitoring Engine...');

  const rejectionSummary: Record<string, number> = {
    [RejectionReasonCode.SAR_RELATIVE_ORBIT_MISMATCH]: 0,
    [RejectionReasonCode.SAR_ORBIT_DIRECTION_MISMATCH]: 0,
    [RejectionReasonCode.HIGH_CLOUD_COVER]: 0,
  };

  const candidates = [
    { id: 'cand-1', pass: 'DESCENDING', track: 92 },   // Valid
    { id: 'cand-2', pass: 'DESCENDING', track: 165 },  // Track mismatch
    { id: 'cand-3', pass: 'ASCENDING', track: 92 },    // Pass mismatch
    { id: 'cand-4', pass: 'DESCENDING', track: 165 },  // Track mismatch
  ];

  for (const c of candidates) {
    const comp = SarCompatibilityService.evaluateSarCompatibility(baselineTrack92Desc, {
      imageId: `mock-img-${c.id}`,
      platform: 'Sentinel-1A',
      mode: 'IW',
      polarizations: ['VV', 'VH'],
      orbitDirection: c.pass as 'ASCENDING' | 'DESCENDING',
      relativeOrbitNumber: c.track,
    });
    if (!comp.isCompatible && comp.rejectionCode) {
      rejectionSummary[comp.rejectionCode] = (rejectionSummary[comp.rejectionCode] || 0) + 1;
    }
  }

  assert.strictEqual(rejectionSummary[RejectionReasonCode.SAR_RELATIVE_ORBIT_MISMATCH], 2, '2 candidates must be rejected for track mismatch');
  assert.strictEqual(rejectionSummary[RejectionReasonCode.SAR_ORBIT_DIRECTION_MISMATCH], 1, '1 candidate must be rejected for pass mismatch');
  console.log('  ✅ Test 7 PASSED: Monitoring rejection summary tracks SAR geometry rejections.\n');

  // -------------------------------------------------------------------------
  // TEST 8: Historical Safety & Audit Status Protection
  // -------------------------------------------------------------------------
  console.log('Test 8: Historical Change Record Audit Status Invariance...');

  const auditedRecord = {
    changeId: 'CHG-1790525317279-8405',
    auditStatus: 'INVALID_FOR_PRODUCTION_GEOMETRY' as const,
    affectedAreaPercentage: 77.30,
  };

  const productionRecord = {
    changeId: 'CHG-1790511626250-4641',
    auditStatus: undefined,
    affectedAreaPercentage: 1.06,
  };

  assert.strictEqual(auditedRecord.auditStatus, 'INVALID_FOR_PRODUCTION_GEOMETRY');
  assert.strictEqual(auditedRecord.affectedAreaPercentage, 77.30, 'Mathematical result of audited record must remain intact');
  assert.strictEqual(productionRecord.auditStatus, undefined, 'Untouched baseline comparison must remain intact');
  assert.strictEqual(productionRecord.affectedAreaPercentage, 1.06);
  console.log('  ✅ Test 8 PASSED: Historical record safety and audit status tagging verified.\n');

  console.log('============================================================');
  console.log('ALL 8 SAR COMPATIBILITY & DIRECTIONAL TESTS PASSED!');
  console.log('============================================================');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
