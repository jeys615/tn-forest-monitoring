import { type Types } from 'mongoose';
import {
  TransportCompanyModel,
  type ITransportCompany,
} from '../models/TransportCompany.js';
import { TransportCompanyStatus } from '@tn-forest/shared/types';

export class TransportCompanyRepository {
  async create(data: Partial<ITransportCompany>): Promise<ITransportCompany> {
    const doc = new TransportCompanyModel(data);
    return await doc.save();
  }

  async findById(id: string | Types.ObjectId): Promise<ITransportCompany | null> {
    return await TransportCompanyModel.findById(id);
  }

  async updateById(id: string | Types.ObjectId, data: Partial<ITransportCompany>): Promise<ITransportCompany | null> {
    return await TransportCompanyModel.findByIdAndUpdate(id, { $set: data }, { new: true });
  }

  async findByRegistrationNumber(registrationNumber: string): Promise<ITransportCompany | null> {
    return await TransportCompanyModel.findOne({ registrationNumber });
  }

  async findAll(filter: { status?: TransportCompanyStatus } = {}): Promise<ITransportCompany[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;

    return await TransportCompanyModel.find(query).sort({ createdAt: -1 });
  }
}

export const transportCompanyRepository = new TransportCompanyRepository();
