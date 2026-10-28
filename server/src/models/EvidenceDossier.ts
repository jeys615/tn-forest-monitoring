import { Schema, model, type Document, type Types } from 'mongoose';
import {
  type EvidenceDossierDto,
  type EvidenceDossierCaseDto,
  type EvidenceDossierSatelliteDto,
  type EvidenceDossierChangeDetectionDto,
  type EvidenceDossierAlertDto,
  type EvidenceDossierReconciliationDto,
  type EvidenceDossierTransportDto,
  type EvidenceDossierCheckpointDto,
  type EvidenceDossierUavDto,
  type EvidenceDossierAuditDto,
} from '@tn-forest/shared/types';

export interface IEvidenceDossierData {
  caseDetails: EvidenceDossierCaseDto;
  satelliteLineage: EvidenceDossierSatelliteDto[];
  changeDetections: EvidenceDossierChangeDetectionDto[];
  alerts: EvidenceDossierAlertDto[];
  reconciliation?: EvidenceDossierReconciliationDto;
  transportSummary?: EvidenceDossierTransportDto;
  checkpointPassages: EvidenceDossierCheckpointDto[];
  uavVerification?: EvidenceDossierUavDto;
  auditTrail: EvidenceDossierAuditDto[];
}

export interface IEvidenceDossier extends Document {
  dossierId: string;
  caseId: Types.ObjectId;
  caseNumber: string;
  dossierVersion: number;
  dossierHash: string;
  hashAlgorithm: string;
  isSealed: boolean;
  sealedAt: Date;
  sealedBy?: Types.ObjectId;
  sealedByName?: string;
  canonicalPayload: string;
  dossierData: IEvidenceDossierData;
  createdAt: Date;
  updatedAt: Date;

  toDto(): EvidenceDossierDto;
}

const evidenceDossierSchema = new Schema<IEvidenceDossier>(
  {
    dossierId: {
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
    dossierVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    dossierHash: {
      type: String,
      required: true,
      trim: true,
    },
    hashAlgorithm: {
      type: String,
      required: true,
      default: 'SHA-256',
    },
    isSealed: {
      type: Boolean,
      required: true,
      default: true,
    },
    sealedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    sealedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    sealedByName: {
      type: String,
      trim: true,
    },
    canonicalPayload: {
      type: String,
      required: true,
    },
    dossierData: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

evidenceDossierSchema.index({ caseId: 1, dossierVersion: -1 });

evidenceDossierSchema.methods.toDto = function (this: IEvidenceDossier): EvidenceDossierDto {
  const d = this.dossierData || ({} as IEvidenceDossierData);
  return {
    id: this._id.toString(),
    dossierId: this.dossierId,
    caseId: this.caseId.toString(),
    caseNumber: this.caseNumber,
    dossierVersion: this.dossierVersion,
    dossierHash: this.dossierHash,
    hashAlgorithm: this.hashAlgorithm,
    isSealed: this.isSealed,
    sealedAt: this.sealedAt.toISOString(),
    sealedBy: this.sealedBy?.toString(),
    sealedByName: this.sealedByName,
    caseDetails: d.caseDetails,
    satelliteLineage: d.satelliteLineage ?? [],
    changeDetections: d.changeDetections ?? [],
    alerts: d.alerts ?? [],
    reconciliation: d.reconciliation,
    transportSummary: d.transportSummary,
    checkpointPassages: d.checkpointPassages ?? [],
    uavVerification: d.uavVerification,
    auditTrail: d.auditTrail ?? [],
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const EvidenceDossierModel = model<IEvidenceDossier>(
  'EvidenceDossier',
  evidenceDossierSchema,
);
