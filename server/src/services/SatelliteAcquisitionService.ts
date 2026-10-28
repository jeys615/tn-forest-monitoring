import {
  SatelliteMetadataRepository,
  type SatelliteMetadataFilters,
} from '../repositories/SatelliteMetadataRepository.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ZoneRepository } from '../repositories/ZoneRepository.js';
import { AppError } from '../utils/AppError.js';
import { HTTP_STATUS } from '../constants/index.js';
import {
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  PipelineErrorStage,
  type SatelliteMetadataDto,
  type AcquireImageRequest,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
  type QueryFootprintRequest,
  type SatelliteQueryFilters,
} from '@tn-forest/shared/types';
import { Types, type Schema } from 'mongoose';
import fs from 'fs';
import { GeeSatelliteProvider } from './gee/providers/GeeSatelliteProvider.js';
import type { ISatelliteProvider } from './gee/providers/ISatelliteProvider.js';
import { GeeExportService, type GeeExportResult } from './gee/GeeExportService.js';
import { GeeTaskService } from './gee/GeeTaskService.js';
import { GoogleDriveService } from './drive/GoogleDriveService.js';
import { GeoTiffService } from './raster/GeoTiffService.js';

export class SatelliteAcquisitionService {
  private satelliteRepo: SatelliteMetadataRepository;
  private zoneRepo: ZoneRepository;
  private provider: ISatelliteProvider;
  private geeExportService: GeeExportService;
  private geeTaskService: GeeTaskService;
  private driveService: GoogleDriveService;

  constructor(provider?: ISatelliteProvider) {
    this.satelliteRepo = new SatelliteMetadataRepository();
    this.zoneRepo = new ZoneRepository();
    this.provider = provider || new GeeSatelliteProvider();
    this.geeExportService = new GeeExportService();
    this.geeTaskService = new GeeTaskService();
    this.driveService = new GoogleDriveService();
  }

  public setProvider(provider: ISatelliteProvider): void {
    this.provider = provider;
  }

  public getProvider(): ISatelliteProvider {
    return this.provider;
  }

  async getAllImages(filters: SatelliteQueryFilters = {}): Promise<SatelliteMetadataDto[]> {
    const dbFilters: SatelliteMetadataFilters = {
      source: filters.source,
      sensorType: filters.sensorType,
      processingStatus: filters.processingStatus,
      zoneId: filters.zoneId,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      exactDate: filters.exactDate ? new Date(filters.exactDate) : undefined,
      imageId: filters.imageId,
    };

    const images = await this.satelliteRepo.findAll(dbFilters);
    return images.map((img) => img.toDto());
  }

  async getImageById(id: string): Promise<SatelliteMetadataDto> {
    const img = await this.satelliteRepo.findById(id);
    if (!img) {
      throw new AppError('Satellite metadata record not found', HTTP_STATUS.NOT_FOUND);
    }
    return img.toDto();
  }

  async queryFootprint(
    geometryOrRequest: GeoJSONPolygon | QueryFootprintRequest,
  ): Promise<SatelliteMetadataDto[]> {
    let geometry: GeoJSONPolygon;
    let options: {
      startDate?: Date;
      endDate?: Date;
      exactDate?: Date;
      source?: SatelliteSource;
      sensorType?: SensorType;
    } | undefined;

    if (
      'type' in geometryOrRequest &&
      geometryOrRequest.type === 'Polygon' &&
      Array.isArray(geometryOrRequest.coordinates)
    ) {
      geometry = geometryOrRequest as GeoJSONPolygon;
    } else {
      const req = geometryOrRequest as QueryFootprintRequest;
      if (req.footprint) {
        geometry = req.footprint;
      } else if (req.type === 'Polygon' && Array.isArray(req.coordinates)) {
        geometry = { type: 'Polygon', coordinates: req.coordinates };
      } else {
        throw new AppError('Valid footprint geometry is required', HTTP_STATUS.BAD_REQUEST);
      }
      options = {
        startDate: req.startDate ? new Date(req.startDate) : undefined,
        endDate: req.endDate ? new Date(req.endDate) : undefined,
        exactDate: req.startDate && req.startDate === req.endDate ? new Date(req.startDate) : undefined,
        source: req.source,
        sensorType: req.sensorType,
      };
    }

    const images = await this.satelliteRepo.findIntersecting(geometry, options);
    return images.map((img) => img.toDto());
  }

