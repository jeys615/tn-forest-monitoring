import { z } from 'zod';
import { ZoneCategory, ZoneStatus } from '@tn-forest/shared/types';

// GeoJSON coordinate validation helper
const coordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180), // Longitude
  z.number().finite().min(-90).max(90), // Latitude
]);

const polygonCoordinatesSchema = z.array(z.array(coordinateSchema)).min(1);

const geoJSONPolygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: polygonCoordinatesSchema,
  })
  .refine(
    (val) => {
      // Validate polygon rings
      for (const ring of val.coordinates) {
        if (ring.length < 4) {
          return false; // Minimum 4 coordinates (3 vertices + 1 closing)
        }
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          return false; // Ring must be closed
        }
      }
      return true;
    },
    {
      message:
        'Invalid Polygon geometry: each ring must contain at least 4 points and be closed (first and last coordinate must match).',
      path: ['coordinates'],
    },
  );

export const geoJSONMultiPolygonSchema = z
  .object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(polygonCoordinatesSchema).min(1, 'MultiPolygon must contain at least 1 polygon'),
  })
  .refine(
    (val) => {
      for (const poly of val.coordinates) {
        if (!Array.isArray(poly) || poly.length === 0) return false;
        for (const ring of poly) {
          if (!Array.isArray(ring) || ring.length < 4) {
            return false; // Minimum 4 coordinates (3 vertices + 1 closing)
          }
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            return false; // Ring must be closed
          }
        }
      }
      return true;
    },
    {
      message:
        'Invalid MultiPolygon geometry: each ring in each polygon must contain at least 4 points and be closed (first and last coordinate must match).',
      path: ['coordinates'],
    },
  );

export const geoJSONBoundarySchema = z.union([geoJSONPolygonSchema, geoJSONMultiPolygonSchema]);

const trackConfigSchema = z.object({
  enabled: z.boolean(),
});

const monitoringTracksSchema = z.object({
  optical: trackConfigSchema,
  sar: trackConfigSchema,
}).optional();

const updateMonitoringTracksSchema = z.object({
  optical: trackConfigSchema.optional(),
  sar: trackConfigSchema.optional(),
}).optional();

export const createZoneSchema = z.object({
  name: z.string().min(3, 'Zone name must be at least 3 characters long').max(100).trim(),
  category: z.nativeEnum(ZoneCategory),
  boundary: geoJSONBoundarySchema,
  baselineDate: z.string().datetime().optional().or(z.string().date().optional()).refine(
    (val) => {
      if (!val) return true;
      const date = new Date(val);
      const minDate = new Date('2013-02-11');
      return date >= minDate;
    },
    { message: 'Baseline date cannot be before 2013-02-11 (earliest satellite data)' }
  ),
  baselineImageUrl: z.string().url('Invalid baseline image URL').optional(),
  baselineImageRef: z.string().trim().optional(),
  monitoringTracks: monitoringTracksSchema,
});

export const updateZoneSchema = z.object({
  name: z
    .string()
    .min(3, 'Zone name must be at least 3 characters long')
    .max(100)
    .trim()
    .optional(),
  category: z.nativeEnum(ZoneCategory).optional(),
  boundary: geoJSONBoundarySchema.optional(),
  status: z.nativeEnum(ZoneStatus).optional(),
  baselineDate: z.string().datetime().optional().or(z.string().date().optional()).refine(
    (val) => {
      if (!val) return true;
      const date = new Date(val);
      const minDate = new Date('2013-02-11');
      return date >= minDate;
    },
    { message: 'Baseline date cannot be before 2013-02-11 (earliest satellite data)' }
  ),
  baselineImageUrl: z.string().url('Invalid baseline image URL').optional(),
  baselineImageRef: z.string().trim().optional(),
  monitoringTracks: updateMonitoringTracksSchema,
});

