import { UserRepository } from '../repositories/UserRepository.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  UserRole,
  UserStatus,
  type UserDto,
  type CreateUserRequest,
  type UpdateUserRequest,
} from '@tn-forest/shared/types';
import { DEFAULT_ROLE_PERMISSIONS } from '@tn-forest/shared/constants';
import type { IUser } from '../models/User.js';

type UserDocument = IUser & { toUserDto: () => UserDto };

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async getAllUsers(query: { role?: UserRole; status?: UserStatus } = {}): Promise<UserDto[]> {
    const users = await this.userRepository.findAll(query);
    return users.map((user) => (user as unknown as UserDocument).toUserDto());
  }

  async getUserById(id: string): Promise<UserDto> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }
    return (user as unknown as UserDocument).toUserDto();
  }

  async createUser(
    creator: { id: string; role: UserRole; permissions: string[] },
    data: CreateUserRequest,
  ): Promise<UserDto> {
    // Check duplicate email
    const existingEmail = await this.userRepository.findByEmail(data.email);
    if (existingEmail) {
      throw new AppError('Email address is already in use', HTTP_STATUS.CONFLICT);
    }

    // Check duplicate employeeId if provided
    if (data.employeeId) {
      const existingEmpId = await this.userRepository.findByEmployeeId(data.employeeId);
      if (existingEmpId) {
        throw new AppError('Employee ID is already in use', HTTP_STATUS.CONFLICT);
      }
    }

    // Privilege Escalation Check: Non-SUPER_ADMIN cannot create SUPER_ADMIN users
    if (data.role === UserRole.SUPER_ADMIN && creator.role !== UserRole.SUPER_ADMIN) {
      throw new AppError(
        'Only a Super Admin can create another Super Admin user',
        HTTP_STATUS.FORBIDDEN,
      );
    }

    // Determine permissions (default permissions for role if not explicitly passed)
    const permissionsToAssign =
      data.permissions && data.permissions.length > 0
        ? data.permissions
        : DEFAULT_ROLE_PERMISSIONS[data.role] || [];

    // Privilege Escalation Check: Cannot grant permissions creator does not possess (unless SUPER_ADMIN)
    if (creator.role !== UserRole.SUPER_ADMIN) {
      const unauthorizedPermissions = permissionsToAssign.filter(
        (perm) => !creator.permissions.includes(perm),
      );
      if (unauthorizedPermissions.length > 0) {
        throw new AppError(
          `Cannot assign permissions you do not possess: ${unauthorizedPermissions.join(', ')}`,
          HTTP_STATUS.FORBIDDEN,
        );
      }
    }

    const passwordHash = await hashPassword(data.password);

    const newUser = await this.userRepository.create({
      employeeId: data.employeeId,
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      passwordHash,
      role: data.role,
      permissions: permissionsToAssign,
      status: UserStatus.ACTIVE,
    });

    return (newUser as unknown as UserDocument).toUserDto();
  }

  async updateUser(
    editor: { id: string; role: UserRole; permissions: string[] },
    userId: string,
    data: UpdateUserRequest,
  ): Promise<UserDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    // Prevent users from elevating their own role or permissions
    if (editor.id === userId) {
      if (data.role && data.role !== user.role) {
        throw new AppError('You cannot change your own role', HTTP_STATUS.FORBIDDEN);
      }
      if (data.permissions) {
        throw new AppError('You cannot change your own permissions', HTTP_STATUS.FORBIDDEN);
      }
    }

    // Privilege Escalation Check: Cannot promote to SUPER_ADMIN unless editor is SUPER_ADMIN
    if (data.role === UserRole.SUPER_ADMIN && editor.role !== UserRole.SUPER_ADMIN) {
      throw new AppError(
        'Only a Super Admin can assign the Super Admin role',
        HTTP_STATUS.FORBIDDEN,
      );
    }

    // Check unique employeeId if updated
    if (data.employeeId && data.employeeId !== user.employeeId) {
      const existingEmpId = await this.userRepository.findByEmployeeId(data.employeeId);
      if (existingEmpId) {
        throw new AppError('Employee ID is already in use', HTTP_STATUS.CONFLICT);
      }
    }

    const updates: Partial<IUser> = {};
    if (data.employeeId !== undefined) updates.employeeId = data.employeeId;
    if (data.name !== undefined) updates.name = data.name;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.role !== undefined) updates.role = data.role;
    if (data.permissions !== undefined) updates.permissions = data.permissions;

    const updatedUser = await this.userRepository.update(userId, updates);
    return (updatedUser as unknown as UserDocument).toUserDto();
  }

  async updateUserStatus(
    editor: { id: string; role: UserRole },
    userId: string,
    status: UserStatus,
  ): Promise<UserDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    // Self-deactivation check
    if (
      editor.id === userId &&
      (status === UserStatus.INACTIVE || status === UserStatus.SUSPENDED)
    ) {
      throw new AppError(
        'You cannot deactivate or suspend your own account',
        HTTP_STATUS.FORBIDDEN,
      );
    }

    const updatedUser = await this.userRepository.update(userId, { status });
    return (updatedUser as unknown as UserDocument).toUserDto();
  }
}
