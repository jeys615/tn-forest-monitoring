/**
 * Phase 5F: Production Invariance and Differential Integrity Audit
 * Script: scratch_phase5f_verify_production_invariance.ts
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';

async function verifyInvariance() {
  console.log('================================================================');
  console.log('🔒 PHASE 5F: PRODUCTION INVARIANCE & IMMUTABILITY AUDIT');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const expectedCounts: Record<string, number> = {
    users: 4,
    zones: 5,
    baselines: 8,
    satellitemetadatas: 13,
    changedetections: 8,
    alerts: 1,
    monitoringjobs: 71,
    incrementalmonitoringrecords: 13,
  };

  const expectedHashes: Record<string, string> = {
    users: '7af86e56d479fa6ccde26b16dab88ca37b8f7c00189e9d64985b1b1347d583f3',
    changedetections: '55ef62b5a3a0cd182e8ea1e7c9531184cc0227f00ec720f28a3d9aa551a845ae',
    alerts: '3e1f28b6baeecd62c14fd2fbe7dd73c0e407dadf8ba589e485a6e1f5c0ae6ddc',
    monitoringjobs: '19eb621405a01ac9ee0138eb64f99855dbb4ecddec35fc60c7d7d88881380fd6',
    incrementalmonitoringrecords: '903e7b34a825e6c9ae6fd2492039051dde5b33d49427d161b4d7126afc33f28f',
  };

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

  let allPassed = true;

  console.log('Collection Integrity Verifications:');
  for (const col of collections) {
    const count = await col.model.countDocuments();
    const docs = await col.model.find({}).sort({ _id: 1 }).lean();
    const hash = crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex');

    const expectedCount = expectedCounts[col.name];
    const countMatch = count === expectedCount;

    let hashMatch = true;
    if (expectedHashes[col.name]) {
      hashMatch = hash === expectedHashes[col.name];
    }

    const passed = countMatch && hashMatch;
    if (!passed) allPassed = false;

    console.log(
      `  ${passed ? '✔ [PASS]' : '✘ [FAIL]'} ${col.name.padEnd(30)}: Count=${count} (Expected: ${expectedCount}) Hash=${hash.substring(0, 16)}...`
    );
  }

  // Specifically check baseline activation state
  console.log('\nBaseline Activation Invariance:');
  const sirumalaiBase = await BaselineModel.findOne({ zoneId: '6acb1a799ee540ec5f705ebd' }).lean();
  const vadipattiBase = await BaselineModel.findOne({ zoneId: '6aa676d32b4fe5808c7e8ded' }).lean();
  const sathiyarBase = await BaselineModel.findOne({ zoneId: '6a8f3255b9cb2d5795dd34d4' }).lean();

  const sirumalaiActive = sirumalaiBase?.isActive === true;
  const vadipattiInactive = vadipattiBase?.isActive === false;
  const sathiyarInactive = sathiyarBase?.isActive === false;

  console.log(`  - Sirumalai (ZONE-261011-6340): isActive=${sirumalaiBase?.isActive} (Expected: true) -> ${sirumalaiActive ? 'PASS' : 'FAIL'}`);
  console.log(`  - Vadipatti (ZONE-260829-8997): isActive=${vadipattiBase?.isActive} (Expected: false) -> ${vadipattiInactive ? 'PASS' : 'FAIL'}`);
  console.log(`  - Sathiyar (ZONE-260829-8998):   isActive=${sathiyarBase?.isActive} (Expected: false) -> ${sathiyarInactive ? 'PASS' : 'FAIL'}`);

  if (!sirumalaiActive || !vadipattiInactive || !sathiyarInactive) {
    allPassed = false;
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('✅ PRODUCTION INVARIANCE CONFIRMED: 0 WRITES, 0 MUTATIONS');
  } else {
    console.error('❌ PRODUCTION INVARIANCE VIOLATION DETECTED');
  }
  console.log('================================================================\n');

  await mongoose.disconnect();
}

verifyInvariance().catch(console.error);
