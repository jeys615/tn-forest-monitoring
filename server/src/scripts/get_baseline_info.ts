import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { BaselineModel } from '../models/Baseline.js';
import { Zone } from '../models/Zone.js';

async function check(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ name: 'sathiyar_forest' }).lean();
  console.log('=== ZONE SATHIYAR FOREST ===');
  console.log(JSON.stringify(zone, null, 2));

  console.log('\n=== BASELINE DOCUMENTS FOR SATHIYAR FOREST ===');
  const baselines = await BaselineModel.find({ zoneId: zone?._id }).lean();
  console.log(JSON.stringify(baselines, null, 2));

  console.log('\n=== ALL BASELINE DOCUMENTS IN DATABASE (' + (await BaselineModel.countDocuments()) + ') ===');
  const allBaselines = await BaselineModel.find({}).lean();
  console.log(JSON.stringify(allBaselines, null, 2));

  await mongoose.disconnect();
  process.exit(0);
}

check().catch((err) => {
  console.error(err);
  process.exit(1);
});
