/**
 * hls-real-cross-sensor-comparison.test.ts — Phase 7 Real End-to-End Cross-Sensor Acceptance
 *
 * Real controlled end-to-end Phase 7 verification:
 *   1. Real GEE NASA HLS V2.0 L30 acquisition for Landsat-8 candidate observation
 *   2. Persistent HLSRepresentation (status: READY) for L30 observation
 *   3. Shared canonical 30m analysis grid (EPSG:32643, 30m x 30m, 900 m2/pixel)
 *   4. Bilinear resampling for reflectance; categorical nearest-neighbor for Fmask QA
 *   5. 5-way valid intersection masking (baseline footprint & current footprint & baseline QA & current QA & zone boundary)
 *   6. Harmonized surface reflectance scaling (0.0001) & spectral indices (NDVI)
 *   7. Pixel-level change detection (deltaNDVI = currentNDVI - baselineNDVI, loss threshold <= -0.15)
 *   8. Physical ground area strictly derived from changedPixelCount * 900 m2 / 10,000 ha
 *   9. Persist ChangeDetection record with comparisonMode = HLS
 *  10. NO alerts created; NO monitoring cursors advanced
 *  11. Deterministic reproduction test verifying bit-identical output
 *  12. Complete before/after DB inventory audit
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
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { HLSRepresentationRepository } from '../repositories/HLSRepresentationRepository.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import { HLSRepresentationService } from '../services/hls/HLSRepresentationService.js';
import { HLSAcquisitionService } from '../services/hls/HLSAcquisitionService.js';
import { HLSComparisonService } from '../services/hls/HLSComparisonService.js';
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
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   PHASE 7 — REAL HLS CROSS-SENSOR SPATIAL COMPARISON TEST        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

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

  // ── Step 2: Connect to MongoDB & Snapshot Pre-Test Counts ──────────────────
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

  // ── Step 3: Load Logical Baseline & Verify READY S30 Representation ────────
  console.log('\n▶ STEP 3: Load Baseline & S30 HLS Representation');

  const baseline = await BaselineModel.findOne({
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
  }).exec();

  if (!baseline) {
    console.error('❌ No optical Sentinel-2 baseline found');
    process.exit(1);
  }

  console.log(`  Baseline ID:              ${baseline._id}`);
  console.log(`  Baseline imageId:         ${baseline.imageId}`);
  console.log(`  Baseline source:          ${baseline.source}`);
  console.log(`  Baseline acquisitionDate: ${baseline.acquisitionDate.toISOString()}`);
  console.log(`  Linked hlsRepId:          ${baseline.hlsRepresentationId}`);

  assert.ok(baseline.hlsRepresentationId, 'Baseline must have linked hlsRepresentationId');

  const baselineRep = await HLSRepresentationModel.findById(baseline.hlsRepresentationId).exec();
  assert.ok(baselineRep, 'Baseline HLSRepresentation must exist in DB');
  assert.equal(baselineRep.status, 'READY', 'Baseline HLSRepresentation must be READY');
  assert.equal(baselineRep.hlsProduct, 'S30', 'Baseline HLS product must be S30');
  assert.ok(baselineRep.localRasterPath, 'Baseline local raster path must exist');
  assert.ok(fs.existsSync(baselineRep.localRasterPath), `Local file exists: ${baselineRep.localRasterPath}`);

  console.log(`  ✅ Baseline S30 Representation verified:`);
  console.log(`    • ID:            ${baselineRep._id}`);
  console.log(`    • GEE Image ID:  ${baselineRep.geeImageId}`);
  console.log(`    • Local Raster:  ${baselineRep.localRasterPath}`);

  // ── Step 4: Load Candidate Landsat-8 Observation & Zone Boundary ───────────
  console.log('\n▶ STEP 4: Load Candidate Landsat-8 Observation & Zone Boundary');

  const landsatMeta = await SatelliteMetadataModel.findById('6abc0c9db66bbf781fc2bc98').exec();
  if (!landsatMeta) {
    console.error('❌ Landsat-8 observation 6abc0c9db66bbf781fc2bc98 not found');
    process.exit(1);
  }

  console.log(`  Candidate Observation ID: ${landsatMeta._id}`);
  console.log(`  Candidate imageId:        ${landsatMeta.imageId}`);
  console.log(`  Candidate source:         ${landsatMeta.source}`);
  console.log(`  Candidate acquisitionDate:${landsatMeta.acquisitionDate.toISOString()}`);

  const zone = await ZoneModel.findById(baseline.zoneId).exec();
  if (!zone) {
    console.error(`❌ Zone ${baseline.zoneId} not found`);
    process.exit(1);
  }
  console.log(`  Zone Code:                ${zone.zoneId}`);
  console.log(`  Zone Name:                ${zone.name}`);
  console.log(`  Zone Area (ha):           ${zone.areaHectares}`);

  // ── Step 5: Execute Decision Service ───────────────────────────────────────
  console.log('\n▶ STEP 5: Execute OpticalComparisonDecisionService');

  const baselineObs: ComparisonObservationInput = {
    imageId: baseline.imageId!,
    source: baseline.source,
    sensorType: baseline.sensorType,
    monitoringTrack: baseline.monitoringTrack,
    acquisitionDate: baseline.acquisitionDate,
    zoneId: baseline.zoneId.toString(),
  };

  const candidateObs: ComparisonObservationInput = {
    imageId: landsatMeta.imageId,
    source: landsatMeta.source,
    sensorType: landsatMeta.sensorType,
    monitoringTrack: baseline.monitoringTrack,
    acquisitionDate: landsatMeta.acquisitionDate,
    zoneId: baseline.zoneId.toString(),
  };

  const decision = OpticalComparisonDecisionService.decideComparison(baselineObs, candidateObs);
  console.log(`  Comparison Mode:       ${decision.mode}`);
  console.log(`  Requires HLS:          ${decision.requiresHLS}`);
  console.log(`  Baseline HLS Product:  ${decision.baselineHLSProduct}`);
  console.log(`  Candidate HLS Product: ${decision.currentHLSProduct}`);
  console.log(`  Decision Reason:       ${decision.reason}`);

  assert.equal(decision.mode, ComparisonMode.HLS, 'Decision mode must be HLS');
  assert.equal(decision.requiresHLS, true, 'Requires HLS must be true');
  assert.equal(decision.baselineHLSProduct, HLSProduct.S30, 'Baseline product must be S30');
  assert.equal(decision.currentHLSProduct, HLSProduct.L30, 'Candidate product must be L30');
  console.log('  ✅ Decision Engine verified: cross-sensor comparison requires HLS (S30 ↔ L30)');

  // ── Step 6: Real L30 Acquisition & Persistent Representation ───────────────
  console.log('\n▶ STEP 6: Acquire Current L30 Representation via Real GEE Pipeline');

  const hlsRepresentationRepo = new HLSRepresentationRepository();
  const baselineRepo = new BaselineRepository();
  const hlsAcquisitionService = new HLSAcquisitionService();
  const hlsRepresentationService = new HLSRepresentationService(
    hlsRepresentationRepo,
    baselineRepo,
    hlsAcquisitionService,
  );

  const acquisitionStartTime = Date.now();
  const candidateRepResult = await hlsRepresentationService.getOrDeriveObservationRepresentation({
    observationId: landsatMeta._id,
    requiredProduct: HLSProduct.L30,
    hlsVersion: HLSVersion.V2_0,
    processingVersion: '1.0.0',
    zoneCode: zone.zoneId,
    zoneGeometry: zone.boundary as GeoJSONPolygon,
  });
  const acquisitionDurationSec = ((Date.now() - acquisitionStartTime) / 1000).toFixed(1);

  console.log(`  L30 Acquisition completed in: ${acquisitionDurationSec}s`);
  assert.ok(candidateRepResult.representation, 'Representation must be returned');

  const currentRep = candidateRepResult.representation;
  console.log(`\n  ✅ Persisted L30 HLSRepresentation:`);
  console.log(`    • ID:                     ${currentRep._id}`);
  console.log(`    • Status:                 ${currentRep.status}`);
  console.log(`    • Is Observation Only:    ${currentRep.isObservationOnly}`);
  console.log(`    • Observation ID:         ${currentRep.observationId}`);
  console.log(`    • HLS Product:            ${currentRep.hlsProduct}`);
  console.log(`    • GEE Collection:         ${currentRep.geeCollectionId}`);
  console.log(`    • GEE Image ID:           ${currentRep.geeImageId}`);
  console.log(`    • GEE Export Task ID:     ${currentRep.geeExportTaskId}`);
  console.log(`    • Drive File ID:          ${currentRep.driveFileId}`);
  console.log(`    • Drive File Name:        ${currentRep.driveFileName}`);
  console.log(`    • Local Raster Path:      ${currentRep.localRasterPath}`);
  console.log(`    • Raster Dimensions:      ${currentRep.rasterWidth} x ${currentRep.rasterHeight}`);
  console.log(`    • Raster CRS:             ${currentRep.rasterCrs}`);
  console.log(`    • Valid Pixel Count:      ${currentRep.validPixelCount}`);
  console.log(`    • File Hash:              ${currentRep.fileHash}`);

  assert.equal(currentRep.status, 'READY', 'Current HLSRepresentation must be READY');
  assert.equal(currentRep.hlsProduct, 'L30', 'HLS product must be L30');
  assert.ok(currentRep.localRasterPath && fs.existsSync(currentRep.localRasterPath), 'Local raster must exist');

  // ── Step 7: Execute HLS Cross-Sensor Spatial Comparison ────────────────────
  console.log('\n▶ STEP 7: Execute HLS Cross-Sensor Spatial Comparison');

  const comparisonStartTime = Date.now();
  const comparisonResult = await HLSComparisonService.compareHlsRepresentations({
    baselineRepresentation: baselineRep,
    currentRepresentation: currentRep,
    zoneBoundary: zone.boundary as GeoJSONPolygon,
    zoneAreaHectares: zone.areaHectares,
    zoneId: zone._id,
    targetCrs: 'EPSG:32643',
    persistChangeDetection: true,
  });
  const comparisonDurationMs = Date.now() - comparisonStartTime;

  console.log(`  Comparison completed in: ${comparisonDurationMs}ms\n`);

  const { metrics, lineage, changeDetection } = comparisonResult;

  console.log('  ══════════════════════════════════════════════════════════════');
  console.log('  HLS CROSS-SENSOR SPATIAL COMPARISON AUDIT RESULTS');
  console.log('  ══════════════════════════════════════════════════════════════');
  console.log(`  Grid Dimensions:            ${comparisonResult.grid.width} x ${comparisonResult.grid.height}`);
  console.log(`  Grid CRS:                   ${comparisonResult.grid.crs}`);
  console.log(`  Grid Pixel Size:            ${comparisonResult.grid.pixelSizeX}m x ${comparisonResult.grid.pixelSizeY}m`);
  console.log(`  Grid Cell Area:             ${metrics.pixelAreaM2} m²`);
  console.log(`  Total Grid Cells:           ${metrics.totalGridPixels}`);
  console.log(`  Zone Boundary Pixels:       ${metrics.zonePixels}`);
  console.log(`  Baseline Valid Pixels:      ${metrics.baselineValidPixels}`);
  console.log(`  Current Valid Pixels:       ${metrics.currentValidPixels}`);
  console.log(`  Footprint Overlap Pixels:   ${metrics.overlapPixels}`);
  console.log(`  QA-Masked Pixels (Cloud/Sh):${metrics.qaMaskedPixels}`);
  console.log(`  Valid Comparison Pixels:    ${metrics.validComparisonPixels}`);
  console.log(`  Zone Coverage Percentage:   ${metrics.coveragePercentage}%`);
  console.log('  ──────────────────────────────────────────────────────────────');
  console.log(`  Canopy Loss Pixels (<= -0.15): ${metrics.decreasePixels}`);
  console.log(`  Canopy Gain Pixels (>= +0.15): ${metrics.increasePixels}`);
  console.log(`  Stable Pixels:              ${metrics.stablePixels}`);
  console.log(`  Total Changed Pixels:       ${metrics.changedPixels}`);
  console.log(`  Mean ΔNDVI:                 ${metrics.meanDeltaNdvi}`);
  console.log(`  Median ΔNDVI:               ${metrics.medianDeltaNdvi}`);
  console.log(`  Std Dev ΔNDVI:              ${metrics.stdDeltaNdvi}`);
  console.log('  ──────────────────────────────────────────────────────────────');
  console.log(`  Changed Ground Area (m²):   ${metrics.changedAreaM2} m²`);
  console.log(`  Changed Ground Area (ha):   ${metrics.changedAreaHectares} ha`);
  console.log(`  Affected Area Percentage:   ${metrics.affectedAreaPercentage}%`);
  console.log('  ══════════════════════════════════════════════════════════════\n');

  // Verify physical ground area derivation
  const exactDerivedAreaM2 = metrics.changedPixels * 900.0;
  const exactDerivedAreaHa = Number((exactDerivedAreaM2 / 10000.0).toFixed(4));
  assert.equal(
    metrics.changedAreaHectares,
    exactDerivedAreaHa,
    'Changed ground area must strictly equal changedPixels * 900 m2 / 10000',
  );
  console.log('  ✅ Ground area derivation verified: exact physical pixel geometry (no heuristic scaling)');

  // Verify ChangeDetection record
  assert.ok(changeDetection, 'ChangeDetection record must be persisted');
  console.log(`\n  ✅ Persisted ChangeDetection Record:`);
  console.log(`    • ID:                     ${changeDetection._id}`);
  console.log(`    • Change ID:              ${changeDetection.changeId}`);
  console.log(`    • Comparison Mode:        ${changeDetection.comparisonMode}`);
  console.log(`    • Baseline HLS Rep ID:    ${changeDetection.baselineHlsRepresentationId}`);
  console.log(`    • Current HLS Rep ID:     ${changeDetection.currentHlsRepresentationId}`);
  console.log(`    • Baseline HLS Image:     ${changeDetection.baselineHlsImageId}`);
  console.log(`    • Current HLS Image:      ${changeDetection.currentHlsImageId}`);
  console.log(`    • HLS Version:            ${changeDetection.hlsVersion}`);
  console.log(`    • Processing Version:     ${changeDetection.processingVersion}`);
  console.log(`    • Changed Area (ha):      ${changeDetection.changedArea}`);
  console.log(`    • Affected Area (%):      ${changeDetection.affectedAreaPercentage}`);
  console.log(`    • Severity:               ${changeDetection.severity}`);
  console.log(`    • Alert Generated:        ${changeDetection.alertGenerated}`);

  assert.equal(changeDetection.comparisonMode, ComparisonMode.HLS, 'ChangeDetection comparisonMode must be HLS');
  assert.equal(changeDetection.severity, 'NONE', 'Severity must strictly be NONE (no alerts)');
  assert.equal(changeDetection.alertGenerated, false, 'alertGenerated must strictly be false');

  // ── Step 8: Deterministic Reproduction Test ────────────────────────────────
  console.log('\n▶ STEP 8: Deterministic Reproduction Test');

  const reproductionStartTime = Date.now();
  const rerunResult = await HLSComparisonService.compareHlsRepresentations({
    baselineRepresentation: baselineRep,
    currentRepresentation: currentRep,
    zoneBoundary: zone.boundary as GeoJSONPolygon,
    zoneAreaHectares: zone.areaHectares,
    zoneId: zone._id,
    targetCrs: 'EPSG:32643',
    persistChangeDetection: false,
  });
  const reproductionDurationMs = Date.now() - reproductionStartTime;
  console.log(`  Reproduction run completed in: ${reproductionDurationMs}ms`);

  assert.equal(
    rerunResult.metrics.validComparisonPixels,
    metrics.validComparisonPixels,
    'Valid comparison pixel count matches identically',
  );
  assert.equal(
    rerunResult.metrics.changedPixels,
    metrics.changedPixels,
    'Changed pixel count matches identically',
  );
  assert.equal(
    rerunResult.metrics.meanDeltaNdvi,
    metrics.meanDeltaNdvi,
    'Mean deltaNDVI matches identically',
  );
  assert.equal(
    rerunResult.metrics.changedAreaHectares,
    metrics.changedAreaHectares,
    'Changed ground area matches identically',
  );

  let bitIdentical = true;
  for (let i = 0; i < metrics.totalGridPixels; i++) {
    if (rerunResult.changedMask[i] !== comparisonResult.changedMask[i]) {
      bitIdentical = false;
      break;
    }
  }
  assert.ok(bitIdentical, 'Changed pixel mask is 100% bit-identical on reproduction run');
  console.log('  ✅ Deterministic reproduction verified: 100% bit-identical outputs');

  // ── Step 9: Post-Test DB Inventory & Invariant Audit ───────────────────────
  console.log('\n▶ STEP 9: Database Inventory Audit');
  const countsAfter = {
    hlsrepresentations: await db.collection('hlsrepresentations').countDocuments(),
    baselines: await db.collection('baselines').countDocuments(),
    satellitemetadatas: await db.collection('satellitemetadatas').countDocuments(),
    changedetections: await db.collection('changedetections').countDocuments(),
    alerts: await db.collection('alerts').countDocuments(),
    monitoringjobs: await db.collection('monitoringjobs').countDocuments(),
  };

  console.log('  Collection counts comparison:');
  console.log(`    • hlsrepresentations:  ${countsBefore.hlsrepresentations} -> ${countsAfter.hlsrepresentations} (expected +1)`);
  console.log(`    • baselines:           ${countsBefore.baselines} -> ${countsAfter.baselines} (expected 0 change)`);
  console.log(`    • satellitemetadatas:  ${countsBefore.satellitemetadatas} -> ${countsAfter.satellitemetadatas} (expected 0 change)`);
  console.log(`    • changedetections:    ${countsBefore.changedetections} -> ${countsAfter.changedetections} (expected +1)`);
  console.log(`    • alerts:              ${countsBefore.alerts} -> ${countsAfter.alerts} (expected 0 change)`);
  console.log(`    • monitoringjobs:      ${countsBefore.monitoringjobs} -> ${countsAfter.monitoringjobs} (expected 0 change)`);

  if (candidateRepResult.newlyCreated) {
    assert.equal(
      countsAfter.hlsrepresentations,
      countsBefore.hlsrepresentations + 1,
      'hlsrepresentations count must increase by exactly 1 when newly created',
    );
  } else {
    assert.equal(
      countsAfter.hlsrepresentations,
      countsBefore.hlsrepresentations,
      'hlsrepresentations count must remain unchanged when idempotently reused',
    );
  }
  assert.equal(
    countsAfter.baselines,
    countsBefore.baselines,
    'baselines count must remain unchanged',
  );
  assert.equal(
    countsAfter.satellitemetadatas,
    countsBefore.satellitemetadatas,
    'satellitemetadatas count must remain unchanged',
  );
  assert.equal(
    countsAfter.changedetections,
    countsBefore.changedetections + 1,
    'changedetections count must increase by exactly 1',
  );
  assert.equal(
    countsAfter.alerts,
    countsBefore.alerts,
    'alerts count must remain strictly unchanged (NO alerts created)',
  );
  assert.equal(
    countsAfter.monitoringjobs,
    countsBefore.monitoringjobs,
    'monitoringjobs count must remain strictly unchanged (NO scheduler interaction)',
  );

  // Baseline immutability audit
  const baselineAfter = await BaselineModel.findById(baseline._id).exec();
  assert.equal(baselineAfter?.imageId, baseline.imageId, 'Baseline imageId must be immutable');
  assert.equal(baselineAfter?.source, baseline.source, 'Baseline source must be immutable');
  assert.equal(baselineAfter?.acquisitionDate.toISOString(), baseline.acquisitionDate.toISOString(), 'Baseline date immutable');
  console.log('  ✅ Baseline immutability verified: native imageId & acquisition date unchanged');

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   PHASE 7 REAL ACCEPTANCE TEST: 100% PASSED (PHASE7_VERIFIED)     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n❌ Phase 7 Real Acceptance Test Failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
