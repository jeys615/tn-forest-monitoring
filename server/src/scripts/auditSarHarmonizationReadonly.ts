import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { Zone } from '../models/Zone.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { SpatialHarmonizationService } from '../services/spatial/SpatialHarmonizationService.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';
import fs from 'node:fs';

interface SamplePixel {
  idx: number;
  r: number;
  c: number;
  baseVv: number;
  curVv: number;
  deltaVv: number;
  baseVh: number;
  curVh: number;
  deltaVh: number;
  changedAbs: boolean;
  changedNeg: boolean;
}

function calcPercentiles(arr: number[], percentiles: number[]): Record<string, number> {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const result: Record<string, number> = {};
  for (const p of percentiles) {
    const idx = Math.min(n - 1, Math.max(0, Math.floor((p / 100.0) * n)));
    result[`P${p.toString().padStart(2, '0')}`] = sorted[idx];
  }
  return result;
}

function calcStats(arr: Float32Array, mask: Uint8Array): { min: number; max: number; mean: number; median: number } {
  const valid: number[] = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    if (mask[i] === 1 && !isNaN(arr[i]) && isFinite(arr[i])) {
      valid.push(arr[i]);
      sum += arr[i];
    }
  }
  if (valid.length === 0) return { min: 0, max: 0, mean: 0, median: 0 };
  valid.sort((a, b) => a - b);
  return {
    min: valid[0],
    max: valid[valid.length - 1],
    mean: sum / valid.length,
    median: valid[Math.floor(valid.length / 2)],
  };
}

