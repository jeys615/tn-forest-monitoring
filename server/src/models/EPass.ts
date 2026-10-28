import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { EPassStatus } from '@tn-forest/shared/types';

export interface IEPass extends Document {
  _id: Types.ObjectId;
  passNumber: string;
  authorizationId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  driverId: Types.ObjectId;
  mineralType: string;
  netWeightTonnes: number;
  sourceLocation: string;
  destinationCheckpoint: string;
  validFrom: Date;
  validUntil: Date;
  qrPayload: string;
  qrCodeHash: string;
  digitalSignature: string;
  status: EPassStatus;
  dispatchTimestamp?: Date;
  usedTimestamp?: Date;
  cancellationReason?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ePassSchema = new Schema<IEPass>(
  {
    passNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    authorizationId: {
      type: Schema.Types.ObjectId,
      ref: 'MiningAuthorization',
      required: true,
      index: true,
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    mineralType: {
      type: String,
      required: true,
      trim: true,
    },
    netWeightTonnes: {
      type: Number,
      required: true,
      min: 0.01,
    },
    sourceLocation: {
      type: String,
      required: true,
      trim: true,
    },
    destinationCheckpoint: {
      type: String,
      required: true,
      trim: true,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    qrPayload: {
      type: String,
      required: true,
    },
    qrCodeHash: {
      type: String,
      required: true,
    },
    digitalSignature: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(EPassStatus),
      default: EPassStatus.ACTIVE,
      index: true,
    },
    dispatchTimestamp: {
      type: Date,
    },
    usedTimestamp: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
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

ePassSchema.index({ status: 1, validUntil: 1 });
ePassSchema.index({ authorizationId: 1, status: 1 });
ePassSchema.index({ vehicleId: 1, status: 1 });
ePassSchema.index({ driverId: 1, status: 1 });

export const EPassModel = mongoose.model<IEPass>('EPass', ePassSchema);
