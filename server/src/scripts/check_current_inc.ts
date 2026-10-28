import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const records = await IncrementalMonitoringRecordModel.find({}).lean();
  console.log('Incremental count:', records.length);
  for (const r of records) {
    console.log(JSON.stringify(r, null, 2));
  }
  await mongoose.disconnect();
}

main();
