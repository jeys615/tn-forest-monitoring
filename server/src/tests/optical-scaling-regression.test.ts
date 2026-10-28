import assert from 'node:assert';
import { OpticalPixelIndexService } from '../services/spatial/OpticalPixelIndexService.js';
import {
  OpticalPixelChangeDetector,
  DEFAULT_OPTICAL_THRESHOLD_CONFIG,
} from '../services/changeDetection/OpticalPixelChangeDetector.js';
import { GeoTiffService, type ParsedGeoTiffRaster } from '../services/raster/GeoTiffService.js';
import type { HarmonizedOpticalRaster } from '../services/spatial/OpticalSpatialHarmonizationService.js';
import type { AnalysisGridDto } from '@tn-forest/shared/types';

console.log('\n================================================================');
console.log('🧪 SENSOR-SPECIFIC OPTICAL SCALING & REGRESSION TEST SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function reportPass(message: string) {
  passedTests++;
  totalTests++;
  console.log(`  ✅ [${totalTests}] PASS: ${message}`);
}

function reportFail(message: string, error: unknown) {
  totalTests++;
  console.error(`  ❌ [${totalTests}] FAIL: ${message}`, error);
  throw error;
}

const testW = 100;
const testH = 10;
const totalPx = testW * testH;

const mockGrid: AnalysisGridDto = {
  width: testW,
  height: testH,
  crs: 'EPSG:32643',
  originX: 819510,
  originY: 1140140,
  pixelSizeX: 10,
  pixelSizeY: 10,
  minX: 819510,
  minY: 1139140,
  maxX: 820510,
  maxY: 1140140,
  transform: [819510, 10, 0, 1140140, 0, -10],
};

const validMaskAll = new Uint8Array(totalPx).fill(1);

// -------------------------------------------------------------------------------------------------
// GATE 1: Sentinel-2 with Peak Cloud/Specular DN = 16,090 Must NOT Switch to Landsat
// -------------------------------------------------------------------------------------------------
console.log('--- GATE 1: Sentinel-2 Reflectance Scaling with Peak Cloud DN = 16,090 ---');
try {
  const nirBands = new Float32Array(totalPx).fill(2500); // Typical forest canopy DN = 2500 (25% reflectance)
  nirBands[0] = 16090; // Saturated cloud/specular highlight pixel from real baseline scene
  const redBands = new Float32Array(totalPx).fill(400);  // Typical canopy Red DN = 400 (4% reflectance)

  const s2Raster: HarmonizedOpticalRaster = {
    grid: mockGrid,
    blue: new Float32Array(totalPx).fill(300),
    green: new Float32Array(totalPx).fill(500),
    red: redBands,
    nir: nirBands,
    swir1: new Float32Array(totalPx).fill(1000),
    swir2: new Float32Array(totalPx).fill(500),
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 100, height: 10 },
    satellite: 'Sentinel-2',
  };

  const norm = OpticalPixelIndexService.normalizeReflectanceBands(s2Raster);

  // 1. Cloud peak pixel DN 16,090: scaled with 0.0001 = 1.609 -> clamped to 1.0
  assert(
    Math.abs(norm.nir[0] - 1.0) < 1e-5,
    `Cloud pixel must clamp to 1.0 (got ${norm.nir[0]})`,
  );

  // 2. Canopy pixel DN 2,500: scaled with 0.0001 = 0.2500
  // CRITICAL: Under legacy Landsat formula (2500 * 0.0000275 - 0.2 = -0.13125), this collapsed to 0.0!
  assert(
    Math.abs(norm.nir[1] - 0.25) < 1e-5,
    `Canopy NIR pixel must equal 0.25 (got ${norm.nir[1]}), proving Landsat formula was NOT triggered`,
  );
  assert(
    norm.nir[1] > 0.0,
    'Canopy NIR pixel must be strictly positive',
  );

  // 3. Canopy Red pixel DN 400: scaled with 0.0001 = 0.0400
  assert(
    Math.abs(norm.red[1] - 0.04) < 1e-5,
    `Canopy Red pixel must equal 0.04 (got ${norm.red[1]})`,
  );

  reportPass('Sentinel-2 scene with peak DN = 16,090 correctly uses DN * 0.0001 scaling across all canopy pixels');
} catch (err) {
  reportFail('Gate 1 failed', err);
}

