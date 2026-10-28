/**
 * Query GEE to decompose the 532-pixel discrepancy
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function decomposeGpuDiscrepancy() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  const expr: Record<string, unknown> = {
    zone_geom: {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.Polygon',
        arguments: { coordinates: { constantValue: boundary.coordinates } }
      }
    },
    proj: {
      functionInvocationValue: {
        functionName: 'Projection',
        arguments: { crs: { constantValue: 'EPSG:32643' }, transform: { constantValue: canonicalTransform } }
      }
    },
    sum_red: {
      functionInvocationValue: { functionName: 'Reducer.sum', arguments: {} }
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
    // Bilinear resampled versions
    img_base_bilinear: {
      functionInvocationValue: {
        functionName: 'Image.resample',
        arguments: { image: { valueReference: 'img_base' }, mode: { constantValue: 'bilinear' } }
      }
    },
    img_cur_bilinear: {
      functionInvocationValue: {
        functionName: 'Image.resample',
        arguments: { image: { valueReference: 'img_cur' }, mode: { constantValue: 'bilinear' } }
      }
    },
  };

  // Helper for NDVI
  const addNdviPair = (suffix: string, baseKey: string, curKey: string) => {
    ['base', 'cur'].forEach(k => {
      const parent = k === 'base' ? baseKey : curKey;
      expr[`nir_${k}_${suffix}`] = {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: { input: { valueReference: parent }, bandSelectors: { constantValue: ['B8'] } }
        }
      };
      expr[`red_${k}_${suffix}`] = {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: { input: { valueReference: parent }, bandSelectors: { constantValue: ['B4'] } }
        }
      };
      expr[`ndvi_${k}_${suffix}`] = {
        functionInvocationValue: {
          functionName: 'Image.normalizedDifference',
          arguments: {
            input: {
              functionInvocationValue: {
                functionName: 'Image.addBands',
                arguments: { dstImg: { valueReference: `nir_${k}_${suffix}` }, srcImg: { valueReference: `red_${k}_${suffix}` } }
              }
            },
            bandNames: { constantValue: ['B8', 'B4'] }
          }
        }
      };
    });

    expr[`delta_${suffix}`] = {
      functionInvocationValue: {
        functionName: 'Image.subtract',
        arguments: { image1: { valueReference: `ndvi_cur_${suffix}` }, image2: { valueReference: `ndvi_base_${suffix}` } }
      }
    };

    expr[`dist_${suffix}`] = {
      functionInvocationValue: {
        functionName: 'Image.lte',
        arguments: {
          image1: { valueReference: `delta_${suffix}` },
          image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } }
        }
      }
    };
  };

  addNdviPair('nn', 'img_base', 'img_cur'); // Nearest neighbor
  addNdviPair('bi', 'img_base_bilinear', 'img_cur_bilinear'); // Bilinear

  // SCL clear
  ['base', 'cur'].forEach(k => {
    expr[`scl_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['SCL'] } }
      }
    };
    expr[`clear_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.remap',
        arguments: {
          image: { valueReference: `scl_${k}` },
          from: { constantValue: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
          to: { constantValue: [0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0] },
          defaultValue: { constantValue: 0 }
        }
      }
    };
  });

  expr['clear_both'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_cur' } }
    }
  };

  expr['cand_nn'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_nn' }, image2: { valueReference: 'clear_both' } }
    }
  };
  expr['cand_bi'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_bi' }, image2: { valueReference: 'clear_both' } }
    }
  };

  async function query(label: string, node: string): Promise<number> {
    const exprCopy = { ...expr };
    exprCopy['reduction'] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: node },
          geometry: { valueReference: 'zone_geom' },
          crs: { valueReference: 'proj' },
          reducer: { valueReference: 'sum_red' },
          maxPixels: { constantValue: 1000000000 }
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
      body: JSON.stringify({ expression: { values: exprCopy, result: 'reduction' } }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Reduction failed for ${label}: ${err}`);
    }
    const data = await res.json() as { result?: Record<string, number> };
    return Math.round(Object.values(data.result || {})[0] || 0);
  }

  console.log('Querying GEE for unmasked and masked candidate counts under NN and Bilinear...');
  const distNN = await query('Dist NN Unmasked', 'dist_nn');
  console.log(`  GEE Unmasked Disturbance (Nearest Neighbor): ${distNN.toLocaleString()} px (Local was: 136,706 px)`);

  const distBI = await query('Dist Bilinear Unmasked', 'dist_bi');
  console.log(`  GEE Unmasked Disturbance (Bilinear):         ${distBI.toLocaleString()} px`);

  const candNN = await query('Cand NN with SCL', 'cand_nn');
  console.log(`  GEE Candidate Mask (Nearest Neighbor + SCL): ${candNN.toLocaleString()} px`);

  const candBI = await query('Cand Bilinear with SCL', 'cand_bi');
  console.log(`  GEE Candidate Mask (Bilinear + SCL):         ${candBI.toLocaleString()} px`);

  await mongoose.disconnect();
}

decomposeGpuDiscrepancy().catch(console.error);
