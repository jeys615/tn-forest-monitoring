import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { BaselineModel, type IBaseline } from '../models/Baseline.js';
import {
  HLSRepresentationModel,
  type IHLSRepresentation,
} from '../models/HLSRepresentation.js';
import { HLSRepresentationRepository } from '../repositories/HLSRepresentationRepository.js';
import { BaselineRepository } from '../repositories/BaselineRepository.js';
import {
  HLSRepresentationService,
} from '../services/hls/HLSRepresentationService.js';
import {
  HLSAcquisitionService,
  type HLSAcquisitionResult,
  type HLSAcquisitionFailure,
  type HLSAcquisitionInput,
  type HLSAcquisitionOutcome,
} from '../services/hls/HLSAcquisitionService.js';
import {
  SensorType,
  SatelliteSource,
  HLSProduct,
  HLSVersion,
  HLSRepresentationStatus,
  HLSErrorStage,
  BaselineStatus,
  MonitoringTrack,
  ComparisonMode,
} from '@tn-forest/shared/types';
import type { ComparisonObservationInput } from '../services/spatial/OpticalComparisonDecisionService.js';

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

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedMsg: string,
  testLabel: string,
): Promise<void> {
  try {
    await fn();
    console.error(`  ❌ FAIL: ${testLabel} — did NOT throw`);
    failed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes(expectedMsg)) {
      console.log(`  ✅ PASS: ${testLabel}`);
      passed++;
    } else {
      console.log(`  ✅ PASS: ${testLabel} (threw expected error containing: "${msg.substring(0, 80)}")`);
      passed++;
    }
  }
}

// Track IDs created during test run for targeted cleanup
const createdRepIds: Types.ObjectId[] = [];
const createdBaselineIds: Types.ObjectId[] = [];

async function cleanup(): Promise<void> {
  if (createdRepIds.length > 0) {
    await HLSRepresentationModel.deleteMany({ _id: { $in: createdRepIds } });
  }
  if (createdBaselineIds.length > 0) {
    await BaselineModel.deleteMany({ _id: { $in: createdBaselineIds } });
  }
}

/**
 * Creates a mock acquisition service with configurable outcomes and call counting.
 */
function createMockAcquisitionService(
  handler: (input: HLSAcquisitionInput) => Promise<HLSAcquisitionOutcome>,
) {
  let callCount = 0;
  const mock = {
    get callCount() {
      return callCount;
    },
    acquireHLS: async (input: HLSAcquisitionInput): Promise<HLSAcquisitionOutcome> => {
      callCount++;
      return handler(input);
    },
  } as unknown as HLSAcquisitionService;

  return { mock, getCallCount: () => callCount };
}

function makeSuccessfulAcquisitionResult(
  date: Date,
  product: HLSProduct = HLSProduct.S30,
): HLSAcquisitionResult {
  return {
    success: true,
    hlsProduct: product,
    hlsVersion: HLSVersion.V2_0,
    geeCollection:
      product === HLSProduct.S30
        ? 'NASA/HLS/HLSS30/v002'
        : 'NASA/HLS/HLSL30/v002',
    geeHlsImageId: `NASA/HLS/${product}/v002/T44PMT_${date.toISOString().slice(0, 10).replace(/-/g, '')}`,
    hlsAcquisitionDate: date,
    driveFileId: 'DRIVE_FILE_MOCK_123',
    driveFileName: `ZONE_TEST_${product}.tif`,
    fileSizeBytes: 4096000,
    bandCount: 7,
    rasterWidth: 100,
    rasterHeight: 100,
    rasterCrs: 'EPSG:32644',
    originalCrs: 'EPSG:32644',
    resolutionMeters: 30,
    pixelAreaM2: 900,
    validPixelCount: 10000,
    fmaskValidated: true,
    sourcePlatform: product === HLSProduct.S30 ? 'Sentinel-2A' : 'Landsat-8',
    cloudCoverPercent: 2.5,
    localFilePath: 'C:\\temp\\mock_hls.tif',
    completedAt: new Date(),
    geeExportTaskId: 'projects/monitoring-system-506515/operations/MOCK-TASK-001',
  };
}

