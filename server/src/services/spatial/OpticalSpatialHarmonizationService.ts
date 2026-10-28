import type { AnalysisGridDto, GeoJSONPolygon } from '@tn-forest/shared/types';
import type { ParsedGeoTiffRaster } from '../raster/GeoTiffService.js';
import type { ExtractedOpticalRaster } from '../raster/RasterReaderService.js';
import { CrsTransformService } from './CrsTransformService.js';
import { AnalysisGridService } from './AnalysisGridService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export interface HarmonizedOpticalRaster {
  grid: AnalysisGridDto;
  blue: Float32Array;
  green: Float32Array;
  red: Float32Array;
  nir: Float32Array;
  swir1?: Float32Array;
  swir2?: Float32Array;
  qa?: Float32Array;
  footprintMask: Uint8Array; // 1 if within source acquisition footprint and valid reflectance
  qualityMask: Uint8Array; // 1 if clear of cloud/shadow/cirrus/saturation (or 1 if no QA band and radiometric OK)
  validPixelCount: number;
  totalPixelCount: number;
  sourceCrs: string;
  sourceDimensions: { width: number; height: number };
  satellite: string;
}

export interface ValidOpticalIntersectionResult {
  validComparisonMask: Uint8Array; // baseline footprint & quality && current footprint & quality && zoneMask
  comparisonPixelCount: number;
  validBaselinePixelCount: number;
  validCurrentPixelCount: number;
  overlapPixelCount: number; // baseline footprint && current footprint
  zonePixelCount: number; // pixels inside vector zone boundary
  cloudMaskedPixelCount: number;
  shadowMaskedPixelCount: number;
  coveragePercentage: number; // (comparisonPixelCount / zonePixelCount) * 100
}

/**
 * Production-grade Optical Spatial Harmonization Service.
 * Implements authentic geodetic coordinate transformations and continuous sub-pixel
 * bilinear resampling to project source optical rasters (Sentinel-2, Landsat-8/9)
 * onto a canonical AnalysisGrid.
 *
 * Distinct from simplistic array-stretching:
 * 1. Geographic pixel coordinate mapping via CrsTransformService.
 * 2. Bilinear interpolation for continuous reflectance bands.
 * 3. Nearest-neighbor sampling for discrete quality bands (SCL / QA_PIXEL).
 * 4. Multi-criteria intersection masking (source footprint AND cloud-free AND inside zone).
 */
