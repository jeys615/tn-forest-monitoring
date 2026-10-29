import { apiClient } from '../config/api';
import type {
  LoginRequest,
  LoginResponse,
  UserDto,
  ChangePasswordRequest,
  RegisterCompanyRequest,
  TransportCompanyDto,
  ApiResponse,
} from '@tn-forest/shared/types';

export const authService = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', credentials);
    return response.data.data!;
  },

  registerCompany: async (
    data: RegisterCompanyRequest,
  ): Promise<LoginResponse & { company: TransportCompanyDto }> => {
    const response = await apiClient.post<ApiResponse<LoginResponse & { company: TransportCompanyDto }>>(
      '/auth/register-company',
      data,
    );
    return response.data.data!;
  },

  getMe: async (): Promise<UserDto> => {
    const response = await apiClient.get<ApiResponse<UserDto>>('/auth/me');
    return response.data.data!;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    await apiClient.post('/auth/change-password', data);
  },
};
