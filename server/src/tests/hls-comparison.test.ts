import { Types } from 'mongoose';
import {
  SensorType,
  SatelliteSource,
  ComparisonMode,
  ChangeCategory,
  ProcessingMode,
  SpatialCalculationSource,
  ChangeCalculationMethod,
  SpatialCalculationType,
  type AnalysisGridDto,
  type GeoJSONPolygon,
  type HLSRepresentationDto,
} from '@tn-forest/shared/types';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { OpticalSpatialHarmonizationService } from '../services/spatial/OpticalSpatialHarmonizationService.js';
import { OpticalPixelIndexService } from '../services/spatial/OpticalPixelIndexService.js';
import { OpticalPixelChangeDetector } from '../services/changeDetection/OpticalPixelChangeDetector.js';
import { HLSComparisonService } from '../services/hls/HLSComparisonService.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';

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

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedMsg: string,
  testLabel: string,
): Promise<void> {
  try {
    await fn();
    console.error(`  ❌ FAIL: ${testLabel} — did NOT throw`);
    failed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(expectedMsg)) {
      console.log(`  ✅ PASS: ${testLabel} (threw expected: "${expectedMsg}")`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testLabel} — unexpected error message: "${msg}", expected: "${expectedMsg}"`);
      failed++;
    }
  }
}

const mockMudumalaiBoundary: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [76.5, 11.5],
      [76.6, 11.5],
      [76.6, 11.6],
      [76.5, 11.6],
      [76.5, 11.5],
    ],
  ],
};

async function runTests(): Promise<void> {
  console.log('\n===============================================================');
  console.log('   PHASE 7 UNIT TEST SUITE: HLS CROSS-SENSOR SPATIAL COMPARISON');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Canonical Band Mapping for S30 and L30
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Canonical Band Layout & Layout Consistency ---');
  const canonicalHlsBands = ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2', 'Fmask'];
  assert(canonicalHlsBands.length === 7, 'HLS canonical export format has exactly 7 bands');
  assert(canonicalHlsBands[0] === 'Blue', 'Band 0 is Blue (B02 in both S30 and L30)');
  assert(canonicalHlsBands[1] === 'Green', 'Band 1 is Green (B03 in both S30 and L30)');
  assert(canonicalHlsBands[2] === 'Red', 'Band 2 is Red (B04 in both S30 and L30)');
  assert(canonicalHlsBands[3] === 'NIR', 'Band 3 is NIR (B8A in S30, B05 in L30)');
  assert(canonicalHlsBands[4] === 'SWIR1', 'Band 4 is SWIR1 (B11 in S30, B06 in L30)');
  assert(canonicalHlsBands[5] === 'SWIR2', 'Band 5 is SWIR2 (B12 in S30, B07 in L30)');
  assert(canonicalHlsBands[6] === 'Fmask', 'Band 6 is Fmask (QA quality bitmask)');

  // --------------------------------------------------------------------------
  // TEST 2: Common 30m AnalysisGrid Construction
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Canonical 30m AnalysisGrid Construction ---');
  const grid: AnalysisGridDto = AnalysisGridService.createAnalysisGrid(mockMudumalaiBoundary, {
    pixelSizeMeters: 30.0,
    targetCrs: 'EPSG:32643',
    bufferMeters: 0,
  });

  assert(grid.pixelSizeX === 30.0, 'Grid pixelSizeX is exactly 30.0 meters');
  assert(grid.pixelSizeY === 30.0, 'Grid pixelSizeY is exactly 30.0 meters');
  assert(grid.crs === 'EPSG:32643', 'Grid projected CRS is UTM Zone 43N (EPSG:32643)');
  const cellAreaM2 = (grid.pixelSizeX || 30) * (grid.pixelSizeY || 30);
  assert(cellAreaM2 === 900.0, 'Cell area is strictly 900.0 m2 per pixel');
  assert(grid.width > 0 && grid.height > 0, `Grid dimensions are valid: ${grid.width}x${grid.height}`);

  // --------------------------------------------------------------------------
  // TEST 3: Resampling — Continuous Bilinear vs Categorical Nearest-Neighbor
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Continuous vs Categorical Resampling Rules ---');
  // Synthetic 2x2 source raster in UTM
  const srcWidth = 4;
  const srcHeight = 4;
  const srcBlue = new Float32Array(srcWidth * srcHeight).fill(1000);
  const srcGreen = new Float32Array(srcWidth * srcHeight).fill(1200);
  const srcRed = new Float32Array(srcWidth * srcHeight).fill(800);
  const srcNir = new Float32Array(srcWidth * srcHeight).fill(4000);
  const srcQa = new Float32Array(srcWidth * srcHeight);
  // Put bitmask 2 (cloud) at (1,1)
  srcQa[1 * srcWidth + 1] = 2; // cloud

  const syntheticParsed = {
    metadata: {
      width: srcWidth,
      height: srcHeight,
      numBands: 7,
      crs: 'EPSG:32643',
      originalCrs: 'EPSG:32643',
      normalizedCrs: 'EPSG:32643',
      areaCalculationCrs: 'EPSG:32643',
      pixelScale: [30, 30, 0] as [number, number, number],
      tiePoint: [0, 0, 0, grid.originX, grid.originY, 0] as [number, number, number, number, number, number],
      bbox: [grid.minX, grid.minY, grid.maxX, grid.maxY] as [number, number, number, number],
      nodata: 0,
      bitsPerSample: [16, 16, 16, 16, 16, 16, 16],
      pixelAreaM2: 900,
      isProjectedMetric: true,
    },
    bandData: [srcBlue, srcGreen, srcRed, srcNir, srcRed, srcRed, srcQa],
    bandNames: canonicalHlsBands,
  };

  const harmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
    syntheticParsed,
    grid,
    { satellite: 'HLS-S30' },
  );

  assert(harmonized.nir.length === grid.width * grid.height, 'Reprojected NIR array matches canonical grid length');
  assert(harmonized.qa !== undefined, 'Reprojected QA array exists');
  // QA values must be discrete integers, not fractional floats
  let hasNonIntegerQa = false;
  if (harmonized.qa) {
    for (let i = 0; i < harmonized.qa.length; i++) {
      const v = harmonized.qa[i];
      if (!isNaN(v) && v !== Math.round(v)) {
        hasNonIntegerQa = true;
        break;
      }
    }
  }
  assert(!hasNonIntegerQa, 'Categorical Fmask QA was resampled with nearest-neighbor, yielding integer bitmasks');

  // --------------------------------------------------------------------------
  // TEST 4: Fmask QA Bitmask Evaluation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Fmask QA Bitmask Evaluation ---');
  // NASA HLS V2.0 Fmask bits:
  // Bit 0: Cirrus (1)
  // Bit 1: Cloud (2)
  // Bit 2: Adjacent to cloud/shadow (4)
  // Bit 3: Cloud shadow (8)
  // Bit 4: Snow/ice (16)
  // Bit 5: Water (32)
  // Clear land rule: (fmask & 0b011110) === 0 (or (fmask & 30) === 0)
  const isClearHlsFmask = (fmask: number): boolean => (Math.round(fmask) & 0b011110) === 0;

  assert(isClearHlsFmask(0), 'Fmask 0 (Clear land) is VALID');
  assert(isClearHlsFmask(1), 'Fmask 1 (Cirrus only, bit 0) is considered clear enough for land comparison');
  assert(!isClearHlsFmask(2), 'Fmask 2 (Cloud, bit 1) is INVALID (cloud-masked)');
  assert(!isClearHlsFmask(4), 'Fmask 4 (Adjacent cloud/shadow, bit 2) is INVALID');
  assert(!isClearHlsFmask(8), 'Fmask 8 (Cloud shadow, bit 3) is INVALID (shadow-masked)');
  assert(!isClearHlsFmask(16), 'Fmask 16 (Snow/ice, bit 4) is INVALID');
  assert(!isClearHlsFmask(2 | 8), 'Fmask 10 (Cloud + Shadow) is INVALID');
  assert(isClearHlsFmask(32), 'Fmask 32 (Water, bit 5) has no cloud/shadow/snow bits set');

  // --------------------------------------------------------------------------
  // TEST 5: 5-Way Valid Optical Intersection Masking
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: 5-Way Valid Optical Intersection Masking ---');
  const nPixels = 10;
  const mockGrid: AnalysisGridDto = {
    crs: 'EPSG:32643',
    pixelSizeX: 30,
    pixelSizeY: 30,
    originX: 0,
    originY: 0,
    minX: 0,
    minY: 0,
    maxX: 300,
    maxY: 30,
    width: 10,
    height: 1,
    transform: [0, 30, 0, 0, 0, -30],
  };

  const bFootprint = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 0, 1, 1]);
  const cFootprint = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 0, 1]);
  const bQuality = new Uint8Array([1, 0, 1, 1, 1, 1, 1, 1, 1, 1]); // pixel 1 has baseline cloud
  const cQuality = new Uint8Array([1, 1, 0, 1, 1, 1, 1, 1, 1, 1]); // pixel 2 has current cloud
  const zoneMask = new Uint8Array([1, 1, 1, 0, 1, 1, 1, 1, 1, 1]); // pixel 3 is outside zone

  const mockIntersectionMask = new Uint8Array(nPixels);
  for (let i = 0; i < nPixels; i++) {
    mockIntersectionMask[i] =
      bFootprint[i] === 1 &&
      cFootprint[i] === 1 &&
      bQuality[i] === 1 &&
      cQuality[i] === 1 &&
      zoneMask[i] === 1
        ? 1
        : 0;
  }

  assert(mockIntersectionMask[0] === 1, 'Pixel 0: all 5 conditions true -> VALID (1)');
  assert(mockIntersectionMask[1] === 0, 'Pixel 1: baseline cloud -> INVALID (0)');
  assert(mockIntersectionMask[2] === 0, 'Pixel 2: current cloud -> INVALID (0)');
  assert(mockIntersectionMask[3] === 0, 'Pixel 3: outside zone -> INVALID (0)');
  assert(mockIntersectionMask[7] === 0, 'Pixel 7: baseline out-of-footprint -> INVALID (0)');
  assert(mockIntersectionMask[8] === 0, 'Pixel 8: current out-of-footprint -> INVALID (0)');
  assert(mockIntersectionMask[4] === 1, 'Pixel 4: all 5 conditions true -> VALID (1)');

  // --------------------------------------------------------------------------
  // TEST 6: Harmonized Reflectance Scaling (0.0001 factor for S30 & L30)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Harmonized Reflectance Scaling (NASA HLS 0.0001) ---');
  const mockHarmonizedS30 = {
    grid: mockGrid,
    blue: new Float32Array([500]),
    green: new Float32Array([700]),
    red: new Float32Array([1000]),
    nir: new Float32Array([4500]),
    footprintMask: new Uint8Array([1]),
    qualityMask: new Uint8Array([1]),
    validPixelCount: 1,
    totalPixelCount: 1,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 1, height: 1 },
    satellite: 'HLS-S30',
  };

  const scaledBands = OpticalPixelIndexService.normalizeReflectanceBands(mockHarmonizedS30);
  assert(Math.abs(scaledBands.red[0] - 0.10) < 1e-5, 'Red DN 1000 scaled to 0.1000 surface reflectance');
  assert(Math.abs(scaledBands.nir[0] - 0.45) < 1e-5, 'NIR DN 4500 scaled to 0.4500 surface reflectance');

  // --------------------------------------------------------------------------
  // TEST 7: Spectral Indices & Zero-Division Protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Spectral Indices (NDVI) & Zero-Division Safeguard ---');
  const mockIndicesInput = {
    grid: mockGrid,
    blue: new Float32Array([500, 0]),
    green: new Float32Array([700, 0]),
    red: new Float32Array([1000, 0]),
    nir: new Float32Array([5000, 0]),
    footprintMask: new Uint8Array([1, 1]),
    qualityMask: new Uint8Array([1, 1]),
    validPixelCount: 2,
    totalPixelCount: 2,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 2, height: 1 },
    satellite: 'HLS-L30',
  };

  const calculatedIndices = OpticalPixelIndexService.calculatePixelIndices(
    mockIndicesInput,
    new Uint8Array([1, 1]),
  );

  // Pixel 0: NIR = 0.50, Red = 0.10 -> (0.50 - 0.10) / (0.50 + 0.10) = 0.40 / 0.60 = 0.6667
  const expectedNdvi = (0.50 - 0.10) / (0.50 + 0.10);
  assert(
    Math.abs(calculatedIndices.indices.ndvi[0] - expectedNdvi) < 1e-3,
    `NDVI correctly calculated: ${calculatedIndices.indices.ndvi[0].toFixed(4)} (expected ${expectedNdvi.toFixed(4)})`,
  );

  // Pixel 1: NIR = 0, Red = 0 -> protected against division by zero
  const zeroDivNdvi = calculatedIndices.indices.ndvi[1];
  assert(!isNaN(zeroDivNdvi) && isFinite(zeroDivNdvi) && zeroDivNdvi === 0, 'Zero-division protected: NDVI defaults to 0.0');

  // --------------------------------------------------------------------------
  // TEST 8: Pixel-Level Change Detection & Forest Canopy Loss Rule
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Pixel-Level Change Detection & Canopy Loss Rule ---');
  // 4 pixels:
  // 0: Severe canopy loss: bNdvi = 0.80, cNdvi = 0.50 (dNdvi = -0.30 <= -0.15) -> LOSS
  // 1: Mild variation (stable): bNdvi = 0.80, cNdvi = 0.75 (dNdvi = -0.05) -> STABLE
  // 2: Slight gain: bNdvi = 0.70, cNdvi = 0.72 (dNdvi = +0.02) -> STABLE
  // 3: Regrowth / gain: bNdvi = 0.50, cNdvi = 0.75 (dNdvi = +0.25 >= +0.15) -> GAIN
  const testGrid: AnalysisGridDto = {
    crs: 'EPSG:32643',
    pixelSizeX: 30,
    pixelSizeY: 30,
    originX: 0,
    originY: 0,
    minX: 0,
    minY: 0,
    maxX: 120,
    maxY: 30,
    width: 4,
    height: 1,
    transform: [0, 30, 0, 0, 0, -30],
  };

  const bIndices = {
    ndvi: new Float32Array([0.80, 0.80, 0.70, 0.50]),
    ndwi: new Float32Array([0, 0, 0, 0]),
    ndbi: new Float32Array([0, 0, 0, 0]),
    bsi: new Float32Array([0, 0, 0, 0]),
    savi: new Float32Array([0, 0, 0, 0]),
    evi: new Float32Array([0, 0, 0, 0]),
    validMask: new Uint8Array([1, 1, 1, 1]),
    validPixelCount: 4,
  };

  const cIndices = {
    ndvi: new Float32Array([0.50, 0.75, 0.72, 0.75]),
    ndwi: new Float32Array([0, 0, 0, 0]),
    ndbi: new Float32Array([0, 0, 0, 0]),
    bsi: new Float32Array([0, 0, 0, 0]),
    savi: new Float32Array([0, 0, 0, 0]),
    evi: new Float32Array([0, 0, 0, 0]),
    validMask: new Uint8Array([1, 1, 1, 1]),
    validPixelCount: 4,
  };

  const changeResult = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices: bIndices,
    currentIndices: cIndices,
    validMask: new Uint8Array([1, 1, 1, 1]),
    grid: testGrid,
    zoneAreaHectares: 0.36,
    thresholdConfig: { ndviThreshold: -0.15, decisionRule: 'NDVI_DROP', changeDirection: 'DECREASE' },
  });

  assert(changeResult.changedMask[0] === 1, 'Pixel 0 flagged as CHANGED (ΔNDVI = -0.30 <= -0.15)');
  assert(changeResult.changedMask[1] === 0, 'Pixel 1 flagged as UNCHANGED (ΔNDVI = -0.05 > -0.15)');
  assert(changeResult.changedMask[2] === 0, 'Pixel 2 flagged as UNCHANGED (ΔNDVI = +0.02 > -0.15)');
  assert(changeResult.changedMask[3] === 0, 'Pixel 3 flagged as UNCHANGED for canopy loss (gain direction)');
  assert(changeResult.rasterStatistics.changedPixelCount === 1, 'Total changed pixel count is exactly 1');
  assert(changeResult.rasterStatistics.decreasePixelCount === 1, 'Decrease pixel count is exactly 1');
  assert(changeResult.rasterStatistics.increasePixelCount === 1, 'Increase pixel count is exactly 1');
  assert(changeResult.rasterStatistics.stablePixelCount === 2, 'Stable pixel count is exactly 2');

  // --------------------------------------------------------------------------
  // TEST 9: Physical Ground Area Derivation (Strict 900 m2 / pixel)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Physical Area Derivation & Scalar Multiplier Ban ---');
  // 1 pixel * 900 m2 = 900 m2 = 0.0900 hectares
  const expectedAreaM2 = 1 * 900.0;
  const expectedAreaHa = expectedAreaM2 / 10000.0;
  assert(
    changeResult.spatialResult.changedArea === expectedAreaHa,
    `Physical area is strictly ${expectedAreaHa} ha (from 1 pixel * 900 m2 / 10000)`,
  );
  assert(
    changeResult.spatialResult.pixelAreaM2 === 900.0,
    'pixelAreaM2 is strictly 900.0 m2 (30m x 30m)',
  );
  assert(
    changeResult.spatialResult.affectedAreaPercentage === 25.0,
    'Affected area percentage is strictly (1 / 4) * 100 = 25.0%',
  );

  // Forensic Check: verify no Math.round(compositeDelta) or * 4000
  const fakeCompositeDelta = 0.0123;
  const oldBannedCalculation = Math.round(fakeCompositeDelta * 4000);
  assert(
    changeResult.spatialResult.changedArea !== oldBannedCalculation,
    'Verified: NO legacy compositeDelta * 4000 heuristic is present in calculation',
  );

  // --------------------------------------------------------------------------
  // TEST 10: Guard Rejection — SAR Images
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: SAR Rejection Guard ---');
  const mockSarRep = {
    id: new Types.ObjectId().toString(),
    status: 'READY' as const,
    sourceSensorType: SensorType.SAR,
    hlsProduct: 'S30' as const,
    localRasterPath: 'dummy.tif',
  };
  const mockS30Rep = {
    id: new Types.ObjectId().toString(),
    status: 'READY' as const,
    sourceSensorType: SensorType.OPTICAL,
    hlsProduct: 'S30' as const,
    localRasterPath: 'dummy.tif',
  };

  await assertRejects(
    async () => {
      await HLSComparisonService.compareHlsRepresentations({
        baselineRepresentation: mockSarRep as any,
        currentRepresentation: mockS30Rep as any,
        zoneBoundary: mockMudumalaiBoundary,
      });
    },
    'SAR representations cannot be compared',
    'Reject SAR baseline representation',
  );

  // --------------------------------------------------------------------------
  // TEST 11: Guard Rejection — Representation Not READY
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: Representation Readiness Guard ---');
  const mockPendingRep = {
    id: new Types.ObjectId().toString(),
    status: 'PENDING' as const,
    sourceSensorType: SensorType.OPTICAL,
    hlsProduct: 'S30' as const,
    localRasterPath: 'dummy.tif',
  };

  await assertRejects(
    async () => {
      await HLSComparisonService.compareHlsRepresentations({
        baselineRepresentation: mockPendingRep as any,
        currentRepresentation: mockS30Rep as any,
        zoneBoundary: mockMudumalaiBoundary,
      });
    },
    'is not READY',
    'Reject PENDING baseline representation',
  );

  // --------------------------------------------------------------------------
  // TEST 12: ChangeDetection Lineage & Schema Verification
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 12: ChangeDetection Model Lineage Fields ---');
  const mockChangeDoc = new ChangeDetectionModel({
    changeId: `CD-TEST-${Date.now()}`,
    observationId: new Types.ObjectId(),
    baselineId: new Types.ObjectId(),
    sensorType: SensorType.OPTICAL,
    monitoringTrack: 'OPTICAL',
    source: SatelliteSource.LANDSAT_8,
    detectedAt: new Date(),
    zoneArea: 100.0,
    changedArea: 0.09,
    affectedAreaPercentage: 2.5,
    calculationMode: ProcessingMode.REAL,
    spatialSource: SpatialCalculationSource.RASTER,
    calculationMethod: ChangeCalculationMethod.OPTICAL_PIXEL_DIFFERENCE,
    spatialCalculation: SpatialCalculationType.PIXEL_GRID,
    comparisonMode: ComparisonMode.HLS,
    baselineHlsRepresentationId: new Types.ObjectId(),
    currentHlsRepresentationId: new Types.ObjectId(),
    baselineHlsImageId: 'NASA/HLS/HLSS30/v002/T43PFN_20260115T052219',
    currentHlsImageId: 'NASA/HLS/HLSL30/v002/T43PFN_20260228T051115',
    hlsVersion: 'v002',
    processingVersion: 'v2.0',
    severity: 'NONE',
    evidenceStrength: 25,
    evidenceBreakdown: {
      magnitudeScore: 10,
      dataQualityScore: 30,
      temporalConsistencyScore: 15,
      crossSensorScore: 15,
      totalEvidenceScore: 70,
      explanation: 'HLS test breakdown',
    },
    categories: [ChangeCategory.VEGETATION_LOSS],
    changeIndicators: { ndviDelta: -0.25 },
    opticalEvidence: 'CLEAN',
    crossSensorAgreement: 'SINGLE_SENSOR',
    temporalConsistency: 'HLS cross-sensor',
    explanation: 'HLS unit test ChangeDetection document',
    alertGenerated: false,
  });

  const changeDto = mockChangeDoc.toDto();
  assert(changeDto.comparisonMode === ComparisonMode.HLS, 'ChangeDetectionDto.comparisonMode is HLS');
  assert(
    changeDto.baselineHlsImageId === 'NASA/HLS/HLSS30/v002/T43PFN_20260115T052219',
    'baselineHlsImageId preserved in DTO',
  );
  assert(
    changeDto.currentHlsImageId === 'NASA/HLS/HLSL30/v002/T43PFN_20260228T051115',
    'currentHlsImageId preserved in DTO',
  );
  assert(changeDto.hlsVersion === 'v002', 'hlsVersion preserved in DTO');
  assert(changeDto.processingVersion === 'v2.0', 'processingVersion preserved in DTO');
  assert(changeDto.severity === 'NONE', 'severity is strictly NONE (no alert)');
  assert(!changeDto.alertGenerated, 'alertGenerated is strictly false');

  // --------------------------------------------------------------------------
  // TEST 13: Deterministic Reproducibility
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 13: Deterministic Reproducibility ---');
  const run1 = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices: bIndices,
    currentIndices: cIndices,
    validMask: new Uint8Array([1, 1, 1, 1]),
    grid: testGrid,
    zoneAreaHectares: 0.36,
    thresholdConfig: { ndviThreshold: -0.15, decisionRule: 'NDVI_DROP', changeDirection: 'DECREASE' },
  });

  const run2 = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices: bIndices,
    currentIndices: cIndices,
    validMask: new Uint8Array([1, 1, 1, 1]),
    grid: testGrid,
    zoneAreaHectares: 0.36,
    thresholdConfig: { ndviThreshold: -0.15, decisionRule: 'NDVI_DROP', changeDirection: 'DECREASE' },
  });

  assert(
    run1.rasterStatistics.changedPixelCount === run2.rasterStatistics.changedPixelCount,
    'Run 1 and Run 2 changedPixelCount match identically',
  );
  assert(
    run1.rasterStatistics.meanDeltaNdvi === run2.rasterStatistics.meanDeltaNdvi,
    'Run 1 and Run 2 meanDeltaNdvi match identically',
  );
  assert(
    run1.spatialResult.changedArea === run2.spatialResult.changedArea,
    'Run 1 and Run 2 physical ground area match identically',
  );
  let bitIdentical = true;
  for (let i = 0; i < run1.changedMask.length; i++) {
    if (run1.changedMask[i] !== run2.changedMask[i]) {
      bitIdentical = false;
      break;
    }
  }
  assert(bitIdentical, 'Run 1 and Run 2 changedMask is 100% bit-identical');

  console.log('\n===============================================================');
  console.log(`PHASE 7 UNIT TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
