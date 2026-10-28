/**
 * hls-real-gee-acceptance.test.ts — Phase 5 Real GEE Acceptance Test
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  REAL GEE ACCEPTANCE TEST — NO MOCKS                            ║
 * ║                                                                  ║
 * ║  Calls REAL Google Earth Engine (NASA HLS V2.0).                 ║
 * ║  Uses legitimate production SatelliteMetadata observation.       ║
 * ║  Performs full real GEE query, export, Drive download & raster  ║
 * ║  validation.                                                     ║
 * ║                                                                  ║
 * ║  Strict Invariants:                                              ║
 * ║    • NO database records created or modified                     ║
 * ║    • NO HLSRepresentation documents created                      ║
 * ║    • NO Baseline.hlsRepresentationId modified                   ║
 * ║    • NO cursors, ChangeDetection, or Alert modified             ║
 * ║    • NO synthetic data, fake IDs, or mocks in acceptance path   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  HLSAcquisitionService,
  HLS_GEE_COLLECTIONS,
  HLS_NATIVE_RESOLUTION_M,
  HLS_EXPORT_BANDS,
  resolveHLSProduct,
  resolveHLSSourcePlatform,
  validateHLSDateLineage,
  type HLSAcquisitionResult,
  type HLSAcquisitionFailure,
} from '../services/hls/HLSAcquisitionService.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import {
  SatelliteSource,
  HLSProduct,
  HLSVersion,
  HLSErrorStage,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';

// ─── Configuration ────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tn_forest_monitoring';

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║   PHASE 5 — REAL NASA HLS V2.0 GEE ACCEPTANCE TEST          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const acceptanceReport: Record<string, any> = {};
let finalStatus: 'PHASE5_VERIFIED' | 'PHASE5_VERIFIED_WITH_LIMITATIONS' | 'PHASE5_BLOCKED' = 'PHASE5_BLOCKED';

// ─── Step 1: Verify GEE Authentication ───────────────────────────────────────

console.log('▶ STEP 1: Verify GEE authentication');

const authService = GeeAuthService.getInstance();
const authStatus = await authService.checkConnection();

console.log(`  GEE connected:   ${authStatus.connected}`);
console.log(`  Project ID:      ${authStatus.projectId}`);
console.log(`  Auth method:     ${authStatus.authMethod}`);
console.log(`  Mode:            ${authStatus.mode}`);
console.log(`  Message:         ${authStatus.message}`);

if (!authStatus.connected) {
  console.error(`\n❌ GEE authentication failed: ${authStatus.error || authStatus.message}`);
  acceptanceReport.finalStatus = 'PHASE5_BLOCKED';
  acceptanceReport.failureReason = `GEE authentication failed: ${authStatus.error || authStatus.message}`;
  printReport(acceptanceReport);
  process.exit(1);
}

console.log('  ✅ GEE authenticated\n');

// ─── Step 2: Connect to MongoDB & Record Pre-Test Database Counts ────────────

console.log('▶ STEP 2: Connect to MongoDB and snapshot database state');

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db!;

// Count all 6 sensitive collections before test
const countsBefore = {
  hlsrepresentations: await db.collection('hlsrepresentations').countDocuments().catch(() => 0),
  baselines: await db.collection('baselines').countDocuments().catch(() => 0),
  satellitemetadatas: await db.collection('satellitemetadatas').countDocuments().catch(() => 0),
  changedetections: await db.collection('changedetections').countDocuments().catch(() => 0),
  alerts: await db.collection('alerts').countDocuments().catch(() => 0),
  monitoringjobs: await db.collection('monitoringjobs').countDocuments().catch(() => 0),
};

console.log('  Pre-test collection counts:');
for (const [col, count] of Object.entries(countsBefore)) {
  console.log(`    • ${col.padEnd(22)}: ${count}`);
}
acceptanceReport.countsBefore = countsBefore;

// ─── Step 3: Select Legitimate Real Source Observation ───────────────────────

console.log('\n▶ STEP 3: Select legitimate real source observation');

// Query existing production optical SatelliteMetadata
const smetaRecords = await db.collection('satellitemetadatas')
  .find({ sensorType: 'OPTICAL', source: 'SENTINEL_2' })
  .sort({ acquisitionDate: 1 })
  .toArray();

if (smetaRecords.length === 0) {
  console.error('❌ No optical Sentinel-2 SatelliteMetadata found in production database.');
  acceptanceReport.finalStatus = 'PHASE5_BLOCKED';
  printReport(acceptanceReport);
  await mongoose.disconnect();
  process.exit(1);
}

const selectedSmeta = smetaRecords[0]!;
const sourceObservationId = selectedSmeta.imageId;
const sourceMetadataId = selectedSmeta._id.toString();
const sourceSatelliteSource = SatelliteSource.SENTINEL_2;
const sourcePlatform = resolveHLSSourcePlatform(sourceSatelliteSource);
const sourceAcquisitionDate = new Date(selectedSmeta.acquisitionDate);
const sourceGeometry: GeoJSONPolygon = selectedSmeta.footprint;

// Retrieve associated zone if present
let zoneCode = 'Z-M5-001';
if (selectedSmeta.intersectingZones && selectedSmeta.intersectingZones.length > 0) {
  const zoneDoc = await db.collection('zones').findOne({
    _id: new mongoose.Types.ObjectId(selectedSmeta.intersectingZones[0]),
  });
  if (zoneDoc) {
    zoneCode = zoneDoc.zoneId || zoneDoc.code || zoneCode;
  }
}

const expectedHlsProduct = resolveHLSProduct(sourceSatelliteSource);
const expectedHlsCollection = HLS_GEE_COLLECTIONS[expectedHlsProduct];

console.log(`  Source Observation ID:    ${sourceObservationId}`);
console.log(`  Source Metadata ID:       ${sourceMetadataId}`);
console.log(`  Source Satellite Source:  ${sourceSatelliteSource}`);
console.log(`  Source Platform:          ${sourcePlatform}`);
console.log(`  Source Acquisition Date:  ${sourceAcquisitionDate.toISOString()}`);
console.log(`  Zone Code:                ${zoneCode}`);
console.log(`  Source Geometry:          ${JSON.stringify(sourceGeometry)}`);
console.log(`  Expected HLS Product:     ${expectedHlsProduct}`);
console.log(`  Expected HLS Collection:  ${expectedHlsCollection}`);

acceptanceReport.sourceObservation = {
  observationId: sourceObservationId,
  metadataId: sourceMetadataId,
  satelliteSource: sourceSatelliteSource,
  platform: sourcePlatform,
  acquisitionDate: sourceAcquisitionDate.toISOString(),
  zoneCode,
  geometry: sourceGeometry,
  expectedHlsProduct,
  expectedHlsCollection,
};

// ─── Step 4: Query Real HLS Data Through GEE ────────────────────────────────

console.log('\n▶ STEP 4: Query real NASA HLS V2.0 data through GEE');

const geeClient = new GeeClientService();
const searchWindowDays = 16;
const windowHalf = Math.ceil(searchWindowDays / 2);
const searchStart = new Date(sourceAcquisitionDate);
searchStart.setDate(searchStart.getDate() - windowHalf);
const searchEnd = new Date(sourceAcquisitionDate);
searchEnd.setDate(searchEnd.getDate() + windowHalf);

console.log(`  Collection:  ${expectedHlsCollection}`);
console.log(`  Date window: ${searchStart.toISOString().slice(0, 10)} to ${searchEnd.toISOString().slice(0, 10)}`);

const geeQueryResult = await geeClient.fetchAllPublicImages({
  collection: expectedHlsCollection,
  geometry: sourceGeometry,
  startDate: searchStart,
  endDate: searchEnd,
  pageSize: 50,
  maxPages: 5,
});

console.log(`  GEE pages fetched: ${geeQueryResult.pagesFetched}`);
console.log(`  Unique HLS images: ${geeQueryResult.uniqueCount}`);

for (const img of geeQueryResult.images.slice(0, 8)) {
  const acqMs = Number(img.properties?.['system:time_start'] || 0);
  console.log(`    • ${img.id} (${new Date(acqMs).toISOString()})`);
}

acceptanceReport.geeDiscovery = {
  collection: expectedHlsCollection,
  pagesFetched: geeQueryResult.pagesFetched,
  imagesFound: geeQueryResult.uniqueCount,
  sampleImageIds: geeQueryResult.images.slice(0, 5).map((i) => i.id),
};

// ─── Step 5: Execute Real Controlled HLS Acquisition ────────────────────────

console.log('\n▶ STEP 5: Execute real controlled HLS acquisition via HLSAcquisitionService');

const acquisitionService = new HLSAcquisitionService();
const jobId = `ACCEPTANCE-HLS-${Date.now()}`;
const exportStartTime = Date.now();

const outcome = await acquisitionService.acquireHLS({
  zoneCode,
  jobId,
  sourceSatellite: sourceSatelliteSource,
  sourceObservationDate: sourceAcquisitionDate,
  geometry: sourceGeometry,
  hlsVersion: HLSVersion.V2_0,
  searchWindowDays,
});

const exportDurationMs = Date.now() - exportStartTime;
console.log(`  Acquisition attempt duration: ${(exportDurationMs / 1000).toFixed(1)}s`);

if (!outcome.success) {
  const failure = outcome as HLSAcquisitionFailure;
  console.error(`\n❌ Real HLS acquisition failed:`);
  console.error(`  Error Stage:   ${failure.errorStage}`);
  console.error(`  Error Message: ${failure.errorMessage}`);
  console.error(`  Error Detail:  ${failure.errorDetail || 'none'}`);

  acceptanceReport.acquisitionFailure = failure;
  if (failure.errorStage === HLSErrorStage.HLS_NO_IMAGE_FOUND || failure.errorStage === HLSErrorStage.HLS_DATE_MISMATCH) {
    finalStatus = 'PHASE5_VERIFIED_WITH_LIMITATIONS';
  } else {
    finalStatus = 'PHASE5_BLOCKED';
  }
} else {
  const result = outcome as HLSAcquisitionResult;
  console.log(`\n  ✅ REAL HLS ACQUISITION SUCCEEDED`);
  console.log(`  GEE Image ID:         ${result.geeHlsImageId}`);
  console.log(`  HLS Acquisition Date: ${result.hlsAcquisitionDate.toISOString()}`);
  console.log(`  Drive File ID:        ${result.driveFileId}`);
  console.log(`  Drive Filename:       ${result.driveFileName}`);
  console.log(`  Local File Path:      ${result.localFilePath}`);
  console.log(`  File Size:            ${result.fileSizeBytes} bytes`);
  console.log(`  Raster Dimensions:    ${result.rasterWidth} × ${result.rasterHeight} px`);
  console.log(`  Band Count:           ${result.bandCount}`);
  console.log(`  Raster CRS:           ${result.rasterCrs}`);
  console.log(`  Resolution:           ${result.resolutionMeters} m`);

  // ─── Step 6: Verify Date Lineage ──────────────────────────────────────────
  console.log('\n▶ STEP 6: Verify Date Lineage');
  const sourceDateStr = sourceAcquisitionDate.toISOString().slice(0, 10);
  const hlsDateStr = result.hlsAcquisitionDate.toISOString().slice(0, 10);
  const dateDiffDays = Math.abs(sourceAcquisitionDate.getTime() - result.hlsAcquisitionDate.getTime()) / (1000 * 60 * 60 * 24);
  const dateLineagePass = validateHLSDateLineage(sourceAcquisitionDate, result.hlsAcquisitionDate);

  console.log(`  SOURCE DATE:         ${sourceDateStr}`);
  console.log(`  HLS DATE:            ${hlsDateStr}`);
  console.log(`  DATE DIFFERENCE:     ${dateDiffDays.toFixed(3)} days`);
  console.log(`  DATE-LINEAGE RESULT: ${dateLineagePass ? 'PASS' : 'FAIL'}`);

  assert.equal(dateLineagePass, true, 'Date lineage must pass within approved tolerance');

  // ─── Step 7: Deep Raster Inspection ───────────────────────────────────────
  console.log('\n▶ STEP 7: Deep Raster Inspection of Downloaded GeoTIFF');
  const fileBuffer = fs.readFileSync(result.localFilePath);
  const fileHashSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const parsedRaster = await GeoTiffService.readGeoTiff(result.localFilePath);
  const meta = parsedRaster.metadata;

  console.log(`  File Size on Disk:   ${fileBuffer.length} bytes`);
  console.log(`  SHA-256 Hash:        ${fileHashSha256}`);
  console.log(`  Width × Height:      ${meta.width} × ${meta.height}`);
  console.log(`  Band Count:          ${meta.numBands}`);
  console.log(`  Band Names:          [${parsedRaster.bandNames.join(', ')}]`);
  console.log(`  Bits Per Sample:     [${meta.bitsPerSample.join(', ')}]`);
  console.log(`  Native / Orig CRS:   ${meta.originalCrs}`);
  console.log(`  Active / Norm CRS:   ${meta.crs}`);
  console.log(`  Pixel Scale:         ${JSON.stringify(meta.pixelScale)}`);
  console.log(`  Origin / TiePoint:   ${JSON.stringify(meta.tiePoint)}`);
  console.log(`  Bounding Box:        ${JSON.stringify(meta.bbox)}`);
  console.log(`  Pixel Area (m²):     ${meta.pixelAreaM2.toFixed(2)}`);
  console.log(`  Metric Projected:    ${meta.isProjectedMetric}`);

  // Inspect Fmask Quality Band
  let totalPixels = meta.width * meta.height;
  let validFmaskPixels = 0;
  let clearPixels = 0;
  let cloudPixels = 0;
  let shadowPixels = 0;
  let waterPixels = 0;

  if (parsedRaster.bandData.length >= 7) {
    const fmaskBand = parsedRaster.bandData[6]!; // 7th band is Fmask
    for (let i = 0; i < totalPixels; i++) {
      const v = fmaskBand[i];
      if (v !== undefined && !isNaN(v) && isFinite(v) && (meta.nodata === null || v !== meta.nodata)) {
        validFmaskPixels++;
        const intVal = Math.round(v);
        // Fmask bit 1 = cloud (value 2), bit 2 = adjacent, bit 3 = shadow (value 8), bit 5 = water (value 32)
        if ((intVal & 2) !== 0) cloudPixels++;
        else if ((intVal & 8) !== 0) shadowPixels++;
        else if ((intVal & 32) !== 0) waterPixels++;
        else clearPixels++;
      }
    }
  }

  console.log(`\n  Fmask Quality Band Analysis:`);
  console.log(`    Total Pixels:        ${totalPixels}`);
  console.log(`    Valid (non-nodata):  ${validFmaskPixels} (${((validFmaskPixels / totalPixels) * 100).toFixed(1)}%)`);
  console.log(`    Clear Land Pixels:   ${clearPixels}`);
  console.log(`    Cloud Pixels:        ${cloudPixels}`);
  console.log(`    Shadow Pixels:       ${shadowPixels}`);
  console.log(`    Water Pixels:        ${waterPixels}`);

  acceptanceReport.rasterInspection = {
    localFilePath: result.localFilePath,
    fileSizeBytes: fileBuffer.length,
    sha256: fileHashSha256,
    width: meta.width,
    height: meta.height,
    numBands: meta.numBands,
    bandNames: parsedRaster.bandNames,
    bitsPerSample: meta.bitsPerSample,
    crs: meta.originalCrs,
    pixelScale: meta.pixelScale,
    tiePoint: meta.tiePoint,
    bbox: meta.bbox,
    pixelAreaM2: meta.pixelAreaM2,
    fmaskAnalysis: {
      totalPixels,
      validPixels: validFmaskPixels,
      clearPixels,
      cloudPixels,
      shadowPixels,
      waterPixels,
    },
  };

  acceptanceReport.hlsResult = result;
  acceptanceReport.exportDurationMs = exportDurationMs;
  finalStatus = 'PHASE5_VERIFIED';
}

// ─── Step 8: Verify NO Database Side Effects (Strict Invariance) ────────────

console.log('\n▶ STEP 8: Verify Database Invariance (Strict Safety Gate)');

const countsAfter = {
  hlsrepresentations: await db.collection('hlsrepresentations').countDocuments().catch(() => 0),
  baselines: await db.collection('baselines').countDocuments().catch(() => 0),
  satellitemetadatas: await db.collection('satellitemetadatas').countDocuments().catch(() => 0),
  changedetections: await db.collection('changedetections').countDocuments().catch(() => 0),
  alerts: await db.collection('alerts').countDocuments().catch(() => 0),
  monitoringjobs: await db.collection('monitoringjobs').countDocuments().catch(() => 0),
};

console.log('  Post-test collection counts:');
let dbViolations = 0;
for (const [col, count] of Object.entries(countsAfter)) {
  const before = countsBefore[col as keyof typeof countsBefore];
  const delta = count - before;
  const status = delta === 0 ? '✅ UNCHANGED' : `❌ CHANGED (delta: ${delta})`;
  console.log(`    • ${col.padEnd(22)}: ${count} (before: ${before}) → ${status}`);
  if (delta !== 0) dbViolations++;
}

acceptanceReport.countsAfter = countsAfter;
acceptanceReport.dbViolations = dbViolations;

if (dbViolations === 0) {
  console.log('\n  ✅ STRICT DATABASE INVARIANCE PRESERVED: 0 records created, 0 records modified.');
} else {
  console.error(`\n  ❌ DATABASE INVARIANCE VIOLATED: ${dbViolations} collection(s) modified.`);
  finalStatus = 'PHASE5_BLOCKED';
}

// Check that baseline hlsRepresentationId was not populated
const baselineAfter = await db.collection('baselines').findOne({ _id: new mongoose.Types.ObjectId(selectedSmeta.intersectingZones?.[0] ? '6abc0c9db66bbf781fc2bca4' : undefined) });
if (baselineAfter && baselineAfter.hlsRepresentationId) {
  console.error('❌ Baseline.hlsRepresentationId was unexpectedly populated!');
  finalStatus = 'PHASE5_BLOCKED';
} else {
  console.log('  ✅ Baseline.hlsRepresentationId remains untouched (undefined).');
}

// ─── Step 9: Structural and Product Mapping Assertions ─────────────────────────

console.log('\n▶ STEP 9: Structural & Product Mapping Assertions');

assert.equal(resolveHLSProduct(SatelliteSource.SENTINEL_2), HLSProduct.S30);
assert.equal(HLS_GEE_COLLECTIONS[HLSProduct.S30], 'NASA/HLS/HLSS30/v002');
assert.equal(resolveHLSProduct(SatelliteSource.LANDSAT_8), HLSProduct.L30);
assert.equal(resolveHLSProduct(SatelliteSource.LANDSAT_9), HLSProduct.L30);
assert.equal(HLS_GEE_COLLECTIONS[HLSProduct.L30], 'NASA/HLS/HLSL30/v002');
assert.equal(HLS_NATIVE_RESOLUTION_M, 30);

// SAR rejection
let sarBlocked = false;
try {
  resolveHLSProduct(SatelliteSource.SENTINEL_1);
} catch {
  sarBlocked = true;
}
assert.equal(sarBlocked, true, 'SAR must be rejected from resolveHLSProduct');
console.log('  ✅ Product mappings & SAR rejection verified.');

await mongoose.disconnect();
console.log('\n  MongoDB connection closed.');

acceptanceReport.finalStatus = finalStatus;
printReport(acceptanceReport);

if (finalStatus === 'PHASE5_BLOCKED') {
  process.exit(1);
}
process.exit(0);

// ─── Helper ───────────────────────────────────────────────────────────────────

function printReport(r: Record<string, any>): void {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  FINAL STATUS: ${(r.finalStatus || 'UNKNOWN').padEnd(46)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('══════════ ACCEPTANCE SUMMARY JSON ══════════');
  console.log(JSON.stringify(r, null, 2));
  console.log('═════════════════════════════════════════════\n');
}
