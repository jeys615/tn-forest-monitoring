import { type Types } from 'mongoose';
import { VehicleModel, type IVehicle } from '../models/Vehicle.js';
import { VehicleStatus } from '@tn-forest/shared/types';

export class VehicleRepository {
  async create(data: Partial<IVehicle>): Promise<IVehicle> {
    const doc = new VehicleModel(data);
    const saved = await doc.save();
    return await saved.populate('transportCompanyId', 'companyName registrationNumber');
  }

  async findById(id: string | Types.ObjectId): Promise<IVehicle | null> {
    return await VehicleModel.findById(id).populate('transportCompanyId', 'companyName registrationNumber');
  }

  async findByRegistrationNumber(registrationNumber: string): Promise<IVehicle | null> {
    return await VehicleModel.findOne({
      registrationNumber: registrationNumber.toUpperCase().trim(),
    }).populate('transportCompanyId', 'companyName registrationNumber');
  }

  async findAll(filter: {
    status?: VehicleStatus;
    transportCompanyId?: string;
    vehicleIds?: (string | Types.ObjectId)[];
  } = {}): Promise<IVehicle[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.transportCompanyId) query.transportCompanyId = filter.transportCompanyId;
    if (filter.vehicleIds !== undefined) query._id = { $in: filter.vehicleIds };

    return await VehicleModel.find(query)
      .sort({ createdAt: -1 })
      .populate('transportCompanyId', 'companyName registrationNumber');
  }
}

export const vehicleRepository = new VehicleRepository();
