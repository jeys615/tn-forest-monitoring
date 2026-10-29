import { Types } from 'mongoose';
import {
  transportCompanyRepository,
  TransportCompanyRepository,
} from '../repositories/TransportCompanyRepository.js';
import {
  vehicleRepository,
  VehicleRepository,
} from '../repositories/VehicleRepository.js';
import {
  driverRepository,
  DriverRepository,
} from '../repositories/DriverRepository.js';
import { type ITransportCompany } from '../models/TransportCompany.js';
import { type IVehicle } from '../models/Vehicle.js';
import { type IDriver } from '../models/Driver.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { EPassModel } from '../models/EPass.js';
import {
  type TransportCompanyDto,
  type CreateTransportCompanyRequest,
  type VehicleDto,
  type CreateVehicleRequest,
  type DriverDto,
  type CreateDriverRequest,
  TransportCompanyStatus,
  VehicleStatus,
  VehicleType,
  DriverVerificationStatus,
} from '@tn-forest/shared/types';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';

export class TransportFleetService {
  constructor(
    private companyRepo: TransportCompanyRepository = transportCompanyRepository,
    private vehicleRepo: VehicleRepository = vehicleRepository,
    private driverRepo: DriverRepository = driverRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Transport Companies
  // ---------------------------------------------------------------------------

  async createTransportCompany(
    data: CreateTransportCompanyRequest,
    userId?: string,
  ): Promise<TransportCompanyDto> {
    const existing = await this.companyRepo.findByRegistrationNumber(data.registrationNumber);
    if (existing) {
      throw new AppError(
        `Transport company with registration number "${data.registrationNumber}" already exists`,
        HTTP_STATUS.CONFLICT,
      );
    }

    const companyId = `TC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const created = await this.companyRepo.create({
      companyId,
      registrationNumber: data.registrationNumber.trim().toUpperCase(),
      companyName: data.companyName.trim(),
      contactDetails: data.contactDetails,
      miningZoneDetails: data.miningZoneDetails,
      status: data.status || TransportCompanyStatus.ACTIVE,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    return this.toCompanyDto(created);
  }

  async updateTransportCompany(
    id: string,
    data: Partial<CreateTransportCompanyRequest>,
  ): Promise<TransportCompanyDto> {
    const updateData: Record<string, unknown> = {};
    if (data.companyName) updateData.companyName = data.companyName.trim();
    if (data.registrationNumber) updateData.registrationNumber = data.registrationNumber.trim().toUpperCase();
    if (data.contactDetails) updateData.contactDetails = data.contactDetails;
    if (data.miningZoneDetails) updateData.miningZoneDetails = data.miningZoneDetails;
    if (data.status) updateData.status = data.status;

    const updated = await this.companyRepo.updateById(id, updateData);
    if (!updated) {
      throw new AppError(`Transport company "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }
    return this.toCompanyDto(updated);
  }

  async getAllTransportCompanies(filter: {
    status?: TransportCompanyStatus;
  } = {}): Promise<TransportCompanyDto[]> {
    const list = await this.companyRepo.findAll(filter);
    return list.map((c) => this.toCompanyDto(c));
  }

  async getTransportCompanyById(id: string): Promise<TransportCompanyDto> {
    const doc = await this.companyRepo.findById(id);
    if (!doc) {
      throw new AppError(`Transport company "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }
    return this.toCompanyDto(doc);
  }

  // ---------------------------------------------------------------------------
  // Vehicles
  // ---------------------------------------------------------------------------

  async createVehicle(
    data: CreateVehicleRequest,
    userId?: string,
  ): Promise<VehicleDto> {
    const regNum = data.registrationNumber.trim().toUpperCase();
    const existing = await this.vehicleRepo.findByRegistrationNumber(regNum);
    if (existing) {
      throw new AppError(
        `Vehicle with registration number "${regNum}" already exists`,
        HTTP_STATUS.CONFLICT,
      );
    }

    if (data.transportCompanyId) {
      const company = await this.companyRepo.findById(data.transportCompanyId);
      if (!company) {
        throw new AppError(`Transport company "${data.transportCompanyId}" not found`, HTTP_STATUS.NOT_FOUND);
      }
    }

    if (data.grossVehicleWeight < data.tareWeight) {
      throw new AppError(
        'Gross vehicle weight cannot be less than tare weight',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const vehicleId = `VEH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const created = await this.vehicleRepo.create({
      vehicleId,
      registrationNumber: regNum,
      vehicleType: data.vehicleType || 'TRUCK',
      tareWeight: data.tareWeight,
      grossVehicleWeight: data.grossVehicleWeight,
      permittedCarryingCapacity: data.permittedCarryingCapacity,
      gpsTrackerId: data.gpsTrackerId?.trim(),
      status: data.status || VehicleStatus.ACTIVE,
      transportCompanyId: data.transportCompanyId
        ? new Types.ObjectId(data.transportCompanyId)
        : undefined,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    return this.toVehicleDto(created);
  }

  async getAllVehicles(filter: {
    status?: VehicleStatus;
    transportCompanyId?: string;
    zoneId?: string;
  } = {}): Promise<VehicleDto[]> {
    let vehicleIds: any[] | undefined = undefined;
    if (filter.zoneId) {
      const auths = await MiningAuthorizationModel.find({ zoneId: filter.zoneId }).select('_id');
      const authIds = auths.map((a) => a._id);
      const epasses = await EPassModel.find({ authorizationId: { $in: authIds } }).select('vehicleId');
      vehicleIds = epasses.map((e) => e.vehicleId).filter(Boolean);
    }
    const list = await this.vehicleRepo.findAll({
      status: filter.status,
      transportCompanyId: filter.transportCompanyId,
      vehicleIds,
    });
    return list.map((v) => this.toVehicleDto(v));
  }

  async getVehicleById(id: string): Promise<VehicleDto> {
    const doc = await this.vehicleRepo.findById(id);
    if (!doc) {
      throw new AppError(`Vehicle "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }
    return this.toVehicleDto(doc);
  }

  // ---------------------------------------------------------------------------
  // Drivers
  // ---------------------------------------------------------------------------

  async createDriver(
    data: CreateDriverRequest,
    userId?: string,
  ): Promise<DriverDto> {
    const licNum = data.licenseNumber.trim().toUpperCase();
    const existing = await this.driverRepo.findByLicenseNumber(licNum);
    if (existing) {
      throw new AppError(
        `Driver with license number "${licNum}" already exists`,
        HTTP_STATUS.CONFLICT,
      );
    }

    if (data.transportCompanyId) {
      const company = await this.companyRepo.findById(data.transportCompanyId);
      if (!company) {
        throw new AppError(`Transport company "${data.transportCompanyId}" not found`, HTTP_STATUS.NOT_FOUND);
      }
    }

    const driverId = `DRV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const created = await this.driverRepo.create({
      driverId,
      licenseNumber: licNum,
      name: data.name.trim(),
      phone: data.phone.trim(),
      verificationStatus: data.verificationStatus || DriverVerificationStatus.VERIFIED,
      transportCompanyId: data.transportCompanyId
        ? new Types.ObjectId(data.transportCompanyId)
        : undefined,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    return this.toDriverDto(created);
  }

  async getAllDrivers(filter: {
    verificationStatus?: DriverVerificationStatus;
    transportCompanyId?: string;
    zoneId?: string;
  } = {}): Promise<DriverDto[]> {
    let driverIds: any[] | undefined = undefined;
    if (filter.zoneId) {
      const auths = await MiningAuthorizationModel.find({ zoneId: filter.zoneId }).select('_id');
      const authIds = auths.map((a) => a._id);
      const epasses = await EPassModel.find({ authorizationId: { $in: authIds } }).select('driverId');
      driverIds = epasses.map((e) => e.driverId).filter(Boolean);
    }
    const list = await this.driverRepo.findAll({
      verificationStatus: filter.verificationStatus,
      transportCompanyId: filter.transportCompanyId,
      driverIds,
    });
    return list.map((d) => this.toDriverDto(d));
  }

  async getDriverById(id: string): Promise<DriverDto> {
    const doc = await this.driverRepo.findById(id);
    if (!doc) {
      throw new AppError(`Driver "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }
    return this.toDriverDto(doc);
  }

  // ---------------------------------------------------------------------------
  // DTO Mappers
  // ---------------------------------------------------------------------------

  toCompanyDto(doc: ITransportCompany | Record<string, unknown>): TransportCompanyDto {
    const d = doc as Record<string, unknown>;
    return {
      id: (d._id as { toString(): string }).toString(),
      companyId: d.companyId as string,
      registrationNumber: d.registrationNumber as string,
      companyName: d.companyName as string,
      contactDetails: d.contactDetails as { phone: string; email?: string; address?: string },
      miningZoneDetails: d.miningZoneDetails as {
        zoneName?: string;
        leasePermitNumber?: string;
        mineralType?: string;
        authorizedCapacityTonnes?: number;
        validityPeriod?: string;
        locationDetails?: string;
      } | undefined,
      status: d.status as TransportCompanyStatus,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : (d.createdAt as string),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : (d.updatedAt as string),
    };
  }

  toVehicleDto(doc: IVehicle | Record<string, unknown>): VehicleDto {
    const d = doc as Record<string, unknown>;
    const tc = d.transportCompanyId as Record<string, unknown> | undefined;
    return {
      id: (d._id as { toString(): string }).toString(),
      vehicleId: d.vehicleId as string,
      registrationNumber: d.registrationNumber as string,
      vehicleType: d.vehicleType as VehicleType,
      tareWeight: d.tareWeight as number,
      grossVehicleWeight: d.grossVehicleWeight as number,
      permittedCarryingCapacity: d.permittedCarryingCapacity as number,
      gpsTrackerId: d.gpsTrackerId as string | undefined,
      status: d.status as VehicleStatus,
      transportCompanyId: tc?._id ? (tc._id as { toString(): string }).toString() : (tc ? String(tc) : undefined),
      transportCompanyName: tc?.companyName as string | undefined,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : (d.createdAt as string),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : (d.updatedAt as string),
    };
  }

  toDriverDto(doc: IDriver | Record<string, unknown>): DriverDto {
    const d = doc as Record<string, unknown>;
    const tc = d.transportCompanyId as Record<string, unknown> | undefined;
    return {
      id: (d._id as { toString(): string }).toString(),
      driverId: d.driverId as string,
      licenseNumber: d.licenseNumber as string,
      name: d.name as string,
      phone: d.phone as string,
      verificationStatus: d.verificationStatus as DriverVerificationStatus,
      transportCompanyId: tc?._id ? (tc._id as { toString(): string }).toString() : (tc ? String(tc) : undefined),
      transportCompanyName: tc?.companyName as string | undefined,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : (d.createdAt as string),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : (d.updatedAt as string),
    };
  }
}

export const transportFleetService = new TransportFleetService();
