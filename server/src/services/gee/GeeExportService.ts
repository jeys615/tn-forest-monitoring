import { getGeeConfig } from '../../config/gee.js';
import { GeeAuthService } from './GeeAuthService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { PipelineErrorStage, type GeoJSONPolygon, type GeoJSONMultiPolygon } from '@tn-forest/shared/types';
import type { SatelliteScene } from './GeeSatelliteSearchService.js';

export interface GeeExportOptions {
  scene: SatelliteScene;
  zoneCode: string;
  jobId: string;
  imageType: 'BASELINE' | 'CURRENT';
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
  scaleMeters?: number;
  crs?: string;
}

export interface GeeExportResult {
  taskId: string;
  taskState: 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  driveFileName: string;
  driveFolder: string;
  exportScaleMeters: number;
  crs: string;
  bandsExported: string[];
  requestedAt: Date;
}

export class GeeExportService {
  private authService: GeeAuthService;

  constructor() {
    this.authService = GeeAuthService.getInstance();
  }

  /**
   * Selects compatible spectral bands for export based on satellite source.
   * Note: Bands exported into a single GeoTIFF must share compatible types (e.g. UInt16).
   */
  public selectExportBands(satellite: SatelliteScene['satellite']): string[] {
    switch (satellite) {
      case 'Sentinel-2':
        return ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'];
      case 'Landsat-8':
      case 'Landsat-9':
        return ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'QA_PIXEL'];
      case 'Sentinel-1':
        return ['VV', 'VH'];
      default:
        return ['B2', 'B3', 'B4', 'B8'];
    }
  }

  /**
   * Submits a real Export.image.toDrive task to Google Earth Engine v1alpha REST API.
   */
  public async requestImageExport(options: GeeExportOptions): Promise<GeeExportResult> {
    const { scene, zoneCode, jobId, imageType, geometry, scaleMeters, crs = 'EPSG:4326' } = options;
    const config = getGeeConfig();
    const token = await this.authService.getAccessToken();

    if (!token || !config.hasCredentials) {
      console.error(`[GEE_EXPORT] Authentication failed: No access token available for project ${config.projectId}`);
      throw new AppError(
        'GEE authentication failed: No access token available for image export.',
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    const dateStr = scene.acquisitionDate.toISOString().slice(0, 10).replace(/-/g, '');
    const driveFileName = `${zoneCode}_${jobId}_${imageType}_${scene.satellite.replace(/[^a-zA-Z0-9]/g, '')}_${dateStr}`;
    // Use scene.bands if explicitly set (e.g. HLS acquisition with HLS-specific band names).
    // Fall back to selectExportBands for native optical/SAR where scene.bands is not set.
    const bands = (scene.bands && scene.bands.length > 0)
      ? scene.bands
      : this.selectExportBands(scene.satellite);
    const exportScale = scaleMeters || scene.nativeResolution || config.exportScale;
    const requestedAt = new Date();

    console.info(`[GEE_EXPORT] Image: ${scene.imageId}`);
    console.info(`[GEE_EXPORT] Zone: ${zoneCode}`);
    console.info(`[GEE_EXPORT] Bands to export: [${bands.join(', ')}]`);
    console.info(`[GEE_EXPORT] Creating real Earth Engine export...`);

    // GeoTIFF requires homogeneous pixel data types. Optical reflectance bands are UInt16,
    // while quality bands (SCL / QA_PIXEL / Fmask) may be Byte/Uint8. Cast quality bands to
    // UInt16 to preserve pixel-level cloud/shadow masking without data type mismatch errors.
    // Fmask is the HLS V2.0 QA band (equivalent to SCL for Sentinel-2, QA_PIXEL for Landsat).
    const qualityBand = bands.find((b) => b === 'SCL' || b === 'QA_PIXEL' || b === 'Fmask');
    const opticalReflectanceBands = bands.filter((b) => b !== 'SCL' && b !== 'QA_PIXEL' && b !== 'Fmask');

    const expressionValues: Record<string, unknown> = {
      raw_image: {
        functionInvocationValue: {
          functionName: 'Image.load',
          arguments: {
            id: { constantValue: scene.imageId },
          },
        },
      },
      geom: {
        functionInvocationValue: {
          functionName: geometry.type === 'MultiPolygon' ? 'GeometryConstructors.MultiPolygon' : 'GeometryConstructors.Polygon',
          arguments: {
            coordinates: { constantValue: geometry.coordinates },
          },
        },
      },
    };

    if (qualityBand && opticalReflectanceBands.length > 0) {
      expressionValues.selected_optical = {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: {
            input: { valueReference: 'raw_image' },
            bandSelectors: { constantValue: opticalReflectanceBands },
          },
        },
      };
      expressionValues.selected_qa = {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: {
            input: { valueReference: 'raw_image' },
            bandSelectors: { constantValue: [qualityBand] },
          },
        },
      };
      // For HLS collections, optical reflectance bands are Double (Float64).
      // For native Sentinel-2 / Landsat, optical reflectance bands are UInt16.
      // Cast the QA band to match the optical reflectance type to ensure GeoTIFF type homogeneity.
      const isHls = scene.collection.includes('HLS') || qualityBand === 'Fmask';
      const qaCastFn = isHls ? 'Image.toDouble' : 'Image.toUint16';

      expressionValues.qa_homogeneous = {
        functionInvocationValue: {
          functionName: qaCastFn,
          arguments: {
            value: { valueReference: 'selected_qa' },
          },
        },
      };
      expressionValues.selected_bands = {
        functionInvocationValue: {
          functionName: 'Image.addBands',
          arguments: {
            dstImg: { valueReference: 'selected_optical' },
            srcImg: { valueReference: 'qa_homogeneous' },
          },
        },
      };
    } else {
      expressionValues.selected_bands = {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: {
            input: { valueReference: 'raw_image' },
            bandSelectors: { constantValue: bands },
          },
        },
      };
    }

    expressionValues.clipped = {
      functionInvocationValue: {
        functionName: 'Image.clip',
        arguments: {
          input: { valueReference: 'selected_bands' },
          geometry: { valueReference: 'geom' },
        },
      },
    };

    const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/image:export`;
    const payload = {
      description: driveFileName,
      expression: {
        values: expressionValues,
        result: 'clipped',
      },
      fileExportOptions: {
        fileFormat: 'GEO_TIFF',
        driveDestination: {
          folder: config.driveFolderId || 'MonitoringExports',
          filenamePrefix: driveFileName,
        },
        geoTiffOptions: {
          cloudOptimized: true,
        },
      },
      maxPixels: String(config.maxPixels || 1e9),
    };

    const maxRetries = 3;
    const retryDelays = [500, 1000, 2000];
    let lastError: any = null;
    let res: Response | null = null;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': config.projectId,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          break;
        }

        const errBody = await res.text().catch(() => '');
        console.warn(`[GEE_EXPORT] Attempt ${attempt} failed with HTTP ${res.status}: ${errBody}`);

        // Retry only on 5xx or 429
        if (res.status >= 500 || res.status === 429) {
          lastError = new Error(`HTTP ${res.status}: ${errBody}`);
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
            continue;
          }
        } else {
          // Client error 4xx - do not retry
          console.error(`[GEE_EXPORT] Earth Engine Export API returned client error HTTP ${res.status}: ${errBody}`);
          const appErr: any = new AppError(
            `GEE image export failed (HTTP ${res.status}): ${errBody}`,
            HTTP_STATUS.BAD_REQUEST,
          );
          appErr.errorStage = PipelineErrorStage.EXPORT_SUBMISSION_FAILED;
          appErr.errorCode = `HTTP_${res.status}`;
          appErr.errorMessage = errBody || `HTTP ${res.status}`;
          appErr.failedAt = new Date();
          appErr.retryCount = attempt;
          throw appErr;
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        lastError = err;
        const causeMsg = err.cause ? ` (cause: ${String(err.cause)})` : '';
        console.warn(`[GEE_EXPORT] Network glitch on attempt ${attempt}: ${err.message}${causeMsg}`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
        }
      }
    }

    if (!res || !res.ok) {
      const causeMsg = lastError?.cause ? ` Cause: ${String(lastError.cause)}` : '';
      const errMsg = lastError?.message || 'Failed after multiple attempts';
      const appErr: any = new AppError(
        `GEE image export failed: ${errMsg}${causeMsg}`,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
      appErr.errorStage = PipelineErrorStage.EXPORT_SUBMISSION_FAILED;
      appErr.errorCode = 'FETCH_FAILED';
      appErr.errorMessage = errMsg;
      appErr.errorCause = lastError?.cause ? String(lastError.cause) : undefined;
      appErr.failedAt = new Date();
      appErr.retryCount = attempt;
      throw appErr;
    }

    const data = (await res.json()) as { name?: string; id?: string };
    const taskId = data.name || data.id;

    if (!taskId) {
      console.error('[GEE_EXPORT] Earth Engine response missing operation/task ID:', data);
      throw new AppError(
        'GEE image export response missing operation/task ID',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    console.info(`[GEE_EXPORT] Operation/task ID: ${taskId}`);
    console.info(`[GEE_EXPORT] Status: RUNNING`);

    return {
      taskId,
      taskState: 'RUNNING',
      driveFileName: `${driveFileName}.tif`,
      driveFolder: config.driveFolderId,
      exportScaleMeters: exportScale,
      crs,
      bandsExported: bands,
      requestedAt,
    };
  }
}
