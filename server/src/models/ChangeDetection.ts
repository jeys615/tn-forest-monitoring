import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  SensorType,
  SatelliteSource,
  AlertSeverity,
  ChangeCategory,
  CrossSensorAgreement,
  ProcessingMode,
  SpatialCalculationSource,
  ChangeCalculationMethod,
  SpatialCalculationType,
  MonitoringTrack,
  ComparisonMode,
  type ChangeDetectionDto,
  type EvidenceBreakdownDto,
  type ChangeIndicatorDeltas,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';

export interface IChangeDetection extends Document {
  _id: Types.ObjectId;
  changeId: string;
  zoneId?: Types.ObjectId;
  temporaryAreaId?: string;
  observationId: Types.ObjectId;
  baselineId?: Types.ObjectId;
  referenceObservationId?: Types.ObjectId;
  sensorType: SensorType;
  monitoringTrack: MonitoringTrack;
  source: SatelliteSource;
  detectedAt: Date;
  zoneArea: number;
  changedArea: number;
  affectedAreaPercentage: number;
  calculationMode: ProcessingMode;
  spatialSource: SpatialCalculationSource;
  calculationMethod?: ChangeCalculationMethod | string;
  spatialCalculation?: SpatialCalculationType | string;
  comparisonMode?: ComparisonMode;
  baselineHlsRepresentationId?: Types.ObjectId;
  currentHlsRepresentationId?: Types.ObjectId;
  baselineHlsImageId?: string;
  currentHlsImageId?: string;
  hlsVersion?: string;
  processingVersion?: string;
  processingFamily?: string;
  crossSensor?: boolean;
  baselineSensor?: string;
  currentSensor?: string;
  hlsMode?: string;
  qaPolicy?: string;
  analysisGrid?: import('@tn-forest/shared/types').AnalysisGridDto;
  thresholdConfig?: import('@tn-forest/shared/types').SarThresholdConfigDto | import('@tn-forest/shared/types').OpticalThresholdConfigDto;
  rasterStatistics?: import('@tn-forest/shared/types').SarRasterStatisticsDto | import('@tn-forest/shared/types').OpticalRasterStatisticsDto;
  changedGeometry?: GeoJSONPolygon | GeoJSONMultiPolygon;
  threshold2Crossed: boolean;
  threshold5Crossed: boolean;
  threshold10Crossed: boolean;
  highestThresholdCrossed: number;
  severity: AlertSeverity | 'NONE';
  evidenceStrength: number;
  evidenceBreakdown: EvidenceBreakdownDto;
  categories: ChangeCategory[];
  changeIndicators: ChangeIndicatorDeltas;
  opticalEvidence?: 'CLEAN' | 'CLOUD_DEGRADED' | 'UNAVAILABLE';
  sarEvidence?: 'AVAILABLE' | 'UNAVAILABLE';
  crossSensorAgreement: CrossSensorAgreement;
  temporalConsistency: string;
  explanation: string;
  alertGenerated: boolean;
  alertId?: Types.ObjectId;
  auditStatus?: string;
  shadowTelemetry?: import('@tn-forest/shared/types').ShadowAccountingModelDto;
  preScreenedAreaHa?: number;
  createdAt: Date;
  updatedAt: Date;
  toDto(): ChangeDetectionDto;
}

const evidenceBreakdownSchema = new Schema<EvidenceBreakdownDto>(
  {
    magnitudeScore: { type: Number, required: true },
    dataQualityScore: { type: Number, required: true },
    temporalConsistencyScore: { type: Number, required: true },
    crossSensorScore: { type: Number, required: true },
    totalEvidenceScore: { type: Number, required: true },
    explanation: { type: String, required: true },
  },
  { _id: false },
);

const changeIndicatorDeltasSchema = new Schema<ChangeIndicatorDeltas>(
  {
    ndviDelta: { type: Number },
    ndwiDelta: { type: Number },
    ndbiDelta: { type: Number },
    bsiDelta: { type: Number },
    saviDelta: { type: Number },
    eviDelta: { type: Number },
    vvDelta: { type: Number },
    vhDelta: { type: Number },
    vvVhRatioDelta: { type: Number },
  },
  { _id: false },
);

