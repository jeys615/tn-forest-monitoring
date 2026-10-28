import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function searchCandidateScenes() {
  await mongoose.connect(env.MONGODB_URI);

  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  if (!zone) throw new Error('Zone ZONE-261011-6340 not found');

  const boundary = zone.boundary as GeoJSONPolygon;
  const client = new GeeClientService();

  const windows = [
    { name: '1. January 2020 Baseline Window', start: new Date('2020-01-01T00:00:00Z'), end: new Date('2020-01-15T23:59:59Z') },
    { name: '2. February 2020 Seasonal Control Window', start: new Date('2020-02-01T00:00:00Z'), end: new Date('2020-02-28T23:59:59Z') },
    { name: '3. January 2024 Same-Season Control Window', start: new Date('2024-01-01T00:00:00Z'), end: new Date('2024-01-20T23:59:59Z') },
    { name: '4. Recovery Window (Nov 2024 – Jan 2025)', start: new Date('2024-11-01T00:00:00Z'), end: new Date('2025-01-31T23:59:59Z') },
  ];

  console.log('================================================================');
  console.log('🔍 QUERYING GEE REST API FOR SENTINEL-2 SR HARMONIZED SCENES');
  console.log('Zone: Sirumalai ZONE-261011-6340');
  console.log('================================================================\n');

  for (const win of windows) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`Searching: ${win.name} (${win.start.toISOString().split('T')[0]} to ${win.end.toISOString().split('T')[0]})`);
    console.log(`----------------------------------------------------------------`);

    try {
      const res = await client.listPublicImages({
        collection: 'COPERNICUS/S2_SR_HARMONIZED',
        geometry: boundary,
        startDate: win.start,
        endDate: win.end,
        pageSize: 50,
      });

      console.log(`Found ${res.images.length} scenes in window:`);
      for (const img of res.images) {
        const id = img.id;
        const props = img.properties || {};
        const sensingTime = props['DATATAKE_IDENTIFIER'] || props['system:time_start'];
        const cloud = props['CLOUDY_PIXEL_PERCENTAGE'];
        const tile = props['MGRS_TILE'];
        const platform = props['SPACECRAFT_NAME'];
        const bands = img.bands?.map((b: any) => b.id) || [];
        const hasScl = bands.includes('SCL');

        console.log(`  ID: ${id}`);
        console.log(`    Tile: ${tile} | Platform: ${platform} | Cloud: ${cloud}% | SCL: ${hasScl}`);
        console.log(`    Bands: ${bands.length} bands (${bands.slice(0, 8).join(', ')}...)`);
        console.log(`    Timestamp: ${props['system:time_start'] ? new Date(Number(props['system:time_start'])).toISOString() : 'N/A'}`);
      }
    } catch (err: any) {
      console.error(`Error querying ${win.name}: ${err.message}`);
    }
  }

  await mongoose.disconnect();
}

searchCandidateScenes().catch(console.error);
