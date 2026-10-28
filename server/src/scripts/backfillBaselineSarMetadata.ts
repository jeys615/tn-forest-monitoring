import mongoose from 'mongoose';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { SensorType } from '@tn-forest/shared/types';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tn_forest_monitoring';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const sarBaselines = await BaselineModel.find({ sensorType: SensorType.SAR });
  console.log(`Found ${sarBaselines.length} SAR baseline records.`);

  for (const b of sarBaselines) {
    const meta = await SatelliteMetadata.findById(b.satelliteMetadataId);
    if (!meta) {
      console.warn(`Baseline ${b._id} has no linked metadata (${b.satelliteMetadataId})`);
      continue;
    }

    b.platform = meta.platform || 'Sentinel-1A';
    b.mode = meta.mode || 'IW';
    b.polarizations = meta.polarizations || ['VV', 'VH'];
    b.orbitDirection = (meta.orbitDirection as 'ASCENDING' | 'DESCENDING') || 'DESCENDING';
    b.absoluteOrbitNumber = meta.absoluteOrbitNumber;
    b.relativeOrbitNumber = meta.relativeOrbitNumber;

    await b.save();
    console.log(`Updated Baseline ${b._id} (${b.imageId}): Track ${b.relativeOrbitNumber}, OrbitDirection ${b.orbitDirection}, Status ${b.status}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
