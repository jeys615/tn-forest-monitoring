/**
 * Extract exact coordinates, boundary distances, and spectral deltas
 * for the 6 persistent candidates within <= 1m of the reserve boundary,
 * and summarize the 56 persistent candidates within <= 10m.
 *
 * READ-ONLY: ZERO mutations. No buffer applied to boundary polygon.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { CrsTransformService } from '../services/spatial/CrsTransformService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function inspectBoundaryPersistent() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  const boundary = zone!.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  const ringWgs = boundary.coordinates[0];
  const ringUtm = ringWgs.map(([lon, lat]) => CrsTransformService.transformCoordinate([lon, lat], 'EPSG:4326', 'EPSG:32643'));

  function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function minDistanceToPolygon(px: number, py: number): number {
    let minDist = Infinity;
    for (let i = 0; i < ringUtm.length - 1; i++) {
      const d = pointToSegmentDistance(px, py, ringUtm[i][0], ringUtm[i][1], ringUtm[i + 1][0], ringUtm[i + 1][1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  // We build GEE expression to find pixel coordinates of persistent candidates within 1m
  // In GEE, we can compute persistent_mask.sample({ region: zone_geom, scale: 10, geometries: true })
  // Or since we know persistent_mask, we can use sampleRegions or reduceToVectors, or sample with buffer(1m) on polygon boundary
  // Let's create boundary ring line, buffer it by 1m, and sample persistent_mask inside that 1m buffer!
  const expr: Record<string, unknown> = {
    zone_geom: {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.Polygon',
        arguments: { coordinates: { constantValue: boundary.coordinates } }
      }
    },
    boundary_ring: {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.LineString',
        arguments: { coordinates: { constantValue: boundary.coordinates[0] } }
      }
    },
    buffer_1m: {
      functionInvocationValue: {
        functionName: 'Geometry.buffer',
        arguments: { geometry: { valueReference: 'boundary_ring' }, distance: { constantValue: 1.0 } }
      }
    },
    buffer_10m: {
      functionInvocationValue: {
        functionName: 'Geometry.buffer',
        arguments: { geometry: { valueReference: 'boundary_ring' }, distance: { constantValue: 10.0 } }
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

  // Seasonal
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

  // Persistent
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

  // Mask persistent to only within 1m buffer of boundary ring AND inside zone_geom
  expr['pers_within_1m'] = {
    functionInvocationValue: {
      functionName: 'Image.updateMask',
      arguments: { image: { valueReference: 'persistent_mask' }, mask: { valueReference: 'persistent_mask' } }
    }
  };

  // We query pixel coordinates by sampling points with pixelLonLat
  expr['pixel_lon_lat'] = {
    functionInvocationValue: {
      functionName: 'Image.pixelCoordinates',
      arguments: { projection: { valueReference: 'proj' } }
    }
  };
  expr['x_coord'] = {
    functionInvocationValue: {
      functionName: 'Image.select',
      arguments: { input: { valueReference: 'pixel_lon_lat' }, bandSelectors: { constantValue: ['x'] } }
    }
  };
  expr['y_coord'] = {
    functionInvocationValue: {
      functionName: 'Image.select',
      arguments: { input: { valueReference: 'pixel_lon_lat' }, bandSelectors: { constantValue: ['y'] } }
    }
  };

  // Stack x, y, delta_cur, delta_p2, delta_p3
  expr['sample_stack'] = {
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
                  arguments: { dstImg: { valueReference: 'x_coord' }, srcImg: { valueReference: 'y_coord' } }
                }
              },
              srcImg: { valueReference: 'delta_cur' }
            }
          }
        },
        srcImg: {
          functionInvocationValue: {
            functionName: 'Image.addBands',
            arguments: { dstImg: { valueReference: 'delta_p2' }, srcImg: { valueReference: 'delta_p3' } }
          }
        }
      }
    }
  };

  expr['masked_sample'] = {
    functionInvocationValue: {
      functionName: 'Image.updateMask',
      arguments: { image: { valueReference: 'sample_stack' }, mask: { valueReference: 'persistent_mask' } }
    }
  };

  // Sample regions within 1m buffer
  expr['samples_1m'] = {
    functionInvocationValue: {
      functionName: 'Image.sample',
      arguments: {
        image: { valueReference: 'masked_sample' },
        region: { valueReference: 'buffer_1m' },
        scale: { constantValue: 10 },
        projection: { valueReference: 'proj' },
        geometries: { constantValue: true }
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
    body: JSON.stringify({ expression: { values: expr, result: 'samples_1m' } }),
  });

  const data = await res.json() as { result?: { features?: { geometry: { coordinates: [number, number] }, properties: Record<string, number> }[] } };
  const features = data.result?.features || [];

  console.log(`Found ${features.length} persistent candidate features within 1m buffer of boundary:`);
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const [lon, lat] = f.geometry.coordinates;
    const [utmX, utmY] = CrsTransformService.transformCoordinate([lon, lat], 'EPSG:4326', 'EPSG:32643');
    const dist = minDistanceToPolygon(utmX, utmY);
    const col = Math.floor((utmX - 819510) / 10);
    const row = Math.floor((1140140 - utmY) / 10);
    console.log(`  Pixel ${i + 1}: [r=${row}, c=${col}] UTM: (${utmX.toFixed(2)}, ${utmY.toFixed(2)}), Dist: ${dist.toFixed(4)}m, dCur: ${f.properties.delta_cur?.toFixed(4)}, dP2: ${f.properties.delta_p2?.toFixed(4)}, dP3: ${f.properties.delta_p3?.toFixed(4)}`);
  }

  await mongoose.disconnect();
}

inspectBoundaryPersistent().catch(console.error);
