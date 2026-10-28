import { Schema, model, type Document } from 'mongoose';
import {
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  PipelineErrorStage,
  type SatelliteMetadataDto,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';

export interface ISatelliteMetadata extends Document {
  imageId: string;
  source: SatelliteSource;
  sensorType: SensorType;
  acquisitionDate: Date;
  cloudCover: number;
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  processingStatus: SatelliteProcessingStatus;
  geeReference: string;
  intersectingZones: Schema.Types.ObjectId[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;

  // Real GEE pipeline tracking fields
  geeExportTaskId?: string;
  driveFileId?: string;
  driveFileName?: string;
  driveFileSizeBytes?: number;
  localRasterPath?: string;
  rasterValidated?: boolean;
  rasterWidth?: number;
  rasterHeight?: number;
  rasterBandCount?: number;
  originalCrs?: string;
  rasterCrs?: string;
  areaCalculationCrs?: string;
  pixelAreaM2?: number;
  resolutionMeters?: number;
  spectralIndicesCalculated?: boolean;
  pipelineCompletedAt?: Date;
  failureReason?: string;

  // Authentic SAR/Optical Satellite Telemetry
  platform?: string;
  mission?: string;
  instrument?: string;
  mode?: string;
  polarizations?: string[];
  orbitDirection?: string;
  absoluteOrbitNumber?: number;
  relativeOrbitNumber?: number;

  // Structured pipeline error tracking
  errorStage?: PipelineErrorStage;
  errorCode?: string;
  errorMessage?: string;
  errorCause?: string;
  failedAt?: Date;
  operationId?: string;
  retryCount?: number;

  toDto(): SatelliteMetadataDto;
}

const polygonSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Polygon', 'MultiPolygon'],
      required: true,
    },
    coordinates: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false },
);

const satelliteMetadataSchema = new Schema<ISatelliteMetadata>(
  {
    imageId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(SatelliteSource),
      required: true,
    },
    sensorType: {
      type: String,
      enum: Object.values(SensorType),
      default: function (this: ISatelliteMetadata) {
        return this.source === SatelliteSource.SENTINEL_1 ? SensorType.SAR : SensorType.OPTICAL;
      },
    },
    acquisitionDate: {
      type: Date,
      required: true,
      index: true,
    },
    cloudCover: {
      type: Number,
      required: true,
    },
    footprint: {
      type: polygonSchema,
      required: true,
    },
    processingStatus: {
      type: String,
      enum: Object.values(SatelliteProcessingStatus),
      default: SatelliteProcessingStatus.ACQUIRED,
      required: true,
      index: true,
    },
    geeReference: {
      type: String,
      required: true,
    },
    intersectingZones: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Zone',
        index: true,
      },
    ],
    metadata: {
      type: Schema.Types.Mixed,
    },
    // Real GEE pipeline tracking fields
    geeExportTaskId: { type: String },
    driveFileId: { type: String },
    driveFileName: { type: String },
    driveFileSizeBytes: { type: Number },
    localRasterPath: { type: String },
    rasterValidated: { type: Boolean },
    rasterWidth: { type: Number },
    rasterHeight: { type: Number },
    rasterBandCount: { type: Number },
    originalCrs: { type: String },
    rasterCrs: { type: String },
    areaCalculationCrs: { type: String },
    pixelAreaM2: { type: Number },
    resolutionMeters: { type: Number },
    spectralIndicesCalculated: { type: Boolean },
    pipelineCompletedAt: { type: Date },
    failureReason: { type: String },

    // Authentic SAR/Optical Satellite Telemetry
    platform: { type: String },
    mission: { type: String },
    instrument: { type: String },
    mode: { type: String },
    polarizations: [{ type: String }],
    orbitDirection: { type: String },
    absoluteOrbitNumber: { type: Number },
    relativeOrbitNumber: { type: Number },

    // Structured pipeline error tracking
    errorStage: { type: String, enum: Object.values(PipelineErrorStage) },
    errorCode: { type: String },
    errorMessage: { type: String },
    errorCause: { type: String },
    failedAt: { type: Date },
    operationId: { type: String },
    retryCount: { type: Number },
  },
  {
    timestamps: true,
  },
);

// Define 2dsphere index for footprint-based spatial queries and compound temporal indexes
satelliteMetadataSchema.index({ footprint: '2dsphere' });
satelliteMetadataSchema.index({ sensorType: 1, acquisitionDate: -1 });
satelliteMetadataSchema.index({ source: 1, acquisitionDate: -1 });
satelliteMetadataSchema.index({ intersectingZones: 1, acquisitionDate: -1 });

satelliteMetadataSchema.methods.toDto = function (): SatelliteMetadataDto {
  const derivedSensor =
    this.sensorType ||
    (this.source === SatelliteSource.SENTINEL_1 ? SensorType.SAR : SensorType.OPTICAL);
  return {
    id: this._id.toString(),
    imageId: this.imageId,
    source: this.source,
    sensorType: derivedSensor,
    acquisitionDate: this.acquisitionDate.toISOString(),
    cloudCover: this.cloudCover,
    footprint: this.footprint,
    processingStatus: this.processingStatus,
    geeReference: this.geeReference,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intersectingZones: this.intersectingZones.map((id: any) => {
      return id._id ? id._id.toString() : id.toString();
    }),
    metadata: this.metadata,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),

    // Real GEE raster export tracking fields
    geeExportTaskId: this.geeExportTaskId,
    driveFileId: this.driveFileId,
    driveFileName: this.driveFileName,
    driveFileSizeBytes: this.driveFileSizeBytes,
    localRasterPath: this.localRasterPath,
    rasterWidth: this.rasterWidth,
    rasterHeight: this.rasterHeight,
    rasterBandCount: this.rasterBandCount,
    originalCrs: this.originalCrs,
    rasterCrs: this.rasterCrs,
    areaCalculationCrs: this.areaCalculationCrs,
    pixelAreaM2: this.pixelAreaM2,
    resolutionMeters: this.resolutionMeters,
    spectralIndicesCalculated: this.spectralIndicesCalculated,
    pipelineCompletedAt: this.pipelineCompletedAt?.toISOString(),
    failureReason: this.failureReason,

    // Authentic SAR/Optical Satellite Telemetry
    platform: this.platform,
    mission: this.mission,
    instrument: this.instrument,
    mode: this.mode,
    polarizations: this.polarizations,
    orbitDirection: this.orbitDirection,
    absoluteOrbitNumber: this.absoluteOrbitNumber,
    relativeOrbitNumber: this.relativeOrbitNumber,

    // Structured pipeline error tracking
    errorStage: this.errorStage,
    errorCode: this.errorCode,
    errorMessage: this.errorMessage,
    errorCause: this.errorCause,
    failedAt: this.failedAt?.toISOString(),
    operationId: this.operationId,
    retryCount: this.retryCount,
  };
};

export const SatelliteMetadata = model<ISatelliteMetadata>(
  'SatelliteMetadata',
  satelliteMetadataSchema,
);
