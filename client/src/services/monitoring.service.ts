import { apiClient } from '../config/api';
import type {
  MonitoringJobDto,
  ScheduleMonitoringJobRequest,
  IncrementalMonitoringStatusDto,
  AreaMonitoringSummaryDto,
  IncrementalMonitoringRecordDto,
  RunMonitoringCycleRequest,
  IncrementalMonitoringCycleResultDto,
  MonitoringHealthDto,
  SystemOperationalStatusDto,
  StaleJobRecoveryResultDto,
  ApiResponse,
} from '@tn-forest/shared/types';

export const monitoringService = {
  getJobs: async (filters?: {
    status?: string;
    zoneId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<MonitoringJobDto[]> => {
    const response = await apiClient.get<ApiResponse<MonitoringJobDto[]>>('/monitoring/jobs', {
      params: filters,
    });
    return response.data.data!;
  },

  getJobById: async (id: string): Promise<MonitoringJobDto> => {
    const response = await apiClient.get<ApiResponse<MonitoringJobDto>>(`/monitoring/jobs/${id}`);
    return response.data.data!;
  },

  scheduleJob: async (data: ScheduleMonitoringJobRequest): Promise<MonitoringJobDto> => {
    const response = await apiClient.post<ApiResponse<MonitoringJobDto>>(
      '/monitoring/schedule',
      data,
    );
    return response.data.data!;
  },

  processJob: async (id: string): Promise<MonitoringJobDto> => {
    const response = await apiClient.post<ApiResponse<MonitoringJobDto>>(
      `/monitoring/jobs/${id}/process`,
    );
    return response.data.data!;
  },

  getStatus: async (): Promise<IncrementalMonitoringStatusDto> => {
    const response = await apiClient.get<ApiResponse<IncrementalMonitoringStatusDto>>('/monitoring/status');
    return response.data.data!;
  },

  getAreaSummaries: async (filters?: { areaType?: string; status?: string }): Promise<AreaMonitoringSummaryDto[]> => {
    const response = await apiClient.get<ApiResponse<AreaMonitoringSummaryDto[]>>('/monitoring/areas', {
      params: filters,
    });
    return response.data.data!;
  },

  runMonitoringCycle: async (data: RunMonitoringCycleRequest = {}): Promise<IncrementalMonitoringCycleResultDto> => {
    const response = await apiClient.post<ApiResponse<IncrementalMonitoringCycleResultDto>>(
      '/monitoring/run-cycle',
      data,
    );
    return response.data.data!;
  },

  retryJob: async (jobId: string): Promise<IncrementalMonitoringRecordDto> => {
    const response = await apiClient.post<ApiResponse<IncrementalMonitoringRecordDto>>(
      `/monitoring/retry/${jobId}`,
    );
    return response.data.data!;
  },

  getHealth: async (): Promise<MonitoringHealthDto> => {
    const response = await apiClient.get<ApiResponse<MonitoringHealthDto>>('/monitoring/health');
    return response.data.data!;
  },

  recoverStaleJobs: async (staleTimeoutMs?: number): Promise<StaleJobRecoveryResultDto> => {
    const response = await apiClient.post<ApiResponse<StaleJobRecoveryResultDto>>('/monitoring/recover-stale', {
      staleTimeoutMs,
    });
    return response.data.data!;
  },

  getSystemStatus: async (): Promise<SystemOperationalStatusDto> => {
    const response = await apiClient.get<ApiResponse<SystemOperationalStatusDto>>('/monitoring/system-status');
    return response.data.data!;
  },

  getIncrementalJobs: async (filters?: {
    areaId?: string;
    areaType?: string;
    lifecycleState?: string;
    sensorType?: string;
  }): Promise<IncrementalMonitoringRecordDto[]> => {
    const response = await apiClient.get<ApiResponse<IncrementalMonitoringRecordDto[]>>(
      '/monitoring/incremental-jobs',
      { params: filters },
    );
    return response.data.data!;
  },
};

