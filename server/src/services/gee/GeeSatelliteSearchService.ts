import {
  SensorType,
  SatelliteSource,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';
import { GeeAuthService } from './GeeAuthService.js';
import { GeeClientService, SENTINEL_2_BANDS, LANDSAT_BANDS, SAR_BANDS } from './GeeClientService.js';

export interface SatelliteScene {
  satellite: 'Sentinel-2' | 'Landsat-8' | 'Landsat-9' | 'Sentinel-1';
  sensorType: SensorType;
  collection: string;
  imageId: string;
  acquisitionDate: Date;
  cloudCover: number;
  nativeResolution: number;
  bands: string[];
  footprint: GeoJSONPolygon | GeoJSONMultiPolygon;
  crs?: string;
  processingLevel: string;
  provider: string;
}

export interface MultiSatelliteSearchOptions {
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
  startDate: Date;
  endDate: Date;
  maxCloudCover?: number;
  baselineImageId?: string;
  preferredSensorType?: SensorType;
  allowSarFallback?: boolean;
}

export interface MultiSatelliteSearchResult {
  selectedScene: SatelliteScene | null;
  candidatesEvaluated: Array<{
    imageId: string;
    satellite: string;
    sensorType: SensorType;
    acquisitionDate: Date;
    cloudCover: number;
    status: 'ACCEPTED' | 'REJECTED';
    rejectionReason?: string;
  }>;
  searchSummary: {
    totalSearched: number;
    opticalFound: number;
    sarFound: number;
    cloudRejectedCount: number;
    selectedSatellite?: string;
    fallbackTriggered: boolean;
    fallbackReason?: string;
  };
}

export class GeeSatelliteSearchService {
  private clientService: GeeClientService;
  private authService: GeeAuthService;

  constructor() {
    this.clientService = new GeeClientService();
    this.authService = GeeAuthService.getInstance();
  }

  /**
   * Performs multi-satellite search with strict priority:
   * 1. Sentinel-2 SR Harmonized (10m)
   * 2. Landsat 8 Level-2 (30m)
   * 3. Landsat 9 Level-2 (30m)
   * 4. Sentinel-1 SAR (10m fallback if optical cloudy or unavailable)
   */
  public async searchObservations(options: MultiSatelliteSearchOptions): Promise<MultiSatelliteSearchResult> {
    const {
      geometry,
      startDate,
      endDate,
      maxCloudCover = 20.0,
      baselineImageId,
      preferredSensorType = SensorType.OPTICAL,
      allowSarFallback = true,
    } = options;

    const candidatesEvaluated: MultiSatelliteSearchResult['candidatesEvaluated'] = [];
    let cloudRejectedCount = 0;
    let opticalFound = 0;
    let sarFound = 0;
    let fallbackTriggered = false;
    let fallbackReason: string | undefined;

    const executionTimeMs = Date.now();

    // ──────────────────────────────────────────────────────────
    // 1. OPTICAL PRIORITY 1: Sentinel-2 SR Harmonized
    // ──────────────────────────────────────────────────────────
    if (preferredSensorType === SensorType.OPTICAL) {
      try {
        const s2Records = await this.clientService.querySentinel2Collection({
          collection: 'COPERNICUS/S2_SR_HARMONIZED',
          geometry,
          startDate,
          endDate,
          maxCloudCover: 100, // Fetch all to evaluate cloud rejection explicitly
        });

        for (const raw of s2Records) {
          opticalFound++;
          const acqMs = Number(raw.properties?.['system:time_start'] || 0);
          const acqDate = new Date(acqMs);
          const cloud = Number(
            raw.properties?.CLOUDY_PIXEL_PERCENTAGE ?? raw.properties?.CLOUD_COVERAGE_ASSESSMENT ?? 0,
          );

          if (raw.id === baselineImageId) {
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Sentinel-2',
              sensorType: SensorType.OPTICAL,
              acquisitionDate: acqDate,
              cloudCover: cloud,
              status: 'REJECTED',
              rejectionReason: 'EXCLUDED_BASELINE_IMAGE',
            });
            continue;
          }

          if (acqMs > executionTimeMs) {
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Sentinel-2',
              sensorType: SensorType.OPTICAL,
              acquisitionDate: acqDate,
              cloudCover: cloud,
              status: 'REJECTED',
              rejectionReason: 'FUTURE_IMAGE_ACQUISITION',
            });
            continue;
          }

          if (cloud > maxCloudCover) {
            cloudRejectedCount++;
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Sentinel-2',
              sensorType: SensorType.OPTICAL,
              acquisitionDate: acqDate,
              cloudCover: cloud,
              status: 'REJECTED',
              rejectionReason: `CLOUD_COVER_EXCEEDS_THRESHOLD (${cloud.toFixed(1)}% > ${maxCloudCover}%)`,
            });
            continue;
          }

          // Valid Sentinel-2 candidate found
          candidatesEvaluated.push({
            imageId: raw.id,
            satellite: 'Sentinel-2',
            sensorType: SensorType.OPTICAL,
            acquisitionDate: acqDate,
            cloudCover: cloud,
            status: 'ACCEPTED',
          });

          const selectedScene: SatelliteScene = {
            satellite: 'Sentinel-2',
            sensorType: SensorType.OPTICAL,
            collection: 'COPERNICUS/S2_SR_HARMONIZED',
            imageId: raw.id,
            acquisitionDate: acqDate,
            cloudCover: cloud,
            nativeResolution: 10,
            bands: SENTINEL_2_BANDS.map((b) => b.id),
            footprint: geometry,
            crs: 'EPSG:4326',
            processingLevel: 'Level-2A (Surface Reflectance)',
            provider: 'COPERNICUS / GEE',
          };

          return {
            selectedScene,
            candidatesEvaluated,
            searchSummary: {
              totalSearched: candidatesEvaluated.length,
              opticalFound,
              sarFound,
              cloudRejectedCount,
              selectedSatellite: 'Sentinel-2',
              fallbackTriggered: false,
            },
          };
        }
      } catch (err: unknown) {
        console.warn(`[GEE Search] Sentinel-2 search error: ${err instanceof Error ? err.message : String(err)}`);
      }

      // ──────────────────────────────────────────────────────────
      // 2. OPTICAL PRIORITY 2: Landsat 8 Collection 2 Level-2
      // ──────────────────────────────────────────────────────────
      try {
        const l8Records = await this.clientService.queryLandsatCollection({
          collection: 'LANDSAT/LC08/C02/T1_L2',
          geometry,
          startDate,
          endDate,
          maxCloudCover: 100,
        });

        for (const raw of l8Records) {
          opticalFound++;
          const acqMs = Number(raw.properties?.['system:time_start'] || 0);
          const acqDate = new Date(acqMs);
          const cloud = Number(raw.properties?.CLOUD_COVER ?? raw.properties?.CLOUDY_PIXEL_PERCENTAGE ?? 0);

          if (raw.id === baselineImageId) {
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Landsat-8',
              sensorType: SensorType.OPTICAL,
              acquisitionDate: acqDate,
              cloudCover: cloud,
              status: 'REJECTED',
              rejectionReason: 'EXCLUDED_BASELINE_IMAGE',
            });
            continue;
          }

          if (cloud > maxCloudCover) {
            cloudRejectedCount++;
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Landsat-8',
              sensorType: SensorType.OPTICAL,
              acquisitionDate: acqDate,
              cloudCover: cloud,
              status: 'REJECTED',
              rejectionReason: `CLOUD_COVER_EXCEEDS_THRESHOLD (${cloud.toFixed(1)}% > ${maxCloudCover}%)`,
            });
            continue;
          }

          candidatesEvaluated.push({
            imageId: raw.id,
            satellite: 'Landsat-8',
            sensorType: SensorType.OPTICAL,
            acquisitionDate: acqDate,
            cloudCover: cloud,
            status: 'ACCEPTED',
          });

          const selectedScene: SatelliteScene = {
            satellite: 'Landsat-8',
            sensorType: SensorType.OPTICAL,
            collection: 'LANDSAT/LC08/C02/T1_L2',
            imageId: raw.id,
            acquisitionDate: acqDate,
            cloudCover: cloud,
            nativeResolution: 30,
            bands: LANDSAT_BANDS.map((b) => b.id),
            footprint: geometry,
            crs: 'EPSG:4326',
            processingLevel: 'Collection 2 Level-2 Surface Reflectance',
            provider: 'USGS / NASA / GEE',
          };

          return {
            selectedScene,
            candidatesEvaluated,
            searchSummary: {
              totalSearched: candidatesEvaluated.length,
              opticalFound,
              sarFound,
              cloudRejectedCount,
              selectedSatellite: 'Landsat-8',
              fallbackTriggered: true,
              fallbackReason: 'FALLBACK_LANDSAT_8 (Sentinel-2 unavailable or cloudy)',
            },
          };
        }
      } catch (err: unknown) {
        console.warn(`[GEE Search] Landsat-8 search error: ${err instanceof Error ? err.message : String(err)}`);
      }

      // ──────────────────────────────────────────────────────────
      // 3. OPTICAL PRIORITY 3: Landsat 9 Collection 2 Level-2
      // ──────────────────────────────────────────────────────────
      try {
        const l9Records = await this.clientService.queryLandsatCollection({
          collection: 'LANDSAT/LC09/C02/T1_L2',
          geometry,
          startDate,
          endDate,
          maxCloudCover: 100,
        });

        for (const raw of l9Records) {
          opticalFound++;
          const acqMs = Number(raw.properties?.['system:time_start'] || 0);
          const acqDate = new Date(acqMs);
          const cloud = Number(raw.properties?.CLOUD_COVER ?? raw.properties?.CLOUDY_PIXEL_PERCENTAGE ?? 0);

          if (raw.id === baselineImageId) {
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Landsat-9',
              sensorType: SensorType.OPTICAL,
              acquisitionDate: acqDate,
              cloudCover: cloud,
              status: 'REJECTED',
              rejectionReason: 'EXCLUDED_BASELINE_IMAGE',
            });
            continue;
          }

          if (cloud > maxCloudCover) {
            cloudRejectedCount++;
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Landsat-9',
              sensorType: SensorType.OPTICAL,
              acquisitionDate: acqDate,
              cloudCover: cloud,
              status: 'REJECTED',
              rejectionReason: `CLOUD_COVER_EXCEEDS_THRESHOLD (${cloud.toFixed(1)}% > ${maxCloudCover}%)`,
            });
            continue;
          }

          candidatesEvaluated.push({
            imageId: raw.id,
            satellite: 'Landsat-9',
            sensorType: SensorType.OPTICAL,
            acquisitionDate: acqDate,
            cloudCover: cloud,
            status: 'ACCEPTED',
          });

          const selectedScene: SatelliteScene = {
            satellite: 'Landsat-9',
            sensorType: SensorType.OPTICAL,
            collection: 'LANDSAT/LC09/C02/T1_L2',
            imageId: raw.id,
            acquisitionDate: acqDate,
            cloudCover: cloud,
            nativeResolution: 30,
            bands: LANDSAT_BANDS.map((b) => b.id),
            footprint: geometry,
            crs: 'EPSG:4326',
            processingLevel: 'Collection 2 Level-2 Surface Reflectance',
            provider: 'USGS / NASA / GEE',
          };

          return {
            selectedScene,
            candidatesEvaluated,
            searchSummary: {
              totalSearched: candidatesEvaluated.length,
              opticalFound,
              sarFound,
              cloudRejectedCount,
              selectedSatellite: 'Landsat-9',
              fallbackTriggered: true,
              fallbackReason: 'FALLBACK_LANDSAT_9 (Sentinel-2 and Landsat-8 unavailable or cloudy)',
            },
          };
        }
      } catch (err: unknown) {
        console.warn(`[GEE Search] Landsat-9 search error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // 4. SAR FALLBACK: Sentinel-1 C-SAR GRD
    // ──────────────────────────────────────────────────────────
    if (allowSarFallback || preferredSensorType === SensorType.SAR) {
      fallbackTriggered = preferredSensorType === SensorType.OPTICAL;
      fallbackReason = 'OPTICAL_UNAVAILABLE_OR_CLOUDY_SAR_FALLBACK';

      try {
        const s1Records = await this.clientService.querySarCollection({
          collection: 'COPERNICUS/S1_GRD',
          geometry,
          startDate,
          endDate,
        });

        for (const raw of s1Records) {
          sarFound++;
          const acqMs = Number(raw.properties?.['system:time_start'] || 0);
          const acqDate = new Date(acqMs);

          if (raw.id === baselineImageId) {
            candidatesEvaluated.push({
              imageId: raw.id,
              satellite: 'Sentinel-1',
              sensorType: SensorType.SAR,
              acquisitionDate: acqDate,
              cloudCover: 0,
              status: 'REJECTED',
              rejectionReason: 'EXCLUDED_BASELINE_IMAGE',
            });
            continue;
          }

          candidatesEvaluated.push({
            imageId: raw.id,
            satellite: 'Sentinel-1',
            sensorType: SensorType.SAR,
            acquisitionDate: acqDate,
            cloudCover: 0,
            status: 'ACCEPTED',
          });

          const selectedScene: SatelliteScene = {
            satellite: 'Sentinel-1',
            sensorType: SensorType.SAR,
            collection: 'COPERNICUS/S1_GRD',
            imageId: raw.id,
            acquisitionDate: acqDate,
            cloudCover: 0,
            nativeResolution: 10,
            bands: SAR_BANDS.map((b) => b.id),
            footprint: geometry,
            crs: 'EPSG:4326',
            processingLevel: 'Level-1 Ground Range Detected (GRD)',
            provider: 'ESA / COPERNICUS / GEE',
          };

          return {
            selectedScene,
            candidatesEvaluated,
            searchSummary: {
              totalSearched: candidatesEvaluated.length,
              opticalFound,
              sarFound,
              cloudRejectedCount,
              selectedSatellite: 'Sentinel-1',
              fallbackTriggered: true,
              fallbackReason,
            },
          };
        }
      } catch (err: unknown) {
        console.warn(`[GEE Search] Sentinel-1 SAR search error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      selectedScene: null,
      candidatesEvaluated,
      searchSummary: {
        totalSearched: candidatesEvaluated.length,
        opticalFound,
        sarFound,
        cloudRejectedCount,
        fallbackTriggered,
        fallbackReason: 'NO_SUITABLE_OBSERVATION_FOUND',
      },
    };
  }
}
