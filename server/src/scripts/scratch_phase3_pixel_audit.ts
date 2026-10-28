/**
 * Phase 3: Final Pixel-Level Verification and Audit Sign-Off
 * Monitored Zone: Sirumalai ZONE-261011-6340
 * Target: Canonical 135,489 Local Candidates
 *
 * STRICT READ-ONLY REQUIREMENTS:
 * - Zero mutations to DB, code, baselines, alerts, or monitoring jobs.
 * - Exact integer counts and set algebra.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function runPhase3Audit() {
  console.log('================================================================');
  console.log('🔬 PHASE 3: FINAL PIXEL-LEVEL VERIFICATION & AUDIT SIGN-OFF');
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

  const addClearMask = (key: string, imgKey: string) => {
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

  addClearMask('base', 'img_base');
  addClearMask('cur', 'img_cur');
  addClearMask('p1', 'img_p1');
  addClearMask('p2', 'img_p2');
  addClearMask('p3', 'img_p3');

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

  // Local screening
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
  expr['gee_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'gee_cand_mask' },
        image2: { functionInvocationValue: { functionName: 'Image.not', arguments: { value: { valueReference: 'local_cand_mask' } } } }
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

  // Persistent in Intersection vs GEE-Only
  expr['pers_in_inter'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'persistent_mask' }, image2: { valueReference: 'intersection' } }
    }
  };
  expr['pers_in_gee_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'persistent_mask' }, image2: { valueReference: 'gee_only' } }
    }
  };

  // Seasonal in Intersection vs GEE-Only
  expr['seas_in_inter'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'seasonal_mask' }, image2: { valueReference: 'intersection' } }
    }
  };
  expr['seas_in_gee_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'seasonal_mask' }, image2: { valueReference: 'gee_only' } }
    }
  };

  // Uncertain in Intersection vs GEE-Only
  expr['uncertain_raw'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'gee_cand_mask' },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.not',
            arguments: {
              value: {
                functionInvocationValue: {
                  functionName: 'Image.or',
                  arguments: { image1: { valueReference: 'seasonal_mask' }, image2: { valueReference: 'persistent_mask' } }
                }
              }
            }
          }
        }
      }
    }
  };
  expr['unc_in_inter'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'uncertain_raw' }, image2: { valueReference: 'intersection' } }
    }
  };
  expr['unc_in_gee_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'uncertain_raw' }, image2: { valueReference: 'gee_only' } }
    }
  };

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

  console.log('Querying set and trajectory sums...');
  const nInter = await querySum('intersection');
  const nLocalOnly = await querySum('local_only');
  const nGeeOnly = await querySum('gee_only');
  const nGeeCand = await querySum('gee_cand_mask');

  const pInter = await querySum('pers_in_inter');
  const pGeeOnly = await querySum('pers_in_gee_only');
  const pTotal = await querySum('persistent_mask');

  const sInter = await querySum('seas_in_inter');
  const sGeeOnly = await querySum('seas_in_gee_only');
  const sTotal = await querySum('seasonal_mask');

  const uInter = await querySum('unc_in_inter');
  const uGeeOnly = await querySum('unc_in_gee_only');
  const uTotal = await querySum('uncertain_raw');

  console.log('\n--- SET THEORETIC RECONCILIATION ---');
  console.log(`Intersection: ${nInter.toLocaleString()} px`);
  console.log(`Local-Only:   ${nLocalOnly.toLocaleString()} px`);
  console.log(`GEE-Only:     ${nGeeOnly.toLocaleString()} px`);
  console.log(`Sum Local Candidate Pool: ${nInter} + ${nLocalOnly} = ${nInter + nLocalOnly} px (Target: 135,489)`);
  console.log(`Sum GEE Candidate Mask:   ${nInter} + ${nGeeOnly} = ${nInter + nGeeOnly} px (Target: 134,957)`);
  console.log(`Net Difference:           ${(nInter + nLocalOnly) - (nInter + nGeeOnly)} px (Target: 532)`);

  console.log('\n--- PERSISTENT CANDIDATE ACCOUNTING (θ = -0.15) ---');
  console.log(`Persistent in Intersection: ${pInter.toLocaleString()} px`);
  console.log(`Persistent in GEE-Only:     ${pGeeOnly.toLocaleString()} px`);
  console.log(`Total Persistent in GEE:    ${pTotal.toLocaleString()} px`);
  console.log(`Canonical Local Persistent: ${pInter.toLocaleString()} px (Unscaled Ground Truth)`);

  console.log('\n--- SEASONAL CANDIDATE ACCOUNTING ---');
  console.log(`Seasonal in Intersection:   ${sInter.toLocaleString()} px`);
  console.log(`Seasonal in GEE-Only:       ${sGeeOnly.toLocaleString()} px`);
  console.log(`Total Seasonal in GEE:      ${sTotal.toLocaleString()} px`);
  console.log(`Canonical Local Seasonal:   ${sInter.toLocaleString()} px (Unscaled Ground Truth)`);

  console.log('\n--- UNCERTAIN CANDIDATE ACCOUNTING ---');
  console.log(`Uncertain in Intersection:  ${uInter.toLocaleString()} px`);
  console.log(`Uncertain in GEE-Only:      ${uGeeOnly.toLocaleString()} px`);
  console.log(`Total Uncertain in GEE:     ${uTotal.toLocaleString()} px`);
  console.log(`Contaminated Local-Only:    ${nLocalOnly.toLocaleString()} px`);
  console.log(`Canonical Local Uncertain:  ${uInter + nLocalOnly} px (${uInter} + ${nLocalOnly})`);

  console.log('\n--- CANONICAL LOCAL CANDIDATE POOL PARTITION INVARIANT CHECK ---');
  const localSeasonal = sInter;
  const localPersistent = pInter;
  const localUncertain = uInter + nLocalOnly;
  const localSum = localSeasonal + localPersistent + localUncertain;

  console.log(`1. Seasonal:   ${localSeasonal.toLocaleString()} px (${((localSeasonal / 135489) * 100).toFixed(4)}%)`);
  console.log(`2. Persistent: ${localPersistent.toLocaleString()} px (${((localPersistent / 135489) * 100).toFixed(4)}%)`);
  console.log(`3. Uncertain:  ${localUncertain.toLocaleString()} px (${((localUncertain / 135489) * 100).toFixed(4)}%)`);
  console.log(`Partition Sum: ${localSum.toLocaleString()} px / 135,489 px`);
  console.log(`Invariant Exact Match: ${localSum === 135489 ? '✅ PASS (EXACT 135,489)' : '❌ FAIL'}`);

  // Evaluable subset denominator:
  const nEval = localSeasonal + localPersistent;
  console.log('\n--- DUAL DENOMINATOR METRICS ---');
  console.log(`Full Candidate Pool Denominator:  ${(135489).toLocaleString()} px (1,354.89 ha)`);
  console.log(`Evaluable Subset Denominator:     ${nEval.toLocaleString()} px (${(nEval * 0.01).toFixed(2)} ha)`);
  console.log(`Persistent over Full Pool:        ${((localPersistent / 135489) * 100).toFixed(4)}%`);
  console.log(`Persistent over Evaluable Subset: ${((localPersistent / nEval) * 100).toFixed(4)}%`);
  console.log(`Candidate Reduction (Full Pool):  ${(((135489 - localPersistent) / 135489) * 100).toFixed(4)}%`);
  console.log(`Candidate Reduction (Evaluable):  ${(((nEval - localPersistent) / nEval) * 100).toFixed(4)}%`);

  await mongoose.disconnect();
}

runPhase3Audit().catch(console.error);
