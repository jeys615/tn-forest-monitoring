import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ name: 'sathiyar_forest' });
  console.log('=== SATHIYAR FOREST ZONE ===');
  console.log(JSON.stringify(zone, null, 2));

  const metas = await SatelliteMetadata.find({});
  console.log('\n=== SATELLITE METADATA RECORDS ===');
  console.log(JSON.stringify(metas, null, 2));

  const jobs = await MonitoringJobModel.find({});
  console.log('\n=== MONITORING JOBS ===');
  console.log(JSON.stringify(jobs, null, 2));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
