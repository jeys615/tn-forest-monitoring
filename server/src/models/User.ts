import { Schema, model, type Document, type Types } from 'mongoose';
import { UserRole, UserStatus, Permission } from '@tn-forest/shared/types';

export interface IUser extends Document {
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  companyId?: Types.ObjectId;
  permissions: string[];
  status: UserStatus;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.VIEWER,
      required: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'TransportCompany',
      index: true,
    },
    permissions: {
      type: [String],
      enum: Object.values(Permission),
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
      required: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Explicit DTO conversion helper
userSchema.methods.toUserDto = function () {
  return {
    id: this._id.toString(),
    employeeId: this.employeeId,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    companyId: this.companyId ? this.companyId.toString() : undefined,
    permissions: this.permissions,
    status: this.status,
    lastLoginAt: this.lastLoginAt ? this.lastLoginAt.toISOString() : undefined,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const User = model<IUser>('User', userSchema);
