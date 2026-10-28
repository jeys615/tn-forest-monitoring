import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, Permission } from '@tn-forest/shared/types';

export async function seedSuperAdmin(): Promise<void> {
  try {
    const defaultPassword = 'Admin@TNFMS2026!';
    const passwordHash = await hashPassword(defaultPassword);
    const existingSuperAdmin = await User.findOne({ email: 'admin@tnforest.gov.in' }).select('+passwordHash');

    if (!existingSuperAdmin) {
      const superAdmin = new User({
        employeeId: 'EMP-0001',
        name: 'System Super Administrator',
        email: 'admin@tnforest.gov.in',
        phone: '+91 9444000000',
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        permissions: Object.values(Permission),
        status: UserStatus.ACTIVE,
      });

      await superAdmin.save();
      console.info('🌱 Default Super Admin user seeded successfully (admin@tnforest.gov.in)');
    } else {
      existingSuperAdmin.passwordHash = passwordHash;
      existingSuperAdmin.role = UserRole.SUPER_ADMIN;
      existingSuperAdmin.status = UserStatus.ACTIVE;
      existingSuperAdmin.permissions = Object.values(Permission);
      if (!existingSuperAdmin.employeeId) existingSuperAdmin.employeeId = 'EMP-0001';
      if (!existingSuperAdmin.name) existingSuperAdmin.name = 'System Super Administrator';

      await existingSuperAdmin.save();
      console.info('🌱 Default Super Admin credentials and status verified/updated (admin@tnforest.gov.in)');
    }
  } catch (error) {
    console.error('❌ Error seeding Super Admin:', error);
  }
}
