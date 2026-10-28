/**
 * HlsBandpassAdjustmentService — NASA HLS V2.0 Spectral Bandpass Harmonization
 *
 * Implements authoritative NASA/USGS Harmonized Landsat and Sentinel-2 (HLS) V2.0
 * spectral bandpass adjustment equations.
 *
 * SCIENTIFIC FOUNDATION:
 *   Sentinel-2 MSI and Landsat-8/9 OLI spectral response functions (SRFs) differ slightly.
 *   In HLS V2.0, Landsat OLI is chosen as the canonical spectral reference.
 *   Sentinel-2 MSI surface reflectance values are adjusted to OLI-equivalent reflectance:
 *
 *       ρ_harmonized = slope × ρ_MSI + offset
 *
 *   Reference:
 *     Claverie, M., Ju, J., Masek, J. G., et al. (2018).
 *     "The Harmonized Landsat and Sentinel-2 (HLS) Product".
 *     Remote Sensing of Environment, 219, 145-161.
 *     NASA HLS V2.0 User Guide, Table 3.
 *
 * AUTHORITATIVE COEFFICIENTS (DO NOT MODIFY):
 *   Band 2  (Blue,   490 nm): slope = 0.9959, offset = -0.0002
 *   Band 3  (Green,  560 nm): slope = 0.9778, offset = -0.0040
 *   Band 4  (Red,    665 nm): slope = 1.0053, offset = -0.0009
 *   Band 8A (NIR,    865 nm): slope = 0.9825, offset = -0.0026
 *   Band 11 (SWIR1, 1610 nm): slope = 1.0018, offset = -0.0049
 *   Band 12 (SWIR2, 2190 nm): slope = 0.9657, offset =  0.0028
 *
 *   For Landsat-8 / Landsat-9 OLI:
 *     slope = 1.0000, offset = 0.0000 (OLI is the HLS spectral reference).
 *
 * ARCHITECTURAL RULES:
 *   1. NEVER invent or tune slope/offset values.
 *   2. Mode A (OFFICIAL_HLS products like HLSS30) ALREADY have this correction applied upstream.
 *      Applying it twice produces invalid scientific results and is rejected.
 *   3. Mode B (LOCAL_HLS_COMPATIBLE) applies this exact transformation to Sentinel-2 MSI rasters.
 */

import {
  SatelliteSource,
  HLSProcessingMode,
  type HLSBandpassCoefficient,
} from '@tn-forest/shared/types';
import type { HarmonizedOpticalRaster } from '../spatial/OpticalSpatialHarmonizationService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export const HLS_BANDPASS_VERSION = 'HLS_V2.0_CLAVERIE_2018';

/**
 * Authoritative NASA HLS V2.0 Sentinel-2 MSI → Landsat OLI bandpass coefficients.
 * Claverie et al. 2018 / NASA HLS V2.0 User Guide Table 3.
 */
export const HLS_MSI_TO_OLI_COEFFICIENTS: Readonly<Record<string, HLSBandpassCoefficient>> = {
  blue:  { band: 'B2',  targetBand: 'B2', slope: 0.9959, offset: -0.0002 },
  green: { band: 'B3',  targetBand: 'B3', slope: 0.9778, offset: -0.0040 },
  red:   { band: 'B4',  targetBand: 'B4', slope: 1.0053, offset: -0.0009 },
  nir:   { band: 'B8A', targetBand: 'B5', slope: 0.9825, offset: -0.0026 },
  swir1: { band: 'B11', targetBand: 'B6', slope: 1.0018, offset: -0.0049 },
  swir2: { band: 'B12', targetBand: 'B7', slope: 0.9657, offset:  0.0028 },
} as const;

export class HlsBandpassAdjustmentService {
  /**
   * Retrieves the bandpass coefficient for a given band and satellite source.
   */
  public static getCoefficient(
    band: 'blue' | 'green' | 'red' | 'nir' | 'swir1' | 'swir2',
    source: SatelliteSource | string,
  ): HLSBandpassCoefficient {
    const isSentinel2 =
      source === SatelliteSource.SENTINEL_2 ||
      (typeof source === 'string' && /sentinel-?2/i.test(source));

    if (isSentinel2) {
      const coeff = HLS_MSI_TO_OLI_COEFFICIENTS[band];
      if (!coeff) {
        throw new AppError(
          `Unknown optical band for HLS bandpass adjustment: ${band}`,
          HTTP_STATUS.BAD_REQUEST,
        );
      }
      return coeff;
    }

    // Landsat OLI is the spectral reference: identity transform
    return {
      band: band.toUpperCase(),
      targetBand: band.toUpperCase(),
      slope: 1.0,
      offset: 0.0,
    };
  }

