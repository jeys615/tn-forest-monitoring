/**
 * HLSRepresentation — Mongoose Model
 *
 * Represents an HLS (Harmonized Landsat Sentinel) raster artifact derived
 * from ONE logical Baseline's source satellite observation.
 *
 * ARCHITECTURE:
 *   ONE LOGICAL BASELINE
 *         |
 *   ┌─────┴──────┐
 *   │            │
 *   Native       HLSRepresentation  ← this model
 *   (original    (harmonized raster,
 *   GeoTIFF)      same date, 30 m)
 *
 * INVARIANTS enforced by this model:
 *   1. Source lineage is immutable once the representation is READY.
 *   2. sourceSensorType must be OPTICAL — SAR is rejected at the pre-save hook.
 *   3. sourceAcquisitionDate must match the baseline's original acquisition date.
 *      (Validated by the service layer in Phase 5 when real data is acquired.)
 *   4. Unique compound index prevents duplicate READY representations for the
 *      same (baselineId, sourceObservationId, hlsProduct, hlsVersion,
 *      processingVersion) tuple.
 *
 * WHAT THIS MODEL IS NOT:
 *   - NOT a second logical Baseline.
 *   - NOT a NativeBaseline or HLSBaseline.
 *   - NOT a replacement for SatelliteMetadata.
 *   - NOT populated with fake/synthetic data.
 *
 * PHASE NOTES:
 *   Phase 3 — model/schema/repository only. No HLS data is acquired.
 *   Phase 5 — real GEE HLS acquisition will populate GEE/export/raster fields.
 */

import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  SensorType,
  SatelliteSource,
  HLSProduct,
  HLSVersion,
  HLSProcessingMode,
  HLSRepresentationStatus,
  HLSErrorStage,
  type HLSRepresentationDto,
} from '@tn-forest/shared/types';

// ─── TypeScript Interface ──────────────────────────────────────────────────────

export interface IHLSRepresentation extends Document {
  _id: Types.ObjectId;

  // ── Source Lineage (immutable after READY) ──────────────────────────────────

  /**
   * The ONE logical Baseline this HLS representation was derived from (if applicable).
   * References Baseline._id. Immutable once status reaches READY.
   */
  baselineId?: Types.ObjectId;

  /**
   * Whether this representation was derived for a candidate/current observation rather than a baseline.
   */
  isObservationOnly?: boolean;

  /**
   * References the SatelliteMetadata document for the candidate/current observation if applicable.
   */
  observationId?: Types.ObjectId;

  /**
   * The original GEE asset/image ID (= Baseline.imageId = SatelliteMetadata.imageId).
   * This is the SAME acquisition that the logical baseline or observation was built from.
   * The HLS representation must represent the same acquisition date.
   * Immutable once status reaches READY.
   */
  sourceObservationId: string;

  /**
   * References the SatelliteMetadata document for the original observation.
   * Provides access to footprint, cloudCover, geeReference.
   * Immutable once status reaches READY.
   */
  satelliteMetadataId: Types.ObjectId;

  /**
   * Source satellite platform (SENTINEL_2, LANDSAT_8, LANDSAT_9).
   * OPTICAL only — SAR (SENTINEL_1) and DEM (SRTM) are rejected.
   * Immutable once status reaches READY.
   */
  sourceSatelliteSource: SatelliteSource;

  /**
   * Sensor type of the source observation. Always OPTICAL for HLS.
   * SAR observations are rejected at the pre-save hook.
   * Immutable once status reaches READY.
   */
  sourceSensorType: SensorType;

  /** Alias for sourceSensorType for naming convention compatibility. */
  sourceSensor?: SensorType;

  /**
   * Platform identifier of the source satellite (e.g. 'Sentinel-2A', 'Landsat-8').
   * Immutable once status reaches READY.
   */
  sourcePlatform?: string;

  /**
   * Acquisition date of the ORIGINAL source observation.
   * Must match Baseline.acquisitionDate / SatelliteMetadata.acquisitionDate.
   * The HLS image must represent the SAME date — not a different one.
   * Immutable once status reaches READY.
   */
  sourceAcquisitionDate: Date;

  // ── HLS Product Identity ───────────────────────────────────────────────────

  /**
   * HLS product type: S30 (Sentinel-2 derived) or L30 (Landsat derived).
   * Immutable once status reaches READY.
   */
  hlsProduct: HLSProduct;

  /**
   * HLS collection version. Must be HLSVersion.V2_0 for approved production use.
   * Immutable once status reaches READY.
   */
  hlsVersion: HLSVersion;

