import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import fs from 'node:fs';

async function inspect(): Promise<void> {
  const filePath = 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\test_download.tif';
  console.info('Inspecting downloaded GeoTIFF:', filePath);
  const stats = fs.statSync(filePath);
  console.info(`File size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  const parsed = await GeoTiffService.readGeoTiff(filePath);
  const m = parsed.metadata;

  console.info('\n--- RASTER METADATA ---');
  console.info(`Width:                ${m.width} pixels`);
  console.info(`Height:               ${m.height} pixels`);
  console.info(`NumBands:             ${m.numBands}`);
  console.info(`CRS:                  ${m.crs}`);
  console.info(`Original CRS:         ${m.originalCrs}`);
  console.info(`Area Calculation CRS: ${m.areaCalculationCrs}`);
  console.info(`Pixel Scale:          ${m.pixelScale[0]}m x ${Math.abs(m.pixelScale[1])}m`);
  console.info(`Bounding Box:         [${m.bbox.join(', ')}]`);
  console.info(`NoData Value:         ${m.nodata}`);
  console.info(`Bits Per Sample:      ${m.bitsPerSample.join(', ')}`);
  console.info(`Pixel Area:           ${m.pixelAreaM2.toFixed(2)} m²`);
  console.info(`Projected Metric:     ${m.isProjectedMetric}`);

  console.info('\n--- BAND INSPECTION ---');
  const bandLabels = ['VV (Band 1)', 'VH (Band 2)'];

  for (let b = 0; b < parsed.bandData.length; b++) {
    const data = parsed.bandData[b];
    const label = bandLabels[b] || `Band ${b + 1}`;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    let zeroCount = 0;
    let negativeCount = 0;
    let positiveCount = 0;
    let nanCount = 0;

    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      if (isNaN(val)) {
        nanCount++;
        continue;
      }
      if (val === 0 || (m.nodata !== null && Math.abs(val - m.nodata) < 1e-5)) {
        zeroCount++;
        continue;
      }
      count++;
      sum += val;
      if (val < min) min = val;
      if (val > max) max = val;
      if (val < 0) negativeCount++;
      else positiveCount++;
    }

    const mean = count > 0 ? sum / count : 0;

    console.info(`\n[${label}]`);
    console.info(`  Total Pixels:     ${data.length}`);
    console.info(`  Valid Pixels:     ${count}`);
    console.info(`  Zero/NoData:      ${zeroCount}`);
    console.info(`  NaN Pixels:       ${nanCount}`);
    console.info(`  Min Value:        ${min.toFixed(4)}`);
    console.info(`  Max Value:        ${max.toFixed(4)}`);
    console.info(`  Mean Value:       ${mean.toFixed(4)}`);
    console.info(`  Negative Pixels:  ${negativeCount} (${((negativeCount / count) * 100).toFixed(1)}%)`);
    console.info(`  Positive Pixels:  ${positiveCount} (${((positiveCount / count) * 100).toFixed(1)}%)`);
    console.info(`  Data Type:        Float32 (${m.bitsPerSample[b] || 32}-bit float)`);

    // Value Representation Diagnostic
    if (min < 0 && mean < 0 && min >= -50 && max <= 15) {
      console.info(`  Representation:   LOGARITHMIC / DECIBEL (dB) BACKSCATTER (σ° in dB)`);
      console.info(`                    Values are typical C-band backscatter in decibels (e.g. -25 to -5 dB).`);
    } else if (min >= 0 && max <= 2.0) {
      console.info(`  Representation:   LINEAR BACKSCATTER (σ° in linear amplitude/power)`);
    } else {
      console.info(`  Representation:   UNCLASSIFIED/OTHER (min=${min}, max=${max})`);
    }
  }
}

inspect().catch(console.error);
