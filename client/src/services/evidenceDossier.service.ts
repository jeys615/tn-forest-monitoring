import { apiClient as api } from '../config/api';
import type {
  EvidenceDossierDto,
  VerifyDossierResponseDto,
  ComplianceReportDto,
  ComplianceReportFilters,
} from '@tn-forest/shared/types';

export const evidenceDossierService = {
  /**
   * Compiles or retrieves the sealed cryptographic evidence dossier for a given enforcement case.
   */
  async compileDossier(caseId: string): Promise<EvidenceDossierDto> {
    const response = await api.post(`/evidence-dossiers/compile/${caseId}`);
    return response.data.data;
  },

  /**
   * Retrieves the latest active evidence dossier for an enforcement case.
   */
  async getLatestDossier(caseId: string): Promise<EvidenceDossierDto> {
    const response = await api.get(`/evidence-dossiers/case/${caseId}/latest`);
    return response.data.data;
  },

  /**
   * Retrieves a specific version/dossier by its unique dossierId.
   */
  async getDossierById(dossierId: string): Promise<EvidenceDossierDto> {
    const response = await api.get(`/evidence-dossiers/${dossierId}`);
    return response.data.data;
  },

  /**
   * Performs real-time server-side cryptographic tamper-evident verification
   * using SHA-256 and constant-time comparison against canonical payload.
   */
  async verifyDossierIntegrity(dossierId: string): Promise<VerifyDossierResponseDto> {
    const response = await api.post(`/evidence-dossiers/verify/${dossierId}`);
    return response.data.data;
  },

  /**
   * Generates and downloads the Statutory Compliance Report in JSON or RFC 4180 CSV format.
   */
  async getComplianceReport(filters?: ComplianceReportFilters, format: 'json' | 'csv' = 'json'): Promise<ComplianceReportDto | Blob> {
    const params: Record<string, string | undefined> = { format };
    if (filters?.startDate) params.startDate = filters.startDate;
    if (filters?.endDate) params.endDate = filters.endDate;
    if (filters?.zoneId) params.zoneId = filters.zoneId;
    if (filters?.severity) params.severity = filters.severity;

    if (format === 'csv') {
      const response = await api.get('/reports/compliance', {
        params,
        responseType: 'blob',
      });
      return response.data;
    }

    const response = await api.get('/reports/compliance', { params });
    return response.data.data;
  },
};