  /**
   * Processing pipeline version string (e.g. '1.0.0').
   * Used to distinguish representations produced by different pipeline versions.
   * Immutable once status reaches READY.
   */
  processingVersion: string;

  /**
   * Operational mode: OFFICIAL_HLS (NASA upstream product) or LOCAL_HLS_COMPATIBLE (locally harmonized).
   */
  hlsMode?: HLSProcessingMode;

  /** Bandpass adjustment version used (e.g. HLS_V2.0_CLAVERIE_2018 or UPSTREAM). */
  bandpassVersion?: string;

  /** BRDF normalization model version used (e.g. HLS_V2.0_MODIS_CFACTOR or UPSTREAM). */
  brdfVersion?: string;

  /** SHA-256 hash of original un-harmonized source GeoTIFF file. */
  sourceRasterHash?: string;

  // ── Lifecycle Status ───────────────────────────────────────────────────────

  /**
   * Current lifecycle status of this HLS representation.
   * Lifecycle: NOT_CREATED → PROCESSING → READY | FAILED
   * Distinct from BaselineStatus — a baseline may be ACTIVE while its
   * HLS representation is still NOT_CREATED or PROCESSING.
   */
  status: HLSRepresentationStatus;

  // ── GEE / Export Lineage (populated during Phase 5) ───────────────────────

  /** GEE collection path (e.g. 'NASA/HLS/HLSS30/v002'). */
  geeCollectionId?: string;

  /** GEE image/asset ID for the specific HLS observation within the collection. */
  geeImageId?: string;

  /** GEE export operation/task ID. Follows same pattern as Baseline.geeExportTaskId. */
  geeExportTaskId?: string;

  /** Google Drive file ID for the downloaded HLS GeoTIFF. */
  driveFileId?: string;

  /** Google Drive filename for the HLS GeoTIFF. */
  driveFileName?: string;

  /** File size in bytes of the downloaded HLS GeoTIFF. */
  driveFileSizeBytes?: number;

  /** Local filesystem path to the stored HLS GeoTIFF. */
  localRasterPath?: string;

  // ── Raster / Grid Metadata (populated after raster validation) ────────────

  /**
   * Whether the HLS raster has been validated (correct band count, dimensions,
   * CRS, and QA quality). Follows Baseline.rasterValidated convention.
   */
  rasterValidated?: boolean;

  /** Band count in the validated HLS raster. */
  rasterBandCount?: number;

  /** Width of the HLS raster in pixels. */
  rasterWidth?: number;

  /** Height of the HLS raster in pixels. */
  rasterHeight?: number;

  /** CRS of the HLS raster after normalization (e.g. 'EPSG:32644'). */
  rasterCrs?: string;

  /** Native CRS as exported from GEE (before normalization). */
  originalCrs?: string;

  /** Ground resolution in metres. Always 30 m for HLS V2.0. */
  rasterResolutionMeters?: number;

  /** Area of one pixel in square metres (for area calculation). */
  pixelAreaM2?: number;

  /** Count of valid (non-masked, non-nodata) pixels. */
  validPixelCount?: number;

  /** SHA-256 hash of the GeoTIFF file (integrity verification). */
  fileHash?: string;

  /** Timestamp when HLS representation processing completed successfully. */
  completedAt?: Date;

  // ── Error Tracking ─────────────────────────────────────────────────────────

  /**
   * Stage at which HLS generation failed.
   * Follows the same pattern as Baseline.errorStage / SatelliteMetadata.errorStage.
   */
  errorStage?: HLSErrorStage;

  /** Short machine-readable error code. */
  errorCode?: string;

  /** Human-readable error message. */
  errorMessage?: string;

  /** Underlying exception message for diagnostics. */
  errorCause?: string;

  /** Timestamp when the failure was recorded. */
  failedAt?: Date;

  /** Human-readable explanation of the failure for logs and the DTO. */
  failureReason?: string;

  // ── Timestamps (from Mongoose) ─────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;

  // ── Methods ────────────────────────────────────────────────────────────────
  toDto(): HLSRepresentationDto;
}


// ─── Mongoose Schema ───────────────────────────────────────────────────────────

