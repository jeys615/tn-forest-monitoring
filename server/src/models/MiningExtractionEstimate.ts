import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  type MiningExtractionEstimateDto,
  MiningClassification,
  MarkedAreaType,
} from '@tn-forest/shared/types';

export interface IMiningExtractionEstimate extends Document {
  _id: Types.ObjectId;
  estimateId: string;
  areaType: MarkedAreaType;
  markedAreaId: string;
  temporaryAreaId?: string;
  zoneId?: Types.ObjectId;
  changeDetectionId?: Types.ObjectId;
  observationId: Types.ObjectId;
  observationDate: Date;
  changedAreaSquareMeters: number;
  changedAreaHectares: number;
  percentageOfTemporaryArea: number;
  miningClassification: MiningClassification;
  estimatedDepthMeters?: number;
  estimatedVolumeCubicMeters?: number;
  volumeUnit: string;
  isVolumeAvailable: boolean;
  volumeUnavailableReason?: string;
  estimationMethod: string;
  estimationConfidence: number;
  disclaimer: string;
  createdAt: Date;
  updatedAt: Date;
  toDto(): MiningExtractionEstimateDto;
}

const miningExtractionEstimateSchema = new Schema<IMiningExtractionEstimate>(
  {
    estimateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    areaType: {
      type: String,
      enum: Object.values(MarkedAreaType),
      default: MarkedAreaType.TEMPORARY,
      required: true,
      index: true,
    },
    markedAreaId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    temporaryAreaId: {
      type: String,
      index: true,
      trim: true,
    },
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Zone',
      index: true,
    },
    changeDetectionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChangeDetection',
      index: true,
    },
    observationId: {
      type: Schema.Types.ObjectId,
      ref: 'SatelliteMetadata',
      required: true,
      index: true,
    },
    observationDate: {
      type: Date,
      required: true,
      index: true,
    },
    changedAreaSquareMeters: {
      type: Number,
      required: true,
    },
    changedAreaHectares: {
      type: Number,
      required: true,
    },
    percentageOfTemporaryArea: {
      type: Number,
      required: true,
    },
    miningClassification: {
      type: String,
      enum: Object.values(MiningClassification),
      required: true,
      index: true,
    },
    estimatedDepthMeters: {
      type: Number,
    },
    estimatedVolumeCubicMeters: {
      type: Number,
    },
    volumeUnit: {
      type: String,
      default: 'CUBIC_METERS',
      required: true,
    },
    isVolumeAvailable: {
      type: Boolean,
      default: false,
      required: true,
    },
    volumeUnavailableReason: {
      type: String,
    },
    estimationMethod: {
      type: String,
      default: 'UNAVAILABLE',
      required: true,
    },
    estimationConfidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    disclaimer: {
      type: String,
      default:
        'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

miningExtractionEstimateSchema.index({ markedAreaId: 1, observationDate: 1 });
miningExtractionEstimateSchema.index({ temporaryAreaId: 1, observationDate: 1 });
miningExtractionEstimateSchema.index({ zoneId: 1, observationDate: 1 });

miningExtractionEstimateSchema.methods.toDto = function (): MiningExtractionEstimateDto {
  return {
    id: this._id.toString(),
    estimateId: this.estimateId,
    areaType: this.areaType,
    markedAreaId: this.markedAreaId,
    temporaryAreaId: this.temporaryAreaId || this.markedAreaId,
    zoneId: this.zoneId?.toString(),
    changeDetectionId: this.changeDetectionId?.toString(),
    observationId: this.observationId.toString(),
    observationDate: this.observationDate.toISOString(),
    changedAreaSquareMeters: this.changedAreaSquareMeters,
    changedAreaHectares: this.changedAreaHectares,
    percentageOfTemporaryArea: this.percentageOfTemporaryArea,
    miningClassification: this.miningClassification,
    estimatedDepthMeters: this.estimatedDepthMeters,
    estimatedVolumeCubicMeters: this.estimatedVolumeCubicMeters,
    volumeUnit: this.volumeUnit,
    isVolumeAvailable: this.isVolumeAvailable,
    volumeUnavailableReason: this.volumeUnavailableReason,
    estimationMethod: this.estimationMethod,
    estimationConfidence: this.estimationConfidence,
    disclaimer: this.disclaimer,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const MiningExtractionEstimateModel = mongoose.model<IMiningExtractionEstimate>(
  'MiningExtractionEstimate',
  miningExtractionEstimateSchema,
);
export { MiningExtractionEstimateModel as MiningExtractionEstimate };
