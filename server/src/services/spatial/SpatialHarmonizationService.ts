import type { AnalysisGridDto, GeoJSONPolygon } from '@tn-forest/shared/types';
import type { ParsedGeoTiffRaster } from '../raster/GeoTiffService.js';
import { CrsTransformService } from './CrsTransformService.js';
import { AnalysisGridService } from './AnalysisGridService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export interface HarmonizedSarRaster {
  grid: AnalysisGridDto;
  vv: Float32Array;
  vh: Float32Array;
  validMask: Uint8Array; // 1 if within source scene footprint and has valid backscatter; 0 if NoData/out-of-bounds
  validPixelCount: number;
  totalPixelCount: number;
  sourceCrs: string;
  sourceDimensions: { width: number; height: number };
  resamplingMethod: 'bilinear' | 'nearest';
}

export interface ValidDataIntersectionResult {
  validComparisonMask: Uint8Array; // 1 where baseline is valid AND current is valid AND inside zone
  comparisonPixelCount: number;
  validBaselinePixelCount: number;
  validCurrentPixelCount: number;
  overlapPixelCount: number; // baseline valid AND current valid (regardless of zone boundary)
  zonePixelCount: number; // pixels inside zone boundary
  coveragePercentage: number; // (comparisonPixelCount / zonePixelCount) * 100
}

/**
 * Production-grade Geospatial Raster Harmonization Service.
 * Implements true geographic coordinate transformations and sub-pixel continuous resampling
 * to project diverse source satellite rasters (e.g. Sentinel-1 in different UTM zones)
 * onto an identical canonical AnalysisGrid.
 */
