import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  SensorType,
  SatelliteSource,
  BaselineStatus,
  MonitoringTrack,
  PipelineErrorStage,
  type BaselineDto,
} from '@tn-forest/shared/types';

export interface IBaseline extends Document {
  _id: Types.ObjectId;
  zoneId: Types.ObjectId;
  satelliteMetadataId: Types.ObjectId;
  imageId?: string;
  sensorType: SensorType;
  monitoringTrack: MonitoringTrack;
  source: SatelliteSource;
  acquisitionDate: Date;
  status: BaselineStatus;
  isActive: boolean;
  qualityScore: number;
  cloudCover: number | null;
  validPixelPercentage: number;
  selectionReason: string;
  processingSummary?: string;
  validFrom?: Date;
  validUntil?: Date;
  createdBy?: Types.ObjectId;

  /**
   * HLS (Harmonized Landsat Sentinel) representation reference.
   *
   * When populated, points to an HLSRepresentation document that holds the
   * HLS-normalised raster derived from this SAME logical baseline observation.
   * This does NOT create a second logical baseline — native and HLS are two
   * representations of the same original satellite observation.
   *
   * - Set only after HLS generation (Phase 2+). NULL/undefined for all current baselines.
   * - Immutable once set (enforced by pre-save/pre-update hook).
   * - OPTICAL track only. SAR baselines MUST NOT have this field populated.
   */
  hlsRepresentationId?: Types.ObjectId;

  // Real GEE pipeline tracking fields
  geeExportTaskId?: string;
  driveFileId?: string;
  driveFileName?: string;
  driveFileSizeBytes?: number;
  localRasterPath?: string;
  rasterValidated?: boolean;
  rasterWidth?: number;
  rasterHeight?: number;
  rasterCrs?: string;
  originalCrs?: string;
  areaCalculationCrs?: string;
  pixelAreaM2?: number;
  rasterBandCount?: number;
  spectralIndicesCalculated?: boolean;
  pipelineCompletedAt?: Date;
  failureReason?: string;

  // Structured pipeline error tracking
  errorStage?: PipelineErrorStage;
  errorCode?: string;
  errorMessage?: string;
  errorCause?: string;
  failedAt?: Date;
  operationId?: string;
  retryCount?: number;

  // Authentic SAR Orbit & Geometry fields
  platform?: string;
  mode?: string;
  polarizations?: string[];
  orbitDirection?: 'ASCENDING' | 'DESCENDING';
  absoluteOrbitNumber?: number;
  relativeOrbitNumber?: number;

  createdAt: Date;
  updatedAt: Date;
  toDto(): BaselineDto;
}

