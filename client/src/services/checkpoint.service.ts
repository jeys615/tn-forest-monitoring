import { apiClient as api } from '../config/api';
import type {
  CheckpointDto,
  CreateCheckpointRequest,
  UpdateCheckpointRequest,
  VerifyEPassRequest,
  VerifyEPassResponse,
  RecordPassageRequest,
  RecordPassageResponse,
  CheckpointLogDto,
  CheckpointSummaryDto,
  CheckpointStatus,
  CheckpointVerificationResult,
} from '@tn-forest/shared/types';

export const checkpointService = {
  // Checkpoints
  async getCheckpoints(params?: { status?: CheckpointStatus; district?: string }): Promise<CheckpointDto[]> {
    const res = await api.get('/checkpoints', { params });
    return res.data.data;
  },

  async getCheckpointById(id: string): Promise<CheckpointDto> {
    const res = await api.get(`/checkpoints/${id}`);
    return res.data.data;
  },

  async createCheckpoint(data: CreateCheckpointRequest): Promise<CheckpointDto> {
    const res = await api.post('/checkpoints', data);
    return res.data.data;
  },

  async updateCheckpoint(id: string, data: UpdateCheckpointRequest): Promise<CheckpointDto> {
    const res = await api.put(`/checkpoints/${id}`, data);
    return res.data.data;
  },

  // Verification & Passage
  async verifyEPass(data: VerifyEPassRequest): Promise<VerifyEPassResponse> {
    const res = await api.post('/checkpoints/verify', data);
    return res.data.data;
  },

  async recordPassage(data: RecordPassageRequest): Promise<RecordPassageResponse> {
    const res = await api.post('/checkpoints/record-passage', data);
    return res.data.data;
  },

  // Logs & Summary
  async getLogs(params?: {
    checkpointId?: string;
    zoneId?: string;
    passNumber?: string;
    verificationResult?: CheckpointVerificationResult;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<CheckpointLogDto[]> {
    const res = await api.get('/checkpoints/logs', { params });
    return res.data.data;
  },

  async getPassVerificationHistory(passNumber: string): Promise<CheckpointLogDto[]> {
    const res = await api.get(`/checkpoints/logs/epass/${passNumber}`);
    return res.data.data;
  },

  async getSummaryStats(): Promise<CheckpointSummaryDto> {
    const res = await api.get('/checkpoints/summary');
    return res.data.data;
  },
};

export default checkpointService;
