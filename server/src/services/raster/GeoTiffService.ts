import fs from 'node:fs';
import zlib from 'node:zlib';
import * as GeoTIFF from 'geotiff';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { isMetricProjectedCrs, calculateDegreeToMeterPixelArea } from '../../utils/geo.js';

export interface GeoTiffMetadata {
  width: number;
  height: number;
  numBands: number;
  crs: string; // Active/normalized CRS for backwards compatibility
  originalCrs: string;
  normalizedCrs: string;
  areaCalculationCrs: string;
  pixelScale: [number, number, number];
  tiePoint: [number, number, number, number, number, number];
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  origin?: [number, number]; // [originX, originY] top-left coordinate
  transform?: [number, number, number, number, number, number]; // GDAL 6-element affine transform
  pixelSize?: [number, number]; // [scaleX, scaleY] in CRS units
  bounds?: [number, number, number, number]; // [minX, minY, maxX, maxY]
  nodata: number | null;
  bitsPerSample: number[];
  pixelAreaM2: number;
  isProjectedMetric: boolean;
  linearUnitScale?: number;
  linearUnitName?: string;
  resolutionMetersX?: number;
  resolutionMetersY?: number;
  hasAffineTransform?: boolean;
}

export interface ParsedGeoTiffRaster {
  metadata: GeoTiffMetadata;
  bandData: Float32Array[];
  bandNames: string[];
}

export class GeoTiffService {
  /**
   * Opens and parses a local GeoTIFF file.
   */
  public static async readGeoTiff(filePath: string): Promise<ParsedGeoTiffRaster> {
    if (!fs.existsSync(filePath)) {
      throw new AppError(`GeoTIFF file not found: ${filePath}`, HTTP_STATUS.NOT_FOUND);
    }
    const buffer = fs.readFileSync(filePath);
    return await GeoTiffService.readGeoTiffFromBuffer(buffer);
  }

