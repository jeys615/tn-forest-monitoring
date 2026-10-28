import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';

async function audit() {
  await mongoose.connect(env.MONGODB_URI);

  console.log('=== 1. SYSTEM-WIDE DOCUMENT COUNTS ===');
  const counts = {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellitemetadatas: await SatelliteMetadata.countDocuments(),
    changedetections: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    monitoringjobs: await MonitoringJobModel.countDocuments(),
    incrementalmonitoringrecords: await IncrementalMonitoringRecordModel.countDocuments(),
  };
  console.log(JSON.stringify(counts, null, 2));

  console.log('\n=== 2. ALL ZONES & SENSOR MATRIX ===');
  const zones = await Zone.find({}).lean();
  for (const z of zones) {
    const optMeta = await SatelliteMetadata.countDocuments({ intersectingZones: z._id, sensorType: 'OPTICAL' });
    const sarMeta = await SatelliteMetadata.countDocuments({ intersectingZones: z._id, sensorType: 'SAR' });
    const optBase = await BaselineModel.countDocuments({ zoneId: z._id, sensorType: 'OPTICAL' });
    const sarBase = await BaselineModel.countDocuments({ zoneId: z._id, sensorType: 'SAR' });
    const optActive = await BaselineModel.countDocuments({ zoneId: z._id, sensorType: 'OPTICAL', isActive: true });
    const sarActive = await BaselineModel.countDocuments({ zoneId: z._id, sensorType: 'SAR', isActive: true });
    console.log(`ZONE: ${z.name} (${z.zoneId}) - ID: ${z._id}`);
    console.log(`  Optical Track: enabled=${z.monitoringTracks?.optical?.enabled} | Metadata: ${optMeta} | Baselines: ${optBase} (Active: ${optActive})`);
    console.log(`  SAR Track:     enabled=${z.monitoringTracks?.sar?.enabled} | Metadata: ${sarMeta} | Baselines: ${sarBase} (Active: ${sarActive})`);
    const geom = (z as any).boundaries || (z as any).geometry;
    console.log(`  Geometry:      type=${geom?.type}, coordinates count=${geom?.coordinates?.[0]?.length}`);
  }

  console.log('\n=== 3. ALL SATELLITE METADATA ===');
  const metas = await SatelliteMetadata.find({}).lean();
  for (const m of metas) {
    console.log(`Metadata ID: ${m._id}`);
    console.log(`  Image ID:          ${m.imageId}`);
    console.log(`  Acquisition Date:  ${m.acquisitionDate?.toISOString()}`);
    console.log(`  Sensor Type:       ${m.sensorType}`);
    console.log(`  Source:            ${m.source}`);
    console.log(`  Processing Status: ${m.processingStatus}`);
    console.log(`  Intersecting Zones:${m.intersectingZones?.map((id: any) => id.toString()).join(', ')}`);
    console.log(`  Cloud Cover:       ${(m as any).cloudCover ?? (m as any).cloudCoverPercentage}`);
    console.log(`  GEE Task ID:       ${m.geeExportTaskId}`);
    console.log(`  Drive File ID:     ${m.driveFileId}`);
    console.log(`  Local Raster Path: ${m.localRasterPath}`);
    console.log(`  Raster Validated:  ${m.rasterValidated}`);
    console.log(`  Raster Bands:      ${m.rasterBandCount}`);
    console.log(`  Raster CRS:        ${m.rasterCrs}`);
    console.log(`  Dimensions:        ${m.rasterWidth}x${m.rasterHeight}`);
  }

  console.log('\n=== 4. ALL BASELINES ===');
  const baselines = await BaselineModel.find({}).lean();
  for (const b of baselines) {
    console.log(`Baseline ID: ${b._id}`);
    console.log(`  Zone ID:             ${b.zoneId}`);
    console.log(`  SatelliteMetadataId: ${b.satelliteMetadataId}`);
    console.log(`  Image ID:            ${b.imageId}`);
    console.log(`  Acquisition Date:    ${b.acquisitionDate?.toISOString()}`);
    console.log(`  Sensor Type:         ${b.sensorType}`);
    console.log(`  Source:              ${b.source}`);
    console.log(`  Status:              ${b.status}`);
    console.log(`  isActive:            ${b.isActive}`);
    console.log(`  GEE Export Task ID:  ${b.geeExportTaskId}`);
    console.log(`  Drive File ID:       ${b.driveFileId}`);
    console.log(`  Drive File Size:     ${b.driveFileSizeBytes}`);
    console.log(`  Local Raster Path:   ${b.localRasterPath}`);
    console.log(`  Raster Validated:    ${b.rasterValidated}`);
    console.log(`  Raster Bands:        ${b.rasterBandCount}`);
    console.log(`  Raster CRS:          ${b.rasterCrs}`);
    console.log(`  Dimensions:          ${b.rasterWidth}x${b.rasterHeight}`);
    console.log(`  Failure Reason:      ${b.failureReason}`);
    console.log(`  Error Details:       ${JSON.stringify((b as any).errorDetails)}`);
  }

  await mongoose.disconnect();
}

audit().catch(console.error);
