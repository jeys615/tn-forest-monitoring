import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { OpticalSpatialHarmonizationService } from '../services/spatial/OpticalSpatialHarmonizationService.js';
import { OpticalPixelIndexService } from '../services/spatial/OpticalPixelIndexService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function findThresholdPixels() {
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

  const basePath = baseMeta.localRasterPath || '';
  const curPath = curMeta.localRasterPath || '';

  const baseParsed = await GeoTiffService.readGeoTiff(basePath);
  const curParsed = await GeoTiffService.readGeoTiff(curPath);

  const boundary = zone.boundary as GeoJSONPolygon;
  const targetGrid = AnalysisGridService.createAnalysisGrid(boundary, {
    targetCrs: 'EPSG:32643',
    pixelSizeMeters: 10,
  });

  const baseHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(baseParsed, targetGrid, {
    satellite: baseMeta.source,
  });
  const curHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(curParsed, targetGrid, {
    satellite: curMeta.source,
  });

  const intersection = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(
    baseHarm,
    curHarm,
    boundary,
    targetGrid,
  );

  const baseIndices = OpticalPixelIndexService.calculatePixelIndices(baseHarm, intersection.validComparisonMask);
  const curIndices = OpticalPixelIndexService.calculatePixelIndices(curHarm, intersection.validComparisonMask);

  const baseNdvi = baseIndices.indices.ndvi;
  const curNdvi = curIndices.indices.ndvi;
  const mask = intersection.validComparisonMask;

  const totalPixels = targetGrid.width * targetGrid.height;
  console.log(`Total grid pixels: ${totalPixels}, Valid comparison pixels: ${intersection.comparisonPixelCount}`);

  // Let's analyze deltaNdvi distribution right at the threshold -0.15
  // Specifically: pixels where dNdvi is between -0.1501 and -0.1499
  const nearThreshold: Array<{
    index: number;
    col: number;
    row: number;
    utmX: number;
    utmY: number;
    baseNdvi: number;
    curNdvi: number;
    deltaNdvi: number;
    diffFromThreshold: number;
    isLoss: boolean;
  }> = [];

  let countLoss = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (mask[i] !== 1) continue;

    const b = baseNdvi[i];
    const c = curNdvi[i];
    const d = c - b;

    if (d <= -0.15) {
      countLoss++;
    }

    const diff = d - (-0.15); // if <= 0, it's loss. if > 0, it's stable.
    if (Math.abs(diff) < 0.0005) {
      const col = i % targetGrid.width;
      const row = Math.floor(i / targetGrid.width);
      const utmX = targetGrid.originX + (col + 0.5) * targetGrid.pixelSizeX;
      const utmY = targetGrid.originY - (row + 0.5) * targetGrid.pixelSizeY;

      nearThreshold.push({
        index: i,
        col,
        row,
        utmX,
        utmY,
        baseNdvi: b,
        curNdvi: c,
        deltaNdvi: d,
        diffFromThreshold: diff,
        isLoss: d <= -0.15,
      });
    }
  }

  console.log(`Local Changed Pixels (d <= -0.15): ${countLoss}`);
  console.log(`Found ${nearThreshold.length} pixels within |d - (-0.15)| < 0.0005:`);

  // Sort by absolute distance to -0.15
  nearThreshold.sort((a, b) => Math.abs(a.diffFromThreshold) - Math.abs(b.diffFromThreshold));

  console.log('\nClosest 20 pixels to threshold -0.15:');
  for (let k = 0; k < Math.min(20, nearThreshold.length); k++) {
    const p = nearThreshold[k];
    console.log(
      `#${k + 1}: col=${p.col}, row=${p.row}, UTM=[${p.utmX.toFixed(1)}, ${p.utmY.toFixed(1)}], BaseNDVI=${p.baseNdvi.toFixed(6)}, CurNDVI=${p.curNdvi.toFixed(6)}, DeltaNDVI=${p.deltaNdvi.toFixed(8)}, DistFromThreshold=${p.diffFromThreshold > 0 ? '+' : ''}${p.diffFromThreshold.toExponential(4)}, Loss=${p.isLoss}`
    );
  }

  // Look specifically at the first few pixels that just barely missed the threshold (diff > 0)
  const borderlineMissed = nearThreshold.filter((p) => p.diffFromThreshold > 0);
  console.log(`\nBorderline MISSED (delta > -0.15, closest 5):`);
  for (let k = 0; k < Math.min(5, borderlineMissed.length); k++) {
    const p = borderlineMissed[k];
    console.log(
      `Missed #${k + 1}: col=${p.col}, row=${p.row}, UTM=[${p.utmX.toFixed(1)}, ${p.utmY.toFixed(1)}], BaseNDVI=${p.baseNdvi.toFixed(6)}, CurNDVI=${p.curNdvi.toFixed(6)}, DeltaNDVI=${p.deltaNdvi.toFixed(8)}, Dist=${p.diffFromThreshold.toExponential(4)}`
    );
  }

  // Look specifically at the first few pixels that just barely made the threshold (diff <= 0)
  const borderlineMade = nearThreshold.filter((p) => p.diffFromThreshold <= 0);
  console.log(`\nBorderline MADE (delta <= -0.15, closest 5):`);
  for (let k = 0; k < Math.min(5, borderlineMade.length); k++) {
    const p = borderlineMade[k];
    console.log(
      `Made #${k + 1}: col=${p.col}, row=${p.row}, UTM=[${p.utmX.toFixed(1)}, ${p.utmY.toFixed(1)}], BaseNDVI=${p.baseNdvi.toFixed(6)}, CurNDVI=${p.curNdvi.toFixed(6)}, DeltaNDVI=${p.deltaNdvi.toFixed(8)}, Dist=${p.diffFromThreshold.toExponential(4)}`
    );
  }

  await mongoose.disconnect();
}

findThresholdPixels().catch((e) => {
  console.error(e);
  process.exit(1);
});
