import assert from 'node:assert';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { SpatialHarmonizationService } from '../services/spatial/SpatialHarmonizationService.js';
import { SarPixelChangeDetector } from '../services/changeDetection/SarPixelChangeDetector.js';
import { GeoTiffService, type ParsedGeoTiffRaster } from '../services/raster/GeoTiffService.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import { ChangeCalculationMethod, SpatialCalculationType, type GeoJSONPolygon } from '@tn-forest/shared/types';

function parsePngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error('Buffer is not a valid PNG image');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function runTests() {
  console.log('============================================================');
  console.log('TEST SUITE: SAR SPATIAL HARMONIZATION & PIXEL CHANGE DETECTION');
  console.log('============================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: CrsTransformService Geodetic Transformation Accuracy
  // -------------------------------------------------------------------------
  console.log('Test 1: CrsTransformService Geodetic Transformation Accuracy...');
  const sirumalaiLng = 77.9945;
  const sirumalaiLat = 10.1856;

  // Transform to UTM Zone 44N (EPSG:32644)
  const [utmX44, utmY44] = CrsTransformService.transformPoint(sirumalaiLng, sirumalaiLat, 'EPSG:4326', 'EPSG:32644');
  assert.ok(utmX44 > 100000 && utmX44 < 900000, `UTM 44N Easting should be valid: ${utmX44}`);
  assert.ok(utmY44 > 1000000 && utmY44 < 1500000, `UTM 44N Northing should be valid: ${utmY44}`);

  // Transform to UTM Zone 43N (EPSG:32643)
  const [utmX43, utmY43] = CrsTransformService.transformPoint(sirumalaiLng, sirumalaiLat, 'EPSG:4326', 'EPSG:32643');
  assert.ok(utmX43 > 700000 && utmX43 < 900000, `UTM 43N Easting should be valid: ${utmX43}`);

  // Reproject between UTM Zone 43N and 44N directly
  const [crossX44, crossY44] = CrsTransformService.transformPoint(utmX43, utmY43, 'EPSG:32643', 'EPSG:32644');
  const reprojDiff = Math.hypot(crossX44 - utmX44, crossY44 - utmY44);
  assert.ok(reprojDiff < 0.001, `Cross-UTM reprojection error must be sub-millimeter (< 1mm). Got: ${reprojDiff} m`);

  // Round-trip back to WGS84
  const [roundtripLng, roundtripLat] = CrsTransformService.transformPoint(utmX44, utmY44, 'EPSG:32644', 'EPSG:4326');
  assert.ok(Math.abs(roundtripLng - sirumalaiLng) < 1e-7, 'Round-trip longitude error must be < 1e-7 deg');
  assert.ok(Math.abs(roundtripLat - sirumalaiLat) < 1e-7, 'Round-trip latitude error must be < 1e-7 deg');
  console.log(`  ✅ Test 1 PASSED: Transverse Mercator geodesy verified with ${reprojDiff.toFixed(6)} m cross-zone error.\n`);

  // -------------------------------------------------------------------------
  // TEST 2: AnalysisGridService Canonical Grid Construction
  // -------------------------------------------------------------------------
  console.log('Test 2: AnalysisGridService Canonical Grid Construction...');
  const testPoly: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [[
      [77.95, 10.15],
      [78.05, 10.15],
      [78.05, 10.25],
      [77.95, 10.25],
      [77.95, 10.15],
    ]],
  };

  const grid = AnalysisGridService.createAnalysisGrid(testPoly, {
    targetCrs: 'EPSG:32644',
    pixelSizeMeters: 10,
  });

  assert.strictEqual(grid.crs, 'EPSG:32644');
  assert.strictEqual(grid.pixelSizeX, 10);
  assert.strictEqual(grid.pixelSizeY, 10);
  assert.strictEqual(grid.originX % 10, 0, 'Origin X must be snapped to 10m grid boundary');
  assert.strictEqual(grid.originY % 10, 0, 'Origin Y must be snapped to 10m grid boundary');
  assert.ok(grid.width > 500 && grid.width < 2000, `Grid width must span polygon: ${grid.width}`);
  assert.ok(grid.height > 500 && grid.height < 2000, `Grid height must span polygon: ${grid.height}`);

  // Rasterize polygon into binary mask
  const mask = AnalysisGridService.rasterizePolygon(grid, testPoly);
  assert.strictEqual(mask.length, grid.width * grid.height);
  let maskOnCount = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) maskOnCount++;
  }
  assert.ok(maskOnCount > 0, 'Mask must have inside pixels');
  const coverageRatio = maskOnCount / mask.length;
  assert.ok(coverageRatio > 0.4 && coverageRatio <= 1.0, `Coverage ratio should be reasonable: ${coverageRatio}`);
  console.log(`  ✅ Test 2 PASSED: Canonical grid (${grid.width}x${grid.height}) snapped and polygon rasterized (${maskOnCount} px).\n`);

  // -------------------------------------------------------------------------
  // TEST 3: SarPixelChangeDetector Difference & Physical Percentage
  // -------------------------------------------------------------------------
  console.log('Test 3: SarPixelChangeDetector Difference & Physical Percentage...');
  const w = 10;
  const h = 10;
  const totalPx = w * h;

  const baseVv = new Float32Array(totalPx).fill(-12.0);
  const baseVh = new Float32Array(totalPx).fill(-18.0);
  const curVv = new Float32Array(totalPx).fill(-12.0);
  const curVh = new Float32Array(totalPx).fill(-18.0);

  // Introduce significant backscatter drop in 20 pixels
  for (let i = 0; i < 20; i++) {
    curVv[i] = -15.5; // -3.5 dB drop (threshold is -2.0 dB)
    curVh[i] = -21.0; // -3.0 dB drop
  }

  const mockGrid = {
    crs: 'EPSG:32644',
    pixelSizeX: 10,
    pixelSizeY: 10,
    originX: 0,
    originY: 0,
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
    width: w,
    height: h,
    transform: [0, 10, 0, 0, 0, -10] as [number, number, number, number, number, number],
  };

  const testBaseHarmonized = {
    grid: mockGrid,
    vv: baseVv,
    vh: baseVh,
    validMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32644',
    sourceDimensions: { width: w, height: h },
    resamplingMethod: 'bilinear' as const,
  };

  const testCurHarmonized = {
    grid: mockGrid,
    vv: curVv,
    vh: curVh,
    validMask: new Uint8Array(totalPx).fill(1),
    validPixelCount: totalPx,
    totalPixelCount: totalPx,
    sourceCrs: 'EPSG:32644',
    sourceDimensions: { width: w, height: h },
    resamplingMethod: 'bilinear' as const,
  };

  // 80 valid intersection pixels (20 excluded by nodata/mask)
  const validMask = new Uint8Array(totalPx).fill(1);
  for (let i = 80; i < totalPx; i++) {
    validMask[i] = 0;
  }

  const detResult = SarPixelChangeDetector.detectPixelChange({
    baselineHarmonized: testBaseHarmonized,
    currentHarmonized: testCurHarmonized,
    intersection: {
      validComparisonMask: validMask,
      comparisonPixelCount: 80,
      validBaselinePixelCount: 80,
      validCurrentPixelCount: 80,
      overlapPixelCount: 80,
      zonePixelCount: 80,
      coveragePercentage: 80.0,
    },
    thresholdConfig: {
      vvThresholdDb: 2.0,
      vhThresholdDb: 2.0,
      decisionRule: 'ANY_BAND',
    },
    zoneAreaHectares: 1.0,
    minClusterPixels: 1,
  });

  assert.strictEqual(detResult.spatialResult.validPixels, 80);
  assert.strictEqual(detResult.spatialResult.changedPixels, 20);
  assert.strictEqual(detResult.spatialResult.affectedAreaPercentage, 25.0); // 20 / 80 * 100 = 25%
  assert.strictEqual(detResult.spatialResult.calculationMethod, ChangeCalculationMethod.SAR_PIXEL_DIFFERENCE);
  assert.strictEqual(detResult.spatialResult.spatialCalculation, SpatialCalculationType.PIXEL_GRID);
  assert.ok(detResult.spatialResult.rasterStatistics!.meanDeltaVv! < 0, 'Mean delta VV should reflect negative drop');
  console.log(`  ✅ Test 3 PASSED: SarPixelChangeDetector correctly calculated ${detResult.spatialResult.affectedAreaPercentage}% (${detResult.spatialResult.changedPixels}/${detResult.spatialResult.validPixels} px).\n`);

  // -------------------------------------------------------------------------
  // TEST 4: GeoTiffService.encodeSarGridToPng Output Verification
  // -------------------------------------------------------------------------
  console.log('Test 4: GeoTiffService.encodeSarGridToPng Output Verification...');
  const pngBuffer = await GeoTiffService.encodeSarGridToPng(
    curVv,
    validMask,
    w,
    h,
    { minPercentile: 2, maxPercentile: 98 },
  );

  const pngDim = parsePngDimensions(pngBuffer);
  assert.strictEqual(pngDim.width, w);
  assert.strictEqual(pngDim.height, h);
  assert.ok(pngBuffer.length > 50, 'PNG buffer must contain encoded bytes');
  console.log(`  ✅ Test 4 PASSED: encodeSarGridToPng produced valid PNG (${pngDim.width}x${pngDim.height}, ${pngBuffer.length} bytes).\n`);

  // -------------------------------------------------------------------------
  // TEST 5: Database Integration & Curtain Slider Registration Verification
  // -------------------------------------------------------------------------
  console.log('Test 5: Database Integration & Curtain Slider Registration Verification...');
  await mongoose.connect(env.MONGODB_URI);

  // 1. Verify Historical Audit Record
  const historical = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790511626250-4641' }).lean();
  assert.ok(historical, 'Historical audit record CHG-1790511626250-4641 must exist');
  assert.strictEqual(historical.calculationMethod, ChangeCalculationMethod.SAR_ZONAL_SUMMARY);
  assert.strictEqual(historical.spatialCalculation, SpatialCalculationType.ZONAL_STATISTICS);
  console.log('  Confirmed historical audit record is preserved: SAR_ZONAL_SUMMARY / ZONAL_STATISTICS');

  // 2. Verify Pixel Differencing Record
  const pixelRecords = await ChangeDetectionModel.find({
    zoneId: new mongoose.Types.ObjectId('6ab5c434f979afc8c8714e25'),
    calculationMethod: ChangeCalculationMethod.SAR_PIXEL_DIFFERENCE,
  }).sort({ createdAt: -1 }).lean();

  assert.ok(pixelRecords.length > 0, 'At least one SAR_PIXEL_DIFFERENCE record must exist in MongoDB');
  const latestPixelRecord = pixelRecords[0];

  assert.strictEqual(latestPixelRecord.calculationMethod, ChangeCalculationMethod.SAR_PIXEL_DIFFERENCE);
  assert.strictEqual(latestPixelRecord.spatialCalculation, SpatialCalculationType.PIXEL_GRID);
  assert.ok(latestPixelRecord.analysisGrid, 'analysisGrid must be defined');
  assert.strictEqual(latestPixelRecord.analysisGrid.crs, 'EPSG:32644');
  assert.strictEqual(latestPixelRecord.analysisGrid.pixelSizeX, 10);
  assert.strictEqual(latestPixelRecord.analysisGrid.pixelSizeY, 10);
  assert.ok(latestPixelRecord.analysisGrid.width > 2000, `Width must be > 2000: ${latestPixelRecord.analysisGrid.width}`);
  assert.ok(latestPixelRecord.analysisGrid.height > 2000, `Height must be > 2000: ${latestPixelRecord.analysisGrid.height}`);
  assert.ok(latestPixelRecord.rasterStatistics, 'rasterStatistics must be defined');
  assert.ok(latestPixelRecord.thresholdConfig, 'thresholdConfig must be defined');

  // 3. Verify Curtain Slider Registration
  const changeService = new ChangeDetectionService();
  const baseImgBuf = await changeService.getBaselineImageBuffer(latestPixelRecord.changeId, 'VV');
  const currImgBuf = await changeService.getCurrentImageBuffer(latestPixelRecord.changeId, 'VV');

  const baseDim = parsePngDimensions(baseImgBuf);
  const currDim = parsePngDimensions(currImgBuf);

  assert.strictEqual(baseDim.width, latestPixelRecord.analysisGrid.width, 'Baseline width must match analysis grid');
  assert.strictEqual(baseDim.height, latestPixelRecord.analysisGrid.height, 'Baseline height must match analysis grid');
  assert.strictEqual(currDim.width, latestPixelRecord.analysisGrid.width, 'Current width must match analysis grid');
  assert.strictEqual(currDim.height, latestPixelRecord.analysisGrid.height, 'Current height must match analysis grid');
  assert.strictEqual(baseDim.width, currDim.width, 'Curtain slider: Baseline and Current width must match exactly');
  assert.strictEqual(baseDim.height, currDim.height, 'Curtain slider: Baseline and Current height must match exactly');

  console.log(`  Confirmed curtain slider registration: Baseline ${baseDim.width}x${baseDim.height} === Current ${currDim.width}x${currDim.height}`);
  console.log(`  ✅ Test 5 PASSED: Production-grade pixel differencing and curtain slider registration fully validated.\n`);

  await mongoose.disconnect();

  console.log('============================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY (5/5)');
  console.log('============================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
