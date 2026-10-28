import { z } from 'zod';
import { UserRole, UserStatus, Permission } from '@tn-forest/shared/types';

export const createUserSchema = z.object({
  employeeId: z.string().trim().optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  phone: z.string().trim().optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.nativeEnum(UserRole),
  permissions: z.array(z.nativeEnum(Permission)).optional(),
});

export const updateUserSchema = z.object({
  employeeId: z.string().trim().optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').trim().optional(),
  phone: z.string().trim().optional(),
  role: z.nativeEnum(UserRole).optional(),
  permissions: z.array(z.nativeEnum(Permission)).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});
