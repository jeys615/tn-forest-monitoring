import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function testSclReduction() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  if (!zone) throw new Error('Zone not found');
  const boundary = zone.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const expressionValues: Record<string, unknown> = {
    zone_geom: {
      functionInvocationValue: {
        functionName: boundary.type === 'MultiPolygon' ? 'GeometryConstructors.MultiPolygon' : 'GeometryConstructors.Polygon',
        arguments: {
          coordinates: { constantValue: boundary.coordinates }
        }
      }
    },
    raw_img: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: {
          id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM' }
        }
      }
    },
    scl: {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: {
          input: { valueReference: 'raw_img' },
          bandSelectors: { constantValue: ['SCL'] }
        }
      }
    },
    hist_reducer: {
      functionInvocationValue: {
        functionName: 'Reducer.frequencyHistogram',
        arguments: {}
      }
    },
    proj: {
      functionInvocationValue: {
        functionName: 'Projection',
        arguments: {
          crs: { constantValue: 'EPSG:32643' },
          transform: { constantValue: [10, 0, 819510, 0, -10, 1140140] }
        }
      }
    },
    reduction: {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: 'scl' },
          geometry: { valueReference: 'zone_geom' },
          crs: { valueReference: 'proj' },
          reducer: { valueReference: 'hist_reducer' },
          maxPixels: { constantValue: 1000000000 }
        }
      }
    }
  };

  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;
  const body = {
    expression: {
      values: expressionValues,
      result: 'reduction'
    }
  };

  console.log('Sending SCL reduction request to GEE...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': config.projectId,
    },
    body: JSON.stringify(body),
  });

  console.log('HTTP Status:', res.status, res.statusText);
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  await mongoose.disconnect();
}

testSclReduction().catch(console.error);
