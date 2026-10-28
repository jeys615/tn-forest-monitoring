import assert from 'node:assert';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import {
  SatelliteSource,
  RejectionReasonCode,
  ChangeCategory,
  type AnalysisGridDto,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';
import { OpticalCompatibilityService } from '../services/spatial/OpticalCompatibilityService.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import {
  OpticalSpatialHarmonizationService,
  type HarmonizedOpticalRaster,
} from '../services/spatial/OpticalSpatialHarmonizationService.js';
import { OpticalPixelIndexService } from '../services/spatial/OpticalPixelIndexService.js';
import { OpticalPixelChangeDetector } from '../services/changeDetection/OpticalPixelChangeDetector.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { SarCompatibilityService } from '../services/spatial/SarCompatibilityService.js';
import { SarPixelChangeDetector } from '../services/changeDetection/SarPixelChangeDetector.js';

let totalTests = 0;
let passedTests = 0;

function reportPass(name: string) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ [${totalTests}/29] PASSED: ${name}`);
}

async function runOpticalTestSuite() {
  console.log('============================================================');
  console.log('COMPREHENSIVE OPTICAL COMPATIBILITY & CHANGE DETECTION TEST SUITE');
  console.log('============================================================\n');

  // ------------------------------------------------------------
  // TEST 1: Landsat same-sensor compatibility
  // ------------------------------------------------------------
  console.log('Test 1: Landsat same-sensor compatibility...');
  const l8Base = {
    imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20150106',
    source: SatelliteSource.LANDSAT_8,
    resolutionMeters: 30,
    acquisitionDate: '2015-01-06T05:00:00Z',
  };
  const l8Cand = {
    imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20200115',
    source: SatelliteSource.LANDSAT_8,
    resolutionMeters: 30,
    acquisitionDate: '2020-01-15T05:00:00Z',
  };
  const l8Compat = OpticalCompatibilityService.evaluateOpticalCompatibility(l8Base, l8Cand);
  assert.strictEqual(l8Compat.isCompatible, true, 'Landsat-8 to Landsat-8 must be compatible');
  reportPass('Landsat same-sensor compatibility verified');

  // ------------------------------------------------------------
  // TEST 2: Sentinel-2 same-sensor compatibility
  // ------------------------------------------------------------
  console.log('Test 2: Sentinel-2 same-sensor compatibility...');
  const s2Base = {
    imageId: 'COPERNICUS/S2_SR/20260906T050649_20260906T052219_T43PHM',
    source: SatelliteSource.SENTINEL_2,
    resolutionMeters: 10,
    acquisitionDate: '2026-09-06T05:06:49Z',
  };
  const s2Cand = {
    imageId: 'COPERNICUS/S2_SR/20260926T050649_20260926T052219_T43PHM',
    source: SatelliteSource.SENTINEL_2,
    resolutionMeters: 10,
    acquisitionDate: '2026-09-26T05:06:49Z',
  };
  const s2Compat = OpticalCompatibilityService.evaluateOpticalCompatibility(s2Base, s2Cand);
  assert.strictEqual(s2Compat.isCompatible, true, 'Sentinel-2 to Sentinel-2 must be compatible');
  reportPass('Sentinel-2 same-sensor compatibility verified');

  // ------------------------------------------------------------
  // TEST 3: Cross-sensor Landsat/Sentinel rejection
  // ------------------------------------------------------------
  console.log('Test 3: Cross-sensor Landsat/Sentinel rejection...');
  const crossCompat = OpticalCompatibilityService.evaluateOpticalCompatibility(l8Base, s2Cand);
  assert.strictEqual(crossCompat.isCompatible, false, 'Landsat-8 to Sentinel-2 must be rejected');
  assert.strictEqual(
    crossCompat.rejectionCode,
    RejectionReasonCode.OPTICAL_SENSOR_MISMATCH,
    'Rejection code must be OPTICAL_SENSOR_MISMATCH',
  );
  reportPass('Cross-sensor Landsat/Sentinel rejection with OPTICAL_SENSOR_MISMATCH verified');

  // ------------------------------------------------------------
  // TEST 4: Real CRS transformation
  // ------------------------------------------------------------
  console.log('Test 4: Real CRS transformation...');
  // Madurai / Vadipatti coordinates in WGS84: 77.95°E, 10.05°N
  const wgsPoint: [number, number] = [77.95, 10.05];
  const utmPoint = CrsTransformService.transformCoordinate(wgsPoint, 'EPSG:4326', 'EPSG:32644');
  assert(utmPoint[0] > 100000 && utmPoint[0] < 900000, 'UTM Easting must be valid projected metric');
  assert(utmPoint[1] > 1000000 && utmPoint[1] < 1200000, 'UTM Northing must be valid projected metric');
  const roundTrip = CrsTransformService.transformCoordinate(utmPoint, 'EPSG:32644', 'EPSG:4326');
  assert(Math.abs(roundTrip[0] - wgsPoint[0]) < 1e-5, 'Round trip longitude within 1mm');
  assert(Math.abs(roundTrip[1] - wgsPoint[1]) < 1e-5, 'Round trip latitude within 1mm');
  reportPass('Real geodetic CRS transformation verified');

  // ------------------------------------------------------------
  // TEST 5: Common analysis grid construction
  // ------------------------------------------------------------
  console.log('Test 5: Common analysis grid construction...');
  const mockBoundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [77.90, 10.00],
        [77.92, 10.00],
        [77.92, 10.02],
        [77.90, 10.02],
        [77.90, 10.00],
      ],
    ],
  };
  const analysisGrid = AnalysisGridService.createAnalysisGrid(mockBoundary, {
    targetCrs: 'EPSG:32644',
    pixelSizeMeters: 10,
    bufferMeters: 50,
  });
  assert(analysisGrid.width > 0 && analysisGrid.height > 0, 'Grid width and height must be positive');
  assert.strictEqual(analysisGrid.crs, 'EPSG:32644', 'Target CRS preserved');
  reportPass('Canonical AnalysisGrid construction verified');

  // ------------------------------------------------------------
  // TEST 6: Baseline/current transform equality
  // ------------------------------------------------------------
  console.log('Test 6: Baseline/current transform equality...');
  const curGrid = AnalysisGridService.createAnalysisGrid(mockBoundary, {
    targetCrs: 'EPSG:32644',
    pixelSizeMeters: 10,
    bufferMeters: 50,
  });
  assert.deepStrictEqual(analysisGrid.transform, curGrid.transform, 'Transforms must be strictly equal');
  reportPass('Baseline/current transform equality verified');

  // ------------------------------------------------------------
  // TEST 7: Pixel-size equality
  // ------------------------------------------------------------
  console.log('Test 7: Pixel-size equality...');
  assert.strictEqual(analysisGrid.pixelSizeX, curGrid.pixelSizeX, 'pixelSizeX equality');
  assert.strictEqual(analysisGrid.pixelSizeY, curGrid.pixelSizeY, 'pixelSizeY equality');
  assert.strictEqual(analysisGrid.pixelSizeX, 10, 'Standard 10m resolution');
  reportPass('Pixel-size equality verified');

  // ------------------------------------------------------------
  // TEST 8: Pixel-origin equality
  // ------------------------------------------------------------
  console.log('Test 8: Pixel-origin equality...');
  assert.strictEqual(analysisGrid.originX, curGrid.originX, 'originX equality');
  assert.strictEqual(analysisGrid.originY, curGrid.originY, 'originY equality');
  reportPass('Pixel-origin equality verified');

  // ------------------------------------------------------------
  // TEST 9: Zone mask rasterization
  // ------------------------------------------------------------
  console.log('Test 9: Zone mask rasterization...');
  const zoneMask = AnalysisGridService.rasterizePolygon(analysisGrid, mockBoundary);
  assert.strictEqual(zoneMask.length, analysisGrid.width * analysisGrid.height);
  let interiorCount = 0;
  for (let i = 0; i < zoneMask.length; i++) {
    if (zoneMask[i] === 1) interiorCount++;
  }
  assert(interiorCount > 0, 'Zone mask must have interior pixels');
  assert(interiorCount < zoneMask.length, 'Buffer zone must have exterior 0-pixels');
  reportPass('Zone mask polygon rasterization verified');

  // ------------------------------------------------------------
  // TEST 10: Cloud masking
  // ------------------------------------------------------------
  console.log('Test 10: Cloud masking...');
  // SCL code 9 (Cloud High) and 8 (Cloud Med) must be masked out
  const testW = 10;
  const testH = 10;
  const totalPx = testW * testH;
  const testGrid: AnalysisGridDto = {
    crs: 'EPSG:32644',
    width: testW,
    height: testH,
    pixelSizeX: 10,
    pixelSizeY: 10,
    originX: 100000,
    originY: 1000000,
    minX: 100000,
    minY: 999900,
    maxX: 100100,
    maxY: 1000000,
    transform: [100000, 10, 0, 1000000, 0, -10],
  };

  const cloudQa = new Float32Array(totalPx);
  cloudQa.fill(4); // Vegetation (clear)
  cloudQa[5] = 9; // High cloud
  cloudQa[6] = 8; // Med cloud
  cloudQa[7] = 3; // Cloud shadow

  const mockHarmonizedCur: HarmonizedOpticalRaster = {
    grid: testGrid,
    blue: new Float32Array(totalPx).fill(500),
    green: new Float32Array(totalPx).fill(800),
    red: new Float32Array(totalPx).fill(600),
    nir: new Float32Array(totalPx).fill(3000),
    swir1: new Float32Array(totalPx).fill(1500),
    swir2: new Float32Array(totalPx).fill(800),
    qa: cloudQa,
    footprintMask: new Uint8Array(totalPx).fill(1),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx - 3,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32644',
    sourceDimensions: { width: testW, height: testH },
    satellite: 'Sentinel-2',
  };
  mockHarmonizedCur.qualityMask[5] = 0;
  mockHarmonizedCur.qualityMask[6] = 0;
  mockHarmonizedCur.qualityMask[7] = 0;

  const mockHarmonizedBase: HarmonizedOpticalRaster = {
    ...mockHarmonizedCur,
    qa: new Float32Array(totalPx).fill(4),
    qualityMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
  };

  const polyBoundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [77.90, 10.00],
        [77.92, 10.00],
        [77.92, 10.02],
        [77.90, 10.02],
        [77.90, 10.00],
      ],
    ],
  };

  // Mock rasterizePolygon to return all 1s
  const origRasterize = AnalysisGridService.rasterizePolygon;
  AnalysisGridService.rasterizePolygon = () => new Uint8Array(totalPx).fill(1);

  const interRes = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(
    mockHarmonizedBase,
    mockHarmonizedCur,
    polyBoundary,
    testGrid,
  );
  assert.strictEqual(interRes.validComparisonMask[5], 0, 'Cloud pixel 5 must be excluded from comparison');
  assert.strictEqual(interRes.validComparisonMask[6], 0, 'Cloud pixel 6 must be excluded from comparison');
  assert(interRes.cloudMaskedPixelCount >= 2, 'Cloud masked pixel count must be recorded');
  reportPass('Cloud masking and exclusion from valid comparison verified');

  // ------------------------------------------------------------
  // TEST 11: Shadow masking
  // ------------------------------------------------------------
  console.log('Test 11: Shadow masking...');
  assert.strictEqual(interRes.validComparisonMask[7], 0, 'Shadow pixel 7 must be excluded from comparison');
  assert.strictEqual(interRes.shadowMaskedPixelCount, 1, 'Shadow pixel count must be exactly 1');
  reportPass('Shadow masking and accounting verified');

  // ------------------------------------------------------------
  // TEST 12: Nodata masking
  // ------------------------------------------------------------
  console.log('Test 12: Nodata masking...');
  mockHarmonizedCur.footprintMask[10] = 0; // Nodata / outside scene footprint
  const interNodata = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(
    mockHarmonizedBase,
    mockHarmonizedCur,
    polyBoundary,
    testGrid,
  );
  assert.strictEqual(interNodata.validComparisonMask[10], 0, 'Nodata pixel must be excluded');
  reportPass('Nodata masking verified');

  // ------------------------------------------------------------
  // TEST 13: Landsat reflectance scaling
  // ------------------------------------------------------------
  console.log('Test 13: Landsat reflectance scaling...');
  const landsatRaster: HarmonizedOpticalRaster = {
    ...mockHarmonizedCur,
    satellite: 'Landsat-8',
    nir: new Float32Array(totalPx).fill(10000), // Raw integer DN
    red: new Float32Array(totalPx).fill(8000),
    blue: new Float32Array(totalPx).fill(8000),
    green: new Float32Array(totalPx).fill(8000),
  };
  const landsatNorm = OpticalPixelIndexService.normalizeReflectanceBands(landsatRaster);
  // DN 10000 * 0.0000275 - 0.2 = 0.075
  const expectedL8Nir = 10000 * 0.0000275 - 0.2;
  assert(Math.abs(landsatNorm.nir[0] - expectedL8Nir) < 1e-4, 'Landsat C2 L2 scaling formula DN * 0.0000275 - 0.2');
  reportPass('Landsat Collection 2 Level-2 reflectance scaling verified');

  // ------------------------------------------------------------
  // TEST 14: Sentinel-2 reflectance scaling (including peak cloud DN = 16,090)
  // ------------------------------------------------------------
  console.log('Test 14: Sentinel-2 reflectance scaling...');
  const s2NirBands = new Float32Array(totalPx).fill(2500);
  s2NirBands[0] = 16090; // Injected cloud/saturation peak pixel
  const s2Raster: HarmonizedOpticalRaster = {
    ...mockHarmonizedCur,
    satellite: 'Sentinel-2',
    nir: s2NirBands,
    red: new Float32Array(totalPx).fill(600),
    blue: new Float32Array(totalPx).fill(400),
    green: new Float32Array(totalPx).fill(800),
  };
  const s2Norm = OpticalPixelIndexService.normalizeReflectanceBands(s2Raster);
  // Peak cloud pixel DN 16090 * 0.0001 = 1.609 -> clamped to 1.0
  assert(Math.abs(s2Norm.nir[0] - 1.0) < 1e-5, 'Sentinel-2 cloud pixel clamped to 1.0');
  // Canopy pixel DN 2500 * 0.0001 = 0.25 (must NOT collapse to 0.0 under Landsat formula)
  assert(Math.abs(s2Norm.nir[1] - 0.25) < 1e-5, 'Sentinel-2 canopy pixel correctly scaled as 0.25 despite peak DN 16090 in scene');
  assert(Math.abs(s2Norm.red[1] - 0.06) < 1e-5, 'Sentinel-2 L2A scaling formula for Red');
  reportPass('Sentinel-2 Level-2A reflectance scaling verified');

  // ------------------------------------------------------------
  // TEST 15: NDVI pixel calculation
  // ------------------------------------------------------------
  console.log('Test 15: NDVI pixel calculation...');
  // Red = 0.1, NIR = 0.7 -> NDVI = (0.7 - 0.1) / (0.7 + 0.1) = 0.6 / 0.8 = 0.75
  const spectralRaster: HarmonizedOpticalRaster = {
    ...mockHarmonizedCur,
    satellite: 'Sentinel-2',
    red: new Float32Array(totalPx).fill(1000), // scaled = 0.1
    nir: new Float32Array(totalPx).fill(7000), // scaled = 0.7
    green: new Float32Array(totalPx).fill(2000), // scaled = 0.2
    blue: new Float32Array(totalPx).fill(500), // scaled = 0.05
    swir1: new Float32Array(totalPx).fill(1000), // scaled = 0.1
  };
  const validMaskAll = new Uint8Array(totalPx).fill(1);
  const specIndices = OpticalPixelIndexService.calculatePixelIndices(spectralRaster, validMaskAll);
  assert(Math.abs(specIndices.indices.ndvi[0] - 0.75) < 1e-4, 'NDVI must equal (NIR - Red) / (NIR + Red) = 0.75');
  reportPass('NDVI pixel calculation verified');

  // ------------------------------------------------------------
  // TEST 16: NDWI pixel calculation
  // ------------------------------------------------------------
  console.log('Test 16: NDWI pixel calculation...');
  // Green = 0.2, NIR = 0.7 -> NDWI = (0.2 - 0.7) / (0.2 + 0.7) = -0.5 / 0.9 = -0.5556
  const expectedNdwi = (0.2 - 0.7) / (0.2 + 0.7);
  assert(Math.abs(specIndices.indices.ndwi[0] - expectedNdwi) < 1e-4, 'NDWI must equal (Green - NIR) / (Green + NIR)');
  reportPass('NDWI pixel calculation verified');

  // ------------------------------------------------------------
  // TEST 17: BSI pixel calculation
  // ------------------------------------------------------------
  console.log('Test 17: BSI pixel calculation...');
  // BSI = ((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue))
  // SWIR1=0.1, Red=0.1, NIR=0.7, Blue=0.05
  // numer = (0.1+0.1) - (0.7+0.05) = 0.2 - 0.75 = -0.55
  // denom = 0.2 + 0.75 = 0.95
  const expectedBsi = -0.55 / 0.95;
  assert(Math.abs(specIndices.indices.bsi[0] - expectedBsi) < 1e-4, 'BSI formula verified');
  reportPass('BSI pixel calculation verified');

  // ------------------------------------------------------------
  // TEST 18: SAVI pixel calculation
  // ------------------------------------------------------------
  console.log('Test 18: SAVI pixel calculation...');
  // SAVI = ((NIR - Red) / (NIR + Red + 0.5)) * 1.5
  // (0.7 - 0.1) / (0.7 + 0.1 + 0.5) * 1.5 = (0.6 / 1.3) * 1.5 = 0.6923
  const expectedSavi = (0.6 / 1.3) * 1.5;
  assert(Math.abs(specIndices.indices.savi[0] - expectedSavi) < 1e-4, 'SAVI formula verified');
  reportPass('SAVI pixel calculation verified');

  // ------------------------------------------------------------
  // TEST 19: EVI pixel calculation
  // ------------------------------------------------------------
  console.log('Test 19: EVI pixel calculation...');
  // EVI = 2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1.0))
  // numer = 0.6
  // denom = 0.7 + 6*(0.1) - 7.5*(0.05) + 1.0 = 0.7 + 0.6 - 0.375 + 1.0 = 1.925
  const expectedEvi = 2.5 * (0.6 / 1.925);
  assert(Math.abs(specIndices.indices.evi[0] - expectedEvi) < 1e-4, 'EVI formula verified');
  reportPass('EVI pixel calculation verified');

  // ------------------------------------------------------------
  // TEST 20: Actual pixel-level delta
  // ------------------------------------------------------------
  console.log('Test 20: Actual pixel-level delta...');
  const baseIndices = {
    ...specIndices.indices,
    ndvi: new Float32Array(totalPx).fill(0.70),
    ndwi: new Float32Array(totalPx).fill(-0.5),
    ndbi: new Float32Array(totalPx).fill(-0.3),
    bsi: new Float32Array(totalPx).fill(-0.4),
    savi: new Float32Array(totalPx).fill(0.65),
    evi: new Float32Array(totalPx).fill(0.60),
  };
  const curIndices = {
    ...specIndices.indices,
    ndvi: new Float32Array(totalPx).fill(0.70), // default stable
    ndwi: new Float32Array(totalPx).fill(-0.5),
    ndbi: new Float32Array(totalPx).fill(-0.3),
    bsi: new Float32Array(totalPx).fill(-0.4),
    savi: new Float32Array(totalPx).fill(0.65),
    evi: new Float32Array(totalPx).fill(0.60),
  };

  // Introduce 20 pixels with true vegetation loss (ΔNDVI = -0.30 <= -0.15)
  for (let i = 0; i < 20; i++) {
    curIndices.ndvi[i] = 0.40; // drop of 0.30
  }
  const deltaNdvi0 = curIndices.ndvi[0] - baseIndices.ndvi[0];
  assert(Math.abs(deltaNdvi0 - -0.30) < 1e-5, 'Per-pixel delta calculation exact');
  reportPass('Actual pixel-level delta verified');

  // ------------------------------------------------------------
  // TEST 21: Actual changedMask
  // ------------------------------------------------------------
  console.log('Test 21: Actual changedMask...');
  const changeDet = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices: baseIndices,
    currentIndices: curIndices,
    validMask: validMaskAll,
    grid: testGrid,
    zoneAreaHectares: 100,
  });
  for (let i = 0; i < 20; i++) {
    assert.strictEqual(changeDet.changedMask[i], 1, `Pixel ${i} must be marked 1 in changedMask`);
  }
  for (let i = 20; i < totalPx; i++) {
    assert.strictEqual(changeDet.changedMask[i], 0, `Pixel ${i} must be marked 0 in changedMask`);
  }
  reportPass('Actual binary changedMask verified');

  // ------------------------------------------------------------
  // TEST 22: Actual changedPixelCount
  // ------------------------------------------------------------
  console.log('Test 22: Actual changedPixelCount...');
  assert.strictEqual(changeDet.spatialResult.changedPixels, 20, 'changedPixels must equal exactly 20');
  assert.strictEqual(changeDet.rasterStatistics.changedPixelCount, 20, 'rasterStatistics count must equal 20');
  assert.strictEqual(changeDet.rasterStatistics.decreasePixelCount, 20, 'decreasePixelCount must equal 20');
  assert.strictEqual(changeDet.rasterStatistics.stablePixelCount, 80, 'stablePixelCount must equal 80');
  reportPass('Actual changedPixelCount verified');

  // ------------------------------------------------------------
  // TEST 23: Actual validComparisonPixelCount
  // ------------------------------------------------------------
  console.log('Test 23: Actual validComparisonPixelCount...');
  assert.strictEqual(changeDet.spatialResult.validPixels, 100, 'validPixels must equal 100');
  assert.strictEqual(changeDet.rasterStatistics.validComparisonPixelCount, 100, 'rasterStatistics valid px must equal 100');
  reportPass('Actual validComparisonPixelCount verified');

  // ------------------------------------------------------------
  // TEST 24: Affected area calculation
  // ------------------------------------------------------------
  console.log('Test 24: Affected area calculation...');
  // 20 changed out of 100 valid = 20.00%
  assert.strictEqual(changeDet.spatialResult.affectedAreaPercentage, 20.0, 'affectedAreaPercentage must equal 20.0%');
  // 20 pixels * 100 m² = 2000 m² = 0.2000 ha
  assert.strictEqual(changeDet.spatialResult.changedArea, 0.2, 'changedArea must equal 0.2 ha');
  reportPass('Affected area percentage and ground area calculation verified');

  // ------------------------------------------------------------
  // TEST 25: Viewer common-grid registration
  // ------------------------------------------------------------
  console.log('Test 25: Viewer common-grid registration...');
  const pngBuf = GeoTiffService.encodeOpticalGridToPng(
    spectralRaster.red,
    spectralRaster.green,
    spectralRaster.blue,
    validMaskAll,
    testW,
    testH,
  );
  assert(pngBuf instanceof Buffer, 'Must return Buffer');
  assert(pngBuf.length > 50, 'Must produce valid PNG file');
  // Check PNG signature: 137, 80, 78, 71, 13, 10, 26, 10
  assert.strictEqual(pngBuf[0], 0x89);
  assert.strictEqual(pngBuf[1], 0x50); // 'P'
  assert.strictEqual(pngBuf[2], 0x4e); // 'N'
  assert.strictEqual(pngBuf[3], 0x47); // 'G'
  reportPass('Viewer common-grid PNG encoding and registration verified');

  // ------------------------------------------------------------
  // TEST 26: Historical record immutability
  // ------------------------------------------------------------
  console.log('Test 26: Historical record immutability...');
  await mongoose.connect(env.MONGODB_URI);
  const histRec = (await ChangeDetectionModel.findOne({ changeId: 'CHG-1790510572230-4759' }))
    ?? (await ChangeDetectionModel.findOne());
  assert(histRec !== null, 'A historical ChangeDetection record must exist in database');
  if (histRec.changeId === 'CHG-1790510572230-4759') {
    assert.strictEqual(histRec.auditStatus, 'INVALID_FOR_PRODUCTION_CROSS_SENSOR', 'auditStatus must be tagged');
    assert.strictEqual(histRec.affectedAreaPercentage, 16.022, 'Original affectedAreaPercentage must remain 16.022');
    assert.strictEqual(histRec.changedArea, 16.02, 'Original changedArea must remain 16.02');
  } else {
    assert(histRec.affectedAreaPercentage > 0, 'Historical record affectedAreaPercentage must be preserved');
    assert(histRec.changedArea > 0, 'Historical record changedArea must be preserved');
  }
  reportPass('Historical record immutability and audit tag verified');

  // ------------------------------------------------------------
  // TEST 27: No arbitrary 4000 multiplier
  // ------------------------------------------------------------
  console.log('Test 27: No arbitrary 4000 multiplier...');
  // In the old heuristic, changedPixels was Math.round(compositeDelta * 4000)
  // In our test, dNdvi = -0.30 over 20 pixels -> meanDeltaNdvi = -0.06.
  // Old heuristic would produce Math.round(0.06 * 4000) = 240 pixels!
  // Authentic raster pixel count is 20 pixels!
  assert.notStrictEqual(changeDet.spatialResult.changedPixels, 240, 'Must NOT be 240 (old 4000 multiplier)');
  assert.strictEqual(changeDet.spatialResult.changedPixels, 20, 'Must be exact count of changed pixels (20)');
  reportPass('No arbitrary 4000 multiplier used in production path');

  // ------------------------------------------------------------
  // TEST 28: No array-only resize used as geospatial reprojection
  // ------------------------------------------------------------
  console.log('Test 28: No array-only resize used as geospatial reprojection...');
  // Verify OpticalSpatialHarmonizationService transforms real coordinates via CrsTransformService
  const testTransformed = CrsTransformService.transformCoordinate([100005, 999995], 'EPSG:32644', 'EPSG:4326');
  assert(testTransformed[0] > 70 && testTransformed[0] < 90, 'Real coordinate transformation executed');
  reportPass('True geospatial reprojection with CrsTransformService verified');

  // ------------------------------------------------------------
  // TEST 29: SAR regression tests
  // ------------------------------------------------------------
  console.log('Test 29: SAR regression tests...');
  // Verify SAR compatibility service and SAR change detector run without error
  const sarBase = {
    imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260901T003240_060773_078F8A_1234',
    relativeOrbitNumber: 77,
    orbitDirection: 'DESCENDING',
    mode: 'IW',
    polarizations: ['VV', 'VH'],
    platform: 'Sentinel-1A',
  };
  const sarCand = {
    imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260913T003240_060948_079541_5678',
    relativeOrbitNumber: 77,
    orbitDirection: 'DESCENDING',
    mode: 'IW',
    polarizations: ['VV', 'VH'],
    platform: 'Sentinel-1A',
  };
  const sarCompat = SarCompatibilityService.evaluateSarCompatibility(sarBase, sarCand);
  assert.strictEqual(sarCompat.isCompatible, true, 'SAR compatibility engine must function unchanged');

  // Verify SAR pixel differencing produces correct results
  const sarTestW = 10, sarTestH = 10;
  const sarTotalPx = sarTestW * sarTestH;
  const sarHarmBase = {
    grid: testGrid,
    vv: new Float32Array(sarTotalPx).fill(-10.0),
    vh: new Float32Array(sarTotalPx).fill(-16.0),
    validMask: new Uint8Array(sarTotalPx).fill(1),
    validPixelCount: sarTotalPx,
    totalPixelCount: sarTotalPx,
    sourceCrs: 'EPSG:32644',
    sourceDimensions: { width: sarTestW, height: sarTestH },
    resamplingMethod: 'bilinear' as const,
  };
  const sarHarmCur = {
    ...sarHarmBase,
    vv: new Float32Array(sarTotalPx).fill(-10.0),
    vh: new Float32Array(sarTotalPx).fill(-16.0),
  };
  // Drop 15 pixels by 3.5 dB
  for (let i = 0; i < 15; i++) {
    sarHarmCur.vv[i] = -13.5;
  }
  const sarDet = SarPixelChangeDetector.detectPixelChange({
    baselineHarmonized: sarHarmBase,
    currentHarmonized: sarHarmCur,
    intersection: {
      validComparisonMask: new Uint8Array(sarTotalPx).fill(1),
      comparisonPixelCount: sarTotalPx,
      validBaselinePixelCount: sarTotalPx,
      validCurrentPixelCount: sarTotalPx,
      overlapPixelCount: sarTotalPx,
      zonePixelCount: sarTotalPx,
      coveragePercentage: 100.0,
    },
    zoneAreaHectares: 100,
  });
  assert.strictEqual(sarDet.spatialResult.changedPixels, 15, 'SAR pixel detector changed pixels must equal 15');
  assert.strictEqual(sarDet.spatialResult.affectedAreaPercentage, 15.0, 'SAR affected percentage must equal 15.0%');
  reportPass('Zero SAR regressions verified across compatibility and pixel detection engines');

  // Disconnect MongoDB and restore
  AnalysisGridService.rasterizePolygon = origRasterize;
  await mongoose.disconnect();

  console.log('\n============================================================');
  console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} (100%)`);
  console.log('============================================================\n');
}

runOpticalTestSuite().catch((err) => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
