import { SatelliteSource, type SarMetrics, type QualityMetrics } from '@tn-forest/shared/types';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export class SarImageProcessor {
  public static processSarImage(
    source: SatelliteSource,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawMetadata?: Record<string, any>,
    activeBaselineSarMetrics?: SarMetrics,
  ): { sarMetrics: SarMetrics; qualityMetrics: QualityMetrics } {
    if (source !== SatelliteSource.SENTINEL_1) {
      throw new AppError(
        `Source ${source} is an optical sensor and cannot be processed as SAR`,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // Zonal SAR backscatter values in dB for C-band SAR
    const zonal = rawMetadata?.zonalStatistics;
    const vv = Number((zonal?.VV?.mean !== undefined ? Number(zonal.VV.mean) : rawMetadata?.vv !== undefined ? Number(rawMetadata.vv) : -11.8).toFixed(2));
    const vh = Number((zonal?.VH?.mean !== undefined ? Number(zonal.VH.mean) : rawMetadata?.vh !== undefined ? Number(rawMetadata.vh) : -18.4).toFixed(2));

    // Cross-polarization ratio in linear or dB difference scale: vv / vh ratio
    // In dB domain, VV_dB - VH_dB represents structural volume scattering ratio
    const vvVhRatio = Number((vv - vh).toFixed(2));

    let vvDifference: number | undefined;
    let vhDifference: number | undefined;
    let ratioDifference: number | undefined;

    if (activeBaselineSarMetrics) {
      vvDifference = Number((vv - activeBaselineSarMetrics.vv).toFixed(2));
      vhDifference = Number((vh - activeBaselineSarMetrics.vh).toFixed(2));
      ratioDifference = Number((vvVhRatio - activeBaselineSarMetrics.vvVhRatio).toFixed(2));
    }

    const qualityMetrics: QualityMetrics = {
      cloudCover: 0.0, // SAR radar penetrates clouds
      validPixelPercentage: 100.0,
      zoneCoveragePercentage: 100.0,
      polarizationAvailable: rawMetadata?.polarization || 'VV+VH',
      acquisitionMode: rawMetadata?.acquisitionMode || 'IW',
      orbitDirection: rawMetadata?.orbitDirection || 'DESCENDING',
      imageQuality: 95.0,
    };

    return {
      sarMetrics: {
        vv,
        vh,
        vvVhRatio,
        vvDifference,
        vhDifference,
        ratioDifference,
      },
      qualityMetrics,
    };
  }
}
