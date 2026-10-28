import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  IncrementalLifecycleState,
  type AreaMonitoringType,
  SensorType,
  SatelliteSource,
  AlertSeverity,
  type IncrementalMonitoringRecordDto,
} from '@tn-forest/shared/types';

export interface IIncrementalMonitoringRecord extends Document {
  _id: Types.ObjectId;
  jobId: string;
  areaId: string;
  areaType: AreaMonitoringType;
  areaName: string;
  targetObservationId?: string;
  satelliteMetadataId?: Types.ObjectId;
  sensorType: SensorType;
  source: SatelliteSource;
  lifecycleState: IncrementalLifecycleState;
  acquisitionDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  isPermanentFailure?: boolean;
  results?: {
    processedImageResultId?: Types.ObjectId;
    changeDetectionId?: Types.ObjectId;
    alertId?: Types.ObjectId;
    affectedAreaPercentage?: number;
    severity?: AlertSeverity | 'NONE';
    cloudCover?: number;
    fallbackTriggered?: boolean;
  };
  logs: string[];
  createdAt: Date;
  updatedAt: Date;
  toDto(): IncrementalMonitoringRecordDto;
}

const incrementalMonitoringRecordSchema = new Schema<IIncrementalMonitoringRecord>(
  {
    jobId: { type: String, required: true, unique: true },
    areaId: { type: String, required: true, index: true },
    areaType: { type: String, enum: ['PERMANENT', 'TEMPORARY'], required: true, index: true },
    areaName: { type: String, required: true },
    targetObservationId: { type: String, index: true },
    satelliteMetadataId: { type: Schema.Types.ObjectId, ref: 'SatelliteMetadata' },
    sensorType: { type: String, enum: Object.values(SensorType), required: true },
    source: { type: String, enum: Object.values(SatelliteSource), required: true },
    lifecycleState: {
      type: String,
      enum: Object.values(IncrementalLifecycleState),
      default: IncrementalLifecycleState.DISCOVERED,
      required: true,
      index: true,
    },
    acquisitionDate: { type: Date, index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    durationMs: { type: Number },
    errorCode: { type: String },
    errorMessage: { type: String },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    nextRetryAt: { type: Date, index: true },
    isPermanentFailure: { type: Boolean, default: false },
    results: {
      processedImageResultId: { type: Schema.Types.ObjectId, ref: 'ProcessedImageResult' },
      changeDetectionId: { type: Schema.Types.ObjectId, ref: 'ChangeDetection' },
      alertId: { type: Schema.Types.ObjectId, ref: 'Alert' },
      affectedAreaPercentage: { type: Number },
      severity: { type: String },
      cloudCover: { type: Number },
      fallbackTriggered: { type: Boolean },
    },
    logs: [{ type: String }],
  },
  {
    timestamps: true,
  },
);

// Compound indexes for high-speed deduplication, queue status, and stale job recovery
incrementalMonitoringRecordSchema.index({ areaId: 1, targetObservationId: 1 });
incrementalMonitoringRecordSchema.index({ areaId: 1, lifecycleState: 1 });
incrementalMonitoringRecordSchema.index({ lifecycleState: 1, updatedAt: 1 });
incrementalMonitoringRecordSchema.index({ lifecycleState: 1, nextRetryAt: 1 });
incrementalMonitoringRecordSchema.index({ createdAt: -1 });

incrementalMonitoringRecordSchema.methods.toDto = function (
  this: IIncrementalMonitoringRecord,
): IncrementalMonitoringRecordDto {
  return {
    id: this._id.toString(),
    jobId: this.jobId,
    areaId: this.areaId,
    areaType: this.areaType,
    areaName: this.areaName,
    targetObservationId: this.targetObservationId,
    satelliteMetadataId: this.satelliteMetadataId?.toString(),
    sensorType: this.sensorType,
    source: this.source,
    lifecycleState: this.lifecycleState,
    acquisitionDate: this.acquisitionDate?.toISOString(),
    startedAt: this.startedAt?.toISOString(),
    completedAt: this.completedAt?.toISOString(),
    durationMs: this.durationMs,
    errorCode: this.errorCode,
    errorMessage: this.errorMessage,
    retryCount: this.retryCount,
    maxRetries: this.maxRetries,
    nextRetryAt: this.nextRetryAt?.toISOString(),
    isPermanentFailure: this.isPermanentFailure,
    results: this.results
      ? {
          processedImageResultId: this.results.processedImageResultId?.toString(),
          changeDetectionId: this.results.changeDetectionId?.toString(),
          alertId: this.results.alertId?.toString(),
          affectedAreaPercentage: this.results.affectedAreaPercentage,
          severity: this.results.severity,
          cloudCover: this.results.cloudCover,
          fallbackTriggered: this.results.fallbackTriggered,
        }
      : undefined,
    logs: this.logs || [],
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const IncrementalMonitoringRecordModel = mongoose.model<IIncrementalMonitoringRecord>(
  'IncrementalMonitoringRecord',
  incrementalMonitoringRecordSchema,
);

