import {
  SatelliteSource,
  SensorType,
  LogicalOpticalBand,
  LogicalSarBand,
  LogicalDemBand,
  ResamplingMethod,
  type GeoJSONPolygon,
  type ZonalStatisticsDto,
  type OpticalZonalStatistics,
  type SarZonalStatistics,
  type DemZonalStatistics,
  type BandZonalSummary,
  type HarmonizedDatasetDto,
  type DatasetCompatibilityResult,
  type HarmonizationOptions,
} from '@tn-forest/shared/types';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export const SCIENTIFIC_RESAMPLING_DISCLAIMER =
  'Spatial resampling applied (30m -> 10m). Does not create new native spatial information. Environmental monitoring and decision-support only; not a certified mining survey.';

export class HarmonizationService {
  private static instance: HarmonizationService;

  public static getInstance(): HarmonizationService {
    if (!HarmonizationService.instance) {
      HarmonizationService.instance = new HarmonizationService();
    }
    return HarmonizationService.instance;
  }

  /**
   * Harmonizes an optical satellite acquisition (Sentinel-2, Landsat-8, or Landsat-9)
   * into the common logical optical band model on a normalized spatial grid (10m).
   */
  public harmonizeOptical(
    rawStats: ZonalStatisticsDto,
    extent: GeoJSONPolygon,
    options: HarmonizationOptions = {},
  ): HarmonizedDatasetDto {
    if (rawStats.sensorTrack !== SensorType.OPTICAL) {
      throw new AppError(
        `Cannot harmonize non-optical dataset (${rawStats.sensorTrack}) using harmonizeOptical`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const {
      targetResolutionMeters = 10,
      targetCrs = 'EPSG:4326',
      resamplingMethod = ResamplingMethod.BILINEAR,
    } = options;

    const source = rawStats.sensor;
    const isLandsat = source === SatelliteSource.LANDSAT_8 || source === SatelliteSource.LANDSAT_9;
    const nativeResolutionMeters = isLandsat ? 30 : 10;
    const isResampled = nativeResolutionMeters !== targetResolutionMeters;

    const stats = rawStats.statistics as OpticalZonalStatistics;
    const normalizedBands: Record<string, BandZonalSummary> = {};
    const bandMapping: Record<string, string> = {};
    const scaleApplied: Record<string, { scale: number; offset: number }> = {};

    // -------------------------------------------------------------
    // SENSOR-SPECIFIC LOGICAL BAND MAPPING & SURFACE REFLECTANCE SCALING
    // -------------------------------------------------------------
    if (source === SatelliteSource.SENTINEL_2) {
      // Sentinel-2 L2A Harmonized: Bands B2..B12 are already scaled surface reflectance (0..1)
      bandMapping[LogicalOpticalBand.BLUE] = 'B2';
      bandMapping[LogicalOpticalBand.GREEN] = 'B3';
      bandMapping[LogicalOpticalBand.RED] = 'B4';
      bandMapping[LogicalOpticalBand.NIR] = 'B8';
      bandMapping[LogicalOpticalBand.SWIR1] = 'B11';
      bandMapping[LogicalOpticalBand.SWIR2] = 'B12';

      normalizedBands[LogicalOpticalBand.BLUE] = this.cloneBandSummary(stats.B2);
      normalizedBands[LogicalOpticalBand.GREEN] = this.cloneBandSummary(stats.B3);
      normalizedBands[LogicalOpticalBand.RED] = this.cloneBandSummary(stats.B4);
      normalizedBands[LogicalOpticalBand.NIR] = this.cloneBandSummary(stats.B8);
      normalizedBands[LogicalOpticalBand.SWIR1] = this.resampleBand(stats.B11, 20, targetResolutionMeters);
      normalizedBands[LogicalOpticalBand.SWIR2] = this.resampleBand(stats.B12, 20, targetResolutionMeters);

      for (const b of Object.values(LogicalOpticalBand)) {
        scaleApplied[b] = { scale: 1.0, offset: 0.0 };
      }
    } else {
      // Landsat 8 & Landsat 9 Collection 2 Level-2 Surface Reflectance (SR_B2..SR_B7)
      // Native resolution: 30m. Bilinear resampling to 10m target grid.
      bandMapping[LogicalOpticalBand.BLUE] = 'SR_B2 (B2)';
      bandMapping[LogicalOpticalBand.GREEN] = 'SR_B3 (B3)';
      bandMapping[LogicalOpticalBand.RED] = 'SR_B4 (B4)';
      bandMapping[LogicalOpticalBand.NIR] = 'SR_B5 (B8/NIR)';
      bandMapping[LogicalOpticalBand.SWIR1] = 'SR_B6 (B11/SWIR1)';
      bandMapping[LogicalOpticalBand.SWIR2] = 'SR_B7 (B12/SWIR2)';

      // Maps Landsat band values (from stats or standard aliases)
      const rawMap = stats as unknown as Record<string, BandZonalSummary>;
      const bBlue = stats.B2 || rawMap['SR_B2'];
      const bGreen = stats.B3 || rawMap['SR_B3'];
      const bRed = stats.B4 || rawMap['SR_B4'];
      const bNir = stats.B8 || rawMap['SR_B5'];
      const bSwir1 = stats.B11 || rawMap['SR_B6'];
      const bSwir2 = stats.B12 || rawMap['SR_B7'];

      normalizedBands[LogicalOpticalBand.BLUE] = this.resampleBand(bBlue, 30, targetResolutionMeters);
      normalizedBands[LogicalOpticalBand.GREEN] = this.resampleBand(bGreen, 30, targetResolutionMeters);
      normalizedBands[LogicalOpticalBand.RED] = this.resampleBand(bRed, 30, targetResolutionMeters);
      normalizedBands[LogicalOpticalBand.NIR] = this.resampleBand(bNir, 30, targetResolutionMeters);
      normalizedBands[LogicalOpticalBand.SWIR1] = this.resampleBand(bSwir1, 30, targetResolutionMeters);
      normalizedBands[LogicalOpticalBand.SWIR2] = this.resampleBand(bSwir2, 30, targetResolutionMeters);

      for (const b of Object.values(LogicalOpticalBand)) {
        scaleApplied[b] = { scale: 1.0, offset: 0.0 };
      }
    }

    // -------------------------------------------------------------
    // CALCULATE HARMONIZED SPECTRAL INDICES ON NORMALIZED BANDS
    // -------------------------------------------------------------
    const blue = normalizedBands[LogicalOpticalBand.BLUE].mean;
    const green = normalizedBands[LogicalOpticalBand.GREEN].mean;
    const red = normalizedBands[LogicalOpticalBand.RED].mean;
    const nir = normalizedBands[LogicalOpticalBand.NIR].mean;
    const swir1 = normalizedBands[LogicalOpticalBand.SWIR1].mean;

    const ndvi = Number(((nir - red) / Math.max(0.0001, nir + red)).toFixed(4));
    const evi = Number((2.5 * ((nir - red) / Math.max(0.0001, nir + 6.0 * red - 7.5 * blue + 1.0))).toFixed(4));
    const nbr = Number(((nir - swir1) / Math.max(0.0001, nir + swir1)).toFixed(4));
    const bsi = Number((((swir1 + red) - (nir + blue)) / Math.max(0.0001, (swir1 + red) + (nir + blue))).toFixed(4));
    const ndwi = Number(((green - nir) / Math.max(0.0001, green + nir)).toFixed(4));

    const gridOrigin = extent.coordinates[0][0];

    return {
      datasetId: `HARM_${source}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      sourceImageId: rawStats.imageId,
      source,
      sensorType: SensorType.OPTICAL,
      harmonization: {
        nativeResolutionMeters,
        targetResolutionMeters,
        resamplingMethod,
        crs: targetCrs,
        targetCrs,
        gridOrigin,
        isResampled,
        scientificDisclaimer: isResampled ? SCIENTIFIC_RESAMPLING_DISCLAIMER : 'Native optical resolution preserved.',
        bandMapping,
        scaleApplied,
      },
      extent,
      normalizedBands,
      calculatedIndices: {
        ndvi,
        evi,
        nbr,
        bsi,
        ndwi,
      },
      cloudCoverPercentage: rawStats.cloudCover,
      acquisitionDate: rawStats.acquisitionDate,
      harmonizedAt: new Date().toISOString(),
    };
  }

  /**
   * Harmonizes a SAR acquisition (Sentinel-1 C-Band) maintaining strict SAR track isolation.
   */
  public harmonizeSar(
    rawStats: ZonalStatisticsDto,
    extent: GeoJSONPolygon,
    options: HarmonizationOptions = {},
  ): HarmonizedDatasetDto {
    if (rawStats.sensorTrack !== SensorType.SAR) {
      throw new AppError(
        `Cannot harmonize non-SAR dataset (${rawStats.sensorTrack}) using harmonizeSar`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const {
      targetResolutionMeters = 10,
      targetCrs = 'EPSG:4326',
      resamplingMethod = ResamplingMethod.BILINEAR,
    } = options;

    const stats = rawStats.statistics as SarZonalStatistics;
    const normalizedBands: Record<string, BandZonalSummary> = {
      [LogicalSarBand.VV]: this.cloneBandSummary(stats.VV),
      [LogicalSarBand.VH]: this.cloneBandSummary(stats.VH),
    };

    const vvMean = stats.VV.mean;
    const vhMean = stats.VH.mean;
    const vvVhRatio = Number((vvMean / Math.min(-0.0001, vhMean)).toFixed(4));
    const rfdi = Number(((vvMean - vhMean) / Math.min(-0.0001, vvMean + vhMean)).toFixed(4));
    const rvi = Number(((4 * vhMean) / Math.min(-0.0001, vvMean + vhMean)).toFixed(4));

    const gridOrigin = extent.coordinates[0][0];

    return {
      datasetId: `HARM_SAR_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      sourceImageId: rawStats.imageId,
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      harmonization: {
        nativeResolutionMeters: 10,
        targetResolutionMeters,
        resamplingMethod,
        crs: targetCrs,
        targetCrs,
        gridOrigin,
        isResampled: false,
        scientificDisclaimer: 'SAR C-Band radar track. Never mixed or cross-subtracted with optical reflectance.',
        bandMapping: {
          [LogicalSarBand.VV]: 'VV',
          [LogicalSarBand.VH]: 'VH',
        },
        scaleApplied: {
          [LogicalSarBand.VV]: { scale: 1.0, offset: 0.0 },
          [LogicalSarBand.VH]: { scale: 1.0, offset: 0.0 },
        },
      },
      extent,
      normalizedBands,
      calculatedIndices: {
        vvVhRatio,
        rfdi,
        rvi,
      },
      cloudCoverPercentage: 0,
      acquisitionDate: rawStats.acquisitionDate,
      harmonizedAt: new Date().toISOString(),
    };
  }

  /**
   * Harmonizes a DEM acquisition (SRTM 30m Global Elevation).
   */
  public harmonizeDem(
    rawStats: ZonalStatisticsDto,
    extent: GeoJSONPolygon,
    options: HarmonizationOptions = {},
  ): HarmonizedDatasetDto {
    const {
      targetResolutionMeters = 30,
      targetCrs = 'EPSG:4326',
      resamplingMethod = ResamplingMethod.BILINEAR,
    } = options;

    const stats = rawStats.statistics as DemZonalStatistics;
    const normalizedBands: Record<string, BandZonalSummary> = {
      [LogicalDemBand.ELEVATION]: this.cloneBandSummary(stats.elevation),
    };

    if (stats.slope) {
      normalizedBands[LogicalDemBand.SLOPE] = this.cloneBandSummary(stats.slope);
    }
    if (stats.aspect) {
      normalizedBands[LogicalDemBand.ASPECT] = this.cloneBandSummary(stats.aspect);
    }

    const gridOrigin = extent.coordinates[0][0];

    return {
      datasetId: `HARM_DEM_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      sourceImageId: rawStats.imageId,
      source: SatelliteSource.SRTM,
      sensorType: SensorType.DEM,
      harmonization: {
        nativeResolutionMeters: 30,
        targetResolutionMeters,
        resamplingMethod,
        crs: targetCrs,
        targetCrs,
        gridOrigin,
        isResampled: false,
        scientificDisclaimer: 'SRTM 1 Arc-Second DEM elevation model. Expressed strictly in meters.',
        bandMapping: {
          [LogicalDemBand.ELEVATION]: 'elevation',
          [LogicalDemBand.SLOPE]: 'slope',
          [LogicalDemBand.ASPECT]: 'aspect',
        },
        scaleApplied: {
          [LogicalDemBand.ELEVATION]: { scale: 1.0, offset: 0.0 },
        },
      },
      extent,
      normalizedBands,
      cloudCoverPercentage: 0,
      acquisitionDate: rawStats.acquisitionDate,
      harmonizedAt: new Date().toISOString(),
    };
  }

  /**
   * Validates spatial grid, CRS, sensor track, and band compatibility between baseline and current datasets
   * before change detection or difference computation.
   */
  public validateCompatibility(
    baseline: HarmonizedDatasetDto,
    current: HarmonizedDatasetDto,
  ): DatasetCompatibilityResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Invariant 1: Strictly forbid cross-sensor track comparison (Optical vs SAR vs DEM)
    if (baseline.sensorType !== current.sensorType) {
      errors.push(
        `Incompatible sensor tracks: Baseline is ${baseline.sensorType} but Current is ${current.sensorType}. Cross-sensor comparison/subtraction is strictly forbidden.`,
      );
    }

    // Invariant 2: CRS alignment
    if (baseline.harmonization.targetCrs !== current.harmonization.targetCrs) {
      errors.push(
        `Incompatible CRS: Baseline is ${baseline.harmonization.targetCrs} while Current is ${current.harmonization.targetCrs}.`,
      );
    }

    // Invariant 3: Target resolution alignment
    if (baseline.harmonization.targetResolutionMeters !== current.harmonization.targetResolutionMeters) {
      errors.push(
        `Resolution mismatch: Baseline target resolution is ${baseline.harmonization.targetResolutionMeters}m but Current is ${current.harmonization.targetResolutionMeters}m.`,
      );
    }

    // Invariant 4: Band presence verification
    const baselineBands = Object.keys(baseline.normalizedBands);
    const currentBands = Object.keys(current.normalizedBands);
    for (const b of baselineBands) {
      if (!currentBands.includes(b)) {
        errors.push(`Missing normalized band ${b} in current dataset.`);
      }
    }

    // Cross-source alert/warning (e.g. S2 baseline vs Landsat current)
    const crossSource = baseline.source !== current.source;
    if (crossSource && baseline.sensorType === SensorType.OPTICAL) {
      warnings.push(
        `Cross-source optical comparison (${baseline.source} vs ${current.source}). Spatial resampling (${current.harmonization.nativeResolutionMeters}m -> ${current.harmonization.targetResolutionMeters}m) applied.`,
      );
    }

    const compatible = errors.length === 0;

    return {
      compatible,
      sensorTrack: baseline.sensorType,
      baselineSource: baseline.source,
      currentSource: current.source,
      targetResolutionMeters: baseline.harmonization.targetResolutionMeters,
      targetCrs: baseline.harmonization.targetCrs,
      crossSource,
      errors,
      warnings,
    };
  }

  private cloneBandSummary(b: BandZonalSummary): BandZonalSummary {
    return {
      mean: b.mean,
      median: b.median,
      min: b.min,
      max: b.max,
      validPixelCount: b.validPixelCount,
    };
  }

  private resampleBand(
    b: BandZonalSummary,
    fromRes: number,
    toRes: number,
  ): BandZonalSummary {
    const factor = Math.pow(fromRes / toRes, 2);
    return {
      mean: b.mean,
      median: b.median,
      min: b.min,
      max: b.max,
      validPixelCount: Math.round(b.validPixelCount * factor),
    };
  }
}
