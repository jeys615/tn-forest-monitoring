/**
 * Computes the centroid of a GeoJSON Polygon or MultiPolygon.
 * If signed area is zero, falls back to the bounding box center.
 */
export function calculateCentroid(
  coordinates: [number, number][][] | [number, number][][][],
): [number, number] {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error('Invalid polygon coordinates for centroid calculation');
  }

  // Detect MultiPolygon (array of polygons, each having rings)
  if (
    Array.isArray(coordinates[0]) &&
    Array.isArray(coordinates[0][0]) &&
    Array.isArray(coordinates[0][0][0])
  ) {
    const multi = coordinates as [number, number][][][];
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const poly of multi) {
      const ring = poly[0];
      if (ring) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  }

  const ring = (coordinates as [number, number][][])[0];
  if (!ring || ring.length === 0) {
    throw new Error('Invalid polygon coordinates for centroid calculation');
  }

  // Bounding box bounds
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const bboxCenter: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  // If polygon is too small or has too few points, return bounding box center
  const n = ring.length;
  if (n < 4) {
    return bboxCenter;
  }

  let area = 0;
  let centroidLng = 0;
  let centroidLat = 0;

  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const factor = x0 * y1 - x1 * y0;
    area += factor;
    centroidLng += (x0 + x1) * factor;
    centroidLat += (y0 + y1) * factor;
  }

  area = area * 0.5;

  if (Math.abs(area) < 1e-10) {
    return bboxCenter;
  }

  centroidLng = centroidLng / (6 * area);
  centroidLat = centroidLat / (6 * area);

  // Bounds sanity check to ensure centroid is inside or near the bounding box
  if (
    centroidLng >= minLng &&
    centroidLng <= maxLng &&
    centroidLat >= minLat &&
    centroidLat <= maxLat
  ) {
    return [centroidLng, centroidLat];
  }

  return bboxCenter;
}

/**
 * Calculates geodesic polygon area on Earth's ellipsoid/sphere.
 * Returns area in square meters and hectares. Supports both Polygon and MultiPolygon.
 */
export function calculatePolygonArea(
  coordinates: [number, number][][] | [number, number][][][],
): {
  areaSquareMeters: number;
  areaHectares: number;
} {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return { areaSquareMeters: 0, areaHectares: 0 };
  }

  // Detect MultiPolygon
  if (
    Array.isArray(coordinates[0]) &&
    Array.isArray(coordinates[0][0]) &&
    Array.isArray(coordinates[0][0][0])
  ) {
    const multi = coordinates as [number, number][][][];
    let totalM2 = 0;
    let totalHa = 0;
    for (const poly of multi) {
      const sub = calculatePolygonArea(poly);
      totalM2 += sub.areaSquareMeters;
      totalHa += sub.areaHectares;
    }
    return {
      areaSquareMeters: Math.round(totalM2 * 100) / 100,
      areaHectares: Math.round(totalHa * 100) / 100,
    };
  }

  const ring = (coordinates as [number, number][][])[0];
  if (!ring || ring.length < 4) {
    return { areaSquareMeters: 0, areaHectares: 0 };
  }

  const RADIUS = 6378137; // WGS84 Earth radius in meters
  let total = 0;
  const n = ring.length;

  for (let i = 0; i < n - 1; i++) {
    const [p1Lng, p1Lat] = ring[i];
    const [p2Lng, p2Lat] = ring[i + 1];

    const lambda1 = (p1Lng * Math.PI) / 180;
    const lambda2 = (p2Lng * Math.PI) / 180;
    const phi1 = (p1Lat * Math.PI) / 180;
    const phi2 = (p2Lat * Math.PI) / 180;

    total += (lambda2 - lambda1) * (2 + Math.sin(phi1) + Math.sin(phi2));
  }

  const areaSquareMeters = Math.abs((total * RADIUS * RADIUS) / 2.0);
  const areaHectares = areaSquareMeters / 10000.0;

  return {
    areaSquareMeters: Math.round(areaSquareMeters * 100) / 100,
    areaHectares: Math.round(areaHectares * 100) / 100,
  };
}

