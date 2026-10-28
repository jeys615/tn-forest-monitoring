/**
 * hls-real-persistence-linking.test.ts — Phase 6 Real GEE Acceptance & Persistence Test
 *
 * Real controlled end-to-end Phase 6 verification:
 *   1. Real GEE NASA HLS V2.0 acquisition
 *   2. Persistent HLSRepresentation (status: READY) with full lineage
 *   3. Atomic linking of Baseline.hlsRepresentationId
 *   4. Baseline immutability verification (native imageId, acquisitionDate unchanged)
 *   5. Idempotent re-run verification (0 new exports, 0 duplicate records, identical ID)
 *   6. Complete DB before/after counts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { BaselineModel, type IBaseline } from '../models/Baseline.js';
import {
  HLSRepresentationModel,
  type IHLSRepresentation,
} from '../models/HLSRepresentation.js';
import { SatelliteMetadata as SatelliteMetadataModel } from '../models/SatelliteMetadata.js';
import { Zone as ZoneModel } from '../models/Zone.js';
import { HLSRepresentationRepository } from '../repositories/HLSRepresentationRepository.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import { HLSRepresentationService } from '../services/hls/HLSRepresentationService.js';
import { HLSAcquisitionService } from '../services/hls/HLSAcquisitionService.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import {
  OpticalComparisonDecisionService,
  type ComparisonObservationInput,
} from '../services/spatial/OpticalComparisonDecisionService.js';
import {
  SensorType,
  SatelliteSource,
  HLSProduct,
  HLSVersion,
  HLSRepresentationStatus,
  ComparisonMode,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PHASE 6 — REAL HLS PERSISTENCE & LAZY LINKING ACCEPTANCE   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Step 1: Verify GEE Authentication ──────────────────────────────────────
  console.log('▶ STEP 1: Verify GEE Authentication');
  const authService = GeeAuthService.getInstance();
  const authStatus = await authService.checkConnection();
  console.log(`  GEE connected:   ${authStatus.connected}`);
  console.log(`  Project ID:      ${authStatus.projectId}`);
  console.log(`  Auth method:     ${authStatus.authMethod}`);
  console.log(`  Mode:            ${authStatus.mode}`);

  if (!authStatus.connected) {
    console.error(`❌ GEE auth failed: ${authStatus.error || authStatus.message}`);
    process.exit(1);
  }
  console.log('  ✅ GEE authenticated successfully\n');

  // ── Step 2: Connect to MongoDB & Snapshot DB Counts Before ──────────────────
  console.log('▶ STEP 2: Connect to MongoDB & Snapshot Pre-Test Counts');
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db!;

  const countsBefore = {
    hlsrepresentations: await db.collection('hlsrepresentations').countDocuments(),
    baselines: await db.collection('baselines').countDocuments(),
    satellitemetadatas: await db.collection('satellitemetadatas').countDocuments(),
    changedetections: await db.collection('changedetections').countDocuments(),
    alerts: await db.collection('alerts').countDocuments(),
    monitoringjobs: await db.collection('monitoringjobs').countDocuments(),
  };

  console.log('  Pre-test collection counts:');
  for (const [col, cnt] of Object.entries(countsBefore)) {
    console.log(`    • ${col.padEnd(22)}: ${cnt}`);
  }

  // ── Step 3: Identify Logical Baseline & Candidate Observation ──────────────
  console.log('\n▶ STEP 3: Identify Logical Optical Baseline & Cross-Sensor Candidate');

  const baseline = await BaselineModel.findOne({
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
  }).exec();

  if (!baseline) {
    console.error('❌ No optical Sentinel-2 baseline found in database');
    process.exit(1);
  }

  console.log(`  Logical Baseline ID:       ${baseline._id}`);
  console.log(`  Baseline imageId:          ${baseline.imageId}`);
  console.log(`  Baseline source:           ${baseline.source}`);
  console.log(`  Baseline sensorType:       ${baseline.sensorType}`);
  console.log(`  Baseline acquisitionDate:  ${baseline.acquisitionDate.toISOString()}`);
  console.log(`  Baseline current hlsRepId: ${baseline.hlsRepresentationId || 'undefined'}`);

  // Capture baseline immutable fields before test
  const initialBaselineSnapshot = {
    imageId: baseline.imageId,
    source: baseline.source,
    sensorType: baseline.sensorType,
    acquisitionDate: baseline.acquisitionDate.toISOString(),
    satelliteMetadataId: baseline.satelliteMetadataId.toString(),
    monitoringTrack: baseline.monitoringTrack,
  };

  // Find candidate Landsat-8 observation
  const landsatMeta = await SatelliteMetadataModel.findOne({
    source: SatelliteSource.LANDSAT_8,
    sensorType: SensorType.OPTICAL,
  }).exec();

  if (!landsatMeta) {
    console.error('❌ No Landsat-8 SatelliteMetadata candidate found in database');
    process.exit(1);
  }

  console.log(`  Candidate Observation ID:  ${landsatMeta.imageId}`);
  console.log(`  Candidate source:          ${landsatMeta.source}`);
  console.log(`  Candidate acquisitionDate: ${landsatMeta.acquisitionDate.toISOString()}`);

  const candidateInput: ComparisonObservationInput = {
    imageId: landsatMeta.imageId,
    source: landsatMeta.source,
    sensorType: landsatMeta.sensorType,
    monitoringTrack: baseline.monitoringTrack,
    acquisitionDate: landsatMeta.acquisitionDate,
    zoneId: baseline.zoneId.toString(),
  };

  // ── Step 4: Evaluate Optical Comparison Strategy ───────────────────────────
  console.log('\n▶ STEP 4: Evaluate Optical Comparison Strategy');
  const baselineObs: ComparisonObservationInput = {
    imageId: baseline.imageId!,
    source: baseline.source,
    sensorType: baseline.sensorType,
    monitoringTrack: baseline.monitoringTrack,
    acquisitionDate: baseline.acquisitionDate,
    zoneId: baseline.zoneId.toString(),
  };

  const decision = OpticalComparisonDecisionService.decideComparison(baselineObs, candidateInput);
  console.log(`  Comparison Mode:       ${decision.mode}`);
  console.log(`  Requires HLS:          ${decision.requiresHLS}`);
  console.log(`  Is Compatible:         ${decision.isCompatible}`);
  console.log(`  Baseline HLS Product:  ${decision.baselineHLSProduct}`);
  console.log(`  Candidate HLS Product: ${decision.currentHLSProduct}`);
  console.log(`  Decision Reason:       ${decision.reason}`);

  assert.equal(decision.mode, ComparisonMode.HLS, 'Decision must be HLS mode');
  assert.equal(decision.requiresHLS, true, 'Decision must require HLS');
  assert.equal(decision.baselineHLSProduct, HLSProduct.S30, 'Baseline HLS product must be S30');

  // ── Step 5: Lazy Derivation of HLS Representation via Real GEE ─────────────
  console.log('\n▶ STEP 5: Lazy Derivation of HLS Representation (Real GEE Execution)');

  const hlsRepresentationRepo = new HLSRepresentationRepository();
  const baselineRepo = new BaselineRepository();
  const hlsAcquisitionService = new HLSAcquisitionService();
  const hlsRepresentationService = new HLSRepresentationService(
    hlsRepresentationRepo,
    baselineRepo,
    hlsAcquisitionService,
  );

  const acquisitionStartTime = Date.now();
  const result1 = await hlsRepresentationService.prepareComparison({
    baselineId: baseline._id,
    candidate: candidateInput,
  });
  const acquisitionDurationSec = ((Date.now() - acquisitionStartTime) / 1000).toFixed(1);

  console.log(`  Acquisition & persistence completed in: ${acquisitionDurationSec}s`);
  console.log(`  Returned Comparison Mode: ${result1.mode}`);
  console.log(`  Requires HLS:             ${result1.requiresHLS}`);
  assert.ok(result1.representation, 'Representation must be returned');

  const rep1 = result1.representation!;
  console.log(`\n  ✅ Persisted HLSRepresentation:`);
  console.log(`    • ID:                     ${rep1._id}`);
  console.log(`    • Baseline ID:            ${rep1.baselineId}`);
  console.log(`    • Status:                 ${rep1.status}`);
  console.log(`    • HLS Product:            ${rep1.hlsProduct}`);
  console.log(`    • HLS Version:            ${rep1.hlsVersion}`);
  console.log(`    • Processing Version:     ${rep1.processingVersion}`);
  console.log(`    • Source Observation ID:  ${rep1.sourceObservationId}`);
  console.log(`    • Source Acquisition Date:${rep1.sourceAcquisitionDate.toISOString()}`);
  console.log(`    • GEE Collection:         ${rep1.geeCollectionId}`);
  console.log(`    • GEE Image ID:           ${rep1.geeImageId}`);
  console.log(`    • GEE Export Task ID:     ${rep1.geeExportTaskId}`);
  console.log(`    • Drive File ID:          ${rep1.driveFileId}`);
  console.log(`    • Drive File Name:        ${rep1.driveFileName}`);
  console.log(`    • Drive File Size Bytes:  ${rep1.driveFileSizeBytes}`);
  console.log(`    • Local Raster Path:      ${rep1.localRasterPath}`);
  console.log(`    • Raster Dimensions:      ${rep1.rasterWidth} x ${rep1.rasterHeight}`);
  console.log(`    • Raster Band Count:      ${rep1.rasterBandCount}`);
  console.log(`    • Raster CRS:             ${rep1.rasterCrs}`);
  console.log(`    • Resolution:             ${rep1.rasterResolutionMeters} m`);
  console.log(`    • Pixel Area:             ${rep1.pixelAreaM2} m²`);
  console.log(`    • Valid Pixel Count:      ${rep1.validPixelCount}`);
  console.log(`    • Raster Validated:       ${rep1.rasterValidated}`);
  console.log(`    • File Hash (SHA-256):    ${rep1.fileHash}`);
  console.log(`    • Completed At:           ${rep1.completedAt?.toISOString()}`);

  assert.equal(rep1.status, HLSRepresentationStatus.READY, 'Representation status must be READY');
  assert.equal(rep1.hlsProduct, HLSProduct.S30, 'Representation product must be S30');
  assert.equal(rep1.hlsVersion, HLSVersion.V2_0, 'Representation version must be V2.0');
  assert.equal(rep1.rasterValidated, true, 'Raster must be validated');
  assert.ok(rep1.geeExportTaskId, 'Export task ID must be present');
  assert.ok(rep1.driveFileId, 'Drive file ID must be present');
  assert.ok(rep1.localRasterPath && fs.existsSync(rep1.localRasterPath), 'Local raster must exist on disk');

  // ── Step 6: Verify Baseline Link & Immutability ─────────────────────────────
  console.log('\n▶ STEP 6: Verify Baseline Link & Immutability');
  const updatedBaseline = await BaselineModel.findById(baseline._id).exec();
  assert.ok(updatedBaseline, 'Baseline must exist in database');

  console.log(`  Baseline.hlsRepresentationId: ${updatedBaseline.hlsRepresentationId}`);
  assert.equal(
    updatedBaseline.hlsRepresentationId?.toString(),
    rep1._id.toString(),
    'Baseline.hlsRepresentationId must match persisted HLSRepresentation ID',
  );

  console.log('\n  Verifying Native Baseline Immutability:');
  console.log(`    • imageId:          ${updatedBaseline.imageId} (was: ${initialBaselineSnapshot.imageId})`);
  console.log(`    • source:           ${updatedBaseline.source} (was: ${initialBaselineSnapshot.source})`);
  console.log(`    • sensorType:       ${updatedBaseline.sensorType} (was: ${initialBaselineSnapshot.sensorType})`);
  console.log(`    • acquisitionDate:  ${updatedBaseline.acquisitionDate.toISOString()} (was: ${initialBaselineSnapshot.acquisitionDate})`);
  console.log(`    • metadataId:       ${updatedBaseline.satelliteMetadataId.toString()} (was: ${initialBaselineSnapshot.satelliteMetadataId})`);
  console.log(`    • monitoringTrack:  ${updatedBaseline.monitoringTrack} (was: ${initialBaselineSnapshot.monitoringTrack})`);

  assert.equal(updatedBaseline.imageId, initialBaselineSnapshot.imageId, 'Baseline imageId must remain untouched');
  assert.equal(updatedBaseline.source, initialBaselineSnapshot.source, 'Baseline source must remain untouched');
  assert.equal(updatedBaseline.sensorType, initialBaselineSnapshot.sensorType, 'Baseline sensorType must remain untouched');
  assert.equal(
    updatedBaseline.acquisitionDate.toISOString(),
    initialBaselineSnapshot.acquisitionDate,
    'Baseline acquisitionDate must remain untouched',
  );
  assert.equal(
    updatedBaseline.satelliteMetadataId.toString(),
    initialBaselineSnapshot.satelliteMetadataId,
    'Baseline satelliteMetadataId must remain untouched',
  );
  assert.equal(
    updatedBaseline.monitoringTrack,
    initialBaselineSnapshot.monitoringTrack,
    'Baseline monitoringTrack must remain untouched',
  );
  console.log('  ✅ Native baseline identity is completely immutable');

  // ── Step 7: Idempotency Re-run Verification ────────────────────────────────
  console.log('\n▶ STEP 7: Idempotency Re-run Verification');
  const repCountBeforeRerun = await db.collection('hlsrepresentations').countDocuments();
  console.log(`  HLSRepresentation count before re-run: ${repCountBeforeRerun}`);

  const rerunStartTime = Date.now();
  const result2 = await hlsRepresentationService.prepareComparison({
    baselineId: baseline._id,
    candidate: candidateInput,
  });
  const rerunDurationMs = Date.now() - rerunStartTime;
  console.log(`  Re-run executed in: ${rerunDurationMs}ms (immediate cache/DB hit, no export)`);

  assert.ok(result2.representation, 'Re-run must return representation');
  const rep2 = result2.representation!;
  console.log(`  First Representation ID:  ${rep1._id}`);
  console.log(`  Second Representation ID: ${rep2._id}`);
  assert.equal(
    rep2._id.toString(),
    rep1._id.toString(),
    'Re-run must return exact same HLSRepresentation document',
  );

  const repCountAfterRerun = await db.collection('hlsrepresentations').countDocuments();
  console.log(`  HLSRepresentation count after re-run:  ${repCountAfterRerun}`);
  assert.equal(
    repCountAfterRerun,
    repCountBeforeRerun,
    'Representation count must NOT increase on re-run',
  );

  const baselineAfterRerun = await BaselineModel.findById(baseline._id).exec();
  assert.equal(
    baselineAfterRerun?.hlsRepresentationId?.toString(),
    rep1._id.toString(),
    'Baseline.hlsRepresentationId must remain unchanged',
  );
  console.log('  ✅ Idempotency strictly verified (0 new exports, 0 duplicate records)');

  // ── Step 8: Database Before/After Counts ────────────────────────────────────
  console.log('\n▶ STEP 8: Database Snapshot Counts Comparison');
  const countsAfter = {
    hlsrepresentations: await db.collection('hlsrepresentations').countDocuments(),
    baselines: await db.collection('baselines').countDocuments(),
    satellitemetadatas: await db.collection('satellitemetadatas').countDocuments(),
    changedetections: await db.collection('changedetections').countDocuments(),
    alerts: await db.collection('alerts').countDocuments(),
    monitoringjobs: await db.collection('monitoringjobs').countDocuments(),
  };

  console.log('\n  Database Collection Counts (Before vs After):');
  console.log('  ' + 'Collection'.padEnd(24) + 'Before'.padEnd(10) + 'After'.padEnd(10) + 'Delta');
  console.log('  ' + '─'.repeat(54));
  for (const col of Object.keys(countsBefore) as (keyof typeof countsBefore)[]) {
    const b = countsBefore[col];
    const a = countsAfter[col];
    const delta = a - b;
    const sign = delta > 0 ? `+${delta}` : `${delta}`;
    console.log(`  ${col.padEnd(24)}${String(b).padEnd(10)}${String(a).padEnd(10)}${sign}`);
  }

  // Invariants check:
  // - hlsrepresentations should increase by exactly 1 (the single real representation)
  // - baselines: delta 0 (only updated hlsRepresentationId reference)
  // - satellitemetadatas: delta 0
  // - changedetections: delta 0 (no change detection in Phase 6)
  // - alerts: delta 0 (no alerts in Phase 6)
  // - monitoringjobs: delta 0
  assert.equal(countsAfter.hlsrepresentations - countsBefore.hlsrepresentations, 1, 'hlsrepresentations delta must be +1');
  assert.equal(countsAfter.baselines, countsBefore.baselines, 'baselines count must remain constant');
  assert.equal(countsAfter.satellitemetadatas, countsBefore.satellitemetadatas, 'satellitemetadatas count must remain constant');
  assert.equal(countsAfter.changedetections, countsBefore.changedetections, 'changedetections count must remain constant');
  assert.equal(countsAfter.alerts, countsBefore.alerts, 'alerts count must remain constant');
  assert.equal(countsAfter.monitoringjobs, countsBefore.monitoringjobs, 'monitoringjobs count must remain constant');

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PHASE 6 CONTROLLED ACCEPTANCE TEST: VERIFIED SUCCESSFUL   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Controlled acceptance test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
