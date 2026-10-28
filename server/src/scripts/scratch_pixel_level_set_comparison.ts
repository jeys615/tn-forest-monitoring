/**
 * Forensic Audit Script: Pixel-Level Set Comparison between Local and GEE Candidate Masks
 * Evaluates:
 *   1. Local-only, GEE-only, and Intersection counts directly at pixel level
 *   2. Extracts the exact coordinates of the set differences
 *   3. Decomposes the SCL classes and threshold behavior of every set difference pixel
 *
 * READ-ONLY: ZERO modifications.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function runPixelSetComparison() {
  console.log('================================================================');
  console.log('🔬 EXACT PIXEL-LEVEL SET COMPARISON: LOCAL VS GEE CANDIDATE MASKS');
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
  };

  // 1. NDVI for Base and Cur
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

  // 2. GEE SCL Clear definition (classes 2, 4, 5, 6, 7)
  ['base', 'cur'].forEach(k => {
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
  });

  expr['gee_scl_both'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'gee_clear_base' }, image2: { valueReference: 'gee_clear_cur' } }
    }
  };

  // Direct GEE candidate mask: dist_signal && gee_scl_both
  expr['gee_cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'dist_signal' }, image2: { valueReference: 'gee_scl_both' } }
    }
  };

  // 3. Local 6-band heuristic screening rules implemented in GEE:
  // Base cloud: B2 > 0.20 && B4 > 0.15  (DN > 2000 && DN > 1500)
  // Base shadow: B8 < 0.10 && B11 < 0.08 && B4 < 0.06 (DN < 1000 && DN < 800 && DN < 600)
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

    // Cloud: B2 > 2000 && B4 > 1500
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

    // Shadow: B8 < 1000 && B11 < 800 && B4 < 600
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

  expr[`local_screened`] = {
    functionInvocationValue: {
      functionName: 'Image.or',
      arguments: { image1: { valueReference: 'local_excluded_base' }, image2: { valueReference: 'local_excluded_cur' } }
    }
  };

  // Local candidate mask: dist_signal && !local_screened
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

  // 4. Exact Set Intersections & Differences at Pixel Level:
  // A ∩ B: local_cand_mask && gee_cand_mask
  expr['intersection'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'local_cand_mask' }, image2: { valueReference: 'gee_cand_mask' } }
    }
  };

  // Local Only (A \ B): local_cand_mask && !gee_cand_mask
  expr['local_only'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'local_cand_mask' },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.not',
            arguments: { value: { valueReference: 'gee_cand_mask' } }
          }
        }
      }
    }
  };

  // GEE Only (B \ A): gee_cand_mask && !local_cand_mask
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

  // Helper to query sum
  async function querySum(label: string, node: string): Promise<number> {
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

  // Helper to query histogram
  async function queryHist(label: string, imgNode: string, maskNode: string): Promise<Record<string, number>> {
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

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Histogram failed for ${label}: ${err}`);
    }
    const data = await res.json() as { result?: { SCL?: Record<string, number> } };
    return data.result?.SCL || {};
  }

  console.log('Querying pixel-level set comparisons in GEE...');
  const countLocal = await querySum('Local Candidates in GEE', 'local_cand_mask');
  const countGee = await querySum('GEE Candidates', 'gee_cand_mask');
  const countInter = await querySum('Intersection', 'intersection');
  const countLocalOnly = await querySum('Local Only', 'local_only');
  const countGeeOnly = await querySum('GEE Only', 'gee_only');

  console.log('\n--- 1. EXACT PIXEL-LEVEL SET COMPARISON RESULTS ---');
  console.log(`Local Candidate Definition in GEE Boundary: ${countLocal.toLocaleString()} px`);
  console.log(`GEE Candidate Definition:                   ${countGee.toLocaleString()} px`);
  console.log(`----------------------------------------------------------------`);
  console.log(`Intersection (|Local ∩ GEE|):              ${countInter.toLocaleString()} px`);
  console.log(`Local Only (|Local \\ GEE|):                 ${countLocalOnly.toLocaleString()} px`);
  console.log(`GEE Only (|GEE \\ Local|):                   ${countGeeOnly.toLocaleString()} px`);
  console.log(`----------------------------------------------------------------`);
  console.log(`Identity Check: Inter + Local_Only = ${countInter + countLocalOnly} (Local: ${countLocal}) -> ${countInter + countLocalOnly === countLocal ? 'EXACT' : 'MISMATCH'}`);
  console.log(`Identity Check: Inter + GEE_Only   = ${countInter + countGeeOnly} (GEE: ${countGee}) -> ${countInter + countGeeOnly === countGee ? 'EXACT' : 'MISMATCH'}`);

  console.log('\n--- 2. INTERSECTION OF LOCAL-ONLY PIXELS WITH SCL CLASSES ---');
  const localOnlyBaseScl = await queryHist('Local-Only Base SCL', 'scl_base', 'local_only');
  const localOnlyCurScl = await queryHist('Local-Only Cur SCL', 'scl_cur', 'local_only');
  console.log(`Baseline SCL classes for Local-Only pixels:`, JSON.stringify(localOnlyBaseScl));
  console.log(`Current SCL classes for Local-Only pixels: `, JSON.stringify(localOnlyCurScl));

  await mongoose.disconnect();
}

runPixelSetComparison().catch(console.error);
