import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  MonitoringJobStatus,
  MonitoringJobType,
  SensorType,
  SatelliteSource,
} from '@tn-forest/shared/types';

export interface IMonitoringJob extends Document {
  _id: Types.ObjectId;
  jobId: string;
  type: MonitoringJobType;
  zoneId?: Types.ObjectId;
  satelliteMetadataId?: Types.ObjectId;
  sensorType?: SensorType;
  source?: SatelliteSource;
  status: MonitoringJobStatus;
  retryCount: number;
  maxRetries: number;
  logs: string[];
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  lockedByWorkerId?: string;
  heartbeatAt?: Date;
  changeDetectionId?: Types.ObjectId;
  acquisition?: {
    provider?: string;
    satellite?: string;
    sensor?: string;
    collection?: string;
    imageId?: string;
    acquisitionDate?: Date;
    cloudCover?: number;
    nativeResolution?: number;
  };
  export?: {
    geeTaskId?: string;
    geeTaskState?: string;
    driveFileId?: string;
    driveFileName?: string;
    driveFolderId?: string;
    exportedAt?: Date;
    downloadedAt?: Date;
  };
  processing?: {
    mode?: string;
    nativeResolution?: number;
    processingResolution?: number;
    targetCRS?: string;
    resamplingMethod?: string;
    normalizationMethod?: string;
  };
  raster?: {
    width?: number;
    height?: number;
    bands?: string[];
    validPixels?: number;
    maskedPixels?: number;
    coveragePercentage?: number;
  };
  results?: {
    processedImageUrl?: string;
    ndviMean?: number;
    ndwiMean?: number;
    nbrMean?: number;
    bsiMean?: number;
    eviMean?: number;
    saviMean?: number;
    cloudCoverUsed?: number;
    anomalyScore?: number;
    evidenceScore?: number;
    changedPixels?: number;
    validPixels?: number;
    noChangePixels?: number;
    affectedAreaPercentage?: number;
    affectedAreaHa?: number;
    affectedAreaM2?: number;
    severity?: string;
  };
  diagnostics?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const monitoringJobSchema = new Schema<IMonitoringJob>(
  {
    jobId: { type: String, required: true, unique: true },
    type: { type: String, enum: Object.values(MonitoringJobType), required: true },
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', required: false },
    satelliteMetadataId: { type: Schema.Types.ObjectId, ref: 'SatelliteMetadata', required: false },
    sensorType: { type: String, enum: Object.values(SensorType), required: false },
    source: { type: String, enum: Object.values(SatelliteSource), required: false },
    status: {
      type: String,
      enum: Object.values(MonitoringJobStatus),
      default: MonitoringJobStatus.PENDING,
      required: true,
    },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    logs: [{ type: String }],
    scheduledAt: { type: Date, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    errorMessage: { type: String },
    lockedByWorkerId: { type: String },
    heartbeatAt: { type: Date },
    changeDetectionId: { type: Schema.Types.ObjectId, ref: 'ChangeDetection', required: false },
    acquisition: {
      provider: { type: String },
      satellite: { type: String },
      sensor: { type: String },
      collection: { type: String },
      imageId: { type: String },
      acquisitionDate: { type: Date },
      cloudCover: { type: Number },
      nativeResolution: { type: Number },
    },
    export: {
      geeTaskId: { type: String },
      geeTaskState: { type: String },
      driveFileId: { type: String },
      driveFileName: { type: String },
      driveFolderId: { type: String },
      exportedAt: { type: Date },
      downloadedAt: { type: Date },
    },
    processing: {
      mode: { type: String },
      nativeResolution: { type: Number },
      processingResolution: { type: Number },
      targetCRS: { type: String },
      resamplingMethod: { type: String },
      normalizationMethod: { type: String },
    },
    raster: {
      width: { type: Number },
      height: { type: Number },
      bands: [{ type: String }],
      validPixels: { type: Number },
      maskedPixels: { type: Number },
      coveragePercentage: { type: Number },
    },
    results: {
      processedImageUrl: { type: String },
      ndviMean: { type: Number },
      ndwiMean: { type: Number },
      nbrMean: { type: Number },
      bsiMean: { type: Number },
      eviMean: { type: Number },
      saviMean: { type: Number },
      cloudCoverUsed: { type: Number },
      anomalyScore: { type: Number },
      evidenceScore: { type: Number },
      changedPixels: { type: Number },
      validPixels: { type: Number },
      noChangePixels: { type: Number },
      affectedAreaPercentage: { type: Number },
      affectedAreaHa: { type: Number },
      affectedAreaM2: { type: Number },
      severity: { type: String },
    },
    diagnostics: { type: Schema.Types.Mixed, required: false },
  },
  {
    timestamps: true,
  },
);

// Indexes
monitoringJobSchema.index({ status: 1 });
monitoringJobSchema.index({ scheduledAt: 1 });
monitoringJobSchema.index({ zoneId: 1 });
monitoringJobSchema.index({ sensorType: 1 });

export const MonitoringJobModel = mongoose.model<IMonitoringJob>(
  'MonitoringJob',
  monitoringJobSchema,
);
