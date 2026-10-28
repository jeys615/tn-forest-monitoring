/**
 * Phase 4: Baseline Canopy Filter Impact Assessment
 * Script: scratch_phase4_canopy_filter_assessment.ts
 *
 * READ-ONLY ANALYSIS:
 * Evaluates the proposed guard `NDVI_base >= 0.40 AND SCL_base == 4`
 * against the canonical candidate pool of 135,489 pixels.
 * Uses chained Image.addBands + Reducer.sum() for single-call batching of all counts.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function runAssessment() {
  console.log('================================================================');
  console.log('🌲 PHASE 4: BASELINE CANOPY FILTER IMPACT ASSESSMENT (CHAINED BATCH)');
  console.log('================================================================\n');

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

  // Primary Disturbance signal (<= -0.15)
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

  // Local candidate mask (135,489 px)
  expr['local_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'dist_signal' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'local_screened' } } } }
      }
    }
  };

  // GEE clear both
  expr['gee_clear_both'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_cur' } }
    }
  };

  // GEE candidate mask (134,957 px)
  expr['gee_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_signal' }, image2: { valueReference: 'gee_clear_both' } }
    }
  };

  // Intersection (134,005 px)
  expr['intersection'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'gee_cand_mask' } }
    }
  };

  // Local-only candidates (1,484 px)
  expr['local_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'local_cand_mask' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'gee_cand_mask' } } } }
      }
    }
  };

  // Trajectory: Seasonal
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

  // Trajectory: Persistent (theta = -0.15)
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

  // Category masks in intersection:
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
  // PROPOSED GUARD: NDVI_base >= 0.40 AND SCL_base == 4
  // --------------------------------------------------------------------------
  expr['guard_ndvi_ge_040'] = {
    functionInvocationValue: {
      functionName: 'Image.gte',
      arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.40 } } } } }
    }
  };
  expr['guard_scl_eq_4'] = {
    functionInvocationValue: {
      functionName: 'Image.eq',
      arguments: { image1: { valueReference: 'scl_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 4 } } } } }
    }
  };
  expr['guard_pass'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'guard_ndvi_ge_040' }, image2: { valueReference: 'guard_scl_eq_4' } }
    }
  };
  expr['guard_fail'] = {
    functionInvocationValue: {
      functionName: 'Image.not',
      arguments: { value: { valueReference: 'guard_pass' } }
    }
  };

  // 1. Overall Candidate Pool: Retained vs Excluded
  expr['cand_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'guard_pass' } }
    }
  };
  expr['cand_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'guard_fail' } }
    }
  };

  // 2. By Category: Retained & Excluded
  // Seasonal
  expr['seas_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'seas_in_inter' }, image2: { valueReference: 'guard_pass' } }
    }
  };
  expr['seas_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'seas_in_inter' }, image2: { valueReference: 'guard_fail' } }
    }
  };
  // Persistent
  expr['pers_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'pers_in_inter' }, image2: { valueReference: 'guard_pass' } }
    }
  };
  expr['pers_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'pers_in_inter' }, image2: { valueReference: 'guard_fail' } }
    }
  };
  // Uncertain in intersection
  expr['unc_inter_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'unc_in_inter' }, image2: { valueReference: 'guard_pass' } }
    }
  };
  expr['unc_inter_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'unc_in_inter' }, image2: { valueReference: 'guard_fail' } }
    }
  };
  // Local-only Uncertain
  expr['unc_loc_retained'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_only' }, image2: { valueReference: 'guard_pass' } }
    }
  };
  expr['unc_loc_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_only' }, image2: { valueReference: 'guard_fail' } }
    }
  };

  // Total Uncertain Excluded
  expr['unc_all_excluded'] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'unc_inter_excluded' }, image2: { valueReference: 'unc_loc_excluded' } }
    }
  };

  // NDVI intervals on Excluded sets
  const addNdviIntervals = (prefix: string, baseMask: string) => {
    expr[`${prefix}_lt_020`] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: baseMask },
          image2: {
            functionInvocationValue: {
              functionName: 'Image.lt',
              arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.20 } } } } }
            }
          }
        }
      }
    };
    expr[`${prefix}_020_030`] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: baseMask },
          image2: {
            functionInvocationValue: {
              functionName: 'Image.and',
              arguments: {
                image1: { functionInvocationValue: { functionName: 'Image.gte', arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.20 } } } } } } },
                image2: { functionInvocationValue: { functionName: 'Image.lt', arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.30 } } } } } } }
              }
            }
          }
        }
      }
    };
    expr[`${prefix}_030_040`] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: baseMask },
          image2: {
            functionInvocationValue: {
              functionName: 'Image.and',
              arguments: {
                image1: { functionInvocationValue: { functionName: 'Image.gte', arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.30 } } } } } } },
                image2: { functionInvocationValue: { functionName: 'Image.lt', arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.40 } } } } } } }
              }
            }
          }
        }
      }
    };
    expr[`${prefix}_ge_040`] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: { valueReference: baseMask },
          image2: {
            functionInvocationValue: {
              functionName: 'Image.gte',
              arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.40 } } } } }
            }
          }
        }
      }
    };
  };

  addNdviIntervals('excl_all', 'cand_excluded');
  addNdviIntervals('excl_pers', 'pers_excluded');
  addNdviIntervals('excl_seas', 'seas_excluded');
  addNdviIntervals('excl_unc', 'unc_all_excluded');

  // Helper for safe fetch with retry
  async function callGee(bodyObj: Record<string, unknown>, attempt = 1): Promise<any> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
        body: JSON.stringify(bodyObj),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GEE API HTTP ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt <= 3) {
        console.warn(`[GEE] Network retry attempt ${attempt} after error:`, err);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        return callGee(bodyObj, attempt + 1);
      }
      throw err;
    }
  }

  // BATCH 1: All Counts chained via Image.addBands
  console.log('Building Batch 1: All pixel count masks (chained via addBands)...');
  const countKeys = [
    'local_cand_mask',
    'cand_retained',
    'cand_excluded',
    'seas_retained',
    'seas_excluded',
    'pers_retained',
    'pers_excluded',
    'unc_inter_retained',
    'unc_inter_excluded',
    'unc_loc_retained',
    'unc_loc_excluded',
    'excl_all_lt_020',
    'excl_all_020_030',
    'excl_all_030_040',
    'excl_all_ge_040',
    'excl_pers_lt_020',
    'excl_pers_020_030',
    'excl_pers_030_040',
    'excl_pers_ge_040',
    'excl_seas_lt_020',
    'excl_seas_020_030',
    'excl_seas_030_040',
    'excl_seas_ge_040',
    'excl_unc_lt_020',
    'excl_unc_020_030',
    'excl_unc_030_040',
    'excl_unc_ge_040',
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

  console.log('Sending Batch 1 compute request to Earth Engine...');
  const countsData = await callGee({ expression: { values: expr, result: 'reduction_counts' } });
  const counts = countsData.result as Record<string, number>;
  console.log('Batch 1 received successfully!\n');

  // BATCH 2: SCL Frequency Histograms
  console.log('Querying SCL Frequency Histograms individually...');
  const histTargets = [
    { name: 'scl_all', mask: 'local_cand_mask' },
    { name: 'scl_excl_all', mask: 'cand_excluded' },
    { name: 'scl_excl_pers', mask: 'pers_excluded' },
    { name: 'scl_excl_seas', mask: 'seas_excluded' },
    { name: 'scl_excl_unc', mask: 'unc_all_excluded' },
  ];

  const hists: Record<string, Record<string, number>> = {};
  for (const t of histTargets) {
    expr[`masked_${t.name}`] = {
      functionInvocationValue: {
        functionName: 'Image.updateMask',
        arguments: { image: { valueReference: 'scl_base' }, mask: { valueReference: t.mask } }
      }
    };
    expr[`reduction_hist_${t.name}`] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: `masked_${t.name}` },
          geometry: { valueReference: 'zone_geom' },
          crs: { valueReference: 'proj' },
          reducer: { valueReference: 'hist_red' },
          maxPixels: { constantValue: 1000000000 }
        }
      }
    };
    const res = await callGee({ expression: { values: expr, result: `reduction_hist_${t.name}` } });
    hists[t.name] = (res.result ? Object.values(res.result)[0] : {}) as Record<string, number>;
    console.log(`  - ${t.name}:`, hists[t.name]);
    await new Promise(r => setTimeout(r, 500));
  }

  // --------------------------------------------------------------------------
  // PRINT ALL RESULTS
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 EMPIRICAL RESULTS: BASELINE CANOPY FILTER IMPACT ASSESSMENT');
  console.log('================================================================\n');

  const totalCand = counts['local_cand_mask'];
  const candRet = counts['cand_retained'];
  const candExcl = counts['cand_excluded'];

  console.log('1. OVERALL CANDIDATE POOL (N = 135,489 px / 1,354.89 ha):');
  console.log(`   - Total Canonical Candidates: ${totalCand} px`);
  console.log(`   - Retained by Guard:          ${candRet} px (${((candRet / totalCand) * 100).toFixed(4)}%, ${(candRet * 0.01).toFixed(2)} ha)`);
  console.log(`   - Excluded by Guard:          ${candExcl} px (${((candExcl / totalCand) * 100).toFixed(4)}%, ${(candExcl * 0.01).toFixed(2)} ha)`);
  console.log(`   - Invariant Sum:              ${candRet + candExcl} == ${totalCand}\n`);

  const seasRet = counts['seas_retained'];
  const seasExcl = counts['seas_excluded'];
  const persRet = counts['pers_retained'];
  const persExcl = counts['pers_excluded'];
  const uncInterRet = counts['unc_inter_retained'];
  const uncInterExcl = counts['unc_inter_excluded'];
  const uncLocRet = counts['unc_loc_retained'];
  const uncLocExcl = counts['unc_loc_excluded'];
  const uncTotalRet = uncInterRet + uncLocRet;
  const uncTotalExcl = uncInterExcl + uncLocExcl;

  console.log('2. CATEGORY BREAKDOWN:');
  console.log(`   - Seasonal Candidates (Total = ${seasRet + seasExcl} px):`);
  console.log(`     * Retained: ${seasRet} px (${((seasRet / (seasRet + seasExcl)) * 100).toFixed(4)}%, ${(seasRet * 0.01).toFixed(2)} ha)`);
  console.log(`     * Excluded: ${seasExcl} px (${((seasExcl / (seasRet + seasExcl)) * 100).toFixed(4)}%, ${(seasExcl * 0.01).toFixed(2)} ha)`);
  console.log(`   - Persistent Candidates (Total = ${persRet + persExcl} px):`);
  console.log(`     * Retained: ${persRet} px (${((persRet / (persRet + persExcl)) * 100).toFixed(4)}%, ${(persRet * 0.01).toFixed(2)} ha)`);
  console.log(`     * Excluded: ${persExcl} px (${((persExcl / (persRet + persExcl)) * 100).toFixed(4)}%, ${(persExcl * 0.01).toFixed(2)} ha)`);
  console.log(`   - Uncertain Candidates (Total = ${uncTotalRet + uncTotalExcl} px):`);
  console.log(`     * Retained: ${uncTotalRet} px (${((uncTotalRet / (uncTotalRet + uncTotalExcl)) * 100).toFixed(4)}%, ${(uncTotalRet * 0.01).toFixed(2)} ha)`);
  console.log(`     * Excluded: ${uncTotalExcl} px (${((uncTotalExcl / (uncTotalRet + uncTotalExcl)) * 100).toFixed(4)}%, ${(uncTotalExcl * 0.01).toFixed(2)} ha)`);
  console.log(`       [Intersection Excluded: ${uncInterExcl}, Local-Only Excluded: ${uncLocExcl}]\n`);

  console.log('3. SCL FREQUENCY HISTOGRAMS:');
  console.log('   - All Candidates SCL:', hists['scl_all']);
  console.log('   - Excluded Candidates SCL (Total):', hists['scl_excl_all']);
  console.log('   - Excluded Persistent SCL:', hists['scl_excl_pers']);
  console.log('   - Excluded Seasonal SCL:', hists['scl_excl_seas']);
  console.log('   - Excluded Uncertain SCL:', hists['scl_excl_unc']);

  console.log('\n4. NDVI INTERVALS ON EXCLUSIONS:');
  console.log(`   - All Excluded Candidates (Total = ${candExcl} px):`);
  console.log(`     * NDVI < 0.20:           ${counts['excl_all_lt_020']} px`);
  console.log(`     * 0.20 <= NDVI < 0.30:   ${counts['excl_all_020_030']} px`);
  console.log(`     * 0.30 <= NDVI < 0.40:   ${counts['excl_all_030_040']} px`);
  console.log(`     * NDVI >= 0.40 (SCL!=4): ${counts['excl_all_ge_040']} px`);
  const sumExclAll = counts['excl_all_lt_020'] + counts['excl_all_020_030'] + counts['excl_all_030_040'] + counts['excl_all_ge_040'];
  console.log(`     * Interval Sum:          ${sumExclAll} == ${candExcl}`);

  console.log(`\n   - Excluded Persistent Candidates (Total = ${persExcl} px):`);
  console.log(`     * NDVI < 0.20:           ${counts['excl_pers_lt_020']} px`);
  console.log(`     * 0.20 <= NDVI < 0.30:   ${counts['excl_pers_020_030']} px`);
  console.log(`     * 0.30 <= NDVI < 0.40:   ${counts['excl_pers_030_040']} px`);
  console.log(`     * NDVI >= 0.40 (SCL!=4): ${counts['excl_pers_ge_040']} px`);
  const sumExclPers = counts['excl_pers_lt_020'] + counts['excl_pers_020_030'] + counts['excl_pers_030_040'] + counts['excl_pers_ge_040'];
  console.log(`     * Interval Sum:          ${sumExclPers} == ${persExcl}`);

  console.log(`\n   - Excluded Seasonal Candidates (Total = ${seasExcl} px):`);
  console.log(`     * NDVI < 0.20:           ${counts['excl_seas_lt_020']} px`);
  console.log(`     * 0.20 <= NDVI < 0.30:   ${counts['excl_seas_020_030']} px`);
  console.log(`     * 0.30 <= NDVI < 0.40:   ${counts['excl_seas_030_040']} px`);
  console.log(`     * NDVI >= 0.40 (SCL!=4): ${counts['excl_seas_ge_040']} px`);

  console.log(`\n   - Excluded Uncertain Candidates (Total = ${uncTotalExcl} px):`);
  console.log(`     * NDVI < 0.20:           ${counts['excl_unc_lt_020']} px`);
  console.log(`     * 0.20 <= NDVI < 0.30:   ${counts['excl_unc_020_030']} px`);
  console.log(`     * 0.30 <= NDVI < 0.40:   ${counts['excl_unc_030_040']} px`);
  console.log(`     * NDVI >= 0.40 (SCL!=4): ${counts['excl_unc_ge_040']} px`);

  await mongoose.disconnect();
}

runAssessment().catch(console.error);
