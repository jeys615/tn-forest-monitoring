import type { NormalizedOpticalRaster } from './SensorNormalizationService.js';

export interface PreprocessingResult {
  validMask: Uint8Array; // 1 = valid, 0 = masked/invalid
  totalPixels: number;
  validPixels: number;
  maskedPixels: number;
  validPercentage: number;
  maskedPercentage: number;
  sceneCloudCover: number;
}

export class RasterPreprocessingService {
  /**
   * Generates a valid pixel mask filtering out nodata, atmospheric artifacts, and clouds.
   */
  public static generateValidPixelMask(
    raster: NormalizedOpticalRaster,
    sceneCloudCover: number = 0.0,
  ): PreprocessingResult {
    const totalPixels = raster.width * raster.height;
    const validMask = new Uint8Array(totalPixels);
    let validCount = 0;

    for (let i = 0; i < totalPixels; i++) {
      const red = raster.red[i];
      const nir = raster.nir[i];
      const blue = raster.blue[i];
      const green = raster.green[i];

      // Check NaN or nodata
      if (isNaN(red) || isNaN(nir) || isNaN(blue) || isNaN(green)) {
        validMask[i] = 0;
        continue;
      }

      // Check QA/SCL cloud flags if available
      if (raster.qa) {
        const qaVal = raster.qa[i];
        if (raster.satellite === 'Sentinel-2') {
          // Sentinel-2 SCL: 3=Cloud Shadow, 8=Cloud Medium Prob, 9=Cloud High Prob, 10=Cirrus
          if (qaVal === 3 || qaVal === 8 || qaVal === 9 || qaVal === 10 || qaVal === 0) {
            validMask[i] = 0;
            continue;
          }
        }
      }

      // Check reflectance range validity
      if (red < 0 || red > 1.0 || nir < 0 || nir > 1.0) {
        validMask[i] = 0;
        continue;
      }

      validMask[i] = 1;
      validCount++;
    }

    const maskedCount = totalPixels - validCount;
    const validPercentage = Number(((validCount / totalPixels) * 100.0).toFixed(2));
    const maskedPercentage = Number(((maskedCount / totalPixels) * 100.0).toFixed(2));

    return {
      validMask,
      totalPixels,
      validPixels: validCount,
      maskedPixels: maskedCount,
      validPercentage,
      maskedPercentage,
      sceneCloudCover,
    };
  }
}
