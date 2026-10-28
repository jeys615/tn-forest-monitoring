import { z } from 'zod';
import { EPassStatus } from '@tn-forest/shared/types';

export const createEPassSchema = z.object({
  authorizationId: z.string().min(1, 'Authorization ID is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  driverId: z.string().min(1, 'Driver ID is required'),
  mineralType: z.string().optional(),
  netWeightTonnes: z.number().positive('Net weight in tonnes must be positive (greater than 0)'),
  sourceLocation: z.string().max(200).optional(),
  destinationCheckpoint: z.string().min(2, 'Destination checkpoint is required').max(200),
  validFrom: z.string().datetime().or(z.string().date()).optional(),
  validUntil: z.string().datetime().or(z.string().date()).optional(),
});

export const cancelEPassSchema = z.object({
  reason: z.string().min(3, 'Cancellation reason must be at least 3 characters').max(300).optional(),
});

export const ePassQuerySchema = z.object({
  status: z.nativeEnum(EPassStatus).optional(),
  authorizationId: z.string().optional(),
  zoneId: z.string().optional(),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
