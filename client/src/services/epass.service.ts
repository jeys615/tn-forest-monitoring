import { apiClient } from '../config/api';
import type {
  EPassDto,
  CreateEPassRequest,
  EPassSummaryDto,
  MiningAuthorizationDto,
  CreateMiningAuthorizationRequest,
  VehicleDto,
  CreateVehicleRequest,
  DriverDto,
  CreateDriverRequest,
  TransportCompanyDto,
  CreateTransportCompanyRequest,
  ApiResponse,
} from '@tn-forest/shared/types';

export const epassService = {
  // E-Passes
  getEPasses: async (filters?: {
    status?: string;
    authorizationId?: string;
    zoneId?: string;
    vehicleId?: string;
    driverId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<EPassDto[]> => {
    const response = await apiClient.get<ApiResponse<EPassDto[]>>('/epasses', {
      params: filters,
    });
    return response.data.data!;
  },

  getEPassById: async (id: string): Promise<EPassDto> => {
    const response = await apiClient.get<ApiResponse<EPassDto>>(`/epasses/${id}`);
    return response.data.data!;
  },

  createEPass: async (data: CreateEPassRequest): Promise<EPassDto> => {
    const response = await apiClient.post<ApiResponse<EPassDto>>('/epasses', data);
    return response.data.data!;
  },

  cancelEPass: async (id: string, reason?: string): Promise<EPassDto> => {
    const response = await apiClient.put<ApiResponse<EPassDto>>(`/epasses/${id}/cancel`, {
      reason,
    });
    return response.data.data!;
  },

  verifyEPass: async (passNumberOrId: string): Promise<EPassDto> => {
    const response = await apiClient.get<ApiResponse<EPassDto>>(
      `/epasses/verify/${passNumberOrId}`,
    );
    return response.data.data!;
  },

  getSummaryStats: async (): Promise<EPassSummaryDto> => {
    const response = await apiClient.get<ApiResponse<EPassSummaryDto>>('/epasses/summary');
    return response.data.data!;
  },

  // Mining Authorizations
  getAuthorizations: async (filters?: {
    status?: string;
    zoneId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<MiningAuthorizationDto[]> => {
    const response = await apiClient.get<ApiResponse<MiningAuthorizationDto[]>>(
      '/mining-authorizations',
      { params: filters },
    );
    return response.data.data!;
  },

  createAuthorization: async (
    data: CreateMiningAuthorizationRequest,
  ): Promise<MiningAuthorizationDto> => {
    const response = await apiClient.post<ApiResponse<MiningAuthorizationDto>>(
      '/mining-authorizations',
      data,
    );
    return response.data.data!;
  },

  // Vehicles
  getVehicles: async (filters?: {
    status?: string;
    transportCompanyId?: string;
    zoneId?: string;
  }): Promise<VehicleDto[]> => {
    const response = await apiClient.get<ApiResponse<VehicleDto[]>>('/vehicles', {
      params: filters,
    });
    return response.data.data!;
  },

  createVehicle: async (data: CreateVehicleRequest): Promise<VehicleDto> => {
    const response = await apiClient.post<ApiResponse<VehicleDto>>('/vehicles', data);
    return response.data.data!;
  },

  // Drivers
  getDrivers: async (filters?: {
    verificationStatus?: string;
    transportCompanyId?: string;
    zoneId?: string;
  }): Promise<DriverDto[]> => {
    const response = await apiClient.get<ApiResponse<DriverDto[]>>('/drivers', {
      params: filters,
    });
    return response.data.data!;
  },

  createDriver: async (data: CreateDriverRequest): Promise<DriverDto> => {
    const response = await apiClient.post<ApiResponse<DriverDto>>('/drivers', data);
    return response.data.data!;
  },

  // Transport Companies
  getTransportCompanies: async (): Promise<TransportCompanyDto[]> => {
    const response = await apiClient.get<ApiResponse<TransportCompanyDto[]>>(
      '/transport-companies',
    );
    return response.data.data!;
  },

  createTransportCompany: async (
    data: CreateTransportCompanyRequest,
  ): Promise<TransportCompanyDto> => {
    const response = await apiClient.post<ApiResponse<TransportCompanyDto>>(
      '/transport-companies',
      data,
    );
    return response.data.data!;
  },

  getMyCompany: async (): Promise<TransportCompanyDto> => {
    const response = await apiClient.get<ApiResponse<TransportCompanyDto>>(
      '/transport-companies/my-company',
    );
    return response.data.data!;
  },

  updateTransportCompany: async (
    id: string,
    data: Partial<CreateTransportCompanyRequest>,
  ): Promise<TransportCompanyDto> => {
    const response = await apiClient.put<ApiResponse<TransportCompanyDto>>(
      `/transport-companies/${id}`,
      data,
    );
    return response.data.data!;
  },
};
