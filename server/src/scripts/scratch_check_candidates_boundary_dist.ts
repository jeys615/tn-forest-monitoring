/**
 * Check minimum distance from any disturbance candidate to the reserve boundary.
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
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function checkCandidatesBoundaryDistance() {
  await mongoose.connect(env.MONGODB_URI);

  const persistedChange = await ChangeDetectionModel.findOne({ changeId: 'CHG-1791696357291-3501' }).lean();
  const zone = await Zone.findById(persistedChange!.zoneId).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

  const baseMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange!.baselineId }, { _id: '6acb1b449ee540ec5f705ee2' }, { imageId: /20200109/ }],
  }).lean();
  const curMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange!.observationId }, { _id: '6acb1cad9ee540ec5f705fac' }, { imageId: /20240207/ }],
  }).lean();

  const baseParsed = await GeoTiffService.readGeoTiff(baseMeta!.localRasterPath || '');
  const curParsed = await GeoTiffService.readGeoTiff(curMeta!.localRasterPath || '');

  const grid = AnalysisGridService.createAnalysisGrid(boundary, {
    targetCrs: 'EPSG:32643',
    pixelSizeMeters: 10,
  });

  const baseHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(baseParsed, grid, { satellite: 'Sentinel-2' });
  const curHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(curParsed, grid, { satellite: 'Sentinel-2' });

  const intersection = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(baseHarm, curHarm, boundary, grid);
  const controlMask = intersection.validComparisonMask;

  const baseIndices = OpticalPixelIndexService.calculatePixelIndices(baseHarm, controlMask);
  const curIndices = OpticalPixelIndexService.calculatePixelIndices(curHarm, controlMask);
  const baseNdvi = baseIndices.indices.ndvi;
  const curNdvi = curIndices.indices.ndvi;

  const ringWgs = boundary.coordinates[0];
  const ringUtm = ringWgs.map(([lon, lat]) => CrsTransformService.transformCoordinate([lon, lat], 'EPSG:4326', 'EPSG:32643'));

  function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function minDistanceToPolygon(px: number, py: number): number {
    let minDist = Infinity;
    for (let i = 0; i < ringUtm.length - 1; i++) {
      const d = pointToSegmentDistance(px, py, ringUtm[i][0], ringUtm[i][1], ringUtm[i + 1][0], ringUtm[i + 1][1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  let minCandidateDistance = Infinity;
  let candidateCount = 0;
  const w = grid.width;
  const h = grid.height;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const idx = r * w + c;
      if (controlMask[idx] === 1 && curNdvi[idx] - baseNdvi[idx] <= -0.15) {
        candidateCount++;
        // Check edge distance for first 1000 candidates or whenever small
        const x = grid.originX + (c + 0.5) * grid.pixelSizeX;
        const y = grid.originY - (r + 0.5) * grid.pixelSizeY;
        const d = minDistanceToPolygon(x, y);
        if (d < minCandidateDistance) {
          minCandidateDistance = d;
        }
      }
    }
  }

  console.log(`Evaluated ${candidateCount.toLocaleString()} candidates.`);
  console.log(`Minimum distance from ANY candidate pixel to reserve boundary: ${minCandidateDistance.toFixed(2)} meters`);

  await mongoose.disconnect();
}

checkCandidatesBoundaryDistance().catch(console.error);
