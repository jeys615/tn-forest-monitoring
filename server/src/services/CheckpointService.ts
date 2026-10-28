import crypto from 'node:crypto';
import { Types } from 'mongoose';

import {
  checkpointRepository,
  CheckpointRepository,
} from '../repositories/CheckpointRepository.js';
import {
  checkpointLogRepository,
  CheckpointLogRepository,
} from '../repositories/CheckpointLogRepository.js';
import {
  ePassRepository,
  EPassRepository,
} from '../repositories/EPassRepository.js';
import {
  miningAuthorizationRepository,
  MiningAuthorizationRepository,
} from '../repositories/MiningAuthorizationRepository.js';
import {
  vehicleRepository,
  VehicleRepository,
} from '../repositories/VehicleRepository.js';
import {
  driverRepository,
  DriverRepository,
} from '../repositories/DriverRepository.js';
import { ePassService } from './EPassService.js';
import { Zone } from '../models/Zone.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  CheckpointStatus,
  CheckpointVerificationResult,
  LocationVerificationStatus,
  EnforcementRejectionReason,
  EPassStatus,
  MiningAuthorizationStatus,
  VehicleStatus,
  DriverVerificationStatus,
  type CheckpointDto,
  type CreateCheckpointRequest,
  type UpdateCheckpointRequest,
  type VerifyEPassRequest,
  type VerifyEPassResponse,
  type RecordPassageRequest,
  type RecordPassageResponse,
  type CheckpointLogDto,
  type CheckpointSummaryDto,
  type BatchCheckpointSyncRequest,
  type BatchCheckpointSyncResponse,
  type BatchPassageResultDto,
} from '@tn-forest/shared/types';
import { type ICheckpoint } from '../models/Checkpoint.js';
import { type ICheckpointLog } from '../models/CheckpointLog.js';