// -------------------------------------------------------------------------------------------------
// GATE 2: Sentinel-2 Healthy Canopy NDVI Preserved Despite Cloud Saturation
// -------------------------------------------------------------------------------------------------
console.log('\n--- GATE 2: Sentinel-2 Healthy Canopy NDVI Calculation ---');
try {
  const nirBands = new Float32Array(totalPx).fill(2500);
  nirBands[0] = 16090; // Peak cloud
  const redBands = new Float32Array(totalPx).fill(400);

  const s2Raster: HarmonizedOpticalRaster = {
    grid: mockGrid,
    blue: new Float32Array(totalPx).fill(300),
    green: new Float32Array(totalPx).fill(500),
    red: redBands,
    nir: nirBands,
    swir1: new Float32Array(totalPx).fill(1000),
    swir2: new Float32Array(totalPx).fill(500),
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 100, height: 10 },
    satellite: 'Sentinel-2',
  };

  const { indices, summary } = OpticalPixelIndexService.calculatePixelIndices(s2Raster, validMaskAll);

  // Expected canopy NDVI: (0.25 - 0.04) / (0.25 + 0.04) = 0.21 / 0.29 ≈ 0.724138
  const expectedCanopyNdvi = (0.25 - 0.04) / (0.25 + 0.04);
  assert(
    Math.abs(indices.ndvi[1] - expectedCanopyNdvi) < 1e-4,
    `Canopy NDVI must equal ~0.7241 (got ${indices.ndvi[1]})`,
  );
  assert(
    indices.ndvi[1] > 0.70,
    `Canopy NDVI must be in healthy forest range > 0.70 (got ${indices.ndvi[1]})`,
  );

  // Mean NDVI across the scene must be healthy (~0.72), NOT 0.0018
  assert(
    summary.ndviMean > 0.70,
    `Summary NDVI mean must be > 0.70 (got ${summary.ndviMean})`,
  );

  reportPass('Sentinel-2 canopy NDVI verified at ~0.724 (eliminates artificial near-zero NDVI anomaly)');
} catch (err) {
  reportFail('Gate 2 failed', err);
}

// -------------------------------------------------------------------------------------------------
// GATE 3: Landsat Collection 2 Level-2 Surface Reflectance Scaling
// -------------------------------------------------------------------------------------------------
console.log('\n--- GATE 3: Landsat Collection 2 Level-2 Reflectance Scaling ---');
try {
  const landsatRaster: HarmonizedOpticalRaster = {
    grid: mockGrid,
    blue: new Float32Array(totalPx).fill(8000),
    green: new Float32Array(totalPx).fill(8000),
    red: new Float32Array(totalPx).fill(8000),   // DN 8000 * 0.0000275 - 0.2 = 0.02
    nir: new Float32Array(totalPx).fill(20000),  // DN 20000 * 0.0000275 - 0.2 = 0.35
    swir1: new Float32Array(totalPx).fill(10000), // DN 10000 * 0.0000275 - 0.2 = 0.075
    swir2: new Float32Array(totalPx).fill(8000),
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 100, height: 10 },
    satellite: 'Landsat-8',
  };

  const norm = OpticalPixelIndexService.normalizeReflectanceBands(landsatRaster);

  const expectedL8Nir = 20000 * 0.0000275 - 0.2; // 0.350
  const expectedL8Red = 8000 * 0.0000275 - 0.2;  // 0.020
  assert(
    Math.abs(norm.nir[0] - expectedL8Nir) < 1e-4,
    `Landsat NIR must equal ${expectedL8Nir} (got ${norm.nir[0]})`,
  );
  assert(
    Math.abs(norm.red[0] - expectedL8Red) < 1e-4,
    `Landsat Red must equal ${expectedL8Red} (got ${norm.red[0]})`,
  );

  reportPass('Landsat Collection 2 Level-2 formula (DN * 0.0000275 - 0.2) verified for explicit Landsat-8');
} catch (err) {
  reportFail('Gate 3 failed', err);
}

// -------------------------------------------------------------------------------------------------
// GATE 4: NASA HLS V2.0 Scaling
// -------------------------------------------------------------------------------------------------
console.log('\n--- GATE 4: NASA HLS V2.0 Reflectance Scaling ---');
try {
  const hlsRaster: HarmonizedOpticalRaster = {
    grid: mockGrid,
    blue: new Float32Array(totalPx).fill(400),
    green: new Float32Array(totalPx).fill(600),
    red: new Float32Array(totalPx).fill(1000),   // DN 1000 * 0.0001 = 0.10
    nir: new Float32Array(totalPx).fill(4500),   // DN 4500 * 0.0001 = 0.45
    swir1: new Float32Array(totalPx).fill(1200),
    swir2: new Float32Array(totalPx).fill(600),
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 100, height: 10 },
    satellite: 'HLS-S30',
  };

  const norm = OpticalPixelIndexService.normalizeReflectanceBands(hlsRaster);
  assert(
    Math.abs(norm.nir[0] - 0.45) < 1e-5,
    `HLS NIR must equal 0.45 (got ${norm.nir[0]})`,
  );
  assert(
    Math.abs(norm.red[0] - 0.10) < 1e-5,
    `HLS Red must equal 0.10 (got ${norm.red[0]})`,
  );

  reportPass('NASA HLS scaling (DN * 0.0001) verified for HLS-S30');
} catch (err) {
  reportFail('Gate 4 failed', err);
}

