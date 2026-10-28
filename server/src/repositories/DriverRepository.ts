import { type Types } from 'mongoose';
import { DriverModel, type IDriver } from '../models/Driver.js';
import { DriverVerificationStatus } from '@tn-forest/shared/types';

export class DriverRepository {
  async create(data: Partial<IDriver>): Promise<IDriver> {
    const doc = new DriverModel(data);
    const saved = await doc.save();
    return await saved.populate('transportCompanyId', 'companyName registrationNumber');
  }

  async findById(id: string | Types.ObjectId): Promise<IDriver | null> {
    return await DriverModel.findById(id).populate('transportCompanyId', 'companyName registrationNumber');
  }

  async findByLicenseNumber(licenseNumber: string): Promise<IDriver | null> {
    return await DriverModel.findOne({
      licenseNumber: licenseNumber.toUpperCase().trim(),
    }).populate('transportCompanyId', 'companyName registrationNumber');
  }

  async findAll(filter: {
    verificationStatus?: DriverVerificationStatus;
    transportCompanyId?: string;
    driverIds?: (string | Types.ObjectId)[];
  } = {}): Promise<IDriver[]> {
    const query: Record<string, unknown> = {};
    if (filter.verificationStatus) query.verificationStatus = filter.verificationStatus;
    if (filter.transportCompanyId) query.transportCompanyId = filter.transportCompanyId;
    if (filter.driverIds !== undefined) query._id = { $in: filter.driverIds };

    return await DriverModel.find(query)
      .sort({ createdAt: -1 })
      .populate('transportCompanyId', 'companyName registrationNumber');
  }
}

export const driverRepository = new DriverRepository();
