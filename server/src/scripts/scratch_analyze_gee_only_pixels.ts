/**
 * Analyze why 952 pixels are GEE-only (screened out by Local)
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function analyzeGeeOnlyPixels() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  // We reuse the exact definitions from scratch_pixel_level_set_comparison.ts
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
  };

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

    expr[`scl_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['SCL'] } }
      }
    };
    expr[`gee_clear_${k}`] = {
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
          image1: {
            functionInvocationValue: {
              functionName: 'Image.gt',
              arguments: {
                image1: { valueReference: `b2_${k}` },
                image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 2000 } } } }
              }
            }
          },
          image2: {
            functionInvocationValue: {
              functionName: 'Image.gt',
              arguments: {
                image1: { valueReference: `b4_${k}` },
                image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 1500 } } } }
              }
            }
          }
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
                image1: {
                  functionInvocationValue: {
                    functionName: 'Image.lt',
                    arguments: {
                      image1: { valueReference: `b8_${k}` },
                      image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 1000 } } } }
                    }
                  }
                },
                image2: {
                  functionInvocationValue: {
                    functionName: 'Image.lt',
                    arguments: {
                      image1: { valueReference: `b11_${k}` },
                      image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 800 } } } }
                    }
                  }
                }
              }
            }
          },
          image2: {
            functionInvocationValue: {
              functionName: 'Image.lt',
              arguments: {
                image1: { valueReference: `b4_${k}` },
                image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 600 } } } }
              }
            }
          }
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

  expr['gee_scl_both'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'gee_clear_base' }, image2: { valueReference: 'gee_clear_cur' } }
    }
  };
  expr['gee_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_signal' }, image2: { valueReference: 'gee_scl_both' } }
    }
  };

  expr['local_screened'] = {
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
        image2: {
          functionInvocationValue: {
            functionName: 'Image.not',
            arguments: { value: { valueReference: 'local_screened' } }
          }
        }
      }
    }
  };

  expr['gee_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'gee_cand_mask' },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.not',
            arguments: { value: { valueReference: 'local_cand_mask' } }
          }
        }
      }
    }
  };

  // Check which local exclusion rule caused GEE-only pixels to be screened out locally
  const checkRule = (ruleKey: string, outKey: string) => {
    expr[outKey] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'gee_only' }, image2: { valueReference: ruleKey } }
      }
    };
  };

  checkRule('local_cloud_base', 'gee_only_base_cloud');
  checkRule('local_shadow_base', 'gee_only_base_shadow');
  checkRule('local_cloud_cur', 'gee_only_cur_cloud');
  checkRule('local_shadow_cur', 'gee_only_cur_shadow');

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

  const baseCloud = await querySum('gee_only_base_cloud');
  const baseShadow = await querySum('gee_only_base_shadow');
  const curCloud = await querySum('gee_only_cur_cloud');
  const curShadow = await querySum('gee_only_cur_shadow');

  console.log('--- REASON WHY 952 PIXELS WERE SCREENED OUT LOCALLY (GEE-ONLY) ---');
  console.log(`  Local Baseline Cloud Trigger:   ${baseCloud} px`);
  console.log(`  Local Baseline Shadow Trigger:  ${baseShadow} px`);
  console.log(`  Local Current Cloud Trigger:    ${curCloud} px`);
  console.log(`  Local Current Shadow Trigger:   ${curShadow} px`);
  console.log(`  Sum of Triggers:                ${baseCloud + baseShadow + curCloud + curShadow} px`);

  await mongoose.disconnect();
}

analyzeGeeOnlyPixels().catch(console.error);
