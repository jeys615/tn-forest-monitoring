import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as GeoTIFF from 'geotiff';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { GeoTiffService, type ParsedGeoTiffRaster } from '../raster/GeoTiffService.js';
import type {
  OfflineSatelliteSensor,
  OfflinePipelineType,
  OfflineChangeCategory,
  OfflineBandMapping,
  OfflineRasterMetadata,
  OfflineChangeCategoryStat,
  OfflineAreaSummary,
  OfflineChangeDetectionParams,
  OfflineChangeDetectionResult,
  OfflineChangeDetectionArtifacts,
} from '@tn-forest/shared/types';

export class OfflineChangeDetectionService {
  private static readonly STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'offline_change_detection');
  private static readonly UPLOADS_DIR = path.join(OfflineChangeDetectionService.STORAGE_DIR, 'uploads');
  private static readonly JOBS_DIR = path.join(OfflineChangeDetectionService.STORAGE_DIR, 'jobs');

  static {
    // Ensure base directories exist on startup
    if (!fs.existsSync(OfflineChangeDetectionService.STORAGE_DIR)) {
      fs.mkdirSync(OfflineChangeDetectionService.STORAGE_DIR, { recursive: true });
    }
    if (!fs.existsSync(OfflineChangeDetectionService.UPLOADS_DIR)) {
      fs.mkdirSync(OfflineChangeDetectionService.UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(OfflineChangeDetectionService.JOBS_DIR)) {
      fs.mkdirSync(OfflineChangeDetectionService.JOBS_DIR, { recursive: true });
    }
  }

  public static getUploadsDir(): string {
    return OfflineChangeDetectionService.UPLOADS_DIR;
  }

  public static getJobsDir(): string {
    return OfflineChangeDetectionService.JOBS_DIR;
  }

  /**
   * Scans local filesystem (e.g. raster_temp) for available authentic GeoTIFF rasters.
   */
  public static listAvailableLocalRasters(): Array<{
    filename: string;
    relativePath: string;
    sizeBytes: number;
    detectedSensor: OfflineSatelliteSensor;
  }> {
    const results: Array<{
      filename: string;
      relativePath: string;
      sizeBytes: number;
      detectedSensor: OfflineSatelliteSensor;
    }> = [];
    const seenFiles = new Set<string>();

    const searchDirs = [
      OfflineChangeDetectionService.STORAGE_DIR,
      OfflineChangeDetectionService.UPLOADS_DIR,
      path.resolve(process.cwd(), 'storage', 'offline_change_detection'),
      path.resolve(process.cwd(), 'storage', 'offline_change_detection', 'test_fixtures'),
      path.resolve(process.cwd(), 'storage', 'raster_temp'),
      path.resolve(process.cwd(), '..', 'storage', 'raster_temp'),
      'C:/Users/jayaseelan/Downloads',
    ];

    for (const baseDir of searchDirs) {
      if (!fs.existsSync(baseDir)) continue;

      const scanDir = (dir: string) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            const fullPath = path.join(dir, ent.name);
            if (ent.isDirectory()) {
              // Avoid scanning job output artifact directories to keep catalog clean
              if (ent.name !== 'jobs' && ent.name !== 'node_modules' && ent.name !== '.git') {
                scanDir(fullPath);
              }
            } else if (ent.isFile() && (ent.name.endsWith('.tif') || ent.name.endsWith('.tiff'))) {
              if (seenFiles.has(ent.name)) continue;
              seenFiles.add(ent.name);

              const stat = fs.statSync(fullPath);
              results.push({
                filename: ent.name,
                relativePath: path.relative(process.cwd(), fullPath),
                sizeBytes: stat.size,
                detectedSensor: OfflineChangeDetectionService.detectSensorFromFilename(ent.name),
              });
            }
          }
        } catch {
          // Ignore read errors on inaccessible subdirectories
        }
      };

      scanDir(baseDir);
    }

    return results;
  }

  /**
   * Detects sensor family from file naming conventions or metadata hints.
   */
  public static detectSensorFromFilename(filename: string): OfflineSatelliteSensor {
    const lower = filename.toLowerCase();
    if (lower.includes('sentinel') || lower.includes('s2') || lower.includes('msi') || lower.includes('sirumalai')) {
      return 'Sentinel-2';
    }
    if (lower.includes('landsat8') || lower.includes('landsat_8') || lower.includes('lc08')) {
      return 'Landsat-8';
    }
    if (lower.includes('landsat9') || lower.includes('landsat_9') || lower.includes('lc09')) {
      return 'Landsat-9';
    }
    if (lower.includes('landsat7') || lower.includes('landsat_7') || lower.includes('le07')) {
      return 'Landsat-7';
    }
    if (lower.includes('landsat5') || lower.includes('landsat_5') || lower.includes('lt05')) {
      return 'Landsat-5';
    }
    if (lower.includes('landsat')) {
      return 'Landsat-8';
    }
    return 'Generic-Optical';
  }

  /**
   * Inspects a local GeoTIFF file, extracting spatial metadata, CRS, resolution, and thumbnail preview.
   */
  public static async inspectRaster(filePath: string): Promise<OfflineRasterMetadata> {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new AppError(`Satellite raster file not found: ${filePath}`, HTTP_STATUS.NOT_FOUND);
    }

    const parsed = await GeoTiffService.readGeoTiff(resolvedPath);
    const meta = parsed.metadata;

    const detectedSensor = OfflineChangeDetectionService.detectSensorFromFilename(path.basename(resolvedPath));

    // Generate quick preview thumbnail
    let thumbnailPngBase64 = '';
    try {
      const thumbBuffer = await GeoTiffService.renderTrueColorPng(resolvedPath, {
        satellite: detectedSensor,
      });
      thumbnailPngBase64 = `data:image/png;base64,${thumbBuffer.toString('base64')}`;
    } catch (thumbErr) {
      console.warn(`[OfflineChangeDetection] Could not generate preview thumbnail: ${thumbErr}`);
    }

    return {
      filename: path.basename(resolvedPath),
      originalPath: resolvedPath,
      width: meta.width,
      height: meta.height,
      numBands: meta.numBands,
      crs: meta.crs || meta.originalCrs,
      pixelSizeX: meta.pixelSize ? meta.pixelSize[0] : (meta.pixelScale ? meta.pixelScale[0] : 0),
      pixelSizeY: meta.pixelSize ? meta.pixelSize[1] : (meta.pixelScale ? meta.pixelScale[1] : 0),
      originX: meta.origin ? meta.origin[0] : (meta.bbox ? meta.bbox[0] : 0),
      originY: meta.origin ? meta.origin[1] : (meta.bbox ? meta.bbox[3] : 0),
      bbox: meta.bbox,
      nodata: meta.nodata,
      detectedSensor,
      thumbnailPngBase64,
      bandNames: parsed.bandNames,
    };
  }

  /**
   * Resolves spectral bands according to sensor layout or custom user mapping.
   */
  private static extractBands(
    parsed: ParsedGeoTiffRaster,
    sensor: OfflineSatelliteSensor,
    customMapping?: OfflineBandMapping,
  ): {
    blue: Float32Array;
    green: Float32Array;
    red: Float32Array;
    nir: Float32Array;
    swir1?: Float32Array;
    swir2?: Float32Array;
    qa?: Float32Array;
  } {
    const { numBands } = parsed.metadata;
    const bands = parsed.bandData;

    // Use custom mapping if provided
    if (customMapping && customMapping.red !== undefined && customMapping.nir !== undefined) {
      const getBandOrFallback = (idx?: number, fallbackIdx = 0): Float32Array => {
        if (idx !== undefined && idx >= 0 && idx < numBands) return bands[idx];
        return bands[fallbackIdx] || new Float32Array(parsed.metadata.width * parsed.metadata.height);
      };
      return {
        blue: getBandOrFallback(customMapping.blue, 0),
        green: getBandOrFallback(customMapping.green, Math.min(1, numBands - 1)),
        red: getBandOrFallback(customMapping.red, Math.min(2, numBands - 1)),
        nir: getBandOrFallback(customMapping.nir, Math.min(3, numBands - 1)),
        swir1: customMapping.swir1 !== undefined && customMapping.swir1 < numBands ? bands[customMapping.swir1] : undefined,
        swir2: customMapping.swir2 !== undefined && customMapping.swir2 < numBands ? bands[customMapping.swir2] : undefined,
        qa: customMapping.qa !== undefined && customMapping.qa < numBands ? bands[customMapping.qa] : undefined,
      };
    }

    // Default multi-spectral export layout for Sentinel-2:
    // [0: B2 (Blue), 1: B3 (Green), 2: B4 (Red), 3: B8 (NIR), 4: B11 (SWIR1), 5: B12 (SWIR2), 6: SCL (QA)]
    if (sensor === 'Sentinel-2' && numBands >= 4) {
      return {
        blue: bands[0],
        green: bands[1],
        red: bands[2],
        nir: bands[3],
        swir1: numBands > 4 ? bands[4] : undefined,
        swir2: numBands > 5 ? bands[5] : undefined,
        qa: numBands > 6 ? bands[6] : undefined,
      };
    }

    // Default Landsat C2 L2 layout:
    // [0: SR_B2 (Blue), 1: SR_B3 (Green), 2: SR_B4 (Red), 3: SR_B5 (NIR), 4: SR_B6 (SWIR1), 5: SR_B7 (SWIR2), 6: QA_PIXEL]
    if ((sensor === 'Landsat-8' || sensor === 'Landsat-9' || sensor === 'Landsat-5' || sensor === 'Landsat-7') && numBands >= 4) {
      return {
        blue: bands[0],
        green: bands[1],
        red: bands[2],
        nir: bands[3],
        swir1: numBands > 4 ? bands[4] : undefined,
        swir2: numBands > 5 ? bands[5] : undefined,
        qa: numBands > 6 ? bands[6] : undefined,
      };
    }

    // Fallback for 3-band RGB imagery or unknown band order:
    if (numBands >= 3) {
      console.warn(`[OfflineChangeDetection] Falling back to 3-band optical mapping for ${sensor} (Bands: ${numBands})`);
      return {
        blue: bands[2] || bands[0],
        green: bands[1],
        red: bands[0],
        nir: bands[0], // Proxy when NIR band is absent
        swir1: undefined,
        swir2: undefined,
        qa: undefined,
      };
    }

    throw new AppError(
      `Raster has insufficient spectral bands (${numBands}). At least 3 bands (Red, Green, Blue/NIR) are required.`,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
    );
  }

  /**
   * Calibrates raw integer DNs to continuous surface reflectance [0.0, 1.0].
   */
  private static scaleReflectance(
    band: Float32Array,
    sensor: OfflineSatelliteSensor,
    nodata: number | null,
  ): Float32Array {
    const total = band.length;
    const scaled = new Float32Array(total);

    // Detect if data is already in [0.0, 1.0] range
    let maxVal = 0;
    for (let i = 0; i < total; i++) {
      const v = band[i];
      if (!isNaN(v) && v > maxVal) maxVal = v;
    }
    const alreadyNormalized = maxVal <= 1.5 && maxVal > 0;

    for (let i = 0; i < total; i++) {
      const dn = band[i];
      if (isNaN(dn) || (nodata !== null && Math.abs(dn - nodata) < 1e-4) || dn < 0) {
        scaled[i] = NaN;
        continue;
      }

      if (alreadyNormalized) {
        scaled[i] = Math.max(0.0, Math.min(1.0, dn));
      } else if (sensor === 'Sentinel-2') {
        // Sentinel-2 L2A BOA reflectance: DN * 0.0001
        scaled[i] = Math.max(0.0, Math.min(1.0, dn * 0.0001));
      } else if (sensor === 'Landsat-8' || sensor === 'Landsat-9' || sensor === 'Landsat-5' || sensor === 'Landsat-7') {
        // Landsat Collection 2 Level-2 Surface Reflectance: DN * 0.0000275 - 0.2
        const refl = dn * 0.0000275 - 0.2;
        scaled[i] = Math.max(0.0, Math.min(1.0, refl));
      } else {
        // Generic optical: assume 8-bit [0, 255] or 16-bit [0, 10000]
        if (maxVal > 255) {
          scaled[i] = Math.max(0.0, Math.min(1.0, dn * 0.0001));
        } else {
          scaled[i] = Math.max(0.0, Math.min(1.0, dn / 255.0));
        }
      }
    }

    return scaled;
  }

  /**
   * Generates a binary quality/cloud mask: 1 = valid clear pixel, 0 = cloud/shadow/nodata.
   */
  private static generateCloudMask(
    red: Float32Array,
    nir: Float32Array,
    qaBand: Float32Array | undefined,
    sensor: OfflineSatelliteSensor,
    maskClouds: boolean = true,
  ): Uint8Array {
    const total = red.length;
    const mask = new Uint8Array(total);

    for (let i = 0; i < total; i++) {
      const r = red[i];
      const n = nir[i];

      // Missing or invalid radiometric values
      if (isNaN(r) || isNaN(n) || r < 0 || r > 1.0 || n < 0 || n > 1.0) {
        mask[i] = 0;
        continue;
      }

      if (maskClouds && qaBand) {
        const qa = qaBand[i];
        if (sensor === 'Sentinel-2') {
          // Sentinel-2 SCL: 0=NO_DATA, 1=SATURATED, 3=CLOUD_SHADOW, 8=CLOUD_MED, 9=CLOUD_HIGH, 10=CIRRUS, 11=SNOW
          if (qa === 0 || qa === 1 || qa === 3 || qa === 8 || qa === 9 || qa === 10 || qa === 11) {
            mask[i] = 0;
            continue;
          }
        } else if (sensor === 'Landsat-8' || sensor === 'Landsat-9') {
          // Landsat QA_PIXEL bitmask:
          // bit 0: Fill, bit 1: Dilated Cloud, bit 2: Cirrus, bit 3: Cloud, bit 4: Cloud Shadow
          const intQa = Math.round(qa);
          const isFill = (intQa & 1) !== 0;
          const isDilatedCloud = (intQa & (1 << 1)) !== 0;
          const isCirrus = (intQa & (1 << 2)) !== 0;
          const isCloud = (intQa & (1 << 3)) !== 0;
          const isCloudShadow = (intQa & (1 << 4)) !== 0;

          if (isFill || isDilatedCloud || isCirrus || isCloud || isCloudShadow) {
            mask[i] = 0;
            continue;
          }
        }
      }

      mask[i] = 1; // Valid clear pixel
    }

    return mask;
  }

  /**
   * Resamples source raster continuous bands using Bilinear Interpolation
   * and discrete masks using Nearest-Neighbor to match target dimensions.
   */
  private static resampleToGrid(
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number,
    bands: {
      blue: Float32Array;
      green: Float32Array;
      red: Float32Array;
      nir: Float32Array;
      swir1?: Float32Array;
      swir2?: Float32Array;
      validMask: Uint8Array;
    },
  ): {
    blue: Float32Array;
    green: Float32Array;
    red: Float32Array;
    nir: Float32Array;
    swir1?: Float32Array;
    swir2?: Float32Array;
    validMask: Uint8Array;
  } {
    if (srcWidth === targetWidth && srcHeight === targetHeight) {
      return bands;
    }

    const scaleX = srcWidth / targetWidth;
    const scaleY = srcHeight / targetHeight;
    const targetPixels = targetWidth * targetHeight;

    const resampleContinuous = (src: Float32Array): Float32Array => {
      const dest = new Float32Array(targetPixels);
      for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
          const srcX = x * scaleX;
          const srcY = y * scaleY;
          const x0 = Math.floor(srcX);
          const x1 = Math.min(srcWidth - 1, x0 + 1);
          const y0 = Math.floor(srcY);
          const y1 = Math.min(srcHeight - 1, y0 + 1);
          const wx = srcX - x0;
          const wy = srcY - y0;

          const v00 = src[y0 * srcWidth + x0];
          const v10 = src[y0 * srcWidth + x1];
          const v01 = src[y1 * srcWidth + x0];
          const v11 = src[y1 * srcWidth + x1];

          if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) {
            dest[y * targetWidth + x] = v00;
          } else {
            const top = v00 * (1 - wx) + v10 * wx;
            const bottom = v01 * (1 - wx) + v11 * wx;
            dest[y * targetWidth + x] = top * (1 - wy) + bottom * wy;
          }
        }
      }
      return dest;
    };

    const resampleNearest = (src: Uint8Array): Uint8Array => {
      const dest = new Uint8Array(targetPixels);
      for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
          const srcX = Math.min(srcWidth - 1, Math.round(x * scaleX));
          const srcY = Math.min(srcHeight - 1, Math.round(y * scaleY));
          dest[y * targetWidth + x] = src[srcY * srcWidth + srcX];
        }
      }
      return dest;
    };

    return {
      blue: resampleContinuous(bands.blue),
      green: resampleContinuous(bands.green),
      red: resampleContinuous(bands.red),
      nir: resampleContinuous(bands.nir),
      swir1: bands.swir1 ? resampleContinuous(bands.swir1) : undefined,
      swir2: bands.swir2 ? resampleContinuous(bands.swir2) : undefined,
      validMask: resampleNearest(bands.validMask),
    };
  }

  /**
   * Harmonizes spectral reflectance bands across different sensor platforms
   * (e.g. Landsat 8/9 vs Sentinel-2) using documented bandpass adjustments (Roy et al. 2016).
   */
  private static harmonizeCrossSensorBands(
    landsatBands: { blue: Float32Array; green: Float32Array; red: Float32Array; nir: Float32Array; swir1?: Float32Array; swir2?: Float32Array },
  ): void {
    const total = landsatBands.red.length;
    // Roy et al. (2016) / NASA HLS standard transformation from Landsat 8 OLI to Sentinel-2 MSI equivalents:
    // MSI_Blue  = 0.9785 * OLI_Blue  - 0.0014
    // MSI_Green = 0.9542 * OLI_Green + 0.0012
    // MSI_Red   = 0.9723 * OLI_Red   + 0.0009
    // MSI_NIR   = 0.9959 * OLI_NIR   - 0.0009
    // MSI_SWIR1 = 1.0238 * OLI_SWIR1 - 0.0011
    // MSI_SWIR2 = 1.0087 * OLI_SWIR2 - 0.0015
    for (let i = 0; i < total; i++) {
      if (!isNaN(landsatBands.blue[i])) {
        landsatBands.blue[i] = Math.max(0.0, Math.min(1.0, 0.9785 * landsatBands.blue[i] - 0.0014));
      }
      if (!isNaN(landsatBands.green[i])) {
        landsatBands.green[i] = Math.max(0.0, Math.min(1.0, 0.9542 * landsatBands.green[i] + 0.0012));
      }
      if (!isNaN(landsatBands.red[i])) {
        landsatBands.red[i] = Math.max(0.0, Math.min(1.0, 0.9723 * landsatBands.red[i] + 0.0009));
      }
      if (!isNaN(landsatBands.nir[i])) {
        landsatBands.nir[i] = Math.max(0.0, Math.min(1.0, 0.9959 * landsatBands.nir[i] - 0.0009));
      }
      if (landsatBands.swir1 && !isNaN(landsatBands.swir1[i])) {
        landsatBands.swir1[i] = Math.max(0.0, Math.min(1.0, 1.0238 * landsatBands.swir1[i] - 0.0011));
      }
      if (landsatBands.swir2 && !isNaN(landsatBands.swir2[i])) {
        landsatBands.swir2[i] = Math.max(0.0, Math.min(1.0, 1.0087 * landsatBands.swir2[i] - 0.0015));
      }
    }
  }

  /**
   * Computes per-pixel NDVI: (NIR - Red) / (NIR + Red)
   */
  private static calculateNdvi(nir: Float32Array, red: Float32Array, validMask: Uint8Array): Float32Array {
    const total = nir.length;
    const ndvi = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      if (validMask[i] === 0) {
        ndvi[i] = NaN;
        continue;
      }
      const n = nir[i];
      const r = red[i];
      const denom = n + r;
      if (isNaN(n) || isNaN(r) || denom <= 0.0001) {
        ndvi[i] = NaN;
      } else {
        const val = (n - r) / denom;
        ndvi[i] = Math.max(-1.0, Math.min(1.0, val));
      }
    }
    return ndvi;
  }

  /**
   * Computes per-pixel Bare Soil Index (BSI):
   * BSI = ((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue))
   * If SWIR1 is absent, uses normalized soil index proxy: (Red - Green) / (Red + Green)
   */
  private static calculateBsi(
    blue: Float32Array,
    green: Float32Array,
    red: Float32Array,
    nir: Float32Array,
    swir1: Float32Array | undefined,
    validMask: Uint8Array,
  ): Float32Array {
    const total = red.length;
    const bsi = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      if (validMask[i] === 0) {
        bsi[i] = NaN;
        continue;
      }

      if (swir1 && !isNaN(swir1[i])) {
        const s1 = swir1[i];
        const r = red[i];
        const n = nir[i];
        const b = blue[i];
        const num = (s1 + r) - (n + b);
        const denom = (s1 + r) + (n + b);
        if (denom <= 0.0001 || isNaN(num)) {
          bsi[i] = NaN;
        } else {
          bsi[i] = Math.max(-1.0, Math.min(1.0, num / denom));
        }
      } else {
        // 4-band proxy using Red and Green soil contrast
        const r = red[i];
        const g = green[i];
        const denom = r + g;
        if (denom <= 0.0001 || isNaN(r) || isNaN(g)) {
          bsi[i] = NaN;
        } else {
          bsi[i] = Math.max(-1.0, Math.min(1.0, (r - g) / denom));
        }
      }
    }
    return bsi;
  }

  /**
   * Encodes an 8-bit true-color PNG buffer from RGB arrays.
   */
  private static encodeRgbPng(
    red: Float32Array,
    green: Float32Array,
    blue: Float32Array,
    validMask: Uint8Array,
    width: number,
    height: number,
  ): Buffer {
    const total = width * height;
    const rgba = Buffer.alloc(total * 4);

    for (let i = 0; i < total; i++) {
      if (validMask[i] === 0 || isNaN(red[i])) {
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0; // Transparent
        continue;
      }

      // 2.5x stretch with 0-255 clamping for clear visualization
      const r = Math.round(Math.min(255, Math.max(0, red[i] * 255 * 2.2)));
      const g = Math.round(Math.min(255, Math.max(0, green[i] * 255 * 2.2)));
      const b = Math.round(Math.min(255, Math.max(0, blue[i] * 255 * 2.2)));

      rgba[i * 4 + 0] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = 255;
    }

    return OfflineChangeDetectionService.encodeRgbaPng(width, height, rgba);
  }

  /**
   * Helper to encode 32-bit RGBA scanlines into standard PNG buffer using node:zlib.
   */
  private static encodeRgbaPng(width: number, height: number, rgbaBytes: Buffer): Buffer {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8); // 8 bits per sample
    ihdrData.writeUInt8(6, 9); // Color type 6: RGBA (Truecolour with alpha)
    ihdrData.writeUInt8(0, 10); // Deflate compression
    ihdrData.writeUInt8(0, 11); // Filter method 0
    ihdrData.writeUInt8(0, 12); // No interlace
    const ihdrChunk = OfflineChangeDetectionService.writePngChunk('IHDR', ihdrData);

    const scanlineLength = 1 + width * 4;
    const rawData = Buffer.alloc(scanlineLength * height);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * scanlineLength;
      rawData[rowOffset] = 0; // Filter 0 (None)
      const srcRowOffset = y * width * 4;
      rgbaBytes.copy(rawData, rowOffset + 1, srcRowOffset, srcRowOffset + width * 4);
    }

    const compressedData = zlib.deflateSync(rawData);
    const idatChunk = OfflineChangeDetectionService.writePngChunk('IDAT', compressedData);
    const iendChunk = OfflineChangeDetectionService.writePngChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  }

  private static crc32(buf: Buffer): number {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      for (let j = 0; j < 8; j++) {
        const bit = (crc ^ byte) & 1;
        crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
        byte >>>= 1;
      }
    }
    return (crc ^ -1) >>> 0;
  }

  private static writePngChunk(type: string, data: Buffer): Buffer {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    buf.writeUInt32BE(OfflineChangeDetectionService.crc32(typeAndData), 8 + len);
    return buf;
  }


  /**
   * Encodes an interactive RGBA PNG map representing the 7 change categories.
   */
  private static encodeChangeMapPng(
    classification: Uint8Array,
    width: number,
    height: number,
  ): Buffer {
    const total = width * height;
    const rgba = Buffer.alloc(total * 4);

    // Color definitions
    // 0: Uncertain/Masked -> Transparent gray [100, 116, 139, 100]
    // 1: Vegetation Loss -> Bright Red [230, 57, 70, 255]
    // 2: Vegetation Gain -> Emerald Green [42, 157, 143, 255]
    // 3: Bare Ground Increase -> Terracotta/Amber [231, 111, 81, 255]
    // 4: Bare Ground Decrease -> Olive/Sand [212, 163, 115, 255]
    // 5: Other Spectral Change -> Purple [157, 78, 221, 255]
    // 6: Stable -> Muted Dark Slate [30, 41, 59, 255]

    for (let i = 0; i < total; i++) {
      const code = classification[i];
      switch (code) {
        case 1: // Veg decrease
          rgba[i * 4 + 0] = 230;
          rgba[i * 4 + 1] = 57;
          rgba[i * 4 + 2] = 70;
          rgba[i * 4 + 3] = 255;
          break;
        case 2: // Veg increase
          rgba[i * 4 + 0] = 42;
          rgba[i * 4 + 1] = 157;
          rgba[i * 4 + 2] = 143;
          rgba[i * 4 + 3] = 255;
          break;
        case 3: // Bare ground increase
          rgba[i * 4 + 0] = 231;
          rgba[i * 4 + 1] = 111;
          rgba[i * 4 + 2] = 81;
          rgba[i * 4 + 3] = 255;
          break;
        case 4: // Bare ground decrease
          rgba[i * 4 + 0] = 212;
          rgba[i * 4 + 1] = 163;
          rgba[i * 4 + 2] = 115;
          rgba[i * 4 + 3] = 255;
          break;
        case 5: // Other spectral change
          rgba[i * 4 + 0] = 157;
          rgba[i * 4 + 1] = 78;
          rgba[i * 4 + 2] = 221;
          rgba[i * 4 + 3] = 255;
          break;
        case 6: // Stable
          rgba[i * 4 + 0] = 30;
          rgba[i * 4 + 1] = 41;
          rgba[i * 4 + 2] = 59;
          rgba[i * 4 + 3] = 255;
          break;
        case 0: // Uncertain/Invalid
        default:
          rgba[i * 4 + 0] = 100;
          rgba[i * 4 + 1] = 116;
          rgba[i * 4 + 2] = 139;
          rgba[i * 4 + 3] = 90; // Translucent
          break;
      }
    }

    return OfflineChangeDetectionService.encodeRgbaPng(width, height, rgba);
  }

  /**
   * Encodes a visual cloud/quality mask overlay PNG.
   */
  private static encodeCloudMaskPng(
    mask: Uint8Array,
    width: number,
    height: number,
  ): Buffer {
    const total = width * height;
    const rgba = Buffer.alloc(total * 4);

    for (let i = 0; i < total; i++) {
      if (mask[i] === 0) {
        // Masked/Cloud pixel -> Highlight in Amber with 180 opacity
        rgba[i * 4 + 0] = 245;
        rgba[i * 4 + 1] = 158;
        rgba[i * 4 + 2] = 11;
        rgba[i * 4 + 3] = 180;
      } else {
        // Clear pixel -> Transparent
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0;
      }
    }

    return OfflineChangeDetectionService.encodeRgbaPng(width, height, rgba);
  }

  /**
   * Writes a single-band categorical or continuous raster to a valid GeoTIFF buffer.
   */
  private static async writeSingleBandGeoTiff(
    data: Float32Array | Uint8Array,
    width: number,
    height: number,
    crs: string,
    pixelScale: [number, number, number],
    tiePoint: [number, number, number, number, number, number],
    nodata: string = '-9999',
  ): Promise<Buffer> {
    const metadata = {
      height,
      width,
      GeoAsciiParams: crs.includes('32644') ? 'WGS 84 / UTM zone 44N' : (crs.includes('32643') ? 'WGS 84 / UTM zone 43N' : 'WGS 84'),
      ModelPixelScale: pixelScale,
      ModelTiepoint: tiePoint,
      GDAL_NODATA: nodata,
    };

    const arrayBuffer = await GeoTIFF.writeArrayBuffer(data, metadata);
    return Buffer.from(arrayBuffer);
  }

  /**
   * Main offline processing engine.
   * Executes same-sensor or cross-sensor change detection, vegetation & soil classification,
   * area calculations, and produces all export artifacts.
   */
  public static async executeChangeDetection(
    params: OfflineChangeDetectionParams,
  ): Promise<OfflineChangeDetectionResult> {
    const jobId = `OFFLINE-CHG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const jobDir = path.join(OfflineChangeDetectionService.JOBS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const warnings: string[] = [];
    const limitations: string[] = [];

    // 1. Inspect both input rasters
    const baselineMeta = await OfflineChangeDetectionService.inspectRaster(params.baselinePath);
    const observationMeta = await OfflineChangeDetectionService.inspectRaster(params.observationPath);

    const baseSensor = params.baselineSensor || baselineMeta.detectedSensor;
    const obsSensor = params.observationSensor || observationMeta.detectedSensor;

    // 2. Determine pipeline type
    const isSameSensor =
      (baseSensor === 'Sentinel-2' && obsSensor === 'Sentinel-2') ||
      ((baseSensor.startsWith('Landsat') && obsSensor.startsWith('Landsat')));

    const pipeline: OfflinePipelineType = isSameSensor ? 'SAME_SENSOR' : 'CROSS_SENSOR';

    if (!isSameSensor) {
      warnings.push(`Cross-sensor pipeline selected (${baseSensor} vs ${obsSensor}). Bandpass adjustment applied.`);
      limitations.push(
        'Cross-sensor comparisons are subject to differing spectral response functions, spatial resolutions (10m vs 30m), and atmospheric correction models.',
      );
    }

    // 3. Load raster band data
    const baseParsed = await GeoTiffService.readGeoTiff(baselineMeta.originalPath!);
    const obsParsed = await GeoTiffService.readGeoTiff(observationMeta.originalPath!);

    // Extract bands
    const baseRaw = OfflineChangeDetectionService.extractBands(baseParsed, baseSensor, params.baselineBandMapping);
    const obsRaw = OfflineChangeDetectionService.extractBands(obsParsed, obsSensor, params.observationBandMapping);

    // Scale to physical reflectance [0.0, 1.0]
    const baseRefl = {
      blue: OfflineChangeDetectionService.scaleReflectance(baseRaw.blue, baseSensor, baseParsed.metadata.nodata),
      green: OfflineChangeDetectionService.scaleReflectance(baseRaw.green, baseSensor, baseParsed.metadata.nodata),
      red: OfflineChangeDetectionService.scaleReflectance(baseRaw.red, baseSensor, baseParsed.metadata.nodata),
      nir: OfflineChangeDetectionService.scaleReflectance(baseRaw.nir, baseSensor, baseParsed.metadata.nodata),
      swir1: baseRaw.swir1 ? OfflineChangeDetectionService.scaleReflectance(baseRaw.swir1, baseSensor, baseParsed.metadata.nodata) : undefined,
      swir2: baseRaw.swir2 ? OfflineChangeDetectionService.scaleReflectance(baseRaw.swir2, baseSensor, baseParsed.metadata.nodata) : undefined,
    };

    const obsRefl = {
      blue: OfflineChangeDetectionService.scaleReflectance(obsRaw.blue, obsSensor, obsParsed.metadata.nodata),
      green: OfflineChangeDetectionService.scaleReflectance(obsRaw.green, obsSensor, obsParsed.metadata.nodata),
      red: OfflineChangeDetectionService.scaleReflectance(obsRaw.red, obsSensor, obsParsed.metadata.nodata),
      nir: OfflineChangeDetectionService.scaleReflectance(obsRaw.nir, obsSensor, obsParsed.metadata.nodata),
      swir1: obsRaw.swir1 ? OfflineChangeDetectionService.scaleReflectance(obsRaw.swir1, obsSensor, obsParsed.metadata.nodata) : undefined,
      swir2: obsRaw.swir2 ? OfflineChangeDetectionService.scaleReflectance(obsRaw.swir2, obsSensor, obsParsed.metadata.nodata) : undefined,
    };

    // Apply cross-sensor spectral harmonization if needed
    if (!isSameSensor) {
      if (baseSensor.startsWith('Landsat')) {
        OfflineChangeDetectionService.harmonizeCrossSensorBands(baseRefl);
      }
      if (obsSensor.startsWith('Landsat')) {
        OfflineChangeDetectionService.harmonizeCrossSensorBands(obsRefl);
      }
    }

    // 4. Generate independent cloud masks
    const maskClouds = params.maskClouds !== false;
    const baseCloudMask = OfflineChangeDetectionService.generateCloudMask(
      baseRefl.red,
      baseRefl.nir,
      baseRaw.qa,
      baseSensor,
      maskClouds,
    );

    const obsCloudMask = OfflineChangeDetectionService.generateCloudMask(
      obsRefl.red,
      obsRefl.nir,
      obsRaw.qa,
      obsSensor,
      maskClouds,
    );

    // 5. Harmonize / Resample observation to baseline grid
    const targetW = baseParsed.metadata.width;
    const targetH = baseParsed.metadata.height;

    const baseAligned = {
      ...baseRefl,
      validMask: baseCloudMask,
    };

    const obsAligned = OfflineChangeDetectionService.resampleToGrid(
      obsParsed.metadata.width,
      obsParsed.metadata.height,
      targetW,
      targetH,
      {
        ...obsRefl,
        validMask: obsCloudMask,
      },
    );

    const totalPixels = targetW * targetH;

    // Combined valid mask: pixel must be valid in BOTH baseline and observation
    const combinedValidMask = new Uint8Array(totalPixels);
    let validPixelCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (baseAligned.validMask[i] === 1 && obsAligned.validMask[i] === 1) {
        combinedValidMask[i] = 1;
        validPixelCount++;
      } else {
        combinedValidMask[i] = 0;
      }
    }

    const maskedPixelCount = totalPixels - validPixelCount;
    const validPercentage = Number(((validPixelCount / totalPixels) * 100).toFixed(2));
    const maskedPercentage = Number(((maskedPixelCount / totalPixels) * 100).toFixed(2));

    if (validPercentage < 15.0) {
      warnings.push(
        `High cloud cover or invalid overlap detected (${maskedPercentage}% masked). Results may have limited spatial coverage.`,
      );
    }

    // 6. Spectral Indices Calculation
    const baseNdvi = OfflineChangeDetectionService.calculateNdvi(baseAligned.nir, baseAligned.red, combinedValidMask);
    const obsNdvi = OfflineChangeDetectionService.calculateNdvi(obsAligned.nir, obsAligned.red, combinedValidMask);

    const baseBsi = OfflineChangeDetectionService.calculateBsi(
      baseAligned.blue,
      baseAligned.green,
      baseAligned.red,
      baseAligned.nir,
      baseAligned.swir1,
      combinedValidMask,
    );
    const obsBsi = OfflineChangeDetectionService.calculateBsi(
      obsAligned.blue,
      obsAligned.green,
      obsAligned.red,
      obsAligned.nir,
      obsAligned.swir1,
      combinedValidMask,
    );

    const ndviDiff = new Float32Array(totalPixels);
    const bsiDiff = new Float32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      if (combinedValidMask[i] === 1 && !isNaN(baseNdvi[i]) && !isNaN(obsNdvi[i])) {
        ndviDiff[i] = obsNdvi[i] - baseNdvi[i];
      } else {
        ndviDiff[i] = NaN;
      }

      if (combinedValidMask[i] === 1 && !isNaN(baseBsi[i]) && !isNaN(obsBsi[i])) {
        bsiDiff[i] = obsBsi[i] - baseBsi[i];
      } else {
        bsiDiff[i] = NaN;
      }
    }

    // 7. 7-Class Categorical Change Classification
    const vegThreshold = params.vegetationThreshold || 0.15;
    const soilThreshold = params.soilThreshold || 0.12;

    const classification = new Uint8Array(totalPixels);
    const counts = {
      0: 0, // UNCERTAIN_INVALID
      1: 0, // VEGETATION_DECREASE_CANDIDATE
      2: 0, // VEGETATION_INCREASE_CANDIDATE
      3: 0, // BARE_GROUND_INCREASE_CANDIDATE
      4: 0, // BARE_GROUND_DECREASE_CANDIDATE
      5: 0, // OTHER_SPECTRAL_CHANGE
      6: 0, // STABLE
    };

    for (let i = 0; i < totalPixels; i++) {
      if (combinedValidMask[i] === 0 || isNaN(ndviDiff[i])) {
        classification[i] = 0;
        counts[0]++;
        continue;
      }

      const dNdvi = ndviDiff[i];
      const dBsi = isNaN(bsiDiff[i]) ? 0 : bsiDiff[i];

      // Bare-ground expansion candidate: significant positive BSI change reaching bare-soil signature (obsBsi > 0)
      if (dBsi > soilThreshold && (!isNaN(obsBsi[i]) && obsBsi[i] > 0)) {
        classification[i] = 3;
        counts[3]++;
      } else if (dBsi < -soilThreshold) {
        classification[i] = 4;
        counts[4]++;
      } else if (dNdvi < -vegThreshold) {
        // Vegetation decrease candidate: significant NDVI decrease without full bare-ground transition
        classification[i] = 1;
        counts[1]++;
      } else if (dNdvi > vegThreshold) {
        classification[i] = 2;
        counts[2]++;
      } else if (Math.abs(dNdvi) > 0.08 || Math.abs(dBsi) > 0.08) {
        classification[i] = 5;
        counts[5]++;
      } else {
        classification[i] = 6;
        counts[6]++;
      }
    }

    // 8. Ground Area Calculation
    // Use mathematically audited and validated pixelAreaM2 directly from raster metadata
    const pixelAreaM2 = baseParsed.metadata.pixelAreaM2;
    if (!pixelAreaM2 || pixelAreaM2 <= 0 || isNaN(pixelAreaM2)) {
      throw new AppError(
        'Unable to determine valid ground pixel area from raster georeferencing metadata.',
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    const pixelAreaHa = pixelAreaM2 / 10000.0;
    const resolutionMetersX = baseParsed.metadata.resolutionMetersX || Math.sqrt(pixelAreaM2);
    const resolutionMetersY = baseParsed.metadata.resolutionMetersY || Math.sqrt(pixelAreaM2);
    const pixelScaleX = baseParsed.metadata.pixelSize ? baseParsed.metadata.pixelSize[0] : (baseParsed.metadata.pixelScale ? baseParsed.metadata.pixelScale[0] : resolutionMetersX);
    const pixelScaleY = baseParsed.metadata.pixelSize ? baseParsed.metadata.pixelSize[1] : (baseParsed.metadata.pixelScale ? baseParsed.metadata.pixelScale[1] : resolutionMetersY);

    const calcHa = (px: number) => Number((px * pixelAreaHa).toFixed(4));
    const calcSqKm = (ha: number) => Number((ha / 100.0).toFixed(4));

    const totalHa = calcHa(totalPixels);
    const validHa = calcHa(validPixelCount);
    const maskedHa = calcHa(maskedPixelCount);

    const categoryStats: OfflineChangeCategoryStat[] = [
      {
        category: 'VEGETATION_DECREASE_CANDIDATE',
        label: 'Vegetation Decrease Candidate',
        pixelCount: counts[1],
        areaHectares: calcHa(counts[1]),
        areaSqKm: calcSqKm(calcHa(counts[1])),
        percentage: Number(((counts[1] / totalPixels) * 100).toFixed(2)),
        colorHex: '#E63946',
      },
      {
        category: 'VEGETATION_INCREASE_CANDIDATE',
        label: 'Vegetation Increase Candidate',
        pixelCount: counts[2],
        areaHectares: calcHa(counts[2]),
        areaSqKm: calcSqKm(calcHa(counts[2])),
        percentage: Number(((counts[2] / totalPixels) * 100).toFixed(2)),
        colorHex: '#2A9D8F',
      },
      {
        category: 'BARE_GROUND_INCREASE_CANDIDATE',
        label: 'Bare-Ground Expansion Candidate',
        pixelCount: counts[3],
        areaHectares: calcHa(counts[3]),
        areaSqKm: calcSqKm(calcHa(counts[3])),
        percentage: Number(((counts[3] / totalPixels) * 100).toFixed(2)),
        colorHex: '#E76F51',
      },
      {
        category: 'BARE_GROUND_DECREASE_CANDIDATE',
        label: 'Bare-Ground Reduction Candidate',
        pixelCount: counts[4],
        areaHectares: calcHa(counts[4]),
        areaSqKm: calcSqKm(calcHa(counts[4])),
        percentage: Number(((counts[4] / totalPixels) * 100).toFixed(2)),
        colorHex: '#D4A373',
      },
      {
        category: 'OTHER_SPECTRAL_CHANGE',
        label: 'Other Land-Surface Spectral Change',
        pixelCount: counts[5],
        areaHectares: calcHa(counts[5]),
        areaSqKm: calcSqKm(calcHa(counts[5])),
        percentage: Number(((counts[5] / totalPixels) * 100).toFixed(2)),
        colorHex: '#9D4EDD',
      },
      {
        category: 'STABLE',
        label: 'Stable Land Cover',
        pixelCount: counts[6],
        areaHectares: calcHa(counts[6]),
        areaSqKm: calcSqKm(calcHa(counts[6])),
        percentage: Number(((counts[6] / totalPixels) * 100).toFixed(2)),
        colorHex: '#1E293B',
      },
      {
        category: 'UNCERTAIN_INVALID',
        label: 'Uncertain / Cloud-Masked / Invalid',
        pixelCount: counts[0],
        areaHectares: calcHa(counts[0]),
        areaSqKm: calcSqKm(calcHa(counts[0])),
        percentage: Number(((counts[0] / totalPixels) * 100).toFixed(2)),
        colorHex: '#64748B',
      },
    ];

    const areaSummary: OfflineAreaSummary = {
      totalFootprintHectares: totalHa,
      validAnalyzedHectares: validHa,
      maskedHectares: maskedHa,
      validPercentage,
      maskedPercentage,
      categories: categoryStats,
    };

    // 9. Generate and save Artifacts
    const tiePoint: [number, number, number, number, number, number] = baseParsed.metadata.tiePoint || [
      0,
      0,
      0,
      baseParsed.metadata.bbox[0],
      baseParsed.metadata.bbox[3],
      0,
    ];
    const pixelScale: [number, number, number] = baseParsed.metadata.pixelScale || [pixelScaleX, pixelScaleY, 0];

    // PNG visual maps
    const basePng = OfflineChangeDetectionService.encodeRgbPng(
      baseAligned.red,
      baseAligned.green,
      baseAligned.blue,
      baseAligned.validMask,
      targetW,
      targetH,
    );
    const obsPng = OfflineChangeDetectionService.encodeRgbPng(
      obsAligned.red,
      obsAligned.green,
      obsAligned.blue,
      obsAligned.validMask,
      targetW,
      targetH,
    );
    const cloudPng = OfflineChangeDetectionService.encodeCloudMaskPng(combinedValidMask, targetW, targetH);
    const changeMapPng = OfflineChangeDetectionService.encodeChangeMapPng(classification, targetW, targetH);

    const basePngPath = path.join(jobDir, 'baseline_preprocessed.png');
    const obsPngPath = path.join(jobDir, 'observation_preprocessed.png');
    const cloudPngPath = path.join(jobDir, 'cloud_mask.png');
    const changeMapPngPath = path.join(jobDir, 'change_map.png');

    fs.writeFileSync(basePngPath, basePng);
    fs.writeFileSync(obsPngPath, obsPng);
    fs.writeFileSync(cloudPngPath, cloudPng);
    fs.writeFileSync(changeMapPngPath, changeMapPng);

    // Export GeoTIFFs
    const changeTiffBuf = await OfflineChangeDetectionService.writeSingleBandGeoTiff(
      classification,
      targetW,
      targetH,
      baselineMeta.crs,
      pixelScale,
      tiePoint,
      '0',
    );
    const cloudTiffBuf = await OfflineChangeDetectionService.writeSingleBandGeoTiff(
      combinedValidMask,
      targetW,
      targetH,
      baselineMeta.crs,
      pixelScale,
      tiePoint,
      '0',
    );
    const ndviTiffBuf = await OfflineChangeDetectionService.writeSingleBandGeoTiff(
      ndviDiff,
      targetW,
      targetH,
      baselineMeta.crs,
      pixelScale,
      tiePoint,
      '-9999',
    );
    const bsiTiffBuf = await OfflineChangeDetectionService.writeSingleBandGeoTiff(
      bsiDiff,
      targetW,
      targetH,
      baselineMeta.crs,
      pixelScale,
      tiePoint,
      '-9999',
    );

    const changeTiffPath = path.join(jobDir, 'change_classification.tif');
    const cloudTiffPath = path.join(jobDir, 'cloud_mask.tif');
    const ndviTiffPath = path.join(jobDir, 'ndvi_difference.tif');
    const bsiTiffPath = path.join(jobDir, 'bsi_difference.tif');

    fs.writeFileSync(changeTiffPath, changeTiffBuf);
    fs.writeFileSync(cloudTiffPath, cloudTiffBuf);
    fs.writeFileSync(ndviTiffPath, ndviTiffBuf);
    fs.writeFileSync(bsiTiffPath, bsiTiffBuf);

    // Copy original baseline and observation files into job directory
    const baseExportPath = path.join(jobDir, 'baseline_input.tif');
    const obsExportPath = path.join(jobDir, 'observation_input.tif');
    try {
      fs.copyFileSync(baselineMeta.originalPath!, baseExportPath);
      fs.copyFileSync(observationMeta.originalPath!, obsExportPath);
    } catch {
      // If copy fails, reference original
    }

    // CSV Area Summary
    let csvContent = 'Category Code,Category Name,Pixel Count,Area (ha),Area (sq km),Percentage (%)\n';
    categoryStats.forEach((c, idx) => {
      csvContent += `${idx},"${c.label}",${c.pixelCount},${c.areaHectares},${c.areaSqKm},${c.percentage}%\n`;
    });
    const csvPath = path.join(jobDir, 'area_summary.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    // Validation & Limitations Markdown Report
    const reportMd = `# Offline Satellite Image Change Detection Validation Report

**Job ID:** \`${jobId}\`  
**Execution Timestamp:** ${new Date().toISOString()}  
**Pipeline Selected:** \`${pipeline}\`  

---

## 1. Input Image Specifications

| Attribute | Baseline ($T_0$) | Observation ($T_1$) |
| :--- | :--- | :--- |
| **Filename** | \`${baselineMeta.filename}\` | \`${observationMeta.filename}\` |
| **Sensor Platform** | ${baseSensor} | ${obsSensor} |
| **Acquisition Date** | ${params.baselineDate || baselineMeta.acquisitionDate || 'Unspecified'} | ${params.observationDate || observationMeta.acquisitionDate || 'Unspecified'} |
| **Spatial Dimensions** | ${baselineMeta.width} × ${baselineMeta.height} px | ${observationMeta.width} × ${observationMeta.height} px |
| **Spectral Bands** | ${baselineMeta.numBands} bands | ${observationMeta.numBands} bands |
| **CRS** | \`${baselineMeta.crs}\` | \`${observationMeta.crs}\` |
| **Pixel Resolution** | ${pixelScaleX.toFixed(2)}m × ${pixelScaleY.toFixed(2)}m | ${observationMeta.pixelSizeX.toFixed(2)}m × ${observationMeta.pixelSizeY.toFixed(2)}m |

---

## 2. Harmonization & Cloud Masking Summary

- **Common Analysis Grid:** ${targetW} × ${targetH} pixels (${totalHa.toFixed(2)} ha footprint)
- **Valid Clear Observation Area:** ${validHa.toFixed(2)} ha (${validPercentage}%)
- **Masked / Cloud / Invalid Area:** ${maskedHa.toFixed(2)} ha (${maskedPercentage}%)
- **Vegetation Change Threshold:** $\\Delta NDVI = \\pm${vegThreshold}$
- **Bare-Soil Change Threshold:** $\\Delta BSI = \\pm${soilThreshold}$

---

## 3. Quantitative Change Detection Summary

| Category | Pixels | Area (ha) | Area ($km^2$) | Coverage (%) |
| :--- | :--- | :--- | :--- | :--- |
${categoryStats.map((c) => `| **${c.label}** | ${c.pixelCount.toLocaleString()} | ${c.areaHectares.toFixed(2)} | ${c.areaSqKm.toFixed(4)} | ${c.percentage}% |`).join('\n')}

---

## 4. Scientific Framing & Limitations

1. **Candidate Characterization:** Detected vegetation and bare-soil changes represent *spectral response differences*. They do not constitute conclusive legal proof of deforestation or illicit mining without independent field verification.
2. **Atmospheric & Phenological Variations:** Seasonal changes in moisture, sun angle, and agricultural cycles can induce spectral delta independent of physical ground disturbance.
3. **Cross-Sensor Uncertainty:** ${isSameSensor ? 'Same-sensor comparison: Radiometric scales and spectral response functions are directly compatible.' : 'Cross-sensor comparison: Roy et al. / HLS bandpass adjustment was applied. Residual differences up to ±0.03 surface reflectance may persist.'}
`;
    const reportPath = path.join(jobDir, 'validation_report.md');
    fs.writeFileSync(reportPath, reportMd, 'utf-8');

    // Metadata JSON
    const artifacts: OfflineChangeDetectionArtifacts = {
      baselineGeoTiff: `/api/offline-change-detection/jobs/${jobId}/artifacts/baseline_input.tif`,
      observationGeoTiff: `/api/offline-change-detection/jobs/${jobId}/artifacts/observation_input.tif`,
      changeMapGeoTiff: `/api/offline-change-detection/jobs/${jobId}/artifacts/change_classification.tif`,
      cloudMaskGeoTiff: `/api/offline-change-detection/jobs/${jobId}/artifacts/cloud_mask.tif`,
      ndviDiffGeoTiff: `/api/offline-change-detection/jobs/${jobId}/artifacts/ndvi_difference.tif`,
      bsiDiffGeoTiff: `/api/offline-change-detection/jobs/${jobId}/artifacts/bsi_difference.tif`,
      metadataJson: `/api/offline-change-detection/jobs/${jobId}/artifacts/change_metadata.json`,
      areaSummaryCsv: `/api/offline-change-detection/jobs/${jobId}/artifacts/area_summary.csv`,
      validationReportMd: `/api/offline-change-detection/jobs/${jobId}/artifacts/validation_report.md`,
      changeMapPng: `/api/offline-change-detection/jobs/${jobId}/artifacts/change_map.png`,
      baselinePng: `/api/offline-change-detection/jobs/${jobId}/artifacts/baseline_preprocessed.png`,
      observationPng: `/api/offline-change-detection/jobs/${jobId}/artifacts/observation_preprocessed.png`,
      cloudMaskPng: `/api/offline-change-detection/jobs/${jobId}/artifacts/cloud_mask.png`,
    };

    const result: OfflineChangeDetectionResult = {
      jobId,
      status: 'SUCCESS',
      executedAt: new Date().toISOString(),
      pipeline,
      baselineMetadata: baselineMeta,
      observationMetadata: observationMeta,
      commonGrid: {
        width: targetW,
        height: targetH,
        crs: baselineMeta.crs,
        resolutionMeters: resolutionMetersX,
        bbox: baselineMeta.bbox,
      },
      areaSummary,
      baselinePreviewUrl: artifacts.baselinePng,
      observationPreviewUrl: artifacts.observationPng,
      baselineMaskedPreviewUrl: artifacts.baselinePng,
      observationMaskedPreviewUrl: artifacts.observationPng,
      changeMapPreviewUrl: artifacts.changeMapPng,
      cloudMaskPreviewUrl: artifacts.cloudMaskPng,
      artifacts,
      warnings,
      limitations,
    };

    const metadataJsonPath = path.join(jobDir, 'change_metadata.json');
    fs.writeFileSync(metadataJsonPath, JSON.stringify(result, null, 2), 'utf-8');

    return result;
  }
}
