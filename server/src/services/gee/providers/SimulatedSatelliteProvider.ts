import {
  SatelliteSource,
  SensorType,
  type GeoJSONPolygon,
  type RealSentinel2ImageDto,
  type RealLandsatImageDto,
  type RealSarImageDto,
  type RealDemImageDto,
} from '@tn-forest/shared/types';
import type {
  ISatelliteProvider,
  ProviderSearchOptions,
  AcquiredSatelliteData,
} from './ISatelliteProvider.js';
import { SENTINEL_2_BANDS, LANDSAT_BANDS, SRTM_DEM_BANDS } from '../GeeClientService.js';

export class SimulatedSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'TEST_SIMULATION_PROVIDER';
  public readonly isRealProvider = false;

  async searchOpticalImages(
    geometry: GeoJSONPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealSentinel2ImageDto[]> {
    const { startDate, maxCloudCover = 20.0 } = options;
    const dateTag = startDate.toISOString().slice(0, 10).replace(/-/g, '');
    const imageId = `COPERNICUS/S2_SR_HARMONIZED/${dateTag}T050221_${dateTag}T050519_T44PMT`;

    return [
      {
        imageId,
        source: SatelliteSource.SENTINEL_2,
        sensorType: SensorType.OPTICAL,
        spacecraftName: 'Sentinel-2A',
        acquisitionDate: startDate.toISOString(),
        cloudCoverPercentage: Math.min(10.0, maxCloudCover),
        sunElevationAngle: 58.0,
        footprint: geometry,
        bands: SENTINEL_2_BANDS,
        geeAssetPath: imageId,
        isRealTelemetry: false,
      },
    ];
  }

  async searchSarImages(
    geometry: GeoJSONPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealSarImageDto[]> {
    const { startDate } = options;
    const dateTag = startDate.toISOString().slice(0, 10).replace(/-/g, '');
    const imageId = `COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_${dateTag}T003810_${dateTag}T003835_057288_06FA92_7FE4`;

    return [
      {
        imageId,
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        spacecraftName: 'Sentinel-1A',
        acquisitionDate: startDate.toISOString(),
        polarization: 'VV+VH',
        acquisitionMode: 'IW',
        orbitDirection: 'DESCENDING',
        orbitNumber: 135,
        footprint: geometry,
        bands: [
          { id: 'VV', name: 'VV backscatter', unit: 'dB', description: 'C-Band VV' },
          { id: 'VH', name: 'VH backscatter', unit: 'dB', description: 'C-Band VH' },
        ],
        geeAssetPath: imageId,
        isRealTelemetry: false,
      },
    ];
  }

  async acquireBestImage(
    geometry: GeoJSONPolygon,
    options: ProviderSearchOptions,
  ): Promise<AcquiredSatelliteData> {
    const isSar = options.sensorType === SensorType.SAR || options.source === SatelliteSource.SENTINEL_1;
    const { startDate, maxCloudCover = 20.0 } = options;
    const dateTag = startDate.toISOString().slice(0, 10).replace(/-/g, '');

    if (isSar) {
      const imageId = `COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_${dateTag}T003810_${dateTag}T003835_057288_06FA92_7FE4`;
      return {
        imageId,
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: startDate,
        cloudCover: 0.0,
        footprint: geometry,
        geeReference: `ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)`,
        metadata: {
          spacecraftName: 'Sentinel-1A',
          polarization: 'VV+VH',
          acquisitionMode: 'IW',
          orbitDirection: 'DESCENDING',
          orbitNumber: 135,
          isRealTelemetry: false,
        },
        isRealTelemetry: false,
      };
    }

    const imageId = `COPERNICUS/S2_SR_HARMONIZED/${dateTag}T050221_${dateTag}T050519_T44PMT`;
    return {
      imageId,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: startDate,
      cloudCover: Math.min(10.0, maxCloudCover),
      footprint: geometry,
      geeReference: `ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(geometry)`,
      metadata: {
        spacecraftName: 'Sentinel-2A',
        sunElevationAngle: 58.0,
        cloudCoverPercentage: Math.min(10.0, maxCloudCover),
        bands: SENTINEL_2_BANDS.map((b) => b.id),
        isRealTelemetry: false,
      },
      isRealTelemetry: false,
    };
  }

  async searchLandsatImages(
    geometry: GeoJSONPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealLandsatImageDto[]> {
    const { startDate, maxCloudCover = 20.0, source = SatelliteSource.LANDSAT_8 } = options;
    const isL9 = source === SatelliteSource.LANDSAT_9;
    const dateTag = startDate.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = isL9 ? 'LC09' : 'LC08';
    const imageId = `LANDSAT/${prefix}/C02/T1_L2/${prefix}_L2SP_144053_${dateTag}_02_T1`;

    return [
      {
        imageId,
        source: isL9 ? SatelliteSource.LANDSAT_9 : SatelliteSource.LANDSAT_8,
        sensorType: SensorType.OPTICAL,
        spacecraftName: isL9 ? 'Landsat 9' : 'Landsat 8',
        acquisitionDate: startDate.toISOString(),
        cloudCoverPercentage: Math.min(8.5, maxCloudCover),
        sunElevationAngle: 61.2,
        footprint: geometry,
        bands: LANDSAT_BANDS,
        geeAssetPath: imageId,
        isRealTelemetry: false,
        nativeResolutionMeters: 30,
      },
    ];
  }

  async searchDemImages(
    geometry: GeoJSONPolygon,
  ): Promise<RealDemImageDto> {
    return {
      imageId: 'USGS/SRTMGL1_003',
      source: SatelliteSource.SRTM,
      sensorType: SensorType.DEM,
      datasetName: 'SRTM 1 Arc-Second Global Elevation (30m)',
      acquisitionDate: '2000-02-11T00:00:00.000Z',
      footprint: geometry,
      bands: SRTM_DEM_BANDS,
      geeAssetPath: 'USGS/SRTMGL1_003',
      isRealTelemetry: false,
      nativeResolutionMeters: 30,
    };
  }
}
