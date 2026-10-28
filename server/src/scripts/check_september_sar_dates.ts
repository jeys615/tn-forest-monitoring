import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { Zone } from '../models/Zone.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SensorType } from '@tn-forest/shared/types';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  const provider = new GeeSatelliteProvider();
  const imgs = await provider.searchSarImages(vadipatti!.boundary, {
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-26'),
    sensorType: SensorType.SAR,
  });
  console.log(`Found ${imgs.length} images:`);
  for (const img of imgs) {
    console.log(`  ID: ${img.imageId} | Date: ${img.acquisitionDate}`);
  }
  await mongoose.disconnect();
}
main();
