import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { TransportCompanyStatus } from '@tn-forest/shared/types';

export interface ITransportCompany extends Document {
  _id: Types.ObjectId;
  companyId: string;
  registrationNumber: string;
  companyName: string;
  contactDetails?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  miningZoneDetails?: {
    zoneName?: string;
    leasePermitNumber?: string;
    mineralType?: string;
    authorizedCapacityTonnes?: number;
    validityPeriod?: string;
    locationDetails?: string;
  };
  userId?: Types.ObjectId;
  status: TransportCompanyStatus;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const transportCompanySchema = new Schema<ITransportCompany>(
  {
    companyId: {
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
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    contactDetails: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      address: { type: String, trim: true },
    },
    miningZoneDetails: {
      zoneName: { type: String, trim: true },
      leasePermitNumber: { type: String, trim: true },
      mineralType: { type: String, trim: true },
      authorizedCapacityTonnes: { type: Number, min: 0 },
      validityPeriod: { type: String, trim: true },
      locationDetails: { type: String, trim: true },
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TransportCompanyStatus),
      default: TransportCompanyStatus.ACTIVE,
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

export const TransportCompanyModel = mongoose.model<ITransportCompany>(
  'TransportCompany',
  transportCompanySchema,
);
