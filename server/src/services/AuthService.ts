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
} from '@tn-forest/shared/types';
import { UserStatus } from '@tn-forest/shared/types';
import { env } from '../config/env.js';
import type { IUser } from '../models/User.js';

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
}
