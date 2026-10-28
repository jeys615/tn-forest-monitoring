import { Schema, model, type Document, type Types } from 'mongoose';
import {
  ReconciliationStatus,
  ReconciliationReportStatus,
  ReconciliationAnomalyType,
  ReconciliationAnomalySeverity,
  type ReconciliationAnomalyItem,
  type AuthorizedPermitSummary,
  type TransportSummary,
  type CheckpointSummaryInRecon,
  type SatelliteSummaryInRecon,
  type ReconciliationReportDto,
} from '@tn-forest/shared/types';

export interface IReconciliationReport extends Document {
  reconciliationId: string;
  zoneId?: Types.ObjectId;
  zoneName?: string;
  authorizationId?: Types.ObjectId;
  permitNumber?: string;
  periodStart: Date;
  periodEnd: Date;
  status: ReconciliationReportStatus;
  reconciliationStatus: ReconciliationStatus;
  discrepancyScore: number;
  permitSummary?: AuthorizedPermitSummary;
  transportSummary: TransportSummary;
  checkpointSummary: CheckpointSummaryInRecon;
  satelliteSummary: SatelliteSummaryInRecon;
  anomalies: ReconciliationAnomalyItem[];
  findings: string[];
  recommendations: string[];
  investigationNotes?: string;
  generatedBy?: Types.ObjectId;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  toDto(userNameMap?: Map<string, string>): ReconciliationReportDto;
}

