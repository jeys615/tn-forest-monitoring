/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { Zone, type IZone } from '../models/Zone.js';
import { BaselineModel, type IBaseline } from '../models/Baseline.js';
import { ChangeDetectionModel, type IChangeDetection } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { EvidenceDossierModel } from '../models/EvidenceDossier.js';
import {
  ZoneCategory,
  ZoneStatus,
  SensorType,
  SatelliteSource,
  BaselineStatus,
  MonitoringTrack,
  ChangeCalculationMethod,
  SpatialCalculationType,
  ComparisonMode,
  AlertSeverity,
  ProcessingMode,
  SpatialCalculationSource,
  CheckpointVerificationResult,
  LocationVerificationStatus,
  type GeoJSONPolygon,
  type GeoJSONMultiPolygon,
} from '@tn-forest/shared/types';

async function runSuite() {
  console.log('================================================================');
  console.log('🌐 RUNNING PHASE 12.2 DATABASE INTEGRITY & GEOSPATIAL TEST SUITE');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db!;

  // Baseline historical snapshot to ensure zero drift
  const initialCounts = {
    zones: await db.collection('zones').countDocuments(),
    baselines: await db.collection('baselines').countDocuments(),
    changeDetections: await db.collection('changedetections').countDocuments(),
    alerts: await db.collection('alerts').countDocuments(),
    satMeta: await db.collection('satellitemetadatas').countDocuments(),
    dossiers: await db.collection('evidencedossiers').countDocuments(),
  };

  console.log('Initial Database Historical Counts:', initialCounts);

  const cleanupIds: {
    checkpointLogs: Types.ObjectId[];
    zones: Types.ObjectId[];
    baselines: Types.ObjectId[];
    changeDetections: Types.ObjectId[];
  } = {
    checkpointLogs: [],
    zones: [],
    baselines: [],
    changeDetections: [],
  };

  try {
    // -------------------------------------------------------------------------
    // Gate 1: CheckpointLog 2dsphere index existence
    // -------------------------------------------------------------------------
    console.log('--- GATE 1: CheckpointLog 2dsphere Index Verification ---');
    await CheckpointLogModel.syncIndexes();
    const checkpointIndexes = await db.collection('checkpointlogs').indexes();
    const has2dsphere = checkpointIndexes.some(
      (idx) => idx.key && (idx.key as any).scannedCoordinates === '2dsphere',
    );
    assert.strictEqual(
      has2dsphere,
      true,
      'CheckpointLog collection must have a 2dsphere index on scannedCoordinates',
    );
    console.log('✅ Gate 1 Passed: CheckpointLog 2dsphere index confirmed active in MongoDB.\n');

    // -------------------------------------------------------------------------
    // Gate 2: CheckpointLog valid GeoJSON Point acceptance
    // -------------------------------------------------------------------------
    console.log('--- GATE 2: CheckpointLog Valid GeoJSON Point Persistence ---');
    const validLog = await CheckpointLogModel.create({
      logId: `P12-LOG-VALID-${Date.now()}`,
      checkpointId: new Types.ObjectId(),
      checkpointName: 'P12 Validation Checkpoint',
      passNumber: 'EPASS-P12-001',
      verificationResult: CheckpointVerificationResult.VALID,
      signatureVerified: true,
      hashVerified: true,
      locationStatus: LocationVerificationStatus.VERIFIED_LOCATION,
      scannedCoordinates: {
        type: 'Point',
        coordinates: [78.146, 11.6643], // [lng, lat] Salem, TN
      },
    });
    cleanupIds.checkpointLogs.push(validLog._id as Types.ObjectId);

    const retrievedLog = await CheckpointLogModel.findById(validLog._id);
    assert.ok(retrievedLog, 'Saved checkpoint log must be retrievable');
    assert.strictEqual(retrievedLog?.scannedCoordinates?.type, 'Point');
    assert.strictEqual(retrievedLog?.scannedCoordinates?.coordinates[0], 78.146);
    assert.strictEqual(retrievedLog?.scannedCoordinates?.coordinates[1], 11.6643);
    console.log('✅ Gate 2 Passed: CheckpointLog valid GeoJSON point persisted and retrieved.\n');

    // -------------------------------------------------------------------------
    // Gate 3: CheckpointLog invalid coordinate rejection
    // -------------------------------------------------------------------------
    console.log('--- GATE 3: CheckpointLog Out-of-Bounds Coordinate Rejection ---');
    const invalidCoords = [
      { coords: [78.0, 95.0], desc: 'Latitude > 90' },
      { coords: [78.0, -95.0], desc: 'Latitude < -90' },
      { coords: [185.0, 11.0], desc: 'Longitude > 180' },
      { coords: [-185.0, 11.0], desc: 'Longitude < -180' },
      { coords: [NaN, 11.0], desc: 'NaN coordinate' },
      { coords: [78.0], desc: 'Missing latitude' },
    ];

    for (const testCase of invalidCoords) {
      let threw = false;
      try {
        const invalidLog = new CheckpointLogModel({
          logId: `P12-LOG-INV-${Math.random()}`,
          checkpointId: new Types.ObjectId(),
          checkpointName: 'P12 Invalid Checkpoint',
          passNumber: 'EPASS-P12-INV',
          verificationResult: CheckpointVerificationResult.INVALID,
          signatureVerified: false,
          hashVerified: false,
          locationStatus: LocationVerificationStatus.OUTSIDE_CHECKPOINT_GEOFENCE,
          scannedCoordinates: {
            type: 'Point',
            coordinates: testCase.coords,
          },
        });
        await invalidLog.save();
        cleanupIds.checkpointLogs.push(invalidLog._id as Types.ObjectId);
      } catch (err: any) {
        threw = true;
        assert.ok(
          err.name === 'ValidationError' || err.message.includes('scannedCoordinates'),
          `Expected ValidationError for ${testCase.desc}, got: ${err.message}`,
        );
      }
      assert.strictEqual(threw, true, `Must reject coordinate: ${testCase.desc}`);
    }
    console.log('✅ Gate 3 Passed: All invalid GeoJSON coordinates strictly rejected by schema validator.\n');

    // -------------------------------------------------------------------------
    // Gate 4: Zone Polygon boundary persistence
    // -------------------------------------------------------------------------
    console.log('--- GATE 4: Zone Polygon Boundary Persistence ---');
    const validPolygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [78.0, 11.0],
          [78.1, 11.0],
          [78.1, 11.1],
          [78.0, 11.1],
          [78.0, 11.0],
        ],
      ],
    };

    const polyZone = await Zone.create({
      zoneId: `P12-ZONE-POLY-${Date.now()}`,
      name: 'P12 Polygon Protected Reserve',
      category: ZoneCategory.RESERVED_AREA,
      status: ZoneStatus.PROTECTED,
      boundary: validPolygon,
      centerPoint: {
        type: 'Point',
        coordinates: [78.05, 11.05],
      },
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
      createdBy: new Types.ObjectId(),
    });
    cleanupIds.zones.push(polyZone._id as Types.ObjectId);

    const retrievedPolyZone = await Zone.findById(polyZone._id);
    assert.ok(retrievedPolyZone, 'Polygon Zone must be retrievable');
    assert.strictEqual(retrievedPolyZone?.boundary.type, 'Polygon');
    assert.strictEqual((retrievedPolyZone?.boundary.coordinates as [number, number][][]).length, 1);
    console.log('✅ Gate 4 Passed: Zone Polygon boundary saved and retrieved with full fidelity.\n');

    // -------------------------------------------------------------------------
    // Gate 5: Zone MultiPolygon boundary persistence
    // -------------------------------------------------------------------------
    console.log('--- GATE 5: Zone MultiPolygon Boundary Persistence ---');
    const validMultiPolygon: GeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [78.0, 11.0],
            [78.1, 11.0],
            [78.1, 11.1],
            [78.0, 11.1],
            [78.0, 11.0],
          ],
        ],
        [
          [
            [78.2, 11.2],
            [78.3, 11.2],
            [78.3, 11.3],
            [78.2, 11.3],
            [78.2, 11.2],
          ],
        ],
      ],
    };

    const multiZone = await Zone.create({
      zoneId: `P12-ZONE-MULTI-${Date.now()}`,
      name: 'P12 MultiPolygon Forest Complex',
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      boundary: validMultiPolygon,
      centerPoint: {
        type: 'Point',
        coordinates: [78.15, 11.15],
      },
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
      createdBy: new Types.ObjectId(),
    });
    cleanupIds.zones.push(multiZone._id as Types.ObjectId);

    const retrievedMultiZone = await Zone.findById(multiZone._id);
    assert.ok(retrievedMultiZone, 'MultiPolygon Zone must be retrievable');
    assert.strictEqual(retrievedMultiZone?.boundary.type, 'MultiPolygon');
    assert.strictEqual((retrievedMultiZone?.boundary.coordinates as [number, number][][][]).length, 2);
    console.log('✅ Gate 5 Passed: Zone MultiPolygon boundary saved with disjoint polygon sectors.\n');

    // -------------------------------------------------------------------------
    // Gate 6: Zone malformed geometry rejection
    // -------------------------------------------------------------------------
    console.log('--- GATE 6: Zone Malformed Geometry Rejection ---');
    const malformedGeometries = [
      {
        desc: 'Unclosed Polygon linear ring',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [78.0, 11.0],
              [78.1, 11.0],
              [78.1, 11.1],
              [78.0, 11.1], // missing closing [78.0, 11.0]
            ],
          ],
        },
      },
      {
        desc: 'Polygon ring with fewer than 4 points',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [78.0, 11.0],
              [78.1, 11.0],
              [78.0, 11.0],
            ],
          ],
        },
      },
      {
        desc: 'MultiPolygon with unclosed island',
        boundary: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [78.0, 11.0],
                [78.1, 11.0],
                [78.1, 11.1],
                [78.0, 11.2], // unclosed (first point was [78.0, 11.0])
              ],
            ],
          ],
        },
      },
      {
        desc: 'Out of bounds coordinates',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [190.0, 11.0],
              [190.1, 11.0],
              [190.1, 11.1],
              [190.0, 11.1],
              [190.0, 11.0],
            ],
          ],
        },
      },
    ];

    for (const mg of malformedGeometries) {
      let threw = false;
      try {
        const invalidZone = new Zone({
          zoneId: `P12-INV-${Math.random()}`,
          name: 'Invalid Test Zone',
          category: ZoneCategory.RESERVED_AREA,
          status: ZoneStatus.PROTECTED,
          boundary: mg.boundary,
          centerPoint: { type: 'Point', coordinates: [78.0, 11.0] },
          monitoringTracks: { optical: { enabled: true }, sar: { enabled: false } },
          createdBy: new Types.ObjectId(),
        });
        await invalidZone.save();
        cleanupIds.zones.push(invalidZone._id as Types.ObjectId);
      } catch (err: any) {
        threw = true;
        assert.ok(
          err.name === 'ValidationError' || err.message.includes('boundary'),
          `Expected ValidationError for ${mg.desc}, got: ${err.message}`,
        );
      }
      assert.strictEqual(threw, true, `Must reject malformed boundary: ${mg.desc}`);
    }
    console.log('✅ Gate 6 Passed: All malformed Polygon and MultiPolygon geometries rejected.\n');

    // -------------------------------------------------------------------------
    // Gate 7: Zone toZoneDto() preserves Polygon boundary
    // -------------------------------------------------------------------------
    console.log('--- GATE 7: Zone toZoneDto() Serialization (Polygon) ---');
    const polyDto = polyZone.toZoneDto();
    assert.strictEqual(polyDto.boundary.type, 'Polygon');
    assert.deepStrictEqual(polyDto.boundary.coordinates, validPolygon.coordinates);
    console.log('✅ Gate 7 Passed: toZoneDto() serialization preserves Polygon boundary identically.\n');

    // -------------------------------------------------------------------------
    // Gate 8: Zone toZoneDto() preserves MultiPolygon boundary
    // -------------------------------------------------------------------------
    console.log('--- GATE 8: Zone toZoneDto() Serialization (MultiPolygon) ---');
    const multiDto = multiZone.toZoneDto();
    assert.strictEqual(multiDto.boundary.type, 'MultiPolygon');
    assert.deepStrictEqual(multiDto.boundary.coordinates, validMultiPolygon.coordinates);
    console.log('✅ Gate 8 Passed: toZoneDto() serialization preserves MultiPolygon boundary identically.\n');

    // -------------------------------------------------------------------------
    // Gate 9: Baseline creation works
    // -------------------------------------------------------------------------
    console.log('--- GATE 9: Baseline Normal Creation ---');
    const testSatMeta = await SatelliteMetadata.create({
      imageId: `P12-S2-${Date.now()}`,
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2024-03-01T10:00:00.000Z'),
      cloudCover: 1.2,
      footprint: validPolygon,
      bandsAvailable: ['B02', 'B03', 'B04', 'B08'],
      storagePath: '/data/imagery/p12-test-s2.tif',
      rasterValidated: true,
      rasterCrs: 'EPSG:32644',
      rasterTransform: [10, 0, 780000, 0, -10, 1200000],
      rasterWidth: 100,
      rasterHeight: 100,
      rasterBandCount: 4,
      fileSizeBytes: 80000,
      geeReference: 'COPERNICUS/S2_SR/P12_TEST',
    });
    // Add satMeta to cleanups
    const satMetaId = testSatMeta._id as Types.ObjectId;

    const testBaseline = await BaselineModel.create({
      zoneId: polyZone._id,
      satelliteMetadataId: satMetaId,
      imageId: testSatMeta.imageId,
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      acquisitionDate: new Date('2024-03-01T10:00:00.000Z'),
      status: BaselineStatus.CANDIDATE,
      isActive: false,
      qualityScore: 95.5,
      cloudCover: 1.2,
      validPixelPercentage: 99.8,
      selectionReason: 'Phase 12.2 Immutability Test Baseline',
    });
    cleanupIds.baselines.push(testBaseline._id as Types.ObjectId);

    assert.ok(testBaseline._id, 'Baseline must be created');
    assert.strictEqual(testBaseline.status, BaselineStatus.CANDIDATE);
    assert.strictEqual(testBaseline.isActive, false);
    console.log('✅ Gate 9 Passed: Baseline created successfully.\n');

    // -------------------------------------------------------------------------
    // Gate 10: Baseline lifecycle update allowed
    // -------------------------------------------------------------------------
    console.log('--- GATE 10: Baseline Lifecycle Transitions Allowed ---');
    testBaseline.isActive = true;
    testBaseline.status = BaselineStatus.ACTIVE;
    testBaseline.selectionReason = 'Phase 12.2 Lifecycle Activated Baseline';
    await testBaseline.save();

    const refreshedBaseline = await BaselineModel.findById(testBaseline._id);
    assert.strictEqual(refreshedBaseline?.isActive, true);
    assert.strictEqual(refreshedBaseline?.status, BaselineStatus.ACTIVE);
    assert.strictEqual(refreshedBaseline?.selectionReason, 'Phase 12.2 Lifecycle Activated Baseline');
    console.log('✅ Gate 10 Passed: Baseline lifecycle field modifications (isActive, status, reason) succeed.\n');

    // -------------------------------------------------------------------------
    // Gate 11: Baseline scientific immutability on save()
    // -------------------------------------------------------------------------
    console.log('--- GATE 11: Baseline Scientific Immutability on save() ---');
    let saveMutationThrew = false;
    try {
      testBaseline.acquisitionDate = new Date('2025-01-01T00:00:00.000Z');
      await testBaseline.save();
    } catch (err: any) {
      saveMutationThrew = true;
      assert.ok(
        err.message.includes('strictly immutable'),
        `Expected immutability error, got: ${err.message}`,
      );
    }
    assert.strictEqual(saveMutationThrew, true, 'Mutating acquisitionDate on Baseline save() must throw');

    // Reset memory state
    const cleanBaseline = await BaselineModel.findById(testBaseline._id);

    let sensorMutationThrew = false;
    try {
      cleanBaseline!.sensorType = SensorType.SAR;
      await cleanBaseline!.save();
    } catch (err: any) {
      sensorMutationThrew = true;
      assert.ok(
        err.message.includes('strictly immutable'),
        `Expected immutability error, got: ${err.message}`,
      );
    }
    assert.strictEqual(sensorMutationThrew, true, 'Mutating sensorType on Baseline save() must throw');
    console.log('✅ Gate 11 Passed: Baseline save() strictly rejects scientific identity mutations.\n');

    // -------------------------------------------------------------------------
    // Gate 12: Baseline scientific immutability on updateOne() and findOneAndUpdate()
    // -------------------------------------------------------------------------
    console.log('--- GATE 12: Baseline Scientific Immutability on Query Updates ---');
    let updateOneThrew = false;
    try {
      await BaselineModel.updateOne(
        { _id: testBaseline._id },
        { $set: { qualityScore: 50.0 } },
      );
    } catch (err: any) {
      updateOneThrew = true;
      assert.ok(
        err.message.includes('strictly immutable'),
        `Expected immutability error on updateOne, got: ${err.message}`,
      );
    }
    assert.strictEqual(updateOneThrew, true, 'Baseline updateOne() mutating qualityScore must throw');

    let findOneAndUpdateThrew = false;
    try {
      await BaselineModel.findOneAndUpdate(
        { _id: testBaseline._id },
        { $set: { imageId: 'TAMPERED-IMAGE-ID' } },
      );
    } catch (err: any) {
      findOneAndUpdateThrew = true;
      assert.ok(
        err.message.includes('strictly immutable'),
        `Expected immutability error on findOneAndUpdate, got: ${err.message}`,
      );
    }
    assert.strictEqual(findOneAndUpdateThrew, true, 'Baseline findOneAndUpdate() mutating imageId must throw');
    console.log('✅ Gate 12 Passed: Baseline query middleware strictly rejects unauthorized mutations.\n');

    // -------------------------------------------------------------------------
    // Gate 13: ChangeDetection creation works
    // -------------------------------------------------------------------------
    console.log('--- GATE 13: ChangeDetection Normal Creation ---');
    const testChange = await ChangeDetectionModel.create({
      changeId: `CD-P12-${Date.now()}`,
      zoneId: polyZone._id,
      observationId: satMetaId,
      baselineId: testBaseline._id,
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      source: SatelliteSource.SENTINEL_2,
      detectedAt: new Date(),
      zoneArea: 100,
      changedArea: 5.5,
      affectedAreaPercentage: 5.5,
      calculationMode: ProcessingMode.SIMULATED,
      spatialSource: SpatialCalculationSource.SIMULATION,
      calculationMethod: ChangeCalculationMethod.OPTICAL_PIXEL_DIFFERENCE,
      spatialCalculation: SpatialCalculationType.PIXEL_GRID,
      comparisonMode: ComparisonMode.NATIVE,
      hlsVersion: '1.0',
      processingVersion: '12.2',
      changedGeometry: validPolygon,
      threshold2Crossed: true,
      threshold5Crossed: true,
      threshold10Crossed: false,
      highestThresholdCrossed: 5,
      severity: AlertSeverity.HIGH,
      evidenceStrength: 88,
      evidenceBreakdown: {
        magnitudeScore: 88,
        dataQualityScore: 90,
        temporalConsistencyScore: 85,
        crossSensorScore: 80,
        totalEvidenceScore: 88,
        explanation: 'Phase 12.2 evidence breakdown explanation',
      },
      categories: [],
      changeIndicators: {
        ndviDeltaMean: -0.22,
        ndviDeltaStd: 0.05,
      },
      crossSensorAgreement: 'SINGLE_SENSOR',
      temporalConsistency: 'HIGH',
      explanation: 'Phase 12.2 Immutability Test Change Detection',
      alertGenerated: false,
    });
    cleanupIds.changeDetections.push(testChange._id as Types.ObjectId);

    assert.ok(testChange._id, 'ChangeDetection must be created');
    assert.strictEqual(testChange.changedArea, 5.5);
    assert.strictEqual(testChange.affectedAreaPercentage, 5.5);
    console.log('✅ Gate 13 Passed: ChangeDetection created successfully with scientific measurements.\n');

    // -------------------------------------------------------------------------
    // Gate 14: ChangeDetection scientific measurement immutability on save()
    // -------------------------------------------------------------------------
    console.log('--- GATE 14: ChangeDetection Scientific Immutability on save() ---');
    let cdSaveThrew = false;
    try {
      testChange.changedArea = 1.0; // Tamper attempt
      await testChange.save();
    } catch (err: any) {
      cdSaveThrew = true;
      assert.ok(
        err.message.includes('strictly immutable'),
        `Expected immutability error on changedArea, got: ${err.message}`,
      );
    }
    assert.strictEqual(cdSaveThrew, true, 'Mutating changedArea on ChangeDetection save() must throw');

    // Reset memory state
    const cleanChange = await ChangeDetectionModel.findById(testChange._id);
    let cdPctThrew = false;
    try {
      cleanChange!.affectedAreaPercentage = 1.0; // Tamper attempt
      await cleanChange!.save();
    } catch (err: any) {
      cdPctThrew = true;
      assert.ok(
        err.message.includes('strictly immutable'),
        `Expected immutability error on affectedAreaPercentage, got: ${err.message}`,
      );
    }
    assert.strictEqual(cdPctThrew, true, 'Mutating affectedAreaPercentage on ChangeDetection save() must throw');
    console.log('✅ Gate 14 Passed: ChangeDetection save() strictly rejects scientific measurement mutations.\n');

    // -------------------------------------------------------------------------
    // Gate 15: ChangeDetection scientific immutability on Query Updates + Lifecycle updates allowed
    // -------------------------------------------------------------------------
    console.log('--- GATE 15: ChangeDetection Immutability & Lifecycle Update Verification ---');
    let cdQueryTamperThrew = false;
    try {
      await ChangeDetectionModel.updateOne(
        { _id: testChange._id },
        { $set: { evidenceStrength: 10 } }, // Tamper attempt
      );
    } catch (err: any) {
      cdQueryTamperThrew = true;
      assert.ok(
        err.message.includes('strictly immutable'),
        `Expected immutability error on evidenceStrength, got: ${err.message}`,
      );
    }
    assert.strictEqual(cdQueryTamperThrew, true, 'ChangeDetection updateOne() mutating evidenceStrength must throw');

    // Allowed lifecycle updates must succeed
    const fakeAlertId = new Types.ObjectId();
    await ChangeDetectionModel.updateOne(
      { _id: testChange._id },
      {
        $set: {
          alertGenerated: true,
          alertId: fakeAlertId,
          severity: AlertSeverity.LOW,
          auditStatus: 'AUDITED_AND_SEALED',
        },
      },
    );

    const updatedCd = await ChangeDetectionModel.findById(testChange._id);
    assert.strictEqual(updatedCd?.alertGenerated, true);
    assert.strictEqual(updatedCd?.alertId?.toString(), fakeAlertId.toString());
    assert.strictEqual(updatedCd?.severity, AlertSeverity.LOW);
    assert.strictEqual(updatedCd?.auditStatus, 'AUDITED_AND_SEALED');
    console.log('✅ Gate 15 Passed: ChangeDetection queries strictly protect measurements while allowing alert lifecycle updates.\n');

    // -------------------------------------------------------------------------
    // Gate 16: Zero drift in historical records
    // -------------------------------------------------------------------------
    console.log('--- GATE 16: Zero Drift in Historical Records Verification ---');
    // First remove all test data created during this suite
    for (const id of cleanupIds.checkpointLogs) {
      await CheckpointLogModel.findByIdAndDelete(id);
    }
    for (const id of cleanupIds.changeDetections) {
      await ChangeDetectionModel.findByIdAndDelete(id);
    }
    for (const id of cleanupIds.baselines) {
      await BaselineModel.findByIdAndDelete(id);
    }
    for (const id of cleanupIds.zones) {
      await Zone.findByIdAndDelete(id);
    }
    await SatelliteMetadata.findByIdAndDelete(satMetaId);

    const finalCounts = {
      zones: await db.collection('zones').countDocuments(),
      baselines: await db.collection('baselines').countDocuments(),
      changeDetections: await db.collection('changedetections').countDocuments(),
      alerts: await db.collection('alerts').countDocuments(),
      satMeta: await db.collection('satellitemetadatas').countDocuments(),
      dossiers: await db.collection('evidencedossiers').countDocuments(),
    };

    console.log('Final Database Historical Counts:', finalCounts);

    assert.strictEqual(finalCounts.baselines, initialCounts.baselines, 'Baseline count must remain unchanged');
    assert.strictEqual(finalCounts.changeDetections, initialCounts.changeDetections, 'ChangeDetection count must remain unchanged');
    assert.strictEqual(finalCounts.alerts, initialCounts.alerts, 'Alert count must remain unchanged');
    assert.strictEqual(finalCounts.satMeta, initialCounts.satMeta, 'SatelliteMetadata count must remain unchanged');
    assert.strictEqual(finalCounts.dossiers, initialCounts.dossiers, 'EvidenceDossier count must remain unchanged');
    assert.strictEqual(finalCounts.zones, initialCounts.zones, 'Zone count must remain unchanged');

    console.log('✅ Gate 16 Passed: Historical scientific records completely preserved with ZERO DRIFT.\n');

    console.log('================================================================');
    console.log('🎉 ALL 16 GATES IN PHASE 12.2 INTEGRITY SUITE PASSED');
    console.log('================================================================');
  } catch (err) {
    // Cleanup on failure
    for (const id of cleanupIds.checkpointLogs) {
      await CheckpointLogModel.findByIdAndDelete(id).catch(() => {});
    }
    for (const id of cleanupIds.changeDetections) {
      await ChangeDetectionModel.findByIdAndDelete(id).catch(() => {});
    }
    for (const id of cleanupIds.baselines) {
      await BaselineModel.findByIdAndDelete(id).catch(() => {});
    }
    for (const id of cleanupIds.zones) {
      await Zone.findByIdAndDelete(id).catch(() => {});
    }
    await SatelliteMetadata.deleteMany({ imageId: { $regex: /^P12-S2-/ } }).catch(() => {});
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

runSuite().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