  /**
   * Applies the linear bandpass adjustment to a single continuous surface reflectance value.
   * Clamps physical surface reflectance to valid physical range [0.0, 1.0].
   */
  public static adjustReflectanceValue(
    value: number,
    band: 'blue' | 'green' | 'red' | 'nir' | 'swir1' | 'swir2',
    source: SatelliteSource | string,
  ): number {
    if (isNaN(value) || !isFinite(value) || value < 0) {
      return NaN;
    }

    const { slope, offset } = HlsBandpassAdjustmentService.getCoefficient(band, source);
    const adjusted = slope * value + offset;
    return Math.max(0.0, Math.min(1.0, adjusted));
  }

  /**
   * Applies HLS V2.0 bandpass adjustment across an entire harmonized optical raster array.
   * Modifies only continuous reflectance bands for Sentinel-2 MSI; Landsat OLI is identity.
   * Preserves masks and metadata intact.
   */
  public static adjustHarmonizedRaster(
    raster: HarmonizedOpticalRaster,
    source: SatelliteSource | string,
    mode: HLSProcessingMode = HLSProcessingMode.LOCAL_HLS_COMPATIBLE,
  ): HarmonizedOpticalRaster {
    // Mode A safety guard: Never re-apply bandpass adjustment if already performed upstream
    if (mode === HLSProcessingMode.OFFICIAL_HLS) {
      return raster;
    }

    const isSentinel2 =
      source === SatelliteSource.SENTINEL_2 ||
      (typeof source === 'string' && /sentinel-?2/i.test(source));

    // If Landsat, OLI is already the reference: identity transform
    if (!isSentinel2) {
      return raster;
    }

    const len = raster.blue.length;
    const adjBlue = new Float32Array(len);
    const adjGreen = new Float32Array(len);
    const adjRed = new Float32Array(len);
    const adjNir = new Float32Array(len);
    const adjSwir1 = raster.swir1 ? new Float32Array(len) : undefined;
    const adjSwir2 = raster.swir2 ? new Float32Array(len) : undefined;

    const bCoeff = HlsBandpassAdjustmentService.getCoefficient('blue', source);
    const gCoeff = HlsBandpassAdjustmentService.getCoefficient('green', source);
    const rCoeff = HlsBandpassAdjustmentService.getCoefficient('red', source);
    const nCoeff = HlsBandpassAdjustmentService.getCoefficient('nir', source);
    const s1Coeff = raster.swir1 ? HlsBandpassAdjustmentService.getCoefficient('swir1', source) : undefined;
    const s2Coeff = raster.swir2 ? HlsBandpassAdjustmentService.getCoefficient('swir2', source) : undefined;

    for (let i = 0; i < len; i++) {
      adjBlue[i]  = isNaN(raster.blue[i])  ? NaN : Math.max(0, Math.min(1.0, bCoeff.slope * raster.blue[i] + bCoeff.offset));
      adjGreen[i] = isNaN(raster.green[i]) ? NaN : Math.max(0, Math.min(1.0, gCoeff.slope * raster.green[i] + gCoeff.offset));
      adjRed[i]   = isNaN(raster.red[i])   ? NaN : Math.max(0, Math.min(1.0, rCoeff.slope * raster.red[i] + rCoeff.offset));
      adjNir[i]   = isNaN(raster.nir[i])   ? NaN : Math.max(0, Math.min(1.0, nCoeff.slope * raster.nir[i] + nCoeff.offset));

      if (adjSwir1 && raster.swir1 && s1Coeff) {
        adjSwir1[i] = isNaN(raster.swir1[i]) ? NaN : Math.max(0, Math.min(1.0, s1Coeff.slope * raster.swir1[i] + s1Coeff.offset));
      }
      if (adjSwir2 && raster.swir2 && s2Coeff) {
        adjSwir2[i] = isNaN(raster.swir2[i]) ? NaN : Math.max(0, Math.min(1.0, s2Coeff.slope * raster.swir2[i] + s2Coeff.offset));
      }
    }

    return {
      ...raster,
      blue: adjBlue,
      green: adjGreen,
      red: adjRed,
      nir: adjNir,
      swir1: adjSwir1,
      swir2: adjSwir2,
      satellite: `${raster.satellite} (HLS V2.0 Bandpass Adjusted)`,
    };
  }
}
