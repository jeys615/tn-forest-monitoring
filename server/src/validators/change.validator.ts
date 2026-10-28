import { z } from 'zod';
import {
  SensorType,
  SatelliteSource,
  AlertSeverity,
  AlertStatus,
  AlertAction,
  MonitoringTrack,
  ChangeCategory,
} from '@tn-forest/shared/types';

// ─── Change Detection ─────────────────────────────────────────────────────────

export const detectChangeSchema = z
  .object({
    zoneId: z.string().optional(),
    temporaryAreaId: z.string().optional(),
    boundary: z
      .object({
        type: z.literal('Polygon'),
        coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
      })
      .optional(),
    observationId: z.string().min(1, 'observationId is required'),
    baselineId: z.string().optional(),
    referenceObservationId: z.string().optional(),
    forceSensorType: z.nativeEnum(SensorType).optional(),
    startDate: z.string().datetime().or(z.string().date()).optional(),
    endDate: z.string().datetime().or(z.string().date()).optional(),
    forceRecalculate: z.boolean().optional(),
  })
  .refine((val) => Boolean(val.zoneId || val.temporaryAreaId || val.boundary), {
    message: 'Either zoneId, temporaryAreaId, or boundary must be provided.',
  });

// ─── Alert status update (legacy — kept for backward compat) ──────────────────

export const updateAlertStatusSchema = z.object({
  status: z.nativeEnum(AlertStatus, {
    errorMap: () => ({
      message: 'Status must be OPEN, ACKNOWLEDGED, UNDER_REVIEW, CONFIRMED, RESOLVED, or DISMISSED',
    }),
  }),
  notes: z.string().optional(),
});

// ─── Alert action (lifecycle action endpoint) ─────────────────────────────────

export const alertActionSchema = z
  .object({
    action: z.nativeEnum(AlertAction, {
      errorMap: () => ({
        message:
          'Action must be one of: ACKNOWLEDGE, START_REVIEW, CONFIRM, DISMISS, RESOLVE, ASSIGN',
      }),
    }),
    notes: z.string().max(2000).optional(),
    dismissalReason: z.string().max(2000).optional(),
    resolutionInfo: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === AlertAction.DISMISS && !val.dismissalReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dismissalReason'],
        message: 'dismissalReason is required when action is DISMISS',
      });
    }
    if (val.action === AlertAction.RESOLVE && !val.resolutionInfo?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolutionInfo'],
        message: 'resolutionInfo is required when action is RESOLVE',
      });
    }
  });

// ─── Alert assignment ─────────────────────────────────────────────────────────

export const alertAssignSchema = z.object({
  assigneeId: z.string().min(1, 'assigneeId is required'),
  notes: z.string().max(2000).optional(),
});

// ─── Change query ─────────────────────────────────────────────────────────────

export const changeQuerySchema = z.object({
  zoneId: z.string().optional(),
  temporaryAreaId: z.string().optional(),
  sensorType: z.nativeEnum(SensorType).optional(),
  source: z.nativeEnum(SatelliteSource).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'NONE']).optional(),
  alertGenerated: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  threshold: z
    .string()
    .transform((val) => Number(val))
    .optional(),
  fromDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  toDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  limit: z
    .string()
    .transform((val) => Number(val))
    .optional(),
});

// ─── Alert query (list endpoint) ──────────────────────────────────────────────

export const alertQuerySchema = z.object({
  zoneId: z.string().optional(),
  temporaryAreaId: z.string().optional(),
  severity: z.nativeEnum(AlertSeverity).optional(),
  status: z.nativeEnum(AlertStatus).optional(),
  sensorType: z.nativeEnum(SensorType).optional(),
  monitoringTrack: z.nativeEnum(MonitoringTrack).optional(),
  category: z.nativeEnum(ChangeCategory).optional(),
  assignedTo: z.string().optional(),
  fromDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  toDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  sortBy: z.enum(['newest', 'oldest', 'severity', 'affectedArea']).optional(),
  page: z
    .string()
    .transform((val) => Math.max(1, Number(val)))
    .optional(),
  pageSize: z
    .string()
    .transform((val) => Math.min(100, Math.max(1, Number(val))))
    .optional(),
  limit: z
    .string()
    .transform((val) => Number(val))
    .optional(),
});

// ─── Alert stats query ────────────────────────────────────────────────────────

export const alertStatsQuerySchema = z.object({
  zoneId: z.string().optional(),
  fromDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  toDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
});
