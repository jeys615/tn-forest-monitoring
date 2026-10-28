/**
 * Diagnostic Forensic Script: Phase 2 Phenological Audit
 * READ-ONLY: ZERO mutations to database, baselines, alerts, or monitoring jobs.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { AnalysisGridService } from '../services/spatial/AnalysisGridService.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function runForensicChecks() {
  console.log('================================================================');
  console.log('🔍 FORENSIC AUDIT DIAGNOSTIC ENGINE: PHASE 2 VALIDATION');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  if (!zone) throw new Error('Zone not found');
  const boundary = zone.boundary as GeoJSONPolygon;

  // 1. Grid and local rasterization
  const grid = AnalysisGridService.createAnalysisGrid(boundary, {
    targetCrs: 'EPSG:32643',
    pixelSizeMeters: 10,
  });

  console.log('--- 1. ANALYSIS GRID METRICS ---');
  console.log(`Grid Dimensions:   ${grid.width} x ${grid.height} (Total: ${(grid.width * grid.height).toLocaleString()} px)`);
  console.log(`Origin:            [${grid.originX}, ${grid.originY}]`);
  console.log(`Transform:         ${JSON.stringify(grid.transform)}`);
  console.log(`Bounding Box:      [${grid.minX}, ${grid.minY}, ${grid.maxX}, ${grid.maxY}]`);

  const zoneMask = AnalysisGridService.rasterizePolygon(grid, boundary);
  let localZoneCount = 0;
  for (let i = 0; i < zoneMask.length; i++) {
    if (zoneMask[i] === 1) localZoneCount++;
  }
  console.log(`Local Zone Pixels: ${localZoneCount.toLocaleString()} px`);

  // 2. Geometry investigation of polygon ring
  const ringWgs = boundary.coordinates[0];
  const ringUtm = ringWgs.map(([lon, lat]) => CrsTransformService.transformCoordinate([lon, lat], 'EPSG:4326', 'EPSG:32643'));
  console.log(`Polygon Vertices:  ${ringWgs.length} vertices`);

  // Find all boundary-adjacent pixels: pixels inside zone that have at least one 4-neighbor outside zone
  const boundaryPixelsInside: { r: number; c: number; x: number; y: number; minDistanceToEdge: number }[] = [];
  const boundaryPixelsOutside: { r: number; c: number; x: number; y: number; minDistanceToEdge: number }[] = [];

  // Helper distance from point (px, py) to line segment (x1, y1)-(x2, y2)
  function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  function minDistanceToPolygon(px: number, py: number): number {
    let minDist = Infinity;
    for (let i = 0; i < ringUtm.length - 1; i++) {
      const d = pointToSegmentDistance(px, py, ringUtm[i][0], ringUtm[i][1], ringUtm[i + 1][0], ringUtm[i + 1][1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  const w = grid.width;
  const h = grid.height;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const idx = r * w + c;
      const val = zoneMask[idx];
      const isNeighborDifferent =
        (r > 0 && zoneMask[(r - 1) * w + c] !== val) ||
        (r < h - 1 && zoneMask[(r + 1) * w + c] !== val) ||
        (c > 0 && zoneMask[r * w + (c - 1)] !== val) ||
        (c < w - 1 && zoneMask[r * w + (c + 1)] !== val);

      if (isNeighborDifferent) {
        const x = grid.originX + (c + 0.5) * grid.pixelSizeX;
        const y = grid.originY - (r + 0.5) * grid.pixelSizeY;
        const dist = minDistanceToPolygon(x, y);
        if (val === 1) {
          boundaryPixelsInside.push({ r, c, x, y, minDistanceToEdge: dist });
        } else {
          boundaryPixelsOutside.push({ r, c, x, y, minDistanceToEdge: dist });
        }
      }
    }
  }

  boundaryPixelsInside.sort((a, b) => a.minDistanceToEdge - b.minDistanceToEdge);
  boundaryPixelsOutside.sort((a, b) => a.minDistanceToEdge - b.minDistanceToEdge);

  console.log(`\n--- 2. BOUNDARY EDGE DISTANCE MEASUREMENTS (PLANAR UTM EPSG:32643) ---`);
  console.log(`Boundary pixels inside perimeter:  ${boundaryPixelsInside.length.toLocaleString()}`);
  console.log(`Top 5 closest inside pixel centers to polygon edge:`);
  for (let i = 0; i < Math.min(5, boundaryPixelsInside.length); i++) {
    const p = boundaryPixelsInside[i];
    console.log(`  [r=${p.r}, c=${p.c}] UTM: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}), Distance: ${p.minDistanceToEdge.toFixed(4)} m`);
  }
  console.log(`Top 5 closest outside pixel centers to polygon edge:`);
  for (let i = 0; i < Math.min(5, boundaryPixelsOutside.length); i++) {
    const p = boundaryPixelsOutside[i];
    console.log(`  [r=${p.r}, c=${p.c}] UTM: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}), Distance: ${p.minDistanceToEdge.toFixed(4)} m`);
  }

  // 3. Query GEE directly for geodesic vs planar polygon pixel counts
  console.log('\n--- 3. GEE GEOMETRY REDUCTION TEST (PLANAR VS GEODESIC) ---');
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();
  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  async function queryGeePolyCount(geodesic: boolean): Promise<number> {
    const expressionValues: Record<string, unknown> = {
      zone_geom: {
        functionInvocationValue: {
          functionName: 'GeometryConstructors.Polygon',
          arguments: {
            coordinates: { constantValue: boundary.coordinates },
            geodesic: { constantValue: geodesic },
          }
        }
      },
      const_img: {
        functionInvocationValue: {
          functionName: 'Image.constant',
          arguments: { value: { constantValue: 1 } }
        }
      },
      proj: {
        functionInvocationValue: {
          functionName: 'Projection',
          arguments: {
            crs: { constantValue: 'EPSG:32643' },
            transform: { constantValue: canonicalTransform }
          }
        }
      },
      sum_red: {
        functionInvocationValue: { functionName: 'Reducer.sum', arguments: {} }
      },
      reduction: {
        functionInvocationValue: {
          functionName: 'Image.reduceRegion',
          arguments: {
            image: { valueReference: 'const_img' },
            geometry: { valueReference: 'zone_geom' },
            crs: { valueReference: 'proj' },
            reducer: { valueReference: 'sum_red' },
            maxPixels: { constantValue: 1000000000 }
          }
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': config.projectId,
      },
      body: JSON.stringify({ expression: { values: expressionValues, result: 'reduction' } }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GEE query failed: ${err}`);
    }
    const data = await res.json() as { result?: { constant?: number } };
    return Math.round(data.result?.constant || 0);
  }

  try {
    const geodesicCount = await queryGeePolyCount(true);
    console.log(`GEE Geodesic Polygon Count (default): ${geodesicCount.toLocaleString()} px`);
    const planarCount = await queryGeePolyCount(false);
    console.log(`GEE Planar Polygon Count (geodesic:false): ${planarCount.toLocaleString()} px`);
    console.log(`Local Rasterization Count:             ${localZoneCount.toLocaleString()} px`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`GEE Polygon test warning: ${msg}`);
  }

  await mongoose.disconnect();
}

runForensicChecks().catch(async (e) => {
  console.error('Diagnostic error:', e);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
  process.exit(1);
});
