import fs from 'node:fs';
import path from 'node:path';
import * as GeoTIFF from 'geotiff';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';

interface RasterStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p02: number;
  p50: number;
  p98: number;
  validCount: number;
  nodataCount: number;
  validPercentage: number;
}

function calculateBandStats(data: Float32Array, nodata: number | null): RasterStats {
  const totalPixels = data.length;
  const validVals: number[] = [];
  let nodataCount = 0;
  let sum = 0;

  for (let i = 0; i < totalPixels; i++) {
    const v = data[i];
    if (isNaN(v) || (nodata !== null && v === nodata) || !isFinite(v)) {
      nodataCount++;
    } else {
      validVals.push(v);
      sum += v;
    }
  }

  const validCount = validVals.length;
  const validPercentage = Number(((validCount / totalPixels) * 100).toFixed(2));

  if (validCount === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p02: 0,
      p50: 0,
      p98: 0,
      validCount: 0,
      nodataCount,
      validPercentage: 0,
    };
  }

  validVals.sort((a, b) => a - b);

  const min = validVals[0];
  const max = validVals[validVals.length - 1];
  const mean = Number((sum / validCount).toFixed(4));
  const median = validVals[Math.floor(validCount * 0.5)];
  const p02 = validVals[Math.floor(validCount * 0.02)];
  const p50 = median;
  const p98 = validVals[Math.floor(validCount * 0.98)];

  return {
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    mean,
    median: Number(median.toFixed(4)),
    p02: Number(p02.toFixed(4)),
    p50: Number(p50.toFixed(4)),
    p98: Number(p98.toFixed(4)),
    validCount,
    nodataCount,
    validPercentage,
  };
}

async function analyzeRaster(label: string, filePath: string) {
  console.log('============================================================');
  console.log(`ANALYSIS FOR: ${label}`);
  console.log(`Path: ${filePath}`);
  console.log('============================================================');

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const tiffBuffer = fs.readFileSync(filePath);
  const arrayBuffer = tiffBuffer.buffer.slice(
    tiffBuffer.byteOffset,
    tiffBuffer.byteOffset + tiffBuffer.byteLength,
  ) as ArrayBuffer;
  const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const numBands = image.getSamplesPerPixel();
  const sampleFormat = image.getSampleFormat();
  const bitsPerSample = image.getBitsPerSample();
  const nodata = image.getGDALNoData();
  const resolution = image.getResolution();
  const parsed = await GeoTiffService.readGeoTiff(filePath);

  console.log(`Dimensions:       ${width} × ${height} px (${width * height} total pixels)`);
  console.log(`Band count:       ${numBands}`);
  console.log(`Data Type:        SampleFormat: ${JSON.stringify(sampleFormat)}, BitsPerSample: ${JSON.stringify(bitsPerSample)}`);
  console.log(`CRS:              ${parsed.metadata.crs} (Original: ${parsed.metadata.originalCrs})`);
  console.log(`Resolution:       ${JSON.stringify(resolution)}`);
  console.log(`NoData Value:     ${nodata}`);

  // Band 0: VV, Band 1: VH
  const vvData = parsed.bandData[0];
  const vhData = parsed.bandData[1];

  const vvStats = calculateBandStats(vvData, nodata !== null ? Number(nodata) : null);
  const vhStats = calculateBandStats(vhData, nodata !== null ? Number(nodata) : null);

  console.log('\n--- VV Band Statistics ---');
  console.log(`  Minimum:          ${vvStats.min}`);
  console.log(`  Maximum:          ${vvStats.max}`);
  console.log(`  Mean:             ${vvStats.mean}`);
  console.log(`  Median:           ${vvStats.median}`);
  console.log(`  P02:              ${vvStats.p02}`);
  console.log(`  P50:              ${vvStats.p50}`);
  console.log(`  P98:              ${vvStats.p98}`);
  console.log(`  Valid Pixels:     ${vvStats.validCount}`);
  console.log(`  NoData Pixels:    ${vvStats.nodataCount}`);
  console.log(`  Valid Percentage: ${vvStats.validPercentage}%`);

  console.log('\n--- VH Band Statistics ---');
  console.log(`  Minimum:          ${vhStats.min}`);
  console.log(`  Maximum:          ${vhStats.max}`);
  console.log(`  Mean:             ${vhStats.mean}`);
  console.log(`  Median:           ${vhStats.median}`);
  console.log(`  P02:              ${vhStats.p02}`);
  console.log(`  P50:              ${vhStats.p50}`);
  console.log(`  P98:              ${vhStats.p98}`);
  console.log(`  Valid Pixels:     ${vhStats.validCount}`);
  console.log(`  NoData Pixels:    ${vhStats.nodataCount}`);
  console.log(`  Valid Percentage: ${vhStats.validPercentage}%`);

  // Value representation check
  const isDb = vvStats.p50 < 0 && vvStats.p50 > -40;
  console.log(`\nValue Representation Assessment:`);
  console.log(`  VV Median: ${vvStats.p50}, VH Median: ${vhStats.p50}`);
  console.log(`  Representation: ${isDb ? 'DECIBELS (dB)' : 'LINEAR POWER / OTHER'}`);
  console.log('\n');

  return { width, height, numBands, nodata, vvStats, vhStats, isDb };
}

async function main() {
  const basePath = 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\6ab8a736667c98f4208d8b05\\ZONE-260925-8986_6ab8a736667c98f4208d8b05_CURRENT_Sentinel1_20200102.tif';
  const currPath = 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\6ab8a897667c98f4208d8bc0\\ZONE-260925-8986_6ab8a897667c98f4208d8bc0_CURRENT_Sentinel1_20210101.tif';

  await analyzeRaster('BASELINE (2020-01-02 Sentinel-1)', basePath);
  await analyzeRaster('CURRENT (2021-01-01 Sentinel-1)', currPath);
}

main().catch(console.error);
