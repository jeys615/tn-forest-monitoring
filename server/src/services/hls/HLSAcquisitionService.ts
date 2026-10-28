/**
 * HLSAcquisitionService — Phase 5
 *
 * Production adapter for obtaining REAL NASA HLS V2.0 data via the existing
 * Google Earth Engine (GEE) infrastructure.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ARCHITECTURE CONTRACT                                               ║
 * ║                                                                      ║
 * ║  This service is ACQUISITION ONLY.                                   ║
 * ║  It does NOT:                                                        ║
 * ║    • Create HLSRepresentation MongoDB records                        ║
 * ║    • Populate Baseline.hlsRepresentationId                           ║
 * ║    • Modify the MonitoringSchedulerService                           ║
 * ║    • Touch ChangeDetectionService or AlertService                    ║
 * ║    • Advance any monitoring cursors                                  ║
 * ║    • Generate fake or synthetic HLS data                             ║
 * ║                                                                      ║
 * ║  It DOES:                                                            ║
 * ║    • Map source satellite → correct HLS GEE collection               ║
 * ║    • Query the REAL NASA HLS V2.0 GEE collection                    ║
 * ║    • Filter by observation date + zone geometry                      ║
 * ║    • Validate source/date lineage strictly                           ║
 * ║    • Export via existing GeeExportService pipeline                   ║
 * ║    • Download via existing GoogleDriveService pipeline               ║
 * ║    • Validate raster via GeoTiffService                              ║
 * ║    • Return a structured HLSAcquisitionResult (no persistence)       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * REAL NASA HLS V2.0 GEE Collection IDs (verified, DO NOT CHANGE):
 *   Sentinel-2 derived → NASA/HLS/HLSS30/v002
 *   Landsat derived    → NASA/HLS/HLSL30/v002
 *
 * Resolution: 30 m UTM grid for both products.
 *
 * Reference:
 *   https://lpdaac.usgs.gov/data/get-started-data/collection-overview/missions/harmonized-landsat-sentinel-2-hls-overview/
 *   https://developers.google.com/earth-engine/datasets/catalog/NASA_HLS_HLSS30_v002
 *   https://developers.google.com/earth-engine/datasets/catalog/NASA_HLS_HLSL30_v002
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SatelliteSource,
  HLSProduct,
  HLSVersion,
  HLSErrorStage,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';
import { GeeClientService, type RawGeeImageRecord } from '../gee/GeeClientService.js';
import { GeeExportService } from '../gee/GeeExportService.js';
import { GeeTaskService } from '../gee/GeeTaskService.js';
import { GeeAuthService } from '../gee/GeeAuthService.js';
import { GoogleDriveService } from '../drive/GoogleDriveService.js';
import { GeoTiffService, type GeoTiffMetadata } from '../raster/GeoTiffService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── NASA HLS V2.0 Collection Constants ──────────────────────────────────────

/**
 * Real NASA HLS V2.0 GEE collection IDs.
 * Verified from:
 *   https://developers.google.com/earth-engine/datasets/catalog/NASA_HLS_HLSS30_v002
 *   https://developers.google.com/earth-engine/datasets/catalog/NASA_HLS_HLSL30_v002
 */
export const HLS_GEE_COLLECTIONS: Readonly<Record<HLSProduct, string>> = {
  [HLSProduct.S30]: 'NASA/HLS/HLSS30/v002',
  [HLSProduct.L30]: 'NASA/HLS/HLSL30/v002',
} as const;

/**
 * HLS V2.0 native ground resolution in metres.
 * Both S30 and L30 are delivered on a 30 m UTM grid.
 */
export const HLS_NATIVE_RESOLUTION_M = 30;

/**
 * HLS V2.0 spectral bands exported per product.
 *
 * S30 (Sentinel-2 derived) surface reflectance bands + Fmask quality layer:
 *   B2, B3, B4, B8A, B11, B12, Fmask
 *
 * L30 (Landsat derived) surface reflectance bands + Fmask quality layer:
 *   B2, B3, B4, B5, B6, B7, Fmask
 *
 * Fmask is always included for QA-band validation.
 */
