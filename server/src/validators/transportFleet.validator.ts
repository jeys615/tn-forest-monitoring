import { z } from 'zod';
import {
  TransportCompanyStatus,
  VehicleStatus,
  DriverVerificationStatus,
} from '@tn-forest/shared/types';

export const createTransportCompanySchema = z.object({
  registrationNumber: z.string().min(2).max(50),
  companyName: z.string().min(2).max(100),
  contactDetails: z
    .object({
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      address: z.string().optional(),
    })
    .optional(),
  status: z.nativeEnum(TransportCompanyStatus).optional(),
});

export const createVehicleSchema = z.object({
  registrationNumber: z.string().min(4, 'Registration number must be at least 4 characters').max(20),
  vehicleType: z.string().optional(),
  tareWeight: z.number().positive('Tare weight must be positive'),
  grossVehicleWeight: z.number().positive('Gross vehicle weight must be positive'),
  permittedCarryingCapacity: z.number().positive('Carrying capacity must be positive'),
  gpsTrackerId: z.string().optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  transportCompanyId: z.string().optional(),
}).refine((data) => data.grossVehicleWeight >= data.tareWeight, {
  message: 'Gross vehicle weight must be greater than or equal to tare weight',
  path: ['grossVehicleWeight'],
});

export const createDriverSchema = z.object({
  licenseNumber: z.string().min(4, 'License number must be at least 4 characters').max(30),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().min(6, 'Valid phone number required').max(20),
  verificationStatus: z.nativeEnum(DriverVerificationStatus).optional(),
  transportCompanyId: z.string().optional(),
});
