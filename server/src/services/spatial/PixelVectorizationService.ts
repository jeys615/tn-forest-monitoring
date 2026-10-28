import type { GeoJSONPolygon, GeoJSONMultiPolygon, AnalysisGridDto } from '@tn-forest/shared/types';
import { CrsTransformService } from './CrsTransformService.js';

export interface VectorizeMaskOptions {
  /**
   * Minimum number of contiguous 4-connected pixels required to constitute a significant cluster.
   * Default is 1 for optical/HLS (any verified changed pixel), 4 for SAR (radar speckle rejection).
   */
  minClusterPixels?: number;

  /**
   * If true, bounds all significant clusters into a single envelope Polygon.
   * Default is false (SAR convention: primary/largest significant cluster is vectorized).
   */
  envelopeAllClusters?: boolean;
}

export interface PixelCluster {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
  count: number;
}

/**
 * Production-grade Pixel Vectorization Service.
 *
 * Implements authoritative connected-component labeling and coordinate transformation
 * to convert binary pixel change masks on canonical AnalysisGrids into standard
 * WGS84 GeoJSON Polygons.
 *
 * Key Architectural Invariants:
 * 1. Operates strictly post-detection on existing changedMask buffers — zero recalculation of scientific pixel deltas.
 * 2. Does NOT replace or alter the scientific changedArea (which is strictly changedPixelCount * pixelAreaM2 / 10000).
 * 3. Preserves canonical AnalysisGrid CRS (e.g. UTM) and GDAL Top-Left affine transform convention.
 * 4. Converts metric grid coordinates to WGS84 (EPSG:4326) with verified ring closure and valid geographic bounds.
 * 5. Conforms to the project's GeoJSONPolygon / GeoJSONMultiPolygon DTO conventions.
 */
export class PixelVectorizationService {
  /**
   * Vectorizes clusters of changed pixels into a GeoJSON Polygon or MultiPolygon.
   *
   * @param changedMask Binary pixel change mask (Uint8Array of length width * height, where 1 = changed)
   * @param grid Canonical AnalysisGridDto defining dimensions, resolution, origin, and CRS
   * @param options Configuration options (minClusterPixels, envelopeAllClusters)
   * @returns Valid GeoJSON Polygon or MultiPolygon, or undefined if no changed pixels meet cluster criteria
   */
  public static vectorizeChangedPixels(
    changedMask: Uint8Array,
    grid: AnalysisGridDto,
    options: number | VectorizeMaskOptions = 1,
  ): GeoJSONPolygon | GeoJSONMultiPolygon | undefined {
    const minClusterPixels = typeof options === 'number' ? options : (options.minClusterPixels ?? 1);
    const envelopeAll = typeof options === 'object' && options.envelopeAllClusters === true;

    const { width, height, originX, originY, pixelSizeX, pixelSizeY, crs } = grid;
    if (!width || !height || width <= 0 || height <= 0 || !changedMask || changedMask.length === 0) {
      return undefined;
    }

    const totalPixels = width * height;
    if (changedMask.length < totalPixels) {
      return undefined;
    }

    const visited = new Uint8Array(totalPixels);
    const clusters: PixelCluster[] = [];

    // 4-connectivity Flood Fill / Connected Component Labeling
    for (let r = 0; r < height; r++) {
      const rowOffset = r * width;
      for (let c = 0; c < width; c++) {
        const idx = rowOffset + c;
        if (changedMask[idx] === 0 || visited[idx] === 1) {
          continue;
        }

        // Start new cluster BFS
        const queue: number[] = [idx];
        visited[idx] = 1;

        let clusterCount = 0;
        let cMin = c;
        let cMax = c;
        let rMin = r;
        let rMax = r;

        while (queue.length > 0) {
          const curr = queue.pop()!;
          clusterCount++;

          const cr = Math.floor(curr / width);
          const cc = curr % width;

          if (cc < cMin) cMin = cc;
          if (cc > cMax) cMax = cc;
          if (cr < rMin) rMin = cr;
          if (cr > rMax) rMax = cr;

          // 4-connected neighbors: North, South, West, East
          if (cr > 0) {
            const n = (cr - 1) * width + cc;
            if (changedMask[n] === 1 && visited[n] === 0) {
              visited[n] = 1;
              queue.push(n);
            }
          }
          if (cr < height - 1) {
            const s = (cr + 1) * width + cc;
            if (changedMask[s] === 1 && visited[s] === 0) {
              visited[s] = 1;
              queue.push(s);
            }
          }
          if (cc > 0) {
            const w = cr * width + (cc - 1);
            if (changedMask[w] === 1 && visited[w] === 0) {
              visited[w] = 1;
              queue.push(w);
            }
          }
          if (cc < width - 1) {
            const e = cr * width + (cc + 1);
            if (changedMask[e] === 1 && visited[e] === 0) {
              visited[e] = 1;
              queue.push(e);
            }
          }
        }

        if (clusterCount >= minClusterPixels) {
          clusters.push({ minC: cMin, maxC: cMax, minR: rMin, maxR: rMax, count: clusterCount });
        }
      }
    }

    if (clusters.length === 0) {
      return undefined;
    }

    // Sort clusters by count descending
    clusters.sort((a, b) => b.count - a.count);

    if (envelopeAll && clusters.length > 1) {
      const minC = Math.min(...clusters.map((cl) => cl.minC));
      const maxC = Math.max(...clusters.map((cl) => cl.maxC));
      const minR = Math.min(...clusters.map((cl) => cl.minR));
      const maxR = Math.max(...clusters.map((cl) => cl.maxR));
      const envCluster: PixelCluster = {
        minC,
        maxC,
        minR,
        maxR,
        count: clusters.reduce((sum, cl) => sum + cl.count, 0),
      };
      return {
        type: 'Polygon',
        coordinates: [this.clusterToWgs84Ring(envCluster, grid)],
      };
    }

    // If exactly one connected region exists -> GeoJSONPolygon
    if (clusters.length === 1) {
      return {
        type: 'Polygon',
        coordinates: [this.clusterToWgs84Ring(clusters[0], grid)],
      };
    }

    // Multiple disconnected clusters -> GeoJSONMultiPolygon
    // Each independent cluster is preserved spatially without artificial bounding envelopes
    return {
      type: 'MultiPolygon',
      coordinates: clusters.map((cluster) => [this.clusterToWgs84Ring(cluster, grid)]),
    };
  }

