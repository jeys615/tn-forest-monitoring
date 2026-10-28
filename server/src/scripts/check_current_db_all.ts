import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB database not available');
  const cols = await db.listCollections().toArray();
  console.log('Collections and counts:');
  for (const col of cols) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`  ${col.name.padEnd(30)}: ${count}`);
  }
  const zones = await db.collection('zones').find({}).toArray();
  console.log('\nZones:');
  for (const z of zones) {
    console.log(`  _id: ${z._id} | zoneId: ${z.zoneId} | name: ${z.name} | optical: ${z.monitoringTracks?.optical?.enabled} | sar: ${z.monitoringTracks?.sar?.enabled}`);
  }

  const baselines = await db.collection('baselines').find({}).toArray();
  console.log('\nBaselines:');
  for (const b of baselines) {
    console.log(`  _id: ${b._id} | baselineId: ${b.baselineId} | zoneId: ${b.zoneId} | sensorType: ${b.sensorType} | status: ${b.status}`);
  }

  const changes = await db.collection('changedetections').find({}).toArray();
  console.log('\nChangeDetections:');
  for (const c of changes) {
    console.log(`  _id: ${c._id} | detectionId: ${c.detectionId} | zoneId: ${c.zoneId} | sensorType: ${c.sensorType}`);
  }

  const alerts = await db.collection('alerts').find({}).toArray();
  console.log('\nAlerts:');
  for (const a of alerts) {
    console.log(`  _id: ${a._id} | alertId: ${a.alertId} | zoneId: ${a.zoneId} | type: ${a.type}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

