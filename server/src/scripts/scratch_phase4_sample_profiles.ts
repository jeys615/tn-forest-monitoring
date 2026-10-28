/**
 * Phase 4: Sample Representative Pixels for Canopy Filter Impact Assessment
 * Script: scratch_phase4_sample_profiles.ts
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function sampleProfiles() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  // Pre-calculate boundary segments for exact distance calculation
  const ringWgs = boundary.coordinates[0];
  const ringUtm = ringWgs.map(([lo, la]) => CrsTransformService.transformCoordinate([lo, la], 'EPSG:4326', 'EPSG:32643'));

  function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function getBoundaryDistance(px: number, py: number): number {
    let minDist = Infinity;
    for (let i = 0; i < ringUtm.length - 1; i++) {
      const d = pointToSegmentDistance(px, py, ringUtm[i][0], ringUtm[i][1], ringUtm[i + 1][0], ringUtm[i + 1][1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  const expr: Record<string, unknown> = {
    proj: {
      functionInvocationValue: {
        functionName: 'Projection',
        arguments: { crs: { constantValue: 'EPSG:32643' }, transform: { constantValue: canonicalTransform } }
      }
    },
    img_base: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM' } }
      }
    },
    img_cur: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM' } }
      }
    },
    img_p1: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM' } }
      }
    },
    img_p2: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM' } }
      }
    },
    img_p3: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM' } }
      }
    },
  };

  const dates = [
    { key: 'base', img: 'img_base', name: 'T0 (2020-01-09)' },
    { key: 'cur', img: 'img_cur', name: 'T1 (2024-02-07)' },
    { key: 'p1', img: 'img_p1', name: 'P1 (2020-02-18)' },
    { key: 'p2', img: 'img_p2', name: 'P2 (2024-01-23)' },
    { key: 'p3', img: 'img_p3', name: 'P3 (2025-01-27)' },
  ];

  for (const d of dates) {
    expr[`nir_${d.key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: d.img }, bandSelectors: { constantValue: ['B8'] }, newNames: { constantValue: [`B8_${d.key}`] } }
      }
    };
    expr[`red_${d.key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: d.img }, bandSelectors: { constantValue: ['B4'] }, newNames: { constantValue: [`B4_${d.key}`] } }
      }
    };
    expr[`blue_${d.key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: d.img }, bandSelectors: { constantValue: ['B2'] }, newNames: { constantValue: [`B2_${d.key}`] } }
      }
    };
    expr[`swir_${d.key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: d.img }, bandSelectors: { constantValue: ['B11'] }, newNames: { constantValue: [`B11_${d.key}`] } }
      }
    };
    expr[`scl_${d.key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: d.img }, bandSelectors: { constantValue: ['SCL'] }, newNames: { constantValue: [`SCL_${d.key}`] } }
      }
    };
    expr[`raw_ndvi_${d.key}`] = {
      functionInvocationValue: {
        functionName: 'Image.normalizedDifference',
        arguments: {
          input: {
            functionInvocationValue: {
              functionName: 'Image.addBands',
              arguments: { dstImg: { valueReference: `nir_${d.key}` }, srcImg: { valueReference: `red_${d.key}` } }
            }
          },
          bandNames: { constantValue: [`B8_${d.key}`, `B4_${d.key}`] }
        }
      }
    };
    expr[`ndvi_${d.key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `raw_ndvi_${d.key}` }, bandSelectors: { constantValue: ['nd'] }, newNames: { constantValue: [`NDVI_${d.key}`] } }
      }
    };
  }

  const allBands = [
    'blue_base', 'red_base', 'nir_base', 'swir_base', 'scl_base', 'ndvi_base',
    'blue_cur', 'red_cur', 'nir_cur', 'swir_cur', 'scl_cur', 'ndvi_cur',
    'blue_p1', 'red_p1', 'nir_p1', 'swir_p1', 'scl_p1', 'ndvi_p1',
    'blue_p2', 'red_p2', 'nir_p2', 'swir_p2', 'scl_p2', 'ndvi_p2',
    'blue_p3', 'red_p3', 'nir_p3', 'swir_p3', 'scl_p3', 'ndvi_p3',
  ];

  let curImg = allBands[0];
  for (let i = 1; i < allBands.length; i++) {
    const k = allBands[i];
    const outK = `stack_${i}`;
    expr[outK] = {
      functionInvocationValue: {
        functionName: 'Image.addBands',
        arguments: { dstImg: { valueReference: curImg }, srcImg: { valueReference: k } }
      }
    };
    curImg = outK;
  }

  async function queryPoint(name: string, row: number, col: number) {
    const originX = 819510;
    const originY = 1140140;
    const pixelSize = 10;
    const xCenter = originX + (col + 0.5) * pixelSize;
    const yCenter = originY - (row + 0.5) * pixelSize;
    const [lon, lat] = CrsTransformService.transformCoordinate([xCenter, yCenter], 'EPSG:32643', 'EPSG:4326');
    const dist = getBoundaryDistance(xCenter, yCenter);

    const ptExpr = { ...expr };
    ptExpr['pt'] = {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.Point',
        arguments: {
          coordinates: { constantValue: [xCenter, yCenter] },
          crs: { functionInvocationValue: { functionName: 'Projection', arguments: { crs: { constantValue: 'EPSG:32643' } } } }
        }
      }
    };
    ptExpr['pt_sample'] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: curImg },
          geometry: { valueReference: 'pt' },
          crs: { valueReference: 'proj' },
          reducer: { functionInvocationValue: { functionName: 'Reducer.first', arguments: {} } },
          scale: { constantValue: 10 }
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
      body: JSON.stringify({ expression: { values: ptExpr, result: 'pt_sample' } }),
    });
    const data = await res.json() as { result?: Record<string, number> };
    const val = data.result || {};

    const ndviBase = val['NDVI_base'];
    const ndviCur = val['NDVI_cur'];
    const ndviP1 = val['NDVI_p1'];
    const ndviP2 = val['NDVI_p2'];
    const ndviP3 = val['NDVI_p3'];
    const sclBase = val['SCL_base'];
    const sclCur = val['SCL_cur'];
    const sclP1 = val['SCL_p1'];
    const sclP2 = val['SCL_p2'];
    const sclP3 = val['SCL_p3'];

    const dCur = ndviCur - ndviBase;
    const dP1 = ndviP1 - ndviBase;
    const dP2 = ndviP2 - ndviBase;
    const dP3 = ndviP3 - ndviBase;

    const guardPass = ndviBase >= 0.40 && sclBase === 4;

    console.log(`\n================================================================`);
    console.log(`📍 PROFILE: ${name}`);
    console.log(`================================================================`);
    console.log(`Grid Index:       [row=${row}, col=${col}]`);
    console.log(`Coordinates:      UTM (${xCenter.toFixed(2)}, ${yCenter.toFixed(2)}), Lon/Lat (${lon.toFixed(7)}, ${lat.toFixed(7)})`);
    console.log(`Boundary Dist:    ${dist.toFixed(4)} m (${dist < 10 ? 'BOUNDARY ZONE' : 'INTERIOR'})`);
    console.log(`Baseline (T0):    NDVI = ${ndviBase?.toFixed(4)}, SCL = ${sclBase} (B2=${val['B2_base']}, B4=${val['B4_base']}, B8=${val['B8_base']}, B11=${val['B11_base']})`);
    console.log(`Current (T1):     NDVI = ${ndviCur?.toFixed(4)}, SCL = ${sclCur}, dCur = ${dCur?.toFixed(4)}`);
    console.log(`P1 Control:       NDVI = ${ndviP1?.toFixed(4)}, SCL = ${sclP1}, dP1 = ${dP1?.toFixed(4)}`);
    console.log(`P2 Same-Season:   NDVI = ${ndviP2?.toFixed(4)}, SCL = ${sclP2}, dP2 = ${dP2?.toFixed(4)}`);
    console.log(`P3 Recovery:      NDVI = ${ndviP3?.toFixed(4)}, SCL = ${sclP3}, dP3 = ${dP3?.toFixed(4)}`);
    console.log(`Canopy Guard:     NDVI_base >= 0.40 (${ndviBase >= 0.40}) && SCL_base == 4 (${sclBase === 4}) -> ${guardPass ? 'RETAINED (PASS)' : 'EXCLUDED (FAIL)'}`);
  }

  // 1. Interior Dense Canopy Persistent (Confirmed genuine canopy loss)
  // Row 670, Col 821 (UTM 827725, 1133435)
  await queryPoint('1. Interior Dense Forest Canopy (Persistent Candidate)', 670, 821);

  // 2. Boundary Soil/Track (Pixel [1985, 1129])
  await queryPoint('2. Boundary Perimeter Track / Bare Soil (Persistent Candidate)', 1985, 1129);

  // 3. Boundary Dense Canopy Persistent
  // Row 1782, Col 815 (UTM 827665, 1122315, dist ~ 2.4 m)
  await queryPoint('3. Boundary Dense Canopy (Persistent Candidate, dist ~ 2.4m)', 1782, 815);

  // 4. Sample a Seasonal Candidate with high baseline canopy (Row 800, Col 800)
  await queryPoint('4. Interior Seasonal Deciduous Forest (Seasonal Candidate)', 800, 800);

  // 5. Sample a pixel with SCL = 2 (Topographic Shadow / Dark Area on steep slope) that had high NDVI
  // Let's find one: from the persistent candidates, 9 pixels had SCL=2, e.g., let's sample one
  // Let's also sample a pixel with SCL = 5 (Bare Soil at baseline)
  // In scratch_check_specific_boundary_pixels.ts, row 1980, col 1130 had SCL 5
  await queryPoint('5. Perimeter Exposed Soil / Rock Fringe (Candidate Pool)', 1980, 1130);

  await mongoose.disconnect();
}

sampleProfiles().catch(console.error);
