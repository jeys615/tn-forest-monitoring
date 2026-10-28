import { apiClient } from '../config/api';
import type {
  MarkedAreaAnalysisRequest,
  MarkedAreaAnalysisReportDto,
  BeforeAfterComparisonDto,
  ApiResponse,
} from '@tn-forest/shared/types';

export const markedAreaService = {
  async analyzeMarkedArea(request: MarkedAreaAnalysisRequest): Promise<MarkedAreaAnalysisReportDto> {
    const response = await apiClient.post<ApiResponse<MarkedAreaAnalysisReportDto>>(
      '/marked-areas/analyze',
      request,
    );
    return response.data.data!;
  },

  async analyzeZone(
    zoneId: string,
    options: {
      startDate?: string;
      endDate?: string;
      demElevationDataAvailable?: boolean;
      estimatedMeanDepthMeters?: number;
    } = {},
  ): Promise<MarkedAreaAnalysisReportDto> {
    const response = await apiClient.post<ApiResponse<MarkedAreaAnalysisReportDto>>(
      `/zones/${zoneId}/analysis`,
      options,
    );
    return response.data.data!;
  },

  async getBeforeAfterComparison(
    areaId: string,
    beforeObsId: string,
    afterObsId: string,
  ): Promise<BeforeAfterComparisonDto | null> {
    try {
      const response = await apiClient.get<ApiResponse<BeforeAfterComparisonDto>>(
        `/marked-areas/comparison?areaId=${areaId}&before=${beforeObsId}&after=${afterObsId}`,
      );
      return response.data.data || null;
    } catch {
      return null;
    }
  },
};
