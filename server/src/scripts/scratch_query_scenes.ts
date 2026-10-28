import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function checkScenes() {
  await mongoose.connect(env.MONGODB_URI);
  const dbs = mongoose.connection.db!;
  const metas = await dbs.collection('satellitemetadatas').find({
    $or: [{ zoneId: 'ZONE-261011-6340' }, { 'metadata.tileId': 'T43PHM' }, { imageId: /T43PHM/ }]
  }).project({ imageId: 1, acquisitionDate: 1, cloudCover: 1, source: 1, localRasterPath: 1 }).toArray();

  console.log(`Found ${metas.length} records in satellitemetadatas:`);
  metas.forEach(m => console.log(`  ${m.imageId} | Date: ${m.acquisitionDate?.toISOString?.() ?? m.acquisitionDate} | Cloud: ${m.cloudCover}% | ${m.source}`));

  await mongoose.disconnect();
}

checkScenes().catch(console.error);
