import { GeeClientService } from '../services/gee/GeeClientService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

async function run() {
  const gee = new GeeClientService();
  const geometry: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [[[78.6, 11.1], [78.7, 11.1], [78.7, 11.2], [78.6, 11.2], [78.6, 11.1]]],
  };

  const startDate = new Date('2024-01-01T00:00:00Z');
  const endDate = new Date('2024-01-31T23:59:59Z');

  console.log('--- Listing All Real Images on MGRS Tile T43PHN (Jan 2024) ---');

  const s2 = await gee.listPublicImages({
    collection: 'COPERNICUS/S2_SR_HARMONIZED',
    geometry,
    startDate,
    endDate,
    pageSize: 20,
  });
  const s2T43 = s2.images.filter((i) => i.id.includes('T43PHN'));
  console.log('\nSentinel-2 T43PHN Images:', s2T43.length);
  for (const img of s2T43) {
    console.log(`  ID: ${img.id}`);
    console.log(`    Time: ${img.startTime}`);
    console.log(`    Cloud: ${img.properties?.CLOUDY_PIXEL_PERCENTAGE ?? img.properties?.cloud_cover}%`);
  }

  const l8 = await gee.listPublicImages({
    collection: 'LANDSAT/LC08/C02/T1_L2',
    geometry,
    startDate,
    endDate,
    pageSize: 20,
  });
  console.log('\nLandsat-8 Images:', l8.images.length);
  for (const img of l8.images) {
    console.log(`  ID: ${img.id}`);
    console.log(`    Time: ${img.startTime}`);
    console.log(`    Cloud: ${img.properties?.CLOUD_COVER ?? img.properties?.cloud_cover}%`);
  }

  const s30 = await gee.listPublicImages({
    collection: 'NASA/HLS/HLSS30/v002',
    geometry,
    startDate,
    endDate,
    pageSize: 50,
  });
  const s30T43 = s30.images.filter((i) => i.id.includes('T43PHN'));
  console.log('\nNASA HLS S30 T43PHN Images:', s30T43.length);
  for (const img of s30T43) {
    console.log(`  ID: ${img.id}`);
    console.log(`    Time: ${img.startTime}`);
    console.log(`    Cloud: ${img.properties?.cloud_coverage ?? img.properties?.cloud_cover}%`);
  }

  const l30 = await gee.listPublicImages({
    collection: 'NASA/HLS/HLSL30/v002',
    geometry,
    startDate,
    endDate,
    pageSize: 50,
  });
  const l30T43 = l30.images.filter((i) => i.id.includes('T43PHN'));
  console.log('\nNASA HLS L30 T43PHN Images:', l30T43.length);
  for (const img of l30T43) {
    console.log(`  ID: ${img.id}`);
    console.log(`    Time: ${img.startTime}`);
    console.log(`    Cloud: ${img.properties?.cloud_coverage ?? img.properties?.cloud_cover}%`);
  }
}

run().catch((err) => console.error('Fatal error:', err));
