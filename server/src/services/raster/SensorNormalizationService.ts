import type { ExtractedOpticalRaster } from './RasterReaderService.js';

export interface NormalizedOpticalRaster {
  blue: Float32Array;
  green: Float32Array;
  red: Float32Array;
  nir: Float32Array;
  swir1?: Float32Array;
  swir2?: Float32Array;
  qa?: Float32Array;
  width: number;
  height: number;
  nativeResolution: number;
  satellite: string;
  crs?: string;
  originalCrs?: string;
  normalizedCrs?: string;
  pixelAreaM2?: number;
}

export class SensorNormalizationService {
  /**
   * Normalizes raw DN or surface reflectance values to standard [0.0, 1.0] reflectance float scale.
   */
  public static normalizeOpticalBands(raster: ExtractedOpticalRaster): NormalizedOpticalRaster {
    const { bands, metadata, satellite, nativeResolution } = raster;
    const totalPixels = metadata.width * metadata.height;

    const scaleBand = (raw: Float32Array | undefined, isLandsat: boolean): Float32Array | undefined => {
      if (!raw) return undefined;
      const normalized = new Float32Array(totalPixels);

      for (let i = 0; i < totalPixels; i++) {
        const val = raw[i];
        if (isNaN(val) || val === metadata.nodata) {
          normalized[i] = NaN;
          continue;
        }

        if (isLandsat) {
          // Landsat Collection 2 Level-2 Surface Reflectance scaling: DN * 0.0000275 - 0.2
          if (val > 10.0) {
            normalized[i] = Math.max(0.0, Math.min(1.0, val * 0.0000275 - 0.2));
          } else {
            normalized[i] = Math.max(0.0, Math.min(1.0, val));
          }
        } else {
          // Sentinel-2 L2A: DN * 0.0001 (if raw DN > 1.0)
          if (val > 1.0) {
            normalized[i] = Math.max(0.0, Math.min(1.0, val * 0.0001));
          } else {
            normalized[i] = Math.max(0.0, Math.min(1.0, val));
          }
        }
      }
      return normalized;
    };

    const isLandsat = satellite.startsWith('Landsat');

    return {
      blue: scaleBand(bands.blue, isLandsat)!,
      green: scaleBand(bands.green, isLandsat)!,
      red: scaleBand(bands.red, isLandsat)!,
      nir: scaleBand(bands.nir, isLandsat)!,
      swir1: scaleBand(bands.swir1, isLandsat),
      swir2: scaleBand(bands.swir2, isLandsat),
      qa: bands.qa,
      width: metadata.width,
      height: metadata.height,
      nativeResolution,
      satellite,
      crs: metadata.normalizedCrs || metadata.crs,
      originalCrs: metadata.originalCrs,
      normalizedCrs: metadata.normalizedCrs,
      pixelAreaM2: metadata.pixelAreaM2,
    };
  }
}
