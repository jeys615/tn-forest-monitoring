import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';

function computeCollectionHash(docs: any[]): string {
  // Sort docs by _id for deterministic hashing
  const sorted = [...docs].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const json = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(json).digest('hex');
}

async function auditDatabaseAndZones() {
  console.log('Connecting to MongoDB at:', env.MONGODB_URI);
  await mongoose.connect(env.MONGODB_URI);

  console.log('\n================================================================');
  console.log('🔒 PHASE 5C: DATABASE INTEGRITY & SHA-256 HASH AUDIT');
  console.log('================================================================\n');

  const models: Record<string, mongoose.Model<any>> = {
    users: User,
    zones: Zone,
    baselines: BaselineModel,
    satellitemetadatas: SatelliteMetadata,
    changedetections: ChangeDetectionModel,
    alerts: AlertModel,
    monitoringjobs: MonitoringJobModel,
    incrementalmonitoringrecords: IncrementalMonitoringRecordModel,
  };

  const snapshot: Record<string, { count: number; hash: string }> = {};

  for (const [name, model] of Object.entries(models)) {
    const docs = await model.find({}).lean();
    const hash = computeCollectionHash(docs);
    snapshot[name] = { count: docs.length, hash };
    console.log(`- ${name.padEnd(30)}: Count = ${String(docs.length).padStart(4)} | SHA-256 = ${hash}`);
  }

  const allZones = await Zone.find({}).lean();
  console.log(`Found ${allZones.length} total zones in database:\n`);

  for (const zone of allZones) {
    const zAny = zone as any;
    console.log(`----------------------------------------------------------------`);
    console.log(`Zone: ${zone.name} | zoneId: ${zone.zoneId} | _id: ${zone._id}`);
    console.log(`----------------------------------------------------------------`);
    console.log(`  - District: ${zAny.district}`);
    console.log(`  - Status: ${zone.status}`);
    console.log(`  - Total Area: ${zone.areaHectares} ha`);
    console.log(`  - Boundary Type: ${zone.boundary?.type}`);
    console.log(`  - Coordinates Ring Length: ${zone.boundary?.coordinates?.[0]?.length ?? 0}`);
    console.log(`  - Current Baseline ID: ${zAny.baselineId ?? 'NONE'}`);
    console.log(`  - Baseline Date: ${zone.baselineDate ? new Date(zone.baselineDate).toISOString() : 'NONE'}`);

    // Check Baselines for this zone
    const baselines = await BaselineModel.find({ zoneId: zone._id }).lean();
    console.log(`  - Registered Baselines in DB (${baselines.length}):`);
    for (const b of baselines) {
      const bAny = b as any;
      console.log(`    * ID: ${bAny.baselineId ?? bAny._id} | Status: ${b.status} | Active: ${b.isActive} | Sensor: ${b.sensorType} | ImageId: ${b.imageId ?? 'N/A'} | Acquired: ${b.acquisitionDate ? new Date(b.acquisitionDate).toISOString().slice(0, 10) : 'N/A'}`);
    }

    // Check SatelliteMetadata for this zone
    const satMetas = await SatelliteMetadata.find({ intersectingZones: zone._id }).lean();
    console.log(`  - Intersecting Satellite Metadata Records (${satMetas.length}):`);
    for (const sm of satMetas) {
      console.log(`    * Image ID: ${sm.imageId}`);
      console.log(`      Sensor: ${sm.sensorType} | Acquired: ${sm.acquisitionDate ? new Date(sm.acquisitionDate).toISOString().slice(0, 10) : 'N/A'} | Cloud: ${sm.cloudCover}%`);
    }

    // Check ChangeDetection records
    const changes = await ChangeDetectionModel.find({ zoneId: zone._id }).lean();
    console.log(`  - Change Detection Records (${changes.length}):`);
    for (const c of changes) {
      const cAny = c as any;
      console.log(`    * Detection ID: ${cAny.detectionId ?? cAny._id} | Status: ${cAny.status} | Mode: ${cAny.processingMode} | Changed: ${cAny.changedAreaHectares} ha (${cAny.changedPercentage}%)`);
    }

    // Check Alerts
    const alerts = await AlertModel.find({ zoneId: zone._id }).lean();
    console.log(`  - Alert Records (${alerts.length}):`);
    for (const a of alerts) {
      const aAny = a as any;
      console.log(`    * Alert ID: ${aAny.alertId ?? aAny._id} | Status: ${a.status} | Priority: ${aAny.priority ?? a.severity} | Area: ${aAny.affectedAreaHectares ?? a.affectedAreaPercentage} ha`);
    }
  }

  await mongoose.disconnect();
  console.log('\nAudit complete.');
}

auditDatabaseAndZones().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
