import { ZoneRepository } from '../../repositories/ZoneRepository.js';
import { TemporaryAreaRepository } from '../../repositories/TemporaryAreaRepository.js';
import { GeeSatelliteProvider } from './providers/GeeSatelliteProvider.js';
import type { ISatelliteProvider } from './providers/ISatelliteProvider.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';
import {
  SensorType,
  SatelliteSource,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type SatelliteSearchRequest,
  type SatelliteSearchResponse,
} from '@tn-forest/shared/types';
import { Types } from 'mongoose';
import { normalizeDateRange } from '../../utils/dateNormalization.js';

export class GeeSatelliteService {
  private zoneRepo: ZoneRepository;
  private tempAreaRepo: TemporaryAreaRepository;
  private provider: ISatelliteProvider;

  constructor(provider?: ISatelliteProvider) {
    this.zoneRepo = new ZoneRepository();
    this.tempAreaRepo = new TemporaryAreaRepository();
    this.provider = provider || new GeeSatelliteProvider();
  }

  public setProvider(provider: ISatelliteProvider): void {
    this.provider = provider;
  }

  public getProvider(): ISatelliteProvider {
    return this.provider;
  }

  public getLastQueryStats(): { pagesFetched: number; rawImageCount: number; uniqueImageCount: number } {
    if (this.provider && typeof (this.provider as any).getLastQueryStats === 'function') {
      return (this.provider as any).getLastQueryStats();
    }
    return { pagesFetched: 1, rawImageCount: 0, uniqueImageCount: 0 };
  }

