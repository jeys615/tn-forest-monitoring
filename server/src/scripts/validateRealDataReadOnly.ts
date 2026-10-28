import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { OpticalCompatibilityService } from '../services/spatial/OpticalCompatibilityService.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { OpticalSpatialHarmonizationService } from '../services/spatial/OpticalSpatialHarmonizationService.js';
import { OpticalPixelIndexService } from '../services/spatial/OpticalPixelIndexService.js';
import { OpticalPixelChangeDetector, DEFAULT_OPTICAL_THRESHOLD_CONFIG } from '../services/changeDetection/OpticalPixelChangeDetector.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { RejectionReasonCode, type GeoJSONPolygon } from '@tn-forest/shared/types';
import fs from 'node:fs';

async function main() {
  console.log('============================================================');
  console.log('PHASE 19 — READ-ONLY REAL DATA VALIDATION');
  console.log('============================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // ------------------------------------------------------------
  // CASE B: Vadipatti Landsat-8 vs Sentinel-2 (Cross-Sensor)
  // ------------------------------------------------------------
  console.log('------------------------------------------------------------');
  console.log('CASE B: Vadipatti Landsat-8 vs Sentinel-2 (Cross-Sensor)');
  console.log('------------------------------------------------------------');
  const vadiZone = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  const vadiBaseMeta = await SatelliteMetadata.findById('6aa678502b4fe5808c7e8e2d');
  const vadiCurMeta = await SatelliteMetadata.findById('6aa6798c2b4fe5808c7e9038');

  console.log(`Zone: ${vadiZone?.name} (${vadiZone?.zoneId})`);
  console.log(`Baseline Observation: ${vadiBaseMeta?.imageId}`);
  console.log(`  Source: ${vadiBaseMeta?.source} | Platform: ${vadiBaseMeta?.platform} | Resolution: ${vadiBaseMeta?.resolutionMeters}m | Date: ${vadiBaseMeta?.acquisitionDate?.toISOString()}`);
  console.log(`Current Observation:  ${vadiCurMeta?.imageId}`);
  console.log(`  Source: ${vadiCurMeta?.source} | Platform: ${vadiCurMeta?.platform} | Resolution: ${vadiCurMeta?.resolutionMeters}m | Date: ${vadiCurMeta?.acquisitionDate?.toISOString()}`);

  if (vadiBaseMeta && vadiCurMeta) {
    const vadiCompat = OpticalCompatibilityService.evaluateOpticalCompatibility(
      {
        imageId: vadiBaseMeta.imageId,
        source: vadiBaseMeta.source,
        resolutionMeters: vadiBaseMeta.resolutionMeters || 30,
        acquisitionDate: vadiBaseMeta.acquisitionDate,
      },
      {
        imageId: vadiCurMeta.imageId,
        source: vadiCurMeta.source,
        resolutionMeters: vadiCurMeta.resolutionMeters || 10,
        acquisitionDate: vadiCurMeta.acquisitionDate,
      },
    );

    console.log(`\nCompatibility Result: isCompatible=${vadiCompat.isCompatible}`);
    console.log(`Rejection Code:       ${vadiCompat.rejectionCode}`);
    console.log(`Rejection Reason:     ${vadiCompat.reason}`);

    if (!vadiCompat.isCompatible && vadiCompat.rejectionCode === RejectionReasonCode.OPTICAL_SENSOR_MISMATCH) {
      console.log('\n✅ CASE B VERIFIED: Cross-sensor optical pair (Landsat-8 vs Sentinel-2) correctly rejected with OPTICAL_SENSOR_MISMATCH.');
    } else {
      console.error('\n❌ CASE B FAILED: Expected cross-sensor rejection with OPTICAL_SENSOR_MISMATCH.');
    }
  }

  // ------------------------------------------------------------
  // CASE A: Sirumalai Sentinel-2 (2026-09-06 vs 2026-09-26)
  // ------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  console.log('CASE A: Sirumalai Sentinel-2 (2026-09-06 vs 2026-09-26)');
  console.log('------------------------------------------------------------');
  const siruZone = await Zone.findOne({ zoneId: 'ZONE-260925-8986' });
  const siruBaseMeta = await SatelliteMetadata.findById('6ab5c628f979afc8c8714eba');
  const siruCurMeta = await SatelliteMetadata.findById('6ab8abf5667c98f4208d8f6a');

  console.log(`Zone: ${siruZone?.name} (${siruZone?.zoneId})`);
  console.log(`Baseline Observation: ${siruBaseMeta?.imageId}`);
  console.log(`  Source: ${siruBaseMeta?.source} | Platform: ${siruBaseMeta?.platform} | Resolution: ${siruBaseMeta?.resolutionMeters}m | Date: ${siruBaseMeta?.acquisitionDate?.toISOString()}`);
  console.log(`Current Observation:  ${siruCurMeta?.imageId}`);
  console.log(`  Source: ${siruCurMeta?.source} | Platform: ${siruCurMeta?.platform} | Resolution: ${siruCurMeta?.resolutionMeters}m | Date: ${siruCurMeta?.acquisitionDate?.toISOString()}`);

  if (siruBaseMeta && siruCurMeta && siruZone) {
    const siruCompat = OpticalCompatibilityService.evaluateOpticalCompatibility(
      {
        imageId: siruBaseMeta.imageId,
        source: siruBaseMeta.source,
        resolutionMeters: siruBaseMeta.resolutionMeters || 10,
        acquisitionDate: siruBaseMeta.acquisitionDate,
      },
      {
        imageId: siruCurMeta.imageId,
        source: siruCurMeta.source,
        resolutionMeters: siruCurMeta.resolutionMeters || 10,
        acquisitionDate: siruCurMeta.acquisitionDate,
      },
    );

    console.log(`\nCompatibility Result: isCompatible=${siruCompat.isCompatible}`);
    if (siruCompat.isCompatible) {
      console.log('✅ Same-sensor Sentinel-2 pair is compatible.');
    }

    // Check raster files on disk
    const basePath = siruBaseMeta.localRasterPath;
    const curPath = siruCurMeta.localRasterPath;

    console.log(`Baseline Raster Path: ${basePath} (${basePath && fs.existsSync(basePath) ? 'EXISTS' : 'NOT FOUND'})`);
    console.log(`Current Raster Path:  ${curPath} (${curPath && fs.existsSync(curPath) ? 'EXISTS' : 'NOT FOUND'})`);

    if (basePath && fs.existsSync(basePath) && curPath && fs.existsSync(curPath)) {
      console.log('\nExecuting dry-run real raster pixel processing for Sirumalai...');

      // 1. AnalysisGrid
      const boundary = siruZone.boundary as GeoJSONPolygon;
      const targetGrid = AnalysisGridService.createAnalysisGrid(boundary, {
        targetCrs: 'EPSG:32643',
        pixelSizeMeters: 10,
      });
      console.log(`AnalysisGrid: ${targetGrid.width}x${targetGrid.height} pixels, CRS=${targetGrid.crs}, Origin=(${targetGrid.originX}, ${targetGrid.originY})`);

      // 2. Read GeoTIFFs
      const baseParsed = await GeoTiffService.readGeoTiff(basePath);
      const curParsed = await GeoTiffService.readGeoTiff(curPath);
      console.log(`Baseline GeoTIFF: ${baseParsed.metadata.width}x${baseParsed.metadata.height}, CRS=${baseParsed.metadata.crs}, ${baseParsed.bandData.length} bands`);
      console.log(`Current GeoTIFF:  ${curParsed.metadata.width}x${curParsed.metadata.height}, CRS=${curParsed.metadata.crs}, ${curParsed.bandData.length} bands`);

      // 3. True Geospatial Reprojection
      const baseHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(baseParsed, targetGrid, { satellite: 'Sentinel-2' });
      const curHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(curParsed, targetGrid, { satellite: 'Sentinel-2' });
      console.log(`Harmonized Baseline: ${baseHarm.validPixelCount} valid pixels on grid`);
      console.log(`Harmonized Current:  ${curHarm.validPixelCount} valid pixels on grid`);

      // 4. Valid Intersection Mask
      const inter = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(baseHarm, curHarm, boundary, targetGrid);
      console.log(`Intersection: ${inter.comparisonPixelCount} valid comparison pixels out of ${inter.zonePixelCount} zone pixels (${inter.coveragePercentage}%)`);

      // 5. Per-Pixel Spectral Indices
      const baseIndices = OpticalPixelIndexService.calculatePixelIndices(baseHarm, inter.validComparisonMask);
      const curIndices = OpticalPixelIndexService.calculatePixelIndices(curHarm, inter.validComparisonMask);
      console.log(`Baseline Zonal Summary: NDVI=${baseIndices.summary.ndviMean}, NDWI=${baseIndices.summary.ndwiMean}, BSI=${baseIndices.summary.bsiMean}`);
      console.log(`Current Zonal Summary:  NDVI=${curIndices.summary.ndviMean}, NDWI=${curIndices.summary.ndwiMean}, BSI=${curIndices.summary.bsiMean}`);

      // 6. Pixel-Level Change Detection
      const pixelResult = OpticalPixelChangeDetector.detectPixelChange({
        baselineIndices: baseIndices.indices,
        currentIndices: curIndices.indices,
        validMask: inter.validComparisonMask,
        grid: targetGrid,
        zoneAreaHectares: siruZone.areaHectares || 100,
        thresholdConfig: DEFAULT_OPTICAL_THRESHOLD_CONFIG,
      });

      console.log('\n--- REAL PIXEL CHANGE DETECTION RESULTS ---');
      console.log(`Changed Pixels:          ${pixelResult.spatialResult.changedPixels}`);
      console.log(`Valid Comparison Pixels:  ${pixelResult.spatialResult.validPixels}`);
      console.log(`Affected Area %:         ${pixelResult.spatialResult.affectedAreaPercentage}%`);
      console.log(`Physical Changed Area:   ${pixelResult.spatialResult.changedArea} ha`);
      console.log(`Mean ΔNDVI:              ${pixelResult.changeIndicators.ndviDelta}`);
      console.log(`Mean ΔNDWI:              ${pixelResult.changeIndicators.ndwiDelta}`);
      console.log(`Mean ΔBSI:               ${pixelResult.changeIndicators.bsiDelta}`);
      console.log(`Decrease Pixels:         ${pixelResult.rasterStatistics.decreasePixelCount}`);
      console.log(`Increase Pixels:         ${pixelResult.rasterStatistics.increasePixelCount}`);
      console.log(`Stable Pixels:           ${pixelResult.rasterStatistics.stablePixelCount}`);
      console.log(`Explanation:             ${pixelResult.spatialResult.explanation}`);

      console.log('\n✅ CASE A VERIFIED: Real-data optical differencing executed end-to-end on authentic GeoTIFFs.');
    }
  }

  await mongoose.disconnect();
  console.log('\n============================================================');
  console.log('REAL DATA VALIDATION COMPLETED (0 DATABASE MUTATIONS)');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(1);
});
