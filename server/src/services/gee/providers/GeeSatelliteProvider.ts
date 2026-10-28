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
} from '@tn-forest/shared/types';
import type {
  ISatelliteProvider,
  ProviderSearchOptions,
  AcquiredSatelliteData,
} from './ISatelliteProvider.js';
import { GeeAuthService } from '../GeeAuthService.js';
import {
  GeeClientService,
  SENTINEL_2_BANDS,
  LANDSAT_BANDS,
  SRTM_DEM_BANDS,
  type RawGeeImageRecord,
} from '../GeeClientService.js';
import { AppError } from '../../../utils/AppError.js';
import { HTTP_STATUS } from '../../../constants/index.js';
import { SarCompatibilityService } from '../../spatial/SarCompatibilityService.js';

export const REQUIRED_SENTINEL2_BANDS = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];
export const REQUIRED_SENTINEL1_BANDS = ['VV', 'VH'];

export class GeeSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'REAL_GEE_PROVIDER';
  public readonly isRealProvider = true;

  private authService: GeeAuthService;
  private clientService: GeeClientService;

  constructor() {
    this.authService = GeeAuthService.getInstance();
    this.clientService = new GeeClientService();
  }

  public getLastQueryStats() {
    return this.clientService.getLastQueryStats();
  }

  /**
   * Helper to search Sentinel-2 optical imagery from COPERNICUS/S2_SR_HARMONIZED.
   */
  public async searchSentinel2Images(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealSentinel2ImageDto[]> {
    const { startDate, endDate, maxCloudCover = 20.0 } = options;
    const collection = 'COPERNICUS/S2_SR_HARMONIZED';

    console.info(`[GEE] Provider (${this.providerName}): Searching optical collection ${collection}`);
    console.info(`[GEE] Date range: ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)} | Max cloud: ${maxCloudCover}%`);

    const rawRecords = await this.clientService.querySentinel2Collection({
      collection,
      geometry,
      startDate,
      endDate,
      maxCloudCover,
    });

    if (rawRecords.length === 0) {
      return [];
    }

    // Validate Required Spectral Bands (B2, B3, B4, B8, B11, B12)
    const availableBandIds = SENTINEL_2_BANDS.map((b) => b.id);
    for (const reqBand of REQUIRED_SENTINEL2_BANDS) {
      if (!availableBandIds.includes(reqBand)) {
        throw new AppError(
          `GEE Sentinel-2 collection missing required band: ${reqBand} (${GeeErrorCode.GEE_REQUIRED_BAND_MISSING})`,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
        );
      }
    }

    return rawRecords.map((raw) => {
      const timeStart = Number(raw.properties?.['system:time_start'] || 0);
      const cloud = Number(raw.properties?.CLOUDY_PIXEL_PERCENTAGE ?? raw.properties?.CLOUD_COVERAGE_ASSESSMENT ?? 0);
      const spacecraft = String(raw.properties?.SPACECRAFT_NAME || 'Sentinel-2');
      const sunAngle = typeof raw.properties?.MEAN_SUN_ELEVATION_ANGLE === 'number'
        ? Number(raw.properties.MEAN_SUN_ELEVATION_ANGLE)
        : undefined;

      return {
        imageId: raw.id,
        source: SatelliteSource.SENTINEL_2,
        sensorType: SensorType.OPTICAL,
        spacecraftName: spacecraft,
        acquisitionDate: new Date(timeStart).toISOString(),
        cloudCoverPercentage: cloud,
        sunElevationAngle: sunAngle,
        footprint: geometry,
        bands: SENTINEL_2_BANDS,
        geeAssetPath: raw.id,
        isRealTelemetry: true,
      };
    });
  }

  /**
   * Searches real optical imagery across Sentinel-2, Landsat-8, and Landsat-9 collections.
   */
  public async searchOpticalImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<(RealSentinel2ImageDto | RealLandsatImageDto)[]> {
    const { source } = options;

    if (source === SatelliteSource.SENTINEL_2) {
      const results = await this.searchSentinel2Images(geometry, options);
      return this.deduplicateAndSort(results);
    }

    if (source === SatelliteSource.LANDSAT_8 || source === SatelliteSource.LANDSAT_9) {
      const results = await this.searchLandsatImages(geometry, { ...options, source });
      return this.deduplicateAndSort(results);
    }

    // Query Sentinel-2, Landsat-8, and Landsat-9 in parallel
    const [s2Res, l8Res, l9Res] = await Promise.allSettled([
      this.searchSentinel2Images(geometry, options),
      this.searchLandsatImages(geometry, { ...options, source: SatelliteSource.LANDSAT_8 }),
      this.searchLandsatImages(geometry, { ...options, source: SatelliteSource.LANDSAT_9 }),
    ]);

    const allImages: (RealSentinel2ImageDto | RealLandsatImageDto)[] = [];
    if (s2Res.status === 'fulfilled') {
      allImages.push(...s2Res.value);
    } else {
      console.warn(`[GEE] Sentinel-2 search failed: ${s2Res.reason?.message || s2Res.reason}`);
    }

    if (l8Res.status === 'fulfilled') {
      allImages.push(...l8Res.value);
    } else {
      console.warn(`[GEE] Landsat-8 search failed: ${l8Res.reason?.message || l8Res.reason}`);
    }

    if (l9Res.status === 'fulfilled') {
      allImages.push(...l9Res.value);
    } else {
      console.warn(`[GEE] Landsat-9 search failed: ${l9Res.reason?.message || l9Res.reason}`);
    }

    return this.deduplicateAndSort(allImages);
  }

  private deduplicateAndSort<T extends { imageId: string; acquisitionDate: string }>(images: T[]): T[] {
    const map = new Map<string, T>();
    for (const img of images) {
      if (!map.has(img.imageId)) {
        map.set(img.imageId, img);
      }
    }
    const deduplicated = Array.from(map.values());
    deduplicated.sort((a, b) => {
      const tA = new Date(a.acquisitionDate).getTime();
      const tB = new Date(b.acquisitionDate).getTime();
      if (tB !== tA) {
        return tB - tA; // DESC
      }
      return a.imageId.localeCompare(b.imageId); // ASC
    });
    return deduplicated;
  }

  /**
   * Searches real Sentinel-1 SAR C-Band radar imagery from COPERNICUS/S1_GRD.
   */
  public async searchSarImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealSarImageDto[]> {
    const { startDate, endDate } = options;
    const collection = 'COPERNICUS/S1_GRD';

    console.info(`[GEE] Provider (${this.providerName}): Searching SAR collection ${collection}`);
    console.info(`[GEE] Date range: ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)} (All-weather C-SAR)`);

    const sarBands = [
      { id: 'VV', name: 'Single Co-polarization (VV)', unit: 'dB', description: 'C-band vertical transmit/vertical receive backscatter' },
      { id: 'VH', name: 'Dual Cross-polarization (VH)', unit: 'dB', description: 'C-band vertical transmit/horizontal receive backscatter' },
      { id: 'angle', name: 'Incidence angle', unit: 'degrees', description: 'Local radar incidence angle across scene' },
    ];

    const rawImages = await this.clientService.querySarCollection({
      collection,
      geometry,
      startDate,
      endDate,
    });

    const results: RealSarImageDto[] = rawImages.map((raw) => {
      const parsed = SarCompatibilityService.parseSentinel1Metadata(raw.id, raw.properties);
      const timeStart = parsed.acquisitionDate
        ? parsed.acquisitionDate.getTime()
        : Number(raw.properties?.['system:time_start'] || 0);
      return {
        imageId: raw.id,
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        spacecraftName: parsed.platform,
        acquisitionDate: new Date(timeStart).toISOString(),
        polarization: parsed.polarizations.join('+'),
        polarizations: parsed.polarizations,
        acquisitionMode: parsed.mode,
        mode: parsed.mode,
        orbitDirection: parsed.orbitDirection,
        orbitNumber: parsed.relativeOrbitNumber ?? parsed.absoluteOrbitNumber ?? 135,
        relativeOrbitNumber: parsed.relativeOrbitNumber,
        absoluteOrbitNumber: parsed.absoluteOrbitNumber,
        footprint: geometry,
        bands: sarBands,
        geeAssetPath: raw.id,
        isRealTelemetry: true,
      };
    });

    return this.deduplicateAndSort(results);
  }

  /**
   * Parses Sentinel-1 GRD asset metadata from the canonical GEE asset ID string.
   * e.g., COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T060200_20200102T060225_030617_038234_B79D
   */
  private parseSarMetadataFromImageId(
    imageId: string,
    fallbackDate?: Date,
  ): {
    spacecraftName: string;
    polarization: string;
    acquisitionMode: string;
    orbitDirection: string;
    orbitNumber: number;
    acquisitionDate: Date;
  } {
    const parts = imageId.split('/');
    const assetName = parts[parts.length - 1] || imageId;
    const tokens = assetName.split('_');

    const mission = tokens[0] || 'S1A';
    const spacecraftName = mission.startsWith('S1B') ? 'Sentinel-1B' : 'Sentinel-1A';
    const acquisitionMode = tokens[1] || 'IW';
    const polCode = tokens[3] || '1SDV';
    const polarization = polCode.includes('DV')
      ? 'VV+VH'
      : polCode.includes('DH')
        ? 'HH+HV'
        : polCode.includes('SH')
          ? 'HH'
          : 'VV';

    let acquisitionDate = fallbackDate || new Date();
    const timeToken = tokens[4]; // e.g. 20200102T060200
    if (timeToken && timeToken.length >= 15 && timeToken.includes('T')) {
      const yr = timeToken.slice(0, 4);
      const mo = timeToken.slice(4, 6);
      const da = timeToken.slice(6, 8);
      const hr = timeToken.slice(9, 11);
      const mi = timeToken.slice(11, 13);
      const se = timeToken.slice(13, 15);
      const parsed = new Date(`${yr}-${mo}-${da}T${hr}:${mi}:${se}.000Z`);
      if (!isNaN(parsed.getTime())) {
        acquisitionDate = parsed;
      }
    }

    const orbitNumber = tokens[6] ? parseInt(tokens[6], 10) : 135;

    return {
      spacecraftName,
      polarization,
      acquisitionMode,
      orbitDirection: 'DESCENDING',
      orbitNumber: isNaN(orbitNumber) ? 135 : orbitNumber,
      acquisitionDate,
    };
  }

  private parseOpticalMetadataFromImageId(
    imageId: string,
    fallbackDate?: Date,
  ): {
    source: SatelliteSource;
    spacecraftName: string;
    acquisitionDate: Date;
    bands: string[];
    nativeResolutionMeters: number;
    collectionPath: string;
  } {
    const isL8 = imageId.includes('LC08');
    const isL9 = imageId.includes('LC09');

    let source = SatelliteSource.SENTINEL_2;
    let spacecraftName = 'Sentinel-2';
    let nativeResolutionMeters = 10;
    let bands = REQUIRED_SENTINEL2_BANDS;
    let collectionPath = 'COPERNICUS/S2_SR_HARMONIZED';

    if (isL8) {
      source = SatelliteSource.LANDSAT_8;
      spacecraftName = 'Landsat 8';
      nativeResolutionMeters = 30;
      bands = LANDSAT_BANDS.map((b) => b.id);
      collectionPath = 'LANDSAT/LC08/C02/T1_L2';
    } else if (isL9) {
      source = SatelliteSource.LANDSAT_9;
      spacecraftName = 'Landsat 9';
      nativeResolutionMeters = 30;
      bands = LANDSAT_BANDS.map((b) => b.id);
      collectionPath = 'LANDSAT/LC09/C02/T1_L2';
    }

    let acquisitionDate = fallbackDate || new Date();
    const parts = imageId.split('/');
    const lastPart = parts[parts.length - 1] || imageId;
    const s2DateMatch = lastPart.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    const landsatDateMatch = lastPart.match(/(\d{4})(\d{2})(\d{2})/);

    if (s2DateMatch) {
      const [, y, m, d, hh, mm, ss] = s2DateMatch;
      const parsed = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`);
      if (!isNaN(parsed.getTime())) acquisitionDate = parsed;
    } else if (landsatDateMatch) {
      const [, y, m, d] = landsatDateMatch;
      const parsed = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
      if (!isNaN(parsed.getTime())) acquisitionDate = parsed;
    }

    return {
      source,
      spacecraftName,
      acquisitionDate,
      bands,
      nativeResolutionMeters,
      collectionPath,
    };
  }

  /**
   * Acquires the best observation for a zone from real GEE collections.
   */
  public async acquireBestImage(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<AcquiredSatelliteData> {
    const isSar = options.sensorType === SensorType.SAR || options.source === SatelliteSource.SENTINEL_1;

    if (isSar) {
      // Direct acquisition if user explicitly selected a known candidate observation
      if (options.imageId) {
        console.info(
          `[GEE] Provider (${this.providerName}): Acquiring explicit SAR candidate asset ${options.imageId} (bypassing collection discovery search)`,
        );
        const sarMeta = SarCompatibilityService.parseSentinel1Metadata(options.imageId);
        return {
          imageId: options.imageId,
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
          acquisitionDate: sarMeta.acquisitionDate || options.startDate || new Date(),
          cloudCover: 0.0, // SAR is all-weather / cloud-independent
          footprint: geometry,
          geeReference: `ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)`,
          metadata: {
            platform: sarMeta.platform,
            mission: sarMeta.mission,
            instrument: sarMeta.instrument,
            mode: sarMeta.mode,
            polarizations: sarMeta.polarizations,
            orbitDirection: sarMeta.orbitDirection,
            absoluteOrbitNumber: sarMeta.absoluteOrbitNumber,
            relativeOrbitNumber: sarMeta.relativeOrbitNumber,
            spacecraftName: sarMeta.platform,
            polarization: sarMeta.polarizations.join('+'),
            acquisitionMode: sarMeta.mode,
            orbitNumber: sarMeta.relativeOrbitNumber ?? sarMeta.absoluteOrbitNumber ?? 135,
            isRealTelemetry: true,
          },
          isRealTelemetry: true,
        };
      }

      const sarImages = await this.searchSarImages(geometry, options);
      if (sarImages.length === 0) {
        throw new AppError(
          `No real Sentinel-1 SAR imagery found for specified period (${GeeErrorCode.GEE_NO_IMAGES_FOUND})`,
          HTTP_STATUS.NOT_FOUND,
        );
      }

      const best = sarImages[0];
      return {
        imageId: best.imageId,
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: new Date(best.acquisitionDate),
        cloudCover: 0.0, // SAR is all-weather / cloud-independent
        footprint: geometry,
        geeReference: `ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)`,
        metadata: {
          platform: best.spacecraftName,
          mission: best.spacecraftName.includes('1B') ? 'S1B' : 'S1A',
          instrument: 'C-SAR',
          mode: best.mode || best.acquisitionMode,
          polarizations: best.polarizations || [best.polarization],
          orbitDirection: best.orbitDirection,
          absoluteOrbitNumber: best.absoluteOrbitNumber,
          relativeOrbitNumber: best.relativeOrbitNumber,
          spacecraftName: best.spacecraftName,
          polarization: best.polarization,
          acquisitionMode: best.acquisitionMode,
          orbitNumber: best.orbitNumber,
          isRealTelemetry: true,
        },
        isRealTelemetry: true,
      };
    }

    // Optical search - strictly optical! No cross-sensor fallback!
    if (options.imageId) {
      console.info(
        `[GEE] Provider (${this.providerName}): Acquiring explicit optical candidate asset ${options.imageId}`,
      );
      try {
        const opticalImages = await this.searchOpticalImages(geometry, options);
        const matched = opticalImages.find((img) => img.imageId === options.imageId);
        if (matched) {
          const isS2 = matched.source === SatelliteSource.SENTINEL_2;
          const isL9 = matched.source === SatelliteSource.LANDSAT_9;
          const collectionPath = isS2
            ? 'COPERNICUS/S2_SR_HARMONIZED'
            : isL9
              ? 'LANDSAT/LC09/C02/T1_L2'
              : 'LANDSAT/LC08/C02/T1_L2';

          return {
            imageId: matched.imageId,
            source: matched.source,
            sensorType: SensorType.OPTICAL,
            acquisitionDate: new Date(matched.acquisitionDate),
            cloudCover: matched.cloudCoverPercentage,
            footprint: geometry,
            geeReference: `ee.ImageCollection("${collectionPath}").filterBounds(geometry)`,
            metadata: {
              spacecraftName: matched.spacecraftName,
              sunElevationAngle: matched.sunElevationAngle,
              cloudCoverPercentage: matched.cloudCoverPercentage,
              nativeResolutionMeters: isS2 ? 10 : 30,
              bands: matched.bands.map((b: { id: string }) => b.id),
              isRealTelemetry: true,
            },
            isRealTelemetry: true,
          };
        }
      } catch (err: any) {
        console.warn(`[GEE] Search for explicit optical candidate ${options.imageId} yielded error, using direct parser:`, err.message);
      }

      // If not returned by search, parse direct metadata
      const parsed = this.parseOpticalMetadataFromImageId(options.imageId, options.startDate);
      return {
        imageId: options.imageId,
        source: parsed.source,
        sensorType: SensorType.OPTICAL,
        acquisitionDate: parsed.acquisitionDate,
        cloudCover: options.maxCloudCover ?? 0.0,
        footprint: geometry,
        geeReference: `ee.ImageCollection("${parsed.collectionPath}").filterBounds(geometry)`,
        metadata: {
          spacecraftName: parsed.spacecraftName,
          cloudCoverPercentage: options.maxCloudCover ?? 0.0,
          nativeResolutionMeters: parsed.nativeResolutionMeters,
          bands: parsed.bands,
          isRealTelemetry: true,
        },
        isRealTelemetry: true,
      };
    }

    // No imageId specified: search optical images across requested source or all optical sources
    const opticalImages = await this.searchOpticalImages(geometry, options);
    if (opticalImages.length === 0) {
      const sourceDesc = options.source ? `source ${options.source}` : 'optical collections (Sentinel-2, Landsat-8, Landsat-9)';
      throw new AppError(
        `No optical imagery found for ${sourceDesc} under cloud threshold ${options.maxCloudCover ?? 20}% (${GeeErrorCode.GEE_NO_IMAGES_FOUND})`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // Pick image with lowest cloud cover among the found images
    const best = opticalImages.reduce((prev, curr) =>
      curr.cloudCoverPercentage < prev.cloudCoverPercentage ? curr : prev,
      opticalImages[0],
    );

    const isS2 = best.source === SatelliteSource.SENTINEL_2;
    const isL9 = best.source === SatelliteSource.LANDSAT_9;
    const collectionPath = isS2
      ? 'COPERNICUS/S2_SR_HARMONIZED'
      : isL9
        ? 'LANDSAT/LC09/C02/T1_L2'
        : 'LANDSAT/LC08/C02/T1_L2';

    return {
      imageId: best.imageId,
      source: best.source,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date(best.acquisitionDate),
      cloudCover: best.cloudCoverPercentage,
      footprint: geometry,
      geeReference: `ee.ImageCollection("${collectionPath}").filterBounds(geometry)`,
      metadata: {
        spacecraftName: best.spacecraftName,
        sunElevationAngle: best.sunElevationAngle,
        cloudCoverPercentage: best.cloudCoverPercentage,
        nativeResolutionMeters: isS2 ? 10 : 30,
        bands: best.bands.map((b: { id: string }) => b.id),
        isRealTelemetry: true,
      },
      isRealTelemetry: true,
    };
  }

  /**
   * Searches real Landsat 8 or Landsat 9 optical imagery (LANDSAT/LC08/C02/T1_L2, LANDSAT/LC09/C02/T1_L2).
   */
  public async searchLandsatImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
    options: ProviderSearchOptions,
  ): Promise<RealLandsatImageDto[]> {
    const { startDate, endDate, maxCloudCover = 20.0, source = SatelliteSource.LANDSAT_8 } = options;
    const isL9 = source === SatelliteSource.LANDSAT_9;
    const collection = isL9 ? 'LANDSAT/LC09/C02/T1_L2' : 'LANDSAT/LC08/C02/T1_L2';

    console.info(`[GEE] Provider (${this.providerName}): Searching Landsat collection ${collection}`);
    console.info(`[GEE] Date range: ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)} | Max cloud: ${maxCloudCover}%`);

    const rawRecords = await this.clientService.queryLandsatCollection({
      collection,
      geometry,
      startDate,
      endDate,
      maxCloudCover,
    });

    if (rawRecords.length === 0) {
      return [];
    }

    rawRecords.sort((a, b) => {
      const tA = Number(a.properties?.['system:time_start'] || 0);
      const tB = Number(b.properties?.['system:time_start'] || 0);
      return tA - tB;
    });

    return rawRecords.map((raw) => {
      const timeStart = Number(raw.properties?.['system:time_start'] || 0);
      const cloud = Number(raw.properties?.CLOUD_COVER ?? raw.properties?.CLOUDY_PIXEL_PERCENTAGE ?? 0);
      const spacecraft = String(raw.properties?.SPACECRAFT_NAME || (isL9 ? 'Landsat 9' : 'Landsat 8'));
      const sunElevation = typeof raw.properties?.SUN_ELEVATION === 'number' ? Number(raw.properties.SUN_ELEVATION) : undefined;

      return {
        imageId: raw.id,
        source: isL9 ? SatelliteSource.LANDSAT_9 : SatelliteSource.LANDSAT_8,
        sensorType: SensorType.OPTICAL,
        spacecraftName: spacecraft,
        acquisitionDate: new Date(timeStart).toISOString(),
        cloudCoverPercentage: cloud,
        sunElevationAngle: sunElevation,
        footprint: geometry,
        bands: LANDSAT_BANDS,
        geeAssetPath: raw.id,
        isRealTelemetry: true,
        nativeResolutionMeters: 30,
      };
    });
  }

  /**
   * Searches SRTM Global Elevation DEM (USGS/SRTMGL1_003).
   */
  public async searchDemImages(
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon,
  ): Promise<RealDemImageDto> {
    const raw = await this.clientService.queryDemCollection({ geometry });
    return {
      imageId: raw.id,
      source: SatelliteSource.SRTM,
      sensorType: SensorType.DEM,
      datasetName: 'SRTM 1 Arc-Second Global Elevation (30m)',
      acquisitionDate: '2000-02-11T00:00:00.000Z',
      footprint: geometry,
      bands: SRTM_DEM_BANDS,
      geeAssetPath: raw.id,
      isRealTelemetry: true,
      nativeResolutionMeters: 30,
    };
  }


}
