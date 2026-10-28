import { Schema, model, type Document, type Types } from 'mongoose';
import {
  CaseStatus,
  CaseSeverity,
  CaseType,
  EnforcementActionType,
  type FieldVerificationDto,
  type EnforcementActionDto,
  type CaseResolutionDto,
  type EnforcementCaseDto,
} from '@tn-forest/shared/types';

export interface IFieldVerification {
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  locationCoordinates?: [number, number];
  siteObservations?: string;
  photoUrls?: string[];
  droneSurveyConducted?: boolean;
  groundDisturbanceConfirmed?: boolean;
  notes?: string;
}

export interface IEnforcementAction {
  actionType?: EnforcementActionType;
  actionDetails?: string;
  actionDate?: Date;
  penaltyAmountInr?: number;
  officialOrderReference?: string;
  issuedBy?: Types.ObjectId;
}

export interface ICaseResolution {
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  summary?: string;
  followUpRequired?: boolean;
}

export interface IEnforcementCase extends Document {
  caseId: string;
  reconciliationReportId?: Types.ObjectId;
  reconciliationReportNumber?: string;
  zoneId?: Types.ObjectId;
  zoneName?: string;
  authorizationId?: Types.ObjectId;
  permitNumber?: string;
  severity: CaseSeverity;
  caseType: CaseType;
  title: string;
  description: string;
  status: CaseStatus;
  assignedOfficerId?: Types.ObjectId;
  assignedOfficerName?: string;
  assignedAt?: Date;
  investigationFindings: string[];
  fieldVerification?: IFieldVerification;
  enforcementAction?: IEnforcementAction;
  resolutionInfo?: ICaseResolution;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  toDto(userNameMap?: Map<string, string>): EnforcementCaseDto;
}

