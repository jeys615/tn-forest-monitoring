import { User, IUser } from '../models/User.js';
import type { UserStatus, UserRole } from '@tn-forest/shared/types';

export class UserRepository {
  async findById(id: string): Promise<IUser | null> {
    return User.findById(id);
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findByEmailWithPassword(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  }

  async findByEmployeeId(employeeId: string): Promise<IUser | null> {
    return User.findOne({ employeeId });
  }

  async findAll(query: { role?: UserRole; status?: UserStatus } = {}): Promise<IUser[]> {
    const filter: Record<string, unknown> = {};
    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;
    return User.find(filter).sort({ createdAt: -1 });
  }

  async create(data: Partial<IUser>): Promise<IUser> {
    const user = new User(data);
    return user.save();
  }

  async update(id: string, updates: Partial<IUser>): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
  }

  async updateLastLogin(id: string): Promise<void> {
    await User.findByIdAndUpdate(id, { $set: { lastLoginAt: new Date() } });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await User.findByIdAndUpdate(id, { $set: { passwordHash } });
  }

  async count(): Promise<number> {
    return User.countDocuments();
  }
}