export class SpatialHarmonizationService {
  /**
   * Reprojects and resamples a parsed Sentinel-1 SAR GeoTIFF onto the canonical AnalysisGrid.
   * Uses continuous Bilinear Interpolation for backscatter radar bands (VV, VH).
   * Accurately tracks valid satellite footprint vs out-of-bounds / NoData pixels.
   */
  public static reprojectSarToGrid(
    parsed: ParsedGeoTiffRaster,
    targetGrid: AnalysisGridDto,
    options: {
      resampling?: 'bilinear' | 'nearest';
    } = {},
  ): HarmonizedSarRaster {
    const { metadata, bandData } = parsed;
    const { width: srcW, height: srcH, crs: srcCrs, tiePoint, bbox, pixelScale, nodata } = metadata;

    if (!srcCrs) {
      throw new AppError('Source GeoTIFF is missing Coordinate Reference System (CRS) metadata', HTTP_STATUS.BAD_REQUEST);
    }
    if (bandData.length === 0) {
      throw new AppError('Source GeoTIFF contains no raster band data', HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    const resampling = options.resampling || 'bilinear';
    const { width: targetW, height: targetH, crs: targetCrs, originX: targetOriginX, originY: targetOriginY, pixelSizeX: targetPixelSizeX, pixelSizeY: targetPixelSizeY } = targetGrid;
    const totalPixels = targetW * targetH;

    // Source GeoTIFF geotransform origin and scale
    const srcOriginX = tiePoint ? tiePoint[3] : (bbox ? bbox[0] : 0);
    const srcOriginY = tiePoint ? tiePoint[4] : (bbox ? bbox[3] : 0);
    const srcScaleX = pixelScale ? pixelScale[0] : 10;
    const srcScaleY = pixelScale ? pixelScale[1] : 10;

    const rawVv = bandData[0];
    const rawVh = bandData.length >= 2 ? bandData[1] : bandData[0];
    const nodataVal = nodata !== null && nodata !== undefined ? Number(nodata) : null;

    const outVv = new Float32Array(totalPixels);
    const outVh = new Float32Array(totalPixels);
    const validMask = new Uint8Array(totalPixels);

    // Fill with NaN by default
    outVv.fill(NaN);
    outVh.fill(NaN);

    let validCount = 0;

    // Iterate through every cell (c, r) of the canonical AnalysisGrid
    for (let r = 0; r < targetH; r++) {
      // Cell center Y in target CRS
      const targetY = targetOriginY - (r + 0.5) * targetPixelSizeY;

      for (let c = 0; c < targetW; c++) {
        // Cell center X in target CRS
        const targetX = targetOriginX + (c + 0.5) * targetPixelSizeX;

        // 1. Transform coordinate from target CRS -> source raster CRS
        let srcX: number;
        let srcY: number;

        try {
          const transformed = CrsTransformService.transformCoordinate([targetX, targetY], targetCrs, srcCrs);
          srcX = transformed[0];
          srcY = transformed[1];
        } catch {
          continue; // Coordinate transformation outside valid projection domain
        }

        // 2. Map continuous geographic coordinate (srcX, srcY) to source continuous pixel indices (u, v)
        // Note: cell centers are offset by 0.5 from top-left tiepoint
        const u = (srcX - srcOriginX) / srcScaleX - 0.5;
        const v = (srcOriginY - srcY) / srcScaleY - 0.5;

        // 3. Boundary check against source raster dimensions
        if (u < 0.0 || u > srcW - 1.0 || v < 0.0 || v > srcH - 1.0) {
          continue; // Outside source satellite acquisition footprint
        }

        const outIdx = r * targetW + c;

        if (resampling === 'nearest') {
          const nearestU = Math.min(srcW - 1, Math.max(0, Math.round(u)));
          const nearestV = Math.min(srcH - 1, Math.max(0, Math.round(v)));
          const srcIdx = nearestV * srcW + nearestU;

          const valVv = rawVv[srcIdx];
          const valVh = rawVh[srcIdx];

          if (
            !isNaN(valVv) &&
            isFinite(valVv) &&
            (nodataVal === null || valVv !== nodataVal) &&
            !isNaN(valVh) &&
            isFinite(valVh) &&
            (nodataVal === null || valVh !== nodataVal)
          ) {
            outVv[outIdx] = valVv;
            outVh[outIdx] = valVh;
            validMask[outIdx] = 1;
            validCount++;
          }
        } else {
          // Bilinear Interpolation
          const u0 = Math.floor(u);
          const u1 = Math.min(srcW - 1, u0 + 1);
          const v0 = Math.floor(v);
          const v1 = Math.min(srcH - 1, v0 + 1);

          const wu = u - u0;
          const wv = v - v0;

          // Source indices of 4 nearest surrounding neighbor pixels
          const idx00 = v0 * srcW + u0;
          const idx10 = v0 * srcW + u1;
          const idx01 = v1 * srcW + u0;
          const idx11 = v1 * srcW + u1;

          const vv00 = rawVv[idx00];
          const vv10 = rawVv[idx10];
          const vv01 = rawVv[idx01];
          const vv11 = rawVv[idx11];

          const vh00 = rawVh[idx00];
          const vh10 = rawVh[idx10];
          const vh01 = rawVh[idx01];
          const vh11 = rawVh[idx11];

          // Check validity of 4 neighbor samples
          const isValidSample = (val: number) =>
            !isNaN(val) && isFinite(val) && (nodataVal === null || val !== nodataVal);

          const v00Valid = isValidSample(vv00) && isValidSample(vh00);
          const v10Valid = isValidSample(vv10) && isValidSample(vh10);
          const v01Valid = isValidSample(vv01) && isValidSample(vh01);
          const v11Valid = isValidSample(vv11) && isValidSample(vh11);

          if (v00Valid && v10Valid && v01Valid && v11Valid) {
            // Full 4-point bilinear interpolation
            const topVv = vv00 * (1.0 - wu) + vv10 * wu;
            const btmVv = vv01 * (1.0 - wu) + vv11 * wu;
            outVv[outIdx] = topVv * (1.0 - wv) + btmVv * wv;

            const topVh = vh00 * (1.0 - wu) + vh10 * wu;
            const btmVh = vh01 * (1.0 - wu) + vh11 * wu;
            outVh[outIdx] = topVh * (1.0 - wv) + btmVh * wv;

            validMask[outIdx] = 1;
            validCount++;
          } else if (v00Valid || v10Valid || v01Valid || v11Valid) {
            // Boundary/edge condition: weight among available valid neighbors
            let totalWeight = 0;
            let sumVv = 0;
            let sumVh = 0;

            if (v00Valid) {
              const w = (1.0 - wu) * (1.0 - wv);
              totalWeight += w;
              sumVv += vv00 * w;
              sumVh += vh00 * w;
            }
            if (v10Valid) {
              const w = wu * (1.0 - wv);
              totalWeight += w;
              sumVv += vv10 * w;
              sumVh += vh10 * w;
            }
            if (v01Valid) {
              const w = (1.0 - wu) * wv;
              totalWeight += w;
              sumVv += vv01 * w;
              sumVh += vh01 * w;
            }
            if (v11Valid) {
              const w = wu * wv;
              totalWeight += w;
              sumVv += vv11 * w;
              sumVh += vh11 * w;
            }

            if (totalWeight > 0.1) {
              outVv[outIdx] = sumVv / totalWeight;
              outVh[outIdx] = sumVh / totalWeight;
              validMask[outIdx] = 1;
              validCount++;
            }
          }
        }
      }
    }

    return {
      grid: targetGrid,
      vv: outVv,
      vh: outVh,
      validMask,
      validPixelCount: validCount,
      totalPixelCount: totalPixels,
      sourceCrs: srcCrs,
      sourceDimensions: { width: srcW, height: srcH },
      resamplingMethod: resampling,
    };
  }

  /**
   * Generates the multi-criteria valid comparison mask:
   * validComparisonMask = baselineValid AND currentValid AND zoneMask
   * Ensures pixels outside the common observation footprint or outside the zone are strictly excluded.
   */
  public static createValidIntersectionMask(
    baselineHarmonized: HarmonizedSarRaster,
    currentHarmonized: HarmonizedSarRaster,
    zoneBoundary: GeoJSONPolygon,
    grid: AnalysisGridDto,
  ): ValidDataIntersectionResult {
    const totalPixels = grid.width * grid.height;
    const baseMask = baselineHarmonized.validMask;
    const curMask = currentHarmonized.validMask;

    // Rasterize authoritative zone boundary onto grid
    const zoneMask = AnalysisGridService.rasterizePolygon(grid, zoneBoundary);

    const validComparisonMask = new Uint8Array(totalPixels);

    let comparisonPixelCount = 0;
    let validBaselinePixelCount = 0;
    let validCurrentPixelCount = 0;
    let overlapPixelCount = 0;
    let zonePixelCount = 0;

    for (let i = 0; i < totalPixels; i++) {
      const isBase = baseMask[i] === 1;
      const isCur = curMask[i] === 1;
      const isZone = zoneMask[i] === 1;

      if (isBase) validBaselinePixelCount++;
      if (isCur) validCurrentPixelCount++;
      if (isBase && isCur) overlapPixelCount++;
      if (isZone) zonePixelCount++;

      if (isBase && isCur && isZone) {
        validComparisonMask[i] = 1;
        comparisonPixelCount++;
      }
    }

    const coveragePercentage =
      zonePixelCount > 0 ? Number(((comparisonPixelCount / zonePixelCount) * 100.0).toFixed(2)) : 0.0;

    return {
      validComparisonMask,
      comparisonPixelCount,
      validBaselinePixelCount,
      validCurrentPixelCount,
      overlapPixelCount,
      zonePixelCount,
      coveragePercentage,
    };
  }
}
