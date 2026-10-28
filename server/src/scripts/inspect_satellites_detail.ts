import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not available');
  const record = await db.collection('satellitemetadatas').findOne({ _id: new Types.ObjectId('6ab7e9c86358176818476c6c') });
  console.log('Record 6ab7e9c86358176818476c6c details:');
  console.log(JSON.stringify(record, null, 2));

  // Also check if any other SAR records exist
  const sarRecords = await db.collection('satellitemetadatas').find({ sensorType: 'SAR' }).toArray();
  console.log(`\nTotal SAR records: ${sarRecords.length}`);
  for (const s of sarRecords) {
    console.log(`  id: ${s._id} | imageId: ${s.imageId} | status: ${s.processingStatus} | createdAt: ${s.createdAt} | taskId: ${s.geeExportTaskId || 'NONE'}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
