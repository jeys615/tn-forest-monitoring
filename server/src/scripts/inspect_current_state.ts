import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';

async function check(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log('MongoDB connected:', env.MONGODB_URI);

  console.log('\n--- ZONES ---');
  const zones = await Zone.find({});
  for (const z of zones) {
    console.log(`Zone: _id=${z._id}, zoneId=${z.zoneId}, name=${z.name}, category=${z.category}, status=${z.status}`);
  }

  console.log('\n--- SATELLITE METADATA ---');
  const metas = await SatelliteMetadata.find({});
  for (const m of metas) {
    console.log(`SatelliteMetadata: _id=${m._id}, imageId=${m.imageId}, source=${m.source}, sensorType=${m.sensorType}, acquisitionDate=${m.acquisitionDate?.toISOString()}, cloudCover=${m.cloudCover}, processingStatus=${m.processingStatus}`);
  }

  console.log('\n--- MONITORING JOBS ---');
  const jobs = await MonitoringJobModel.find({});
  for (const j of jobs) {
    console.log(`Job: _id=${j._id}, jobId=${j.jobId}, zoneId=${j.zoneId}, type=${j.type}, status=${j.status}, scheduledAt=${j.scheduledAt?.toISOString()}, satelliteMetadataId=${j.satelliteMetadataId}, errorMessage=${j.errorMessage}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

check().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
