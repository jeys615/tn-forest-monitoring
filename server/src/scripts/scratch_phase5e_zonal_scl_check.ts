import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

const VADIPATTI_BOUNDARY: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.00817383274334, 10.09471042452626],
      [78.00233432251187, 10.05346057995144],
      [78.01916585200254, 10.051431763047695],
      [78.06656893505799, 10.075100500617625],
      [78.08752247177091, 10.106205341808577],
      [78.07069094228022, 10.115671435666338],
      [78.03187537427105, 10.108571891416764],
      [78.00817383274334, 10.09471042452626],
    ],
  ],
};

const SATHIYAR_BOUNDARY: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.07470465117308, 10.118261747031166],
      [78.08672717223784, 10.111838408411883],
      [78.0939406848767, 10.11969852887474],
      [78.08904580130034, 10.123501743888568],
      [78.07977128505037, 10.1228256200689],
      [78.07521990207582, 10.12198046329112],
      [78.07470465117308, 10.118261747031166],
    ],
  ],
};

const TARGET_SCENES = [
  {
    role: 'T0 Baseline Reference',
    assetId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
    date: '2020-01-09',
  },
  {
    role: 'T1 Current Observation',
    assetId: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM',
    date: '2024-02-07',
  },
];

async function computeZonalScl(
  token: string,
  projectId: string,
  assetId: string,
  boundary: GeoJSONPolygon,
  scaleMeters = 20,
): Promise<Record<string, number>> {
  const url = `https://earthengine.googleapis.com/v1alpha/projects/${projectId}/value:compute`;

  const expressionValues: Record<string, unknown> = {
    zone_geom: {
      functionInvocationValue: {
        functionName: 'GeometryConstructors.Polygon',
        arguments: {
          coordinates: { constantValue: boundary.coordinates },
        },
      },
    },
    raw_img: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: {
          id: { constantValue: assetId },
        },
      },
    },
    scl: {
      functionInvocationValue: {
        functionName: 'Image.select',
        arguments: {
          input: { valueReference: 'raw_img' },
          bandSelectors: { constantValue: ['SCL'] },
        },
      },
    },
    hist_reducer: {
      functionInvocationValue: {
        functionName: 'Reducer.frequencyHistogram',
        arguments: {},
      },
    },
    reduction: {
      functionInvocationValue: {
        functionName: 'Image.reduceRegion',
        arguments: {
          image: { valueReference: 'scl' },
          geometry: { valueReference: 'zone_geom' },
          scale: { constantValue: scaleMeters },
          reducer: { valueReference: 'hist_reducer' },
          maxPixels: { constantValue: 1000000000 },
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': projectId,
    },
    body: JSON.stringify({
      expression: {
        values: expressionValues,
        result: 'reduction',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GEE compute error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const hist = (data as any)?.result?.SCL || (data as any)?.result?.value?.SCL || {};
  return hist;
}

function analyzeHistogram(hist: Record<string, number>) {
  let total = 0;
  let clear = 0;
  let cloud = 0;
  let shadow = 0;
  let other = 0;

  for (const [k, v] of Object.entries(hist)) {
    const cls = parseInt(k, 10);
    const count = Number(v);
    total += count;

    if (cls === 4 || cls === 5 || cls === 6) clear += count;
    else if (cls === 8 || cls === 9 || cls === 10) cloud += count;
    else if (cls === 2 || cls === 3) shadow += count;
    else other += count;
  }

  return {
    total,
    clear,
    cloud,
    shadow,
    other,
    clearPct: total > 0 ? (clear / total) * 100 : 0,
    cloudPct: total > 0 ? (cloud / total) * 100 : 0,
    shadowPct: total > 0 ? (shadow / total) * 100 : 0,
    otherPct: total > 0 ? (other / total) * 100 : 0,
  };
}

async function main() {
  console.log('================================================================');
  console.log('🛰️ GEE ZONAL SCL PIXEL ANALYSIS FOR VADIPATTI & SATHIYAR');
  console.log('================================================================\n');

  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  if (!token) throw new Error('GEE auth failed');
  const config = auth.getConfig();

  const zones = [
    { name: 'Vadipatti Reserve (ZONE-260829-8997 / ZONE-260913-7787)', boundary: VADIPATTI_BOUNDARY },
    { name: 'Sathiyar Basin (ZONE-260829-8998 / ZONE-260826-5537)', boundary: SATHIYAR_BOUNDARY },
  ];

  for (const z of zones) {
    console.log(`\n================================================================`);
    console.log(`Zone: ${z.name}`);
    console.log(`================================================================`);

    for (const sc of TARGET_SCENES) {
      console.log(`\nScene: [${sc.role}] ${sc.assetId} (${sc.date})`);
      const hist = await computeZonalScl(token, config.projectId, sc.assetId, z.boundary);
      const a = analyzeHistogram(hist);

      console.log(`  Raw Histogram (SCL Classes):`);
      for (const [k, v] of Object.entries(hist).sort((x, y) => Number(x[0]) - Number(y[0]))) {
        const clsNames: Record<number, string> = {
          0: 'NO_DATA',
          1: 'SATURATED_OR_DEFECTIVE',
          2: 'DARK_AREA_PIXELS',
          3: 'CLOUD_SHADOWS',
          4: 'VEGETATION',
          5: 'NOT_VEGETATED_SOIL',
          6: 'WATER',
          7: 'UNCLASSIFIED',
          8: 'CLOUD_MEDIUM_PROBABILITY',
          9: 'CLOUD_HIGH_PROBABILITY',
          10: 'THIN_CIRRUS',
          11: 'SNOW_ICE',
        };
        const name = clsNames[Number(k)] || 'UNKNOWN';
        console.log(`    Class ${k.padStart(2)} (${name.padEnd(25)}): ${Math.round(v).toLocaleString().padStart(8)} px (${((v / a.total) * 100).toFixed(2)}%)`);
      }

      console.log(`  Zonal SCL Summary:`);
      console.log(`    - Total Evaluated Pixels (20m): ${Math.round(a.total).toLocaleString()} px`);
      console.log(`    - Clear Pixels (Veg+Soil+Water): ${Math.round(a.clear).toLocaleString()} px (${a.clearPct.toFixed(2)}%)`);
      console.log(`    - Cloud Pixels (Med+High+Cirrus): ${Math.round(a.cloud).toLocaleString()} px (${a.cloudPct.toFixed(2)}%)`);
      console.log(`    - Shadow Pixels (Dark+CloudShadow): ${Math.round(a.shadow).toLocaleString()} px (${a.shadowPct.toFixed(2)}%)`);
      console.log(`    - Other/Invalid:                ${Math.round(a.other).toLocaleString()} px (${a.otherPct.toFixed(2)}%)`);
      console.log(`    - Baseline Suitability:         ${a.clearPct >= 95 ? '✅ EXCELLENT (>95% Clear)' : a.clearPct >= 80 ? '⚠️ ACCEPTABLE (>80% Clear)' : '❌ UNACCEPTABLE (<80% Clear)'}`);
    }
  }

  console.log('\n================================================================');
  console.log('ZONAL SCL ANALYSIS COMPLETE');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Error in main:', err);
  process.exit(1);
});
