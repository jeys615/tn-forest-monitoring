import { connectDatabase } from '../config/database.js';
import { seedDevUsers } from './seedDevUsers.js';
import mongoose from 'mongoose';

async function run(): Promise<void> {
  await connectDatabase();
  await seedDevUsers();
  await mongoose.connection.close();
  console.info('🌱 Seeding process complete. Connection closed.');
  process.exit(0);
}

run().catch((err: unknown) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
