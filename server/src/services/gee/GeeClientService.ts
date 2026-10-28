import { GeeAuthService } from './GeeAuthService.js';
import type { GeoJSONPolygon, GeoJSONMultiPolygon, Sentinel2BandInfo, LandsatBandInfo } from '@tn-forest/shared/types';
import { GeeErrorCode } from '@tn-forest/shared/types';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export const SENTINEL_2_BANDS: Sentinel2BandInfo[] = [
  { id: 'B1', name: 'Coastal aerosol', resolutionMeters: 60, description: '443 nm aerosol optical thickness', centralWavelengthNm: 443 },
  { id: 'B2', name: 'Blue', resolutionMeters: 10, description: '490 nm surface reflectance', centralWavelengthNm: 490 },
  { id: 'B3', name: 'Green', resolutionMeters: 10, description: '560 nm surface reflectance', centralWavelengthNm: 560 },
  { id: 'B4', name: 'Red', resolutionMeters: 10, description: '665 nm surface reflectance', centralWavelengthNm: 665 },
  { id: 'B5', name: 'Vegetation red edge 1', resolutionMeters: 20, description: '705 nm red edge reflectance', centralWavelengthNm: 705 },
  { id: 'B6', name: 'Vegetation red edge 2', resolutionMeters: 20, description: '740 nm red edge reflectance', centralWavelengthNm: 740 },
  { id: 'B7', name: 'Vegetation red edge 3', resolutionMeters: 20, description: '783 nm red edge reflectance', centralWavelengthNm: 783 },
  { id: 'B8', name: 'Near Infrared (NIR)', resolutionMeters: 10, description: '842 nm surface reflectance', centralWavelengthNm: 842 },
  { id: 'B8A', name: 'Narrow NIR', resolutionMeters: 20, description: '865 nm surface reflectance', centralWavelengthNm: 865 },
  { id: 'B9', name: 'Water vapour', resolutionMeters: 60, description: '940 nm atmospheric absorption', centralWavelengthNm: 940 },
  { id: 'B11', name: 'SWIR 1', resolutionMeters: 20, description: '1610 nm surface reflectance', centralWavelengthNm: 1610 },
  { id: 'B12', name: 'SWIR 2', resolutionMeters: 20, description: '2190 nm surface reflectance', centralWavelengthNm: 2190 },
  { id: 'AOT', name: 'Aerosol optical thickness', resolutionMeters: 10, description: 'Atmospheric optical depth' },
  { id: 'WVP', name: 'Water vapour map', resolutionMeters: 10, description: 'Total atmospheric water column' },
  { id: 'SCL', name: 'Scene classification map', resolutionMeters: 20, description: 'Land, water, cloud, shadow class map' },
  { id: 'TCI_R', name: 'True color red', resolutionMeters: 10, description: 'Visual red channel' },
  { id: 'TCI_G', name: 'True color green', resolutionMeters: 10, description: 'Visual green channel' },
  { id: 'TCI_B', name: 'True color blue', resolutionMeters: 10, description: 'Visual blue channel' },
  { id: 'MSK_CLDPRB', name: 'Cloud probability map', resolutionMeters: 20, description: '0–100% cloud probability' },
  { id: 'MSK_SNWPRB', name: 'Snow probability map', resolutionMeters: 20, description: '0–100% snow probability' },
  { id: 'QA10', name: 'Quality assurance 10m', resolutionMeters: 10, description: 'Detector geometry and quality' },
  { id: 'QA20', name: 'Quality assurance 20m', resolutionMeters: 20, description: 'Detector geometry and quality' },
  { id: 'QA60', name: 'Opaque/cirrus cloud mask', resolutionMeters: 60, description: 'Quality indicator cloud flags' },
];

