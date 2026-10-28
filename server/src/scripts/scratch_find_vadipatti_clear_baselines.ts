import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
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

async function findClearVadipattiBaselines() {
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  if (!token) throw new Error('GEE auth failed');
  const config = auth.getConfig();

  const geeClient = new GeeClientService();
  console.log('Searching Sentinel-2 scenes for Vadipatti (Dec 2019 – Feb 2020)...');

  const res = await geeClient.listPublicImages({
    collection: 'COPERNICUS/S2_SR_HARMONIZED',
    geometry: VADIPATTI_BOUNDARY,
    startDate: new Date('2019-12-01T00:00:00Z'),
    endDate: new Date('2020-03-01T23:59:59Z'),
    pageSize: 50,
  });

  const t43phmScenes = res.images.filter((img) => img.id.endsWith('T43PHM'));
  console.log(`Found ${t43phmScenes.length} scenes in tile T43PHM:`);

  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  for (const img of t43phmScenes) {
    const tileCloud = img.properties['CLOUDY_PIXEL_PERCENTAGE'];
    const timeStart = img.properties['system:time_start'];
    const dateStr = timeStart ? new Date(Number(timeStart)).toISOString().slice(0, 10) : 'N/A';

    // Compute zonal SCL
    const expressionValues: Record<string, unknown> = {
      zone_geom: {
        functionInvocationValue: {
          functionName: 'GeometryConstructors.Polygon',
          arguments: { coordinates: { constantValue: VADIPATTI_BOUNDARY.coordinates } },
        },
      },
      raw_img: {
        functionInvocationValue: {
          functionName: 'Image.load',
          arguments: { id: { constantValue: img.id } },
        },
      },
      scl: {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: { input: { valueReference: 'raw_img' }, bandSelectors: { constantValue: ['SCL'] } },
        },
      },
      hist_reducer: {
        functionInvocationValue: { functionName: 'Reducer.frequencyHistogram', arguments: {} },
      },
      reduction: {
        functionInvocationValue: {
          functionName: 'Image.reduceRegion',
          arguments: {
            image: { valueReference: 'scl' },
            geometry: { valueReference: 'zone_geom' },
            scale: { constantValue: 50 }, // fast scale for screening
            reducer: { valueReference: 'hist_reducer' },
            maxPixels: { constantValue: 100000000 },
          },
        },
      },
    };

    const compRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': config.projectId,
      },
      body: JSON.stringify({
        expression: { values: expressionValues, result: 'reduction' },
      }),
    });

    if (compRes.ok) {
      const data = await compRes.json();
      const hist: Record<string, number> = (data as any)?.result?.SCL || {};
      let total = 0;
      let clear = 0;
      let cloud = 0;
      let shadow = 0;
      for (const [k, v] of Object.entries(hist)) {
        const cls = parseInt(k, 10);
        const count = Number(v);
        total += count;
        if (cls === 4 || cls === 5 || cls === 6) clear += count;
        else if (cls === 8 || cls === 9 || cls === 10) cloud += count;
        else if (cls === 2 || cls === 3) shadow += count;
      }
      const clearPct = total > 0 ? (clear / total) * 100 : 0;
      const cloudPct = total > 0 ? (cloud / total) * 100 : 0;
      const shadowPct = total > 0 ? (shadow / total) * 100 : 0;

      console.log(
        `  ${dateStr} | ${img.id.slice(-34)} | Tile Cloud: ${String(tileCloud).padStart(5)}% | ` +
        `Zone Clear: ${clearPct.toFixed(1)}% | Zone Cloud: ${cloudPct.toFixed(1)}% | Zone Shadow: ${shadowPct.toFixed(1)}% ` +
        `${clearPct >= 95 ? '⭐ EXCELLENT BASELINE CANDIDATE' : clearPct >= 85 ? '✔ GOOD' : '❌ CLOUDY/SHADOW'}`
      );
    }
  }
}

findClearVadipattiBaselines().catch(console.error);
