import { GeeAuthService } from '../services/gee/GeeAuthService.js';

const SATHIYAR_COORDS = [
  [
    [78.07470465117308, 10.118261747031166],
    [78.08672717223784, 10.111838408411883],
    [78.0939406848767, 10.11969852887474],
    [78.08904580130034, 10.123501743888568],
    [78.07977128505037, 10.1228256200689],
    [78.07521990207582, 10.12198046329112],
    [78.07470465117308, 10.118261747031166],
  ],
];

async function checkGeeHist() {
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;

  const body = {
    expression: {
      values: {
        zone_geom: {
          functionInvocationValue: {
            functionName: 'GeometryConstructors.Polygon',
            arguments: {
              coordinates: { constantValue: SATHIYAR_COORDS },
            },
          },
        },
        raw_img: {
          functionInvocationValue: {
            functionName: 'Image.load',
            arguments: {
              id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM' },
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
              scale: { constantValue: 20 },
              reducer: { valueReference: 'hist_reducer' },
              maxPixels: { constantValue: 1000000000 },
            },
          },
        },
      },
      result: 'reduction',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': config.projectId,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  console.log('GEE raw response:', JSON.stringify(json, null, 2));
}

checkGeeHist().catch(console.error);
