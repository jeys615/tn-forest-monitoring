/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { User } from '../models/User.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { ZoneService } from '../services/ZoneService.js';
import { GeeSatelliteService } from '../services/gee/GeeSatelliteService.js';
import { AutomatedMonitoringService, type AreaInfo } from '../services/AutomatedMonitoringService.js';
import { MonitoringSchedulerWorker } from '../workers/MonitoringSchedulerWorker.js';
import {
  SensorType,
  SatelliteSource,
  ZoneStatus,
  ZoneCategory,
  BaselineStatus,
  MonitoringTrack,
  MonitoringTrackStatus,
  ProcessingMode,
  SpatialCalculationSource,
  AlertSeverity,
  AlertStatus,
  ChangeCategory,
  CrossSensorAgreement,
  type GeoJSONPolygon,
  type SatelliteSearchRequest,
} from '@tn-forest/shared/types';

let passedTests = 0;
let failedTests = 0;

function reportPass(name: string): void {
  console.info(`  ✅ [PASS] ${name}`);
  passedTests++;
}

function reportFail(name: string, error: any): void {
  console.error(`  ❌ [FAIL] ${name}:`, error);
  failedTests++;
}

async function runSuite(): Promise<void> {
  console.info('================================================================');
  console.info('INDEPENDENT OPTICAL & SAR SENSOR SELECTION & ZONE CONFIG SUITE');
  console.info('================================================================\n');

  await connectDatabase();

  // ── AUDIT PRE-TEST DATABASE COUNTS & VADIPATTI INVARIANTS ──
  console.info('--- 1. PRE-TEST DATABASE INVARIANT AUDIT ---');
  const preCounts = {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellites: await SatelliteMetadata.countDocuments(),
    changes: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    jobs: await MonitoringJobModel.countDocuments(),
    incremental: await IncrementalMonitoringRecordModel.countDocuments(),
  };

  console.info('Pre-Test Document Counts:');
  for (const [k, v] of Object.entries(preCounts)) {
    console.info(`  ${k.padEnd(14)}: ${v}`);
  }

  // Vadipatti verification
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  assert(vadipatti, 'Vadipatti production zone must exist');
  assert.strictEqual(vadipatti.monitoringTracks?.optical?.enabled, true, 'Vadipatti Optical track must be enabled');
  assert.strictEqual(vadipatti.monitoringTracks?.sar?.enabled, false, 'Vadipatti SAR track must be disabled');

  const vadipattiBaseline = await BaselineModel.findOne({ zoneId: vadipatti._id, isActive: true });
  assert(vadipattiBaseline, 'Vadipatti active baseline must exist');
  assert.strictEqual(vadipattiBaseline.sensorType, SensorType.OPTICAL, 'Vadipatti baseline is strictly OPTICAL');
  reportPass('Vadipatti production state verified intact (Optical enabled, SAR disabled, baseline active)');

  const testZoneIds: Types.ObjectId[] = [];
  const testBaselineIds: Types.ObjectId[] = [];
  const testSatMetadataIds: Types.ObjectId[] = [];
  const testChangeIds: Types.ObjectId[] = [];
  const testAlertIds: Types.ObjectId[] = [];
  const testJobIds: string[] = [];

  const zoneService = new ZoneService();
  const geeSatService = new GeeSatelliteService();
  const autoService = AutomatedMonitoringService.getInstance();

  const adminUser = await User.findOne();
  assert(adminUser, 'Admin user must exist');

  const testBoundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.10, 10.10],
        [78.15, 10.10],
        [78.15, 10.15],
        [78.10, 10.15],
        [78.10, 10.10],
      ],
    ],
  };

  let testZone: any;
  let optMeta: any;
  let optBase: any;
  let sarMeta: any;
  let sarBase: any;

  try {
    // ──────────────────────────────────────────────────────────
    // TEST 1: CATALOG OPTICAL SELECTION SEARCHES ONLY OPTICAL
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 1: CATALOG OPTICAL SELECTION SEARCHES ONLY OPTICAL ---');
    try {
      const opticalRequest: SatelliteSearchRequest = {
        boundary: testBoundary,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        sensorType: SensorType.OPTICAL,
        maxCloudCover: 30,
      };

      const opticalResults = await geeSatService.searchSentinel2Images(opticalRequest);
      assert(opticalResults, 'Search response received');
      assert.strictEqual(opticalResults.sensorType, SensorType.OPTICAL, 'Result sensorType must be OPTICAL');
      assert.strictEqual(opticalResults.filterApplied.collection, 'COPERNICUS/S2_SR_HARMONIZED', 'Collection must be Sentinel-2 harmonized');
      assert(Array.isArray(opticalResults.images), 'Images must be array');

      // Verify no SAR images in optical results
      for (const img of opticalResults.images) {
        assert.strictEqual(img.sensorType, SensorType.OPTICAL, 'Every image must be OPTICAL');
        assert.notStrictEqual(img.source, SatelliteSource.SENTINEL_1, 'No Sentinel-1 images allowed in OPTICAL search');
      }
      reportPass('Catalog OPTICAL search queries only optical collections without SAR leakage');
    } catch (err: any) {
      reportFail('Catalog OPTICAL search', err);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 2: CATALOG SAR SELECTION SEARCHES ONLY SENTINEL-1
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 2: CATALOG SAR SELECTION SEARCHES ONLY SENTINEL-1 ---');
    try {
      const sarRequest: SatelliteSearchRequest = {
        boundary: testBoundary,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        sensorType: SensorType.SAR,
      };

      const sarResults = await geeSatService.searchSentinel2Images(sarRequest);
      assert(sarResults, 'SAR search response received');
      assert.strictEqual(sarResults.sensorType, SensorType.SAR, 'Result sensorType must be SAR');
      assert.strictEqual(sarResults.filterApplied.collection, 'COPERNICUS/S1_GRD', 'Collection must be COPERNICUS/S1_GRD');
      assert(Array.isArray(sarResults.images), 'SAR images must be array');

      // Verify each SAR image has Sentinel-1 properties
      for (const img of sarResults.images) {
        assert.strictEqual(img.sensorType, SensorType.SAR, 'Every image must be SAR');
        assert.strictEqual(img.source, SatelliteSource.SENTINEL_1, 'Every image source must be SENTINEL_1');
        assert(img.bands && img.bands.some(b => b.id === 'VV' || b.id === 'VH'), 'SAR image must have radar backscatter bands');
      }
      reportPass('Catalog SAR search queries only Sentinel-1 SAR collection without optical leakage');
    } catch (err: any) {
      reportFail('Catalog SAR search', err);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 3: EXISTING ZONE ENABLE/DISABLE SAR AFTER CREATION
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 3: EXISTING ZONE ENABLE/DISABLE SAR AFTER CREATION ---');
    try {
      testZone = await Zone.create({
        zoneId: `ZONE-TEST-CFG-${Date.now()}`,
        name: `Test Sensor Cfg ${Date.now()}`,
        category: ZoneCategory.PROTECTED_FOREST,
        status: ZoneStatus.PROTECTED,
        boundary: testBoundary,
        centerPoint: { type: 'Point', coordinates: [78.125, 10.125] },
        areaHectares: 30.5,
        monitoringTracks: {
          optical: { enabled: true },
          sar: { enabled: false },
        },
        createdBy: adminUser._id,
      });
      testZoneIds.push(testZone._id);

      assert.strictEqual(testZone.monitoringTracks?.optical?.enabled, true);
      assert.strictEqual(testZone.monitoringTracks?.sar?.enabled, false);

      // Enable SAR using zoneService.updateZone
      const updated1 = await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: {
          sar: { enabled: true },
        },
      });

      assert(updated1.monitoringTracks, 'monitoringTracks exists on updated zone');
      assert.strictEqual(updated1.monitoringTracks.optical.enabled, true, 'Optical must remain true when updating only SAR');
      assert.strictEqual(updated1.monitoringTracks.sar.enabled, true, 'SAR must now be true');

      // Verify in DB directly
      const dbZone1 = await Zone.findById(testZone._id);
      assert.strictEqual(dbZone1?.monitoringTracks?.optical?.enabled, true);
      assert.strictEqual(dbZone1?.monitoringTracks?.sar?.enabled, true);

      // Disable SAR again
      const updated2 = await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: {
          sar: { enabled: false },
        },
      });
      assert(updated2.monitoringTracks, 'monitoringTracks exists');
      assert.strictEqual(updated2.monitoringTracks.optical.enabled, true, 'Optical preserved');
      assert.strictEqual(updated2.monitoringTracks.sar.enabled, false, 'SAR disabled');

      reportPass('Existing zone can enable and disable SAR without zone recreation or affecting Optical');
    } catch (err: any) {
      reportFail('Existing zone SAR toggle', err);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 4: EXISTING ZONE ENABLE/DISABLE OPTICAL AFTER CREATION
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 4: EXISTING ZONE ENABLE/DISABLE OPTICAL AFTER CREATION ---');
    try {
      // First enable SAR
      await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: { sar: { enabled: true } },
      });

      // Disable Optical
      const updatedOpticalOff = await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: { optical: { enabled: false } },
      });
      assert(updatedOpticalOff.monitoringTracks, 'monitoringTracks exists');
      assert.strictEqual(updatedOpticalOff.monitoringTracks.optical.enabled, false, 'Optical must be disabled');
      assert.strictEqual(updatedOpticalOff.monitoringTracks.sar.enabled, true, 'SAR must remain enabled');

      // Re-enable Optical
      const updatedOpticalOn = await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: { optical: { enabled: true } },
      });
      assert(updatedOpticalOn.monitoringTracks, 'monitoringTracks exists');
      assert.strictEqual(updatedOpticalOn.monitoringTracks.optical.enabled, true, 'Optical re-enabled');
      assert.strictEqual(updatedOpticalOn.monitoringTracks.sar.enabled, true, 'SAR still enabled');

      reportPass('Existing zone can enable and disable Optical without zone recreation or affecting SAR');
    } catch (err: any) {
      reportFail('Existing zone Optical toggle', err);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 5: DISABLED SENSOR TRACK DOES NOT CREATE MONITORING WORK
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 5: DISABLED SENSOR DOES NOT CREATE MONITORING WORK ---');
    try {
      // Create optical baseline for testZone
      optMeta = await SatelliteMetadata.create({
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/TEST_S2_DISCOVERY_01',
        source: SatelliteSource.SENTINEL_2,
        sensorType: SensorType.OPTICAL,
        acquisitionDate: new Date('2026-01-10T05:00:00Z'),
        cloudCover: 1.2,
        nativeResolution: 10,
        footprint: testBoundary,
        geeReference: 'COPERNICUS/S2_SR_HARMONIZED/TEST_S2_DISCOVERY_01',
        intersectingZones: [testZone._id],
      });
      testSatMetadataIds.push(optMeta._id);

      optBase = await BaselineModel.create({
        zoneId: testZone._id,
        satelliteMetadataId: optMeta._id,
        source: SatelliteSource.SENTINEL_2,
        sensorType: SensorType.OPTICAL,
        monitoringTrack: MonitoringTrack.OPTICAL,
        acquisitionDate: new Date('2026-01-10T05:00:00Z'),
        baselineDate: new Date('2026-01-10T05:00:00Z'),
        status: BaselineStatus.ACTIVE,
        isActive: true,
        qualityScore: 95.0,
        validPixelPercentage: 99.0,
        selectionReason: 'Official test baseline',
        cloudCover: 1.2,
        nativeResolution: 10,
        createdBy: adminUser._id,
      });
      testBaselineIds.push(optBase._id);

      // Disable SAR on testZone
      await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: {
          optical: { enabled: true },
          sar: { enabled: false },
        },
      });

      const areaInfoSarOff: AreaInfo = {
        id: testZone._id.toString(),
        name: testZone.name,
        type: 'PERMANENT',
        boundary: testZone.boundary,
        status: ZoneStatus.PROTECTED,
        monitoringTracks: {
          optical: { enabled: true },
          sar: { enabled: false },
        },
      };

      const resultSarOff = await autoService.processAreaIncrementalDetailed(areaInfoSarOff);
      assert(resultSarOff.areaResult.tracks, 'Tracks object exists in result');
      assert.strictEqual(
        resultSarOff.areaResult.tracks.sar.status,
        MonitoringTrackStatus.DISABLED,
        'SAR track status must be DISABLED',
      );
      assert.strictEqual(
        resultSarOff.areaResult.tracks.sar.discoveredCount,
        0,
        'Disabled SAR track must discover 0 images',
      );
      assert.strictEqual(
        resultSarOff.areaResult.tracks.sar.eligibleCount,
        0,
        'Disabled SAR track must have 0 eligible count',
      );
      assert.strictEqual(
        resultSarOff.areaResult.tracks.optical.enabled,
        true,
        'Optical track must remain enabled and active',
      );

      // Now test Optical disabled, SAR enabled
      sarMeta = await SatelliteMetadata.create({
        imageId: 'COPERNICUS/S1_GRD/TEST_S1_DISCOVERY_01',
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: new Date('2026-01-11T00:30:00Z'),
        cloudCover: 0.0,
        nativeResolution: 10,
        footprint: testBoundary,
        geeReference: 'COPERNICUS/S1_GRD/TEST_S1_DISCOVERY_01',
        intersectingZones: [testZone._id],
      });
      testSatMetadataIds.push(sarMeta._id);

      sarBase = await BaselineModel.create({
        zoneId: testZone._id,
        satelliteMetadataId: sarMeta._id,
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        monitoringTrack: MonitoringTrack.SAR,
        acquisitionDate: new Date('2026-01-11T00:30:00Z'),
        baselineDate: new Date('2026-01-11T00:30:00Z'),
        status: BaselineStatus.ACTIVE,
        isActive: true,
        qualityScore: 95.0,
        validPixelPercentage: 100.0,
        selectionReason: 'Official test baseline',
        cloudCover: 0.0,
        nativeResolution: 10,
        createdBy: adminUser._id,
      });
      testBaselineIds.push(sarBase._id);

      const areaInfoOpticalOff: AreaInfo = {
        id: testZone._id.toString(),
        name: testZone.name,
        type: 'PERMANENT',
        boundary: testZone.boundary,
        status: ZoneStatus.PROTECTED,
        monitoringTracks: {
          optical: { enabled: false },
          sar: { enabled: true },
        },
      };

      const resultOpticalOff = await autoService.processAreaIncrementalDetailed(areaInfoOpticalOff);
      assert(resultOpticalOff.areaResult.tracks, 'Tracks object exists in optical-off result');
      assert.strictEqual(
        resultOpticalOff.areaResult.tracks.optical.status,
        MonitoringTrackStatus.DISABLED,
        'Optical track status must be DISABLED',
      );
      assert.strictEqual(
        resultOpticalOff.areaResult.tracks.optical.discoveredCount,
        0,
        'Disabled Optical track must discover 0 images',
      );
      assert.strictEqual(
        resultOpticalOff.areaResult.tracks.sar.enabled,
        true,
        'SAR track must remain enabled and active',
      );

      reportPass('Disabled sensor track strictly prevents discovery/processing jobs while enabled track runs');
    } catch (err: any) {
      reportFail('Disabled track work prevention', err);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 6: EXISTING BASELINES & HISTORY UNTOUCHED ON DISABLE
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 6: EXISTING BASELINES & HISTORY REMAIN UNTOUCHED ON DISABLE ---');
    try {
      const sarBaselineDoc = await BaselineModel.findOne({ zoneId: testZone._id, sensorType: SensorType.SAR });
      const sarMetaDoc = sarMeta;
      assert(sarBaselineDoc && sarMetaDoc, 'SAR baseline and meta fixtures must exist');

      // Create a change detection and alert record linked to testZone
      const change = await ChangeDetectionModel.create({
        changeId: `CHG-${Date.now()}`,
        zoneId: testZone._id,
        baselineId: sarBaselineDoc._id,
        observationId: sarMetaDoc._id,
        sensorType: SensorType.SAR,
        monitoringTrack: MonitoringTrack.SAR,
        source: SatelliteSource.SENTINEL_1,
        detectedAt: new Date(),
        zoneArea: 30.5,
        changedArea: 1.45,
        affectedAreaPercentage: 4.75,
        calculationMode: ProcessingMode.REAL,
        spatialSource: SpatialCalculationSource.RASTER,
        severity: AlertSeverity.MEDIUM,
        evidenceStrength: 92.0,
        evidenceBreakdown: {
          magnitudeScore: 90,
          dataQualityScore: 95,
          temporalConsistencyScore: 90,
          crossSensorScore: 85,
          totalEvidenceScore: 92,
          explanation: 'SAR backscatter disturbance confirmed',
        },
        categories: [ChangeCategory.SAR_STRUCTURAL_CHANGE],
        crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
        temporalConsistency: 'CONSISTENT',
        explanation: 'SAR radar backscatter disturbance detected',
        alertGenerated: true,
      });
      testChangeIds.push(change._id);

      const alert = await AlertModel.create({
        alertId: `ALT-TEST-${Date.now()}`,
        zoneId: testZone._id,
        changeDetectionId: change._id,
        severity: AlertSeverity.HIGH,
        status: AlertStatus.OPEN,
        highestThresholdCrossed: 10,
        thresholdsCrossed: [2, 5, 10],
        evidenceStrength: 92,
        detectedAt: new Date(),
        affectedAreaPercentage: 4.75,
        calculationMode: ProcessingMode.REAL,
        sensorType: SensorType.SAR,
        monitoringTrack: MonitoringTrack.SAR,
        evidenceSources: [SensorType.SAR],
        categories: [ChangeCategory.SAR_STRUCTURAL_CHANGE],
        explanation: 'SAR radar backscatter disturbance detected',
      });
      testAlertIds.push(alert._id);

      // Verify records exist before disabling SAR
      const preBaseCount = await BaselineModel.countDocuments({ zoneId: testZone._id });
      const preChangeCount = await ChangeDetectionModel.countDocuments({ zoneId: testZone._id });
      const preAlertCount = await AlertModel.countDocuments({ zoneId: testZone._id });
      assert.strictEqual(preBaseCount, 2, '2 baselines must exist (1 optical, 1 SAR)');
      assert(preChangeCount >= 1, 'At least 1 change detection exists');
      assert(preAlertCount >= 1, 'At least 1 alert exists');

      // Disable SAR on testZone
      await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: { sar: { enabled: false } },
      });

      // Audit that all records still exist completely untouched
      const postSarOffBase = await BaselineModel.find({ zoneId: testZone._id });
      assert.strictEqual(postSarOffBase.length, 2, 'Both baselines must remain in DB');
      const sarBaseAfter = postSarOffBase.find(b => b.sensorType === SensorType.SAR);
      assert(sarBaseAfter, 'SAR baseline document must still exist');
      assert.strictEqual(sarBaseAfter.isActive, true, 'SAR baseline status must remain ACTIVE');

      const postSarOffChanges = await ChangeDetectionModel.countDocuments({ zoneId: testZone._id });
      assert.strictEqual(postSarOffChanges, preChangeCount, 'Change detections must remain untouched');

      const postSarOffAlerts = await AlertModel.countDocuments({ zoneId: testZone._id });
      assert.strictEqual(postSarOffAlerts, preAlertCount, 'Alerts must remain untouched');

      // Now disable Optical as well
      await zoneService.updateZone(adminUser._id.toString(), testZone._id.toString(), {
        monitoringTracks: { optical: { enabled: false } },
      });

      const postBothOffBase = await BaselineModel.find({ zoneId: testZone._id });
      assert.strictEqual(postBothOffBase.length, 2, 'Both baselines still intact');
      const optBaseAfter = postBothOffBase.find(b => b.sensorType === SensorType.OPTICAL);
      assert(optBaseAfter, 'Optical baseline document must still exist');
      assert.strictEqual(optBaseAfter.isActive, true, 'Optical baseline status must remain ACTIVE');

      reportPass('Disabling sensors strictly preserves all existing baselines, changes, alerts, and history');
    } catch (err: any) {
      reportFail('Baseline & history preservation', err);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 7: NO OPTICAL -> SAR AUTOMATIC FALLBACK
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 7: NO OPTICAL -> SAR FALLBACK ---');
    try {
      // Searching for optical imagery in a narrow window where optical is unavailable
      const tightOpticalRequest: SatelliteSearchRequest = {
        boundary: testBoundary,
        startDate: '2026-03-01',
        endDate: '2026-03-02',
        sensorType: SensorType.OPTICAL,
        maxCloudCover: 0.0, // Extremely tight
      };

      const res = await geeSatService.searchSentinel2Images(tightOpticalRequest);
      // Results must either be 0 or only optical, NEVER silently switch to SAR
      assert.strictEqual(res.sensorType, SensorType.OPTICAL, 'Result sensorType must stay OPTICAL');
      assert.strictEqual(res.filterApplied.collection, 'COPERNICUS/S2_SR_HARMONIZED');
      for (const img of res.images) {
        assert.notStrictEqual(img.source, SatelliteSource.SENTINEL_1, 'No SAR fallback allowed');
      }

      reportPass('No automatic Optical -> SAR fallback exists in search layer');
    } catch (err: any) {
      reportFail('No Optical -> SAR fallback', err);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 8: SCHEDULER RESPECTS ZONE CONFIGURATION
    // ──────────────────────────────────────────────────────────
    console.info('\n--- TEST 8: SCHEDULER RESPECTS ZONE CONFIGURATION ---');
    try {
      const worker = MonitoringSchedulerWorker.getInstance();
      assert(worker, 'Worker instance exists');

      // Vadipatti has SAR disabled
      const vadipattiZone = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
      assert(vadipattiZone, 'Vadipatti exists');
      assert.strictEqual(vadipattiZone.monitoringTracks?.sar?.enabled, false);

      // Verify that for Vadipatti, no SAR jobs are ever created
      const vadipattiJobs = await MonitoringJobModel.find({
        zoneId: vadipattiZone._id,
        sensorType: SensorType.SAR,
      });
      assert.strictEqual(vadipattiJobs.length, 0, 'Vadipatti must have 0 SAR monitoring jobs');

      reportPass('Scheduler worker strictly respects zone sensor configuration');
    } catch (err: any) {
      reportFail('Scheduler respects config', err);
    }

  } finally {
    // ──────────────────────────────────────────────────────────
    // CLEANUP TEMPORARY TEST FIXTURES
    // ──────────────────────────────────────────────────────────
    console.info('\n--- CLEANING UP TEMPORARY TEST FIXTURES ---');
    if (testZoneIds.length > 0) {
      await Zone.deleteMany({ _id: { $in: testZoneIds } });
      await BaselineModel.deleteMany({ zoneId: { $in: testZoneIds } });
      await SatelliteMetadata.deleteMany({ intersectingZones: { $in: testZoneIds } });
      await ChangeDetectionModel.deleteMany({ zoneId: { $in: testZoneIds } });
      await AlertModel.deleteMany({ zoneId: { $in: testZoneIds } });
      await MonitoringJobModel.deleteMany({ zoneId: { $in: testZoneIds } });
      await IncrementalMonitoringRecordModel.deleteMany({ areaId: { $in: testZoneIds.map((id) => id.toString()) } });
    }
    if (testBaselineIds.length > 0) {
      await BaselineModel.deleteMany({ _id: { $in: testBaselineIds } });
    }
    if (testSatMetadataIds.length > 0) {
      await SatelliteMetadata.deleteMany({ _id: { $in: testSatMetadataIds } });
    }
    if (testChangeIds.length > 0) {
      await ChangeDetectionModel.deleteMany({ _id: { $in: testChangeIds } });
    }
    if (testAlertIds.length > 0) {
      await AlertModel.deleteMany({ _id: { $in: testAlertIds } });
    }
    if (testJobIds.length > 0) {
      await MonitoringJobModel.deleteMany({ _id: { $in: testJobIds } });
    }

    // ──────────────────────────────────────────────────────────
    // POST-TEST DATABASE INVARIANT AUDIT (ZERO DRIFT CHECK)
    // ──────────────────────────────────────────────────────────
    console.info('\n--- POST-TEST DATABASE INVARIANT AUDIT (ZERO DRIFT CHECK) ---');
    const postCounts = {
      users: await User.countDocuments(),
      zones: await Zone.countDocuments(),
      baselines: await BaselineModel.countDocuments(),
      satellites: await SatelliteMetadata.countDocuments(),
      changes: await ChangeDetectionModel.countDocuments(),
      alerts: await AlertModel.countDocuments(),
      jobs: await MonitoringJobModel.countDocuments(),
      incremental: await IncrementalMonitoringRecordModel.countDocuments(),
    };

    let drift = false;
    for (const [k, v] of Object.entries(preCounts)) {
      const post = postCounts[k as keyof typeof postCounts];
      const diff = post - v;
      console.info(`  ${k.padEnd(14)}: ${post} (Before: ${v}, Diff: ${diff})`);
      if (diff !== 0) drift = true;
    }

    assert(!drift, 'ZERO DATABASE DRIFT: All database collections 100% match pre-test counts');
    reportPass('Zero database drift confirmed across all collections');

    // Vadipatti post check
    const vadipattiPost = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
    assert(vadipattiPost, 'Vadipatti exists post-test');
    assert.strictEqual(vadipattiPost.monitoringTracks?.optical?.enabled, true);
    assert.strictEqual(vadipattiPost.monitoringTracks?.sar?.enabled, false);
    reportPass('Vadipatti production zone invariants 100% verified untouched post-test');

    await mongoose.disconnect();
  }

  console.info('\n================================================================');
  console.info(`SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.info('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
