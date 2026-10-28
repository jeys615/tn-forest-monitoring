import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';

async function inspect(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);

  const zone = await Zone.findOne({ name: 'sathiyar_forest' }).lean();
  console.log('=== ZONE SATHIYAR FOREST ===');
  console.log(JSON.stringify(zone, null, 2));

  const meta = await SatelliteMetadata.findOne({ intersectingZones: zone?._id }).lean();
  console.log('\n=== SATELLITE METADATA FOR SATHIYAR FOREST ===');
  console.log(JSON.stringify(meta, null, 2));

  const allMetas = await SatelliteMetadata.find({}).lean();
  console.log('\n=== ALL SATELLITE METADATA IN DB (' + allMetas.length + ') ===');
  console.log(JSON.stringify(allMetas, null, 2));

  const job = await MonitoringJobModel.findOne({ jobId: 'JOB-D70699FD' }).lean();
  console.log('\n=== MONITORING JOB JOB-D70699FD ===');
  console.log(JSON.stringify(job, null, 2));

  await mongoose.disconnect();
  process.exit(0);
}

inspect().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
