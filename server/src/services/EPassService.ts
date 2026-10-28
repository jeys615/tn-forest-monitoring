import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { ePassRepository, EPassRepository } from '../repositories/EPassRepository.js';
import {
  miningAuthorizationRepository,
  MiningAuthorizationRepository,
} from '../repositories/MiningAuthorizationRepository.js';
import { vehicleRepository, VehicleRepository } from '../repositories/VehicleRepository.js';
import { driverRepository, DriverRepository } from '../repositories/DriverRepository.js';
import { type IEPass } from '../models/EPass.js';
import {
  type EPassDto,
  type CreateEPassRequest,
  type EPassSummaryDto,
  EPassStatus,
  MiningAuthorizationStatus,
  VehicleStatus,
  DriverVerificationStatus,
} from '@tn-forest/shared/types';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';

export class EPassService {
  private signingSecret: string;

  constructor(
    private ePassRepo: EPassRepository = ePassRepository,
    private authRepo: MiningAuthorizationRepository = miningAuthorizationRepository,
    private vehicleRepo: VehicleRepository = vehicleRepository,
    private driverRepo: DriverRepository = driverRepository,
  ) {
    this.signingSecret =
      process.env.EPASS_SIGNING_KEY ||
      process.env.JWT_SECRET ||
      'epass-tamper-proof-hmac-sha256-signing-secret-2026';
  }

  /**
   * Generates a unique sequential/timestamped E-Pass number.
   * Format: EP-YYYY-XXXXXXXX
   */
  generatePassNumber(): string {
    const year = new Date().getFullYear();
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `EP-${year}-${randomHex}`;
  }

  /**
   * Generates canonical QR payload, SHA-256 hash, and cryptographic HMAC-SHA256 signature.
   */
  generateSecurityTokens(params: {
    passNumber: string;
    authorizationId: string;
    vehicleId: string;
    driverId: string;
    mineralType: string;
    netWeightTonnes: number;
    sourceLocation: string;
    destinationCheckpoint: string;
    validFrom: string;
    validUntil: string;
  }): { qrPayload: string; qrCodeHash: string; digitalSignature: string } {
    const canonicalObject = {
      p: params.passNumber,
      a: params.authorizationId,
      v: params.vehicleId,
      d: params.driverId,
      m: params.mineralType,
      w: params.netWeightTonnes,
      s: params.sourceLocation,
      c: params.destinationCheckpoint,
      vf: params.validFrom,
      vu: params.validUntil,
    };

    const canonicalString = JSON.stringify(canonicalObject);
    const qrCodeHash = crypto.createHash('sha256').update(canonicalString).digest('hex');
    const digitalSignature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(canonicalString)
      .digest('hex');

    const qrPayload = JSON.stringify({
      ...canonicalObject,
      h: qrCodeHash,
      sig: digitalSignature,
    });

    return { qrPayload, qrCodeHash, digitalSignature };
  }