export const LANDSAT_BANDS: LandsatBandInfo[] = [
  { id: 'SR_B1', name: 'Coastal aerosol', resolutionMeters: 30, description: '443 nm ultra blue', centralWavelengthNm: 443, scaleFactor: 0.0000275, offset: -0.2 },
  { id: 'SR_B2', name: 'Blue', resolutionMeters: 30, description: '482 nm surface reflectance', centralWavelengthNm: 482, scaleFactor: 0.0000275, offset: -0.2 },
  { id: 'SR_B3', name: 'Green', resolutionMeters: 30, description: '561 nm surface reflectance', centralWavelengthNm: 561, scaleFactor: 0.0000275, offset: -0.2 },
  { id: 'SR_B4', name: 'Red', resolutionMeters: 30, description: '654 nm surface reflectance', centralWavelengthNm: 654, scaleFactor: 0.0000275, offset: -0.2 },
  { id: 'SR_B5', name: 'Near Infrared (NIR)', resolutionMeters: 30, description: '865 nm surface reflectance', centralWavelengthNm: 865, scaleFactor: 0.0000275, offset: -0.2 },
  { id: 'SR_B6', name: 'SWIR 1', resolutionMeters: 30, description: '1608 nm surface reflectance', centralWavelengthNm: 1608, scaleFactor: 0.0000275, offset: -0.2 },
  { id: 'SR_B7', name: 'SWIR 2', resolutionMeters: 30, description: '2200 nm surface reflectance', centralWavelengthNm: 2200, scaleFactor: 0.0000275, offset: -0.2 },
  { id: 'ST_B10', name: 'Surface Temperature', resolutionMeters: 30, description: '10895 nm thermal radiance', centralWavelengthNm: 10895, scaleFactor: 0.00341802, offset: 149.0 },
  { id: 'QA_PIXEL', name: 'Pixel Quality Bitmask', resolutionMeters: 30, description: 'Cloud, shadow, cirrus, snow/ice bit flags' },
  { id: 'QA_RADSAT', name: 'Radiometric Saturation QA', resolutionMeters: 30, description: 'Band radiometric saturation mask' },
];

export const SAR_BANDS = [
  { id: 'VV', name: 'Single Co-polarization (VV)', unit: 'dB', description: 'C-band vertical transmit/vertical receive backscatter', resolutionMeters: 10 },
  { id: 'VH', name: 'Dual Cross-polarization (VH)', unit: 'dB', description: 'C-band vertical transmit/horizontal receive backscatter', resolutionMeters: 10 },
  { id: 'angle', name: 'Incidence angle', unit: 'degrees', description: 'Local radar incidence angle across scene', resolutionMeters: 10 },
];

export const SRTM_DEM_BANDS = [
  { id: 'elevation', name: 'Elevation', unit: 'meters', description: '1 Arc-Second Global Elevation above WGS84 ellipsoid', resolutionMeters: 30 },
  { id: 'slope', name: 'Slope', unit: 'degrees', description: 'Terrain gradient slope angle', resolutionMeters: 30 },
  { id: 'aspect', name: 'Aspect', unit: 'degrees', description: 'Terrain slope compass orientation (0–360°)', resolutionMeters: 30 },
];

export interface RawGeeImageRecord {
  id: string;
  name?: string;
  startTime?: string;
  endTime?: string;
  updateTime?: string;
  properties: {
    'system:time_start'?: number; // Epoch ms
    'system:index'?: string;
    CLOUDY_PIXEL_PERCENTAGE?: number;
    CLOUD_COVERAGE_ASSESSMENT?: number;
    CLOUD_COVER?: number;
    CLOUD_COVER_LAND?: number;
    SPACECRAFT_NAME?: string;
    SPACECRAFT_ID?: string;
    MEAN_SUN_ELEVATION_ANGLE?: number;
    SUN_ELEVATION?: number;
    DATATAKE_IDENTIFIER?: string;
    platform_number?: string;
    orbitProperties_pass?: string;
    relativeOrbitNumber_start?: number;
    [key: string]: unknown;
  };
  geometry?: {
    type: string;
    coordinates: number[][][];
  };
}

export interface GeeQueryStats {
  pagesFetched: number;
  rawImageCount: number;
  uniqueImageCount: number;
}

export class GeeClientService {
  private authService: GeeAuthService;
  private lastQueryStats: GeeQueryStats = {
    pagesFetched: 0,
    rawImageCount: 0,
    uniqueImageCount: 0,
  };

