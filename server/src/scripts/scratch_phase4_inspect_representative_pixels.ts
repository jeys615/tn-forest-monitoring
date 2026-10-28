/**
 * Phase 4: Representative Pixel Inspection Script
 * Script: scratch_phase4_inspect_representative_pixels.ts
 *
 * Inspects representative pixels across 6 profiles:
 * 1. Interior Dense Canopy (NDVI_base >= 0.70, SCL_base == 4, Persistent)
 * 2. Boundary Soil/Track (Pixel [1985, 1129], dist = 0.24m, SCL_base == 5, Persistent)
 * 3. Boundary Dense Canopy (dist < 10m, NDVI_base >= 0.50, SCL_base == 4, Persistent)
 * 4. Sparse Canopy / Scrub (0.30 <= NDVI_base < 0.40, SCL_base == 4)
 * 5. Soil / Rock Feature (NDVI_base < 0.30, SCL_base in [2, 5])
 * 6. Green Feature with SCL != 4 (NDVI_base >= 0.40, SCL_base in [2, 5, 7])
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function inspectRepresentativePixels() {
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

  ['base', 'cur', 'p1', 'p2', 'p3'].forEach(k => {
    expr[`scl_${k}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: ['SCL'] } }
      }
    };
    ['B2', 'B4', 'B8', 'B11'].forEach(b => {
      expr[`${b.toLowerCase()}_${k}`] = {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: { input: { valueReference: `img_${k}` }, bandSelectors: { constantValue: [b] } }
        }
      };
    });
  });

  // Candidate mask setup
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

  // Stack image containing all bands and coordinates
  expr['coords'] = {
    functionInvocationValue: {
      functionName: 'Image.pixelCoordinates',
      arguments: { projection: { valueReference: 'proj' } }
    }
  };

  // Stack interesting bands
  expr['stack'] = {
    functionInvocationValue: {
      functionName: 'Image.cat',
      arguments: {
        images: {
          constantValue: [
            { valueReference: 'coords' },
            { valueReference: 'ndvi_base' },
            { valueReference: 'ndvi_cur' },
            { valueReference: 'ndvi_p1' },
            { valueReference: 'ndvi_p2' },
            { valueReference: 'ndvi_p3' },
            { valueReference: 'delta_cur' },
            { valueReference: 'delta_p1' },
            { valueReference: 'delta_p2' },
            { valueReference: 'delta_p3' },
            { valueReference: 'scl_base' },
            { valueReference: 'scl_cur' },
            { valueReference: 'scl_p1' },
            { valueReference: 'scl_p2' },
            { valueReference: 'scl_p3' },
            { valueReference: 'b2_base' },
            { valueReference: 'b4_base' },
            { valueReference: 'b8_base' },
            { valueReference: 'b11_base' },
            { valueReference: 'b2_cur' },
            { valueReference: 'b4_cur' },
            { valueReference: 'b8_cur' },
            { valueReference: 'b11_cur' },
          ]
        }
      }
    }
  };

  // Helper to query a point in GEE
  async function queryPixel(x: number, y: number) {
    const ptExpr = { ...expr };
    ptExpr['pt'] = {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.Point',
        arguments: { coordinates: { constantValue: [x, y] }, crs: { constantValue: 'EPSG:32643' } }
      }
    };
    ptExpr['sample'] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: 'stack' },
          geometry: { valueReference: 'pt' },
          crs: { valueReference: 'proj' },
          reducer: { functionInvocationValue: { functionName: 'Reducer.first', arguments: {} } },
          scale: { constantValue: 10 }
        }
      }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
      body: JSON.stringify({ expression: { values: ptExpr, result: 'sample' } }),
    });
    const data = await res.json() as { result?: Record<string, any> };
    return data.result;
  }

  console.log('Inspecting known representative pixels...\n');

  // 1. Pixel [1985, 1129] - Boundary Soil/Track (Persistent, dist = 0.24m)
  const p1 = await queryPixel(830805, 1120285);
  console.log('1. Pixel [1985, 1129] (Boundary Soil/Track):', p1);

  // 2. Interior Dense Canopy Persistent (e.g. from scratch_sample_true_persistent_pixels: Row 670, Col 821 -> x=827725, y=1133435)
  const p2 = await queryPixel(827725, 1133435);
  console.log('2. Interior Dense Canopy Persistent (Row 670, Col 821):', p2);

  // 3. Boundary Dense Canopy Persistent (from scratch_sample_specific_persistent: Row 1782, Col 815 -> x=827665, y=1122315, dist ~ 2.4m)
  const p3 = await queryPixel(827665, 1122315);
  console.log('3. Boundary Dense Canopy Persistent (Row 1782, Col 815):', p3);

  // 4. Sample pixels for:
  // - Sparse canopy (0.30 <= NDVI < 0.40, SCL 4)
  // - Non-canopy green feature (NDVI >= 0.40, SCL != 4)
  // - Soil/rock feature (NDVI < 0.30, SCL in [2, 5])
  // Let's sample using Image.sample
  async function sampleProfile(maskExprName: string, count: number) {
    const sExpr = { ...expr };
    sExpr['masked_stack'] = {
      functionInvocationValue: {
        functionName: 'Image.updateMask',
        arguments: { image: { valueReference: 'stack' }, mask: { valueReference: maskExprName } }
      }
    };
    sExpr['sampled_pts'] = {
      functionInvocationValue: {
        functionName: 'Image.sample',
        arguments: {
          image: { valueReference: 'masked_stack' },
          region: { valueReference: 'zone_geom' },
          scale: { constantValue: 10 },
          projection: { valueReference: 'proj' },
          numPixels: { constantValue: count },
          geometries: { constantValue: true }
        }
      }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': config.projectId },
      body: JSON.stringify({ expression: { values: sExpr, result: 'sampled_pts' } }),
    });
    const data = await res.json() as { result?: { features?: any[] } };
    return data.result?.features ?? [];
  }

  // Profile A: Sparse canopy (0.30 <= NDVI < 0.40, SCL == 4 in candidate pool)
  expr['cand_sparse_canopy'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: {
              image1: { valueReference: 'dist_signal' },
              image2: { functionInvocationValue: { functionName: 'Image.eq', arguments: { image1: { valueReference: 'scl_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 4 } } } } } } }
            }
          }
        },
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

  // Profile B: Green feature with SCL != 4 (NDVI >= 0.40, SCL in [2, 5, 7] in candidate pool)
  expr['cand_green_non_scl4'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: {
          functionInvocationValue: {
            functionName: 'Image.and',
            arguments: {
              image1: { valueReference: 'dist_signal' },
              image2: { functionInvocationValue: { functionName: 'Image.neq', arguments: { image1: { valueReference: 'scl_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 4 } } } } } } }
            }
          }
        },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.gte',
            arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.40 } } } } }
          }
        }
      }
    }
  };

  // Profile C: Soil / Rock feature (NDVI < 0.30 in candidate pool)
  expr['cand_soil_rock'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'dist_signal' },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.lt',
            arguments: { image1: { valueReference: 'ndvi_base' }, image2: { functionInvocationValue: { functionName: 'Image.constant', arguments: { value: { constantValue: 0.30 } } } } }
          }
        }
      }
    }
  };

  console.log('Sampling Profile A (Sparse Canopy: 0.30 <= NDVI < 0.40, SCL == 4)...');
  const samplesSparse = await sampleProfile('cand_sparse_canopy', 2);
  console.log('Sparse Canopy Samples:', JSON.stringify(samplesSparse, null, 2));

  console.log('\nSampling Profile B (Green Feature with SCL != 4: NDVI >= 0.40, SCL != 4)...');
  const samplesGreenNonScl4 = await sampleProfile('cand_green_non_scl4', 2);
  console.log('Green Non-SCL4 Samples:', JSON.stringify(samplesGreenNonScl4, null, 2));

  console.log('\nSampling Profile C (Soil / Rock: NDVI < 0.30)...');
  const samplesSoilRock = await sampleProfile('cand_soil_rock', 2);
  console.log('Soil/Rock Samples:', JSON.stringify(samplesSoilRock, null, 2));

  await mongoose.disconnect();
}

inspectRepresentativePixels().catch(console.error);
