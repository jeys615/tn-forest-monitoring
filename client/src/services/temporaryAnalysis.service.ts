import { apiClient } from '../config/api';
import type {
  TemporaryAreaDto,
  CreateTemporaryAreaRequest,
  TemporaryAreaTimelineItemDto,
  MiningExtractionEstimateDto,
  TemporaryAreaAnalysisReportDto,
  SatelliteMetadataDto,
  ApiResponse,
} from '@tn-forest/shared/types';

export const temporaryAnalysisService = {
  createTemporaryArea: async (data: CreateTemporaryAreaRequest): Promise<TemporaryAreaDto> => {
    const response = await apiClient.post<ApiResponse<TemporaryAreaDto>>(
      '/temporary-analysis',
      data,
    );
    return response.data.data!;
  },

  getTemporaryAreas: async (filters?: {
    status?: string;
    createdBy?: string;
    limit?: number;
  }): Promise<TemporaryAreaDto[]> => {
    const response = await apiClient.get<ApiResponse<TemporaryAreaDto[]>>('/temporary-analysis', {
      params: filters,
    });
    return response.data.data!;
  },

  getTemporaryAreaById: async (id: string): Promise<TemporaryAreaDto> => {
    const response = await apiClient.get<ApiResponse<TemporaryAreaDto>>(
      `/temporary-analysis/${id}`,
    );
    return response.data.data!;
  },

  getHistoricalObservations: async (id: string): Promise<SatelliteMetadataDto[]> => {
    const response = await apiClient.get<ApiResponse<SatelliteMetadataDto[]>>(
      `/temporary-analysis/${id}/observations`,
    );
    return response.data.data!;
  },

  runAnalysis: async (id: string): Promise<TemporaryAreaAnalysisReportDto> => {
    const response = await apiClient.post<ApiResponse<TemporaryAreaAnalysisReportDto>>(
      `/temporary-analysis/${id}/run`,
    );
    return response.data.data!;
  },

  getTimeline: async (id: string): Promise<TemporaryAreaTimelineItemDto[]> => {
    const response = await apiClient.get<ApiResponse<TemporaryAreaTimelineItemDto[]>>(
      `/temporary-analysis/${id}/timeline`,
    );
    return response.data.data!;
  },

  getMiningEstimates: async (id: string): Promise<MiningExtractionEstimateDto[]> => {
    const response = await apiClient.get<ApiResponse<MiningExtractionEstimateDto[]>>(
      `/temporary-analysis/${id}/mining-estimate`,
    );
    return response.data.data!;
  },

  getReport: async (id: string): Promise<TemporaryAreaAnalysisReportDto> => {
    const response = await apiClient.get<ApiResponse<TemporaryAreaAnalysisReportDto>>(
      `/temporary-analysis/${id}/report`,
    );
    return response.data.data!;
  },
};
