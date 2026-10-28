/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import { UserRole, Permission, ProcessingMode, SpatialCalculationSource } from '@tn-forest/shared/types';
import { generateToken } from '../utils/jwt.js';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;
let authToken: string;

async function request(
  method: string,
  path: string,
  token?: string,
): Promise<{ status: number; headers: Headers; body: any; buffer?: Buffer }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    return { status: res.status, headers: res.headers, body: json };
  } else {
    const arrayBuf = await res.arrayBuffer();
    return { status: res.status, headers: res.headers, body: null, buffer: Buffer.from(arrayBuf) };
  }
}

async function runAuditTests() {
  console.info('================================================================');
  console.info('🧪 STARTING CHANGE DETECTION MODULE AUDIT & REGRESSION TESTS');
  console.info('================================================================\n');

  await connectDatabase();
  server = app.listen(0);
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  const user =
    (await User.findOne({ permissions: Permission.MONITORING_READ })) ||
    (await User.findOne({ role: UserRole.SUPER_ADMIN })) ||
    (await User.findOne({}));
  if (!user) {
    throw new Error('No existing user found in database');
  }
  authToken = generateToken({
    userId: user._id.toString(),
    role: user.role,
    email: user.email,
  });

  const changeId = 'CHG-1788726810637-8266';
  const histChangeId = 'CHG-1788721706458-8240';
  const service = new ChangeDetectionService();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // 1. Calculation Mode Provenance (REAL, not SIMULATED)
  console.log('--- TEST GROUP 1: Provenance & Calculation Mode ---');
  const targetChange = await ChangeDetectionModel.findOne({ changeId });
  assert(targetChange !== null, 'Target change record exists in DB');
  assert(targetChange?.calculationMode === ProcessingMode.REAL, 'Calculation mode is REAL, not SIMULATED');
  assert(targetChange?.spatialSource === SpatialCalculationSource.RASTER, 'Spatial source is RASTER');
  assert(!targetChange?.explanation?.includes('Simulated'), "Explanation does not contain word 'Simulated'");
  assert(
    targetChange?.explanation?.includes('Confirmed via real satellite raster analysis') ?? false,
    'Explanation states confirmed via real satellite raster analysis',
  );

  // 2. Strict Immutable Image Pair Integrity
  console.log('\n--- TEST GROUP 2: Strict Immutable Image Pair Integrity ---');
  const meta = await service.getComparisonMetadata(changeId);
  assert(
    meta.baseline.imageId === 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
    'Baseline image strictly matches 2020-01-09 GEE scene',
  );
  assert(
    meta.current.imageId === 'COPERNICUS/S2_SR_HARMONIZED/20260731T050649_20260731T052211_T43PHM',
    'Current observation strictly matches 2026-07-31 GEE scene',
  );
  assert(meta.baseline.acquisitionTimeUtc.startsWith('2020-01-09'), 'Baseline UTC date is 2020-01-09');
  assert(meta.current.acquisitionTimeUtc.startsWith('2026-07-31'), 'Current UTC date is 2026-07-31');

  // Test multi-observation isolation: Historical 2021 event must resolve 2021 scene, never 2026 scene
  const histMeta = await service.getComparisonMetadata(histChangeId);
  assert(
    histMeta.baseline.imageId === 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
    'Historical event uses its 2020 baseline',
  );
  assert(
    histMeta.current.imageId === 'COPERNICUS/S2_SR_HARMONIZED/20210428T050649_20210428T052121_T43PHM',
    'Historical event strictly resolves 2021 observation, NOT latest 2026 observation',
  );

  // 3. Dynamic Temporal Gap
  console.log('\n--- TEST GROUP 3: Dynamic Temporal Gap Calculation ---');
  assert(meta.temporalGap.days === 2395, 'Observation gap in days is exactly 2,395 days', `Got ${meta.temporalGap.days}`);
  assert(
    meta.temporalGap.formatted.includes('6 years, 6 months'),
    'Formatted gap indicates 6 years, 6 months',
    meta.temporalGap.formatted,
  );

  // 4. Spectral Deltas & Affected Area Math
  console.log('\n--- TEST GROUP 4: Spectral Deltas & Area Calculation ---');
  assert(meta.spectralDeltas.ndviDelta === -0.029, 'NDVI delta is -0.029');
  assert(meta.spectralDeltas.ndwiDelta === -0.034, 'NDWI delta is -0.034');
  assert(meta.spectralDeltas.ndbiDelta === 0.034, 'NDBI delta is +0.034');
  assert(meta.spectralDeltas.bsiDelta === 0.034, 'BSI delta is +0.034');
  assert(meta.spectralDeltas.saviDelta === -0.024, 'SAVI delta is -0.024');
  assert(meta.spectralDeltas.eviDelta === -0.025, 'EVI delta is -0.025');

  assert(meta.affectedAreaPercentage === 1.58, 'Affected area percentage is 1.58%');
  assert(meta.changedArea === 1.58, 'Changed area is 1.58 ha');
  assert(meta.zoneArea === 100, 'Zone area is 100 ha');
  assert(meta.baseline.crs === 'EPSG:32643', 'Native raster CRS is EPSG:32643');
  assert(meta.baseline.resolutionMeters === 10, 'Resolution is 10 meters');
  assert(meta.baseline.pixelAreaM2 === 100, 'Pixel area is 100 m²');

  // 5. Evidence Breakdown & Scoring
  console.log('\n--- TEST GROUP 5: Evidence Score & Severity Verification ---');
  assert(meta.evidenceStrength === 53, 'Total evidence score is 53/100');
  assert(meta.evidenceBreakdown.magnitudeScore === 7.9, 'Magnitude score is 7.9/40');
  assert(meta.evidenceBreakdown.dataQualityScore === 15.2, 'Data quality score is 15.2/20');
  assert(meta.evidenceBreakdown.temporalConsistencyScore === 20, 'Temporal consistency score is 20/20');
  assert(meta.evidenceBreakdown.crossSensorScore === 10, 'Cross-sensor score is 10/20 (single sensor baseline)');
  assert(meta.crossSensorAgreement === 'SINGLE_SENSOR', 'Cross sensor agreement is SINGLE_SENSOR');
  assert(meta.severity === 'NONE', 'Severity is NONE (< 2% threshold)');
  assert(meta.alertGenerated === false, 'Alert was not generated (alerts = 0)');

  // 6. Authenticated Image Serving & Security
  console.log('\n--- TEST GROUP 6: Authenticated Image Serving & Security ---');
  // Unauthenticated request must be rejected (401)
  const unauthBaseRes = await request('GET', `/changes/${changeId}/baseline-image`);
  assert(unauthBaseRes.status === 401, 'Unauthenticated request to baseline image is rejected with 401');

  const unauthCurrRes = await request('GET', `/changes/${changeId}/current-image`);
  assert(unauthCurrRes.status === 401, 'Unauthenticated request to current image is rejected with 401');

  // Authenticated baseline image serving
  const authBaseRes = await request('GET', `/changes/${changeId}/baseline-image`, authToken);
  assert(authBaseRes.status === 200, 'Authenticated request to baseline image returns 200 OK');
  assert(authBaseRes.headers.get('content-type') === 'image/png', 'Baseline image Content-Type is image/png');
  assert(
    authBaseRes.buffer !== undefined && authBaseRes.buffer.length > 50000,
    'Baseline PNG payload is non-empty (> 50KB)',
  );
  assert(
    authBaseRes.buffer?.[0] === 0x89 && authBaseRes.buffer?.[1] === 0x50,
    'Baseline buffer has valid PNG signature',
  );

  // Authenticated current image serving
  const authCurrRes = await request('GET', `/changes/${changeId}/current-image`, authToken);
  assert(authCurrRes.status === 200, 'Authenticated request to current image returns 200 OK');
  assert(authCurrRes.headers.get('content-type') === 'image/png', 'Current image Content-Type is image/png');
  assert(
    authCurrRes.buffer !== undefined && authCurrRes.buffer.length > 50000,
    'Current PNG payload is non-empty (> 50KB)',
  );
  assert(
    authCurrRes.buffer?.[0] === 0x89 && authCurrRes.buffer?.[1] === 0x50,
    'Current buffer has valid PNG signature',
  );

  // Comparison metadata endpoint
  const authMetaRes = await request('GET', `/changes/${changeId}/comparison-metadata`, authToken);
  assert(authMetaRes.status === 200, 'Authenticated comparison-metadata endpoint returns 200 OK');
  assert(authMetaRes.body.success === true, 'Response JSON success is true');
  assert(authMetaRes.body.data.baseline.imageId.includes('20200109'), 'API returns correct baseline image ID');
  assert(authMetaRes.body.data.current.imageId.includes('20260731'), 'API returns correct current image ID');

  // Missing raster honest error handling (Never substitutes unrelated image)
  console.log('\n--- TEST GROUP 7: Missing Raster Honest Error Handling ---');
  await SatelliteMetadata.deleteMany({ imageId: /DUMMY_MISSING_RASTER/ });
  await ChangeDetectionModel.deleteMany({ changeId: /CHG-DUMMY-MISSING/ });

  const dummyImageId = `COPERNICUS/S2_SR_HARMONIZED/DUMMY_MISSING_RASTER_${Date.now()}`;
  const dummyObs = await SatelliteMetadata.create({
    imageId: dummyImageId,
    source: 'SENTINEL_2',
    sensorType: 'OPTICAL',
    acquisitionDate: new Date('2025-01-01'),
    cloudCover: 5,
    processingStatus: 'PROCESSED',
    geeReference: 'ee.Image("COPERNICUS/S2_SR_HARMONIZED/DUMMY_MISSING_RASTER")',
    footprint: {
      type: 'Polygon',
      coordinates: [
        [
          [78.0, 10.0],
          [78.1, 10.0],
          [78.1, 10.1],
          [78.0, 10.1],
          [78.0, 10.0],
        ],
      ],
    },
    localRasterPath: 'D:\\\\non_existent_path\\\\missing_raster.tif',
  });
  const dummyChange = await ChangeDetectionModel.create({
    changeId: 'CHG-DUMMY-MISSING-TEST',
    zoneId: targetChange?.zoneId,
    baselineId: targetChange?.baselineId,
    observationId: dummyObs._id,
    sensorType: 'OPTICAL',
    source: 'SENTINEL_2',
    detectedAt: new Date('2025-01-01'),
    zoneArea: 100,
    changedArea: 1.0,
    affectedAreaPercentage: 1.0,
    calculationMode: 'REAL',
    spatialSource: 'RASTER',
    severity: 'NONE',
    evidenceStrength: 50,
    evidenceBreakdown: {
      magnitudeScore: 5,
      dataQualityScore: 15,
      temporalConsistencyScore: 10,
      crossSensorScore: 10,
      totalEvidenceScore: 40,
      explanation: 'Test missing raster',
    },
    temporalConsistency: 'INSUFFICIENT_HISTORY',
    explanation: 'Test missing raster event',
    categories: ['SURFACE_CHANGE'],
    changeIndicators: { ndviDelta: -0.01 },
  });

  const missingRasterRes = await request('GET', `/changes/${dummyChange.changeId}/current-image`, authToken);
  assert(missingRasterRes.status === 404, 'Missing raster returns truthful 404 error');
  assert(
    missingRasterRes.body.message.includes('unavailable'),
    'Error message truthfully states raster is unavailable',
  );

  // Cleanup dummy
  await ChangeDetectionModel.deleteOne({ _id: dummyChange._id });
  await SatelliteMetadata.deleteOne({ _id: dummyObs._id });

  server.close();
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTests().catch((err) => {
  console.error('Test execution error:', err);
  if (server) server.close();
  process.exit(1);
});
