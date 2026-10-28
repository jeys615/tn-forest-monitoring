import { Schema, model, type Document } from 'mongoose';
import {
  ZoneCategory,
  ZoneStatus,
  type ZoneDto,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';

export interface IZone extends Document {
  zoneId: string;
  name: string;
  category: ZoneCategory;
  status: ZoneStatus;
  areaHectares?: number;
  boundary: GeoJSONPolygon | GeoJSONMultiPolygon;
  centerPoint: {
    type: 'Point';
    coordinates: [number, number];
  };
  baselineDate?: Date;
  baselineImageUrl?: string;
  baselineImageRef?: string;
  monitoringTracks: {
    optical: { enabled: boolean };
    sar: { enabled: boolean };
  };
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  toZoneDto(creatorUser?: { id: string; name: string; email: string }): ZoneDto;
}

const pointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { _id: false },
);

const boundarySchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Polygon', 'MultiPolygon'],
      required: true,
    },
    coordinates: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: function (coords: unknown) {
          if (!Array.isArray(coords) || coords.length === 0) return false;
          const type = (this as Record<string, unknown>).type;
          if (type === 'Polygon') {
            // Must be Array of LinearRings: [number, number][][]
            for (const ring of coords) {
              if (!Array.isArray(ring) || ring.length < 4) return false;
              for (const pt of ring) {
                if (!Array.isArray(pt) || pt.length !== 2) return false;
                const [lng, lat] = pt;
                if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) return false;
                if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return false;
              }
              const first = ring[0];
              const last = ring[ring.length - 1];
              if (first[0] !== last[0] || first[1] !== last[1]) return false;
            }
            return true;
          } else if (type === 'MultiPolygon') {
            // Must be Array of Polygons: [number, number][][][]
            for (const poly of coords) {
              if (!Array.isArray(poly) || poly.length === 0) return false;
              for (const ring of poly) {
                if (!Array.isArray(ring) || ring.length < 4) return false;
                for (const pt of ring) {
                  if (!Array.isArray(pt) || pt.length !== 2) return false;
                  const [lng, lat] = pt;
                  if (typeof lng !== 'number' || typeof lat !== 'number' || isNaN(lng) || isNaN(lat)) return false;
                  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return false;
                }
                const first = ring[0];
                const last = ring[ring.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) return false;
              }
            }
            return true;
          }
          return false;
        },
        message:
          'Invalid GeoJSON boundary: coordinates must be valid closed Polygon or MultiPolygon with WGS84 [lng, lat] values.',
      },
    },
  },
  { _id: false },
);

const zoneSchema = new Schema<IZone>(
  {
    zoneId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Zone name is required'],
      unique: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(ZoneCategory),
      required: [true, 'Zone category is required'],
    },
    status: {
      type: String,
      enum: Object.values(ZoneStatus),
      default: ZoneStatus.PROTECTED,
      required: true,
      index: true,
    },
    boundary: {
      type: boundarySchema,
      required: [true, 'Zone boundary polygon or multipolygon is required'],
    },
    centerPoint: {
      type: pointSchema,
      required: [true, 'Zone center point is required'],
    },
    baselineDate: {
      type: Date,
    },
    baselineImageUrl: {
      type: String,
      trim: true,
    },
    baselineImageRef: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    monitoringTracks: {
      type: new Schema(
        {
          optical: {
            type: new Schema({ enabled: { type: Boolean, default: true } }, { _id: false }),
            default: () => ({ enabled: true }),
          },
          sar: {
            type: new Schema({ enabled: { type: Boolean, default: false } }, { _id: false }),
            default: () => ({ enabled: false }),
          },
        },
        { _id: false },
      ),
      default: () => ({ optical: { enabled: true }, sar: { enabled: false } }),
    },
  },
  {
    timestamps: true,
  },
);

// Define 2dsphere indexes for geospatial queries
zoneSchema.index({ boundary: '2dsphere' });
zoneSchema.index({ centerPoint: '2dsphere' });

// Add helper to convert to DTO
zoneSchema.methods.toZoneDto = function (creatorUser?: {
  id: string;
  name: string;
  email: string;
}) {
  const creator = creatorUser || {
    id: this.createdBy.toString(),
    name: 'Unknown',
    email: 'unknown@tnforest.gov.in',
  };

  return {
    id: this._id.toString(),
    zoneId: this.zoneId,
    name: this.name,
    category: this.category,
    status: this.status,
    boundary: this.boundary,
    centerPoint: this.centerPoint,
    baselineDate: this.baselineDate ? this.baselineDate.toISOString() : undefined,
    baselineImageUrl: this.baselineImageUrl,
    baselineImageRef: this.baselineImageRef,
    monitoringTracks: this.monitoringTracks
      ? {
          optical: { enabled: this.monitoringTracks.optical?.enabled ?? true },
          sar: { enabled: this.monitoringTracks.sar?.enabled ?? false },
        }
      : { optical: { enabled: true }, sar: { enabled: false } },
    createdBy: creator,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const Zone = model<IZone>('Zone', zoneSchema);
