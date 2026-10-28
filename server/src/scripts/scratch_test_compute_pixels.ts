import { GeeAuthService } from '../services/gee/GeeAuthService.js';

async function testComputePixels() {
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const url = `https://earthengine.googleapis.com/v1/projects/${config.projectId}/image:computePixels`;
  const body = {
    expression: {
      functionInvocationValue: {
        functionName: 'Image.load',
        arguments: {
          id: {
            constantValue: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM'
          }
        }
      }
    },
    fileFormat: 'GEO_TIFF',
    bandIds: ['SCL'],
    grid: {
      dimensions: {
        width: 10,
        height: 10
      },
      affineTransform: {
        scaleX: 20.0,
        shearX: 0.0,
        translateX: 825000.0,
        shearY: 0.0,
        scaleY: -20.0,
        translateY: 1130000.0
      },
      crsCode: 'EPSG:32643'
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': config.projectId,
      },
      body: JSON.stringify(body),
    });

    console.log('HTTP Status:', res.status, res.statusText);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      console.log('Success! Received GeoTIFF bytes:', buffer.byteLength);
    } else {
      const err = await res.text();
      console.error('Error body:', err);
    }
  } catch (err: any) {
    console.error('Fetch error:', err.message);
  }
}

testComputePixels().catch(console.error);
