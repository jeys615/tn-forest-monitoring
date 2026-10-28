import type { NormalizedOpticalRaster } from './SensorNormalizationService.js';
import type { ExtractedSarRaster } from './RasterReaderService.js';

export interface HarmonizationGrid {
  width: number;
  height: number;
  pixelScale: number; // in meters (e.g. 10m)
  crs: string;
}

/**
 * @deprecated Legacy 2D array resizing service. Does not perform geographic CRS reprojection
 * or canonical analysis grid alignment. For production spatial harmonization, use
 * OpticalSpatialHarmonizationService or SpatialHarmonizationService with AnalysisGridService.
 */
export class RasterHarmonizationService {
  /**
   * Resamples and aligns current observation raster to the authoritative baseline grid.
   * Uses Bilinear Interpolation for continuous reflectance bands and Nearest Neighbor for masks.
   */
  public static harmonizeToBaselineGrid(
    currentRaster: NormalizedOpticalRaster,
    targetGrid: HarmonizationGrid,
  ): NormalizedOpticalRaster {
    const { width: targetW, height: targetH } = targetGrid;
    const { width: srcW, height: srcH } = currentRaster;

    // If already identical dimensions, return as is
    if (srcW === targetW && srcH === targetH) {
      return currentRaster;
    }

    const scaleX = srcW / targetW;
    const scaleY = srcH / targetH;

    const resampleBilinear = (src: Float32Array): Float32Array => {
      const dest = new Float32Array(targetW * targetH);

      for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
          const srcX = x * scaleX;
          const srcY = y * scaleY;

          const x0 = Math.floor(srcX);
          const x1 = Math.min(srcW - 1, x0 + 1);
          const y0 = Math.floor(srcY);
          const y1 = Math.min(srcH - 1, y0 + 1);

          const wx = srcX - x0;
          const wy = srcY - y0;

          const v00 = src[y0 * srcW + x0];
          const v10 = src[y0 * srcW + x1];
          const v01 = src[y1 * srcW + x0];
          const v11 = src[y1 * srcW + x1];

          if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) {
            dest[y * targetW + x] = v00;
          } else {
            const top = v00 * (1 - wx) + v10 * wx;
            const bottom = v01 * (1 - wx) + v11 * wx;
            dest[y * targetW + x] = top * (1 - wy) + bottom * wy;
          }
        }
      }
      return dest;
    };

    const resampleNearest = (src: Float32Array | undefined): Float32Array | undefined => {
      if (!src) return undefined;
      const dest = new Float32Array(targetW * targetH);

      for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
          const srcX = Math.min(srcW - 1, Math.round(x * scaleX));
          const srcY = Math.min(srcH - 1, Math.round(y * scaleY));
          dest[y * targetW + x] = src[srcY * srcW + srcX];
        }
      }
      return dest;
    };

    return {
      blue: resampleBilinear(currentRaster.blue),
      green: resampleBilinear(currentRaster.green),
      red: resampleBilinear(currentRaster.red),
      nir: resampleBilinear(currentRaster.nir),
      swir1: currentRaster.swir1 ? resampleBilinear(currentRaster.swir1) : undefined,
      swir2: currentRaster.swir2 ? resampleBilinear(currentRaster.swir2) : undefined,
      qa: resampleNearest(currentRaster.qa),
      width: targetW,
      height: targetH,
      nativeResolution: currentRaster.nativeResolution,
      satellite: currentRaster.satellite,
      crs: targetGrid.crs,
      normalizedCrs: targetGrid.crs,
      originalCrs: currentRaster.originalCrs || currentRaster.crs,
      pixelAreaM2: (targetGrid.pixelScale || 10) * (targetGrid.pixelScale || 10),
    };
  }

  /**
   * Resamples and aligns current SAR observation raster (VV, VH) to the authoritative baseline grid.
   * Uses Bilinear Interpolation for continuous backscatter radar bands.
   */
  public static harmonizeSarToBaselineGrid(
    currentSar: ExtractedSarRaster,
    targetGrid: HarmonizationGrid,
  ): ExtractedSarRaster {
    const { width: targetW, height: targetH } = targetGrid;
    const { width: srcW, height: srcH } = currentSar.metadata;

    if (srcW === targetW && srcH === targetH) {
      return currentSar;
    }

    const scaleX = srcW / targetW;
    const scaleY = srcH / targetH;

    const resampleBilinear = (src: Float32Array): Float32Array => {
      const dest = new Float32Array(targetW * targetH);

      for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
          const srcX = x * scaleX;
          const srcY = y * scaleY;

          const x0 = Math.floor(srcX);
          const x1 = Math.min(srcW - 1, x0 + 1);
          const y0 = Math.floor(srcY);
          const y1 = Math.min(srcH - 1, y0 + 1);

          const wx = srcX - x0;
          const wy = srcY - y0;

          const v00 = src[y0 * srcW + x0];
          const v10 = src[y0 * srcW + x1];
          const v01 = src[y1 * srcW + x0];
          const v11 = src[y1 * srcW + x1];

          if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) {
            dest[y * targetW + x] = v00;
          } else {
            const top = v00 * (1 - wx) + v10 * wx;
            const bottom = v01 * (1 - wx) + v11 * wx;
            dest[y * targetW + x] = top * (1 - wy) + bottom * wy;
          }
        }
      }
      return dest;
    };

    return {
      metadata: {
        ...currentSar.metadata,
        width: targetW,
        height: targetH,
        crs: targetGrid.crs,
        normalizedCrs: targetGrid.crs,
        pixelScale: [
          targetGrid.pixelScale || 10,
          targetGrid.pixelScale || 10,
          currentSar.metadata.pixelScale?.[2] || 0,
        ],
        pixelAreaM2: (targetGrid.pixelScale || 10) * (targetGrid.pixelScale || 10),
      },
      bands: {
        vv: resampleBilinear(currentSar.bands.vv),
        vh: resampleBilinear(currentSar.bands.vh),
      },
      satellite: 'Sentinel-1',
      nativeResolution: currentSar.nativeResolution,
    };
  }

  /**
   * Verifies spatial compatibility between a baseline raster and an observation raster.
   * Returns whether they are spatially aligned, and if not, the required normalization action.
   */
  public static verifySpatialAlignment(
    baseline: { width: number; height: number; crs?: string; nativeResolution?: number; pixelAreaM2?: number },
    current: { width: number; height: number; crs?: string; nativeResolution?: number; pixelAreaM2?: number },
  ): {
    aligned: boolean;
    sameCrs: boolean;
    sameDimensions: boolean;
    sameResolution: boolean;
    recommendation: 'READY' | 'RESAMPLE_REQUIRED' | 'REPROJECT_AND_RESAMPLE';
  } {
    const sameCrs = !baseline.crs || !current.crs || baseline.crs === current.crs;
    const sameDimensions = baseline.width === current.width && baseline.height === current.height;
    const sameResolution = !baseline.nativeResolution || !current.nativeResolution || baseline.nativeResolution === current.nativeResolution;

    const aligned = sameCrs && sameDimensions && sameResolution;
    let recommendation: 'READY' | 'RESAMPLE_REQUIRED' | 'REPROJECT_AND_RESAMPLE' = 'READY';
    if (!sameCrs) {
      recommendation = 'REPROJECT_AND_RESAMPLE';
    } else if (!sameDimensions || !sameResolution) {
      recommendation = 'RESAMPLE_REQUIRED';
    }

    return {
      aligned,
      sameCrs,
      sameDimensions,
      sameResolution,
      recommendation,
    };
  }
}
