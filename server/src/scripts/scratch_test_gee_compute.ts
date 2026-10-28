import { GeeAuthService } from '../services/gee/GeeAuthService.js';

async function testGeeCompute() {
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/value:compute`;
  const body = {
    expression: {
      values: {
        const42: {
          constantValue: 42
        }
      },
      result: 'const42'
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

    console.log('Test HTTP status:', res.status, res.statusText);
    const data = await res.json();
    console.log('Test Response:', JSON.stringify(data));
  } catch (err: any) {
    console.error('Test Error:', err.message);
  }
}

testGeeCompute().catch(console.error);
