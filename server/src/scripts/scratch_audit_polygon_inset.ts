/**
 * Audit the proposed 0.5m polygon inset vs GDAL rasterization
 * Measures:
 *   - Removed zone pixels
 *   - Affected candidates
 *   - Affected persistent candidates
 *
 * READ-ONLY: ZERO modifications.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function auditPolygonInset() {
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
    // 0.5m inset polygon: buffer(-0.5)
    inset_geom_0_5m: {
      functionInvocationValue: {
        functionName: 'Geometry.buffer',
        arguments: {
          geometry: { valueReference: 'zone_geom' },
          distance: { constantValue: -0.5 }
        }
      }
    },
    // 1.0m inset polygon: buffer(-1.0)
    inset_geom_1m: {
      functionInvocationValue: {
        functionName: 'Geometry.buffer',
        arguments: {
          geometry: { valueReference: 'zone_geom' },
          distance: { constantValue: -1.0 }
        }
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
    const_img: {
      functionInvocationValue: {
        functionName: 'Image.constant',
        arguments: { value: { constantValue: 1 } }
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

  const addNdvi = (key: string, imgKey: string) => {
    expr[`nir_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: imgKey }, bandSelectors: { constantValue: ['B8'] } }
      }
    };
    expr[`red_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: imgKey }, bandSelectors: { constantValue: ['B4'] } }
      }
    };
    expr[`ndvi_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.normalizedDifference',
        arguments: {
          input: {
            functionInvocationValue: {
              functionName: 'Image.addBands',
              arguments: { dstImg: { valueReference: `nir_${key}` }, srcImg: { valueReference: `red_${key}` } }
            }
          },
          bandNames: { constantValue: ['B8', 'B4'] }
        }
      }
    };
  };

  addNdvi('base', 'img_base');
  addNdvi('cur', 'img_cur');
  addNdvi('p1', 'img_p1');
  addNdvi('p2', 'img_p2');
  addNdvi('p3', 'img_p3');

  const addClear = (key: string, imgKey: string) => {
    expr[`scl_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: imgKey }, bandSelectors: { constantValue: ['SCL'] } }
      }
    };
    expr[`clear_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.remap',
        arguments: {
          image: { valueReference: `scl_${key}` },
          from: { constantValue: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
          to: { constantValue: [0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0] },
          defaultValue: { constantValue: 0 }
        }
      }
    };
  };

  addClear('base', 'img_base');
  addClear('cur', 'img_cur');
  addClear('p1', 'img_p1');
  addClear('p2', 'img_p2');
  addClear('p3', 'img_p3');

  expr['delta_cur'] = {
    functionInvocationValue: {
      functionName: 'Image.subtract',
      arguments: { image1: { valueReference: 'ndvi_cur' }, image2: { valueReference: 'ndvi_base' } }
    }
  };
  expr['delta_p1'] = {
    functionInvocationValue: {
      functionName: 'Image.subtract',
      arguments: { image1: { valueReference: 'ndvi_p1' }, image2: { valueReference: 'ndvi_base' } }
    }
  };
  expr['delta_p2'] = {
    functionInvocationValue: {
      functionName: 'Image.subtract',
      arguments: { image1: { valueReference: 'ndvi_p2' }, image2: { valueReference: 'ndvi_base' } }
    }
  };
  expr['delta_p3'] = {
    functionInvocationValue: {
      functionName: 'Image.subtract',
      arguments: { image1: { valueReference: 'ndvi_p3' }, image2: { valueReference: 'ndvi_base' } }
    }
  };

  expr['dist_signal'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: {
        image1: { valueReference: 'delta_cur' },
        image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } }
      }
    }
  };
  expr['scl_both'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_cur' } }
    }
  };
  expr['cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_signal' }, image2: { valueReference: 'scl_both' } }
    }
  };

  // Persistent candidates (-0.15)
  expr['p2_drop'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: { image1: { valueReference: 'delta_p2' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } } }
    }
  };
  expr['p3_drop'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: { image1: { valueReference: 'delta_p3' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } } }
    }
  };
  expr['cond_p2_green'] = {
    functionInvocationValue: {
      functionName: 'Image.gt',
      arguments: { image1: { valueReference: 'delta_p2' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.05 } } } } }
    }
  };
  expr['cond_p1_leaf_off'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'clear_p1' },
        image2: { functionInvocationValue: { functionName: 'Image.lte', arguments: { image1: { valueReference: 'delta_p1' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.10 } } } } } } }
      }
    }
  };
  expr['cond_p3_rec'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'clear_p3' },
        image2: { functionInvocationValue: { functionName: 'Image.gt', arguments: { image1: { valueReference: 'delta_p3' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.05 } } } } } } }
      }
    }
  };
  expr['seasonal_or_1'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'cond_p2_green' }, image2: { valueReference: 'cond_p1_leaf_off' } }
    }
  };
  expr['seasonal_conds'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'seasonal_or_1' }, image2: { valueReference: 'cond_p3_rec' } }
    }
  };
  expr['seasonal_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p2' } }
          }
        },
        image2: { valueReference: 'seasonal_conds' }
      }
    }
  };

  expr['persistent_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: {
              image1: {
                functionInvocationValue: {
                  functionName: 'Image.and',
                  arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p2' } }
                }
              },
              image2: {
                functionInvocationValue: {
                  functionName: 'Image.and',
                  arguments: { image1: { valueReference: 'clear_p3' }, image2: { valueReference: 'p2_drop' } }
                }
              }
            }
          }
        },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: {
              image1: { valueReference: 'p3_drop' },
              image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'seasonal_mask' } } } }
            }
          }
        }
      }
    }
  };

  async function query(geomNode: string, imgNode: string): Promise<number> {
    const exprCopy = { ...expr };
    exprCopy['reduction'] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: imgNode },
          geometry: { valueReference: geomNode },
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

  console.log('Querying zone and candidate counts under unbuffered vs inset polygons...');
  const zoneOrig = await query('zone_geom', 'const_img');
  const zone05m = await query('inset_geom_0_5m', 'const_img');
  const zone1m = await query('inset_geom_1m', 'const_img');

  const candOrig = await query('zone_geom', 'cand_mask');
  const cand05m = await query('inset_geom_0_5m', 'cand_mask');
  const cand1m = await query('inset_geom_1m', 'cand_mask');

  const persOrig = await query('zone_geom', 'persistent_mask');
  const pers05m = await query('inset_geom_0_5m', 'persistent_mask');
  const pers1m = await query('inset_geom_1m', 'persistent_mask');

  console.log('\n--- 1. ZONE PIXELS ---');
  console.log(`Original Zone Boundary:      ${zoneOrig.toLocaleString()} px`);
  console.log(`0.5m Inset Polygon:          ${zone05m.toLocaleString()} px (Removed: ${zoneOrig - zone05m} px)`);
  console.log(`1.0m Inset Polygon:          ${zone1m.toLocaleString()} px (Removed: ${zoneOrig - zone1m} px)`);

  console.log('\n--- 2. CANDIDATE PIXELS ---');
  console.log(`Original Candidates:         ${candOrig.toLocaleString()} px`);
  console.log(`0.5m Inset Candidates:       ${cand05m.toLocaleString()} px (Removed: ${candOrig - cand05m} px)`);
  console.log(`1.0m Inset Candidates:       ${cand1m.toLocaleString()} px (Removed: ${candOrig - cand1m} px)`);

  console.log('\n--- 3. PERSISTENT CANDIDATES (θ = -0.15) ---');
  console.log(`Original Persistent:         ${persOrig.toLocaleString()} px`);
  console.log(`0.5m Inset Persistent:       ${pers05m.toLocaleString()} px (Removed: ${persOrig - pers05m} px)`);
  console.log(`1.0m Inset Persistent:       ${pers1m.toLocaleString()} px (Removed: ${persOrig - pers1m} px)`);

  await mongoose.disconnect();
}

auditPolygonInset().catch(console.error);
