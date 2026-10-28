import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';

interface PngDecodedStats {
  width: number;
  height: number;
  totalPixels: number;
  validPixels: number;
  transparentPixels: number;
  nonBlackValidPixels: number;
  meanIntensity: number;
  minIntensity: number;
  maxIntensity: number;
}

function parseAndAnalyzePng(buffer: Buffer): PngDecodedStats {
  // 1. Verify PNG signature
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.strictEqual(buffer.subarray(0, 8).compare(pngSig), 0, 'Invalid PNG signature');

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const chunkLen = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLen);

    if (chunkType === 'IHDR') {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
    } else if (chunkType === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (chunkType === 'IEND') {
      break;
    }
    offset += 12 + chunkLen;
  }

  assert.ok(width > 0 && height > 0, 'Invalid IHDR dimensions');
  assert.ok(idatChunks.length > 0, 'No IDAT chunks found in PNG');

  // Decompress RGBA scanlines
  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);

  const scanlineLen = 1 + width * 4;
  assert.strictEqual(decompressed.length, scanlineLen * height, 'Decompressed length does not match RGBA scanline expectations');

  let validPixels = 0;
  let transparentPixels = 0;
  let nonBlackValidPixels = 0;
  let totalIntensity = 0;
  let minIntensity = 255;
  let maxIntensity = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLen;
    // scanline filter byte is decompressed[rowOffset]
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const r = decompressed[pxOffset + 0];
      const g = decompressed[pxOffset + 1];
      const b = decompressed[pxOffset + 2];
      const a = decompressed[pxOffset + 3];

      if (a === 0) {
        transparentPixels++;
      } else {
        validPixels++;
        const intensity = r; // In grayscale RGBA, r === g === b
        totalIntensity += intensity;
        if (intensity > 5) {
          nonBlackValidPixels++;
        }
        if (intensity < minIntensity) minIntensity = intensity;
        if (intensity > maxIntensity) maxIntensity = intensity;
      }
    }
  }

  const meanIntensity = validPixels > 0 ? totalIntensity / validPixels : 0;

  return {
    width,
    height,
    totalPixels: width * height,
    validPixels,
    transparentPixels,
    nonBlackValidPixels,
    meanIntensity,
    minIntensity: validPixels > 0 ? minIntensity : 0,
    maxIntensity,
  };
}

