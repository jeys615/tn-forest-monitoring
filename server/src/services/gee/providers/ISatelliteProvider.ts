import {
  SatelliteSource,
  SensorType,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type RealSentinel2ImageDto,
  type RealLandsatImageDto,
  type RealSarImageDto,
  type RealDemImageDto,
  type SatelliteMetadataDto,
} from '@tn-forest/shared/types';

export interface ProviderSearchOptions {
  startDate: Date;
  endDate: Date;
  sensorType?: SensorType;
  source?: SatelliteSource;
  maxCloudCover?: number;
  imageId?: string;
}

export interface AcquiredSatelliteData {
  imageId: string;
  source: SatelliteSource;
  sensorType: SensorType;
  acquisitionDate: Date;
  cloudCover: number;
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  geeReference: string;
  metadata: Record<string, unknown>;
  isRealTelemetry: boolean;
}

export interface ISatelliteProvider {
  readonly providerName: string;
  readonly isRealProvider: boolean;

  searchOpticalImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<(RealSentinel2ImageDto | RealLandsatImageDto)[]>;

  searchLandsatImages?(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealLandsatImageDto[]>;

  searchSarImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealSarImageDto[]>;

  searchDemImages?(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
  ): Promise<RealDemImageDto>;

  acquireBestImage(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<AcquiredSatelliteData>;
}