// -------------------------------------------------------------------------------------------------
// GATE 5: Pre-Normalized Float32 Reflectance Passthrough
// -------------------------------------------------------------------------------------------------
console.log('\n--- GATE 5: Pre-Normalized Float32 Reflectance Passthrough ---');
try {
  const floatRaster: HarmonizedOpticalRaster = {
    grid: mockGrid,
    blue: new Float32Array(totalPx).fill(0.05),
    green: new Float32Array(totalPx).fill(0.08),
    red: new Float32Array(totalPx).fill(0.04),
    nir: new Float32Array(totalPx).fill(0.35),
    swir1: new Float32Array(totalPx).fill(0.12),
    swir2: new Float32Array(totalPx).fill(0.06),
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 100, height: 10 },
    satellite: 'Sentinel-2',
  };

  const norm = OpticalPixelIndexService.normalizeReflectanceBands(floatRaster);
  assert(
    Math.abs(norm.nir[0] - 0.35) < 1e-5,
    `Pre-normalized NIR must remain 0.35 (got ${norm.nir[0]})`,
  );
  assert(
    Math.abs(norm.red[0] - 0.04) < 1e-5,
    `Pre-normalized Red must remain 0.04 (got ${norm.red[0]})`,
  );

  reportPass('Pre-normalized float reflectance in [0.0, 1.0] passes through without double-scaling');
} catch (err) {
  reportFail('Gate 5 failed', err);
}

// -------------------------------------------------------------------------------------------------
// GATE 6: GeoTiffService Metadata-Grounded Scaling & Safe Fallback
// -------------------------------------------------------------------------------------------------
console.log('\n--- GATE 6: GeoTiffService Metadata-Grounded Scaling ---');
try {
  const parsedMock: ParsedGeoTiffRaster = {
    metadata: {
      width: 10,
      height: 10,
      numBands: 6,
      crs: 'EPSG:32643',
      originalCrs: 'EPSG:32643',
      normalizedCrs: 'EPSG:32643',
      areaCalculationCrs: 'EPSG:32643',
      pixelScale: [10, 10, 0],
      tiePoint: [0, 0, 0, 0, 0, 0],
      bbox: [0, 0, 100, 100],
      nodata: 0,
      bitsPerSample: [16, 16, 16, 16, 16, 16],
      pixelAreaM2: 100,
      isProjectedMetric: true,
    },
    bandData: [
      new Float32Array(100).fill(300),  // Blue
      new Float32Array(100).fill(500),  // Green
      new Float32Array(100).fill(400),  // Red (DN = 400)
      new Float32Array(100).fill(2500), // NIR (DN = 2500)
      new Float32Array(100).fill(1000), // SWIR1
      new Float32Array(100).fill(500),  // SWIR2
    ],
    bandNames: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
  };

  // Inject peak DN 16,090 in Red/NIR to test that heuristic is gone
  parsedMock.bandData[2][0] = 16090; // Peak in Red
  parsedMock.bandData[3][0] = 16090; // Peak in NIR

  // 1. Explicit Sentinel-2
  const s2Indices = GeoTiffService.calculateSpectralIndices(parsedMock, { satellite: 'Sentinel-2' });
  assert(
    s2Indices.ndvi > 0.65,
    `Sentinel-2 NDVI must be in healthy range > 0.65 (got ${s2Indices.ndvi}) despite peak DN 16090`,
  );

  // 2. Explicit Landsat-8
  const parsedLandsatMock: ParsedGeoTiffRaster = {
    ...parsedMock,
    bandData: [
      new Float32Array(100).fill(8000),
      new Float32Array(100).fill(8000),
      new Float32Array(100).fill(8000),  // Red
      new Float32Array(100).fill(20000), // NIR
      new Float32Array(100).fill(10000), // SWIR1
      new Float32Array(100).fill(8000),
    ],
  };
  const l8Indices = GeoTiffService.calculateSpectralIndices(parsedLandsatMock, { satellite: 'Landsat-8' });
  // NIR = 0.35, Red = 0.02 -> NDVI = (0.35 - 0.02) / (0.35 + 0.02) = 0.33 / 0.37 ≈ 0.892
  assert(
    l8Indices.ndvi > 0.80,
    `Landsat NDVI must reflect C2 L2 scaling (got ${l8Indices.ndvi})`,
  );

  // 3. Sensor metadata unavailable: should default explicitly to Sentinel-2 without crashing
  const defaultIndices = GeoTiffService.calculateSpectralIndices(parsedMock);
  assert(
    defaultIndices.ndvi > 0.65,
    `Default without metadata must safely use Sentinel-2 scaling (got ${defaultIndices.ndvi})`,
  );

  reportPass('GeoTiffService.calculateSpectralIndices resolves sensor from explicit metadata and safely defaults to Sentinel-2');
} catch (err) {
  reportFail('Gate 6 failed', err);
}

