import { apiClient } from '../config/api';

export interface HealthCheckResponse {
  status: string;
  environment: string;
  timestamp: string;
  uptime: number;
  database: {
    status: string;
  };
}

export const apiService = {
  healthCheck: async (): Promise<HealthCheckResponse> => {
    const response = await apiClient.get('/health');
    return response.data.data;
  },
};
