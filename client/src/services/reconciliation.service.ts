import { apiClient as api } from '../config/api';
import type {
  ReconciliationReportDto,
  RunReconciliationRequest,
  UpdateReconciliationStatusRequest,
  ReconciliationSummaryDto,
  ReconciliationReportStatus,
  ReconciliationStatus,
} from '@tn-forest/shared/types';

export const reconciliationService = {
  async getSummary(): Promise<ReconciliationSummaryDto> {
    const res = await api.get('/reconciliation/summary');
    return res.data.data;
  },

  async getReports(params?: {
    zoneId?: string;
    authorizationId?: string;
    status?: ReconciliationReportStatus;
    reconciliationStatus?: ReconciliationStatus;
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
  }): Promise<ReconciliationReportDto[]> {
    const res = await api.get('/reconciliation/reports', { params });
    return res.data.data;
  },

  async getReportById(id: string): Promise<ReconciliationReportDto> {
    const res = await api.get(`/reconciliation/reports/${id}`);
    return res.data.data;
  },

  async runReconciliation(data: RunReconciliationRequest): Promise<ReconciliationReportDto> {
    const res = await api.post('/reconciliation/run', data);
    return res.data.data;
  },

  async updateReportStatus(
    id: string,
    data: UpdateReconciliationStatusRequest,
  ): Promise<ReconciliationReportDto> {
    const res = await api.patch(`/reconciliation/reports/${id}/status`, data);
    return res.data.data;
  },

  async getZoneHistory(zoneId: string): Promise<ReconciliationReportDto[]> {
    const res = await api.get(`/reconciliation/zone/${zoneId}`);
    return res.data.data;
  },
};
