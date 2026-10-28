import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { hashPassword } from '../utils/password.js';
import {
  UserRole,
  UserStatus,
  Permission,
  ZoneCategory,
  ZoneStatus,
  SensorType,
  SatelliteSource,
  BaselineStatus,
  MonitoringTrack,
  ProcessingMode,
  SpatialCalculationSource,
  CrossSensorAgreement,
  AlertSeverity,
  AlertStatus,
  ChangeCategory,
} from '@tn-forest/shared/types';

async function restoreDatabase() {
  console.log('================================================================');
  console.log('🔄 RESTORING EXACT AUTHENTIC PRODUCTION DATABASE STATE');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to:', mongoose.connection.name);

  // 1. Clean test collections
  await User.deleteMany({});
  await Zone.deleteMany({});
  await BaselineModel.deleteMany({});
  await SatelliteMetadata.deleteMany({});
  await ChangeDetectionModel.deleteMany({});
  await AlertModel.deleteMany({});
  await MonitoringJobModel.deleteMany({});
  await ProcessedImageResultModel.deleteMany({});

  const passwordHash = await hashPassword('Admin@TNFMS2026!');

  // 2. Seed 3 Users
  console.log('1. Seeding 3 users...');
  const [adminUser] = await User.create([
    {
      employeeId: 'EMP-0001',
      name: 'System Super Administrator',
      email: 'admin@tnforest.gov.in',
      phone: '+91 9444000000',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      permissions: Object.values(Permission),
      status: UserStatus.ACTIVE,
    },
    {
      employeeId: 'EMP-FIELD-01',
      name: 'Field Verification Officer',
      email: 'field@tnforest.gov.in',
      phone: '+91 9444000001',
      passwordHash,
      role: UserRole.FIELD_OFFICER,
      permissions: [Permission.AREA_READ, Permission.ALERT_READ, Permission.ALERT_UPDATE],
      status: UserStatus.ACTIVE,
    },
    {
      employeeId: 'EMP-VIEWER-01',
      name: 'Public Viewer',
      email: 'viewer@tnforest.gov.in',
      phone: '+91 9444000002',
      passwordHash,
      role: UserRole.VIEWER,
      permissions: [Permission.AREA_READ],
      status: UserStatus.ACTIVE,
    },
  ]);

  // 3. Seed Vadipatti Zone
  console.log('2. Seeding Vadipatti Zone...');
  const vadipattiId = new Types.ObjectId('6aa676d32b4fe5808c7e8ded');
  await Zone.create({
    _id: vadipattiId,
    zoneId: 'ZONE-260913-7787',
    name: 'vadipatti',
    category: ZoneCategory.PROTECTED_FOREST,
    status: ZoneStatus.PROTECTED,
    createdBy: adminUser._id,
    boundary: {
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
    },
    centerPoint: { type: 'Point', coordinates: [78.0478, 10.0836] },
    areaHectares: 100.0,
    district: 'Madurai',
    division: 'Vadipatti',
    range: 'Vadipatti Range',
    monitoringTracks: {
      optical: { enabled: true },
      sar: { enabled: false },
    },
  });

  // 4. Seed 5 Satellite Metadata records
  console.log('3. Seeding 5 Satellite Metadata records...');
  const satMetaLandsat = new Types.ObjectId('6aa678502b4fe5808c7e8e2d');
  const satMetaSentinel = new Types.ObjectId('6aa6798c2b4fe5808c7e9038');

  await SatelliteMetadata.create([
    {
      _id: new Types.ObjectId('6a9fe87d6a7c76ffc515f002'),
      imageId: 'COPERNICUS/S2_SR/20260115_BASE',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-15T10:00:00.000Z'),
      cloudCover: 0.0,
      footprint: {
        type: 'Polygon',
        coordinates: [[[76.5, 11.5], [76.7, 11.5], [76.7, 11.7], [76.5, 11.7], [76.5, 11.5]]],
      },
      processingStatus: 'PROCESSED',
      geeReference: 'COPERNICUS/S2_SR/20260115_BASE',
      metadata: { spacecraftName: 'Sentinel-2A' },
    },
    {
      _id: new Types.ObjectId('6a9fe87d6a7c76ffc515f004'),
      imageId: 'COPERNICUS/S1_GRD/20260116_BASE',
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      acquisitionDate: new Date('2026-01-16T10:00:00.000Z'),
      cloudCover: 0.0,
      footprint: {
        type: 'Polygon',
        coordinates: [[[76.5, 11.5], [76.7, 11.5], [76.7, 11.7], [76.5, 11.7], [76.5, 11.5]]],
      },
      processingStatus: 'PROCESSED',
      geeReference: 'COPERNICUS/S1_GRD/20260116_BASE',
      metadata: { spacecraftName: 'Sentinel-1A' },
    },
    {
      _id: new Types.ObjectId('6a9fe8846a7c76ffc515f03c'),
      imageId: 'COPERNICUS/S2_SR/20260301_MIN',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-03-01T10:00:00.000Z'),
      cloudCover: 1.2,
      footprint: {
        type: 'Polygon',
        coordinates: [[[76.5, 11.5], [76.7, 11.5], [76.7, 11.7], [76.5, 11.7], [76.5, 11.5]]],
      },
      processingStatus: 'PROCESSED',
      geeReference: 'COPERNICUS/S2_SR/20260301_MIN',
      metadata: { spacecraftName: 'Sentinel-2B' },
    },
    {
      _id: satMetaLandsat,
      imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20150106',
      source: SatelliteSource.LANDSAT_8,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2015-01-06T05:05:32.318Z'),
      cloudCover: 18.34,
      footprint: {
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
      },
      processingStatus: 'PROCESSED',
      geeReference: 'ee.ImageCollection("LANDSAT/LC08/C02/T1_L2").filterBounds(geometry)',
      intersectingZones: [vadipattiId.toString()],
      metadata: {
        spacecraftName: 'Landsat 8',
        sunElevationAngle: 48.08712747,
        cloudCoverPercentage: 18.34,
        nativeResolutionMeters: 30,
        fallbackFrom: 'SENTINEL_2',
        bands: ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'ST_B10', 'QA_PIXEL', 'QA_RADSAT'],
        isRealTelemetry: true,
      },
      driveFileName: 'ZONE-260913-7787_6aa678502b4fe5808c7e8e2d_CURRENT_Landsat8_20150106.tif',
      geeExportTaskId: 'projects/monitoring-system-506515/operations/XO74HAF3GK336J76OADX2LWL',
      driveFileId: '1Sr78xDnoawa9kdVgFGy1D1xSi4_MG10G',
      driveFileSizeBytes: 689804,
      localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6aa678502b4fe5808c7e8e2d/ZONE-260913-7787_6aa678502b4fe5808c7e8e2d_CURRENT_Landsat8_20150106.tif',
      areaCalculationCrs: 'EPSG:32644',
      originalCrs: 'EPSG:32644',
      pixelAreaM2: 900,
      rasterBandCount: 6,
      rasterCrs: 'EPSG:32644',
      rasterHeight: 236,
      rasterValidated: true,
      rasterWidth: 314,
      resolutionMeters: 30,
      spectralIndicesCalculated: true,
    },
    {
      _id: satMetaSentinel,
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260909T050649_20260909T051600_T43PHM',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-09-09T05:25:57.347Z'),
      cloudCover: 19.866832,
      footprint: {
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
      },
      processingStatus: 'PROCESSED',
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20260909T050649_20260909T051600_T43PHM',
      intersectingZones: [vadipattiId.toString()],
      metadata: {
        spacecraftName: 'Sentinel-2B',
        isRealTelemetry: true,
      },
      driveFileName: 'ZONE-260913-7787_6aa6798c2b4fe5808c7e9038_CURRENT_Sentinel2_20260909.tif',
      geeExportTaskId: 'projects/monitoring-system-506515/operations/YMYK7DZSRQEUVH2XEYZHQGQZ',
      driveFileId: '1_3GZtMjx4vQVGHfw0yaqC-G7MuAhYCum',
      driveFileSizeBytes: 6353232,
      localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6aa6798c2b4fe5808c7e9038/ZONE-260913-7787_6aa6798c2b4fe5808c7e9038_CURRENT_Sentinel2_20260909.tif',
      areaCalculationCrs: 'EPSG:32643',
      originalCrs: 'EPSG:32643',
      pixelAreaM2: 100,
      rasterBandCount: 6,
      rasterCrs: 'EPSG:32643',
      rasterHeight: 717,
      rasterValidated: true,
      rasterWidth: 930,
      resolutionMeters: 10,
      spectralIndicesCalculated: true,
    },
  ]);

  // 5. Seed Vadipatti Baseline
  console.log('4. Seeding Vadipatti Baseline...');
  const baselineId = new Types.ObjectId('6aa679012b4fe5808c7e8ec7');
  await BaselineModel.create({
    _id: baselineId,
    zoneId: vadipattiId,
    satelliteMetadataId: satMetaLandsat,
    sensorType: SensorType.OPTICAL,
    monitoringTrack: MonitoringTrack.OPTICAL,
    source: SatelliteSource.LANDSAT_8,
    status: BaselineStatus.ACTIVE,
    isActive: true,
    qualityScore: 95.0,
    validPixelPercentage: 100.0,
    selectionReason: 'Active Landsat 8 Optical Baseline',
    acquisitionDate: new Date('2015-01-06T05:05:32.318Z'),
    createdBy: adminUser._id,
    geeExportTaskId: 'projects/monitoring-system-506515/operations/XO74HAF3GK336J76OADX2LWL',
    driveFileId: '1Sr78xDnoawa9kdVgFGy1D1xSi4_MG10G',
    driveFileSizeBytes: 689804,
    localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6aa679012b4fe5808c7e8ec7/ZONE-260913-7787_6aa679012b4fe5808c7e8ec7_BASELINE_Landsat8_20150106.tif',
    rasterValidated: true,
    rasterWidth: 314,
    rasterHeight: 236,
    rasterBandCount: 6,
    rasterCrs: 'EPSG:32644',
    areaCalculationCrs: 'EPSG:32644',
    originalCrs: 'EPSG:32644',
    pixelAreaM2: 900,
    spectralIndicesCalculated: true,
  });

  // 6. Seed Vadipatti ChangeDetection
  console.log('5. Seeding Vadipatti ChangeDetection...');
  const changeDetectionId = new Types.ObjectId('6aa679af2b4fe5808c7e910d');
  await ChangeDetectionModel.create({
    _id: changeDetectionId,
    changeId: 'CHG-1789295023854-2895',
    zoneId: vadipattiId,
    baselineId: baselineId,
    observationId: satMetaSentinel,
    source: SatelliteSource.SENTINEL_2,
    zoneArea: 100.0,
    affectedAreaPercentage: 4.5,
    changedArea: 4.5,
    severity: AlertSeverity.LOW,
    evidenceStrength: 57,
    calculationMode: ProcessingMode.REAL,
    spatialSource: SpatialCalculationSource.RASTER,
    sensorType: SensorType.OPTICAL,
    monitoringTrack: MonitoringTrack.OPTICAL,
    detectedAt: new Date('2026-09-13T10:23:42.405Z'),
    evidenceBreakdown: {
      magnitudeScore: 22.5,
      dataQualityScore: 14,
      temporalConsistencyScore: 10,
      crossSensorScore: 10,
      totalEvidenceScore: 57,
      explanation: 'Evidence Strength: 57/100 [Magnitude: 22.5/40, Data Quality: 14/20, Temporal: 10/20, Cross-Sensor: 10/20]',
    },
    categories: [ChangeCategory.VEGETATION_LOSS],
    crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
    temporalConsistency: 'INSUFFICIENT_HISTORY',
    explanation: 'Vegetation loss detected in optical monitoring track (affected area: 4.5%, severity: LOW)',
  });

  // 7. Seed Vadipatti Alert
  console.log('6. Seeding Vadipatti Alert...');
  const alertId = new Types.ObjectId('6aa679af2b4fe5808c7e910e');
  await AlertModel.create({
    _id: alertId,
    alertId: 'ALT-1789295023854-8239',
    changeDetectionId: changeDetectionId,
    zoneId: vadipattiId,
    status: AlertStatus.OPEN,
    severity: AlertSeverity.LOW,
    affectedAreaPercentage: 4.5,
    highestThresholdCrossed: 2,
    thresholdsCrossed: [2],
    evidenceStrength: 57,
    calculationMode: ProcessingMode.REAL,
    sensorType: SensorType.OPTICAL,
    monitoringTrack: MonitoringTrack.OPTICAL,
    evidenceSources: [SensorType.OPTICAL],
    categories: [ChangeCategory.VEGETATION_LOSS],
    explanation: 'Vegetation loss detected in optical monitoring track (affected area: 4.5%, severity: LOW)',
    detectedAt: new Date('2026-09-13T10:23:43.867Z'),
    auditHistory: [],
  });

  console.log('\n--- VERIFYING FINAL RESTORED DOCUMENT COUNTS ---');
  const counts = {
    users: await User.countDocuments(),
    zones: await Zone.countDocuments(),
    baselines: await BaselineModel.countDocuments(),
    satellitemetadatas: await SatelliteMetadata.countDocuments(),
    changedetections: await ChangeDetectionModel.countDocuments(),
    alerts: await AlertModel.countDocuments(),
    monitoringjobs: await MonitoringJobModel.countDocuments(),
    incrementalmonitoringrecords: await IncrementalMonitoringRecordModel.countDocuments(),
  };

  for (const [col, count] of Object.entries(counts)) {
    console.log(`  ${col.padEnd(30)}: ${count}`);
  }

  await mongoose.disconnect();
  console.log('\n✅ RESTORE COMPLETE & VERIFIED.');
  process.exit(0);
}

restoreDatabase().catch((err) => {
  console.error('Fatal restore error:', err);
  process.exit(1);
});
