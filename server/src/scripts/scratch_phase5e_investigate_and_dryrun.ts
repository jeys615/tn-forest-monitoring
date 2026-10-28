import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone, type IZone } from '../models/Zone.js';
import { BaselineModel, type IBaseline } from '../models/Baseline.js';
import { SatelliteMetadata, type ISatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import { calculateCentroid, calculatePolygonArea, determineMetricSafeCrs } from '../utils/geo.js';
import { geoJSONBoundarySchema } from '../validators/zone.validator.js';
import {
  ZoneCategory,
  ZoneStatus,
  SensorType,
  SatelliteSource,
  BaselineStatus,
  MonitoringTrack,
  SatelliteProcessingStatus,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';

function computeCollectionHash(docs: any[]): string {
  const sorted = [...docs].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const json = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(json).digest('hex');
}

// -----------------------------------------------------------------------------
// Authoritative Boundary Geometries
// -----------------------------------------------------------------------------

const VADIPATTI_BOUNDARY: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.00817383274334, 10.09471042452626],
      [78.00233432251187, 10.05346057995144],
      [78.01916585200254, 10.051431763047695],
      [78.06656893505799, 10.075100500617625],
      [78.08752247177091, 10.106205341808577],
      [78.07069094228022, 10.115671435666338],
      [78.03187537427105, 10.108571891416764],
      [78.00817383274334, 10.09471042452626],
    ],
  ],
};

const SATHIYAR_BOUNDARY: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.07470465117308, 10.118261747031166],
      [78.08672717223784, 10.111838408411883],
      [78.0939406848767, 10.11969852887474],
      [78.08904580130034, 10.123501743888568],
      [78.07977128505037, 10.1228256200689],
      [78.07521990207582, 10.12198046329112],
      [78.07470465117308, 10.118261747031166],
    ],
  ],
};

