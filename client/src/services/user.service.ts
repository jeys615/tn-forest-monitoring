import { apiClient } from '../config/api';
import type {
  UserDto,
  CreateUserRequest,
  UpdateUserRequest,
  UserStatus,
  UserRole,
  ApiResponse,
} from '@tn-forest/shared/types';

export const userService = {
  getUsers: async (filters?: { role?: UserRole; status?: UserStatus }): Promise<UserDto[]> => {
    const response = await apiClient.get<ApiResponse<UserDto[]>>('/users', { params: filters });
    return response.data.data!;
  },

  getUserById: async (id: string): Promise<UserDto> => {
    const response = await apiClient.get<ApiResponse<UserDto>>(`/users/${id}`);
    return response.data.data!;
  },

  createUser: async (data: CreateUserRequest): Promise<UserDto> => {
    const response = await apiClient.post<ApiResponse<UserDto>>('/users', data);
    return response.data.data!;
  },

  updateUser: async (id: string, data: UpdateUserRequest): Promise<UserDto> => {
    const response = await apiClient.patch<ApiResponse<UserDto>>(`/users/${id}`, data);
    return response.data.data!;
  },

  updateUserStatus: async (id: string, status: UserStatus): Promise<UserDto> => {
    const response = await apiClient.patch<ApiResponse<UserDto>>(`/users/${id}/status`, { status });
    return response.data.data!;
  },
};
