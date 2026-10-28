import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { PixelAnalysisService } from '../services/raster/PixelAnalysisService.js';
import { RasterHarmonizationService } from '../services/raster/RasterHarmonizationService.js';
import { EvidenceScoreCalculator } from '../services/changeDetection/EvidenceScoreCalculator.js';
import { calculateM6Metrics } from '../utils/m6Metrics.js';
import {
  determineMetricSafeCrs,
  isMetricProjectedCrs,
  calculateDegreeToMeterPixelArea,
} from '../utils/geo.js';
import { CrossSensorAgreement, type GeoJSONPolygon } from '@tn-forest/shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
  passed++;
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 CRS NORMALIZATION & METRIC-SAFE AREA CALCULATION SAFETY TESTS');
  console.log('================================================================\n');

  // Test 1: Projected Metric CRS Detection
  console.log('--- TEST 1: PROJECTED METRIC CRS RECOGNITION ---');
  assert(isMetricProjectedCrs('EPSG:32643'), 'EPSG:32643 (UTM 43N) recognized as metric projected');
  assert(isMetricProjectedCrs('EPSG:32644'), 'EPSG:32644 (UTM 44N) recognized as metric projected');
  assert(isMetricProjectedCrs('EPSG:32743'), 'EPSG:32743 (UTM 43S) recognized as metric projected');
  assert(isMetricProjectedCrs('EPSG:3857'), 'EPSG:3857 (Web Mercator) recognized as metric projected');
  assert(!isMetricProjectedCrs('EPSG:4326'), 'EPSG:4326 (WGS84 degrees) correctly identified as NOT metric projected');
  assert(!isMetricProjectedCrs(''), 'Empty CRS handled safely as non-metric');

  // Test 2: Dynamic Metric-Safe UTM Selection
  console.log('\n--- TEST 2: DYNAMIC METRIC-SAFE CRS SELECTION FROM GEOMETRY ---');
  const sathiyarPolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.0747, 10.1182],
        [78.0867, 10.1118],
        [78.0939, 10.1196],
        [78.0890, 10.1235],
        [78.0797, 10.1228],
        [78.0747, 10.1182],
      ],
    ],
  };
  const utmSathiyar = determineMetricSafeCrs(sathiyarPolygon);
  assert(utmSathiyar === 'EPSG:32644', `Sathiyar centroid (~78.08°E) dynamically mapped to UTM 44N (${utmSathiyar})`);

  const coimbatorePolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [76.95, 11.00],
        [77.05, 11.00],
        [77.05, 11.10],
        [76.95, 11.10],
        [76.95, 11.00],
      ],
    ],
  };
  const utmCoimbatore = determineMetricSafeCrs(coimbatorePolygon);
  assert(utmCoimbatore === 'EPSG:32643', `Western TN / Coimbatore (~77.0°E) dynamically mapped to UTM 43N (${utmCoimbatore})`);

  // Test 3: Degree to Metric Ground Resolution Conversion (EPSG:4326 safety)
  console.log('\n--- TEST 3: EPSG:4326 DEGREE TO METRIC GROUND RESOLUTION CONVERSION ---');
  const deg10m = 0.00008983; // ~10m in degrees at equator
  const metricAt10Deg = calculateDegreeToMeterPixelArea(deg10m, deg10m, 10.0);
  assert(metricAt10Deg.meterX > 9.0 && metricAt10Deg.meterX < 11.0, `Ground scaleX is realistic (~${metricAt10Deg.meterX}m)`);
  assert(metricAt10Deg.meterY > 9.0 && metricAt10Deg.meterY < 11.0, `Ground scaleY is realistic (~${metricAt10Deg.meterY}m)`);
  assert(metricAt10Deg.pixelAreaM2 > 90.0 && metricAt10Deg.pixelAreaM2 < 110.0, `Pixel area is metric (~${metricAt10Deg.pixelAreaM2} m²), NOT square degrees`);

  // Test 4: Real Sathiyar GeoTIFF Native Projected CRS Extraction
  console.log('\n--- TEST 4: REAL SATHIYAR GEOTIFF NATIVE CRS & PIXEL AREA ---');
  const possiblePaths = [
    path.resolve(__dirname, '../../storage/raster_temp/JOB-MTNG14ED/SATHIYAR_JOB-MTNG14ED_BASELINE_Sentinel2_20200109.tif'),
    path.resolve(__dirname, '../../storage/raster_temp/TEST-DOWNLOAD/SATHIYAR_JOB-MTNFWHP9_BASELINE_Sentinel2_20200109.tif'),
    path.resolve(__dirname, '../../storage/raster_temp/JOB-MTNFWHP9/SATHIYAR_JOB-MTNFWHP9_BASELINE_Sentinel2_20200109.tif'),
  ];
  const realTiffPath = possiblePaths.find((p) => fs.existsSync(p));

  if (realTiffPath) {
    const fileBuffer = fs.readFileSync(realTiffPath);
    const parsed = await GeoTiffService.readGeoTiffFromBuffer(fileBuffer);

    assert(parsed.metadata.originalCrs === 'EPSG:32643', `Original CRS accurately detected as native ${parsed.metadata.originalCrs}`);
    assert(parsed.metadata.normalizedCrs === 'EPSG:32643', `Normalized CRS is metric projected ${parsed.metadata.normalizedCrs}`);
    assert(parsed.metadata.areaCalculationCrs === 'EPSG:32643', `Area-calc CRS matches ${parsed.metadata.areaCalculationCrs}`);
    assert(parsed.metadata.isProjectedMetric === true, 'isProjectedMetric is true for real Sentinel-2 GeoTIFF');
    assert(parsed.metadata.pixelScale[0] === 10, 'Pixel scaleX is exactly 10m');
    assert(parsed.metadata.pixelScale[1] === 10, 'Pixel scaleY is exactly 10m');
    assert(parsed.metadata.pixelAreaM2 === 100.0, `Pixel area is verified 100.0 m² (${parsed.metadata.pixelAreaM2} m²)`);
    assert(parsed.metadata.width === 211 && parsed.metadata.height === 131, 'Dimensions match real scene (211x131)');
  } else {
    console.warn('  ⚠️ Real GeoTIFF file not present in local storage, testing sample GeoTIFF');
    const sampleBuffer = await GeoTiffService.createSampleGeoTiff({ width: 20, height: 20 });
    const parsed = await GeoTiffService.readGeoTiffFromBuffer(sampleBuffer);
    assert(parsed.metadata.pixelAreaM2 > 0, `Sample GeoTIFF parsed with pixelAreaM2: ${parsed.metadata.pixelAreaM2}`);
  }

  // Test 5: Authoritative M6 Area Calculation Formulas
  console.log('\n--- TEST 5: AUTHORITATIVE M6 AREA CALCULATION & HECTARE CONVERSION ---');
  const m6Standard = calculateM6Metrics({
    changedPixels: 250,
    validPixels: 2500,
    pixelResolutionMeters: 10,
    pixelAreaM2: 100,
  });
  assert(m6Standard.pixelAreaM2 === 100, 'Pixel area is 100 m²');
  assert(m6Standard.changedPixels === 250, 'Changed pixels is 250');
  assert(m6Standard.validPixels === 2500, 'Valid pixels is 2500');
  assert(m6Standard.affectedAreaM2 === 25000, 'Changed area is 25,000 m²');
  assert(m6Standard.affectedAreaHa === 2.5, 'Changed area in hectares is exactly 2.5 ha (25,000 / 10,000)');
  assert(m6Standard.affectedAreaPercentage === 10.0, 'Affected area percentage is exactly 10.0% ((250 / 2500) * 100)');
  assert(m6Standard.pixelAccountingValid === true, 'Pixel accounting validates: valid == changed + noChange');

  // Test 6: Mathematical Invariant: Percentage Not Derived from Rounded Hectares
  console.log('\n--- TEST 6: MATHEMATICAL INVARIANT: PERCENTAGE NOT DERIVED FROM ROUNDED HECTARES ---');
  // 1 changed pixel out of 30,000 valid pixels
  // In hectares: 1 * 100 / 10,000 = 0.01 ha. Zone area = 300 ha.
  // Ratio: (1 / 30,000) * 100 = 0.00333... %
  const m6Subtle = calculateM6Metrics({
    changedPixels: 1,
    validPixels: 30000,
    pixelResolutionMeters: 10,
  });
  const expectedPct = (1 / 30000) * 100;
  assert(
    Math.abs(m6Subtle.affectedAreaPercentage - expectedPct) < 1e-9,
    `affectedAreaPercentage (${m6Subtle.affectedAreaPercentage}%) matches exact (changed/valid)*100`,
  );

  // Test 7: Edge Cases: Zero Valid Pixels, Zero Changed Pixels, 100% Changed Pixels
  console.log('\n--- TEST 7: EDGE CASES (ZERO VALID, ZERO CHANGED, 100% CHANGED) ---');
  const m6ZeroValid = calculateM6Metrics({
    changedPixels: 0,
    validPixels: 0,
    pixelResolutionMeters: 10,
  });
  assert(m6ZeroValid.affectedAreaPercentage === 0.0, 'Zero valid pixels produces 0.0% affected area without division by zero');
  assert(m6ZeroValid.affectedAreaM2 === 0, 'Zero valid pixels produces 0 m² affected area');

  const m6ZeroChanged = calculateM6Metrics({
    changedPixels: 0,
    validPixels: 5000,
    pixelResolutionMeters: 10,
  });
  assert(m6ZeroChanged.affectedAreaPercentage === 0.0, 'Zero changed pixels produces exactly 0.0%');
  assert(m6ZeroChanged.thresholdCrossed === false, 'Threshold not crossed for 0 changes');

  const m6AllChanged = calculateM6Metrics({
    changedPixels: 5000,
    validPixels: 5000,
    pixelResolutionMeters: 10,
  });
  assert(m6AllChanged.affectedAreaPercentage === 100.0, 'All pixels changed produces exactly 100.0%');
  assert(m6AllChanged.severity === 'HIGH', '100% change triggers HIGH severity');

  // Test 8: Semantic Separation: affectedAreaPercentage vs evidenceScore
  console.log('\n--- TEST 8: SEMANTIC SEPARATION: affectedAreaPercentage VS evidenceScore ---');
  const evidenceScore = EvidenceScoreCalculator.calculateEvidenceScore({
    affectedAreaPercentage: 4.2, // 4.2% surface change
    imageQualityScore: 90,
    hasTemporalHistory: true,
    isTemporallyConsistent: true,
    crossSensorAgreement: CrossSensorAgreement.HIGH,
  });
  assert(typeof evidenceScore.totalEvidenceScore === 'number', 'evidenceScore is a numeric score');
  assert(evidenceScore.totalEvidenceScore >= 0 && evidenceScore.totalEvidenceScore <= 100, `evidenceScore is bounded 0-100 (${evidenceScore.totalEvidenceScore})`);
  assert(
    evidenceScore.totalEvidenceScore !== 4.2,
    `evidenceScore (${evidenceScore.totalEvidenceScore}) is NOT equated to affectedAreaPercentage (4.2%)`,
  );

  // Test 9: Spatial Alignment Guards between Baseline and Current Rasters
  console.log('\n--- TEST 9: SPATIAL ALIGNMENT GUARDS FOR CHANGE DETECTION ---');
  const alignedCheck = RasterHarmonizationService.verifySpatialAlignment(
    { width: 211, height: 131, crs: 'EPSG:32643', nativeResolution: 10 },
    { width: 211, height: 131, crs: 'EPSG:32643', nativeResolution: 10 },
  );
  assert(alignedCheck.aligned === true, 'Identical rasters correctly verified as aligned (READY)');
  assert(alignedCheck.recommendation === 'READY', 'Recommendation is READY');

  const misalignedDim = RasterHarmonizationService.verifySpatialAlignment(
    { width: 211, height: 131, crs: 'EPSG:32643', nativeResolution: 10 },
    { width: 200, height: 120, crs: 'EPSG:32643', nativeResolution: 10 },
  );
  assert(misalignedDim.aligned === false, 'Dimension mismatch detected');
  assert(misalignedDim.recommendation === 'RESAMPLE_REQUIRED', 'Recommendation is RESAMPLE_REQUIRED');

  const misalignedCrs = RasterHarmonizationService.verifySpatialAlignment(
    { width: 211, height: 131, crs: 'EPSG:32643', nativeResolution: 10 },
    { width: 211, height: 131, crs: 'EPSG:4326', nativeResolution: 10 },
  );
  assert(misalignedCrs.aligned === false, 'CRS mismatch detected');
  assert(misalignedCrs.recommendation === 'REPROJECT_AND_RESAMPLE', 'Recommendation is REPROJECT_AND_RESAMPLE');

  // Test 10: Pixel Change Detection with Metric Area & CRS Metadata
  console.log('\n--- TEST 10: PIXEL CHANGE DETECTION WITH METRIC AREA & CRS AUDIT ---');
  const len = 100;
  const baseNdvi = new Float32Array(len).fill(0.65);
  const curNdvi = new Float32Array(len).fill(0.65);
  // Introduce 15 changed pixels
  for (let i = 0; i < 15; i++) {
    curNdvi[i] = 0.20; // significant vegetation loss
  }
  const mask = new Uint8Array(len).fill(1);

  const changeResult = PixelAnalysisService.detectPixelChange({
    baselineIndices: { ndvi: baseNdvi } as any,
    currentIndices: { ndvi: curNdvi } as any,
    baselineValidMask: mask,
    currentValidMask: mask,
    pixelResolutionMeters: 10,
    pixelAreaM2: 100,
    originalCrs: 'EPSG:32643',
    normalizedCrs: 'EPSG:32643',
    areaCalculationCrs: 'EPSG:32643',
  });

  assert(changeResult.validPixels === 100, 'Valid pixels is 100');
  assert(changeResult.changedPixels === 15, 'Changed pixels is 15');
  assert(changeResult.affectedAreaPercentage === 15.0, 'Affected area percentage is 15.0%');
  assert(changeResult.affectedAreaM2 === 1500, 'Affected area is 1500 m²');
  assert(changeResult.affectedAreaHa === 0.15, 'Affected area in ha is 0.15 ha');
  assert(changeResult.originalCrs === 'EPSG:32643', 'originalCrs preserved in change result');
  assert(changeResult.normalizedCrs === 'EPSG:32643', 'normalizedCrs preserved in change result');

  console.log('\n================================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passed} assertions passed, 0 failures!`);
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