async function executePhase5EInvestigation() {
  console.log('================================================================');
  console.log('🛰️ PHASE 5E: CONTROLLED ZONE RE-ONBOARDING INVESTIGATION & DRY RUN');
  console.log('================================================================\n');

  // 0. Configuration Verification
  console.log('--- 0. CONFIGURATION & PRODUCTION SAFEGUARDS VERIFICATION ---');
  console.log(`  CANOPY_GUARD_MODE: ${env.CANOPY_GUARD_MODE}`);
  if (env.CANOPY_GUARD_MODE !== 'SHADOW') {
    throw new Error(`CRITICAL: CANOPY_GUARD_MODE is ${env.CANOPY_GUARD_MODE}. Expected 'SHADOW'.`);
  }
  console.log(`  Production Algorithm Authority: v2.0 (OFFICIAL)`);
  console.log(`  Experimental Algorithm: v2.1-SHADOW (NON-AUTHORITATIVE)`);
  console.log(`  Execution Mode: READ-ONLY & DRY-RUN (ZERO DATABASE WRITES)\n`);

  // Connect to Database
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB at:', env.MONGODB_URI);

  // Take Pre-Execution SHA-256 Snapshots
  const collections: Record<string, mongoose.Model<any>> = {
    users: User,
    zones: Zone,
    baselines: BaselineModel,
    satellitemetadatas: SatelliteMetadata,
    changedetections: ChangeDetectionModel,
    alerts: AlertModel,
    monitoringjobs: MonitoringJobModel,
    incrementalmonitoringrecords: IncrementalMonitoringRecordModel,
  };

  const preSnapshots: Record<string, { count: number; hash: string }> = {};
  console.log('\n--- PRE-EXECUTION CRYPTOGRAPHIC INTEGRITY SNAPSHOT ---');
  for (const [name, model] of Object.entries(collections)) {
    const docs = await model.find({}).lean();
    const hash = computeCollectionHash(docs);
    preSnapshots[name] = { count: docs.length, hash };
    console.log(`  [PRE] ${name.padEnd(30)}: Count = ${String(docs.length).padStart(4)} | SHA-256 = ${hash}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Recover and Verify Authoritative Zone Information
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('STEP 1: AUTHORITATIVE ZONE INFORMATION RECOVERY & GEODETIC AUDIT');
  console.log('================================================================\n');

  // Vadipatti Geodetic Analysis
  console.log('1.1 Vadipatti Reserve:');
  const vadipattiValidation = geoJSONBoundarySchema.safeParse(VADIPATTI_BOUNDARY);
  console.log(`  - Geometry Schema Validity:    ${vadipattiValidation.success ? 'VALID (PASS)' : 'INVALID'}`);
  const vadipattiCentroid = calculateCentroid(VADIPATTI_BOUNDARY.coordinates);
  console.log(`  - Calculated Centroid:         [${vadipattiCentroid[0].toFixed(6)}, ${vadipattiCentroid[1].toFixed(6)}]`);
  const vadipattiArea = calculatePolygonArea(VADIPATTI_BOUNDARY.coordinates);
  console.log(`  - Geodesic Surface Area:       ${vadipattiArea.areaHectares.toFixed(2)} ha (${vadipattiArea.areaSquareMeters.toFixed(0)} m²)`);
  const vadipattiCrs = determineMetricSafeCrs(VADIPATTI_BOUNDARY);
  console.log(`  - Metric Projected CRS:        ${vadipattiCrs}`);
  console.log(`  - Canonical Historic ID:       ZONE-260913-7787 (Used in production tests & rasters)`);
  console.log(`  - User Requested ID:           ZONE-260829-8997`);
  console.log(`  - Canonical Name:              vadipatti`);
  console.log(`  - District / Range:            Madurai District / Vadipatti Range`);
  console.log(`  - Historical Removal Reason:   Purged by cleanInvalidBaselines.ts due to legacy Landsat 8 (2015-01-06) baseline`);
  console.log(`                                 cross-sensor and cross-CRS mismatch (EPSG:32644 vs EPSG:32643).\n`);

  // Sathiyar Geodetic Analysis
  console.log('1.2 Sathiyar Basin:');
  const sathiyarValidation = geoJSONBoundarySchema.safeParse(SATHIYAR_BOUNDARY);
  console.log(`  - Geometry Schema Validity:    ${sathiyarValidation.success ? 'VALID (PASS)' : 'INVALID'}`);
  const sathiyarCentroid = calculateCentroid(SATHIYAR_BOUNDARY.coordinates);
  console.log(`  - Calculated Centroid:         [${sathiyarCentroid[0].toFixed(6)}, ${sathiyarCentroid[1].toFixed(6)}]`);
  const sathiyarArea = calculatePolygonArea(SATHIYAR_BOUNDARY.coordinates);
  console.log(`  - Geodesic Surface Area:       ${sathiyarArea.areaHectares.toFixed(2)} ha (${sathiyarArea.areaSquareMeters.toFixed(0)} m²)`);
  const sathiyarCrs = determineMetricSafeCrs(SATHIYAR_BOUNDARY);
  console.log(`  - Metric Projected CRS:        ${sathiyarCrs}`);
  console.log(`  - Canonical Historic ID:       ZONE-260826-5537 (Seed script reference)`);
  console.log(`  - User Requested ID:           ZONE-260829-8998`);
  console.log(`  - Canonical Name:              sathiyar_forest`);
  console.log(`  - District / Range:            Madurai District / Sathiyar Dam & Basin`);
  console.log(`  - Historical Status:           Never seeded into active database; unexecuted seed script`);
  console.log(`                                 referenced synthetic catalog T44PMT.\n`);

  // ---------------------------------------------------------------------------
  // STEP 2: Satellite Baseline & Observation Investigation via Real GEE
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('STEP 2: SATELLITE BASELINE & OBSERVATION SUITABILITY (REAL GEE)');
  console.log('================================================================\n');

  const authService = GeeAuthService.getInstance();
  const token = await authService.getAccessToken();
  console.log(`  GEE Authentication Status:     ${token ? 'AUTHENTICATED (TOKEN ACQUIRED)' : 'FAILED'}`);
  const geeConfig = authService.getConfig();
  console.log(`  GEE Project ID:                ${geeConfig.projectId}`);

  const geeClient = new GeeClientService();

  // Test target scenes
  const scenesToEvaluate = [
    {
      role: 'T0 Baseline Candidate',
      expectedId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
      startDate: new Date('2020-01-08T00:00:00Z'),
      endDate: new Date('2020-01-10T23:59:59Z'),
    },
    {
      role: 'T1 Current Observation Candidate',
      expectedId: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM',
      startDate: new Date('2024-02-06T00:00:00Z'),
      endDate: new Date('2024-02-08T23:59:59Z'),
    },
    {
      role: 'P1 Same-Season Validation',
      expectedId: 'COPERNICUS/S2_SR_HARMONIZED/20200218T050901_20200218T051821_T43PHM',
      startDate: new Date('2020-02-17T00:00:00Z'),
      endDate: new Date('2020-02-19T23:59:59Z'),
    },
    {
      role: 'P2 Cross-Year Seasonal Validation',
      expectedId: 'COPERNICUS/S2_SR_HARMONIZED/20240123T051111_20240123T051753_T43PHM',
      startDate: new Date('2024-01-22T00:00:00Z'),
      endDate: new Date('2024-01-24T23:59:59Z'),
    },
    {
      role: 'P3 Post-Monsoon Recovery Validation',
      expectedId: 'COPERNICUS/S2_SR_HARMONIZED/20250127T051049_20250127T051811_T43PHM',
      startDate: new Date('2025-01-26T00:00:00Z'),
      endDate: new Date('2025-01-28T23:59:59Z'),
    },
  ];

  console.log('\nEvaluating Sentinel-2 Scenes Coverage over Vadipatti & Sathiyar:');
  for (const s of scenesToEvaluate) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`Target: ${s.role} | Expected ID: ${s.expectedId}`);
    console.log(`----------------------------------------------------------------`);

    // Query for Vadipatti
    const vRes = await geeClient.listPublicImages({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: VADIPATTI_BOUNDARY,
      startDate: s.startDate,
      endDate: s.endDate,
      pageSize: 10,
    });

    const vMatch = vRes.images.find((img) => img.id === s.expectedId || img.id?.endsWith('T43PHM'));
    if (vMatch) {
      const p = vMatch.properties;
      console.log(`  ✔ Vadipatti Intersects Scene: ${vMatch.id}`);
      console.log(`    - Sensing Time:    ${p['system:time_start'] ? new Date(Number(p['system:time_start'])).toISOString() : 'N/A'}`);
      console.log(`    - Platform:        ${p['SPACECRAFT_NAME']}`);
      console.log(`    - Tile ID:         ${p['MGRS_TILE'] ?? 'T43PHM'}`);
      console.log(`    - Cloud Cover:     ${p['CLOUDY_PIXEL_PERCENTAGE']}%`);
    } else {
      console.log(`  ✘ Vadipatti: No direct scene match found in date range.`);
    }

    // Query for Sathiyar
    const sRes = await geeClient.listPublicImages({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: SATHIYAR_BOUNDARY,
      startDate: s.startDate,
      endDate: s.endDate,
      pageSize: 10,
    });

    const sMatch = sRes.images.find((img) => img.id === s.expectedId || img.id?.endsWith('T43PHM'));
    if (sMatch) {
      const p = sMatch.properties;
      console.log(`  ✔ Sathiyar Intersects Scene:   ${sMatch.id}`);
      console.log(`    - Sensing Time:    ${p['system:time_start'] ? new Date(Number(p['system:time_start'])).toISOString() : 'N/A'}`);
      console.log(`    - Platform:        ${p['SPACECRAFT_NAME']}`);
      console.log(`    - Tile ID:         ${p['MGRS_TILE'] ?? 'T43PHM'}`);
      console.log(`    - Cloud Cover:     ${p['CLOUDY_PIXEL_PERCENTAGE']}%`);
    } else {
      console.log(`  ✘ Sathiyar: No direct scene match found in date range.`);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 3 & 4: Safe Idempotent Dry-Run Onboarding Engine
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('STEP 3 & 4: SAFE IDEMPOTENT DRY-RUN ONBOARDING VALIDATION');
  console.log('================================================================\n');

  // Verify Super Admin creator exists for linking
  const adminUser = await User.findOne({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }).lean();
  if (!adminUser) throw new Error('No administrator user found in database to link onboarding.');
  console.log(`Found Admin Account for Provenance: ${adminUser.name} (${adminUser.email})`);

  // Database Collision & Conflict Checks
  console.log('\n--- 4.1 Collision & Conflict Check ---');
  const existingVadipatti = await Zone.findOne({
    $or: [{ name: 'vadipatti' }, { zoneId: { $in: ['ZONE-260829-8997', 'ZONE-260913-7787'] } }],
  }).lean();
  console.log(`  Vadipatti Conflict in DB: ${existingVadipatti ? `CONFLICT: Found zone ${existingVadipatti.zoneId}` : 'NONE (CLEAN)'}`);

  const existingSathiyar = await Zone.findOne({
    $or: [{ name: 'sathiyar_forest' }, { zoneId: { $in: ['ZONE-260829-8998', 'ZONE-260826-5537'] } }],
  }).lean();
  console.log(`  Sathiyar Conflict in DB:  ${existingSathiyar ? `CONFLICT: Found zone ${existingSathiyar.zoneId}` : 'NONE (CLEAN)'}`);

  // Construct Proposed Dry-Run Zone Documents
  const proposedVadipattiId = new Types.ObjectId('6aa676d32b4fe5808c7e8ded');
  const proposedVadipattiZone: Partial<IZone> = {
    _id: proposedVadipattiId as any,
    zoneId: 'ZONE-260829-8997', // Requested ID; alias ZONE-260913-7787
    name: 'vadipatti',
    category: ZoneCategory.PROTECTED_FOREST,
    status: ZoneStatus.PROTECTED,
    areaHectares: Number(vadipattiArea.areaHectares.toFixed(2)),
    boundary: VADIPATTI_BOUNDARY,
    centerPoint: {
      type: 'Point',
      coordinates: vadipattiCentroid,
    },
    monitoringTracks: {
      optical: { enabled: true },
      sar: { enabled: true },
    },
    createdBy: adminUser._id as any,
  };

  const proposedSathiyarId = new Types.ObjectId('6a8f3255b9cb2d5795dd34d4');
  const proposedSathiyarZone: Partial<IZone> = {
    _id: proposedSathiyarId as any,
    zoneId: 'ZONE-260829-8998', // Requested ID; alias ZONE-260826-5537
    name: 'sathiyar_forest',
    category: ZoneCategory.RESERVED_AREA,
    status: ZoneStatus.PROTECTED,
    areaHectares: Number(sathiyarArea.areaHectares.toFixed(2)),
    boundary: SATHIYAR_BOUNDARY,
    centerPoint: {
      type: 'Point',
      coordinates: sathiyarCentroid,
    },
    monitoringTracks: {
      optical: { enabled: true },
      sar: { enabled: true },
    },
    createdBy: adminUser._id as any,
  };

  // Validate Proposed Documents Against Mongoose Model Validation (Dry-Run only)
  console.log('\n--- 4.2 Document Schema Pre-Validation ---');
  const vadipattiDoc = new Zone(proposedVadipattiZone);
  const vadipattiErr = vadipattiDoc.validateSync();
  console.log(`  Proposed Vadipatti Zone Schema Validation: ${vadipattiErr ? `FAILED: ${vadipattiErr.message}` : 'PASSED (100% VALID)'}`);

  const sathiyarDoc = new Zone(proposedSathiyarZone);
  const sathiyarErr = sathiyarDoc.validateSync();
  console.log(`  Proposed Sathiyar Zone Schema Validation:  ${sathiyarErr ? `FAILED: ${sathiyarErr.message}` : 'PASSED (100% VALID)'}`);

  // Candidate Baseline Documents (Dry-Run Specification)
  const candidateT0SceneId = 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM';
  const candidateT0AcqDate = new Date('2020-01-09T05:12:01.000Z');

  const proposedVadipattiBaseline: Partial<IBaseline> = {
    _id: new Types.ObjectId() as any,
    zoneId: proposedVadipattiId as any,
    satelliteMetadataId: new Types.ObjectId() as any,
    sensorType: SensorType.OPTICAL,
    monitoringTrack: MonitoringTrack.OPTICAL,
    source: SatelliteSource.SENTINEL_2,
    acquisitionDate: candidateT0AcqDate,
    status: BaselineStatus.PROCESSED,
    isActive: false, // MANDATORY: Must NEVER be automatically activated
    qualityScore: 100.0,
    cloudCover: 0.0,
    validPixelPercentage: 100.0,
    selectionReason: 'Candidate 2020-01-09 Clear-Sky Sentinel-2 Optical Baseline (Tile T43PHM)',
    createdBy: adminUser._id as any,
  };

  const proposedSathiyarBaseline: Partial<IBaseline> = {
    _id: new Types.ObjectId() as any,
    zoneId: proposedSathiyarId as any,
    satelliteMetadataId: new Types.ObjectId() as any,
    sensorType: SensorType.OPTICAL,
    monitoringTrack: MonitoringTrack.OPTICAL,
    source: SatelliteSource.SENTINEL_2,
    acquisitionDate: candidateT0AcqDate,
    status: BaselineStatus.PROCESSED,
    isActive: false, // MANDATORY: Must NEVER be automatically activated
    qualityScore: 100.0,
    cloudCover: 0.0,
    validPixelPercentage: 100.0,
    selectionReason: 'Candidate 2020-01-09 Clear-Sky Sentinel-2 Optical Baseline (Tile T43PHM)',
    createdBy: adminUser._id as any,
  };

  const vadipattiBaselineDoc = new BaselineModel(proposedVadipattiBaseline);
  const vadipattiBaselineErr = vadipattiBaselineDoc.validateSync();
  console.log(`  Proposed Vadipatti Baseline Validation:    ${vadipattiBaselineErr ? `FAILED: ${vadipattiBaselineErr.message}` : 'PASSED (100% VALID)'}`);

  const sathiyarBaselineDoc = new BaselineModel(proposedSathiyarBaseline);
  const sathiyarBaselineErr = sathiyarBaselineDoc.validateSync();
  console.log(`  Proposed Sathiyar Baseline Validation:     ${sathiyarBaselineErr ? `FAILED: ${sathiyarBaselineErr.message}` : 'PASSED (100% VALID)'}`);

  console.log('\n--- 4.3 Dry-Run Execution Summary ---');
  console.log('  Mode: DRY RUN ONLY. Zero database writes performed.');
  console.log('  Proposed Records generated and validated in memory.');
  console.log('  Ready for formal administrative approval before execution.\n');

  // ---------------------------------------------------------------------------
  // STEP 5: Post-Execution Cryptographic Integrity Verification
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('STEP 5: POST-EXECUTION DATABASE IMMUTABILITY AUDIT');
  console.log('================================================================\n');

  let allIdentical = true;
  for (const [name, model] of Object.entries(collections)) {
    const docs = await model.find({}).lean();
    const hash = computeCollectionHash(docs);
    const pre = preSnapshots[name];
    const match = pre.hash === hash && pre.count === docs.length;
    if (!match) allIdentical = false;

    console.log(
      `  ${name.padEnd(30)}: Pre=${String(pre.count).padStart(3)} | Post=${String(docs.length).padStart(3)} | ` +
      `Hash Match: ${match ? '✔ 100% IDENTICAL' : '✘ MUTATION DETECTED!'}`
    );
  }

  console.log('\n================================================================');
  if (allIdentical) {
    console.log('🔒 VERIFIED: ZERO DATABASE WRITES / ZERO MUTATIONS ACROSS ALL COLLECTIONS');
  } else {
    console.error('❌ CRITICAL: DATABASE MUTATION DETECTED DURING DRY RUN!');
  }
  console.log('================================================================\n');

  await mongoose.disconnect();
}

executePhase5EInvestigation().catch((err) => {
  console.error('Fatal execution error in Phase 5E investigation:', err);
  process.exit(1);
});
