import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function checkMoreScenes() {
  await mongoose.connect(env.MONGODB_URI);

  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  if (!zone) throw new Error('Zone not found');

  const boundary = zone.boundary as GeoJSONPolygon;
  const client = new GeeClientService();

  // Search late Jan 2024 to early Feb 2024 (up to 2024-02-07)
  console.log('Searching late January / early February 2024 (2024-01-20 to 2024-02-06):');
  const res = await client.listPublicImages({
    collection: 'COPERNICUS/S2_SR_HARMONIZED',
    geometry: boundary,
    startDate: new Date('2024-01-20T00:00:00Z'),
    endDate: new Date('2024-02-06T23:59:59Z'),
    pageSize: 50,
  });

  console.log(`Found ${res.images.length} scenes:`);
  for (const img of res.images) {
    const p = img.properties || {};
    console.log(`  ID: ${img.id}`);
    console.log(`    Tile: ${p['MGRS_TILE']} | Platform: ${p['SPACECRAFT_NAME']} | Cloud: ${p['CLOUDY_PIXEL_PERCENTAGE']}%`);
    console.log(`    Timestamp: ${p['system:time_start'] ? new Date(Number(p['system:time_start'])).toISOString() : 'N/A'}`);
  }

  // Also check post-monsoon green peak in Jan 2021, Jan 2022, Jan 2023 for historical context
  console.log('\nSearching January 2021-2023 same-season benchmarks:');
  for (const year of [2021, 2022, 2023]) {
    const yRes = await client.listPublicImages({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: boundary,
      startDate: new Date(`${year}-01-05T00:00:00Z`),
      endDate: new Date(`${year}-01-15T23:59:59Z`),
      pageSize: 5,
    });
    console.log(`Year ${year} Jan 5-15: Found ${yRes.images.length} scenes:`);
    for (const img of yRes.images) {
      const p = img.properties || {};
      console.log(`  ${img.id} | Cloud: ${p['CLOUDY_PIXEL_PERCENTAGE']}% | ${p['SPACECRAFT_NAME']}`);
    }
  }

  await mongoose.disconnect();
}

checkMoreScenes().catch(console.error);
