import {
  SatelliteSource,
  SensorType,
  GeeErrorCode,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type RealSentinel2ImageDto,
  type RealLandsatImageDto,
  type RealSarImageDto,
  type RealDemImageDto,
  type MultiSourceDiscoveryResult,
  type SourceFallbackStatus,
  type SourcePriorityConfig,
} from '@tn-forest/shared/types';
import { GeeSatelliteProvider } from './providers/GeeSatelliteProvider.js';
import type { AcquiredSatelliteData, ProviderSearchOptions } from './providers/ISatelliteProvider.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export interface MultiSourceDiscoveryOptions {
  zoneId?: string;
  startDate: Date;
  endDate: Date;
  maxCloudCover?: number;
  sensorType?: SensorType;
  preferredSource?: SatelliteSource;
  priorityConfig?: Partial<SourcePriorityConfig>;
}

export const DEFAULT_PRIORITY_CONFIG: SourcePriorityConfig = {
  opticalPriority: [
    SatelliteSource.SENTINEL_2,
    SatelliteSource.LANDSAT_8,
    SatelliteSource.LANDSAT_9,
  ],
  sarPriority: [
    SatelliteSource.SENTINEL_1,
  ],
  demPriority: [
    SatelliteSource.SRTM,
  ],
  maxCloudCoverThreshold: 20.0,
  allowFallbackOnCloudCover: true,
};

export class MultiSourceAcquisitionService {
  private static instance: MultiSourceAcquisitionService;
  private provider: GeeSatelliteProvider;

  constructor() {
    this.provider = new GeeSatelliteProvider();
  }

  public static getInstance(): MultiSourceAcquisitionService {
    if (!MultiSourceAcquisitionService.instance) {
      MultiSourceAcquisitionService.instance = new MultiSourceAcquisitionService();
    }
    return MultiSourceAcquisitionService.instance;
  }