export const HLS_EXPORT_BANDS: Readonly<Record<HLSProduct, readonly string[]>> = {
  [HLSProduct.S30]: ['B2', 'B3', 'B4', 'B8A', 'B11', 'B12', 'Fmask'],
  [HLSProduct.L30]: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'Fmask'],
} as const;

/**
 * Minimum expected band count for a valid HLS raster (bands + Fmask).
 */
export const HLS_MIN_BAND_COUNT = 7;

/**
 * Maximum allowed date difference (in days) between the HLS image acquisition
 * date and the source baseline observation date for the strict lineage match.
 *
 * HLS processes Sentinel-2 and Landsat imagery on the SAME day — so a match
 * within 0 days (same UTC date) is required for strict lineage.
 * A tolerance of 1 day is allowed for UTC/local timezone boundary effects.
 */
export const HLS_MAX_DATE_TOLERANCE_DAYS = 1;

// ─── Public Interfaces ────────────────────────────────────────────────────────

/**
 * Input parameters for HLS acquisition.
 * Provides the source observation metadata for strict lineage matching.
 */
export interface HLSAcquisitionInput {
  /**
   * Zone code (e.g. 'ZONE-260829-8997').
   * Used for GEE export filename generation.
   */
  zoneCode: string;

  /**
   * Unique job ID for this acquisition attempt.
   * Used to create the isolated temp directory and GEE export filename.
   */
  jobId: string;

  /**
   * Source satellite that produced the baseline observation.
   * Must be SENTINEL_2, LANDSAT_8, or LANDSAT_9.
   * SENTINEL_1 (SAR) is NEVER valid — will throw immediately.
   */
  sourceSatellite: SatelliteSource;

  /**
   * Acquisition date of the original baseline/source observation.
   * Used as the anchor date for HLS lineage matching.
   */
  sourceObservationDate: Date;

  /**
   * Zone geometry polygon (WGS84 GeoJSON).
   * Used to spatially filter HLS images and clip the export.
   */
  geometry: GeoJSONPolygon;

  /**
   * HLS version to acquire. Always HLSVersion.V2_0 in production.
   */
  hlsVersion?: HLSVersion;

  /**
   * Optional date search window in days around the source observation date.
   * Defaults to 16 days (one Landsat revisit cycle).
   * The matching still applies strict date tolerance (HLS_MAX_DATE_TOLERANCE_DAYS).
   */
  searchWindowDays?: number;
}

/**
 * Result returned by a successful HLS acquisition.
 * Contains everything needed for the caller to create an HLSRepresentation record.
 * This service does NOT persist anything.
 */
export interface HLSAcquisitionResult {
  /** Whether acquisition succeeded. */
  success: true;

  /** The HLS product that was acquired (S30 or L30). */
  hlsProduct: HLSProduct;

  /** The HLS collection version used. */
  hlsVersion: HLSVersion;

  /** The GEE collection path used (e.g. 'NASA/HLS/HLSS30/v002'). */
  geeCollection: string;

  /** The full GEE asset/image ID within the HLS collection. */
  geeHlsImageId: string;

  /** Acquisition date of the HLS image as confirmed from GEE metadata. */
  hlsAcquisitionDate: Date;

  /** Cloud cover percentage of the HLS image (from Fmask or CLOUD_COVERAGE_ASSESSMENT). */
  cloudCoverPercent: number;

  /** Google Drive file ID of the downloaded HLS GeoTIFF. */
  driveFileId: string;

  /** Google Drive filename of the downloaded HLS GeoTIFF. */
  driveFileName: string;

  /** Local filesystem path to the validated HLS GeoTIFF. */
  localFilePath: string;

  /** File size in bytes of the downloaded HLS GeoTIFF. */
  fileSizeBytes: number;

  /** Number of spectral bands in the validated HLS raster. */
  bandCount: number;

  /** Width of the HLS raster in pixels. */
  rasterWidth: number;

  /** Height of the HLS raster in pixels. */
  rasterHeight: number;

  /** CRS of the HLS raster (EPSG code string, e.g. 'EPSG:32644'). */
  rasterCrs: string;

  /** Ground resolution in metres (always 30 for HLS V2.0). */
  resolutionMeters: number;