/**
 * Determines whether a CRS is a projected metric coordinate reference system (units in meters).
 */
export function isMetricProjectedCrs(crs: string): boolean {
  if (!crs) return false;
  const upper = crs.toUpperCase().trim();
  // UTM WGS84 North: EPSG:32601 - 32660
  // UTM WGS84 South: EPSG:32701 - 32760
  if (/^EPSG:32[67]\d{2}$/.test(upper)) return true;
  // Other projected metric CRS commonly used in GIS
  if (/^EPSG:(3857|900913|3035|2154|27700|269\d{2})$/.test(upper)) return true;
  // UTM citation strings
  if (upper.includes('UTM') || upper.includes('PROJECTED')) return true;
  return false;
}

/**
 * Dynamically determines the appropriate metric-safe projected UTM CRS for a given GeoJSON geometry or coordinates.
 * Formula: UTM zone = floor((centroidLng + 180) / 6) + 1.
 * For Northern hemisphere: EPSG:32600 + zone.
 * For Southern hemisphere: EPSG:32700 + zone.
 * For Tamil Nadu (centroid ~78°E, 11°N): returns EPSG:32644 (or EPSG:32643 for Western TN).
 */
export function determineMetricSafeCrs(
  geometry:
    | { coordinates: [number, number][][] | [number, number][][][] }
    | [number, number][][]
    | [number, number][][][],
): string {
  const coordinates = Array.isArray(geometry) ? geometry : geometry.coordinates;
  const [centroidLng, centroidLat] = calculateCentroid(coordinates);

  const zoneNumber = Math.floor((centroidLng + 180) / 6) + 1;
  const clampedZone = Math.max(1, Math.min(60, zoneNumber));

  if (centroidLat >= 0) {
    return `EPSG:${32600 + clampedZone}`;
  } else {
    return `EPSG:${32700 + clampedZone}`;
  }
}

/**
 * Converts geographic degree pixel resolutions (EPSG:4326) into metric ground resolution (meters)
 * at a given reference latitude using the standard WGS84 ellipsoid model (accounting for Earth's oblateness).
 */
export function calculateDegreeToMeterPixelArea(
  scaleDegX: number,
  scaleDegY: number,
  centerLatDeg: number,
): {
  meterX: number;
  meterY: number;
  pixelAreaM2: number;
} {
  if (isNaN(centerLatDeg) || centerLatDeg < -90 || centerLatDeg > 90) {
    throw new Error(`Invalid latitude for geographic pixel area calculation: ${centerLatDeg}`);
  }
  const a = 6378137.0; // WGS84 semi-major axis in meters
  const e2 = 0.00669437999014; // WGS84 first eccentricity squared
  const latRad = (centerLatDeg * Math.PI) / 180;
  const sinLat = Math.sin(latRad);
  const sin2Lat = sinLat * sinLat;

  // Meridional radius of curvature (North-South): M = a*(1-e^2) / (1-e^2*sin^2(lat))^(3/2)
  const rm = (a * (1 - e2)) / Math.pow(1 - e2 * sin2Lat, 1.5);
  // Prime vertical radius of curvature (East-West): N = a / sqrt(1-e^2*sin^2(lat))
  const rn = a / Math.sqrt(1 - e2 * sin2Lat);

  // Ground distance per degree
  const metersPerDegLat = (Math.PI / 180) * rm;
  const metersPerDegLon = (Math.PI / 180) * rn * Math.cos(latRad);

  const meterX = Math.abs(scaleDegX) * metersPerDegLon;
  const meterY = Math.abs(scaleDegY) * metersPerDegLat;
  const pixelAreaM2 = meterX * meterY;

  return {
    meterX: Number(meterX.toFixed(4)),
    meterY: Number(meterY.toFixed(4)),
    pixelAreaM2: Number(pixelAreaM2.toFixed(4)),
  };
}
