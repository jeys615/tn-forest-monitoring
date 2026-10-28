import { Schema, model, type Document, type Types } from 'mongoose';
import {
  CheckpointStatus,
  type GeoJSONPoint,
} from '@tn-forest/shared/types';

export interface ICheckpoint extends Document {
  checkpointId: string;
  name: string;
  district: string;
  location: GeoJSONPoint;
  geofenceRadiusMeters: number;
  status: CheckpointStatus;
  authorizedUserIds: Types.ObjectId[];
  operatingHours?: string;
  metadata?: Record<string, unknown>;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const pointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  { _id: false },
);

const checkpointSchema = new Schema<ICheckpoint>(
  {
    checkpointId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    location: {
      type: pointSchema,
      required: true,
    },
    geofenceRadiusMeters: {
      type: Number,
      required: true,
      default: 500,
      min: 50,
      max: 10000,
    },
    status: {
      type: String,
      enum: Object.values(CheckpointStatus),
      default: CheckpointStatus.ACTIVE,
      required: true,
      index: true,
    },
    authorizedUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    operatingHours: {
      type: String,
      trim: true,
      default: '24/7 Continuous Enforcement',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

checkpointSchema.index({ location: '2dsphere' });

export const CheckpointModel = model<ICheckpoint>('Checkpoint', checkpointSchema);
