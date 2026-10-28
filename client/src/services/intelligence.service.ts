import { apiClient as api } from '../config/api';
import type {
  ExecutiveIntelligenceSummaryDto,
  ZoneRiskIntelligenceDto,
  CrossModuleCorrelationDto,
  AlertIntelligenceSummaryDto,
  TransportMiningIntelligenceSummaryDto,
  EnforcementIntelligenceSummaryDto,
  TrendAnalyticsDto,
  HotspotPriorityRankingsDto,
  DecisionSupportSummaryDto,
  IntelligenceQueryFilters,
  TimeRangePreset,
  InvestigationTimelineDto,
  IntelligenceSearchDto,
  AlertLineageCorrelationDto,
  LeaseLineageCorrelationDto,
  VehicleLineageCorrelationDto,
  EPassLineageCorrelationDto,
} from '@tn-forest/shared/types';

export const intelligenceService = {
  async getSummary(): Promise<ExecutiveIntelligenceSummaryDto> {
    const response = await api.get('/intelligence/summary');
    return response.data.data;
  },

  async getZoneRiskList(filters?: IntelligenceQueryFilters): Promise<ZoneRiskIntelligenceDto[]> {
    const params: Record<string, string | number | undefined> = {};
    if (filters) {
      if (filters.zoneId) params.zoneId = filters.zoneId;
      if (filters.riskLevel) params.riskLevel = filters.riskLevel;
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;
      if (filters.preset) params.preset = filters.preset;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.limit) params.limit = filters.limit;
      if (filters.skip) params.skip = filters.skip;
    }
    const response = await api.get('/intelligence/zones', { params });
    return response.data.data;
  },

  async getZoneRiskDetail(zoneId: string): Promise<ZoneRiskIntelligenceDto> {
    const response = await api.get(`/intelligence/zones/${zoneId}`);
    return response.data.data;
  },

  async getCorrelation(zoneId: string): Promise<CrossModuleCorrelationDto> {
    const response = await api.get(`/intelligence/correlation/${zoneId}`);
    return response.data.data;
  },

  async getAlertSummary(): Promise<AlertIntelligenceSummaryDto> {
    const response = await api.get('/intelligence/alerts');
    return response.data.data;
  },

  async getTransportSummary(): Promise<TransportMiningIntelligenceSummaryDto> {
    const response = await api.get('/intelligence/transport');
    return response.data.data;
  },

  async getEnforcementSummary(): Promise<EnforcementIntelligenceSummaryDto> {
    const response = await api.get('/intelligence/enforcement');
    return response.data.data;
  },

  async getTrends(
    preset?: TimeRangePreset,
    startDate?: string,
    endDate?: string,
  ): Promise<TrendAnalyticsDto> {
    const params: Record<string, string | undefined> = {};
    if (preset) params.preset = preset;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const response = await api.get('/intelligence/trends', { params });
    return response.data.data;
  },

  async getHotspots(): Promise<HotspotPriorityRankingsDto> {
    const response = await api.get('/intelligence/hotspots');
    return response.data.data;
  },

  async getDecisionSupport(): Promise<DecisionSupportSummaryDto> {
    const response = await api.get('/intelligence/decision-support');
    return response.data.data;
  },

  async getTimeline(filters?: {
    zoneId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    eventType?: string;
    module?: string;
  }): Promise<InvestigationTimelineDto> {
    const response = await api.get('/intelligence/timeline', { params: filters });
    return response.data.data;
  },

  async search(query: string, limit?: number): Promise<IntelligenceSearchDto> {
    const response = await api.get('/intelligence/search', { params: { q: query, limit } });
    return response.data.data;
  },

  async getAlertDetail(alertId: string): Promise<AlertLineageCorrelationDto> {
    const response = await api.get(`/intelligence/alerts/${alertId}`);
    return response.data.data;
  },

  async getLeaseDetail(leaseId: string): Promise<LeaseLineageCorrelationDto> {
    const response = await api.get(`/intelligence/leases/${leaseId}`);
    return response.data.data;
  },

  async getVehicleDetail(vehicleId: string): Promise<VehicleLineageCorrelationDto> {
    const response = await api.get(`/intelligence/vehicles/${vehicleId}`);
    return response.data.data;
  },

  async getEPassDetail(passId: string): Promise<EPassLineageCorrelationDto> {
    const response = await api.get(`/intelligence/epasses/${passId}`);
    return response.data.data;
  },
};
