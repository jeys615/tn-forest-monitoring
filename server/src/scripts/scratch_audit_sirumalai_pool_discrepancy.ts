import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { Zone } from '../models/Zone.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function verifyCandidatePoolDifference() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
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
      functionInvocationValue: { functionName: 'Reducer.sum', arguments: {} },
    },
    unweighted_sum: {
      functionInvocationValue: {
        functionName: 'Reducer.unweighted',
        arguments: { reducer: { valueReference: 'sum_red' } },
      },
    },
    img_base: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM' } },
      },
    },
    img_cur: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM' } },
      },
    },
    nir_base: {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: 'img_base' }, bandSelectors: { constantValue: ['B8'] } },
      },
    },
    red_base: {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: 'img_base' }, bandSelectors: { constantValue: ['B4'] } },
      },
    },
    ndvi_base: {
      functionInvocationValue: {
        functionName: 'Image.normalizedDifference',
        arguments: {
          input: {
            functionInvocationValue: {
              functionName: 'Image.addBands',
              arguments: { dstImg: { valueReference: 'nir_base' }, srcImg: { valueReference: 'red_base' } },
            },
          },
          bandNames: { constantValue: ['B8', 'B4'] },
        },
      },
    },
    nir_cur: {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: 'img_cur' }, bandSelectors: { constantValue: ['B8'] } },
      },
    },
    red_cur: {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: 'img_cur' }, bandSelectors: { constantValue: ['B4'] } },
      },
    },
    ndvi_cur: {
      functionInvocationValue: {
        functionName: 'Image.normalizedDifference',
        arguments: {
          input: {
            functionInvocationValue: {
              functionName: 'Image.addBands',
              arguments: { dstImg: { valueReference: 'nir_cur' }, srcImg: { valueReference: 'red_cur' } },
            },
          },
          bandNames: { constantValue: ['B8', 'B4'] },
        },
      },
    },
    delta_cur: {
      functionInvocationValue: {
        functionName: 'Image.subtract',
        arguments: { image1: { valueReference: 'ndvi_cur' }, image2: { valueReference: 'ndvi_base' } },
      },
    },
    dist_signal: {
      functionInvocationValue: {
        functionName: 'Image.lte',
        arguments: {
          image1: { valueReference: 'delta_cur' },
          image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } },
        },
      },
    },
  };

  ['base', 'cur'].forEach((k) => {
    expr[`b2_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B2'] } },
      },
    };
    expr[`b4_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B4'] } },
      },
    };
    expr[`b8_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B8'] } },
      },
    };
    expr[`b11_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B11'] } },
      },
    };

    expr[`local_cloud_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { functionInvocationValue: { functionName: 'Image.gt', arguments: { image1: { valueReference: `b2_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 2000 } } } } } } },
          image2: { functionInvocationValue: { functionName: 'Image.gt', arguments: { image1: { valueReference: `b4_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 1500 } } } } } } },
        },
      },
    };

    expr[`local_shadow_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: {
            functionInvocationValue: {
              functionName: 'Image.and',
              arguments: {
                image1: { functionInvocationValue: { functionName: 'Image.lt', arguments: { image1: { valueReference: `b8_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 1000 } } } } } } },
                image2: { functionInvocationValue: { functionName: 'Image.lt', arguments: { image1: { valueReference: `b11_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 800 } } } } } } },
              },
            },
          },
          image2: { functionInvocationValue: { functionName: 'Image.lt', arguments: { image1: { valueReference: `b4_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 600 } } } } } } },
        },
      },
    };

    expr[`local_excluded_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.or',
        arguments: { image1: { valueReference: `local_cloud_${k}` }, image2: { valueReference: `local_shadow_${k}` } },
      },
    };
  });

  expr['local_screened'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'local_excluded_base' }, image2: { valueReference: 'local_excluded_cur' } },
    },
  };

  expr['local_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'dist_signal' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'local_screened' } } } },
      },
    },
  };

  // Reduce using both default (weighted) sum and unweighted sum
  expr['reduce_weighted'] = {
    functionInvocationValue: {
      functionName: 'Image.reduceRegion',
      arguments: {
        image: { valueReference: 'local_cand_mask' },
        geometry: { valueReference: 'zone_geom' },
        crs: { valueReference: 'proj' },
        reducer: { valueReference: 'sum_red' },
        maxPixels: { constantValue: 1000000000 },
      },
    },
  };

  expr['reduce_unweighted'] = {
    functionInvocationValue: {
      functionName: 'Image.reduceRegion',
      arguments: {
        image: { valueReference: 'local_cand_mask' },
        geometry: { valueReference: 'zone_geom' },
        crs: { valueReference: 'proj' },
        reducer: { valueReference: 'unweighted_sum' },
        maxPixels: { constantValue: 1000000000 },
      },
    },
  };

  const resW = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'reduce_weighted' } }),
  });
  const dataW = await resW.json();

  const resU = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'reduce_unweighted' } }),
  });
  const dataU = await resU.json();

  console.log('--- SIRUMALAI CANDIDATE POOL DISCREPANCY AUDIT ---');
  console.log('Weighted Reducer (Phase 5B default):', (dataW as any).result);
  console.log('  -> Raw float:', (dataW as any).result?.delta_cur);
  console.log('  -> Math.round:', Math.round((dataW as any).result?.delta_cur));
  console.log('Unweighted Reducer (Phase 5F unweighted):', (dataU as any).result);
  console.log('  -> Exact integer:', (dataU as any).result?.delta_cur);
  console.log('Discrepancy (Unweighted - Weighted):', (dataU as any).result?.delta_cur - (dataW as any).result?.delta_cur);

  await mongoose.disconnect();
}

verifyCandidatePoolDifference().catch(console.error);
