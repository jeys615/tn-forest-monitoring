import mongoose from 'mongoose';
import fs from 'fs';

async function extract() {
  await mongoose.connect('mongodb://localhost:27017/tn_forest_monitoring');
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  const result = {};

  for (const c of cols) {
    const col = db.collection(c.name);
    const count = await col.countDocuments();
    const indexes = await col.indexes();
    const sample = await col.findOne() || {};
    
    result[c.name] = {
      count,
      indexes,
      sampleFields: Object.keys(sample)
    };
  }

  const outDir = 'D:/tn-enforcement-system/tn-forest-monitoring/scratch';
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync('D:/tn-enforcement-system/tn-forest-monitoring/scratch/live_db_fields.json', JSON.stringify(result, null, 2));
  console.log('Saved live_db_fields.json successfully!');
  await mongoose.disconnect();
}
extract().catch(console.error);
