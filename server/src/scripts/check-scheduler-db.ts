import { env } from '../config/env.js';
import { connectDatabase } from '../config/database.js';
import mongoose from 'mongoose';

async function main() {
  console.log('env.MONGODB_URI:', env.MONGODB_URI);
  await connectDatabase();
  console.log('Connected DB:', mongoose.connection.name);
  console.log('Connected URI host:', mongoose.connection.host);
  await mongoose.disconnect();
}

main();
