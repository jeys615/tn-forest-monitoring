import { UserRepository } from '../repositories/UserRepository.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import type {
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  UserDto,
  RegisterCompanyRequest,
} from '@tn-forest/shared/types';
import {
  UserRole,
  UserStatus,
  TransportCompanyStatus,
  VehicleStatus,
  DriverVerificationStatus,
  MiningAuthorizationStatus,
} from '@tn-forest/shared/types';
import { DEFAULT_ROLE_PERMISSIONS } from '@tn-forest/shared/constants';
import { env } from '../config/env.js';
import { User, type IUser } from '../models/User.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { transportFleetService } from './TransportFleetService.js';

type UserDocument = IUser & { toUserDto: () => UserDto };

export class AuthService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const user = await this.userRepository.findByEmailWithPassword(credentials.email);

    // Generic error message to prevent account enumeration
    if (!user) {
      throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
    }

    // Status verification: Only ACTIVE users can log in
    if (user.status === UserStatus.INACTIVE) {
      throw new AppError(
        'Account is inactive. Please contact an administrator.',
        HTTP_STATUS.UNAUTHORIZED,
      );
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new AppError('Account is suspended. Please contact support.', HTTP_STATUS.FORBIDDEN);
    }

    const isPasswordValid = await comparePassword(credentials.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
    }

    // Update last login timestamp
    await this.userRepository.updateLastLogin(user._id.toString());

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    });

    const userDto = (user as unknown as UserDocument).toUserDto();

    return {
      user: userDto,
      token,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  async changePassword(userId: string, data: ChangePasswordRequest): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    // Retrieve passwordHash explicitly
    const userWithPassword = await this.userRepository.findByEmailWithPassword(user.email);
    if (!userWithPassword) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const isCurrentPasswordValid = await comparePassword(
      data.currentPassword,
      userWithPassword.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new AppError('Current password is incorrect', HTTP_STATUS.BAD_REQUEST);
    }

    const newPasswordHash = await hashPassword(data.newPassword);
    await this.userRepository.updatePassword(userId, newPasswordHash);
  }

  async registerCompany(data: RegisterCompanyRequest): Promise<{
    user: UserDto;
    company: any;
    token: string;
    expiresIn: string;
  }> {
    if (!data.companyName || !data.registrationNumber || !data.email || !data.password) {
      throw new AppError('Company name, registration number, email, and password are required', HTTP_STATUS.BAD_REQUEST);
    }

    const email = data.email.trim().toLowerCase();
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new AppError('An account with this email already exists', HTTP_STATUS.CONFLICT);
    }

    const regNum = data.registrationNumber.trim().toUpperCase();
    const existingCompany = await TransportCompanyModel.findOne({ registrationNumber: regNum });
    if (existingCompany) {
      throw new AppError(`Company with registration number "${regNum}" is already registered`, HTTP_STATUS.CONFLICT);
    }

    // 1. Create Transport Company
    const companyId = `TC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const company = await TransportCompanyModel.create({
      companyId,
      registrationNumber: regNum,
      companyName: data.companyName.trim(),
      contactDetails: {
        phone: data.phone?.trim(),
        email,
        address: data.address?.trim(),
      },
      miningZoneDetails: data.miningZoneDetails,
      status: TransportCompanyStatus.ACTIVE,
    });

    // 2. Create User Account for Transporter
    const passwordHash = await hashPassword(data.password);
    const user = await User.create({
      employeeId: `TRP-${Date.now().toString().slice(-6)}`,
      name: data.contactPerson?.trim() || data.companyName.trim(),
      email,
      phone: data.phone?.trim(),
      passwordHash,
      role: UserRole.TRANSPORTER,
      companyId: company._id,
      permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.TRANSPORTER] || [],
      status: UserStatus.ACTIVE,
    });

    // Link user to company
    company.userId = user._id;
    company.createdBy = user._id;
    await company.save();

    // 3. Register initial vehicle if provided
    if (data.initialVehicle?.registrationNumber) {
      const vReg = data.initialVehicle.registrationNumber.trim().toUpperCase();
      const tare = data.initialVehicle.tareWeight || 11.5;
      const gvw = data.initialVehicle.grossVehicleWeight || 28.0;
      await VehicleModel.create({
        vehicleId: `VEH-${Date.now().toString().slice(-6)}`,
        registrationNumber: vReg,
        vehicleType: data.initialVehicle.vehicleType || 'TIPPER',
        tareWeight: tare,
        grossVehicleWeight: gvw,
        permittedCarryingCapacity: Math.max(0, gvw - tare),
        gpsTrackerId: data.initialVehicle.gpsTrackerId || `GPS-${Math.floor(100000 + Math.random() * 900000)}`,
        status: VehicleStatus.ACTIVE,
        transportCompanyId: company._id,
        createdBy: user._id,
      });
    }

    // 4. Register initial driver if provided
    if (data.initialDriver?.licenseNumber) {
      const dLic = data.initialDriver.licenseNumber.trim().toUpperCase();
      await DriverModel.create({
        driverId: `DRV-${Date.now().toString().slice(-6)}`,
        name: data.initialDriver.name?.trim() || 'Assigned Driver',
        licenseNumber: dLic,
        phone: data.initialDriver.phone?.trim() || data.phone || '+91 90000 00000',
        verificationStatus: DriverVerificationStatus.VERIFIED,
        transportCompanyId: company._id,
        createdBy: user._id,
      });
    }

    // 5. Register initial mining authorization/lease if provided
    if (data.miningZoneDetails?.leasePermitNumber) {
      const permitNum = data.miningZoneDetails.leasePermitNumber.trim().toUpperCase();
      const existingAuth = await MiningAuthorizationModel.findOne({ permitNumber: permitNum });
      if (!existingAuth) {
        const capacity = data.miningZoneDetails.authorizedCapacityTonnes || 45000;
        await MiningAuthorizationModel.create({
          authorizationId: `AUTH-${Date.now().toString().slice(-6)}`,
          permitNumber: permitNum,
          lesseeName: data.companyName.trim(),
          mineralType: data.miningZoneDetails.mineralType || 'Rough Stone / Aggregate',
          permittedWeightTonnes: capacity,
          remainingQuota: capacity,
          validFrom: new Date(),
          validUntil: new Date(Date.now() + 365 * 3 * 24 * 3600 * 1000), // 3 years
          status: MiningAuthorizationStatus.ACTIVE,
          createdBy: user._id,
        });
      }
    }

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    });

    const userDto = (user as unknown as UserDocument).toUserDto();

    return {
      user: userDto,
      company: transportFleetService.toCompanyDto(company),
      token,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }
}
