import { Types } from 'mongoose';
import {
  miningAuthorizationRepository,
  MiningAuthorizationRepository,
} from '../repositories/MiningAuthorizationRepository.js';
import { zoneRepository, ZoneRepository } from '../repositories/ZoneRepository.js';
import { temporaryAreaRepository, TemporaryAreaRepository } from '../repositories/TemporaryAreaRepository.js';
import { type IMiningAuthorization } from '../models/MiningAuthorization.js';
import {
  type MiningAuthorizationDto,
  type CreateMiningAuthorizationRequest,
  type UpdateMiningAuthorizationRequest,
  MiningAuthorizationStatus,
} from '@tn-forest/shared/types';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';

export class MiningAuthorizationService {
  constructor(
    private authRepo: MiningAuthorizationRepository = miningAuthorizationRepository,
    private zoneRepo: ZoneRepository = zoneRepository,
    private tempAreaRepo: TemporaryAreaRepository = temporaryAreaRepository,
  ) {}

  async createAuthorization(
    data: CreateMiningAuthorizationRequest,
    userId: string,
  ): Promise<MiningAuthorizationDto> {
    const existing = await this.authRepo.findByPermitNumber(data.permitNumber);
    if (existing) {
      throw new AppError(
        `Mining authorization with permit number "${data.permitNumber}" already exists`,
        HTTP_STATUS.CONFLICT,
      );
    }

    if (data.zoneId) {
      const zone = await this.zoneRepo.findById(data.zoneId);
      if (!zone) {
        throw new AppError(`Monitored Zone "${data.zoneId}" not found`, HTTP_STATUS.NOT_FOUND);
      }
    }

    if (data.temporaryAreaId) {
      const tempArea = await this.tempAreaRepo.findById(data.temporaryAreaId);
      if (!tempArea) {
        throw new AppError(`Temporary Area "${data.temporaryAreaId}" not found`, HTTP_STATUS.NOT_FOUND);
      }
    }

    const validFrom = new Date(data.validFrom);
    const validUntil = new Date(data.validUntil);

    if (validUntil <= validFrom) {
      throw new AppError('validUntil must be strictly greater than validFrom', HTTP_STATUS.BAD_REQUEST);
    }

    const authorizationId = `AUTH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const created = await this.authRepo.create({
      authorizationId,
      zoneId: data.zoneId ? new Types.ObjectId(data.zoneId) : undefined,
      temporaryAreaId: data.temporaryAreaId ? new Types.ObjectId(data.temporaryAreaId) : undefined,
      permitNumber: data.permitNumber.trim(),
      lesseeName: data.lesseeName.trim(),
      mineralType: data.mineralType.trim(),
      permittedVolume: data.permittedVolume,
      permittedWeightTonnes: data.permittedWeightTonnes,
      validFrom,
      validUntil,
      status: data.status || MiningAuthorizationStatus.ACTIVE,
      remainingQuota: data.permittedWeightTonnes,
      createdBy: new Types.ObjectId(userId),
    });

    return this.toDto(created);
  }

  async getAuthorizationById(id: string): Promise<MiningAuthorizationDto> {
    const auth = await this.authRepo.findById(id);
    if (!auth) {
      throw new AppError(`Mining authorization "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }
    return this.toDto(auth);
  }

  async getAllAuthorizations(filter: {
    status?: MiningAuthorizationStatus;
    zoneId?: string;
    temporaryAreaId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<MiningAuthorizationDto[]> {
    const list = await this.authRepo.findAll(filter);
    return list.map((a) => this.toDto(a));
  }

  async updateAuthorization(
    id: string,
    data: UpdateMiningAuthorizationRequest,
  ): Promise<MiningAuthorizationDto> {
    const auth = await this.authRepo.findById(id);
    if (!auth) {
      throw new AppError(`Mining authorization "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    if (data.status) {
      auth.status = data.status;
    }
    if (data.lesseeName) {
      auth.lesseeName = data.lesseeName;
    }
    if (data.validUntil) {
      auth.validUntil = new Date(data.validUntil);
    }

    const saved = await auth.save();
    return this.toDto(saved);
  }

  toDto(doc: IMiningAuthorization | Record<string, unknown>): MiningAuthorizationDto {
    const d = doc as Record<string, unknown>;
    const zone = d.zoneId as Record<string, unknown> | undefined;
    const tempArea = d.temporaryAreaId as Record<string, unknown> | undefined;

    return {
      id: (d._id as { toString(): string }).toString(),
      authorizationId: d.authorizationId as string,
      zoneId: zone?._id ? (zone._id as { toString(): string }).toString() : (zone ? String(zone) : undefined),
      temporaryAreaId: tempArea?._id
        ? (tempArea._id as { toString(): string }).toString()
        : (tempArea ? String(tempArea) : undefined),
      permitNumber: d.permitNumber as string,
      lesseeName: d.lesseeName as string,
      mineralType: d.mineralType as string,
      permittedVolume: d.permittedVolume as number | undefined,
      permittedWeightTonnes: d.permittedWeightTonnes as number,
      validFrom: d.validFrom instanceof Date ? d.validFrom.toISOString() : (d.validFrom as string),
      validUntil: d.validUntil instanceof Date ? d.validUntil.toISOString() : (d.validUntil as string),
      status: d.status as MiningAuthorizationStatus,
      remainingQuota: d.remainingQuota as number,
      createdBy: d.createdBy ? String(d.createdBy) : undefined,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : (d.createdAt as string),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : (d.updatedAt as string),
    };
  }
}

export const miningAuthorizationService = new MiningAuthorizationService();
