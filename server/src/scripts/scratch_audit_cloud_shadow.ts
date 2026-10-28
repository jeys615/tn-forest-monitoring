/**
 * Read-Only Forensic Audit of the Cloud/Shadow Masking Experiment
 * Target: CHG-1791696357291-3501 (Sirumalai ZONE-261011-6340)
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { OpticalSpatialHarmonizationService } from '../services/spatial/OpticalSpatialHarmonizationService.js';
import { OpticalPixelIndexService } from '../services/spatial/OpticalPixelIndexService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function auditExperiment() {
  console.log('================================================================');
  console.log('🔬 AUDIT OF CLOUD/SHADOW EXPERIMENTAL RESULTS & INTERSECTIONS');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const persistedChange = await ChangeDetectionModel.findOne({ changeId: 'CHG-1791696357291-3501' }).lean();
  if (!persistedChange) throw new Error('Change record not found');
  const zone = await Zone.findById(persistedChange.zoneId).lean();
  if (!zone) throw new Error('Zone not found');

  const baseMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange.baselineId }, { _id: '6acb1b449ee540ec5f705ee2' }, { imageId: /20200109/ }],
  }).lean();
  const curMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange.observationId }, { _id: '6acb1cad9ee540ec5f705fac' }, { imageId: /20240207/ }],
  }).lean();

  if (!baseMeta || !curMeta) throw new Error('Metadata not found');

  const baseParsed = await GeoTiffService.readGeoTiff(baseMeta.localRasterPath || '');
  const curParsed = await GeoTiffService.readGeoTiff(curMeta.localRasterPath || '');

  const boundary = zone.boundary as GeoJSONPolygon;
  const targetGrid = AnalysisGridService.createAnalysisGrid(boundary, {
    targetCrs: 'EPSG:32643',
    pixelSizeMeters: 10,
  });

  const totalPixels = targetGrid.width * targetGrid.height;

  // Harmonize rasters (bilinear for continuous reflectance)
  const baseHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(baseParsed, targetGrid, {
    satellite: 'Sentinel-2',
  });
  const curHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(curParsed, targetGrid, {
    satellite: 'Sentinel-2',
  });

  // Control valid comparison mask
  const intersection = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(
    baseHarm,
    curHarm,
    boundary,
    targetGrid,
  );
  const controlMask = intersection.validComparisonMask;
  const controlValidCount = intersection.comparisonPixelCount;

  // Calculate indices
  const baseIndices = OpticalPixelIndexService.calculatePixelIndices(baseHarm, controlMask);
  const curIndices = OpticalPixelIndexService.calculatePixelIndices(curHarm, controlMask);

  const baseNdvi = baseIndices.indices.ndvi;
  const curNdvi = curIndices.indices.ndvi;

  // Identify control disturbance candidates (d <= -0.15)
  const controlDisturbanceMask = new Uint8Array(totalPixels);
  let controlDisturbanceCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] === 1 && curNdvi[i] - baseNdvi[i] <= -0.15) {
      controlDisturbanceMask[i] = 1;
      controlDisturbanceCount++;
    }
  }

  // Multi-spectral screening masks
  const baseBlue = baseHarm.blue;
  const baseRed = baseHarm.red;
  const baseNir = baseHarm.nir;
  const baseSwir1 = baseHarm.swir1!;

  const curBlue = curHarm.blue;
  const curRed = curHarm.red;
  const curNir = curHarm.nir;
  const curSwir1 = curHarm.swir1!;

  const THRESHOLDS = {
    cloudBlue: 0.20,
    cloudRed: 0.15,
    shadowNir: 0.10,
    shadowSwir: 0.08,
    shadowRed: 0.06,
  };

  const baseCloud = new Uint8Array(totalPixels);
  const baseShadow = new Uint8Array(totalPixels);
  const curCloud = new Uint8Array(totalPixels);
  const curShadow = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] !== 1) continue;

    const bB = Math.max(0, baseBlue[i] * 0.0001);
    const bR = Math.max(0, baseRed[i] * 0.0001);
    const bN = Math.max(0, baseNir[i] * 0.0001);
    const bS = Math.max(0, baseSwir1[i] * 0.0001);

    if (bB > THRESHOLDS.cloudBlue && bR > THRESHOLDS.cloudRed) baseCloud[i] = 1;
    if (bN < THRESHOLDS.shadowNir && bS < THRESHOLDS.shadowSwir && bR < THRESHOLDS.shadowRed) baseShadow[i] = 1;

    const cB = Math.max(0, curBlue[i] * 0.0001);
    const cR = Math.max(0, curRed[i] * 0.0001);
    const cN = Math.max(0, curNir[i] * 0.0001);
    const cS = Math.max(0, curSwir1[i] * 0.0001);

    if (cB > THRESHOLDS.cloudBlue && cR > THRESHOLDS.cloudRed) curCloud[i] = 1;
    if (cN < THRESHOLDS.shadowNir && cS < THRESHOLDS.shadowSwir && cR < THRESHOLDS.shadowRed) curShadow[i] = 1;
  }

  // ─── AUDIT ITEM 1: RECONCILIATION OF CANDIDATE OVERLAPS (VENN DIAGRAM) ───
  console.log('--- 1. CANDIDATE OVERLAP INTERSECTIONS & VENN DECOMPOSITION ---');
  let A = 0; // Base Cloud
  let B = 0; // Base Shadow
  let C = 0; // Cur Cloud
  let D = 0; // Cur Shadow

  let AB = 0, AC = 0, AD = 0, BC = 0, BD = 0, CD = 0;
  let ABC = 0, ABD = 0, ACD = 0, BCD = 0;
  let ABCD = 0;

  let uniqueRemoved = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (controlDisturbanceMask[i] !== 1) continue;

    const a = baseCloud[i] === 1;
    const b = baseShadow[i] === 1;
    const c = curCloud[i] === 1;
    const d = curShadow[i] === 1;

    if (a) A++;
    if (b) B++;
    if (c) C++;
    if (d) D++;

    if (a && b) AB++;
    if (a && c) AC++;
    if (a && d) AD++;
    if (b && c) BC++;
    if (b && d) BD++;
    if (c && d) CD++;

    if (a && b && c) ABC++;
    if (a && b && d) ABD++;
    if (a && c && d) ACD++;
    if (b && c && d) BCD++;

    if (a && b && c && d) ABCD++;

    if (a || b || c || d) {
      uniqueRemoved++;
    }
  }

  console.log(`Individual Subsets on Disturbance Candidates (N = ${controlDisturbanceCount}):`);
  console.log(`  |A| (Baseline Cloud):   ${A}`);
  console.log(`  |B| (Baseline Shadow):  ${B}`);
  console.log(`  |C| (Current Cloud):    ${C}`);
  console.log(`  |D| (Current Shadow):   ${D}`);
  console.log(`  Sum of individual sets: ${A + B + C + D}`);

  console.log(`\nPairwise Intersections:`);
  console.log(`  |A ∩ B| (Base Cloud & Base Shadow): ${AB}`);
  console.log(`  |A ∩ C| (Base Cloud & Cur Cloud):   ${AC}`);
  console.log(`  |A ∩ D| (Base Cloud & Cur Shadow):  ${AD}`);
  console.log(`  |B ∩ C| (Base Shadow & Cur Cloud):  ${BC}`);
  console.log(`  |B ∩ D| (Base Shadow & Cur Shadow): ${BD}`);
  console.log(`  |C ∩ D| (Cur Cloud & Cur Shadow):   ${CD}`);

  console.log(`\nTriple & Higher Intersections:`);
  console.log(`  |A ∩ B ∩ C|: ${ABC}`);
  console.log(`  |A ∩ B ∩ D|: ${ABD}`);
  console.log(`  |A ∩ C ∩ D|: ${ACD}`);
  console.log(`  |B ∩ C ∩ D|: ${BCD}`);
  console.log(`  |A ∩ B ∩ C ∩ D|: ${ABCD}`);

  const inclusionExclusionSum =
    (A + B + C + D) -
    (AB + AC + AD + BC + BD + CD) +
    (ABC + ABD + ACD + BCD) -
    ABCD;

  console.log(`\nInclusion-Exclusion Formula Result: ${inclusionExclusionSum}`);
  console.log(`Direct Unique Union Count:         ${uniqueRemoved}`);
  console.log(`Exact Match Verified:              ${inclusionExclusionSum === uniqueRemoved ? '✅ YES' : '❌ NO'}`);

  // ─── AUDIT ITEM 2: COMMON-CLEAR MASK EXACT INTERSECTION ───
  console.log('\n--- 2. COMMON-CLEAR MASK DEFINITION & IDENTITY VERIFICATION ---');
  const baseClear = new Uint8Array(totalPixels);
  const curClear = new Uint8Array(totalPixels);
  const commonClearDirect = new Uint8Array(totalPixels);
  const commonClearLoop = new Uint8Array(totalPixels);

  let directCount = 0;
  let loopCount = 0;
  let bitMismatch = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] === 1) {
      baseClear[i] = baseCloud[i] === 0 && baseShadow[i] === 0 ? 1 : 0;
      curClear[i] = curCloud[i] === 0 && curShadow[i] === 0 ? 1 : 0;

      // Method A: Exact intersection of controlMask && baseClear && curClear
      if (controlMask[i] === 1 && baseClear[i] === 1 && curClear[i] === 1) {
        commonClearDirect[i] = 1;
        directCount++;
      }

      // Method B: Control mask minus either date excluded
      const isBaseExcluded = baseCloud[i] === 1 || baseShadow[i] === 1;
      const isCurExcluded = curCloud[i] === 1 || curShadow[i] === 1;
      if (!isBaseExcluded && !isCurExcluded) {
        commonClearLoop[i] = 1;
        loopCount++;
      }
    }

    if (commonClearDirect[i] !== commonClearLoop[i]) {
      bitMismatch++;
    }
  }

  console.log(`Control Valid Count:                ${controlValidCount.toLocaleString()}`);
  console.log(`Common Clear (Method A - 3-way ∩):  ${directCount.toLocaleString()}`);
  console.log(`Common Clear (Method B - loop):     ${loopCount.toLocaleString()}`);
  console.log(`Bit-for-Bit Identity Mismatches:    ${bitMismatch} (Expected: 0)`);
  console.log(`Identity Verified:                  ${bitMismatch === 0 ? '✅ EXACT IDENTITY CONFIRMED' : '❌ MISMATCH'}`);

  // ─── AUDIT ITEM 3: INDEPENDENT RECALCULATION OF ZONAL NDVI MEANS ───
  console.log('\n--- 3. INDEPENDENT RECALCULATION OF ZONAL NDVI MEANS ---');
  let controlBaseSum = 0;
  let controlCurSum = 0;
  let controlDeltaSum = 0;

  let treatBaseSum = 0;
  let treatCurSum = 0;
  let treatDeltaSum = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] === 1) {
      const b = baseNdvi[i];
      const c = curNdvi[i];
      const d = c - b;
      controlBaseSum += b;
      controlCurSum += c;
      controlDeltaSum += d;
    }
    if (commonClearDirect[i] === 1) {
      const b = baseNdvi[i];
      const c = curNdvi[i];
      const d = c - b;
      treatBaseSum += b;
      treatCurSum += c;
      treatDeltaSum += d;
    }
  }

  const controlBaseMean = controlBaseSum / controlValidCount;
  const controlCurMean = controlCurSum / controlValidCount;
  const controlDeltaMean = controlDeltaSum / controlValidCount;

  const treatBaseMean = treatBaseSum / directCount;
  const treatCurMean = treatCurSum / directCount;
  const treatDeltaMean = treatDeltaSum / directCount;

  console.log('Control Mask Statistics:');
  console.log(`  Baseline Mean NDVI:  ${controlBaseMean.toFixed(8)} (Reported: 0.7618)`);
  console.log(`  Current Mean NDVI:   ${controlCurMean.toFixed(8)} (Reported: 0.7458)`);
  console.log(`  Mean Delta NDVI:     ${controlDeltaMean.toFixed(8)} (Reported: -0.0160)`);
  console.log(`  Arithmetic Balance:  (Cur - Base) = ${(controlCurMean - controlBaseMean).toFixed(8)} vs Mean(Delta) = ${controlDeltaMean.toFixed(8)}`);

  console.log('\nTreatment (Common-Clear) Mask Statistics:');
  console.log(`  Baseline Mean NDVI:  ${treatBaseMean.toFixed(8)} (Reported: 0.7726)`);
  console.log(`  Current Mean NDVI:   ${treatCurMean.toFixed(8)} (Reported: 0.7464)`);
  console.log(`  Mean Delta NDVI:     ${treatDeltaMean.toFixed(8)} (Reported: -0.0262)`);
  console.log(`  Arithmetic Balance:  (Cur - Base) = ${(treatCurMean - treatBaseMean).toFixed(8)} vs Mean(Delta) = ${treatDeltaMean.toFixed(8)}`);

  // ─── AUDIT ITEM 4: RESIDUAL CANDIDATES & DENOMINATOR VERIFICATION ───
  console.log('\n--- 4. RESIDUAL CANDIDATES & DENOMINATOR ANALYSIS ---');
  let residualCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (controlDisturbanceMask[i] === 1 && commonClearDirect[i] === 1) {
      residualCount++;
    }
  }

  console.log(`Original Candidates:             ${controlDisturbanceCount.toLocaleString()}`);
  console.log(`Unique Candidates Excluded:      ${uniqueRemoved.toLocaleString()}`);
  console.log(`Residual Candidates (Diff):      ${(controlDisturbanceCount - uniqueRemoved).toLocaleString()}`);
  console.log(`Residual Candidates (Direct ∩):  ${residualCount.toLocaleString()}`);
  console.log(`Intersection Invariant Match:    ${residualCount === 135489 ? '✅ EXACT 135,489 VERIFIED' : '❌ MISMATCH'}`);

  const pixelAreaHa = 100.0 / 10000.0; // 0.01 ha
  const residualAreaHa = residualCount * pixelAreaHa;

  const pctOverClear = (residualCount / directCount) * 100.0;
  const pctOverTotal = (residualCount / controlValidCount) * 100.0;

  console.log(`\nGround Area & Percentage Analysis:`);
  console.log(`  Residual Ground Area:                     ${residualAreaHa.toFixed(2)} ha (Exact: ${residualAreaHa})`);
  console.log(`  Percentage over Common-Clear Observable:  ${pctOverClear.toFixed(4)}% (Denominator: ${directCount.toLocaleString()} px)`);
  console.log(`  Percentage over Total Control Zone:       ${pctOverTotal.toFixed(4)}% (Denominator: ${controlValidCount.toLocaleString()} px)`);

  await mongoose.disconnect();
  console.log('\nAudit complete.');
  process.exit(0);
}

auditExperiment().catch(console.error);
