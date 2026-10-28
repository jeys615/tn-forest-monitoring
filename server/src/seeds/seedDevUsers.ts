import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, UserStatus, Permission } from '@tn-forest/shared/types';
import { DEFAULT_ROLE_PERMISSIONS } from '@tn-forest/shared/constants';
import { seedSuperAdmin } from './seedSuperAdmin.js';

export interface DevAccountConfig {
  employeeId: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  permissions: Permission[];
  description: string;
}

export const DEV_ACCOUNTS: DevAccountConfig[] = [
  {
    employeeId: 'EMP-0000',
    name: 'System Super Administrator',
    email: 'superadmin@monitoring.system',
    password: 'SuperAdmin@2026!',
    phone: '+91 9444000001',
    role: UserRole.SUPER_ADMIN,
    permissions: Object.values(Permission),
    description: 'Root administrator with full privileges across all platform services and configurations.',
  },
  {
    employeeId: 'EMP-0002',
    name: 'Operations Administrator',
    email: 'admin@monitoring.system',
    password: 'Admin@Monitoring2026!',
    phone: '+91 9444000002',
    role: UserRole.ADMIN,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.ADMIN],
    description: 'Platform manager overseeing users, monitored areas, automated monitoring workflows, and cases.',
  },
  {
    employeeId: 'EMP-0003',
    name: 'Zonal Monitoring Officer',
    email: 'officer@monitoring.system',
    password: 'Officer@Monitoring2026!',
    phone: '+91 9444000003',
    role: UserRole.FOREST_OFFICER,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.FOREST_OFFICER],
    description: 'Environmental monitoring lead responsible for area tracking, satellite change detection, and alerts.',
  },
  {
    employeeId: 'EMP-0004',
    name: 'Resource & Mining Officer',
    email: 'mining.officer@monitoring.system',
    password: 'Mining@Monitoring2026!',
    phone: '+91 9444000004',
    role: UserRole.MINING_OFFICER,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.MINING_OFFICER],
    description: 'Resource regulator managing extraction permits, transport passes, and volume audits.',
  },
  {
    employeeId: 'EMP-0005',
    name: 'Border Checkpoint Officer',
    email: 'checkpoint.officer@monitoring.system',
    password: 'Checkpoint@Monitoring2026!',
    phone: '+91 9444000005',
    role: UserRole.CHECKPOINT_OFFICER,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.CHECKPOINT_OFFICER],
    description: 'Field officer performing QR-based e-pass verification at checkpoint weighbridges.',
  },
  {
    employeeId: 'EMP-0006',
    name: 'Field Verification Officer',
    email: 'field.officer@monitoring.system',
    password: 'Field@Monitoring2026!',
    phone: '+91 9444000006',
    role: UserRole.FIELD_OFFICER,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.FIELD_OFFICER],
    description: 'Ground responder conducting field truth inspections and gathering physical evidence.',
  },
  {
    employeeId: 'EMP-0007',
    name: 'Auditor & Analytics Viewer',
    email: 'viewer@monitoring.system',
    password: 'Viewer@Monitoring2026!',
    phone: '+91 9444000007',
    role: UserRole.VIEWER,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.VIEWER],
    description: 'Read-only access for compliance auditors, researchers, and public stakeholders.',
  },
];

export async function seedDevUsers(): Promise<void> {
  // First ensure legacy superadmin is seeded
  await seedSuperAdmin();

  console.info('🌱 Seeding development role accounts...');
  for (const account of DEV_ACCOUNTS) {
    try {
      const passwordHash = await hashPassword(account.password);
      const existingUser = await User.findOne({ email: account.email }).select('+passwordHash');

      if (!existingUser) {
        const user = new User({
          employeeId: account.employeeId,
          name: account.name,
          email: account.email,
          phone: account.phone,
          passwordHash,
          role: account.role,
          permissions: account.permissions,
          status: UserStatus.ACTIVE,
        });
        await user.save();
        console.info(`  ✔ Created ${account.role} account: ${account.email}`);
      } else {
        existingUser.name = account.name;
        existingUser.employeeId = account.employeeId;
        existingUser.phone = account.phone;
        existingUser.passwordHash = passwordHash;
        existingUser.role = account.role;
        existingUser.permissions = account.permissions;
        existingUser.status = UserStatus.ACTIVE;
        await existingUser.save();
        console.info(`  ✔ Verified/updated ${account.role} account: ${account.email}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✘ Failed to seed account ${account.email}: ${msg}`);
    }
  }
  console.info('🌱 All 7 development role accounts processed successfully.');
}
