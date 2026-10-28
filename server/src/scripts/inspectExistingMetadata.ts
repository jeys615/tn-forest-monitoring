import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const docs = await SatelliteMetadata.find({});
  console.log(`Found ${docs.length} SatelliteMetadata docs:`);
  for (const d of docs) {
    console.log({
      id: d._id.toString(),
      imageId: d.imageId,
      source: d.source,
      sensorType: d.sensorType,
      acquisitionDate: d.acquisitionDate,
      platform: d.platform,
      relativeOrbit: d.relativeOrbitNumber,
      metadata: d.metadata,
    });
  }
  await mongoose.disconnect();
}

main().catch(console.error);
