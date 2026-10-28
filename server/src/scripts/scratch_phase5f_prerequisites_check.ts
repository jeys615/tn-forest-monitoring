/**
 * Phase 5F: Prerequisites and Scene Verification
 * Script: scratch_phase5f_prerequisites_check.ts
 *
 * READ-ONLY audit of:
 * 1. The three zones in MongoDB (Sirumalai, Vadipatti, Sathiyar)
 * 2. Their baseline records, active status, and quality scores
 * 3. Associated satellite metadata records
 * 4. Database snapshot (counts + SHA-256 document hashes)
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { User } from '../models/User.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';

async function checkPrerequisites() {
  console.log('================================================================');
  console.log('🔍 PHASE 5F: STEP 1 PREREQUISITES & SUITABILITY AUDIT');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // 1. Snapshot database counts and hashes
  const collections = [
    { name: 'users', model: User },
    { name: 'zones', model: Zone },
    { name: 'baselines', model: BaselineModel },
    { name: 'satellitemetadatas', model: SatelliteMetadata },
    { name: 'changedetections', model: ChangeDetectionModel },
    { name: 'alerts', model: AlertModel },
    { name: 'monitoringjobs', model: MonitoringJobModel },
    { name: 'incrementalmonitoringrecords', model: IncrementalMonitoringRecordModel },
  ];

  console.log('Pre-Execution Database State:');
  const preSnapshot: Record<string, { count: number; hash: string }> = {};

  for (const col of collections) {
    const count = await col.model.countDocuments();
    const docs = await col.model.find({}).sort({ _id: 1 }).lean();
    const hash = crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex');
    preSnapshot[col.name] = { count, hash };
    console.log(`  - ${col.name.padEnd(30)}: Count=${count.toString().padEnd(4)} Hash=${hash.substring(0, 16)}...`);
  }

  // 2. Audit Zone Records
  const targetZones = ['ZONE-261011-6340', 'ZONE-260829-8997', 'ZONE-260829-8998'];
  console.log('\nTarget Zone Audits:');

  for (const zid of targetZones) {
    const zone = await Zone.findOne({ zoneId: zid }).lean();
    if (!zone) {
      console.error(`  ✘ Zone ${zid} NOT FOUND in MongoDB!`);
      continue;
    }
    console.log(`\n  Zone ID: ${zone.zoneId}`);
    console.log(`    - ObjectId: ${zone._id}`);
    console.log(`    - Name: ${zone.name}`);
    console.log(`    - Category: ${zone.category}`);
    console.log(`    - Status: ${zone.status}`);
    console.log(`    - Baseline Date: ${zone.baselineDate?.toISOString()}`);
    console.log(`    - Boundary Type: ${(zone.boundary as any)?.type}, Vertices: ${(zone.boundary as any)?.coordinates?.[0]?.length}`);

    // Check Baselines for this zone
    const baselines = await BaselineModel.find({ zoneId: zone._id }).lean();
    console.log(`    - Baselines Associated (${baselines.length}):`);
    for (const b of baselines) {
      console.log(`      * Baseline _id: ${b._id}`);
      console.log(`        Date: ${b.baselineDate?.toISOString()}`);
      console.log(`        Status: ${b.status}`);
      console.log(`        isActive: ${b.isActive}`);
      console.log(`        Quality Score: ${b.qualityScore}`);
      console.log(`        SatelliteMetadata ID: ${b.satelliteMetadataId}`);
      if (b.satelliteMetadataId) {
        const sm = await SatelliteMetadata.findById(b.satelliteMetadataId).lean();
        console.log(`        Source Image ID: ${sm?.imageId}`);
      }
    }
  }

  // 3. Verify Comparison Scene in SatelliteMetadata
  const compSceneId = 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM';
  const compSm = await SatelliteMetadata.findOne({ imageId: compSceneId }).lean();
  console.log(`\nComparison Scene Metadata (${compSceneId}):`);
  if (compSm) {
    console.log(`  - _id: ${compSm._id}`);
    console.log(`  - Acquisition Date: ${compSm.acquisitionDate?.toISOString()}`);
    console.log(`  - Cloud Coverage: ${compSm.cloudCoverage}%`);
    console.log(`  - Intersecting Zones: ${JSON.stringify(compSm.intersectingZones)}`);
  } else {
    console.warn(`  - WARNING: Comparison scene not found directly by imageId!`);
  }

  // 4. Verify GEE Auth
  console.log('\nGEE Connectivity Check:');
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();
  console.log(`  - Project ID: ${config.projectId}`);
  console.log(`  - Auth Mode: ${config.authMethod}`);
  console.log(`  - Token Acquired: ${!!token} (length: ${token?.length ?? 0})`);

  await mongoose.disconnect();
}

checkPrerequisites().catch((err) => {
  console.error('Fatal error in prerequisites check:', err);
  process.exit(1);
});
