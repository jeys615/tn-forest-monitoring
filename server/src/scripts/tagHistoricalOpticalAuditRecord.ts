import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';

async function main() {
  console.log('============================================================');
  console.log('HISTORICAL RECORD SAFETY: AUDIT TAGGING SCRIPT');
  console.log('============================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const changeId = 'CHG-1790510572230-4759';
  const record = await ChangeDetectionModel.findOne({ changeId });

  if (!record) {
    console.warn(`Record ${changeId} not found in database.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Found record ${changeId}:`);
  console.log(`  Source: ${record.source}`);
  console.log(`  SensorType: ${record.sensorType}`);
  console.log(`  CalculationMode: ${record.calculationMode}`);
  console.log(`  SpatialSource: ${record.spatialSource}`);
  console.log(`  Affected Area %: ${record.affectedAreaPercentage}`);
  console.log(`  Changed Area: ${record.changedArea} ha`);
  console.log(`  Current auditStatus: ${record.auditStatus || 'NONE'}`);

  // Preserve all original mathematical values, and set auditStatus tag
  record.auditStatus = 'INVALID_FOR_PRODUCTION_CROSS_SENSOR';
  await record.save();

  console.log(`\nSuccessfully tagged ${changeId} with auditStatus: 'INVALID_FOR_PRODUCTION_CROSS_SENSOR'.`);
  console.log('Original mathematical values remain 100% intact and traceable.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error during audit tagging:', err);
  process.exit(1);
});
