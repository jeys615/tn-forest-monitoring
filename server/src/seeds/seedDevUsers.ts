import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  UserStatus,
  Permission,
  TransportCompanyStatus,
  VehicleStatus,
  VehicleType,
  DriverVerificationStatus,
} from '@tn-forest/shared/types';
import { DEFAULT_ROLE_PERMISSIONS } from '@tn-forest/shared/constants';
import { seedSuperAdmin } from './seedSuperAdmin.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';

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
  {
    employeeId: 'EMP-0008',
    name: 'Apex Minerals & Fleet Logistics',
    email: 'transporter@monitoring.system',
    password: 'Transporter@2026!',
    phone: '+91 9444000008',
    role: UserRole.TRANSPORTER,
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.TRANSPORTER],
    description: 'Commercial mineral transporter and logistics fleet company managing vehicles, drivers, and quarry lease transit.',
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
  // Ensure demo transport company is seeded and linked for transporter@monitoring.system
  try {
    const transporterUser = await User.findOne({ email: 'transporter@monitoring.system' });
    if (transporterUser) {
      let company = await TransportCompanyModel.findOne({ registrationNumber: 'CIN-U60200TN2024PTC184920' });
      if (!company) {
        company = await TransportCompanyModel.create({
          companyId: 'TC-DEMO-001',
          registrationNumber: 'CIN-U60200TN2024PTC184920',
          companyName: 'Apex Mineral Transport & Logistics Pvt Ltd',
          contactDetails: {
            phone: '+91 9444000008',
            email: 'transporter@monitoring.system',
            address: '42 Industrial Corridor, Madurai - Dindigul Highway',
          },
          miningZoneDetails: {
            zoneName: 'Sirumalai Foothill Extraction Zone A-1',
            leasePermitNumber: 'ML-2024-MIN-009',
            mineralType: 'Rough Stone & Blue Metal Aggregate',
            authorizedCapacityTonnes: 75000,
            validityPeriod: '2024-01-01 to 2028-12-31',
            locationDetails: 'Sector 4, Near Checkpoint CP-02',
          },
          userId: transporterUser._id,
          status: TransportCompanyStatus.ACTIVE,
          createdBy: transporterUser._id,
        });
        console.info(`  ✔ Created demo Transport Company: ${company.companyName}`);
      }

      if (!transporterUser.companyId) {
        transporterUser.companyId = company._id;
        await transporterUser.save();
      }

      // Seed Demo Vehicles for this company
      const v1 = await VehicleModel.findOne({ registrationNumber: 'TN-58-AA-4091' });
      if (!v1) {
        await VehicleModel.create({
          vehicleId: 'VEH-DEMO-101',
          registrationNumber: 'TN-58-AA-4091',
          vehicleType: VehicleType.TRUCK,
          tareWeight: 11.2,
          grossVehicleWeight: 28.0,
          permittedCarryingCapacity: 16.8,
          gpsTrackerId: 'GPS-TRK-8801',
          status: VehicleStatus.ACTIVE,
          transportCompanyId: company._id,
          createdBy: transporterUser._id,
        });
      }

      const v2 = await VehicleModel.findOne({ registrationNumber: 'TN-59-BC-7723' });
      if (!v2) {
        await VehicleModel.create({
          vehicleId: 'VEH-DEMO-102',
          registrationNumber: 'TN-59-BC-7723',
          vehicleType: VehicleType.TIPPER,
          tareWeight: 13.5,
          grossVehicleWeight: 35.0,
          permittedCarryingCapacity: 21.5,
          gpsTrackerId: 'GPS-TRK-8802',
          status: VehicleStatus.ACTIVE,
          transportCompanyId: company._id,
          createdBy: transporterUser._id,
        });
      }

      // Seed Demo Drivers for this company
      const d1 = await DriverModel.findOne({ licenseNumber: 'DL-TN58-2018-00912' });
      if (!d1) {
        await DriverModel.create({
          driverId: 'DRV-DEMO-201',
          name: 'R. Murugan',
          licenseNumber: 'DL-TN58-2018-00912',
          phone: '+91 98421 11091',
          verificationStatus: DriverVerificationStatus.VERIFIED,
          transportCompanyId: company._id,
          createdBy: transporterUser._id,
        });
      }

      const d2 = await DriverModel.findOne({ licenseNumber: 'DL-TN59-2020-00441' });
      if (!d2) {
        await DriverModel.create({
          driverId: 'DRV-DEMO-202',
          name: 'S. Kulanthaivel',
          licenseNumber: 'DL-TN59-2020-00441',
          phone: '+91 97890 22345',
          verificationStatus: DriverVerificationStatus.VERIFIED,
          transportCompanyId: company._id,
          createdBy: transporterUser._id,
        });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✘ Failed to seed demo company details: ${msg}`);
  }

  console.info('🌱 All 8 development role accounts processed successfully.');
}
