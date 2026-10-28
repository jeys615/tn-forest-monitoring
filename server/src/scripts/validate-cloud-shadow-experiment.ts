/**
 * Non-Destructive Cloud & Shadow Mask Validation Experiment
 * Target: Change Detection Record CHG-1791696357291-3501 (Sirumalai ZONE-261011-6340)
 *
 * Evaluates the impact of multi-spectral cloud and shadow screening on:
 * 1. Valid comparison pixel count
 * 2. Zonal NDVI statistics (Baseline, Current, Delta)
 * 3. Flagged disturbance candidate count (dNDVI <= -0.15)
 * 4. Overlap analysis: original candidates removed due to atmospheric contamination
 *
 * READ-ONLY EXPERIMENT: ZERO MUTATIONS TO MONGODB OR LOCAL FILES.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { OpticalSpatialHarmonizationService } from '../services/spatial/OpticalSpatialHarmonizationService.js';
import { OpticalPixelIndexService } from '../services/spatial/OpticalPixelIndexService.js';
import {
  OpticalPixelChangeDetector,
  DEFAULT_OPTICAL_THRESHOLD_CONFIG,
} from '../services/changeDetection/OpticalPixelChangeDetector.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

interface SpectralQualityThresholds {
  cloudBlueReflectance: number;     // e.g. 0.20 (DN 2000)
  cloudRedReflectance: number;      // e.g. 0.15 (DN 1500)
  shadowNirReflectance: number;     // e.g. 0.10 (DN 1000)
  shadowSwirReflectance: number;    // e.g. 0.08 (DN 800)
  shadowRedReflectance: number;     // e.g. 0.06 (DN 600)
}

const DEFAULT_THRESHOLDS: SpectralQualityThresholds = {
  cloudBlueReflectance: 0.20,
  cloudRedReflectance: 0.15,
  shadowNirReflectance: 0.10,
  shadowSwirReflectance: 0.08,
  shadowRedReflectance: 0.06,
};

async function runCloudShadowExperiment() {
  console.log('================================================================');
  console.log('🔬 NON-DESTRUCTIVE CLOUD & SHADOW MASK VALIDATION EXPERIMENT');
  console.log('Target Case: CHG-1791696357291-3501 (Sirumalai ZONE-261011-6340)');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // 1. Load records read-only
  const persistedChange = await ChangeDetectionModel.findOne({ changeId: 'CHG-1791696357291-3501' }).lean();
  if (!persistedChange) throw new Error('Change record not found in MongoDB');
  const zone = await Zone.findById(persistedChange.zoneId).lean();
  if (!zone) throw new Error(`Zone ${persistedChange.zoneId} not found in MongoDB`);

  const baseMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange.baselineId }, { _id: '6acb1b449ee540ec5f705ee2' }, { imageId: /20200109/ }],
  }).lean();
  const curMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange.observationId }, { _id: '6acb1cad9ee540ec5f705fac' }, { imageId: /20240207/ }],
  }).lean();

  if (!baseMeta || !curMeta) throw new Error('Baseline or Current SatelliteMetadata document not found');

  const basePath = baseMeta.localRasterPath || '';
  const curPath = curMeta.localRasterPath || '';

  const baseParsed = await GeoTiffService.readGeoTiff(basePath);
  const curParsed = await GeoTiffService.readGeoTiff(curPath);

  const boundary = zone.boundary as GeoJSONPolygon;
  const targetGrid = AnalysisGridService.createAnalysisGrid(boundary, {
    targetCrs: 'EPSG:32643',
    pixelSizeMeters: 10,
  });

  const totalPixels = targetGrid.width * targetGrid.height;

  // 2. Reproject both rasters with bilinear interpolation on continuous reflectance bands
  const baseHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(baseParsed, targetGrid, {
    satellite: 'Sentinel-2',
  });
  const curHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(curParsed, targetGrid, {
    satellite: 'Sentinel-2',
  });

  // 3. Establish Control: Unmasked Valid Comparison Mask
  const intersection = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(
    baseHarm,
    curHarm,
    boundary,
    targetGrid,
  );
  const controlMask = intersection.validComparisonMask;
  const controlValidCount = intersection.comparisonPixelCount;

  // 4. Compute Control Indices & Change Detection
  const baseIndices = OpticalPixelIndexService.calculatePixelIndices(baseHarm, controlMask);
  const curIndices = OpticalPixelIndexService.calculatePixelIndices(curHarm, controlMask);

  const realZoneAreaHectares = (intersection.zonePixelCount * 100.0) / 10000.0;
  const controlDetection = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices: baseIndices.indices,
    currentIndices: curIndices.indices,
    validMask: controlMask,
    grid: targetGrid,
    zoneAreaHectares: realZoneAreaHectares,
    thresholdConfig: DEFAULT_OPTICAL_THRESHOLD_CONFIG,
    baselineSensor: 'Sentinel-2',
    currentSensor: 'Sentinel-2',
  });

  const controlChangedCount = controlDetection.spatialResult.changedPixels ?? 0;
  const controlChangedMask = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] === 1 && curIndices.indices.ndvi[i] - baseIndices.indices.ndvi[i] <= -0.15) {
      controlChangedMask[i] = 1;
    }
  }

  console.log('--- 1. EXPERIMENTAL CONTROL (UNMASKED BASELINE) ---');
  console.log(`Valid Comparison Pixels:       ${controlValidCount.toLocaleString()} pixels (${(controlValidCount * 100 / 10000).toFixed(2)} ha)`);
  console.log(`Baseline Mean NDVI:            ${baseIndices.summary.ndviMean.toFixed(4)}`);
  console.log(`Current Mean NDVI:             ${curIndices.summary.ndviMean.toFixed(4)}`);
  console.log(`Mean Delta NDVI:               ${controlDetection.rasterStatistics.meanDeltaNdvi.toFixed(4)}`);
  console.log(`Flagged Candidates (d <= -0.15): ${controlChangedCount.toLocaleString()} pixels (${(controlChangedCount * 100 / 10000).toFixed(2)} ha, ${controlDetection.spatialResult.affectedAreaPercentage?.toFixed(4)}%)\n`);

  // 5. Implement Local Multi-Spectral Cloud & Shadow Screening
  // Reflectance values are DN * 0.0001
  const baseBlue = baseHarm.blue;
  const baseRed = baseHarm.red;
  const baseNir = baseHarm.nir;
  const baseSwir1 = baseHarm.swir1;

  const curBlue = curHarm.blue;
  const curRed = curHarm.red;
  const curNir = curHarm.nir;
  const curSwir1 = curHarm.swir1;

  if (!baseSwir1 || !curSwir1) {
    throw new Error('SWIR1 band is required for spectral cloud/shadow screening but is missing');
  }

  const baseCloudMask = new Uint8Array(totalPixels);
  const baseShadowMask = new Uint8Array(totalPixels);
  const curCloudMask = new Uint8Array(totalPixels);
  const curShadowMask = new Uint8Array(totalPixels);

  let baseCloudOnly = 0, baseShadowOnly = 0, baseCloudAndShadow = 0;
  let curCloudOnly = 0, curShadowOnly = 0, curCloudAndShadow = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] !== 1) continue;

    // Baseline reflectance (DN * 0.0001)
    const bB = Math.max(0, baseBlue[i] * 0.0001);
    const bR = Math.max(0, baseRed[i] * 0.0001);
    const bN = Math.max(0, baseNir[i] * 0.0001);
    const bS = Math.max(0, baseSwir1[i] * 0.0001);

    const bIsCloud = bB > DEFAULT_THRESHOLDS.cloudBlueReflectance && bR > DEFAULT_THRESHOLDS.cloudRedReflectance;
    const bIsShadow = bN < DEFAULT_THRESHOLDS.shadowNirReflectance && bS < DEFAULT_THRESHOLDS.shadowSwirReflectance && bR < DEFAULT_THRESHOLDS.shadowRedReflectance;

    if (bIsCloud) baseCloudMask[i] = 1;
    if (bIsShadow) baseShadowMask[i] = 1;

    if (bIsCloud && bIsShadow) baseCloudAndShadow++;
    else if (bIsCloud) baseCloudOnly++;
    else if (bIsShadow) baseShadowOnly++;

    // Current reflectance (DN * 0.0001)
    const cB = Math.max(0, curBlue[i] * 0.0001);
    const cR = Math.max(0, curRed[i] * 0.0001);
    const cN = Math.max(0, curNir[i] * 0.0001);
    const cS = Math.max(0, curSwir1[i] * 0.0001);

    const cIsCloud = cB > DEFAULT_THRESHOLDS.cloudBlueReflectance && cR > DEFAULT_THRESHOLDS.cloudRedReflectance;
    const cIsShadow = cN < DEFAULT_THRESHOLDS.shadowNirReflectance && cS < DEFAULT_THRESHOLDS.shadowSwirReflectance && cR < DEFAULT_THRESHOLDS.shadowRedReflectance;

    if (cIsCloud) curCloudMask[i] = 1;
    if (cIsShadow) curShadowMask[i] = 1;

    if (cIsCloud && cIsShadow) curCloudAndShadow++;
    else if (cIsCloud) curCloudOnly++;
    else if (cIsShadow) curShadowOnly++;
  }

  const baseTotalExcluded = baseCloudOnly + baseShadowOnly + baseCloudAndShadow;
  const curTotalExcluded = curCloudOnly + curShadowOnly + curCloudAndShadow;

  console.log('--- 2. DATE-SPECIFIC CLOUD & SHADOW EXCLUSIONS ---');
  console.log(`Baseline (2020-01-09) Exclusions:`);
  console.log(`  Cloud-only Pixels:           ${baseCloudOnly.toLocaleString()} (${(baseCloudOnly * 100 / 10000).toFixed(2)} ha)`);
  console.log(`  Shadow-only Pixels:          ${baseShadowOnly.toLocaleString()} (${(baseShadowOnly * 100 / 10000).toFixed(2)} ha)`);
  console.log(`  Overlapping Cloud & Shadow:  ${baseCloudAndShadow.toLocaleString()} (${(baseCloudAndShadow * 100 / 10000).toFixed(2)} ha)`);
  console.log(`  Total Baseline Excluded:     ${baseTotalExcluded.toLocaleString()} pixels (${(baseTotalExcluded * 100 / 10000).toFixed(2)} ha, ${((baseTotalExcluded / controlValidCount) * 100).toFixed(4)}% of control)\n`);

  console.log(`Current (2024-02-07) Exclusions:`);
  console.log(`  Cloud-only Pixels:           ${curCloudOnly.toLocaleString()} (${(curCloudOnly * 100 / 10000).toFixed(2)} ha)`);
  console.log(`  Shadow-only Pixels:          ${curShadowOnly.toLocaleString()} (${(curShadowOnly * 100 / 10000).toFixed(2)} ha)`);
  console.log(`  Overlapping Cloud & Shadow:  ${curCloudAndShadow.toLocaleString()} (${(curCloudAndShadow * 100 / 10000).toFixed(2)} ha)`);
  console.log(`  Total Current Excluded:      ${curTotalExcluded.toLocaleString()} pixels (${(curTotalExcluded * 100 / 10000).toFixed(2)} ha, ${((curTotalExcluded / controlValidCount) * 100).toFixed(4)}% of control)\n`);

  // 6. Temporal Intersection: Common Clear Valid Mask
  const treatmentMask = new Uint8Array(totalPixels);
  let treatmentValidCount = 0;
  let excludedEitherDate = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] !== 1) continue;
    const isBaseExcluded = baseCloudMask[i] === 1 || baseShadowMask[i] === 1;
    const isCurExcluded = curCloudMask[i] === 1 || curShadowMask[i] === 1;

    if (isBaseExcluded || isCurExcluded) {
      excludedEitherDate++;
    } else {
      treatmentMask[i] = 1;
      treatmentValidCount++;
    }
  }

  console.log('--- 3. MULTI-TEMPORAL COMMON CLEAR VALID MASK (TREATMENT) ---');
  console.log(`Common Clear Valid Pixels:     ${treatmentValidCount.toLocaleString()} pixels (${(treatmentValidCount * 100 / 10000).toFixed(2)} ha)`);
  console.log(`Total Excluded (Either Date):  ${excludedEitherDate.toLocaleString()} pixels (${(excludedEitherDate * 100 / 10000).toFixed(2)} ha, ${((excludedEitherDate / controlValidCount) * 100).toFixed(4)}% reduction)\n`);

  // 7. Compute Treatment Spectral NDVI Statistics
  let treatBaseSum = 0, treatCurSum = 0, treatDeltaSum = 0;
  let treatFlaggedCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (treatmentMask[i] !== 1) continue;
    const bN = baseIndices.indices.ndvi[i];
    const cN = curIndices.indices.ndvi[i];
    const dN = cN - bN;
    treatBaseSum += bN;
    treatCurSum += cN;
    treatDeltaSum += dN;
    if (dN <= -0.15) {
      treatFlaggedCount++;
    }
  }

  const treatBaseMean = treatBaseSum / treatmentValidCount;
  const treatCurMean = treatCurSum / treatmentValidCount;
  const treatDeltaMean = treatDeltaSum / treatmentValidCount;
  const treatChangedAreaHa = (treatFlaggedCount * 100.0) / 10000.0;
  const treatAffectedPct = (treatFlaggedCount / treatmentValidCount) * 100.0;

  console.log('--- 4. SPECTRAL NDVI & DISTURBANCE COMPARISON ---');
  console.log(`Metric                         | Control (Unmasked)       | Treatment (Cloud/Shadow Screened) | Delta`);
  console.log(`---------------------------------------------------------------------------------------------------------`);
  console.log(`Valid Comparison Pixels        | ${controlValidCount.toLocaleString().padEnd(24)} | ${treatmentValidCount.toLocaleString().padEnd(33)} | -${excludedEitherDate.toLocaleString()} (-${((excludedEitherDate / controlValidCount) * 100).toFixed(4)}%)`);
  console.log(`Baseline Mean NDVI             | ${baseIndices.summary.ndviMean.toFixed(4).padEnd(24)} | ${treatBaseMean.toFixed(4).padEnd(33)} | ${(treatBaseMean - baseIndices.summary.ndviMean > 0 ? '+' : '') + (treatBaseMean - baseIndices.summary.ndviMean).toFixed(4)}`);
  console.log(`Current Mean NDVI              | ${curIndices.summary.ndviMean.toFixed(4).padEnd(24)} | ${treatCurMean.toFixed(4).padEnd(33)} | ${(treatCurMean - curIndices.summary.ndviMean > 0 ? '+' : '') + (treatCurMean - curIndices.summary.ndviMean).toFixed(4)}`);
  console.log(`Mean Delta NDVI                | ${controlDetection.rasterStatistics.meanDeltaNdvi.toFixed(4).padEnd(24)} | ${treatDeltaMean.toFixed(4).padEnd(33)} | ${(treatDeltaMean - controlDetection.rasterStatistics.meanDeltaNdvi > 0 ? '+' : '') + (treatDeltaMean - controlDetection.rasterStatistics.meanDeltaNdvi).toFixed(4)}`);
  console.log(`Flagged Candidates (d<=-0.15)  | ${controlChangedCount.toLocaleString().padEnd(24)} | ${treatFlaggedCount.toLocaleString().padEnd(33)} | -${(controlChangedCount - treatFlaggedCount).toLocaleString()} (-${(((controlChangedCount - treatFlaggedCount) / controlChangedCount) * 100).toFixed(4)}%)`);
  console.log(`Changed Ground Area (ha)       | ${(controlChangedCount * 100 / 10000).toFixed(2).padEnd(24)} | ${treatChangedAreaHa.toFixed(2).padEnd(33)} | -${((controlChangedCount - treatFlaggedCount) * 100 / 10000).toFixed(2)} ha`);
  console.log(`Affected Area Percentage       | ${(controlDetection.spatialResult.affectedAreaPercentage?.toFixed(4) + '%').padEnd(24)} | ${(treatAffectedPct.toFixed(4) + '%').padEnd(33)} | ${(treatAffectedPct - (controlDetection.spatialResult.affectedAreaPercentage ?? 0)).toFixed(4)}%`);
  console.log(`---------------------------------------------------------------------------------------------------------\n`);

  // 8. Overlap Analysis with Original 136,706 Disturbance Mask
  let removedByBaseCloud = 0, removedByBaseShadow = 0;
  let removedByCurCloud = 0, removedByCurShadow = 0;
  let removedByAnyMask = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (controlChangedMask[i] !== 1) continue;

    const bC = baseCloudMask[i] === 1;
    const bS = baseShadowMask[i] === 1;
    const cC = curCloudMask[i] === 1;
    const cS = curShadowMask[i] === 1;

    if (bC) removedByBaseCloud++;
    if (bS) removedByBaseShadow++;
    if (cC) removedByCurCloud++;
    if (cS) removedByCurShadow++;

    if (bC || bS || cC || cS) {
      removedByAnyMask++;
    }
  }

  const residualCandidates = controlChangedCount - removedByAnyMask;

  console.log('--- 5. OVERLAP & CONTAMINATION ANALYSIS ---');
  console.log(`Original Flagged Disturbance Candidates (Control): ${controlChangedCount.toLocaleString()} pixels`);
  console.log(`Flagged Pixels Masked by Baseline Cloud:           ${removedByBaseCloud.toLocaleString()} pixels`);
  console.log(`Flagged Pixels Masked by Baseline Shadow:          ${removedByBaseShadow.toLocaleString()} pixels`);
  console.log(`Flagged Pixels Masked by Current Cloud:            ${removedByCurCloud.toLocaleString()} pixels`);
  console.log(`Flagged Pixels Masked by Current Shadow:           ${removedByCurShadow.toLocaleString()} pixels`);
  console.log(`Total Flagged Pixels Eliminated as Atmospheric:    ${removedByAnyMask.toLocaleString()} pixels (${((removedByAnyMask / controlChangedCount) * 100).toFixed(4)}% of control candidates)`);
  console.log(`Residual Genuine Canopy Disturbance Candidates:    ${residualCandidates.toLocaleString()} pixels (${(residualCandidates * 100 / 10000).toFixed(2)} ha, ${((residualCandidates / treatmentValidCount) * 100).toFixed(4)}% of clear area)\n`);

  await mongoose.disconnect();
  console.log('================================================================');
  console.log('✅ CLOUD/SHADOW EXPERIMENT COMPLETE (Zero database mutations)');
  console.log('================================================================');
  process.exit(0);
}

runCloudShadowExperiment().catch(async (err) => {
  console.error('Experiment failed:', err);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
  process.exit(1);
});
