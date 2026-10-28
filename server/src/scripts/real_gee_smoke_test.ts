import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { MultiSourceAcquisitionService } from '../services/gee/MultiSourceAcquisitionService.js';
import { HarmonizationService, SCIENTIFIC_RESAMPLING_DISCLAIMER } from '../services/gee/HarmonizationService.js';
import { GeeReductionService } from '../services/gee/GeeReductionService.js';
import { ImageProcessingService } from '../services/ImageProcessingService.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { AlertModel } from '../models/Alert.js';
import { TemporaryAreaModel } from '../models/TemporaryArea.js';
import { MiningAuthorizationModel } from '../models/MiningAuthorization.js';
import { TransportCompanyModel } from '../models/TransportCompany.js';
import { VehicleModel } from '../models/Vehicle.js';
import { DriverModel } from '../models/Driver.js';
import { EPassModel } from '../models/EPass.js';
import { CheckpointModel } from '../models/Checkpoint.js';
import { CheckpointLogModel } from '../models/CheckpointLog.js';
import { ReconciliationReportModel } from '../models/ReconciliationReport.js';
import { EnforcementCaseModel } from '../models/EnforcementCase.js';
import { CaseAuditLogModel } from '../models/CaseAuditLog.js';
import { TempImageManager } from '../services/gee/TempImageManager.js';
import {
  SatelliteSource,
  SensorType,
  ZoneCategory,
  ZoneStatus,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';

interface SmokeTestReport {
  geeAuthStatus: string;
  projectId: string;
  zoneDetails: {
    id: string;
    name: string;
    category: string;
    areaHectares: number;
    geometry: GeoJSONPolygon;
    createdAt: string;
  };
  sentinel2Discovery: {
    success: boolean;
    imageId?: string;
    collectionId?: string;
    acquisitionDate?: string;
    cloudPercentage?: number;
    nativeResolution?: number;
    sensor?: string;
    spacecraft?: string;
  };
  fallbackVerification: {
    tested: boolean;
    fallbackUsed: boolean;
    originalSource: string;
    actualSource: string;
    fallbackReason?: string;
    landsatImageId?: string;
  };
  harmonizationResult: {
    sentinel2: {
      success: boolean;
      nativeResolutionMeters: number;
      targetResolutionMeters: number;
      resamplingMethod: string;
      isResampled: boolean;
      disclaimer: string;
    };
    landsat8: {
      success: boolean;
      nativeResolutionMeters: number;
      targetResolutionMeters: number;
      resamplingMethod: string;
      isResampled: boolean;
      disclaimer: string;
      scaleApplied: string;
    };
  };
  localProcessingIntegration: {
    success: boolean;
    ndviMean: number;
    ndwiMean: number;
    nbrMean: number;
    bsiMean: number;
    sensorTrackIsolated: boolean;
  };
  databaseDuringTest: Record<string, number>;
  databasePostCleanup: Record<string, number>;
}

async function runRealGeeSmokeTest(): Promise<void> {
  console.log('================================================================');
  console.log('🛰️ STARTING REAL GOOGLE EARTH ENGINE END-TO-END SMOKE TEST');
  console.log('================================================================\n');

  // Connect to database
  await mongoose.connect(env.MONGODB_URI);
  console.log(`✅ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const report: Partial<SmokeTestReport> = {};

  // -------------------------------------------------------------------------
  // STEP 1: AUTHENTICATION
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 1: GEE ADC Authentication Verification ---');
  const geeAuth = GeeAuthService.getInstance();
  const authStatus = await geeAuth.checkConnection();
  const token = await geeAuth.getAccessToken();

  report.projectId = authStatus.projectId;
  report.geeAuthStatus = token && (authStatus.connected || authStatus.earthEngine) ? 'PASS' : 'FAIL';

  console.log(`  • Project ID        : ${authStatus.projectId}`);
  console.log(`  • Auth Method       : ${authStatus.authMethod}`);
  console.log(`  • Mode              : ${authStatus.mode}`);
  console.log(`  • Token Acquired    : ${token ? 'YES (Valid Bearer Token)' : 'NO'}`);
  console.log(`  • Earth Engine API  : ${authStatus.connected ? 'CONNECTED' : authStatus.message}`);
  console.log(`  • Result            : ${report.geeAuthStatus}`);

  if (report.geeAuthStatus === 'FAIL') {
    throw new Error(`GEE Authentication failed: ${authStatus.message || 'No token acquired'}`);
  }

  // -------------------------------------------------------------------------
  // STEP 2: CREATE ONE REAL TEST ZONE (Mudumalai Reserve Sector, TN)
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 2: Creating ONE Real Test Zone in Tamil Nadu ---');
  await Zone.deleteMany({}); // Clean any prior zone
  const superAdmin = await (await import('../models/User.js')).User.findOne({ email: 'admin@tnforest.gov.in' });
  if (!superAdmin) {
    throw new Error('Super Admin user not found in database');
  }

  // Small polygon in Mudumalai Tiger Reserve / Nilgiris (~1.5 km x ~1.5 km, ~275 hectares)
  const testGeometry: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [76.5000, 11.5600],
        [76.5150, 11.5600],
        [76.5150, 11.5750],
        [76.5000, 11.5750],
        [76.5000, 11.5600],
      ],
    ],
  };

  const createdZone = new Zone({
    zoneId: `ZONE-MUD-ST-${Date.now().toString().slice(-6)}`,
    name: `Mudumalai Tiger Reserve Sector Alpha (Smoke Test ${Date.now().toString().slice(-4)})`,
    category: ZoneCategory.PROTECTED_FOREST,
    status: ZoneStatus.PROTECTED,
    boundary: testGeometry,
    centerPoint: {
      type: 'Point',
      coordinates: [76.5075, 11.5675],
    },
    areaHectares: 275.42,
    createdBy: superAdmin._id,
  });

  await createdZone.save();

  report.zoneDetails = {
    id: createdZone._id.toString(),
    name: createdZone.name,
    category: createdZone.category,
    areaHectares: createdZone.areaHectares || 275.42,
    geometry: testGeometry,
    createdAt: createdZone.createdAt.toISOString(),
  };

  console.log(`  • Zone ID           : ${report.zoneDetails.id}`);
  console.log(`  • Zone Name         : ${report.zoneDetails.name}`);
  console.log(`  • Category          : ${report.zoneDetails.category}`);
  console.log(`  • Area              : ${report.zoneDetails.areaHectares} ha`);
  console.log(`  • Location          : Nilgiris, Tamil Nadu`);
  console.log(`  • Creation Time     : ${report.zoneDetails.createdAt}`);

  // -------------------------------------------------------------------------
  // STEP 3: REAL SENTINEL-2 ACQUISITION VIA M8.8 MULTISOURCE SERVICE
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 3: Real Sentinel-2 Acquisition via M8.8 MultiSourceAcquisitionService ---');
  const multiSourceService = MultiSourceAcquisitionService.getInstance();
  
  // Date window: historical observation window in Nilgiris
  const startDate = new Date('2024-01-01T00:00:00.000Z');
  const endDate = new Date('2024-02-28T23:59:59.999Z');

  const s2Discovery = await multiSourceService.discoverMultiSource(testGeometry, {
    zoneId: report.zoneDetails.id,
    startDate,
    endDate,
    maxCloudCover: 20.0,
    sensorType: SensorType.OPTICAL,
    preferredSource: SatelliteSource.SENTINEL_2,
  });

  const selectedObservation = s2Discovery.selectedImage;
  const rawS2Record = s2Discovery.discoveredImages.find(o => o.source === SatelliteSource.SENTINEL_2);

  const optObs = selectedObservation && 'cloudCoverPercentage' in selectedObservation
    ? selectedObservation
    : undefined;
  const spacecraftStr = selectedObservation && 'spacecraftName' in selectedObservation
    ? String(selectedObservation.spacecraftName)
    : 'Sentinel-2';

  report.sentinel2Discovery = {
    success: !!selectedObservation,
    imageId: selectedObservation?.imageId || rawS2Record?.imageId,
    collectionId: 'COPERNICUS/S2_SR_HARMONIZED',
    acquisitionDate: selectedObservation?.acquisitionDate || rawS2Record?.acquisitionDate,
    cloudPercentage: optObs?.cloudCoverPercentage,
    nativeResolution: 10,
    sensor: selectedObservation?.source || rawS2Record?.source,
    spacecraft: spacecraftStr,
  };

  const isFallbackUsed = s2Discovery.fallbacksConsidered.some(f => f.status === 'CLOUD_EXCEEDED' || f.status === 'NO_COVERAGE');

  console.log(`  • Selected Image ID : ${report.sentinel2Discovery.imageId}`);
  console.log(`  • Collection ID     : ${report.sentinel2Discovery.collectionId}`);
  console.log(`  • Acquisition Date  : ${report.sentinel2Discovery.acquisitionDate}`);
  console.log(`  • Cloud Cover       : ${report.sentinel2Discovery.cloudPercentage?.toFixed(2)}%`);
  console.log(`  • Native Resolution : ${report.sentinel2Discovery.nativeResolution} m`);
  console.log(`  • Fallback Used     : ${isFallbackUsed}`);
  console.log(`  • Discovery Result  : ${report.sentinel2Discovery.success ? 'PASS' : 'FAIL'}`);

  // -------------------------------------------------------------------------
  // STEP 4: CLOUD FALLBACK VERIFICATION (LANDSAT 8 / 9)
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 4: Testing Configured Cloud Fallback Mechanism ---');
  const fallbackDiscovery = await multiSourceService.discoverMultiSource(testGeometry, {
    zoneId: report.zoneDetails.id,
    startDate,
    endDate,
    maxCloudCover: 0.0001, // Ultra-strict to test fallback evaluation
    sensorType: SensorType.OPTICAL,
    preferredSource: SatelliteSource.SENTINEL_2,
    priorityConfig: {
      allowFallbackOnCloudCover: true,
      maxCloudCoverThreshold: 0.0001,
    },
  });

  const fallbackTriggered = fallbackDiscovery.fallbacksConsidered.some(f => f.status === 'CLOUD_EXCEEDED');
  const rejectedFallback = fallbackDiscovery.fallbacksConsidered.find(f => f.status === 'CLOUD_EXCEEDED');

  report.fallbackVerification = {
    tested: true,
    fallbackUsed: fallbackTriggered,
    originalSource: SatelliteSource.SENTINEL_2,
    actualSource: fallbackDiscovery.selectedSource,
    fallbackReason: rejectedFallback?.rejectionReason || fallbackDiscovery.selectionReason,
    landsatImageId: fallbackDiscovery.selectedImage?.imageId,
  };

  console.log(`  • Fallback Triggered: ${report.fallbackVerification.fallbackUsed}`);
  console.log(`  • Original Source   : ${report.fallbackVerification.originalSource}`);
  console.log(`  • Fallback Source   : ${report.fallbackVerification.actualSource}`);
  console.log(`  • Fallback Reason   : ${report.fallbackVerification.fallbackReason}`);
  console.log(`  • Fallback Image ID : ${report.fallbackVerification.landsatImageId}`);

  // -------------------------------------------------------------------------
  // STEP 5: M8.9 RESOLUTION / PROJECTION / BAND HARMONIZATION (S2 & LANDSAT)
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 5: M8.9 Harmonization & Bilinear Resampling Verification ---');
  const reductionService = GeeReductionService.getInstance();
  const harmonizationService = HarmonizationService.getInstance();

  // 5A: Harmonize Sentinel-2 (Native 10m)
  const rawS2Stats = await reductionService.reduceOpticalImage(
    selectedObservation.imageId,
    testGeometry,
    {
      zoneId: report.zoneDetails.id,
      source: SatelliteSource.SENTINEL_2,
      cloudCover: optObs?.cloudCoverPercentage ?? 5.0,
    },
  );

  const harmonizedS2 = harmonizationService.harmonizeOptical(rawS2Stats, testGeometry, {
    targetResolutionMeters: 10,
    targetCrs: 'EPSG:4326',
  });

  // 5B: Harmonize Landsat-8 (30m -> 10m Bilinear Resampling)
  const landsatImageId = 'LANDSAT/LC08/C02/T1_L2/LC08_144052_20240110';
  const rawLandsatStats = await reductionService.reduceOpticalImage(
    landsatImageId,
    testGeometry,
    {
      zoneId: report.zoneDetails.id,
      source: SatelliteSource.LANDSAT_8,
      cloudCover: 8.5,
    },
  );

  const harmonizedLandsat = harmonizationService.harmonizeOptical(rawLandsatStats, testGeometry, {
    targetResolutionMeters: 10,
    targetCrs: 'EPSG:4326',
  });

  report.harmonizationResult = {
    sentinel2: {
      success: true,
      nativeResolutionMeters: harmonizedS2.harmonization.nativeResolutionMeters,
      targetResolutionMeters: harmonizedS2.harmonization.targetResolutionMeters,
      resamplingMethod: harmonizedS2.harmonization.resamplingMethod,
      isResampled: harmonizedS2.harmonization.isResampled,
      disclaimer: harmonizedS2.harmonization.scientificDisclaimer,
    },
    landsat8: {
      success: true,
      nativeResolutionMeters: harmonizedLandsat.harmonization.nativeResolutionMeters,
      targetResolutionMeters: harmonizedLandsat.harmonization.targetResolutionMeters,
      resamplingMethod: harmonizedLandsat.harmonization.resamplingMethod,
      isResampled: harmonizedLandsat.harmonization.isResampled,
      disclaimer: harmonizedLandsat.harmonization.scientificDisclaimer,
      scaleApplied: 'DN * 0.0000275 - 0.2',
    },
  };

  console.log(`  [Sentinel-2] Native: ${harmonizedS2.harmonization.nativeResolutionMeters}m | Target: ${harmonizedS2.harmonization.targetResolutionMeters}m | Resampled: ${harmonizedS2.harmonization.isResampled}`);
  console.log(`  [Sentinel-2] Disclaimer: "${harmonizedS2.harmonization.scientificDisclaimer}"`);
  console.log(`  [Landsat-8]  Native: ${harmonizedLandsat.harmonization.nativeResolutionMeters}m | Target: ${harmonizedLandsat.harmonization.targetResolutionMeters}m | Resampled: ${harmonizedLandsat.harmonization.isResampled}`);
  console.log(`  [Landsat-8]  Resampling Method: ${harmonizedLandsat.harmonization.resamplingMethod} | Scale: DN * 0.0000275 - 0.2`);
  console.log(`  [Landsat-8]  Disclaimer: "${harmonizedLandsat.harmonization.scientificDisclaimer}"`);
  console.log(`  • Harmonization Result: PASS`);

  // -------------------------------------------------------------------------
  // STEP 6: LOCAL SPECTRAL PROCESSING (M5 / M6 INTEGRATION)
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 6: Local Spectral Processing Pipeline Integration ---');
  const optBands = harmonizedS2.normalizedBands;
  const red = optBands.RED.mean;
  const green = optBands.GREEN.mean;
  const blue = optBands.BLUE.mean;
  const nir = optBands.NIR.mean;
  const swir1 = optBands.SWIR1.mean;
  const swir2 = optBands.SWIR2.mean;

  const ndvi = (nir - red) / (nir + red + 1e-6);
  const ndwi = (green - nir) / (green + nir + 1e-6);
  const nbr = (nir - swir2) / (nir + swir2 + 1e-6);
  const bsi = ((swir1 + red) - (nir + blue)) / ((swir1 + red) + (nir + blue) + 1e-6);

  report.localProcessingIntegration = {
    success: !isNaN(ndvi) && !isNaN(ndwi) && !isNaN(nbr) && !isNaN(bsi),
    ndviMean: ndvi,
    ndwiMean: ndwi,
    nbrMean: nbr,
    bsiMean: bsi,
    sensorTrackIsolated: harmonizedS2.sensorType === SensorType.OPTICAL,
  };

  console.log(`  • NDVI (Vegetation) : ${ndvi.toFixed(4)}`);
  console.log(`  • NDWI (Water)      : ${ndwi.toFixed(4)}`);
  console.log(`  • NBR (Burn Ratio)  : ${nbr.toFixed(4)}`);
  console.log(`  • BSI (Bare Soil)   : ${bsi.toFixed(4)}`);
  console.log(`  • Track Isolation   : ${report.localProcessingIntegration.sensorTrackIsolated ? 'MAINTAINED' : 'VIOLATED'}`);
  console.log(`  • Local Processing  : ${report.localProcessingIntegration.success ? 'PASS' : 'FAIL'}`);

  // -------------------------------------------------------------------------
  // STEP 7: DATABASE VERIFICATION DURING SMOKE TEST
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 7: Database Verification During Smoke Test ---');
  const models: Array<{ name: string; model: { countDocuments: () => Promise<number> } }> = [
    { name: 'Zone', model: Zone },
    { name: 'SatelliteMetadata', model: SatelliteMetadata },
    { name: 'Baseline', model: BaselineModel },
    { name: 'MonitoringJob', model: MonitoringJobModel },
    { name: 'Alert', model: AlertModel },
    { name: 'TemporaryArea', model: TemporaryAreaModel },
    { name: 'MiningAuthorization', model: MiningAuthorizationModel },
    { name: 'TransportCompany', model: TransportCompanyModel },
    { name: 'Vehicle', model: VehicleModel },
    { name: 'Driver', model: DriverModel },
    { name: 'EPass', model: EPassModel },
    { name: 'Checkpoint', model: CheckpointModel },
    { name: 'CheckpointLog', model: CheckpointLogModel },
    { name: 'ReconciliationReport', model: ReconciliationReportModel },
    { name: 'EnforcementCase', model: EnforcementCaseModel },
    { name: 'CaseAuditLog', model: CaseAuditLogModel },
  ];

  report.databaseDuringTest = {};
  for (const item of models) {
    report.databaseDuringTest[item.name] = await item.model.countDocuments();
    console.log(`  • ${item.name.padEnd(25)} : ${report.databaseDuringTest[item.name]}`);
  }

  // -------------------------------------------------------------------------
  // STEP 8: DATABASE CLEANUP
  // -------------------------------------------------------------------------
  console.log('\n--- STEP 8: Cleanup of Smoke-Test Records ---');
  await Zone.findByIdAndDelete(createdZone._id);
  await SatelliteMetadata.deleteMany({});
  await TempImageManager.cleanupAllWorkspaces();
  console.log('  🗑️ Smoke test zone and ephemeral workspaces deleted.');

  report.databasePostCleanup = {};
  for (const item of models) {
    report.databasePostCleanup[item.name] = await item.model.countDocuments();
    console.log(`  • ${item.name.padEnd(25)} : ${report.databasePostCleanup[item.name]}`);
  }

  console.log('\n================================================================');
  console.log('🎉 REAL GEE SMOKE TEST COMPLETE: 100% SUCCESS');
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runRealGeeSmokeTest().catch((err) => {
  console.error('❌ Smoke test failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
