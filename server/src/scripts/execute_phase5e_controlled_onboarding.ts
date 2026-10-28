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
import { calculateCentroid, calculatePolygonArea } from '../utils/geo.js';
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
// Verified Authoritative Geometries
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

async function executeControlledOnboarding() {
  console.log('================================================================');
  console.log('🚀 PHASE 5E: APPROVED CONTROLLED ZONE ONBOARDING EXECUTION');
  console.log('================================================================\n');

  // 1. Mandatory Safeguards & Configuration Verification
  console.log('--- 1. PRE-INSERTION SAFEGUARDS & MODE VERIFICATION ---');
  console.log(`  CANOPY_GUARD_MODE: ${env.CANOPY_GUARD_MODE}`);
  if (env.CANOPY_GUARD_MODE !== 'SHADOW') {
    throw new Error(`CRITICAL: CANOPY_GUARD_MODE is ${env.CANOPY_GUARD_MODE}. Expected 'SHADOW'.`);
  }
  console.log(`  Official Production Authority: Algorithm v2.0`);
  console.log(`  Evaluation Shadow Pipeline: Algorithm v2.1-SHADOW`);
  console.log(`  Zero Automatic Activation Policy: STRICTLY ENFORCED`);
  console.log(`  Database Writes: LIMITED ONLY TO APPROVED ONBOARDING RECORDS\n`);

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB at:', env.MONGODB_URI);

  // 2. Pre-Execution Reference Hashes for Untouched Collections
  const untouchedCollections: Record<string, mongoose.Model<any>> = {
    users: User,
    changedetections: ChangeDetectionModel,
    alerts: AlertModel,
    monitoringjobs: MonitoringJobModel,
    incrementalmonitoringrecords: IncrementalMonitoringRecordModel,
  };

  const preHashes: Record<string, string> = {
    users: '7af86e56d479fa6ccde26b16dab88ca37b8f7c00189e9d64985b1b1347d583f3',
    changedetections: '55ef62b5a3a0cd182e8ea1e7c9531184cc0227f00ec720f28a3d9aa551a845ae',
    alerts: '3e1f28b6baeecd62c14fd2fbe7dd73c0e407dadf8ba589e485a6e1f5c0ae6ddc',
    monitoringjobs: '19eb621405a01ac9ee0138eb64f99855dbb4ecddec35fc60c7d7d88881380fd6',
    incrementalmonitoringrecords: '903e7b34a825e6c9ae6fd2492039051dde5b33d49427d161b4d7126afc33f28f',
  };

  // 3. Super Admin Account Retrieval
  const adminUser = await User.findOne({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }).lean();
  if (!adminUser) throw new Error('No administrator user found in database for provenance attribution.');
  console.log(`Administrative Creator for Audit Provenance: ${adminUser.name} (${adminUser.email}, ID: ${adminUser._id})`);

  // Geodetic Metrics
  const vadipattiCentroid = calculateCentroid(VADIPATTI_BOUNDARY.coordinates);
  const vadipattiArea = calculatePolygonArea(VADIPATTI_BOUNDARY.coordinates);
  const sathiyarCentroid = calculateCentroid(SATHIYAR_BOUNDARY.coordinates);
  const sathiyarArea = calculatePolygonArea(SATHIYAR_BOUNDARY.coordinates);

  // ---------------------------------------------------------------------------
  // 4. Controlled Idempotent Zone Insertions
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. CONTROLLED ZONE REGISTRATION ---');

  // Vadipatti Zone
  let vadipattiZoneDoc = await Zone.findOne({ zoneId: 'ZONE-260829-8997' });
  if (!vadipattiZoneDoc) {
    vadipattiZoneDoc = await Zone.create({
      _id: new Types.ObjectId('6aa676d32b4fe5808c7e8ded'),
      zoneId: 'ZONE-260829-8997',
      name: 'vadipatti',
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      areaHectares: Number(vadipattiArea.areaHectares.toFixed(2)),
      boundary: VADIPATTI_BOUNDARY,
      centerPoint: {
        type: 'Point',
        coordinates: vadipattiCentroid,
      },
      baselineDate: new Date('2020-01-29T00:00:00.000Z'),
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
      createdBy: adminUser._id,
    });
    console.log(`  ✔ Inserted Zone: vadipatti (ID: ${vadipattiZoneDoc.zoneId})`);
  } else {
    console.log(`  ✔ Zone already registered: vadipatti (ID: ${vadipattiZoneDoc.zoneId}, _id: ${vadipattiZoneDoc._id})`);
  }

  // Sathiyar Zone
  let sathiyarZoneDoc = await Zone.findOne({ zoneId: 'ZONE-260829-8998' });
  if (!sathiyarZoneDoc) {
    sathiyarZoneDoc = await Zone.create({
      _id: new Types.ObjectId('6a8f3255b9cb2d5795dd34d4'),
      zoneId: 'ZONE-260829-8998',
      name: 'sathiyar_forest',
      category: ZoneCategory.RESERVED_AREA,
      status: ZoneStatus.PROTECTED,
      areaHectares: Number(sathiyarArea.areaHectares.toFixed(2)),
      boundary: SATHIYAR_BOUNDARY,
      centerPoint: {
        type: 'Point',
        coordinates: sathiyarCentroid,
      },
      baselineDate: new Date('2020-01-09T00:00:00.000Z'),
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
      createdBy: adminUser._id,
    });
    console.log(`  ✔ Inserted Zone: sathiyar_forest (ID: ${sathiyarZoneDoc.zoneId})`);
  } else {
    console.log(`  ✔ Zone already registered: sathiyar_forest (ID: ${sathiyarZoneDoc.zoneId}, _id: ${sathiyarZoneDoc._id})`);
  }

  // ---------------------------------------------------------------------------
  // 5. Controlled Satellite Metadata Linking & Registration
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. CONTROLLED SATELLITE METADATA LINKING ---');

  // Vadipatti T0 Baseline Metadata (2020-01-29) - New image in catalog
  let vadipattiSatT0 = await SatelliteMetadata.findOne({
    imageId: 'COPERNICUS/S2_SR_HARMONIZED/20200129T051041_20200129T052502_T43PHM',
  });
  if (!vadipattiSatT0) {
    vadipattiSatT0 = await SatelliteMetadata.create({
      _id: new Types.ObjectId('6ad4f23fb734547259bc7933'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20200129T051041_20200129T052502_T43PHM',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2020-01-29T05:10:41.000Z'),
      cloudCover: 2.35,
      footprint: VADIPATTI_BOUNDARY,
      processingStatus: SatelliteProcessingStatus.ACQUIRED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED',
      intersectingZones: [vadipattiZoneDoc._id],
      metadata: {
        spacecraftName: 'Sentinel-2B',
        mgrsTile: 'T43PHM',
        sensingTime: '2020-01-29T05:25:02.000Z',
        cloudCoverPercentage: 2.35,
        nativeResolutionMeters: 10,
        bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'],
        zonalClearPct: 97.80,
        isRealTelemetry: true,
        onboardingPhase: 'Phase 5E Approved',
        historicalZoneAlias: 'ZONE-260913-7787',
      },
    });
    console.log(`  ✔ Inserted SatelliteMetadata: Vadipatti T0 (2020-01-29) -> ID: ${vadipattiSatT0._id}`);
  } else {
    await SatelliteMetadata.updateOne({ _id: vadipattiSatT0._id }, { $addToSet: { intersectingZones: vadipattiZoneDoc._id } });
    console.log(`  ✔ SatelliteMetadata linked: Vadipatti T0 -> ID: ${vadipattiSatT0._id}`);
  }

  // Sathiyar T0 Baseline Metadata (2020-01-09) - Shared Tile T43PHM image
  const sathiyarSatT0 = await SatelliteMetadata.findOne({
    imageId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
  });
  if (!sathiyarSatT0) {
    throw new Error('Expected canonical T43PHM baseline image 20200109T051201 not found in metadata collection.');
  }
  await SatelliteMetadata.updateOne(
    { _id: sathiyarSatT0._id },
    { $addToSet: { intersectingZones: sathiyarZoneDoc._id } },
  );
  console.log(`  ✔ SatelliteMetadata linked: Sathiyar added to shared T0 scene (2020-01-09) -> ID: ${sathiyarSatT0._id}`);

  // Shared T1 Comparison Metadata (2024-02-07) - Links both Vadipatti and Sathiyar
  const satT1 = await SatelliteMetadata.findOne({
    imageId: 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM',
  });
  if (!satT1) {
    throw new Error('Expected canonical T43PHM comparison image 20240207T051001 not found in metadata collection.');
  }
  await SatelliteMetadata.updateOne(
    { _id: satT1._id },
    { $addToSet: { intersectingZones: { $each: [vadipattiZoneDoc._id, sathiyarZoneDoc._id] } } },
  );
  console.log(`  ✔ SatelliteMetadata linked: Vadipatti & Sathiyar added to shared T1 scene (2024-02-07) -> ID: ${satT1._id}`);

  // ---------------------------------------------------------------------------
  // 6. Controlled Inactive Baseline Registration
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. CONTROLLED INACTIVE BASELINE REGISTRATION ---');

  // Vadipatti Baseline
  let vadipattiBaselineDoc = await BaselineModel.findOne({ zoneId: vadipattiZoneDoc._id, sensorType: SensorType.OPTICAL });
  if (!vadipattiBaselineDoc) {
    vadipattiBaselineDoc = await BaselineModel.create({
      _id: new Types.ObjectId(),
      zoneId: vadipattiZoneDoc._id,
      satelliteMetadataId: vadipattiSatT0._id,
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20200129T051041_20200129T052502_T43PHM',
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2020-01-29T05:10:41.000Z'),
      status: BaselineStatus.PROCESSED,
      isActive: false, // MANDATORY: MUST BE FALSE
      qualityScore: 97.8,
      cloudCover: 2.35,
      validPixelPercentage: 97.8,
      selectionReason: 'Approved clear-sky Sentinel-2 optical baseline for Vadipatti Reserve (Tile T43PHM, 97.8% clear observation)',
      createdBy: adminUser._id,
    });
    console.log(`  ✔ Inserted Baseline: Vadipatti Reserve (isActive: false) -> ID: ${vadipattiBaselineDoc._id}`);
  } else {
    console.log(`  ✔ Baseline already registered: Vadipatti Reserve (isActive: ${vadipattiBaselineDoc.isActive}) -> ID: ${vadipattiBaselineDoc._id}`);
  }

  // Sathiyar Baseline
  let sathiyarBaselineDoc = await BaselineModel.findOne({ zoneId: sathiyarZoneDoc._id, sensorType: SensorType.OPTICAL });
  if (!sathiyarBaselineDoc) {
    sathiyarBaselineDoc = await BaselineModel.create({
      _id: new Types.ObjectId(),
      zoneId: sathiyarZoneDoc._id,
      satelliteMetadataId: sathiyarSatT0._id,
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2020-01-09T05:12:01.000Z'),
      status: BaselineStatus.PROCESSED,
      isActive: false, // MANDATORY: MUST BE FALSE
      qualityScore: 100.0,
      cloudCover: 2.04,
      validPixelPercentage: 100.0,
      selectionReason: 'Approved clear-sky Sentinel-2 optical baseline for Sathiyar Basin (Tile T43PHM, 100.0% clear observation)',
      createdBy: adminUser._id,
    });
    console.log(`  ✔ Inserted Baseline: Sathiyar Basin (isActive: false) -> ID: ${sathiyarBaselineDoc._id}`);
  } else {
    console.log(`  ✔ Baseline already registered: Sathiyar Basin (isActive: ${sathiyarBaselineDoc.isActive}) -> ID: ${sathiyarBaselineDoc._id}`);
  }

  // ---------------------------------------------------------------------------
  // 7. Post-Execution Database Integrity Audit
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('--- 5. POST-EXECUTION DATABASE INTEGRITY & DIFFERENTIAL AUDIT ---');
  console.log('================================================================\n');

  let allChecksPassed = true;

  // Audit untouched collections
  for (const [name, model] of Object.entries(untouchedCollections)) {
    const docs = await model.find({}).lean();
    const currentHash = computeCollectionHash(docs);
    const expectedHash = preHashes[name];
    const isUntouched = currentHash === expectedHash;
    if (!isUntouched) allChecksPassed = false;
    console.log(
      `  ${name.padEnd(30)}: Count = ${String(docs.length).padStart(3)} | Hash Match: ` +
      `${isUntouched ? '✔ 100% IDENTICAL (ZERO MUTATIONS)' : '✘ UNEXPECTED MUTATION!'}`
    );
  }

  // Audit modified collections
  const zonesCount = await Zone.countDocuments();
  const baselinesCount = await BaselineModel.countDocuments();
  const satMetaCount = await SatelliteMetadata.countDocuments();

  console.log(`\n  Controlled Collections Delta:`);
  console.log(`  - zones:              Pre=3 | Post=${zonesCount} (Delta: +${zonesCount - 3}) [Expected: 5] -> ${zonesCount === 5 ? '✔ PASS' : '✘ FAIL'}`);
  console.log(`  - baselines:          Pre=6 | Post=${baselinesCount} (Delta: +${baselinesCount - 6}) [Expected: 8] -> ${baselinesCount === 8 ? '✔ PASS' : '✘ FAIL'}`);
  console.log(`  - satellitemetadatas: Pre=12 | Post=${satMetaCount} (Delta: +${satMetaCount - 12}) [Expected: 13] -> ${satMetaCount === 13 ? '✔ PASS' : '✘ FAIL'}`);

  if (zonesCount !== 5 || baselinesCount !== 8 || satMetaCount !== 13) {
    allChecksPassed = false;
  }

  // Verify Baseline Inactive Invariant
  const activeBaselines = await BaselineModel.find({
    zoneId: { $in: [vadipattiZoneDoc._id, sathiyarZoneDoc._id] },
    isActive: true,
  });
  console.log(`\n  Active Baselines for New Zones: ${activeBaselines.length} [Expected: 0] -> ${activeBaselines.length === 0 ? '✔ INACTIVE INVARIANT VERIFIED' : '✘ ERROR: ACTIVE BASELINE DETECTED'}`);
  if (activeBaselines.length > 0) allChecksPassed = false;

  console.log('\n================================================================');
  if (allChecksPassed) {
    console.log('🎉 CONTROLLED ONBOARDING COMPLETE & VERIFIED 100% SUCCESFUL');
  } else {
    console.error('❌ ONBOARDING AUDIT REPORTED DISCREPANCIES');
  }
  console.log('================================================================\n');

  await mongoose.disconnect();
}

executeControlledOnboarding().catch((err) => {
  console.error('Fatal execution error during controlled onboarding:', err);
  process.exit(1);
});
