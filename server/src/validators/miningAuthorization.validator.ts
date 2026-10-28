import { z } from 'zod';
import { MiningAuthorizationStatus } from '@tn-forest/shared/types';

export const createMiningAuthorizationSchema = z.object({
  zoneId: z.string().optional(),
  temporaryAreaId: z.string().optional(),
  permitNumber: z.string().min(3, 'Permit number must be at least 3 characters').max(50),
  lesseeName: z.string().min(2, 'Lessee name must be at least 2 characters').max(100),
  mineralType: z.string().min(2, 'Mineral type must be at least 2 characters').max(50),
  permittedVolume: z.number().positive('Permitted volume must be positive').optional(),
  permittedWeightTonnes: z.number().positive('Permitted weight in tonnes must be positive'),
  validFrom: z.string().datetime().or(z.string().date()),
  validUntil: z.string().datetime().or(z.string().date()),
  status: z.nativeEnum(MiningAuthorizationStatus).optional(),
}).refine((data) => new Date(data.validUntil) > new Date(data.validFrom), {
  message: 'validUntil must be strictly after validFrom',
  path: ['validUntil'],
});

export const updateMiningAuthorizationSchema = z.object({
  status: z.nativeEnum(MiningAuthorizationStatus).optional(),
  lesseeName: z.string().min(2).max(100).optional(),
  validUntil: z.string().datetime().or(z.string().date()).optional(),
});
