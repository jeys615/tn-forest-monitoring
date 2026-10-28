/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import {
  AutomatedMonitoringService,
  type AreaInfo,
  type DiscoveredSatelliteObservation,
} from '../services/AutomatedMonitoringService.js';
import {
  SensorType,
  SatelliteSource,
  ZoneStatus,
  ZoneCategory,
  RejectionReasonCode,
  IncrementalLifecycleState,
  type GeoJSONPolygon,
  type RealSentinel2ImageDto,
  type RealSarImageDto,
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

async function runTransparencySuite(): Promise<void> {
  console.info('================================================================');
  console.info('MONITORING CYCLE DISCOVERY TRANSPARENCY REGRESSION SUITE (12 TESTS)');
  console.info('================================================================\n');

  await connectDatabase();

  const testZoneId = `ZONE-TEST-TRANS-${Date.now()}`;
  let testZoneDoc: any = null;
  let testBaselineMetaDoc: any = null;
  let testBaselineDoc: any = null;
  const createdRecordIds: string[] = [];
  const createdMetaIds: string[] = [];

  const testBoundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.000, 10.000],
        [78.020, 10.000],
        [78.020, 10.020],
        [78.000, 10.020],
        [78.000, 10.000],
      ],
    ],
  };

  const outsideBoundary: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [79.500, 11.500],
        [79.520, 11.500],
        [79.520, 11.520],
        [79.500, 11.520],
        [79.500, 11.500],
      ],
    ],
  };

  try {
    // ------------------------------------------------------------------
    // Setup Isolated Test Fixtures
    // ------------------------------------------------------------------
    console.info('Setting up isolated test zone and baseline fixtures...');

    testZoneDoc = await Zone.create({
      zoneId: testZoneId,
      name: `Transparency Test Zone ${testZoneId}`,
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      boundary: testBoundary,
      centerPoint: { type: 'Point', coordinates: [78.010, 10.010] },
      areaHectares: 100.0,
      district: 'Madurai',
      division: 'Sathiyar',
      range: 'TestRange',
      createdBy: new Types.ObjectId(),
    });

    const baselineDate = new Date('2020-01-01T00:00:00.000Z');
    testBaselineMetaDoc = await SatelliteMetadata.create({
      imageId: `COPERNICUS/S2_SR_HARMONIZED/BASELINE_${testZoneId}`,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: baselineDate,
      cloudCover: 1.0,
      footprint: testBoundary,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED',
      intersectingZones: [testZoneDoc._id],
      processingStatus: 'PROCESSED',
      metadata: {
        spacecraftName: 'Sentinel-2A',
        isRealTelemetry: true,
        bands: ['B2', 'B3', 'B4', 'B8'],
      },
    });
    createdMetaIds.push(testBaselineMetaDoc._id.toString());

    testBaselineDoc = await BaselineModel.create({
      zoneId: testZoneDoc._id,
      satelliteMetadataId: testBaselineMetaDoc._id,
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      status: 'ACTIVE',
      isActive: true,
      qualityScore: 95.0,
      validPixelPercentage: 99.0,
      selectionReason: 'Optimal cloud-free baseline',
      acquisitionDate: baselineDate,
      activatedAt: new Date(),
      metadata: {
        referenceIndices: {
          meanNdvi: 0.50,
          meanNdwi: -0.10,
          meanNdbi: -0.20,
        },
      },
    });

    const areaInfo: AreaInfo = {
      id: testZoneDoc._id.toString(),
      name: testZoneDoc.name,
      type: 'PERMANENT',
      boundary: testBoundary,
      status: 'ACTIVE',
      areaHectares: 100.0,
    };

    const monitoringService = AutomatedMonitoringService.getInstance();

    // Preserve original discoverNewObservations and processObservationPipeline
    const originalDiscover = (monitoringService as any).discoverNewObservations.bind(monitoringService);
    const originalProcess = (monitoringService as any).processObservationPipeline.bind(monitoringService);

    // ==================================================================
    // TEST 1: GEE returns 0 scenes
    // ==================================================================
    try {
      (monitoringService as any).discoverNewObservations = async () => [];

      const { areaResult } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      assert.strictEqual(areaResult.discoveredCount, 0, 'discoveredCount must be 0');
      assert.strictEqual(areaResult.eligibleCount, 0, 'eligibleCount must be 0');
      assert.strictEqual(areaResult.processedCount, 0, 'processedCount must be 0');
      assert.strictEqual(areaResult.rejectedObservations.length, 0, 'rejectedObservations must be empty');
      assert.strictEqual(areaResult.rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD, 0);
      assert.strictEqual(areaResult.rejectionSummary.SENSOR_TRACK_MISMATCH, 0);

      reportPass('Test 1: GEE returns 0 scenes (discovered=0, eligible=0, processed=0)');
    } catch (err) {
      reportFail('Test 1', err);
    }

    // ==================================================================
    // TEST 2: GEE returns 4 scenes, all rejected (2 cloud, 2 sensor track mismatch)
    // ==================================================================
    try {
      const mockScenes: DiscoveredSatelliteObservation[] = [
        // 2 Sentinel-2 scenes with cloud > 20%
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_HIGH_CLOUD_1',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-14T05:25:00.000Z',
          cloudCoverPercentage: 76.91,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_HIGH_CLOUD_2',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2B',
          acquisitionDate: '2026-09-19T05:25:00.000Z',
          cloudCoverPercentage: 60.49,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
        // 2 Sentinel-1 SAR scenes (baseline is OPTICAL)
        {
          imageId: 'COPERNICUS/S1_GRD/S1_SAR_1',
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
          spacecraftName: 'Sentinel-1A',
          acquisitionDate: '2026-09-10T12:00:00.000Z',
          footprint: testBoundary,
          polarization: ['VV', 'VH'],
          orbitPass: 'ASCENDING',
          isRealTelemetry: true,
        } as unknown as RealSarImageDto,
        {
          imageId: 'COPERNICUS/S1_GRD/S1_SAR_2',
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
          spacecraftName: 'Sentinel-1A',
          acquisitionDate: '2026-09-15T12:00:00.000Z',
          footprint: testBoundary,
          polarization: ['VV', 'VH'],
          orbitPass: 'ASCENDING',
          isRealTelemetry: true,
        } as unknown as RealSarImageDto,
      ];

      (monitoringService as any).discoverNewObservations = async () => mockScenes;

      const { areaResult } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      assert.strictEqual(areaResult.discoveredCount, 4, 'discoveredCount must be 4');
      assert.strictEqual(areaResult.eligibleCount, 0, 'eligibleCount must be 0');
      assert.strictEqual(areaResult.processedCount, 0, 'processedCount must be 0');
      assert.strictEqual(areaResult.rejectedObservations.length, 4, 'rejectedObservations must have 4 items');
      assert.strictEqual(areaResult.rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD, 2, '2 cloud rejections');
      assert.strictEqual(areaResult.rejectionSummary.SENSOR_TRACK_MISMATCH, 2, '2 sensor track mismatches');

      // Verify rejected observation details
      const cloudRejections = areaResult.rejectedObservations.filter(
        (r) => r.reasonCode === RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD,
      );
      assert.strictEqual(cloudRejections.length, 2);
      assert.strictEqual(cloudRejections[0].cloudCover, 76.91);
      assert.strictEqual(cloudRejections[1].cloudCover, 60.49);

      const sensorRejections = areaResult.rejectedObservations.filter(
        (r) => r.reasonCode === RejectionReasonCode.SENSOR_TRACK_MISMATCH,
      );
      assert.strictEqual(sensorRejections.length, 2);
      assert.strictEqual(sensorRejections[0].sensor, SensorType.SAR);

      reportPass('Test 2: GEE returns 4 scenes, all rejected (discovered=4, eligible=0, processed=0, 2 cloud + 2 sensor track)');
    } catch (err) {
      reportFail('Test 2', err);
    }

    // ==================================================================
    // TEST 3: GEE returns 4 scenes, 1 eligible (Option A: newest eligible processed)
    // ==================================================================
    try {
      const mockScenesWithOneEligible: DiscoveredSatelliteObservation[] = [
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_HIGH_CLOUD_A',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-14T05:25:00.000Z',
          cloudCoverPercentage: 55.0,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
        {
          imageId: 'COPERNICUS/S1_GRD/S1_SAR_A',
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
          spacecraftName: 'Sentinel-1A',
          acquisitionDate: '2026-09-15T12:00:00.000Z',
          footprint: testBoundary,
          polarization: ['VV', 'VH'],
          orbitPass: 'ASCENDING',
          isRealTelemetry: true,
        } as unknown as RealSarImageDto,
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_CLEAN_ELIGIBLE_1',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-18T05:25:00.000Z',
          cloudCoverPercentage: 5.2, // <= 20%
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_HIGH_CLOUD_B',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2B',
          acquisitionDate: '2026-09-20T05:25:00.000Z',
          cloudCoverPercentage: 45.0,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
      ];

      (monitoringService as any).discoverNewObservations = async () => mockScenesWithOneEligible;

      // Mock pipeline execution for selected candidate
      (monitoringService as any).processObservationPipeline = async (area: AreaInfo, candidate: any) => {
        return {
          jobId: `JOB-TEST-${Date.now()}`,
          areaId: area.id,
          areaName: area.name,
          areaType: area.type,
          observationId: candidate.imageId,
          sensorType: candidate.sensorType,
          acquisitionDate: candidate.acquisitionDate,
          lifecycleState: IncrementalLifecycleState.COMPLETED,
          results: {
            changeDetected: false,
          },
        };
      };

      const { areaResult, jobs } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      assert.strictEqual(areaResult.discoveredCount, 4, 'discoveredCount must be 4');
      assert.strictEqual(areaResult.eligibleCount, 1, 'eligibleCount must be 1');
      assert.strictEqual(areaResult.processedCount, 1, 'processedCount must be 1 (Option A)');
      assert.strictEqual(areaResult.eligibleObservationIds.length, 1);
      assert.strictEqual(areaResult.eligibleObservationIds[0], 'COPERNICUS/S2_SR_HARMONIZED/S2_CLEAN_ELIGIBLE_1');
      assert.strictEqual(areaResult.rejectedObservations.length, 3);
      assert.strictEqual(jobs.length, 1);

      reportPass('Test 3: GEE returns 4 scenes, 1 eligible (discovered=4, eligible=1, processed=1)');
    } catch (err) {
      reportFail('Test 3', err);
    }

    // ==================================================================
    // TEST 4: 1 eligible scene processed, change detection pipeline executes with alerts
    // ==================================================================
    try {
      const mockSingleEligible: DiscoveredSatelliteObservation[] = [
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_ALERT_TRIGGER_SCENE',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-21T05:25:00.000Z',
          cloudCoverPercentage: 8.0,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
      ];

      (monitoringService as any).discoverNewObservations = async () => mockSingleEligible;
      (monitoringService as any).processObservationPipeline = async (area: AreaInfo, candidate: any) => {
        return {
          jobId: `JOB-ALERT-${Date.now()}`,
          areaId: area.id,
          areaName: area.name,
          areaType: area.type,
          observationId: candidate.imageId,
          sensorType: candidate.sensorType,
          acquisitionDate: candidate.acquisitionDate,
          lifecycleState: IncrementalLifecycleState.COMPLETED,
          results: {
            changeDetected: true,
            alertId: 'ALT-TEST-999',
            severity: 'HIGH',
          },
        };
      };

      const { areaResult, jobs } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      assert.strictEqual(areaResult.discoveredCount, 1);
      assert.strictEqual(areaResult.eligibleCount, 1);
      assert.strictEqual(areaResult.processedCount, 1);
      assert.strictEqual(jobs[0].results?.alertId, 'ALT-TEST-999');

      reportPass('Test 4: 1 eligible scene processed, change detection pipeline executes (alert linked)');
    } catch (err) {
      reportFail('Test 4', err);
    }

    // ==================================================================
    // TEST 5: GEE API failure does NOT return discovered = 0
    // ==================================================================
    try {
      (monitoringService as any).discoverNewObservations = async () => {
        throw new Error('GEE_API_ERROR: 503 Backend unavailable / quota exceeded');
      };

      let threw = false;
      try {
        await monitoringService.processAreaIncrementalDetailed(areaInfo);
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('GEE_API_ERROR'), 'Error must preserve GEE failure cause');
      }

      assert.strictEqual(threw, true, 'Fatal GEE search error must throw and NOT report discovered = 0');
      reportPass('Test 5: GEE API failure does NOT return discovered = 0 (throws explicit error)');
    } catch (err) {
      reportFail('Test 5', err);
    }

    // ==================================================================
    // TEST 6: Database connection failure does NOT return discovered = 0
    // ==================================================================
    try {
      // Mock mongoose readyState as disconnected (0)
      const originalDescriptor =
        Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState') ??
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(mongoose.connection), 'readyState');

      Object.defineProperty(mongoose.connection, 'readyState', {
        get: () => 0,
        configurable: true,
      });

      let dbErrorThrew = false;
      try {
        await monitoringService.runAutomatedMonitoringCycle();
      } catch (err: any) {
        dbErrorThrew = true;
        assert.ok(
          err.message.includes('DATABASE_UNAVAILABLE'),
          'Must throw DATABASE_UNAVAILABLE when disconnected',
        );
      } finally {
        delete (mongoose.connection as any).readyState;
        if (originalDescriptor) {
          try {
            Object.defineProperty(mongoose.connection, 'readyState', originalDescriptor);
          } catch {
            // Prototype getter is already active
          }
        }
      }

      assert.strictEqual(dbErrorThrew, true, 'Disconnected DB must throw error and NOT return discovered = 0');
      reportPass('Test 6: Database connection failure does NOT return discovered = 0');
    } catch (err) {
      reportFail('Test 6', err);
    }

    // ==================================================================
    // TEST 7: Invariant check (discoveredCount >= eligibleCount >= processedCount)
    // ==================================================================
    try {
      // Scenario A: 0 discovered
      (monitoringService as any).discoverNewObservations = async () => [];
      const resA = await monitoringService.processAreaIncrementalDetailed(areaInfo);
      assert.ok(
        resA.areaResult.discoveredCount >= resA.areaResult.eligibleCount &&
          resA.areaResult.eligibleCount >= resA.areaResult.processedCount,
        'Invariant holds for 0 scenes',
      );

      // Scenario B: 4 scenes, 0 eligible
      (monitoringService as any).discoverNewObservations = async () => [
        {
          imageId: 'S2_INV_1',
          sensorType: SensorType.OPTICAL,
          acquisitionDate: '2026-09-14T00:00:00Z',
          cloudCoverPercentage: 80.0,
          footprint: testBoundary,
        } as any,
      ];
      const resB = await monitoringService.processAreaIncrementalDetailed(areaInfo);
      assert.ok(
        resB.areaResult.discoveredCount >= resB.areaResult.eligibleCount &&
          resB.areaResult.eligibleCount >= resB.areaResult.processedCount,
        'Invariant holds for 1 scene 0 eligible',
      );

      // Scenario C: 3 eligible scenes -> Option A selects 1
      (monitoringService as any).discoverNewObservations = async () => [
        {
          imageId: 'S2_INV_E1',
          sensorType: SensorType.OPTICAL,
          acquisitionDate: '2026-09-15T00:00:00Z',
          cloudCoverPercentage: 5.0,
          footprint: testBoundary,
        } as any,
        {
          imageId: 'S2_INV_E2',
          sensorType: SensorType.OPTICAL,
          acquisitionDate: '2026-09-18T00:00:00Z',
          cloudCoverPercentage: 4.0,
          footprint: testBoundary,
        } as any,
      ];
      (monitoringService as any).processObservationPipeline = async (area: AreaInfo, candidate: any) => ({
        jobId: 'JOB-INV',
        areaId: area.id,
        areaName: area.name,
        areaType: area.type,
        observationId: candidate.imageId,
        sensorType: candidate.sensorType,
        acquisitionDate: candidate.acquisitionDate,
        lifecycleState: IncrementalLifecycleState.COMPLETED,
      });

      const resC = await monitoringService.processAreaIncrementalDetailed(areaInfo);
      assert.strictEqual(resC.areaResult.discoveredCount, 2);
      assert.strictEqual(resC.areaResult.eligibleCount, 2);
      assert.strictEqual(resC.areaResult.processedCount, 1);
      assert.ok(
        resC.areaResult.discoveredCount >= resC.areaResult.eligibleCount &&
          resC.areaResult.eligibleCount >= resC.areaResult.processedCount,
        'Invariant holds for 2 discovered, 2 eligible, 1 processed',
      );

      reportPass('Test 7: Invariant check (discoveredCount >= eligibleCount >= processedCount holds everywhere)');
    } catch (err) {
      reportFail('Test 7', err);
    }

    // ==================================================================
    // TEST 8: Deduplication check
    // ==================================================================
    try {
      // Return pagination duplicates (same imageId appearing 3 times)
      const duplicateScenes: DiscoveredSatelliteObservation[] = [
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_PAGINATED_DUP',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-18T05:25:00.000Z',
          cloudCoverPercentage: 85.0,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_PAGINATED_DUP',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-18T05:25:00.000Z',
          cloudCoverPercentage: 85.0,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_PAGINATED_DUP',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-18T05:25:00.000Z',
          cloudCoverPercentage: 85.0,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
      ];

      (monitoringService as any).discoverNewObservations = async () => duplicateScenes;

      const { areaResult } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      // Must be deduplicated before evaluation: discoveredCount = 1, NOT 3
      assert.strictEqual(areaResult.discoveredCount, 1, 'Pagination duplicates must be deduplicated to 1');
      assert.strictEqual(areaResult.rejectedObservations.length, 1);

      reportPass('Test 8: Deduplication check (duplicate GEE image IDs from pagination counted once)');
    } catch (err) {
      reportFail('Test 8', err);
    }

    // ==================================================================
    // TEST 9: Rejection reason accuracy: Cloud cover
    // ==================================================================
    try {
      const cloudScene: DiscoveredSatelliteObservation[] = [
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_CLOUD_TEST',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2026-09-18T05:25:00.000Z',
          cloudCoverPercentage: 35.8,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
      ];

      (monitoringService as any).discoverNewObservations = async () => cloudScene;

      const { areaResult } = await monitoringService.processAreaIncrementalDetailed(areaInfo, {
        maxCloudCover: 20.0,
      });

      assert.strictEqual(areaResult.rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD, 1);
      assert.strictEqual(areaResult.rejectedObservations[0].reasonCode, RejectionReasonCode.CLOUD_COVER_EXCEEDS_THRESHOLD);
      assert.strictEqual(areaResult.rejectedObservations[0].cloudCover, 35.8);
      assert.ok(areaResult.rejectedObservations[0].reason.includes('35.80% > 20%'));

      reportPass('Test 9: Rejection reason accuracy: Cloud cover exceeds threshold with exact telemetry');
    } catch (err) {
      reportFail('Test 9', err);
    }

    // ==================================================================
    // TEST 10: Baseline sensor match accuracy
    // ==================================================================
    try {
      const sarScene: DiscoveredSatelliteObservation[] = [
        {
          imageId: 'COPERNICUS/S1_GRD/S1_SAR_TEST',
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
          spacecraftName: 'Sentinel-1A',
          acquisitionDate: '2026-09-18T05:25:00.000Z',
          footprint: testBoundary,
          polarization: ['VV', 'VH'],
          orbitPass: 'ASCENDING',
          isRealTelemetry: true,
        } as unknown as RealSarImageDto,
      ];

      (monitoringService as any).discoverNewObservations = async () => sarScene;

      const { areaResult } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      assert.strictEqual(areaResult.rejectionSummary.SENSOR_TRACK_MISMATCH, 1);
      assert.strictEqual(areaResult.rejectedObservations[0].reasonCode, RejectionReasonCode.SENSOR_TRACK_MISMATCH);
      assert.strictEqual(areaResult.rejectedObservations[0].sensor, SensorType.SAR);

      reportPass('Test 10: Baseline sensor match accuracy: SAR scene rejected against OPTICAL baseline');
    } catch (err) {
      reportFail('Test 10', err);
    }

    // ==================================================================
    // TEST 11: Temporal check
    // ==================================================================
    try {
      const historicalScene: DiscoveredSatelliteObservation[] = [
        {
          imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_HISTORICAL_BEFORE_BASELINE',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          spacecraftName: 'Sentinel-2A',
          acquisitionDate: '2019-05-01T00:00:00.000Z', // Baseline is 2020-01-01
          cloudCoverPercentage: 5.0,
          footprint: testBoundary,
          bands: [],
          geeAssetPath: '',
          isRealTelemetry: true,
        } as RealSentinel2ImageDto,
      ];

      (monitoringService as any).discoverNewObservations = async () => historicalScene;

      const { areaResult } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      assert.strictEqual(areaResult.rejectionSummary.TEMPORAL_INELIGIBLE, 1);
      assert.strictEqual(areaResult.rejectedObservations[0].reasonCode, RejectionReasonCode.TEMPORAL_INELIGIBLE);

      reportPass('Test 11: Temporal check: Observation prior to baseline is rejected with TEMPORAL_INELIGIBLE');
    } catch (err) {
      reportFail('Test 11', err);
    }

    // ==================================================================
    // TEST 12: Rejection inventory consistency
    // ==================================================================
    try {
      const mixedScenes: DiscoveredSatelliteObservation[] = [
        // 1. Cloud > 20%
        {
          imageId: 'S2_MIX_CLOUD',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          acquisitionDate: '2026-09-12T00:00:00Z',
          cloudCoverPercentage: 40.0,
          footprint: testBoundary,
        } as any,
        // 2. SAR mismatch
        {
          imageId: 'S1_MIX_SAR',
          source: SatelliteSource.SENTINEL_1,
          sensorType: SensorType.SAR,
          acquisitionDate: '2026-09-13T00:00:00Z',
          footprint: testBoundary,
        } as any,
        // 3. Historical (before baseline 2020-01-01)
        {
          imageId: 'S2_MIX_HISTORICAL',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          acquisitionDate: '2018-01-01T00:00:00Z',
          cloudCoverPercentage: 5.0,
          footprint: testBoundary,
        } as any,
        // 4. Geometry outside
        {
          imageId: 'S2_MIX_OUTSIDE_GEOM',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          acquisitionDate: '2026-09-15T00:00:00Z',
          cloudCoverPercentage: 5.0,
          footprint: outsideBoundary,
        } as any,
        // 5. Eligible scene
        {
          imageId: 'S2_MIX_ELIGIBLE',
          source: SatelliteSource.SENTINEL_2,
          sensorType: SensorType.OPTICAL,
          acquisitionDate: '2026-09-20T00:00:00Z',
          cloudCoverPercentage: 4.0,
          footprint: testBoundary,
        } as any,
      ];

      (monitoringService as any).discoverNewObservations = async () => mixedScenes;
      (monitoringService as any).processObservationPipeline = async (area: AreaInfo, candidate: any) => ({
        jobId: 'JOB-MIX',
        areaId: area.id,
        areaName: area.name,
        areaType: area.type,
        observationId: candidate.imageId,
        sensorType: candidate.sensorType,
        acquisitionDate: candidate.acquisitionDate,
        lifecycleState: IncrementalLifecycleState.COMPLETED,
      });

      const { areaResult } = await monitoringService.processAreaIncrementalDetailed(areaInfo);

      const summarySum =
        areaResult.rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD +
        areaResult.rejectionSummary.SENSOR_TRACK_MISMATCH +
        areaResult.rejectionSummary.TEMPORAL_INELIGIBLE +
        areaResult.rejectionSummary.GEOMETRY_NOT_INTERSECTING +
        areaResult.rejectionSummary.DUPLICATE_OBSERVATION +
        areaResult.rejectionSummary.BASELINE_MATCH +
        areaResult.rejectionSummary.OTHER;

      assert.strictEqual(
        summarySum,
        areaResult.rejectedObservations.length,
        'Sum of rejectionSummary counts must equal rejectedObservations.length',
      );
      assert.strictEqual(
        areaResult.rejectedObservations.length,
        areaResult.discoveredCount - areaResult.eligibleCount,
        'rejectedObservations.length must equal discoveredCount - eligibleCount',
      );
      assert.strictEqual(summarySum, 4, 'Exactly 4 scenes rejected');
      assert.strictEqual(areaResult.eligibleCount, 1, 'Exactly 1 scene eligible');
      assert.strictEqual(areaResult.discoveredCount, 5, 'Total 5 scenes discovered');

      reportPass('Test 12: Rejection inventory consistency (summary sum === rejected.length === discovered - eligible)');
    } catch (err) {
      reportFail('Test 12', err);
    }

    // Restore original methods
    (monitoringService as any).discoverNewObservations = originalDiscover;
    (monitoringService as any).processObservationPipeline = originalProcess;

  } finally {
    // ------------------------------------------------------------------
    // Cleanup Isolated Test Fixtures
    // ------------------------------------------------------------------
    console.info('\nCleaning up isolated test fixtures...');
    if (testZoneDoc) {
      await Zone.deleteOne({ _id: testZoneDoc._id });
    }
    if (testBaselineDoc) {
      await BaselineModel.deleteOne({ _id: testBaselineDoc._id });
    }
    for (const mId of createdMetaIds) {
      await SatelliteMetadata.deleteOne({ _id: mId });
    }
    for (const rId of createdRecordIds) {
      await IncrementalMonitoringRecordModel.deleteOne({ _id: rId });
    }
    console.info('Isolated fixture cleanup complete.');
    await mongoose.disconnect();
    console.info('MongoDB disconnected.\n');
  }

  console.info('================================================================');
  console.info(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: 12)`);
  console.info('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTransparencySuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
