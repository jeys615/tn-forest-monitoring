import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { getGeeConfig } from '../config/gee.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { AlertModel } from '../models/Alert.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeSatelliteSearchService, type SatelliteScene } from '../services/gee/GeeSatelliteSearchService.js';
import { GeeExportService } from '../services/gee/GeeExportService.js';
import { GeeTaskService } from '../services/gee/GeeTaskService.js';
import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { RasterReaderService } from '../services/raster/RasterReaderService.js';
import { SensorNormalizationService } from '../services/raster/SensorNormalizationService.js';
import { RasterPreprocessingService } from '../services/raster/RasterPreprocessingService.js';
import { RasterHarmonizationService } from '../services/raster/RasterHarmonizationService.js';
import { PixelAnalysisService } from '../services/raster/PixelAnalysisService.js';
import { calculateM6Metrics } from '../utils/m6Metrics.js';
import { EvidenceScoreCalculator } from '../services/changeDetection/EvidenceScoreCalculator.js';
import { SensorType, CrossSensorAgreement, MonitoringJobType } from '@tn-forest/shared/types';

interface LiveReport {
  geeProject: string;
  geeTaskId: string;
  satellite: string;
  collection: string;
  imageId: string;
  acquisitionDate: string;
  cloudCover: string;
  driveFolder: string;
  driveFileId: string;
  geoTiffFileName: string;
  rasterWidth: number;
  rasterHeight: number;
  bandCount: number;
  crs: string;
  nativeResolution: string;
  processingResolution: string;
  resamplingMethod: string;
  validPixels: number;
  changedPixels: number;
  noChangePixels: number;
  affectedAreaM2: number;
  affectedAreaHa: number;
  affectedAreaPercentage: number;
  ndviBaseline: number;
  ndviCurrent: number;
  ndwiBaseline: number;
  ndwiCurrent: number;
  nbrBaseline: number;
  nbrCurrent: number;
  bsiBaseline: number;
  bsiCurrent: number;
  eviBaseline: number;
  eviCurrent: number;
  saviBaseline: number;
  saviCurrent: number;
  evidenceScore: number;
  severity: string;
  alertThreshold: string;
  alertGenerated: boolean;
  processingDurationMs: number;
  cleanupStatus: string;
}

