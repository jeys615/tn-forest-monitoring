/**
 * Exact Candidate Mask & Boundary Distance Audit
 * Monitored Zone: Sirumalai (ZONE-261011-6340)
 *
 * READ-ONLY: ZERO mutations to database, baselines, alerts, or monitoring jobs.
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

async function auditCandidateMaskAndBoundary() {
  console.log('================================================================');
  console.log('🔬 EXACT AUDIT OF THE CANONICAL 135,489 CANDIDATE SET & BOUNDARY');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const persistedChange = await ChangeDetectionModel.findOne({ changeId: 'CHG-1791696357291-3501' }).lean();
  if (!persistedChange) throw new Error('Change detection record not found');
  const zone = await Zone.findById(persistedChange.zoneId).lean();
  if (!zone) throw new Error('Zone not found');
  const boundary = zone.boundary as GeoJSONPolygon;

  const baseMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange.baselineId }, { _id: '6acb1b449ee540ec5f705ee2' }, { imageId: /20200109/ }],
  }).lean();
  const curMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: persistedChange.observationId }, { _id: '6acb1cad9ee540ec5f705fac' }, { imageId: /20240207/ }],
  }).lean();

  if (!baseMeta || !curMeta) throw new Error('Metadata not found');

  const baseParsed = await GeoTiffService.readGeoTiff(baseMeta.localRasterPath || '');
  const curParsed = await GeoTiffService.readGeoTiff(curMeta.localRasterPath || '');

  const grid = AnalysisGridService.createAnalysisGrid(boundary, {
    targetCrs: 'EPSG:32643',
    pixelSizeMeters: 10,
  });

  const totalPixels = grid.width * grid.height;

  // Harmonize rasters
  const baseHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(baseParsed, grid, { satellite: 'Sentinel-2' });
  const curHarm = OpticalSpatialHarmonizationService.reprojectOpticalToGrid(curParsed, grid, { satellite: 'Sentinel-2' });

  const intersection = OpticalSpatialHarmonizationService.createValidOpticalIntersectionMask(baseHarm, curHarm, boundary, grid);
  const controlMask = intersection.validComparisonMask;
  const controlValidCount = intersection.comparisonPixelCount;

  const baseIndices = OpticalPixelIndexService.calculatePixelIndices(baseHarm, controlMask);
  const curIndices = OpticalPixelIndexService.calculatePixelIndices(curHarm, controlMask);
  const baseNdvi = baseIndices.indices.ndvi;
  const curNdvi = curIndices.indices.ndvi;

  // 1. Control disturbance candidates (d <= -0.15)
  const controlDisturbanceMask = new Uint8Array(totalPixels);
  let controlDisturbanceCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (controlMask[i] === 1 && curNdvi[i] - baseNdvi[i] <= -0.15) {
      controlDisturbanceMask[i] = 1;
      controlDisturbanceCount++;
    }
  }

  // 2. Multi-spectral screening masks
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

  // 3. Establish canonical candidate mask (135,489)
  const canonicalCandidateMask = new Uint8Array(totalPixels);
  const canonicalCandidatesList: { idx: number; r: number; c: number; x: number; y: number; baseNdvi: number; curNdvi: number; dNdvi: number }[] = [];

  const w = grid.width;
  const h = grid.height;

  for (let i = 0; i < totalPixels; i++) {
    if (controlDisturbanceMask[i] === 1) {
      const isScreened = baseCloud[i] === 1 || baseShadow[i] === 1 || curCloud[i] === 1 || curShadow[i] === 1;
      if (!isScreened) {
        canonicalCandidateMask[i] = 1;
        const r = Math.floor(i / w);
        const c = i % w;
        const x = grid.originX + (c + 0.5) * grid.pixelSizeX;
        const y = grid.originY - (r + 0.5) * grid.pixelSizeY;
        canonicalCandidatesList.push({
          idx: i,
          r,
          c,
          x,
          y,
          baseNdvi: baseNdvi[i],
          curNdvi: curNdvi[i],
          dNdvi: curNdvi[i] - baseNdvi[i],
        });
      }
    }
  }

  console.log(`Canonical Candidate Mask Count: ${canonicalCandidatesList.length.toLocaleString()} px (Expected: 135,489)`);
  console.log(`Match Status: ${canonicalCandidatesList.length === 135489 ? '✅ EXACT 135,489 MATCH' : '❌ MISMATCH'}`);

  // 4. Polygon Boundary Distance Audit for Candidates
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

  let countWithin1m = 0;
  let countWithin10m = 0;
  let countWithin30m = 0;
  let countWithin100m = 0;
  let countOver100m = 0;

  const candidateDistances: { cand: typeof canonicalCandidatesList[0]; dist: number }[] = [];

  for (const cand of canonicalCandidatesList) {
    const dist = minDistanceToPolygon(cand.x, cand.y);
    candidateDistances.push({ cand, dist });

    if (dist <= 1.0) countWithin1m++;
    if (dist <= 10.0) countWithin10m++;
    if (dist <= 30.0) countWithin30m++;
    if (dist <= 100.0) countWithin100m++;
    if (dist > 100.0) countOver100m++;
  }

  candidateDistances.sort((a, b) => a.dist - b.dist);

  console.log('\n--- CANDIDATE DISTANCE DISTRIBUTION TO ZONE POLYGON BOUNDARY ---');
  console.log(`Within 1 m:    ${countWithin1m.toLocaleString()} px (${(countWithin1m * 0.01).toFixed(2)} ha, ${((countWithin1m / 135489) * 100).toFixed(4)}%)`);
  console.log(`Within 10 m:   ${countWithin10m.toLocaleString()} px (${(countWithin10m * 0.01).toFixed(2)} ha, ${((countWithin10m / 135489) * 100).toFixed(4)}%)`);
  console.log(`Within 30 m:   ${countWithin30m.toLocaleString()} px (${(countWithin30m * 0.01).toFixed(2)} ha, ${((countWithin30m / 135489) * 100).toFixed(4)}%)`);
  console.log(`Within 100 m:  ${countWithin100m.toLocaleString()} px (${(countWithin100m * 0.01).toFixed(2)} ha, ${((countWithin100m / 135489) * 100).toFixed(4)}%)`);
  console.log(`Over 100 m:    ${countOver100m.toLocaleString()} px (${(countOver100m * 0.01).toFixed(2)} ha, ${((countOver100m / 135489) * 100).toFixed(4)}%)`);

  console.log('\nTop 5 Closest Candidates to Boundary:');
  for (let i = 0; i < Math.min(5, candidateDistances.length); i++) {
    const item = candidateDistances[i];
    console.log(`  #${i + 1}: [r=${item.cand.r}, c=${item.cand.c}] UTM: (${item.cand.x}, ${item.cand.y}), Dist: ${item.dist.toFixed(4)} m, dNDVI: ${item.cand.dNdvi.toFixed(4)}`);
  }

  // Check the 4 borderline pixels identified earlier:
  // [r=981, c=2044], [r=1624, c=168], [r=311, c=447], [r=1012, c=2074]
  const fourPixels = [
    { r: 981, c: 2044, desc: '0.6 mm inside' },
    { r: 1624, c: 168, desc: '2.8 mm inside' },
    { r: 311, c: 447, desc: '6.3 mm inside' },
    { r: 1012, c: 2074, desc: '6.9 mm inside' },
  ];
  console.log('\nAudit of the 4 Borderline Zone Pixels against Canonical Candidates:');
  for (const p of fourPixels) {
    const idx = p.r * w + p.c;
    const isCand = canonicalCandidateMask[idx] === 1;
    console.log(`  Pixel [r=${p.r}, c=${p.c}] (${p.desc}): In Canonical Candidate Set = ${isCand}`);
  }

  await mongoose.disconnect();
}

auditCandidateMaskAndBoundary().catch(console.error);
