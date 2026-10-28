import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  const sirumalai = await Zone.findOne({ zoneId: 'ZONE-260925-8986' }).lean();
  console.log('Sirumalai Zone ID:', sirumalai?._id);

  const changes = await ChangeDetectionModel.find({ zoneId: sirumalai?._id }).lean();
  console.log('Found changes for Sirumalai:', changes.length);
  for (const c of changes) {
    console.log('------------------------------------------------------------');
    console.log(`Change ID: ${c._id}`);
    console.log(JSON.stringify(c, null, 2));
  }

  // Also check Baselines for Sirumalai
  const baselines = await BaselineModel.find({ zoneId: sirumalai?._id }).lean();
  console.log('\nBaselines for Sirumalai:');
  for (const b of baselines) {
    console.log(`  [${b.sensorType}] ID: ${b._id} | Date: ${b.acquisitionDate.toISOString().slice(0, 10)} | Status: ${b.status} | Raster: ${b.localRasterPath}`);
  }

  // Also check SatelliteMetadata for Sirumalai
  const metas = await SatelliteMetadata.find({ intersectingZones: sirumalai?._id }).lean();
  console.log('\nSatelliteMetadata for Sirumalai:');
  for (const m of metas) {
    console.log(`  [${m.sensorType}] ID: ${m._id} | Date: ${m.acquisitionDate.toISOString().slice(0, 10)} | ImageId: ${m.imageId} | Raster: ${m.localRasterPath}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
