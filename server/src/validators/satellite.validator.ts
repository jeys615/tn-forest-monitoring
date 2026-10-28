import { z } from 'zod';
import { SatelliteSource, SensorType } from '@tn-forest/shared/types';

export const acquireImageSchema = z.object({
  zoneId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid zone identifier format (must be Mongoose ObjectId)'),
  startDate: z.string().datetime().or(z.string().date()),
  endDate: z.string().datetime().or(z.string().date()),
  maxCloudCover: z.number().min(0).max(100).optional(),
  sensorType: z.nativeEnum(SensorType).optional(),
  source: z.nativeEnum(SatelliteSource).optional(),
  imageId: z.string().optional(),
  sync: z.boolean().optional(),
});

const coordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180), // Longitude
  z.number().finite().min(-90).max(90), // Latitude
]);

const polygonCoordinatesSchema = z.array(z.array(coordinateSchema)).min(1);

const basePolygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: polygonCoordinatesSchema,
  })
  .refine(
    (val) => {
      for (const ring of val.coordinates) {
        if (ring.length < 4) return false;
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) return false;
      }
      return true;
    },
    {
      message: 'Invalid footprint geometry: must be a closed Polygon with at least 4 vertices.',
    },
  );

export const queryFootprintSchema = z.union([
  basePolygonSchema,
  z.object({
    footprint: basePolygonSchema.optional(),
    type: z.literal('Polygon').optional(),
    coordinates: polygonCoordinatesSchema.optional(),
    startDate: z.string().datetime().or(z.string().date()).optional(),
    endDate: z.string().datetime().or(z.string().date()).optional(),
    source: z.nativeEnum(SatelliteSource).optional(),
    sensorType: z.nativeEnum(SensorType).optional(),
  }),
]);

export const searchSatelliteSchema = z
  .object({
    zoneId: z.string().optional(),
    boundary: basePolygonSchema.optional(),
    startDate: z.string().min(1, 'startDate is required'),
    endDate: z.string().min(1, 'endDate is required'),
    sensor: z.string().optional(),
    sensorType: z.nativeEnum(SensorType).optional(),
    maxCloudCover: z.number().min(0).max(100).optional(),
  })
  .refine((data) => Boolean(data.zoneId || data.boundary), {
    message: 'Either zoneId or boundary must be provided for satellite search.',
  });

