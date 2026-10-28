import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import {
  SatelliteSource,
  SensorType,
  SatelliteProcessingStatus,
  BaselineStatus,
  MonitoringTrack,
} from '@tn-forest/shared/types';

async function repair() {
  console.log('================================================================');
  console.log('🛠️ TARGETED REPAIR: SIRUMALAI SAR BASELINE DATA LINEAGE');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to database:', mongoose.connection.name);

  // 1. Snapshot counts before repair
  console.log('\n--- 1. BEFORE COUNTS ---');
  const collections = [
    'users',
    'zones',
    'baselines',
    'satellitemetadatas',
    'changedetections',
    'alerts',
    'monitoringjobs',
    'incrementalmonitoringrecords',
  ];
  const beforeCounts: Record<string, number> = {};
  for (const c of collections) {
    beforeCounts[c] = await mongoose.connection.db!.collection(c).countDocuments();
    console.log(`  ${c.padEnd(30)}: ${beforeCounts[c]}`);
  }

  // Verify Vadipatti
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).lean();
  if (!vadipatti) {
    throw new Error('FATAL: Vadipatti zone missing!');
  }
  console.log('\nVadipatti status before:', {
    name: vadipatti.name,
    optical: vadipatti.monitoringTracks?.optical?.enabled,
    sar: vadipatti.monitoringTracks?.sar?.enabled,
  });

  // Verify Sirumalai
  const sirumalai = await Zone.findOne({ zoneId: 'ZONE-260925-8986' }).lean();
  if (!sirumalai) {
    throw new Error('FATAL: Sirumalai zone missing!');
  }
  console.log('Sirumalai zone found:', {
    _id: sirumalai._id,
    zoneId: sirumalai.zoneId,
    name: sirumalai.name,
  });

  // ─────────────────────────────────────────────────────────────
  // REPAIR #1: Restore Orphaned 2026-01-06 SatelliteMetadata
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- REPAIR #1: 2026-01-06 SATELLITE METADATA ---');
  const metadata2026Id = new Types.ObjectId('6ab7e7e46358176818476c24');
  const existingMeta2026 = await SatelliteMetadata.findById(metadata2026Id);

  if (existingMeta2026) {
    console.log('SatelliteMetadata 6ab7e7e46358176818476c24 already exists. Reusing.');
  } else {
    console.log('Reconstructing SatelliteMetadata 6ab7e7e46358176818476c24 from verified real artifacts...');
    await SatelliteMetadata.create({
      _id: metadata2026Id,
      imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260106T003233_20260106T003258_062639_07DA3D_0A25',
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      acquisitionDate: new Date('2026-01-06T00:32:33.000Z'),
      cloudCover: 0.0,
      footprint: sirumalai.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)',
      intersectingZones: [sirumalai._id],
      metadata: {
        spacecraftName: 'Sentinel-1A',
        mode: 'IW',
        polarization: 'VV+VH',
        bands: ['VV', 'VH'],
        isRealTelemetry: true,
      },
      geeExportTaskId: 'projects/monitoring-system-506515/operations/D67RK4K77DDVQOL4Q5JJQPKB',
      driveFileId: '1nAHTW5nsU1-u7Dguc7UdIkZFYg1hLjJA',
      driveFileName: 'ZONE-260925-8986_6ab7eb8e6358176818476cbc_BASELINE_Sentinel1_20260106.tif',
      driveFileSizeBytes: 26947716,
      localRasterPath: 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\6ab7eb8e6358176818476cbc\\ZONE-260925-8986_6ab7eb8e6358176818476cbc_BASELINE_Sentinel1_20260106.tif',
      rasterValidated: true,
      rasterBandCount: 2,
      rasterWidth: 2535,
      rasterHeight: 1285,
      rasterCrs: 'EPSG:32644',
      originalCrs: 'EPSG:32644',
      areaCalculationCrs: 'EPSG:32644',
      pixelAreaM2: 100,
      resolutionMeters: 10,
      spectralIndicesCalculated: false,
    });
    console.log('✅ SatelliteMetadata 6ab7e7e46358176818476c24 created successfully.');
  }

  // ─────────────────────────────────────────────────────────────
  // REPAIR #2: Register 2020-01-02 SAR Baseline Candidate
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- REPAIR #2: 2020-01-02 SAR BASELINE CANDIDATE ---');
  const metadata2020Id = new Types.ObjectId('6ab8a736667c98f4208d8b05');
  const existingBaseline2020 = await BaselineModel.findOne({
    zoneId: sirumalai._id,
    satelliteMetadataId: metadata2020Id,
  });

  if (existingBaseline2020) {
    console.log('Baseline candidate for 2020-01-02 already exists:', existingBaseline2020._id);
  } else {
    console.log('Registering Baseline candidate for existing 2020-01-02 SatelliteMetadata...');
    const baseline2020 = await BaselineModel.create({
      zoneId: sirumalai._id,
      satelliteMetadataId: metadata2020Id,
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      source: SatelliteSource.SENTINEL_1,
      acquisitionDate: new Date('2020-01-02T00:32:40.000Z'),
      status: BaselineStatus.PROCESSED,
      isActive: false, // Invariant: explicitly NOT active until user activates
      qualityScore: 100,
      cloudCover: null,
      validPixelPercentage: 100,
      selectionReason: 'Valid SAR candidate selected (SENTINEL_1, Mode: IW, Polarization: VV+VH, Score: 100)',
      processingSummary: 'Export completed for SAR (COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T003240_20200102T003305_030614_0381E6_3EAD)',
      geeExportTaskId: 'projects/monitoring-system-506515/operations/QI2D6QI63O2SVOBQTCKOAOMY',
      driveFileId: '1sGdPveu4FUwfC7EVlkh3sc0GZS8xPBrW',
      driveFileName: 'ZONE-260925-8986_6ab8a736667c98f4208d8b05_CURRENT_Sentinel1_20200102.tif',
      driveFileSizeBytes: 77521058,
      localRasterPath: 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\6ab8a736667c98f4208d8b05\\ZONE-260925-8986_6ab8a736667c98f4208d8b05_CURRENT_Sentinel1_20200102.tif',
      rasterValidated: true,
      rasterBandCount: 2,
      rasterWidth: 2562,
      rasterHeight: 2232,
      rasterCrs: 'EPSG:32644',
      originalCrs: 'EPSG:32644',
      areaCalculationCrs: 'EPSG:32644',
      pixelAreaM2: 100,
      spectralIndicesCalculated: false,
      pipelineCompletedAt: new Date('2026-09-27T05:22:26.835Z'),
    });
    console.log('✅ Baseline candidate for 2020-01-02 created:', baseline2020._id);
  }

  // ─────────────────────────────────────────────────────────────
  // REPAIR #3: Clear Stale Failure Reasons on Validated Baselines
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- REPAIR #3: CLEAR STALE FAILURE REASONS ---');
  // 2026-01-06 baseline
  const baseline2026 = await BaselineModel.findById('6ab7eb8e6358176818476cbc');
  if (baseline2026 && baseline2026.rasterValidated && baseline2026.driveFileId) {
    if (baseline2026.failureReason) {
      console.log('Clearing stale failureReason on 2026 baseline 6ab7eb8e6358176818476cbc');
      await BaselineModel.updateOne(
        { _id: baseline2026._id },
        { $unset: { failureReason: 1 } },
      );
    }
  }

  // 2021-01-01 baseline
  const baseline2021 = await BaselineModel.findById('6ab8a9ba667c98f4208d8d32');
  if (baseline2021 && baseline2021.rasterValidated && baseline2021.driveFileId) {
    if (baseline2021.failureReason) {
      console.log('Clearing stale failureReason on 2021 baseline 6ab8a9ba667c98f4208d8d32');
      await BaselineModel.updateOne(
        { _id: baseline2021._id },
        { $unset: { failureReason: 1 } },
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // VERIFY FINAL STATE
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- FINAL VERIFICATION: SIRUMALAI SAR BASELINES ---');
  const sirumalaiSarBaselines = await BaselineModel.find({
    zoneId: sirumalai._id,
    sensorType: SensorType.SAR,
  }).sort({ acquisitionDate: 1 }).lean();

  console.log(`Found ${sirumalaiSarBaselines.length} SAR Baselines for Sirumalai:`);
  for (const b of sirumalaiSarBaselines) {
    const meta = await SatelliteMetadata.findById(b.satelliteMetadataId).lean();
    console.log(`\n• Baseline ID: ${b._id}`);
    console.log(`  Acquisition: ${b.acquisitionDate?.toISOString()}`);
    console.log(`  Status: ${b.status}, isActive: ${b.isActive}`);
    console.log(`  Drive File ID: ${b.driveFileId ?? 'MISSING'} (${b.driveFileSizeBytes} bytes)`);
    console.log(`  Local Raster: ${b.localRasterPath ? 'EXISTS' : 'MISSING'}`);
    console.log(`  Raster Validated: ${b.rasterValidated}, Bands: ${b.rasterBandCount}`);
    console.log(`  SatelliteMetadata Linked: ${meta ? `YES (${meta.imageId})` : 'NO (ORPHANED!)'}`);
    console.log(`  Failure Reason: ${b.failureReason ?? 'NONE (CLEAN)'}`);
  }

  console.log('\n--- FINAL VERIFICATION: SATELLITE METADATA ---');
  const sirumalaiMeta = await SatelliteMetadata.find({
    intersectingZones: sirumalai._id,
  }).sort({ acquisitionDate: 1 }).lean();

  console.log(`Found ${sirumalaiMeta.length} SatelliteMetadata records for Sirumalai:`);
  sirumalaiMeta.forEach((m) => {
    console.log(`  [${m.sensorType}] ${m._id}: ${m.acquisitionDate?.toISOString()} - ${m.imageId}`);
  });

  // Verify Counts After
  console.log('\n--- AFTER COUNTS ---');
  const afterCounts: Record<string, number> = {};
  for (const c of collections) {
    afterCounts[c] = await mongoose.connection.db!.collection(c).countDocuments();
    const diff = afterCounts[c] - beforeCounts[c];
    const diffStr = diff > 0 ? ` (+${diff})` : diff < 0 ? ` (${diff})` : ' (no change)';
    console.log(`  ${c.padEnd(30)}: ${afterCounts[c]}${diffStr}`);
  }

  // Vadipatti final check
  const vadipattiAfter = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).lean();
  console.log('\nVadipatti invariant check:');
  console.log(`  optical: ${vadipattiAfter?.monitoringTracks?.optical?.enabled} (must be true)`);
  console.log(`  sar: ${vadipattiAfter?.monitoringTracks?.sar?.enabled} (must be false)`);

  await mongoose.disconnect();
  console.log('\n✅ REPAIR SCRIPT COMPLETED CLEANLY.');
}

repair().catch((err) => {
  console.error('Repair error:', err);
  process.exit(1);
});