  /**
   * Searches Google Earth Engine COPERNICUS/S2_SR_HARMONIZED collection
   * for real Sentinel-2 satellite imagery intersecting a target zone geometry.
   */
  public async searchSentinel2Images(request: SatelliteSearchRequest): Promise<SatelliteSearchResponse> {
    const { zoneId, startDate, endDate, maxCloudCover = 20.0, sensor } = request;
    let boundary: GeoJSONPolygon | GeoJSONMultiPolygon | undefined = request.boundary;

    // 1. Resolve Target Geometry
    let zoneName = 'Custom Boundary Polygon';
    if (zoneId) {
      if (Types.ObjectId.isValid(zoneId)) {
        const zone = await this.zoneRepo.findById(zoneId);
        if (zone) {
          zoneName = zone.name;
          boundary = zone.boundary;
        } else {
          // Check temporary area
          const tempArea = await this.tempAreaRepo.findById(zoneId);
          if (tempArea) {
            zoneName = tempArea.name;
            boundary = tempArea.boundary;
          } else {
            throw new AppError(`Zone or Temporary Area with ID ${zoneId} not found`, HTTP_STATUS.NOT_FOUND);
          }
        }
      } else {
        // String ID check (e.g. TMP-... or ZONE-...)
        const tempArea = await this.tempAreaRepo.findByTemporaryAreaId(zoneId);
        if (tempArea) {
          zoneName = tempArea.name;
          boundary = tempArea.boundary;
        } else {
          throw new AppError(`Zone with ID ${zoneId} not found`, HTTP_STATUS.NOT_FOUND);
        }
      }
    }

    if (!boundary || !['Polygon', 'MultiPolygon'].includes(boundary.type) || !Array.isArray(boundary.coordinates) || boundary.coordinates.length === 0) {
      throw new AppError('Valid GeoJSON Polygon or MultiPolygon boundary is required for satellite search', HTTP_STATUS.BAD_REQUEST);
    }

    const rings: [number, number][][] =
      boundary.type === 'MultiPolygon'
        ? (boundary.coordinates as [number, number][][][]).map((p) => p[0])
        : [(boundary.coordinates as [number, number][][])[0]];

    for (const ring of rings) {
      if (!ring || ring.length < 4) {
        throw new AppError('Polygon coordinates must contain at least 4 coordinate vertices', HTTP_STATUS.BAD_REQUEST);
      }
      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2 || isNaN(pt[0]) || isNaN(pt[1])) {
          throw new AppError('Invalid coordinate point in geometry', HTTP_STATUS.BAD_REQUEST);
        }
        const [lng, lat] = pt;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          throw new AppError(`Coordinate out of range: [${lng}, ${lat}]`, HTTP_STATUS.BAD_REQUEST);
        }
      }
    }

    // 2. Validate and Normalize Dates
    let start: Date;
    let end: Date;
    let exclusiveEndDate: Date;
    try {
      const normalized = normalizeDateRange(startDate, endDate);
      start = normalized.startDate;
      end = normalized.endDate;
      exclusiveEndDate = normalized.exclusiveEndDate;
    } catch (err: any) {
      throw new AppError(err.message, HTTP_STATUS.BAD_REQUEST);
    }

    // 3. Validate Cloud Cover
    if (isNaN(maxCloudCover) || maxCloudCover < 0 || maxCloudCover > 100) {
      throw new AppError(`maxCloudCover must be between 0 and 100 (got: ${maxCloudCover})`, HTTP_STATUS.BAD_REQUEST);
    }

    const isSar = sensor === 'SAR' || sensor === 'SENTINEL_1' || request.sensorType === SensorType.SAR || request.source === SatelliteSource.SENTINEL_1;
    const collection = isSar
      ? 'COPERNICUS/S1_GRD'
      : request.source === SatelliteSource.LANDSAT_8
        ? 'LANDSAT/LC08/C02/T1_L2'
        : request.source === SatelliteSource.LANDSAT_9
          ? 'LANDSAT/LC09/C02/T1_L2'
          : request.source === SatelliteSource.SENTINEL_2
            ? 'COPERNICUS/S2_SR_HARMONIZED'
            : 'COPERNICUS/S2_SR_HARMONIZED, LANDSAT/LC08/C02/T1_L2, LANDSAT/LC09/C02/T1_L2';

    // 4. Log Structured GEE Search Parameters
    console.info(`[GEE] Search started: Collection ${collection} for zone "${zoneName}" (${zoneId || 'Custom'})`);
    console.info(`[GEE] Zone geometry: GeoJSON ${boundary.type} with ${rings[0].length} coordinates`);
    console.info(`[GEE] Date range: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);
    console.info(`[GEE] Cloud filter: ${isSar ? 'None (All-Weather SAR radar)' : `<= ${maxCloudCover}% CLOUDY_PIXEL_PERCENTAGE`}`);

    // 5. Query Provider (Dispatch according to sensor track: OPTICAL -> searchOpticalImages, SAR -> searchSarImages)
    const images = isSar
      ? await this.provider.searchSarImages(boundary, {
          startDate: start,
          endDate: exclusiveEndDate,
          maxCloudCover: 100.0,
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
        })
      : await this.provider.searchOpticalImages(boundary, {
          startDate: start,
          endDate: exclusiveEndDate,
          maxCloudCover,
          source: request.source,
          sensorType: SensorType.OPTICAL,
        });

    console.info(`[GEE] Images found: ${images.length}`);
    if (images.length > 0) {
      const firstImg = images[0];
      console.info(`[GEE] First image ID: ${firstImg.imageId}`);
      console.info(`[GEE] First acquisition date: ${firstImg.acquisitionDate}`);
    }

    return {
      zoneId,
      sensorType: isSar ? SensorType.SAR : SensorType.OPTICAL,
      totalFound: images.length,
      filterApplied: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        maxCloudCover,
        collection,
      },
      images,
    };
  }

  /**
   * Searches Google Earth Engine Sentinel-1 SAR collection.
   */
  public async searchSarImages(request: SatelliteSearchRequest): Promise<SatelliteSearchResponse> {
    return this.searchSentinel2Images({ ...request, sensor: 'SAR' as any });
  }

  /**
   * Generic image search covering optical multi-collection or SAR based on request parameters.
   */
  public async searchImages(request: SatelliteSearchRequest): Promise<SatelliteSearchResponse> {
    return this.searchSentinel2Images(request);
  }
}

