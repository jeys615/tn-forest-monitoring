import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { VehicleStatus, VehicleType } from '@tn-forest/shared/types';

export interface IVehicle extends Document {
  _id: Types.ObjectId;
  vehicleId: string;
  registrationNumber: string;
  vehicleType: VehicleType | string;
  tareWeight: number;
  grossVehicleWeight: number;
  permittedCarryingCapacity: number;
  gpsTrackerId?: string;
  status: VehicleStatus;
  transportCompanyId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    vehicleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    vehicleType: {
      type: String,
      default: VehicleType.TRUCK,
    },
    tareWeight: {
      type: Number,
      required: true,
      min: 0,
    },
    grossVehicleWeight: {
      type: Number,
      required: true,
      min: 0,
    },
    permittedCarryingCapacity: {
      type: Number,
      required: true,
      min: 0,
    },
    gpsTrackerId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(VehicleStatus),
      default: VehicleStatus.ACTIVE,
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

export const VehicleModel = mongoose.model<IVehicle>('Vehicle', vehicleSchema);