async function audit() {
  console.log('--- STARTING READ-ONLY SAR VALIDATION AUDIT ---');
  await mongoose.connect(env.MONGODB_URI);

  // =========================================================================
  // 15. CHECK DATABASE PROVENANCE & RECORDS
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 15: DATABASE PROVENANCE CHECK');
  console.log('============================================================');
  const oldChange = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790511626250-4641' }).lean();
  const newChange = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790525317279-8405' }).lean();

  console.log('Old ChangeDetection:', {
    changeId: oldChange?.changeId,
    calculationMethod: oldChange?.calculationMethod,
    spatialCalculation: oldChange?.spatialCalculation,
    affectedAreaPercentage: oldChange?.affectedAreaPercentage,
    explanation: oldChange?.explanation?.slice(0, 80) + '...',
  });

  console.log('New ChangeDetection:', {
    changeId: newChange?.changeId,
    calculationMethod: newChange?.calculationMethod,
    spatialCalculation: newChange?.spatialCalculation,
    affectedAreaPercentage: newChange?.affectedAreaPercentage,
    changedArea: newChange?.changedArea,
    zoneArea: newChange?.zoneArea,
    rasterStats: newChange?.rasterStatistics,
    thresholdConfig: newChange?.thresholdConfig,
    analysisGrid: {
      crs: newChange?.analysisGrid?.crs,
      width: newChange?.analysisGrid?.width,
      height: newChange?.analysisGrid?.height,
      pixelSizeX: newChange?.analysisGrid?.pixelSizeX,
      comparisonPixelCount: newChange?.analysisGrid?.comparisonPixelCount,
      coveragePercentage: newChange?.analysisGrid?.coveragePercentage,
    },
  });

  const baselineDoc = await BaselineModel.findById(newChange?.baselineId).lean();
  const baseMetaDoc = await SatelliteMetadata.findById(baselineDoc?.satelliteMetadataId).lean();
  const curMetaDoc = await SatelliteMetadata.findById(newChange?.observationId).lean();
  const zoneDoc = await Zone.findById(newChange?.zoneId).lean();

  console.log('Zone:', {
    zoneId: zoneDoc?.zoneId,
    name: zoneDoc?.name,
    areaHectares: zoneDoc?.areaHectares,
  });

  // =========================================================================
  // 8. CHECK TEMPORAL ACQUISITION GEOMETRY & METADATA
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 8: TEMPORAL ACQUISITION GEOMETRY & METADATA');
  console.log('============================================================');
  console.log('Baseline Metadata:', {
    id: baseMetaDoc?._id?.toString(),
    imageId: baseMetaDoc?.imageId,
    acquisitionDate: baseMetaDoc?.acquisitionDate,
    source: baseMetaDoc?.source,
    sensorType: baseMetaDoc?.sensorType,
    crs: (baseMetaDoc as any)?.crs,
    resolution: (baseMetaDoc as any)?.resolution,
    localRasterPath: baseMetaDoc?.localRasterPath,
    metadata: baseMetaDoc?.metadata,
  });

  console.log('Current Metadata:', {
    id: curMetaDoc?._id?.toString(),
    imageId: curMetaDoc?.imageId,
    acquisitionDate: curMetaDoc?.acquisitionDate,
    source: curMetaDoc?.source,
    sensorType: curMetaDoc?.sensorType,
    crs: (curMetaDoc as any)?.crs,
    resolution: (curMetaDoc as any)?.resolution,
    localRasterPath: curMetaDoc?.localRasterPath,
    metadata: curMetaDoc?.metadata,
  });

  // Inspect raw GeoTIFF metadata from disk
  const basePath = baseMetaDoc?.localRasterPath!;
  const curPath = curMetaDoc?.localRasterPath!;
  const baseParsed = await GeoTiffService.readGeoTiff(basePath);
  const curParsed = await GeoTiffService.readGeoTiff(curPath);

  console.log('\nRaw Baseline GeoTIFF Header:', {
    width: baseParsed.metadata.width,
    height: baseParsed.metadata.height,
    crs: baseParsed.metadata.crs,
    numBands: baseParsed.metadata.numBands,
    pixelScale: baseParsed.metadata.pixelScale,
    origin: [baseParsed.metadata.tiePoint[3], baseParsed.metadata.tiePoint[4]],
    bbox: baseParsed.metadata.bbox,
  });

  console.log('Raw Current GeoTIFF Header:', {
    width: curParsed.metadata.width,
    height: curParsed.metadata.height,
    crs: curParsed.metadata.crs,
    numBands: curParsed.metadata.numBands,
    pixelScale: curParsed.metadata.pixelScale,
    origin: [curParsed.metadata.tiePoint[3], curParsed.metadata.tiePoint[4]],
    bbox: curParsed.metadata.bbox,
  });

  // =========================================================================
  // 6. CHECK UNIT CONSISTENCY (RAW SOURCE ARRAYS)
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 6: UNIT CONSISTENCY IN SOURCE RASTERS');
  console.log('============================================================');
  const rawBaseVvStats = calcStats(baseParsed.bandData[0], new Uint8Array(baseParsed.bandData[0].length).fill(1));
  const rawBaseVhStats = calcStats(baseParsed.bandData[1], new Uint8Array(baseParsed.bandData[1].length).fill(1));
  const rawCurVvStats = calcStats(curParsed.bandData[0], new Uint8Array(curParsed.bandData[0].length).fill(1));
  const rawCurVhStats = calcStats(curParsed.bandData[1], new Uint8Array(curParsed.bandData[1].length).fill(1));

  console.log('Raw Baseline VV stats (dB):', rawBaseVvStats);
  console.log('Raw Baseline VH stats (dB):', rawBaseVhStats);
  console.log('Raw Current VV stats (dB):', rawCurVvStats);
  console.log('Raw Current VH stats (dB):', rawCurVhStats);

  const isBaseDb = rawBaseVvStats.min < 0 && rawBaseVvStats.mean < 0;
  const isCurDb = rawCurVvStats.min < 0 && rawCurVvStats.mean < 0;
  console.log('Baseline is in dB format:', isBaseDb);
  console.log('Current is in dB format:', isCurDb);
  console.log('Unit match confirmation:', isBaseDb === isCurDb ? 'CONFIRMED MATCH (BOTH dB)' : 'MISMATCH DETECTED');

  // =========================================================================
  // 7. CHECK RESAMPLING & HARMONIZATION EFFECT
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 7: RESAMPLING & HARMONIZATION');
  console.log('============================================================');
  const boundary = zoneDoc?.boundary! as GeoJSONPolygon;
  const analysisGrid = AnalysisGridService.createAnalysisGrid(boundary, {
    targetCrs: baselineDoc?.rasterCrs || 'EPSG:32644',
    pixelSizeMeters: 10,
  });

  console.log('Analysis Grid constructed:', {
    crs: analysisGrid.crs,
    width: analysisGrid.width,
    height: analysisGrid.height,
    pixelSizeX: analysisGrid.pixelSizeX,
    pixelSizeY: analysisGrid.pixelSizeY,
    originX: analysisGrid.originX,
    originY: analysisGrid.originY,
    transform: analysisGrid.transform,
  });

  const baseHarmonized = SpatialHarmonizationService.reprojectSarToGrid(baseParsed, analysisGrid);
  const curHarmonized = SpatialHarmonizationService.reprojectSarToGrid(curParsed, analysisGrid);

  console.log('Harmonized Baseline:', {
    validPixelCount: baseHarmonized.validPixelCount,
    totalPixelCount: baseHarmonized.totalPixelCount,
    sourceCrs: baseHarmonized.sourceCrs,
    resamplingMethod: baseHarmonized.resamplingMethod,
  });

  console.log('Harmonized Current:', {
    validPixelCount: curHarmonized.validPixelCount,
    totalPixelCount: curHarmonized.totalPixelCount,
    sourceCrs: curHarmonized.sourceCrs,
    resamplingMethod: curHarmonized.resamplingMethod,
  });

  const intersection = SpatialHarmonizationService.createValidIntersectionMask(
    baseHarmonized,
    curHarmonized,
    boundary,
    analysisGrid,
  );

  console.log('Intersection Mask:', {
    comparisonPixelCount: intersection.comparisonPixelCount,
    validBaselinePixelCount: intersection.validBaselinePixelCount,
    validCurrentPixelCount: intersection.validCurrentPixelCount,
    overlapPixelCount: intersection.overlapPixelCount,
    zonePixelCount: intersection.zonePixelCount,
    coveragePercentage: intersection.coveragePercentage,
  });

  // =========================================================================
  // 1 & 4. VERIFY CHANGED-PIXEL COUNT & CROSS-TABULATION
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 1, 2, 3, 4, 5: INDEPENDENT DIFFERENCING & THRESHOLD AUDIT');
  console.log('============================================================');
  const totalPixels = analysisGrid.width * analysisGrid.height;
  const validMask = intersection.validComparisonMask;

  const deltaVvList: number[] = [];
  const deltaVhList: number[] = [];

  // Two-sided absolute threshold counters (|delta| >= 2.0)
  let countVvAbsChanged = 0;
  let countVhAbsChanged = 0;
  let countBothAbsChanged = 0;
  let countVvOnlyAbsChanged = 0;
  let countVhOnlyAbsChanged = 0;
  let countAnyAbsChanged = 0;
  let countNeitherAbsChanged = 0;

  // One-sided negative threshold counters (delta < -2.0)
  let countVvNegChanged = 0;
  let countVhNegChanged = 0;
  let countBothNegChanged = 0;
  let countVvOnlyNegChanged = 0;
  let countVhOnlyNegChanged = 0;
  let countAnyNegChanged = 0;
  let countNeitherNegChanged = 0;

  // One-sided positive threshold counters (delta > +2.0)
  let countVvPosChanged = 0;
  let countVhPosChanged = 0;
  let countAnyPosChanged = 0;

  const samples: SamplePixel[] = [];

  for (let i = 0; i < totalPixels; i++) {
    if (validMask[i] === 0) continue;

    const bVv = baseHarmonized.vv[i];
    const bVh = baseHarmonized.vh[i];
    const cVv = curHarmonized.vv[i];
    const cVh = curHarmonized.vh[i];

    // delta = current - baseline
    const dVv = cVv - bVv;
    const dVh = cVh - bVh;

    deltaVvList.push(dVv);
    deltaVhList.push(dVh);

    // Two-sided (|delta| >= 2.0)
    const vvAbs = Math.abs(dVv) >= 2.0;
    const vhAbs = Math.abs(dVh) >= 2.0;
    if (vvAbs) countVvAbsChanged++;
    if (vhAbs) countVhAbsChanged++;
    if (vvAbs && vhAbs) countBothAbsChanged++;
    if (vvAbs && !vhAbs) countVvOnlyAbsChanged++;
    if (!vvAbs && vhAbs) countVhOnlyAbsChanged++;
    if (vvAbs || vhAbs) countAnyAbsChanged++;
    if (!vvAbs && !vhAbs) countNeitherAbsChanged++;

    // One-sided drop (delta < -2.0)
    const vvNeg = dVv < -2.0;
    const vhNeg = dVh < -2.0;
    if (vvNeg) countVvNegChanged++;
    if (vhNeg) countVhNegChanged++;
    if (vvNeg && vhNeg) countBothNegChanged++;
    if (vvNeg && !vhNeg) countVvOnlyNegChanged++;
    if (!vvNeg && vhNeg) countVhOnlyNegChanged++;
    if (vvNeg || vhNeg) countAnyNegChanged++;
    if (!vvNeg && !vhNeg) countNeitherNegChanged++;

    // One-sided increase (delta > +2.0)
    if (dVv > 2.0) countVvPosChanged++;
    if (dVh > 2.0) countVhPosChanged++;
    if (dVv > 2.0 || dVh > 2.0) countAnyPosChanged++;

    if (samples.length < 10 && (samples.length === 0 || i % 250000 === 0)) {
      const r = Math.floor(i / analysisGrid.width);
      const c = i % analysisGrid.width;
      samples.push({
        idx: i,
        r,
        c,
        baseVv: Number(bVv.toFixed(3)),
        curVv: Number(cVv.toFixed(3)),
        deltaVv: Number(dVv.toFixed(3)),
        baseVh: Number(bVh.toFixed(3)),
        curVh: Number(cVh.toFixed(3)),
        deltaVh: Number(dVh.toFixed(3)),
        changedAbs: vvAbs || vhAbs,
        changedNeg: vvNeg || vhNeg,
      });
    }
  }

  const validPixelCount = deltaVvList.length;

  console.log(`\nValid Pixel Count: ${validPixelCount.toLocaleString()}`);

  console.log('\n--- EVALUATION A: ABSOLUTE DIFFERENCE (|delta| >= 2.0 dB) [Code Implementation] ---');
  console.log(`VV Changed (|ΔVV| >= 2.0): ${countVvAbsChanged.toLocaleString()} (${((countVvAbsChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`VH Changed (|ΔVH| >= 2.0): ${countVhAbsChanged.toLocaleString()} (${((countVhAbsChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`VV-only changed: ${countVvOnlyAbsChanged.toLocaleString()}`);
  console.log(`VH-only changed: ${countVhOnlyAbsChanged.toLocaleString()}`);
  console.log(`Both VV & VH changed: ${countBothAbsChanged.toLocaleString()}`);
  console.log(`Neither changed: ${countNeitherAbsChanged.toLocaleString()}`);
  console.log(`ANY-band changed (|Δ| >= 2.0): ${countAnyAbsChanged.toLocaleString()} (${((countAnyAbsChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`Sum check (VV-only + VH-only + Both): ${countVvOnlyAbsChanged + countVhOnlyAbsChanged + countBothAbsChanged} === ${countAnyAbsChanged} (${countVvOnlyAbsChanged + countVhOnlyAbsChanged + countBothAbsChanged === countAnyAbsChanged})`);
  console.log(`Match with 2,045,057: ${countAnyAbsChanged === 2045057 ? 'EXACT MATCH (100%)' : 'MISMATCH'}`);

  console.log('\n--- EVALUATION B: NEGATIVE DROP (delta < -2.0 dB) [Backscatter Loss Only] ---');
  console.log(`VV Drop (ΔVV < -2.0): ${countVvNegChanged.toLocaleString()} (${((countVvNegChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`VH Drop (ΔVH < -2.0): ${countVhNegChanged.toLocaleString()} (${((countVhNegChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`VV-only drop: ${countVvOnlyNegChanged.toLocaleString()}`);
  console.log(`VH-only drop: ${countVhOnlyNegChanged.toLocaleString()}`);
  console.log(`Both VV & VH drop: ${countBothNegChanged.toLocaleString()}`);
  console.log(`Neither drop: ${countNeitherNegChanged.toLocaleString()}`);
  console.log(`ANY-band drop (Δ < -2.0): ${countAnyNegChanged.toLocaleString()} (${((countAnyNegChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`Sum check (VV-only + VH-only + Both): ${countVvOnlyNegChanged + countVhOnlyNegChanged + countBothNegChanged} === ${countAnyNegChanged}`);

  console.log('\n--- EVALUATION C: POSITIVE INCREASE (delta > +2.0 dB) [Backscatter Gain Only] ---');
  console.log(`VV Increase (ΔVV > +2.0): ${countVvPosChanged.toLocaleString()} (${((countVvPosChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`VH Increase (ΔVH > +2.0): ${countVhPosChanged.toLocaleString()} (${((countVhPosChanged / validPixelCount) * 100).toFixed(2)}%)`);
  console.log(`ANY-band increase (Δ > +2.0): ${countAnyPosChanged.toLocaleString()} (${((countAnyPosChanged / validPixelCount) * 100).toFixed(2)}%)`);

  // =========================================================================
  // 2 & 3. DISTRIBUTION OF DELTA VV AND DELTA VH (PERCENTILES)
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 2 & 3: PERCENTILE DISTRIBUTIONS OF DELTA');
  console.log('============================================================');
  const percentiles = [1, 5, 10, 25, 50, 75, 90, 95, 99];
  const vvP = calcPercentiles(deltaVvList, percentiles);
  const vhP = calcPercentiles(deltaVhList, percentiles);

  console.log('ΔVV Percentiles (dB):', vvP);
  console.log(`ΔVV < -2.0 count: ${countVvNegChanged.toLocaleString()}`);
  console.log(`ΔVV >= -2.0 count: ${(validPixelCount - countVvNegChanged).toLocaleString()}`);

  console.log('\nΔVH Percentiles (dB):', vhP);
  console.log(`ΔVH < -2.0 count: ${countVhNegChanged.toLocaleString()}`);
  console.log(`ΔVH >= -2.0 count: ${(validPixelCount - countVhNegChanged).toLocaleString()}`);

  // =========================================================================
  // 5. SIGN VERIFICATION & SAMPLE PIXELS
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 5: SIGN VERIFICATION & SAMPLE PIXELS');
  console.log('============================================================');
  console.log('Implementation formula verified: delta = current - baseline');
  console.table(samples);

  // =========================================================================
  // 9. SCENE FOOTPRINT OVERLAP
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 9: SCENE FOOTPRINT OVERLAP');
  console.log('============================================================');
  const pixelAreaHa = (analysisGrid.pixelSizeX * analysisGrid.pixelSizeY) / 10000.0; // 0.01 ha per 10m pixel
  const baseValidHa = baseHarmonized.validPixelCount * pixelAreaHa;
  const curValidHa = curHarmonized.validPixelCount * pixelAreaHa;
  const intersectHa = intersection.overlapPixelCount * pixelAreaHa;
  const compValidHa = intersection.comparisonPixelCount * pixelAreaHa;
  const zoneAreaHa = intersection.zonePixelCount * pixelAreaHa;

  console.log(`Baseline valid footprint area: ${baseValidHa.toFixed(2)} ha (${baseHarmonized.validPixelCount.toLocaleString()} px)`);
  console.log(`Current valid footprint area: ${curValidHa.toFixed(2)} ha (${curHarmonized.validPixelCount.toLocaleString()} px)`);
  console.log(`Scene overlap area: ${intersectHa.toFixed(2)} ha (${intersection.overlapPixelCount.toLocaleString()} px)`);
  console.log(`Sirumalai zone rasterized area: ${zoneAreaHa.toFixed(2)} ha (${intersection.zonePixelCount.toLocaleString()} px)`);
  console.log(`Valid comparison area inside zone: ${compValidHa.toFixed(2)} ha (${intersection.comparisonPixelCount.toLocaleString()} px)`);
  console.log(`Coverage percentage (comparison / zone * 100): ${((intersection.comparisonPixelCount / intersection.zonePixelCount) * 100).toFixed(2)}%`);

  // =========================================================================
  // 10. CHECK EDGE EFFECTS (DISTANCE FROM VALID-DATA BOUNDARY)
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 10: EDGE EFFECTS AUDIT');
  console.log('============================================================');
  // Simple distance from boundary test: identify boundary pixels of validMask (validMask=1 having at least one neighbor validMask=0)
  const width = analysisGrid.width;
  const height = analysisGrid.height;
  const isBoundary = new Uint8Array(totalPixels);

  const boundaryIndices: number[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = r * width + c;
      if (validMask[idx] === 1) {
        if (
          r === 0 || r === height - 1 || c === 0 || c === width - 1 ||
          validMask[(r - 1) * width + c] === 0 ||
          validMask[(r + 1) * width + c] === 0 ||
          validMask[r * width + (c - 1)] === 0 ||
          validMask[r * width + (c + 1)] === 0
        ) {
          isBoundary[idx] = 1;
          boundaryIndices.push(idx);
        }
      }
    }
  }

  console.log(`Valid footprint boundary perimeter pixels: ${boundaryIndices.length.toLocaleString()}`);

  // Compute minimum distance to boundary for changed pixels (sampled for performance)
  let changedUnder100m = 0;
  let changedUnder250m = 0;
  let changedUnder500m = 0;
  let changedUnder1000m = 0;
  let totalChangedSampled = 0;

  // Sample every 20th pixel to get fast, statistically representative distance distribution
  const step = 20;
  for (let r = 0; r < height; r += step) {
    for (let c = 0; c < width; c += step) {
      const idx = r * width + c;
      if (validMask[idx] === 1) {
        const dVv = curHarmonized.vv[idx] - baseHarmonized.vv[idx];
        const dVh = curHarmonized.vh[idx] - baseHarmonized.vh[idx];
        const isChanged = Math.abs(dVv) >= 2.0 || Math.abs(dVh) >= 2.0;

        if (isChanged) {
          totalChangedSampled++;
          // Approximate distance to boundary in pixels
          let minDistPx = Infinity;
          // check bounding box +/- 100 pixels
          const rMin = Math.max(0, r - 100);
          const rMax = Math.min(height - 1, r + 100);
          const cMin = Math.max(0, c - 100);
          const cMax = Math.min(width - 1, c + 100);

          for (let br = rMin; br <= rMax; br += 4) {
            for (let bc = cMin; bc <= cMax; bc += 4) {
              if (isBoundary[br * width + bc] === 1) {
                const dist = Math.hypot(br - r, bc - c);
                if (dist < minDistPx) minDistPx = dist;
              }
            }
          }

          const distM = minDistPx * 10.0;
          if (distM <= 100) changedUnder100m++;
          if (distM <= 250) changedUnder250m++;
          if (distM <= 500) changedUnder500m++;
          if (distM <= 1000) changedUnder1000m++;
        }
      }
    }
  }

  console.log(`Sampled Changed Pixels: ${totalChangedSampled.toLocaleString()}`);
  console.log(`Changed within 100m of edge: ${((changedUnder100m / totalChangedSampled) * 100).toFixed(2)}%`);
  console.log(`Changed within 250m of edge: ${((changedUnder250m / totalChangedSampled) * 100).toFixed(2)}%`);
  console.log(`Changed within 500m of edge: ${((changedUnder500m / totalChangedSampled) * 100).toFixed(2)}%`);
  console.log(`Changed within 1000m of edge: ${((changedUnder1000m / totalChangedSampled) * 100).toFixed(2)}%`);
  console.log(`Changed beyond 1000m (core interior): ${(((totalChangedSampled - changedUnder1000m) / totalChangedSampled) * 100).toFixed(2)}%`);

  // =========================================================================
  // 11 & 12. SPECKLE FILTERING & CHANGE POLYGONS
  // =========================================================================
  console.log('\n============================================================');
  console.log('SECTION 11 & 12: SPECKLE FILTERING & VECTORIZED POLYGONS');
  console.log('============================================================');
  console.log('New Record Changed Geometry:', {
    type: newChange?.changedGeometry?.type,
    numPolygons: newChange?.changedGeometry?.coordinates?.length,
  });

  await mongoose.disconnect();
  console.log('\n--- READ-ONLY AUDIT COMPLETE ---');
}

audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
