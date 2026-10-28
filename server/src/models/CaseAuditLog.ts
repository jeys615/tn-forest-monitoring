import { Schema, model, type Document, type Types } from 'mongoose';
import {
  CaseAuditAction,
  CaseStatus,
  type CaseAuditLogDto,
} from '@tn-forest/shared/types';

export interface ICaseAuditLog extends Document {
  auditId: string;
  caseId: Types.ObjectId;
  caseNumber: string;
  actorId?: Types.ObjectId;
  actorName: string;
  actorRole: string;
  action: CaseAuditAction;
  previousStatus?: CaseStatus;
  newStatus?: CaseStatus;
  remarks: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  timestamp: Date;

  toDto(): CaseAuditLogDto;
}

const caseAuditLogSchema = new Schema<ICaseAuditLog>(
  {
    auditId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      index: true,
    },
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'EnforcementCase',
      required: true,
      index: true,
    },
    caseNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
    },
    actorRole: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      enum: Object.values(CaseAuditAction),
      required: true,
      index: true,
    },
    previousStatus: {
      type: String,
      enum: Object.values(CaseStatus),
    },
    newStatus: {
      type: String,
      enum: Object.values(CaseStatus),
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    changes: {
      type: Schema.Types.Mixed,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  },
);

caseAuditLogSchema.index({ caseId: 1, timestamp: -1 });

caseAuditLogSchema.methods.toDto = function (this: ICaseAuditLog): CaseAuditLogDto {
  const actorIdVal = this.actorId as unknown;
  const actorIdStr = actorIdVal
    ? typeof actorIdVal === 'object' && actorIdVal !== null && '_id' in actorIdVal
      ? String((actorIdVal as { _id: unknown })._id)
      : String(actorIdVal)
    : undefined;

  return {
    id: this._id.toString(),
    auditId: this.auditId,
    caseId: this.caseId.toString(),
    caseNumber: this.caseNumber,
    actorId: actorIdStr,
    actorName: this.actorName,
    actorRole: this.actorRole,
    action: this.action,
    previousStatus: this.previousStatus,
    newStatus: this.newStatus,
    remarks: this.remarks,
    changes: this.changes,
    timestamp: this.timestamp.toISOString(),
  };
};

export const CaseAuditLogModel = model<ICaseAuditLog>('CaseAuditLog', caseAuditLogSchema);
