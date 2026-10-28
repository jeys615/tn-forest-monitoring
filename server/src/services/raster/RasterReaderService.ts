import { GeoTiffService, type ParsedGeoTiffRaster, type GeoTiffMetadata } from './GeoTiffService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export interface OpticalRasterBands {
  blue: Float32Array;
  green: Float32Array;
  red: Float32Array;
  nir: Float32Array;
  swir1?: Float32Array;
  swir2?: Float32Array;
  qa?: Float32Array;
}

export interface SarRasterBands {
  vv: Float32Array;
  vh: Float32Array;
}

export interface ExtractedOpticalRaster {
  metadata: GeoTiffMetadata;
  bands: OpticalRasterBands;
  satellite: 'Sentinel-2' | 'Landsat-8' | 'Landsat-9';
  nativeResolution: number;
  width?: number;
  height?: number;
  crs?: string;
  transform?: [number, number, number, number, number, number];
  pixelSize?: [number, number];
  bounds?: [number, number, number, number];
  origin?: [number, number];
  nodata?: number | null;
}

export interface ExtractedSarRaster {
  metadata: GeoTiffMetadata;
  bands: SarRasterBands;
  satellite: 'Sentinel-1';
  nativeResolution: number;
  width?: number;
  height?: number;
  crs?: string;
  transform?: [number, number, number, number, number, number];
  pixelSize?: [number, number];
  bounds?: [number, number, number, number];
  origin?: [number, number];
  nodata?: number | null;
}

export class RasterReaderService {
  /**
   * Reads and maps optical bands from a GeoTIFF file with complete geospatial coordinate metadata.
   */
  public static async readOpticalRaster(
    filePath: string,
    satellite: 'Sentinel-2' | 'Landsat-8' | 'Landsat-9' = 'Sentinel-2',
  ): Promise<ExtractedOpticalRaster> {
    const parsed: ParsedGeoTiffRaster = await GeoTiffService.readGeoTiff(filePath);
    return RasterReaderService.readOpticalRasterFromParsed(parsed, satellite);
  }

  /**
   * Extracts optical bands and geospatial metadata from an already parsed GeoTIFF.
   */
  public static readOpticalRasterFromParsed(
    parsed: ParsedGeoTiffRaster,
    satellite: 'Sentinel-2' | 'Landsat-8' | 'Landsat-9' = 'Sentinel-2',
  ): ExtractedOpticalRaster {
    const { metadata, bandData } = parsed;

    if (bandData.length < 4) {
      throw new AppError(
        `Optical raster must contain at least 4 bands (Blue, Green, Red, NIR). Found ${bandData.length}.`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    const nativeResolution = metadata.pixelScale[0] || (satellite === 'Sentinel-2' ? 10 : 30);

    // Map bands by index convention:
    // Sentinel-2 L2A: 0: B2 (Blue), 1: B3 (Green), 2: B4 (Red), 3: B8 (NIR), 4: B11 (SWIR1), 5: B12 (SWIR2), 6: SCL
    // Landsat-8/9 C2 L2: 0: SR_B2 (Blue), 1: SR_B3 (Green), 2: SR_B4 (Red), 3: SR_B5 (NIR), 4: SR_B6 (SWIR1), 5: SR_B7 (SWIR2), 6: QA_PIXEL
    const blue = bandData[0];
    const green = bandData[1];
    const red = bandData[2];
    const nir = bandData[3];
    const swir1 = bandData.length > 4 ? bandData[4] : undefined;
    const swir2 = bandData.length > 5 ? bandData[5] : undefined;
    const qa = bandData.length > 6 ? bandData[6] : undefined;

    return {
      metadata,
      bands: {
        blue,
        green,
        red,
        nir,
        swir1,
        swir2,
        qa,
      },
      satellite,
      nativeResolution,
      width: metadata.width,
      height: metadata.height,
      crs: metadata.crs,
      transform: metadata.transform,
      pixelSize: metadata.pixelSize,
      bounds: metadata.bounds,
      origin: metadata.origin,
      nodata: metadata.nodata,
    };
  }

  /**
   * Reads and maps SAR bands (VV, VH) from a GeoTIFF file with complete geospatial coordinate metadata.
   */
  public static async readSarRaster(filePath: string): Promise<ExtractedSarRaster> {
    const parsed: ParsedGeoTiffRaster = await GeoTiffService.readGeoTiff(filePath);
    const { metadata, bandData } = parsed;

    if (bandData.length < 2) {
      throw new AppError(
        `SAR raster must contain at least 2 bands (VV, VH). Found ${bandData.length}.`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    const nativeResolution = metadata.pixelScale[0] || 10;
    const vv = bandData[0];
    const vh = bandData[1];

    return {
      metadata,
      bands: {
        vv,
        vh,
      },
      satellite: 'Sentinel-1',
      nativeResolution,
      width: metadata.width,
      height: metadata.height,
      crs: metadata.crs,
      transform: metadata.transform,
      pixelSize: metadata.pixelSize,
      bounds: metadata.bounds,
      origin: metadata.origin,
      nodata: metadata.nodata,
    };
  }
}