const fieldVerificationSchema = new Schema<IFieldVerification>(
  {
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    locationCoordinates: { type: [Number] },
    siteObservations: { type: String, trim: true },
    photoUrls: { type: [String], default: [] },
    droneSurveyConducted: { type: Boolean, default: false },
    groundDisturbanceConfirmed: { type: Boolean, default: false },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const enforcementActionSchema = new Schema<IEnforcementAction>(
  {
    actionType: {
      type: String,
      enum: Object.values(EnforcementActionType),
    },
    actionDetails: { type: String, trim: true },
    actionDate: { type: Date },
    penaltyAmountInr: { type: Number, min: 0 },
    officialOrderReference: { type: String, trim: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const caseResolutionSchema = new Schema<ICaseResolution>(
  {
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    summary: { type: String, trim: true },
    followUpRequired: { type: Boolean, default: false },
  },
  { _id: false },
);

const enforcementCaseSchema = new Schema<IEnforcementCase>(
  {
    caseId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      index: true,
    },
    reconciliationReportId: {
      type: Schema.Types.ObjectId,
      ref: 'ReconciliationReport',
      index: true,
    },
    reconciliationReportNumber: {
      type: String,
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
    severity: {
      type: String,
      enum: Object.values(CaseSeverity),
      required: true,
      index: true,
    },
    caseType: {
      type: String,
      enum: Object.values(CaseType),
      required: true,
      index: true,
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
    status: {
      type: String,
      enum: Object.values(CaseStatus),
      default: CaseStatus.CASE_CREATED,
      required: true,
      index: true,
    },
    assignedOfficerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedOfficerName: {
      type: String,
      trim: true,
    },
    assignedAt: {
      type: Date,
    },
    investigationFindings: {
      type: [String],
      default: [],
    },
    fieldVerification: {
      type: fieldVerificationSchema,
    },
    enforcementAction: {
      type: enforcementActionSchema,
    },
    resolutionInfo: {
      type: caseResolutionSchema,
    },
    closedAt: {
      type: Date,
    },
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

enforcementCaseSchema.index({ status: 1, createdAt: -1 });
enforcementCaseSchema.index({ severity: 1, createdAt: -1 });
enforcementCaseSchema.index({ zoneId: 1, status: 1 });
enforcementCaseSchema.index({ assignedOfficerId: 1, status: 1 });

enforcementCaseSchema.methods.toDto = function (
  this: IEnforcementCase,
  userNameMap?: Map<string, string>,
): EnforcementCaseDto {
  const parseIdAndName = (
    fieldVal: unknown,
    fallbackName?: string,
  ): { id?: string; name?: string } => {
    if (!fieldVal) return { id: undefined, name: fallbackName };
    if (typeof fieldVal === 'object' && fieldVal !== null) {
      const obj = fieldVal as { _id?: unknown; name?: unknown };
      const idStr = obj._id ? String(obj._id) : undefined;
      const nameStr = obj.name ? String(obj.name) : fallbackName;
      return {
        id: idStr,
        name: nameStr || (idStr && userNameMap ? userNameMap.get(idStr) : undefined),
      };
    }
    const idStr = String(fieldVal);
    return {
      id: idStr,
      name: fallbackName || (userNameMap ? userNameMap.get(idStr) : undefined),
    };
  };

  const assigned = parseIdAndName(this.assignedOfficerId, this.assignedOfficerName);
  const created = parseIdAndName(this.createdBy);
  const closed = parseIdAndName(this.closedBy);

  const fv = this.fieldVerification;
  let fieldVerificationDto: FieldVerificationDto | undefined = undefined;
  if (fv) {
    const fvVerifier = parseIdAndName(fv.verifiedBy);
    fieldVerificationDto = {
      verifiedAt: fv.verifiedAt ? fv.verifiedAt.toISOString() : undefined,
      verifiedBy: fvVerifier.id,
      verifiedByName: fvVerifier.name,
      locationCoordinates: fv.locationCoordinates,
      siteObservations: fv.siteObservations,
      photoUrls: fv.photoUrls,
      droneSurveyConducted: fv.droneSurveyConducted,
      groundDisturbanceConfirmed: fv.groundDisturbanceConfirmed,
      notes: fv.notes,
    };
  }

  const ea = this.enforcementAction;
  let enforcementActionDto: EnforcementActionDto | undefined = undefined;
  if (ea) {
    const eaIssuer = parseIdAndName(ea.issuedBy);
    enforcementActionDto = {
      actionType: ea.actionType,
      actionDetails: ea.actionDetails,
      actionDate: ea.actionDate ? ea.actionDate.toISOString() : undefined,
      penaltyAmountInr: ea.penaltyAmountInr,
      officialOrderReference: ea.officialOrderReference,
      issuedBy: eaIssuer.id,
      issuedByName: eaIssuer.name,
    };
  }

  const res = this.resolutionInfo;
  let resolutionInfoDto: CaseResolutionDto | undefined = undefined;
  if (res) {
    const resResolver = parseIdAndName(res.resolvedBy);
    resolutionInfoDto = {
      resolvedAt: res.resolvedAt ? res.resolvedAt.toISOString() : undefined,
      resolvedBy: resResolver.id,
      resolvedByName: resResolver.name,
      summary: res.summary,
      followUpRequired: res.followUpRequired,
    };
  }

  const zoneParsed = parseIdAndName(this.zoneId, this.zoneName);
  const authParsed = parseIdAndName(this.authorizationId, this.permitNumber);
  const reconParsed = parseIdAndName(this.reconciliationReportId, this.reconciliationReportNumber);

  return {
    id: this._id.toString(),
    caseId: this.caseId,
    reconciliationReportId: reconParsed.id,
    reconciliationReportNumber: this.reconciliationReportNumber || reconParsed.name,
    zoneId: zoneParsed.id,
    zoneName: this.zoneName || zoneParsed.name,
    authorizationId: authParsed.id,
    permitNumber: this.permitNumber || authParsed.name,
    severity: this.severity,
    caseType: this.caseType,
    title: this.title,
    description: this.description,
    status: this.status,
    assignedOfficerId: assigned.id,
    assignedOfficerName: assigned.name,
    assignedAt: this.assignedAt ? this.assignedAt.toISOString() : undefined,
    investigationFindings: this.investigationFindings || [],
    fieldVerification: fieldVerificationDto,
    enforcementAction: enforcementActionDto,
    resolutionInfo: resolutionInfoDto,
    closedAt: this.closedAt ? this.closedAt.toISOString() : undefined,
    closedBy: closed.id,
    closedByName: closed.name,
    createdBy: created.id,
    createdByName: created.name,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const EnforcementCaseModel = model<IEnforcementCase>(
  'EnforcementCase',
  enforcementCaseSchema,
);
