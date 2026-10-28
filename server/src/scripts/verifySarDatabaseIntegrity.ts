import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { SensorType } from '@tn-forest/shared/types';

async function main() {
  console.log('============================================================');
  console.log('DATABASE INTEGRITY VERIFICATION');
  console.log('============================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // 1. Verify Change Records Count
  const totalChanges = await ChangeDetectionModel.countDocuments();
  console.log(`Total Change Detection Records: ${totalChanges}`);

  // 2. Verify Historical Record CHG-1790511626250-4641
  const rec4641 = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790511626250-4641' });
  if (rec4641) {
    console.log(`✅ CHG-1790511626250-4641: INTACT`);
    console.log(`   Affected Area %: ${rec4641.affectedAreaPercentage}%`);
    console.log(`   Calculation Method: ${rec4641.calculationMethod}`);
    console.log(`   Audit Status: ${rec4641.auditStatus || 'NONE (Normal Production Record)'}`);
  } else {
    console.error(`❌ CHG-1790511626250-4641: NOT FOUND`);
  }

  // 3. Verify Audited Record CHG-1790525317279-8405
  const rec8405 = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790525317279-8405' });
  if (rec8405) {
    console.log(`\n✅ CHG-1790525317279-8405: INTACT & TAGGED`);
    console.log(`   Affected Area %: ${rec8405.affectedAreaPercentage}% (preserved)`);
    console.log(`   Audit Status: ${rec8405.auditStatus}`);
    console.log(`   Changed Pixels: ${(rec8405 as any).changedPixels}`);
    console.log(`   Valid Pixels: ${(rec8405 as any).validPixels}`);
  } else {
    console.error(`❌ CHG-1790525317279-8405: NOT FOUND`);
  }

  // 4. Verify Baselines
  console.log('\n--- Baselines Status ---');
  const baselines = await BaselineModel.find({ sensorType: SensorType.SAR }).populate('satelliteMetadataId');
  for (const b of baselines) {
    console.log(`Baseline ID: ${b._id}`);
    console.log(`  Zone: ${b.zoneId}`);
    console.log(`  Acquisition: ${b.acquisitionDate.toISOString().slice(0, 10)}`);
    console.log(`  Active: ${b.isActive}`);
    console.log(`  Status: ${b.status}`);
    console.log(`  Track (Relative Orbit): ${b.relativeOrbitNumber}`);
    console.log(`  Pass: ${b.orbitDirection}`);
    console.log(`  Absolute Orbit: ${b.absoluteOrbitNumber}`);
  }

  // 5. Verify Satellite Metadata Records
  console.log('\n--- SAR Satellite Metadata Telemetry ---');
  const sarMetas = await SatelliteMetadata.find({ sensorType: SensorType.SAR });
  for (const m of sarMetas) {
    console.log(`Meta ID: ${m._id}`);
    console.log(`  Image ID: ${m.imageId}`);
    console.log(`  Platform: ${m.platform}`);
    console.log(`  Mode: ${m.mode}`);
    console.log(`  Polarizations: ${m.polarizations?.join('+')}`);
    console.log(`  Track: ${m.relativeOrbitNumber}`);
    console.log(`  Pass: ${m.orbitDirection}`);
    console.log(`  AbsOrbit: ${m.absoluteOrbitNumber}`);
  }

  await mongoose.disconnect();
  console.log('\n============================================================');
  console.log('INTEGRITY CHECK COMPLETE');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('Integrity check error:', err);
  process.exit(1);
});
