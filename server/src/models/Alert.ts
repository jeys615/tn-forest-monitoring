import mongoose, { Schema, type Document, Types } from 'mongoose';
import {
  SensorType,
  AlertSeverity,
  AlertStatus,
  AlertAction,
  ChangeCategory,
  ProcessingMode,
  MonitoringTrack,
  ComparisonMode,
  type AlertDto,
  type AlertAuditEntryDto,
} from '@tn-forest/shared/types';

// ─── Embedded audit history entry ────────────────────────────────────────────

export interface IAlertAuditEntry {
  action: AlertAction;
  fromStatus: AlertStatus;
  toStatus: AlertStatus;
  performedBy: Types.ObjectId;
  performedAt: Date;
  notes?: string;
}

const alertAuditEntrySchema = new Schema<IAlertAuditEntry>(
  {
    action: {
      type: String,
      enum: Object.values(AlertAction),
      required: true,
    },
    fromStatus: {
      type: String,
      enum: Object.values(AlertStatus),
      required: true,
    },
    toStatus: {
      type: String,
      enum: Object.values(AlertStatus),
      required: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    performedAt: {
      type: Date,
      required: true,
    },
    notes: {
      type: String,
    },
  },
  { _id: false },
);

// ─── Alert document interface ─────────────────────────────────────────────────

export interface IAlert extends Document {
  _id: Types.ObjectId;
  alertId: string;
  zoneId?: Types.ObjectId;
  temporaryAreaId?: string;
  changeDetectionId: Types.ObjectId;
  detectedAt: Date;
  affectedAreaPercentage: number;
  highestThresholdCrossed: number;
  thresholdsCrossed: number[];
  severity: AlertSeverity;
  evidenceStrength: number;
  calculationMode: ProcessingMode;
  sensorType: SensorType;
  monitoringTrack: MonitoringTrack;
  evidenceSources: SensorType[];
  categories: ChangeCategory[];
  explanation: string;
  // Optional Lineage fields
  comparisonMode?: ComparisonMode;
  baselineId?: Types.ObjectId;
  observationId?: Types.ObjectId;
  baselineHlsRepresentationId?: Types.ObjectId;
  currentHlsRepresentationId?: Types.ObjectId;
  changedArea?: number;
  // Lifecycle state
  status: AlertStatus;
  assignedTo?: Types.ObjectId;
  // Acknowledged
  acknowledgedAt?: Date;
  acknowledgedBy?: Types.ObjectId;
  // Under review
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  // Confirmed
  confirmedAt?: Date;
  confirmedBy?: Types.ObjectId;
  // Dismissed
  dismissedAt?: Date;
  dismissedBy?: Types.ObjectId;
  dismissalReason?: string;
  // Resolved
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  resolutionInfo?: string;
  // Free-form notes (append-style)
  notes?: string;
  // Embedded audit history
  auditHistory: IAlertAuditEntry[];
  createdAt: Date;
  updatedAt: Date;
  toDto(): AlertDto;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const alertSchema = new Schema<IAlert>(
  {
    alertId: {
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
    changeDetectionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChangeDetection',
      required: true,
      index: true,
    },
    detectedAt: {
      type: Date,
      required: true,
      index: true,
    },
    affectedAreaPercentage: {
      type: Number,
      required: true,
    },
    highestThresholdCrossed: {
      type: Number,
      required: true,
    },
    thresholdsCrossed: [
      {
        type: Number,
      },
    ],
    severity: {
      type: String,
      enum: Object.values(AlertSeverity),
      required: true,
      index: true,
    },
    evidenceStrength: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    calculationMode: {
      type: String,
      enum: Object.values(ProcessingMode),
      default: ProcessingMode.SIMULATED,
      required: true,
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
    evidenceSources: [
      {
        type: String,
        enum: Object.values(SensorType),
      },
    ],
    categories: [
      {
        type: String,
        enum: Object.values(ChangeCategory),
      },
    ],
    explanation: {
      type: String,
      required: true,
    },
    // ── Lineage ────────────────────────────────────────────────────────────────
    comparisonMode: {
      type: String,
      enum: Object.values(ComparisonMode),
    },
    baselineId: {
      type: Schema.Types.ObjectId,
      ref: 'Baseline',
    },
    observationId: {
      type: Schema.Types.ObjectId,
      ref: 'SatelliteMetadata',
    },
    baselineHlsRepresentationId: {
      type: Schema.Types.ObjectId,
      ref: 'HLSRepresentation',
    },
    currentHlsRepresentationId: {
      type: Schema.Types.ObjectId,
      ref: 'HLSRepresentation',
    },
    changedArea: {
      type: Number,
    },
    // ── Lifecycle ──────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: Object.values(AlertStatus),
      default: AlertStatus.OPEN,
      required: true,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    dismissedAt: { type: Date },
    dismissedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    dismissalReason: { type: String },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionInfo: { type: String },
    notes: { type: String },
    auditHistory: { type: [alertAuditEntrySchema], default: [] },
  },
  {
    timestamps: true,
  },
);

alertSchema.index({ zoneId: 1, status: 1 });
alertSchema.index({ status: 1, severity: 1 });
alertSchema.index({ detectedAt: -1 });
alertSchema.index({ monitoringTrack: 1, status: 1 });
alertSchema.index({ assignedTo: 1, status: 1 });

// ─── toDto mapping ────────────────────────────────────────────────────────────

alertSchema.methods.toDto = function (): AlertDto {
  const auditHistory: AlertAuditEntryDto[] = (this.auditHistory ?? []).map(
    (entry: IAlertAuditEntry) => ({
      action: entry.action,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      performedBy: entry.performedBy.toString(),
      performedAt: entry.performedAt.toISOString(),
      notes: entry.notes,
    }),
  );

  return {
    id: this._id.toString(),
    alertId: this.alertId,
    zoneId: this.zoneId?.toString(),
    temporaryAreaId: this.temporaryAreaId,
    changeDetectionId: this.changeDetectionId.toString(),
    detectedAt: this.detectedAt.toISOString(),
    affectedAreaPercentage: this.affectedAreaPercentage,
    highestThresholdCrossed: this.highestThresholdCrossed,
    thresholdsCrossed: this.thresholdsCrossed,
    severity: this.severity,
    evidenceStrength: this.evidenceStrength,
    calculationMode: this.calculationMode,
    sensorType: this.sensorType,
    monitoringTrack: this.monitoringTrack ?? MonitoringTrack.OPTICAL,
    evidenceSources: this.evidenceSources,
    categories: this.categories,
    explanation: this.explanation,
    status: this.status,
    comparisonMode: this.comparisonMode,
    baselineHlsRepresentationId: this.baselineHlsRepresentationId?.toString(),
    currentHlsRepresentationId: this.currentHlsRepresentationId?.toString(),
    changedArea: this.changedArea,
    assignedTo: this.assignedTo?.toString(),
    acknowledgedAt: this.acknowledgedAt?.toISOString(),
    acknowledgedBy: this.acknowledgedBy?.toString(),
    reviewedAt: this.reviewedAt?.toISOString(),
    reviewedBy: this.reviewedBy?.toString(),
    confirmedAt: this.confirmedAt?.toISOString(),
    confirmedBy: this.confirmedBy?.toString(),
    dismissedAt: this.dismissedAt?.toISOString(),
    dismissedBy: this.dismissedBy?.toString(),
    dismissalReason: this.dismissalReason,
    resolutionInfo: this.resolutionInfo,
    resolvedAt: this.resolvedAt?.toISOString(),
    resolvedBy: this.resolvedBy?.toString(),
    notes: this.notes,
    auditHistory,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const AlertModel = mongoose.model<IAlert>('Alert', alertSchema);
