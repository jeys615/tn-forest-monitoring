import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { getGeeConfig } from '../config/gee.js';

async function main() {
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = getGeeConfig();

  const taskId = 'projects/monitoring-system-506515/operations/D67RK4K77DDVQOL4Q5JJQPKB';
  const res = await fetch(`https://earthengine.googleapis.com/v1alpha/${taskId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': config.projectId,
    },
  });

  const data = await res.json();
  console.log('GEE Operation Details for D67RK4K77DDVQOL4Q5JJQPKB:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