  /**
   * Acquires satellite data for a zone using the configured satellite provider (Real GEE by default).
   * Persists the real Earth Engine metadata in MongoDB with duplicate prevention.
   */
  async acquireImage(data: AcquireImageRequest): Promise<SatelliteMetadataDto> {
    const zone = await this.zoneRepo.findById(data.zoneId);
    if (!zone) {
      throw new AppError('Zone not found', HTTP_STATUS.NOT_FOUND);
    }

    const maxCloud = data.maxCloudCover !== undefined ? data.maxCloudCover : 20.0;
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      throw new AppError('Invalid date range parameters', HTTP_STATUS.BAD_REQUEST);
    }

    const sensorType = data.sensorType || (data.source === SatelliteSource.SENTINEL_1 ? SensorType.SAR : SensorType.OPTICAL);

    // Acquire best observation from the Provider
    const acquiredMeta = await this.provider.acquireBestImage(zone.boundary, {
      startDate: start,
      endDate: end,
      maxCloudCover: maxCloud,
      source: data.source,
      sensorType,
      imageId: data.imageId,
    });

    // Query ALL zones in the database that intersect this acquired satellite image footprint
    const allZones = await this.zoneRepo.findAll();
    const intersectingZoneIds: Types.ObjectId[] = [];

    const [imgMinLng, imgMaxLng, imgMinLat, imgMaxLat] = this.getPolygonBoundingBox(
      acquiredMeta.footprint,
    );

    for (const z of allZones) {
      const [zMinLng, zMaxLng, zMinLat, zMaxLat] = this.getPolygonBoundingBox(z.boundary);
      const overlaps = !(
        zMaxLng < imgMinLng ||
        zMinLng > imgMaxLng ||
        zMaxLat < imgMinLat ||
        zMinLat > imgMaxLat
      );
      if (overlaps) {
        intersectingZoneIds.push(z._id as Types.ObjectId);
      }
    }

    if (!intersectingZoneIds.some((id) => id.toString() === zone._id.toString())) {
      intersectingZoneIds.push(zone._id as Types.ObjectId);
    }

    // Duplicate prevention: If observation with same imageId already exists, update and return / export
    let targetDocId: string;
    const existing = await this.satelliteRepo.findByImageId(acquiredMeta.imageId);
    if (existing) {
      const mergedZones = Array.from(
        new Set([
          ...existing.intersectingZones.map((id) => {
            const obj = id as unknown as { _id?: Schema.Types.ObjectId };
            return obj._id ? obj._id.toString() : id.toString();
          }),
          ...intersectingZoneIds.map((id) => id.toString()),
        ]),
      ).map((id) => new Types.ObjectId(id) as unknown as Schema.Types.ObjectId);

      await this.satelliteRepo.update(existing._id.toString(), {
        intersectingZones: mergedZones,
      });
      targetDocId = existing._id.toString();
    } else {
      const newRecord = await this.satelliteRepo.create({
        imageId: acquiredMeta.imageId,
        source: acquiredMeta.source,
        sensorType: acquiredMeta.sensorType,
        acquisitionDate: acquiredMeta.acquisitionDate,
        cloudCover: acquiredMeta.cloudCover,
        footprint: acquiredMeta.footprint,
        processingStatus: SatelliteProcessingStatus.ACQUIRED,
        geeReference: acquiredMeta.geeReference,
        intersectingZones: intersectingZoneIds as unknown as Schema.Types.ObjectId[],
        metadata: acquiredMeta.metadata,
      });
      targetDocId = newRecord._id.toString();
    }

