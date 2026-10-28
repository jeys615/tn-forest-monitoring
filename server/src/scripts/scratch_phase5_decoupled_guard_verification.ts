/**
 * Phase 5A: Exact Verification of Decoupled Canopy Guard
 * Script: scratch_phase5_decoupled_guard_verification.ts
 *
 * Evaluates:
 * 1. SCL Validity rule: SCL_base in [2, 4, 5, 6, 7] = Clear, else Obscured
 * 2. Decoupled Canopy Guard on Clear pixels:
 *    Canopy = (NDVI_base >= 0.40) || (SCL_base == 4 && NDVI_base >= 0.30)
 * 3. Pre-Screened Non-Forest = Clear && !Canopy
 * 4. Exact category transitions across Seasonal, Persistent, Uncertain
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function runDecoupledVerification() {
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

  const addDelta = (key: string, targetKey: string) => {
    expr[`delta_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.subtract',
        arguments: { image1: { valueReference: `ndvi_${targetKey}` }, image2: { valueReference: 'ndvi_base' } }
      }
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
        image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } }
      }
    }
  };

  // Local screening heuristic
  ['base', 'cur'].forEach(k => {
    expr[`b2_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B2'] } }
      }
    };
    expr[`b4_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B4'] } }
      }
    };
    expr[`b8_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B8'] } }
      }
    };
    expr[`b11_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['B11'] } }
      }
    };

    expr[`local_cloud_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { functionInvocationValue: { functionName: 'Image.gt', arguments: { image1: { valueReference: `b2_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 2000 } } } } } } },
          image2: { functionInvocationValue: { functionName: 'Image.gt', arguments: { image1: { valueReference: `b4_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 1500 } } } } } } }
        }
      }
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
                image2: { functionInvocationValue: { functionName: 'Image.lt', arguments: { image1: { valueReference: `b11_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 800 } } } } } } }
              }
            }
          },
          image2: { functionInvocationValue: { functionName: 'Image.lt', arguments: { image1: { valueReference: `b4_${k}` }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 600 } } } } } } }
        }
      }
    };

    expr[`local_excluded_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.or',
        arguments: { image1: { valueReference: `local_cloud_${k}` }, image2: { valueReference: `local_shadow_${k}` } }
      }
    };
  });

  expr[`local_screened`] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'local_excluded_base' }, image2: { valueReference: 'local_excluded_cur' } }
    }
  };

  expr['local_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'dist_signal' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'local_screened' } } } }
      }
    }
  };

  expr['gee_clear_both'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_cur' } }
    }
  };
  expr['gee_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_signal' }, image2: { valueReference: 'gee_clear_both' } }
    }
  };
  expr['intersection'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'gee_cand_mask' } }
    }
  };
  expr['local_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'local_cand_mask' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'gee_cand_mask' } } } }
      }
    }
  };

  // Trajectories
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
  expr['cond_p3_recovery'] = {
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
      arguments: { image1: { valueReference: 'seasonal_or_1' }, image2: { valueReference: 'cond_p3_recovery' } }
    }
  };
  expr['seasonal_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'gee_cand_mask' }, image2: { valueReference: 'clear_p2' } }
          }
        },
        image2: { valueReference: 'seasonal_conds' }
      }
    }
  };

  expr['p2_lte_ref'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: { image1: { valueReference: 'delta_p2' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } } }
    }
  };
  expr['p3_lte_ref'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: { image1: { valueReference: 'delta_p3' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: -0.15 } } } } }
    }
  };
  expr['persistent_raw'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'clear_p2' }, image2: { valueReference: 'clear_p3' } }
          }
        },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'p2_lte_ref' }, image2: { valueReference: 'p3_lte_ref' } }
          }
        }
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
            arguments: { image1: { valueReference: 'gee_cand_mask' }, image2: { valueReference: 'persistent_raw' } }
          }
        },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'seasonal_mask' } } } }
      }
    }
  };

  expr['seas_in_inter'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'seasonal_mask' }, image2: { valueReference: 'intersection' } }
    }
  };
  expr['pers_in_inter'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'persistent_mask' }, image2: { valueReference: 'intersection' } }
    }
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
                  arguments: { image1: { valueReference: 'seas_in_inter' }, image2: { valueReference: 'pers_in_inter' } }
                }
              }
            }
          }
        }
      }
    }
  };

  // --------------------------------------------------------------------------
  // DECOUPLED GUARD:
  // Base observation MUST be clear: clear_base == 1 (SCL in 2, 4, 5, 6, 7)
  // Canopy: (NDVI_base >= 0.40) || (SCL_base == 4 && NDVI_base >= 0.30)
  // --------------------------------------------------------------------------
  expr['canopy_rule_1'] = {
    functionInvocationValue: {
      functionName: 'Image.gte',
      arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.40 } } } } }
    }
  };
  expr['canopy_rule_2'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { functionInvocationValue: { functionName: 'Image.eq', arguments: { image1: { valueReference: 'scl_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 4 } } } } } } },
        image2: { functionInvocationValue: { functionName: 'Image.gte', arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.30 } } } } } } }
      }
    }
  };
  expr['canopy_decoupled'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'canopy_rule_1' }, image2: { valueReference: 'canopy_rule_2' } }
    }
  };

  // Pre-screened Non-Forest: Clear baseline observation, but NOT canopy
  expr['prescreened_non_forest'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'clear_base' } }
          }
        },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } }
      }
    }
  };

  // Observation-Obscured at Baseline: Not clear at baseline (local_only = SCL 3 or 8)
  expr['baseline_obscured'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'local_cand_mask' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'clear_base' } } } }
      }
    }
  };

  // Retained for Canopy Disturbance Evaluation
  expr['retained_canopy_eval'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'clear_base' } }
          }
        },
        image2: { valueReference: 'canopy_decoupled' }
      }
    }
  };

  // Impact on Persistent Candidates:
  // Retained Persistent = pers_in_inter && canopy_decoupled
  expr['pers_decoupled_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'pers_in_inter' }, image2: { valueReference: 'canopy_decoupled' } }
    }
  };
  // Excluded Persistent = pers_in_inter && !canopy_decoupled (Pre-screened non-forest)
  expr['pers_decoupled_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'pers_in_inter' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } }
      }
    }
  };

  // Impact on Seasonal Candidates:
  expr['seas_decoupled_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'seas_in_inter' }, image2: { valueReference: 'canopy_decoupled' } }
    }
  };
  expr['seas_decoupled_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'seas_in_inter' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } }
      }
    }
  };

  // Impact on Uncertain Candidates:
  expr['unc_decoupled_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'unc_in_inter' }, image2: { valueReference: 'canopy_decoupled' } }
    }
  };
  expr['unc_decoupled_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'unc_in_inter' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'canopy_decoupled' } } } }
      }
    }
  };

  // Chained reduction
  const countKeys = [
    'local_cand_mask',
    'clear_base',
    'baseline_obscured',
    'retained_canopy_eval',
    'prescreened_non_forest',
    'pers_decoupled_retained',
    'pers_decoupled_excluded',
    'seas_decoupled_retained',
    'seas_decoupled_excluded',
    'unc_decoupled_retained',
    'unc_decoupled_excluded',
  ];

  expr[`renamed_${countKeys[0]}`] = {
    functionInvocationValue: {
      functionName: 'Image.rename',
      arguments: { input: { valueReference: countKeys[0] }, names: { constantValue: [countKeys[0]] } }
    }
  };
  let curStack = `renamed_${countKeys[0]}`;

  for (let i = 1; i < countKeys.length; i++) {
    const k = countKeys[i];
    const renamedK = `renamed_${k}`;
    expr[renamedK] = {
      functionInvocationValue: {
        functionName: 'Image.rename',
        arguments: { input: { valueReference: k }, names: { constantValue: [k] } }
      }
    };
    const stackK = `stack_count_${i}`;
    expr[stackK] = {
      functionInvocationValue: {
        functionName: 'Image.addBands',
        arguments: { dstImg: { valueReference: curStack }, srcImg: { valueReference: renamedK } }
      }
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
        reducer: { valueReference: 'sum_red' },
        maxPixels: { constantValue: 1000000000 }
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'reduction_counts' } }),
  });
  const data = await res.json() as { result?: Record<string, number> };
  const counts = data.result || {};

  console.log('================================================================');
  console.log('🔬 DECOUPLED CANOPY GUARD: EXACT EMPIRICAL REDUCTIONS');
  console.log('================================================================\n');
  console.log(`Total Canonical Candidate Pool:  ${counts['local_cand_mask']} px`);
  console.log(`  - Baseline Obscured (Cloud/Shadow): ${counts['baseline_obscured']} px (100% routed to Uncertain)`);
  console.log(`  - Baseline Clear Observations:      ${counts['clear_base']} px`);
  console.log(`\nCanopy Pre-Filter on Clear Observations:`);
  console.log(`  - Retained for Canopy Evaluation:   ${counts['retained_canopy_eval']} px`);
  console.log(`  - Pre-Screened Non-Forest:          ${counts['prescreened_non_forest']} px`);
  console.log(`  - Sum check: ${counts['retained_canopy_eval'] + counts['prescreened_non_forest']} == ${counts['clear_base']}`);

  console.log(`\nPersistent Candidates Impact (Original = 4,315 px):`);
  console.log(`  - Retained as Persistent: ${counts['pers_decoupled_retained']} px`);
  console.log(`  - Excluded to Pre-Screened: ${counts['pers_decoupled_excluded']} px`);
  console.log(`  - Sum: ${counts['pers_decoupled_retained'] + counts['pers_decoupled_excluded']} == 4,315`);

  console.log(`\nSeasonal Candidates Impact (Original = 110,652 px):`);
  console.log(`  - Retained as Seasonal: ${counts['seas_decoupled_retained']} px`);
  console.log(`  - Excluded to Pre-Screened: ${counts['seas_decoupled_excluded']} px`);
  console.log(`  - Sum: ${counts['seas_decoupled_retained'] + counts['seas_decoupled_excluded']} == 110,652`);

  console.log(`\nUncertain Candidates Impact (Intersection = 19,038 px):`);
  console.log(`  - Retained as Uncertain: ${counts['unc_decoupled_retained']} px`);
  console.log(`  - Excluded to Pre-Screened: ${counts['unc_decoupled_excluded']} px`);
  console.log(`  - Sum: ${counts['unc_decoupled_retained'] + counts['unc_decoupled_excluded']} == 19,038`);

  await mongoose.disconnect();
}

runDecoupledVerification().catch(console.error);
