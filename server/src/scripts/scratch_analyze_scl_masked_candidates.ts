/**
 * Analyze SCL class breakdown for the 1,748 candidates masked by SCL in GEE
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function analyzeSclMaskedCandidates() {
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
    hist_red: {
      functionInvocationValue: { functionName: 'Reducer.frequencyHistogram', arguments: {} }
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
  };

  // NDVI
  ['base', 'cur'].forEach(k => {
    expr[`nir_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B8'] } }
      }
    };
    expr[`red_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B4'] } }
      }
    };
    expr[`ndvi_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.normalizedDifference',
        arguments: {
          input: {
            functionInvocationValue: {
              functionName: 'Image.addBands',
              arguments: { dstImg: { valueReference: `nir_${k}` }, srcImg: { valueReference: `red_${k}` } }
            }
          },
          bandNames: { constantValue: ['B8', 'B4'] }
        }
      }
    };
  });

  expr['delta'] = {
    functionInvocationValue: {
      functionName: 'Image.subtract',
      arguments: { image1: { valueReference: 'ndvi_cur' }, image2: { valueReference: 'ndvi_base' } }
    }
  };
  expr['dist_signal'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: {
        image1: { valueReference: 'delta' },
        image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } }
      }
    }
  };

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

  // Base non-clear among candidates
  expr['cand_base_nonclear'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'dist_signal' },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.not',
            arguments: { value: { valueReference: 'clear_base' } }
          }
        }
      }
    }
  };
  // Cur non-clear among candidates
  expr['cand_cur_nonclear'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'dist_signal' },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.not',
            arguments: { value: { valueReference: 'clear_cur' } }
          }
        }
      }
    }
  };

  // Helper to query count
  async function querySum(node: string): Promise<number> {
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

    const data = await res.json() as { result?: Record<string, number> };
    return Math.round(Object.values(data.result || {})[0] || 0);
  }

  // Helper to query histogram
  async function queryHist(imgNode: string, maskNode: string): Promise<Record<string, number>> {
    const exprCopy = { ...expr };
    exprCopy['masked_img'] = {
      functionInvocationValue: {
        functionName: 'Image.updateMask',
        arguments: { image: { valueReference: imgNode }, mask: { valueReference: maskNode } }
      }
    };
    exprCopy['reduction'] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: 'masked_img' },
          geometry: { valueReference: 'zone_geom' },
          crs: { valueReference: 'proj' },
          reducer: { valueReference: 'hist_red' },
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

    const data = await res.json() as { result?: { SCL?: Record<string, number> } };
    return data.result?.SCL || {};
  }

  console.log('Querying SCL breakdowns for masked candidates...');
  const baseNonClear = await querySum('cand_base_nonclear');
  const curNonClear = await querySum('cand_cur_nonclear');
  console.log(`  Candidates masked by Baseline SCL non-clear: ${baseNonClear.toLocaleString()} px`);
  console.log(`  Candidates masked by Current SCL non-clear:  ${curNonClear.toLocaleString()} px`);

  const baseHist = await queryHist('scl_base', 'cand_base_nonclear');
  console.log(`  Baseline SCL class breakdown on masked candidates:`, JSON.stringify(baseHist));

  const curHist = await queryHist('scl_cur', 'cand_cur_nonclear');
  console.log(`  Current SCL class breakdown on masked candidates:`, JSON.stringify(curHist));

  await mongoose.disconnect();
}

analyzeSclMaskedCandidates().catch(console.error);
