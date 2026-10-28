import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  SensorType,
  SatelliteSource,
  SatelliteProcessingStatus,
  type ProcessedImageResultDto,
  type QualityMetrics,
  type OpticalMetrics,
  type SarMetrics,
} from '@tn-forest/shared/types';

export interface IProcessedImageResult extends Document {
  _id: Types.ObjectId;
  zoneId?: Types.ObjectId;
  temporaryAreaId?: string;
  satelliteMetadataId: Types.ObjectId;
  baselineId?: Types.ObjectId;
  sensorType: SensorType;
  source: SatelliteSource;
  acquisitionDate: Date;
  processingStatus: SatelliteProcessingStatus;
  qualityMetrics: QualityMetrics;
  opticalMetrics?: OpticalMetrics;
  sarMetrics?: SarMetrics;
  processingDurationMs: number;
  processedImageUrl?: string;
  fallbackTriggered?: boolean;
  fallbackReason?: string;
  createdAt: Date;
  updatedAt: Date;
  toDto(): ProcessedImageResultDto;
}

const qualityMetricsSchema = new Schema<QualityMetrics>(
  {
    cloudCover: { type: Number, required: true },
    validPixelPercentage: { type: Number, required: true },
    zoneCoveragePercentage: { type: Number, required: true },
    missingBands: [{ type: String }],
    polarizationAvailable: { type: String },
    acquisitionMode: { type: String },
    orbitDirection: { type: String },
    imageQuality: { type: Number, required: true },
  },
  { _id: false },
);

const opticalMetricsSchema = new Schema<OpticalMetrics>(
  {
    ndvi: { type: Number, required: true },
    ndwi: { type: Number, required: true },
    ndbi: { type: Number, required: true },
    bsi: { type: Number, required: true },
    savi: { type: Number, required: true },
    evi: { type: Number, required: true },
  },
  { _id: false },
);

const sarMetricsSchema = new Schema<SarMetrics>(
  {
    vv: { type: Number, required: true },
    vh: { type: Number, required: true },
    vvVhRatio: { type: Number, required: true },
    vvDifference: { type: Number },
    vhDifference: { type: Number },
    ratioDifference: { type: Number },
  },
  { _id: false },
);

const processedImageResultSchema = new Schema<IProcessedImageResult>(
  {
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Zone',
      index: true,
    },
    temporaryAreaId: {
      type: String,
      index: true,
    },
    satelliteMetadataId: {
      type: Schema.Types.ObjectId,
      ref: 'SatelliteMetadata',
      required: true,
      index: true,
    },
    baselineId: {
      type: Schema.Types.ObjectId,
      ref: 'Baseline',
      index: true,
    },
    sensorType: {
      type: String,
      enum: Object.values(SensorType),
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
    processingStatus: {
      type: String,
      enum: Object.values(SatelliteProcessingStatus),
      default: SatelliteProcessingStatus.PROCESSED,
      required: true,
    },
    qualityMetrics: {
      type: qualityMetricsSchema,
      required: true,
    },
    opticalMetrics: {
      type: opticalMetricsSchema,
    },
    sarMetrics: {
      type: sarMetricsSchema,
    },
    processingDurationMs: {
      type: Number,
      required: true,
    },
    processedImageUrl: {
      type: String,
    },
    fallbackTriggered: {
      type: Boolean,
      default: false,
    },
    fallbackReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

processedImageResultSchema.index({ zoneId: 1, sensorType: 1, acquisitionDate: -1 });

processedImageResultSchema.methods.toDto = function (): ProcessedImageResultDto {
  return {
    id: this._id.toString(),
    zoneId: this.zoneId?.toString(),
    temporaryAreaId: this.temporaryAreaId,
    satelliteMetadataId: this.satelliteMetadataId.toString(),
    baselineId: this.baselineId?.toString(),
    sensorType: this.sensorType,
    source: this.source,
    acquisitionDate: this.acquisitionDate.toISOString(),
    processingStatus: this.processingStatus,
    qualityMetrics: this.qualityMetrics,
    opticalMetrics: this.opticalMetrics,
    sarMetrics: this.sarMetrics,
    processingDurationMs: this.processingDurationMs,
    processedImageUrl: this.processedImageUrl,
    fallbackTriggered: this.fallbackTriggered,
    fallbackReason: this.fallbackReason,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const ProcessedImageResultModel = mongoose.model<IProcessedImageResult>(
  'ProcessedImageResult',
  processedImageResultSchema,
);
