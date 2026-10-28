import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { User } from '../models/User.js';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { SensorType } from '@tn-forest/shared/types';
import fs from 'node:fs';

async function runRealSirumalaiAsyncE2E() {
  console.info('================================================================');
  console.info('REAL END-TO-END ASYNCHRONOUS SAR EXPORT VERIFICATION (SIRUMALAI)');
  console.info('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // 1. Audit Pre-Test Database Invariants
  console.info('--- 1. PRE-TEST INVARIANT & DOCUMENT AUDIT ---');
  const preCounts = {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellites: await SatelliteMetadata.countDocuments(),
    changes: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    jobs: await MonitoringJobModel.countDocuments(),
    incremental: await IncrementalMonitoringRecordModel.countDocuments(),
  };

  for (const [k, v] of Object.entries(preCounts)) {
    console.info(`  ${k.padEnd(14)}: ${v}`);
  }

  const vadipattiPre = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  if (!vadipattiPre) throw new Error('Vadipatti production zone not found');
  if (vadipattiPre.monitoringTracks?.optical?.enabled !== true) throw new Error('Vadipatti optical must be enabled');
  if (vadipattiPre.monitoringTracks?.sar?.enabled !== false) throw new Error('Vadipatti SAR must be disabled');
  console.info('  Vadipatti Pre-check: Optical=enabled, SAR=disabled (INVARIANT VERIFIED)');

  const sirumalai = await Zone.findOne({ name: 'Sirumalai' });
  if (!sirumalai) throw new Error('Sirumalai zone not found in database');
  console.info(`  Target Zone: ${sirumalai.name} (${sirumalai.zoneId})`);

  // 2. Real GEE Candidate Search
  console.info('\n--- 2. REAL SENTINEL-1 SAR CANDIDATE SEARCH ---');
  const provider = new GeeSatelliteProvider();
  const searchStart = new Date('2026-09-01T00:00:00.000Z');
  const searchEnd = new Date('2026-09-25T00:00:00.000Z');

  console.info(`Searching COPERNICUS/S1_GRD for Sirumalai (${searchStart.toISOString().slice(0, 10)} to ${searchEnd.toISOString().slice(0, 10)})...`);
  const candidates = await provider.searchSarImages(sirumalai.boundary, {
    startDate: searchStart,
    endDate: searchEnd,
    sensorType: SensorType.SAR,
  });

  if (candidates.length === 0) {
    throw new Error('No real Sentinel-1 candidate observations found for Sirumalai in search window');
  }
  console.info(`Found ${candidates.length} real Sentinel-1 candidates.`);
  const selectedCandidate = candidates[0];
  console.info(`Selected Candidate Observation:`);
  console.info(`  Image ID:         ${selectedCandidate.imageId}`);
  console.info(`  Acquisition Date: ${selectedCandidate.acquisitionDate}`);
  console.info(`  Polarization:     ${selectedCandidate.polarization}`);
  console.info(`  Orbit Direction:  ${selectedCandidate.orbitDirection}`);

  // 3. Asynchronous "Acquire to Catalog"
  console.info('\n--- 3. ASYNCHRONOUS ACQUIRE TO CATALOG ---');
  const acqService = new SatelliteAcquisitionService();
  const t0 = Date.now();

  const acquiredDto = await acqService.acquireImage({
    zoneId: sirumalai._id.toString(),
    startDate: selectedCandidate.acquisitionDate.slice(0, 10),
    endDate: selectedCandidate.acquisitionDate.slice(0, 10),
    sensorType: SensorType.SAR,
    imageId: selectedCandidate.imageId,
    sync: false, // Asynchronous execution: return immediately, run GEE export in background
  });

  const responseTimeMs = Date.now() - t0;
  console.info(`Acquire API response returned in: ${responseTimeMs} ms`);
  console.info(`Initial Status:                   ${acquiredDto.processingStatus}`);
  console.info(`GEE Export Operation ID:          ${acquiredDto.geeExportTaskId}`);
  console.info(`Google Drive Target Filename:     ${acquiredDto.driveFileName}`);

  if (responseTimeMs > 15000) {
    throw new Error(`Asynchronous Acquire took too long: ${responseTimeMs}ms (must return quickly without blocking)`);
  }
  if (acquiredDto.processingStatus !== 'EXPORT_RUNNING' && acquiredDto.processingStatus !== 'EXPORT_REQUESTED') {
    throw new Error(`Unexpected initial status: ${acquiredDto.processingStatus}, expected EXPORT_RUNNING or EXPORT_REQUESTED`);
  }
  if (!acquiredDto.geeExportTaskId) {
    throw new Error('Expected geeExportTaskId to be populated upon asynchronous export submission');
  }

  // Verify MongoDB document exists immediately
  const dbDocInitial = await SatelliteMetadata.findById(acquiredDto.id);
  if (!dbDocInitial) {
    throw new Error('SatelliteMetadata document was not persisted to MongoDB before export completion');
  }
  console.info('MongoDB SatelliteMetadata document confirmed persisted immediately before export completion.');

  // 4. Background GEE Export Polling
  console.info('\n--- 4. BACKGROUND GEE EXPORT POLLING (GEE -> Drive -> Local GeoTIFF -> PROCESSED) ---');
  const maxWaitMs = 360000; // 6 minutes for large raster export
  const pollIntervalMs = 8000;
  const pollStart = Date.now();
  let currentDoc: any = dbDocInitial;

  while (Date.now() - pollStart < maxWaitMs) {
    currentDoc = await SatelliteMetadata.findById(acquiredDto.id);
    if (!currentDoc) throw new Error('SatelliteMetadata document disappeared during polling');

    const elapsedSec = Math.round((Date.now() - pollStart) / 1000);
    console.info(`  [+${elapsedSec}s] Status: ${currentDoc.processingStatus.padEnd(16)} | DriveFile: ${currentDoc.driveFileId || 'pending'}`);

    if (currentDoc.processingStatus === 'PROCESSED') {
      console.info('\n  🎉 Processing successfully reached terminal status: PROCESSED');
      break;
    }
    if (currentDoc.processingStatus === 'FAILED') {
      throw new Error(`Background GEE export pipeline failed: ${currentDoc.failureReason}`);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  if (currentDoc?.processingStatus !== 'PROCESSED') {
    throw new Error(`Timed out waiting for export pipeline completion after ${maxWaitMs / 1000}s. Last status: ${currentDoc?.processingStatus}`);
  }

  // 5. GeoTIFF Raster Validation Verification
  console.info('\n--- 5. GEOTIFF RASTER VALIDATION DETAILS ---');
  console.info(`  Local Raster Path:  ${currentDoc.localRasterPath}`);
  console.info(`  Drive File ID:      ${currentDoc.driveFileId}`);
  console.info(`  Drive File Size:    ${currentDoc.driveFileSizeBytes} bytes`);
  console.info(`  Raster Dimensions:  ${currentDoc.rasterWidth} x ${currentDoc.rasterHeight}`);
  console.info(`  Raster Band Count:  ${currentDoc.rasterBandCount} (VV, VH)`);
  console.info(`  Normalized CRS:     ${currentDoc.rasterCrs}`);
  console.info(`  Resolution:         ${currentDoc.resolutionMeters}m`);
  console.info(`  Raster Validated:   ${currentDoc.rasterValidated}`);

  if (!currentDoc.localRasterPath || !fs.existsSync(currentDoc.localRasterPath)) {
    throw new Error(`Downloaded GeoTIFF file does not exist at: ${currentDoc.localRasterPath}`);
  }
  if (!currentDoc.driveFileId) {
    throw new Error('Missing driveFileId on processed metadata record');
  }
  if (!currentDoc.rasterWidth || currentDoc.rasterWidth <= 0 || !currentDoc.rasterHeight || currentDoc.rasterHeight <= 0) {
    throw new Error(`Invalid raster dimensions: ${currentDoc.rasterWidth}x${currentDoc.rasterHeight}`);
  }
  if (currentDoc.rasterBandCount !== 2) {
    throw new Error(`Expected 2 SAR bands (VV, VH), got: ${currentDoc.rasterBandCount}`);
  }

  // 6. Clean Up Test Satellite Record to Preserve Database Invariants
  console.info('\n--- 6. CLEANING UP TEST ARTIFACTS & INVARIANT AUDIT ---');
  await SatelliteMetadata.deleteOne({ _id: currentDoc._id });
  console.info(`Deleted test record ${currentDoc._id} to maintain zero database drift.`);

  const postCounts = {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellites: await SatelliteMetadata.countDocuments(),
    changes: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    jobs: await MonitoringJobModel.countDocuments(),
    incremental: await IncrementalMonitoringRecordModel.countDocuments(),
  };

  console.info('Post-Test Document Counts:');
  for (const [k, v] of Object.entries(postCounts)) {
    console.info(`  ${k.padEnd(14)}: ${v} (pre: ${preCounts[k as keyof typeof preCounts]})`);
    if (v !== preCounts[k as keyof typeof preCounts]) {
      throw new Error(`Database drift detected in collection ${k}: before=${preCounts[k as keyof typeof preCounts]}, after=${v}`);
    }
  }

  const vadipattiPost = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  if (!vadipattiPost) throw new Error('Vadipatti post-check failed');
  if (vadipattiPost.monitoringTracks?.optical?.enabled !== true) throw new Error('Vadipatti optical disabled');
  if (vadipattiPost.monitoringTracks?.sar?.enabled !== false) throw new Error('Vadipatti SAR enabled');

  const vadipattiAlertPost = await AlertModel.findOne({ alertId: 'ALT-1789295023854-8239' });
  if (!vadipattiAlertPost || vadipattiAlertPost.status !== 'OPEN') throw new Error('Vadipatti alert invariant violated');

  console.info('\n================================================================');
  console.info('REAL SIRUMALAI ASYNC SAR E2E VERIFICATION SUCCEEDED 100%');
  console.info(`Initial API Response Time:  ${responseTimeMs} ms`);
  console.info(`GEE Export Operation ID:    ${acquiredDto.geeExportTaskId}`);
  console.info(`Google Drive File ID:       ${currentDoc.driveFileId}`);
  console.info(`Final Processing Status:    ${currentDoc.processingStatus}`);
  console.info('Database Invariants:        100% PRESERVED (ZERO DRIFT)');
  console.info('================================================================\n');

  await mongoose.disconnect();
}

runRealSirumalaiAsyncE2E().catch((err) => {
  console.error('\n❌ REAL SIRUMALAI ASYNC E2E FAILED:', err);
  mongoose.disconnect();
  process.exit(1);
});
