import type { NormalizedOpticalRaster } from './SensorNormalizationService.js';

export interface SpectralIndicesRaster {
  ndvi: Float32Array;
  ndwi: Float32Array;
  nbr?: Float32Array;
  bsi?: Float32Array;
  evi: Float32Array;
  savi: Float32Array;
}

export interface ZonalSpectralStatistics {
  ndviMean: number;
  ndwiMean: number;
  nbrMean: number;
  bsiMean: number;
  eviMean: number;
  saviMean: number;
  validPixelCount: number;
}

export interface RasterChangeDetectionResult {
  validPixels: number;
  changedPixels: number;
  noChangePixels: number;
  pixelAreaM2: number;
  affectedAreaM2: number;
  affectedAreaHa: number;
  affectedAreaPercentage: number;
  changedMask: Uint8Array;
  ndviDeltaMean: number;
  pixelAccountingValid: boolean;
  originalCrs?: string;
  normalizedCrs?: string;
  areaCalculationCrs?: string;
}

export class PixelAnalysisService {
  /**
   * Computes real pixel-level spectral indices from optical reflectance bands.
   */
  public static calculateSpectralIndices(
    raster: NormalizedOpticalRaster,
    validMask: Uint8Array,
  ): { indices: SpectralIndicesRaster; stats: ZonalSpectralStatistics } {
    const totalPixels = raster.width * raster.height;
    const ndvi = new Float32Array(totalPixels);
    const ndwi = new Float32Array(totalPixels);
    const nbr = raster.swir2 ? new Float32Array(totalPixels) : undefined;
    const bsi = raster.swir1 ? new Float32Array(totalPixels) : undefined;
    const evi = new Float32Array(totalPixels);
    const savi = new Float32Array(totalPixels);

    let ndviSum = 0;
    let ndwiSum = 0;
    let nbrSum = 0;
    let bsiSum = 0;
    let eviSum = 0;
    let saviSum = 0;
    let validCount = 0;

    const L = 0.5; // SAVI canopy adjustment factor

    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        ndvi[i] = NaN;
        ndwi[i] = NaN;
        if (nbr) nbr[i] = NaN;
        if (bsi) bsi[i] = NaN;
        evi[i] = NaN;
        savi[i] = NaN;
        continue;
      }

      const blue = raster.blue[i];
      const green = raster.green[i];
      const red = raster.red[i];
      const nir = raster.nir[i];
      const swir1 = raster.swir1 ? raster.swir1[i] : 0.12;
      const swir2 = raster.swir2 ? raster.swir2[i] : 0.06;

      // NDVI = (NIR - RED) / (NIR + RED)
      const ndviVal = nir + red > 0 ? (nir - red) / (nir + red) : 0;
      ndvi[i] = ndviVal;

      // NDWI = (GREEN - NIR) / (GREEN + NIR)
      const ndwiVal = green + nir > 0 ? (green - nir) / (green + nir) : 0;
      ndwi[i] = ndwiVal;

      // NBR = (NIR - SWIR2) / (NIR + SWIR2)
      const nbrVal = nir + swir2 > 0 ? (nir - swir2) / (nir + swir2) : 0;
      if (nbr) nbr[i] = nbrVal;

      // BSI = ((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))
      const bsiDenom = swir1 + red + nir + blue;
      const bsiVal = bsiDenom > 0 ? (swir1 + red - (nir + blue)) / bsiDenom : 0;
      if (bsi) bsi[i] = bsiVal;

      // EVI = 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))
      const eviDenom = nir + 6.0 * red - 7.5 * blue + 1.0;
      const eviVal = eviDenom !== 0 ? 2.5 * ((nir - red) / eviDenom) : 0;
      evi[i] = eviVal;

      // SAVI = ((NIR - RED) / (NIR + RED + L)) * (1 + L)
      const saviDenom = nir + red + L;
      const saviVal = saviDenom > 0 ? ((nir - red) / saviDenom) * (1.0 + L) : 0;
      savi[i] = saviVal;

