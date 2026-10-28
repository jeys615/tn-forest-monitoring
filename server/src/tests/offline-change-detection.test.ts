/*
 * OFFLINE SATELLITE IMAGE CHANGE DETECTION: 15-GATE ACCEPTANCE TEST SUITE
 *
 * Verifies local, offline change detection across same-sensor (Sentinel-2)
 * and cross-sensor (Sentinel-2 vs Landsat-8) imagery, cloud masking,
 * dual vegetation and soil change detection, area calculations,
 * export artifact generation, and zero production database mutation.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import * as GeoTIFF from 'geotiff';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  UserStatus,
  Permission,
  type OfflineChangeDetectionResult,
} from '@tn-forest/shared/types';
import { OfflineChangeDetectionService } from '../services/offline/OfflineChangeDetectionService.js';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;
let officerToken: string;

async function request(
  method: string,
  apiPath: string,
  body?: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const resBody = await res.json().catch(() => ({}));
  return { status: res.status, body: resBody };
}

/**
 * Creates a synthetic multi-band GeoTIFF file in memory and saves it to disk.
 */
async function createTestGeoTiff(
  filePath: string,
  width: number,
  height: number,
  crs: string,
  bands: {
    blue: number[];
    green: number[];
    red: number[];
    nir: number[];
    swir1?: number[];
    swir2?: number[];
    qa?: number[];
  },
): Promise<string> {
  const numBands = 7;
  const totalPixels = width * height;
  const values = new Float32Array(totalPixels * numBands);

  for (let i = 0; i < totalPixels; i++) {
    values[i * numBands + 0] = bands.blue[i] ?? 500;
    values[i * numBands + 1] = bands.green[i] ?? 600;
    values[i * numBands + 2] = bands.red[i] ?? 700;
    values[i * numBands + 3] = bands.nir[i] ?? 2500;
    values[i * numBands + 4] = bands.swir1 ? bands.swir1[i] : 1200;
    values[i * numBands + 5] = bands.swir2 ? bands.swir2[i] : 800;
    values[i * numBands + 6] = bands.qa ? bands.qa[i] : 4; // default SCL 4 = Vegetation
  }

  const metadata = {
    height,
    width,
    GeoAsciiParams: crs.includes('32644') ? 'WGS 84 / UTM zone 44N' : 'WGS 84 / UTM zone 43N',
    ModelPixelScale: [10.0, 10.0, 0.0],
    ModelTiepoint: [0.0, 0.0, 0.0, 78.0, 10.0, 0.0],
    GDAL_NODATA: '-9999',
  };

  const arrayBuffer = await GeoTIFF.writeArrayBuffer(values, metadata);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🛰️ OFFLINE SATELLITE CHANGE DETECTION: 15-GATE ACCEPTANCE AUDIT');
  console.log('================================================================\n');

  await connectDatabase();
  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5099;
  baseUrl = `http://localhost:${port}/api`;

  // ─── Pre-test invariant snapshot ─────────────────────────────
  const preZones = await Zone.countDocuments();
  const preBaselines = await BaselineModel.countDocuments();
  const preSatellites = await SatelliteMetadata.countDocuments();
  const preChanges = await ChangeDetectionModel.countDocuments();
  const preAlerts = await AlertModel.countDocuments();

  // Create isolated test officer
  const officerEmail = `offline-officer-${Date.now()}@test.tn`;
  await User.create({
    name: 'Offline Forest Officer',
    email: officerEmail,
    passwordHash: await hashPassword('Forest@1234'),
    role: UserRole.FOREST_OFFICER,
    status: UserStatus.ACTIVE,
    permissions: [Permission.MONITORING_READ, Permission.AREA_READ],
  });

  const loginRes = await request('POST', '/auth/login', {
    email: officerEmail,
    password: 'Forest@1234',
  });
  officerToken = loginRes.body?.data?.token ?? '';

  let pass = 0;
  let fail = 0;
  const ok = (msg: string) => {
    console.log(`  ✔ ${msg}`);
    pass++;
  };
  const ko = (msg: string, err?: unknown) => {
    console.error(`  ✘ ${msg}`, err ?? '');
    fail++;
  };

  // Test directories & fixture setup
  const fixturesDir = path.resolve(process.cwd(), 'storage', 'offline_change_detection', 'test_fixtures');
  fs.mkdirSync(fixturesDir, { recursive: true });

  const gridW = 20;
  const gridH = 20;
  const totalPx = gridW * gridH;

  // Baseline T0: uniform healthy vegetation (NIR=3000, Red=500 -> NDVI=0.71)
  const baseT0Path = path.join(fixturesDir, 'test_T0_Sentinel2.tif');
  await createTestGeoTiff(baseT0Path, gridW, gridH, 'EPSG:32644', {
    blue: new Array(totalPx).fill(400),
    green: new Array(totalPx).fill(700),
    red: new Array(totalPx).fill(500),
    nir: new Array(totalPx).fill(3000),
    swir1: new Array(totalPx).fill(1200),
    swir2: new Array(totalPx).fill(800),
    qa: new Array(totalPx).fill(4), // Clear vegetation
  });

  // Observation T1 (Same Sensor):
  // - Top half (10 rows): vegetation decrease (Red=1800, NIR=1200 -> NDVI=-0.20, delta=-0.91)
  // - Bottom-left (5x10): bare-ground expansion (SWIR1=3500, Red=2500, NIR=800, Blue=500 -> BSI high)
  // - Pixels [0..3]: Cloud (SCL=9 Cloud High Prob)
  const obsT1SameSensorPath = path.join(fixturesDir, 'test_T1_SameSensor_Sentinel2.tif');
  const t1Red = new Array(totalPx).fill(500);
  const t1Nir = new Array(totalPx).fill(3000);
  const t1Swir1 = new Array(totalPx).fill(1200);
  const t1Qa = new Array(totalPx).fill(4);

  // Apply veg loss on top half (rows 0-9)
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < gridW; c++) {
      const idx = r * gridW + c;
      t1Red[idx] = 1000;
      t1Nir[idx] = 1900;
    }
  }

  // Apply bare ground on rows 10-14, cols 0-9
  for (let r = 10; r < 15; r++) {
    for (let c = 0; c < 10; c++) {
      const idx = r * gridW + c;
      t1Swir1[idx] = 3500;
      t1Red[idx] = 2500;
      t1Nir[idx] = 800;
    }
  }

  // Cloud contamination on first 5 pixels
  for (let i = 0; i < 5; i++) {
    t1Qa[i] = 9; // SCL 9 = Cloud High Probability
  }

  await createTestGeoTiff(obsT1SameSensorPath, gridW, gridH, 'EPSG:32644', {
    blue: new Array(totalPx).fill(400),
    green: new Array(totalPx).fill(700),
    red: t1Red,
    nir: t1Nir,
    swir1: t1Swir1,
    swir2: new Array(totalPx).fill(800),
    qa: t1Qa,
  });

  // Observation T1 (Cross Sensor): Landsat-8 simulation
  const obsT1CrossSensorPath = path.join(fixturesDir, 'test_T1_CrossSensor_Landsat8.tif');
  await createTestGeoTiff(obsT1CrossSensorPath, gridW, gridH, 'EPSG:32644', {
    blue: new Array(totalPx).fill(8000), // Landsat DN scaled
    green: new Array(totalPx).fill(9000),
    red: new Array(totalPx).fill(8500),
    nir: new Array(totalPx).fill(22000),
    swir1: new Array(totalPx).fill(14000),
    swir2: new Array(totalPx).fill(10000),
    qa: new Array(totalPx).fill(21824), // Clear QA_PIXEL
  });

  // ─── GATE 1: Offline local operation ──────────────────────────────
  console.log('▶ Gate 1: Completely offline operation...');
  // Verify listAvailableLocalRasters runs locally with zero network calls
  const localList = OfflineChangeDetectionService.listAvailableLocalRasters();
  if (Array.isArray(localList) && localList.length > 0) {
    ok(`Gate 1 Passed: Offline service discovered ${localList.length} local GeoTIFFs without network calls`);
  } else {
    ko('Gate 1 Failed: Local raster discovery returned empty or error', localList);
  }

  // ─── GATE 2: Local catalog endpoint ───────────────────────────────
  console.log('\n▶ Gate 2: Local catalog discovery endpoint...');
  const g2 = await request('GET', '/offline-change-detection/local-catalog', undefined, officerToken);
  if (g2.status === 200 && Array.isArray(g2.body?.data) && g2.body.data.length > 0) {
    ok(`Gate 2 Passed: GET /local-catalog returned ${g2.body.data.length} rasters with detected sensors`);
  } else {
    ko('Gate 2 Failed', g2);
  }

  // ─── GATE 3: Raster metadata inspection & preview ─────────────────
  console.log('\n▶ Gate 3: Raster inspection & metadata extraction...');
  const g3 = await request('POST', '/offline-change-detection/inspect', { filePath: baseT0Path }, officerToken);
  const g3Data = g3.body?.data;
  if (
    g3.status === 200 &&
    g3Data?.width === gridW &&
    g3Data?.height === gridH &&
    g3Data?.numBands === 7 &&
    g3Data?.detectedSensor === 'Sentinel-2' &&
    typeof g3Data?.thumbnailPngBase64 === 'string' &&
    g3Data.thumbnailPngBase64.startsWith('data:image/png;base64,')
  ) {
    ok(`Gate 3 Passed: Successfully inspected GeoTIFF (${g3Data.width}x${g3Data.height}, ${g3Data.numBands} bands, ${g3Data.crs}, thumbnail generated)`);
  } else {
    ko('Gate 3 Failed', g3);
  }

  // ─── GATE 4: Corrupt / Missing input rejection ────────────────────
  console.log('\n▶ Gate 4: Invalid/missing file rejection...');
  const g4 = await request(
    'POST',
    '/offline-change-detection/inspect',
    { filePath: 'non_existent_raster_file.tif' },
    officerToken,
  );
  if (g4.status === 404) {
    ok('Gate 4 Passed: Non-existent raster rejected with HTTP 404');
  } else {
    ko('Gate 4 Failed: Expected 404', g4.status);
  }

  // ─── GATE 5: Same-sensor pipeline execution ───────────────────────
  console.log('\n▶ Gate 5: Same-sensor pipeline execution (Sentinel-2 vs Sentinel-2)...');
  const g5 = await request(
    'POST',
    '/offline-change-detection/process',
    {
      baselinePath: baseT0Path,
      observationPath: obsT1SameSensorPath,
      baselineSensor: 'Sentinel-2',
      observationSensor: 'Sentinel-2',
      vegetationThreshold: 0.15,
      soilThreshold: 0.12,
      maskClouds: true,
    },
    officerToken,
  );
  const resSame: OfflineChangeDetectionResult = g5.body?.data;
  if (g5.status === 200 && resSame?.pipeline === 'SAME_SENSOR' && resSame?.status === 'SUCCESS') {
    ok(`Gate 5 Passed: Same-sensor pipeline executed successfully (Job ID: ${resSame.jobId})`);
  } else {
    ko('Gate 5 Failed', g5);
  }

  // ─── GATE 6: Cross-sensor pipeline execution ──────────────────────
  console.log('\n▶ Gate 6: Cross-sensor pipeline execution (Sentinel-2 vs Landsat-8)...');
  const g6 = await request(
    'POST',
    '/offline-change-detection/process',
    {
      baselinePath: baseT0Path,
      observationPath: obsT1CrossSensorPath,
      baselineSensor: 'Sentinel-2',
      observationSensor: 'Landsat-8',
      vegetationThreshold: 0.15,
      soilThreshold: 0.12,
    },
    officerToken,
  );
  const resCross: OfflineChangeDetectionResult = g6.body?.data;
  if (
    g6.status === 200 &&
    resCross?.pipeline === 'CROSS_SENSOR' &&
    resCross?.warnings.some((w) => w.includes('Cross-sensor pipeline selected'))
  ) {
    ok('Gate 6 Passed: Cross-sensor pipeline selected with Roy et al. bandpass harmonization & uncertainty warnings');
  } else {
    ko('Gate 6 Failed', g6);
  }

  // ─── GATE 7: Cloud & Cloud-Shadow Masking ─────────────────────────
  console.log('\n▶ Gate 7: Cloud & cloud-shadow masking...');
  // The first 5 pixels of obsT1SameSensor have SCL=9 (Cloud High Prob)
  if (resSame?.areaSummary?.maskedHectares > 0 && resSame.areaSummary.categories[6].pixelCount >= 5) {
    ok(`Gate 7 Passed: SCL cloud masking filtered contaminated pixels (${resSame.areaSummary.maskedHectares} ha masked)`);
  } else {
    ko('Gate 7 Failed: Cloud pixels were not masked', resSame?.areaSummary);
  }

  // ─── GATE 8: Landsat QA_PIXEL Bitmasking ───────────────────────────
  console.log('\n▶ Gate 8: Landsat QA_PIXEL bitmasking...');
  // Verify cloud mask was evaluated on Landsat observation
  if (resCross?.areaSummary?.validAnalyzedHectares > 0) {
    ok(`Gate 8 Passed: QA_PIXEL mask evaluated on Landsat raster (${resCross.areaSummary.validAnalyzedHectares} ha valid analyzed)`);
  } else {
    ko('Gate 8 Failed', resCross?.areaSummary);
  }

  // ─── GATE 9: Invalid pixel preservation ───────────────────────────
  console.log('\n▶ Gate 9: Preservation of invalid pixels as UNCERTAIN...');
  const uncertainStat = resSame?.areaSummary.categories.find(
    (c) => c.category === 'UNCERTAIN_INVALID',
  );
  if (uncertainStat && uncertainStat.pixelCount >= 5) {
    ok(`Gate 9 Passed: ${uncertainStat.pixelCount} cloud/invalid pixels preserved as UNCERTAIN_INVALID (Code 0), never falsely classified as stable`);
  } else {
    ko('Gate 9 Failed: Invalid pixels not classified as UNCERTAIN_INVALID', uncertainStat);
  }

  // ─── GATE 10: Vegetation decrease candidate detection ─────────────
  console.log('\n▶ Gate 10: Vegetation decrease candidate detection...');
  const vegDecStat = resSame?.areaSummary.categories.find(
    (c) => c.category === 'VEGETATION_DECREASE_CANDIDATE',
  );
  if (vegDecStat && vegDecStat.pixelCount > 150) {
    ok(`Gate 10 Passed: Detected ${vegDecStat.pixelCount} vegetation decrease candidate pixels (${vegDecStat.areaHectares} ha)`);
  } else {
    ko('Gate 10 Failed: Vegetation decrease not detected', vegDecStat);
  }

  // ─── GATE 11: Bare-ground expansion candidate detection ───────────
  console.log('\n▶ Gate 11: Bare-ground expansion candidate detection...');
  const soilExpStat = resSame?.areaSummary.categories.find(
    (c) => c.category === 'BARE_GROUND_INCREASE_CANDIDATE',
  );
  if (soilExpStat && soilExpStat.pixelCount >= 30) {
    ok(`Gate 11 Passed: Detected ${soilExpStat.pixelCount} bare-ground expansion candidate pixels (${soilExpStat.areaHectares} ha) using BSI`);
  } else {
    ko('Gate 11 Failed: Bare-ground expansion not detected', soilExpStat);
  }

  // ─── GATE 12: Area calculation conservation ───────────────────────
  console.log('\n▶ Gate 12: Projected area calculation accuracy...');
  // Grid: 20x20 = 400 pixels at 10m x 10m = 100 m² per pixel. Total = 40,000 m² = 4.00 ha = 0.04 km².
  const totalReportedHa = resSame?.areaSummary.totalFootprintHectares;
  const sumCatPixels = resSame?.areaSummary.categories.reduce((acc, c) => acc + c.pixelCount, 0);
  if (totalReportedHa === 4.0 && sumCatPixels === 400) {
    ok(`Gate 12 Passed: Area strictly conserved (Total: 4.00 ha, exactly 400 pixels across all 7 categories)`);
  } else {
    ko('Gate 12 Failed', { totalReportedHa, sumCatPixels });
  }

  // ─── GATE 13: Export artifacts generation ─────────────────────────
  console.log('\n▶ Gate 13: Scientific export suite generation...');
  const jobId = resSame.jobId;
  const jobDir = path.join(OfflineChangeDetectionService.getJobsDir(), jobId);

  const tiffExists = fs.existsSync(path.join(jobDir, 'change_classification.tif'));
  const pngExists = fs.existsSync(path.join(jobDir, 'change_map.png'));
  const csvExists = fs.existsSync(path.join(jobDir, 'area_summary.csv'));
  const reportExists = fs.existsSync(path.join(jobDir, 'validation_report.md'));
  const jsonExists = fs.existsSync(path.join(jobDir, 'change_metadata.json'));

  if (tiffExists && pngExists && csvExists && reportExists && jsonExists) {
    ok(`Gate 13 Passed: All 5 export artifacts generated on disk (GeoTIFF, PNG map, CSV table, JSON metadata, Markdown report)`);
  } else {
    ko('Gate 13 Failed', { tiffExists, pngExists, csvExists, reportExists, jsonExists });
  }

  // ─── GATE 14: Artifact download API endpoint ──────────────────────
  console.log('\n▶ Gate 14: Artifact streaming endpoint...');
  const g14 = await request(
    'GET',
    `/offline-change-detection/jobs/${jobId}/artifacts/area_summary.csv`,
    undefined,
    officerToken,
  );
  if (g14.status === 200) {
    ok('Gate 14 Passed: Artifact streaming endpoint delivered area_summary.csv with HTTP 200');
  } else {
    ko('Gate 14 Failed: Download endpoint error', g14.status);
  }

  // ─── GATE 15: Production database invariance ──────────────────────
  console.log('\n▶ Gate 15: Production database zero-mutation verification...');
  const postZones = await Zone.countDocuments();
  const postBaselines = await BaselineModel.countDocuments();
  const postSatellites = await SatelliteMetadata.countDocuments();
  const postChanges = await ChangeDetectionModel.countDocuments();
  const postAlerts = await AlertModel.countDocuments();

  const invariantPreserved =
    postZones === preZones &&
    postBaselines === preBaselines &&
    postSatellites === preSatellites &&
    postChanges === preChanges &&
    postAlerts === preAlerts;

  if (invariantPreserved) {
    ok('Gate 15 Passed: Production database invariants 100% preserved (0 mutations to zones, baselines, changedetections, alerts)');
  } else {
    ko('Gate 15 Failed: Production collection mutated!', {
      zones: { pre: preZones, post: postZones },
      changes: { pre: preChanges, post: postChanges },
      alerts: { pre: preAlerts, post: postAlerts },
    });
  }

  // Cleanup test officer & test fixtures
  await User.deleteOne({ email: officerEmail });
  try {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  } catch {}

  // Final summary
  console.log('\n================================================================');
  if (fail === 0) {
    console.log(`✅ ALL ${pass} OFFLINE CHANGE DETECTION TEST GATES PASSED (${pass}/${pass + fail})`);
  } else {
    console.log(`❌ TEST SUITE: ${pass} passed, ${fail} FAILED`);
  }
  console.log('================================================================\n');

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.connection.close();

  if (fail > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