const baselineSchema = new Schema<IBaseline>(
  {
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Zone',
      required: true,
      index: true,
    },
    satelliteMetadataId: {
      type: Schema.Types.ObjectId,
      ref: 'SatelliteMetadata',
      required: true,
      index: true,
    },
    imageId: {
      type: String,
      index: true,
    },
    sensorType: {
      type: String,
      enum: Object.values(SensorType),
      required: true,
      index: true,
    },
    monitoringTrack: {
      type: String,
      enum: Object.values(MonitoringTrack),
      default: MonitoringTrack.OPTICAL,
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(SatelliteSource),
      required: true,
    },
    acquisitionDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(BaselineStatus),
      default: BaselineStatus.CANDIDATE,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: false,
      required: true,
      index: true,
    },
    qualityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    cloudCover: {
      type: Number,
      default: null,
    },
    validPixelPercentage: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    selectionReason: {
      type: String,
      required: true,
    },
    processingSummary: {
      type: String,
    },
    validFrom: {
      type: Date,
    },
    validUntil: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    /**
     * HLS representation reference (Phase 1 schema preparation — field only).
     * Points to a future HLSRepresentation document when HLS generation is implemented.
     * OPTICAL track only — SAR baselines must never populate this field.
     * Immutable once set.
     */
    hlsRepresentationId: {
      type: Schema.Types.ObjectId,
      ref: 'HLSRepresentation',
      // Optional — no default. Absent on all existing documents (safe additive change).
    },

    // Real GEE pipeline tracking fields
    geeExportTaskId: { type: String },
    driveFileId: { type: String },
    driveFileName: { type: String },
    driveFileSizeBytes: { type: Number },
    localRasterPath: { type: String },
    rasterValidated: { type: Boolean, default: false },
    rasterWidth: { type: Number },
    rasterHeight: { type: Number },
    rasterCrs: { type: String },
    originalCrs: { type: String },
    areaCalculationCrs: { type: String },
    pixelAreaM2: { type: Number },
    rasterBandCount: { type: Number },
    spectralIndicesCalculated: { type: Boolean, default: false },
    pipelineCompletedAt: { type: Date },
    failureReason: { type: String },

    // Structured pipeline error tracking
    errorStage: { type: String, enum: Object.values(PipelineErrorStage) },
    errorCode: { type: String },
    errorMessage: { type: String },
    errorCause: { type: String },
    failedAt: { type: Date },
    operationId: { type: String },
    retryCount: { type: Number },

    // Authentic SAR Orbit & Geometry fields
    platform: { type: String },
    mode: { type: String },
    polarizations: [{ type: String }],
    orbitDirection: { type: String, enum: ['ASCENDING', 'DESCENDING'] },
    absoluteOrbitNumber: { type: Number },
    relativeOrbitNumber: { type: Number },
  },
  {
    timestamps: true,
  },
);

// Enforce compound index for querying active baselines per zone and sensor family
baselineSchema.index({ zoneId: 1, sensorType: 1, isActive: 1 });
baselineSchema.index({ zoneId: 1, sensorType: 1, status: 1 });
baselineSchema.index({ zoneId: 1, acquisitionDate: -1 });

// ─── IMMUTABILITY HOOKS ──────────────────────────────────────────────────────
// Scientific identity fields are strictly immutable once persisted.
// Protected across save(), updateOne(), updateMany(), findOneAndUpdate(), findByIdAndUpdate().

export const IMMUTABLE_BASELINE_SCIENTIFIC_FIELDS = [
  'zoneId',
  'satelliteMetadataId',
  'imageId',
  'sensorType',
  'monitoringTrack',
  'source',
  'acquisitionDate',
  'qualityScore',
  'cloudCover',
  'validPixelPercentage',
  'platform',
  'mode',
  'polarizations',
  'orbitDirection',
  'absoluteOrbitNumber',
  'relativeOrbitNumber',
] as const;

baselineSchema.post('init', function () {
  this.$locals = this.$locals || {};
  this.$locals.initialHlsRepresentationId = this.hlsRepresentationId;
});

baselineSchema.pre('save', function (next) {
  if (!this.isNew) {
    for (const field of IMMUTABLE_BASELINE_SCIENTIFIC_FIELDS) {
      if (this.isModified(field)) {
        return next(
          new Error(
            `[BASELINE] Scientific identity field '${field}' is strictly immutable once persisted. Refusing mutation.`,
          ),
        );
      }
    }
  }

  // Protect hlsRepresentationId — once set, cannot be changed
  if (
    !this.isNew &&
    this.isModified('hlsRepresentationId') &&
    this.$locals?.initialHlsRepresentationId != null
  ) {
    return next(new Error('[BASELINE] hlsRepresentationId is immutable once set. Refusing to overwrite.'));
  }

  // SAR safety: hlsRepresentationId must never be set on SAR baselines
  if (
    this.hlsRepresentationId &&
    (this.sensorType === SensorType.SAR || this.monitoringTrack === MonitoringTrack.SAR)
  ) {
    return next(new Error('[BASELINE] hlsRepresentationId cannot be set on a SAR baseline. HLS is OPTICAL-only.'));
  }

  next();
});