      ndviSum += ndviVal;
      ndwiSum += ndwiVal;
      nbrSum += nbrVal;
      bsiSum += bsiVal;
      eviSum += eviVal;
      saviSum += saviVal;
      validCount++;
    }

    const denom = validCount > 0 ? validCount : 1;

    return {
      indices: {
        ndvi,
        ndwi,
        nbr,
        bsi,
        evi,
        savi,
      },
      stats: {
        ndviMean: Number((ndviSum / denom).toFixed(3)),
        ndwiMean: Number((ndwiSum / denom).toFixed(3)),
        nbrMean: Number((nbrSum / denom).toFixed(3)),
        bsiMean: Number((bsiSum / denom).toFixed(3)),
        eviMean: Number((eviSum / denom).toFixed(3)),
        saviMean: Number((saviSum / denom).toFixed(3)),
        validPixelCount: validCount,
      },
    };
  }

  /**
   * Performs pixel-by-pixel change detection between aligned baseline and current rasters.
   */
  public static detectPixelChange(params: {
    baselineIndices: SpectralIndicesRaster;
    currentIndices: SpectralIndicesRaster;
    baselineValidMask: Uint8Array;
    currentValidMask: Uint8Array;
    pixelResolutionMeters?: number;
    pixelAreaM2?: number;
    changeThreshold?: number; // default 0.05
    originalCrs?: string;
    normalizedCrs?: string;
    areaCalculationCrs?: string;
  }): RasterChangeDetectionResult {
    const {
      baselineIndices,
      currentIndices,
      baselineValidMask,
      currentValidMask,
      pixelResolutionMeters = 10,
      changeThreshold = 0.05,
      originalCrs,
      normalizedCrs,
      areaCalculationCrs,
    } = params;

    const totalPixels = baselineValidMask.length;
    const changedMask = new Uint8Array(totalPixels);
    const pixelAreaM2 =
      params.pixelAreaM2 && params.pixelAreaM2 > 0
        ? params.pixelAreaM2
        : pixelResolutionMeters * pixelResolutionMeters;

    let validPixels = 0;
    let changedPixels = 0;
    let ndviDeltaSum = 0;

    for (let i = 0; i < totalPixels; i++) {
      // Both baseline and current must be valid unmasked pixels
      if (baselineValidMask[i] === 0 || currentValidMask[i] === 0) {
        changedMask[i] = 0;
        continue;
      }

      validPixels++;
      const baseNdvi = baselineIndices.ndvi[i];
      const curNdvi = currentIndices.ndvi[i];
      const delta = curNdvi - baseNdvi;
      ndviDeltaSum += delta;

      // Changed pixel criteria: significant vegetation loss (or surface change)
      if (Math.abs(delta) >= changeThreshold) {
        changedMask[i] = 1;
        changedPixels++;
      } else {
        changedMask[i] = 0;
      }
    }

    const noChangePixels = Math.max(0, validPixels - changedPixels);
    const affectedAreaM2 = changedPixels * pixelAreaM2;
    const affectedAreaHa = affectedAreaM2 / 10000.0;
    // Authoritative percentage: (changedPixels / validPixels) * 100 (never derived from rounded hectares)
    const affectedAreaPercentage = validPixels > 0 ? (changedPixels / validPixels) * 100.0 : 0.0;
    const ndviDeltaMean = validPixels > 0 ? Number((ndviDeltaSum / validPixels).toFixed(3)) : 0;
    const pixelAccountingValid = validPixels === changedPixels + noChangePixels;

    return {
      validPixels,
      changedPixels,
      noChangePixels,
      pixelAreaM2,
      affectedAreaM2,
      affectedAreaHa,
      affectedAreaPercentage,
      changedMask,
      ndviDeltaMean,
      pixelAccountingValid,
      originalCrs,
      normalizedCrs,
      areaCalculationCrs,
    };
  }
}
