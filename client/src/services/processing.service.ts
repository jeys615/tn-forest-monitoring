import { apiClient } from '../config/api';
import type {
  ProcessedImageResultDto,
  ProcessImageRequest,
  SensorType,
  ApiResponse,
} from '@tn-forest/shared/types';

export const processingService = {
  getResults: async (filters?: {
    zoneId?: string;
    satelliteMetadataId?: string;
    sensorType?: SensorType;
    limit?: number;
  }): Promise<ProcessedImageResultDto[]> => {
    const response = await apiClient.get<ApiResponse<ProcessedImageResultDto[]>>(
      '/processing/results',
      { params: filters },
    );
    return response.data.data!;
  },

  getResultById: async (id: string): Promise<ProcessedImageResultDto> => {
    const response = await apiClient.get<ApiResponse<ProcessedImageResultDto>>(
      `/processing/results/${id}`,
    );
    return response.data.data!;
  },

  getZoneResults: async (
    zoneId: string,
    limit: number = 20,
  ): Promise<ProcessedImageResultDto[]> => {
    const response = await apiClient.get<ApiResponse<ProcessedImageResultDto[]>>(
      `/zones/${zoneId}/processing-results`,
      { params: { limit } },
    );
    return response.data.data!;
  },

  processImage: async (data: ProcessImageRequest): Promise<ProcessedImageResultDto> => {
    const response = await apiClient.post<ApiResponse<ProcessedImageResultDto>>(
      '/processing/process',
      data,
    );
    return response.data.data!;
  },
};
