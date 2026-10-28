import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';

async function inspectDb() {
  console.log('Connecting to MongoDB at', env.MONGODB_URI);
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected! readyState:', mongoose.connection.readyState);

  console.log('\n==================================================');
  console.log('CURRENT DATABASE STATE AUDIT');
  console.log('==================================================');

  // 1. ZONES
  const zones = await Zone.find().lean();
  console.log(`\n[ZONES] Total: ${zones.length}`);
  zones.forEach((z: any) => {
    console.log(` - ID: ${z._id} | ZoneId: ${z.zoneId} | Name: ${z.name} | Status: ${z.status} | Category: ${z.category} | baselineDate: ${z.baselineDate}`);
  });

  // 2. SATELLITE METADATA
  const satMetas = await SatelliteMetadata.find().lean();
  console.log(`\n[SATELLITE METADATA] Total: ${satMetas.length}`);
  satMetas.forEach((s: any) => {
    console.log(` - ID: ${s._id} | ImageId: ${s.imageId} | Source: ${s.source} | Sensor: ${s.sensorType} | AcqDate: ${s.acquisitionDate} | Cloud: ${s.cloudCover}%`);
  });

  // 3. BASELINES
  const baselines = await BaselineModel.find().lean();
  console.log(`\n[BASELINES] Total: ${baselines.length}`);
  baselines.forEach((b: any) => {
    console.log(` - ID: ${b._id} | ZoneId: ${b.zoneId} | SatMetaId: ${b.satelliteMetadataId} | Sensor: ${b.sensorType} | Status: ${b.status} | isActive: ${b.isActive}`);
    console.log(`   Task: ${b.geeExportTaskId} | DriveId: ${b.driveFileId} | LocalRaster: ${b.localRasterPath} | rasterValidated: ${b.rasterValidated}`);
    console.log(`   Dimensions: ${b.rasterWidth}x${b.rasterHeight} | Bands: ${b.rasterBandCount} | CRS: ${b.rasterCrs} | IndicesCalc: ${b.spectralIndicesCalculated}`);
  });

  // 4. PROCESSED IMAGE RESULTS
  const procResults = await ProcessedImageResultModel.find().lean();
  console.log(`\n[PROCESSED IMAGE RESULTS] Total: ${procResults.length}`);
  procResults.forEach((p: any) => {
    console.log(` - ID: ${p._id} | ZoneId: ${p.zoneId} | SatMetaId: ${p.satelliteMetadataId} | Status: ${p.status}`);
  });

  // 5. MONITORING JOBS
  const jobs = await MonitoringJobModel.find().lean();
  console.log(`\n[MONITORING JOBS] Total: ${jobs.length}`);
  jobs.forEach((j: any) => {
    console.log(` - ID: ${j._id} | JobId: ${j.jobId} | ZoneId: ${j.zoneId} | Status: ${j.status} | Scheduled: ${j.scheduledAt}`);
  });

  await mongoose.disconnect();
  console.log('\nAudit complete. Disconnected.');
}

inspectDb().catch((err) => {
  console.error('Error inspecting DB:', err);
  process.exit(1);
});
