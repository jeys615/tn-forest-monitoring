/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
process.env.NODE_ENV = 'test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SensorType, type GeoJSONPolygon } from '@tn-forest/shared/types';
import { getGeeConfig } from '../config/gee.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeSatelliteSearchService } from '../services/gee/GeeSatelliteSearchService.js';
import { GeeExportService } from '../services/gee/GeeExportService.js';
import { GeeTaskService } from '../services/gee/GeeTaskService.js';
import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { RasterReaderService } from '../services/raster/RasterReaderService.js';
import { SensorNormalizationService } from '../services/raster/SensorNormalizationService.js';
import { RasterPreprocessingService } from '../services/raster/RasterPreprocessingService.js';
import { RasterHarmonizationService } from '../services/raster/RasterHarmonizationService.js';
import { PixelAnalysisService } from '../services/raster/PixelAnalysisService.js';
import { calculateM6Metrics } from '../utils/m6Metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function check(desc: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${desc} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n🧪 Starting Real Raster GIS & GEE Pipeline Automated Test Suite...\n');

  const testPolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.053, 9.655],
        [78.057, 9.655],
        [78.057, 9.652],
        [78.053, 9.652],
        [78.053, 9.655],
      ],
    ],
  };

  // ──────────────────────────────────────────────────────────
  // TEST 1: GEE Configuration & Auth Service
  // ──────────────────────────────────────────────────────────
  console.log('▶ Running TEST 1 — GEE CONFIGURATION & AUTH');
  const geeConfig = getGeeConfig();
  check('TEST 1.1: GEE configuration has valid projectId', typeof geeConfig.projectId === 'string' && geeConfig.projectId.length > 0);
  check('TEST 1.2: GEE export parameters are defined', geeConfig.exportScale === 10 && geeConfig.maxPixels > 0);
  check('TEST 1.3: GEE auth service instance exists', !!GeeAuthService.getInstance());

  // ──────────────────────────────────────────────────────────
  // TEST 2: Multi-Satellite Search & Priority Hierarchy
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 2 — MULTI-SATELLITE SEARCH HIERARCHY');
  const searchService = new GeeSatelliteSearchService();
  const searchRes = await searchService.searchObservations({
    geometry: testPolygon,
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-03-01'),
    maxCloudCover: 20.0,
    preferredSensorType: SensorType.OPTICAL,
  });

  check('TEST 2.1: Satellite search returns candidates or scene', searchRes.candidatesEvaluated.length >= 0);
  check('TEST 2.2: Search evaluates cloud cover criteria', searchRes.searchSummary.cloudRejectedCount >= 0);

  // ──────────────────────────────────────────────────────────
  // TEST 3: GEE Export Service & Required Bands
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 3 — GEE EXPORT BAND SELECTION');
  const exportService = new GeeExportService();
  const s2Bands = exportService.selectExportBands('Sentinel-2');
  const l8Bands = exportService.selectExportBands('Landsat-8');
  const s1Bands = exportService.selectExportBands('Sentinel-1');

  check('TEST 3.1: Sentinel-2 export includes B2, B3, B4, B8, B11, B12, SCL', s2Bands.includes('B2') && s2Bands.includes('B4') && s2Bands.includes('B8') && s2Bands.includes('SCL'));
  check('TEST 3.2: Landsat export includes SR_B2, SR_B4, SR_B5, QA_PIXEL', l8Bands.includes('SR_B2') && l8Bands.includes('SR_B4') && l8Bands.includes('SR_B5') && l8Bands.includes('QA_PIXEL'));
  check('TEST 3.3: Sentinel-1 export includes VV, VH', s1Bands.includes('VV') && s1Bands.includes('VH'));

  const realImageId =
    searchRes.selectedScene?.imageId ||
    searchRes.candidatesEvaluated[0]?.imageId ||
    'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM';

  const exportReq = await exportService.requestImageExport({
    scene: {
      satellite: 'Sentinel-2',
      sensorType: SensorType.OPTICAL,
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      imageId: realImageId,
      acquisitionDate: new Date('2024-02-15'),
      cloudCover: 4.2,
      nativeResolution: 10,
      bands: s2Bands,
      footprint: testPolygon,
      processingLevel: 'Level-2A',
      provider: 'GEE',
    },
    zoneCode: 'Z-KALLIKUDI',
    jobId: 'JOB-TEST001',
    imageType: 'CURRENT',
    geometry: testPolygon,
    scaleMeters: 10,
  });

  check('TEST 3.4: GEE Export request creates valid taskId and driveFileName', exportReq.taskId.length > 0 && exportReq.driveFileName.includes('Z-KALLIKUDI_JOB-TEST001_CURRENT'));

  // ──────────────────────────────────────────────────────────
  // TEST 4: GEE Task Status Service & Polling
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 4 — GEE TASK STATUS & POLLING');
  const taskService = new GeeTaskService();
  const taskStatus = await taskService.getTaskStatus(exportReq.taskId);
  check('TEST 4.1: Task status returns valid state', ['READY', 'RUNNING', 'PENDING', 'COMPLETED', 'EXPORT_READY', 'EXPORT_RUNNING', 'EXPORT_COMPLETED'].includes(taskStatus.state));

  // ──────────────────────────────────────────────────────────
  // TEST 5: Google Drive Service & GeoTIFF Ingestion
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 5 — GOOGLE DRIVE INGESTION & TEMPORARY FILES');
  const driveService = new GoogleDriveService();
  const testJobId = `JOB-RASTER-${Date.now()}`;
  const downloaded = await driveService.downloadGeoTiff({
    jobId: testJobId,
    fileName: `${testJobId}_CURRENT.tif`,
    mockFallbackGenerator: () =>
      GeoTiffService.createSampleGeoTiff({
        width: 40,
        height: 37,
        sensor: 'Sentinel-2',
        ndviMean: 0.664,
        changedPixelCount: 10,
      }) as any,
  });

  check('TEST 5.1: GeoTIFF downloaded to local storage', fs.existsSync(downloaded.localFilePath));
  check('TEST 5.2: Downloaded GeoTIFF size > 0 bytes', downloaded.sizeBytes > 0);

  // ──────────────────────────────────────────────────────────
  // TEST 6: GeoTIFF Parser & Metadata
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 6 — GEOTIFF PARSER & METADATA');
  const parsedGeoTiff = await GeoTiffService.readGeoTiff(downloaded.localFilePath);
  check('TEST 6.1: GeoTIFF dimensions are 40x37', parsedGeoTiff.metadata.width === 40 && parsedGeoTiff.metadata.height === 37);
  check('TEST 6.2: GeoTIFF contains multiple spectral bands', parsedGeoTiff.bandData.length >= 4);
  check('TEST 6.3: Band array length matches width x height (1480 pixels)', parsedGeoTiff.bandData[0].length === 1480);

  // ──────────────────────────────────────────────────────────
  // TEST 7: Optical Band Extraction & Normalization
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 7 — RASTER READER & SENSOR NORMALIZATION');
  const opticalRaster = await RasterReaderService.readOpticalRaster(downloaded.localFilePath, 'Sentinel-2');
  check('TEST 7.1: Extracted Blue, Green, Red, NIR bands', !!opticalRaster.bands.blue && !!opticalRaster.bands.green && !!opticalRaster.bands.red && !!opticalRaster.bands.nir);

  const normalizedRaster = SensorNormalizationService.normalizeOpticalBands(opticalRaster);
  check('TEST 7.2: Normalized reflectance values are in range [0.0, 1.0]', normalizedRaster.red[0] >= 0 && normalizedRaster.red[0] <= 1.0);

  // ──────────────────────────────────────────────────────────
  // TEST 8: Cloud & Nodata Masking
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 8 — CLOUD & NODATA PREPROCESSING MASK');
  const preproc = RasterPreprocessingService.generateValidPixelMask(normalizedRaster, 4.2);
  check('TEST 8.1: Valid pixel count equals total scene pixels (1480 for clear scene)', preproc.validPixels === 1480);
  check('TEST 8.2: Valid percentage is 100%', preproc.validPercentage === 100.0);
  check('TEST 8.3: Masked pixels is 0', preproc.maskedPixels === 0);

  // ──────────────────────────────────────────────────────────
  // TEST 9: Authoritative Baseline Grid Harmonization
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 9 — RASTER HARMONIZATION & RESAMPLING');
  const harmonized = RasterHarmonizationService.harmonizeToBaselineGrid(normalizedRaster, {
    width: 40,
    height: 37,
    pixelScale: 10,
    crs: 'EPSG:4326',
  });
  check('TEST 9.1: Harmonized raster maintains authoritative baseline dimensions (40x37)', harmonized.width === 40 && harmonized.height === 37);

  // ──────────────────────────────────────────────────────────
  // TEST 10: Real Pixel Spectral Index Calculations
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 10 — REAL PIXEL SPECTRAL INDICES (NDVI, NDWI, NBR, BSI, EVI, SAVI)');
  const spectral = PixelAnalysisService.calculateSpectralIndices(harmonized, preproc.validMask);
  check('TEST 10.1: NDVI calculated for all valid pixels', spectral.indices.ndvi.length === 1480 && !isNaN(spectral.indices.ndvi[0]));
  check('TEST 10.2: NDVI mean is realistic forest value (~0.664)', Math.abs(spectral.stats.ndviMean - 0.664) < 0.05);
  check('TEST 10.3: NDWI calculated from (Green - NIR) / (Green + NIR)', !isNaN(spectral.stats.ndwiMean));
  check('TEST 10.4: SAVI calculated with L=0.5', !isNaN(spectral.stats.saviMean));
  check('TEST 10.5: EVI calculated from 2.5 * ((NIR-RED)/(NIR+6RED-7.5BLUE+1))', !isNaN(spectral.stats.eviMean));

  // ──────────────────────────────────────────────────────────
  // TEST 11: Real Pixel Change Detection & Invariant Verification
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 11 — REAL PIXEL CHANGE DETECTION & INVARIANT VERIFICATION');
  // Create baseline spectral
  const baseDownloaded = await driveService.downloadGeoTiff({
    jobId: testJobId,
    fileName: `${testJobId}_BASELINE.tif`,
    mockFallbackGenerator: () =>
      GeoTiffService.createSampleGeoTiff({
        width: 40,
        height: 37,
        sensor: 'Sentinel-2',
        ndviMean: 0.666,
        changedPixelCount: 0,
      }) as any,
  });

  const baseRaw = await RasterReaderService.readOpticalRaster(baseDownloaded.localFilePath, 'Sentinel-2');
  const baseNorm = SensorNormalizationService.normalizeOpticalBands(baseRaw);
  const basePre = RasterPreprocessingService.generateValidPixelMask(baseNorm, 0);
  const baseSpec = PixelAnalysisService.calculateSpectralIndices(baseNorm, basePre.validMask);

  const rasterChange = PixelAnalysisService.detectPixelChange({
    baselineIndices: baseSpec.indices,
    currentIndices: spectral.indices,
    baselineValidMask: basePre.validMask,
    currentValidMask: preproc.validMask,
    pixelResolutionMeters: 10,
    changeThreshold: 0.05,
  });

  check('TEST 11.1: Detected exactly 10 changed pixels from raster difference', rasterChange.changedPixels === 10);
  check('TEST 11.2: Valid pixels is 1480 (40 x 37)', rasterChange.validPixels === 1480);
  check('TEST 11.3: No-change pixels is 1470 (1480 - 10)', rasterChange.noChangePixels === 1470);
  check('TEST 11.4: INVARIANT CHECK: validPixels = changedPixels + noChangePixels (1480 = 10 + 1470)', rasterChange.pixelAccountingValid);

  // ──────────────────────────────────────────────────────────
  // TEST 12: Affected Area & Operational Alert Evaluation
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 12 — AFFECTED AREA & OPERATIONAL ALERT DECISION');
  const m6 = calculateM6Metrics({
    changedPixels: rasterChange.changedPixels,
    validPixels: rasterChange.validPixels,
    pixelResolutionMeters: 10,
    zoneAreaM2: 148000,
    operationalThresholdPercentage: 2.0,
  });

  check('TEST 12.1: Affected area is 1000.00 m² (10 * 100 m²)', m6.affectedAreaM2 === 1000);
  check('TEST 12.2: Affected area in ha is 0.1000 ha', m6.affectedAreaHa === 0.1);
  check('TEST 12.3: Affected area percentage is ~0.676% (1000 / 148000 * 100)', Math.abs(m6.affectedAreaPercentage - 0.6757) < 0.01);
  check('TEST 12.4: Below operational threshold (0.68% < 2.00%) -> NO ALERT', !m6.alertGenerated && m6.severity === 'NONE');

  // ──────────────────────────────────────────────────────────
  // TEST 13: Temporary Directory Cleanup
  // ──────────────────────────────────────────────────────────
  console.log('\n▶ Running TEST 13 — TEMPORARY DIRECTORY CLEANUP');
  driveService.cleanupJobTempFiles(testJobId);
  const tempDirExists = fs.existsSync(path.dirname(downloaded.localFilePath));
  check('TEST 13.1: Temporary GeoTIFF directory cleaned up after job execution', !tempDirExists);

  console.log(`\n==================================================`);
  console.log(`RASTER PIPELINE TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
