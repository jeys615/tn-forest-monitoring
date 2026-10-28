import type { GeoJSONPolygon, AnalysisGridDto } from '@tn-forest/shared/types';
import { determineMetricSafeCrs } from '../../utils/geo.js';
import { CrsTransformService } from './CrsTransformService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

export interface AnalysisGridOptions {
  zoneId?: string;
  targetCrs?: string;
  pixelSizeMeters?: number;
  bufferMeters?: number;
}

/**
 * Production-grade Canonical Analysis Grid & Spatial Reference Engine.
 * Dynamically constructs mathematically identical, georeferenced spatial analysis grids
 * for ANY monitored zone or project area without zone-specific conditionals.
 */
export class AnalysisGridService {
  /**
   * Constructs the authoritative canonical AnalysisGrid for a given GeoJSON boundary polygon.
   */
  public static createAnalysisGrid(
    boundary: GeoJSONPolygon,
    options: AnalysisGridOptions = {},
  ): AnalysisGridDto {
    if (!boundary || !boundary.coordinates || !boundary.coordinates[0] || boundary.coordinates[0].length < 4) {
      throw new AppError('Invalid boundary polygon for AnalysisGrid creation', HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Determine the appropriate projected metric CRS (e.g. UTM 44N or UTM 43N)
    const crs = options.targetCrs || determineMetricSafeCrs(boundary);
    const pixelSize = options.pixelSizeMeters && options.pixelSizeMeters > 0 ? options.pixelSizeMeters : 10.0; // standard 10m Sentinel-1/2 resolution
    const buffer = options.bufferMeters !== undefined ? options.bufferMeters : 100.0; // 100m default margin

    // 2. Transform boundary polygon coordinates from WGS84 (EPSG:4326) to target projected metric CRS
    const ring = boundary.coordinates[0];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [lon, lat] of ring) {
      const [easting, northing] = CrsTransformService.transformCoordinate([lon, lat], 'EPSG:4326', crs);
      if (easting < minX) minX = easting;
      if (easting > maxX) maxX = easting;
      if (northing < minY) minY = northing;
      if (northing > maxY) maxY = northing;
    }

    // 3. Apply buffer margin and snap to exact integer grid coordinates
    const bufferedMinX = Math.floor((minX - buffer) / pixelSize) * pixelSize;
    const bufferedMaxX = Math.ceil((maxX + buffer) / pixelSize) * pixelSize;
    const bufferedMinY = Math.floor((minY - buffer) / pixelSize) * pixelSize;
    const bufferedMaxY = Math.ceil((maxY + buffer) / pixelSize) * pixelSize;

    const width = Math.round((bufferedMaxX - bufferedMinX) / pixelSize);
    const height = Math.round((bufferedMaxY - bufferedMinY) / pixelSize);

    if (width <= 0 || height <= 0 || width > 20000 || height > 20000) {
      throw new AppError(
        `Calculated AnalysisGrid dimensions (${width}x${height}) are invalid or exceed safe memory thresholds`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      );
    }

    // Origin in GDAL/GeoTIFF affine convention: Top-Left corner (minX, maxY)
    const originX = bufferedMinX;
    const originY = bufferedMaxY;

    // Standard affine transform: [originX, pixelWidth, 0, originY, 0, -pixelHeight]
    const transform: [number, number, number, number, number, number] = [
      originX,
      pixelSize,
      0,
      originY,
      0,
      -pixelSize,
    ];

    return {
      zoneId: options.zoneId,
      crs,
      pixelSizeX: pixelSize,
      pixelSizeY: pixelSize,
      originX,
      originY,
      minX: bufferedMinX,
      minY: bufferedMinY,
      maxX: bufferedMaxX,
      maxY: bufferedMaxY,
      width,
      height,
      transform,
    };
  }

  /**
   * Rasterizes a vector polygon onto an AnalysisGrid using standard point-in-polygon ray-casting.
   * Returns a Uint8Array of length width * height, where 1 indicates pixel center is inside the polygon.
   */
  public static rasterizePolygon(
    grid: AnalysisGridDto,
    polygon: GeoJSONPolygon,
  ): Uint8Array {
    const { width, height, originX, originY, pixelSizeX, pixelSizeY, crs } = grid;
    const mask = new Uint8Array(width * height);

    // Transform polygon ring to grid CRS
    const ring = polygon.coordinates[0].map(([lon, lat]) =>
      CrsTransformService.transformCoordinate([lon, lat], 'EPSG:4326', crs),
    );

    // Pre-calculate bounding box of polygon in grid CRS to quickly bypass distant rows/columns
    let polyMinX = Infinity;
    let polyMaxX = -Infinity;
    let polyMinY = Infinity;
    let polyMaxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < polyMinX) polyMinX = x;
      if (x > polyMaxX) polyMaxX = x;
      if (y < polyMinY) polyMinY = y;
      if (y > polyMaxY) polyMaxY = y;
    }

    const n = ring.length;

    for (let r = 0; r < height; r++) {
      const y = originY - (r + 0.5) * pixelSizeY;
      if (y < polyMinY || y > polyMaxY) {
        continue; // Row completely outside polygon Y envelope
      }

      for (let c = 0; c < width; c++) {
        const x = originX + (c + 0.5) * pixelSizeX;
        if (x < polyMinX || x > polyMaxX) {
          continue; // Pixel outside polygon X envelope
        }

        // Ray casting algorithm for point-in-polygon
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = ring[i][0];
          const yi = ring[i][1];
          const xj = ring[j][0];
          const yj = ring[j][1];

          const intersect =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
          if (intersect) {
            inside = !inside;
          }
        }

        if (inside) {
          mask[r * width + c] = 1;
        }
      }
    }

    return mask;
  }
}