async function runSarRenderingVisualizationTests() {
  console.log('================================================================');
  console.log('🧪 REGRESSION TEST SUITE: SAR RENDERING & VISUALIZATION ENGINE');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const changeId = '6ab90a0a65d99f53e6ce7555';
  const baselineRasterPath = path.resolve(
    'storage/raster_temp/6ab8a736667c98f4208d8b05/ZONE-260925-8986_6ab8a736667c98f4208d8b05_CURRENT_Sentinel1_20200102.tif',
  );
  const currentRasterPath = path.resolve(
    'storage/raster_temp/6ab8a897667c98f4208d8bc0/ZONE-260925-8986_6ab8a897667c98f4208d8bc0_CURRENT_Sentinel1_20210101.tif',
  );

  // -------------------------------------------------------------------------
  // TEST 1: dB-valued raster normalization
  // -------------------------------------------------------------------------
  console.log('Test 1: dB-valued raster normalization...');
  const syntheticParsedDb = {
    metadata: {
      width: 4,
      height: 4,
      bands: 2,
      crs: 'EPSG:32643',
      resolution: [10, -10],
      origin: [0, 0],
      nodata: null,
      pixelAreaM2: 100,
    },
    bandData: [
      // VV band in dB (typical range -25 to -5 dB)
      new Float32Array([
        -25.0, -22.0, -19.0, -16.0,
        -15.0, -14.0, -13.0, -12.0,
        -11.0, -10.0,  -9.0,  -8.0,
         -7.0,  -6.0,  -5.0,  -4.0,
      ]),
      // VH band in dB
      new Float32Array([
        -30.0, -28.0, -26.0, -24.0,
        -22.0, -20.0, -18.0, -16.0,
        -15.0, -14.0, -13.0, -12.0,
        -11.0, -10.0,  -9.0,  -8.0,
      ]),
    ],
  };

  const pngDb = await GeoTiffService.renderSarPng(syntheticParsedDb as any, { band: 'VV' });
  const statsDb = parseAndAnalyzePng(pngDb);
  assert.strictEqual(statsDb.width, 4);
  assert.strictEqual(statsDb.height, 4);
  assert.strictEqual(statsDb.validPixels, 16);
  assert.strictEqual(statsDb.transparentPixels, 0);
  assert.ok(statsDb.meanIntensity > 50 && statsDb.meanIntensity < 200, `Mean intensity must be in balanced range: ${statsDb.meanIntensity}`);
  assert.ok(statsDb.minIntensity < 30 && statsDb.maxIntensity > 220, 'Dynamic stretch must span contrast range');
  console.log(`  ✅ Test 1 PASSED: dB values normalized across [${statsDb.minIntensity}, ${statsDb.maxIntensity}] with mean ${statsDb.meanIntensity.toFixed(1)}.\n`);

  // -------------------------------------------------------------------------
  // TEST 2: Linear-valued raster normalization
  // -------------------------------------------------------------------------
  console.log('Test 2: Linear-valued raster normalization...');
  // Linear power values (0.001 to 0.1) -> converted to dB via 10*log10(v)
  const syntheticParsedLinear = {
    metadata: {
      width: 4,
      height: 4,
      bands: 2,
      crs: 'EPSG:32643',
      resolution: [10, -10],
      origin: [0, 0],
      nodata: null,
      pixelAreaM2: 100,
    },
    bandData: [
      new Float32Array([
        0.003, 0.006, 0.012, 0.025,
        0.035, 0.045, 0.055, 0.065,
        0.075, 0.085, 0.095, 0.105,
        0.120, 0.140, 0.160, 0.200,
      ]),
      new Float32Array(16),
    ],
  };

  const pngLinear = await GeoTiffService.renderSarPng(syntheticParsedLinear as any, { band: 'VV' });
  const statsLinear = parseAndAnalyzePng(pngLinear);
  assert.strictEqual(statsLinear.validPixels, 16);
  assert.ok(statsLinear.meanIntensity > 40 && statsLinear.meanIntensity < 210, `Linear values normalized to balanced dB stretch: ${statsLinear.meanIntensity}`);
  console.log(`  ✅ Test 2 PASSED: Linear power values automatically converted to dB and stretched (mean: ${statsLinear.meanIntensity.toFixed(1)}).\n`);

  // -------------------------------------------------------------------------
  // TEST 3: Negative SAR values are not clipped to black
  // -------------------------------------------------------------------------
  console.log('Test 3: Negative SAR values are not clipped to black...');
  const allNegativeData = {
    metadata: {
      width: 4,
      height: 4,
      bands: 1,
      crs: 'EPSG:32643',
      resolution: [10, -10],
      origin: [0, 0],
      nodata: null,
      pixelAreaM2: 100,
    },
    bandData: [
      new Float32Array([
        -30.0, -25.0, -22.0, -20.0,
        -18.0, -16.0, -15.0, -14.0,
        -13.0, -12.0, -11.0, -10.0,
         -9.0,  -8.0,  -7.0,  -6.0,
      ]),
    ],
  };

  const pngNegative = await GeoTiffService.renderSarPng(allNegativeData as any);
  const statsNeg = parseAndAnalyzePng(pngNegative);
  assert.strictEqual(statsNeg.validPixels, 16);
  assert.strictEqual(statsNeg.nonBlackValidPixels, 15, 'Negative values must NOT be clamped to black (0)');
  assert.ok(statsNeg.meanIntensity > 80, `Negative dB values must produce visible grayscale image: ${statsNeg.meanIntensity}`);
  console.log(`  ✅ Test 3 PASSED: 100% negative dB values rendered with non-zero intensity (mean: ${statsNeg.meanIntensity.toFixed(1)}).\n`);

  // -------------------------------------------------------------------------
  // TEST 4: NoData excluded from percentile calculation and transparent
  // -------------------------------------------------------------------------
  console.log('Test 4: NoData excluded from percentile calculation and transparent...');
  const dataWithNoData = {
    metadata: {
      width: 4,
      height: 4,
      bands: 1,
      crs: 'EPSG:32643',
      resolution: [10, -10],
      origin: [0, 0],
      nodata: -9999,
      pixelAreaM2: 100,
    },
    bandData: [
      new Float32Array([
        -9999,  NaN,    -9999,  NaN,
        -20.0, -18.0,  -16.0, -14.0,
        -12.0, -10.0,   -8.0,  -6.0,
        -9999,  NaN,    -9999,  NaN,
      ]),
    ],
  };

  const pngNoData = await GeoTiffService.renderSarPng(dataWithNoData as any);
  const statsNoData = parseAndAnalyzePng(pngNoData);
  assert.strictEqual(statsNoData.transparentPixels, 8, 'All 8 NoData and NaN pixels must be transparent');
  assert.strictEqual(statsNoData.validPixels, 8, 'Exactly 8 valid pixels must be rendered');
  assert.ok(statsNoData.meanIntensity > 50, 'Valid pixels must be properly stretched ignoring nodata');
  console.log(`  ✅ Test 4 PASSED: NoData / NaN correctly masked transparent (alpha=0), excluded from percentile stretch.\n`);

  // -------------------------------------------------------------------------
  // TEST 5: Real VV rendering produces non-black image with valid stats
  // -------------------------------------------------------------------------
  console.log('Test 5: Real VV rendering produces non-black image with valid stats...');
  assert.ok(fs.existsSync(baselineRasterPath), `Baseline raster must exist at ${baselineRasterPath}`);
  assert.ok(fs.existsSync(currentRasterPath), `Current raster must exist at ${currentRasterPath}`);

  const baselineVvPng = await GeoTiffService.renderSarPng(baselineRasterPath, { band: 'VV' });
  const baseVvStats = parseAndAnalyzePng(baselineVvPng);
  assert.strictEqual(baseVvStats.width, 2562);
  assert.strictEqual(baseVvStats.height, 2232);
  assert.ok(baseVvStats.validPixels > 2500000, `Must have > 2.5M valid pixels (got ${baseVvStats.validPixels})`);
  assert.ok(baseVvStats.meanIntensity > 100 && baseVvStats.meanIntensity < 180, `VV mean intensity must be balanced (got ${baseVvStats.meanIntensity.toFixed(1)})`);
  const baseVvNonBlackPct = (baseVvStats.nonBlackValidPixels / baseVvStats.validPixels) * 100;
  assert.ok(baseVvNonBlackPct > 95, `Non-black valid pixels must be > 95% (got ${baseVvNonBlackPct.toFixed(1)}%)`);

  const currentVvPng = await GeoTiffService.renderSarPng(currentRasterPath, { band: 'VV' });
  const currVvStats = parseAndAnalyzePng(currentVvPng);
  assert.strictEqual(currVvStats.width, 2031);
  assert.strictEqual(currVvStats.height, 2237);
  assert.ok(currVvStats.validPixels > 2500000, `Must have > 2.5M valid pixels (got ${currVvStats.validPixels})`);
  assert.ok(currVvStats.meanIntensity > 80 && currVvStats.meanIntensity < 160, `Current VV mean intensity must be balanced (got ${currVvStats.meanIntensity.toFixed(1)})`);
  const currVvNonBlackPct = (currVvStats.nonBlackValidPixels / currVvStats.validPixels) * 100;
  assert.ok(currVvNonBlackPct > 95, `Current non-black valid pixels must be > 95% (got ${currVvNonBlackPct.toFixed(1)}%)`);

  console.log(`  ✅ Test 5 PASSED: Baseline VV mean intensity: ${baseVvStats.meanIntensity.toFixed(1)}/255 (${baseVvNonBlackPct.toFixed(1)}% non-black), Current VV mean intensity: ${currVvStats.meanIntensity.toFixed(1)}/255 (${currVvNonBlackPct.toFixed(1)}% non-black).\n`);

  // -------------------------------------------------------------------------
  // TEST 6: Real VH rendering produces non-black image with valid stats
  // -------------------------------------------------------------------------
  console.log('Test 6: Real VH rendering produces non-black image with valid stats...');
  const baselineVhPng = await GeoTiffService.renderSarPng(baselineRasterPath, { band: 'VH' });
  const baseVhStats = parseAndAnalyzePng(baselineVhPng);
  assert.ok(baseVhStats.validPixels > 2500000);
  assert.ok(baseVhStats.meanIntensity > 90 && baseVhStats.meanIntensity < 170, `Baseline VH mean intensity must be balanced (got ${baseVhStats.meanIntensity.toFixed(1)})`);
  const baseVhNonBlackPct = (baseVhStats.nonBlackValidPixels / baseVhStats.validPixels) * 100;
  assert.ok(baseVhNonBlackPct > 95, `Baseline VH non-black valid pixels must be > 95% (got ${baseVhNonBlackPct.toFixed(1)}%)`);

  const currentVhPng = await GeoTiffService.renderSarPng(currentRasterPath, { band: 'VH' });
  const currVhStats = parseAndAnalyzePng(currentVhPng);
  assert.ok(currVhStats.validPixels > 2500000);
  assert.ok(currVhStats.meanIntensity > 80 && currVhStats.meanIntensity < 160, `Current VH mean intensity must be balanced (got ${currVhStats.meanIntensity.toFixed(1)})`);
  const currVhNonBlackPct = (currVhStats.nonBlackValidPixels / currVhStats.validPixels) * 100;
  assert.ok(currVhNonBlackPct > 95, `Current VH non-black valid pixels must be > 95% (got ${currVhNonBlackPct.toFixed(1)}%)`);

  console.log(`  ✅ Test 6 PASSED: Baseline VH mean intensity: ${baseVhStats.meanIntensity.toFixed(1)}/255 (${baseVhNonBlackPct.toFixed(1)}% non-black), Current VH mean intensity: ${currVhStats.meanIntensity.toFixed(1)}/255 (${currVhNonBlackPct.toFixed(1)}% non-black).\n`);

  // -------------------------------------------------------------------------
  // TEST 7: Optical rendering remains unchanged
  // -------------------------------------------------------------------------
  console.log('Test 7: Optical rendering remains unchanged...');
  const opticalPath = path.resolve(
    'storage/raster_temp/6aa6798c2b4fe5808c7e9038/ZONE-260913-7787_6aa6798c2b4fe5808c7e9038_CURRENT_Sentinel2_20260909.tif',
  );
  assert.ok(fs.existsSync(opticalPath), `Optical raster must exist at ${opticalPath}`);
  const opticalBuffer = await GeoTiffService.renderTrueColorPng(opticalPath, { satellite: 'SENTINEL_2' });
  const optStats = parseAndAnalyzePng(opticalBuffer);
  assert.strictEqual(optStats.width, 930);
  assert.ok(optStats.height > 0);
  assert.ok(optStats.validPixels > 100000, `Optical valid pixels must be > 100k (got ${optStats.validPixels})`);
  assert.ok(optStats.meanIntensity > 40 && optStats.meanIntensity < 200, `Optical mean intensity must be balanced: ${optStats.meanIntensity}`);
  console.log(`  ✅ Test 7 PASSED: Optical true-color rendering unaffected on real Sentinel-2 raster (${optStats.width}x${optStats.height} px, mean intensity: ${optStats.meanIntensity.toFixed(1)}).\n`);

  // -------------------------------------------------------------------------
  // TEST 8: Baseline and current image identity preserved for ChangeDetection 6ab90a0a65d99f53e6ce7555
  // -------------------------------------------------------------------------
  console.log('Test 8: Baseline and current image identity preserved for ChangeDetection 6ab90a0a65d99f53e6ce7555...');
  const changeDoc = await ChangeDetectionModel.findById(changeId).lean();
  assert.ok(changeDoc, `ChangeDetection ${changeId} must exist in MongoDB`);
  assert.strictEqual(changeDoc.changeId, 'CHG-1790511626250-4641');
  assert.strictEqual(changeDoc.sensorType, 'SAR');
  assert.strictEqual(changeDoc.affectedAreaPercentage, 1.06);
  assert.strictEqual(changeDoc.evidenceStrength, 54);
  assert.strictEqual(changeDoc.changeIndicators.vvDelta, 0.2);
  assert.strictEqual(changeDoc.changeIndicators.vhDelta, 0.22);
  assert.strictEqual(changeDoc.changeIndicators.vvVhRatioDelta, -0.02);

  const baselineDoc = await BaselineModel.findById(changeDoc.baselineId).lean();
  assert.ok(baselineDoc, 'Baseline record must exist');
  assert.strictEqual(baselineDoc._id.toString(), '6ab8dab06f0c75ad0b423200');
  assert.strictEqual(baselineDoc.satelliteMetadataId?.toString(), '6ab8a736667c98f4208d8b05');

  const baselineMeta = await SatelliteMetadata.findById('6ab8a736667c98f4208d8b05').lean();
  assert.ok(baselineMeta, 'Baseline SatelliteMetadata must exist');
  assert.strictEqual(baselineMeta.sensorType, 'SAR');
  assert.strictEqual(baselineMeta.source, 'SENTINEL_1');

  const currentMeta = await SatelliteMetadata.findById(changeDoc.observationId).lean();
  assert.ok(currentMeta, 'Current SatelliteMetadata must exist');
  assert.strictEqual(currentMeta._id.toString(), '6ab8a897667c98f4208d8bc0');
  assert.strictEqual(currentMeta.sensorType, 'SAR');
  assert.strictEqual(currentMeta.source, 'SENTINEL_1');

  console.log('  ✅ Test 8 PASSED: ChangeDetection record, baseline, and metadata identity strictly preserved.\n');

  // -------------------------------------------------------------------------
  // TEST 9: Valid PNG signature & chunks generated
  // -------------------------------------------------------------------------
  console.log('Test 9: Valid PNG signature & chunks generated via ChangeDetectionService...');
  const changeService = new ChangeDetectionService();

  const renderedBaseVv = await changeService.getBaselineImageBuffer(changeId, 'VV');
  const baseStats = parseAndAnalyzePng(renderedBaseVv);
  assert.ok(renderedBaseVv.length > 1000000, 'Baseline PNG must be > 1 MB');
  assert.strictEqual(baseStats.width, 2562);
  assert.strictEqual(baseStats.height, 2232);

  const renderedCurrVh = await changeService.getCurrentImageBuffer(changeId, 'VH');
  const currStats = parseAndAnalyzePng(renderedCurrVh);
  assert.ok(renderedCurrVh.length > 1000000, 'Current PNG must be > 1 MB');
  assert.strictEqual(currStats.width, 2031);
  assert.strictEqual(currStats.height, 2237);

  console.log(`  ✅ Test 9 PASSED: ChangeDetectionService successfully generated valid PNG buffers (Baseline VV: ${(renderedBaseVv.length / 1024 / 1024).toFixed(2)} MB, Current VH: ${(renderedCurrVh.length / 1024 / 1024).toFixed(2)} MB).\n`);

  // -------------------------------------------------------------------------
  // TEST 10: SAR viewer does not use optical true-color assumptions
  // -------------------------------------------------------------------------
  console.log('Test 10: SAR viewer metadata and routing checks...');
  const comparisonMeta = await changeService.getComparisonMetadata(changeId);
  assert.strictEqual(comparisonMeta.baseline.spacecraftName, 'Sentinel-1A (SAR)');
  assert.strictEqual(comparisonMeta.current.spacecraftName, 'Sentinel-1A (SAR)');
  assert.strictEqual(comparisonMeta.baseline.sensor, 'SAR');
  assert.strictEqual(comparisonMeta.current.sensor, 'SAR');
  assert.strictEqual(comparisonMeta.spectralDeltas.vvDelta, 0.2);
  assert.strictEqual(comparisonMeta.spectralDeltas.vhDelta, 0.22);
  assert.strictEqual(comparisonMeta.spectralDeltas.vvVhRatioDelta, -0.02);

  console.log('  ✅ Test 10 PASSED: Metadata confirms Sentinel-1A (SAR) spacecraft name and radar backscatter deltas.\n');

  console.log('================================================================');
  console.log('🏆 ALL 10 SAR RENDERING & VISUALIZATION TESTS PASSED');
  console.log('================================================================\n');

  await mongoose.disconnect();
}

runSarRenderingVisualizationTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
