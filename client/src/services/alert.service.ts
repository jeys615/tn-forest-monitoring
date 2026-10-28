import { apiClient } from '../config/api';
import type {
  AlertDto,
  AlertAuditEntryDto,
  AlertStatsDto,
  AlertListResponseDto,
  AlertActionRequest,
  AlertAssignRequest,
  UpdateAlertStatusRequest,
  AlertSeverity,
  AlertStatus,
  AlertAction,
  SensorType,
  MonitoringTrack,
  ChangeCategory,
  ApiResponse,
  ComparisonMode,
} from '@tn-forest/shared/types';

export interface AlertQueryFilters {
  zoneId?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  sensorType?: SensorType;
  monitoringTrack?: MonitoringTrack;
  category?: ChangeCategory;
  assignedTo?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: 'newest' | 'oldest' | 'severity' | 'affectedArea';
  page?: number;
  pageSize?: number;
  limit?: number;
  /** Filter by comparison mode (NATIVE | HLS). Only applies to OPTICAL track alerts. */
  comparisonMode?: ComparisonMode | string;
}

export const alertService = {
  // ─── List & stats ───────────────────────────────────────────────────────────

  getAlerts: async (filters?: AlertQueryFilters): Promise<AlertListResponseDto> => {
    const response = await apiClient.get<
      ApiResponse<AlertDto[]> & {
        total?: number;
        page?: number;
        pageSize?: number;
        totalPages?: number;
      }
    >('/alerts', { params: filters });
    const { data: axiosData } = response;
    return {
      data: axiosData.data ?? [],
      total: axiosData.total ?? axiosData.data?.length ?? 0,
      page: axiosData.page ?? 1,
      pageSize: axiosData.pageSize ?? 50,
      totalPages: axiosData.totalPages ?? 1,
    };
  },

  getAlertStats: async (filters?: {
    zoneId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<AlertStatsDto> => {
    const response = await apiClient.get<ApiResponse<AlertStatsDto>>('/alerts/stats', {
      params: filters,
    });
    return response.data.data!;
  },

  // ─── Single alert ───────────────────────────────────────────────────────────

  getAlertById: async (id: string): Promise<AlertDto> => {
    const response = await apiClient.get<ApiResponse<AlertDto>>(`/alerts/${id}`);
    return response.data.data!;
  },

  // ─── Zone-scoped alerts ────────────────────────────────────────────────────

  getZoneAlerts: async (zoneId: string, limit?: number): Promise<AlertDto[]> => {
    const response = await apiClient.get<ApiResponse<AlertDto[]>>(`/zones/${zoneId}/alerts`, {
      params: { limit },
    });
    return response.data.data!;
  },

  // ─── Audit history ─────────────────────────────────────────────────────────

  getAlertAuditHistory: async (id: string): Promise<AlertAuditEntryDto[]> => {
    const response = await apiClient.get<ApiResponse<AlertAuditEntryDto[]>>(
      `/alerts/${id}/audit`,
    );
    return response.data.data ?? [];
  },

  // ─── Lifecycle action ──────────────────────────────────────────────────────

  performAlertAction: async (id: string, data: AlertActionRequest): Promise<AlertDto> => {
    const response = await apiClient.patch<ApiResponse<AlertDto>>(`/alerts/${id}/action`, data);
    return response.data.data!;
  },

  // ─── Assignment ────────────────────────────────────────────────────────────

  assignAlert: async (id: string, data: AlertAssignRequest): Promise<AlertDto> => {
    const response = await apiClient.patch<ApiResponse<AlertDto>>(`/alerts/${id}/assign`, data);
    return response.data.data!;
  },

  // ─── Legacy status update (kept for backward compat) ──────────────────────

  updateAlertStatus: async (id: string, data: UpdateAlertStatusRequest): Promise<AlertDto> => {
    const response = await apiClient.patch<ApiResponse<AlertDto>>(`/alerts/${id}/status`, data);
    return response.data.data!;
  },
};

export type { AlertAction };