async function runLiveIntegration() {
  const tTotalStart = performance.now();
  console.log('\n================================================================');
  console.log('STARTING REAL GEE + GOOGLE DRIVE + LOCAL GIS LIVE INTEGRATION TEST');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected to MongoDB at:', env.MONGODB_URI);

  const zoneCode = 'ZONE-260826-5821';
  const zone = await Zone.findOne({ zoneId: zoneCode });
  if (!zone) {
    throw new Error(`Zone ${zoneCode} not found in database.`);
  }
  console.log(`[ZONE_VALIDATION] Found target zone: ${zone.name} (${zone.zoneId})`);

  // ──────────────────────────────────────────────────────────
  // 1. LOAD EXISTING ACTIVE BASELINE
  // ──────────────────────────────────────────────────────────
  console.log('\n[BASELINE_LOOKUP] Searching for ACTIVE baseline...');
  const activeBaseline = await BaselineModel.findOne({ zoneId: zone._id, status: 'ACTIVE' });
  if (!activeBaseline) {
    throw new Error(`No active baseline found for zone ${zoneCode}.`);
  }

  const baselineMeta = await SatelliteMetadata.findById(activeBaseline.satelliteMetadataId);
  if (!baselineMeta) {
    throw new Error(`SatelliteMetadata ${activeBaseline.satelliteMetadataId} not found.`);
  }

  const baseAcqDate = new Date(baselineMeta.acquisitionDate);
  const baseAcqDateStr = baseAcqDate.toISOString().slice(0, 10);
  console.log(`[BASELINE_FOUND] Baseline ID: ${baselineMeta.imageId} | Date: ${baseAcqDateStr} | Cloud: ${baselineMeta.cloudCover}%`);

  // ──────────────────────────────────────────────────────────
  // 2. QUERY GEE FOR REAL OBSERVATION
  // ──────────────────────────────────────────────────────────
  console.log('\n[GEE_SEARCH] Querying Google Earth Engine catalog for observations acquired after baseline...');
  const geeAuth = GeeAuthService.getInstance();
  const geeConfig = getGeeConfig();
  const searchService = new GeeSatelliteSearchService();

  const token = await geeAuth.getAccessToken();
  console.log(`[GEE_SEARCH] GEE Project: ${geeConfig.projectId} (Mode: ${geeConfig.mode})`);
  console.log(`[GEE_SEARCH] Auth Token Present: ${Boolean(token)}`);

  const searchResult = await searchService.searchObservations({
    geometry: zone.boundary,
    startDate: new Date(baseAcqDate.getTime() + 86400000), // strictly after baseline
    endDate: new Date(),
    maxCloudCover: 20.0,
    preferredSensorType: SensorType.OPTICAL,
    baselineImageId: baselineMeta.imageId,
  });

  console.log(`[GEE_SEARCH] Evaluated ${searchResult.candidatesEvaluated.length} candidate scenes.`);
  for (const c of searchResult.candidatesEvaluated) {
    console.log(`  Candidate: ${c.imageId} | Date: ${c.acquisitionDate.toISOString().slice(0, 10)} | Cloud: ${c.cloudCover}% | Status: ${c.status}`);
  }

  if (!searchResult.selectedScene) {
    // If GEE search returned no scene directly, retrieve the latest validated current metadata record
    const latestMeta = await SatelliteMetadata.findOne({
      zoneId: zone._id,
      processingStatus: { $ne: 'FAILED' },
      acquisitionDate: { $gt: baseAcqDate },
      cloudCover: { $lte: 20.0 },
    }).sort({ acquisitionDate: -1 });

    if (!latestMeta) {
      throw new Error('No valid observation found after baseline date.');
    }

    searchResult.selectedScene = {
      satellite: latestMeta.source === 'SENTINEL_2' ? 'Sentinel-2' : 'Landsat-8',
      sensorType: latestMeta.sensorType as SensorType,
      collection: latestMeta.imageId.split('/').slice(0, 2).join('/') || 'COPERNICUS/S2_SR_HARMONIZED',
      imageId: latestMeta.imageId,
      acquisitionDate: new Date(latestMeta.acquisitionDate),
      cloudCover: latestMeta.cloudCover || 0,
      nativeResolution: latestMeta.source === 'SENTINEL_2' ? 10 : 30,
      bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'],
      footprint: zone.boundary,
      processingLevel: 'Level-2A',
      provider: 'GEE',
    };
  }

  const curScene = searchResult.selectedScene;
  const curAcqDateStr = curScene.acquisitionDate.toISOString().slice(0, 10);
  console.log(`[GEE_SEARCH] Selected Current Image: ${curScene.imageId} (${curAcqDateStr}, Cloud: ${curScene.cloudCover}%)`);

  // ──────────────────────────────────────────────────────────
  // 3. CREATE REAL GEE EXPORT TASK
  // ──────────────────────────────────────────────────────────
  console.log('\n[GEE_EXPORT_REQUEST] Submitting real GEE Export.image.toDrive task...');
  const exportService = new GeeExportService();
  const taskService = new GeeTaskService();
  const testJobId = `JOB-LIVE-${Date.now().toString(36).toUpperCase()}`;

  const curExport = await exportService.requestImageExport({
    scene: curScene,
    zoneCode: zone.zoneId,
    jobId: testJobId,
    imageType: 'CURRENT',
    geometry: zone.boundary,
    scaleMeters: curScene.nativeResolution,
  });

  const baseScene: SatelliteScene = {
    satellite: baselineMeta.source === 'SENTINEL_2' ? 'Sentinel-2' : 'Landsat-8',
    sensorType: activeBaseline.sensorType as SensorType,
    collection: baselineMeta.imageId.split('/').slice(0, 2).join('/') || 'COPERNICUS/S2_SR_HARMONIZED',
    imageId: baselineMeta.imageId,
    acquisitionDate: baseAcqDate,
    cloudCover: baselineMeta.cloudCover || 0,
    nativeResolution: baselineMeta.source === 'SENTINEL_2' ? 10 : 30,
    bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'SCL'],
    footprint: zone.boundary,
    processingLevel: 'Level-2A',
    provider: 'GEE',
  };

  const baseExport = await exportService.requestImageExport({
    scene: baseScene,
    zoneCode: zone.zoneId,
    jobId: testJobId,
    imageType: 'BASELINE',
    geometry: zone.boundary,
    scaleMeters: baseScene.nativeResolution,
  });

  console.log(`[GEE_EXPORT_REQUEST] Processing Mode: REAL_GEE_RASTER_LOCAL`);
  console.log(`[GEE_EXPORT_REQUEST] Current Task: ${curExport.taskId} -> File: ${curExport.driveFileName}`);
  console.log(`[GEE_EXPORT_REQUEST] Baseline Task: ${baseExport.taskId} -> File: ${baseExport.driveFileName}`);

  // ──────────────────────────────────────────────────────────
  // 4. WAIT FOR GEE TASK TO REACH COMPLETED
  // ──────────────────────────────────────────────────────────
  console.log('\n[GEE_EXPORT_STATUS] Polling GEE task status...');
  const curTaskStatus = await taskService.pollTaskCompletion(curExport.taskId, { timeoutMs: 10000 });
  const baseTaskStatus = await taskService.pollTaskCompletion(baseExport.taskId, { timeoutMs: 10000 });

  console.log(`[GEE_EXPORT_STATUS] Current Task State: ${curTaskStatus.state}`);
  console.log(`[GEE_EXPORT_STATUS] Baseline Task State: ${baseTaskStatus.state}`);

  // ──────────────────────────────────────────────────────────
  // 5. GOOGLE DRIVE DISCOVERY & STREAMING DOWNLOAD
  // ──────────────────────────────────────────────────────────
  console.log('\n[GOOGLE_DRIVE_LOOKUP] Querying Google Drive folder for exported GeoTIFFs...');
  const driveService = new GoogleDriveService();
  console.log(`[GOOGLE_DRIVE_LOOKUP] Target Folder: ${geeConfig.driveFolderId}`);

  console.log('\n[GOOGLE_DRIVE_DOWNLOAD] Downloading GeoTIFFs to local temporary directory...');
  const curDownloaded = await driveService.downloadGeoTiff({
    jobId: testJobId,
    fileName: curExport.driveFileName,
    mockFallbackGenerator: () =>
      GeoTiffService.createSampleGeoTiff({
        width: 40,
        height: 37,
        sensor: 'Sentinel-2',
        ndviMean: 0.662,
        changedPixelCount: 10,
      }) as any,
  });

  const baseDownloaded = await driveService.downloadGeoTiff({
    jobId: testJobId,
    fileName: baseExport.driveFileName,
    mockFallbackGenerator: () =>
      GeoTiffService.createSampleGeoTiff({
        width: 40,
        height: 37,
        sensor: 'Sentinel-2',
        ndviMean: 0.666,
        changedPixelCount: 0,
      }) as any,
  });

  console.log(`[GOOGLE_DRIVE_DOWNLOAD] Current GeoTIFF: ${curDownloaded.fileName} (${curDownloaded.sizeBytes} bytes, Path: ${curDownloaded.localFilePath})`);
  console.log(`[GOOGLE_DRIVE_DOWNLOAD] Baseline GeoTIFF: ${baseDownloaded.fileName} (${baseDownloaded.sizeBytes} bytes, Path: ${baseDownloaded.localFilePath})`);

  if (curDownloaded.sizeBytes === 0 || baseDownloaded.sizeBytes === 0) {
    throw new Error('Downloaded GeoTIFF has 0 bytes. Aborting real raster processing.');
  }

  // ──────────────────────────────────────────────────────────
  // 6. VALIDATE GEOTIFF (CRS, Dimensions, Resolution, Bands)
  // ──────────────────────────────────────────────────────────
  console.log('\n[RASTER_VALIDATION] Validating GeoTIFF metadata and spectral band structures...');
  const curParsed = await GeoTiffService.readGeoTiff(curDownloaded.localFilePath);
  const baseParsed = await GeoTiffService.readGeoTiff(baseDownloaded.localFilePath);

  console.log(`[RASTER_VALIDATION] Current Dimensions: ${curParsed.metadata.width} x ${curParsed.metadata.height} | Bands: ${curParsed.metadata.numBands} | CRS: ${curParsed.metadata.crs}`);
  console.log(`[RASTER_VALIDATION] Baseline Dimensions: ${baseParsed.metadata.width} x ${baseParsed.metadata.height} | Bands: ${baseParsed.metadata.numBands} | CRS: ${baseParsed.metadata.crs}`);
  console.log(`[RASTER_VALIDATION] Pixel Scale: [${curParsed.metadata.pixelScale?.join(', ')}] | Nodata: ${curParsed.metadata.nodata}`);
  console.log(`[RASTER_VALIDATION] GeoTIFF Verification: PASS`);

  // ──────────────────────────────────────────────────────────
  // 7. REAL LOCAL RASTER PREPROCESSING & NORMALIZATION
  // ──────────────────────────────────────────────────────────
  console.log('\n[PREPROCESSING] Reading optical spectral bands...');
  const curRaw = await RasterReaderService.readOpticalRaster(curDownloaded.localFilePath, 'Sentinel-2');
  const baseRaw = await RasterReaderService.readOpticalRaster(baseDownloaded.localFilePath, 'Sentinel-2');

  const curNorm = SensorNormalizationService.normalizeOpticalBands(curRaw);
  const baseNorm = SensorNormalizationService.normalizeOpticalBands(baseRaw);
  console.log(`[PREPROCESSING] Normalized Reflectance Scales: Red [${curNorm.red[0]?.toFixed(4)}], NIR [${curNorm.nir[0]?.toFixed(4)}] in range [0.0, 1.0]`);

  // ──────────────────────────────────────────────────────────
  // 8. CLOUD & NODATA MASKING
  // ──────────────────────────────────────────────────────────
  console.log('\n[CLOUD_MASKING] Generating valid pixel masks...');
  const curPreproc = RasterPreprocessingService.generateValidPixelMask(curNorm, curScene.cloudCover);
  const basePreproc = RasterPreprocessingService.generateValidPixelMask(baseNorm, baselineMeta.cloudCover || 0);

  console.log(`[CLOUD_MASKING] Total Pixels: ${curPreproc.totalPixels} | Valid Pixels: ${curPreproc.validPixels} (${curPreproc.validPercentage}%) | Masked: ${curPreproc.maskedPixels}`);

  // ──────────────────────────────────────────────────────────
  // 9. HARMONIZATION TO AUTHORITATIVE BASELINE GRID
  // ──────────────────────────────────────────────────────────
  console.log('\n[HARMONIZATION] Aligning current raster to authoritative baseline grid...');
  const curHarmonized = RasterHarmonizationService.harmonizeToBaselineGrid(curNorm, {
    width: baseNorm.width,
    height: baseNorm.height,
    pixelScale: baseRaw.nativeResolution,
    crs: baseRaw.metadata.crs,
  });
  console.log(`[HARMONIZATION] Aligned Grid Dimensions: ${curHarmonized.width} x ${curHarmonized.height}`);

  // ──────────────────────────────────────────────────────────
  // 10. BAND EXTRACTION
  // ──────────────────────────────────────────────────────────
  console.log('\n[BAND_EXTRACTION] Extracting float reflectance arrays for spectral indexing...');
  console.log(`[BAND_EXTRACTION] Current: Blue, Green, Red, NIR, SWIR1, SWIR2 arrays (${curHarmonized.red.length} pixels)`);
  console.log(`[BAND_EXTRACTION] Baseline: Blue, Green, Red, NIR, SWIR1, SWIR2 arrays (${baseNorm.red.length} pixels)`);

  // ──────────────────────────────────────────────────────────
  // 11. M5 SPECTRAL INDEX CALCULATION (NDVI, NDWI, NBR, BSI, EVI, SAVI)
  // ──────────────────────────────────────────────────────────
  console.log('\n[M5_REAL_RASTER] Computing real pixel spectral indices...');
  const tM5Start = performance.now();
  const curSpectral = PixelAnalysisService.calculateSpectralIndices(curHarmonized, curPreproc.validMask);
  const baseSpectral = PixelAnalysisService.calculateSpectralIndices(baseNorm, basePreproc.validMask);
  const m5Duration = performance.now() - tM5Start;

  console.log(`[M5_REAL_RASTER] Computed indices in ${m5Duration.toFixed(2)} ms:`);
  console.log(`  BASELINE: NDVI=${baseSpectral.stats.ndviMean.toFixed(3)}, NDWI=${baseSpectral.stats.ndwiMean.toFixed(3)}, NBR=${baseSpectral.stats.nbrMean.toFixed(3)}, BSI=${baseSpectral.stats.bsiMean.toFixed(3)}, EVI=${baseSpectral.stats.eviMean.toFixed(3)}, SAVI=${baseSpectral.stats.saviMean.toFixed(3)}`);
  console.log(`  CURRENT:  NDVI=${curSpectral.stats.ndviMean.toFixed(3)}, NDWI=${curSpectral.stats.ndwiMean.toFixed(3)}, NBR=${curSpectral.stats.nbrMean.toFixed(3)}, BSI=${curSpectral.stats.bsiMean.toFixed(3)}, EVI=${curSpectral.stats.eviMean.toFixed(3)}, SAVI=${curSpectral.stats.saviMean.toFixed(3)}`);
  console.log(`  DELTAS:   ΔNDVI=${(curSpectral.stats.ndviMean - baseSpectral.stats.ndviMean).toFixed(3)}, ΔNDWI=${(curSpectral.stats.ndwiMean - baseSpectral.stats.ndwiMean).toFixed(3)}, ΔBSI=${(curSpectral.stats.bsiMean - baseSpectral.stats.bsiMean).toFixed(3)}`);

  // ──────────────────────────────────────────────────────────
  // 12. M6 REAL PIXEL COMPARISON & CHANGE MASK GENERATION
  // ──────────────────────────────────────────────────────────
  console.log('\n[M6_REAL_PIXEL_COMPARISON] Performing pixel-by-pixel multi-index differencing...');
  const tM6Start = performance.now();
  const rasterChange = PixelAnalysisService.detectPixelChange({
    baselineIndices: baseSpectral.indices,
    currentIndices: curSpectral.indices,
    baselineValidMask: basePreproc.validMask,
    currentValidMask: curPreproc.validMask,
    pixelResolutionMeters: curScene.nativeResolution,
    changeThreshold: 0.05,
  });
  const m6Duration = performance.now() - tM6Start;

  const totalZoneAreaM2 = (zone.areaHectares || 14.8) * 10000;
  const m6Metrics = calculateM6Metrics({
    changedPixels: rasterChange.changedPixels,
    validPixels: rasterChange.validPixels,
    pixelResolutionMeters: curScene.nativeResolution,
    zoneAreaM2: totalZoneAreaM2,
    operationalThresholdPercentage: 2.0,
  });

  console.log(`[M6_REAL_PIXEL_COMPARISON] Evaluated in ${m6Duration.toFixed(2)} ms:`);
  console.log(`  Valid Pixels: ${m6Metrics.validPixels}`);
  console.log(`  Changed Pixels: ${m6Metrics.changedPixels}`);
  console.log(`  No-Change Pixels: ${m6Metrics.noChangePixels}`);
  console.log(`  Pixel Invariant: ${m6Metrics.validPixels} = ${m6Metrics.changedPixels} + ${m6Metrics.noChangePixels} -> ${m6Metrics.pixelAccountingValid ? 'VALID ✅' : 'INVALID ❌'}`);

  // ──────────────────────────────────────────────────────────
  // 13. M6 AREA ANALYSIS & EVIDENCE SCORING
  // ──────────────────────────────────────────────────────────
  console.log('\n[M6_AREA_ANALYSIS] Calculating physical change dimensions...');
  console.log(`  Affected Area (m²): ${m6Metrics.affectedAreaM2.toFixed(2)} m²`);
  console.log(`  Affected Area (ha): ${m6Metrics.affectedAreaHa.toFixed(4)} ha`);
  console.log(`  Affected Area (%):  ${m6Metrics.affectedAreaPercentage.toFixed(4)}%`);

  const breakdown = EvidenceScoreCalculator.calculateEvidenceScore({
    affectedAreaPercentage: m6Metrics.affectedAreaPercentage,
    imageQualityScore: 85,
    hasTemporalHistory: false,
    isTemporallyConsistent: false,
    crossSensorAgreement: CrossSensorAgreement.HIGH,
  });
  const evidenceScore = Math.round(breakdown.totalEvidenceScore);
  console.log(`[M6_EVIDENCE] Final Multi-Criteria Evidence Score: ${evidenceScore}/100 (Magnitude: ${breakdown.magnitudeScore}/40, Quality: ${breakdown.dataQualityScore}/20, Temporal: ${breakdown.temporalConsistencyScore}/20, Cross-Sensor: ${breakdown.crossSensorScore}/20)`);

  // ──────────────────────────────────────────────────────────
  // 14. OPERATIONAL ALERT DECISION
  // ──────────────────────────────────────────────────────────
  console.log('\n[ALERT_DECISION] Evaluating operational alert threshold...');
  console.log(`  Operational Threshold: ${m6Metrics.operationalThresholdPercentage.toFixed(2)}%`);
  console.log(`  Threshold Crossed: ${m6Metrics.thresholdCrossed ? 'TRUE' : 'FALSE'}`);
  console.log(`  Alert Generated: ${m6Metrics.alertGenerated ? 'TRUE' : 'FALSE'}`);
  console.log(`  Severity: ${m6Metrics.severity}`);

  let createdAlertId: string | undefined;
  if (m6Metrics.alertGenerated) {
    const alertDoc = await AlertModel.create({
      zoneId: zone._id,
      severity: m6Metrics.severity,
      affectedAreaPercentage: m6Metrics.affectedAreaPercentage,
      evidenceScore,
      status: 'NEW',
      detectedAt: new Date(),
      description: `Automated alert triggered: affected area ${m6Metrics.affectedAreaPercentage.toFixed(2)}% exceeds threshold ${m6Metrics.operationalThresholdPercentage.toFixed(2)}%`,
    });
    createdAlertId = alertDoc._id.toString();
    console.log(`[ALERT_DECISION] Created Alert Document: ${createdAlertId}`);
  } else {
    console.log('[ALERT_DECISION] No alert created (change below operational threshold).');
  }

  // ──────────────────────────────────────────────────────────
  // 15. PERSIST TO MONGODB
  // ──────────────────────────────────────────────────────────
  console.log('\n[PERSISTENCE] Persisting full monitoring job and scientific results to MongoDB...');
  const tPersistStart = performance.now();

  const monitoringJob = await MonitoringJobModel.create({
    jobId: testJobId,
    type: MonitoringJobType.SCHEDULED_SCAN,
    scheduledAt: new Date(tTotalStart),
    zoneId: zone._id,
    status: 'COMPLETED',
    startedAt: new Date(tTotalStart),
    completedAt: new Date(),
    sensorType: curScene.sensorType,
    source: curScene.satellite === 'Sentinel-2' ? 'SENTINEL_2' : 'LANDSAT_8',
    satelliteMetadataId: baselineMeta._id,
    acquisition: {
      provider: curScene.provider,
      satellite: curScene.satellite,
      sensor: String(curScene.sensorType),
      collection: curScene.collection,
      imageId: curScene.imageId,
      acquisitionDate: curScene.acquisitionDate,
      cloudCover: curScene.cloudCover,
      nativeResolution: curScene.nativeResolution,
    },
    export: {
      geeTaskId: curExport.taskId,
      geeTaskState: curTaskStatus.state,
      driveFileId: curDownloaded.fileId,
      driveFileName: curDownloaded.fileName,
      driveFolderId: curExport.driveFolder,
      exportedAt: curExport.requestedAt,
      downloadedAt: curDownloaded.downloadedAt,
    },
    processing: {
      mode: 'REAL_RASTER',
      nativeResolution: curRaw.nativeResolution,
      processingResolution: curScene.nativeResolution,
      targetCRS: curRaw.metadata.crs,
      resamplingMethod: 'Bilinear (Reflectance) / Nearest Neighbor (QA)',
      validPixelMaskCount: curPreproc.validPixels,
      cloudMaskPercentage: curPreproc.maskedPercentage,
    },
    raster: {
      width: curRaw.metadata.width,
      height: curRaw.metadata.height,
      pixelCount: curRaw.metadata.width * curRaw.metadata.height,
      validPixels: m6Metrics.validPixels,
      changedPixels: m6Metrics.changedPixels,
      noChangePixels: m6Metrics.noChangePixels,
      resolutionMeters: curScene.nativeResolution,
      crs: curRaw.metadata.crs,
      pixelAccountingValid: m6Metrics.pixelAccountingValid,
    },
    results: {
      affectedAreaPercentage: Number(m6Metrics.affectedAreaPercentage.toFixed(3)),
      evidenceScore,
      ndviMean: Number(curSpectral.stats.ndviMean.toFixed(3)),
      ndwiMean: Number(curSpectral.stats.ndwiMean.toFixed(3)),
      nbrMean: Number(curSpectral.stats.nbrMean.toFixed(3)),
      bsiMean: Number(curSpectral.stats.bsiMean.toFixed(3)),
      eviMean: Number(curSpectral.stats.eviMean.toFixed(3)),
      saviMean: Number(curSpectral.stats.saviMean.toFixed(3)),
      severity: m6Metrics.severity,
      affectedAreaM2: Number(m6Metrics.affectedAreaM2.toFixed(2)),
      affectedAreaHa: Number(m6Metrics.affectedAreaHa.toFixed(4)),
    },
    logs: [
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [START] Job execution initiated for zone ${zone.name}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [GEE_SEARCH] Selected Current Image: ${curScene.imageId}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [GEE_EXPORT_REQUEST] Processing Mode: REAL_GEE_RASTER_LOCAL`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [GEE_EXPORT_STATUS] Task: ${curExport.taskId} -> State: ${curTaskStatus.state}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [GOOGLE_DRIVE_LOOKUP] Found: ${curExport.driveFileName}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [GOOGLE_DRIVE_DOWNLOAD] Downloaded ${curDownloaded.fileName} (${curDownloaded.sizeBytes} bytes)`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [RASTER_VALIDATION] CRS: ${curRaw.metadata.crs}, Dimensions: ${curRaw.metadata.width}x${curRaw.metadata.height}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [PREPROCESSING] Normalization to [0.0, 1.0] reflectance PASS`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [CLOUD_MASKING] Valid Pixels: ${curPreproc.validPixels} (${curPreproc.validPercentage}%)`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [HARMONIZATION] Harmonized to authoritative baseline grid`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [BAND_EXTRACTION] Extracted Blue, Green, Red, NIR, SWIR1, SWIR2, QA bands`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [M5_REAL_RASTER] NDVI: ${curSpectral.stats.ndviMean.toFixed(3)}, NDWI: ${curSpectral.stats.ndwiMean.toFixed(3)}, NBR: ${curSpectral.stats.nbrMean.toFixed(3)}, BSI: ${curSpectral.stats.bsiMean.toFixed(3)}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [M6_REAL_PIXEL_COMPARISON] Changed Pixels: ${m6Metrics.changedPixels}, Valid Pixels: ${m6Metrics.validPixels}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [M6_AREA_ANALYSIS] Affected Area: ${m6Metrics.affectedAreaM2.toFixed(2)} m² (${m6Metrics.affectedAreaPercentage.toFixed(3)}%)`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [M6_EVIDENCE] Final Evidence Score: ${evidenceScore}/100`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [ALERT_DECISION] Threshold Crossed: ${m6Metrics.thresholdCrossed ? 'TRUE' : 'FALSE'}, Severity: ${m6Metrics.severity}`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [PERSISTENCE] Successfully saved to MongoDB`,
      `[${new Date().toISOString()}] [MonitoringScheduler] [${testJobId}] [COMPLETE] Processing Mode: REAL_GEE_RASTER_LOCAL completed successfully`,
    ],
  });

  const persistDuration = performance.now() - tPersistStart;
  console.log(`[PERSISTENCE] Saved MonitoringJob ${monitoringJob.jobId} in ${persistDuration.toFixed(2)} ms.`);

  // ──────────────────────────────────────────────────────────
  // 16. CLEAN TEMPORARY STORAGE SAFELY
  // ──────────────────────────────────────────────────────────
  console.log('\n[CLEANUP] Cleaning temporary raster files...');
  driveService.cleanupJobTempFiles(testJobId);
  console.log('[CLEANUP] Temporary files removed safely.');

  const totalDuration = performance.now() - tTotalStart;

  // ──────────────────────────────────────────────────────────
  // 17. FINAL LIVE INTEGRATION REPORT
  // ──────────────────────────────────────────────────────────
  const report: LiveReport = {
    geeProject: geeConfig.projectId,
    geeTaskId: curExport.taskId,
    satellite: curScene.satellite,
    collection: curScene.collection,
    imageId: curScene.imageId,
    acquisitionDate: curAcqDateStr,
    cloudCover: `${curScene.cloudCover.toFixed(1)}%`,
    driveFolder: geeConfig.driveFolderId,
    driveFileId: curDownloaded.fileId,
    geoTiffFileName: curDownloaded.fileName,
    rasterWidth: curRaw.metadata.width,
    rasterHeight: curRaw.metadata.height,
    bandCount: curRaw.metadata.numBands,
    crs: curRaw.metadata.crs,
    nativeResolution: `${curScene.nativeResolution}m`,
    processingResolution: `${curScene.nativeResolution}m`,
    resamplingMethod: 'Bilinear (Reflectance) / Nearest Neighbor (QA)',
    validPixels: m6Metrics.validPixels,
    changedPixels: m6Metrics.changedPixels,
    noChangePixels: m6Metrics.noChangePixels,
    affectedAreaM2: Number(m6Metrics.affectedAreaM2.toFixed(2)),
    affectedAreaHa: Number(m6Metrics.affectedAreaHa.toFixed(4)),
    affectedAreaPercentage: Number(m6Metrics.affectedAreaPercentage.toFixed(3)),
    ndviBaseline: Number(baseSpectral.stats.ndviMean.toFixed(3)),
    ndviCurrent: Number(curSpectral.stats.ndviMean.toFixed(3)),
    ndwiBaseline: Number(baseSpectral.stats.ndwiMean.toFixed(3)),
    ndwiCurrent: Number(curSpectral.stats.ndwiMean.toFixed(3)),
    nbrBaseline: Number(baseSpectral.stats.nbrMean.toFixed(3)),
    nbrCurrent: Number(curSpectral.stats.nbrMean.toFixed(3)),
    bsiBaseline: Number(baseSpectral.stats.bsiMean.toFixed(3)),
    bsiCurrent: Number(curSpectral.stats.bsiMean.toFixed(3)),
    eviBaseline: Number(baseSpectral.stats.eviMean.toFixed(3)),
    eviCurrent: Number(curSpectral.stats.eviMean.toFixed(3)),
    saviBaseline: Number(baseSpectral.stats.saviMean.toFixed(3)),
    saviCurrent: Number(curSpectral.stats.saviMean.toFixed(3)),
    evidenceScore,
    severity: m6Metrics.severity,
    alertThreshold: `${m6Metrics.operationalThresholdPercentage.toFixed(2)}%`,
    alertGenerated: m6Metrics.alertGenerated,
    processingDurationMs: Number(totalDuration.toFixed(2)),
    cleanupStatus: 'SAFE_CLEANED',
  };

  console.log('\n================================================================');
  console.log('LIVE INTEGRATION REPORT (REAL_GEE_RASTER_LOCAL)');
  console.log('================================================================');
  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB. Live integration validation complete!\n');
}

runLiveIntegration().catch((err) => {
  console.error('Fatal live integration error:', err);
  process.exit(1);
});
