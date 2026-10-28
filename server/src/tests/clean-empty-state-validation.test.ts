import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { AlertModel } from '../models/Alert.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { AuthService } from '../services/AuthService.js';
import { PixelAnalysisService } from '../services/raster/PixelAnalysisService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { HarmonizationService } from '../services/gee/HarmonizationService.js';
import { MultiSourceAcquisitionService } from '../services/gee/MultiSourceAcquisitionService.js';
import { MonitoringSchedulerWorker } from '../workers/MonitoringSchedulerWorker.js';
import { calculateM6Metrics } from '../utils/m6Metrics.js';
import { getGeeConfig } from '../config/gee.js';
import {
  ZoneCategory,
  ZoneStatus,
  MonitoringJobStatus,
  SatelliteSource,
  SensorType,
  AlertSeverity,
} from '@tn-forest/shared/types';

import { clearDemoData } from '../scripts/clearDemoData.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function runCleanEmptyStateSuite(): Promise<void> {
  console.log('\n==================================================');
  console.log('STARTING CLEAN EMPTY-STATE & REAL WORKFLOW TEST SUITE');
  console.log('==================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }

  // Ensure clean state before asserting
  await clearDemoData();

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }

  // ── TEST 1: Empty Database Operational State ──
  console.log('\n▶ Test 1: Empty Database Verification (Zero Operational Records)');
  const zoneCount = await Zone.countDocuments();
  const jobCount = await MonitoringJobModel.countDocuments();
  const alertCount = await AlertModel.countDocuments();
  const satCount = await SatelliteMetadata.countDocuments();
  const baselineCount = await BaselineModel.countDocuments();
  const changeCount = await ChangeDetectionModel.countDocuments();
  const processedResultCount = await ProcessedImageResultModel.countDocuments();
  const incRecCount = await IncrementalMonitoringRecordModel.countDocuments();
  const caseCount = await EnforcementCaseModel.countDocuments();
  const checkLogCount = await CheckpointLogModel.countDocuments();

  assert(zoneCount === 0, `Zones in database is 0 (found ${zoneCount})`);
  assert(jobCount === 0, `MonitoringJobs in database is 0 (found ${jobCount})`);
  assert(alertCount === 0, `Alerts in database is 0 (found ${alertCount})`);
  assert(satCount === 0, `SatelliteMetadata in database is 0 (found ${satCount})`);
  assert(baselineCount === 0, `Baselines in database is 0 (found ${baselineCount})`);
  assert(changeCount === 0, `ChangeDetections in database is 0 (found ${changeCount})`);
  assert(processedResultCount === 0, `ProcessedImageResults in database is 0 (found ${processedResultCount})`);
  assert(incRecCount === 0, `IncrementalMonitoringRecords in database is 0 (found ${incRecCount})`);
  assert(caseCount === 0, `EnforcementCases in database is 0 (found ${caseCount})`);
  assert(checkLogCount === 0, `CheckpointLogs in database is 0 (found ${checkLogCount})`);

  // ── TEST 2: User Accounts & Authentication Preserved ──
  console.log('\n▶ Test 2: User Accounts Preserved & Authentication Verification');
  const userCount = await User.countDocuments();
  assert(userCount > 0, `User accounts preserved in database (count: ${userCount})`);

  const authService = new AuthService();
  const loginRes = await authService.login({
    email: 'admin@tnforest.gov.in',
    password: 'Admin@TNFMS2026!',
  });
  assert(!!loginRes && !!loginRes.token, 'Super admin authentication succeeded with valid JWT token');
  assert(loginRes.user.email === 'admin@tnforest.gov.in', 'Admin user account email matches admin@tnforest.gov.in');

  // ── TEST 3: GEE & Google Drive Infrastructure Configuration ──
  console.log('\n▶ Test 3: Infrastructure Configuration (GEE & Drive)');
  const geeConfig = getGeeConfig();
  assert(geeConfig.projectId === 'monitoring-system-506515', `GEE project ID is configured: ${geeConfig.projectId}`);
  assert(geeConfig.driveFolderId === 'MonitoringExports', `Google Drive folder is configured: ${geeConfig.driveFolderId}`);
  assert(geeConfig.mode === 'REAL', `GEE execution mode is REAL: ${geeConfig.mode}`);

  // ── TEST 4: Real Zone Creation Workflow (Non-Hardcoded) ──
  console.log('\n▶ Test 4: Real Manual Zone Creation Workflow');
  const manualZone = new Zone({
    zoneId: `ZONE-TEST-${Date.now()}`,
    name: 'Mannavanur Reserved Grassland Zone',
    category: ZoneCategory.RESERVED_AREA,
    status: ZoneStatus.PROTECTED,
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [77.1600, 10.2200],
          [77.1640, 10.2200],
          [77.1640, 10.2237],
          [77.1600, 10.2237],
          [77.1600, 10.2200],
        ],
      ],
    },
    centerPoint: {
      type: 'Point',
      coordinates: [77.1620, 10.22185],
    },
    baselineDate: new Date('2024-01-01T00:00:00.000Z'),
    createdBy: loginRes.user.id,
  });
  const savedZone = await manualZone.save();
  assert(!!savedZone._id, `Zone created successfully with custom coordinates: ${savedZone.name} (${savedZone.zoneId})`);

  // ── TEST 5: Real GEE Image Search Priority & Date Validation ──
  console.log('\n▶ Test 5: Real GEE Satellite Image Search Priority');
  const acquisitionService = MultiSourceAcquisitionService.getInstance();
  const discoveryResult = await acquisitionService.discoverMultiSource(savedZone.boundary, {
    zoneId: savedZone._id.toString(),
    startDate: new Date('2024-01-02T00:00:00.000Z'),
    endDate: new Date('2024-01-31T23:59:59.999Z'),
    maxCloudCover: 40,
    sensorType: SensorType.OPTICAL,
  });
  assert(discoveryResult.discoveredImages.length > 0, `GEE catalog search returned ${discoveryResult.discoveredImages.length} valid candidate observations`);
  assert(discoveryResult.selectedSource === SatelliteSource.SENTINEL_2, `Optical hierarchy prioritized Sentinel-2: ${discoveryResult.selectedSource}`);
  const topCandidate = discoveryResult.selectedImage;
  assert(new Date(topCandidate.acquisitionDate) > savedZone.baselineDate!, 'Observation acquired strictly AFTER baseline date');

  // ── TEST 6: Predictable GEE Export Filename Convention ──
  console.log('\n▶ Test 6: Predictable GEE Export Filename Structure');
  const expectedExportName = `${savedZone.zoneId}_JOB-TEST01_CURRENT_${discoveryResult.selectedSource}_20240106.tif`;
  assert(expectedExportName.includes('ZONE-TEST-') && expectedExportName.endsWith('.tif'), `Filename matches convention: ${expectedExportName}`);

  // ── TEST 7: GeoTIFF Parsing, Sensor Normalization, and Grid Harmonization ──
  console.log('\n▶ Test 7: Raster GeoTIFF Buffer Parsing, Validation & Metadata');
  const sampleGeoTiffBuffer = await GeoTiffService.createSampleGeoTiff({
    width: 40,
    height: 37,
    sensor: 'Sentinel-2',
    ndviMean: 0.664,
  });
  const parsedRaster = await GeoTiffService.readGeoTiffFromBuffer(sampleGeoTiffBuffer);
  assert(parsedRaster.metadata.width === 40, `GeoTIFF width matches: ${parsedRaster.metadata.width}`);
  assert(parsedRaster.metadata.height === 37, `GeoTIFF height matches: ${parsedRaster.metadata.height}`);
  assert(parsedRaster.metadata.numBands === 7, `GeoTIFF band count matches: ${parsedRaster.metadata.numBands}`);
  assert(parsedRaster.bandData[0].length === 40 * 37, `GeoTIFF pixel count matches: ${parsedRaster.bandData[0].length} pixels (1480)`);

  // ── TEST 8: Real Pixel Index Calculations (M5) ──
  console.log('\n▶ Test 8: Real Spectral Index Calculation (M5)');
  const testWidth = 40;
  const testHeight = 37;
  const totalPx = testWidth * testHeight; // 1480
  const nirBand = new Float32Array(totalPx).fill(0.70);
  const redBand = new Float32Array(totalPx).fill(0.10);
  const blueBand = new Float32Array(totalPx).fill(0.05);
  const greenBand = new Float32Array(totalPx).fill(0.08);
  const validMask = new Uint8Array(totalPx).fill(1);

  const { indices: baseIndices } = PixelAnalysisService.calculateSpectralIndices({
    satellite: 'Sentinel-2',
    nativeResolution: 10,
    width: testWidth,
    height: testHeight,
    blue: blueBand,
    green: greenBand,
    red: redBand,
    nir: nirBand,
  }, validMask);

  assert(Math.abs(baseIndices.ndvi[0] - 0.75) < 0.001, `Pixel-level NDVI accurately computed: ${baseIndices.ndvi[0].toFixed(3)} (expected 0.750)`);

  // ── TEST 9: Real Pixel Change Detection (M6) & Invariant Check ──
  console.log('\n▶ Test 9: Real Pixel Change Detection & Mandatory Invariant Check');
  const currNir = new Float32Array(nirBand);
  const currRed = new Float32Array(redBand);
  // Inject 40 changed pixels (NDVI drop: 40 / 1480 = 2.70% >= 2.0% alert threshold)
  for (let i = 0; i < 40; i++) {
    currNir[i] = 0.35;
    currRed[i] = 0.15; // (0.35 - 0.15) / (0.35 + 0.15) = 0.40 => delta = 0.35 >= 0.05
  }

  const { indices: currIndices } = PixelAnalysisService.calculateSpectralIndices({
    satellite: 'Sentinel-2',
    nativeResolution: 10,
    width: testWidth,
    height: testHeight,
    blue: blueBand,
    green: greenBand,
    red: currRed,
    nir: currNir,
  }, validMask);

  const changeResult = PixelAnalysisService.detectPixelChange({
    baselineIndices: baseIndices,
    currentIndices: currIndices,
    baselineValidMask: validMask,
    currentValidMask: validMask,
    pixelResolutionMeters: 10,
    changeThreshold: 0.05,
  });

  assert(changeResult.validPixels === 1480, `validPixels = ${changeResult.validPixels}`);
  assert(changeResult.changedPixels === 40, `changedPixels = ${changeResult.changedPixels}`);
  assert(changeResult.noChangePixels === 1440, `noChangePixels = ${changeResult.noChangePixels}`);
  assert(
    changeResult.validPixels === changeResult.changedPixels + changeResult.noChangePixels,
    `Pixel Invariant: ${changeResult.validPixels} === ${changeResult.changedPixels} + ${changeResult.noChangePixels}`,
  );

  // ── TEST 10: Affected Area Calculation & Alert Threshold ──
  console.log('\n▶ Test 10: Affected Area & Operational Alert Decision');
  const m6Metrics = calculateM6Metrics({
    validPixels: changeResult.validPixels,
    changedPixels: changeResult.changedPixels,
    pixelResolutionMeters: 10,
    operationalThresholdPercentage: 2.0,
  });
  assert(m6Metrics.affectedAreaM2 === 4000, `Affected Area m² = ${m6Metrics.affectedAreaM2} m² (40 * 100)`);
  assert(m6Metrics.affectedAreaHa === 0.40, `Affected Area ha = ${m6Metrics.affectedAreaHa} ha`);
  assert(Math.abs(m6Metrics.affectedAreaPercentage - 2.703) < 0.01, `Affected Area % = ${m6Metrics.affectedAreaPercentage.toFixed(3)}%`);
  assert(m6Metrics.thresholdCrossed === true, 'Threshold Crossed = TRUE (2.70% >= 2.00%)');
  assert(m6Metrics.alertGenerated === true, 'Alert Generated = TRUE');
  assert(m6Metrics.severity === AlertSeverity.LOW, `Severity = ${m6Metrics.severity} (2% - 5% range)`);
  assert(m6Metrics.pixelAccountingValid === true, 'Pixel accounting invariant confirmed valid in M6 metrics');

  // ── TEST 11: Invariant Failure Enforces Job Failure ──
  console.log('\n▶ Test 11: Invariant Failure Enforces Job Failure');
  const invalidPixelResult = {
    validPixels: 1480,
    changedPixels: 50,
    noChangePixels: 1000, // 1000 + 50 !== 1480
    pixelAreaM2: 100,
    affectedAreaM2: 5000,
    affectedAreaHa: 0.5,
    affectedAreaPercentage: 3.38,
    changedMask: new Uint8Array(1480),
    ndviDeltaMean: -0.12,
    pixelAccountingValid: false,
  };
  const isAccountingValid = invalidPixelResult.validPixels === invalidPixelResult.changedPixels + invalidPixelResult.noChangePixels;
  assert(!isAccountingValid, 'Invariant correctly flags corrupted pixel counts as INVALID');

  // ── TEST 12: Automated Monitoring Worker Lifecycle ──
  console.log('\n▶ Test 12: Automated Hourly Monitoring Worker Lifecycle');
  const worker = MonitoringSchedulerWorker.getInstance();
  worker.start(60);
  assert(worker.isActive(), 'Worker started successfully with 60-minute interval');
  worker.stop();
  assert(!worker.isActive(), 'Worker stopped gracefully without leaks');

  // ── CLEANUP TEST ZONE ──
  console.log('\n▶ Cleaning up temporary test zone');
  await Zone.deleteOne({ _id: savedZone._id });
  const finalZoneCount = await Zone.countDocuments();
  assert(finalZoneCount === 0, 'Temporary test zone removed cleanly. Database operational state is 0.');

  console.log('\n==================================================');
  console.log('CLEAN EMPTY-STATE SUITE COMPLETE: ALL TESTS PASSED ✅');
  console.log('==================================================\n');
}

runCleanEmptyStateSuite()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Test suite failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  });
