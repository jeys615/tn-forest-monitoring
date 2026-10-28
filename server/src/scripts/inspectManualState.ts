import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';

async function inspect() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB:', env.MONGODB_URI);

  const zones = await Zone.find().lean();
  console.log(`\n=== ZONES (${zones.length}) ===`);
  for (const z of zones) {
    console.log(`Zone: ${z.name} | ID: ${z._id} | zoneId: ${z.zoneId} | status: ${z.status} | category: ${z.category} | baselineDate: ${z.baselineDate}`);
  }

  const baselines = await BaselineModel.find().lean();
  console.log(`\n=== BASELINES (${baselines.length}) ===`);
  for (const b of baselines) {
    console.log(`Baseline: ${b._id} | zoneId: ${b.zoneId} | sensorType: ${b.sensorType} | status: ${b.status} | isActive: ${b.isActive} | acqDate: ${b.acquisitionDate?.toISOString()} | satMetaId: ${b.satelliteMetadataId}`);
  }

  const satMetas = await SatelliteMetadata.find().lean();
  console.log(`\n=== SATELLITE METADATA (${satMetas.length}) ===`);
  for (const s of satMetas) {
    console.log(`SatMeta: ${s._id} | imageId: ${s.imageId} | source: ${s.source} | sensorType: ${s.sensorType} | acqDate: ${s.acquisitionDate?.toISOString()} | cloudCover: ${s.cloudCover}% | zones: ${JSON.stringify(s.intersectingZones)}`);
  }

  const jobs = await MonitoringJobModel.find().lean();
  console.log(`\n=== MONITORING JOBS (${jobs.length}) ===`);
  for (const j of jobs) {
    console.log(`Job: ${j.jobId} | zoneId: ${j.zoneId} | status: ${j.status} | type: ${j.type} | scheduledAt: ${j.scheduledAt} | logs:`);
    j.logs?.forEach((l: string) => console.log(`   ${l}`));
  }

  await mongoose.disconnect();
}

inspect().catch(console.error);