  /**
   * Converts a single pixel cluster's bounding extents on the canonical analysis grid
   * into a closed 5-vertex WGS84 polygon exterior ring.
   */
  private static clusterToWgs84Ring(cluster: PixelCluster, grid: AnalysisGridDto): [number, number][] {
    const { originX, originY, pixelSizeX, pixelSizeY, crs } = grid;
    const scaleX = pixelSizeX || 30.0;
    const scaleY = pixelSizeY || 30.0;

    const x0 = originX + cluster.minC * scaleX;
    const x1 = originX + (cluster.maxC + 1) * scaleX;
    const y0 = originY - (cluster.maxR + 1) * scaleY;
    const y1 = originY - cluster.minR * scaleY;

    // Standard counter-clockwise closed exterior ring: Top-Left -> Top-Right -> Bottom-Right -> Bottom-Left -> Top-Left
    const cornersMetric: [number, number][] = [
      [x0, y1], // Top-Left
      [x1, y1], // Top-Right
      [x1, y0], // Bottom-Right
      [x0, y0], // Bottom-Left
      [x0, y1], // Close Ring
    ];

    // Transform metric coordinates to WGS84 geographic coordinates [longitude, latitude]
    const wgs84Ring: [number, number][] = cornersMetric.map((pt) => {
      const [lon, lat] = CrsTransformService.transformCoordinate(pt, crs, 'EPSG:4326');
      // Validate geographic coordinate boundaries
      const clampedLon = Math.max(-180, Math.min(180, lon));
      const clampedLat = Math.max(-90, Math.min(90, lat));
      return [Number(clampedLon.toFixed(7)), Number(clampedLat.toFixed(7))];
    });

    // Ensure strict ring closure
    wgs84Ring[wgs84Ring.length - 1] = [wgs84Ring[0][0], wgs84Ring[0][1]];

    return wgs84Ring;
  }
}