const changeDetectionSchema = new Schema<IChangeDetection>(
  {
    changeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Zone',
      index: true,
    },
    temporaryAreaId: {
      type: String,
      index: true,
    },
    observationId: {
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
    referenceObservationId: {
      type: Schema.Types.ObjectId,
      ref: 'SatelliteMetadata',
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
    detectedAt: {
      type: Date,
      required: true,
      index: true,
    },
    zoneArea: {
      type: Number,
      required: true,
    },
    changedArea: {
      type: Number,
      required: true,
    },
    affectedAreaPercentage: {
      type: Number,
      required: true,
    },
    calculationMode: {
      type: String,
      enum: Object.values(ProcessingMode),
      default: ProcessingMode.SIMULATED,
      required: true,
    },
    spatialSource: {
      type: String,
      enum: Object.values(SpatialCalculationSource),
      default: SpatialCalculationSource.SIMULATION,
      required: true,
    },
    calculationMethod: {
      type: String,
      enum: Object.values(ChangeCalculationMethod),
    },
    spatialCalculation: {
      type: String,
      enum: Object.values(SpatialCalculationType),
    },
    comparisonMode: {
      type: String,
      enum: Object.values(ComparisonMode),
      default: ComparisonMode.NATIVE,
    },
    baselineHlsRepresentationId: {
      type: Schema.Types.ObjectId,
      ref: 'HLSRepresentation',
    },
    currentHlsRepresentationId: {
      type: Schema.Types.ObjectId,
      ref: 'HLSRepresentation',
    },
    baselineHlsImageId: { type: String },
    currentHlsImageId: { type: String },
    hlsVersion: { type: String },
    processingVersion: { type: String },
    processingFamily: { type: String },
    crossSensor: { type: Boolean },
    baselineSensor: { type: String },
    currentSensor: { type: String },
    hlsMode: { type: String },
    qaPolicy: { type: String },
    analysisGrid: {
      type: Schema.Types.Mixed,
    },
    thresholdConfig: {
      type: Schema.Types.Mixed,
    },
    rasterStatistics: {
      type: Schema.Types.Mixed,
    },
    changedGeometry: {
      type: Schema.Types.Mixed,
    },
    threshold2Crossed: {
      type: Boolean,
      default: false,
    },
    threshold5Crossed: {
      type: Boolean,
      default: false,
    },
    threshold10Crossed: {
      type: Boolean,
      default: false,
    },
    highestThresholdCrossed: {
      type: Number,
      default: 0,
    },
    severity: {
      type: String,
      enum: [...Object.values(AlertSeverity), 'NONE'],
      default: 'NONE',
      required: true,
      index: true,
    },
    evidenceStrength: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    evidenceBreakdown: {
      type: evidenceBreakdownSchema,
      required: true,
    },
    categories: [
      {
        type: String,
        enum: Object.values(ChangeCategory),
      },
    ],
    changeIndicators: {
      type: changeIndicatorDeltasSchema,
      default: {},
    },
    opticalEvidence: {
      type: String,
      enum: ['CLEAN', 'CLOUD_DEGRADED', 'UNAVAILABLE'],
    },
    sarEvidence: {
      type: String,
      enum: ['AVAILABLE', 'UNAVAILABLE'],
    },
    crossSensorAgreement: {
      type: String,
      enum: Object.values(CrossSensorAgreement),
      default: CrossSensorAgreement.SINGLE_SENSOR,
      required: true,
    },
    temporalConsistency: {
      type: String,
      required: true,
    },
    explanation: {
      type: String,
      required: true,
    },
    alertGenerated: {
      type: Boolean,
      default: false,
      index: true,
    },
    alertId: {
      type: Schema.Types.ObjectId,
      ref: 'Alert',
    },
    auditStatus: {
      type: String,
    },
    shadowTelemetry: {
      type: {
        fullCandidatePool: { type: Number },
        fullyObservableSubset: { type: Number },
        outcomeDeterminedSubset: { type: Number },
        seasonalCount: { type: Number },
        persistentCount: { type: Number },
        uncertainCount: { type: Number },
        preScreenedNonForestCount: { type: Number },
        seasonalHectares: { type: Number },
        persistentHectares: { type: Number },
        uncertainHectares: { type: Number },
        preScreenedHectares: { type: Number },
        fullPoolHectares: { type: Number },
        candidateReductionRate: { type: Number },
        partitionConservationValid: { type: Boolean },
        partitionSum: { type: Number },
      },
      required: false,
      _id: false,
    },
    preScreenedAreaHa: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique indexes enforcing deduplication for permanent zones and temporary areas
changeDetectionSchema.index(
  { zoneId: 1, observationId: 1, baselineId: 1, calculationMethod: 1 },
  { unique: true, partialFilterExpression: { zoneId: { $type: 'objectId' } } },
);
changeDetectionSchema.index(
  { temporaryAreaId: 1, observationId: 1, referenceObservationId: 1, calculationMethod: 1 },
  { unique: true, partialFilterExpression: { temporaryAreaId: { $type: 'string' } } },
);
changeDetectionSchema.index({ zoneId: 1, detectedAt: -1 });
changeDetectionSchema.index({ temporaryAreaId: 1, detectedAt: -1 });

// ─── IMMUTABILITY HOOKS ──────────────────────────────────────────────────────
// Scientific measurement results and entity linkages are strictly immutable once persisted.
// Protected across save(), updateOne(), updateMany(), findOneAndUpdate(), findByIdAndUpdate().

export const IMMUTABLE_CHANGE_DETECTION_SCIENTIFIC_FIELDS = [
  'changeId',
  'zoneId',
  'temporaryAreaId',
  'observationId',
  'baselineId',
  'referenceObservationId',
  'sensorType',
  'monitoringTrack',
  'source',
  'detectedAt',
  'zoneArea',
  'changedArea',
  'affectedAreaPercentage',
  'calculationMode',
  'spatialSource',
  'calculationMethod',
  'spatialCalculation',
  'comparisonMode',
  'baselineHlsRepresentationId',
  'currentHlsRepresentationId',
  'baselineHlsImageId',
  'currentHlsImageId',
  'hlsVersion',
  'processingVersion',
  'analysisGrid',
  'thresholdConfig',
  'rasterStatistics',
  'changedGeometry',
  'threshold2Crossed',
  'threshold5Crossed',
  'threshold10Crossed',
  'highestThresholdCrossed',
  'evidenceStrength',
  'evidenceBreakdown',
  'categories',
  'changeIndicators',
  'opticalEvidence',
  'sarEvidence',
  'crossSensorAgreement',
  'temporalConsistency',
  'explanation',
  'shadowTelemetry',
  'preScreenedAreaHa',
] as const;

changeDetectionSchema.pre('save', function (next) {
  if (!this.isNew) {
    for (const field of IMMUTABLE_CHANGE_DETECTION_SCIENTIFIC_FIELDS) {
      if (this.isModified(field)) {
        return next(
          new Error(
            `[CHANGE_DETECTION] Scientific measurement field '${field}' is strictly immutable once persisted. Refusing mutation.`,
          ),
        );
      }
    }
  }
  next();
});

const changeDetectionQueryImmutabilityMiddleware = async function (this: any) {
  const update = this.getUpdate() as Record<string, any>;
  if (!update) return;

  const setFields = { ...(update.$set || {}), ...update };
  delete setFields.$set;
  delete setFields.$unset;
  delete setFields.$setOnInsert;

  for (const field of IMMUTABLE_CHANGE_DETECTION_SCIENTIFIC_FIELDS) {
    if (field in setFields && setFields[field] !== undefined) {
      throw new Error(
        `[CHANGE_DETECTION] Unauthorized mutation: scientific measurement field '${field}' is strictly immutable.`,
      );
    }
  }
};

changeDetectionSchema.pre('updateOne', changeDetectionQueryImmutabilityMiddleware);
changeDetectionSchema.pre('updateMany', changeDetectionQueryImmutabilityMiddleware);
changeDetectionSchema.pre('findOneAndUpdate', changeDetectionQueryImmutabilityMiddleware);

changeDetectionSchema.methods.toDto = function (): ChangeDetectionDto {
  return {
    id: this._id.toString(),
    changeId: this.changeId,
    zoneId: this.zoneId?.toString(),
    temporaryAreaId: this.temporaryAreaId,
    observationId: this.observationId.toString(),
    baselineId: this.baselineId?.toString(),
    referenceObservationId: this.referenceObservationId?.toString(),
    sensorType: this.sensorType,
    monitoringTrack: this.monitoringTrack ?? MonitoringTrack.OPTICAL,
    source: this.source,
    detectedAt: this.detectedAt.toISOString(),
    zoneArea: this.zoneArea,
    changedArea: this.changedArea,
    affectedAreaPercentage: this.affectedAreaPercentage,
    calculationMode: this.calculationMode,
    spatialSource: this.spatialSource,
    calculationMethod: this.calculationMethod,
    spatialCalculation: this.spatialCalculation,
    comparisonMode: this.comparisonMode,
    baselineHlsRepresentationId: this.baselineHlsRepresentationId?.toString(),
    currentHlsRepresentationId: this.currentHlsRepresentationId?.toString(),
    baselineHlsImageId: this.baselineHlsImageId,
    currentHlsImageId: this.currentHlsImageId,
    hlsVersion: this.hlsVersion,
    processingVersion: this.processingVersion,
    processingFamily: this.processingFamily,
    crossSensor: this.crossSensor,
    baselineSensor: this.baselineSensor,
    currentSensor: this.currentSensor,
    hlsMode: this.hlsMode,
    qaPolicy: this.qaPolicy,
    analysisGrid: this.analysisGrid,
    thresholdConfig: this.thresholdConfig,
    rasterStatistics: this.rasterStatistics,
    changedGeometry: this.changedGeometry,
    threshold2Crossed: this.threshold2Crossed,
    threshold5Crossed: this.threshold5Crossed,
    threshold10Crossed: this.threshold10Crossed,
    highestThresholdCrossed: this.highestThresholdCrossed,
    severity: this.severity,
    evidenceStrength: this.evidenceStrength,
    evidenceBreakdown: this.evidenceBreakdown,
    categories: this.categories,
    changeIndicators: this.changeIndicators,
    opticalEvidence: this.opticalEvidence,
    sarEvidence: this.sarEvidence,
    crossSensorAgreement: this.crossSensorAgreement,
    temporalConsistency: this.temporalConsistency,
    explanation: this.explanation,
    alertGenerated: this.alertGenerated,
    alertId: this.alertId?.toString(),
    auditStatus: this.auditStatus,
    shadowTelemetry: this.shadowTelemetry,
    preScreenedAreaHa: this.preScreenedAreaHa,
    createdAt: this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: this.updatedAt ? this.updatedAt.toISOString() : new Date().toISOString(),
  };
};

export const ChangeDetectionModel = mongoose.model<IChangeDetection>(
  'ChangeDetection',
  changeDetectionSchema,
);
