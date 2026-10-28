import { Types } from 'mongoose';
import { Zone, IZone } from '../models/Zone.js';
import '../models/User.js';
import { ZoneCategory, ZoneStatus } from '@tn-forest/shared/types';

export interface ZoneFilters {
  category?: ZoneCategory;
  status?: ZoneStatus;
  search?: string;
}

export class ZoneRepository {
  async findById(id: string): Promise<IZone | null> {
    if (Types.ObjectId.isValid(id)) {
      const byId = await Zone.findById(id).populate('createdBy', 'name email');
      if (byId) return byId;
    }
    return Zone.findOne({ zoneId: id }).populate('createdBy', 'name email');
  }

  async findByZoneId(zoneId: string): Promise<IZone | null> {
    return Zone.findOne({ zoneId }).populate('createdBy', 'name email');
  }

  async findByName(name: string): Promise<IZone | null> {
    if (!name) return null;
    return Zone.findOne({ name: name.trim() }).populate('createdBy', 'name email');
  }

  async findAll(filters: ZoneFilters = {}): Promise<IZone[]> {
    const query: Record<string, unknown> = {};

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.search) {
      query.name = { $regex: filters.search.trim(), $options: 'i' };
    }

    return Zone.find(query).populate('createdBy', 'name email').sort({ createdAt: -1 });
  }

  async create(data: Partial<IZone>): Promise<IZone> {
    const zone = new Zone(data);
    return zone.save();
  }

  async update(id: string, updates: Partial<IZone>): Promise<IZone | null> {
    return Zone.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).populate('createdBy', 'name email');
  }

  async count(): Promise<number> {
    return Zone.countDocuments();
  }
}

export const zoneRepository = new ZoneRepository();
