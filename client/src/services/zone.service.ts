import { apiClient } from '../config/api';
import type {
  ZoneDto,
  CreateZoneRequest,
  UpdateZoneRequest,
  ZoneCategory,
  ZoneStatus,
  ApiResponse,
} from '@tn-forest/shared/types';

export const zoneService = {
  getZones: async (filters?: {
    category?: ZoneCategory;
    status?: ZoneStatus;
    search?: string;
  }): Promise<ZoneDto[]> => {
    const response = await apiClient.get<ApiResponse<ZoneDto[]>>('/zones', { params: filters });
    return response.data.data!;
  },

  getZoneById: async (id: string): Promise<ZoneDto> => {
    const response = await apiClient.get<ApiResponse<ZoneDto>>(`/zones/${id}`);
    return response.data.data!;
  },

  createZone: async (data: CreateZoneRequest): Promise<ZoneDto> => {
    const response = await apiClient.post<ApiResponse<ZoneDto>>('/zones', data);
    return response.data.data!;
  },

  updateZone: async (id: string, data: UpdateZoneRequest): Promise<ZoneDto> => {
    const response = await apiClient.patch<ApiResponse<ZoneDto>>(`/zones/${id}`, data);
    return response.data.data!;
  },

  suspendZone: async (id: string): Promise<ZoneDto> => {
    const response = await apiClient.patch<ApiResponse<ZoneDto>>(`/zones/${id}/suspend`);
    return response.data.data!;
  },
};
