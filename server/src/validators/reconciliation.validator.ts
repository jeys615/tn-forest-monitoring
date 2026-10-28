import { z } from 'zod';
import {
  ReconciliationStatus,
  ReconciliationReportStatus,
} from '@tn-forest/shared/types';

export const runReconciliationSchema = z.object({
  zoneId: z.string().trim().optional(),
  authorizationId: z.string().trim().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  mineralDensityTonnesPerCubicMeter: z.number().min(0.5).max(10.0).optional().default(2.6),
  discrepancyTolerancePercent: z.number().min(1.0).max(100.0).optional().default(15.0),
  notes: z.string().trim().optional(),
}).refine(
  (data) => Boolean(data.zoneId || data.authorizationId),
  { message: 'Either zoneId or authorizationId must be provided' },
);

export const updateReconciliationStatusSchema = z.object({
  status: z.nativeEnum(ReconciliationReportStatus),
  investigationNotes: z.string().trim().optional(),
});

export const queryReconciliationSchema = z.object({
  zoneId: z.string().optional(),
  authorizationId: z.string().optional(),
  status: z.nativeEnum(ReconciliationReportStatus).optional(),
  reconciliationStatus: z.nativeEnum(ReconciliationStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(50),
  skip: z.coerce.number().min(0).optional().default(0),
});
