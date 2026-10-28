import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/tn_forest_monitoring');
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  console.log(`Verified ${cols.length} collections in 'tn_forest_monitoring':\n`);
  
  for (const c of cols.sort((a,b) => a.name.localeCompare(b.name))) {
    const col = db.collection(c.name);
    const count = await col.countDocuments();
    const indexes = await col.indexes();
    const idxStr = indexes.map(i => Object.keys(i.key).join('+')).join(', ');
    console.log(`${c.name.padEnd(30)} | Count: ${String(count).padStart(5)} | Indexes: ${idxStr}`);
  }
  
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
