import { z } from 'zod';
import {
  CaseStatus,
  CaseSeverity,
  CaseType,
  EnforcementActionType,
} from '@tn-forest/shared/types';

export const createCaseSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(3, 'Description must be at least 3 characters'),
  severity: z.nativeEnum(CaseSeverity),
  caseType: z.nativeEnum(CaseType),
  zoneId: z.string().optional(),
  authorizationId: z.string().optional(),
  reconciliationReportId: z.string().optional(),
  assignedOfficerId: z.string().optional(),
  investigationFindings: z.array(z.string()).optional(),
});

export const createFromReconciliationSchema = z.object({
  reconciliationReportId: z.string().min(1, 'reconciliationReportId is required'),
  assignedOfficerId: z.string().optional(),
  customTitle: z.string().optional(),
  customDescription: z.string().optional(),
});

export const assignOfficerSchema = z.object({
  assignedOfficerId: z.string().min(1, 'assignedOfficerId is required'),
  remarks: z.string().optional(),
});

export const updateCaseStatusSchema = z.object({
  status: z.nativeEnum(CaseStatus),
  remarks: z.string().optional(),
});

export const evidencePhotoUrlSchema = z
  .string()
  .min(1, 'Photo URL cannot be empty')
  .max(500, 'Photo URL must not exceed 500 characters')
  .url('Must be a valid URL')
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        // Only HTTPS scheme permitted
        if (parsed.protocol !== 'https:') {
          return false;
        }
        // Hostname must be present and valid
        if (!parsed.hostname || parsed.hostname.length < 3) {
          return false;
        }
        const lowerHost = parsed.hostname.toLowerCase();
        // Reject localhost, loopback, private RFC 1918, link-local, and internal addresses
        if (
          lowerHost === 'localhost' ||
          lowerHost.startsWith('127.') ||
          lowerHost === '0.0.0.0' ||
          lowerHost.endsWith('.local') ||
          lowerHost.endsWith('.internal') ||
          lowerHost.startsWith('10.') ||
          lowerHost.startsWith('192.168.') ||
          lowerHost.startsWith('169.254.') ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lowerHost)
        ) {
          return false;
        }
        // Reject dangerous characters that indicate injection
        if (val.includes('<') || val.includes('>') || val.includes('"') || val.includes('\'') || val.includes('\n') || val.includes('\r')) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        'Evidence photo URL must be a valid secure HTTPS URL and not use forbidden protocols (e.g. javascript:, data:, file:, http:) or local addresses',
    },
  );

export const updateInvestigationSchema = z.object({
  findings: z.array(z.string()).optional(),
  fieldVerification: z
    .object({
      verifiedAt: z.string().optional(),
      locationCoordinates: z.tuple([z.number(), z.number()]).optional(),
      siteObservations: z.string().optional(),
      photoUrls: z.array(evidencePhotoUrlSchema).max(10, 'Maximum of 10 evidence photo URLs allowed').optional(),
      droneSurveyConducted: z.boolean().optional(),
      groundDisturbanceConfirmed: z.boolean().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  remarks: z.string().optional(),
});

export const recordEnforcementActionSchema = z.object({
  actionType: z.nativeEnum(EnforcementActionType),
  actionDetails: z.string().min(3, 'Action details must be at least 3 characters'),
  penaltyAmountInr: z.number().min(0).optional(),
  officialOrderReference: z.string().optional(),
  actionDate: z.string().optional(),
  remarks: z.string().optional(),
});

export const closeCaseSchema = z.object({
  resolutionSummary: z.string().min(3, 'Resolution summary must be at least 3 characters'),
  followUpRequired: z.boolean().optional(),
  remarks: z.string().optional(),
});

export const queryCaseSchema = z.object({
  status: z.nativeEnum(CaseStatus).optional(),
  severity: z.nativeEnum(CaseSeverity).optional(),
  caseType: z.nativeEnum(CaseType).optional(),
  zoneId: z.string().optional(),
  authorizationId: z.string().optional(),
  assignedOfficerId: z.string().optional(),
  reconciliationReportId: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(50),
  skip: z.coerce.number().min(0).optional().default(0),
});
