import fs from 'node:fs';
import path from 'node:path';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';

async function testRender() {
  const basePath = 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\6ab8a736667c98f4208d8b05\\ZONE-260925-8986_6ab8a736667c98f4208d8b05_CURRENT_Sentinel1_20200102.tif';
  const currPath = 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\6ab8a897667c98f4208d8bc0\\ZONE-260925-8986_6ab8a897667c98f4208d8bc0_CURRENT_Sentinel1_20210101.tif';

  console.log('Testing SAR PNG rendering...');

  // Test old renderTrueColorPng (which gave black image)
  const oldBasePng = await GeoTiffService.renderTrueColorPng(basePath, { satellite: 'SENTINEL_1' });
  console.log(`Old renderTrueColorPng Baseline PNG size: ${oldBasePng.length} bytes`);
  fs.writeFileSync('D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\test_sar_base_old.png', oldBasePng);

  // Implement prototype renderSarPng logic and test
  async function renderSarPrototype(filePath: string, band: 'VV' | 'VH') {
    const parsed = await GeoTiffService.readGeoTiff(filePath);
    const { metadata, bandData } = parsed;
    const { width, height } = metadata;
    const totalPixels = width * height;

    const bandIdx = band === 'VH' && bandData.length >= 2 ? 1 : 0;
    const rawData = bandData[bandIdx];
    const nodata = metadata.nodata !== null ? Number(metadata.nodata) : null;

    // Check representation
    const sampleVals: number[] = [];
    for (let i = 0; i < totalPixels && sampleVals.length < 5000; i += 50) {
      const v = rawData[i];
      if (!isNaN(v) && isFinite(v) && (nodata === null || v !== nodata)) {
        sampleVals.push(v);
      }
    }
    sampleVals.sort((a, b) => a - b);
    const median = sampleVals[Math.floor(sampleVals.length / 2)] || 0;
    const isLinear = median > 0 && median < 1.0;

    const validValues: number[] = [];
    const dbValues = new Float32Array(totalPixels);
    const validMask = new Uint8Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const v = rawData[i];
      if (isNaN(v) || !isFinite(v) || (nodata !== null && v === nodata)) {
        validMask[i] = 0;
        continue;
      }

      let valDb: number;
      if (isLinear) {
        valDb = 10 * Math.log10(Math.max(1e-7, v));
      } else {
        valDb = v;
      }

      validValues.push(valDb);
      dbValues[i] = valDb;
      validMask[i] = 1;
    }

    if (validValues.length === 0) {
      console.warn('No valid pixels found');
      return (GeoTiffService as any).encodeRgbaPng(width, height, Buffer.alloc(totalPixels * 4));
    }

    validValues.sort((a, b) => a - b);
    const p02 = validValues[Math.floor(validValues.length * 0.02)];
    const p98 = validValues[Math.floor(validValues.length * 0.98)];
    const minDb = p02;
    const maxDb = Math.max(minDb + 1.0, p98);

    console.log(`Rendered ${band}: P02=${minDb.toFixed(2)} dB, P98=${maxDb.toFixed(2)} dB, Valid=${validValues.length}/${totalPixels}`);

    const rgba = Buffer.alloc(totalPixels * 4);
    let nonBlackCount = 0;
    let graySum = 0;

    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0; // Transparent
        continue;
      }

      const valDb = dbValues[i];
      let scaled = (valDb - minDb) / (maxDb - minDb);
      scaled = Math.max(0, Math.min(1.0, scaled));
      const intensity = Math.round(scaled * 255);

      rgba[i * 4 + 0] = intensity;
      rgba[i * 4 + 1] = intensity;
      rgba[i * 4 + 2] = intensity;
      rgba[i * 4 + 3] = 255; // Opaque

      if (intensity > 15) nonBlackCount++;
      graySum += intensity;
    }

    const meanIntensity = (graySum / validValues.length).toFixed(1);
    console.log(`  Visual check: Mean intensity = ${meanIntensity}/255, Non-black valid pixels = ${((nonBlackCount / validValues.length) * 100).toFixed(1)}%`);

    return (GeoTiffService as any).encodeRgbaPng(width, height, rgba);
  }

  const baseVvPng = await renderSarPrototype(basePath, 'VV');
  fs.writeFileSync('D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\test_sar_base_vv.png', baseVvPng);
  console.log(`Saved test_sar_base_vv.png (${baseVvPng.length} bytes)`);

  const baseVhPng = await renderSarPrototype(basePath, 'VH');
  fs.writeFileSync('D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\test_sar_base_vh.png', baseVhPng);
  console.log(`Saved test_sar_base_vh.png (${baseVhPng.length} bytes)`);

  const currVvPng = await renderSarPrototype(currPath, 'VV');
  fs.writeFileSync('D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\test_sar_curr_vv.png', currVvPng);
  console.log(`Saved test_sar_curr_vv.png (${currVvPng.length} bytes)`);

  const currVhPng = await renderSarPrototype(currPath, 'VH');
  fs.writeFileSync('D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\test_sar_curr_vh.png', currVhPng);
  console.log(`Saved test_sar_curr_vh.png (${currVhPng.length} bytes)`);
}

testRender().catch(console.error);
