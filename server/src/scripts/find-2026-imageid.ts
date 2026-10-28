import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db!;
  
  console.log('Searching all collections for 6ab7e7e46358176818476c24 or 20260106 or D67RK4K77DDVQOL4Q5JJQPKB...');
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    const docs = await db.collection(col.name).find({
      $or: [
        { _id: new mongoose.Types.ObjectId('6ab7e7e46358176818476c24') },
        { satelliteMetadataId: new mongoose.Types.ObjectId('6ab7e7e46358176818476c24') },
        { observationId: new mongoose.Types.ObjectId('6ab7e7e46358176818476c24') },
        { geeExportTaskId: 'projects/monitoring-system-506515/operations/D67RK4K77DDVQOL4Q5JJQPKB' },
        { imageId: /20260106/i },
        { driveFileName: /20260106/i },
      ]
    }).toArray();
    if (docs.length > 0) {
      console.log(`\nFound ${docs.length} docs in collection: ${col.name}`);
      for (const d of docs) {
        console.log(JSON.stringify(d, null, 2));
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