    // Trigger asynchronous GEE export pipeline (sync: false by default).
    // Submits the GEE export task immediately, transitions to EXPORT_RUNNING,
    // and continues GEE polling, Drive download, and raster validation in the background.
    return this.exportSatelliteRaster(targetDocId, {
      zoneId: zone._id.toString(),
      sync: data.sync === true,
    });
  }

  private getPolygonBoundingBox(geometry: GeoJSONPolygon | GeoJSONMultiPolygon): [number, number, number, number] {
    const rings: [number, number][][] =
      geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as [number, number][][][]).map((poly) => poly[0])
        : [(geometry.coordinates as [number, number][][])?.[0] || []];

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }

    return [minLng, maxLng, minLat, maxLat];
  }

  /**
   * Triggers real GEE GeoTIFF raster export, Drive download, and raster validation
   * for an acquired satellite metadata record, maintaining strict semantic stage separation:
   * CATALOG_ACQUIRED -> EXPORT_REQUESTED -> EXPORT_RUNNING -> EXPORT_COMPLETED ->
   * DRIVE_FILE_FOUND -> DOWNLOADED -> RASTER_VALIDATED -> PROCESSED (or FAILED).
   */
  async exportSatelliteRaster(
    metadataId: string,
    options?: { zoneId?: string; sync?: boolean; force?: boolean },
  ): Promise<SatelliteMetadataDto> {
    const metadataDoc = await this.satelliteRepo.findById(metadataId);
    if (!metadataDoc) {
      throw new AppError('Satellite metadata record not found', HTTP_STATUS.NOT_FOUND);
    }

    // Guard: Authentic GEE scene validation
    if (
      !metadataDoc.imageId ||
      metadataDoc.imageId.includes('T44PMT') ||
      metadataDoc.acquisitionDate < new Date('2013-02-11')
    ) {
      throw new AppError(
        'Invalid or synthetic satellite image record. Real GEE asset required.',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Resolve target zone
    let targetZoneId = options?.zoneId;
    if (!targetZoneId && metadataDoc.intersectingZones && metadataDoc.intersectingZones.length > 0) {
      const firstZone = metadataDoc.intersectingZones[0];
      targetZoneId =
        typeof firstZone === 'object' && (firstZone as any)._id
          ? (firstZone as any)._id.toString()
          : firstZone.toString();
    }

    if (!targetZoneId) {
      throw new AppError(
        'A target zone is required to determine the export boundary',
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const zone = await this.zoneRepo.findById(targetZoneId);
    if (!zone) {
      throw new AppError(`Target zone ${targetZoneId} not found`, HTTP_STATUS.NOT_FOUND);
    }

    // Idempotency: Return existing completed raster if valid
    if (
      !options?.force &&
      metadataDoc.processingStatus === SatelliteProcessingStatus.PROCESSED &&
      metadataDoc.localRasterPath &&
      fs.existsSync(metadataDoc.localRasterPath)
    ) {
      console.info(
        `[SATELLITE_EXPORT] Image ${metadataDoc.imageId} is already PROCESSED with validated local raster at ${metadataDoc.localRasterPath}. Returning existing record.`,
      );
      return metadataDoc.toDto();
    }

    // Safety: If already running in background, avoid duplicate export tasks
    if (
      !options?.force &&
      (metadataDoc.processingStatus === SatelliteProcessingStatus.EXPORT_RUNNING ||
        metadataDoc.processingStatus === SatelliteProcessingStatus.EXPORT_REQUESTED) &&
      metadataDoc.geeExportTaskId
    ) {
      console.info(
        `[SATELLITE_EXPORT] Image ${metadataDoc.imageId} already has active export task ${metadataDoc.geeExportTaskId}. Returning existing running record.`,
      );
      return metadataDoc.toDto();
    }

    // STAGE 1: EXPORT_REQUESTED
    console.info(`[SATELLITE_PIPELINE] Transitioning image ${metadataDoc.imageId} to EXPORT_REQUESTED...`);
    await this.satelliteRepo.update(metadataId, {
      processingStatus: SatelliteProcessingStatus.EXPORT_REQUESTED,
      failureReason: undefined,
    });

    const sceneSatellite =
      metadataDoc.source === SatelliteSource.SENTINEL_2
        ? 'Sentinel-2'
        : metadataDoc.source === SatelliteSource.SENTINEL_1
          ? 'Sentinel-1'
          : metadataDoc.source === SatelliteSource.LANDSAT_9
            ? 'Landsat-9'
            : 'Landsat-8';

    // Check if export is already running for this metadata
    if (metadataDoc.processingStatus === SatelliteProcessingStatus.EXPORT_RUNNING && metadataDoc.geeExportTaskId) {
      console.info(`[SATELLITE_EXPORT] Metadata ${metadataId} already has export running (task ${metadataDoc.geeExportTaskId}). Avoiding duplicate export.`);
      const existingExportResult: GeeExportResult = {
        taskId: metadataDoc.geeExportTaskId,
        taskState: 'RUNNING',
        driveFileName: metadataDoc.driveFileName || `${zone.zoneId}_${metadataDoc._id}_CURRENT.tif`,
        driveFolder: 'MonitoringExports',
        exportScaleMeters: 10,
        crs: 'EPSG:4326',
        bandsExported: [],
        requestedAt: new Date(),
      };
      if (options?.sync === false) {
        this.executeAsyncSatellitePipeline(metadataId, existingExportResult).catch((err) => {
          console.error(`[SATELLITE_PIPELINE] Background export failed for ${metadataId}:`, err);
        });
        const currentDoc = await this.satelliteRepo.findById(metadataId);
        return currentDoc!.toDto();
      }
      return this.executeAsyncSatellitePipeline(metadataId, existingExportResult);
    }

    // STAGE 2: EXPORT_RUNNING (Submit real GEE REST export)
    let exportResult: GeeExportResult;
    try {
      exportResult = await this.geeExportService.requestImageExport({
        scene: {
          imageId: metadataDoc.imageId,
          satellite: sceneSatellite,
          sensorType: metadataDoc.sensorType,
          acquisitionDate: metadataDoc.acquisitionDate,
          cloudCover: metadataDoc.cloudCover ?? 0,
          footprint: metadataDoc.footprint || zone.boundary,
          bands: Array.isArray(metadataDoc.metadata?.bands)
            ? (metadataDoc.metadata.bands as string[])
            : metadataDoc.sensorType === SensorType.SAR
              ? ['VV', 'VH']
              : ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
          nativeResolution: 10,
          processingLevel: 'Level-2A',
          provider: 'GEE',
          collection:
            metadataDoc.geeReference ||
            (metadataDoc.sensorType === SensorType.SAR
              ? 'COPERNICUS/S1_GRD'
              : 'COPERNICUS/S2_SR_HARMONIZED'),
        },
        zoneCode: zone.zoneId,
        jobId: metadataDoc._id.toString(),
        imageType: 'CURRENT',
        geometry: zone.boundary,
      });

      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.EXPORT_RUNNING,
        geeExportTaskId: exportResult.taskId,
        driveFileName: exportResult.driveFileName,
        errorStage: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        errorCause: undefined,
        failedAt: undefined,
      });
    } catch (err: any) {
      console.error(`[SATELLITE_EXPORT] Real GEE export submission failed: ${err.message}`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `EXPORT_FAILED: ${err.message}`,
        errorStage: err.errorStage || PipelineErrorStage.EXPORT_SUBMISSION_FAILED,
        errorCode: err.errorCode || 'EXPORT_ERROR',
        errorMessage: err.errorMessage || err.message,
        errorCause: err.errorCause || (err.cause ? String(err.cause) : undefined),
        failedAt: err.failedAt || new Date(),
        retryCount: err.retryCount || 1,
      });
      throw new AppError(`GEE image export failed: ${err.message}`, HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    if (options?.sync === false) {
      // Async background execution
      this.executeAsyncSatellitePipeline(metadataId, exportResult).catch((err) => {
        console.error(`[SATELLITE_PIPELINE] Background export failed for ${metadataId}:`, err);
      });
      const current = await this.satelliteRepo.findById(metadataId);
      return current!.toDto();
    }

    // Synchronous execution
    return this.executeAsyncSatellitePipeline(metadataId, exportResult);
  }

  /**
   * Executes stages 3 through 7:
   * 3. EXPORT_COMPLETED (Poll GEE operation)
   * 4. DRIVE_FILE_FOUND (Find exported file in Google Drive & verify size > 0)
   * 5. DOWNLOADED (Download GeoTIFF to local storage)
   * 6. RASTER_VALIDATED (Validate raster tags, width, height, band count, CRS)
   * 7. PROCESSED (Calculate spectral indices & finalize)
   */
  public async executeAsyncSatellitePipeline(
    metadataId: string,
    exportResult: GeeExportResult,
  ): Promise<SatelliteMetadataDto> {
    console.info(
      `[SATELLITE_PIPELINE] Polling GEE task ${exportResult.taskId} for metadata ${metadataId}...`,
    );

    // STAGE 3: Poll GEE task
    const taskStatus = await this.geeTaskService.pollTaskCompletion(exportResult.taskId, {
      timeoutMs: 300000,
      pollIntervalMs: 5000,
    });

    if (taskStatus.state !== 'EXPORT_COMPLETED') {
      const errMsg = taskStatus.errorMessage || 'Export task failed in Earth Engine';
      console.error(`[SATELLITE_EXPORT] Task failed: ${errMsg}`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `EXPORT_FAILED: ${errMsg}`,
        errorStage: PipelineErrorStage.GEE_OPERATION_FAILED,
        errorCode: 'GEE_OPERATION_FAILED',
        errorMessage: errMsg,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(`GEE export task failed: ${errMsg}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    console.info(`[SATELLITE_PIPELINE] GEE export completed. Updating status to EXPORT_COMPLETED.`);
    await this.satelliteRepo.update(metadataId, {
      processingStatus: SatelliteProcessingStatus.EXPORT_COMPLETED,
    });

    // STAGE 4: Google Drive File Lookup
    let driveFile;
    try {
      driveFile = await this.driveService.findExportedFile(exportResult.driveFileName);
    } catch (err: any) {
      console.error(`[SATELLITE_DRIVE] Lookup error: ${err.message}`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `DRIVE_LOOKUP_ERROR: ${err.message}`,
        errorStage: PipelineErrorStage.DRIVE_LOOKUP_FAILED,
        errorCode: 'DRIVE_LOOKUP_FAILED',
        errorMessage: err.message,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(
        `Google Drive lookup failed: ${err.message}`,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    if (!driveFile || !driveFile.id) {
      console.error(`[SATELLITE_DRIVE] DRIVE_FILE_NOT_FOUND: ${exportResult.driveFileName}`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `DRIVE_FILE_NOT_FOUND: File ${exportResult.driveFileName} not found in Google Drive folder`,
        errorStage: PipelineErrorStage.DRIVE_LOOKUP_FAILED,
        errorCode: 'DRIVE_FILE_NOT_FOUND',
        errorMessage: `File ${exportResult.driveFileName} not found in Google Drive folder`,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(
        `DRIVE_FILE_NOT_FOUND: File ${exportResult.driveFileName} not found in Google Drive`,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const driveFileSizeBytes = Number(driveFile.size) || 0;
    if (driveFileSizeBytes <= 0) {
      console.error(`[SATELLITE_DRIVE] DRIVE_FILE_EMPTY: ${exportResult.driveFileName} has 0 bytes`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `DRIVE_FILE_EMPTY: Exported GeoTIFF has 0 bytes in Google Drive`,
        errorStage: PipelineErrorStage.DRIVE_LOOKUP_FAILED,
        errorCode: 'DRIVE_FILE_EMPTY',
        errorMessage: `Exported GeoTIFF file is empty (0 bytes) in Google Drive`,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(
        `Exported GeoTIFF file is empty (0 bytes) in Google Drive`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    await this.satelliteRepo.update(metadataId, {
      processingStatus: SatelliteProcessingStatus.DRIVE_FILE_FOUND,
      driveFileId: driveFile.id,
      driveFileName: driveFile.name || exportResult.driveFileName,
      driveFileSizeBytes,
      errorStage: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      errorCause: undefined,
      failedAt: undefined,
    });

    // STAGE 5: Download Real GeoTIFF
    let downloaded;
    try {
      downloaded = await this.driveService.downloadGeoTiff({
        jobId: metadataId,
        fileName: exportResult.driveFileName,
        fileId: driveFile.id,
      });
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.DOWNLOADED,
        localRasterPath: downloaded.localFilePath,
        driveFileSizeBytes: downloaded.sizeBytes,
      });
    } catch (err: any) {
      console.error(`[SATELLITE_RASTER] Download failed: ${err.message}`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `RASTER_DOWNLOAD_FAILED: ${err.message}`,
        errorStage: PipelineErrorStage.DRIVE_DOWNLOAD_FAILED,
        errorCode: 'DRIVE_DOWNLOAD_FAILED',
        errorMessage: err.message,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(`GeoTIFF download failed: ${err.message}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    // STAGE 6: Validate GeoTIFF Raster
    let parsed;
    try {
      parsed = await GeoTiffService.readGeoTiff(downloaded.localFilePath);
    } catch (err: any) {
      console.error(`[SATELLITE_RASTER] Parsing failed: ${err.message}`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `RASTER_INVALID: ${err.message}`,
        errorStage: PipelineErrorStage.RASTER_VALIDATION_FAILED,
        errorCode: 'RASTER_VALIDATION_FAILED',
        errorMessage: err.message,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(`GeoTIFF parsing failed: ${err.message}`, HTTP_STATUS.BAD_REQUEST);
    }

    const meta = parsed.metadata;
    console.info(
      `[SATELLITE_RASTER] Dimensions: ${meta.width}x${meta.height}, Bands: ${meta.numBands}, CRS: ${meta.crs}, Res: ${meta.pixelScale?.[0] || 10}m`,
    );

    if (meta.width <= 0 || meta.height <= 0 || meta.numBands < 1) {
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `RASTER_INVALID: Dimensions or band count invalid (${meta.width}x${meta.height}, ${meta.numBands} bands)`,
        errorStage: PipelineErrorStage.RASTER_VALIDATION_FAILED,
        errorCode: 'INVALID_RASTER_DIMENSIONS',
        errorMessage: `Dimensions or band count invalid (${meta.width}x${meta.height}, ${meta.numBands} bands)`,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(
        `Invalid raster dimensions (${meta.width}x${meta.height}) or bands (${meta.numBands})`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    await this.satelliteRepo.update(metadataId, {
      processingStatus: SatelliteProcessingStatus.RASTER_VALIDATED,
      rasterValidated: true,
      rasterWidth: meta.width,
      rasterHeight: meta.height,
      rasterBandCount: meta.numBands,
      rasterCrs: meta.normalizedCrs || meta.crs || 'EPSG:32643',
      originalCrs: meta.originalCrs || meta.crs,
      areaCalculationCrs: meta.areaCalculationCrs || meta.normalizedCrs || 'EPSG:32643',
      pixelAreaM2: meta.pixelAreaM2,
      resolutionMeters: meta.pixelScale?.[0] || 10,
    });

    // STAGE 7: Calculate Spectral Indices & Finalize PROCESSED (OPTICAL only; SAR skips optical indices)
    const currentMeta = await this.satelliteRepo.findById(metadataId);
    if (currentMeta?.sensorType === SensorType.SAR) {
      const updated = await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.PROCESSED,
        spectralIndicesCalculated: false, // Invariant: SAR never runs optical indices (NDVI/NDWI/NDBI/SAVI/EVI)
        pipelineCompletedAt: new Date(),
        errorStage: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        errorCause: undefined,
        failedAt: undefined,
      });
      console.info(`[SATELLITE_PIPELINE] SAR pipeline stages completed successfully. Status: PROCESSED.`);
      return updated!.toDto();
    }

    try {
      GeoTiffService.calculateSpectralIndices(parsed, { satellite: currentMeta?.source });
      const updated = await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.PROCESSED,
        spectralIndicesCalculated: true,
        pipelineCompletedAt: new Date(),
        errorStage: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        errorCause: undefined,
        failedAt: undefined,
      });
      console.info(`[SATELLITE_PIPELINE] All stages completed successfully. Status: PROCESSED.`);
      return updated!.toDto();
    } catch (err: any) {
      console.error(`[SATELLITE_PROCESSING] Spectral indices calculation failed: ${err.message}`);
      await this.satelliteRepo.update(metadataId, {
        processingStatus: SatelliteProcessingStatus.FAILED,
        failureReason: `PROCESSING_FAILED: ${err.message}`,
        errorStage: PipelineErrorStage.UNKNOWN,
        errorCode: 'SPECTRAL_CALCULATION_FAILED',
        errorMessage: err.message,
        operationId: exportResult.taskId,
        failedAt: new Date(),
      });
      throw new AppError(
        `Spectral indices calculation failed: ${err.message}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Reconciles in-flight or stalled GEE export tasks across SatelliteMetadata.
   * Discovers records in EXPORT_REQUESTED or EXPORT_RUNNING state (e.g. from previous server crash/restart).
   * Queries Google Earth Engine Task API for their ground-truth state:
   * - EXPORT_COMPLETED: advances status to EXPORT_COMPLETED and attempts Drive file lookup
   * - EXPORT_FAILED: marks record FAILED with authoritative error
   * - EXPORT_RUNNING: checks if exceeded stale threshold (default 24h), marks TIMEOUT if stale
   * - Missing Task ID: marks record FAILED
   */
  public async reconcilePendingSatelliteExports(options?: {
    staleThresholdHours?: number;
    dryRun?: boolean;
  }): Promise<{
    checked: number;
    reconciledCompleted: number;
    reconciledFailed: number;
    inFlightRemaining: number;
    details: Array<{
      imageId: string;
      taskId?: string;
      previousStatus: SatelliteProcessingStatus;
      newStatus: SatelliteProcessingStatus;
      reason?: string;
    }>;
  }> {
    const staleHours = options?.staleThresholdHours ?? 24;
    const dryRun = options?.dryRun ?? false;
    const staleCutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);

    const pendingRecords = await SatelliteMetadata.find({
      processingStatus: {
        $in: [
          SatelliteProcessingStatus.EXPORT_REQUESTED,
          SatelliteProcessingStatus.EXPORT_RUNNING,
        ],
      },
    }).exec();

    const results = {
      checked: pendingRecords.length,
      reconciledCompleted: 0,
      reconciledFailed: 0,
      inFlightRemaining: 0,
      details: [] as Array<{
        imageId: string;
        taskId?: string;
        previousStatus: SatelliteProcessingStatus;
        newStatus: SatelliteProcessingStatus;
        reason?: string;
      }>,
    };

    for (const record of pendingRecords) {
      const taskId = record.geeExportTaskId;
      const prevStatus = record.processingStatus;

      // 1. Missing task ID: invalid export state
      if (!taskId) {
        if (!dryRun) {
          record.processingStatus = SatelliteProcessingStatus.FAILED;
          record.failureReason = 'STALE_EXPORT_MISSING_TASK_ID: No GEE operation ID was recorded';
          record.errorStage = PipelineErrorStage.EXPORT_SUBMISSION_FAILED;
          record.failedAt = new Date();
          await record.save();
        }
        results.reconciledFailed++;
        results.details.push({
          imageId: record.imageId,
          taskId: undefined,
          previousStatus: prevStatus,
          newStatus: SatelliteProcessingStatus.FAILED,
          reason: 'Missing GEE task ID',
        });
        continue;
      }

      // 2. Query GEE Task API for ground-truth state
      try {
        const status = await this.geeTaskService.getTaskStatus(taskId);

        if (status.state === 'EXPORT_COMPLETED') {
          if (!dryRun) {
            record.processingStatus = SatelliteProcessingStatus.EXPORT_COMPLETED;
            if (record.driveFileName) {
              try {
                const driveFile = await this.driveService.findExportedFile(record.driveFileName);
                if (driveFile) {
                  record.driveFileId = driveFile.id || undefined;
                  record.driveFileSizeBytes = driveFile.size ? Number(driveFile.size) : undefined;
                  record.processingStatus = SatelliteProcessingStatus.DRIVE_FILE_FOUND;
                }
              } catch (driveErr) {
                console.warn(`[RECONCILE_EXPORT] Drive lookup for ${record.driveFileName} deferred: ${driveErr instanceof Error ? driveErr.message : String(driveErr)}`);
              }
            }
            await record.save();
          }
          results.reconciledCompleted++;
          results.details.push({
            imageId: record.imageId,
            taskId,
            previousStatus: prevStatus,
            newStatus: record.processingStatus,
            reason: 'Task completed on Earth Engine',
          });
        } else if (status.state === 'EXPORT_FAILED') {
          if (!dryRun) {
            record.processingStatus = SatelliteProcessingStatus.FAILED;
            record.failureReason = status.errorMessage || 'Export failed on Earth Engine';
            record.errorStage = PipelineErrorStage.GEE_OPERATION_FAILED;
            record.failedAt = new Date();
            await record.save();
          }
          results.reconciledFailed++;
          results.details.push({
            imageId: record.imageId,
            taskId,
            previousStatus: prevStatus,
            newStatus: SatelliteProcessingStatus.FAILED,
            reason: status.errorMessage,
          });
        } else {
          // EXPORT_RUNNING or EXPORT_READY
          const recordDate = record.createdAt || record.updatedAt || new Date();
          if (recordDate < staleCutoff) {
            // Task has been running longer than staleThresholdHours
            if (!dryRun) {
              record.processingStatus = SatelliteProcessingStatus.FAILED;
              record.failureReason = `EXPORT_TIMEOUT: Task in ${status.state} exceeded stale threshold of ${staleHours}h`;
              record.errorStage = PipelineErrorStage.GEE_OPERATION_FAILED;
              record.failedAt = new Date();
              await record.save();
            }
            results.reconciledFailed++;
            results.details.push({
              imageId: record.imageId,
              taskId,
              previousStatus: prevStatus,
              newStatus: SatelliteProcessingStatus.FAILED,
              reason: `Exceeded stale threshold of ${staleHours}h`,
            });
          } else {
            results.inFlightRemaining++;
            results.details.push({
              imageId: record.imageId,
              taskId,
              previousStatus: prevStatus,
              newStatus: prevStatus,
              reason: `In-flight on GEE (${status.state})`,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[RECONCILE_EXPORT] Could not check status for task ${taskId}: ${msg}`);
        results.inFlightRemaining++;
        results.details.push({
          imageId: record.imageId,
          taskId,
          previousStatus: prevStatus,
          newStatus: prevStatus,
          reason: `Transient error checking GEE status: ${msg}`,
        });
      }
    }

    return results;
  }
}
