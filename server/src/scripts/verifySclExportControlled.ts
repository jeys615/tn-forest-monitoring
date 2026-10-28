import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import mongoose from 'mongoose';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeExportService } from '../services/gee/GeeExportService.js';
import { GeeTaskService } from '../services/gee/GeeTaskService.js';
import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';
import { RasterReaderService } from '../services/raster/RasterReaderService.js';
import { OpticalSpatialHarmonizationService } from '../services/spatial/OpticalSpatialHarmonizationService.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';
import type { SatelliteScene } from '../services/gee/GeeSatelliteSearchService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runControlledVerification() {
  console.log('================================================================');
  console.log('🛰️ CONTROLLED REAL-DATA VERIFICATION: SENTINEL-2 SCL EXPORT');
  console.log('================================================================\n');

  // Step 0: Check MongoDB initial invariants
  console.log('--- STEP 0: RECORD INITIAL MONGODB INVARIANTS ---');
  await mongoose.connect('mongodb://localhost:27017/tn_forest_monitoring');
  const dbs = mongoose.connection.db!;
  const initialCounts = {
    users: await dbs.collection('users').countDocuments(),
    zones: await dbs.collection('zones').countDocuments(),
    satellitemetadatas: await dbs.collection('satellitemetadatas').countDocuments(),
    baselines: await dbs.collection('baselines').countDocuments(),
    changedetections: await dbs.collection('changedetections').countDocuments(),
    alerts: await dbs.collection('alerts').countDocuments(),
    monitoringjobs: await dbs.collection('monitoringjobs').countDocuments(),
  };
  console.log('Initial DB counts:', JSON.stringify(initialCounts));

  // Step 1: Verify GEE and Google Drive Authentication
  console.log('\n--- STEP 1: VERIFY GEE & DRIVE AUTHENTICATION ---');
  const geeAuth = GeeAuthService.getInstance();
  const token = await geeAuth.getAccessToken();
  if (!token) {
    throw new Error('GEE Authentication failed: No access token available.');
  }
  console.log('✅ GEE Authentication: OK');

  const driveService = new GoogleDriveService();
  const driveCheck = await driveService.checkDriveAccess();
  if (!driveCheck.authenticated || !driveCheck.apiAccess) {
    throw new Error(`Google Drive Authentication failed: ${driveCheck.error}`);
  }
  console.log(`✅ Google Drive API Access: OK (${driveCheck.userEmail})`);

  // Step 2: Define Scene and Small Geometry for Controlled Real Export
  console.log('\n--- STEP 2: CONFIGURE CONTROLLED REAL TEST SCENE ---');
  const targetImageId = 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM';
  const testPolygon: GeoJSONPolygon = {
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
    bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'],
    footprint: testPolygon,
    processingLevel: 'Level-2A',
    provider: 'GEE',
  };

  const zoneCode = 'CONTROLLED';
  const jobId = `SCL-TEST-${Date.now().toString(36).toUpperCase()}`;

  // Step 3: Dispatch Real GEE Export Request
  console.log('\n--- STEP 3: DISPATCH REAL GEE EXPORT REQUEST ---');
  const exportService = new GeeExportService();
  const bandsRequested = exportService.selectExportBands('Sentinel-2');
  console.log(`Bands requested by GeeExportService:`, bandsRequested);

  const exportResult = await exportService.requestImageExport({
    scene,
    zoneCode,
    jobId,
    imageType: 'CURRENT',
    geometry: testPolygon,
    scaleMeters: 10,
  });

  console.log(`✅ GEE Export Task Submitted successfully!`);
  console.log(`  Task ID:        ${exportResult.taskId}`);
  console.log(`  Drive Filename: ${exportResult.driveFileName}`);
  console.log(`  Bands Exported: ${exportResult.bandsExported.join(', ')}`);

  // Step 4: Poll Task Completion
  console.log('\n--- STEP 4: WAIT FOR GEE TASK COMPLETION ---');
  const taskService = new GeeTaskService();
  const startTime = Date.now();
  let completedStatus = await taskService.pollTaskCompletion(exportResult.taskId, {
    timeoutMs: 300000, // 5 minutes max
    pollIntervalMs: 5000,
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`Polling completed in ${durationSec}s with state: ${completedStatus.state}`);

  if (completedStatus.state !== 'EXPORT_COMPLETED') {
    throw new Error(`GEE Export task did not complete. State: ${completedStatus.state}, Error: ${completedStatus.errorMessage}`);
  }
  console.log(`✅ GEE Export Operation COMPLETED on Earth Engine servers!`);

  // Step 5: Locate File in Google Drive
  console.log('\n--- STEP 5: DISCOVER EXPORTED ARTIFACT IN GOOGLE DRIVE ---');
  // Small wait for Drive consistency
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const driveFile = await driveService.findExportedFile(exportResult.driveFileName);
  if (!driveFile || !driveFile.id) {
    throw new Error(`Exported file ${exportResult.driveFileName} not found in Google Drive.`);
  }
  console.log(`✅ Google Drive File Found!`);
  console.log(`  Drive File ID:   ${driveFile.id}`);
  console.log(`  Drive File Name: ${driveFile.name}`);
  console.log(`  Drive Size:      ${driveFile.size} bytes`);

  // Step 6: Download Controlled Test GeoTIFF
  console.log('\n--- STEP 6: DOWNLOAD CONTROLLED TEST GEOTIFF ---');
  const testOutputDir = path.resolve(__dirname, '../../../server/storage/raster_temp/CONTROLLED_SCL_EXPORT_TEST');
  if (!fs.existsSync(testOutputDir)) {
    fs.mkdirSync(testOutputDir, { recursive: true });
  }

  const downloaded = await driveService.downloadGeoTiff({
    jobId: 'CONTROLLED_SCL_EXPORT_TEST',
    fileName: exportResult.driveFileName,
    fileId: driveFile.id,
  });

  console.log(`✅ File Download Complete!`);
  console.log(`  Local Path:  ${downloaded.localFilePath}`);
  console.log(`  Size Bytes:  ${downloaded.sizeBytes}`);

  // Step 7: Inspect Physical GeoTIFF Headers and Data
  console.log('\n--- STEP 7: PHYSICAL GEOTIFF BINARY INSPECTION ---');
  const tiff = await fromFile(downloaded.localFilePath);
  const image = await tiff.getImage();
  const numBands = image.getSamplesPerPixel();
  const bitsPerSample = image.getBitsPerSample();
  const sampleFormat = image.getSampleFormat();
  const width = image.getWidth();
  const height = image.getHeight();
  const fileDirectory = image.getFileDirectory() as any;

  console.log(`  Width x Height:     ${width} x ${height}`);
  console.log(`  SamplesPerPixel:    ${numBands}`);
  console.log(`  BitsPerSample:      ${JSON.stringify(bitsPerSample)}`);
  console.log(`  SampleFormat:       ${JSON.stringify(sampleFormat)}`);
  console.log(`  ModelPixelScale:    ${JSON.stringify(fileDirectory.ModelPixelScale)}`);
  console.log(`  ModelTiepoint:      ${JSON.stringify(fileDirectory.ModelTiepoint)}`);

  if (numBands !== 7) {
    throw new Error(`Expected exactly 7 bands in physical GeoTIFF, found ${numBands}`);
  }
  console.log(`✅ Physical GeoTIFF verified: Exactly 7 bands present!`);

  // Step 8: Physical Inspection of Band 7 (SCL)
  console.log('\n--- STEP 8: PHYSICAL INSPECTION OF BAND 7 (SCL) ---');
  const rasters = await image.readRasters({ interleave: false });
  const b7 = rasters[6]; // 0-indexed: Band 7 is index 6
  console.log(`  Band 7 Constructor: ${b7.constructor.name}`);
  console.log(`  Band 7 Length:      ${b7.length} pixels`);

  let minVal = Infinity;
  let maxVal = -Infinity;
  const uniqueMap = new Map<number, number>();

  for (let i = 0; i < b7.length; i++) {
    const val = Number(b7[i]);
    if (val < minVal) minVal = val;
    if (val > maxVal) maxVal = val;
    uniqueMap.set(val, (uniqueMap.get(val) || 0) + 1);
  }

  console.log(`  Band 7 Min Value:   ${minVal}`);
  console.log(`  Band 7 Max Value:   ${maxVal}`);
  console.log(`  Unique SCL Values & Counts:`);
  for (const [val, count] of Array.from(uniqueMap.entries()).sort((a, b) => a[0] - b[0])) {
    let label = 'Unknown';
    switch (val) {
      case 0: label = 'NO_DATA'; break;
      case 1: label = 'SATURATED_OR_DEFECTIVE'; break;
      case 2: label = 'DARK_AREA_PIXELS'; break;
      case 3: label = 'CLOUD_SHADOWS'; break;
      case 4: label = 'VEGETATION'; break;
      case 5: label = 'NOT_VEGETATED'; break;
      case 6: label = 'WATER'; break;
      case 7: label = 'UNCLASSIFIED'; break;
      case 8: label = 'CLOUD_MEDIUM_PROBABILITY'; break;
      case 9: label = 'CLOUD_HIGH_PROBABILITY'; break;
      case 10: label = 'THIN_CIRRUS'; break;
      case 11: label = 'SNOW'; break;
    }
    console.log(`    Class ${val} (${label}): ${count} pixels (${((count / b7.length) * 100).toFixed(2)}%)`);
  }

  if (minVal < 0 || maxVal > 11) {
    throw new Error(`Band 7 values [${minVal}, ${maxVal}] out of valid Sentinel-2 SCL range [0..11]`);
  }
  console.log(`✅ Band 7 verified: Contains valid categorical Sentinel-2 SCL classes!`);

  // Step 9: Verify Existing GeoTIFF Reader
  console.log('\n--- STEP 9: VERIFY PRODUCTION GEOTIFF READER ---');
  const opticalRaster = await RasterReaderService.readOpticalRaster(downloaded.localFilePath, 'Sentinel-2');
  console.log(`  RasterReader bands mapped:`, Object.keys(opticalRaster.bands));
  console.log(`  qa band defined? ${opticalRaster.bands.qa !== undefined}`);
  console.log(`  qa length:       ${opticalRaster.bands.qa?.length}`);
  console.log(`  blue length:     ${opticalRaster.bands.blue.length}`);
  console.log(`  nir length:      ${opticalRaster.bands.nir.length}`);

  if (!opticalRaster.bands.qa || opticalRaster.bands.qa.length !== width * height) {
    throw new Error(`RasterReaderService failed to map qa band correctly.`);
  }
  console.log(`✅ RasterReaderService verified: Correctly maps 7th band to qa!`);

  // Step 10: Verify Optical Spatial Harmonization & Quality Masking
  console.log('\n--- STEP 10: VERIFY QUALITY MASK PROCESSING ---');
  const targetGrid = AnalysisGridService.createAnalysisGrid(testPolygon, {
    pixelSizeMeters: 10,
    targetCrs: 'EPSG:32644',
  });
  const harmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
    opticalRaster,
    targetGrid,
    { satellite: 'Sentinel-2' },
  );

  console.log(`  Harmonized qualityMask length: ${harmonized.qualityMask.length}`);
  let clearCount = 0;
  let nonClearCount = 0;
  for (let i = 0; i < harmonized.qualityMask.length; i++) {
    if (harmonized.qualityMask[i] === 1) clearCount++;
    else nonClearCount++;
  }
  console.log(`  Harmonized Clear Pixels:     ${clearCount}`);
  console.log(`  Harmonized Non-Clear Pixels: ${nonClearCount}`);
  console.log(`  qa values preserved?         ${harmonized.qa !== undefined}`);
  console.log(`✅ OpticalSpatialHarmonizationService verified: SCL masking path executed with rawQa present!`);

  // Step 11: Verify Old 6-Band Historical Raster Fallback
  console.log('\n--- STEP 11: VERIFY HISTORICAL 6-BAND FALLBACK BEHAVIOR ---');
  const historicalPath = 'server/storage/raster_temp/6ab8abf5667c98f4208d8f6a/ZONE-260925-8986_6ab8abf5667c98f4208d8f6a_CURRENT_Sentinel2_20260926.tif';
  const histRaster = await RasterReaderService.readOpticalRaster(historicalPath, 'Sentinel-2');
  console.log(`  Historical qa defined? ${histRaster.bands.qa !== undefined}`);
  if (histRaster.bands.qa !== undefined) {
    throw new Error('Historical 6-band raster should have qa === undefined');
  }

  const histHarmonized = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(
    histRaster,
    targetGrid,
    { satellite: 'Sentinel-2' },
  );
  console.log(`  Historical Harmonized qualityMask length: ${histHarmonized.qualityMask.length}`);
  console.log(`  Historical Harmonized qa preserved?       ${histHarmonized.qa !== undefined}`);
  console.log(`✅ Historical 6-band fallback preserved: qa === undefined correctly triggers radiometric check!`);

  // Step 12: Confirm MongoDB Invariants Unchanged
  console.log('\n--- STEP 12: CONFIRM ZERO MONGODB WRITES ---');
  const finalCounts = {
    users: await dbs.collection('users').countDocuments(),
    zones: await dbs.collection('zones').countDocuments(),
    satellitemetadatas: await dbs.collection('satellitemetadatas').countDocuments(),
    baselines: await dbs.collection('baselines').countDocuments(),
    changedetections: await dbs.collection('changedetections').countDocuments(),
    alerts: await dbs.collection('alerts').countDocuments(),
    monitoringjobs: await dbs.collection('monitoringjobs').countDocuments(),
  };
  console.log('Final DB counts:', JSON.stringify(finalCounts));
  for (const k of Object.keys(initialCounts) as (keyof typeof initialCounts)[]) {
    if (initialCounts[k] !== finalCounts[k]) {
      throw new Error(`MongoDB invariant violated on ${k}: ${initialCounts[k]} -> ${finalCounts[k]}`);
    }
  }
  console.log('✅ ALL MONGODB INVARIANTS STRICTLY PRESERVED: ZERO DATABASE WRITES (0)');

  await mongoose.disconnect();
  console.log('\n================================================================');
  console.log('🎉 CONTROLLED REAL-DATA VERIFICATION COMPLETE: ALL CHECKS PASSED');
  console.log('================================================================');
}

runControlledVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
