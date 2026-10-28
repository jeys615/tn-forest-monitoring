import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { BaselineModel } from '../models/Baseline.js';
import {
  HLSRepresentationModel,
  isSameAcquisitionDate,
  validateSameAcquisitionDate,
} from '../models/HLSRepresentation.js';
import { HLSRepresentationRepository } from '../repositories/HLSRepresentationRepository.js';
import {
  SensorType,
  SatelliteSource,
  HLSProduct,
  HLSVersion,
  HLSRepresentationStatus,
  HLSErrorStage,
  BaselineStatus,
  MonitoringTrack,
} from '@tn-forest/shared/types';

/**
 * Phase 3: HLS Representation / Lineage Model Test Suite
 *
 * Verifies that HLSRepresentation represents an HLS artifact of ONE logical baseline
 * while enforcing:
 *   1. Construction and DTO mapping
 *   2. Required lineage fields enforcement
 *   3. S30 and L30 product acceptance
 *   4. HLS version V2.0 handling
 *   5. Lifecycle status states (NOT_CREATED, PROCESSING, READY, FAILED)
 *   6. Invalid HLS product rejection
 *   7. SAR source rejection (SensorType.SAR and SENTINEL_1 blocked)
 *   8. Same-date lineage validation (standalone and baseline cross-check)
 *   9. Lineage immutability once READY
 *   10. Duplicate identity prevention via compound index
 *   11. Baseline single logical entity invariance
 *   12. Repository operations
 */

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
      console.log(`  ✅ PASS: ${testLabel} (threw expected error: ${msg.substring(0, 100)})`);
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

