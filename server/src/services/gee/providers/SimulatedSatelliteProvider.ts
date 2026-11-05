import {
  SatelliteSource,
  SensorType,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
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
import { SENTINEL_2_BANDS, LANDSAT_BANDS, SRTM_DEM_BANDS, SAR_BANDS } from '../GeeClientService.js';

export class SimulatedSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'TEST_SIMULATION_PROVIDER';
  public readonly isRealProvider = false;

  async searchOpticalImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<(RealSentinel2ImageDto | RealLandsatImageDto)[]> {
    const { startDate, endDate, maxCloudCover = 20.0, source } = options;
    const startMs = startDate.getTime();
    const endMs = endDate ? endDate.getTime() : startMs + 30 * 24 * 3600 * 1000;
    const spanMs = Math.max(endMs - startMs, 24 * 3600 * 1000);

    // Generate 3 to 6 candidates spaced across the date interval
    const count = Math.min(6, Math.max(2, Math.floor(spanMs / (30 * 24 * 3600 * 1000)) + 1));
    const stepMs = Math.floor(spanMs / count);

    const results: (RealSentinel2ImageDto | RealLandsatImageDto)[] = [];

    for (let i = 0; i < count; i++) {
      const sceneDate = new Date(startMs + i * stepMs + 5 * 3600 * 1000);
      const dateTag = sceneDate.toISOString().slice(0, 10).replace(/-/g, '');
      const cloud = Math.min(Number((2.0 + (i * 3.4) % 15).toFixed(1)), maxCloudCover);

      const isLandsatTarget =
        source === SatelliteSource.LANDSAT_8 ||
        source === SatelliteSource.LANDSAT_9 ||
        (!source && i % 2 === 1);

      if (isLandsatTarget) {
        const isL9 = source === SatelliteSource.LANDSAT_9 || (i % 4 === 3);
        const prefix = isL9 ? 'LC09' : 'LC08';
        const imageId = `LANDSAT/${prefix}/C02/T1_L2/${prefix}_L2SP_143053_${dateTag}_02_T1`;

        results.push({
          imageId,
          source: isL9 ? SatelliteSource.LANDSAT_9 : SatelliteSource.LANDSAT_8,
          sensorType: SensorType.OPTICAL,
          spacecraftName: isL9 ? 'Landsat 9' : 'Landsat 8',
          acquisitionDate: sceneDate.toISOString(),
          cloudCoverPercentage: cloud,
          sunElevationAngle: 61.2,
          footprint: geometry,
          bands: LANDSAT_BANDS,
          geeAssetPath: imageId,
          isRealTelemetry: false,
          nativeResolutionMeters: 30,
        });
      } else {
        const spacecraft = i % 2 === 0 ? 'Sentinel-2A' : 'Sentinel-2B';
        const imageId = `COPERNICUS/S2_SR_HARMONIZED/${dateTag}T051209_${dateTag}T051616_T43PHM`;

        results.push({
          imageId,
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: spacecraft,
          acquisitionDate: sceneDate.toISOString(),
          cloudCoverPercentage: cloud,
          sunElevationAngle: 58.0,
          footprint: geometry,
          bands: SENTINEL_2_BANDS,
          geeAssetPath: imageId,
          isRealTelemetry: false,
        });
      }
    }

    // Sort descending by acquisitionDate
    results.sort((a, b) => new Date(b.acquisitionDate).getTime() - new Date(a.acquisitionDate).getTime());
    return results;
  }

  async searchSarImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealSarImageDto[]> {
    const { startDate, endDate } = options;
    const startMs = startDate.getTime();
    const endMs = endDate ? endDate.getTime() : startMs + 30 * 24 * 3600 * 1000;
    const spanMs = Math.max(endMs - startMs, 24 * 3600 * 1000);

    const count = Math.min(5, Math.max(2, Math.floor(spanMs / (24 * 24 * 3600 * 1000)) + 1));
    const stepMs = Math.floor(spanMs / count);

    const results: RealSarImageDto[] = [];
    for (let i = 0; i < count; i++) {
      const sceneDate = new Date(startMs + i * stepMs + 38 * 60 * 1000);
      const dateTag = sceneDate.toISOString().slice(0, 10).replace(/-/g, '');
      const imageId = `COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_${dateTag}T003810_${dateTag}T003835_030617_038234_B79D`;

      results.push({
        imageId,
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        spacecraftName: 'Sentinel-1A',
        acquisitionDate: sceneDate.toISOString(),
        polarization: 'VV+VH',
        acquisitionMode: 'IW',
        orbitDirection: 'DESCENDING',
        orbitNumber: 135,
        relativeOrbitNumber: 135,
        footprint: geometry,
        bands: SAR_BANDS,
        geeAssetPath: imageId,
        isRealTelemetry: false,
      });
    }

    results.sort((a, b) => new Date(b.acquisitionDate).getTime() - new Date(a.acquisitionDate).getTime());
    return results;
  }

  async acquireBestImage(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<AcquiredSatelliteData> {
    const isSar = options.sensorType === SensorType.SAR || options.source === SatelliteSource.SENTINEL_1;
    const { startDate, maxCloudCover = 20.0, imageId: explicitImageId } = options;
    const dateTag = startDate.toISOString().slice(0, 10).replace(/-/g, '');

    if (isSar) {
      const imageId = explicitImageId || `COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_${dateTag}T003810_${dateTag}T003835_030617_038234_B79D`;
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

    const isLandsat =
      options.source === SatelliteSource.LANDSAT_8 ||
      options.source === SatelliteSource.LANDSAT_9 ||
      (explicitImageId && explicitImageId.includes('LANDSAT'));

    const imageId = explicitImageId || (isLandsat
      ? `LANDSAT/LC08/C02/T1_L2/LC08_143053_${dateTag}_02_T1`
      : `COPERNICUS/S2_SR_HARMONIZED/${dateTag}T051209_${dateTag}T051616_T43PHM`);

    return {
      imageId,
      source: isLandsat ? (options.source || SatelliteSource.LANDSAT_8) : SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: startDate,
      cloudCover: Math.min(5.0, maxCloudCover),
      footprint: geometry,
      geeReference: `ee.ImageCollection("${isLandsat ? 'LANDSAT/LC08/C02/T1_L2' : 'COPERNICUS/S2_SR_HARMONIZED'}").filterBounds(geometry)`,
      metadata: {
        spacecraftName: isLandsat ? 'Landsat 8' : 'Sentinel-2A',
        sunElevationAngle: 58.0,
        cloudCoverPercentage: Math.min(5.0, maxCloudCover),
        bands: isLandsat ? LANDSAT_BANDS.map((b) => b.id) : SENTINEL_2_BANDS.map((b) => b.id),
        isRealTelemetry: false,
      },
      isRealTelemetry: false,
    };
  }

  async searchLandsatImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealLandsatImageDto[]> {
    const optical = await this.searchOpticalImages(geometry, {
      ...options,
      source: options.source || SatelliteSource.LANDSAT_8,
    });
    return optical.filter((img) => img.source === SatelliteSource.LANDSAT_8 || img.source === SatelliteSource.LANDSAT_9) as RealLandsatImageDto[];
  }

  async searchDemImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
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
