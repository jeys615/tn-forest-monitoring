import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { AlertModel } from '../models/Alert.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('DB:', mongoose.connection.name);
  const zones = await Zone.find({});
  console.log('Zones in DB:', zones.map(z => ({ id: z._id, zoneId: z.zoneId, name: z.name })));
  const alerts = await AlertModel.find({});
  console.log('Alerts in DB:', alerts.map(a => ({ id: a._id, alertId: a.alertId, status: a.status })));
  await mongoose.disconnect();
}

main();
