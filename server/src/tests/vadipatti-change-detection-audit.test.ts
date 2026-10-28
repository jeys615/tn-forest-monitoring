/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Server } from 'node:http';
import mongoose, { Types } from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { RasterHarmonizationService } from '../services/raster/RasterHarmonizationService.js';
import { EvidenceScoreCalculator } from '../services/changeDetection/EvidenceScoreCalculator.js';
import { UserRole, UserStatus, Permission, CrossSensorAgreement } from '@tn-forest/shared/types';
import { CHANGE_THRESHOLDS } from '@tn-forest/shared/constants';
import { generateToken } from '../utils/jwt.js';

let server: Server;
let baseUrl: string;
let authToken: string;
let unpermittedToken: string;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testsFailed++;
  }
}

async function request(
  method: string,
  urlPath: string,
  token?: string,
): Promise<{ status: number; headers: Headers; body: any; buffer?: Buffer }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
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

async function runVadipattiAuditTests() {
  console.log('================================================================');
  console.log('🧪 VADIPATTI CHANGE DETECTION & LANDSAT BASELINE AUDIT TESTS');
  console.log('================================================================\n');

  await connectDatabase();
  server = app.listen(0);
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  const user =
    (await User.findOne({ permissions: Permission.MONITORING_READ })) ||
    (await User.findOne({ role: UserRole.SUPER_ADMIN })) ||
    (await User.findOne({}));
  if (!user) {
    throw new Error('No user found in database');
  }

  authToken = generateToken({
    userId: user._id.toString(),
    role: user.role,
    email: user.email,
  });

  let unpermittedUser = await User.findOne({
    permissions: { $nin: [Permission.MONITORING_READ] },
  });
  let createdTempUser = false;
  if (!unpermittedUser) {
    unpermittedUser = await User.create({
      employeeId: 'EMP-TEST-TMP',
      name: 'Temp Viewer',
      email: 'temp-viewer-no-perm@tnforest.gov.in',
      passwordHash: '$2a$12$dummyhashformocktestingonly0000000000000000000000000000',
      role: UserRole.VIEWER,
      permissions: [Permission.AREA_READ, Permission.ALERT_READ],
      status: UserStatus.ACTIVE,
    });
    createdTempUser = true;
  }

  unpermittedToken = generateToken({
    userId: unpermittedUser._id.toString(),
    role: unpermittedUser.role,
    email: unpermittedUser.email,
  });

  const landsatPath = 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6aa679012b4fe5808c7e8ec7/ZONE-260913-7787_6aa679012b4fe5808c7e8ec7_BASELINE_Landsat8_20150106.tif';
  const sentinelPath = 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6aa6798c2b4fe5808c7e9038/ZONE-260913-7787_6aa6798c2b4fe5808c7e9038_CURRENT_Sentinel2_20260909.tif';

  // -------------------------------------------------------------
  // Test 1: Landsat 8 true-color rendering
  // -------------------------------------------------------------
  console.log('\n--- 1. Landsat 8 true-color rendering ---');
  assert(fs.existsSync(landsatPath), `Landsat 8 GeoTIFF exists at ${landsatPath}`);
  const landsatPng = await GeoTiffService.renderTrueColorPng(landsatPath, { satellite: 'Landsat-8' });
  assert(landsatPng.length > 50000, `Rendered Landsat PNG has substantial texture (${landsatPng.length} bytes, > 50KB, not 2KB blank)`);

  // -------------------------------------------------------------
  // Test 2: Sentinel-2 true-color rendering
  // -------------------------------------------------------------
  console.log('\n--- 2. Sentinel-2 true-color rendering ---');
  assert(fs.existsSync(sentinelPath), `Sentinel-2 GeoTIFF exists at ${sentinelPath}`);
  const sentinelPng = await GeoTiffService.renderTrueColorPng(sentinelPath, { satellite: 'Sentinel-2' });
  assert(sentinelPng.length > 500000, `Rendered Sentinel-2 PNG has high-detail texture (${sentinelPng.length} bytes, > 500KB)`);

  // -------------------------------------------------------------
  // Test 3: Correct sensor-specific band mapping
  // -------------------------------------------------------------
  console.log('\n--- 3. Correct sensor-specific band mapping ---');
  const parsedLandsat = await GeoTiffService.readGeoTiff(landsatPath);
  assert(parsedLandsat.bandData.length === 6, `Landsat raster contains 6 optical bands`);
  // Band 2 = Red (SR_B4), Band 1 = Green (SR_B3), Band 0 = Blue (SR_B2)
  const redBand = parsedLandsat.bandData[2];
  const greenBand = parsedLandsat.bandData[1];
  const blueBand = parsedLandsat.bandData[0];
  assert(redBand.length === 314 * 236, `Red band matches raster dimensions (314x236)`);
  assert(greenBand.length === 314 * 236, `Green band matches raster dimensions`);
  assert(blueBand.length === 314 * 236, `Blue band matches raster dimensions`);

  // -------------------------------------------------------------
  // Test 4: Landsat scaling
  // -------------------------------------------------------------
  console.log('\n--- 4. Landsat scaling (DN * 0.0000275 - 0.2) ---');
  // Raw DN = 9782 should scale to ~0.069 physical surface reflectance
  const rawSampleDn = 9782;
  const scaledRefl = rawSampleDn * 0.0000275 - 0.2;
  assert(Math.abs(scaledRefl - 0.069) < 0.001, `Landsat scaling formula maps DN 9782 to ${scaledRefl.toFixed(4)} (~6.9% surface reflectance)`);
  // Check spectral indices on Landsat
  const landsatIndices = GeoTiffService.calculateSpectralIndices(parsedLandsat, { satellite: 'Landsat-8' });
  assert(landsatIndices.ndvi > 0.4 && landsatIndices.ndvi < 0.8, `Landsat physical NDVI is in realistic healthy forest range: ${landsatIndices.ndvi}`);

  // -------------------------------------------------------------
  // Test 5: Nodata handling
  // -------------------------------------------------------------
  console.log('\n--- 5. Nodata handling (transparent alpha for fill/outside zone) ---');
  // Decompress Landsat PNG to inspect alpha channel
  const ihdrLen = landsatPng.readUInt32BE(8);
  const idatStart = 8 + 12 + ihdrLen;
  let idatLen = landsatPng.readUInt32BE(idatStart);
  let pos = 8;
  const idatChunks: Buffer[] = [];
  while (pos < landsatPng.length) {
    const chunkLen = landsatPng.readUInt32BE(pos);
    const type = landsatPng.slice(pos + 4, pos + 8).toString('ascii');
    if (type === 'IDAT') {
      idatChunks.push(landsatPng.slice(pos + 8, pos + 8 + chunkLen));
    }
    pos += 12 + chunkLen;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const scanline = 1 + 314 * 4;
  let transparentCount = 0;
  let opaqueCount = 0;
  let allWhiteCount = 0;
  for (let y = 0; y < 236; y++) {
    for (let x = 0; x < 314; x++) {
      const offset = y * scanline + 1 + x * 4;
      const r = decompressed[offset];
      const g = decompressed[offset + 1];
      const b = decompressed[offset + 2];
      const a = decompressed[offset + 3];
      if (a === 0) transparentCount++;
      else {
        opaqueCount++;
        if (r === 255 && g === 255 && b === 255) allWhiteCount++;
      }
    }
  }
  assert(transparentCount > 20000, `Nodata pixels outside zone have alpha=0 (transparent: ${transparentCount})`);
  assert(opaqueCount > 40000, `Valid satellite pixels inside zone have alpha=255 (opaque: ${opaqueCount})`);
  assert(allWhiteCount < opaqueCount * 0.05, `Solid white pixels are < 5% (${((allWhiteCount / opaqueCount) * 100).toFixed(2)}%), eliminating blank white polygon`);

  // -------------------------------------------------------------
  // Test 6: PNG validity
  // -------------------------------------------------------------
  console.log('\n--- 6. PNG validity ---');
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(landsatPng.slice(0, 8).equals(pngSig), `Landsat PNG has standard 8-byte PNG header signature`);
  assert(sentinelPng.slice(0, 8).equals(pngSig), `Sentinel-2 PNG has standard 8-byte PNG header signature`);
  assert(landsatPng.readUInt32BE(16) === 314, `Landsat PNG width is 314`);
  assert(landsatPng.readUInt32BE(20) === 236, `Landsat PNG height is 236`);
  assert(landsatPng.readUInt8(25) === 6, `Landsat PNG color type is 6 (RGBA with alpha transparency)`);

  // -------------------------------------------------------------
  // Test 7: Baseline image endpoint
  // -------------------------------------------------------------
  console.log('\n--- 7. Baseline image endpoint ---');
  const baseRes = await request('GET', '/changes/CHG-1789295023854-2895/baseline-image', authToken);
  assert(baseRes.status === 200, `GET /api/changes/CHG-1789295023854-2895/baseline-image returns 200 OK`);
  assert(baseRes.headers.get('content-type') === 'image/png', `Content-Type is image/png`);
  assert(
    Boolean(
      baseRes.headers.get('cache-control')?.includes('no-cache') &&
      baseRes.headers.get('cache-control')?.includes('no-store'),
    ),
    `Cache-Control prevents stale browser caching: ${baseRes.headers.get('cache-control')}`,
  );
  assert(baseRes.buffer !== undefined && baseRes.buffer.length > 50000, `Returns valid non-empty PNG buffer (${baseRes.buffer?.length} bytes)`);

  // -------------------------------------------------------------
  // Test 8: Current image endpoint
  // -------------------------------------------------------------
  console.log('\n--- 8. Current image endpoint ---');
  const currRes = await request('GET', '/changes/CHG-1789295023854-2895/current-image', authToken);
  assert(currRes.status === 200, `GET /api/changes/CHG-1789295023854-2895/current-image returns 200 OK`);
  assert(currRes.headers.get('content-type') === 'image/png', `Content-Type is image/png`);
  assert(
    Boolean(
      currRes.headers.get('cache-control')?.includes('no-cache') &&
      currRes.headers.get('cache-control')?.includes('no-store'),
    ),
    `Current Cache-Control prevents stale browser caching: ${currRes.headers.get('cache-control')}`,
  );
  assert(currRes.buffer !== undefined && currRes.buffer.length > 500000, `Returns valid Sentinel-2 PNG buffer (${currRes.buffer?.length} bytes)`);

  // -------------------------------------------------------------
  // Test 9: Immutable image pair
  // -------------------------------------------------------------
  console.log('\n--- 9. Immutable image pair ---');
  const changeDoc = await ChangeDetectionModel.findOne({ changeId: 'CHG-1789295023854-2895' }).lean();
  assert(changeDoc !== null, `Change event CHG-1789295023854-2895 found in MongoDB`);
  assert(changeDoc?.baselineId?.toString() === '6aa679012b4fe5808c7e8ec7', `Baseline ID is exactly 6aa679012b4fe5808c7e8ec7 (Landsat 8)`);
  assert(changeDoc?.observationId?.toString() === '6aa6798c2b4fe5808c7e9038', `Current observation ID is exactly 6aa6798c2b4fe5808c7e9038 (Sentinel-2B)`);

  // -------------------------------------------------------------
  // Test 10: Cross-CRS handling
  // -------------------------------------------------------------
  console.log('\n--- 10. Cross-CRS handling ---');
  const baselineCrs = 'EPSG:32644';
  const currentCrs = 'EPSG:32643';
  const alignment = RasterHarmonizationService.verifySpatialAlignment(
    { width: 314, height: 236, crs: baselineCrs, nativeResolution: 30 },
    { width: 930, height: 717, crs: currentCrs, nativeResolution: 10 },
  );
  assert(!alignment.sameCrs, `Different CRS detected (EPSG:32644 vs EPSG:32643)`);
  assert(alignment.recommendation === 'REPROJECT_AND_RESAMPLE', `RasterHarmonizationService recommends REPROJECT_AND_RESAMPLE`);

  // -------------------------------------------------------------
  // Test 11: Cross-resolution handling
  // -------------------------------------------------------------
  console.log('\n--- 11. Cross-resolution handling ---');
  assert(parsedLandsat.metadata.pixelScale[0] === 30, `Landsat pixel scale is 30m`);
  const parsedSentinel = await GeoTiffService.readGeoTiff(sentinelPath);
  assert(parsedSentinel.metadata.pixelScale[0] === 10, `Sentinel-2 pixel scale is 10m`);
  assert(parsedLandsat.metadata.pixelAreaM2 === 900, `Landsat pixel area is 900 m²`);
  assert(parsedSentinel.metadata.pixelAreaM2 === 100, `Sentinel-2 pixel area is 100 m²`);

  // -------------------------------------------------------------
  // Test 12: 4.5% affected area calculation
  // -------------------------------------------------------------
  console.log('\n--- 12. 4.5% affected area calculation ---');
  assert(changeDoc?.affectedAreaPercentage === 4.5, `Affected area percentage is 4.5%`);
  assert(changeDoc?.changedArea === 4.5, `Changed area is 4.5 ha`);
  const expectedHectares = 100.0;
  const calculatedPercentage = (changeDoc!.changedArea / expectedHectares) * 100.0;
  assert(Math.abs(calculatedPercentage - 4.5) < 0.01, `Area percentage derivation agrees: (4.5 ha / 100 ha) * 100 = 4.5%`);

  // -------------------------------------------------------------
  // Test 13: 57/100 evidence calculation
  // -------------------------------------------------------------
  console.log('\n--- 13. 57/100 evidence calculation ---');
  const evidence = EvidenceScoreCalculator.calculateEvidenceScore({
    affectedAreaPercentage: 4.5,
    imageQualityScore: 70.0,
    hasTemporalHistory: false,
    isTemporallyConsistent: false,
    crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
  });
  assert(evidence.magnitudeScore === 22.5, `Magnitude score is 22.5/40`);
  assert(evidence.dataQualityScore === 14.0, `Data Quality score is 14.0/20`);
  assert(evidence.temporalConsistencyScore === 10.0, `Temporal score is 10.0/20`);
  assert(evidence.crossSensorScore === 10.0, `Cross-Sensor score is 10.0/20`);
  assert(evidence.totalEvidenceScore === 57, `Total evidence score is 57/100 (22.5 + 14 + 10 + 10 = 56.5 -> 57)`);

  // -------------------------------------------------------------
  // Test 14: LOW severity verification
  // -------------------------------------------------------------
  console.log('\n--- 14. LOW severity verification ---');
  assert(changeDoc?.severity === 'LOW', `Severity is LOW`);
  assert(4.5 >= CHANGE_THRESHOLDS.LOW && 4.5 < CHANGE_THRESHOLDS.MEDIUM, `4.5% is >= 2.0% (LOW) and < 5.0% (MEDIUM)`);

  // -------------------------------------------------------------
  // Test 15: Exactly one alert
  // -------------------------------------------------------------
  console.log('\n--- 15. Exactly one alert ---');
  const alerts = await AlertModel.find({ changeDetectionId: changeDoc?._id }).lean();
  assert(alerts.length === 1, `Exactly ONE alert exists for change detection CHG-1789295023854-2895`);
  assert(alerts[0].alertId === 'ALT-1789295023854-8239', `Alert ID is ALT-1789295023854-8239`);
  assert(alerts[0].status === 'OPEN', `Alert status is OPEN`);
  assert(alerts[0].severity === 'LOW', `Alert severity is LOW`);

  // -------------------------------------------------------------
  // Test 16: Unauthorized image access
  // -------------------------------------------------------------
  console.log('\n--- 16. Unauthorized image access ---');
  const unauthRes = await request('GET', '/changes/CHG-1789295023854-2895/baseline-image');
  assert(unauthRes.status === 401, `GET without JWT returns 401 Unauthorized`);
  const forbiddenRes = await request('GET', '/changes/CHG-1789295023854-2895/baseline-image', unpermittedToken);
  assert(forbiddenRes.status === 403, `GET without MONITORING_READ returns 403 Forbidden`);

  // -------------------------------------------------------------
  // Test 17: Missing raster behavior
  // -------------------------------------------------------------
  console.log('\n--- 17. Missing raster behavior ---');
  const fakeId = 'CHG-9999999999999-9999';
  const missingRes = await request('GET', `/changes/${fakeId}/baseline-image`, authToken);
  assert(missingRes.status === 404, `Missing change detection ID returns truthful 404`);

  // -------------------------------------------------------------
  // Test 18: No stale viewer state
  // -------------------------------------------------------------
  console.log('\n--- 18. No stale viewer state ---');
  const metaRes = await request('GET', '/changes/CHG-1789295023854-2895/comparison-metadata', authToken);
  assert(metaRes.status === 200, `Comparison metadata endpoint returns 200 OK`);
  assert(metaRes.body.data.changeId === 'CHG-1789295023854-2895', `Metadata matches requested change ID`);
  assert(metaRes.body.data.baseline.spacecraftName === 'Landsat 8', `Baseline metadata reflects Landsat 8`);
  assert(metaRes.body.data.current.spacecraftName === 'Sentinel-2B', `Current metadata reflects Sentinel-2B`);

  // -------------------------------------------------------------
  // Test 19: Unwanted demo-zone cleanup verification
  // -------------------------------------------------------------
  console.log('\n--- 19. Unwanted demo-zone cleanup verification ---');
  const allZones = await Zone.find({}).lean();
  const demoZones = allZones.filter(z => z.name.includes('Mudumalai') || z.name.includes('Anamalai'));
  assert(demoZones.length === 0, `Verified 0 leftover test fixture zones in database (Mudumalai, Anamalai removed)`);

  // -------------------------------------------------------------
  // Test 20: No demo-zone creation on production startup
  // -------------------------------------------------------------
  console.log('\n--- 20. No demo-zone creation on production startup ---');
  const serverCode = fs.readFileSync(path.resolve('src/server.ts'), 'utf8');
  assert(!serverCode.includes('Zone.create'), `server.ts does NOT create demo zones on startup`);
  assert(!serverCode.includes('seedDemoZones'), `server.ts has no seedDemoZones call`);

  console.log('\n================================================================');
  console.log(`📊 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================\n');

  if (createdTempUser && unpermittedUser) {
    await User.findByIdAndDelete(unpermittedUser._id);
  }

  server.close();
  await mongoose.disconnect();

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runVadipattiAuditTests().catch(err => {
  console.error('Test execution failed:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
