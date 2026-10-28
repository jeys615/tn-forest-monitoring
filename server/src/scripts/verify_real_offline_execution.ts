import { OfflineChangeDetectionService } from '../services/offline/OfflineChangeDetectionService.js';

async function main() {
  console.log('--- Testing Offline Change Detection with Real Sentinel-2 Rasters ---');

  const baseFile = 'storage/raster_temp/6ab9074f65d99f53e6ce732f/ZONE-260925-8986_6ab9074f65d99f53e6ce732f_BASELINE_Sentinel2_20260926.tif';
  const obsFile = 'storage/raster_temp/6ab8abf5667c98f4208d8f6a/ZONE-260925-8986_6ab8abf5667c98f4208d8f6a_CURRENT_Sentinel2_20260926.tif';

  const meta1 = await OfflineChangeDetectionService.inspectRaster(baseFile);
  const meta2 = await OfflineChangeDetectionService.inspectRaster(obsFile);

  console.log(`Baseline T0: ${meta1.filename} (${meta1.width}x${meta1.height}, ${meta1.numBands} bands, ${meta1.crs})`);
  console.log(`Observation T1: ${meta2.filename} (${meta2.width}x${meta2.height}, ${meta2.numBands} bands, ${meta2.crs})`);

  console.log('\nExecuting Change Detection...');
  const result = await OfflineChangeDetectionService.executeChangeDetection({
    baselinePath: baseFile,
    observationPath: obsFile,
    vegetationThreshold: 0.15,
    soilThreshold: 0.12,
    maskClouds: true,
  });

  console.log('Status:', result.status);
  console.log('Job ID:', result.jobId);
  console.log('Pipeline Selected:', result.pipeline);
  console.log('Common Analysis Grid:', result.commonGrid.width, 'x', result.commonGrid.height);
  console.log('Total Footprint Area:', result.areaSummary.totalFootprintHectares, 'ha');
  console.log('Valid Analyzed Area:', result.areaSummary.validAnalyzedHectares, 'ha', `(${result.areaSummary.validPercentage}%)`);
  console.log('Cloud / Masked Area:', result.areaSummary.maskedHectares, 'ha', `(${result.areaSummary.maskedPercentage}%)`);

  console.log('\n--- Quantitative Categories ---');
  for (const c of result.areaSummary.categories) {
    console.log(`- ${c.label}: ${c.pixelCount.toLocaleString()} px | ${c.areaHectares.toFixed(2)} ha | ${c.percentage}%`);
  }

  console.log('\n--- Export Artifacts ---');
  console.log(JSON.stringify(result.artifacts, null, 2));
}

main().catch(console.error);