  /**
   * Executes multi-source satellite discovery across Sentinel-2, Landsat-8/9, Sentinel-1, and SRTM DEM.
   * Performs deterministic quality & cloud filtering, applying intelligent source fallback.
   */
  public async discoverMultiSource(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: MultiSourceDiscoveryOptions,
  ): Promise<MultiSourceDiscoveryResult> {
    const {
      zoneId,
      startDate,
      endDate,
      maxCloudCover = DEFAULT_PRIORITY_CONFIG.maxCloudCoverThreshold,
      sensorType = SensorType.OPTICAL,
      preferredSource,
      priorityConfig = {},
    } = options;

    const config: SourcePriorityConfig = {
      ...DEFAULT_PRIORITY_CONFIG,
      ...priorityConfig,
      maxCloudCoverThreshold: maxCloudCover,
    };

    const searchOptions: ProviderSearchOptions = {
      startDate,
      endDate,
      sensorType,
      maxCloudCover,
    };

    const discoveredImages: Array<RealSentinel2ImageDto | RealLandsatImageDto | RealSarImageDto | RealDemImageDto> = [];
    const fallbacksConsidered: SourceFallbackStatus[] = [];

    // -------------------------------------------------------------
    // TRACK 1: SAR (Sentinel-1)
    // -------------------------------------------------------------
    if (sensorType === SensorType.SAR) {
      console.info(`[MultiSource] Querying SAR track: Sentinel-1 (${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)})`);
      const sarImages = await this.provider.searchSarImages(geometry, searchOptions);
      discoveredImages.push(...sarImages);

      if (sarImages.length === 0) {
        fallbacksConsidered.push({
          source: SatelliteSource.SENTINEL_1,
          collection: 'COPERNICUS/S1_GRD',
          status: 'NO_COVERAGE',
          availableCount: 0,
          rejectionReason: 'No SAR passes over target geometry in specified date window',
        });

        throw new AppError(
          `No SAR imagery found for Sentinel-1 (${GeeErrorCode.GEE_NO_IMAGES_FOUND})`,
          HTTP_STATUS.NOT_FOUND,
        );
      }

      fallbacksConsidered.push({
        source: SatelliteSource.SENTINEL_1,
        collection: 'COPERNICUS/S1_GRD',
        status: 'SELECTED',
        availableCount: sarImages.length,
      });

      return {
        zoneId,
        geometry,
        requestedDateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        maxCloudCover: 0,
        discoveredImages,
        selectedSource: SatelliteSource.SENTINEL_1,
        selectedImage: sarImages[0],
        selectionReason: `Selected primary SAR track Sentinel-1 (${sarImages.length} passes available)`,
        fallbacksConsidered,
        timestamp: new Date().toISOString(),
      };
    }

    // -------------------------------------------------------------
    // TRACK 2: DEM (SRTM)
    // -------------------------------------------------------------
    if (sensorType === SensorType.DEM) {
      console.info(`[MultiSource] Querying DEM track: SRTM 1 Arc-Second`);
      const demImage = await this.provider.searchDemImages(geometry);
      discoveredImages.push(demImage);

      fallbacksConsidered.push({
        source: SatelliteSource.SRTM,
        collection: 'USGS/SRTMGL1_003',
        status: 'SELECTED',
        availableCount: 1,
      });

      return {
        zoneId,
        geometry,
        requestedDateRange: {
          startDate: '2000-02-11T00:00:00.000Z',
          endDate: '2000-02-22T00:00:00.000Z',
        },
        maxCloudCover: 0,
        discoveredImages,
        selectedSource: SatelliteSource.SRTM,
        selectedImage: demImage,
        selectionReason: 'Selected USGS SRTM 1 Arc-Second Global Elevation DEM',
        fallbacksConsidered,
        timestamp: new Date().toISOString(),
      };
    }

    // -------------------------------------------------------------
    // TRACK 3: OPTICAL MULTI-SOURCE DISCOVERY (Sentinel-2, Landsat-8, Landsat-9)
    // -------------------------------------------------------------
    console.info(`[MultiSource] Executing parallel optical discovery: Sentinel-2, Landsat-8, Landsat-9 (Max Cloud: ${maxCloudCover}%)`);

    let primaryApiError: unknown = null;
    const [s2Results, l8Results, l9Results] = await Promise.all([
      this.provider.searchOpticalImages(geometry, searchOptions).catch((err) => {
        primaryApiError = err;
        console.warn(`[MultiSource] Sentinel-2 discovery error: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }),
      this.provider.searchLandsatImages(geometry, { ...searchOptions, source: SatelliteSource.LANDSAT_8 }).catch((err) => {
        console.warn(`[MultiSource] Landsat-8 discovery error: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }),
      this.provider.searchLandsatImages(geometry, { ...searchOptions, source: SatelliteSource.LANDSAT_9 }).catch((err) => {
        console.warn(`[MultiSource] Landsat-9 discovery error: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }),
    ]);

    discoveredImages.push(...s2Results, ...l8Results, ...l9Results);

    // Apply Priority Ordering
    const priorityList = preferredSource
      ? [preferredSource, ...config.opticalPriority.filter((s) => s !== preferredSource)]
      : config.opticalPriority;

    let selectedImage: RealSentinel2ImageDto | RealLandsatImageDto | null = null;
    let selectedSource: SatelliteSource | null = null;
    let selectionReason = '';

    for (const source of priorityList) {
      let pool: Array<RealSentinel2ImageDto | RealLandsatImageDto> = [];
      let collectionName = '';

      if (source === SatelliteSource.SENTINEL_2) {
        pool = s2Results;
        collectionName = 'COPERNICUS/S2_SR_HARMONIZED';
      } else if (source === SatelliteSource.LANDSAT_8) {
        pool = l8Results;
        collectionName = 'LANDSAT/LC08/C02/T1_L2';
      } else if (source === SatelliteSource.LANDSAT_9) {
        pool = l9Results;
        collectionName = 'LANDSAT/LC09/C02/T1_L2';
      }

      if (pool.length === 0) {
        fallbacksConsidered.push({
          source,
          collection: collectionName,
          status: 'NO_COVERAGE',
          availableCount: 0,
          rejectionReason: 'No scenes acquired in target date range',
        });
        continue;
      }

      const validPassingCloud = pool.filter((img) => img.cloudCoverPercentage <= maxCloudCover);

      if (validPassingCloud.length === 0) {
        const bestCloud = Math.min(...pool.map((img) => img.cloudCoverPercentage));
        fallbacksConsidered.push({
          source,
          collection: collectionName,
          status: 'CLOUD_EXCEEDED',
          availableCount: pool.length,
          bestCloudCover: bestCloud,
          rejectionReason: `All scenes exceed cloud limit (${bestCloud}% > ${maxCloudCover}%)`,
        });
        continue;
      }

      if (!selectedImage) {
        selectedImage = validPassingCloud[0];
        selectedSource = source;
        selectionReason = source === config.opticalPriority[0]
          ? `Primary source ${source} selected (${validPassingCloud.length} valid scenes, cloud: ${selectedImage.cloudCoverPercentage}%)`
          : `Fallback source ${source} selected due to higher priority unavailability/cloud cover (${validPassingCloud.length} valid scenes, cloud: ${selectedImage.cloudCoverPercentage}%)`;

        fallbacksConsidered.push({
          source,
          collection: collectionName,
          status: 'SELECTED',
          availableCount: pool.length,
          bestCloudCover: selectedImage.cloudCoverPercentage,
        });
      } else {
        fallbacksConsidered.push({
          source,
          collection: collectionName,
          status: 'LOWER_PRIORITY',
          availableCount: pool.length,
          bestCloudCover: pool[0]?.cloudCoverPercentage,
          rejectionReason: `Higher priority source ${selectedSource} was successfully selected`,
        });
      }
    }

    if (!selectedImage || !selectedSource) {
      if (primaryApiError && s2Results.length === 0 && l8Results.length === 0 && l9Results.length === 0) {
        if (primaryApiError instanceof AppError) {
          throw primaryApiError;
        }
      }
      throw new AppError(
        `Multi-source optical discovery found no images under cloud threshold ${maxCloudCover}% across Sentinel-2, Landsat-8, and Landsat-9 (${GeeErrorCode.GEE_NO_IMAGES_FOUND})`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    return {
      zoneId,
      geometry,
      requestedDateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      maxCloudCover,
      discoveredImages,
      selectedSource,
      selectedImage,
      selectionReason,
      fallbacksConsidered,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Acquires the optimal multi-source observation and returns standard AcquiredSatelliteData.
   */
  public async acquireOptimalObservation(
    geometry: GeoJSONPolygon,
    options: MultiSourceDiscoveryOptions,
  ): Promise<AcquiredSatelliteData> {
    const discovery = await this.discoverMultiSource(geometry, options);
    const selected = discovery.selectedImage;

    const geeRef = selected.source === SatelliteSource.LANDSAT_8
      ? `ee.ImageCollection("LANDSAT/LC08/C02/T1_L2").filterBounds(geometry)`
      : selected.source === SatelliteSource.LANDSAT_9
      ? `ee.ImageCollection("LANDSAT/LC09/C02/T1_L2").filterBounds(geometry)`
      : selected.source === SatelliteSource.SENTINEL_1
      ? `ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)`
      : selected.source === SatelliteSource.SRTM
      ? `ee.Image("USGS/SRTMGL1_003").filterBounds(geometry)`
      : `ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(geometry)`;

    const cloudCover = 'cloudCoverPercentage' in selected ? (selected.cloudCoverPercentage ?? 0) : 0;
    const nativeRes = 'nativeResolutionMeters' in selected ? selected.nativeResolutionMeters : (selected.sensorType === SensorType.OPTICAL ? 10 : 10);

    return {
      imageId: selected.imageId,
      source: selected.source,
      sensorType: selected.sensorType,
      acquisitionDate: new Date(selected.acquisitionDate),
      cloudCover,
      footprint: geometry,
      geeReference: geeRef,
      metadata: {
        spacecraftName: 'spacecraftName' in selected ? selected.spacecraftName : 'SRTM',
        selectionReason: discovery.selectionReason,
        nativeResolutionMeters: nativeRes,
        bands: selected.bands.map((b) => b.id),
        fallbacksEvaluated: discovery.fallbacksConsidered,
        isRealTelemetry: true,
      },
      isRealTelemetry: true,
    };
  }
}
