import { apiClient as api } from '../config/api';
import type {
  ComplianceReportDto,
  ComplianceReportFilters,
} from '@tn-forest/shared/types';

export const reportsService = {
  /**
   * Retrieves unique districts persisted on registered checkpoints.
   */
  async getDistricts(): Promise<string[]> {
    const response = await api.get('/reports/districts');
    return response.data.data;
  },

  /**
   * Retrieves executive KPI summary metrics, zone compliance status,
   * statutory violation breakdown, and enforcement actions.
   */
  async getSummary(filters?: ComplianceReportFilters): Promise<ComplianceReportDto> {
    const params: Record<string, string | undefined> = {};
    if (filters?.startDate) params.startDate = filters.startDate;
    if (filters?.endDate) params.endDate = filters.endDate;
    if (filters?.zoneId) params.zoneId = filters.zoneId;
    if (filters?.district) params.district = filters.district;
    if (filters?.severity) params.severity = filters.severity;

    const response = await api.get('/reports/summary', { params });
    return response.data.data;
  },

  /**
   * Generates and downloads the Statutory Compliance Report in JSON or RFC 4180 CSV format.
   */
  async getComplianceReport(
    filters?: ComplianceReportFilters,
    format: 'json' | 'csv' = 'json',
  ): Promise<ComplianceReportDto | Blob> {
    const params: Record<string, string | undefined> = { format };
    if (filters?.startDate) params.startDate = filters.startDate;
    if (filters?.endDate) params.endDate = filters.endDate;
    if (filters?.zoneId) params.zoneId = filters.zoneId;
    if (filters?.district) params.district = filters.district;
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
