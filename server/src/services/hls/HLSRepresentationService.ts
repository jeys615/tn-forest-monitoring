/**
 * HLSRepresentationService — Persistence and Lazy Reuse for HLS Representations
 *
 * ARCHITECTURAL PRINCIPLE:
 *   ONE LOGICAL BASELINE
 *           |
 *     +-----+-----+
 *     |           |
 *   Native       HLS representation (lazily derived when cross-sensor requires it)
 *   (original)   (READY HLSRepresentation document linked via Baseline.hlsRepresentationId)
 *
 * INVARIANTS:
 *   1. HLS representation is derived lazily: only when a cross-sensor comparison requires HLS.
 *   2. Reuses existing READY representations idempotently: no duplicate GEE exports or documents.
 *   3. Baseline identity remains immutable: imageId, acquisitionDate, metadataId, sensorType untouched.
 *   4. Link safety: Baseline.hlsRepresentationId is populated ONLY after representation is READY.
 *   5. SAR baselines must NEVER receive an HLS representation.
 *   6. Strict same-date lineage: HLS source acquisition date must match the baseline observation date.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import {
  HLSRepresentationModel,
  type IHLSRepresentation,
  validateSameAcquisitionDate,
} from '../../models/HLSRepresentation.js';
import { HLSRepresentationRepository } from '../../repositories/HLSRepresentationRepository.js';
import { BaselineModel, type IBaseline } from '../../models/Baseline.js';
import { BaselineRepository } from '../../repositories/BaselineRepository.js';
import { Zone as ZoneModel } from '../../models/Zone.js';
import { SatelliteMetadata as SatelliteMetadataModel } from '../../models/SatelliteMetadata.js';
import {
  HLSAcquisitionService,
  resolveHLSProduct,
  type HLSAcquisitionResult,
  type HLSAcquisitionFailure,
} from './HLSAcquisitionService.js';
import {
  OpticalComparisonDecisionService,
  type ComparisonObservationInput,
} from '../spatial/OpticalComparisonDecisionService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';
import {
  HLSProduct,
  HLSVersion,
  HLSProcessingMode,
  HLSRepresentationStatus,
  HLSErrorStage,
  SensorType,
  SatelliteSource,
  MonitoringTrack,
  ComparisonMode,
  type HLSRepresentationDto,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';

export interface GetOrDeriveRepresentationInput {
  baselineId: string | Types.ObjectId;
  candidateObservation?: ComparisonObservationInput;
  requiredProduct?: HLSProduct;
  zoneGeometry?: GeoJSONPolygon;
  zoneCode?: string;
  processingVersion?: string;
  hlsVersion?: HLSVersion;
  forceReacquire?: boolean;
}

export interface GetOrDeriveRepresentationResult {
  representation: IHLSRepresentation;
  reused: boolean;
  newlyCreated: boolean;
  baselineLinked: boolean;
}

export interface GetOrDeriveObservationRepresentationInput {
  observationId: string | Types.ObjectId;
  zoneGeometry?: GeoJSONPolygon;
  zoneCode?: string;
  requiredProduct?: HLSProduct;
  processingVersion?: string;
  hlsVersion?: HLSVersion;
  forceReacquire?: boolean;
}

export interface GetOrDeriveObservationRepresentationResult {
  representation: IHLSRepresentation;
  reused: boolean;
  newlyCreated: boolean;
}

export class HLSRepresentationService {
  private hlsRepresentationRepo: HLSRepresentationRepository;
  private baselineRepo: BaselineRepository;
  private hlsAcquisitionService: HLSAcquisitionService;

  constructor(
    hlsRepresentationRepo: HLSRepresentationRepository = new HLSRepresentationRepository(),
    baselineRepo: BaselineRepository = new BaselineRepository(),
    hlsAcquisitionService: HLSAcquisitionService = new HLSAcquisitionService(),
  ) {
    this.hlsRepresentationRepo = hlsRepresentationRepo;
    this.baselineRepo = baselineRepo;
    this.hlsAcquisitionService = hlsAcquisitionService;
  }

  /**
   * Lazily derives or retrieves an existing READY HLS representation for a baseline.
   * Enforces idempotency: if a READY representation exists, it is returned without re-exporting.
   */
  public async getOrDeriveBaselineRepresentation(
    input: GetOrDeriveRepresentationInput,
  ): Promise<GetOrDeriveRepresentationResult> {
    const baselineIdStr = input.baselineId.toString();
    const processingVersion = input.processingVersion || '1.0.0';
    const hlsVersion = input.hlsVersion || HLSVersion.V2_0;

    // ── 1. Fetch and validate Baseline ──────────────────────────────────────
    const baseline = await this.baselineRepo.findById(baselineIdStr);
    if (!baseline) {
      throw new AppError(`Baseline ${baselineIdStr} not found`, HTTP_STATUS.NOT_FOUND);
    }

    // SAR Safety Gate
    if (
      baseline.sensorType === SensorType.SAR ||
      baseline.monitoringTrack === MonitoringTrack.SAR ||
      baseline.source === SatelliteSource.SENTINEL_1
    ) {
      throw new AppError(
        `[HLS] SAR baselines cannot have an HLS representation. HLS is optical-only.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (!baseline.imageId) {
      throw new AppError(
        `[HLS] Baseline ${baselineIdStr} missing canonical imageId. Cannot derive HLS representation.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // ── 2. Determine target HLS Product ─────────────────────────────────────
    const targetProduct = input.requiredProduct || resolveHLSProduct(baseline.source);

    // ── 3. Check Idempotency: Existing Linked Representation ────────────────
    if (!input.forceReacquire && baseline.hlsRepresentationId) {
      const existingLinked = await this.hlsRepresentationRepo.findById(
        baseline.hlsRepresentationId.toString(),
      );
      if (
        existingLinked &&
        existingLinked.status === HLSRepresentationStatus.READY &&
        existingLinked.hlsProduct === targetProduct &&
        existingLinked.hlsVersion === hlsVersion &&
        existingLinked.processingVersion === processingVersion
      ) {
        console.info(
          `[HLS_REPRESENTATION] Idempotent reuse: baseline ${baselineIdStr} already linked to READY representation ${existingLinked._id}.`,
        );
        return {
          representation: existingLinked,
          reused: true,
          newlyCreated: false,
          baselineLinked: true,
        };
      }
    }

    // ── 4. Check Idempotency: Existing Representation By Identity ───────────
    const existingByIdentity = await this.hlsRepresentationRepo.findByIdentity(
      baselineIdStr,
      baseline.imageId,
      targetProduct,
      hlsVersion,
      processingVersion,
    );

    if (!input.forceReacquire && existingByIdentity) {
      if (existingByIdentity.status === HLSRepresentationStatus.READY) {
        console.info(
          `[HLS_REPRESENTATION] Idempotent reuse: found existing READY representation ${existingByIdentity._id} by identity.`,
        );
        let linked = false;
        if (!baseline.hlsRepresentationId) {
          await this.linkBaselineHlsRepresentation(baselineIdStr, existingByIdentity._id);
          linked = true;
        } else {
          linked = baseline.hlsRepresentationId.toString() === existingByIdentity._id.toString();
        }

        return {
          representation: existingByIdentity,
          reused: true,
          newlyCreated: false,
          baselineLinked: linked,
        };
      }
    }

    // ── 5. Resolve geometry and zoneCode ────────────────────────────────────
    let geometry = input.zoneGeometry;
    let zoneCode = input.zoneCode;

    if (!geometry && baseline.satelliteMetadataId) {
      const smeta = await SatelliteMetadataModel.findById(baseline.satelliteMetadataId).lean();
      if (smeta && smeta.footprint) {
        geometry = smeta.footprint as GeoJSONPolygon;
      }
    }

    if (baseline.zoneId) {
      const zone = await ZoneModel.findById(baseline.zoneId).lean();
      if (zone) {
        if (!geometry && zone.boundary) {
          geometry = zone.boundary as GeoJSONPolygon;
        }
        if (!zoneCode) {
          zoneCode = zone.zoneId || (zone as any).code;
        }
      }
    }

    if (!geometry) {
      throw new AppError(
        `[HLS] No zone geometry available for baseline ${baselineIdStr}. Cannot acquire HLS imagery.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    zoneCode = zoneCode || `ZONE-${baseline.zoneId.toString()}`;

    // ── 6. Execute HLS Acquisition ───────────────────────────────────────────
    console.info(
      `[HLS_REPRESENTATION] Acquiring ${targetProduct} (${hlsVersion}) for baseline ${baselineIdStr} ` +
        `(date: ${baseline.acquisitionDate.toISOString().slice(0, 10)}, zone: ${zoneCode})...`,
    );

    const jobId = `HLS-REP-${baselineIdStr}-${Date.now()}`;
    const acquisitionOutcome = await this.hlsAcquisitionService.acquireHLS({
      zoneCode,
      jobId,
      sourceSatellite: baseline.source,
      sourceObservationDate: baseline.acquisitionDate,
      geometry,
      hlsVersion,
    });

    if (!acquisitionOutcome.success) {
      const failure = acquisitionOutcome as HLSAcquisitionFailure;
      console.error(
        `[HLS_REPRESENTATION] Acquisition failed for baseline ${baselineIdStr}: ` +
          `[${failure.errorStage}] ${failure.errorMessage}`,
      );

      // Persist failure status if an identity record already exists or create record to prevent repeated storms
      if (existingByIdentity) {
        await this.hlsRepresentationRepo.update(existingByIdentity._id.toString(), {
          status: HLSRepresentationStatus.FAILED,
          errorStage: failure.errorStage,
          errorMessage: failure.errorMessage,
          errorCause: failure.errorDetail,
          failureReason: failure.errorMessage,
          failedAt: new Date(),
        });
      } else {
        await this.hlsRepresentationRepo.create({
          baselineId: baseline._id,
          sourceObservationId: baseline.imageId!,
          satelliteMetadataId: baseline.satelliteMetadataId,
          sourceSatelliteSource: baseline.source,
          sourceSensorType: SensorType.OPTICAL,
          sourceSensor: SensorType.OPTICAL,
          sourceAcquisitionDate: baseline.acquisitionDate,
          hlsProduct: targetProduct,
          hlsVersion,
          processingVersion,
          status: HLSRepresentationStatus.FAILED,
          errorStage: failure.errorStage,
          errorMessage: failure.errorMessage,
          errorCause: failure.errorDetail,
          failureReason: failure.errorMessage,
          failedAt: new Date(),
        });
      }

      // DO NOT link baseline on failure
      const appErr = new AppError(
        `HLS acquisition failed: ${failure.errorMessage}`,
        HTTP_STATUS.BAD_REQUEST,
      );
      (appErr as any).errorStage = failure.errorStage;
      (appErr as any).errorDetail = failure.errorDetail;
      throw appErr;
    }

    // ── 7. Persist Successful Representation (Status = READY) ───────────────
    const result = acquisitionOutcome as HLSAcquisitionResult;

    // Verify same-date lineage
    validateSameAcquisitionDate(baseline.acquisitionDate, result.hlsAcquisitionDate);

    // Compute SHA-256 hash of the local raster file if present on disk
    let fileHash: string | undefined;
    if (result.localFilePath && fs.existsSync(result.localFilePath)) {
      try {
        const buf = fs.readFileSync(result.localFilePath);
        fileHash = crypto.createHash('sha256').update(buf).digest('hex');
      } catch (hashErr: any) {
        console.warn(`[HLS_REPRESENTATION] Could not calculate SHA-256 hash: ${hashErr.message}`);
      }
    }

    const repData: Partial<IHLSRepresentation> = {
      baselineId: baseline._id,
      sourceObservationId: baseline.imageId,
      satelliteMetadataId: baseline.satelliteMetadataId,
      sourceSatelliteSource: baseline.source,
      sourceSensorType: SensorType.OPTICAL,
      sourceSensor: SensorType.OPTICAL,
      sourcePlatform: result.sourcePlatform,
      sourceAcquisitionDate: baseline.acquisitionDate,
      hlsProduct: result.hlsProduct,
      hlsVersion: result.hlsVersion,
      processingVersion,
      status: HLSRepresentationStatus.READY,
      geeCollectionId: result.geeCollection,
      geeImageId: result.geeHlsImageId,
      geeExportTaskId: result.geeExportTaskId,
      driveFileId: result.driveFileId,
      driveFileName: result.driveFileName,
      driveFileSizeBytes: result.fileSizeBytes,
      localRasterPath: result.localFilePath,
      rasterValidated: true,
      rasterBandCount: result.bandCount,
      rasterWidth: result.rasterWidth,
      rasterHeight: result.rasterHeight,
      rasterCrs: result.rasterCrs,
      originalCrs: result.originalCrs || result.rasterCrs,
      rasterResolutionMeters: result.resolutionMeters,
      pixelAreaM2: result.pixelAreaM2 || 900,
      validPixelCount: result.validPixelCount,
      fileHash,
      hlsMode: HLSProcessingMode.OFFICIAL_HLS,
      bandpassVersion: 'UPSTREAM_PRE_ADJUSTED',
      brdfVersion: 'UPSTREAM_PRE_NORMALIZED',
      sourceRasterHash: fileHash,
      completedAt: result.completedAt,
      // Clear previous error tracking fields if any
      errorStage: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      errorCause: undefined,
      failedAt: undefined,
      failureReason: undefined,
    };

    let savedRep: IHLSRepresentation;

    if (existingByIdentity) {
      const updateData: Partial<IHLSRepresentation> = { ...repData };
      delete updateData.baselineId;
      delete updateData.sourceObservationId;
      delete updateData.satelliteMetadataId;
      delete updateData.sourceSatelliteSource;
      delete updateData.sourceSensorType;
      delete updateData.sourceSensor;
      delete updateData.sourcePlatform;
      delete updateData.sourceAcquisitionDate;
      delete updateData.hlsProduct;
      delete updateData.hlsVersion;
      delete updateData.processingVersion;

      const updated = await this.hlsRepresentationRepo.update(
        existingByIdentity._id.toString(),
        updateData,
      );
      savedRep = updated!;
    } else {
      try {
        savedRep = await this.hlsRepresentationRepo.create(repData);
      } catch (err: any) {
        // Handle concurrent duplicate-key race condition
        if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
          console.info(
            `[HLS_REPRESENTATION] Duplicate-key race detected for baseline ${baselineIdStr}. Fetching existing record.`,
          );
          const raced = await this.hlsRepresentationRepo.findByIdentity(
            baselineIdStr,
            baseline.imageId,
            targetProduct,
            hlsVersion,
            processingVersion,
          );
          if (raced) {
            savedRep = raced;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }

    console.info(
      `[HLS_REPRESENTATION] Persisted READY representation ${savedRep._id} for baseline ${baselineIdStr}.`,
    );

    // ── 8. Atomically Link Baseline to HLSRepresentation ─────────────────────
    await this.linkBaselineHlsRepresentation(baselineIdStr, savedRep._id);

    return {
      representation: savedRep,
      reused: false,
      newlyCreated: true,
      baselineLinked: true,
    };
  }

  /**
   * Safely links an existing READY HLSRepresentation to its logical Baseline.
   *
   * SAFETY GUARDS:
   *   1. Representation must exist and have status === READY.
   *   2. Baseline must not be SAR.
   *   3. Source acquisition dates must match.
   *   4. Baseline imageId and other identity fields remain immutable.
   *   5. Idempotent: if already linked to this representation, no-op.
   *   6. Immutable: if already linked to a different representation, rejects.
   */
  public async linkBaselineHlsRepresentation(
    baselineId: string | Types.ObjectId,
    representationId: string | Types.ObjectId,
  ): Promise<IBaseline> {
    const bId = baselineId.toString();
    const rId = representationId.toString();

    // 1. Fetch representation and assert READY status
    const rep = await this.hlsRepresentationRepo.findById(rId);
    if (!rep) {
      throw new AppError(`HLSRepresentation ${rId} not found`, HTTP_STATUS.NOT_FOUND);
    }
    if (rep.status !== HLSRepresentationStatus.READY) {
      throw new AppError(
        `Cannot link HLS representation ${rId} to baseline ${bId}: status is "${rep.status}". Only READY representations can be linked.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 2. Fetch baseline
    const baseline = await this.baselineRepo.findById(bId);
    if (!baseline) {
      throw new AppError(`Baseline ${bId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    // 3. SAR Safety Guard
    if (
      baseline.sensorType === SensorType.SAR ||
      baseline.monitoringTrack === MonitoringTrack.SAR ||
      baseline.source === SatelliteSource.SENTINEL_1
    ) {
      throw new AppError(
        `[HLS] Cannot link HLS representation to SAR baseline ${bId}. HLS is OPTICAL only.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 4. Same-Date Lineage Verification
    validateSameAcquisitionDate(baseline.acquisitionDate, rep.sourceAcquisitionDate);

    // 5. Idempotency Check: Already linked to this exact representation
    if (baseline.hlsRepresentationId && baseline.hlsRepresentationId.toString() === rId) {
      return baseline;
    }

    // 6. Immutability Check: Already linked to a different representation
    if (baseline.hlsRepresentationId && baseline.hlsRepresentationId.toString() !== rId) {
      throw new AppError(
        `[BASELINE] Baseline ${bId} is already linked to HLS representation ${baseline.hlsRepresentationId.toString()}. Refusing to overwrite.`,
        HTTP_STATUS.CONFLICT,
      );
    }

    // 7. Atomic Link Update
    const updated = await BaselineModel.findByIdAndUpdate(
      bId,
      { $set: { hlsRepresentationId: new Types.ObjectId(rId) } },
      { new: true, runValidators: true },
    ).exec();

    if (!updated) {
      throw new AppError(
        `Failed to link HLS representation ${rId} to baseline ${bId}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    console.info(`[HLS_REPRESENTATION] Successfully linked representation ${rId} to baseline ${bId}`);
    return updated;
  }

  /**
   * Helper that evaluates an optical comparison and derives the required baseline
   * HLS representation if cross-sensor comparison requires it.
   */
  public async prepareComparison(params: {
    baselineId: string | Types.ObjectId;
    candidate: ComparisonObservationInput;
    zoneGeometry?: GeoJSONPolygon;
    zoneCode?: string;
  }): Promise<{
    mode: ComparisonMode;
    requiresHLS: boolean;
    representation?: IHLSRepresentation;
  }> {
    const baseline = await this.baselineRepo.findById(params.baselineId.toString());
    if (!baseline) {
      throw new AppError(`Baseline ${params.baselineId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    const baselineObs: ComparisonObservationInput = {
      imageId: baseline.imageId!,
      source: baseline.source,
      sensorType: baseline.sensorType,
      monitoringTrack: baseline.monitoringTrack,
      acquisitionDate: baseline.acquisitionDate,
      zoneId: baseline.zoneId.toString(),
    };

    const decision = OpticalComparisonDecisionService.decideComparison(
      baselineObs,
      params.candidate,
    );

    if (decision.mode === ComparisonMode.NATIVE || !decision.requiresHLS) {
      return {
        mode: ComparisonMode.NATIVE,
        requiresHLS: false,
      };
    }

    // Cross-sensor comparison requires HLS
    const result = await this.getOrDeriveBaselineRepresentation({
      baselineId: baseline._id,
      candidateObservation: params.candidate,
      requiredProduct: decision.baselineHLSProduct,
      zoneGeometry: params.zoneGeometry,
      zoneCode: params.zoneCode,
    });

    return {
      mode: ComparisonMode.HLS,
      requiresHLS: true,
      representation: result.representation,
    };
  }

  /**
   * Derives or retrieves an existing READY HLS representation for a current / candidate observation.
   * Enforces idempotency: if a READY representation exists for the observation, it is returned without re-exporting.
   */
  public async getOrDeriveObservationRepresentation(
    input: GetOrDeriveObservationRepresentationInput,
  ): Promise<GetOrDeriveObservationRepresentationResult> {
    const obsIdStr = input.observationId.toString();
    const processingVersion = input.processingVersion || '1.0.0';
    const hlsVersion = input.hlsVersion || HLSVersion.V2_0;

    // 1. Fetch SatelliteMetadata
    let smeta = null;
    if (Types.ObjectId.isValid(obsIdStr)) {
      smeta = await SatelliteMetadataModel.findById(obsIdStr).exec();
    }
    if (!smeta) {
      smeta = await SatelliteMetadataModel.findOne({ imageId: obsIdStr }).exec();
    }
    if (!smeta) {
      throw new AppError(`SatelliteMetadata observation ${obsIdStr} not found`, HTTP_STATUS.NOT_FOUND);
    }

    // SAR Safety Gate
    if (
      smeta.sensorType === SensorType.SAR ||
      smeta.source === SatelliteSource.SENTINEL_1
    ) {
      throw new AppError(
        `[HLS] SAR observations cannot have an HLS representation. HLS is optical-only.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (!smeta.imageId) {
      throw new AppError(
        `[HLS] Observation ${obsIdStr} missing canonical imageId. Cannot derive HLS representation.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 2. Determine target HLS Product
    const targetProduct = input.requiredProduct || resolveHLSProduct(smeta.source);

    // 3. Check Idempotency: Existing READY representation for this observation
    if (!input.forceReacquire) {
      const existing = await this.hlsRepresentationRepo.findByObservationIdentity(
        smeta.imageId,
        targetProduct,
        hlsVersion,
        processingVersion,
      );
      if (existing && existing.status === HLSRepresentationStatus.READY) {
        console.info(
          `[HLS_REPRESENTATION] Idempotent reuse: observation ${smeta.imageId} already has READY representation ${existing._id}.`,
        );
        return {
          representation: existing,
          reused: true,
          newlyCreated: false,
        };
      }
    }

    // 4. Resolve geometry and zoneCode
    let geometry = input.zoneGeometry;
    let zoneCode = input.zoneCode;

    if (!geometry && smeta.footprint) {
      geometry = smeta.footprint as GeoJSONPolygon;
    }

    if (!geometry && smeta.intersectingZones && smeta.intersectingZones.length > 0) {
      const zId = smeta.intersectingZones[0];
      const zone = await ZoneModel.findById(zId).lean();
      if (zone) {
        if (!geometry && zone.boundary) {
          geometry = zone.boundary as GeoJSONPolygon;
        }
        if (!zoneCode) {
          zoneCode = zone.zoneId || (zone as any).code;
        }
      }
    }

    if (!geometry) {
      throw new AppError(
        `[HLS] No zone geometry available for observation ${obsIdStr}. Cannot acquire HLS imagery.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    zoneCode = zoneCode || (smeta.intersectingZones?.[0] ? `ZONE-${smeta.intersectingZones[0]}` : `OBS-${smeta._id.toString()}`);

    // 5. Execute HLS Acquisition
    console.info(
      `[HLS_REPRESENTATION] Acquiring ${targetProduct} (${hlsVersion}) for observation ${smeta.imageId} ` +
        `(date: ${smeta.acquisitionDate.toISOString().slice(0, 10)}, zone: ${zoneCode})...`,
    );

    const jobId = `HLS-OBS-${smeta._id.toString()}-${Date.now()}`;
    const acquisitionOutcome = await this.hlsAcquisitionService.acquireHLS({
      zoneCode,
      jobId,
      sourceSatellite: smeta.source,
      sourceObservationDate: smeta.acquisitionDate,
      geometry,
      hlsVersion,
    });

    if (!acquisitionOutcome.success) {
      const failure = acquisitionOutcome as HLSAcquisitionFailure;
      console.error(
        `[HLS_REPRESENTATION] Acquisition failed for observation ${smeta.imageId}: ` +
          `[${failure.errorStage}] ${failure.errorMessage}`,
      );

      const appErr = new AppError(
        `HLS acquisition failed: ${failure.errorMessage}`,
        HTTP_STATUS.BAD_REQUEST,
      );
      (appErr as any).errorStage = failure.errorStage;
      (appErr as any).errorDetail = failure.errorDetail;
      throw appErr;
    }

    // 6. Persist Successful Representation (Status = READY, isObservationOnly = true)
    const result = acquisitionOutcome as HLSAcquisitionResult;

    // Verify same-date lineage
    validateSameAcquisitionDate(smeta.acquisitionDate, result.hlsAcquisitionDate);

    // Compute SHA-256 hash of the local raster file if present on disk
    let fileHash: string | undefined;
    if (result.localFilePath && fs.existsSync(result.localFilePath)) {
      try {
        const buf = fs.readFileSync(result.localFilePath);
        fileHash = crypto.createHash('sha256').update(buf).digest('hex');
      } catch (hashErr: any) {
        console.warn(`[HLS_REPRESENTATION] Could not calculate SHA-256 hash: ${hashErr.message}`);
      }
    }

    const repData: Partial<IHLSRepresentation> = {
      isObservationOnly: true,
      observationId: smeta._id,
      satelliteMetadataId: smeta._id,
      sourceObservationId: smeta.imageId,
      sourceSatelliteSource: smeta.source,
      sourceSensorType: SensorType.OPTICAL,
      sourceSensor: SensorType.OPTICAL,
      sourcePlatform: result.sourcePlatform,
      sourceAcquisitionDate: smeta.acquisitionDate,
      hlsProduct: result.hlsProduct,
      hlsVersion: result.hlsVersion,
      processingVersion,
      status: HLSRepresentationStatus.READY,
      geeCollectionId: result.geeCollection,
      geeImageId: result.geeHlsImageId,
      geeExportTaskId: result.geeExportTaskId,
      driveFileId: result.driveFileId,
      driveFileName: result.driveFileName,
      driveFileSizeBytes: result.fileSizeBytes,
      localRasterPath: result.localFilePath,
      rasterValidated: true,
      rasterBandCount: result.bandCount,
      rasterWidth: result.rasterWidth,
      rasterHeight: result.rasterHeight,
      rasterCrs: result.rasterCrs,
      originalCrs: result.originalCrs || result.rasterCrs,
      rasterResolutionMeters: result.resolutionMeters,
      pixelAreaM2: result.pixelAreaM2 || 900,
      validPixelCount: result.validPixelCount,
      fileHash,
      hlsMode: HLSProcessingMode.OFFICIAL_HLS,
      bandpassVersion: 'UPSTREAM_PRE_ADJUSTED',
      brdfVersion: 'UPSTREAM_PRE_NORMALIZED',
      sourceRasterHash: fileHash,
      completedAt: result.completedAt,
    };

    let savedRep: IHLSRepresentation;
    try {
      savedRep = await this.hlsRepresentationRepo.create(repData);
    } catch (err: any) {
      if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
        console.info(
          `[HLS_REPRESENTATION] Duplicate-key race detected for observation ${smeta.imageId}. Fetching existing record.`,
        );
        const raced = await this.hlsRepresentationRepo.findByObservationIdentity(
          smeta.imageId,
          targetProduct,
          hlsVersion,
          processingVersion,
        );
        if (raced) {
          savedRep = raced;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    console.info(
      `[HLS_REPRESENTATION] Persisted READY observation representation ${savedRep._id} for ${smeta.imageId}.`,
    );

    return {
      representation: savedRep,
      reused: false,
      newlyCreated: true,
    };
  }
}
