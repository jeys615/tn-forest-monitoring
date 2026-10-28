import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { DriverVerificationStatus } from '@tn-forest/shared/types';

export interface IDriver extends Document {
  _id: Types.ObjectId;
  driverId: string;
  licenseNumber: string;
  name: string;
  phone: string;
  verificationStatus: DriverVerificationStatus;
  transportCompanyId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const driverSchema = new Schema<IDriver>(
  {
    driverId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    licenseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    verificationStatus: {
      type: String,
      enum: Object.values(DriverVerificationStatus),
      default: DriverVerificationStatus.VERIFIED,
      index: true,
    },
    transportCompanyId: {
      type: Schema.Types.ObjectId,
      ref: 'TransportCompany',
      index: true,
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

export const DriverModel = mongoose.model<IDriver>('Driver', driverSchema);