  /** Whether Fmask QA band is present and was validated. */
  fmaskValidated: boolean;

  /** Source satellite platform string (e.g. 'Sentinel-2', 'Landsat-8'). */
  sourcePlatform: string;

  /** ISO timestamp when acquisition processing completed. */
  completedAt: Date;

  /** GEE export task/operation ID. */
  geeExportTaskId?: string;

  /** Native original CRS from raster metadata. */
  originalCrs?: string;

  /** Derived area of one pixel in square metres. */
  pixelAreaM2?: number;

  /** Count of valid (non-masked, non-nodata) pixels in Fmask QA layer. */
  validPixelCount?: number;
}

/**
 * Result returned when HLS acquisition fails at any stage.
 */
export interface HLSAcquisitionFailure {
  /** Always false for failures. */
  success: false;

  /** Structured error stage code. */
  errorStage: HLSErrorStage;

  /** Human-readable error message. */
  errorMessage: string;

  /** Optional additional technical detail. */
  errorDetail?: string;

  /** HLS product that was attempted, if known. */
  hlsProduct?: HLSProduct;

  /** GEE collection path that was attempted, if known. */
  geeCollection?: string;

  /** ISO timestamp when the failure was recorded. */
  failedAt: Date;
}

export type HLSAcquisitionOutcome = HLSAcquisitionResult | HLSAcquisitionFailure;

// ─── Sensor → HLS Product Mapping ────────────────────────────────────────────

/**
 * Maps a source SatelliteSource to the corresponding HLSProduct.
 *
 * Mapping rules (approved, do not change without architecture review):
 *   SENTINEL_2  → S30  (Sentinel-2 derived HLS)
 *   LANDSAT_8   → L30  (Landsat derived HLS)
 *   LANDSAT_9   → L30  (Landsat derived HLS)
 *   SENTINEL_1  → throws (SAR must never enter HLS pipeline)
 *   SRTM        → throws (DEM is never an HLS source)
 *
 * @throws AppError if the sensor is not a valid HLS source.
 */
export function resolveHLSProduct(satellite: SatelliteSource): HLSProduct {
  switch (satellite) {
    case SatelliteSource.SENTINEL_2:
      return HLSProduct.S30;
    case SatelliteSource.LANDSAT_8:
    case SatelliteSource.LANDSAT_9:
      return HLSProduct.L30;
    case SatelliteSource.SENTINEL_1:
      throw new AppError(
        `[HLS] SAR (SENTINEL_1) must never enter the HLS acquisition pipeline. ` +
          `Use the SAR monitoring track instead.`,
        HTTP_STATUS.BAD_REQUEST,
      );
    default:
      throw new AppError(
        `[HLS] Unsupported satellite source for HLS acquisition: ${String(satellite)}. ` +
          `Only SENTINEL_2, LANDSAT_8, and LANDSAT_9 are valid HLS sources.`,
        HTTP_STATUS.BAD_REQUEST,
      );
  }
}

/**
 * Returns a display-friendly platform name for logging and lineage tracking.
 */
export function resolveHLSSourcePlatform(satellite: SatelliteSource): string {
  switch (satellite) {
    case SatelliteSource.SENTINEL_2:
      return 'Sentinel-2';
    case SatelliteSource.LANDSAT_8:
      return 'Landsat-8';
    case SatelliteSource.LANDSAT_9:
      return 'Landsat-9';
    default:
      return String(satellite);
  }
}

// ─── Date Lineage Utilities ───────────────────────────────────────────────────

/**
 * Extracts the UTC date string (YYYY-MM-DD) from a Date object.
 */
function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Computes absolute date difference in days between two Dates.
 */
