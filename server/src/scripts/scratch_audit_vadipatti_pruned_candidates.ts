/**
 * Phase 5G: Forensic Audit of the 420 Pruned Persistent Candidates in Vadipatti Reserve
 * Script: scratch_audit_vadipatti_pruned_candidates.ts
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function auditVadipattiPrunedCandidates() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-260829-8997' }).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

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
    img_base: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200129T051041_20200129T052502_T43PHM' } },
      },
    },
    img_cur: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM' } },
      },
    },
    img_p1: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM' } },
      },
    },
    img_p2: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM' } },
      },
    },
    img_p3: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM' } },
      },
    },
  };

  const addNdvi = (key: string, imgKey: string) => {
    expr[`nir_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: imgKey }, bandSelectors: { constantValue: ['B8'] } },
      },
    };
    expr[`red_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: imgKey }, bandSelectors: { constantValue: ['B4'] } },
      },
    };
    expr[`ndvi_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.normalizedDifference',
        arguments: {
          input: {
            functionInvocationValue: {
              functionName: 'Image.addBands',
              arguments: { dstImg: { valueReference: `nir_${key}` }, srcImg: { valueReference: `red_${key}` } },
            },
          },
          bandNames: { constantValue: ['B8', 'B4'] },
        },
      },
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
        arguments: { input: { valueReference: imgKey }, bandSelectors: { constantValue: ['SCL'] } },
      },
    };
    expr[`clear_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.remap',
        arguments: {
          image: { valueReference: `scl_${key}` },
          from: { constantValue: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
          to: { constantValue: [0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0] },
          defaultValue: { constantValue: 0 },
        },
      },
    };
  };

  addClear('base', 'img_base');
  addClear('cur', 'img_cur');
  addClear('p1', 'img_p1');
  addClear('p2', 'img_p2');
  addClear('p3', 'img_p3');

  const addDelta = (key: string, targetKey: string) => {
    expr[`delta_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.subtract',
        arguments: { image1: { valueReference: `ndvi_${targetKey}` }, image2: { valueReference: 'ndvi_base' } },
      },
    };
  };

  addDelta('cur', 'cur');
  addDelta('p1', 'p1');
  addDelta('p2', 'p2');
  addDelta('p3', 'p3');

  expr['dist_signal'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: {
        image1: { valueReference: 'delta_cur' },
        image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } },
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

  expr['gee_clear_both'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_cur' } },
    },
  };

  expr['gee_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_signal' }, image2: { valueReference: 'gee_clear_both' } },
    },
  };

  expr['intersection'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'gee_cand_mask' } },
    },
  };

  // Trajectories
  expr['cond_p2_green'] = {
    functionInvocationValue: {
      functionName: 'Image.gt',
      arguments: { image1: { valueReference: 'delta_p2' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.05 } } } } },
    },
  };
  expr['cond_p1_leaf_off'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'clear_p1' },
        image2: { functionInvocationValue: { functionName: 'Image.lte', arguments: { image1: { valueReference: 'delta_p1' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.10 } } } } } } },
      },
    },
  };
  expr['cond_p3_recovery'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'clear_p3' },
        image2: { functionInvocationValue: { functionName: 'Image.gt', arguments: { image1: { valueReference: 'delta_p3' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.05 } } } } } } },
      },
    },
  };
  expr['seasonal_or_1'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'cond_p2_green' }, image2: { valueReference: 'cond_p1_leaf_off' } },
    },
  };
  expr['seasonal_conds'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'seasonal_or_1' }, image2: { valueReference: 'cond_p3_recovery' } },
    },
  };
  expr['seasonal_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'gee_cand_mask' }, image2: { valueReference: 'clear_p2' } },
          },
        },
        image2: { valueReference: 'seasonal_conds' },
      },
    },
  };

  expr['p2_lte_ref'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: { image1: { valueReference: 'delta_p2' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } } },
    },
  };
  expr['p3_lte_ref'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: { image1: { valueReference: 'delta_p3' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } } },
    },
  };
  expr['persistent_raw'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'clear_p2' }, image2: { valueReference: 'clear_p3' } },
          },
        },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'p2_lte_ref' }, image2: { valueReference: 'p3_lte_ref' } },
          },
        },
      },
    },
  };
  expr['persistent_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'gee_cand_mask' }, image2: { valueReference: 'persistent_raw' } },
          },
        },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'seasonal_mask' } } } },
      },
    },
  };

  expr['pers_in_inter'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'persistent_mask' }, image2: { valueReference: 'intersection' } },
    },
  };

  // Decoupled canopy guard
  expr['canopy_rule_1'] = {
    functionInvocationValue: {
      functionName: 'Image.gte',
      arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.40 } } } } },
    },
  };
  expr['canopy_rule_2'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { functionInvocationValue: { functionName: 'Image.eq', arguments: { image1: { valueReference: 'scl_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 4 } } } } } } },
        image2: { functionInvocationValue: { functionName: 'Image.gte', arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.30 } } } } } } },
      },
    },
  };
  expr['canopy_decoupled'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'canopy_rule_1' }, image2: { valueReference: 'canopy_rule_2' } },
    },
  };

  // Excluded Persistent Candidates: pers_in_inter && !canopy_decoupled
  expr['pers_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'pers_in_inter' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } },
      },
    },
  };

  // Histogram of SCL and NDVI of the 420 pruned pixels
  expr['scl_base_masked'] = {
    functionInvocationValue: {
      functionName: 'Image.updateMask',
      arguments: { image: { valueReference: 'scl_base' }, mask: { valueReference: 'pers_excluded' } },
    },
  };
  expr['ndvi_base_masked'] = {
    functionInvocationValue: {
      functionName: 'Image.updateMask',
      arguments: { image: { valueReference: 'ndvi_base' }, mask: { valueReference: 'pers_excluded' } },
    },
  };

  expr['scl_hist_red'] = {
    functionInvocationValue: {
      functionName: 'Reducer.frequencyHistogram',
      arguments: {},
    },
  };

  expr['reduce_scl_hist'] = {
    functionInvocationValue: {
      functionName: 'Image.reduceRegion',
      arguments: {
        image: { valueReference: 'scl_base_masked' },
        geometry: { valueReference: 'zone_geom' },
        crs: { valueReference: 'proj' },
        reducer: { valueReference: 'scl_hist_red' },
        maxPixels: { constantValue: 1000000000 },
      },
    },
  };

  // Also sample 5 representative pixels
  expr['pixel_lonlat'] = {
    functionInvocationValue: {
      functionName: 'Image.pixelLonLat',
      arguments: {},
    },
  };

  expr['feature_stack'] = {
    functionInvocationValue: {
      functionName: 'Image.addBands',
      arguments: {
        dstImg: {
          functionInvocationValue: {
            functionName: 'Image.addBands',
            arguments: {
              dstImg: {
                functionInvocationValue: {
                  functionName: 'Image.addBands',
                  arguments: {
                    dstImg: {
                      functionInvocationValue: {
                        functionName: 'Image.addBands',
                        arguments: {
                          dstImg: { valueReference: 'pixel_lonlat' },
                          srcImg: { valueReference: 'ndvi_base' },
                        },
                      },
                    },
                    srcImg: { valueReference: 'scl_base' },
                  },
                },
              },
              srcImg: { valueReference: 'delta_cur' },
            },
          },
        },
        srcImg: { valueReference: 'delta_p2' },
      },
    },
  };

  expr['masked_stack'] = {
    functionInvocationValue: {
      functionName: 'Image.updateMask',
      arguments: { image: { valueReference: 'feature_stack' }, mask: { valueReference: 'pers_excluded' } },
    },
  };

  expr['sample_pixels'] = {
    functionInvocationValue: {
      functionName: 'Image.sample',
      arguments: {
        image: { valueReference: 'masked_stack' },
        region: { valueReference: 'zone_geom' },
        scale: { constantValue: 10 },
        numPixels: { constantValue: 5 },
        seed: { constantValue: 42 },
      },
    },
  };

  console.log('Querying Earth Engine for SCL breakdown of Vadipatti pruned pixels...');
  const resHist = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'reduce_scl_hist' } }),
  });
  const dataHist = await resHist.json();
  console.log('SCL Histogram of 420 Pruned Pixels in Vadipatti:', (dataHist as any).result);

  console.log('\nSampling 5 representative pruned pixels...');
  const resSample = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'sample_pixels' } }),
  });
  const dataSample = await resSample.json();
  console.log('Sampled Pixels:', JSON.stringify((dataSample as any).result, null, 2));

  await mongoose.disconnect();
}

auditVadipattiPrunedCandidates().catch(console.error);
