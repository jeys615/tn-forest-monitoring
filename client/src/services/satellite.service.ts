import { apiClient } from '../config/api';
import type {
  SatelliteMetadataDto,
  AcquireImageRequest,
  GeoJSONPolygon,
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  ApiResponse,
  SatelliteSearchRequest,
  SatelliteSearchResponse,
} from '@tn-forest/shared/types';

export const satelliteService = {
  getImages: async (filters?: {
    source?: SatelliteSource;
    sensorType?: SensorType;
    processingStatus?: SatelliteProcessingStatus;
    zoneId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<SatelliteMetadataDto[]> => {
    const response = await apiClient.get<ApiResponse<SatelliteMetadataDto[]>>('/satellite/images', {
      params: filters,
    });
    return response.data.data!;
  },

  getImageById: async (id: string): Promise<SatelliteMetadataDto> => {
    const response = await apiClient.get<ApiResponse<SatelliteMetadataDto>>(`/satellite/${id}`);
    return response.data.data!;
  },

  acquireImage: async (data: AcquireImageRequest): Promise<SatelliteMetadataDto> => {
    const response = await apiClient.post<ApiResponse<SatelliteMetadataDto>>(
      '/satellite/acquire',
      data,
    );
    return response.data.data!;
  },

  searchImages: async (data: SatelliteSearchRequest): Promise<SatelliteSearchResponse> => {
    const response = await apiClient.post<ApiResponse<SatelliteSearchResponse>>(
      '/satellite/search',
      data,
    );
    return response.data.data!;
  },

  queryFootprint: async (footprint: GeoJSONPolygon): Promise<SatelliteMetadataDto[]> => {
    const response = await apiClient.post<ApiResponse<SatelliteMetadataDto[]>>(
      '/satellite/query-footprint',
      footprint,
    );
    return response.data.data!;
  },

  exportRaster: async (
    id: string,
    options?: { zoneId?: string; sync?: boolean; force?: boolean },
  ): Promise<SatelliteMetadataDto> => {
    const response = await apiClient.post<ApiResponse<SatelliteMetadataDto>>(
      `/satellite/${id}/export`,
      { sync: false, ...options },
    );
    return response.data.data!;
  },
};