function dateDiffDays(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Validates that the HLS image acquisition date is within
 * HLS_MAX_DATE_TOLERANCE_DAYS of the source observation date.
 *
 * HLS V2.0 processes source imagery on the same day — so a date mismatch
 * indicates the wrong image was selected or the search window is incorrect.
 *
 * @returns true if dates are within tolerance, false otherwise.
 */
export function validateHLSDateLineage(
  sourceObservationDate: Date,
  hlsAcquisitionDate: Date,
  toleranceDays: number = HLS_MAX_DATE_TOLERANCE_DAYS,
): boolean {
  const diffDays = dateDiffDays(sourceObservationDate, hlsAcquisitionDate);
  return diffDays <= toleranceDays;
}

// ─── HLS GEE Image Filtering ──────────────────────────────────────────────────

/**
 * Picks the best matching HLS image record from GEE results.
 *
 * Selection criteria (in priority order):
 * 1. Image acquisition date must be within HLS_MAX_DATE_TOLERANCE_DAYS of sourceObservationDate.
 * 2. Among date-matched candidates, prefer the one with the lowest cloud cover.
 * 3. If no date-matched candidates exist, returns null.
 *
 * This enforces strict source/date lineage — arbitrary "nearest" selection is prohibited.
 */
export function selectBestHLSCandidate(
  images: RawGeeImageRecord[],
  sourceObservationDate: Date,
): RawGeeImageRecord | null {
  const dateMatched = images.filter((img) => {
    const acqMs = Number(img.properties?.['system:time_start'] || 0);
    if (!acqMs) return false;
    const acqDate = new Date(acqMs);
    return validateHLSDateLineage(sourceObservationDate, acqDate);
  });

  if (dateMatched.length === 0) {
    return null;
  }

  // Sort by cloud cover ascending (lowest cloud first)
  dateMatched.sort((a, b) => {
    const cloudA = Number(
      a.properties?.CLOUD_COVERAGE_ASSESSMENT ??
      a.properties?.CLOUDY_PIXEL_PERCENTAGE ??
      a.properties?.CLOUD_COVER ?? 0,
    );
    const cloudB = Number(
      b.properties?.CLOUD_COVERAGE_ASSESSMENT ??
      b.properties?.CLOUDY_PIXEL_PERCENTAGE ??
      b.properties?.CLOUD_COVER ?? 0,
    );
    return cloudA - cloudB;
  });

  return dateMatched[0]!;
}

// ─── HLS Acquisition Service ──────────────────────────────────────────────────

/**
 * HLSAcquisitionService acquires REAL NASA HLS V2.0 data from Google Earth Engine.
 *
 * Pipeline stages:
 *   1. Resolve source satellite → HLS product (S30 or L30)
 *   2. Query NASA/HLS/{product}/v002 collection in GEE
 *   3. Filter by geometry + date window
 *   4. Validate strict date lineage match
 *   5. Export via GeeExportService (GEE → Google Drive)
 *   6. Poll export task via GeeTaskService
 *   7. Download GeoTIFF from Google Drive via GoogleDriveService
 *   8. Validate raster bands/dimensions/CRS via GeoTiffService
 *   9. Return structured HLSAcquisitionResult (no DB writes)
 */
export class HLSAcquisitionService {
  private readonly geeClient: GeeClientService;
  private readonly geeExportService: GeeExportService;
  private readonly geeTaskService: GeeTaskService;
  private readonly driveService: GoogleDriveService;
  private readonly authService: GeeAuthService;

  constructor(
    geeClient?: GeeClientService,
    geeExportService?: GeeExportService,
    geeTaskService?: GeeTaskService,
    driveService?: GoogleDriveService,
  ) {
    this.geeClient = geeClient ?? new GeeClientService();
    this.geeExportService = geeExportService ?? new GeeExportService();
    this.geeTaskService = geeTaskService ?? new GeeTaskService();
    this.driveService = driveService ?? new GoogleDriveService();
    this.authService = GeeAuthService.getInstance();
  }

  /**
   * Main entry point.
   *
   * Acquires the NASA HLS V2.0 image that corresponds to the given source
   * baseline observation. Returns a structured result — success or failure.
   *
   * This method NEVER throws under normal conditions — all errors are
   * captured and returned as HLSAcquisitionFailure objects so callers
   * can persist failure state without exception handling.
   *
   * Only throws if the input is fundamentally invalid (SAR source, etc.).
   */
  public async acquireHLS(input: HLSAcquisitionInput): Promise<HLSAcquisitionOutcome> {
    const {
      zoneCode,
      jobId,
      sourceSatellite,
      sourceObservationDate,
      geometry,
      hlsVersion = HLSVersion.V2_0,
      searchWindowDays = 16,
    } = input;

    // ── Resolve product (throws immediately for invalid sensors) ──────────────
    let hlsProduct: HLSProduct;
    try {
      hlsProduct = resolveHLSProduct(sourceSatellite);
    } catch (err: unknown) {
      // Re-throw for invalid sensor — these are programming errors, not runtime failures
      throw err;
    }

    const geeCollection = HLS_GEE_COLLECTIONS[hlsProduct];
    const sourcePlatform = resolveHLSSourcePlatform(sourceSatellite);
    const failureBase = { success: false as const, hlsProduct, geeCollection, failedAt: new Date() };

    console.info(`[HLS_ACQUISITION] Starting acquisition for zone ${zoneCode} / job ${jobId}`);
    console.info(`[HLS_ACQUISITION] Source: ${sourcePlatform} → HLS product: ${hlsProduct} (${hlsVersion})`);
    console.info(`[HLS_ACQUISITION] Collection: ${geeCollection}`);
    console.info(`[HLS_ACQUISITION] Source observation date: ${toUtcDateString(sourceObservationDate)}`);

    // ── Stage 1: Query GEE HLS collection ────────────────────────────────────
    let rawImages: RawGeeImageRecord[];
    try {
      const windowHalf = Math.ceil(searchWindowDays / 2);
      const startDate = new Date(sourceObservationDate);
      startDate.setDate(startDate.getDate() - windowHalf);
      const endDate = new Date(sourceObservationDate);
      endDate.setDate(endDate.getDate() + windowHalf);

      console.info(
        `[HLS_ACQUISITION] Querying ${geeCollection} from ${toUtcDateString(startDate)} to ${toUtcDateString(endDate)}...`,
      );

      const queryResult = await this.geeClient.fetchAllPublicImages({
        collection: geeCollection,
        geometry,
        startDate,
        endDate,
        pageSize: 100,
        maxPages: 10,
      });

      rawImages = queryResult.images;

      console.info(
        `[HLS_ACQUISITION] GEE query returned ${rawImages.length} unique image(s) from ${geeCollection}.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof AppError ? err.message : err instanceof Error ? err.message : String(err);
      console.error(`[HLS_ACQUISITION] Stage 1 FAILED (GEE API error): ${msg}`);
      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_API_ERROR,
        errorMessage: `GEE HLS collection query failed for ${geeCollection}: ${msg}`,
        errorDetail: msg,
      };
    }

    // ── Stage 2: Find best date-lineage-matched HLS image ───────────────────
    if (rawImages.length === 0) {
      console.warn(
        `[HLS_ACQUISITION] No HLS images found in ${geeCollection} for zone ${zoneCode} ` +
          `near date ${toUtcDateString(sourceObservationDate)}.`,
      );
      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_NO_IMAGE_FOUND,
        errorMessage:
          `No HLS image found in ${geeCollection} for zone ${zoneCode} ` +
          `within ${searchWindowDays} days of source observation date ${toUtcDateString(sourceObservationDate)}.`,
      };
    }

    const bestCandidate = selectBestHLSCandidate(rawImages, sourceObservationDate);

    if (!bestCandidate) {
      const availableDates = rawImages
        .slice(0, 5)
        .map((img) => {
          const acqMs = Number(img.properties?.['system:time_start'] || 0);
          return acqMs ? toUtcDateString(new Date(acqMs)) : 'unknown';
        })
        .join(', ');

      console.warn(
        `[HLS_ACQUISITION] ${rawImages.length} HLS image(s) found but none match date lineage for ` +
          `source date ${toUtcDateString(sourceObservationDate)} (tolerance: ${HLS_MAX_DATE_TOLERANCE_DAYS} day). ` +
          `Available dates: [${availableDates}]`,
      );

      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_DATE_MISMATCH,
        errorMessage:
          `HLS date lineage mismatch: ${rawImages.length} image(s) found in ${geeCollection} but none ` +
          `acquired within ${HLS_MAX_DATE_TOLERANCE_DAYS} day(s) of source date ` +
          `${toUtcDateString(sourceObservationDate)}. Available: [${availableDates}]`,
        errorDetail: `Source date: ${toUtcDateString(sourceObservationDate)}, tolerance: ${HLS_MAX_DATE_TOLERANCE_DAYS} days`,
      };
    }

    const hlsAcqMs = Number(bestCandidate.properties?.['system:time_start'] || 0);
    const hlsAcquisitionDate = new Date(hlsAcqMs);
    const hlsImageId = bestCandidate.id;
    const cloudCoverPercent = Number(
      bestCandidate.properties?.CLOUD_COVERAGE_ASSESSMENT ??
      bestCandidate.properties?.CLOUDY_PIXEL_PERCENTAGE ??
      bestCandidate.properties?.CLOUD_COVER ?? 0,
    );

    console.info(
      `[HLS_ACQUISITION] Matched HLS image: ${hlsImageId} ` +
        `(date: ${toUtcDateString(hlsAcquisitionDate)}, cloud: ${cloudCoverPercent.toFixed(1)}%)`,
    );

    // ── Stage 3: Export HLS image from GEE to Google Drive ───────────────────
    const hlsBands = HLS_EXPORT_BANDS[hlsProduct];
    let geeExportTaskId: string;
    let driveFileName: string;

    try {
      // Build a SatelliteScene-compatible object for GeeExportService
      // HLS images don't go through GeeSatelliteSearchService, so we construct
      // an equivalent structure that GeeExportService understands.
      const hlsScene = {
        satellite: (hlsProduct === HLSProduct.S30 ? 'Sentinel-2' : 'Landsat-8') as
          'Sentinel-2' | 'Landsat-8' | 'Landsat-9' | 'Sentinel-1',
        sensorType: 'OPTICAL' as any,
        collection: geeCollection,
        imageId: hlsImageId,
        acquisitionDate: hlsAcquisitionDate,
        cloudCover: cloudCoverPercent,
        nativeResolution: HLS_NATIVE_RESOLUTION_M,
        bands: Array.from(hlsBands),
        footprint: geometry,
        crs: 'EPSG:4326',
        processingLevel: `HLS V2.0 (${hlsProduct})`,
        provider: 'NASA / LP DAAC / GEE',
      };

      const exportResult = await this.geeExportService.requestImageExport({
        scene: hlsScene,
        zoneCode,
        jobId,
        imageType: 'BASELINE',
        geometry,
        scaleMeters: HLS_NATIVE_RESOLUTION_M,
        crs: 'EPSG:4326',
      });

      geeExportTaskId = exportResult.taskId;
      driveFileName = exportResult.driveFileName;

      console.info(`[HLS_ACQUISITION] GEE export task submitted: ${geeExportTaskId}`);
      console.info(`[HLS_ACQUISITION] Drive filename: ${driveFileName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HLS_ACQUISITION] Stage 3 FAILED (export submission): ${msg}`);
      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_EXPORT_FAILED,
        errorMessage: `GEE HLS export submission failed for image ${hlsImageId}: ${msg}`,
        errorDetail: msg,
      };
    }

    // ── Stage 4: Poll export task until complete ──────────────────────────────
    try {
      const config = this.authService.getConfig();
      const taskStatus = await this.geeTaskService.pollTaskCompletion(geeExportTaskId, {
        timeoutMs: config.exportTimeoutMs,
        pollIntervalMs: config.pollIntervalMs,
      });

      if (taskStatus.state !== 'EXPORT_COMPLETED') {
        console.error(
          `[HLS_ACQUISITION] Stage 4 FAILED (export did not complete): ` +
            `state=${taskStatus.state}, error=${taskStatus.errorMessage ?? 'none'}`,
        );
        return {
          ...failureBase,
          errorStage: HLSErrorStage.HLS_EXPORT_FAILED,
          errorMessage:
            `GEE HLS export task ${geeExportTaskId} ended with state ${taskStatus.state}` +
            (taskStatus.errorMessage ? `: ${taskStatus.errorMessage}` : ''),
          errorDetail: taskStatus.errorMessage,
        };
      }

      console.info(`[HLS_ACQUISITION] GEE export completed successfully: ${geeExportTaskId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HLS_ACQUISITION] Stage 4 FAILED (export polling): ${msg}`);
      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_EXPORT_FAILED,
        errorMessage: `GEE HLS export polling failed for task ${geeExportTaskId}: ${msg}`,
        errorDetail: msg,
      };
    }

    // ── Stage 5: Find exported file in Google Drive ───────────────────────────
    let driveFileId: string;
    let actualDriveFileName: string;

    try {
      let driveFile = await this.driveService.findExportedFile(driveFileName);

      // Allow a brief indexing window in case Drive search takes a few seconds
      if (!driveFile || !driveFile.id) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          console.info(`[HLS_ACQUISITION] Retrying Drive search for ${driveFileName} (attempt ${attempt}/5)...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          driveFile = await this.driveService.findExportedFile(driveFileName);
          if (driveFile && driveFile.id) break;
        }
      }

      if (!driveFile || !driveFile.id) {
        console.error(`[HLS_ACQUISITION] Stage 5 FAILED: HLS GeoTIFF not found in Drive after export.`);
        return {
          ...failureBase,
          errorStage: HLSErrorStage.HLS_DOWNLOAD_FAILED,
          errorMessage: `HLS GeoTIFF ${driveFileName} not found in Google Drive after successful GEE export.`,
          errorDetail: `Expected filename: ${driveFileName}`,
        };
      }

      driveFileId = driveFile.id;
      actualDriveFileName = driveFile.name || driveFileName;

      console.info(`[HLS_ACQUISITION] Found Drive file: ${actualDriveFileName} (ID: ${driveFileId})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HLS_ACQUISITION] Stage 5 FAILED (Drive search): ${msg}`);
      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_DOWNLOAD_FAILED,
        errorMessage: `Failed to locate HLS GeoTIFF in Google Drive: ${msg}`,
        errorDetail: msg,
      };
    }

    // ── Stage 6: Download GeoTIFF from Google Drive ───────────────────────────
    let localFilePath: string;
    let fileSizeBytes: number;

    try {
      const downloaded = await this.driveService.downloadGeoTiff({
        jobId: `hls_${jobId}`,
        fileName: actualDriveFileName,
        fileId: driveFileId,
      });

      localFilePath = downloaded.localFilePath;
      fileSizeBytes = downloaded.sizeBytes;

      console.info(
        `[HLS_ACQUISITION] Downloaded HLS GeoTIFF: ${localFilePath} (${fileSizeBytes} bytes)`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HLS_ACQUISITION] Stage 6 FAILED (Drive download): ${msg}`);
      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_DOWNLOAD_FAILED,
        errorMessage: `Failed to download HLS GeoTIFF from Google Drive (fileId: ${driveFileId}): ${msg}`,
        errorDetail: msg,
      };
    }

    // ── Stage 7: Validate HLS raster (bands, dimensions, CRS, Fmask) ─────────
    let rasterMetadata: GeoTiffMetadata;
    let fmaskValidated: boolean;

    let validFmaskPixels = 0;
    try {
      const parsed = await GeoTiffService.readGeoTiff(localFilePath);
      rasterMetadata = parsed.metadata;

      // Minimum band count check (HLS product bands + Fmask)
      if (rasterMetadata.numBands < HLS_MIN_BAND_COUNT) {
        console.error(
          `[HLS_ACQUISITION] Stage 7 FAILED: HLS raster has ${rasterMetadata.numBands} bands, ` +
            `expected at least ${HLS_MIN_BAND_COUNT} (including Fmask).`,
        );
        return {
          ...failureBase,
          errorStage: HLSErrorStage.HLS_RASTER_INVALID,
          errorMessage:
            `HLS raster band count invalid: got ${rasterMetadata.numBands} bands, ` +
            `expected at least ${HLS_MIN_BAND_COUNT} (${hlsProduct} bands + Fmask).`,
          errorDetail: `File: ${localFilePath}`,
        };
      }

      // Dimension check — must have non-zero pixels
      if (rasterMetadata.width === 0 || rasterMetadata.height === 0) {
        console.error(`[HLS_ACQUISITION] Stage 7 FAILED: HLS raster has zero dimensions.`);
        return {
          ...failureBase,
          errorStage: HLSErrorStage.HLS_RASTER_INVALID,
          errorMessage: `HLS raster has invalid dimensions: ${rasterMetadata.width} × ${rasterMetadata.height}.`,
          errorDetail: `File: ${localFilePath}`,
        };
      }

      // Fmask is always exported as the last band — presence confirmed by band count
      fmaskValidated = rasterMetadata.numBands >= HLS_MIN_BAND_COUNT;

      // QA check: if Fmask band is present (index 6), validate it's not entirely nodata
      if (fmaskValidated && parsed.bandData.length >= HLS_MIN_BAND_COUNT) {
        const fmaskBand = parsed.bandData[HLS_MIN_BAND_COUNT - 1]!;
        const totalPixels = rasterMetadata.width * rasterMetadata.height;
        const nodata = rasterMetadata.nodata;

        for (let i = 0; i < totalPixels; i++) {
          const v = fmaskBand[i];
          if (v !== undefined && !isNaN(v) && isFinite(v) && (nodata === null || v !== nodata)) {
            validFmaskPixels++;
          }
        }

        if (validFmaskPixels === 0) {
          console.error(`[HLS_ACQUISITION] Stage 7 FAILED: HLS Fmask band contains only nodata pixels.`);
          return {
            ...failureBase,
            errorStage: HLSErrorStage.HLS_QA_INVALID,
            errorMessage: `HLS Fmask (QA) band is entirely nodata — raster may be outside scene coverage.`,
            errorDetail: `File: ${localFilePath}, totalPixels: ${totalPixels}`,
          };
        }

        console.info(
          `[HLS_ACQUISITION] Fmask QA validation passed: ${validFmaskPixels} valid pixels.`,
        );
      }

      console.info(
        `[HLS_ACQUISITION] Raster validation passed: ` +
          `${rasterMetadata.width}×${rasterMetadata.height} px, ` +
          `${rasterMetadata.numBands} bands, CRS: ${rasterMetadata.originalCrs}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HLS_ACQUISITION] Stage 7 FAILED (raster validation): ${msg}`);
      return {
        ...failureBase,
        errorStage: HLSErrorStage.HLS_RASTER_INVALID,
        errorMessage: `HLS raster validation failed for ${localFilePath}: ${msg}`,
        errorDetail: msg,
      };
    }

    // ── Success ───────────────────────────────────────────────────────────────
    const completedAt = new Date();

    console.info(
      `[HLS_ACQUISITION] ✅ Acquisition complete for zone ${zoneCode} / job ${jobId}:\n` +
        `  Product:     ${hlsProduct} (${hlsVersion})\n` +
        `  Collection:  ${geeCollection}\n` +
        `  GEE image:   ${hlsImageId}\n` +
        `  HLS date:    ${toUtcDateString(hlsAcquisitionDate)}\n` +
        `  Drive file:  ${actualDriveFileName} (${fileSizeBytes} bytes)\n` +
        `  Raster:      ${rasterMetadata.width}×${rasterMetadata.height} px, ` +
          `${rasterMetadata.numBands} bands, ${rasterMetadata.originalCrs}\n` +
        `  Completed:   ${completedAt.toISOString()}`,
    );

    return {
      success: true,
      hlsProduct,
      hlsVersion,
      geeCollection,
      geeHlsImageId: hlsImageId,
      hlsAcquisitionDate,
      cloudCoverPercent,
      driveFileId,
      driveFileName: actualDriveFileName,
      localFilePath,
      fileSizeBytes,
      bandCount: rasterMetadata.numBands,
      rasterWidth: rasterMetadata.width,
      rasterHeight: rasterMetadata.height,
      rasterCrs: rasterMetadata.originalCrs,
      resolutionMeters: HLS_NATIVE_RESOLUTION_M,
      fmaskValidated,
      sourcePlatform,
      completedAt,
      geeExportTaskId,
      originalCrs: rasterMetadata.originalCrs,
      pixelAreaM2: rasterMetadata.pixelAreaM2,
      validPixelCount: validFmaskPixels,
    };
  }
}
