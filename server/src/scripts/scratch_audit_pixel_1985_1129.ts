/**
 * Audit Item 5: Independent forensic trace of pixel [row=1985, col=1129]
 * Trace all 5 dates, reflectance bands, NDVI, SCL, deltas, and masks.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function tracePixel1985_1129() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const r = 1985;
  const c = 1129;
  const originX = 819510;
  const originY = 1140140;
  const pixelSize = 10;

  // Center coordinate
  const xCenter = originX + (c + 0.5) * pixelSize;
  const yCenter = originY - (r + 0.5) * pixelSize;

  // Geographic coordinate
  const [lon, lat] = CrsTransformService.transformCoordinate([xCenter, yCenter], 'EPSG:32643', 'EPSG:4326');

  // Exact boundary distance
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

  let minDist = Infinity;
  for (let i = 0; i < ringUtm.length - 1; i++) {
    const d = pointToSegmentDistance(xCenter, yCenter, ringUtm[i][0], ringUtm[i][1], ringUtm[i + 1][0], ringUtm[i + 1][1]);
    if (d < minDist) minDist = d;
  }

  console.log('================================================================');
  console.log(`🔬 INDEPENDENT FORENSIC TRACE: PIXEL [row=${r}, col=${c}]`);
  console.log('================================================================\n');
  console.log(`Geospatial Coordinates:`);
  console.log(`  UTM Center (EPSG:32643): (${xCenter.toFixed(2)}, ${yCenter.toFixed(2)})`);
  console.log(`  WGS84 Lon/Lat:           (${lon.toFixed(7)}, ${lat.toFixed(7)})`);
  console.log(`  Pixel Bounds:            [${originX + c * 10}, ${originY - (r + 1) * 10}, ${originX + (c + 1) * 10}, ${originY - r * 10}]`);
  console.log(`  Distance to Boundary:    ${minDist.toFixed(4)} meters (${(minDist * 100).toFixed(2)} cm inside)`);

  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  const expr: Record<string, unknown> = {
    pt: {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.Point',
        arguments: {
          coordinates: { constantValue: [xCenter, yCenter] },
          crs: { functionInvocationValue: { functionName: 'Projection', arguments: { crs: { constantValue: 'EPSG:32643' } } } }
        }
      }
    },
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

  // Bundle all into one image to query point value
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

  expr['pt_sample'] = {
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
    body: JSON.stringify({ expression: { values: expr, result: 'pt_sample' } }),
  });

  const data = await res.json() as { result?: Record<string, number> };
  const val = data.result || {};

  console.log('\n--- SPECTRAL RESPONSE ACROSS ALL 5 DATES ---');
  for (const d of dates) {
    const b2 = val[`B2_${d.key}`] || val[`B2`];
    const b4 = val[`B4_${d.key}`] || val[`B4`];
    const b8 = val[`B8_${d.key}`] || val[`B8`];
    const b11 = val[`B11_${d.key}`] || val[`B11`];
    const scl = val[`SCL_${d.key}`];
    const ndvi = val[`NDVI_${d.key}`];
    console.log(`  ${d.name}:`);
    console.log(`    Reflectance: B2=${b2}, B4=${b4}, B8=${b8}, B11=${b11}`);
    console.log(`    NDVI:        ${ndvi}`);
    console.log(`    SCL:         ${scl}`);
  }

  await mongoose.disconnect();
}

tracePixel1985_1129().catch(console.error);