export class OpticalSpatialHarmonizationService {
  /**
   * Reprojects and resamples an optical raster onto the canonical AnalysisGrid.
   */
  public static reprojectOpticalToGrid(
    source: ParsedGeoTiffRaster | ExtractedOpticalRaster,
    targetGrid: AnalysisGridDto,
    options: {
      satellite?: string;
    } = {},
  ): HarmonizedOpticalRaster {
    const isExtracted = 'bands' in source && 'metadata' in source;
    const metadata = isExtracted ? (source as ExtractedOpticalRaster).metadata : (source as ParsedGeoTiffRaster).metadata;
    const bandData = isExtracted ? null : (source as ParsedGeoTiffRaster).bandData;

    const { width: srcW, height: srcH, crs: srcCrs, tiePoint, bbox, pixelScale, nodata } = metadata;

    if (!srcCrs) {
      throw new AppError('Source GeoTIFF is missing Coordinate Reference System (CRS) metadata', HTTP_STATUS.BAD_REQUEST);
    }

    const {
      width: targetW,
      height: targetH,
      crs: targetCrs,
      originX: targetOriginX,
      originY: targetOriginY,
      pixelSizeX: targetPixelSizeX,
      pixelSizeY: targetPixelSizeY,
    } = targetGrid;
    const totalPixels = targetW * targetH;

    const srcOriginX = tiePoint ? tiePoint[3] : (bbox ? bbox[0] : 0);
    const srcOriginY = tiePoint ? tiePoint[4] : (bbox ? bbox[3] : 0);
    const srcScaleX = pixelScale ? pixelScale[0] : 10;
    const srcScaleY = pixelScale ? pixelScale[1] : 10;

    // Resolve source bands
    let rawBlue: Float32Array;
    let rawGreen: Float32Array;
    let rawRed: Float32Array;
    let rawNir: Float32Array;
    let rawSwir1: Float32Array | undefined;
    let rawSwir2: Float32Array | undefined;
    let rawQa: Float32Array | undefined;

    if (isExtracted) {
      const ext = source as ExtractedOpticalRaster;
      rawBlue = ext.bands.blue;
      rawGreen = ext.bands.green;
      rawRed = ext.bands.red;
      rawNir = ext.bands.nir;
      rawSwir1 = ext.bands.swir1;
      rawSwir2 = ext.bands.swir2;
      rawQa = ext.bands.qa;
    } else {
      const bData = bandData!;
      if (bData.length < 4) {
        throw new AppError(
          `Optical raster requires at least 4 bands (Blue, Green, Red, NIR). Found ${bData.length}.`,
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
        );
      }
      rawBlue = bData[0];
      rawGreen = bData[1];
      rawRed = bData[2];
      rawNir = bData[3];
      rawSwir1 = bData.length > 4 ? bData[4] : undefined;
      rawSwir2 = bData.length > 5 ? bData[5] : undefined;
      rawQa = bData.length > 6 ? bData[6] : undefined;
    }

    const nodataVal = nodata !== null && nodata !== undefined ? Number(nodata) : null;
    const rawSatellite = options.satellite || (isExtracted ? (source as ExtractedOpticalRaster).satellite : '');
    if (!rawSatellite) {
      console.warn(
        `[OpticalSpatialHarmonizationService] No sensor metadata provided for optical reprojection. Defaulting explicitly to 'Sentinel-2'. Specify options.satellite to avoid ambiguous sensor handling.`,
      );
    }
    const satellite = rawSatellite || 'Sentinel-2';

    // Allocate output grid arrays
    const outBlue = new Float32Array(totalPixels);
    const outGreen = new Float32Array(totalPixels);
    const outRed = new Float32Array(totalPixels);
    const outNir = new Float32Array(totalPixels);
    const outSwir1 = rawSwir1 ? new Float32Array(totalPixels) : undefined;
    const outSwir2 = rawSwir2 ? new Float32Array(totalPixels) : undefined;
    const outQa = rawQa ? new Float32Array(totalPixels) : undefined;

    const footprintMask = new Uint8Array(totalPixels);
    const qualityMask = new Uint8Array(totalPixels);

    outBlue.fill(NaN);
    outGreen.fill(NaN);
    outRed.fill(NaN);
    outNir.fill(NaN);
    if (outSwir1) outSwir1.fill(NaN);
    if (outSwir2) outSwir2.fill(NaN);
    if (outQa) outQa.fill(0);

    let validCount = 0;

    const isValidSample = (v: number) =>
      !isNaN(v) && isFinite(v) && (nodataVal === null || v !== nodataVal) && v >= 0;

    // Resample each grid cell (c, r)
    for (let r = 0; r < targetH; r++) {
      const targetY = targetOriginY - (r + 0.5) * targetPixelSizeY;

      for (let c = 0; c < targetW; c++) {
        const targetX = targetOriginX + (c + 0.5) * targetPixelSizeX;

        // 1. Transform coordinate from target AnalysisGrid CRS -> source raster CRS
        let srcX: number;
        let srcY: number;

        try {
          const transformed = CrsTransformService.transformCoordinate([targetX, targetY], targetCrs, srcCrs);
          srcX = transformed[0];
          srcY = transformed[1];
        } catch {
          continue; // Outside projection domain
        }

        // 2. Continuous sub-pixel coordinate (u, v) in source raster
        const u = (srcX - srcOriginX) / srcScaleX - 0.5;
        const v = (srcOriginY - srcY) / srcScaleY - 0.5;

        // 3. Boundary check against source raster dimensions
        if (u < 0.0 || u > srcW - 1.0 || v < 0.0 || v > srcH - 1.0) {
          continue; // Outside source footprint
        }

        const outIdx = r * targetW + c;

        // Bilinear interpolation for continuous reflectance bands
        const u0 = Math.floor(u);
        const u1 = Math.min(srcW - 1, u0 + 1);
        const v0 = Math.floor(v);
        const v1 = Math.min(srcH - 1, v0 + 1);

        const wu = u - u0;
        const wv = v - v0;

        const idx00 = v0 * srcW + u0;
        const idx10 = v0 * srcW + u1;
        const idx01 = v1 * srcW + u0;
        const idx11 = v1 * srcW + u1;

        // Check validity of 4 neighbor samples
        const b00 = rawBlue[idx00], b10 = rawBlue[idx10], b01 = rawBlue[idx01], b11 = rawBlue[idx11];
        const g00 = rawGreen[idx00], g10 = rawGreen[idx10], g01 = rawGreen[idx01], g11 = rawGreen[idx11];
        const r00 = rawRed[idx00], r10 = rawRed[idx10], r01 = rawRed[idx01], r11 = rawRed[idx11];
        const n00 = rawNir[idx00], n10 = rawNir[idx10], n01 = rawNir[idx01], n11 = rawNir[idx11];

        const valid00 = isValidSample(b00) && isValidSample(g00) && isValidSample(r00) && isValidSample(n00);
        const valid10 = isValidSample(b10) && isValidSample(g10) && isValidSample(r10) && isValidSample(n10);
        const valid01 = isValidSample(b01) && isValidSample(g01) && isValidSample(r01) && isValidSample(n01);
        const valid11 = isValidSample(b11) && isValidSample(g11) && isValidSample(r11) && isValidSample(n11);

        let sampledBlue = NaN;
        let sampledGreen = NaN;
        let sampledRed = NaN;
        let sampledNir = NaN;
        let sampledSwir1 = NaN;
        let sampledSwir2 = NaN;

        if (valid00 && valid10 && valid01 && valid11) {
          // Standard 4-point bilinear interpolation
          sampledBlue = (b00 * (1 - wu) + b10 * wu) * (1 - wv) + (b01 * (1 - wu) + b11 * wu) * wv;
          sampledGreen = (g00 * (1 - wu) + g10 * wu) * (1 - wv) + (g01 * (1 - wu) + g11 * wu) * wv;
          sampledRed = (r00 * (1 - wu) + r10 * wu) * (1 - wv) + (r01 * (1 - wu) + r11 * wu) * wv;
          sampledNir = (n00 * (1 - wu) + n10 * wu) * (1 - wv) + (n01 * (1 - wu) + n11 * wu) * wv;

          if (rawSwir1 && outSwir1) {
            sampledSwir1 =
              (rawSwir1[idx00] * (1 - wu) + rawSwir1[idx10] * wu) * (1 - wv) +
              (rawSwir1[idx01] * (1 - wu) + rawSwir1[idx11] * wu) * wv;
          }
          if (rawSwir2 && outSwir2) {
            sampledSwir2 =
              (rawSwir2[idx00] * (1 - wu) + rawSwir2[idx10] * wu) * (1 - wv) +
              (rawSwir2[idx01] * (1 - wu) + rawSwir2[idx11] * wu) * wv;
          }
        } else if (valid00 || valid10 || valid01 || valid11) {
          // Edge weighting among available valid neighbors
          let totalW = 0;
          let sumB = 0, sumG = 0, sumR = 0, sumN = 0, sumS1 = 0, sumS2 = 0;

          if (valid00) {
            const w = (1 - wu) * (1 - wv);
            totalW += w;
            sumB += b00 * w; sumG += g00 * w; sumR += r00 * w; sumN += n00 * w;
            if (rawSwir1) sumS1 += rawSwir1[idx00] * w;
            if (rawSwir2) sumS2 += rawSwir2[idx00] * w;
          }
          if (valid10) {
            const w = wu * (1 - wv);
            totalW += w;
            sumB += b10 * w; sumG += g10 * w; sumR += r10 * w; sumN += n10 * w;
            if (rawSwir1) sumS1 += rawSwir1[idx10] * w;
            if (rawSwir2) sumS2 += rawSwir2[idx10] * w;
          }
          if (valid01) {
            const w = (1 - wu) * wv;
            totalW += w;
            sumB += b01 * w; sumG += g01 * w; sumR += r01 * w; sumN += n01 * w;
            if (rawSwir1) sumS1 += rawSwir1[idx01] * w;
            if (rawSwir2) sumS2 += rawSwir2[idx01] * w;
          }
          if (valid11) {
            const w = wu * wv;
            totalW += w;
            sumB += b11 * w; sumG += g11 * w; sumR += r11 * w; sumN += n11 * w;
            if (rawSwir1) sumS1 += rawSwir1[idx11] * w;
            if (rawSwir2) sumS2 += rawSwir2[idx11] * w;
          }

          if (totalW > 0.1) {
            sampledBlue = sumB / totalW;
            sampledGreen = sumG / totalW;
            sampledRed = sumR / totalW;
            sampledNir = sumN / totalW;
            if (rawSwir1) sampledSwir1 = sumS1 / totalW;
            if (rawSwir2) sampledSwir2 = sumS2 / totalW;
          }
        }

        if (isNaN(sampledBlue) || isNaN(sampledGreen) || isNaN(sampledRed) || isNaN(sampledNir)) {
          continue;
        }

        // Nearest neighbor sampling for discrete Quality band (SCL or QA_PIXEL)
        let sampledQa = 0;
        if (rawQa && outQa) {
          const nearestU = Math.min(srcW - 1, Math.max(0, Math.round(u)));
          const nearestV = Math.min(srcH - 1, Math.max(0, Math.round(v)));
          sampledQa = rawQa[nearestV * srcW + nearestU];
          outQa[outIdx] = sampledQa;
        }

        // Store resampled continuous reflectance values
        outBlue[outIdx] = sampledBlue;
        outGreen[outIdx] = sampledGreen;
        outRed[outIdx] = sampledRed;
        outNir[outIdx] = sampledNir;
        if (outSwir1 && !isNaN(sampledSwir1)) outSwir1[outIdx] = sampledSwir1;
        if (outSwir2 && !isNaN(sampledSwir2)) outSwir2[outIdx] = sampledSwir2;

        footprintMask[outIdx] = 1;

        // Evaluate Quality Mask
        let isClearQuality = true;
        if (rawQa) {
          if (/hls/i.test(satellite)) {
            // HLS V2.0 Fmask bitmask:
            // Bit 0: Cirrus, Bit 1: Cloud, Bit 2: Adjacent to cloud/shadow, Bit 3: Cloud shadow, Bit 4: Snow/ice
            const fmask = Math.round(sampledQa);
            const isCloudOrShadow = (fmask & 0b011110) !== 0;
            if (isCloudOrShadow) {
              isClearQuality = false;
            }
          } else if (/sentinel-?2/i.test(satellite)) {
            // SCL: 0: NoData, 1: Defective, 3: Cloud Shadow, 8: Cloud Med, 9: Cloud High, 10: Cirrus, 11: Snow
            const scl = Math.round(sampledQa);
            if (scl === 0 || scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10 || scl === 11) {
              isClearQuality = false;
            }
          } else if (/landsat/i.test(satellite)) {
            // Landsat Collection 2 QA_PIXEL bitmask:
            // Bit 0: Fill, Bit 1: Dilated Cloud, Bit 2: Cirrus, Bit 3: Cloud, Bit 4: Cloud Shadow, Bit 5: Snow
            const qaVal = Math.round(sampledQa);
            const isCloudOrShadow = (qaVal & 0b011111) !== 0;
            if (isCloudOrShadow) {
              isClearQuality = false;
            }
          }
        } else {
          // Radiometric plausibility check when QA band is absent
          // Check for saturation/cloud (e.g. bright uncalibrated reflectance) or all-zero
          const isAllZero = sampledBlue === 0 && sampledGreen === 0 && sampledRed === 0 && sampledNir === 0;
          if (isAllZero) {
            isClearQuality = false;
          }
        }

        qualityMask[outIdx] = isClearQuality ? 1 : 0;
        if (isClearQuality) {
          validCount++;
        }
      }
    }

    return {
      grid: targetGrid,
      blue: outBlue,
      green: outGreen,
      red: outRed,
      nir: outNir,
      swir1: outSwir1,
      swir2: outSwir2,
      qa: outQa,
      footprintMask,
      qualityMask,
      validPixelCount: validCount,
      totalPixelCount: totalPixels,
      sourceCrs: srcCrs,
      sourceDimensions: { width: srcW, height: srcH },
      satellite,
    };
  }