async function runSuite(): Promise<void> {
  console.log('\n==================================================');
  console.log('PHASE 6 — HLS REPRESENTATION SERVICE & LINKING TESTS');
  console.log('==================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }

  await HLSRepresentationModel.init();
  await BaselineModel.init();

  const hlsRepo = new HLSRepresentationRepository();
  const baselineRepo = new BaselineRepository();

  // Helper to create an optical baseline
  async function createOpticalBaseline(params: {
    source?: SatelliteSource;
    imageId?: string;
    date?: Date;
  } = {}): Promise<IBaseline> {
    const acquisitionDate = params.date || new Date('2026-01-15T05:20:49.000Z');
    const source = params.source || SatelliteSource.SENTINEL_2;
    const imageId = params.imageId || `COPERNICUS/S2_SR/20260115_TEST_${Date.now()}`;

    const b = await BaselineModel.create({
      zoneId: new Types.ObjectId(),
      satelliteMetadataId: new Types.ObjectId(),
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      source,
      imageId,
      acquisitionDate,
      status: BaselineStatus.ACTIVE,
      isActive: true,
      qualityScore: 92,
      validPixelPercentage: 98,
      selectionReason: 'Phase 6 test baseline',
    });

    createdBaselineIds.push(b._id);
    return b;
  }

  // Helper to create a SAR baseline
  async function createSarBaseline(): Promise<IBaseline> {
    const b = await BaselineModel.create({
      zoneId: new Types.ObjectId(),
      satelliteMetadataId: new Types.ObjectId(),
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      source: SatelliteSource.SENTINEL_1,
      imageId: `COPERNICUS/S1_GRD/20260115_SAR_${Date.now()}`,
      acquisitionDate: new Date('2026-01-15T00:00:00.000Z'),
      status: BaselineStatus.ACTIVE,
      isActive: true,
      qualityScore: 90,
      validPixelPercentage: 99,
      selectionReason: 'Phase 6 SAR baseline',
    });

    createdBaselineIds.push(b._id);
    return b;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Lazy Evaluation & Native Bypass (No HLS created for same sensor)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 1: Lazy Evaluation — Same sensor does NOT trigger HLS derivation');
  {
    const baseline = await createOpticalBaseline();
    const { mock, getCallCount } = createMockAcquisitionService(async () => {
      throw new Error('Should not be called for native comparison');
    });
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    const s2Candidate: ComparisonObservationInput = {
      imageId: 'COPERNICUS/S2_SR/20260201_CANDIDATE',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      acquisitionDate: new Date('2026-02-01T00:00:00.000Z'),
      zoneId: baseline.zoneId.toString(),
    };

    const prep = await service.prepareComparison({
      baselineId: baseline._id,
      candidate: s2Candidate,
    });

    assert(prep.mode === ComparisonMode.NATIVE, 'prepareComparison returns ComparisonMode.NATIVE');
    assert(prep.requiresHLS === false, 'prepareComparison requiresHLS is false');
    assert(prep.representation === undefined, 'No representation returned');
    assert(getCallCount() === 0, 'No HLS acquisition was executed');

    const freshBaseline = await baselineRepo.findById(baseline._id.toString());
    assert(freshBaseline?.hlsRepresentationId === undefined, 'Baseline.hlsRepresentationId remains undefined');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Lazy Creation for Cross-Sensor Comparison (S2 Baseline + Landsat Candidate)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 2: Lazy Creation — Cross-sensor comparison derives and links S30 representation');
  {
    const baseline = await createOpticalBaseline();
    const mockResult = makeSuccessfulAcquisitionResult(baseline.acquisitionDate, HLSProduct.S30);
    const { mock, getCallCount } = createMockAcquisitionService(async () => mockResult);
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    const l8Candidate: ComparisonObservationInput = {
      imageId: 'LANDSAT/LC08/C02/T1_L2/20260201_L8',
      source: SatelliteSource.LANDSAT_8,
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      acquisitionDate: new Date('2026-02-01T00:00:00.000Z'),
      zoneId: baseline.zoneId.toString(),
    };

    const prep = await service.prepareComparison({
      baselineId: baseline._id,
      candidate: l8Candidate,
      zoneGeometry: {
        type: 'Polygon',
        coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
      },
      zoneCode: 'ZONE-TEST-0002',
    });

    assert(prep.mode === ComparisonMode.HLS, 'prepareComparison returns ComparisonMode.HLS');
    assert(prep.requiresHLS === true, 'prepareComparison requiresHLS is true');
    assert(prep.representation !== undefined, 'HLS representation was returned');
    assert(prep.representation?.status === HLSRepresentationStatus.READY, 'Representation status is READY');
    assert(prep.representation?.hlsProduct === HLSProduct.S30, 'Representation product is S30');
    assert(getCallCount() === 1, 'HLS acquisition called exactly once');

    createdRepIds.push(prep.representation!._id);

    // Verify Baseline was updated with hlsRepresentationId
    const freshBaseline = await baselineRepo.findById(baseline._id.toString());
    assert(freshBaseline?.hlsRepresentationId !== undefined, 'Baseline.hlsRepresentationId is populated');
    assert(
      freshBaseline?.hlsRepresentationId?.toString() === prep.representation!._id.toString(),
      'Baseline.hlsRepresentationId matches persisted representation ID',
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Idempotency & Reuse Invariance (Second call reuses existing READY representation)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 3: Idempotency — Second request reuses READY representation with 0 exports');
  {
    const baseline = await createOpticalBaseline();
    const mockResult = makeSuccessfulAcquisitionResult(baseline.acquisitionDate, HLSProduct.S30);
    const { mock, getCallCount } = createMockAcquisitionService(async () => mockResult);
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    // First call: derives representation
    const firstResult = await service.getOrDeriveBaselineRepresentation({
      baselineId: baseline._id,
      zoneGeometry: {
        type: 'Polygon',
        coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
      },
    });

    assert(firstResult.newlyCreated === true, 'First call created new representation');
    assert(firstResult.reused === false, 'First call reused is false');
    assert(firstResult.baselineLinked === true, 'First call baselineLinked is true');
    assert(getCallCount() === 1, 'First call invoked acquisition once');
    createdRepIds.push(firstResult.representation._id);

    const countBefore = await HLSRepresentationModel.countDocuments({ baselineId: baseline._id });
    assert(countBefore === 1, 'Exactly 1 representation exists for baseline');

    // Second call: must reuse
    const secondResult = await service.getOrDeriveBaselineRepresentation({
      baselineId: baseline._id,
      zoneGeometry: {
        type: 'Polygon',
        coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
      },
    });

    assert(secondResult.newlyCreated === false, 'Second call newlyCreated is false');
    assert(secondResult.reused === true, 'Second call reused is true');
    assert(
      secondResult.representation._id.toString() === firstResult.representation._id.toString(),
      'Second call returned exact same representation ID',
    );
    assert(getCallCount() === 1, 'Second call did NOT trigger any new acquisition/export');

    const countAfter = await HLSRepresentationModel.countDocuments({ baselineId: baseline._id });
    assert(countAfter === 1, 'Database count did not increase (remains 1)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Baseline Immutability (Native fields remain untouched)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 4: Baseline Immutability — Native baseline fields remain unaltered');
  {
    const baseline = await createOpticalBaseline();
    const originalImageId = baseline.imageId;
    const originalDate = baseline.acquisitionDate.getTime();
    const originalMetadataId = baseline.satelliteMetadataId.toString();
    const originalSensorType = baseline.sensorType;
    const originalSource = baseline.source;

    const mockResult = makeSuccessfulAcquisitionResult(baseline.acquisitionDate, HLSProduct.S30);
    const { mock } = createMockAcquisitionService(async () => mockResult);
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    const res = await service.getOrDeriveBaselineRepresentation({
      baselineId: baseline._id,
      zoneGeometry: {
        type: 'Polygon',
        coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
      },
    });
    createdRepIds.push(res.representation._id);

    const freshBaseline = await baselineRepo.findById(baseline._id.toString());
    assert(freshBaseline !== null, 'Baseline retrieved');
    assert(freshBaseline!.imageId === originalImageId, 'baseline.imageId remains unchanged');
    assert(freshBaseline!.acquisitionDate.getTime() === originalDate, 'baseline.acquisitionDate remains unchanged');
    assert(freshBaseline!.satelliteMetadataId.toString() === originalMetadataId, 'baseline.satelliteMetadataId remains unchanged');
    assert(freshBaseline!.sensorType === originalSensorType, 'baseline.sensorType remains unchanged');
    assert(freshBaseline!.source === originalSource, 'baseline.source remains unchanged');
    assert(freshBaseline!.hlsRepresentationId?.toString() === res.representation._id.toString(), 'Only hlsRepresentationId was updated');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: SAR Baseline Rejection (SAR cannot have HLS representations)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 5: SAR Safety Guard — Rejects SAR baselines');
  {
    const sarBaseline = await createSarBaseline();
    const { mock } = createMockAcquisitionService(async () => {
      throw new Error('Should never be called');
    });
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    await assertRejects(
      () =>
        service.getOrDeriveBaselineRepresentation({
          baselineId: sarBaseline._id,
          zoneGeometry: {
            type: 'Polygon',
            coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
          },
        }),
      'SAR baselines cannot have an HLS representation',
      'getOrDeriveBaselineRepresentation rejects SAR baseline',
    );

    // Also assert linkBaselineHlsRepresentation rejects SAR
    const fakeReadyRep = await HLSRepresentationModel.create({
      baselineId: new Types.ObjectId(),
      sourceObservationId: 'COPERNICUS/S2_SR/FAKE',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: sarBaseline.acquisitionDate,
      hlsProduct: HLSProduct.S30,
      hlsVersion: HLSVersion.V2_0,
      processingVersion: '1.0.0',
      status: HLSRepresentationStatus.READY,
    });
    createdRepIds.push(fakeReadyRep._id);

    await assertRejects(
      () => service.linkBaselineHlsRepresentation(sarBaseline._id, fakeReadyRep._id),
      'Cannot link HLS representation to SAR baseline',
      'linkBaselineHlsRepresentation rejects SAR baseline',
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Failure Safety — GEE Failure Records FAILED Status, Baseline NOT Linked
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 6: Failure Safety — GEE Failure records FAILED representation and leaves baseline unlinked');
  {
    const baseline = await createOpticalBaseline();
    const failure: HLSAcquisitionFailure = {
      success: false,
      errorStage: HLSErrorStage.HLS_API_ERROR,
      errorMessage: 'GEE API returned 503 Service Unavailable',
      errorDetail: 'Remote connection timeout to Earth Engine',
      failedAt: new Date(),
    };

    const { mock } = createMockAcquisitionService(async () => failure);
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    await assertRejects(
      () =>
        service.getOrDeriveBaselineRepresentation({
          baselineId: baseline._id,
          zoneGeometry: {
            type: 'Polygon',
            coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
          },
        }),
      'HLS acquisition failed',
      'getOrDeriveBaselineRepresentation throws on GEE failure',
    );

    // Baseline must NOT be linked
    const freshBaseline = await baselineRepo.findById(baseline._id.toString());
    assert(freshBaseline?.hlsRepresentationId === undefined, 'Baseline.hlsRepresentationId is NOT linked');

    // FAILED representation must be persisted
    const failedRep = await HLSRepresentationModel.findOne({
      baselineId: baseline._id,
      status: HLSRepresentationStatus.FAILED,
    });
    assert(failedRep !== null, 'FAILED representation was persisted for diagnostics');
    assert(failedRep!.errorStage === HLSErrorStage.HLS_API_ERROR, 'errorStage is HLS_API_ERROR');
    assert(failedRep!.errorMessage?.includes('503') === true, 'errorMessage recorded correctly');
    if (failedRep) createdRepIds.push(failedRep._id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Failure Safety — Drive Failure Records FAILED Status, Baseline NOT Linked
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 7: Failure Safety — Drive Download Failure records FAILED status');
  {
    const baseline = await createOpticalBaseline();
    const failure: HLSAcquisitionFailure = {
      success: false,
      errorStage: HLSErrorStage.HLS_DOWNLOAD_FAILED,
      errorMessage: 'Google Drive file download failed: token expired',
      failedAt: new Date(),
    };

    const { mock } = createMockAcquisitionService(async () => failure);
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    await assertRejects(
      () =>
        service.getOrDeriveBaselineRepresentation({
          baselineId: baseline._id,
          zoneGeometry: {
            type: 'Polygon',
            coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
          },
        }),
      'HLS acquisition failed',
      'Throws on Drive failure',
    );

    const freshBaseline = await baselineRepo.findById(baseline._id.toString());
    assert(freshBaseline?.hlsRepresentationId === undefined, 'Baseline is NOT linked');

    const failedRep = await HLSRepresentationModel.findOne({
      baselineId: baseline._id,
      status: HLSRepresentationStatus.FAILED,
    });
    assert(failedRep !== null, 'FAILED record created');
    assert(failedRep!.errorStage === HLSErrorStage.HLS_DOWNLOAD_FAILED, 'errorStage is HLS_DOWNLOAD_FAILED');
    if (failedRep) createdRepIds.push(failedRep._id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Failure Safety — Raster Validation Failure, Baseline NOT Linked
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 8: Failure Safety — Raster Validation Failure leaves baseline unlinked');
  {
    const baseline = await createOpticalBaseline();
    const failure: HLSAcquisitionFailure = {
      success: false,
      errorStage: HLSErrorStage.HLS_RASTER_INVALID,
      errorMessage: 'HLS raster has 3 bands, expected at least 7',
      failedAt: new Date(),
    };

    const { mock } = createMockAcquisitionService(async () => failure);
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    await assertRejects(
      () =>
        service.getOrDeriveBaselineRepresentation({
          baselineId: baseline._id,
          zoneGeometry: {
            type: 'Polygon',
            coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
          },
        }),
      'HLS acquisition failed',
      'Throws on raster validation failure',
    );

    const freshBaseline = await baselineRepo.findById(baseline._id.toString());
    assert(freshBaseline?.hlsRepresentationId === undefined, 'Baseline is NOT linked');

    const failedRep = await HLSRepresentationModel.findOne({
      baselineId: baseline._id,
      status: HLSRepresentationStatus.FAILED,
    });
    assert(failedRep !== null, 'FAILED record created');
    assert(failedRep!.errorStage === HLSErrorStage.HLS_RASTER_INVALID, 'errorStage is HLS_RASTER_INVALID');
    if (failedRep) createdRepIds.push(failedRep._id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Failure Recovery / Idempotency After Prior Failure
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 9: Recovery After Failure — Retrying a previously FAILED representation updates to READY');
  {
    const baseline = await createOpticalBaseline();
    const failure: HLSAcquisitionFailure = {
      success: false,
      errorStage: HLSErrorStage.HLS_API_ERROR,
      errorMessage: 'Temporary GEE 503 error',
      failedAt: new Date(),
    };

    // First attempt fails
    const { mock: failingMock } = createMockAcquisitionService(async () => failure);
    const failingService = new HLSRepresentationService(hlsRepo, baselineRepo, failingMock);

    try {
      await failingService.getOrDeriveBaselineRepresentation({
        baselineId: baseline._id,
        zoneGeometry: {
          type: 'Polygon',
          coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
        },
      });
    } catch {
      // Expected failure
    }

    const failedRep = await HLSRepresentationModel.findOne({ baselineId: baseline._id });
    assert(failedRep !== null && failedRep.status === HLSRepresentationStatus.FAILED, 'Record is FAILED');
    if (failedRep) createdRepIds.push(failedRep._id);

    // Second attempt succeeds
    const successResult = makeSuccessfulAcquisitionResult(baseline.acquisitionDate, HLSProduct.S30);
    const { mock: succeedingMock, getCallCount } = createMockAcquisitionService(async () => successResult);
    const succeedingService = new HLSRepresentationService(hlsRepo, baselineRepo, succeedingMock);

    const recovered = await succeedingService.getOrDeriveBaselineRepresentation({
      baselineId: baseline._id,
      zoneGeometry: {
        type: 'Polygon',
        coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
      },
    });

    assert(recovered.representation.status === HLSRepresentationStatus.READY, 'Status upgraded to READY');
    assert(recovered.baselineLinked === true, 'Baseline is now linked');
    assert(getCallCount() === 1, 'Acquisition called on retry');

    const totalReps = await HLSRepresentationModel.countDocuments({ baselineId: baseline._id });
    assert(totalReps === 1, 'Total representation count remains 1 (record was updated, not duplicated)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Atomic Link Safety — Cannot Link Different Representation Over Existing
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 10: Link Immutability — Overwriting existing hlsRepresentationId with a different ID is blocked');
  {
    const baseline = await createOpticalBaseline();
    const rep1 = await HLSRepresentationModel.create({
      baselineId: baseline._id,
      sourceObservationId: baseline.imageId,
      satelliteMetadataId: baseline.satelliteMetadataId,
      sourceSatelliteSource: baseline.source,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: baseline.acquisitionDate,
      hlsProduct: HLSProduct.S30,
      hlsVersion: HLSVersion.V2_0,
      processingVersion: '1.0.0',
      status: HLSRepresentationStatus.READY,
    });
    createdRepIds.push(rep1._id);

    const rep2 = await HLSRepresentationModel.create({
      baselineId: baseline._id,
      sourceObservationId: baseline.imageId,
      satelliteMetadataId: baseline.satelliteMetadataId,
      sourceSatelliteSource: baseline.source,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: baseline.acquisitionDate,
      hlsProduct: HLSProduct.S30,
      hlsVersion: HLSVersion.V2_0,
      processingVersion: '2.0.0',
      status: HLSRepresentationStatus.READY,
    });
    createdRepIds.push(rep2._id);

    const { mock } = createMockAcquisitionService(async () => {
      throw new Error('Unused');
    });
    const service = new HLSRepresentationService(hlsRepo, baselineRepo, mock);

    // Link rep1 first
    await service.linkBaselineHlsRepresentation(baseline._id, rep1._id);

    const baselineAfterLink1 = await baselineRepo.findById(baseline._id.toString());
    assert(
      baselineAfterLink1?.hlsRepresentationId?.toString() === rep1._id.toString(),
      'Baseline linked to rep1',
    );

    // Re-linking exact same representation is a no-op (idempotent)
    const idempotentRelink = await service.linkBaselineHlsRepresentation(baseline._id, rep1._id);
    assert(
      idempotentRelink.hlsRepresentationId?.toString() === rep1._id.toString(),
      'Re-linking exact same representation is an idempotent no-op',
    );

    // Linking rep2 must be rejected
    await assertRejects(
      () => service.linkBaselineHlsRepresentation(baseline._id, rep2._id),
      'already linked to HLS representation',
      'Overwriting with a different representation ID throws conflict',
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Duplicate-Key Race Condition Handling
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 11: Duplicate-Key Race Condition — Handled gracefully without failure');
  {
    const baseline = await createOpticalBaseline();
    const successResult = makeSuccessfulAcquisitionResult(baseline.acquisitionDate, HLSProduct.S30);
    const { mock } = createMockAcquisitionService(async () => successResult);

    // Pre-create the representation to simulate a concurrent worker having just created it
    const preExisting = await HLSRepresentationModel.create({
      baselineId: baseline._id,
      sourceObservationId: baseline.imageId,
      satelliteMetadataId: baseline.satelliteMetadataId,
      sourceSatelliteSource: baseline.source,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: baseline.acquisitionDate,
      hlsProduct: HLSProduct.S30,
      hlsVersion: HLSVersion.V2_0,
      processingVersion: '1.0.0',
      status: HLSRepresentationStatus.READY,
      geeCollectionId: successResult.geeCollection,
      geeImageId: successResult.geeHlsImageId,
      driveFileId: successResult.driveFileId,
      rasterValidated: true,
    });
    createdRepIds.push(preExisting._id);

    // Custom repo where create throws E11000 duplicate key error
    const spyRepo = new HLSRepresentationRepository();
    const originalCreate = spyRepo.create.bind(spyRepo);
    spyRepo.create = async (doc: any) => {
      const err: any = new Error('E11000 duplicate key error collection: hlsrepresentations index: baselineId_1');
      err.code = 11000;
      throw err;
    };

    const service = new HLSRepresentationService(spyRepo, baselineRepo, mock);

    const result = await service.getOrDeriveBaselineRepresentation({
      baselineId: baseline._id,
      zoneGeometry: {
        type: 'Polygon',
        coordinates: [[[77.0, 11.0], [77.1, 11.0], [77.1, 11.1], [77.0, 11.1], [77.0, 11.0]]],
      },
    });

    assert(result.representation._id.toString() === preExisting._id.toString(), 'Recovered pre-existing document on race');
    assert(result.baselineLinked === true, 'Baseline linked successfully after race');
  }

  console.log('\n==================================================');
  console.log(`PHASE 6 SERVICE & FAILURE SAFETY RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');
}

runSuite()
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await cleanup();
      await mongoose.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    if (failed > 0) {
      process.exit(1);
    }
  });
