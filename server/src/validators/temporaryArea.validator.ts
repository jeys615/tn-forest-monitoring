import { z } from 'zod';
import { TemporaryAreaStatus } from '@tn-forest/shared/types';

export const createTemporaryAreaSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  boundary: z.object({
    type: z.literal('Polygon'),
    coordinates: z
      .array(z.array(z.tuple([z.number(), z.number()])))
      .min(1, 'At least one polygon ring required')
      .refine(
        (rings) => {
          const ring = rings[0];
          if (!ring || ring.length < 4) return false;
          const first = ring[0];
          const last = ring[ring.length - 1];
          return first[0] === last[0] && first[1] === last[1];
        },
        { message: 'Polygon exterior ring must be closed (first and last coordinate must match)' },
      ),
  }),
  startDate: z.string().datetime().or(z.string().date()),
  endDate: z.string().datetime().or(z.string().date()),
  reason: z.string().max(500).optional(),
  demElevationDataAvailable: z.boolean().optional(),
  estimatedMeanDepthMeters: z.number().positive().optional(),
  zoneId: z.string().optional(),
});

export const temporaryAreaQuerySchema = z.object({
  status: z.nativeEnum(TemporaryAreaStatus).optional(),
  createdBy: z.string().optional(),
  startDate: z
    .string()
    .transform((v) => new Date(v))
    .optional(),
  endDate: z
    .string()
    .transform((v) => new Date(v))
    .optional(),
  limit: z
    .string()
    .transform((v) => Number(v))
    .optional(),
});
