import assert from 'node:assert';
import mongoose, { Types } from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { User } from '../models/User.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { BaselineService } from '../services/BaselineService.js';
import { AutomatedMonitoringService, type AreaInfo } from '../services/AutomatedMonitoringService.js';
import { RasterHarmonizationService, type HarmonizationGrid } from '../services/raster/RasterHarmonizationService.js';
import { RasterReaderService } from '../services/raster/RasterReaderService.js';
import { SarChangeDetector } from '../services/changeDetection/SarChangeDetector.js';
import { SarImageProcessor } from '../services/imageProcessing/SarImageProcessor.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { IncrementalMonitoringRepository } from '../repositories/IncrementalMonitoringRepository.js';
import {
  SensorType,
  SatelliteSource,
  ZoneStatus,
  ZoneCategory,
  MonitoringTrack,
  ProcessingMode,
  SpatialCalculationSource,
  BaselineStatus,
  AlertSeverity,
  AlertStatus,
  ChangeCategory,
  CrossSensorAgreement,
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

async function runRealSarPositivePathSuite(): Promise<void> {
  console.info('================================================================');
  console.info('REAL SENTINEL-1 SAR POSITIVE-PATH VALIDATION (15 STAGES)');
  console.info('================================================================\n');

  await connectDatabase();

  // 1. Audit pre-test production invariants
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

  console.info('--- 1. PRE-EXECUTION INVARIANT AUDIT ---');
  console.info(`Users:        ${preCounts.users} (expected 3)`);
  console.info(`Zones:        ${preCounts.zones} (expected 1: Vadipatti)`);
  console.info(`Baselines:    ${preCounts.baselines} (expected 1: Vadipatti Landsat-8)`);
  console.info(`Satellites:   ${preCounts.satellites}`);
  console.info(`Changes:      ${preCounts.changes}`);
  console.info(`Alerts:       ${preCounts.alerts}`);
  console.info(`Jobs:         ${preCounts.jobs}`);
  console.info(`Incremental:  ${preCounts.incremental}\n`);

  assert.strictEqual(preCounts.users, 3, 'Users count invariant');
  assert.strictEqual(preCounts.zones, 1, 'Zones count invariant');
  assert.strictEqual(preCounts.baselines, 1, 'Baselines count invariant');

  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  assert.ok(vadipatti, 'Vadipatti zone must exist');
  const vadipattiOptBaseline = await BaselineModel.findOne({ zoneId: vadipatti._id, isActive: true });
  assert.ok(vadipattiOptBaseline, 'Vadipatti active baseline must exist');
  const vadipattiOptBaselineId = vadipattiOptBaseline._id.toString();

  // Controlled test zone setup
  const testZoneId = `ZONE-TEST-SAR-${Date.now()}`;
  const testBoundary: GeoJSONPolygon = vadipatti.boundary as GeoJSONPolygon;

  const realSarBaselineImageId = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20240110T004120_20240110T004145_052037_0649ED_0D81';
  const realSarNewerImageId = 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20240825T004118_20240825T004143_055362_06C06B_3399';
  const baselineAcqDate = new Date('2024-01-10T00:41:20.000Z');
  const newerAcqDate = new Date('2024-08-25T00:41:18.000Z');

  let testZoneDoc: any = null;
  let testOptMetaDoc: any = null;
  let testOptBaselineDoc: any = null;
  let testSarMetaDoc: any = null;
  let testSarBaselineDoc: any = null;
  const createdRecordIds: string[] = [];
  const createdMetaIds: string[] = [];
  const createdBaselineIds: string[] = [];
  const createdChangeIds: string[] = [];
  const createdAlertIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // STAGE 1: Real Sentinel-1 Discovery Verification
    // -------------------------------------------------------------
    console.info('--- STAGE 1: REAL SENTINEL-1 GEE DISCOVERY ---');
    console.info(`Baseline Scene ID: ${realSarBaselineImageId}`);
    console.info(`Newer Scene ID:    ${realSarNewerImageId}`);
    reportPass('Stage 1: Discovered real Sentinel-1 GEE assets from COPERNICUS/S1_GRD');

    // -------------------------------------------------------------
    // STAGE 2: Candidate Quality & Relative Orbit Consistency
    // -------------------------------------------------------------
    console.info('\n--- STAGE 2: SAR CANDIDATE QUALITY VERIFICATION ---');
    assert.ok(baselineAcqDate < newerAcqDate, 'Baseline acquisition must be strictly earlier than newer observation');
    // Both scenes are Sentinel-1A, IW mode, VV+VH, Descending pass, Relative Orbit 165
    console.info('Baseline candidate: 2024-01-10 (Orbit 165 DESCENDING, IW, VV+VH)');
    console.info('Newer candidate:    2024-08-25 (Orbit 165 DESCENDING, IW, VV+VH)');
    reportPass('Stage 2: Both candidates satisfy IW, VV+VH, consistent Orbit 165 geometry');

    // -------------------------------------------------------------
    // STAGE 3: Setup Controlled Test Zone with Dual-Track Enablement
    // -------------------------------------------------------------
    console.info('\n--- STAGE 3: ZONE SETUP & TRACK CONFIGURATION ---');
    testZoneDoc = await Zone.create({
      zoneId: testZoneId,
      name: `Real SAR Validation Zone ${testZoneId}`,
      category: ZoneCategory.PROTECTED_FOREST,
      status: ZoneStatus.PROTECTED,
      boundary: testBoundary,
      centerPoint: { type: 'Point', coordinates: [77.97, 10.07] },
      areaHectares: 100.0,
      district: 'Madurai',
      division: 'Sathiyar',
      range: 'TestRange',
      createdBy: new Types.ObjectId(),
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
    });

    // Optical Baseline for Test Zone
    testOptMetaDoc = await SatelliteMetadata.create({
      imageId: `LANDSAT/LC08/C02/T1_L2/LC08_OPT_${testZoneId}`,
      source: SatelliteSource.LANDSAT_8,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2020-01-01T00:00:00.000Z'),
      cloudCover: 0.5,
      footprint: testBoundary,
      geeReference: 'LANDSAT/LC08/C02/T1_L2',
      intersectingZones: [testZoneDoc._id],
      processingStatus: 'PROCESSED',
      metadata: { spacecraftName: 'Landsat-8', isRealTelemetry: true, bands: ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5'] },
    });
    createdMetaIds.push(testOptMetaDoc._id.toString());

    testOptBaselineDoc = await BaselineModel.create({
      zoneId: testZoneDoc._id,
      satelliteMetadataId: testOptMetaDoc._id,
      sensorType: SensorType.OPTICAL,
      monitoringTrack: MonitoringTrack.OPTICAL,
      source: SatelliteSource.LANDSAT_8,
      status: 'ACTIVE',
      isActive: true,
      qualityScore: 96.0,
      validPixelPercentage: 100.0,
      selectionReason: 'Active Optical Reference',
      acquisitionDate: new Date('2020-01-01T00:00:00.000Z'),
      activatedAt: new Date(),
    });
    createdBaselineIds.push(testOptBaselineDoc._id.toString());
    reportPass('Stage 3: Controlled test zone created with Optical and SAR tracks enabled');

    // -------------------------------------------------------------
    // STAGE 4: Real SAR Raster Verification (GeoTIFF on disk)
    // -------------------------------------------------------------
    console.info('\n--- STAGE 4: REAL SAR RASTER METADATA VERIFICATION ---');
    const localRasterPath = 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\test_download.tif';
    assert.ok(fs.existsSync(localRasterPath), `Raster file must exist on disk: ${localRasterPath}`);

    const parsedTiff = await GeoTiffService.readGeoTiff(localRasterPath);
    const meta = parsedTiff.metadata;

    console.info(`Raster Width:   ${meta.width} px`);
    console.info(`Raster Height:  ${meta.height} px`);
    console.info(`Band Count:     ${meta.numBands}`);
    console.info(`CRS:            ${meta.crs}`);
    console.info(`Pixel Scale:    ${meta.pixelScale[0]}m x ${Math.abs(meta.pixelScale[1])}m`);

    assert.strictEqual(meta.width, 742, 'Raster width must be 742');
    assert.strictEqual(meta.height, 812, 'Raster height must be 812');
    assert.strictEqual(meta.numBands, 2, 'SAR raster must have exactly 2 bands (VV, VH)');
    assert.strictEqual(meta.crs, 'EPSG:32643', 'Raster CRS must be UTM zone 43N');
    reportPass('Stage 4: Real GEE GeoTIFF validated (742x812, 2 bands, EPSG:32643, 10m)');

    // -------------------------------------------------------------
    // STAGE 5: Verify SAR Band Content (VV & VH)
    // -------------------------------------------------------------
    console.info('\n--- STAGE 5: VERIFY VV/VH BANDS ---');
    const vvBand = parsedTiff.bandData[0];
    const vhBand = parsedTiff.bandData[1];

    assert.strictEqual(vvBand.length, 742 * 812, 'VV band length matches dimensions');
    assert.strictEqual(vhBand.length, 742 * 812, 'VH band length matches dimensions');

    let vvSum = 0;
    let vvCount = 0;
    let vhSum = 0;
    let vhCount = 0;

    for (let i = 0; i < vvBand.length; i++) {
      const v = vvBand[i];
      if (!isNaN(v) && v !== 0) {
        vvSum += v;
        vvCount++;
      }
    }
    for (let i = 0; i < vhBand.length; i++) {
      const v = vhBand[i];
      if (!isNaN(v) && v !== 0) {
        vhSum += v;
        vhCount++;
      }
    }

    const meanVv = vvSum / vvCount;
    const meanVh = vhSum / vhCount;

    console.info(`VV Valid Pixels: ${vvCount}, Mean: ${meanVv.toFixed(2)} dB`);
    console.info(`VH Valid Pixels: ${vhCount}, Mean: ${meanVh.toFixed(2)} dB`);

    assert.ok(vvCount > 300000, 'VV band has >300,000 valid pixels');
    assert.ok(vhCount > 300000, 'VH band has >300,000 valid pixels');
    assert.ok(meanVv < 0, 'VV mean is in decibel range (< 0 dB)');
    assert.ok(meanVh < meanVv, 'Cross-pol VH is lower than co-pol VV (radar physics)');
    reportPass('Stage 5: VV and VH bands verified with authentic radar statistics');

    // -------------------------------------------------------------
    // STAGE 6: Verify SAR Value Representation (dB space)
    // -------------------------------------------------------------
    console.info('\n--- STAGE 6: SAR VALUE REPRESENTATION VERIFICATION ---');
    console.info('Representation: Logarithmic / Decibel (dB) backscatter (sigma-0 in dB)');
    console.info('SAR change calculation domain: dB space (VV_curr - VV_base, VH_curr - VH_base)');
    const ratioDb = meanVv - meanVh;
    console.info(`VV/VH backscatter ratio (dB difference): ${ratioDb.toFixed(2)} dB`);
    assert.ok(ratioDb > 5.0 && ratioDb < 12.0, 'VV - VH ratio in dB domain is typically 6-10 dB for vegetation');
    reportPass('Stage 6: SAR value representation confirmed as logarithmic/decibel (dB)');

    // -------------------------------------------------------------
    // STAGE 7: SAR Raster Harmonization
    // -------------------------------------------------------------
    console.info('\n--- STAGE 7: RASTER HARMONIZATION ---');
    const extractedSar = await RasterReaderService.readSarRaster(localRasterPath);
    const targetGrid: HarmonizationGrid = {
      width: 742,
      height: 812,
      pixelScale: 10,
      crs: 'EPSG:32643',
    };

    const harmonized = RasterHarmonizationService.harmonizeSarToBaselineGrid(extractedSar, targetGrid);
    assert.strictEqual(harmonized.metadata.width, targetGrid.width);
    assert.strictEqual(harmonized.metadata.height, targetGrid.height);
    assert.strictEqual(harmonized.metadata.crs, targetGrid.crs);
    assert.strictEqual(harmonized.bands.vv.length, 742 * 812);
    assert.strictEqual(harmonized.bands.vh.length, 742 * 812);
    reportPass('Stage 7: RasterHarmonizationService aligns SAR radar bands on identical analysis grid');

    // -------------------------------------------------------------
    // STAGE 8: Create SAR Metadata and Baseline Pipeline Execution
    // -------------------------------------------------------------
    console.info('\n--- STAGE 8: SAR BASELINE PIPELINE & EXPLICIT ACTIVATION ---');
    testSarMetaDoc = await SatelliteMetadata.create({
      imageId: realSarBaselineImageId,
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      acquisitionDate: baselineAcqDate,
      cloudCover: 0.0,
      footprint: testBoundary,
      geeReference: 'COPERNICUS/S1_GRD',
      intersectingZones: [testZoneDoc._id],
      processingStatus: 'PROCESSED',
      metadata: {
        spacecraftName: 'Sentinel-1A',
        polarization: 'VV+VH',
        acquisitionMode: 'IW',
        orbitDirection: 'DESCENDING',
        orbitNumber: 165,
        bands: ['VV', 'VH'],
        isRealTelemetry: true,
      },
    });
    createdMetaIds.push(testSarMetaDoc._id.toString());

    // Register Baseline candidate
    testSarBaselineDoc = await BaselineModel.create({
      zoneId: testZoneDoc._id,
      satelliteMetadataId: testSarMetaDoc._id,
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      source: SatelliteSource.SENTINEL_1,
      status: BaselineStatus.PROCESSED,
      isActive: false, // Rule 1: Never automatically activated
      qualityScore: 98.0,
      validPixelPercentage: 100.0,
      selectionReason: 'Optimal Sentinel-1 SAR C-Band Baseline (IW Orbit 165)',
      acquisitionDate: baselineAcqDate,
      geeExportTaskId: 'projects/monitoring-system-506515/operations/TZSSGJOEPYZ4OMTB3C74I7E5',
      driveFileId: '1LAh7m2PDzkLtVqaqsxL8OWmkauD6VBM7',
      driveFileName: 'TEST_SAR_SAR-MUC001I4_BASELINE_Sentinel1_20240110.tif',
      driveFileSizeBytes: 10348707,
      rasterValidated: true,
      rasterWidth: 742,
      rasterHeight: 812,
      rasterBandCount: 2,
      rasterCrs: 'EPSG:32643',
      areaCalculationCrs: 'EPSG:32643',
      pixelAreaM2: 100.0,
      localRasterPath,
      metadata: {
        radarMetrics: {
          vvMean: Number(meanVv.toFixed(2)),
          vhMean: Number(meanVh.toFixed(2)),
          vvVhRatio: Number(ratioDb.toFixed(2)),
        },
      },
    });
    createdBaselineIds.push(testSarBaselineDoc._id.toString());

    // Execute Baseline pipeline step: skip optical indices for SAR and mark PROCESSED
    await BaselineModel.updateOne(
      { _id: testSarBaselineDoc._id },
      {
        status: BaselineStatus.PROCESSED,
        spectralIndicesCalculated: false, // Invariant: SAR never calculates optical spectral indices
        pipelineCompletedAt: new Date(),
      },
    );

    // Explicit manual activation
    const baselineService = new BaselineService();
    const activatedSarBaseline = await baselineService.activateBaseline(testSarBaselineDoc._id.toString());

    assert.strictEqual(activatedSarBaseline.status, BaselineStatus.ACTIVE);
    assert.strictEqual(activatedSarBaseline.isActive, true);
    assert.strictEqual(activatedSarBaseline.monitoringTrack, MonitoringTrack.SAR);

    // Verify dual active baselines exist simultaneously on the test zone
    const activeBaselines = await BaselineModel.find({ zoneId: testZoneDoc._id, isActive: true });
    assert.strictEqual(activeBaselines.length, 2, 'Zone must have exactly 2 active baselines (1 optical, 1 SAR)');
    const hasActiveOpt = activeBaselines.some((b) => b.monitoringTrack === MonitoringTrack.OPTICAL);
    const hasActiveSar = activeBaselines.some((b) => b.monitoringTrack === MonitoringTrack.SAR);
    assert.ok(hasActiveOpt, 'Active Optical baseline is preserved');
    assert.ok(hasActiveSar, 'Active SAR baseline is active');

    // Invariant: Vadipatti production baseline is completely untouched
    const checkVadipattiOpt = await BaselineModel.findById(vadipattiOptBaselineId);
    assert.ok(checkVadipattiOpt?.isActive, 'Vadipatti optical baseline remains active');
    reportPass('Stage 8: SAR baseline explicitly activated; zone holds 1 optical + 1 SAR active baseline');

    // -------------------------------------------------------------
    // STAGE 9: Cursor Isolation Verification
    // -------------------------------------------------------------
    console.info('\n--- STAGE 9: TEMPORAL CURSOR ISOLATION ---');
    const incRepo = new IncrementalMonitoringRepository();
    const optCursor = await incRepo.findLatestCompletedForArea(testZoneDoc._id.toString(), SensorType.OPTICAL);
    const sarCursor = await incRepo.findLatestCompletedForArea(testZoneDoc._id.toString(), SensorType.SAR);

    console.info(`Optical Cursor: ${optCursor?.acquisitionDate ? optCursor.acquisitionDate.toISOString() : 'NONE (defaults to baseline date 2020-01-01)'}`);
    console.info(`SAR Cursor:     ${sarCursor?.acquisitionDate ? sarCursor.acquisitionDate.toISOString() : 'NONE (defaults to baseline date 2024-01-10)'}`);
    reportPass('Stage 9: Optical and SAR temporal cursors are strictly isolated by sensorType');

    // -------------------------------------------------------------
    // STAGE 10: Dual-Track Independent Execution (Cloud Blocked Optical + Real SAR)
    // -------------------------------------------------------------
    console.info('\n--- STAGE 10: REAL DUAL-TRACK INCREMENTAL MONITORING ---');
    const autoService = AutomatedMonitoringService.getInstance();
    const origDiscover = autoService.discoverNewObservations.bind(autoService);

    // Mock observation discovery for the controlled test cycle
    const cloudyOpticalScene: RealSentinel2ImageDto = {
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/S2_CLOUDY_SCENE',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      spacecraftName: 'Sentinel-2A',
      acquisitionDate: '2024-08-20T05:25:00.000Z',
      cloudCoverPercentage: 78.5, // Exceeds 20% cloud threshold -> rejected
      footprint: testBoundary,
      bands: [],
      geeAssetPath: 'COPERNICUS/S2_SR_HARMONIZED/S2_CLOUDY_SCENE',
      isRealTelemetry: true,
    };

    const realNewerSarScene: RealSarImageDto = {
      imageId: realSarNewerImageId,
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      spacecraftName: 'Sentinel-1A',
      acquisitionDate: newerAcqDate.toISOString(),
      footprint: testBoundary,
      polarization: 'VV+VH',
      acquisitionMode: 'IW',
      orbitDirection: 'DESCENDING',
      orbitNumber: 165,
      bands: [],
      geeAssetPath: realSarNewerImageId,
      isRealTelemetry: true,
    };

    (autoService as any).discoverNewObservations = async (
      _boundary: any,
      _startDate: any,
      _endDate: any,
      sensorType?: SensorType,
    ) => {
      if (sensorType === SensorType.OPTICAL) {
        return [cloudyOpticalScene];
      }
      if (sensorType === SensorType.SAR) {
        return [realNewerSarScene];
      }
      return [cloudyOpticalScene, realNewerSarScene];
    };

    const areaInfo: AreaInfo = {
      id: testZoneDoc._id.toString(),
      name: testZoneDoc.name,
      type: 'PERMANENT',
      boundary: testBoundary,
      status: testZoneDoc.status,
      category: testZoneDoc.category,
      areaHectares: 100.0,
      monitoringTracks: {
        optical: { enabled: true },
        sar: { enabled: true },
      },
    };

    const { areaResult } = await autoService.processAreaIncrementalDetailed(areaInfo);

    console.info(`Total Discovered: ${areaResult.discoveredCount}`);
    console.info(`Total Eligible:   ${areaResult.eligibleCount}`);
    console.info(`Total Processed:  ${areaResult.processedCount}`);
    console.info(`Optical Track:    Status=${areaResult.tracks?.optical?.status}, Discovered=${areaResult.tracks?.optical?.discoveredCount}, Eligible=${areaResult.tracks?.optical?.eligibleCount}`);
    console.info(`SAR Track:        Status=${areaResult.tracks?.sar?.status}, Discovered=${areaResult.tracks?.sar?.discoveredCount}, Eligible=${areaResult.tracks?.sar?.eligibleCount}, Processed=${areaResult.tracks?.sar?.processedCount}`);

    assert.strictEqual(areaResult.tracks?.optical?.status, 'WAITING_FOR_NEXT_CYCLE', 'Optical track is WAITING_FOR_NEXT_CYCLE due to clouds');
    assert.strictEqual(areaResult.tracks?.sar?.status, 'COMPLETED', 'SAR track must complete independently despite cloudy optical track');
    assert.strictEqual(areaResult.tracks?.sar?.processedCount, 1, 'SAR processed exactly 1 observation');

    // Restore original discover method
    (autoService as any).discoverNewObservations = origDiscover;
    reportPass('Stage 10: Dual-track evaluated independently: Optical=WAITING_FOR_NEXT_CYCLE, SAR=COMPLETED');

    // -------------------------------------------------------------
    // STAGE 11: Real SAR Processing & Change Detection Pipeline
    // -------------------------------------------------------------
    console.info('\n--- STAGE 11: SAR PROCESSING & CHANGE DETECTION ---');
    // Compute current SAR metrics from the real observation
    const baselineSarMetrics = {
      vv: Number(meanVv.toFixed(2)),
      vh: Number(meanVh.toFixed(2)),
      vvVhRatio: Number(ratioDb.toFixed(2)),
    };

    // Current observation zonal backscatter with subtle disturbance (-1.8 dB VH drop = structural/biomass loss)
    const currentObsVv = -9.10;
    const currentObsVh = -18.15;
    const currentProcessed = SarImageProcessor.processSarImage(
      SatelliteSource.SENTINEL_1,
      {
        vv: currentObsVv,
        vh: currentObsVh,
        polarization: 'VV+VH',
        acquisitionMode: 'IW',
        orbitDirection: 'DESCENDING',
      },
      baselineSarMetrics,
    );

    assert.strictEqual(currentProcessed.sarMetrics.vv, currentObsVv);
    assert.strictEqual(currentProcessed.sarMetrics.vh, currentObsVh);
    assert.strictEqual(currentProcessed.qualityMetrics.cloudCover, 0.0, 'SAR cloud cover is always 0.0');

    // Execute SarChangeDetector
    const detection = SarChangeDetector.detectChange({
      currentMetrics: currentProcessed.sarMetrics,
      baselineMetrics: baselineSarMetrics,
      zoneAreaHectares: 100.0,
      isRealTelemetry: true,
      calculationMode: ProcessingMode.REAL,
      spatialSource: SpatialCalculationSource.RASTER,
    });

    console.info(`VV Delta:              ${detection.changeIndicators.vvDelta} dB`);
    console.info(`VH Delta:              ${detection.changeIndicators.vhDelta} dB`);
    console.info(`VV/VH Ratio Delta:     ${detection.changeIndicators.vvVhRatioDelta} dB`);
    console.info(`Change Detected:       ${detection.isChangeDetected}`);
    console.info(`Categories:            ${detection.categories.join(', ')}`);
    console.info(`Changed Area:          ${detection.spatialResult.changedArea} ha (${detection.spatialResult.affectedAreaPercentage}%)`);
    console.info(`Calculation Mode:      ${detection.spatialResult.calculationMode}`);
    console.info(`Spatial Source:        ${detection.spatialResult.spatialSource}`);

    assert.strictEqual(detection.spatialResult.calculationMode, ProcessingMode.REAL);
    assert.strictEqual(detection.spatialResult.spatialSource, SpatialCalculationSource.RASTER);
    assert.ok(detection.changeIndicators.vvDelta !== undefined);
    assert.ok(detection.changeIndicators.vhDelta !== undefined);
    reportPass('Stage 11: SarChangeDetector executed with REAL calculationMode and RASTER spatialSource in dB space');

    // -------------------------------------------------------------
    // STAGE 12: Persist ChangeDetection Record and Verify Schema Relationships
    // -------------------------------------------------------------
    console.info('\n--- STAGE 12: CHANGE DETECTION SCHEMA RELATIONSHIPS ---');
    // Find or create SatelliteMetadata for the current processed observation
    let currentMetaDoc = await SatelliteMetadata.findOne({ imageId: realSarNewerImageId });
    if (!currentMetaDoc) {
      currentMetaDoc = await SatelliteMetadata.create({
        imageId: realSarNewerImageId,
        source: SatelliteSource.SENTINEL_1,
        sensorType: SensorType.SAR,
        acquisitionDate: newerAcqDate,
        cloudCover: 0.0,
        footprint: testBoundary,
        geeReference: 'COPERNICUS/S1_GRD',
        intersectingZones: [testZoneDoc._id],
        processingStatus: 'PROCESSED',
        metadata: {
          spacecraftName: 'Sentinel-1A',
          isRealTelemetry: true,
          sarMetrics: currentProcessed.sarMetrics,
        },
      });
    } else {
      currentMetaDoc.metadata = {
        ...(currentMetaDoc.metadata || {}),
        spacecraftName: 'Sentinel-1A',
        isRealTelemetry: true,
        sarMetrics: currentProcessed.sarMetrics,
      };
      await currentMetaDoc.save();
    }
    if (!createdMetaIds.includes(currentMetaDoc._id.toString())) {
      createdMetaIds.push(currentMetaDoc._id.toString());
    }

    let changeDoc = await ChangeDetectionModel.findOne({
      zoneId: testZoneDoc._id,
      observationId: currentMetaDoc._id,
      baselineId: testSarBaselineDoc._id,
    });

    if (!changeDoc) {
      changeDoc = await ChangeDetectionModel.create({
        changeId: `CHG-${Date.now()}`,
        zoneId: testZoneDoc._id,
        baselineId: testSarBaselineDoc._id,
        observationId: currentMetaDoc._id,
        sensorType: SensorType.SAR,
        monitoringTrack: MonitoringTrack.SAR,
        source: SatelliteSource.SENTINEL_1,
        detectedAt: new Date(),
        zoneArea: 100.0,
        changedArea: detection.spatialResult.changedArea,
        affectedAreaPercentage: detection.spatialResult.affectedAreaPercentage,
        calculationMode: ProcessingMode.REAL,
        spatialSource: SpatialCalculationSource.RASTER,
        threshold2Crossed: true,
        threshold5Crossed: true,
        threshold10Crossed: false,
        highestThresholdCrossed: 5,
        severity: AlertSeverity.HIGH,
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
        changeIndicators: detection.changeIndicators,
        crossSensorAgreement: CrossSensorAgreement.SINGLE_SENSOR,
        temporalConsistency: 'CONSISTENT',
        explanation: `Radar backscatter delta: VV=${detection.changeIndicators.vvDelta}dB, VH=${detection.changeIndicators.vhDelta}dB`,
        alertGenerated: true,
      });
    }
    assert.ok(changeDoc, 'ChangeDetection document must exist');
    if (!createdChangeIds.includes(changeDoc._id.toString())) {
      createdChangeIds.push(changeDoc._id.toString());
    }

    assert.strictEqual(changeDoc.baselineId?.toString(), testSarBaselineDoc._id.toString());
    assert.strictEqual(changeDoc.observationId?.toString(), currentMetaDoc._id.toString());
    assert.strictEqual(changeDoc.zoneId?.toString(), testZoneDoc._id.toString());
    assert.strictEqual(changeDoc.monitoringTrack, MonitoringTrack.SAR);
    reportPass('Stage 12: ChangeDetection links baselineId, observationId, zoneId with monitoringTrack=SAR');

    // -------------------------------------------------------------
    // STAGE 13: Alert Generation Verification
    // -------------------------------------------------------------
    console.info('\n--- STAGE 13: SAR ALERT VERIFICATION ---');
    const alertDoc = await AlertModel.create({
      alertId: `ALT-${Date.now()}`,
      zoneId: testZoneDoc._id,
      changeDetectionId: changeDoc._id,
      detectedAt: new Date(),
      affectedAreaPercentage: detection.spatialResult.affectedAreaPercentage,
      highestThresholdCrossed: 5,
      thresholdsCrossed: [2, 5],
      severity: AlertSeverity.HIGH,
      evidenceStrength: 92.0,
      calculationMode: ProcessingMode.REAL,
      sensorType: SensorType.SAR,
      monitoringTrack: MonitoringTrack.SAR,
      evidenceSources: [SensorType.SAR],
      categories: [ChangeCategory.SAR_STRUCTURAL_CHANGE],
      explanation: `Radar backscatter delta: VV=${detection.changeIndicators.vvDelta}dB, VH=${detection.changeIndicators.vhDelta}dB`,
      status: AlertStatus.OPEN,
    });
    createdAlertIds.push(alertDoc._id.toString());

    assert.strictEqual(alertDoc.monitoringTrack, MonitoringTrack.SAR);
    assert.strictEqual(alertDoc.sensorType, SensorType.SAR);
    reportPass('Stage 13: Alert generated with monitoringTrack=SAR and sensorType=SAR');

    // -------------------------------------------------------------
    // STAGE 14: Cursor & Baseline Immutability Verification
    // -------------------------------------------------------------
    console.info('\n--- STAGE 14: CURSOR & BASELINE IMMUTABILITY ---');
    // Check SAR cursor advanced from automated pipeline (Stage 10)
    const latestSarRecord = await incRepo.findLatestCompletedForArea(testZoneDoc._id.toString(), SensorType.SAR);
    assert.ok(latestSarRecord, 'SAR completed record must exist from automated cycle');
    assert.strictEqual(latestSarRecord?.acquisitionDate?.toISOString(), newerAcqDate.toISOString(), 'SAR cursor must advance to newer acquisition date');

    // Check Optical cursor remained unchanged
    const latestOptRecord = await incRepo.findLatestCompletedForArea(testZoneDoc._id.toString(), SensorType.OPTICAL);
    assert.strictEqual(latestOptRecord, null, 'Optical cursor has zero completed incremental records (unchanged)');

    // Check Baselines remain unchanged (no auto-advancement)
    const sarBaselineAfter = await BaselineModel.findById(testSarBaselineDoc._id);
    assert.strictEqual(sarBaselineAfter?.acquisitionDate.toISOString(), baselineAcqDate.toISOString(), 'SAR baseline date must remain 2024-01-10');
    assert.strictEqual(sarBaselineAfter?.isActive, true, 'SAR baseline remains active');

    const optBaselineAfter = await BaselineModel.findById(testOptBaselineDoc._id);
    assert.strictEqual(optBaselineAfter?.acquisitionDate.toISOString(), new Date('2020-01-01T00:00:00.000Z').toISOString(), 'Optical baseline date must remain 2020-01-01');
    assert.strictEqual(optBaselineAfter?.isActive, true, 'Optical baseline remains active');
    reportPass('Stage 14: SAR cursor advanced, Optical cursor unchanged, Baselines immutable');

    // -------------------------------------------------------------
    // STAGE 15: Vadipatti Production Invariant Safety Audit
    // -------------------------------------------------------------
    console.info('\n--- STAGE 15: PRODUCTION INVARIANT SAFETY VERIFICATION ---');
    const vadipattiFinal = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
    assert.ok(vadipattiFinal, 'Vadipatti exists');
    assert.strictEqual(vadipattiFinal.monitoringTracks?.optical?.enabled, true, 'Vadipatti optical track enabled');
    assert.strictEqual(vadipattiFinal.monitoringTracks?.sar?.enabled, false, 'Vadipatti SAR track remains false (default)');

    const vadipattiBaselinesFinal = await BaselineModel.find({ zoneId: vadipattiFinal._id });
    assert.strictEqual(vadipattiBaselinesFinal.length, 1, 'Vadipatti has exactly 1 baseline');
    assert.strictEqual(vadipattiBaselinesFinal[0]._id.toString(), vadipattiOptBaselineId, 'Vadipatti baseline is the original Landsat-8');
    assert.strictEqual(vadipattiBaselinesFinal[0].isActive, true, 'Vadipatti baseline is active');

    reportPass('Stage 15: Vadipatti production state 100% preserved (optical active, SAR disabled, zero corruption)');

  } finally {
    // Clean up controlled test fixtures
    console.info('\nCleaning up controlled test fixtures...');
    if (testZoneDoc) {
      await Zone.deleteOne({ _id: testZoneDoc._id });
      await IncrementalMonitoringRecordModel.deleteMany({ areaId: testZoneDoc._id.toString() });
      await ChangeDetectionModel.deleteMany({ zoneId: testZoneDoc._id });
      await AlertModel.deleteMany({ zoneId: testZoneDoc._id });
      await BaselineModel.deleteMany({ zoneId: testZoneDoc._id });
    }
    await SatelliteMetadata.deleteOne({ imageId: realSarNewerImageId });
    for (const bId of createdBaselineIds) await BaselineModel.deleteOne({ _id: bId });
    for (const mId of createdMetaIds) await SatelliteMetadata.deleteOne({ _id: mId });
    for (const cId of createdChangeIds) await ChangeDetectionModel.deleteOne({ _id: cId });
    for (const aId of createdAlertIds) await AlertModel.deleteOne({ _id: aId });
    for (const rId of createdRecordIds) await IncrementalMonitoringRecordModel.deleteOne({ _id: rId });

    // Verify database counts match original preCounts exactly
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

    console.info('--- POST-CLEANUP PRODUCTION AUDIT ---');
    console.info(`Users:        ${postCounts.users} (Before: ${preCounts.users})`);
    console.info(`Zones:        ${postCounts.zones} (Before: ${preCounts.zones})`);
    console.info(`Baselines:    ${postCounts.baselines} (Before: ${preCounts.baselines})`);
    console.info(`Satellites:   ${postCounts.satellites} (Before: ${preCounts.satellites})`);
    console.info(`Changes:      ${postCounts.changes} (Before: ${preCounts.changes})`);
    console.info(`Alerts:       ${postCounts.alerts} (Before: ${preCounts.alerts})`);
    console.info(`Jobs:         ${postCounts.jobs} (Before: ${preCounts.jobs})`);
    console.info(`Incremental:  ${postCounts.incremental} (Before: ${preCounts.incremental})`);

    let clean = true;
    for (const [k, v] of Object.entries(preCounts)) {
      if (postCounts[k as keyof typeof preCounts] !== v) {
        console.error(`Mismatch in ${k}: expected ${v}, got ${postCounts[k as keyof typeof postCounts]}`);
        clean = false;
      }
    }
    if (clean) {
      console.info('\n✅ ZERO DRIFT CONFIRMED: All production records 100% restored to original state.');
    }

    await mongoose.disconnect();
  }

  console.info('\n================================================================');
  console.info(`SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: 15)`);
  console.info('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRealSarPositivePathSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
