import { z } from 'zod';
import {
  ZoneRiskLevel,
  ZoneCategory,
  ZoneStatus,
  TimeRangePreset,
} from '@tn-forest/shared/types';

export const intelligenceQuerySchema = z.object({
  zoneId: z.string().optional(),
  riskLevel: z.nativeEnum(ZoneRiskLevel).optional(),
  category: z.nativeEnum(ZoneCategory).optional(),
  status: z.nativeEnum(ZoneStatus).optional(),
  preset: z.nativeEnum(TimeRangePreset).optional().default(TimeRangePreset.THIRTY_DAYS),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(50),
  skip: z.coerce.number().min(0).optional().default(0),
});

export const trendQuerySchema = z.object({
  preset: z.nativeEnum(TimeRangePreset).optional().default(TimeRangePreset.THIRTY_DAYS),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