  /**
   * Verifies the authenticity of a QR code payload or digital signature.
   */
  verifySignature(qrPayloadOrCanonical: string, expectedSignature: string): boolean {
    try {
      const parsed = JSON.parse(qrPayloadOrCanonical);
      const canonicalObject = {
        p: parsed.p,
        a: parsed.a,
        v: parsed.v,
        d: parsed.d,
        m: parsed.m,
        w: parsed.w,
        s: parsed.s,
        c: parsed.c,
        vf: parsed.vf,
        vu: parsed.vu,
      };
      const canonicalString = JSON.stringify(canonicalObject);
      const computedSignature = crypto
        .createHmac('sha256', this.signingSecret)
        .update(canonicalString)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(computedSignature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Generates a new Digital E-Pass with atomic quota deduction and cryptographic signature.
   */
  async createEPass(data: CreateEPassRequest, userId: string): Promise<EPassDto> {
    // 1. Validate Mining Authorization
    const auth = await this.authRepo.findById(data.authorizationId);
    if (!auth) {
      throw new AppError(`Mining authorization "${data.authorizationId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    if (auth.status !== MiningAuthorizationStatus.ACTIVE) {
      throw new AppError(
        `Mining authorization is not ACTIVE (current status: ${auth.status})`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const now = new Date();
    if (new Date(auth.validFrom) > now || new Date(auth.validUntil) < now) {
      throw new AppError(
        `Mining authorization permit is outside its validity period (${auth.validFrom.toISOString()} to ${auth.validUntil.toISOString()})`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 2. Validate Vehicle
    const vehicle = await this.vehicleRepo.findById(data.vehicleId);
    if (!vehicle) {
      throw new AppError(`Vehicle "${data.vehicleId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    if (vehicle.status !== VehicleStatus.ACTIVE) {
      throw new AppError(
        `Vehicle "${vehicle.registrationNumber}" is not ACTIVE (current status: ${vehicle.status})`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (data.netWeightTonnes > vehicle.permittedCarryingCapacity) {
      throw new AppError(
        `Net weight (${data.netWeightTonnes} tonnes) exceeds vehicle permitted carrying capacity (${vehicle.permittedCarryingCapacity} tonnes)`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 3. Validate Driver
    const driver = await this.driverRepo.findById(data.driverId);
    if (!driver) {
      throw new AppError(`Driver "${data.driverId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    if (driver.verificationStatus !== DriverVerificationStatus.VERIFIED) {
      throw new AppError(
        `Driver "${driver.name}" is not VERIFIED (current status: ${driver.verificationStatus})`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 4. Atomic Quota Deduction
    const updatedAuth = await this.authRepo.deductQuotaAtomic(auth._id, data.netWeightTonnes);
    if (!updatedAuth) {
      throw new AppError(
        `Insufficient remaining quota on authorization "${auth.permitNumber}" (requested: ${data.netWeightTonnes} tonnes, available: ${auth.remainingQuota} tonnes)`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    try {
      // 5. Build E-Pass metadata
      const passNumber = this.generatePassNumber();
      const validFrom = data.validFrom ? new Date(data.validFrom) : now;
      const defaultValidUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours validity
      const permitValidUntil = new Date(auth.validUntil);
      const validUntil = data.validUntil
        ? new Date(data.validUntil)
        : defaultValidUntil < permitValidUntil
          ? defaultValidUntil
          : permitValidUntil;

      const mineralType = data.mineralType || auth.mineralType;
      const sourceLocation = data.sourceLocation || auth.lesseeName || 'Authorized Mining Site';
      const destinationCheckpoint = data.destinationCheckpoint.trim();

      // 6. Generate cryptographic signature and QR payload
      const { qrPayload, qrCodeHash, digitalSignature } = this.generateSecurityTokens({
        passNumber,
        authorizationId: auth._id.toString(),
        vehicleId: vehicle._id.toString(),
        driverId: driver._id.toString(),
        mineralType,
        netWeightTonnes: data.netWeightTonnes,
        sourceLocation,
        destinationCheckpoint,
        validFrom: validFrom.toISOString(),
        validUntil: validUntil.toISOString(),
      });

      // 7. Store E-Pass
      const created = await this.ePassRepo.create({
        passNumber,
        authorizationId: auth._id,
        vehicleId: vehicle._id,
        driverId: driver._id,
        mineralType,
        netWeightTonnes: data.netWeightTonnes,
        sourceLocation,
        destinationCheckpoint,
        validFrom,
        validUntil,
        qrPayload,
        qrCodeHash,
        digitalSignature,
        status: EPassStatus.ACTIVE,
        dispatchTimestamp: now,
        createdBy: new Types.ObjectId(userId),
      });

      await created.populate([
        { path: 'authorizationId', select: 'permitNumber lesseeName mineralType' },
        { path: 'vehicleId', select: 'registrationNumber vehicleType permittedCarryingCapacity' },
        { path: 'driverId', select: 'name licenseNumber phone' },
        { path: 'createdBy', select: 'name email' },
      ]);

      return this.toDto(created);
    } catch (err) {
      // On failure, restore deducted quota immediately (Rollback protection)
      await this.authRepo.restoreQuotaAtomic(auth._id, data.netWeightTonnes);
      throw err;
    }
  }

  /**
   * Cancels an unused ACTIVE E-Pass and restores the deducted quota to the Mining Authorization.
   */
  async cancelEPass(id: string, reason: string = 'User requested cancellation'): Promise<EPassDto> {
    const epass = await this.ePassRepo.findById(id);
    if (!epass) {
      throw new AppError(`E-Pass "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    if (epass.status !== EPassStatus.ACTIVE) {
      throw new AppError(
        `Cannot cancel E-Pass in ${epass.status} status. Only ACTIVE unused passes can be cancelled.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Restore quota atomically
    await this.authRepo.restoreQuotaAtomic(epass.authorizationId._id || epass.authorizationId, epass.netWeightTonnes);

    // Transition state to CANCELLED
    const updated = await this.ePassRepo.updateStatus(epass._id, EPassStatus.CANCELLED, {
      cancellationReason: reason.trim(),
    });

    if (!updated) {
      throw new AppError('Failed to update E-Pass status to CANCELLED', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    return this.toDto(updated);
  }

  /**
   * Verifies an E-Pass for checkpoint inspection or audit.
   */
  async verifyEPass(passNumberOrId: string): Promise<EPassDto> {
    let epass = await this.ePassRepo.findByPassNumber(passNumberOrId);
    if (!epass && Types.ObjectId.isValid(passNumberOrId)) {
      epass = await this.ePassRepo.findById(passNumberOrId);
    }

    if (!epass) {
      throw new AppError(`E-Pass "${passNumberOrId}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    // Check expiry
    const now = new Date();
    if (epass.status === EPassStatus.ACTIVE && new Date(epass.validUntil) < now) {
      await this.ePassRepo.updateStatus(epass._id, EPassStatus.EXPIRED);
      epass.status = EPassStatus.EXPIRED;
    }

    if (epass.status === EPassStatus.USED) {
      throw new AppError('E-Pass is already USED and cannot be reused', HTTP_STATUS.BAD_REQUEST);
    }
    if (epass.status === EPassStatus.EXPIRED) {
      throw new AppError('E-Pass has EXPIRED and is invalid for transport', HTTP_STATUS.BAD_REQUEST);
    }
    if (epass.status === EPassStatus.CANCELLED) {
      throw new AppError('E-Pass has been CANCELLED and is invalid for transport', HTTP_STATUS.BAD_REQUEST);
    }
    if (epass.status === EPassStatus.REVOKED) {
      throw new AppError('E-Pass has been REVOKED and is invalid for transport', HTTP_STATUS.BAD_REQUEST);
    }

    // Verify cryptographic integrity
    const isAuthentic = this.verifySignature(epass.qrPayload, epass.digitalSignature);
    if (!isAuthentic) {
      throw new AppError('Cryptographic signature verification FAILED — tampered E-Pass', HTTP_STATUS.BAD_REQUEST);
    }

    return this.toDto(epass);
  }

  async getAllEPasses(filter: {
    status?: EPassStatus;
    authorizationId?: string;
    zoneId?: string;
    vehicleId?: string;
    driverId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<EPassDto[]> {
    let authorizationIds: any[] | undefined = undefined;
    if (filter.zoneId) {
      const auths = await this.authRepo.findAll({ zoneId: filter.zoneId });
      authorizationIds = auths.map((a) => a._id);
    }

    const list = await this.ePassRepo.findAll({
      status: filter.status,
      authorizationId: filter.authorizationId,
      authorizationIds,
      vehicleId: filter.vehicleId,
      driverId: filter.driverId,
      startDate: filter.startDate ? new Date(filter.startDate) : undefined,
      endDate: filter.endDate ? new Date(filter.endDate) : undefined,
    });

    return list.map((e) => this.toDto(e));
  }

  async getEPassById(id: string): Promise<EPassDto> {
    const epass = await this.ePassRepo.findById(id);
    if (!epass) {
      throw new AppError(`E-Pass "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }
    return this.toDto(epass);
  }

  async getSummaryStats(): Promise<EPassSummaryDto> {
    return await this.ePassRepo.getAggregateStats();
  }

  toDto(doc: IEPass | Record<string, unknown>): EPassDto {
    const d = doc as Record<string, unknown>;
    const auth = d.authorizationId as Record<string, unknown> | undefined;
    const veh = d.vehicleId as Record<string, unknown> | undefined;
    const drv = d.driverId as Record<string, unknown> | undefined;
    const crt = d.createdBy as Record<string, unknown> | undefined;

    return {
      id: (d._id as { toString(): string }).toString(),
      passNumber: d.passNumber as string,
      authorizationId: auth?._id ? (auth._id as { toString(): string }).toString() : (auth ? String(auth) : ''),
      permitNumber: auth?.permitNumber as string | undefined,
      lesseeName: auth?.lesseeName as string | undefined,
      vehicleId: veh?._id ? (veh._id as { toString(): string }).toString() : (veh ? String(veh) : ''),
      vehicleRegistrationNumber: veh?.registrationNumber as string | undefined,
      driverId: drv?._id ? (drv._id as { toString(): string }).toString() : (drv ? String(drv) : ''),
      driverName: drv?.name as string | undefined,
      driverLicenseNumber: drv?.licenseNumber as string | undefined,
      mineralType: d.mineralType as string,
      netWeightTonnes: d.netWeightTonnes as number,
      sourceLocation: (d.sourceLocation as string) || '',
      destinationCheckpoint: d.destinationCheckpoint as string,
      validFrom: d.validFrom instanceof Date ? d.validFrom.toISOString() : (d.validFrom as string),
      validUntil: d.validUntil instanceof Date ? d.validUntil.toISOString() : (d.validUntil as string),
      qrPayload: d.qrPayload as string,
      qrCodeHash: d.qrCodeHash as string,
      digitalSignature: d.digitalSignature as string,
      status: d.status as EPassStatus,
      dispatchTimestamp: d.dispatchTimestamp instanceof Date ? d.dispatchTimestamp.toISOString() : (d.dispatchTimestamp as string | undefined),
      usedTimestamp: d.usedTimestamp instanceof Date ? d.usedTimestamp.toISOString() : (d.usedTimestamp as string | undefined),
      cancellationReason: d.cancellationReason as string | undefined,
      createdBy: crt?._id ? (crt._id as { toString(): string }).toString() : (crt ? String(crt) : ''),
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : (d.createdAt as string),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : (d.updatedAt as string),
    };
  }
}

export const ePassService = new EPassService();
