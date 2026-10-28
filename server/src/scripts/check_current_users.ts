import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const users = await User.find({}).lean();
  console.log('Users in DB:');
  for (const u of users) {
    console.log(`  _id: ${u._id} | email: ${u.email} | role: ${u.role}`);
  }
  await mongoose.disconnect();
}

main();
