import assert from 'node:assert';
import {
  type AnalysisGridDto,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';
import type { OpticalSpectralIndices } from '../services/spatial/OpticalPixelIndexService.js';
import { PixelVectorizationService } from '../services/spatial/PixelVectorizationService.js';
import { OpticalPixelChangeDetector } from '../services/changeDetection/OpticalPixelChangeDetector.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✅ PASS: ${msg}`);
  passed++;
}

async function runVectorizationTests(): Promise<void> {
  console.log('\n===============================================================');
  console.log('   PHASE 10.5 L2 UNIT TEST SUITE: PIXEL VECTORIZATION & INVARIANCE');
  console.log('===============================================================\n');

  // Standard UTM Zone 43N AnalysisGrid for Tamil Nadu (Mudumalai region)
  const mockGrid: AnalysisGridDto = {
    originX: 663000,
    originY: 1283000,
    minX: 663000,
    minY: 1282700,
    maxX: 663300,
    maxY: 1283000,
    pixelSizeX: 30.0,
    pixelSizeY: 30.0,
    width: 10,
    height: 10,
    crs: 'EPSG:32643',
    transform: [663000, 30, 0, 1283000, 0, -30],
  };

  // --------------------------------------------------------------------------
  // TEST 1: Empty or Zero Changed Mask
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Empty and All-Zero Changed Mask ---');
  const emptyMask = new Uint8Array(100);
  const emptyResult = PixelVectorizationService.vectorizeChangedPixels(emptyMask, mockGrid, 1);
  check(emptyResult === undefined, 'All-zero changedMask returns undefined geometry');

  const zeroLengthMask = new Uint8Array(0);
  const zeroResult = PixelVectorizationService.vectorizeChangedPixels(zeroLengthMask, mockGrid, 1);
  check(zeroResult === undefined, 'Zero-length changedMask returns undefined geometry');

  // --------------------------------------------------------------------------
  // TEST 2: Single Changed Pixel Vectorization & Geometric Validity
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Single Changed Pixel Vectorization & GeoJSON Validity ---');
  const singlePixelMask = new Uint8Array(100);
  singlePixelMask[5 * 10 + 5] = 1; // row 5, col 5

  const geom = PixelVectorizationService.vectorizeChangedPixels(singlePixelMask, mockGrid, 1);
  check(geom !== undefined, 'Single changed pixel produces defined geometry');
  check(geom!.type === 'Polygon', 'Geometry type is strictly "Polygon"');
  const poly = geom as GeoJSONPolygon;
  check(Array.isArray(poly.coordinates), 'Coordinates is an array');
  check(poly.coordinates.length === 1, 'Contains exactly 1 ring (outer boundary)');

  const ring = poly.coordinates[0];
  check(ring.length === 5, 'Closed bounding ring has exactly 5 vertices');

  // Ring closure check
  const firstPt = ring[0];
  const lastPt = ring[ring.length - 1];
  check(firstPt[0] === lastPt[0] && firstPt[1] === lastPt[1], 'Polygon ring is strictly closed (first == last)');

  // WGS84 range check
  for (const [lon, lat] of ring) {
    check(lon >= -180 && lon <= 180, `Longitude ${lon} is within valid WGS84 range [-180, 180]`);
    check(lat >= -90 && lat <= 90, `Latitude ${lat} is within valid WGS84 range [-90, 90]`);
    // Tamil Nadu region coordinate check (~76-78° E, ~10-12° N)
    check(lon > 75.0 && lon < 80.0, `Longitude ${lon} is spatially in Tamil Nadu region`);
    check(lat > 10.0 && lat < 13.0, `Latitude ${lat} is spatially in Tamil Nadu region`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Contiguous Block Vectorization
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Contiguous Block Vectorization & Bounding ---');
  const blockMask = new Uint8Array(100);
  // 2x2 contiguous block at rows 2-3, cols 2-3
  blockMask[2 * 10 + 2] = 1;
  blockMask[2 * 10 + 3] = 1;
  blockMask[3 * 10 + 2] = 1;
  blockMask[3 * 10 + 3] = 1;

  const blockGeom = PixelVectorizationService.vectorizeChangedPixels(blockMask, mockGrid, 1);
  check(blockGeom !== undefined, 'Contiguous block produces defined geometry');
  check(blockGeom!.type === 'Polygon', 'Contiguous block produces Polygon');
  const bPoly = blockGeom as GeoJSONPolygon;
  check(bPoly.coordinates[0].length === 5, 'Block polygon has 5 vertices');
  const bRing = bPoly.coordinates[0];
  check(bRing[0][0] === bRing[4][0] && bRing[0][1] === bRing[4][1], 'Block ring is closed');

  // --------------------------------------------------------------------------
  // TEST 4: Multiple Disconnected Clusters & MultiPolygon Generation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Disconnected Clusters (MultiPolygon vs Envelope) ---');
  const multiClusterMask = new Uint8Array(100);
  // Cluster A: 2 pixels at row 1, cols 1-2
  multiClusterMask[1 * 10 + 1] = 1;
  multiClusterMask[1 * 10 + 2] = 1;
  // Cluster B: 4 pixels at rows 7-8, cols 7-8 (larger, disconnected)
  multiClusterMask[7 * 10 + 7] = 1;
  multiClusterMask[7 * 10 + 8] = 1;
  multiClusterMask[8 * 10 + 7] = 1;
  multiClusterMask[8 * 10 + 8] = 1;

  // Authoritative behavior: 2 disconnected clusters produce GeoJSONMultiPolygon (NEVER merged into single envelope)
  const multiGeom = PixelVectorizationService.vectorizeChangedPixels(multiClusterMask, mockGrid, 1);
  check(multiGeom !== undefined, 'Multi-cluster vectorization produces geometry');
  check(multiGeom!.type === 'MultiPolygon', 'Multiple disconnected clusters produce MultiPolygon');
  const multi2 = multiGeom as GeoJSONMultiPolygon;
  check(multi2.coordinates.length === 2, 'MultiPolygon contains exactly 2 independent polygon geometries');

  // Verify both clusters are spatially distinct and each has a closed 5-vertex ring
  for (let i = 0; i < multi2.coordinates.length; i++) {
    const polyRing = multi2.coordinates[i][0];
    check(polyRing.length === 5, `Cluster ${i + 1} polygon has 5 vertices`);
    check(polyRing[0][0] === polyRing[4][0] && polyRing[0][1] === polyRing[4][1], `Cluster ${i + 1} ring is strictly closed`);
    for (const [lon, lat] of polyRing) {
      check(lon >= -180 && lon <= 180, `Cluster ${i + 1} lon ${lon} valid WGS84`);
      check(lat >= -90 && lat <= 90, `Cluster ${i + 1} lat ${lat} valid WGS84`);
    }
  }

  // Verify clusters are not merged: Cluster A is at row 1 (higher lat), Cluster B is at rows 7-8 (lower lat)
  const ringB = multi2.coordinates[0][0]; // Cluster B has count 4 (sorted first)
  const ringA = multi2.coordinates[1][0]; // Cluster A has count 2 (sorted second)
  const minLatA = Math.min(...ringA.map((p) => p[1]));
  const maxLatB = Math.max(...ringB.map((p) => p[1]));
  check(minLatA > maxLatB, 'Clusters are spatially separated and not merged into single bounding box');

  // TEST 4B: 3 Disconnected Clusters
  console.log('\n--- TEST 4B: 3 Disconnected Clusters -> MultiPolygon with 3 entries ---');
  const threeClusterMask = new Uint8Array(100);
  threeClusterMask[0 * 10 + 0] = 1; // Cluster 1: top-left
  threeClusterMask[4 * 10 + 4] = 1; // Cluster 2: center
  threeClusterMask[9 * 10 + 9] = 1; // Cluster 3: bottom-right

  const threeGeom = PixelVectorizationService.vectorizeChangedPixels(threeClusterMask, mockGrid, 1);
  check(threeGeom !== undefined, '3-cluster mask produces geometry');
  check(threeGeom!.type === 'MultiPolygon', '3 disconnected clusters produce MultiPolygon');
  const multi3 = threeGeom as GeoJSONMultiPolygon;
  check(multi3.coordinates.length === 3, 'MultiPolygon contains exactly 3 independent polygon geometries');
  for (let i = 0; i < 3; i++) {
    const cRing = multi3.coordinates[i][0];
    check(cRing.length === 5, `Cluster ${i + 1} ring has 5 vertices`);
    check(cRing[0][0] === cRing[4][0] && cRing[0][1] === cRing[4][1], `Cluster ${i + 1} ring is closed`);
  }

  // Envelope all clusters option (backward compatibility if explicitly requested)
  const envelopeGeom = PixelVectorizationService.vectorizeChangedPixels(multiClusterMask, mockGrid, {
    minClusterPixels: 1,
    envelopeAllClusters: true,
  });
  check(envelopeGeom !== undefined, 'Enveloped multi-cluster produces geometry');
  check(envelopeGeom!.type === 'Polygon', 'Enveloped geometry is strictly Polygon');

  // Speckle filter test: minClusterPixels = 3 should reject Cluster A (2 pixels) and keep Cluster B (4 pixels) -> 1 cluster -> Polygon!
  const speckleFilteredGeom = PixelVectorizationService.vectorizeChangedPixels(multiClusterMask, mockGrid, {
    minClusterPixels: 3,
  });
  check(speckleFilteredGeom !== undefined, 'Speckle filtered geometry returns significant cluster');
  check(speckleFilteredGeom!.type === 'Polygon', 'Single significant cluster after speckle filtering produces Polygon');

  // High threshold test: minClusterPixels = 10 should reject all clusters
  const highFilterGeom = PixelVectorizationService.vectorizeChangedPixels(multiClusterMask, mockGrid, {
    minClusterPixels: 10,
  });
  check(highFilterGeom === undefined, 'Clusters below minClusterPixels are cleanly filtered out');

  // --------------------------------------------------------------------------
  // TEST 5: Scientific Invariance & Buffer Immutability
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Scientific Invariance & Mask Immutability ---');
  const testMask = new Uint8Array([0, 1, 0, 1, 1, 0, 0, 0, 1]);
  const maskCopy = new Uint8Array(testMask);
  const tinyGrid: AnalysisGridDto = {
    originX: 663000,
    originY: 1283000,
    minX: 663000,
    minY: 1282910,
    maxX: 663090,
    maxY: 1283000,
    pixelSizeX: 30.0,
    pixelSizeY: 30.0,
    width: 3,
    height: 3,
    crs: 'EPSG:32643',
    transform: [663000, 30, 0, 1283000, 0, -30],
  };

  PixelVectorizationService.vectorizeChangedPixels(testMask, tinyGrid, 1);

  // Assert testMask buffer was NOT mutated in any way
  let untouched = true;
  for (let i = 0; i < testMask.length; i++) {
    if (testMask[i] !== maskCopy[i]) {
      untouched = false;
      break;
    }
  }
  check(untouched, 'PixelVectorizationService does NOT mutate input changedMask buffer');

  // --------------------------------------------------------------------------
  // TEST 6: OpticalPixelChangeDetector Integration & Invariance
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: OpticalPixelChangeDetector Spatial Geometry & Scientific Invariance ---');
  const bNdvi = new Float32Array([0.7, 0.65, 0.8, 0.75]);
  const cNdvi = new Float32Array([0.2, 0.60, 0.3, 0.72]); // Pixels 0 and 2 drop significantly (> 0.15)
  const zeros = new Float32Array(4);

  const baselineIndices: OpticalSpectralIndices = {
    ndvi: bNdvi,
    ndwi: zeros,
    ndbi: zeros,
    bsi: zeros,
    savi: zeros,
    evi: zeros,
    validMask: new Uint8Array([1, 1, 1, 1]),
    validPixelCount: 4,
  };

  const currentIndices: OpticalSpectralIndices = {
    ndvi: cNdvi,
    ndwi: zeros,
    ndbi: zeros,
    bsi: zeros,
    savi: zeros,
    evi: zeros,
    validMask: new Uint8Array([1, 1, 1, 1]),
    validPixelCount: 4,
  };

  const detectionResult = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices,
    currentIndices,
    validMask: new Uint8Array([1, 1, 1, 1]),
    grid: { ...mockGrid, width: 2, height: 2 },
    zoneAreaHectares: 0.36,
    thresholdConfig: { ndviThreshold: -0.15, decisionRule: 'NDVI_DROP', changeDirection: 'DECREASE' },
  });

  // Scientific invariance checks
  check(detectionResult.rasterStatistics.changedPixelCount === 2, 'Scientific changedPixelCount is exactly 2');
  check(detectionResult.rasterStatistics.validComparisonPixelCount === 4, 'Scientific validComparisonPixelCount is exactly 4');
  check(detectionResult.spatialResult.changedPixels === 2, 'Spatial changedPixels is exactly 2');
  // Area check: 2 pixels * (30m * 30m) = 1800 m2 = 0.18 ha
  const expectedAreaHa = Number(((2 * 900) / 10000).toFixed(4));
  check(detectionResult.spatialResult.changedArea === expectedAreaHa, `changedArea (${detectionResult.spatialResult.changedArea} ha) is strictly based on pixel counts`);
  check(detectionResult.spatialResult.affectedAreaPercentage === 50.0, 'affectedAreaPercentage is strictly (2/4)*100 = 50%');

  // L2 Geometry existence and validity checks
  check(detectionResult.spatialResult.changedGeometry !== undefined, 'spatialResult.changedGeometry is defined for changed pixels');
  const dGeom = detectionResult.spatialResult.changedGeometry!;
  check(dGeom.type === 'Polygon', 'changedGeometry type is Polygon');
  const dPoly = dGeom as GeoJSONPolygon;
  check(dPoly.coordinates.length === 1, 'changedGeometry contains 1 closed ring');
  check(dPoly.coordinates[0].length === 5, 'changedGeometry ring has 5 vertices');
  check(dPoly.coordinates[0][0][0] === dPoly.coordinates[0][4][0], 'changedGeometry ring is closed in X');
  check(dPoly.coordinates[0][0][1] === dPoly.coordinates[0][4][1], 'changedGeometry ring is closed in Y');

  // --------------------------------------------------------------------------
  // TEST 7: Zero Changed Pixels -> changedGeometry is undefined
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Zero Changed Pixels Produces Undefined Geometry ---');
  const noChangeCurrent: OpticalSpectralIndices = {
    ...currentIndices,
    ndvi: new Float32Array([0.7, 0.65, 0.8, 0.75]), // Identical to baseline -> 0 drop
  };

  const zeroChangeResult = OpticalPixelChangeDetector.detectPixelChange({
    baselineIndices,
    currentIndices: noChangeCurrent,
    validMask: new Uint8Array([1, 1, 1, 1]),
    grid: { ...mockGrid, width: 2, height: 2 },
    zoneAreaHectares: 0.36,
    thresholdConfig: { ndviThreshold: -0.15, decisionRule: 'NDVI_DROP', changeDirection: 'DECREASE' },
  });

  check(zeroChangeResult.rasterStatistics.changedPixelCount === 0, 'No pixels changed');
  check(zeroChangeResult.spatialResult.changedArea === 0, 'changedArea is 0 ha');
  check(zeroChangeResult.spatialResult.changedGeometry === undefined, 'changedGeometry is strictly undefined when 0 pixels changed');

  console.log('\n===============================================================');
  console.log(`L2 UNIT TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVectorizationTests().catch((err) => {
  console.error('Vectorization test execution failed:', err);
  process.exit(1);
});