export class CheckpointService {
  constructor(
    private readonly checkpointRepo: CheckpointRepository = checkpointRepository,
    private readonly logRepo: CheckpointLogRepository = checkpointLogRepository,
    private readonly epassRepo: EPassRepository = ePassRepository,
    private readonly authRepo: MiningAuthorizationRepository = miningAuthorizationRepository,
    private readonly vehicleRepo: VehicleRepository = vehicleRepository,
    private readonly driverRepo: DriverRepository = driverRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Checkpoint Registry Operations
  // ---------------------------------------------------------------------------

  async createCheckpoint(
    data: CreateCheckpointRequest,
    userId?: string,
  ): Promise<CheckpointDto> {
    const checkpointId = data.checkpointId
      ? data.checkpointId.toUpperCase().trim()
      : `CP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const existing = await this.checkpointRepo.findByCheckpointId(checkpointId);
    if (existing) {
      throw new AppError(
        `Checkpoint with ID "${checkpointId}" already exists`,
        HTTP_STATUS.CONFLICT,
      );
    }

    const created = await this.checkpointRepo.create({
      checkpointId,
      name: data.name.trim(),
      district: data.district.trim(),
      location: data.location,
      geofenceRadiusMeters: data.geofenceRadiusMeters ?? 500,
      status: data.status ?? CheckpointStatus.ACTIVE,
      authorizedUserIds: data.authorizedUserIds
        ? data.authorizedUserIds.map((id) => new Types.ObjectId(id))
        : [],
      operatingHours: data.operatingHours,
      metadata: data.metadata,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    return this.toCheckpointDto(created);
  }

  async getCheckpoints(filter: {
    status?: CheckpointStatus;
    district?: string;
  } = {}): Promise<CheckpointDto[]> {
    const list = await this.checkpointRepo.findAll(filter);
    return list.map((c) => this.toCheckpointDto(c));
  }

  async getCheckpointById(id: string): Promise<CheckpointDto> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.checkpointRepo.findById(id)
      : await this.checkpointRepo.findByCheckpointId(id);

    if (!doc) {
      throw new AppError(`Checkpoint "${id}" not found`, HTTP_STATUS.NOT_FOUND);
    }

    return this.toCheckpointDto(doc);
  }

  async updateCheckpoint(
    id: string,
    data: UpdateCheckpointRequest,
  ): Promise<CheckpointDto> {
    const doc = await this.getCheckpointById(id);

    const updateData: Partial<ICheckpoint> = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.district) updateData.district = data.district.trim();
    if (data.location) updateData.location = data.location;
    if (typeof data.geofenceRadiusMeters === 'number') {
      updateData.geofenceRadiusMeters = data.geofenceRadiusMeters;
    }
    if (data.status) updateData.status = data.status;
    if (data.authorizedUserIds) {
      updateData.authorizedUserIds = data.authorizedUserIds.map((uid) => new Types.ObjectId(uid));
    }
    if (data.operatingHours !== undefined) updateData.operatingHours = data.operatingHours;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const updated = await this.checkpointRepo.update(doc.id, updateData);
    if (!updated) {
      throw new AppError(`Failed to update checkpoint "${id}"`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    return this.toCheckpointDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Haversine Distance Geofence Calculation
  // ---------------------------------------------------------------------------

  public calculateDistanceMeters(
    coord1: [number, number], // [lng, lat]
    coord2: [number, number], // [lng, lat]
  ): number {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  // ---------------------------------------------------------------------------
  // E-Pass Multi-Step Verification Engine
  // ---------------------------------------------------------------------------

  async verifyEPass(
    req: VerifyEPassRequest,
    verifiedByUserId?: string,
    options?: { verificationTime?: Date },
  ): Promise<VerifyEPassResponse> {
    const rejectionReasons: EnforcementRejectionReason[] = [];
    let signatureVerified = false;
    let hashVerified = false;
    let locationStatus = LocationVerificationStatus.LOCATION_UNAVAILABLE;
    let distanceFromCheckpointMeters: number | undefined;

    // 1. Checkpoint Resolution
    const checkpoint = Types.ObjectId.isValid(req.checkpointId)
      ? await this.checkpointRepo.findById(req.checkpointId)
      : await this.checkpointRepo.findByCheckpointId(req.checkpointId);

    if (!checkpoint) {
      rejectionReasons.push(EnforcementRejectionReason.CHECKPOINT_NOT_FOUND);
    } else if (checkpoint.status !== CheckpointStatus.ACTIVE) {
      rejectionReasons.push(EnforcementRejectionReason.CHECKPOINT_INACTIVE);
    }

    // 2. Geolocation Geofence Calculation
    if (checkpoint && req.currentLocation && Array.isArray(req.currentLocation) && req.currentLocation.length === 2) {
      const cpCoords = checkpoint.location.coordinates as [number, number];
      distanceFromCheckpointMeters = this.calculateDistanceMeters(req.currentLocation, cpCoords);

      if (distanceFromCheckpointMeters <= checkpoint.geofenceRadiusMeters) {
        locationStatus = LocationVerificationStatus.VERIFIED_LOCATION;
      } else {
        locationStatus = LocationVerificationStatus.OUTSIDE_CHECKPOINT_GEOFENCE;
        rejectionReasons.push(EnforcementRejectionReason.OUTSIDE_CHECKPOINT_GEOFENCE);
      }
    } else {
      locationStatus = LocationVerificationStatus.LOCATION_UNAVAILABLE;
    }

    // 3. QR Payload / Pass Number Decoding
    let targetPassNumber = (req.passNumber || '').trim();
    let qrPayloadObj: Record<string, unknown> | null = null;

    if (req.qrPayload) {
      try {
        qrPayloadObj = JSON.parse(req.qrPayload);
        if (!qrPayloadObj || typeof qrPayloadObj !== 'object') {
          rejectionReasons.push(EnforcementRejectionReason.INVALID_PAYLOAD);
        } else {
          if (qrPayloadObj.p && typeof qrPayloadObj.p === 'string') {
            targetPassNumber = qrPayloadObj.p;
          }

          // Verify SHA-256 Hash
          const canonicalObject = {
            p: qrPayloadObj.p,
            a: qrPayloadObj.a,
            v: qrPayloadObj.v,
            d: qrPayloadObj.d,
            m: qrPayloadObj.m,
            w: qrPayloadObj.w,
            s: qrPayloadObj.s,
            c: qrPayloadObj.c,
            vf: qrPayloadObj.vf,
            vu: qrPayloadObj.vu,
          };
          const canonicalString = JSON.stringify(canonicalObject);
          const computedHash = crypto
            .createHash('sha256')
            .update(canonicalString)
            .digest('hex');

          if (qrPayloadObj.h === computedHash) {
            hashVerified = true;
          } else {
            hashVerified = false;
            rejectionReasons.push(EnforcementRejectionReason.INVALID_HASH);
          }

          // Verify HMAC-SHA256 Signature
          if (qrPayloadObj.sig && typeof qrPayloadObj.sig === 'string') {
            const isSigValid = ePassService.verifySignature(
              req.qrPayload,
              qrPayloadObj.sig,
            );
            if (isSigValid) {
              signatureVerified = true;
            } else {
              signatureVerified = false;
              rejectionReasons.push(EnforcementRejectionReason.INVALID_SIGNATURE);
            }
          } else {
            rejectionReasons.push(EnforcementRejectionReason.INVALID_SIGNATURE);
          }
        }
      } catch {
        rejectionReasons.push(EnforcementRejectionReason.INVALID_PAYLOAD);
      }
    }

    // 4. Database E-Pass Lookup
    if (!targetPassNumber) {
      rejectionReasons.push(EnforcementRejectionReason.EPASS_NOT_FOUND);
    }

    const epassDoc = targetPassNumber
      ? Types.ObjectId.isValid(targetPassNumber)
        ? await this.epassRepo.findById(targetPassNumber)
        : await this.epassRepo.findByPassNumber(targetPassNumber)
      : null;

    if (!epassDoc) {
      rejectionReasons.push(EnforcementRejectionReason.EPASS_NOT_FOUND);
    } else {
      const now = options?.verificationTime ?? new Date();

      // If verified via passNumber rather than raw QR string, verify stored signature & hash
      if (!req.qrPayload && epassDoc.qrPayload && epassDoc.digitalSignature) {
        signatureVerified = ePassService.verifySignature(
          epassDoc.qrPayload,
          epassDoc.digitalSignature,
        );
        hashVerified = Boolean(epassDoc.qrCodeHash);
      }

      // Check E-Pass Lifecycle Status
      if (epassDoc.status === EPassStatus.CANCELLED) {
        rejectionReasons.push(EnforcementRejectionReason.EPASS_CANCELLED);
      } else if (epassDoc.status === EPassStatus.REVOKED) {
        rejectionReasons.push(EnforcementRejectionReason.EPASS_REVOKED);
      } else if (epassDoc.status === EPassStatus.USED) {
        rejectionReasons.push(EnforcementRejectionReason.EPASS_ALREADY_USED);
      } else if (epassDoc.status === EPassStatus.EXPIRED) {
        rejectionReasons.push(EnforcementRejectionReason.EPASS_EXPIRED);
      }

      // Check Validity Dates
      if (now < new Date(epassDoc.validFrom)) {
        rejectionReasons.push(EnforcementRejectionReason.EPASS_NOT_YET_VALID);
      }
      if (now > new Date(epassDoc.validUntil)) {
        rejectionReasons.push(EnforcementRejectionReason.EPASS_EXPIRED);
      }

      // 5. Mining Authorization Verification
      const authRaw = epassDoc.authorizationId as Record<string, unknown> | Types.ObjectId | string;
      const authId = (authRaw && typeof authRaw === 'object' && '_id' in authRaw) ? (authRaw as Record<string, unknown>)._id : authRaw;
      const authDoc = await this.authRepo.findById(String(authId));
      if (!authDoc) {
        rejectionReasons.push(EnforcementRejectionReason.AUTHORIZATION_NOT_FOUND);
      } else {
        if (authDoc.status !== MiningAuthorizationStatus.ACTIVE) {
          rejectionReasons.push(EnforcementRejectionReason.AUTHORIZATION_SUSPENDED);
        }
        if (now < new Date(authDoc.validFrom) || now > new Date(authDoc.validUntil)) {
          rejectionReasons.push(EnforcementRejectionReason.AUTHORIZATION_EXPIRED);
        }
      }

      // 6. Vehicle Verification
      const vehicleRaw = epassDoc.vehicleId as Record<string, unknown> | Types.ObjectId | string;
      const vehicleId = (vehicleRaw && typeof vehicleRaw === 'object' && '_id' in vehicleRaw) ? (vehicleRaw as Record<string, unknown>)._id : vehicleRaw;
      const vehicleDoc = await this.vehicleRepo.findById(String(vehicleId));
      if (!vehicleDoc) {
        rejectionReasons.push(EnforcementRejectionReason.VEHICLE_NOT_FOUND);
      } else {
        if (vehicleDoc.status !== VehicleStatus.ACTIVE) {
          rejectionReasons.push(EnforcementRejectionReason.VEHICLE_NOT_PERMITTED);
        }
        if (epassDoc.netWeightTonnes > vehicleDoc.permittedCarryingCapacity) {
          rejectionReasons.push(EnforcementRejectionReason.VEHICLE_NOT_PERMITTED);
        }
      }

      // 7. Driver Verification
      const driverRaw = epassDoc.driverId as Record<string, unknown> | Types.ObjectId | string;
      const driverId = (driverRaw && typeof driverRaw === 'object' && '_id' in driverRaw) ? (driverRaw as Record<string, unknown>)._id : driverRaw;
      const driverDoc = await this.driverRepo.findById(String(driverId));
      if (!driverDoc) {
        rejectionReasons.push(EnforcementRejectionReason.DRIVER_NOT_FOUND);
      } else {
        if (driverDoc.verificationStatus === DriverVerificationStatus.PENDING) {
          rejectionReasons.push(EnforcementRejectionReason.DRIVER_NOT_VERIFIED);
        } else if (driverDoc.verificationStatus === DriverVerificationStatus.SUSPENDED) {
          rejectionReasons.push(EnforcementRejectionReason.DRIVER_SUSPENDED);
        } else if (driverDoc.verificationStatus === DriverVerificationStatus.REJECTED) {
          rejectionReasons.push(EnforcementRejectionReason.DRIVER_REJECTED);
        }
      }
    }

    // 8. Deduplicate Rejection Reasons
    const uniqueReasons = Array.from(new Set(rejectionReasons));
    const result = uniqueReasons.length === 0
      ? CheckpointVerificationResult.VALID
      : CheckpointVerificationResult.INVALID;

    const verificationTimestamp = (options?.verificationTime ?? new Date()).toISOString();

    // 9. Immutable CheckpointLog Creation
    const logId = `CPLOG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Helper to extract raw ID or populated subdoc ID as ObjectId
    const extractId = (field: unknown): Types.ObjectId | undefined => {
      if (!field) return undefined;
      let raw: unknown = field;
      if (typeof field === 'object' && '_id' in (field as Record<string, unknown>)) {
        raw = (field as Record<string, unknown>)._id;
      }
      if (raw instanceof Types.ObjectId) return raw;
      if (raw && Types.ObjectId.isValid(String(raw))) return new Types.ObjectId(String(raw));
      return undefined;
    };
    const extractStr = (field: unknown, key: string): string | undefined => {
      if (!field || typeof field !== 'object') return undefined;
      return (field as Record<string, unknown>)[key] as string | undefined;
    };

    const logDoc = await this.logRepo.create({
      logId,
      checkpointId: checkpoint ? checkpoint._id : new Types.ObjectId(),
      checkpointName: checkpoint ? checkpoint.name : 'Unknown Checkpoint',
      epassId: epassDoc ? epassDoc._id : undefined,
      passNumber: targetPassNumber || 'UNKNOWN',
      vehicleId: epassDoc ? extractId(epassDoc.vehicleId) : undefined,
      vehicleRegistrationNumber: extractStr(epassDoc?.vehicleId, 'registrationNumber'),
      driverId: epassDoc ? extractId(epassDoc.driverId) : undefined,
      driverName: extractStr(epassDoc?.driverId, 'name'),
      driverLicenseNumber: extractStr(epassDoc?.driverId, 'licenseNumber'),
      authorizationId: epassDoc ? extractId(epassDoc.authorizationId) : undefined,
      permitNumber: extractStr(epassDoc?.authorizationId, 'permitNumber'),
      mineralType: epassDoc?.mineralType,
      authorizedQuantityTonnes: epassDoc?.netWeightTonnes,
      declaredQuantityTonnes: req.declaredQuantityTonnes ?? epassDoc?.netWeightTonnes,
      verificationTimestamp: new Date(verificationTimestamp),
      verificationResult: result,
      rejectionReasons: uniqueReasons,
      signatureVerified,
      hashVerified,
      locationStatus,
      scannedCoordinates: req.currentLocation
        ? { type: 'Point', coordinates: req.currentLocation }
        : undefined,
      distanceFromCheckpointMeters,
      verifiedBy: verifiedByUserId && Types.ObjectId.isValid(verifiedByUserId)
        ? new Types.ObjectId(verifiedByUserId)
        : undefined,
      notes: req.notes,
    });

    return {
      result,
      rejectionReasons: uniqueReasons,
      epass: epassDoc ? ePassService.toDto(epassDoc) : undefined,
      checkpoint: checkpoint ? this.toCheckpointDto(checkpoint) : undefined,
      signatureVerified,
      hashVerified,
      locationStatus,
      distanceFromCheckpointMeters,
      verificationTimestamp,
      logId: logDoc.logId,
    };
  }

  // ---------------------------------------------------------------------------
  // Transit Passage Recording & E-Pass Usage
  // ---------------------------------------------------------------------------

  async recordPassage(
    req: RecordPassageRequest,
    verifiedByUserId?: string,
  ): Promise<RecordPassageResponse> {
    const verifyResult = await this.verifyEPass(
      {
        checkpointId: req.checkpointId,
        passNumber: req.passNumberOrId,
        currentLocation: req.currentLocation,
        declaredQuantityTonnes: req.declaredQuantityTonnes,
        notes: req.notes,
      },
      verifiedByUserId,
    );

    if (verifyResult.result === CheckpointVerificationResult.INVALID) {
      throw new AppError(
        `Passage rejected: ${verifyResult.rejectionReasons.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (!verifyResult.epass) {
      throw new AppError('E-Pass data unavailable for passage recording', HTTP_STATUS.BAD_REQUEST);
    }

    // Atomic update of E-Pass state to USED
    const updatedEPass = await this.epassRepo.updateStatus(
      verifyResult.epass.id,
      EPassStatus.USED,
      { usedTimestamp: new Date() },
    );

    if (!updatedEPass) {
      throw new AppError('Failed to update E-Pass usage status', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const logList = await this.logRepo.findAll({
      passNumber: verifyResult.epass.passNumber,
      limit: 1,
    });

    return {
      success: true,
      message: `Passage confirmed for E-Pass ${verifyResult.epass.passNumber} at ${verifyResult.checkpoint?.name}`,
      epass: ePassService.toDto(updatedEPass),
      log: logList.length > 0 ? this.toCheckpointLogDto(logList[0]) : ({} as CheckpointLogDto),
    };
  }

  // ---------------------------------------------------------------------------
  // Batch Offline Checkpoint Synchronization
  // ---------------------------------------------------------------------------

  async syncBatchPassages(
    req: BatchCheckpointSyncRequest,
    officerId?: string,
  ): Promise<BatchCheckpointSyncResponse> {
    const checkpoint = Types.ObjectId.isValid(req.checkpointId)
      ? await this.checkpointRepo.findById(req.checkpointId)
      : await this.checkpointRepo.findByCheckpointId(req.checkpointId);

    if (!checkpoint) {
      throw new AppError(
        `Checkpoint with ID "${req.checkpointId}" not found`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    if (checkpoint.status !== CheckpointStatus.ACTIVE) {
      throw new AppError(
        `Checkpoint "${checkpoint.name}" is not ACTIVE`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const syncBatchId =
      req.syncBatchId ||
      `BATCH-SYNC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    let acceptedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let failedCount = 0;

    const results: BatchPassageResultDto[] = [];

    for (const passage of req.passages) {
      const passNumber = (passage.passNumberOrId || '').trim().toUpperCase();
      const passageTime = new Date(passage.passageTimestamp);

      try {
        // 1. Duplicate & Idempotency Detection
        const existingLogs = await this.logRepo.findAll({
          checkpointId: checkpoint._id.toString(),
          passNumber,
          limit: 10,
        });

        const isDuplicate = existingLogs.some((l) => {
          if (passage.clientLogId && l.notes && l.notes.includes(passage.clientLogId)) {
            return true;
          }
          if (passage.syncNonce && l.notes && l.notes.includes(passage.syncNonce)) {
            return true;
          }
          // Same checkpoint, same passNumber, within 30 seconds
          const diffMs = Math.abs(l.verificationTimestamp.getTime() - passageTime.getTime());
          return diffMs <= 30000;
        });

        if (isDuplicate) {
          const matchedLog = existingLogs[0];
          duplicateCount++;
          results.push({
            clientLogId: passage.clientLogId,
            passNumber,
            status: 'DUPLICATE',
            message: 'Passage already synchronized and recorded',
            logId: matchedLog.logId,
            verificationResult: matchedLog.verificationResult,
          });
          continue;
        }

        // Check if E-Pass is already USED and was logged at this checkpoint
        const epassDoc = await this.epassRepo.findByPassNumber(passNumber);
        if (epassDoc && epassDoc.status === EPassStatus.USED && existingLogs.length > 0) {
          duplicateCount++;
          results.push({
            clientLogId: passage.clientLogId,
            passNumber,
            status: 'DUPLICATE',
            message: 'E-Pass already used and logged at this checkpoint',
            logId: existingLogs[0].logId,
            verificationResult: existingLogs[0].verificationResult,
          });
          continue;
        }

        // 2. Perform Verification
        const noteWithClientLog = [
          passage.notes,
          passage.clientLogId ? `[ClientLogId: ${passage.clientLogId}]` : undefined,
          passage.syncNonce ? `[SyncNonce: ${passage.syncNonce}]` : undefined,
          `[BatchId: ${syncBatchId}]`,
        ]
          .filter(Boolean)
          .join(' ');

        const verifyResult = await this.verifyEPass(
          {
            checkpointId: req.checkpointId,
            passNumber,
            currentLocation: passage.currentLocation,
            declaredQuantityTonnes: passage.declaredQuantityTonnes,
            notes: noteWithClientLog,
          },
          officerId,
          { verificationTime: passageTime },
        );

        if (verifyResult.result === CheckpointVerificationResult.INVALID) {
          rejectedCount++;
          results.push({
            clientLogId: passage.clientLogId,
            passNumber,
            status: 'REJECTED',
            message: `Passage rejected: ${verifyResult.rejectionReasons.join(', ')}`,
            logId: verifyResult.logId,
            verificationResult: CheckpointVerificationResult.INVALID,
            rejectionReasons: verifyResult.rejectionReasons,
          });
          continue;
        }

        // 3. Valid Passage: Atomically update E-Pass to USED
        if (verifyResult.epass) {
          await this.epassRepo.updateStatus(verifyResult.epass.id, EPassStatus.USED, {
            usedTimestamp: passageTime,
          });
        }

        acceptedCount++;
        results.push({
          clientLogId: passage.clientLogId,
          passNumber,
          status: 'ACCEPTED',
          message: 'Passage verified and synchronized successfully',
          logId: verifyResult.logId,
          verificationResult: CheckpointVerificationResult.VALID,
        });
      } catch (err: unknown) {
        failedCount++;
        const msg = err instanceof Error ? err.message : 'Unknown synchronization error';
        results.push({
          clientLogId: passage.clientLogId,
          passNumber,
          status: 'FAILED',
          message: msg,
        });
      }
    }

    return {
      syncBatchId,
      checkpointId: checkpoint.checkpointId,
      checkpointName: checkpoint.name,
      totalSubmitted: req.passages.length,
      acceptedCount,
      duplicateCount,
      rejectedCount,
      failedCount,
      syncedAt: new Date().toISOString(),
      results,
    };
  }

  // ---------------------------------------------------------------------------
  // Log & Summary Queries
  // ---------------------------------------------------------------------------

  async getLogs(filter: {
    checkpointId?: string;
    zoneId?: string;
    passNumber?: string;
    verificationResult?: CheckpointVerificationResult;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    longitude?: number;
    latitude?: number;
    maxDistanceMeters?: number;
  } = {}): Promise<CheckpointLogDto[]> {
    let lng = filter.longitude;
    let lat = filter.latitude;
    let maxDist = filter.maxDistanceMeters;

    if (filter.zoneId && (lng === undefined || lat === undefined)) {
      const zoneDoc = Types.ObjectId.isValid(filter.zoneId)
        ? await Zone.findById(filter.zoneId)
        : await Zone.findOne({ zoneId: filter.zoneId });
      if (zoneDoc?.centerPoint?.coordinates && zoneDoc.centerPoint.coordinates.length >= 2) {
        lng = zoneDoc.centerPoint.coordinates[0];
        lat = zoneDoc.centerPoint.coordinates[1];
        maxDist = maxDist ?? 100000;
      }
    }

    const list = await this.logRepo.findAll({
      ...filter,
      longitude: lng,
      latitude: lat,
      maxDistanceMeters: maxDist,
    });
    return list.map((l) => this.toCheckpointLogDto(l));
  }

  async getPassVerificationHistory(passNumber: string): Promise<CheckpointLogDto[]> {
    const list = await this.logRepo.findByPassNumber(passNumber);
    return list.map((l) => this.toCheckpointLogDto(l));
  }

  async getSummaryStats(): Promise<CheckpointSummaryDto> {
    return await this.logRepo.getSummaryStats();
  }

  // ---------------------------------------------------------------------------
  // DTO Mappers
  // ---------------------------------------------------------------------------

  public toCheckpointDto(doc: ICheckpoint | Record<string, unknown>): CheckpointDto {
    const d = doc as Record<string, unknown>;
    const authUsers = Array.isArray(d.authorizedUserIds)
      ? d.authorizedUserIds.map((u: unknown) => {
          if (u && typeof u === 'object' && '_id' in (u as Record<string, unknown>)) {
            return (u as Record<string, unknown>)._id?.toString() ?? String(u);
          }
          return String(u);
        })
      : [];

    return {
      id: (d._id as { toString(): string }).toString(),
      checkpointId: d.checkpointId as string,
      name: d.name as string,
      district: d.district as string,
      location: d.location as { type: 'Point'; coordinates: [number, number] },
      geofenceRadiusMeters: d.geofenceRadiusMeters as number,
      status: d.status as CheckpointStatus,
      authorizedUserIds: authUsers,
      operatingHours: d.operatingHours as string | undefined,
      metadata: d.metadata as Record<string, unknown> | undefined,
      createdBy: d.createdBy ? String(d.createdBy) : undefined,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : (d.createdAt as string),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : (d.updatedAt as string),
    };
  }

  public toCheckpointLogDto(doc: ICheckpointLog | Record<string, unknown>): CheckpointLogDto {
    const d = doc as Record<string, unknown>;
    const cp = d.checkpointId as Record<string, unknown> | undefined;
    const usr = d.verifiedBy as Record<string, unknown> | undefined;

    return {
      id: (d._id as { toString(): string }).toString(),
      logId: d.logId as string,
      checkpointId: cp?._id ? (cp._id as { toString(): string }).toString() : String(d.checkpointId || ''),
      checkpointName: (d.checkpointName as string) || (cp?.name as string) || 'Unknown Checkpoint',
      epassId: d.epassId ? String(d.epassId) : undefined,
      passNumber: d.passNumber as string,
      vehicleId: d.vehicleId ? String(d.vehicleId) : undefined,
      vehicleRegistrationNumber: d.vehicleRegistrationNumber as string | undefined,
      driverId: d.driverId ? String(d.driverId) : undefined,
      driverName: d.driverName as string | undefined,
      driverLicenseNumber: d.driverLicenseNumber as string | undefined,
      authorizationId: d.authorizationId ? String(d.authorizationId) : undefined,
      permitNumber: d.permitNumber as string | undefined,
      mineralType: d.mineralType as string | undefined,
      authorizedQuantityTonnes: d.authorizedQuantityTonnes as number | undefined,
      declaredQuantityTonnes: d.declaredQuantityTonnes as number | undefined,
      verificationTimestamp:
        d.verificationTimestamp instanceof Date
          ? d.verificationTimestamp.toISOString()
          : (d.verificationTimestamp as string),
      verificationResult: d.verificationResult as CheckpointVerificationResult,
      rejectionReasons: (d.rejectionReasons as string[]) || [],
      signatureVerified: Boolean(d.signatureVerified),
      hashVerified: Boolean(d.hashVerified),
      locationStatus: d.locationStatus as LocationVerificationStatus,
      scannedCoordinates: d.scannedCoordinates as { type: 'Point'; coordinates: [number, number] } | undefined,
      distanceFromCheckpointMeters: d.distanceFromCheckpointMeters as number | undefined,
      verifiedBy: usr?._id ? (usr._id as { toString(): string }).toString() : (d.verifiedBy ? String(d.verifiedBy) : undefined),
      verifiedByName: usr?.name as string | undefined,
      notes: d.notes as string | undefined,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : (d.createdAt as string),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : (d.updatedAt as string),
    };
  }
}

export const checkpointService = new CheckpointService();