// -------------------------------------------------------------------------------------------------
// GATE 7: Multi-Temporal Optical Change Detection with Clouded Baseline Scene
// -------------------------------------------------------------------------------------------------
console.log('\n--- GATE 7: Multi-Temporal Change Detection (Baseline Cloud vs Current Disturbance) ---');
try {
  // Baseline: healthy canopy (DN = 2500, NDVI ≈ 0.724) with a bright cloud pixel (DN = 16,090)
  const baseNir = new Float32Array(totalPx).fill(2500);
  baseNir[0] = 16090; // Cloud pixel in baseline
  const baseRed = new Float32Array(totalPx).fill(400);

  const baselineRaster: HarmonizedOpticalRaster = {
    grid: mockGrid,
    blue: new Float32Array(totalPx).fill(300),
    green: new Float32Array(totalPx).fill(500),
    red: baseRed,
    nir: baseNir,
    swir1: new Float32Array(totalPx).fill(1000),
    swir2: new Float32Array(totalPx).fill(500),
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 100, height: 10 },
    satellite: 'Sentinel-2',
  };

  // Current: 50% of pixels have suffered severe canopy drop (e.g. tree loss, clearing)
  // Canopy loss pixels: NIR drops to 1200, Red increases to 900 -> NDVI = (0.12 - 0.09) / (0.12 + 0.09) = 0.03 / 0.21 ≈ 0.1429
  // ΔNDVI = 0.1429 - 0.7241 = -0.5812 <= -0.15 (flagged as CANOPY_LOSS)
  const curNir = new Float32Array(totalPx).fill(2500);
  curNir[0] = 16090; // Stable high-DN cloud pixel in both scenes
  const curRed = new Float32Array(totalPx).fill(400);
  for (let i = 1; i <= 500; i++) {
    curNir[i] = 1200;
    curRed[i] = 900;
  }

  const currentRaster: HarmonizedOpticalRaster = {
    grid: mockGrid,
    blue: new Float32Array(totalPx).fill(300),
    green: new Float32Array(totalPx).fill(500),
    red: curRed,
    nir: curNir,
    swir1: new Float32Array(totalPx).fill(1000),
    swir2: new Float32Array(totalPx).fill(500),
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32643',
    sourceDimensions: { width: 100, height: 10 },
    satellite: 'Sentinel-2',
  };

  const baseInd = OpticalPixelIndexService.calculatePixelIndices(baselineRaster, validMaskAll);
  const curInd = OpticalPixelIndexService.calculatePixelIndices(currentRaster, validMaskAll);

  const changeDet = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices: baseInd.indices,
    currentIndices: curInd.indices,
    validMask: validMaskAll,
    grid: mockGrid,
    zoneAreaHectares: 10.0,
    thresholdConfig: DEFAULT_OPTICAL_THRESHOLD_CONFIG,
    baselineSensor: 'Sentinel-2',
    currentSensor: 'Sentinel-2',
  });

  // Verify:
  // 1. Exactly 500 disturbed pixels are detected
  assert(
    changeDet.spatialResult.changedPixels === 500,
    `Exactly 500 changed pixels must be detected (got ${changeDet.spatialResult.changedPixels})`,
  );

  // 2. Mean delta NDVI is negative, proving real canopy loss is NOT hidden by +0.74 anomaly
  assert(
    changeDet.rasterStatistics.meanDeltaNdvi < 0.0,
    `Mean delta NDVI must be negative (got ${changeDet.rasterStatistics.meanDeltaNdvi})`,
  );

  // 3. Affected area percentage is 50.0%
  assert(
    Math.abs(changeDet.spatialResult.affectedAreaPercentage - 50.0) < 1e-2,
    `Affected area percentage must be 50.0% (got ${changeDet.spatialResult.affectedAreaPercentage}%)`,
  );

  reportPass('Multi-temporal change detector accurately identifies genuine canopy loss when baseline contains clouds');
} catch (err) {
  reportFail('Gate 7 failed', err);
}

// -------------------------------------------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} REGRESSION TEST GATES PASSED! (100%)`);
console.log('================================================================\n');
process.exit(0);
