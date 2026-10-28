import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { Zone } from '../models/Zone.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function testUnweighted() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-260829-8998' }).lean();
  const boundary = (zone as any).boundary;
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;
  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];

  const expr: Record<string, unknown> = {
    zone_geom: {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.Polygon',
        arguments: { coordinates: { constantValue: boundary.coordinates } },
      },
    },
    proj: {
      functionInvocationValue: {
        functionName: 'Projection',
        arguments: { crs: { constantValue: 'EPSG:32643' }, transform: { constantValue: canonicalTransform } },
      },
    },
    sum_red: {
      functionInvocationValue: {
        functionName: 'Reducer.sum',
        arguments: {},
      },
    },
    unweighted_sum: {
      functionInvocationValue: {
        functionName: 'Reducer.unweighted',
        arguments: { reducer: { valueReference: 'sum_red' } },
      },
    },
    one_img: {
      functionInvocationValue: {
        functionName: 'Image.constant',
        arguments: { value: { constantValue: 1 } },
      },
    },
    reduction: {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: 'one_img' },
          geometry: { valueReference: 'zone_geom' },
          crs: { valueReference: 'proj' },
          reducer: { valueReference: 'unweighted_sum' },
          maxPixels: { constantValue: 1000000000 },
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'reduction' } }),
  });
  const data = await res.json();
  console.log('Unweighted reduction result:', data);
  await mongoose.disconnect();
}

testUnweighted().catch(console.error);
