import { HLSAcquisitionService } from '../src/services/hls/HLSAcquisitionService.js';
import { GeoJSONPolygon } from '@tn-forest/shared/types';

async function testL30Query() {
  const boundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [76.5, 11.5],
        [76.6, 11.5],
        [76.6, 11.6],
        [76.5, 11.6],
        [76.5, 11.5],
      ],
    ],
  };

  const acqService = new HLSAcquisitionService();
  console.log('Testing GEE L30 discovery for Landsat-8 on 2026-03-01...');

  const geeClient = (acqService as any).geeClient;

  const startDate = new Date('2026-02-15T00:00:00.000Z');
  const endDate = new Date('2026-03-15T23:59:59.999Z');

  const result = await geeClient.fetchAllPublicImages({
    collection: 'NASA/HLS/HLSL30/v002',
    geometry: boundary,
    startDate,
    endDate,
    pageSize: 100,
    maxPages: 10,
  });

  console.log(`Found ${result.images.length} L30 images in NASA/HLS/HLSL30/v002:`);
  for (const img of result.images) {
    const timeMs = Number(img.properties?.['system:time_start'] || img.properties?.['startTime'] || 0);
    const dateStr = timeMs ? new Date(timeMs).toISOString() : 'no-time';
    console.log(`  ID: ${img.id}, time: ${dateStr}, cloud: ${img.properties?.['cloudCover'] || img.properties?.['CLOUD_COVERAGE']}`);
  }
}

testL30Query().catch(console.error);