const hlsRepresentationSchema = new Schema<IHLSRepresentation>(
  {
    // Source lineage
    baselineId: {
      type: Schema.Types.ObjectId,
      ref: 'Baseline',
      required: function (this: any) {
        return !this.isObservationOnly;
      },
      index: true,
    },
    isObservationOnly: {
      type: Boolean,
      default: false,
      index: true,
    },
    observationId: {
      type: Schema.Types.ObjectId,
      ref: 'SatelliteMetadata',
      index: true,
    },
    sourceObservationId: {
      type: String,
      required: true,
      index: true,
    },
    satelliteMetadataId: {
      type: Schema.Types.ObjectId,
      ref: 'SatelliteMetadata',
      required: true,
      index: true,
    },
    sourceSatelliteSource: {
      type: String,
      enum: Object.values(SatelliteSource),
      required: true,
    },
    sourceSensorType: {
      type: String,
      enum: Object.values(SensorType),
      required: true,
    },
    sourcePlatform: {
      type: String,
    },
    sourceAcquisitionDate: {
      type: Date,
      required: true,
      index: true,
    },

    // HLS product identity
    hlsProduct: {
      type: String,
      enum: Object.values(HLSProduct),
      required: true,
    },
    hlsVersion: {
      type: String,
      enum: Object.values(HLSVersion),
      default: HLSVersion.V2_0,
      required: true,
    },
    processingVersion: {
      type: String,
      default: '1.0.0',
      required: true,
    },
    hlsMode: {
      type: String,
      enum: Object.values(HLSProcessingMode),
    },
    bandpassVersion:  { type: String },
    brdfVersion:      { type: String },
    sourceRasterHash: { type: String },

    // Lifecycle status
    status: {
      type: String,
      enum: Object.values(HLSRepresentationStatus),
      default: HLSRepresentationStatus.NOT_CREATED,
      required: true,
      index: true,
    },

    // GEE / export lineage
    geeCollectionId:    { type: String },
    geeImageId:         { type: String },
    geeExportTaskId:    { type: String },
    driveFileId:        { type: String },
    driveFileName:      { type: String },
    driveFileSizeBytes: { type: Number },
    localRasterPath:    { type: String },

    // Raster / grid metadata
    rasterValidated:       { type: Boolean },
    rasterBandCount:       { type: Number },
    rasterWidth:           { type: Number },
    rasterHeight:          { type: Number },
    rasterCrs:             { type: String },
    originalCrs:           { type: String },
    rasterResolutionMeters:{ type: Number },
    pixelAreaM2:           { type: Number },
    validPixelCount:       { type: Number },
    fileHash:              { type: String },
    completedAt:           { type: Date },

    // Error tracking
    errorStage:    { type: String, enum: Object.values(HLSErrorStage) },
    errorCode:     { type: String },
    errorMessage:  { type: String },
    errorCause:    { type: String },
    failedAt:      { type: Date },
    failureReason: { type: String },
  },
  {
    timestamps: true,
  },
);


// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * Composite lookup index: find the HLS representation for a given baseline
 * by product and version (most common query pattern).
 */
hlsRepresentationSchema.index({ baselineId: 1, hlsProduct: 1, hlsVersion: 1 });

/**
 * Uniqueness guard: prevents duplicate READY representations for the same
 * conceptual identity tuple.
 *
 * Identity = baselineId + sourceObservationId + hlsProduct + hlsVersion + processingVersion
 *
 * Uses a sparse unique index so that NOT_CREATED / PROCESSING / FAILED
 * records that may legitimately coexist are not blocked. Only one READY
 * record per identity is enforced at the application layer (Phase 5 service).
 *
 * NOTE: MongoDB does not support partial unique indexes on sparse conditions
 * natively across all versions without a partial filter expression. The
 * unique constraint here covers the full identity regardless of status.
 * The service layer must check for an existing READY record before creating
 * a new one. If a FAILED record exists, it should be updated in place rather
 * than creating a duplicate.
 */
hlsRepresentationSchema.index(
  {
    baselineId:         1,
    sourceObservationId: 1,
    hlsProduct:          1,
    hlsVersion:          1,
    processingVersion:   1,
  },
  { unique: true },
);

/**
 * Acquisition date index for temporal range queries.
 */
hlsRepresentationSchema.index({ sourceAcquisitionDate: -1 });


// ─── Virtuals ─────────────────────────────────────────────────────────────────

hlsRepresentationSchema.virtual('sourceSensor').get(function (this: IHLSRepresentation) {
  return this.sourceSensorType;
});


// ─── Lineage Validation Helpers ───────────────────────────────────────────────

/**
 * Validates whether two acquisition dates represent the same calendar observation date.
 * Formats both dates to ISO YYYY-MM-DD for authoritative day-level comparison,
 * and allows a 1-day tolerance for timezone / UTC date boundary shifts.
 */