const baselineQueryImmutabilityMiddleware = async function (this: any) {
  const update = this.getUpdate() as Record<string, any>;
  if (!update) return;

  const setFields = { ...(update.$set || {}), ...update };
  delete setFields.$set;
  delete setFields.$unset;
  delete setFields.$setOnInsert;

  for (const field of IMMUTABLE_BASELINE_SCIENTIFIC_FIELDS) {
    if (field in setFields && setFields[field] !== undefined) {
      throw new Error(
        `[BASELINE] Unauthorized mutation: scientific identity field '${field}' is strictly immutable.`,
      );
    }
  }

  // Protect hlsRepresentationId from being overwritten if already set or set on SAR
  if ('hlsRepresentationId' in setFields && setFields.hlsRepresentationId !== undefined) {
    const existing = await this.model.findOne(this.getQuery()).select('hlsRepresentationId sensorType monitoringTrack').lean();
    if (existing) {
      if ((existing as any).sensorType === SensorType.SAR || (existing as any).monitoringTrack === MonitoringTrack.SAR) {
        throw new Error('[BASELINE] hlsRepresentationId cannot be set on a SAR baseline. HLS is OPTICAL-only.');
      }
      if ((existing as any).hlsRepresentationId != null) {
        throw new Error('[BASELINE] hlsRepresentationId is immutable once set. Refusing to overwrite.');
      }
    }
  }
};

baselineSchema.pre('updateOne', baselineQueryImmutabilityMiddleware);
baselineSchema.pre('updateMany', baselineQueryImmutabilityMiddleware);
baselineSchema.pre('findOneAndUpdate', baselineQueryImmutabilityMiddleware);

baselineSchema.methods.toDto = function (): BaselineDto {
  return {
    id: this._id.toString(),
    zoneId: this.zoneId.toString(),
    satelliteMetadataId: this.satelliteMetadataId.toString(),
    imageId: this.imageId,
    sensorType: this.sensorType,
    monitoringTrack: this.monitoringTrack ?? MonitoringTrack.OPTICAL,
    source: this.source,
    acquisitionDate: this.acquisitionDate.toISOString(),
    status: this.status,
    isActive: this.isActive,
    qualityScore: this.qualityScore,
    cloudCover: this.cloudCover,
    validPixelPercentage: this.validPixelPercentage,
    selectionReason: this.selectionReason,
    processingSummary: this.processingSummary,
    validFrom: this.validFrom?.toISOString(),
    validUntil: this.validUntil?.toISOString(),
    createdBy: this.createdBy?.toString(),
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),

    // HLS representation reference (Phase 1 — field only; null for all current baselines)
    hlsRepresentationId: this.hlsRepresentationId?.toString(),

    // Pipeline tracking
    geeExportTaskId: this.geeExportTaskId,
    driveFileId: this.driveFileId,
    driveFileName: this.driveFileName,
    driveFileSizeBytes: this.driveFileSizeBytes,
    localRasterPath: this.localRasterPath,
    rasterValidated: this.rasterValidated,
    rasterWidth: this.rasterWidth,
    rasterHeight: this.rasterHeight,
    rasterCrs: this.rasterCrs,
    originalCrs: this.originalCrs,
    areaCalculationCrs: this.areaCalculationCrs,
    pixelAreaM2: this.pixelAreaM2,
    rasterBandCount: this.rasterBandCount,
    spectralIndicesCalculated: this.spectralIndicesCalculated,
    pipelineCompletedAt: this.pipelineCompletedAt?.toISOString(),
    failureReason: this.failureReason,

    // Structured pipeline error tracking
    errorStage: this.errorStage,
    errorCode: this.errorCode,
    errorMessage: this.errorMessage,
    errorCause: this.errorCause,
    failedAt: this.failedAt?.toISOString(),
    operationId: this.operationId,
    retryCount: this.retryCount,

    // Authentic SAR Orbit & Geometry fields
    platform: this.platform,
    mode: this.mode,
    polarizations: this.polarizations,
    orbitDirection: this.orbitDirection,
    absoluteOrbitNumber: this.absoluteOrbitNumber,
    relativeOrbitNumber: this.relativeOrbitNumber,
  };
};

export const BaselineModel = mongoose.model<IBaseline>('Baseline', baselineSchema);
