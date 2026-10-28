import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { GeeTaskService } from '../services/gee/GeeTaskService.js';
import fs from 'node:fs';
import path from 'node:path';

async function audit() {
  console.log('================================================================');
  console.log('🔍 READ-ONLY SIRUMALAI SAR BASELINE & METADATA AUDIT');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to database:', mongoose.connection.name);

  // 1. Zones
  console.log('\n--- 1. ALL ZONES ---');
  const zones = await Zone.find({}).lean();
  zones.forEach((z: any) => {
    console.log(`Zone: ${z.name} (zoneId: ${z.zoneId}, _id: ${z._id})`);
    console.log(`  Category: ${z.category}, Status: ${z.status}`);
    console.log(`  Monitoring Tracks: optical=${z.monitoringTracks?.optical?.enabled}, sar=${z.monitoringTracks?.sar?.enabled}`);
  });

  const sirumalaiZone = zones.find((z: any) => z.name.toLowerCase().includes('sirumalai'));
  const vadipattiZone = zones.find((z: any) => z.name.toLowerCase().includes('vadipatti'));

  console.log('\nTarget Sirumalai Zone:', sirumalaiZone ? `${sirumalaiZone.name} (${sirumalaiZone._id})` : 'NOT FOUND');
  console.log('Target Vadipatti Zone:', vadipattiZone ? `${vadipattiZone.name} (${vadipattiZone._id})` : 'NOT FOUND');

  // 2. All SatelliteMetadata
  console.log('\n--- 2. ALL SATELLITE METADATA RECORDS ---');
  const allMeta = await SatelliteMetadata.find({}).lean();
  console.log(`Total SatelliteMetadata count: ${allMeta.length}`);
  allMeta.forEach((m: any, idx: number) => {
    console.log(`\n[Metadata #${idx + 1}] _id: ${m._id}`);
    console.log(`  imageId: ${m.imageId}`);
    console.log(`  sensorType: ${m.sensorType}, source: ${m.source}`);
    console.log(`  acquisitionDate (ISO UTC): ${m.acquisitionDate?.toISOString()}`);
    console.log(`  acquisitionDate (Local): ${m.acquisitionDate ? new Date(m.acquisitionDate).toLocaleString() : 'N/A'}`);
    console.log(`  processingStatus: ${m.processingStatus}`);
    console.log(`  intersectingZones: ${JSON.stringify(m.intersectingZones)}`);
    console.log(`  geeReference: ${m.geeReference}`);
    console.log(`  geeExportTaskId: ${m.geeExportTaskId ?? 'undefined'}`);
    console.log(`  driveFileId: ${m.driveFileId ?? 'undefined'}`);
    console.log(`  driveFileName: ${m.driveFileName ?? 'undefined'}`);
    console.log(`  driveFileSizeBytes: ${m.driveFileSizeBytes ?? 'undefined'}`);
    console.log(`  localRasterPath: ${m.localRasterPath ?? 'undefined'}`);
    console.log(`  rasterValidated: ${m.rasterValidated ?? 'undefined'}`);
    console.log(`  rasterBandCount: ${m.rasterBandCount ?? 'undefined'}`);
    console.log(`  rasterWidth: ${m.rasterWidth ?? 'undefined'}, rasterHeight: ${m.rasterHeight ?? 'undefined'}`);
    console.log(`  rasterCrs: ${m.rasterCrs ?? 'undefined'}, areaCalculationCrs: ${m.areaCalculationCrs ?? 'undefined'}`);
    console.log(`  resolutionMeters: ${m.resolutionMeters ?? 'undefined'}`);
    console.log(`  createdAt: ${m.createdAt?.toISOString()}, updatedAt: ${m.updatedAt?.toISOString()}`);
  });

  // 3. All Baselines
  console.log('\n--- 3. ALL BASELINE RECORDS ---');
  const allBaselines = await BaselineModel.find({}).lean();
  console.log(`Total Baseline count: ${allBaselines.length}`);
  allBaselines.forEach((b: any, idx: number) => {
    console.log(`\n[Baseline #${idx + 1}] _id: ${b._id}`);
    console.log(`  zoneId: ${b.zoneId}`);
    console.log(`  satelliteMetadataId: ${b.satelliteMetadataId}`);
    console.log(`  sensorType: ${b.sensorType}, monitoringTrack: ${b.monitoringTrack}, source: ${b.source}`);
    console.log(`  status: ${b.status}, isActive: ${b.isActive}`);
    console.log(`  acquisitionDate (ISO UTC): ${b.acquisitionDate?.toISOString()}`);
    console.log(`  acquisitionDate (Local): ${b.acquisitionDate ? new Date(b.acquisitionDate).toLocaleString() : 'N/A'}`);
    console.log(`  selectionReason: ${b.selectionReason}`);
    console.log(`  geeExportTaskId: ${b.geeExportTaskId ?? 'undefined'}`);
    console.log(`  driveFileId: ${b.driveFileId ?? 'undefined'}`);
    console.log(`  driveFileName: ${b.driveFileName ?? 'undefined'}`);
    console.log(`  driveFileSizeBytes: ${b.driveFileSizeBytes ?? 'undefined'}`);
    console.log(`  localRasterPath: ${b.localRasterPath ?? 'undefined'}`);
    console.log(`  rasterValidated: ${b.rasterValidated ?? 'undefined'}`);
    console.log(`  rasterBandCount: ${b.rasterBandCount ?? 'undefined'}`);
    console.log(`  rasterWidth: ${b.rasterWidth ?? 'undefined'}, rasterHeight: ${b.rasterHeight ?? 'undefined'}`);
    console.log(`  rasterCrs: ${b.rasterCrs ?? 'undefined'}`);
    console.log(`  spectralIndicesCalculated: ${b.spectralIndicesCalculated ?? 'undefined'}`);
  });

  // 4. Check GEE Export Operations for any baselines/metadata with geeExportTaskId
  console.log('\n--- 4. GEE EXPORT TASK STATUS CHECK ---');
  const gee = new GeeTaskService();
  
  const tasksToCheck = new Set<string>();
  allBaselines.forEach((b: any) => { if (b.geeExportTaskId) tasksToCheck.add(b.geeExportTaskId); });
  allMeta.forEach((m: any) => { if (m.geeExportTaskId) tasksToCheck.add(m.geeExportTaskId); });

  console.log(`Found ${tasksToCheck.size} unique GEE export tasks to check:`);
  for (const taskId of tasksToCheck) {
    console.log(`\nChecking GEE task: ${taskId}`);
    try {
      const status = await gee.getTaskStatus(taskId);
      console.log(`  Task status result:`, JSON.stringify(status, null, 2));
    } catch (err: any) {
      console.error(`  Error checking task ${taskId}:`, err.message);
    }
  }

  // 5. Local storage inspection
  console.log('\n--- 5. LOCAL STORAGE INSPECTION ---');
  const storageDir = path.resolve('storage', 'raster_temp');
  console.log(`Checking local storage directory: ${storageDir}`);
  if (fs.existsSync(storageDir)) {
    const listDir = (dir: string, depth = 0): void => {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          console.log(`${' '.repeat(depth * 2)}[DIR] ${f}`);
          listDir(full, depth + 1);
        } else {
          console.log(`${' '.repeat(depth * 2)}[FILE] ${f} (${stat.size} bytes)`);
        }
      }
    };
    listDir(storageDir);
  } else {
    console.log('Directory does not exist!');
  }

  await mongoose.disconnect();
  console.log('\n Audit script completed cleanly.');
}

audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
