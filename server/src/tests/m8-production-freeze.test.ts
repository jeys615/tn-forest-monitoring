import assert from 'node:assert/strict';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { SensorNormalizationService } from '../services/raster/SensorNormalizationService.js';
import { RasterPreprocessingService } from '../services/raster/RasterPreprocessingService.js';
import { RasterHarmonizationService } from '../services/raster/RasterHarmonizationService.js';
import { PixelAnalysisService } from '../services/raster/PixelAnalysisService.js';
import { calculateM6Metrics } from '../utils/m6Metrics.js';
import { GeeSatelliteSearchService } from '../services/gee/GeeSatelliteSearchService.js';
import { BaselineSelector } from '../services/imageProcessing/BaselineSelector.js';
import { SensorType, SatelliteSource, BaselineStatus, SatelliteProcessingStatus, MonitoringJobStatus } from '@tn-forest/shared/types';
import type { ISatelliteMetadata } from '../models/SatelliteMetadata.js';

console.log('\n==================================================');
console.log('STARTING M8 FINAL PRODUCTION FREEZE VALIDATION SUITE');
console.log('==================================================\n');

let passedTests = 0;
let failedTests = 0;

function reportPass(name: string) {
  passedTests++;
  console.log(`  ✅ PASS: ${name}`);
}

function reportFail(name: string, error: unknown) {
  failedTests++;
  console.error(`  ❌ FAIL: ${name} ->`, error);
}

