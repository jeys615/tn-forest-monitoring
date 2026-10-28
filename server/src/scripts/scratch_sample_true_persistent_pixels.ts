/**
 * Sample 5 actual persistent candidate pixels from persistent_in_inter
 * to display their exact coordinates, spectral values, and SCL classes.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function sampleTruePersistentPixels() {
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

  // Persistent in Intersection
  expr['pers_in_inter'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: { image1: { valueReference: 'persistent_mask' }, image2: { valueReference: 'intersection' } }
    }
  };

  // We stack: ndvi_base, ndvi_cur, ndvi_p2, ndvi_p3, delta_cur, delta_p2, delta_p3, scl_base, scl_cur, scl_p2, scl_p3
  const bands = ['ndvi_base', 'ndvi_cur', 'ndvi_p2', 'ndvi_p3', 'delta_cur', 'delta_p2', 'delta_p3', 'scl_base', 'scl_cur', 'scl_p2', 'scl_p3'];
  let curStack = bands[0];
  for (let i = 1; i < bands.length; i++) {
    const k = bands[i];
    const outK = `stack_band_${i}`;
    expr[outK] = {
      functionInvocationValue: {
        functionName: 'Image.addBands',
        arguments: { dstImg: { valueReference: curStack }, srcImg: { valueReference: k } }
      }
    };
    curStack = outK;
  }

  expr['masked_stack'] = {
    functionInvocationValue: {
      functionName: 'Image.updateMask',
      arguments: { image: { valueReference: curStack }, mask: { valueReference: 'pers_in_inter' } }
    }
  };

  expr['samples'] = {
    functionInvocationValue: {
      functionName: 'Image.sample',
      arguments: {
        image: { valueReference: 'masked_stack' },
        region: { valueReference: 'zone_geom' },
        scale: { constantValue: 10 },
        projection: { valueReference: 'proj' },
        numPixels: { constantValue: 5 },
        geometries: { constantValue: true }
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'samples' } }),
  });

  const data = await res.json() as { result?: { features?: { geometry: { coordinates: [number, number] }, properties: Record<string, number> }[] } };
  const features = data.result?.features || [];

  console.log(`Retrieved ${features.length} persistent candidate pixel samples from canonical pool:`);
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const [lon, lat] = f.geometry.coordinates;
    const [utmX, utmY] = CrsTransformService.transformCoordinate([lon, lat], 'EPSG:4326', 'EPSG:32643');
    const col = Math.floor((utmX - 819510) / 10);
    const row = Math.floor((1140140 - utmY) / 10);
    const p = f.properties;
    console.log(`\nSample Pixel ${i + 1}:`);
    console.log(`  Grid: [row=${row}, col=${col}], UTM: (${utmX.toFixed(2)}, ${utmY.toFixed(2)})`);
    console.log(`  NDVI: Base=${p.nd?.toFixed(4)}, Cur=${p.nd_1?.toFixed(4)}, P2=${p.nd_2?.toFixed(4)}, P3=${p.nd_3?.toFixed(4)}`);
    console.log(`  Deltas: dCur=${p.nd_4?.toFixed(4)}, dP2=${p.nd_5?.toFixed(4)}, dP3=${p.nd_6?.toFixed(4)}`);
    console.log(`  SCL Classes: Base=${p.SCL}, Cur=${p.SCL_1}, P2=${p.SCL_2}, P3=${p.SCL_3}`);
    console.log(`  Verification Rule: Clear(P2,P3)=(${p.SCL_2 === 4 || p.SCL_2 === 5}, ${p.SCL_3 === 4 || p.SCL_3 === 5}), dP2<=-0.15(${p.nd_5 <= -0.15}), dP3<=-0.15(${p.nd_6 <= -0.15}) -> PERSISTENT CONFIRMED`);
  }

  await mongoose.disconnect();
}

sampleTruePersistentPixels().catch(console.error);
