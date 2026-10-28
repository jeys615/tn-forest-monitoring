import { connectDatabase } from '../config/database.js';
import { AlertModel } from '../models/Alert.js';
import { BaselineModel } from '../models/Baseline.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import mongoose from 'mongoose';

async function check() {
  await connectDatabase();
  const sirumalaiId = '6ac5a9d496837067de289f3b';
  const testZoneId = '6ac64221540f1518603d05ff';
  const cdId = '6ac64691540f1518603d091d';

  console.log('--- Alerts ---');
  const alerts = await AlertModel.find({
    $or: [{ zoneId: testZoneId }, { changeDetectionId: cdId }, { zoneId: sirumalaiId }]
  });
  console.log('Alerts:', alerts.map(a => ({
    id: a._id.toString(),
    alertId: a.alertId,
    zoneId: a.zoneId?.toString() ?? '',
    changeDetectionId: a.changeDetectionId?.toString(),
    sensorType: a.sensorType,
  })));

  console.log('--- Baselines for test zone ---');
  const baselines = await BaselineModel.find({ zoneId: testZoneId });
  console.log('Baselines:', baselines.map(b => ({
    id: b._id.toString(),
    zoneId: b.zoneId?.toString() ?? '',
    satId: b.satelliteMetadataId?.toString(),
    imageId: b.imageId,
    status: b.status,
    isActive: b.isActive,
  })));

  console.log('--- Processed Image Results ---');
  const proc = await ProcessedImageResultModel.find({
    $or: [{ zoneId: testZoneId }, { zoneId: sirumalaiId }]
  });
  console.log('Processed Image Results:', proc.map(p => ({
    id: p._id.toString(),
    zoneId: p.zoneId?.toString() ?? '',
    satId: p.satelliteMetadataId?.toString() ?? '',
  })));

  await mongoose.connection.close();
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