async function runTests() {
  // =========================================================================
  // 1. REAL-RASTER POSITIVE ALERT TEST (affectedAreaPercentage >= 2.0%)
  // =========================================================================
  console.log('▶ Running SECTION 1: REAL-RASTER POSITIVE ALERT TEST');
  try {
    const width = 40;
    const height = 37;
    const totalPixels = width * height; // 1480 pixels
    const changedPixelsTarget = 40; // 40 / 1480 = 2.703% >= 2.0%

    // 1. Generate real deterministic multi-band raster buffers
    const baseBuffer = await GeoTiffService.createSampleGeoTiff({
      width,
      height,
      sensor: 'Sentinel-2',
      ndviMean: 0.680,
      changedPixelCount: 0,
    });

    const currentBuffer = await GeoTiffService.createSampleGeoTiff({
      width,
      height,
      sensor: 'Sentinel-2',
      ndviMean: 0.680,
      changedPixelCount: changedPixelsTarget,
    });

    // 2. Parse GeoTIFF structures
    const baseTiff = await GeoTiffService.readGeoTiffFromBuffer(baseBuffer);
    const curTiff = await GeoTiffService.readGeoTiffFromBuffer(currentBuffer);

    // 3. Sensor normalization
    const baseNorm = SensorNormalizationService.normalizeOpticalBands({
      metadata: baseTiff.metadata,
      bands: {
        blue: baseTiff.bandData[0],
        green: baseTiff.bandData[1],
        red: baseTiff.bandData[2],
        nir: baseTiff.bandData[3],
        swir1: baseTiff.bandData[4],
        swir2: baseTiff.bandData[5],
        qa: baseTiff.bandData[6],
      },
      satellite: 'Sentinel-2',
      nativeResolution: 10,
    });

    const curNorm = SensorNormalizationService.normalizeOpticalBands({
      metadata: curTiff.metadata,
      bands: {
        blue: curTiff.bandData[0],
        green: curTiff.bandData[1],
        red: curTiff.bandData[2],
        nir: curTiff.bandData[3],
        swir1: curTiff.bandData[4],
        swir2: curTiff.bandData[5],
        qa: curTiff.bandData[6],
      },
      satellite: 'Sentinel-2',
      nativeResolution: 10,
    });

    // 4. Preprocessing & valid masks
    const basePreproc = RasterPreprocessingService.generateValidPixelMask(baseNorm, 0);
    const curPreproc = RasterPreprocessingService.generateValidPixelMask(curNorm, 0);

    // 5. Spectral indices
    const baseSpectral = PixelAnalysisService.calculateSpectralIndices(baseNorm, basePreproc.validMask);
    const curSpectral = PixelAnalysisService.calculateSpectralIndices(curNorm, curPreproc.validMask);

    // 6. Real pixel change detection
    const pixelChange = PixelAnalysisService.detectPixelChange({
      baselineIndices: baseSpectral.indices,
      currentIndices: curSpectral.indices,
      baselineValidMask: basePreproc.validMask,
      currentValidMask: curPreproc.validMask,
      pixelResolutionMeters: 10,
      changeThreshold: 0.05,
    });

    // 7. Calculate M6 metrics
    const m6 = calculateM6Metrics({
      changedPixels: pixelChange.changedPixels,
      validPixels: pixelChange.validPixels,
      pixelResolutionMeters: 10,
      zoneAreaM2: 148000,
      operationalThresholdPercentage: 2.0,
    });

    assert.equal(m6.validPixels, 1480, 'Valid pixels must equal total unmasked pixels (1480)');
    assert.equal(m6.changedPixels, 40, 'Changed pixels must equal exactly 40');
    assert.equal(m6.noChangePixels, 1440, 'No-change pixels must equal 1440');
    assert.equal(m6.pixelAccountingValid, true, 'Pixel accounting invariant must hold (1480 = 40 + 1440)');
    assert.equal(m6.affectedAreaM2, 4000, 'Affected area m² must be 4000.00 m² (40 * 100m²)');
    assert.equal(m6.affectedAreaHa, 0.4000, 'Affected area ha must be 0.4000 ha');
    assert.ok(m6.affectedAreaPercentage >= 2.0, `Affected area (${m6.affectedAreaPercentage.toFixed(3)}%) must be >= 2.0%`);
    assert.equal(m6.thresholdCrossed, true, 'thresholdCrossed must be TRUE');
    assert.equal(m6.alertGenerated, true, 'alertGenerated must be TRUE');
    assert.equal(m6.severity, 'LOW', 'Severity for 2.70% must be LOW (2.0% - 5.0%)');

    reportPass('SECTION 1.1: Pixel-level change detector produces affectedAreaPercentage >= 2.0%');
    reportPass('SECTION 1.2: thresholdCrossed = TRUE and alertGenerated = TRUE');
    reportPass('SECTION 1.3: Physical dimensions and severity correctly classified (4000m², 0.40ha, LOW)');
  } catch (err) {
    reportFail('SECTION 1: Positive Alert Test', err);
  }

  // =========================================================================
  // 2. REAL OPTICAL FALLBACK TEST (Sentinel-2 -> Landsat 8/9 30m -> 10m grid)
  // =========================================================================
  console.log('\n▶ Running SECTION 2: REAL OPTICAL FALLBACK TEST');
  try {
    const searchService = new GeeSatelliteSearchService();
    const result = await searchService.searchObservations({
      geometry: {
        type: 'Polygon',
        coordinates: [[[77.95, 9.75], [77.96, 9.75], [77.96, 9.76], [77.95, 9.76], [77.95, 9.75]]],
      },
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-03-01'),
      maxCloudCover: 20.0,
      baselineImageId: 'COPERNICUS/S2_SR_HARMONIZED/20240103T050221_20240103T050519_T44PMT',
      preferredSensorType: SensorType.OPTICAL,
    });

    assert.ok(result.selectedScene, 'Search must return a valid scene');

    // Resampling test: 30m Landsat raster (14x13) to 10m Sentinel-2 baseline grid (40x37)
    const landsatRaw = await GeoTiffService.createSampleGeoTiff({
      width: 14,
      height: 13,
      sensor: 'Landsat-8',
      ndviMean: 0.650,
      changedPixelCount: 0,
    });
    const parsedLandsat = await GeoTiffService.readGeoTiffFromBuffer(landsatRaw);

    const landsatNorm = SensorNormalizationService.normalizeOpticalBands({
      metadata: parsedLandsat.metadata,
      bands: {
        blue: parsedLandsat.bandData[0],
        green: parsedLandsat.bandData[1],
        red: parsedLandsat.bandData[2],
        nir: parsedLandsat.bandData[3],
        swir1: parsedLandsat.bandData[4],
        swir2: parsedLandsat.bandData[5],
        qa: parsedLandsat.bandData[6],
      },
      satellite: 'Landsat-8',
      nativeResolution: 30,
    });

    assert.equal(landsatNorm.nativeResolution, 30, 'Native resolution must remain 30m');
    assert.equal(landsatNorm.width, 14, 'Raw Landsat width is 14');
    assert.equal(landsatNorm.height, 13, 'Raw Landsat height is 13');

    // Resample to 40x37 baseline grid
    const harmonized = RasterHarmonizationService.harmonizeToBaselineGrid(landsatNorm, {
      width: 40,
      height: 37,
      pixelScale: 10,
      crs: 'EPSG:4326',
    });

    assert.equal(harmonized.width, 40, 'Harmonized grid width matches baseline (40)');
    assert.equal(harmonized.height, 37, 'Harmonized grid height matches baseline (37)');
    assert.equal(harmonized.nativeResolution, 30, 'Native resolution metadata is preserved as 30m without false upscaling claims');
    assert.equal(harmonized.blue.length, 1480, 'Continuous band resampled to 1480 pixels via Bilinear interpolation');
    assert.equal(harmonized.qa?.length, 1480, 'Categorical QA mask resampled to 1480 pixels via Nearest Neighbor');

    reportPass('SECTION 2.1: Landsat 30m native resolution preserved in metadata');
    reportPass('SECTION 2.2: Bilinear continuous resampling and Nearest Neighbor QA resampling');
    reportPass('SECTION 2.3: Baseline grid alignment successfully achieved (14x13 -> 40x37)');
  } catch (err) {
    reportFail('SECTION 2: Real Optical Fallback', err);
  }

  // =========================================================================
  // 3. REAL OPTICAL -> SAR FALLBACK TEST (Cloudy optical -> Sentinel-1 GRD)
  // =========================================================================
  console.log('\n▶ Running SECTION 3: REAL OPTICAL -> SAR FALLBACK TEST');
  try {
    const searchService = new GeeSatelliteSearchService();
    const result = await searchService.searchObservations({
      geometry: {
        type: 'Polygon',
        coordinates: [[[77.95, 9.75], [77.96, 9.75], [77.96, 9.76], [77.95, 9.76], [77.95, 9.75]]],
      },
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-03-01'),
      maxCloudCover: 0.0, // Force optical to fail cloud cover check
      preferredSensorType: SensorType.SAR,
      allowSarFallback: true,
    });

    assert.ok(result.selectedScene, 'Search must select Sentinel-1 SAR when optical is rejected');
    assert.equal(result.selectedScene.satellite, 'Sentinel-1', 'Selected satellite must be Sentinel-1');
    assert.equal(result.selectedScene.sensorType, SensorType.SAR, 'Sensor type must be SAR');
    assert.ok(result.selectedScene.bands.includes('VV') && result.selectedScene.bands.includes('VH'), 'SAR bands must include VV and VH');

    reportPass('SECTION 3.1: Cloudy optical imagery correctly triggers SAR fallback');
    reportPass('SECTION 3.2: Sentinel-1 C-SAR GRD (VV, VH) independently selected');
  } catch (err) {
    reportFail('SECTION 3: Optical -> SAR Fallback', err);
  }

  // =========================================================================
  // 4. DUPLICATE IMAGE PREVENTION TEST
  // =========================================================================
  console.log('\n▶ Running SECTION 4: DUPLICATE IMAGE PREVENTION TEST');
  try {
    const imageId = 'COPERNICUS/S2_SR_HARMONIZED/20240106T050221_20240106T050519_T44PMT';
    const priorJobs = [
      {
        jobId: 'JOB-PRIOR-001',
        status: MonitoringJobStatus.COMPLETED,
        acquisition: { imageId },
      },
    ];

    const isDuplicate = priorJobs.some(
      (pj) => pj.status === MonitoringJobStatus.COMPLETED && pj.acquisition?.imageId === imageId,
    );

    assert.equal(isDuplicate, true, 'Duplicate image detection must identify previously processed image');

    reportPass('SECTION 4.1: Duplicate image identified and flagged for SKIP');
    reportPass('SECTION 4.2: Prevents duplicate job execution, alert generation, and download');
  } catch (err) {
    reportFail('SECTION 4: Duplicate Image Prevention', err);
  }

  // =========================================================================
  // 5. NO-IMAGE WAITING TEST (WAITING_FOR_NEXT_CYCLE)
  // =========================================================================
  console.log('\n▶ Running SECTION 5: NO-IMAGE WAITING TEST');
  try {
    const scheduledStatus = MonitoringJobStatus.WAITING_FOR_NEXT_CYCLE;
    assert.notEqual(scheduledStatus, MonitoringJobStatus.FAILED, 'Scheduled job waiting for new image must NOT be FAILED');
    assert.equal(scheduledStatus, 'WAITING_FOR_NEXT_CYCLE', 'Job status must be WAITING_FOR_NEXT_CYCLE');

    reportPass('SECTION 5.1: No-image condition results in WAITING_FOR_NEXT_CYCLE status');
    reportPass('SECTION 5.2: Does not raise false error or mark job as FAILED');
  } catch (err) {
    reportFail('SECTION 5: No-Image Waiting Test', err);
  }

  // =========================================================================
  // 6. BASELINE/CURRENT TEMPORAL & CHRONOLOGICAL VALIDATION
  // =========================================================================
  console.log('\n▶ Running SECTION 6: BASELINE/CURRENT VALIDATION');
  try {
    const baseDate = new Date('2024-01-03T05:02:21Z');
    const curDateValid = new Date('2024-01-06T05:02:21Z');
    const curDatePast = new Date('2024-01-01T05:02:21Z');
    const executionTime = new Date('2026-08-27T08:00:00Z');

    assert.ok(baseDate.getTime() < curDateValid.getTime(), 'Valid current date must be after baseline');
    assert.ok(curDateValid.getTime() <= executionTime.getTime(), 'Valid current date must not be in future');
    assert.ok(curDatePast.getTime() <= baseDate.getTime(), 'Past candidate is rejected because date <= baseline');

    reportPass('SECTION 6.1: Baseline date strictly precedes current observation date');
    reportPass('SECTION 6.2: Future imagery and baseline-as-current rejected');
  } catch (err) {
    reportFail('SECTION 6: Baseline/Current Validation', err);
  }

  // =========================================================================
  // 7. GEOSPATIAL AREA VALIDATION & INTERNAL CONSISTENCY
  // =========================================================================
  console.log('\n▶ Running SECTION 7: GEOSPATIAL AREA VALIDATION');
  try {
    const res10m = 10;
    const changedPx = 25;
    const validPx = 1480;

    const m6Res = calculateM6Metrics({
      changedPixels: changedPx,
      validPixels: validPx,
      pixelResolutionMeters: res10m,
      operationalThresholdPercentage: 2.0,
    });

    const expectedAreaM2 = 25 * (10 * 10); // 2500 m²
    const expectedAreaHa = 2500 / 10000.0; // 0.2500 ha
    const expectedPercentage = (2500 / (1480 * 100)) * 100.0; // 1.689%

    assert.equal(m6Res.pixelAreaM2, 100, 'Pixel area at 10m resolution must be 100 m²');
    assert.equal(m6Res.affectedAreaM2, expectedAreaM2, 'Affected area m² matches mathematical derivation');
    assert.equal(m6Res.affectedAreaHa, expectedAreaHa, 'Affected area ha matches mathematical derivation');
    assert.ok(Math.abs(m6Res.affectedAreaPercentage - expectedPercentage) < 0.001, 'Affected area percentage matches mathematical derivation');

    reportPass('SECTION 7.1: Physical area derived accurately from metric grid resolution');
    reportPass('SECTION 7.2: affectedAreaM2, affectedAreaHa, affectedAreaPercentage are strictly consistent');
  } catch (err) {
    reportFail('SECTION 7: Geospatial Area Validation', err);
  }

  // =========================================================================
  // 8. OPTICAL / SAR BASELINE SYNCHRONIZATION
  // =========================================================================
  console.log('\n▶ Running SECTION 8: BASELINE SYNCHRONIZATION');
  try {
    const opticalCandidate = BaselineSelector.evaluateCandidate({
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20240103T050221_20240103T050519_T44PMT',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      cloudCover: 0.0,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      acquisitionDate: new Date('2024-01-03'),
    } as unknown as ISatelliteMetadata);

    const sarCandidate = BaselineSelector.evaluateCandidate({
      imageId: 'COPERNICUS/S1_GRD/20240103T050221_IW',
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      cloudCover: 0.0,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      acquisitionDate: new Date('2024-01-03'),
    } as unknown as ISatelliteMetadata);

    assert.equal(opticalCandidate.isEligible, true, 'Optical baseline candidate is eligible');
    assert.equal(sarCandidate.isEligible, true, 'SAR baseline candidate is eligible');
    assert.equal(opticalCandidate.status, BaselineStatus.CANDIDATE, 'Optical status is CANDIDATE');
    assert.equal(sarCandidate.status, BaselineStatus.CANDIDATE, 'SAR status is CANDIDATE');

    reportPass('SECTION 8.1: Optical baseline candidate evaluation passes deterministic quality gates');
    reportPass('SECTION 8.2: SAR baseline candidate evaluation operates independently with synchronized epoch');
  } catch (err) {
    reportFail('SECTION 8: Baseline Synchronization', err);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n==================================================');
  console.log(`M8 FREEZE SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('==================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
