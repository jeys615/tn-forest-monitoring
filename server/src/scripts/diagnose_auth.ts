import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { AuthService } from '../services/AuthService.js';
import { seedSuperAdmin } from '../seeds/seedSuperAdmin.js';

async function diagnose(): Promise<void> {
  console.log('================================================================');
  console.log('🔍 DIAGNOSING AUTHENTICATION & SUPER_ADMIN USER RECORD');
  console.log('================================================================\n');

  console.log(`Connecting to: ${env.MONGODB_URI}`);
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Database connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const allUsers = await User.find({}).select('+passwordHash');
  console.log(`Total users in DB: ${allUsers.length}`);

  for (const u of allUsers) {
    console.log(`User details:`);
    console.log(`  _id: ${u._id}`);
    console.log(`  email: ${u.email}`);
    console.log(`  name: ${u.name}`);
    console.log(`  role: ${u.role}`);
    console.log(`  status: ${u.status}`);
    console.log(`  employeeId: ${u.employeeId}`);
    console.log(`  hasPasswordHash: ${!!u.passwordHash}`);
    console.log(`  passwordHash length: ${u.passwordHash ? u.passwordHash.length : 0}`);
    console.log(`  passwordHash startsWith $2: ${u.passwordHash ? u.passwordHash.startsWith('$2') : false}`);

    if (u.email === 'admin.m6@tnforest.gov.in' || u.email === 'admin@tnforest.gov.in') {
      const match1 = await comparePassword('Admin@TNFMS2026!', u.passwordHash);
      const match2 = await comparePassword('Test@123456', u.passwordHash);
      console.log(`  Matches 'Admin@TNFMS2026!': ${match1}`);
      console.log(`  Matches 'Test@123456': ${match2}`);
    }
  }

  // Test AuthService.login with both emails
  console.log('\n--- Testing AuthService.login ---');
  const testCredentials = [
    { email: 'admin@tnforest.gov.in', password: 'Admin@TNFMS2026!' },
    { email: 'admin.m6@tnforest.gov.in', password: 'Test@123456' },
    { email: 'admin.m6@tnforest.gov.in', password: 'Admin@TNFMS2026!' },
  ];

  const authService = new AuthService();
  for (const cred of testCredentials) {
    try {
      const result = await authService.login(cred);
      console.log(`AuthService.login SUCCESS for ${cred.email}! Role: ${result.user.role}, Permissions: ${result.user.permissions.length}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`AuthService.login FAILED for ${cred.email} (password: ${cred.password.slice(0, 4)}...): ${msg}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

diagnose().catch((err) => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