export function isSameAcquisitionDate(
  date1: Date | string,
  date2: Date | string,
  toleranceDays: number = 1,
): boolean {
  const d1 = new Date(date1).toISOString().slice(0, 10);
  const d2 = new Date(date2).toISOString().slice(0, 10);
  if (d1 === d2) return true;
  const t1 = new Date(date1).getTime();
  const t2 = new Date(date2).getTime();
  if (isNaN(t1) || isNaN(t2)) return false;
  const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
  return diffDays <= toleranceDays;
}

/**
 * Throws a formatted AppError / Error if the HLS source acquisition date
 * does not match the baseline acquisition date.
 */
export function validateSameAcquisitionDate(
  baselineAcquisitionDate: Date | string,
  hlsSourceAcquisitionDate: Date | string,
): void {
  if (!isSameAcquisitionDate(baselineAcquisitionDate, hlsSourceAcquisitionDate)) {
    const d1 = new Date(baselineAcquisitionDate).toISOString().slice(0, 10);
    const d2 = new Date(hlsSourceAcquisitionDate).toISOString().slice(0, 10);
    throw new Error(
      `[HLSRepresentation] SAME-DATE VIOLATION: HLS source acquisition date (${d2}) ` +
      `does not match baseline acquisition date (${d1}). ` +
      `The HLS representation must represent the SAME original observation date as the baseline.`,
    );
  }
}


// ─── Post-Init Hook: Track Initial Lifecycle Status ───────────────────────────

hlsRepresentationSchema.post('init', function () {
  this.$locals = this.$locals || {};
  this.$locals.initialStatus = this.status;
});


// ─── Pre-Save Hook: Immutability + SAR Protection + Same-Date ────────────────

hlsRepresentationSchema.pre('save', async function () {
  // ── SAR Protection ──────────────────────────────────────────────────────────
  // HLS representations must be OPTICAL only. SAR and DEM are never HLS sources.
  if (this.sourceSensorType !== SensorType.OPTICAL) {
    throw new Error(
      `[HLSRepresentation] REJECTED: sourceSensorType is "${this.sourceSensorType}". ` +
      `HLS representations are OPTICAL track only. SAR must not be routed through HLS.`,
    );
  }

  const sarSources: string[] = [SatelliteSource.SENTINEL_1];
  if (sarSources.includes(this.sourceSatelliteSource)) {
    throw new Error(
      `[HLSRepresentation] REJECTED: sourceSatelliteSource is "${this.sourceSatelliteSource}". ` +
      `This satellite is a SAR sensor and cannot produce an HLS representation.`,
    );
  }

  // ── Same-Date Lineage Validation ──────────────────────────────────────────
  // If baselineId is present and this is NOT an observation-only representation,
  // verify the baseline's original acquisition date matches this representation's date.
  if (this.baselineId && !this.isObservationOnly && this.sourceAcquisitionDate) {
    try {
      const BaselineModelRef = mongoose.models.Baseline || mongoose.model('Baseline');
      if (BaselineModelRef) {
        const baseline = await BaselineModelRef.findById(this.baselineId)
          .select('acquisitionDate')
          .lean()
          .exec();
        if (baseline && (baseline as any).acquisitionDate) {
          validateSameAcquisitionDate(
            (baseline as any).acquisitionDate,
            this.sourceAcquisitionDate,
          );
        }
      }
    } catch (err: any) {
      if (err.message?.includes('SAME-DATE VIOLATION')) {
        throw err;
      }
    }
  } else if (this.isObservationOnly && this.satelliteMetadataId && this.sourceAcquisitionDate) {
    // For observation representations, verify against source SatelliteMetadata observation
    try {
      const SatMetaModelRef = mongoose.models.SatelliteMetadata || mongoose.model('SatelliteMetadata');
      if (SatMetaModelRef) {
        const smeta = await SatMetaModelRef.findById(this.satelliteMetadataId)
          .select('acquisitionDate')
          .lean()
          .exec();
        if (smeta && (smeta as any).acquisitionDate) {
          validateSameAcquisitionDate(
            (smeta as any).acquisitionDate,
            this.sourceAcquisitionDate,
          );
        }
      }
    } catch (err: any) {
      if (err.message?.includes('SAME-DATE VIOLATION')) {
        throw err;
      }
    }
  }

  // ── Lineage Immutability ────────────────────────────────────────────────────
  // Once a representation is READY, its source lineage and HLS identity
  // cannot be silently changed. This parallels the Baseline pre-save hook.
  const wasReady = this.$locals?.initialStatus === HLSRepresentationStatus.READY;
  const isReady = this.status === HLSRepresentationStatus.READY;

  if (!this.isNew && (wasReady || isReady)) {
    // Cannot downgrade status away from READY
    if (wasReady && this.isModified('status') && this.status !== HLSRepresentationStatus.READY) {
      throw new Error(
        `[HLSRepresentation] IMMUTABILITY VIOLATION: Cannot change status away from READY on a validated HLS representation.`,
      );
    }

    const immutableFields: Array<keyof IHLSRepresentation> = [
      'baselineId',
      'sourceObservationId',
      'satelliteMetadataId',
      'sourceSatelliteSource',
      'sourceSensorType',
      'sourcePlatform',
      'sourceAcquisitionDate',
      'hlsProduct',
      'hlsVersion',
      'processingVersion',
    ];
    for (const field of immutableFields) {
      if (this.isModified(field as string)) {
        throw new Error(
          `[HLSRepresentation] IMMUTABILITY VIOLATION: Cannot change field "${field}" ` +
          `on an HLS representation that is already READY. ` +
          `Source lineage and HLS identity are immutable once validated.`,
        );
      }
    }
  }
});


