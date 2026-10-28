import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function checkCandidatesCoverage() {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  if (!zone) throw new Error('Zone not found');
  const boundary = zone.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  const expr: Record<string, unknown> = {
    zone_geom: {
      functionInvocationValue: {
        functionName: boundary.type === 'MultiPolygon' ? 'GeometryConstructors.MultiPolygon' : 'GeometryConstructors.Polygon',
        arguments: { coordinates: { constantValue: boundary.coordinates } }
      }
    },
    proj: {
      functionInvocationValue: {
        functionName: 'Projection',
        arguments: { crs: { constantValue: 'EPSG:32643' }, transform: { constantValue: canonicalTransform } }
      }
    },
    sum_reducer: {
      functionInvocationValue: { functionName: 'Reducer.sum', arguments: {} }
    },
    // 1. Baseline Image (2020-01-09)
    img_base: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM' } }
      }
    },
    // 2. Current Image (2024-02-07)
    img_cur: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM' } }
      }
    },
    // P1 (2020-02-18)
    img_p1: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM' } }
      }
    },
    // P2 (2024-01-23)
    img_p2: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM' } }
      }
    },
    // P3 (2025-01-27)
    img_p3: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM' } }
      }
    },
  };

  // Helper to extract SCL clear mask (classes 2, 4, 5, 6, 7)
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

  // NDVI for Base and Cur
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
              arguments: {
                dstImg: { valueReference: `nir_${key}` },
                srcImg: { valueReference: `red_${key}` }
              }
            }
          },
          bandNames: { constantValue: ['B8', 'B4'] }
        }
      }
    };
  };

  addNdvi('base', 'img_base');
  addNdvi('cur', 'img_cur');

  // Delta NDVI = Cur - Base
  expr['delta_ndvi'] = {
    functionInvocationValue: {
      functionName: 'Image.subtract',
      arguments: {
        image1: { valueReference: 'ndvi_cur' },
        image2: { valueReference: 'ndvi_base' }
      }
    }
  };

  // Disturbance signal: delta <= -0.15
  expr['dist_signal'] = {
    functionInvocationValue: {
      functionName: 'Image.lte',
      arguments: {
        image1: { valueReference: 'delta_ndvi' },
        image2: {
          functionInvocationValue: {
            functionName: 'Image.constant',
            arguments: { value: { constantValue: -0.15 } }
          }
        }
      }
    }
  };

  // Common clear valid between Base and Cur
  expr['scl_valid_base_cur'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'clear_base' },
        image2: { valueReference: 'clear_cur' }
      }
    }
  };

  // 135,489 Residual Candidates: dist_signal && scl_valid_base_cur
  expr['cand_mask'] = {
    functionInvocationValue: {
      functionName: 'Image.and',
      arguments: {
        image1: { valueReference: 'dist_signal' },
        image2: { valueReference: 'scl_valid_base_cur' }
      }
    }
  };

  // Helper to run sum on candidates masked with conditions
  async function queryCount(label: string, maskNodeBuilder: (e: Record<string, unknown>) => string) {
    const exprCopy = { ...expr };
    const targetNode = maskNodeBuilder(exprCopy);
    exprCopy['reduction'] = {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: targetNode },
          geometry: { valueReference: 'zone_geom' },
          crs: { valueReference: 'proj' },
          reducer: { valueReference: 'sum_reducer' },
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
    const val = Object.values(data.result || {})[0] || 0;
    return Math.round(val);
  }

  console.log('1. Verifying Candidate Pool Count in GEE...');
  const candCount = await queryCount('Candidate Count', () => 'cand_mask');
  console.log(`   Candidate Count: ${candCount.toLocaleString()} px`);

  console.log('2. Candidates clear in P1 (2020-02-18)...');
  const candP1 = await queryCount('Cand ∩ P1', (e) => {
    e['cand_p1'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p1' } }
      }
    };
    return 'cand_p1';
  });
  console.log(`   Candidates clear in P1: ${candP1.toLocaleString()} px (${((candP1 / candCount) * 100).toFixed(2)}%)`);

  console.log('3. Candidates clear in P2 (2024-01-23)...');
  const candP2 = await queryCount('Cand ∩ P2', (e) => {
    e['cand_p2'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p2' } }
      }
    };
    return 'cand_p2';
  });
  console.log(`   Candidates clear in P2: ${candP2.toLocaleString()} px (${((candP2 / candCount) * 100).toFixed(2)}%)`);

  console.log('4. Candidates clear in P3 (2025-01-27)...');
  const candP3 = await queryCount('Cand ∩ P3', (e) => {
    e['cand_p3'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p3' } }
      }
    };
    return 'cand_p3';
  });
  console.log(`   Candidates clear in P3: ${candP3.toLocaleString()} px (${((candP3 / candCount) * 100).toFixed(2)}%)`);

  console.log('5. Candidates clear in both P1 and P2...');
  const candP1P2 = await queryCount('Cand ∩ P1 ∩ P2', (e) => {
    e['cand_p1'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p1' } }
      }
    };
    e['cand_p1_p2'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_p1' }, image2: { valueReference: 'clear_p2' } }
      }
    };
    return 'cand_p1_p2';
  });
  console.log(`   Candidates clear in P1 ∩ P2: ${candP1P2.toLocaleString()} px (${((candP1P2 / candCount) * 100).toFixed(2)}%)`);

  console.log('6. Candidates clear in both P2 and P3...');
  const candP2P3 = await queryCount('Cand ∩ P2 ∩ P3', (e) => {
    e['cand_p2'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p2' } }
      }
    };
    e['cand_p2_p3'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_p2' }, image2: { valueReference: 'clear_p3' } }
      }
    };
    return 'cand_p2_p3';
  });
  console.log(`   Candidates clear in P2 ∩ P3: ${candP2P3.toLocaleString()} px (${((candP2P3 / candCount) * 100).toFixed(2)}%)`);

  console.log('7. Candidates clear in all three verification scenes (P1 ∩ P2 ∩ P3)...');
  const candAll = await queryCount('Cand ∩ All', (e) => {
    e['cand_p1_p2'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: {
          image1: {
            functionInvocationValue: {
              functionName: 'Image.and',
              arguments: { image1: { valueReference: 'cand_mask' }, image2: { valueReference: 'clear_p1' } }
            }
          },
          image2: { valueReference: 'clear_p2' }
        }
      }
    };
    e['cand_all'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'cand_p1_p2' }, image2: { valueReference: 'clear_p3' } }
      }
    };
    return 'cand_all';
  });
  console.log(`   Candidates clear in P1 ∩ P2 ∩ P3: ${candAll.toLocaleString()} px (${((candAll / candCount) * 100).toFixed(2)}%)`);

  await mongoose.disconnect();
}

checkCandidatesCoverage().catch(console.error);
