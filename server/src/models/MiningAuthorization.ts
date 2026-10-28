import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { MiningAuthorizationStatus } from '@tn-forest/shared/types';

export interface IMiningAuthorization extends Document {
  _id: Types.ObjectId;
  authorizationId: string;
  zoneId?: Types.ObjectId;
  temporaryAreaId?: Types.ObjectId;
  permitNumber: string;
  lesseeName: string;
  mineralType: string;
  permittedVolume?: number;
  permittedWeightTonnes: number;
  validFrom: Date;
  validUntil: Date;
  status: MiningAuthorizationStatus;
  remainingQuota: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const miningAuthorizationSchema = new Schema<IMiningAuthorization>(
  {
    authorizationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Zone',
      index: true,
    },
    temporaryAreaId: {
      type: Schema.Types.ObjectId,
      ref: 'TemporaryArea',
      index: true,
    },
    permitNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    lesseeName: {
      type: String,
      required: true,
      trim: true,
    },
    mineralType: {
      type: String,
      required: true,
      trim: true,
    },
    permittedVolume: {
      type: Number,
      min: 0,
    },
    permittedWeightTonnes: {
      type: Number,
      required: true,
      min: 0,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MiningAuthorizationStatus),
      default: MiningAuthorizationStatus.ACTIVE,
      index: true,
    },
    remainingQuota: {
      type: Number,
      required: true,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

miningAuthorizationSchema.index({ status: 1, validUntil: 1 });
miningAuthorizationSchema.index({ remainingQuota: 1 });

export const MiningAuthorizationModel = mongoose.model<IMiningAuthorization>(
  'MiningAuthorization',
  miningAuthorizationSchema,
);