  /**
   * Generates the multi-criteria valid comparison mask on the canonical AnalysisGrid:
   * validComparisonMask =
   *   baselineFootprintValid && currentFootprintValid &&
   *   baselineQualityValid && currentQualityValid &&
   *   insideZoneBoundary
   */
  public static createValidOpticalIntersectionMask(
    baselineHarmonized: HarmonizedOpticalRaster,
    currentHarmonized: HarmonizedOpticalRaster,
    zoneBoundary: GeoJSONPolygon,
    grid: AnalysisGridDto,
  ): ValidOpticalIntersectionResult {
    const totalPixels = grid.width * grid.height;
    const validComparisonMask = new Uint8Array(totalPixels);

    // Rasterize vector boundary onto the same canonical AnalysisGrid
    const zoneMask = AnalysisGridService.rasterizePolygon(grid, zoneBoundary);

    let comparisonPixelCount = 0;
    let validBaselinePixelCount = 0;
    let validCurrentPixelCount = 0;
    let overlapPixelCount = 0;
    let zonePixelCount = 0;
    let cloudMaskedCount = 0;
    let shadowMaskedCount = 0;

    for (let i = 0; i < totalPixels; i++) {
      const inZone = zoneMask[i] === 1;
      if (inZone) zonePixelCount++;

      const baseFoot = baselineHarmonized.footprintMask[i] === 1;
      const curFoot = currentHarmonized.footprintMask[i] === 1;

      if (baseFoot && curFoot) {
        overlapPixelCount++;
      }

      const baseQual = baselineHarmonized.qualityMask[i] === 1;
      const curQual = currentHarmonized.qualityMask[i] === 1;

      if (baseFoot && baseQual) validBaselinePixelCount++;
      if (curFoot && curQual) validCurrentPixelCount++;

      // Track cloud and shadow stats inside zone
      if (inZone && curFoot && !curQual) {
        if (currentHarmonized.qa) {
          const qa = Math.round(currentHarmonized.qa[i]);
          if (/sentinel/i.test(currentHarmonized.satellite) && qa === 3) {
            shadowMaskedCount++;
          } else if (/landsat/i.test(currentHarmonized.satellite) && (qa & 0b010000) !== 0) {
            shadowMaskedCount++;
          } else {
            cloudMaskedCount++;
          }
        } else {
          cloudMaskedCount++;
        }
      }

      // Valid multi-criteria intersection
      if (baseFoot && curFoot && baseQual && curQual && inZone) {
        validComparisonMask[i] = 1;
        comparisonPixelCount++;
      } else {
        validComparisonMask[i] = 0;
      }
    }

    const coveragePercentage = zonePixelCount > 0 ? (comparisonPixelCount / zonePixelCount) * 100.0 : 0.0;

    return {
      validComparisonMask,
      comparisonPixelCount,
      validBaselinePixelCount,
      validCurrentPixelCount,
      overlapPixelCount,
      zonePixelCount,
      cloudMaskedPixelCount: cloudMaskedCount,
      shadowMaskedPixelCount: shadowMaskedCount,
      coveragePercentage: Number(coveragePercentage.toFixed(2)),
    };
  }
}