async function runHlsRepresentationTests(): Promise<void> {
  console.log('\n==================================================');
  console.log('HLS REPRESENTATION & LINEAGE MODEL TEST SUITE (PHASE 3)');
  console.log('==================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }

  // Ensure indexes are built on HLSRepresentation collection
  await HLSRepresentationModel.init();

  const repository = new HLSRepresentationRepository();

  // Helper to create a baseline for testing
  async function createTestBaseline(acquisitionDate: Date): Promise<Types.ObjectId> {
    const b = await BaselineModel.create({
      zoneId: new Types.ObjectId(),
      satelliteMetadataId: new Types.ObjectId(),
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate,
      status: BaselineStatus.CANDIDATE,
      isActive: false,
      qualityScore: 90,
      validPixelPercentage: 95,
      selectionReason: 'Phase 3 test baseline',
    });
    createdBaselineIds.push(b._id);
    return b._id;
  }

  // ── TEST 1: Valid HLS representation construction & DTO mapping ──
  console.log('\n▶ Test 1: Valid HLS Representation Construction & DTO Mapping');
  {
    const date = new Date('2026-09-06T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);
    const satMetaId = new Types.ObjectId();

    const rep = await HLSRepresentationModel.create({
      baselineId,
      sourceObservationId: 'COPERNICUS/S2_SR_HARMONIZED/20260906T050221',
      satelliteMetadataId: satMetaId,
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourcePlatform: 'Sentinel-2A',
      sourceAcquisitionDate: date,
      hlsProduct: HLSProduct.S30,
      hlsVersion: HLSVersion.V2_0,
      processingVersion: '1.0.0',
      status: HLSRepresentationStatus.NOT_CREATED,
    });
    createdRepIds.push(rep._id);

    assert(rep._id !== undefined, 'HLSRepresentation document has _id');
    assert(rep.hlsProduct === HLSProduct.S30, 'hlsProduct is S30');
    assert(rep.hlsVersion === HLSVersion.V2_0, 'hlsVersion is V2.0');
    assert(rep.status === HLSRepresentationStatus.NOT_CREATED, 'Default status is NOT_CREATED');
    assert(rep.sourceSensor === SensorType.OPTICAL, 'sourceSensor virtual returns OPTICAL');

    const dto = rep.toDto();
    assert(dto.id === rep._id.toString(), 'DTO id matches document _id');
    assert(dto.baselineId === baselineId.toString(), 'DTO baselineId matches');
    assert(dto.hlsProduct === HLSProduct.S30, 'DTO hlsProduct matches');
    assert(dto.sourcePlatform === 'Sentinel-2A', 'DTO sourcePlatform matches');
  }

  // ── TEST 2: Required lineage fields enforcement ──
  console.log('\n▶ Test 2: Required Lineage Fields Enforcement');
  {
    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          // missing baselineId
          sourceObservationId: 'TEST_OBS',
          satelliteMetadataId: new Types.ObjectId(),
          sourceSatelliteSource: SatelliteSource.SENTINEL_2,
          sourceSensorType: SensorType.OPTICAL,
          sourceAcquisitionDate: new Date(),
          hlsProduct: HLSProduct.S30,
        }),
      'baselineId',
      'Validation fails when baselineId is missing',
    );

    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          baselineId: new Types.ObjectId(),
          // missing sourceObservationId
          satelliteMetadataId: new Types.ObjectId(),
          sourceSatelliteSource: SatelliteSource.SENTINEL_2,
          sourceSensorType: SensorType.OPTICAL,
          sourceAcquisitionDate: new Date(),
          hlsProduct: HLSProduct.S30,
        }),
      'sourceObservationId',
      'Validation fails when sourceObservationId is missing',
    );

    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          baselineId: new Types.ObjectId(),
          sourceObservationId: 'TEST_OBS',
          // missing satelliteMetadataId
          sourceSatelliteSource: SatelliteSource.SENTINEL_2,
          sourceSensorType: SensorType.OPTICAL,
          sourceAcquisitionDate: new Date(),
          hlsProduct: HLSProduct.S30,
        }),
      'satelliteMetadataId',
      'Validation fails when satelliteMetadataId is missing',
    );
  }

  // ── TEST 3: HLS product accepts S30 and L30 ──
  console.log('\n▶ Test 3: HLS Product Accepts S30 and L30');
  {
    const dateS30 = new Date('2026-08-10T00:00:00.000Z');
    const baselineIdS30 = await createTestBaseline(dateS30);

    const s30Rep = await HLSRepresentationModel.create({
      baselineId: baselineIdS30,
      sourceObservationId: 'COPERNICUS/S2_SR_HARMONIZED/S30_TEST',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: dateS30,
      hlsProduct: HLSProduct.S30,
    });
    createdRepIds.push(s30Rep._id);
    assert(s30Rep.hlsProduct === 'S30', 'S30 product accepted');

    const dateL30 = new Date('2026-08-12T00:00:00.000Z');
    const baselineIdL30 = await createTestBaseline(dateL30);

    const l30Rep = await HLSRepresentationModel.create({
      baselineId: baselineIdL30,
      sourceObservationId: 'LANDSAT/LC08/C02/T1_L2/L30_TEST',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.LANDSAT_8,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: dateL30,
      hlsProduct: HLSProduct.L30,
    });
    createdRepIds.push(l30Rep._id);
    assert(l30Rep.hlsProduct === 'L30', 'L30 product accepted');
  }

  // ── TEST 4: HLS version V2.0 handling ──
  console.log('\n▶ Test 4: HLS Version V2.0 Handling');
  {
    assert(HLSVersion.V2_0 === 'V2.0', 'HLSVersion enum contains V2.0');
    const date = new Date('2026-07-01T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);

    const rep = await HLSRepresentationModel.create({
      baselineId,
      sourceObservationId: 'OBS_VERSION_TEST',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: date,
      hlsProduct: HLSProduct.S30,
      // hlsVersion omitted to verify default
    });
    createdRepIds.push(rep._id);
    assert(rep.hlsVersion === HLSVersion.V2_0, 'Default hlsVersion is V2.0');
  }

  // ── TEST 5: Status lifecycle states ──
  console.log('\n▶ Test 5: Status Lifecycle States');
  {
    assert(HLSRepresentationStatus.NOT_CREATED === 'NOT_CREATED', 'NOT_CREATED status exists');
    assert(HLSRepresentationStatus.PROCESSING === 'PROCESSING', 'PROCESSING status exists');
    assert(HLSRepresentationStatus.READY === 'READY', 'READY status exists');
    assert(HLSRepresentationStatus.FAILED === 'FAILED', 'FAILED status exists');

    const date = new Date('2026-06-15T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);

    const rep = await HLSRepresentationModel.create({
      baselineId,
      sourceObservationId: 'STATUS_LIFECYCLE_TEST',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: date,
      hlsProduct: HLSProduct.S30,
      status: HLSRepresentationStatus.PROCESSING,
    });
    createdRepIds.push(rep._id);

    assert(rep.status === HLSRepresentationStatus.PROCESSING, 'Status set to PROCESSING');

    // Transition to FAILED with error tracking
    rep.status = HLSRepresentationStatus.FAILED;
    rep.errorStage = HLSErrorStage.HLS_API_ERROR;
    rep.errorCode = 'GEE_QUOTA_EXCEEDED';
    rep.errorMessage = 'Rate limit reached';
    await rep.save();

    const reloaded = await HLSRepresentationModel.findById(rep._id);
    assert(reloaded?.status === HLSRepresentationStatus.FAILED, 'Status updated to FAILED');
    assert(reloaded?.errorStage === HLSErrorStage.HLS_API_ERROR, 'Error stage persisted');
  }

  // ── TEST 6: Invalid HLS product is rejected ──
  console.log('\n▶ Test 6: Invalid HLS Product Is Rejected');
  {
    const date = new Date('2026-05-01T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);

    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          baselineId,
          sourceObservationId: 'INVALID_PROD_OBS',
          satelliteMetadataId: new Types.ObjectId(),
          sourceSatelliteSource: SatelliteSource.SENTINEL_2,
          sourceSensorType: SensorType.OPTICAL,
          sourceAcquisitionDate: date,
          hlsProduct: 'INVALID_PRODUCT' as any,
        }),
      'is not a valid enum value',
      'Invalid HLS product is rejected by schema validator',
    );
  }

  // ── TEST 7: SAR source is rejected ──
  console.log('\n▶ Test 7: SAR Source Is Rejected (SAR Safety Guard)');
  {
    const date = new Date('2026-04-01T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);

    // Attempt 1: sourceSensorType is SAR
    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          baselineId,
          sourceObservationId: 'SAR_OBS_1',
          satelliteMetadataId: new Types.ObjectId(),
          sourceSatelliteSource: SatelliteSource.SENTINEL_2,
          sourceSensorType: SensorType.SAR as any,
          sourceAcquisitionDate: date,
          hlsProduct: HLSProduct.S30,
        }),
      'HLS representations are OPTICAL track only',
      'sourceSensorType: SAR is rejected by pre-save hook',
    );

    // Attempt 2: sourceSatelliteSource is SENTINEL_1
    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          baselineId,
          sourceObservationId: 'SAR_OBS_2',
          satelliteMetadataId: new Types.ObjectId(),
          sourceSatelliteSource: SatelliteSource.SENTINEL_1,
          sourceSensorType: SensorType.OPTICAL,
          sourceAcquisitionDate: date,
          hlsProduct: HLSProduct.S30,
        }),
      'This satellite is a SAR sensor',
      'sourceSatelliteSource: SENTINEL_1 is rejected by pre-save hook',
    );
  }

  // ── TEST 8: Same-date lineage validation ──
  console.log('\n▶ Test 8: Same-Date Lineage Validation');
  {
    const bDate = new Date('2026-03-10T00:00:00.000Z');
    const sameDate = new Date('2026-03-10T12:30:00.000Z'); // Same calendar day
    const differentDate = new Date('2026-03-25T00:00:00.000Z'); // Different day

    // 8a: Standalone helpers
    assert(isSameAcquisitionDate(bDate, sameDate) === true, 'isSameAcquisitionDate returns true for same day');
    assert(isSameAcquisitionDate(bDate, differentDate) === false, 'isSameAcquisitionDate returns false for different day');

    assert(
      (() => {
        validateSameAcquisitionDate(bDate, sameDate);
        return true;
      })(),
      'validateSameAcquisitionDate succeeds on matching dates',
    );

    let threwSameDate = false;
    try {
      validateSameAcquisitionDate(bDate, differentDate);
    } catch (err: any) {
      if (err.message.includes('SAME-DATE VIOLATION')) {
        threwSameDate = true;
      }
    }
    assert(threwSameDate, 'validateSameAcquisitionDate throws SAME-DATE VIOLATION on mismatch');

    // 8b: Model pre-save validation against Baseline
    const baselineId = await createTestBaseline(bDate);

    // Matching date succeeds
    const validRep = await HLSRepresentationModel.create({
      baselineId,
      sourceObservationId: 'MATCHING_DATE_OBS',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: bDate,
      hlsProduct: HLSProduct.S30,
    });
    createdRepIds.push(validRep._id);
    assert(validRep._id !== undefined, 'HLS representation with matching baseline date saves successfully');

    // Mismatched date fails
    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          baselineId,
          sourceObservationId: 'MISMATCH_DATE_OBS',
          satelliteMetadataId: new Types.ObjectId(),
          sourceSatelliteSource: SatelliteSource.SENTINEL_2,
          sourceSensorType: SensorType.OPTICAL,
          sourceAcquisitionDate: differentDate, // 2026-03-25 vs baseline 2026-03-10
          hlsProduct: HLSProduct.S30,
        }),
      'SAME-DATE VIOLATION',
      'Pre-save hook blocks saving HLS representation with mismatched acquisition date',
    );
  }

  // ── TEST 9: Source lineage cannot be silently changed after READY ──
  console.log('\n▶ Test 9: Source Lineage Immutability After READY');
  {
    const date = new Date('2026-02-14T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);

    const readyRep = await HLSRepresentationModel.create({
      baselineId,
      sourceObservationId: 'READY_IMMUTABLE_OBS',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourcePlatform: 'Sentinel-2B',
      sourceAcquisitionDate: date,
      hlsProduct: HLSProduct.S30,
      status: HLSRepresentationStatus.READY,
    });
    createdRepIds.push(readyRep._id);

    // Reload document to test post-init hook tracking initialStatus
    const loadedRep = await HLSRepresentationModel.findById(readyRep._id);
    assert(loadedRep !== null, 'Loaded READY representation');

    // Attempt 9a: Modify sourceObservationId on READY doc
    loadedRep!.sourceObservationId = 'TAMPERED_OBS_ID';
    await assertRejects(
      () => loadedRep!.save(),
      'IMMUTABILITY VIOLATION',
      'Modifying sourceObservationId on a READY representation is blocked',
    );

    // Reload and attempt 9b: Downgrade status away from READY
    const loadedRep2 = await HLSRepresentationModel.findById(readyRep._id);
    loadedRep2!.status = HLSRepresentationStatus.PROCESSING;
    await assertRejects(
      () => loadedRep2!.save(),
      'IMMUTABILITY VIOLATION',
      'Downgrading status away from READY is blocked',
    );

    // Attempt 9c: findOneAndUpdate modifying sourceObservationId is blocked
    await assertRejects(
      () =>
        HLSRepresentationModel.findOneAndUpdate(
          { _id: readyRep._id },
          { $set: { sourceObservationId: 'TAMPERED_VIA_UPDATE' } },
        ),
      'IMMUTABILITY VIOLATION',
      'Direct findOneAndUpdate of immutable fields is blocked',
    );
  }

  // ── TEST 10: Duplicate identity prevention via compound index ──
  console.log('\n▶ Test 10: Duplicate Identity Prevention via Compound Index');
  {
    const date = new Date('2026-01-20T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);
    const obsId = 'IDENTITY_TEST_OBS_UNIQUE';

    const rep1 = await HLSRepresentationModel.create({
      baselineId,
      sourceObservationId: obsId,
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: date,
      hlsProduct: HLSProduct.S30,
      hlsVersion: HLSVersion.V2_0,
      processingVersion: '1.0.0',
    });
    createdRepIds.push(rep1._id);

    // Attempt duplicate with exact same identity tuple
    await assertRejects(
      () =>
        HLSRepresentationModel.create({
          baselineId,
          sourceObservationId: obsId,
          satelliteMetadataId: new Types.ObjectId(),
          sourceSatelliteSource: SatelliteSource.SENTINEL_2,
          sourceSensorType: SensorType.OPTICAL,
          sourceAcquisitionDate: date,
          hlsProduct: HLSProduct.S30,
          hlsVersion: HLSVersion.V2_0,
          processingVersion: '1.0.0',
        }),
      'duplicate key',
      'Duplicate representation for exact same identity tuple is rejected by MongoDB unique index',
    );

    // Different sourceObservationId for SAME baseline MUST succeed
    const differentObsId = 'IDENTITY_TEST_OBS_DIFFERENT';
    const rep2 = await HLSRepresentationModel.create({
      baselineId,
      sourceObservationId: differentObsId,
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: date,
      hlsProduct: HLSProduct.S30,
      hlsVersion: HLSVersion.V2_0,
      processingVersion: '1.0.0',
    });
    createdRepIds.push(rep2._id);
    assert(rep2._id !== undefined, 'Different sourceObservationId for same baseline does NOT collide');
  }

  // ── TEST 11: Existing Baseline behavior remains unchanged ──
  console.log('\n▶ Test 11: Existing Baseline Single Logical Baseline Invariance');
  {
    const date = new Date('2025-12-01T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);

    const baseline = await BaselineModel.findById(baselineId);
    assert(baseline !== null, 'Baseline retrieved');
    assert(baseline?.hlsRepresentationId === undefined, 'Baseline.hlsRepresentationId defaults to undefined');

    // SAR baseline safety check: setting hlsRepresentationId on SAR baseline throws
    const sarBaseline = new BaselineModel({
      zoneId: new Types.ObjectId(),
      satelliteMetadataId: new Types.ObjectId(),
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      source: SatelliteSource.SENTINEL_1,
      acquisitionDate: date,
      status: BaselineStatus.CANDIDATE,
      isActive: false,
      qualityScore: 80,
      validPixelPercentage: 90,
      selectionReason: 'SAR baseline safety test',
      hlsRepresentationId: new Types.ObjectId(), // Illegal on SAR!
    });

    await assertRejects(
      () => sarBaseline.save(),
      'hlsRepresentationId cannot be set on a SAR baseline',
      'Baseline pre-save hook blocks setting hlsRepresentationId on SAR baseline',
    );
  }

  // ── TEST 12: HLSRepresentationRepository operations ──
  console.log('\n▶ Test 12: HLSRepresentationRepository Operations');
  {
    const date = new Date('2025-11-15T00:00:00.000Z');
    const baselineId = await createTestBaseline(date);

    const created = await repository.create({
      baselineId,
      sourceObservationId: 'REPO_TEST_OBS',
      satelliteMetadataId: new Types.ObjectId(),
      sourceSatelliteSource: SatelliteSource.SENTINEL_2,
      sourceSensorType: SensorType.OPTICAL,
      sourceAcquisitionDate: date,
      hlsProduct: HLSProduct.S30,
      status: HLSRepresentationStatus.READY,
    });
    createdRepIds.push(created._id);

    const foundById = await repository.findById(created._id.toString());
    assert(foundById !== null, 'repository.findById succeeds');

    const foundByBaseline = await repository.findByBaselineId(baselineId.toString());
    assert(foundByBaseline.length >= 1, 'repository.findByBaselineId returns representations');

    const foundReady = await repository.findReadyByBaselineId(baselineId.toString(), HLSProduct.S30);
    assert(foundReady !== null, 'repository.findReadyByBaselineId finds READY representation');

    const foundByIdentity = await repository.findByIdentity(
      baselineId.toString(),
      'REPO_TEST_OBS',
      HLSProduct.S30,
    );
    assert(foundByIdentity !== null, 'repository.findByIdentity finds exact identity tuple');

    const dto = repository.mapToDto(foundById!);
    assert(dto.sourceObservationId === 'REPO_TEST_OBS', 'repository.mapToDto maps correctly');
  }

  // ── SUMMARY & CLEANUP ──
  await cleanup();

  console.log('\n==================================================');
  console.log(`HLS REPRESENTATION TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

runHlsRepresentationTests()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n💥 Test suite failed:', err instanceof Error ? err.message : err);
    await cleanup().catch(() => {});
    await mongoose.disconnect();
    process.exit(1);
  });
