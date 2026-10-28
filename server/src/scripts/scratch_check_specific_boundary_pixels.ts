/**
 * Verify whether the 4 nearest boundary pixels are 0 or 1 in GEE Image.reduceRegion
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function checkSpecificPixelsInGee() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  const testPixels = [
    { label: 'Pixel 1 (0.6 mm inside local)', r: 981, c: 2044, x: 839955, y: 1130325 },
    { label: 'Pixel 2 (2.8 mm inside local)', r: 1624, c: 168, x: 821195, y: 1123895 },
    { label: 'Pixel 3 (6.3 mm inside local)', r: 311, c: 447, x: 823985, y: 1137025 },
    { label: 'Pixel 4 (6.9 mm inside local)', r: 1012, c: 2074, x: 840255, y: 1130015 },
    { label: 'Pixel 5 (10.8 mm inside local)', r: 1841, c: 424, x: 823755, y: 1121725 },
    { label: 'Outside 1 (4.7 mm outside local)', r: 799, c: 29, x: 819805, y: 1132145 },
    { label: 'Outside 2 (5.7 mm outside local)', r: 950, c: 2014, x: 839655, y: 1130635 },
  ];

  console.log('Testing whether specific pixels are inside GEE reduction geometry...');

  for (const p of testPixels) {
    const expr: Record<string, unknown> = {
      zone_geom: {
        functionInvocationValue: {
          functionName: 'GeometryConstructors.Polygon',
          arguments: { coordinates: { constantValue: boundary.coordinates } }
        }
      },
      pt: {
        functionInvocationValue: {
          functionName: 'GeometryConstructors.Point',
          arguments: {
            coordinates: { constantValue: [p.x, p.y] },
            crs: {
              functionInvocationValue: {
                functionName: 'Projection',
                arguments: { crs: { constantValue: 'EPSG:32643' } }
              }
            }
          }
        }
      },
      contains: {
        functionInvocationValue: {
          functionName: 'Geometry.contains',
          arguments: {
            geometry1: { valueReference: 'zone_geom' },
            geometry2: { valueReference: 'pt' }
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
      body: JSON.stringify({ expression: { values: expr, result: 'contains' } }),
    });

    const data = await res.json() as { result?: boolean };
    console.log(`  ${p.label}: GEE contains = ${data.result}`);
  }

  await mongoose.disconnect();
}

checkSpecificPixelsInGee().catch(console.error);
