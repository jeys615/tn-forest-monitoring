import { Schema, model, type Document, type Types } from 'mongoose';
import {
  CheckpointVerificationResult,
  LocationVerificationStatus,
  type GeoJSONPoint,
} from '@tn-forest/shared/types';

export interface ICheckpointLog extends Document {
  logId: string;
  checkpointId: Types.ObjectId;
  checkpointName: string;
  epassId?: Types.ObjectId;
  passNumber: string;
  vehicleId?: Types.ObjectId;
  vehicleRegistrationNumber?: string;
  driverId?: Types.ObjectId;
  driverName?: string;
  driverLicenseNumber?: string;
  authorizationId?: Types.ObjectId;
  permitNumber?: string;
  mineralType?: string;
  authorizedQuantityTonnes?: number;
  declaredQuantityTonnes?: number;
  verificationTimestamp: Date;
  verificationResult: CheckpointVerificationResult;
  rejectionReasons: string[];
  signatureVerified: boolean;
  hashVerified: boolean;
  locationStatus: LocationVerificationStatus;
  scannedCoordinates?: GeoJSONPoint;
  distanceFromCheckpointMeters?: number;
  verifiedBy?: Types.ObjectId;
  notes?: string;
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
      validate: {
        validator: function (coords: number[]) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          return (
            typeof lng === 'number' &&
            typeof lat === 'number' &&
            !isNaN(lng) &&
            !isNaN(lat) &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message:
          'scannedCoordinates must be valid GeoJSON [longitude (-180 to 180), latitude (-90 to 90)]',
      },
    },
  },
  { _id: false },
);

const checkpointLogSchema = new Schema<ICheckpointLog>(
  {
    logId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      index: true,
    },
    checkpointId: {
      type: Schema.Types.ObjectId,
      ref: 'Checkpoint',
      required: true,
      index: true,
    },
    checkpointName: {
      type: String,
      required: true,
    },
    epassId: {
      type: Schema.Types.ObjectId,
      ref: 'EPass',
      index: true,
    },
    passNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      index: true,
    },
    vehicleRegistrationNumber: {
      type: String,
      trim: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    driverName: {
      type: String,
      trim: true,
    },
    driverLicenseNumber: {
      type: String,
      trim: true,
    },
    authorizationId: {
      type: Schema.Types.ObjectId,
      ref: 'MiningAuthorization',
    },
    permitNumber: {
      type: String,
      trim: true,
    },
    mineralType: {
      type: String,
      trim: true,
    },
    authorizedQuantityTonnes: {
      type: Number,
    },
    declaredQuantityTonnes: {
      type: Number,
    },
    verificationTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    verificationResult: {
      type: String,
      enum: Object.values(CheckpointVerificationResult),
      required: true,
      index: true,
    },
    rejectionReasons: {
      type: [String],
      default: [],
    },
    signatureVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    hashVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    locationStatus: {
      type: String,
      enum: Object.values(LocationVerificationStatus),
      required: true,
      default: LocationVerificationStatus.LOCATION_UNAVAILABLE,
    },
    scannedCoordinates: {
      type: pointSchema,
    },
    distanceFromCheckpointMeters: {
      type: Number,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

checkpointLogSchema.index({ verificationTimestamp: -1 });
checkpointLogSchema.index({ checkpointId: 1, verificationTimestamp: -1 });
checkpointLogSchema.index({ passNumber: 1, verificationTimestamp: -1 });
checkpointLogSchema.index({ scannedCoordinates: '2dsphere' });

export const CheckpointLogModel = model<ICheckpointLog>('CheckpointLog', checkpointLogSchema);
