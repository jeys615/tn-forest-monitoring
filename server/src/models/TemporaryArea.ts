import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  type TemporaryAreaDto,
  TemporaryAreaStatus,
  type GeoJSONPolygon,
  type GeoJSONPoint,
} from '@tn-forest/shared/types';

export interface ITemporaryArea extends Document {
  _id: Types.ObjectId;
  temporaryAreaId: string;
  name: string;
  boundary: GeoJSONPolygon;
  areaHectares: number;
  areaSquareMeters: number;
  centerPoint: GeoJSONPoint;
  startDate: Date;
  endDate: Date;
  reason?: string;
  status: TemporaryAreaStatus;
  createdBy: Types.ObjectId;
  demElevationDataAvailable: boolean;
  estimatedMeanDepthMeters?: number;
  zoneId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  toDto(): TemporaryAreaDto;
}

const geoJSONPolygonSchema = new Schema<GeoJSONPolygon>(
  {
    type: {
      type: String,
      enum: ['Polygon'],
      required: true,
    },
    coordinates: {
      type: [[[Number]]],
      required: true,
    },
  },
  { _id: false },
);

const geoJSONPointSchema = new Schema<GeoJSONPoint>(
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

const temporaryAreaSchema = new Schema<ITemporaryArea>(
  {
    temporaryAreaId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    boundary: {
      type: geoJSONPolygonSchema,
      required: true,
    },
    areaHectares: {
      type: Number,
      required: true,
    },
    areaSquareMeters: {
      type: Number,
      required: true,
    },
    centerPoint: {
      type: geoJSONPointSchema,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(TemporaryAreaStatus),
      default: TemporaryAreaStatus.ANALYSIS_REQUESTED,
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    demElevationDataAvailable: {
      type: Boolean,
      default: false,
    },
    estimatedMeanDepthMeters: {
      type: Number,
    },
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Zone',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

temporaryAreaSchema.index({ boundary: '2dsphere' });
temporaryAreaSchema.index({ createdBy: 1, createdAt: -1 });
temporaryAreaSchema.index({ status: 1, createdAt: -1 });

temporaryAreaSchema.methods.toDto = function (): TemporaryAreaDto {
  return {
    id: this._id.toString(),
    temporaryAreaId: this.temporaryAreaId,
    name: this.name,
    boundary: this.boundary,
    areaHectares: this.areaHectares,
    areaSquareMeters: this.areaSquareMeters,
    centerPoint: this.centerPoint,
    startDate: this.startDate.toISOString(),
    endDate: this.endDate.toISOString(),
    reason: this.reason,
    status: this.status,
    createdBy: this.createdBy.toString(),
    demElevationDataAvailable: this.demElevationDataAvailable,
    estimatedMeanDepthMeters: this.estimatedMeanDepthMeters,
    zoneId: this.zoneId?.toString(),
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const TemporaryAreaModel = mongoose.model<ITemporaryArea>(
  'TemporaryArea',
  temporaryAreaSchema,
);
