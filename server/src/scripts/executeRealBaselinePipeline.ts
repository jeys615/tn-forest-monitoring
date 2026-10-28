import path from 'node:path';
import fs from 'node:fs';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';
import { GeeExportService } from '../services/gee/GeeExportService.js';
import { GeeTaskService } from '../services/gee/GeeTaskService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';
import type { SatelliteScene } from '../services/gee/GeeSatelliteSearchService.js';

/**
 * End-to-End Real Google Earth Engine Export -> Google Drive -> GeoTIFF Pipeline.
 *
 * Target Image: COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM
 * Target Zone: Sathiyar Dam / Reserve Forest
 */
async function runRealPipeline() {
  console.log('================================================================');
  console.log('🛰️ REAL GEE EXPORT ➔ GOOGLE DRIVE ➔ GEOTIFF PIPELINE');
  console.log('================================================================\n');

  // 1. Verify GEE Auth
  console.log('--- 1. VERIFY GOOGLE EARTH ENGINE AUTHENTICATION ---');
  const geeAuth = GeeAuthService.getInstance();
  const geeToken = await geeAuth.getAccessToken();
  if (!geeToken) {
    console.error('❌ GEE Authentication FAILED: No access token.');
    process.exit(1);
  }
  console.log('✅ [GEE] Authentication: SUCCESS\n');

  // 2. Verify Drive Auth
  console.log('--- 2. VERIFY INDEPENDENT GOOGLE DRIVE AUTHENTICATION ---');
  const driveService = new GoogleDriveService();
  const driveCheck = await driveService.checkDriveAccess();
  if (!driveCheck.authenticated || !driveCheck.apiAccess) {
    console.error('❌ [DRIVE] Authentication: FAILED');
    console.error(`Reason: ${driveCheck.error}\n`);
    console.error('Action Required:');
    console.error("  Please run 'gcloud auth login --enable-gdrive-access --update-adc' to grant Drive permissions to ADC.\n");
    process.exit(1);
  }
  console.log('✅ [DRIVE] Authentication: SUCCESS');
  console.log('✅ [DRIVE] Authenticated Drive access: SUCCESS');
  console.log(`✅ [DRIVE] Account: ${driveCheck.userEmail} (Files visible: ${driveCheck.filesCount ?? 0})\n`);

  // 3. Define target image & zone geometry
  const targetImageId = 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM';
  const sathiyarPolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.0747, 10.1182],
        [78.0867, 10.1118],
        [78.0939, 10.1196],
        [78.0890, 10.1235],
        [78.0797, 10.1228],
        [78.0747, 10.1182],
      ],
    ],
  };

  const scene: SatelliteScene = {
    satellite: 'Sentinel-2',
    sensorType: 'OPTICAL' as any,
    collection: 'COPERNICUS/S2_SR_HARMONIZED',
    imageId: targetImageId,
    acquisitionDate: new Date('2020-01-09T05:12:01.000Z'),
    cloudCover: 0.0,
    nativeResolution: 10,
    bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
    footprint: sathiyarPolygon,
    processingLevel: 'Level-2A',
    provider: 'GEE',
  };

  // 4. Request Real GEE Export to Google Drive
  console.log('--- 3. REQUEST REAL GEE EXPORT TO GOOGLE DRIVE ---');
  const exportService = new GeeExportService();
  const zoneCode = 'SATHIYAR';
  const jobId = `JOB-${Date.now().toString(36).toUpperCase()}`;

  console.log(`Target Image: ${targetImageId}`);
  console.log(`Zone Code:    ${zoneCode}`);
  console.log(`Scale:        10m`);
  console.log(`Bands:        B2, B3, B4, B8, B11, B12 (Homogeneous UInt16)`);
  console.log(`Destination:  Google Drive folder 'TN-Forest-Monitoring/GEE-Exports'`);

  const exportResult = await exportService.requestImageExport({
    scene,
    zoneCode,
    jobId,
    imageType: 'BASELINE',
    geometry: sathiyarPolygon,
    scaleMeters: 10,
  });

  console.log(`\n[GEE_EXPORT] Real Export Task Submitted!`);
  console.log(`  Task ID:        ${exportResult.taskId}`);
  console.log(`  Drive Filename: ${exportResult.driveFileName}`);
  console.log(`  Initial State:  ${exportResult.taskState}\n`);

  // 5. Poll Earth Engine Export Task
  console.log('--- 4. POLL EARTH ENGINE EXPORT OPERATION ---');
  const taskService = new GeeTaskService();
  const pollResult = await taskService.pollTaskCompletion(exportResult.taskId, {
    timeoutMs: 600000,
    pollIntervalMs: 10000,
  });

  console.log(`[GEE_TASK] Final State: ${pollResult.state}`);
  if (pollResult.state !== 'EXPORT_COMPLETED') {
    console.error(`❌ Export failed: ${pollResult.errorMessage || 'Unknown export error'}`);
    process.exit(1);
  }
  console.log('✅ [GEE_TASK] Earth Engine Export SUCCEEDED on Google servers!\n');

  // 6. Discover exported file on Google Drive
  console.log('--- 5. SEARCH GOOGLE DRIVE FOR EXPORTED GEOTIFF ---');
  const driveFile = await driveService.findExportedFile(exportResult.driveFileName);
  if (!driveFile || !driveFile.id) {
    console.error(`❌ [DRIVE] DRIVE_FILE_MISSING: File ${exportResult.driveFileName} not found in Google Drive.`);
    process.exit(1);
  }

  const driveFileId = driveFile.id;
  const driveFileName = driveFile.name || exportResult.driveFileName;
  const driveFileSizeBytes = Number(driveFile.size || 0);

  console.log(`✅ [DRIVE] Real File Verified!`);
  console.log(`  Drive File ID:   ${driveFileId}`);
  console.log(`  Drive File Name: ${driveFileName}`);
  console.log(`  File Size:       ${driveFileSizeBytes} bytes (${(driveFileSizeBytes / 1024).toFixed(2)} KB)\n`);

  if (driveFileSizeBytes <= 0) {
    console.error('❌ [DRIVE] File size is 0 bytes. Export is incomplete.');
    process.exit(1);
  }

  // 7. Stream Download GeoTIFF from Drive to local storage
  console.log('--- 6. STREAM DOWNLOAD GEOTIFF FROM GOOGLE DRIVE ---');
  const downloaded = await driveService.downloadGeoTiff({
    jobId,
    fileName: driveFileName,
    fileId: driveFileId,
  });

  console.log(`✅ [LOCAL] File downloaded to: ${downloaded.localFilePath}`);
  console.log(`✅ [LOCAL] Verified local size: ${downloaded.sizeBytes} bytes\n`);

  // 8. Validate GeoTIFF & Calculate Spectral Indices
  console.log('--- 7. RASTER VALIDATION & SPECTRAL INDICES ---');
  const fileBuffer = fs.readFileSync(downloaded.localFilePath);
  const parsed = await GeoTiffService.readGeoTiffFromBuffer(fileBuffer);

  console.log(`  Raster Width:      ${parsed.metadata.width} px`);
  console.log(`  Raster Height:     ${parsed.metadata.height} px`);
  console.log(`  Total Pixels:      ${parsed.metadata.width * parsed.metadata.height}`);
  console.log(`  Band Count:        ${parsed.metadata.numBands}`);
  console.log(`  Original CRS:      ${parsed.metadata.originalCrs}`);
  console.log(`  Normalized CRS:    ${parsed.metadata.normalizedCrs}`);
  console.log(`  Area-calc CRS:     ${parsed.metadata.areaCalculationCrs}`);
  console.log(`  Pixel Resolution:  ${parsed.metadata.pixelScale[0]}m x ${parsed.metadata.pixelScale[1]}m`);
  console.log(`  Pixel Area:        ${parsed.metadata.pixelAreaM2.toFixed(2)} m²`);

  const spectral = GeoTiffService.calculateSpectralIndices(parsed, { satellite: 'Sentinel-2' });
  console.log(`\n  Calculated Spectral Indices (from Real Pixel Reflectance):`);
  console.log(`    Mean NDVI: ${spectral.ndvi.toFixed(3)} (Vegetation health)`);
  console.log(`    Mean NDWI: ${spectral.ndwi.toFixed(3)} (Water/Moisture)`);
  console.log(`    Mean NDBI: ${spectral.ndbi.toFixed(3)} (Built-up / Bare surface)`);

  console.log('\n================================================================');
  console.log('🎉 PIPELINE COMPLETE: REAL GEE ➔ DRIVE ➔ GEOTIFF SUCCESS!');
  console.log('================================================================');
  console.log(`Summary:`);
  console.log(`  Satellite Image: ${targetImageId}`);
  console.log(`  GEE Task ID:     ${exportResult.taskId}`);
  console.log(`  Drive File ID:   ${driveFileId}`);
  console.log(`  Drive File Name: ${driveFileName}`);
  console.log(`  File Size:       ${driveFileSizeBytes} bytes`);
  console.log(`  Raster:          ${parsed.metadata.width} x ${parsed.metadata.height} (${parsed.metadata.numBands} bands)`);
  console.log(`  NDVI:            ${spectral.ndvi.toFixed(3)}`);
  console.log('================================================================\n');
}

runRealPipeline().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('\n❌ Real Pipeline Failed:', msg);
  process.exit(1);
});
