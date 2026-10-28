import { apiClient } from '../config/api';
import type {
  BaselineDto,
  SelectBaselineCandidateRequest,
  SelectBaselineResponse,
  SensorType,
  BaselineStatus,
  ApiResponse,
  AvailableSatelliteObservationDto,
  EvaluateBaselineCandidateRequest,
  BaselineVerificationResultDto,
} from '@tn-forest/shared/types';

export const baselineService = {
  getBaselines: async (filters?: {
    zoneId?: string;
    sensorType?: SensorType;
    status?: BaselineStatus;
    isActive?: boolean;
  }): Promise<BaselineDto[]> => {
    const response = await apiClient.get<ApiResponse<BaselineDto[]>>('/baselines', {
      params: filters,
    });
    return response.data.data!;
  },

  getBaselineById: async (id: string): Promise<BaselineDto> => {
    const response = await apiClient.get<ApiResponse<BaselineDto>>(`/baselines/${id}`);
    return response.data.data!;
  },

  getZoneBaselines: async (zoneId: string, sensorType?: SensorType): Promise<BaselineDto[]> => {
    const response = await apiClient.get<ApiResponse<BaselineDto[]>>(`/zones/${zoneId}/baselines`, {
      params: { sensorType },
    });
    return response.data.data!;
  },

  getCandidates: async (filters: {
    zoneId: string;
    sensorType?: SensorType;
  }): Promise<AvailableSatelliteObservationDto[]> => {
    const response = await apiClient.get<ApiResponse<AvailableSatelliteObservationDto[]>>(
      '/baselines/candidates',
      {
        params: filters,
      },
    );
    return response.data.data!;
  },

  evaluateCandidate: async (
    data: EvaluateBaselineCandidateRequest,
  ): Promise<BaselineVerificationResultDto> => {
    const response = await apiClient.post<ApiResponse<BaselineVerificationResultDto>>(
      '/baselines/evaluate',
      data,
    );
    return response.data.data!;
  },

  selectCandidate: async (
    data: SelectBaselineCandidateRequest,
  ): Promise<SelectBaselineResponse> => {
    const response = await apiClient.post<ApiResponse<SelectBaselineResponse>>(
      '/baselines/select',
      data,
    );
    return response.data.data!;
  },

  activateBaseline: async (id: string): Promise<BaselineDto> => {
    const response = await apiClient.post<ApiResponse<BaselineDto>>(`/baselines/${id}/activate`);
    return response.data.data!;
  },
};
