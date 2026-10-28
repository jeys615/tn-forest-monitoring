import { z } from 'zod';
import { CheckpointStatus } from '@tn-forest/shared/types';

export const geoPointCoordinatesSchema = z.tuple([
  z.number().finite().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  z.number().finite().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
]);

export const createCheckpointSchema = z.object({
  checkpointId: z.string().trim().min(2).max(50).optional(),
  name: z.string().trim().min(3, 'Checkpoint name must be at least 3 characters'),
  district: z.string().trim().min(2, 'District is required'),
  location: z.object({
    type: z.literal('Point'),
    coordinates: geoPointCoordinatesSchema,
  }),
  geofenceRadiusMeters: z.number().min(50).max(10000).optional().default(500),
  status: z.nativeEnum(CheckpointStatus).optional().default(CheckpointStatus.ACTIVE),
  authorizedUserIds: z.array(z.string()).optional(),
  operatingHours: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateCheckpointSchema = z.object({
  name: z.string().trim().min(3).optional(),
  district: z.string().trim().min(2).optional(),
  location: z
    .object({
      type: z.literal('Point'),
      coordinates: geoPointCoordinatesSchema,
    })
    .optional(),
  geofenceRadiusMeters: z.number().min(50).max(10000).optional(),
  status: z.nativeEnum(CheckpointStatus).optional(),
  authorizedUserIds: z.array(z.string()).optional(),
  operatingHours: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const verifyEPassSchema = z.object({
  checkpointId: z.string().trim().min(1, 'Checkpoint ID is required'),
  qrPayload: z.string().trim().optional(),
  passNumber: z.string().trim().optional(),
  currentLocation: geoPointCoordinatesSchema.optional(), // [longitude, latitude]
  declaredQuantityTonnes: z.number().min(0).optional(),
  notes: z.string().trim().optional(),
}).refine(
  (data) => Boolean(data.qrPayload || data.passNumber),
  { message: 'Either qrPayload or passNumber must be provided' },
);

export const recordPassageSchema = z.object({
  checkpointId: z.string().trim().min(1, 'Checkpoint ID is required'),
  passNumberOrId: z.string().trim().min(1, 'Pass Number or ID is required'),
  currentLocation: geoPointCoordinatesSchema.optional(), // [longitude, latitude]
  declaredQuantityTonnes: z.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

export const checkpointLogQuerySchema = z.object({
  checkpointId: z.string().optional(),
  zoneId: z.string().optional(),
  passNumber: z.string().optional(),
  verificationResult: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(100),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  maxDistanceMeters: z.coerce.number().min(1).max(500000).optional(),
});

export const batchPassageItemSchema = z.object({
  clientLogId: z.string().trim().optional(),
  syncNonce: z.string().trim().optional(),
  passNumberOrId: z.string().trim().min(1, 'Pass Number or ID is required'),
  passageTimestamp: z.string().trim().min(1, 'Passage timestamp is required'),
  currentLocation: geoPointCoordinatesSchema.optional(),
  declaredQuantityTonnes: z.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

export const batchCheckpointSyncSchema = z.object({
  checkpointId: z.string().trim().min(1, 'Checkpoint ID is required'),
  syncBatchId: z.string().trim().optional(),
  passages: z.array(batchPassageItemSchema).min(1, 'At least one passage record is required'),
});

