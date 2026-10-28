import { apiClient as api } from '../config/api';
import type {
  EnforcementCaseDto,
  CaseAuditLogDto,
  CreateEnforcementCaseRequest,
  CreateCaseFromReconciliationRequest,
  AssignOfficerRequest,
  UpdateCaseStatusRequest,
  UpdateInvestigationRequest,
  RecordEnforcementActionRequest,
  CloseCaseRequest,
  EnforcementCaseFilters,
  EnforcementCaseSummaryDto,
} from '@tn-forest/shared/types';

export const enforcementCaseService = {
  async getAll(filters?: EnforcementCaseFilters): Promise<EnforcementCaseDto[]> {
    const params: Record<string, string | number | undefined> = {};
    if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.caseType) params.caseType = filters.caseType;
      if (filters.zoneId) params.zoneId = filters.zoneId;
      if (filters.authorizationId) params.authorizationId = filters.authorizationId;
      if (filters.assignedOfficerId) params.assignedOfficerId = filters.assignedOfficerId;
      if (filters.reconciliationReportId) params.reconciliationReportId = filters.reconciliationReportId;
      if (filters.search) params.search = filters.search;
      if (filters.startDate)
        params.startDate =
          filters.startDate instanceof Date ? filters.startDate.toISOString() : String(filters.startDate);
      if (filters.endDate)
        params.endDate =
          filters.endDate instanceof Date ? filters.endDate.toISOString() : String(filters.endDate);
      if (filters.limit) params.limit = filters.limit;
      if (filters.skip) params.skip = filters.skip;
    }
    const response = await api.get('/enforcement-cases', { params });
    return response.data.data;
  },

  async getById(id: string): Promise<EnforcementCaseDto> {
    const response = await api.get(`/enforcement-cases/${id}`);
    return response.data.data;
  },

  async getSummary(): Promise<EnforcementCaseSummaryDto> {
    const response = await api.get('/enforcement-cases/summary');
    return response.data.data;
  },

  async create(data: CreateEnforcementCaseRequest): Promise<EnforcementCaseDto> {
    const response = await api.post('/enforcement-cases', data);
    return response.data.data;
  },

  async createFromReconciliation(
    data: CreateCaseFromReconciliationRequest,
  ): Promise<EnforcementCaseDto> {
    const response = await api.post(
      '/enforcement-cases/from-reconciliation',
      data,
    );
    return response.data.data;
  },

  async assignOfficer(id: string, data: AssignOfficerRequest): Promise<EnforcementCaseDto> {
    const response = await api.patch(
      `/enforcement-cases/${id}/assign`,
      data,
    );
    return response.data.data;
  },

  async updateStatus(id: string, data: UpdateCaseStatusRequest): Promise<EnforcementCaseDto> {
    const response = await api.patch(
      `/enforcement-cases/${id}/status`,
      data,
    );
    return response.data.data;
  },

  async updateInvestigation(
    id: string,
    data: UpdateInvestigationRequest,
  ): Promise<EnforcementCaseDto> {
    const response = await api.patch(
      `/enforcement-cases/${id}/investigation`,
      data,
    );
    return response.data.data;
  },

  async recordEnforcementAction(
    id: string,
    data: RecordEnforcementActionRequest,
  ): Promise<EnforcementCaseDto> {
    const response = await api.patch(
      `/enforcement-cases/${id}/action`,
      data,
    );
    return response.data.data;
  },

  async closeCase(id: string, data: CloseCaseRequest): Promise<EnforcementCaseDto> {
    const response = await api.patch(
      `/enforcement-cases/${id}/close`,
      data,
    );
    return response.data.data;
  },

  async getAuditHistory(id: string): Promise<CaseAuditLogDto[]> {
    const response = await api.get(
      `/enforcement-cases/${id}/audit`,
    );
    return response.data.data;
  },
};
