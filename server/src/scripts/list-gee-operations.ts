import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { getGeeConfig } from '../config/gee.js';

async function listOperations() {
  const auth = GeeAuthService.getInstance();
  const config = getGeeConfig();
  const token = await auth.getAccessToken();

  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/operations`;
  console.log(`Querying GEE Operations: ${url}`);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': config.projectId,
    },
  });

  console.log(`Status: ${res.status} ${res.statusText}`);
  if (res.ok) {
    const data = await res.json();
    console.log(`Total operations returned: ${data.operations?.length || 0}`);
    for (const op of data.operations || []) {
      console.log(`\nOperation: ${op.name}`);
      console.log(`  Done:     ${op.done}`);
      console.log(`  Metadata:`, JSON.stringify(op.metadata));
      if (op.error) {
        console.log(`  Error:   `, JSON.stringify(op.error));
      }
      if (op.response) {
        console.log(`  Response:`, JSON.stringify(op.response));
      }
    }
  } else {
    const err = await res.text();
    console.error('Operations Error:', err);
  }
}

listOperations().catch(console.error);
