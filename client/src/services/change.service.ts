import { apiClient } from '../config/api';
import type {
  ChangeDetectionDto,
  DetectChangeRequest,
  SensorType,
  SatelliteSource,
  AlertSeverity,
  ApiResponse,
  AnalysisGridDto,
  SarThresholdConfigDto,
  SarRasterStatisticsDto,
  ComparisonMode,
} from '@tn-forest/shared/types';

export interface SatelliteObservationComparisonDto {
  id: string;
  imageId: string;
  acquisitionDate: string;
  acquisitionTimeUtc: string;
  sensor: string;
  source: string;
  spacecraftName: string;
  platform?: string;
  mode?: string;
  polarizations?: string[];
  orbitDirection?: 'ASCENDING' | 'DESCENDING';
  absoluteOrbitNumber?: number;
  relativeOrbitNumber?: number;
  cloudCover: number;
  crs: string;
  resolutionMeters: number;
  pixelAreaM2: number;
  width: number;
  height: number;
  rasterAvailable: boolean;
  hasLocalRaster: boolean;
  geeExportTaskId?: string;
  driveFileId?: string;
  spectralIndices?: {
    ndvi?: number;
    ndwi?: number;
    ndbi?: number;
    bsi?: number;
    savi?: number;
    evi?: number;
  };
}

export interface ChangeComparisonMetadataDto {
  changeId: string;
  zoneId?: string;
  zoneName: string;
  zoneCode: string;
  zoneBoundary?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  detectionDate: string;
  calculationMode: string;
  spatialSource: string;
  calculationMethod?: string;
  spatialCalculation?: string;
  analysisGrid?: AnalysisGridDto;
  thresholdConfig?: SarThresholdConfigDto | Record<string, any>;
  rasterStatistics?: SarRasterStatisticsDto;
  auditStatus?: 'VALID' | 'INVALID_FOR_PRODUCTION_GEOMETRY' | 'LEGACY_AUDITED';
  affectedAreaPercentage: number;
  changedArea: number;
  zoneArea: number;
  severity: string;
  evidenceStrength: number;
  evidenceBreakdown: {
    magnitudeScore: number;
    dataQualityScore: number;
    temporalConsistencyScore: number;
    crossSensorScore: number;
    totalEvidenceScore: number;
    explanation: string;
  };
  categories: string[];
  spectralDeltas: {
    ndviDelta?: number;
    ndwiDelta?: number;
    ndbiDelta?: number;
    bsiDelta?: number;
    saviDelta?: number;
    eviDelta?: number;
    vvDelta?: number;
    vhDelta?: number;
    vvVhRatioDelta?: number;
  };
  crossSensorAgreement: string;
  temporalConsistency: string;
  explanation: string;
  alertGenerated: boolean;
  temporalGap: {
    days: number;
    formatted: string;
  };
  baseline: SatelliteObservationComparisonDto;
  current: SatelliteObservationComparisonDto;
}

export const changeService = {
  getChanges: async (filters?: {
    zoneId?: string;
    sensorType?: SensorType;
    source?: SatelliteSource;
    severity?: AlertSeverity | 'NONE';
    alertGenerated?: boolean;
    threshold?: number;
    limit?: number;
    comparisonMode?: ComparisonMode | string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ChangeDetectionDto[]> => {
    const response = await apiClient.get<ApiResponse<ChangeDetectionDto[]>>('/changes', {
      params: filters,
    });
    return response.data.data!;
  },

  getChangeById: async (id: string): Promise<ChangeDetectionDto> => {
    const response = await apiClient.get<ApiResponse<ChangeDetectionDto>>(`/changes/${id}`);
    return response.data.data!;
  },

  getZoneChanges: async (zoneId: string, limit?: number): Promise<ChangeDetectionDto[]> => {
    const response = await apiClient.get<ApiResponse<ChangeDetectionDto[]>>(
      `/zones/${zoneId}/changes`,
      {
        params: { limit },
      },
    );
    return response.data.data!;
  },

  detectChange: async (data: DetectChangeRequest): Promise<ChangeDetectionDto> => {
    const response = await apiClient.post<ApiResponse<ChangeDetectionDto>>(
      '/changes/detect',
      data,
    );
    return response.data.data!;
  },

  getComparisonMetadata: async (id: string): Promise<ChangeComparisonMetadataDto> => {
    const response = await apiClient.get<ApiResponse<ChangeComparisonMetadataDto>>(
      `/changes/${id}/comparison-metadata`,
    );
    return response.data.data!;
  },

  fetchBaselineImageBlobUrl: async (id: string, band?: 'VV' | 'VH'): Promise<string> => {
    const response = await apiClient.get(`/changes/${id}/baseline-image`, {
      responseType: 'blob',
      params: band ? { band } : undefined,
    });
    return URL.createObjectURL(response.data);
  },

  fetchCurrentImageBlobUrl: async (id: string, band?: 'VV' | 'VH'): Promise<string> => {
    const response = await apiClient.get(`/changes/${id}/current-image`, {
      responseType: 'blob',
      params: band ? { band } : undefined,
    });
    return URL.createObjectURL(response.data);
  },
};
