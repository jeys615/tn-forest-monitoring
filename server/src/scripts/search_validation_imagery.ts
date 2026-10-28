import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { GeeSatelliteService } from '../services/gee/GeeSatelliteService.js';
import { SatelliteSource } from '@tn-forest/shared/types';
import mongoose from 'mongoose';

async function main() {
  await connectDatabase();
  const zone = await Zone.findOne({ name: 'VALIDATION-SIRUMALAI-S2' });
  if (!zone) {
    console.error('Zone VALIDATION-SIRUMALAI-S2 not found!');
    process.exit(1);
  }
  console.log(`Zone found: ${zone.name} (${zone.zoneId})`);
  console.log('Centroid:', zone.centerPoint.coordinates);
  console.log('Boundary:', JSON.stringify(zone.boundary));

  const geeService = new GeeSatelliteService();

  console.log('\n--- 1. Searching Real GEE Sentinel-2 Imagery (2025-10-01 to 2026-03-31, max cloud 25%) ---');
  try {
    const res = await geeService.searchSentinel2Images({
      zoneId: (zone._id as any).toString(),
      startDate: '2025-10-01',
      endDate: '2026-03-31',
      maxCloudCover: 25,
      source: SatelliteSource.SENTINEL_2,
    });

    console.log(`Search result: totalFound = ${res.totalFound}`);
    for (let i = 0; i < Math.min(res.images.length, 10); i++) {
      const img = res.images[i];
      console.log(`[${i + 1}] ID: ${img.imageId}`);
      console.log(`    Date: ${img.acquisitionDate} | Cloud: ${img.cloudCoverPercentage?.toFixed(2) ?? '0.00'}% | Sensor: ${(img as any).sensor ?? (img as any).sensorType ?? 'OPTICAL'}`);
    }
  } catch (err: any) {
    console.error('GEE Search failed:', err.message || err);
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(console.error);
