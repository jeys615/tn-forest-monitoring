import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('No DB connection');
    process.exit(1);
  }

  const baselines = await db.collection('baselines').find({}).toArray();
  console.log(`Total Baselines: ${baselines.length}`);
  for (const b of baselines) {
    console.log(`- ID: ${b._id}, status: ${b.status}, isActive: ${b.isActive}, zoneId: ${b.zoneId}, imageId: ${b.satelliteImageId || b.satelliteMetadataId}`);
    if (b.status !== 'ACTIVE' && b.status !== 'PROCESSED') {
      console.log(`  Details:`, { geeExportTaskId: b.geeExportTaskId, failureReason: b.failureReason });
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
