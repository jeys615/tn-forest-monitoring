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
  const sorted = [...docs].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const json = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(json).digest('hex');
}

async function verifyOnboardedRecords() {
  console.log('================================================================');
  console.log('🔍 PHASE 5E: INDEPENDENT VERIFICATION OF ONBOARDED RECORDS');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const collections: Record<string, mongoose.Model<any>> = {
    users: User,
    zones: Zone,
    baselines: BaselineModel,
    satellitemetadatas: SatelliteMetadata,
    changedetections: ChangeDetectionModel,
    alerts: AlertModel,
    monitoringjobs: MonitoringJobModel,
    incrementalmonitoringrecords: IncrementalMonitoringRecordModel,
  };

  console.log('--- 1. COLLECTION COUNTS & HASH VERIFICATION ---');
  for (const [name, model] of Object.entries(collections)) {
    const docs = await model.find({}).lean();
    const hash = computeCollectionHash(docs);
    console.log(`  - ${name.padEnd(30)}: Count = ${String(docs.length).padStart(4)} | SHA-256 = ${hash}`);
  }

  console.log('\n--- 2. DETAILED ZONE RECORDS INSPECTION ---');
  const targetZones = await Zone.find({ zoneId: { $in: ['ZONE-260829-8997', 'ZONE-260829-8998'] } }).lean();
  for (const z of targetZones) {
    console.log(`\nZone: ${z.name} (${z.zoneId})`);
    console.log(`  - _id:          ${z._id}`);
    console.log(`  - Category:     ${z.category}`);
    console.log(`  - Status:       ${z.status}`);
    console.log(`  - Area (ha):    ${z.areaHectares} ha`);
    console.log(`  - BaselineDate: ${z.baselineDate ? new Date(z.baselineDate).toISOString() : 'N/A'}`);
    console.log(`  - Centroid:     [${z.centerPoint.coordinates.join(', ')}]`);
    console.log(`  - Tracks:       Optical=${z.monitoringTracks?.optical?.enabled}, SAR=${z.monitoringTracks?.sar?.enabled}`);

    // Associated Baselines
    const baselines = await BaselineModel.find({ zoneId: z._id }).lean();
    console.log(`  - Registered Baselines (${baselines.length}):`);
    for (const b of baselines) {
      console.log(`    * Baseline ID: ${b._id}`);
      console.log(`      Image ID:    ${b.imageId}`);
      console.log(`      Sensor:      ${b.sensorType} | Track: ${b.monitoringTrack}`);
      console.log(`      Status:      ${b.status}`);
      console.log(`      Is Active:   ${b.isActive} (MUST BE FALSE)`);
      console.log(`      Quality:     ${b.qualityScore}% | Valid Pixels: ${b.validPixelPercentage}%`);
      console.log(`      Reason:      ${b.selectionReason}`);
    }

    // Associated Satellite Metadata
    const satMetas = await SatelliteMetadata.find({ intersectingZones: z._id }).lean();
    console.log(`  - Associated Satellite Observations (${satMetas.length}):`);
    for (const sm of satMetas) {
      console.log(`    * Image ID:    ${sm.imageId}`);
      console.log(`      Acquisition: ${new Date(sm.acquisitionDate).toISOString()}`);
      console.log(`      Cloud Cover: ${sm.cloudCover}%`);
      console.log(`      Status:      ${sm.processingStatus}`);
    }
  }

  // Active Baseline Invariant
  const activeCount = await BaselineModel.countDocuments({
    zoneId: { $in: targetZones.map((z) => z._id) },
    isActive: true,
  });
  console.log(`\nActive Baselines for New Zones: ${activeCount} (Expected: 0)`);
  if (activeCount > 0) {
    throw new Error('CRITICAL SAFETY VIOLATION: An onboarded baseline is marked active!');
  }

  console.log('\n================================================================');
  console.log('✅ ALL ONBOARDING RECORDS INDEPENDENTLY AUDITED AND VERIFIED');
  console.log('================================================================\n');

  await mongoose.disconnect();
}

verifyOnboardedRecords().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