// ─── Pre-FindOneAndUpdate Hook: Immutability Guard ────────────────────────────

hlsRepresentationSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as Record<string, any>;
  const setFields = update?.$set ?? update ?? {};

  const immutableFields = [
    'baselineId',
    'sourceObservationId',
    'satelliteMetadataId',
    'sourceSatelliteSource',
    'sourceSensorType',
    'sourcePlatform',
    'sourceAcquisitionDate',
    'hlsProduct',
    'hlsVersion',
    'processingVersion',
  ];

  for (const field of immutableFields) {
    if (field in setFields) {
      return next(
        new Error(
          `[HLSRepresentation] IMMUTABILITY VIOLATION: Direct update of field "${field}" via findOneAndUpdate is blocked. Source lineage is immutable.`,
        ),
      );
    }
  }

  next();
});


// ─── toDto() ──────────────────────────────────────────────────────────────────

hlsRepresentationSchema.methods.toDto = function (): HLSRepresentationDto {
  return {
    id:                     this._id.toString(),
    baselineId:             this.baselineId ? this.baselineId.toString() : undefined,
    isObservationOnly:      Boolean(this.isObservationOnly),
    observationId:          this.observationId ? this.observationId.toString() : undefined,
    sourceObservationId:    this.sourceObservationId,
    satelliteMetadataId:    this.satelliteMetadataId ? this.satelliteMetadataId.toString() : '',
    sourceSatelliteSource:  this.sourceSatelliteSource,
    sourceSensorType:       this.sourceSensorType,
    sourcePlatform:         this.sourcePlatform,
    sourceAcquisitionDate:  this.sourceAcquisitionDate.toISOString(),
    hlsProduct:             this.hlsProduct,
    hlsVersion:             this.hlsVersion,
    status:                 this.status,
    processingVersion:      this.processingVersion,
    hlsMode:                this.hlsMode,
    bandpassVersion:        this.bandpassVersion,
    brdfVersion:            this.brdfVersion,
    sourceRasterHash:       this.sourceRasterHash,

    // GEE / export lineage
    geeCollectionId:    this.geeCollectionId,
    geeImageId:         this.geeImageId,
    geeExportTaskId:    this.geeExportTaskId,
    driveFileId:        this.driveFileId,
    driveFileName:      this.driveFileName,
    driveFileSizeBytes: this.driveFileSizeBytes,
    localRasterPath:    this.localRasterPath,

    // Raster / grid metadata
    rasterValidated:        this.rasterValidated,
    rasterBandCount:        this.rasterBandCount,
    rasterWidth:            this.rasterWidth,
    rasterHeight:           this.rasterHeight,
    rasterCrs:              this.rasterCrs,
    originalCrs:            this.originalCrs,
    rasterResolutionMeters: this.rasterResolutionMeters,
    pixelAreaM2:            this.pixelAreaM2,
    validPixelCount:        this.validPixelCount,
    fileHash:               this.fileHash,
    completedAt:            this.completedAt?.toISOString(),

    // Error tracking
    errorStage:    this.errorStage,
    errorCode:     this.errorCode,
    errorMessage:  this.errorMessage,
    errorCause:    this.errorCause,
    failedAt:      this.failedAt?.toISOString(),
    failureReason: this.failureReason,

    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};


// ─── Model Export ─────────────────────────────────────────────────────────────

export const HLSRepresentationModel = mongoose.model<IHLSRepresentation>(
  'HLSRepresentation',
  hlsRepresentationSchema,
);
