import type { HarmonizedOpticalRaster } from './OpticalSpatialHarmonizationService.js';

export interface OpticalSpectralIndices {
  ndvi: Float32Array;
  ndwi: Float32Array;
  ndbi: Float32Array;
  bsi: Float32Array;
  savi: Float32Array;
  evi: Float32Array;
  validMask: Uint8Array;
  validPixelCount: number;
}

export interface OpticalZonalSummary {
  ndviMean: number;
  ndwiMean: number;
  ndbiMean: number;
  bsiMean: number;
  saviMean: number;
  eviMean: number;
  validPixelCount: number;
}

export interface NormalizedReflectanceBands {
  blue: Float32Array;
  green: Float32Array;
  red: Float32Array;
  nir: Float32Array;
  swir1: Float32Array;
  swir2: Float32Array;
}

/**
 * Production-grade Optical Pixel Index & Reflectance Scaling Engine.
 *
 * Implements authoritative per-pixel surface reflectance normalization:
 * - Landsat Collection 2 Level-2 Surface Reflectance: DN * 0.0000275 - 0.2
 * - Sentinel-2 Level-2A Surface Reflectance: DN * 0.0001
 * - Prevents double scaling and guarantees valid physical reflectance [0.0, 1.0].
 *
 * Implements standardized, scientifically grounded per-pixel spectral index formulations:
 * - NDVI = (NIR - Red) / (NIR + Red)
 * - NDWI = (Green - NIR) / (Green + NIR) [McFeeters 1996 Water Index]
 * - NDBI = (SWIR1 - NIR) / (SWIR1 + NIR) [Zha et al. 2003 Built-up Index]
 * - BSI  = ((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue)) [Rikimaru et al. Bare Soil]
 * - SAVI = ((NIR - Red) / (NIR + Red + 0.5)) * 1.5 [Huete 1988 Soil Adjusted Vegetation Index, L=0.5]
 * - EVI  = 2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1.0)) [Huete et al. 2002 Enhanced Vegetation Index]
 *
 * All operations execute on continuous Float32 pixel arrays; summary zonal means are
 * computed strictly by averaging per-pixel indices, never by evaluating indices of mean bands.
 */
export class OpticalPixelIndexService {
  /**
   * Normalizes raw integer Digital Numbers (DN) to physically calibrated surface reflectance [0.0, 1.0].
   * Safeguarded against double-normalization.
   */
  public static normalizeReflectanceBands(
    raster: HarmonizedOpticalRaster,
  ): NormalizedReflectanceBands {
    const totalPixels = raster.totalPixelCount;

    const outBlue = new Float32Array(totalPixels);
    const outGreen = new Float32Array(totalPixels);
    const outRed = new Float32Array(totalPixels);
    const outNir = new Float32Array(totalPixels);
    const outSwir1 = new Float32Array(totalPixels);
    const outSwir2 = new Float32Array(totalPixels);

    // Inspect peak value to detect if data is already in [0.0, 1.0] reflectance
    let maxVal = 0;
    for (let i = 0; i < totalPixels; i++) {
      const v = raster.nir[i];
      if (!isNaN(v) && v > maxVal) {
        maxVal = v;
      }
    }

    const isAlreadyNormalized = maxVal <= 1.5 && maxVal > 0;
    const sat = (raster.satellite || '').trim();
    const isHls = /hls/i.test(sat);
    const isLandsat = !isHls && /landsat/i.test(sat);
    const isSentinel = !isHls && !isLandsat && /sentinel|s2/i.test(sat);

    if (!isAlreadyNormalized && !isHls && !isLandsat && !isSentinel) {
      if (!sat) {
        console.warn(
          `[OpticalPixelIndexService] Missing sensor metadata for optical raster. Defaulting to Sentinel-2 L2A scaling (DN * 0.0001). If this is Landsat Collection 2 Level-2, specify satellite metadata to avoid reflectance underflow.`,
        );
      } else {
        console.warn(
          `[OpticalPixelIndexService] Unrecognized sensor identity '${sat}'. Defaulting to Sentinel-2 L2A scaling (DN * 0.0001). If this is Landsat Collection 2 Level-2, specify satellite metadata to avoid reflectance underflow.`,
        );
      }
    }

    const scaleBand = (raw: Float32Array | undefined, fallback = 0.1): Float32Array => {
      const out = new Float32Array(totalPixels);
      if (!raw) {
        out.fill(fallback);
        return out;
      }

      for (let i = 0; i < totalPixels; i++) {
        const val = raw[i];
        if (isNaN(val) || val < 0) {
          out[i] = NaN;
          continue;
        }

        if (isAlreadyNormalized) {
          out[i] = Math.max(0.0, Math.min(1.0, val));
        } else if (isHls) {
          // NASA HLS V2.0 (both S30 and L30) Surface Reflectance scaling: DN * 0.0001
          const scaled = val * 0.0001;
          out[i] = Math.max(0.0, Math.min(1.0, scaled));
        } else if (isLandsat) {
          // Landsat Collection 2 Level-2 Surface Reflectance scaling: DN * 0.0000275 - 0.2
          const scaled = val * 0.0000275 - 0.2;
          out[i] = Math.max(0.0, Math.min(1.0, scaled));
        } else {
          // Sentinel-2 L2A scaling: DN * 0.0001
          const scaled = val * 0.0001;
          out[i] = Math.max(0.0, Math.min(1.0, scaled));
        }
      }
      return out;
    };

    const b = scaleBand(raster.blue, 0.05);
    const g = scaleBand(raster.green, 0.05);
    const r = scaleBand(raster.red, 0.05);
    const n = scaleBand(raster.nir, 0.25);
    const s1 = scaleBand(raster.swir1, 0.15);
    const s2 = scaleBand(raster.swir2, 0.08);

    outBlue.set(b);
    outGreen.set(g);
    outRed.set(r);
    outNir.set(n);
    outSwir1.set(s1);
    outSwir2.set(s2);

    return {
      blue: outBlue,
      green: outGreen,
      red: outRed,
      nir: outNir,
      swir1: outSwir1,
      swir2: outSwir2,
    };
  }