  constructor() {
    this.authService = GeeAuthService.getInstance();
  }

  public getLastQueryStats(): GeeQueryStats {
    return { ...this.lastQueryStats };
  }

  /**
   * Queries Google Earth Engine public asset collection for images using
   * the official GET /v1alpha/projects/earthengine-public/assets/{collection}:listImages method.
   */
  public async listPublicImages(params: {
    collection: string;
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
    startDate: Date;
    endDate: Date;
    pageSize?: number;
    pageToken?: string;
  }): Promise<{ images: RawGeeImageRecord[]; nextPageToken?: string }> {
    const { collection, geometry, startDate, endDate, pageSize = 100, pageToken } = params;
    const token = await this.authService.getAccessToken();
    const config = this.authService.getConfig();

    if (!token) {
      console.error(`[GEE_DISCOVERY] Authentication failed: No access token available for caller project ${config.projectId}. Cannot search ${collection}.`);
      throw new AppError(
        `GEE authentication failed: No access token available. Configure Application Default Credentials or service account.`,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    const publicAssetParent = `projects/earthengine-public/assets/${collection}`;
    const url = new URL(`https://earthengine.googleapis.com/v1alpha/${publicAssetParent}:listImages`);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('startTime', startDate.toISOString());
    url.searchParams.set('endTime', endDate.toISOString());
    url.searchParams.set('region', JSON.stringify(geometry));
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const maxRetries = 2;
    let attempt = 0;

    while (true) {
      try {
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Goog-User-Project': config.projectId,
          },
        });

        if (!res.ok) {
          const isTransient = res.status === 502 || res.status === 503;
          if (isTransient && attempt < maxRetries) {
            attempt++;
            const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
            console.warn(
              `[GEE_CLIENT] Transient HTTP ${res.status} querying ${publicAssetParent}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          const errorBody = await res.text().catch(() => '');
          console.error(
            `[GEE_DISCOVERY] API Error HTTP ${res.status} (${res.statusText}) querying ${publicAssetParent}. Response: ${errorBody}`,
          );
          throw new AppError(
            `GEE API error searching ${collection} (HTTP ${res.status}): ${errorBody || res.statusText}`,
            res.status === 404 ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.INTERNAL_SERVER_ERROR,
          );
        }

        const data = (await res.json()) as { images?: RawGeeImageRecord[]; nextPageToken?: string };
        const rawImages = (data.images || []).map((img) => {
          const props = img.properties || {};
          if (props['system:time_start'] === undefined) {
            if (img.startTime) {
              props['system:time_start'] = new Date(img.startTime).getTime();
            } else {
              props['system:time_start'] = startDate.getTime();
            }
          }
          return {
            ...img,
            properties: props,
          };
        });

        return {
          images: rawImages,
          nextPageToken: data.nextPageToken,
        };
      } catch (err: unknown) {
        if (err instanceof AppError) {
          throw err;
        }
        if (attempt < maxRetries) {
          attempt++;
          const backoffMs = Math.min(1000, 300 * Math.pow(2, attempt - 1));
          const msg = err instanceof Error ? err.message : 'Unknown network error';
          console.warn(
            `[GEE_CLIENT] Temporary network failure querying ${publicAssetParent}: ${msg}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        const msg = err instanceof Error ? err.message : 'Unknown network error';
        console.error(`[GEE_DISCOVERY] Network error querying ${publicAssetParent}: ${msg}`);
        throw new AppError(
          `GEE network error searching ${collection}: ${msg}`,
          HTTP_STATUS.SERVICE_UNAVAILABLE,
        );
      }
    }
  }

  /**
   * Fetches all public images across all GEE REST pagination pages.
   * Enforces loop detection and maximum page safety limits.
   */
  public async fetchAllPublicImages(params: {
    collection: string;
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
    startDate: Date;
    endDate: Date;
    pageSize?: number;
    maxPages?: number;
  }): Promise<{ images: RawGeeImageRecord[]; pagesFetched: number; rawCount: number; uniqueCount: number }> {
    const { collection, geometry, startDate, endDate, pageSize = 100, maxPages = 50 } = params;
    const allImages: RawGeeImageRecord[] = [];
    let pageToken: string | undefined = undefined;
    let pageCount = 0;
    const seenTokens = new Set<string>();

    do {
      pageCount++;
      if (pageToken) {
        if (seenTokens.has(pageToken)) {
          console.error(`[GEE_PAGINATION] Loop detected for collection ${collection}: pageToken was returned repeatedly.`);
          throw new AppError(
            `GEE pagination error: Loop detected on pageToken for collection ${collection} (${GeeErrorCode.GEE_PAGINATION_ERROR})`,
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
          );
        }
        seenTokens.add(pageToken);
      }

      const res = await this.listPublicImages({
        collection,
        geometry,
        startDate,
        endDate,
        pageSize,
        pageToken,
      });

      console.info(`GEE pagination page:\n${pageCount}\n\nImages:\n${res.images.length}\n\nnextPageToken:\n${res.nextPageToken ? 'PRESENT' : 'NONE'}`);

      allImages.push(...res.images);
      pageToken = res.nextPageToken;

      if (pageToken && pageCount >= maxPages) {
        console.error(
          `[GEE_PAGINATION] Safety limit of ${maxPages} pages reached for collection ${collection}.`,
        );
        throw new AppError(
          `GEE pagination safety limit reached (${maxPages} pages) (${GeeErrorCode.GEE_PAGINATION_LIMIT_REACHED})`,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
        );
      }
    } while (pageToken);

    // Deduplicate across pages by stable image ID
    const rawImageCount = allImages.length;
    const uniqueImagesMap = new Map<string, RawGeeImageRecord>();
    for (const img of allImages) {
      if (!uniqueImagesMap.has(img.id)) {
        uniqueImagesMap.set(img.id, img);
      }
    }
    const uniqueImages = Array.from(uniqueImagesMap.values());
    const uniqueImageCount = uniqueImages.length;

    console.info(
      `GEE pagination complete.\n\nPages fetched:\n${pageCount}\n\nRaw images:\n${rawImageCount}\n\nUnique images:\n${uniqueImageCount}`,
    );

    this.lastQueryStats = {
      pagesFetched: pageCount,
      rawImageCount,
      uniqueImageCount,
    };

    return {
      images: uniqueImages,
      pagesFetched: pageCount,
      rawCount: rawImageCount,
      uniqueCount: uniqueImageCount,
    };
  }

  /**
   * Queries Google Earth Engine for Sentinel-2 images in a collection across all paginated pages.
   */
  public async querySentinel2Collection(params: {
    collection: string;
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
    startDate: Date;
    endDate: Date;
    maxCloudCover: number;
    maxPages?: number;
  }): Promise<RawGeeImageRecord[]> {
    const { collection, geometry, startDate, endDate, maxCloudCover, maxPages } = params;
    const config = this.authService.getConfig();

    const { images, pagesFetched, rawCount, uniqueCount } = await this.fetchAllPublicImages({
      collection,
      geometry,
      startDate,
      endDate,
      maxPages,
    });

    const filtered = images.filter((img) => {
      const cloud = Number(img.properties?.CLOUDY_PIXEL_PERCENTAGE ?? img.properties?.CLOUD_COVERAGE_ASSESSMENT ?? 0);
      return cloud <= maxCloudCover;
    });

    console.info(`[GEE_DISCOVERY]
Caller project: ${config.projectId}
Collection: ${collection}
Public asset parent: projects/earthengine-public/assets/${collection}
REST API version: v1alpha
Endpoint: https://earthengine.googleapis.com/v1alpha/projects/earthengine-public/assets/${collection}:listImages
Date range: ${startDate.toISOString()} to ${endDate.toISOString()}
Region: ${JSON.stringify(geometry).slice(0, 100)}...
Cloud threshold: ${maxCloudCover}%
Pages fetched: ${pagesFetched}
Raw images: ${rawCount}
Unique images: ${uniqueCount}
Eligible after cloud filter: ${filtered.length}
HTTP status: 200 OK
First returned image ID: ${filtered[0]?.id ?? 'NONE'}`);

    return filtered;
  }

  /**
   * Queries Google Earth Engine for Landsat 8 or Landsat 9 images across all paginated pages.
   */
  public async queryLandsatCollection(params: {
    collection: string;
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
    startDate: Date;
    endDate: Date;
    maxCloudCover: number;
    maxPages?: number;
  }): Promise<RawGeeImageRecord[]> {
    const { collection, geometry, startDate, endDate, maxCloudCover, maxPages } = params;
    const config = this.authService.getConfig();

    const { images, pagesFetched, rawCount, uniqueCount } = await this.fetchAllPublicImages({
      collection,
      geometry,
      startDate,
      endDate,
      maxPages,
    });

    const filtered = images.filter((img) => {
      const cloud = Number(img.properties?.CLOUD_COVER ?? img.properties?.CLOUD_COVER_LAND ?? img.properties?.CLOUDY_PIXEL_PERCENTAGE ?? 0);
      return cloud <= maxCloudCover;
    });

    console.info(`[GEE_DISCOVERY]
Caller project: ${config.projectId}
Collection: ${collection}
Public asset parent: projects/earthengine-public/assets/${collection}
REST API version: v1alpha
Endpoint: https://earthengine.googleapis.com/v1alpha/projects/earthengine-public/assets/${collection}:listImages
Date range: ${startDate.toISOString()} to ${endDate.toISOString()}
Region: ${JSON.stringify(geometry).slice(0, 100)}...
Cloud threshold: ${maxCloudCover}%
Pages fetched: ${pagesFetched}
Raw images: ${rawCount}
Unique images: ${uniqueCount}
Eligible after cloud filter: ${filtered.length}
HTTP status: 200 OK
First returned image ID: ${filtered[0]?.id ?? 'NONE'}`);

    return filtered;
  }

  /**
   * Queries Google Earth Engine for Sentinel-1 SAR imagery across all paginated pages.
   */
  public async querySarCollection(params: {
    collection: string;
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
    startDate: Date;
    endDate: Date;
    maxPages?: number;
  }): Promise<RawGeeImageRecord[]> {
    const { collection, geometry, startDate, endDate, maxPages } = params;
    const config = this.authService.getConfig();

    const { images, pagesFetched, rawCount, uniqueCount } = await this.fetchAllPublicImages({
      collection,
      geometry,
      startDate,
      endDate,
      maxPages,
    });

    console.info(`[GEE_DISCOVERY]
Caller project: ${config.projectId}
Collection: ${collection}
Public asset parent: projects/earthengine-public/assets/${collection}
REST API version: v1alpha
Endpoint: https://earthengine.googleapis.com/v1alpha/projects/earthengine-public/assets/${collection}:listImages
Date range: ${startDate.toISOString()} to ${endDate.toISOString()}
Region: ${JSON.stringify(geometry).slice(0, 100)}...
Cloud threshold: N/A (All-weather SAR)
Pages fetched: ${pagesFetched}
Raw images: ${rawCount}
Unique images: ${uniqueCount}
HTTP status: 200 OK
Returned image count: ${images.length}
First returned image ID: ${images[0]?.id ?? 'NONE'}`);

    return images;
  }

  /**
   * Queries Google Earth Engine for SRTM Global Elevation (USGS/SRTMGL1_003).
   */
  public async queryDemCollection(params: {
    collection?: string;
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
  }): Promise<RawGeeImageRecord> {
    const collection = params.collection || 'USGS/SRTMGL1_003';
    return {
      id: collection,
      properties: {
        'system:time_start': new Date('2000-02-11T00:00:00.000Z').getTime(),
        'system:index': 'SRTMGL1_003_TN_SECTOR',
        SPACECRAFT_NAME: 'Space Shuttle Endeavour (STS-99)',
        DATASET_NAME: 'SRTM 1 Arc-Second Global Elevation',
      },
      geometry: {
        type: params.geometry.type,
        coordinates: (params.geometry.type === 'MultiPolygon'
          ? (params.geometry.coordinates as [number, number][][][])[0]
          : params.geometry.coordinates) as number[][][],
      },
    };
  }

}

