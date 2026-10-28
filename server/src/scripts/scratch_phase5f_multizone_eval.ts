/**
 * Phase 5F: Three-Zone Multi-Zone Shadow Validation
 * Script: scratch_phase5f_multizone_eval.ts
 *
 * READ-ONLY evaluation of Algorithm v2.0 vs v2.1-SHADOW across:
 * 1. Sirumalai Hills (ZONE-261011-6340)
 * 2. Vadipatti Reserve (ZONE-260829-8997)
 * 3. Sathiyar Basin (ZONE-260829-8998)
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import {
  CanopyGuardShadowService,
  type ShadowAccountingModel,
} from '../services/changeDetection/CanopyGuardShadowService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

interface ZoneConfig {
  zoneId: string;
  name: string;
  baselineImageId: string;
  currentImageId: string;
  p1ImageId: string;
  p2ImageId: string;
  p3ImageId: string;
}

async function runMultiZoneValidation() {
  console.log('================================================================');
  console.log('🛰️ PHASE 5F: THREE-ZONE SHADOW VALIDATION (v2.0 vs v2.1-SHADOW)');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;
  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];

  const zonesToEvaluate: ZoneConfig[] = [
    {
      zoneId: 'ZONE-261011-6340',
      name: 'Sirumalai Hills Reserve Forest',
      baselineImageId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
      currentImageId: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM',
      p1ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM',
      p2ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM',
      p3ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM',
    },
    {
      zoneId: 'ZONE-260829-8997',
      name: 'Vadipatti Reserve',
      baselineImageId: 'COPERNICUS/S2_SR_HARMONIZED/20200129T051041_20200129T052502_T43PHM',
      currentImageId: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM',
      p1ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM',
      p2ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM',
      p3ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM',
    },
    {
      zoneId: 'ZONE-260829-8998',
      name: 'Sathiyar Basin',
      baselineImageId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
      currentImageId: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM',
      p1ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM',
      p2ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM',
      p3ImageId: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM',
    },
  ];

  const results: Record<string, any> = {};

  for (const zc of zonesToEvaluate) {
    console.log(`\n================================================================`);
    console.log(`▶ Evaluating Zone: ${zc.name} (${zc.zoneId})`);
    console.log(`  Baseline Scene: ${zc.baselineImageId}`);
    console.log(`  Current Scene:  ${zc.currentImageId}`);
    console.log(`================================================================`);

    const zone = await Zone.findOne({ zoneId: zc.zoneId }).lean();
    if (!zone) {
      console.error(`Zone ${zc.zoneId} not found in database!`);
      continue;
    }
    const boundary = zone.boundary as GeoJSONPolygon;

    // Check suitability of scenes first
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
          arguments: { id: { constantValue: zc.baselineImageId } },
        },
      },
      img_cur: {
        functionInvocationValue: {
          functionName: 'Image.load',
          arguments: { id: { constantValue: zc.currentImageId } },
        },
      },
      img_p1: {
        functionInvocationValue: {
          functionName: 'Image.load',
          arguments: { id: { constantValue: zc.p1ImageId } },
        },
      },
      img_p2: {
        functionInvocationValue: {
          functionName: 'Image.load',
          arguments: { id: { constantValue: zc.p2ImageId } },
        },
      },
      img_p3: {
        functionInvocationValue: {
          functionName: 'Image.load',
          arguments: { id: { constantValue: zc.p3ImageId } },
        },
      },
    };

    // Helper to calculate NDVI
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

    // Helper for SCL and Clear mask
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

    // Delta NDVI: cur - base
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

    // Disturbance signal: ΔNDVI <= -0.15
    expr['dist_signal'] = {
      functionInvocationValue: {
        functionName: 'Image.lte',
        arguments: {
          image1: { valueReference: 'delta_cur' },
          image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } },
        },
      },
    };

    // Canonical local screening heuristic (M4 / production local detector)
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

    // Local candidate pool = ΔNDVI <= -0.15 && !local_screened
    expr['local_cand_mask'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: 'dist_signal' },
          image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'local_screened' } } } },
        },
      },
    };

    // Both Clear in GEE (SCL base & cur)
    expr['gee_clear_both'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_cur' } },
      },
    };

    // GEE candidate mask
    expr['gee_cand_mask'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'dist_signal' }, image2: { valueReference: 'gee_clear_both' } },
      },
    };

    // Intersection
    expr['intersection'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'gee_cand_mask' } },
      },
    };

    // Trajectories for Phenological Validation
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

    // Subsets in intersection
    expr['seas_in_inter'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'seasonal_mask' }, image2: { valueReference: 'intersection' } },
      },
    };
    expr['pers_in_inter'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'persistent_mask' }, image2: { valueReference: 'intersection' } },
      },
    };
    expr['unc_in_inter'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: 'intersection' },
          image2: {
            functionInvocationValue: {
              functionName: 'Image.not',
              arguments: {
                value: {
                  functionInvocationValue: {
                    functionName: 'Image.or',
                    arguments: { image1: { valueReference: 'seas_in_inter' }, image2: { valueReference: 'pers_in_inter' } },
                  },
                },
              },
            },
          },
        },
      },
    };

    // Local-only candidates (not clear in GEE -> 100% uncertain)
    expr['local_only'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: 'local_cand_mask' },
          image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'gee_cand_mask' } } } },
        },
      },
    };

    // DECOUPLED CANOPY GUARD:
    // clear_base == 1
    // (NDVI_base >= 0.40) || (SCL_base == 4 && NDVI_base >= 0.30)
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

    // Pre-screened Non-Forest: Clear baseline, in candidate pool, but NOT canopy
    expr['prescreened_non_forest'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: {
            functionInvocationValue: {
              functionName: 'Image.and',
              arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'clear_base' } },
            },
          },
          image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } },
        },
      },
    };

    // Retained for Canopy Evaluation
    expr['retained_canopy_eval'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: {
            functionInvocationValue: {
              functionName: 'Image.and',
              arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'clear_base' } },
            },
          },
          image2: { valueReference: 'canopy_decoupled' },
        },
      },
    };

    // Persistent impact
    expr['pers_v21_retained'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'pers_in_inter' }, image2: { valueReference: 'canopy_decoupled' } },
      },
    };
    expr['pers_v21_excluded'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: 'pers_in_inter' },
          image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } },
        },
      },
    };

    // Seasonal impact
    expr['seas_v21_retained'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'seas_in_inter' }, image2: { valueReference: 'canopy_decoupled' } },
      },
    };
    expr['seas_v21_excluded'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: 'seas_in_inter' },
          image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } },
        },
      },
    };

    // Uncertain impact (in intersection)
    expr['unc_v21_retained'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'unc_in_inter' }, image2: { valueReference: 'canopy_decoupled' } },
      },
    };
    expr['unc_v21_excluded'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: 'unc_in_inter' },
          image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } },
        },
      },
    };

    // Baseline obscured (local-only cloud/shadow)
    expr['baseline_obscured'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: 'local_cand_mask' },
          image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'clear_base' } } } },
        },
      },
    };

    // Total Zone Pixel Area (constant 1 mask over zone)
    expr['zone_pixels'] = {
      functionInvocationValue: {
        functionName: 'Image.constant',
        arguments: { value: { constantValue: 1 } },
      },
    };

    // Clear pixels in base and cur across zone
    expr['zone_clear_base'] = {
      valueReference: 'clear_base',
    };
    expr['zone_clear_cur'] = {
      valueReference: 'clear_cur',
    };

    const countKeys = [
      'zone_pixels',
      'zone_clear_base',
      'zone_clear_cur',
      'local_cand_mask',
      'gee_cand_mask',
      'intersection',
      'local_only',
      'clear_base',
      'baseline_obscured',
      'retained_canopy_eval',
      'prescreened_non_forest',
      'seas_in_inter',
      'pers_in_inter',
      'unc_in_inter',
      'pers_v21_retained',
      'pers_v21_excluded',
      'seas_v21_retained',
      'seas_v21_excluded',
      'unc_v21_retained',
      'unc_v21_excluded',
    ];

    expr[`renamed_${countKeys[0]}`] = {
      functionInvocationValue: {
        functionName: 'Image.rename',
        arguments: { input: { valueReference: countKeys[0] }, names: { constantValue: [countKeys[0]] } },
      },
    };
    let curStack = `renamed_${countKeys[0]}`;

    for (let i = 1; i < countKeys.length; i++) {
      const k = countKeys[i];
      const renamedK = `renamed_${k}`;
      expr[renamedK] = {
        functionInvocationValue: {
          functionName: 'Image.rename',
          arguments: { input: { valueReference: k }, names: { constantValue: [k] } },
        },
      };
      const stackK = `stack_count_${i}`;
      expr[stackK] = {
        functionInvocationValue: {
          functionName: 'Image.addBands',
          arguments: { dstImg: { valueReference: curStack }, srcImg: { valueReference: renamedK } },
        },
      };
      curStack = stackK;
    }

    expr['reduction_counts'] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: curStack },
          geometry: { valueReference: 'zone_geom' },
          crs: { valueReference: 'proj' },
          reducer: { valueReference: 'unweighted_sum' },
          maxPixels: { constantValue: 1000000000 },
        },
      },
    };

    console.log(`  Calling Earth Engine API (value:compute)...`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': config.projectId,
      },
      body: JSON.stringify({ expression: { values: expr, result: 'reduction_counts' } }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`  ✘ Earth Engine API error for ${zc.zoneId}: ${res.status} ${errText}`);
      continue;
    }

    const data = (await res.json()) as { result?: Record<string, number> };
    const counts = data.result || {};

    // Derive v2.0 accounting
    const pool = counts['local_cand_mask'] || 0;
    const v20Seasonal = counts['seas_in_inter'] || 0;
    const v20Persistent = counts['pers_in_inter'] || 0;
    // v2.0 Uncertain = (unc_in_inter) + (local_only)
    const uncInter = counts['unc_in_inter'] || 0;
    const localOnly = counts['local_only'] || 0;
    const v20Uncertain = uncInter + localOnly;
    const v20PreScreened = 0;

    // Derive v2.1-SHADOW accounting
    const v21Seasonal = counts['seas_v21_retained'] || 0;
    const v21Persistent = counts['pers_v21_retained'] || 0;
    const v21PreScreened = counts['prescreened_non_forest'] || 0;
    const v21Uncertain = (counts['unc_v21_retained'] || 0) + localOnly;

    // Excluded breakdown
    const persExcluded = counts['pers_v21_excluded'] || 0;
    const seasExcluded = counts['seas_v21_excluded'] || 0;
    const uncExcluded = counts['unc_v21_excluded'] || 0;

    // Observable subsets
    const fullyObservable = counts['intersection'] || 0;
    const outcomeDeterminedV20 = v20Seasonal + v20Persistent;
    const outcomeDeterminedV21 = v21Seasonal + v21Persistent;

    // Verify 4-way partition conservation
    const v20Sum = v20Seasonal + v20Persistent + v20Uncertain + v20PreScreened;
    const v21Sum = v21Seasonal + v21Persistent + v21Uncertain + v21PreScreened;

    const v20Conservation = v20Sum === pool;
    const v21Conservation = v21Sum === pool;

    const v21Accounting = CanopyGuardShadowService.computeAccountingModel({
      fullCandidatePool: pool,
      fullyObservableSubset: fullyObservable,
      seasonalCount: v21Seasonal,
      persistentCount: v21Persistent,
      uncertainCount: v21Uncertain,
      preScreenedNonForestCount: v21PreScreened,
    });

    results[zc.zoneId] = {
      zoneId: zc.zoneId,
      name: zc.name,
      totalZonePixels: counts['zone_pixels'] || 0,
      clearBasePixels: counts['zone_clear_base'] || 0,
      clearCurPixels: counts['zone_clear_cur'] || 0,
      candidatePool: pool,
      fullyObservable,
      v20: {
        seasonal: v20Seasonal,
        persistent: v20Persistent,
        uncertain: v20Uncertain,
        preScreened: v20PreScreened,
        outcomeDetermined: outcomeDeterminedV20,
        sum: v20Sum,
        conservationValid: v20Conservation,
      },
      v21: {
        seasonal: v21Seasonal,
        persistent: v21Persistent,
        uncertain: v21Uncertain,
        preScreened: v21PreScreened,
        outcomeDetermined: outcomeDeterminedV21,
        sum: v21Sum,
        conservationValid: v21Conservation,
        accounting: v21Accounting,
      },
      transitions: {
        persistentToPreScreened: persExcluded,
        seasonalToPreScreened: seasExcluded,
        uncertainToPreScreened: uncExcluded,
        totalPreScreened: v21PreScreened,
        sumCheck: persExcluded + seasExcluded + uncExcluded === v21PreScreened,
      },
      rawCounts: counts,
    };

    console.log(`\n  --- QUANTITATIVE RESULTS FOR ${zc.zoneId} ---`);
    console.log(`  Total Zone Pixels:            ${counts['zone_pixels']} px (${((counts['zone_pixels'] || 0) * 0.01).toFixed(2)} ha)`);
    console.log(`  Candidate Pool (Pool Denom):   ${pool} px (${(pool * 0.01).toFixed(2)} ha)`);
    console.log(`  Fully Observable Subset:       ${fullyObservable} px (${(fullyObservable * 0.01).toFixed(2)} ha)`);
    console.log(`\n  Algorithm v2.0 (Official Authority):`);
    console.log(`    - Seasonal Fluctuation:      ${v20Seasonal} px (${(v20Seasonal * 0.01).toFixed(2)} ha, ${((v20Seasonal / pool) * 100).toFixed(2)}%)`);
    console.log(`    - Persistent Candidates:     ${v20Persistent} px (${(v20Persistent * 0.01).toFixed(2)} ha, ${((v20Persistent / pool) * 100).toFixed(2)}%)`);
    console.log(`    - Uncertain / Obscured:      ${v20Uncertain} px (${(v20Uncertain * 0.01).toFixed(2)} ha, ${((v20Uncertain / pool) * 100).toFixed(2)}%)`);
    console.log(`    - Pre-Screened Non-Forest:   ${v20PreScreened} px (0.00 ha, 0.00%)`);
    console.log(`    - Sum == Pool Check:         ${v20Sum} == ${pool} (${v20Conservation ? 'VALID' : 'FAIL'})`);
    console.log(`\n  Algorithm v2.1-SHADOW (Evaluation):`);
    console.log(`    - Seasonal Fluctuation:      ${v21Seasonal} px (${(v21Seasonal * 0.01).toFixed(2)} ha, ${((v21Seasonal / pool) * 100).toFixed(2)}%)`);
    console.log(`    - Persistent Candidates:     ${v21Persistent} px (${(v21Persistent * 0.01).toFixed(2)} ha, ${((v21Persistent / pool) * 100).toFixed(2)}%)`);
    console.log(`    - Uncertain / Obscured:      ${v21Uncertain} px (${(v21Uncertain * 0.01).toFixed(2)} ha, ${((v21Uncertain / pool) * 100).toFixed(2)}%)`);
    console.log(`    - Pre-Screened Non-Forest:   ${v21PreScreened} px (${(v21PreScreened * 0.01).toFixed(2)} ha, ${((v21PreScreened / pool) * 100).toFixed(2)}%)`);
    console.log(`    - Sum == Pool Check:         ${v21Sum} == ${pool} (${v21Conservation ? 'VALID' : 'FAIL'})`);
    console.log(`\n  Category Transitions (v2.0 -> v2.1-SHADOW):`);
    console.log(`    - Persistent -> Pre-Screened: ${persExcluded} px`);
    console.log(`    - Seasonal   -> Pre-Screened: ${seasExcluded} px`);
    console.log(`    - Uncertain  -> Pre-Screened: ${uncExcluded} px`);
    console.log(`    - Sum Check:                  ${persExcluded + seasExcluded + uncExcluded} == ${v21PreScreened} (${persExcluded + seasExcluded + uncExcluded === v21PreScreened ? 'CONSERVED' : 'DISCREPANCY'})`);
  }

  await mongoose.disconnect();
}

runMultiZoneValidation().catch((err) => {
  console.error('Fatal error in multi-zone validation:', err);
  process.exit(1);
});