  /**
   * Opens and parses GeoTIFF raster data from a Buffer or ArrayBuffer.
   */
  public static async readGeoTiffFromBuffer(buffer: Buffer | Uint8Array): Promise<ParsedGeoTiffRaster> {
    try {
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();

      const width = image.getWidth();
      const height = image.getHeight();
      const numBands = image.getSamplesPerPixel();
      const nodata = image.getGDALNoData();

      if (!width || !height || width <= 0 || height <= 0) {
        throw new AppError(
          `GeoTIFF contains invalid raster dimensions: ${width}x${height}.`,
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const fileDir = (typeof image.getFileDirectory === 'function' ? image.getFileDirectory() : (image as any).fileDirectory) as any;
      const actualized = fileDir?.actualizedFields;
      const geoKeys = typeof image.getGeoKeys === 'function' ? image.getGeoKeys() : (image as any).geoKeys;
      const asciiParams = fileDir?.GeoAsciiParamsTag || fileDir?.GeoAsciiParams || (actualized?.get?.(34737) as string) || '';

      // 1. CRS Extraction & Classification
      let originalCrs: string | null = null;
      let isProjected = false;
      let isGeographic = false;

      // Check explicit Projected CRS first
      if (geoKeys && geoKeys.ProjectedCSTypeGeoKey && geoKeys.ProjectedCSTypeGeoKey !== 32767) {
        originalCrs = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
        isProjected = true;
      }

      // Check citation tags / asciiParams for UTM or Projected definitions (which may accompany a GeographicTypeGeoKey)
      if (!isProjected) {
        const citation = `${geoKeys?.GTCitationGeoKey || ''} ${asciiParams || ''}`;
        const match = citation.match(/UTM\s*zone\s*(\d+)\s*([NS])/i);
        if (match) {
          const zone = parseInt(match[1], 10);
          const isNorth = match[2].toUpperCase() === 'N';
          originalCrs = `EPSG:${isNorth ? 32600 + zone : 32700 + zone}`;
          isProjected = true;
        }
      }

      // If not projected UTM, check for Geographic CRS
      if (!isProjected && !originalCrs) {
        if (geoKeys && geoKeys.GeographicTypeGeoKey && geoKeys.GeographicTypeGeoKey !== 32767) {
          originalCrs = `EPSG:${geoKeys.GeographicTypeGeoKey}`;
          isGeographic = true;
        } else if (geoKeys && geoKeys.GTModelTypeGeoKey === 2) {
          originalCrs = 'EPSG:4326';
          isGeographic = true;
        } else if (geoKeys && geoKeys.GTModelTypeGeoKey === 1) {
          isProjected = true;
        } else if (/WGS\s*84/i.test(String(asciiParams))) {
          originalCrs = 'EPSG:4326';
          isGeographic = true;
        }
      }

      if (!originalCrs) {
        throw new AppError(
          'GeoTIFF lacks spatial coordinate reference system (CRS) georeferencing metadata. Fallback guessing is prohibited.',
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const isProjectedMetric = isMetricProjectedCrs(originalCrs);
      if (isProjectedMetric) {
        isProjected = true;
      }

      // 2. Linear Unit Scale for Projected Systems
      let linearUnitScale = 1.0;
      let linearUnitName = 'Linear_Meter';
      if (isProjected && geoKeys) {
        const projLinearUnits = geoKeys.ProjLinearUnitsGeoKey;
        const projLinearUnitSize = geoKeys.ProjLinearUnitSizeGeoKey;
        if (projLinearUnitSize && typeof projLinearUnitSize === 'number' && projLinearUnitSize > 0) {
          linearUnitScale = projLinearUnitSize;
          linearUnitName = `Custom_Unit_${projLinearUnitSize}m`;
        } else if (projLinearUnits) {
          switch (projLinearUnits) {
            case 9001: // Meter
              linearUnitScale = 1.0;
              linearUnitName = 'Linear_Meter';
              break;
            case 9002: // Foot
              linearUnitScale = 0.3048;
              linearUnitName = 'Linear_Foot';
              break;
            case 9003: // US Survey Foot
              linearUnitScale = 1200 / 3937; // ~0.3048006096012192
              linearUnitName = 'Linear_Foot_US_Survey';
              break;
            case 9004: // Modified American Foot
              linearUnitScale = 0.304812252984506;
              linearUnitName = 'Linear_Foot_Modified_American';
              break;
            case 9005: // Clarke Foot
              linearUnitScale = 0.3047972654;
              linearUnitName = 'Linear_Foot_Clarke';
              break;
            case 9006: // Chain
              linearUnitScale = 20.1168;
              linearUnitName = 'Linear_Chain';
              break;
            case 9007: // Yard
              linearUnitScale = 0.9144;
              linearUnitName = 'Linear_Yard';
              break;
            case 9008: // Indian Yard
              linearUnitScale = 0.9143985307444408;
              linearUnitName = 'Linear_Yard_Indian';
              break;
            case 9014: // Fathom
              linearUnitScale = 1.8288;
              linearUnitName = 'Linear_Fathom';
              break;
            case 9036: // Kilometer
              linearUnitScale = 1000.0;
              linearUnitName = 'Linear_Kilometer';
              break;
            default:
              linearUnitScale = 1.0;
              linearUnitName = `ProjLinearUnits_${projLinearUnits}`;
              break;
          }
        }
      }

      // 3. Georeferencing, Resolution, and Affine Transformation
      const rawTransform = actualized?.get?.(34264) || fileDir?.ModelTransformationTag || fileDir?.ModelTransformation;
      const rawPixelScale = actualized?.get?.(33550) || fileDir?.ModelPixelScaleTag || fileDir?.ModelPixelScale;
      const rawTiepoint = actualized?.get?.(33922) || fileDir?.ModelTiepointTag || fileDir?.ModelTiepoint;

      const transformArr: number[] | null = rawTransform ? Array.from(rawTransform as ArrayLike<number>) : null;
      const pixelScaleArr: number[] | null = rawPixelScale ? Array.from(rawPixelScale as ArrayLike<number>) : null;
      const tiepointArr: number[] | null = rawTiepoint ? Array.from(rawTiepoint as ArrayLike<number>) : null;

      let scaleX = 0;
      let scaleY = 0;
      let originX = 0;
      let originY = 0;
      let det = 0;
      let hasAffineTransform = false;
      let transform: [number, number, number, number, number, number] | undefined;

      let rawBbox: number[] | null = null;
      try {
        rawBbox = image.getBoundingBox();
      } catch {
        rawBbox = null;
      }

      if (transformArr && transformArr.length >= 16) {
        // 4x4 affine matrix [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p]
        hasAffineTransform = true;
        const a = Number(transformArr[0]);
        const b = Number(transformArr[1]);
        const d = Number(transformArr[3]);
        const e = Number(transformArr[4]);
        const f = Number(transformArr[5]);
        const h = Number(transformArr[7]);

        det = Math.abs(a * f - b * e);
        if (isNaN(det) || det <= 0) {
          throw new AppError(
            `GeoTIFF ModelTransformation matrix has non-positive or invalid determinant: ${det}.`,
            HTTP_STATUS.BAD_REQUEST,
          );
        }
        scaleX = Math.sqrt(a * a + e * e);
        scaleY = Math.sqrt(b * b + f * f);
        originX = d;
        originY = h;
        transform = [d, a, b, h, e, f];
      } else {
        let resArr: number[] | null = null;
        try {
          resArr = image.getResolution();
        } catch {
          resArr = null;
        }

        if ((!resArr || resArr.length < 2 || resArr[0] === 0 || resArr[1] === 0) && pixelScaleArr && pixelScaleArr.length >= 2) {
          resArr = [pixelScaleArr[0], -pixelScaleArr[1], pixelScaleArr[2] || 0];
        }

        let origArr: number[] | null = null;
        try {
          origArr = image.getOrigin();
        } catch {
          origArr = null;
        }

        if ((!origArr || origArr.length < 2) && tiepointArr && tiepointArr.length >= 6) {
          origArr = [tiepointArr[3], tiepointArr[4], tiepointArr[5]];
        }

        if (!resArr || resArr.length < 2 || isNaN(resArr[0]) || isNaN(resArr[1])) {
          throw new AppError(
            'GeoTIFF lacks spatial pixel scale / resolution georeferencing tags. Fallback guessing is prohibited.',
            HTTP_STATUS.BAD_REQUEST,
          );
        }

        scaleX = Math.abs(resArr[0]);
        scaleY = Math.abs(resArr[1]);
        det = scaleX * scaleY;

        if (scaleX <= 0 || scaleY <= 0 || isNaN(det) || det <= 0) {
          throw new AppError(
            `GeoTIFF contains invalid pixel dimensions (${scaleX} x ${scaleY}). Resolution must be strictly positive.`,
            HTTP_STATUS.BAD_REQUEST,
          );
        }

        originX = origArr && origArr.length >= 2 ? origArr[0] : (rawBbox ? rawBbox[0] : 0);
        originY = origArr && origArr.length >= 2 ? origArr[1] : (rawBbox ? rawBbox[3] : 0);
        transform = [originX, scaleX, 0, originY, 0, -scaleY];
      }

      const bbox: [number, number, number, number] = rawBbox && rawBbox.length >= 4 && !rawBbox.some(isNaN)
        ? [rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]]
        : [originX, originY - scaleY * height, originX + scaleX * width, originY];

      // 4. Ground Pixel Area and Metric Resolution Computation
      let pixelAreaM2 = 0;
      let resolutionMetersX = 0;
      let resolutionMetersY = 0;
      let normalizedCrs = originalCrs;
      let areaCalculationCrs = originalCrs;

      if (isProjected) {
        pixelAreaM2 = Number((det * linearUnitScale * linearUnitScale).toFixed(4));
        resolutionMetersX = Number((scaleX * linearUnitScale).toFixed(4));
        resolutionMetersY = Number((scaleY * linearUnitScale).toFixed(4));
        normalizedCrs = originalCrs;
        areaCalculationCrs = originalCrs;
      } else {
        // Geographic CRS (EPSG:4326): calculate ground area geodesically at raster latitude
        const centerLat = (bbox[1] + bbox[3]) / 2;
        const centerLng = (bbox[0] + bbox[2]) / 2;
        if (isNaN(centerLat) || centerLat < -90 || centerLat > 90) {
          throw new AppError(
            `Invalid geographic latitude (${centerLat}) in GeoTIFF metadata.`,
            HTTP_STATUS.BAD_REQUEST,
          );
        }
        const zoneNum = Math.floor((centerLng + 180) / 6) + 1;
        const targetUtm = `EPSG:${centerLat >= 0 ? 32600 + zoneNum : 32700 + zoneNum}`;
        normalizedCrs = targetUtm;
        areaCalculationCrs = targetUtm;

        const metricCalc = calculateDegreeToMeterPixelArea(scaleX, scaleY, centerLat);
        const degM2 = scaleX * scaleY;
        const rotationFactor = degM2 > 0 ? det / degM2 : 1.0;
        pixelAreaM2 = Number((metricCalc.pixelAreaM2 * rotationFactor).toFixed(4));
        resolutionMetersX = metricCalc.meterX;
        resolutionMetersY = metricCalc.meterY;
      }

      if (pixelAreaM2 <= 0 || isNaN(pixelAreaM2) || !isFinite(pixelAreaM2)) {
        throw new AppError(
          `Calculated pixel area is invalid (${pixelAreaM2} m²). Spatial metadata is corrupt.`,
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const metadata: GeoTiffMetadata = {
        width,
        height,
        numBands,
        crs: normalizedCrs,
        originalCrs,
        normalizedCrs,
        areaCalculationCrs,
        pixelScale: [scaleX, scaleY, 0],
        tiePoint: [0, 0, 0, originX, originY, 0],
        bbox,
        origin: [originX, originY],
        transform,
        pixelSize: [scaleX, scaleY],
        bounds: bbox,
        nodata: nodata !== null ? Number(nodata) : null,
        bitsPerSample: Array.isArray(image.getBitsPerSample())
          ? (image.getBitsPerSample() as unknown as number[])
          : [Number(image.getBitsPerSample()) || 32],
        pixelAreaM2,
        isProjectedMetric,
        linearUnitScale,
        linearUnitName,
        resolutionMetersX,
        resolutionMetersY,
        hasAffineTransform,
      };

      const rasters = await image.readRasters({ interleave: false });
      const bandData: Float32Array[] = [];

      for (let i = 0; i < numBands; i++) {
        const rawBand = rasters[i];
        if (rawBand instanceof Float32Array) {
          bandData.push(rawBand);
        } else if (rawBand instanceof Float64Array || rawBand instanceof Uint16Array || rawBand instanceof Int16Array || rawBand instanceof Uint8Array) {
          bandData.push(new Float32Array(rawBand));
        } else if (Array.isArray(rawBand)) {
          bandData.push(new Float32Array(rawBand));
        } else {
          bandData.push(new Float32Array(width * height));
        }
      }

      // Default band naming if unspecified
      const bandNames: string[] = [];
      for (let i = 0; i < numBands; i++) {
        bandNames.push(`Band_${i + 1}`);
      }

      return {
        metadata,
        bandData,
        bandNames,
      };
    } catch (err) {
      throw new AppError(
        `Failed to parse GeoTIFF: ${err instanceof Error ? err.message : String(err)}`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }
  }

  /**
   * Computes mean spectral indices (NDVI, NDWI, NDBI) from parsed GeoTIFF bands.
   */
  public static calculateSpectralIndices(
    parsed: ParsedGeoTiffRaster,
    options?: { satellite?: string },
  ): {
    ndvi: number;
    ndwi: number;
    ndbi: number;
    pixelCount: number;
  } {
    const { metadata, bandData } = parsed;
    const totalPixels = metadata.width * metadata.height;
    if (totalPixels === 0 || bandData.length < 4) {
      throw new AppError(
        `Insufficient raster data for spectral index calculation (bands: ${bandData.length}, pixels: ${totalPixels})`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    // Band index layout:
    // Sentinel-2 export: B2 (0), B3 (1), B4 (2), B8 (3), B11 (4), B12 (5)
    // Landsat export: SR_B2 (0), SR_B3 (1), SR_B4 (2), SR_B5 (3), SR_B6 (4), SR_B7 (5)
    const rawRed = bandData[2]; // B4 / Red
    const rawNir = bandData[3]; // B8 / NIR
    const rawSwir = bandData.length > 4 ? bandData[4] : null; // B11 / SWIR1

    // Inspect peak value to detect if data is already in [0.0, 1.0] float reflectance
    let maxV = 0;
    for (let i = 0; i < totalPixels; i++) {
      const v = rawRed[i];
      if (v > 0 && !isNaN(v)) {
        if (v > maxV) maxV = v;
      }
    }
    const isFloat = maxV <= 1.5 && maxV > 0;

    const sat = (options?.satellite || '').trim();
    const isExplicitLandsat = /landsat/i.test(sat);
    const isExplicitHls = /hls/i.test(sat);
    const isExplicitSentinel = /sentinel|s2/i.test(sat);

    let isLandsat = false;
    if (isExplicitLandsat) {
      isLandsat = true;
    } else if (isExplicitHls) {
      isLandsat = false;
    } else if (isExplicitSentinel) {
      isLandsat = false;
    } else if (!isFloat && !sat) {
      // Sensor metadata is unavailable. Handle explicitly: default to Sentinel-2 (the primary operational sensor)
      // rather than silently inferring Landsat from pixel magnitude (which misclassified Sentinel-2 scenes with clouds).
      console.warn(
        `[GeoTiffService] Sensor metadata not provided for spectral-index calculation on integer raster. Defaulting explicitly to Sentinel-2 L2A scaling (DN * 0.0001). Specify { satellite: string } to override.`,
      );
    }

    let sumNdvi = 0;
    let sumNdwi = 0;
    let sumNdbi = 0;
    let validCount = 0;

    for (let i = 0; i < totalPixels; i++) {
      let red = rawRed[i];
      let nir = rawNir[i];
      let swir = rawSwir ? rawSwir[i] : 0;

      if ((red === 0 && nir === 0) || isNaN(red) || isNaN(nir)) continue;

      if (isLandsat) {
        red = red > 10 ? Math.max(0, red * 0.0000275 - 0.2) : red;
        nir = nir > 10 ? Math.max(0, nir * 0.0000275 - 0.2) : nir;
        swir = rawSwir && swir > 10 ? Math.max(0, swir * 0.0000275 - 0.2) : swir;
      } else if (!isFloat) {
        red = red * 0.0001;
        nir = nir * 0.0001;
        swir = rawSwir ? swir * 0.0001 : 0;
      }

      if (nir + red > 0) {
        const ndviVal = (nir - red) / (nir + red);
        sumNdvi += Math.max(-1, Math.min(1, ndviVal));
        validCount++;
      }
      if (rawSwir && nir + swir > 0) {
        const ndwiVal = (nir - swir) / (nir + swir);
        const ndbiVal = (swir - nir) / (swir + nir);
        sumNdwi += Math.max(-1, Math.min(1, ndwiVal));
        sumNdbi += Math.max(-1, Math.min(1, ndbiVal));
      }
    }

    const count = validCount > 0 ? validCount : totalPixels;
    const ndvi = Number((sumNdvi / count).toFixed(3));
    const ndwi = rawSwir ? Number((sumNdwi / count).toFixed(3)) : 0;
    const ndbi = rawSwir ? Number((sumNdbi / count).toFixed(3)) : 0;

    console.info(`[PROCESSING] NDVI: SUCCESS`);
    console.info(`[PROCESSING] NDWI: SUCCESS`);
    console.info(`[PROCESSING] NDBI: SUCCESS`);

    return { ndvi, ndwi, ndbi, pixelCount: count };
  }

  /**
   * Generates a valid multi-band sample GeoTIFF buffer with realistic spectral bands.
   * Useful for testing, offline execution, and integration fixtures.
   */
  public static async createSampleGeoTiff(params: {
    width?: number;
    height?: number;
    sensor?: 'Sentinel-2' | 'Landsat-8' | 'Sentinel-1';
    ndviMean?: number;
    changedPixelCount?: number;
  }): Promise<Buffer> {
    const width = params.width || 40;
    const height = params.height || 37; // ~1480 pixels
    const totalPixels = width * height;
    const sensor = params.sensor || 'Sentinel-2';
    const baseNdvi = params.ndviMean || 0.664;
    const changedCount = params.changedPixelCount !== undefined ? params.changedPixelCount : 10;

    // Create realistic Sentinel-2 bands: B2(Blue), B3(Green), B4(Red), B8(NIR), B11(SWIR1), B12(SWIR2), SCL
    const numBands = sensor === 'Sentinel-1' ? 2 : 7;
    const values = new Float32Array(totalPixels * numBands);

    // Band index offsets
    // NIR = 0.40, Red = 0.08 => NDVI = (0.40 - 0.08) / (0.40 + 0.08) = 0.32 / 0.48 = 0.666
    const b2Val = 0.04;
    const b3Val = 0.06;
    const b4Val = 0.08;
    const b8Val = b4Val * ((1 + baseNdvi) / (1 - baseNdvi)); // Derive exact NIR for desired NDVI
    const b11Val = 0.12;
    const b12Val = 0.06;
    const sclVal = 4.0; // 4 = Vegetation in Sentinel-2 SCL

    for (let p = 0; p < totalPixels; p++) {
      const isChanged = p < changedCount;
      const red = isChanged ? b4Val + 0.06 : b4Val;
      const nir = isChanged ? b8Val - 0.08 : b8Val;

      if (sensor === 'Sentinel-1') {
        values[p * 2 + 0] = isChanged ? -14.5 : -12.0; // VV
        values[p * 2 + 1] = isChanged ? -20.2 : -18.0; // VH
      } else {
        values[p * 7 + 0] = b2Val; // Blue
        values[p * 7 + 1] = b3Val; // Green
        values[p * 7 + 2] = red; // Red
        values[p * 7 + 3] = nir; // NIR
        values[p * 7 + 4] = b11Val; // SWIR1
        values[p * 7 + 5] = b12Val; // SWIR2
        values[p * 7 + 6] = sclVal; // SCL
      }
    }

    const metadata = {
      height,
      width,
      GeoAsciiParams: 'WGS 84 / UTM zone 44N',
      ModelPixelScale: [10.0, 10.0, 0.0],
      ModelTiepoint: [0.0, 0.0, 0.0, 78.053, 9.655, 0.0],
      GDAL_NODATA: '-9999',
    };

    const arrayBuffer = await GeoTIFF.writeArrayBuffer(values, metadata);
    return Buffer.from(arrayBuffer);
  }

  /**
   * Reads a local GeoTIFF file and converts its spectral bands into an authentic 8-bit true-color PNG buffer.
   */
  public static async renderTrueColorPng(
    filePath: string,
    options?: { satellite?: string; minPercentile?: number; maxPercentile?: number; gamma?: number },
  ): Promise<Buffer> {
    if (!fs.existsSync(filePath)) {
      throw new AppError(`GeoTIFF raster file not found: ${filePath}`, HTTP_STATUS.NOT_FOUND);
    }
    const buffer = fs.readFileSync(filePath);
    return await GeoTiffService.renderTrueColorPngFromBuffer(buffer, options);
  }

  /**
   * Converts GeoTIFF raw raster buffer into an authentic 8-bit true-color PNG buffer.
   * Resolves sensor-specific spectral bands (Landsat SR_B4/B3/B2 or Sentinel-2 B4/B3/B2),
   * applies sensor physical scale and offset (Landsat C2 L2: DN * 0.0000275 - 0.2, Sentinel-2: DN * 0.0001),
   * preserves transparent NoData for pixels outside the zone/fill,
   * and performs robust 2%-98% percentile dynamic range contrast stretching with gentle gamma correction.
   */
  /**
   * Renders a dedicated SAR backscatter PNG (grayscale) for VV or VH polarization.
   * Excludes NoData/NaN/Infinite pixels from percentile computation and renders them transparently.
   * Performs robust 2% - 98% percentile stretching in decibel (dB) space.
   */
  public static async renderSarPng(
    filePathOrParsed: string | ParsedGeoTiffRaster | Buffer | Uint8Array,
    options?: {
      band?: 'VV' | 'VH';
      minPercentile?: number;
      maxPercentile?: number;
      gamma?: number;
    },
  ): Promise<Buffer> {
    let parsed: ParsedGeoTiffRaster;
    if (typeof filePathOrParsed === 'string') {
      parsed = await GeoTiffService.readGeoTiff(filePathOrParsed);
    } else if (Buffer.isBuffer(filePathOrParsed) || filePathOrParsed instanceof Uint8Array) {
      parsed = await GeoTiffService.readGeoTiffFromBuffer(filePathOrParsed);
    } else {
      parsed = filePathOrParsed;
    }

    const { metadata, bandData } = parsed;
    const { width, height } = metadata;
    const totalPixels = width * height;

    if (totalPixels === 0 || bandData.length === 0) {
      throw new AppError('SAR raster contains no pixel data for rendering', HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    // Select band: Band 0 is VV, Band 1 is VH (if available)
    const bandIdx = options?.band === 'VH' && bandData.length >= 2 ? 1 : 0;
    const rawData = bandData[bandIdx];
    const nodata = metadata.nodata !== null ? Number(metadata.nodata) : null;

    // Determine value representation (dB vs Linear Power)
    const sampleVals: number[] = [];
    const step = Math.max(1, Math.floor(totalPixels / 5000));
    for (let i = 0; i < totalPixels && sampleVals.length < 5000; i += step) {
      const v = rawData[i];
      if (!isNaN(v) && isFinite(v) && (nodata === null || v !== nodata)) {
        sampleVals.push(v);
      }
    }
    sampleVals.sort((a, b) => a - b);
    const sampleMedian = sampleVals.length > 0 ? sampleVals[Math.floor(sampleVals.length / 2)] : 0;
    const isLinear = sampleVals.length > 0 && sampleVals[0] >= 0 && sampleMedian < 1.0 && sampleMedian > 0;

    const validValues: number[] = [];
    const dbValues = new Float32Array(totalPixels);
    const validMask = new Uint8Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const v = rawData[i];
      if (isNaN(v) || !isFinite(v) || (nodata !== null && v === nodata)) {
        validMask[i] = 0;
        continue;
      }

      let valDb: number;
      if (isLinear) {
        valDb = 10 * Math.log10(Math.max(1e-7, v));
      } else {
        valDb = v;
      }

      validValues.push(valDb);
      dbValues[i] = valDb;
      validMask[i] = 1;
    }

    if (validValues.length === 0) {
      // Entire raster is nodata - return transparent PNG
      const transparentRgba = Buffer.alloc(totalPixels * 4);
      return GeoTiffService.encodeRgbaPng(width, height, transparentRgba);
    }

    // Sort valid dB values to calculate robust 2% to 98% percentile stretch
    validValues.sort((a, b) => a - b);
    const pMin = options?.minPercentile !== undefined ? options.minPercentile : 0.02;
    const pMax = options?.maxPercentile !== undefined ? options.maxPercentile : 0.98;

    const pMinIdx = Math.floor(validValues.length * pMin);
    const pMaxIdx = Math.min(validValues.length - 1, Math.floor(validValues.length * pMax));

    const minDb = validValues[pMinIdx];
    const maxDb = Math.max(minDb + 1.0, validValues[pMaxIdx]);

    const gamma = options?.gamma || 1.0;

    const rgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        // Transparent for NoData
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0;
        continue;
      }

      const valDb = dbValues[i];
      let scaled = (valDb - minDb) / (maxDb - minDb);
      scaled = Math.max(0, Math.min(1.0, scaled));

      if (gamma !== 1.0) {
        scaled = Math.pow(scaled, 1.0 / gamma);
      }

      const intensity = Math.round(scaled * 255);
      rgba[i * 4 + 0] = intensity;
      rgba[i * 4 + 1] = intensity;
      rgba[i * 4 + 2] = intensity;
      rgba[i * 4 + 3] = 255; // Opaque
    }

    return GeoTiffService.encodeRgbaPng(width, height, rgba);
  }

  /**
   * Renders a harmonized SAR backscatter grid (Float32Array in dB) directly to PNG buffer
   * on canonical AnalysisGrid dimensions, applying 2%-98% percentile stretch and transparent NoData.
   */
  public static async encodeSarGridToPng(
    gridData: Float32Array,
    validMask: Uint8Array,
    width: number,
    height: number,
    options?: {
      minPercentile?: number;
      maxPercentile?: number;
      gamma?: number;
    },
  ): Promise<Buffer> {
    const totalPixels = width * height;
    if (totalPixels === 0 || gridData.length !== totalPixels) {
      throw new AppError('Invalid SAR grid data dimensions for PNG encoding', HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    const validValues: number[] = [];
    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 1) {
        const v = gridData[i];
        if (!isNaN(v) && isFinite(v)) {
          validValues.push(v);
        }
      }
    }

    if (validValues.length === 0) {
      const transparentRgba = Buffer.alloc(totalPixels * 4);
      return GeoTiffService.encodeRgbaPng(width, height, transparentRgba);
    }

    validValues.sort((a, b) => a - b);
    const pMin = options?.minPercentile !== undefined ? options.minPercentile : 0.02;
    const pMax = options?.maxPercentile !== undefined ? options.maxPercentile : 0.98;

    const pMinIdx = Math.floor(validValues.length * pMin);
    const pMaxIdx = Math.min(validValues.length - 1, Math.floor(validValues.length * pMax));

    const minDb = validValues[pMinIdx];
    const maxDb = Math.max(minDb + 1.0, validValues[pMaxIdx]);
    const gamma = options?.gamma || 1.0;

    const rgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0;
        continue;
      }

      const valDb = gridData[i];
      if (isNaN(valDb) || !isFinite(valDb)) {
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0;
        continue;
      }

      let scaled = (valDb - minDb) / (maxDb - minDb);
      scaled = Math.max(0, Math.min(1.0, scaled));

      if (gamma !== 1.0) {
        scaled = Math.pow(scaled, 1.0 / gamma);
      }

      const intensity = Math.round(scaled * 255);
      rgba[i * 4 + 0] = intensity;
      rgba[i * 4 + 1] = intensity;
      rgba[i * 4 + 2] = intensity;
      rgba[i * 4 + 3] = 255; // Opaque
    }

    return GeoTiffService.encodeRgbaPng(width, height, rgba);
  }

  /**
   * Encodes harmonized Optical RGB pixel arrays on a canonical AnalysisGrid directly into a PNG Buffer.
   * Ensures identical dimensions and spatial coordinate registration for the Curtain Slider viewer.
   */
  public static encodeOpticalGridToPng(
    red: Float32Array,
    green: Float32Array,
    blue: Float32Array,
    validMask: Uint8Array,
    width: number,
    height: number,
    options?: { satellite?: string; minPercentile?: number; maxPercentile?: number; gamma?: number },
  ): Buffer {
    const totalPixels = width * height;
    const validRedValues: number[] = [];
    const validGreenValues: number[] = [];
    const validBlueValues: number[] = [];

    let maxVal = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 1 && red[i] > maxVal) maxVal = red[i];
    }
    const isAlreadyNormalized = maxVal <= 1.5 && maxVal > 0;
    const isLandsat = options?.satellite && /landsat/i.test(options.satellite);

    const normR = new Float32Array(totalPixels);
    const normG = new Float32Array(totalPixels);
    const normB = new Float32Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0 || isNaN(red[i]) || isNaN(green[i]) || isNaN(blue[i])) {
        continue;
      }
      let r = red[i];
      let g = green[i];
      let b = blue[i];

      if (!isAlreadyNormalized) {
        if (isLandsat) {
          r = r * 0.0000275 - 0.2;
          g = g * 0.0000275 - 0.2;
          b = b * 0.0000275 - 0.2;
        } else {
          r = r * 0.0001;
          g = g * 0.0001;
          b = b * 0.0001;
        }
      }
      r = Math.max(0, Math.min(1.0, r));
      g = Math.max(0, Math.min(1.0, g));
      b = Math.max(0, Math.min(1.0, b));

      normR[i] = r;
      normG[i] = g;
      normB[i] = b;

      validRedValues.push(r);
      validGreenValues.push(g);
      validBlueValues.push(b);
    }

    if (validRedValues.length === 0) {
      const transparentRgba = Buffer.alloc(totalPixels * 4);
      return GeoTiffService.encodeRgbaPng(width, height, transparentRgba);
    }

    validRedValues.sort((a, b) => a - b);
    validGreenValues.sort((a, b) => a - b);
    validBlueValues.sort((a, b) => a - b);

    const pMin = options?.minPercentile !== undefined ? options.minPercentile : 0.02;
    const pMax = options?.maxPercentile !== undefined ? options.maxPercentile : 0.98;

    const pMinIdx = Math.floor(validRedValues.length * pMin);
    const pMaxIdx = Math.min(validRedValues.length - 1, Math.floor(validRedValues.length * pMax));

    const rMin = validRedValues[pMinIdx];
    const rMax = Math.max(rMin + 0.05, validRedValues[pMaxIdx]);
    const gMin = validGreenValues[pMinIdx];
    const gMax = Math.max(gMin + 0.05, validGreenValues[pMaxIdx]);
    const bMin = validBlueValues[pMinIdx];
    const bMax = Math.max(bMin + 0.05, validBlueValues[pMaxIdx]);

    const gamma = options?.gamma || 1.1;

    const rgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0 || isNaN(red[i])) {
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0; // Transparent
        continue;
      }

      let rScaled = (normR[i] - rMin) / (rMax - rMin);
      let gScaled = (normG[i] - gMin) / (gMax - gMin);
      let bScaled = (normB[i] - bMin) / (bMax - bMin);

      rScaled = Math.max(0, Math.min(1.0, rScaled));
      gScaled = Math.max(0, Math.min(1.0, gScaled));
      bScaled = Math.max(0, Math.min(1.0, bScaled));

      if (gamma !== 1.0) {
        rScaled = Math.pow(rScaled, 1.0 / gamma);
        gScaled = Math.pow(gScaled, 1.0 / gamma);
        bScaled = Math.pow(bScaled, 1.0 / gamma);
      }

      rgba[i * 4 + 0] = Math.round(rScaled * 255);
      rgba[i * 4 + 1] = Math.round(gScaled * 255);
      rgba[i * 4 + 2] = Math.round(bScaled * 255);
      rgba[i * 4 + 3] = 255;
    }