const anomalyItemSchema = new Schema<ReconciliationAnomalyItem>(
  {
    type: {
      type: String,
      enum: Object.values(ReconciliationAnomalyType),
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(ReconciliationAnomalySeverity),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    evidenceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

const authorizedPermitSummarySchema = new Schema<AuthorizedPermitSummary>(
  {
    permitNumber: { type: String, required: true },
    lesseeName: { type: String, required: true },
    mineralType: { type: String, required: true },
    permittedWeightTonnes: { type: Number, required: true },
    remainingQuota: { type: Number, required: true },
    status: { type: String, required: true },
    validFrom: { type: String, required: true },
    validUntil: { type: String, required: true },
  },
  { _id: false },
);

const transportSummarySchema = new Schema<TransportSummary>(
  {
    totalPassesIssued: { type: Number, default: 0 },
    totalIssuedTonnage: { type: Number, default: 0 },
    totalPassesUsed: { type: Number, default: 0 },
    totalVerifiedTonnage: { type: Number, default: 0 },
    totalPassesCancelled: { type: Number, default: 0 },
    totalPassesExpired: { type: Number, default: 0 },
    activePassCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const checkpointSummarySchema = new Schema<CheckpointSummaryInRecon>(
  {
    totalScans: { type: Number, default: 0 },
    validScans: { type: Number, default: 0 },
    invalidScans: { type: Number, default: 0 },
    outsideGeofenceScans: { type: Number, default: 0 },
    transitPassageCount: { type: Number, default: 0 },
    totalTransitTonnage: { type: Number, default: 0 },
  },
  { _id: false },
);

const satelliteSummarySchema = new Schema<SatelliteSummaryInRecon>(
  {
    observationCount: { type: Number, default: 0 },
    totalDisturbedAreaHectares: { type: Number, default: 0 },
    estimatedExtractionVolumeCubicMeters: { type: Number },
    estimatedTonnageEquivalent: { type: Number },
    densityUsedTonnesPerCubicMeter: { type: Number },
    maxEvidenceStrength: { type: Number, default: 0 },
    miningClassifications: { type: [String], default: [] },
    disclaimer: {
      type: String,
      default:
        'Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey.',
    },
  },
  { _id: false },
);

const reconciliationReportSchema = new Schema<IReconciliationReport>(
  {
    reconciliationId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    zoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Zone',
      index: true,
    },
    zoneName: {
      type: String,
      trim: true,
    },
    authorizationId: {
      type: Schema.Types.ObjectId,
      ref: 'MiningAuthorization',
      index: true,
    },
    permitNumber: {
      type: String,
      trim: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ReconciliationReportStatus),
      default: ReconciliationReportStatus.DRAFT,
      index: true,
    },
    reconciliationStatus: {
      type: String,
      enum: Object.values(ReconciliationStatus),
      required: true,
      index: true,
    },
    discrepancyScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    permitSummary: {
      type: authorizedPermitSummarySchema,
    },
    transportSummary: {
      type: transportSummarySchema,
      required: true,
    },
    checkpointSummary: {
      type: checkpointSummarySchema,
      required: true,
    },
    satelliteSummary: {
      type: satelliteSummarySchema,
      required: true,
    },
    anomalies: {
      type: [anomalyItemSchema],
      default: [],
    },
    findings: {
      type: [String],
      default: [],
    },
    recommendations: {
      type: [String],
      default: [],
    },
    investigationNotes: {
      type: String,
      trim: true,
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

reconciliationReportSchema.index({ reconciliationStatus: 1, createdAt: -1 });
reconciliationReportSchema.index({ status: 1, createdAt: -1 });
reconciliationReportSchema.index({ zoneId: 1, createdAt: -1 });
reconciliationReportSchema.index({ authorizationId: 1, createdAt: -1 });

reconciliationReportSchema.methods.toDto = function (
  this: IReconciliationReport,
  userNameMap?: Map<string, string>,
): ReconciliationReportDto {
  const genObj = this.generatedBy as unknown;
  const generatedById = genObj
    ? typeof genObj === 'object' && genObj !== null && '_id' in genObj
      ? String((genObj as { _id: unknown })._id)
      : String(genObj)
    : undefined;
  const generatedByName =
    genObj && typeof genObj === 'object' && genObj !== null && 'name' in genObj
      ? String((genObj as { name: unknown }).name)
      : generatedById && userNameMap
        ? userNameMap.get(generatedById)
        : undefined;

  const resObj = this.resolvedBy as unknown;
  const resolvedById = resObj
    ? typeof resObj === 'object' && resObj !== null && '_id' in resObj
      ? String((resObj as { _id: unknown })._id)
      : String(resObj)
    : undefined;

  const zoneObj = this.zoneId as unknown;
  const zoneIdStr = zoneObj
    ? typeof zoneObj === 'object' && zoneObj !== null && '_id' in zoneObj
      ? String((zoneObj as { _id: unknown })._id)
      : String(zoneObj)
    : undefined;

  const authObj = this.authorizationId as unknown;
  const authIdStr = authObj
    ? typeof authObj === 'object' && authObj !== null && '_id' in authObj
      ? String((authObj as { _id: unknown })._id)
      : String(authObj)
    : undefined;


  return {
    id: this._id.toString(),
    reconciliationId: this.reconciliationId,
    zoneId: zoneIdStr,
    zoneName: this.zoneName,
    authorizationId: authIdStr,
    permitNumber: this.permitNumber,
    periodStart: this.periodStart.toISOString(),
    periodEnd: this.periodEnd.toISOString(),
    status: this.status,
    reconciliationStatus: this.reconciliationStatus,
    discrepancyScore: this.discrepancyScore,
    permitSummary: this.permitSummary,
    transportSummary: this.transportSummary,
    checkpointSummary: this.checkpointSummary,
    satelliteSummary: this.satelliteSummary,
    anomalies: this.anomalies,
    findings: this.findings,
    recommendations: this.recommendations,
    investigationNotes: this.investigationNotes,
    generatedBy: generatedById,
    generatedByName,
    resolvedBy: resolvedById,
    resolvedAt: this.resolvedAt ? this.resolvedAt.toISOString() : undefined,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};


export const ReconciliationReportModel = model<IReconciliationReport>(
  'ReconciliationReport',
  reconciliationReportSchema,
);
