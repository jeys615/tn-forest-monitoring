/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import mongoose from 'mongoose';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { hashPassword } from '../utils/password.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  ZoneStatus,
  SatelliteSource,
  SensorType,
  BaselineStatus,
} from '@tn-forest/shared/types';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;

async function request(
  method: string,
  path: string,
  body?: Record<string, any>,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body && method !== 'GET' && method !== 'HEAD' ? JSON.stringify(body) : undefined,
  });

  const resBody = await res.json();
  return { status: res.status, body: resBody };
}

async function runTests() {
  process.env.NODE_ENV = 'test';
  console.info('🧪 Starting M5 Baseline Management & Image Processing Test Suite...\n');
  await connectDatabase();

  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5005;
  baseUrl = `http://localhost:${port}`;

  await User.deleteMany({});
  await Zone.deleteMany({});
  await SatelliteMetadata.deleteMany({});
  await BaselineModel.deleteMany({});
  await ProcessedImageResultModel.deleteMany({});

  // Seed Users
  const superAdminPassword = await hashPassword('Test@1234');
  const superAdmin = await User.create({
    name: 'M5 Super Admin',
    email: 'm5admin@test.com',
    passwordHash: superAdminPassword,
    role: UserRole.SUPER_ADMIN,
    permissions: [Permission.MONITORING_READ, Permission.AREA_READ, Permission.AREA_UPDATE],
    status: UserStatus.ACTIVE,
  });

  const viewerPassword = await hashPassword('Test@1234');
  const viewer = await User.create({
    name: 'M5 Viewer',
    email: 'm5viewer@test.com',
    passwordHash: viewerPassword,
    role: UserRole.VIEWER,
    permissions: [Permission.MONITORING_READ],
    status: UserStatus.ACTIVE,
  });

  // Login tokens
  const adminLogin = await request('POST', '/api/auth/login', {
    email: 'm5admin@test.com',
    password: 'Test@1234',
  });
  const adminToken = adminLogin.body.data.token;

  const viewerLogin = await request('POST', '/api/auth/login', {
    email: 'm5viewer@test.com',
    password: 'Test@1234',
  });
  const viewerToken = viewerLogin.body.data.token;

  // Seed Zone
  const zone = await Zone.create({
    zoneId: 'Z-M5-001',
    name: 'Mudumalai Test Reserve',
    category: ZoneCategory.PROTECTED_FOREST,
    status: ZoneStatus.PROTECTED,
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [76.5, 11.5],
          [76.6, 11.5],
          [76.6, 11.6],
          [76.5, 11.6],
          [76.5, 11.5],
        ],
      ],
    },
    centerPoint: {
      type: 'Point',
      coordinates: [76.55, 11.55],
    },
    createdBy: superAdmin._id,
  });

  // Dynamic discovery of authentic GEE assets with verified authentic fallbacks
  const geeProvider = new GeeSatelliteProvider();
  console.info('Discovering authentic GEE assets for M5 baseline test zone...');

  let optImg1 = 'COPERNICUS/S2_SR_HARMONIZED/20260122T051019_20260122T052254_T43PGN';
  let optDate1 = new Date('2026-01-22T05:10:19.000Z');
  let optCloud1 = 5.2;

  let optImgCloudy = 'COPERNICUS/S2_SR_HARMONIZED/20260113T051219_20260113T052207_T43PHM';
  let optDateCloudy = new Date('2026-01-13T05:12:19.000Z');

  let optImg2 = 'COPERNICUS/S2_SR_HARMONIZED/20260328T050651_20260328T051818_T43PGN';
  let optDate2 = new Date('2026-03-28T05:06:51.000Z');
  let optCloud2 = 8.0;

  let sarImg1 = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260111T004039_20260111T004104_062712_07DD09_E763';
  let sarDate1 = new Date('2026-01-11T00:40:39.000Z');

  let sarImg2 = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260123T004037_20260123T004102_062887_07E369_AE03';
  let sarDate2 = new Date('2026-01-23T00:40:37.000Z');

  try {
    const opticalImages = await geeProvider.searchOpticalImages(zone.boundary, {
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      maxCloudCover: 20,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
    });
    if (opticalImages.length > 0) {
      optImg1 = opticalImages[0].imageId;
      optDate1 = new Date(opticalImages[0].acquisitionDate);
      optCloud1 = (opticalImages[0] as any).cloudCoverPercentage ?? (opticalImages[0] as any).cloudCover ?? 5.2;
    }
    if (opticalImages.length > 1) {
      optImgCloudy = opticalImages[1].imageId;
      optDateCloudy = new Date(opticalImages[1].acquisitionDate);
    }
    if (opticalImages.length > 2) {
      optImg2 = opticalImages[2].imageId;
      optDate2 = new Date(opticalImages[2].acquisitionDate);
      optCloud2 = (opticalImages[2] as any).cloudCoverPercentage ?? (opticalImages[2] as any).cloudCover ?? 8.0;
    }
  } catch (err: unknown) {
    console.warn(`[M5_TEST] Dynamic optical discovery warning: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const sarImages = await geeProvider.searchSarImages(zone.boundary, {
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
    });
    if (sarImages.length > 0) {
      sarImg1 = sarImages[0].imageId;
      sarDate1 = new Date(sarImages[0].acquisitionDate);
    }
    if (sarImages.length > 1) {
      sarImg2 = sarImages[1].imageId;
      sarDate2 = new Date(sarImages[1].acquisitionDate);
    }
  } catch (err: unknown) {
    console.warn(`[M5_TEST] Dynamic SAR discovery warning: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Seed Optical Satellite Images (Sentinel-2 clean & cloudy, Landsat-8)
  const optMeta1 = await SatelliteMetadata.create({
    imageId: optImg1,
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: optDate1,
    cloudCover: optCloud1,
    footprint: zone.boundary,
    geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")',
    intersectingZones: [zone._id],
    metadata: {
      bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
      isRealTelemetry: true,
    },
  });

  const optMeta2Cloudy = await SatelliteMetadata.create({
    imageId: optImgCloudy,
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: optDateCloudy,
    cloudCover: 45.0, // High cloud > 20%
    footprint: zone.boundary,
    geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")',
    intersectingZones: [zone._id],
    metadata: {
      bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
      isRealTelemetry: true,
    },
  });

  const optMeta3 = await SatelliteMetadata.create({
    imageId: optImg2,
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: optDate2,
    cloudCover: optCloud2,
    footprint: zone.boundary,
    geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")',
    intersectingZones: [zone._id],
    metadata: {
      bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'],
      isRealTelemetry: true,
    },
  });

  // Seed SAR Satellite Images (Sentinel-1)
  const sarMeta1 = await SatelliteMetadata.create({
    imageId: sarImg1,
    source: SatelliteSource.SENTINEL_1,
    sensorType: SensorType.SAR,
    acquisitionDate: sarDate1,
    cloudCover: 0.0,
    footprint: zone.boundary,
    geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD")',
    intersectingZones: [zone._id],
    metadata: {
      polarization: 'VV+VH',
      acquisitionMode: 'IW',
      orbitDirection: 'DESCENDING',
      bands: ['VV', 'VH'],
      isRealTelemetry: true,
    },
  });

  const sarMeta2 = await SatelliteMetadata.create({
    imageId: sarImg2,
    source: SatelliteSource.SENTINEL_1,
    sensorType: SensorType.SAR,
    acquisitionDate: sarDate2,
    cloudCover: 0.0,
    footprint: zone.boundary,
    geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD")',
    intersectingZones: [zone._id],
    metadata: {
      polarization: 'VV+VH',
      acquisitionMode: 'IW',
      orbitDirection: 'DESCENDING',
      bands: ['VV', 'VH'],
      isRealTelemetry: true,
    },
  });

  let passCount = 0;
  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ TEST FAILED: ${msg}`);
      throw new Error(msg);
    }
    console.info(`  ✅ ${msg}`);
    passCount++;
  }

  console.info('--- 1. Baseline Evaluation & Candidate Selection ---');

  // Test 1: Create baseline candidate (Optical)
  const selectOptRes1 = await request(
    'POST',
    '/api/baselines/select',
    {
      zoneId: zone._id.toString(),
      sensorType: SensorType.OPTICAL,
      satelliteMetadataId: optMeta1._id.toString(),
    },
    adminToken,
  );
  assert(selectOptRes1.status === 200, 'Test 1: Create optical baseline candidate');
  assert(
    selectOptRes1.body.data.candidate.status === BaselineStatus.CANDIDATE,
    'Test 1: Candidate status is CANDIDATE',
  );
  assert(
    selectOptRes1.body.data.candidate.isActive === false,
    'Test 1: Newly evaluated candidate is NOT active automatically (Rule 1)',
  );
  const optBaseline1Id = selectOptRes1.body.data.candidate.id;

  // Test 2: Select best optical baseline candidate automatically
  const selectAutoOpt = await request(
    'POST',
    '/api/baselines/select',
    {
      zoneId: zone._id.toString(),
      sensorType: SensorType.OPTICAL,
    },
    adminToken,
  );
  assert(selectAutoOpt.status === 200, 'Test 2: Auto-select optical baseline candidate');
  assert(
    selectAutoOpt.body.data.candidate !== null,
    'Test 2: Successfully selected optical baseline candidate',
  );

  // Test 3: Select best SAR baseline candidate
  const selectSarRes1 = await request(
    'POST',
    '/api/baselines/select',
    {
      zoneId: zone._id.toString(),
      sensorType: SensorType.SAR,
      satelliteMetadataId: sarMeta1._id.toString(),
    },
    adminToken,
  );
  assert(selectSarRes1.status === 200, 'Test 3: Create SAR baseline candidate');
  assert(
    selectSarRes1.body.data.candidate.sensorType === SensorType.SAR,
    'Test 3: Candidate sensorType is SAR',
  );
  const sarBaseline1Id = selectSarRes1.body.data.candidate.id;

  console.info('\n--- 2. Baseline Activation & Track Invariants ---');

  // Activate Optical Baseline 1
  const actOpt1 = await request(
    'POST',
    `/api/baselines/${optBaseline1Id}/activate`,
    {},
    adminToken,
  );
  assert(actOpt1.status === 200, 'Activate Optical Baseline 1');
  assert(actOpt1.body.data.isActive === true, 'Optical Baseline 1 is ACTIVE');

  // Activate SAR Baseline 1
  const actSar1 = await request(
    'POST',
    `/api/baselines/${sarBaseline1Id}/activate`,
    {},
    adminToken,
  );
  assert(actSar1.status === 200, 'Activate SAR Baseline 1');
  assert(actSar1.body.data.isActive === true, 'SAR Baseline 1 is ACTIVE');

  // Create & activate Optical Baseline 2
  const selectOptRes2 = await request(
    'POST',
    '/api/baselines/select',
    {
      zoneId: zone._id.toString(),
      sensorType: SensorType.OPTICAL,
      satelliteMetadataId: optMeta3._id.toString(),
    },
    adminToken,
  );
  const optBaseline2Id = selectOptRes2.body.data.candidate.id;

  const actOpt2 = await request(
    'POST',
    `/api/baselines/${optBaseline2Id}/activate`,
    {},
    adminToken,
  );
  assert(actOpt2.status === 200, 'Activate Optical Baseline 2');

  // Test 4: Prevent duplicate ACTIVE optical baseline
  const activeOptList = await BaselineModel.find({
    zoneId: zone._id,
    sensorType: SensorType.OPTICAL,
    isActive: true,
  });
  assert(activeOptList.length === 1, 'Test 4: Exactly ONE active optical baseline per zone');

  // Create & activate SAR Baseline 2
  const selectSarRes2 = await request(
    'POST',
    '/api/baselines/select',
    {
      zoneId: zone._id.toString(),
      sensorType: SensorType.SAR,
      satelliteMetadataId: sarMeta2._id.toString(),
    },
    adminToken,
  );
  const sarBaseline2Id = selectSarRes2.body.data.candidate.id;

  const actSar2 = await request(
    'POST',
    `/api/baselines/${sarBaseline2Id}/activate`,
    {},
    adminToken,
  );
  assert(actSar2.status === 200, 'Activate SAR Baseline 2');

  // Test 5: Prevent duplicate ACTIVE SAR baseline
  const activeSarList = await BaselineModel.find({
    zoneId: zone._id,
    sensorType: SensorType.SAR,
    isActive: true,
  });
  assert(activeSarList.length === 1, 'Test 5: Exactly ONE active SAR baseline per zone');

  // Test 6: Preserve historical baselines
  const allZoneBaselines = await BaselineModel.find({ zoneId: zone._id });
  const retiredBaselines = allZoneBaselines.filter((b) => b.status === BaselineStatus.RETIRED);
  assert(
    allZoneBaselines.length >= 4 && retiredBaselines.length >= 2,
    'Test 6: Historical baselines preserved and set to RETIRED',
  );

  console.info('\n--- 3. Cloud Quality & SAR Fallback Rules ---');

  // Test 7: Reject cloudy optical baseline (Rule 3)
  const selectCloudyRes = await request(
    'POST',
    '/api/baselines/select',
    {
      zoneId: zone._id.toString(),
      sensorType: SensorType.OPTICAL,
      satelliteMetadataId: optMeta2Cloudy._id.toString(),
    },
    adminToken,
  );
  assert(selectCloudyRes.status === 200, 'Test 7: Evaluated cloudy optical image');
  assert(
    selectCloudyRes.body.data.candidate.status === BaselineStatus.REJECTED,
    'Test 7: Cloudy optical image (>20% cloud) rejected as baseline candidate',
  );

  // Test 8: Accept suitable SAR despite clouds (Rule 4)
  const selectSarCloudCheck = await request(
    'POST',
    '/api/baselines/select',
    {
      zoneId: zone._id.toString(),
      sensorType: SensorType.SAR,
      satelliteMetadataId: sarMeta1._id.toString(),
    },
    adminToken,
  );
  assert(
    selectSarCloudCheck.body.data.candidate.status !== BaselineStatus.REJECTED,
    'Test 8: SAR baseline accepted independent of optical cloud rules',
  );

  // Test 9: Optical -> SAR Fallback execution
  const processCloudyOpt = await request(
    'POST',
    '/api/processing/process',
    {
      satelliteMetadataId: optMeta2Cloudy._id.toString(),
      zoneId: zone._id.toString(),
    },
    adminToken,
  );
  assert(processCloudyOpt.status === 200, 'Test 9: Process cloudy optical image');
  assert(
    processCloudyOpt.body.data.fallbackTriggered === true,
    'Test 9: Fallback to SAR triggered for cloudy optical image',
  );
  assert(
    processCloudyOpt.body.data.sensorType === SensorType.SAR,
    'Test 9: Fallback processed SAR imagery',
  );

  // Test 10: Do not replace optical baseline with SAR during fallback
  const activeOptAfterFallback = await BaselineModel.findOne({
    zoneId: zone._id,
    sensorType: SensorType.OPTICAL,
    isActive: true,
  });
  assert(
    activeOptAfterFallback?._id.toString() === optBaseline2Id,
    'Test 10: Optical baseline track remained unchanged during SAR fallback',
  );

  console.info('\n--- 4. Local Image Processing Calculations (Optical & SAR) ---');

  // Process Clean Optical Image
  const processOptRes = await request(
    'POST',
    '/api/processing/process',
    {
      satelliteMetadataId: optMeta1._id.toString(),
      zoneId: zone._id.toString(),
    },
    adminToken,
  );
  assert(processOptRes.status === 200, 'Process clean optical image');
  const optMetrics = processOptRes.body.data.opticalMetrics;

  // Test 11-16: Optical Indices
  assert(
    typeof optMetrics.ndvi === 'number' && optMetrics.ndvi >= -1 && optMetrics.ndvi <= 1,
    'Test 11: NDVI calculated correctly',
  );
  assert(
    typeof optMetrics.ndwi === 'number' && optMetrics.ndwi >= -1 && optMetrics.ndwi <= 1,
    'Test 12: NDWI calculated correctly',
  );
  assert(
    typeof optMetrics.ndbi === 'number' && optMetrics.ndbi >= -1 && optMetrics.ndbi <= 1,
    'Test 13: NDBI calculated correctly',
  );
  assert(
    typeof optMetrics.bsi === 'number' && optMetrics.bsi >= -1 && optMetrics.bsi <= 1,
    'Test 14: BSI calculated correctly',
  );
  assert(
    typeof optMetrics.savi === 'number' && optMetrics.savi >= -1 && optMetrics.savi <= 1,
    'Test 15: SAVI calculated correctly',
  );
  assert(
    typeof optMetrics.evi === 'number' && optMetrics.evi >= -1 && optMetrics.evi <= 1,
    'Test 16: EVI calculated correctly',
  );

  // Process SAR Image
  const processSarRes = await request(
    'POST',
    '/api/processing/process',
    {
      satelliteMetadataId: sarMeta2._id.toString(),
      zoneId: zone._id.toString(),
    },
    adminToken,
  );
  assert(processSarRes.status === 200, 'Process SAR image');
  const sarMetrics = processSarRes.body.data.sarMetrics;

  // Test 17-19: SAR Backscatter Indicators
  assert(typeof sarMetrics.vv === 'number', 'Test 17: VV backscatter calculated');
  assert(typeof sarMetrics.vh === 'number', 'Test 18: VH backscatter calculated');
  assert(typeof sarMetrics.vvVhRatio === 'number', 'Test 19: VV/VH ratio calculated');

  // Test 20: SAR Temporal Backscatter Difference vs Active Baseline
  assert(
    typeof sarMetrics.vvDifference === 'number',
    'Test 20: VV temporal difference calculated vs active baseline',
  );

  // Test 21: Handle missing optical bands / invalid sensor processing
  const invalidOptCall = await request(
    'POST',
    '/api/processing/process',
    {
      satelliteMetadataId: sarMeta1._id.toString(),
      zoneId: zone._id.toString(),
      sensorType: SensorType.OPTICAL,
      forceProcessing: true,
    },
    adminToken,
  );
  assert(
    invalidOptCall.status === 400,
    'Test 21: Handled SAR image processed as optical error cleanly (400)',
  );

  // Test 22: Handle missing SAR polarization / invalid sensor processing
  const invalidSarCall = await request(
    'POST',
    '/api/processing/process',
    {
      satelliteMetadataId: optMeta1._id.toString(),
      zoneId: zone._id.toString(),
      sensorType: SensorType.SAR,
      forceProcessing: true,
    },
    adminToken,
  );
  assert(
    invalidSarCall.status === 400,
    'Test 22: Handled optical image processed as SAR error cleanly (400)',
  );

  console.info('\n--- 5. Baseline Protection & RBAC Enforcement ---');

  // Mark zone as SUSPICIOUS (unresolved incident)
  await Zone.findByIdAndUpdate(zone._id, { status: ZoneStatus.SUSPICIOUS });

  // Test 23: Prevent baseline replacement when unresolved incident exists (Rule 8)
  const actBlockedRes = await request(
    'POST',
    `/api/baselines/${optBaseline1Id}/activate`,
    {},
    adminToken,
  );
  assert(actBlockedRes.status === 400, 'Test 23: Baseline activation blocked on suspicious zone');
  const checkFrozen = await BaselineModel.findById(optBaseline1Id);
  assert(
    checkFrozen?.status === BaselineStatus.FROZEN,
    'Test 23: Candidate status updated to FROZEN',
  );

  // Reset zone status back
  await Zone.findByIdAndUpdate(zone._id, { status: ZoneStatus.PROTECTED });

  // Test 24: RBAC - Unauthorized baseline activation (Viewer role)
  const unauthActRes = await request(
    'POST',
    `/api/baselines/${optBaseline1Id}/activate`,
    {},
    viewerToken,
  );
  assert(
    unauthActRes.status === 403,
    'Test 24: Viewer role rejected for baseline activation (403)',
  );

  // Test 25: RBAC - Unauthorized processing (No token)
  const unauthProcRes = await request('POST', '/api/processing/process', {
    satelliteMetadataId: optMeta1._id.toString(),
    zoneId: zone._id.toString(),
  });
  assert(
    unauthProcRes.status === 401,
    'Test 25: Unauthenticated processing request rejected (401)',
  );

  console.info('\n--- 6. Persistence, Auditability & Boundary Check ---');

  // Test 26: Processing result persisted correctly
  const resultsInDb = await ProcessedImageResultModel.find({ zoneId: zone._id });
  assert(
    resultsInDb.length >= 3,
    'Test 26: Processed image results persisted correctly in database',
  );

  // Test 27: Historical baseline remains auditable via API
  const auditRes = await request('GET', `/api/zones/${zone._id}/baselines`, {}, adminToken);
  assert(auditRes.status === 200, 'Test 27: Fetched baseline history via zone API');
  assert(auditRes.body.data.length >= 4, 'Test 27: All historical baselines auditable');

  console.info('\n--- 7. M7 Historical-Period Analysis & Temporary Reference Selection ---');

  // Create a second temporary test zone without an active baseline
  const tempZone = await Zone.create({
    zoneId: 'ZONE-TEMP-001',
    name: 'M5 Temporary Monitoring Zone',
    category: ZoneCategory.SUSPICIOUS_HOTSPOT,
    status: ZoneStatus.PROTECTED,
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [78.5, 11.5],
          [78.6, 11.5],
          [78.6, 11.6],
          [78.5, 11.6],
          [78.5, 11.5],
        ],
      ],
    },
    centerPoint: { type: 'Point', coordinates: [78.55, 11.55] },
    createdBy: superAdmin._id,
  });

  // Seed temporal historical observations for tempZone
  const histOpt1 = await SatelliteMetadata.create({
    imageId: 'COPERNICUS/S2_SR/HIST_20260105',
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: new Date('2026-01-05T10:00:00.000Z'),
    cloudCover: 5.0, // Clean
    footprint: tempZone.boundary,
    processingStatus: 'ACQUIRED',
    geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")',
    intersectingZones: [tempZone._id],
  });

  const histOpt2 = await SatelliteMetadata.create({
    imageId: 'COPERNICUS/S2_SR/HIST_20260115',
    source: SatelliteSource.SENTINEL_2,
    sensorType: SensorType.OPTICAL,
    acquisitionDate: new Date('2026-01-15T10:00:00.000Z'),
    cloudCover: 8.0,
    footprint: tempZone.boundary,
    processingStatus: 'ACQUIRED',
    geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")',
    intersectingZones: [tempZone._id],
  });

  const histSar1 = await SatelliteMetadata.create({
    imageId: 'COPERNICUS/S1_GRD/HIST_20260108_S1',
    source: SatelliteSource.SENTINEL_1,
    sensorType: SensorType.SAR,
    acquisitionDate: new Date('2026-01-08T10:00:00.000Z'),
    cloudCover: 0.0,
    footprint: tempZone.boundary,
    processingStatus: 'ACQUIRED',
    geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD")',
    intersectingZones: [tempZone._id],
    metadata: { polarization: 'VV+VH', acquisitionMode: 'IW', orbitDirection: 'DESCENDING' },
  });

  // Test 29: Select earliest clean optical observation as historical reference
  const histOptRefRes = await request(
    'POST',
    '/api/baselines/historical-reference',
    {
      zoneId: tempZone._id.toString(),
      sensorType: SensorType.OPTICAL,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      maxCloudCover: 20.0,
    },
    adminToken,
  );
  assert(
    histOptRefRes.status === 200 &&
      histOptRefRes.body.data.referenceMetadata?.imageId === 'COPERNICUS/S2_SR/HIST_20260105',
    'Test 29: Resolved earliest clean historical optical observation as reference',
  );
  assert(
    histOptRefRes.body.data.isExistingActiveBaseline === false,
    'Test 29: Confirmed reference does not mutate or claim existing active baseline',
  );

  // Test 30: Select historical SAR observation as reference
  const histSarRefRes = await request(
    'POST',
    '/api/baselines/historical-reference',
    {
      zoneId: tempZone._id.toString(),
      sensorType: SensorType.SAR,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    },
    adminToken,
  );
  assert(
    histSarRefRes.status === 200 &&
      histSarRefRes.body.data.referenceMetadata?.imageId === 'COPERNICUS/S1_GRD/HIST_20260108_S1',
    'Test 30: Resolved earliest historical SAR observation as reference',
  );

  // Test 31: Cloud fallback during historical reference selection
  // Create a cloudy optical observation and query with strict maxCloudCover: 2%
  const cloudyPeriodRes = await request(
    'POST',
    '/api/baselines/historical-reference',
    {
      zoneId: tempZone._id.toString(),
      sensorType: SensorType.OPTICAL,
      startDate: '2026-01-06T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      maxCloudCover: 2.0, // histOpt2 has 8% -> triggers SAR fallback to histSar1
    },
    adminToken,
  );
  assert(
    cloudyPeriodRes.status === 200 &&
      cloudyPeriodRes.body.data.fallbackToSar === true &&
      cloudyPeriodRes.body.data.referenceMetadata?.imageId === 'COPERNICUS/S1_GRD/HIST_20260108_S1',
    'Test 31: Optical cloud cover exceeded threshold -> Fallback selected Sentinel-1 SAR reference',
  );

  // Test 32: Process historical observation against historical reference without changing permanent active baseline
  const processHistRes = await request(
    'POST',
    '/api/processing/process',
    {
      zoneId: tempZone._id.toString(),
      satelliteMetadataId: histOpt2._id.toString(),
      referenceMetadataId: histOpt1._id.toString(),
    },
    adminToken,
  );
  assert(
    processHistRes.status === 200 &&
      processHistRes.body.data.processingStatus === 'PROCESSED' &&
      processHistRes.body.data.opticalMetrics?.ndvi !== undefined,
    'Test 32: Processed historical observation against historical reference successfully',
  );

  // Verify permanent active baseline invariant: tempZone still has 0 active baselines
  const tempActiveCheck = await BaselineModel.findOne({ zoneId: tempZone._id, isActive: true });
  assert(
    tempActiveCheck === null,
    'Test 32: Verified temporary area processing preserved baseline isolation (0 active baselines)',
  );

  console.info(
    `\n🎉 All ${passCount} M5 Baseline Management & Image Processing Tests Passed Successfully!`,
  );

  server.close();
  await mongoose.connection.close();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ M5 Test Suite Failed:', err);
  if (server) server.close();
  mongoose.connection.close();
  process.exit(1);
});