    return GeoTiffService.encodeRgbaPng(width, height, rgba);
  }

  /**
   * Converts GeoTIFF raw raster buffer into an authentic 8-bit true-color PNG buffer.
   * Resolves sensor-specific spectral bands (Landsat SR_B4/B3/B2 or Sentinel-2 B4/B3/B2),
   * applies sensor physical scale and offset (Landsat C2 L2: DN * 0.0000275 - 0.2, Sentinel-2: DN * 0.0001),
   * preserves transparent NoData for pixels outside the zone/fill,
   * and performs robust 2%-98% percentile dynamic range contrast stretching with gentle gamma correction.
   */
  public static async renderTrueColorPngFromBuffer(
    buffer: Buffer | Uint8Array,
    options?: { satellite?: string; minPercentile?: number; maxPercentile?: number; gamma?: number },
  ): Promise<Buffer> {
    const parsed = await GeoTiffService.readGeoTiffFromBuffer(buffer);
    const { metadata, bandData } = parsed;
    const { width, height } = metadata;
    const totalPixels = width * height;

    if (totalPixels === 0 || bandData.length === 0) {
      throw new AppError('Raster contains no pixel data for rendering', HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }

    // If SAR data (Sentinel-1 or 2-band radar), delegate to dedicated SAR renderer
    const isExplicitSar =
      options?.satellite === 'Sentinel-1' ||
      options?.satellite === 'SENTINEL_1' ||
      (bandData.length === 2 &&
        !options?.satellite?.toLowerCase().includes('landsat') &&
        !options?.satellite?.toLowerCase().includes('sentinel-2'));

    if (isExplicitSar) {
      return GeoTiffService.renderSarPng(parsed, {
        band: 'VV',
        minPercentile: options?.minPercentile,
        maxPercentile: options?.maxPercentile,
        gamma: options?.gamma,
      });
    }

    let rawRed: Float32Array;
    let rawGreen: Float32Array;
    let rawBlue: Float32Array;

    if (bandData.length >= 6) {
      // Sentinel-2 or Landsat export layout: B2/SR_B2 (0, Blue), B3/SR_B3 (1, Green), B4/SR_B4 (2, Red)
      rawRed = bandData[2];
      rawGreen = bandData[1];
      rawBlue = bandData[0];
    } else if (bandData.length >= 3) {
      // Generic RGB layout: 0=Red, 1=Green, 2=Blue
      rawRed = bandData[0];
      rawGreen = bandData[1];
      rawBlue = bandData[2];
    } else {
      // Grayscale layout (single band)
      rawRed = bandData[0];
      rawGreen = bandData[0];
      rawBlue = bandData[0];
    }

    // Inspect non-zero values to detect if data is already in [0.0, 1.0] float reflectance
    let maxRawVal = 0;
    for (let i = 0; i < totalPixels; i++) {
      const v = rawRed[i];
      if (v > 0 && !isNaN(v)) {
        if (v > maxRawVal) maxRawVal = v;
      }
    }

    const sat = (options?.satellite || '').trim();
    const isExplicitLandsat = /landsat/i.test(sat);
    const isExplicitSentinel = /sentinel|s2/i.test(sat);
    const isFloatReflectance = maxRawVal <= 1.5 && maxRawVal > 0;

    let isLandsatScale = false;
    if (isExplicitLandsat) {
      isLandsatScale = true;
    } else if (!isExplicitSentinel && !isFloatReflectance && !sat) {
      // Sensor metadata is unavailable: default explicitly to Sentinel-2 scaling (DN * 0.0001)
      // rather than guessing from pixel magnitude (which caused clouded Sentinel-2 scenes to render black).
      console.warn(
        `[GeoTiffService] Sensor metadata not provided for PNG rendering. Defaulting explicitly to Sentinel-2 L2A scaling (DN * 0.0001). Specify { satellite: string } to override.`,
      );
    }

    // Convert raw bands to calibrated physical surface reflectance [0.0, 1.0]
    const redRefl = new Float32Array(totalPixels);
    const greenRefl = new Float32Array(totalPixels);
    const blueRefl = new Float32Array(totalPixels);
    const validMask = new Uint8Array(totalPixels);

    const validRedValues: number[] = [];
    const validGreenValues: number[] = [];
    const validBlueValues: number[] = [];

    const gdalNodata = metadata.nodata;

    for (let i = 0; i < totalPixels; i++) {
      const r = rawRed[i];
      const g = rawGreen[i];
      const b = rawBlue[i];

      const isNodata =
        isNaN(r) || isNaN(g) || isNaN(b) ||
        (gdalNodata !== null && r === Number(gdalNodata)) ||
        (r === 0 && g === 0 && b === 0);

      if (isNodata) {
        validMask[i] = 0;
        continue;
      }

      let rNorm: number;
      let gNorm: number;
      let bNorm: number;

      if (isLandsatScale) {
        // Landsat Collection 2 Level 2 Surface Reflectance scaling: DN * 0.0000275 - 0.2
        rNorm = r * 0.0000275 - 0.2;
        gNorm = g * 0.0000275 - 0.2;
        bNorm = b * 0.0000275 - 0.2;
      } else if (isFloatReflectance) {
        rNorm = r;
        gNorm = g;
        bNorm = b;
      } else {
        // Sentinel-2 L2A raw integers: DN * 0.0001
        rNorm = r * 0.0001;
        gNorm = g * 0.0001;
        bNorm = b * 0.0001;
      }

      rNorm = Math.max(0, Math.min(1.0, rNorm));
      gNorm = Math.max(0, Math.min(1.0, gNorm));
      bNorm = Math.max(0, Math.min(1.0, bNorm));

      redRefl[i] = rNorm;
      greenRefl[i] = gNorm;
      blueRefl[i] = bNorm;
      validMask[i] = 1;

      validRedValues.push(rNorm);
      validGreenValues.push(gNorm);
      validBlueValues.push(bNorm);
    }

    if (validRedValues.length === 0) {
      // Entire raster is nodata - return transparent PNG
      const transparentRgba = Buffer.alloc(totalPixels * 4);
      return GeoTiffService.encodeRgbaPng(width, height, transparentRgba);
    }

    // Robust percentile stretching (2% to 98%)
    validRedValues.sort((a, b) => a - b);
    validGreenValues.sort((a, b) => a - b);
    validBlueValues.sort((a, b) => a - b);

    const pMin = options?.minPercentile !== undefined ? options.minPercentile : 0.02;
    const pMax = options?.maxPercentile !== undefined ? options.maxPercentile : 0.98;

    const pMinIdx = Math.floor(validRedValues.length * pMin);
    const pMaxIdx = Math.min(validRedValues.length - 1, Math.floor(validRedValues.length * pMax));

    const rMin = validRedValues[pMinIdx];
    const rMax = Math.max(rMin + 0.05, validRedValues[pMaxIdx]);

    const gMin = validGreenValues[pMinIdx];
    const gMax = Math.max(gMin + 0.05, validGreenValues[pMaxIdx]);

    const bMin = validBlueValues[pMinIdx];
    const bMax = Math.max(bMin + 0.05, validBlueValues[pMaxIdx]);

    const gamma = options?.gamma || 1.1; // Gentle gamma for natural photographic earth rendering

    const rgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      if (validMask[i] === 0) {
        // Transparent black for nodata
        rgba[i * 4 + 0] = 0;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0; // Alpha = 0 (Transparent)
        continue;
      }

      let rScaled = (redRefl[i] - rMin) / (rMax - rMin);
      let gScaled = (greenRefl[i] - gMin) / (gMax - gMin);
      let bScaled = (blueRefl[i] - bMin) / (bMax - bMin);

      rScaled = Math.max(0, Math.min(1.0, rScaled));
      gScaled = Math.max(0, Math.min(1.0, gScaled));
      bScaled = Math.max(0, Math.min(1.0, bScaled));

      if (gamma !== 1.0) {
        rScaled = Math.pow(rScaled, 1.0 / gamma);
        gScaled = Math.pow(gScaled, 1.0 / gamma);
        bScaled = Math.pow(bScaled, 1.0 / gamma);
      }

      rgba[i * 4 + 0] = Math.round(rScaled * 255);
      rgba[i * 4 + 1] = Math.round(gScaled * 255);
      rgba[i * 4 + 2] = Math.round(bScaled * 255);
      rgba[i * 4 + 3] = 255; // Alpha = 255 (Opaque)
    }

    return GeoTiffService.encodeRgbaPng(width, height, rgba);
  }

  /**
   * Helper to encode 32-bit RGBA scanlines into standard PNG buffer using node:zlib.
   */
  private static encodeRgbaPng(width: number, height: number, rgbaBytes: Buffer): Buffer {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8); // 8 bits per sample
    ihdrData.writeUInt8(6, 9); // Color type 6: RGBA (Truecolour with alpha)
    ihdrData.writeUInt8(0, 10); // Deflate compression
    ihdrData.writeUInt8(0, 11); // Filter method 0
    ihdrData.writeUInt8(0, 12); // No interlace
    const ihdrChunk = GeoTiffService.writePngChunk('IHDR', ihdrData);

    const scanlineLength = 1 + width * 4;
    const rawData = Buffer.alloc(scanlineLength * height);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * scanlineLength;
      rawData[rowOffset] = 0; // Filter 0 (None)
      const srcRowOffset = y * width * 4;
      rgbaBytes.copy(rawData, rowOffset + 1, srcRowOffset, srcRowOffset + width * 4);
    }

    const compressedData = zlib.deflateSync(rawData);
    const idatChunk = GeoTiffService.writePngChunk('IDAT', compressedData);
    const iendChunk = GeoTiffService.writePngChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  }

  private static crc32(buf: Buffer): number {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      for (let j = 0; j < 8; j++) {
        let bit = (crc ^ byte) & 1;
        crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
        byte >>>= 1;
      }
    }
    return (crc ^ -1) >>> 0;
  }

  private static writePngChunk(type: string, data: Buffer): Buffer {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    buf.writeUInt32BE(GeoTiffService.crc32(typeAndData), 8 + len);
    return buf;
  }
}