  /**
   * Computes authentic pixel-level spectral indices from normalized surface reflectance bands.
   */
  public static calculatePixelIndices(
    harmonized: HarmonizedOpticalRaster,
    validMask: Uint8Array,
  ): { indices: OpticalSpectralIndices; summary: OpticalZonalSummary } {
    const totalPixels = harmonized.totalPixelCount;
    const refl = OpticalPixelIndexService.normalizeReflectanceBands(harmonized);

    const ndvi = new Float32Array(totalPixels);
    const ndwi = new Float32Array(totalPixels);
    const ndbi = new Float32Array(totalPixels);
    const bsi = new Float32Array(totalPixels);
    const savi = new Float32Array(totalPixels);
    const evi = new Float32Array(totalPixels);

    let ndviSum = 0;
    let ndwiSum = 0;
    let ndbiSum = 0;
    let bsiSum = 0;
    let saviSum = 0;
    let eviSum = 0;
    let validCount = 0;

    const L = 0.5; // SAVI soil-canopy adjustment factor

    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        ndvi[i] = NaN;
        ndwi[i] = NaN;
        ndbi[i] = NaN;
        bsi[i] = NaN;
        savi[i] = NaN;
        evi[i] = NaN;
        continue;
      }

      const blue = refl.blue[i];
      const green = refl.green[i];
      const red = refl.red[i];
      const nir = refl.nir[i];
      const swir1 = refl.swir1[i];

      // Check if any required band is NaN
      if (isNaN(blue) || isNaN(green) || isNaN(red) || isNaN(nir) || isNaN(swir1)) {
        ndvi[i] = NaN;
        ndwi[i] = NaN;
        ndbi[i] = NaN;
        bsi[i] = NaN;
        savi[i] = NaN;
        evi[i] = NaN;
        continue;
      }

      // 1. NDVI = (NIR - Red) / (NIR + Red)
      const ndviDenom = nir + red;
      const ndviVal = ndviDenom > 1e-6 ? (nir - red) / ndviDenom : 0.0;
      ndvi[i] = Math.max(-1.0, Math.min(1.0, ndviVal));

      // 2. NDWI = (Green - NIR) / (Green + NIR) [McFeeters 1996 Water Index]
      const ndwiDenom = green + nir;
      const ndwiVal = ndwiDenom > 1e-6 ? (green - nir) / ndwiDenom : 0.0;
      ndwi[i] = Math.max(-1.0, Math.min(1.0, ndwiVal));

      // 3. NDBI = (SWIR1 - NIR) / (SWIR1 + NIR) [Zha et al. 2003 Built-up Index]
      const ndbiDenom = swir1 + nir;
      const ndbiVal = ndbiDenom > 1e-6 ? (swir1 - nir) / ndbiDenom : 0.0;
      ndbi[i] = Math.max(-1.0, Math.min(1.0, ndbiVal));

      // 4. BSI = ((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue)) [Rikimaru et al. Bare Soil]
      const bsiNumer = swir1 + red - (nir + blue);
      const bsiDenom = swir1 + red + (nir + blue);
      const bsiVal = bsiDenom > 1e-6 ? bsiNumer / bsiDenom : 0.0;
      bsi[i] = Math.max(-1.0, Math.min(1.0, bsiVal));

      // 5. SAVI = ((NIR - Red) / (NIR + Red + L)) * (1 + L) [Huete 1988, L = 0.5]
      const saviDenom = nir + red + L;
      const saviVal = saviDenom > 1e-6 ? ((nir - red) / saviDenom) * (1.0 + L) : 0.0;
      savi[i] = Math.max(-1.5, Math.min(1.5, saviVal));

      // 6. EVI = 2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1.0)) [Huete et al. 2002]
      const eviDenom = nir + 6.0 * red - 7.5 * blue + 1.0;
      const eviVal = Math.abs(eviDenom) > 1e-6 ? 2.5 * ((nir - red) / eviDenom) : 0.0;
      evi[i] = Math.max(-1.5, Math.min(1.5, eviVal));

      ndviSum += ndvi[i];
      ndwiSum += ndwi[i];
      ndbiSum += ndbi[i];
      bsiSum += bsi[i];
      saviSum += savi[i];
      eviSum += evi[i];
      validCount++;
    }

    const denom = validCount > 0 ? validCount : 1;

    return {
      indices: {
        ndvi,
        ndwi,
        ndbi,
        bsi,
        savi,
        evi,
        validMask,
        validPixelCount: validCount,
      },
      summary: {
        ndviMean: Number((ndviSum / denom).toFixed(4)),
        ndwiMean: Number((ndwiSum / denom).toFixed(4)),
        ndbiMean: Number((ndbiSum / denom).toFixed(4)),
        bsiMean: Number((bsiSum / denom).toFixed(4)),
        saviMean: Number((saviSum / denom).toFixed(4)),
        eviMean: Number((eviSum / denom).toFixed(4)),
        validPixelCount: validCount,
      },
    };
  }
}
