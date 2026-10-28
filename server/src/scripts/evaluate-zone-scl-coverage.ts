/**
 * Evaluate Zone-Level SCL Coverage & Clear Intersections
 * Monitored Zone: ZONE-261011-6340 (Sirumalai Hills, Dindigul District)
 *
 * Target Scenes:
 *   - Baseline: 2020-01-09 (COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM)
 *   - P1:       2020-02-18 (COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM)
 *   - P2:       2024-01-23 (COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM)
 *   - P3:       2025-01-27 (COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM)
 *
 * READ-ONLY INVESTIGATION: Zero writes to database, files, or baselines.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

interface SceneTarget {
  role: string;
  name: string;
  assetId: string;
  tileCloudPct: number;
}

const TARGET_SCENES: SceneTarget[] = [
  {
    role: 'Baseline Reference',
    name: '2020-01-09 Baseline',
    assetId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
    tileCloudPct: 2.04,
  },
  {
    role: 'Intra-Annual Seasonal Control (P1)',
    name: '2020-02-18 Seasonal Control',
    assetId: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050851_20200218T051826_T43PHM',
    tileCloudPct: 5.48,
  },
  {
    role: 'Same-Season Inter-Annual Control (P2)',
    name: '2024-01-23 Same-Season Control',
    assetId: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051119_20240123T052221_T43PHM',
    tileCloudPct: 24.43,
  },
  {
    role: 'Post-Monsoon Recovery Verification (P3)',
    name: '2025-01-27 Recovery Verification',
    assetId: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051009_20250127T052104_T43PHM',
    tileCloudPct: 14.37,
  },
];

async function runZoneSclCoverageEvaluation() {
  console.log('================================================================');
  console.log('🛰️ ZONE-LEVEL SCL COVERAGE & CLEAR INTERSECTION EVALUATION');
  console.log('Zone: Sirumalai (ZONE-261011-6340, Tile T43PHM, EPSG:32643)');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  if (!zone) throw new Error('Zone ZONE-261011-6340 not found');
  const boundary = zone.boundary as GeoJSONPolygon;

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  if (!token) throw new Error('GEE authentication failed: No token available');

  const canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  const results: Record<string, {
    totalZonePixels: number;
    histogram: Record<string, number>;
    clearPixels: number;
    cloudPixels: number;
    shadowPixels: number;
    otherPixels: number;
    clearPct: number;
    cloudPct: number;
    shadowPct: number;
  }> = {};

  // 1. Evaluate individual scene histograms
  for (const scene of TARGET_SCENES) {
    console.log(`Evaluating zone-level SCL for [${scene.role}]: ${scene.name}...`);

    const expressionValues: Record<string, unknown> = {
      zone_geom: {
        functionInvocationValue: {
          functionName: boundary.type === 'MultiPolygon' ? 'GeometryConstructors.MultiPolygon' : 'GeometryConstructors.Polygon',
          arguments: {
            coordinates: { constantValue: boundary.coordinates }
          }
        }
      },
      raw_img: {
        functionInvocationValue: {
          functionName: 'Image.load',
          arguments: {
            id: { constantValue: scene.assetId }
          }
        }
      },
      scl: {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: {
            input: { valueReference: 'raw_img' },
            bandSelectors: { constantValue: ['SCL'] }
          }
        }
      },
      hist_reducer: {
        functionInvocationValue: {
          functionName: 'Reducer.frequencyHistogram',
          arguments: {}
        }
      },
      proj: {
        functionInvocationValue: {
          functionName: 'Projection',
          arguments: {
            crs: { constantValue: 'EPSG:32643' },
            transform: { constantValue: canonicalTransform }
          }
        }
      },
      reduction: {
        functionInvocationValue: {
          functionName: 'Image.reduceRegion',
          arguments: {
            image: { valueReference: 'scl' },
            geometry: { valueReference: 'zone_geom' },
            crs: { valueReference: 'proj' },
            reducer: { valueReference: 'hist_reducer' },
            maxPixels: { constantValue: 1000000000 }
          }
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
      body: JSON.stringify({
        expression: {
          values: expressionValues,
          result: 'reduction'
        }
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to compute SCL histogram for ${scene.name}: HTTP ${res.status} - ${err}`);
    }

    const data = await res.json() as { result?: { SCL?: Record<string, number> } };
    const rawHist = data.result?.SCL || {};

    let clearPixels = 0;
    let cloudPixels = 0;
    let shadowPixels = 0;
    let otherPixels = 0;
    let totalZonePixels = 0;

    for (const [cls, count] of Object.entries(rawHist)) {
      const c = Number(cls);
      totalZonePixels += count;
      if (c === 2 || c === 4 || c === 5 || c === 6 || c === 7) {
        clearPixels += count;
      } else if (c === 8 || c === 9 || c === 10) {
        cloudPixels += count;
      } else if (c === 3) {
        shadowPixels += count;
      } else {
        otherPixels += count;
      }
    }

    results[scene.name] = {
      totalZonePixels: Math.round(totalZonePixels),
      histogram: rawHist,
      clearPixels: Math.round(clearPixels),
      cloudPixels: Math.round(cloudPixels),
      shadowPixels: Math.round(shadowPixels),
      otherPixels: Math.round(otherPixels),
      clearPct: (clearPixels / totalZonePixels) * 100,
      cloudPct: (cloudPixels / totalZonePixels) * 100,
      shadowPct: (shadowPixels / totalZonePixels) * 100,
    };
  }

  // Print scene-level histograms immediately
  console.log('\n================================================================');
  console.log('📊 SCENE-LEVEL ZONE SCL CLEAR COVERAGE REPORT');
  console.log('================================================================');
  for (const sc of TARGET_SCENES) {
    const r = results[sc.name];
    console.log(`\nScene: [${sc.role}] - ${sc.name}`);
    console.log(`  Asset ID:           ${sc.assetId}`);
    console.log(`  Tile Cloud %:       ${sc.tileCloudPct.toFixed(2)}% (MGRS T43PHM scene-wide)`);
    console.log(`  Total Zone Pixels:  ${r.totalZonePixels.toLocaleString()} px (${(r.totalZonePixels * 0.01).toFixed(2)} ha)`);
    console.log(`  Zone Clear Pixels:  ${r.clearPixels.toLocaleString()} px (${(r.clearPixels * 0.01).toFixed(2)} ha, ${r.clearPct.toFixed(2)}% clear)`);
    console.log(`  Zone Cloud Pixels:  ${r.cloudPixels.toLocaleString()} px (${(r.cloudPixels * 0.01).toFixed(2)} ha, ${r.cloudPct.toFixed(2)}% cloud)`);
    console.log(`  Zone Shadow Pixels: ${r.shadowPixels.toLocaleString()} px (${(r.shadowPixels * 0.01).toFixed(2)} ha, ${r.shadowPct.toFixed(2)}% shadow)`);
    console.log(`  Other / Defective:  ${r.otherPixels.toLocaleString()} px (${(r.otherPixels * 0.01).toFixed(2)} ha)`);
    console.log(`  SCL Class Breakdown:`, JSON.stringify(r.histogram));
  }

  // 2. Compute Common Clear Intersections in GEE
  console.log('\n================================================================');
  console.log('Computing multi-temporal clear intersections in GEE...');
  console.log('================================================================');
  const baseSharedValues: Record<string, unknown> = {
    zone_geom: {
      functionInvocationValue: {
        functionName: boundary.type === 'MultiPolygon' ? 'GeometryConstructors.MultiPolygon' : 'GeometryConstructors.Polygon',
        arguments: {
          coordinates: { constantValue: boundary.coordinates }
        }
      }
    },
    proj: {
      functionInvocationValue: {
        functionName: 'Projection',
        arguments: {
          crs: { constantValue: 'EPSG:32643' },
          transform: { constantValue: canonicalTransform }
        }
      }
    },
    sum_reducer: {
      functionInvocationValue: {
        functionName: 'Reducer.sum',
        arguments: {}
      }
    }
  };

  const sceneKeys = ['base', 'p1', 'p2', 'p3'];
  TARGET_SCENES.forEach((sc, idx) => {
    const key = sceneKeys[idx];
    baseSharedValues[`img_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: { id: { constantValue: sc.assetId } }
      }
    };
    baseSharedValues[`scl_${key}`] = {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: {
          input: { valueReference: `img_${key}` },
          bandSelectors: { constantValue: ['SCL'] }
        }
      }
    };
    // SCL clear classes: 2, 4, 5, 6, 7 -> remap to 1, others to 0
    baseSharedValues[`clear_${key}`] = {
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
  });

  // Helper to run a reduction on any computed image
  async function computeImageSum(
    label: string,
    imageBuilder: (values: Record<string, unknown>) => string,
  ): Promise<number> {
    const exprValues = { ...baseSharedValues };
    const targetNode = imageBuilder(exprValues);
    exprValues['reduction'] = {
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
      body: JSON.stringify({
        expression: {
          values: exprValues,
          result: 'reduction'
        }
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Reduction failed for ${label}: ${err}`);
    }

    const data = await res.json() as { result?: Record<string, number> };
    const val = Object.values(data.result || {})[0] || 0;
    return Math.round(val);
  }

  // Intersections using { image1, image2 }
  console.log('Calculating Baseline ∩ P1 Clear...');
  const baseP1Clear = await computeImageSum('Baseline ∩ P1', (v) => {
    v['inter_base_p1'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_p1' } }
      }
    };
    return 'inter_base_p1';
  });

  console.log('Calculating Baseline ∩ P2 Same-Season Clear...');
  const baseP2Clear = await computeImageSum('Baseline ∩ P2', (v) => {
    v['inter_base_p2'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_p2' } }
      }
    };
    return 'inter_base_p2';
  });

  console.log('Calculating Baseline ∩ P3 Recovery Clear...');
  const baseP3Clear = await computeImageSum('Baseline ∩ P3', (v) => {
    v['inter_base_p3'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_p3' } }
      }
    };
    return 'inter_base_p3';
  });

  console.log('Calculating 3-Way Clear (Baseline ∩ P1 ∩ P2)...');
  const inter3Way = await computeImageSum('3-Way Clear', (v) => {
    v['inter_base_p1'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_p1' } }
      }
    };
    v['inter_3way'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'inter_base_p1' }, image2: { valueReference: 'clear_p2' } }
      }
    };
    return 'inter_3way';
  });

  console.log('Calculating 4-Way Common Clear (Baseline ∩ P1 ∩ P2 ∩ P3)...');
  const inter4Way = await computeImageSum('4-Way Common Clear', (v) => {
    v['inter_base_p1'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'clear_base' }, image2: { valueReference: 'clear_p1' } }
      }
    };
    v['inter_3way'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'inter_base_p1' }, image2: { valueReference: 'clear_p2' } }
      }
    };
    v['inter_4way'] = {
      functionInvocationValue: {
        functionName: 'Image.and',
        arguments: { image1: { valueReference: 'inter_3way' }, image2: { valueReference: 'clear_p3' } }
      }
    };
    return 'inter_4way';
  });

  console.log('\n================================================================');
  console.log('📊 SCENE-LEVEL ZONE SCL CLEAR COVERAGE REPORT');
  console.log('================================================================');

  for (const sc of TARGET_SCENES) {
    const r = results[sc.name];
    console.log(`\nScene: [${sc.role}] - ${sc.name}`);
    console.log(`  Asset ID:           ${sc.assetId}`);
    console.log(`  Tile Cloud %:       ${sc.tileCloudPct.toFixed(2)}% (MGRS T43PHM scene-wide)`);
    console.log(`  Total Zone Pixels:  ${r.totalZonePixels.toLocaleString()} px (${(r.totalZonePixels * 0.01).toFixed(2)} ha)`);
    console.log(`  Zone Clear Pixels:  ${r.clearPixels.toLocaleString()} px (${(r.clearPixels * 0.01).toFixed(2)} ha, ${r.clearPct.toFixed(2)}% clear)`);
    console.log(`  Zone Cloud Pixels:  ${r.cloudPixels.toLocaleString()} px (${(r.cloudPixels * 0.01).toFixed(2)} ha, ${r.cloudPct.toFixed(2)}% cloud)`);
    console.log(`  Zone Shadow Pixels: ${r.shadowPixels.toLocaleString()} px (${(r.shadowPixels * 0.01).toFixed(2)} ha, ${r.shadowPct.toFixed(2)}% shadow)`);
    console.log(`  Other / Defective:  ${r.otherPixels.toLocaleString()} px (${(r.otherPixels * 0.01).toFixed(2)} ha)`);
    console.log(`  SCL Class Breakdown:`, JSON.stringify(r.histogram));
  }

  console.log('\n================================================================');
  console.log('🔗 MULTI-TEMPORAL COMMON CLEAR INTERSECTION MATRIX');
  console.log('================================================================');
  const totalZone = results[TARGET_SCENES[0].name].totalZonePixels;
  const baseClear = results[TARGET_SCENES[0].name].clearPixels;
  const p1Clear = results[TARGET_SCENES[1].name].clearPixels;
  const p2Clear = results[TARGET_SCENES[2].name].clearPixels;
  const p3Clear = results[TARGET_SCENES[3].name].clearPixels;

  console.log(`Total Monitored Zone Pixels:                  ${totalZone.toLocaleString()} px (100.00%, ${(totalZone * 0.01).toFixed(2)} ha)`);
  console.log(`Baseline Clear (2020-01-09):                  ${baseClear.toLocaleString()} px (${((baseClear / totalZone) * 100).toFixed(2)}%, ${(baseClear * 0.01).toFixed(2)} ha)`);
  console.log(`P1 Seasonal Clear (2020-02-18):               ${p1Clear.toLocaleString()} px (${((p1Clear / totalZone) * 100).toFixed(2)}%, ${(p1Clear * 0.01).toFixed(2)} ha)`);
  console.log(`P2 Same-Season Clear (2024-01-23):            ${p2Clear.toLocaleString()} px (${((p2Clear / totalZone) * 100).toFixed(2)}%, ${(p2Clear * 0.01).toFixed(2)} ha)`);
  console.log(`P3 Recovery Clear (2025-01-27):               ${p3Clear.toLocaleString()} px (${((p3Clear / totalZone) * 100).toFixed(2)}%, ${(p3Clear * 0.01).toFixed(2)} ha)`);
  console.log(`----------------------------------------------------------------`);
  console.log(`Baseline ∩ P1 Seasonal Clear:                 ${baseP1Clear.toLocaleString()} px (${((baseP1Clear / totalZone) * 100).toFixed(2)}%, ${(baseP1Clear * 0.01).toFixed(2)} ha)`);
  console.log(`Baseline ∩ P2 Same-Season Clear:              ${baseP2Clear.toLocaleString()} px (${((baseP2Clear / totalZone) * 100).toFixed(2)}%, ${(baseP2Clear * 0.01).toFixed(2)} ha)`);
  console.log(`Baseline ∩ P3 Recovery Clear:                 ${baseP3Clear.toLocaleString()} px (${((baseP3Clear / totalZone) * 100).toFixed(2)}%, ${(baseP3Clear * 0.01).toFixed(2)} ha)`);
  console.log(`3-Way Intersection (Baseline ∩ P1 ∩ P2):      ${inter3Way.toLocaleString()} px (${((inter3Way / totalZone) * 100).toFixed(2)}%, ${(inter3Way * 0.01).toFixed(2)} ha)`);
  console.log(`4-Way Common Clear (Baseline ∩ P1 ∩ P2 ∩ P3): ${inter4Way.toLocaleString()} px (${((inter4Way / totalZone) * 100).toFixed(2)}%, ${(inter4Way * 0.01).toFixed(2)} ha)`);
  console.log('================================================================\n');

  await mongoose.disconnect();
}

runZoneSclCoverageEvaluation().catch(async (e) => {
  console.error('Fatal evaluation error:', e);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
  process.exit(1);
});
