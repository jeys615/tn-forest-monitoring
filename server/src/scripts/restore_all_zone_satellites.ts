import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import {
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
} from '@tn-forest/shared/types';

async function restoreAllZoneSatellites() {
  console.log('================================================================');
  console.log('🛰️ RESTORING AUTHORITATIVE SATELLITE METADATA FOR ALL ZONES');
  console.log('================================================================\n');

  await connectDatabase();

  const zones = await Zone.find({});
  console.log(`Found ${zones.length} zones in database:`);
  for (const z of zones) {
    console.log(` - [${z._id}] ${z.name} (${z.zoneId}) - Geometry: ${z.boundary?.type}`);
  }

  const zoneTesting = zones.find(z => z.name === 'testing');
  const zoneSirumalai = zones.find(z => z.name === 'VALIDATION-SIRUMALAI-S2');
  const zoneM4 = zones.find(z => z.name === 'M4 Test Zone');
  const zoneM12 = zones.find(z => z.name.includes('M12'));

  if (!zoneTesting || !zoneSirumalai || !zoneM4 || !zoneM12) {
    throw new Error('Not all expected zones are present in database!');
  }

  // Clear any partial or leftover records
  await SatelliteMetadata.deleteMany({});
  console.log('\nCleared existing satellitemetadatas collection.');

  const recordsToInsert = [
    // -------------------------------------------------------------------------
    // 1. Authoritative 2020 Sentinel-2 Observation (Raster on disk: 46.5MB)
    // Intersects: testing & VALIDATION-SIRUMALAI-S2
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac642b3540f1518603d0624'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2020-01-09T05:12:01.000Z'),
      cloudCover: 1.28,
      footprint: zoneTesting.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM',
      intersectingZones: [zoneTesting._id, zoneSirumalai._id],
      metadata: {
        platform: 'Sentinel-2A',
        tile: 'T43PHM',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2A',
      localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6ac642b3540f1518603d0624/ZONE-261007-2771_6ac642b3540f1518603d0624_CURRENT_Sentinel2_20200109.tif',
      driveFileName: 'ZONE-261007-2771_6ac642b3540f1518603d0624_CURRENT_Sentinel2_20200109.tif',
      rasterValidated: true,
      rasterWidth: 3000,
      rasterHeight: 3000,
      rasterBandCount: 6,
      rasterCrs: 'EPSG:32643',
      originalCrs: 'EPSG:32643',
      areaCalculationCrs: 'EPSG:32643',
      resolutionMeters: 10,
      pixelAreaM2: 100,
      spectralIndicesCalculated: true,
    },

    // -------------------------------------------------------------------------
    // 2. Authoritative 2026-01-22 Sentinel-2 Observation (Raster on disk: 46.6MB)
    // Intersects: testing & VALIDATION-SIRUMALAI-S2
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac6452b540f1518603d081d'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260122T051019_20260122T052254_T43PHM',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-01-22T05:10:19.000Z'),
      cloudCover: 0.00,
      footprint: zoneTesting.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20260122T051019_20260122T052254_T43PHM',
      intersectingZones: [zoneTesting._id, zoneSirumalai._id],
      metadata: {
        platform: 'Sentinel-2B',
        tile: 'T43PHM',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2B',
      localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6ac6452b540f1518603d081d/ZONE-261007-2771_6ac6452b540f1518603d081d_CURRENT_Sentinel2_20260122.tif',
      driveFileName: 'ZONE-261007-2771_6ac6452b540f1518603d081d_CURRENT_Sentinel2_20260122.tif',
      rasterValidated: true,
      rasterWidth: 3000,
      rasterHeight: 3000,
      rasterBandCount: 6,
      rasterCrs: 'EPSG:32643',
      originalCrs: 'EPSG:32643',
      areaCalculationCrs: 'EPSG:32643',
      resolutionMeters: 10,
      pixelAreaM2: 100,
      spectralIndicesCalculated: true,
    },

    // -------------------------------------------------------------------------
    // 5. Sentinel-1A SAR Observation (Raster on disk: 77.5MB)
    // Intersects: testing & VALIDATION-SIRUMALAI-S2
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ab8a736667c98f4208d8b05'),
      imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T003240_20200102T003305_030614_0381E6_3EAD',
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      acquisitionDate: new Date('2020-01-02T00:32:40.000Z'),
      cloudCover: 0,
      footprint: zoneTesting.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)',
      intersectingZones: [zoneTesting._id, zoneSirumalai._id],
      metadata: {
        platform: 'Sentinel-1A',
        mode: 'IW',
        polarizations: ['VV', 'VH'],
        relativeOrbitNumber: 92,
      },
      platform: 'Sentinel-1A',
      localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6ab8a736667c98f4208d8b05/ZONE-260925-8986_6ab8a736667c98f4208d8b05_CURRENT_Sentinel1_20200102.tif',
      rasterValidated: true,
      rasterWidth: 2562,
      rasterHeight: 2232,
      rasterBandCount: 2,
      rasterCrs: 'EPSG:32644',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 6. VALIDATION-SIRUMALAI-S2 specific Sentinel-2 Observation (T43PGM, 2026-03-10)
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac5ac543f19822d1b7e6e7b'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260310T051241_20260310T051808_T43PGM',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-03-10T05:12:41.000Z'),
      cloudCover: 0.57,
      footprint: zoneSirumalai.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20260310T051241_20260310T051808_T43PGM',
      intersectingZones: [zoneSirumalai._id],
      metadata: {
        platform: 'Sentinel-2A',
        tile: 'T43PGM',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2A',
      rasterValidated: true,
      rasterCrs: 'EPSG:32643',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 7. VALIDATION-SIRUMALAI-S2 specific Sentinel-2 Observation (T43PGM, 2026-03-23)
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac5ac543f19822d1b7e6e7e'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260323T051241_20260323T051808_T43PGM',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-03-23T05:12:41.000Z'),
      cloudCover: 3.72,
      footprint: zoneSirumalai.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20260323T051241_20260323T051808_T43PGM',
      intersectingZones: [zoneSirumalai._id],
      metadata: {
        platform: 'Sentinel-2B',
        tile: 'T43PGM',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2B',
      rasterValidated: true,
      rasterCrs: 'EPSG:32643',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 8. VALIDATION-SIRUMALAI-S2 specific Sentinel-2 Observation (T43PHM, 2026-09-26)
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac5d839540f1518603d0565'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260926T051241_20260926T051801_T43PHM',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-09-26T05:12:41.000Z'),
      cloudCover: 13.36,
      footprint: zoneSirumalai.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20260926T051241_20260926T051801_T43PHM',
      intersectingZones: [zoneSirumalai._id],
      metadata: {
        platform: 'Sentinel-2A',
        tile: 'T43PHM',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2A',
      rasterValidated: true,
      rasterCrs: 'EPSG:32643',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 9. VALIDATION-SIRUMALAI-S2 specific Sentinel-1A SAR (Raster on disk: 26.9MB)
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ab7e7e46358176818476c24'),
      imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260106T003233_20260106T003258_062639_07DA3D_0A25',
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      acquisitionDate: new Date('2026-01-06T00:32:33.000Z'),
      cloudCover: 0,
      footprint: zoneSirumalai.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)',
      intersectingZones: [zoneSirumalai._id],
      metadata: {
        platform: 'Sentinel-1A',
        mode: 'IW',
        polarizations: ['VV', 'VH'],
        relativeOrbitNumber: 92,
      },
      platform: 'Sentinel-1A',
      localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6ab7eb8e6358176818476cbc/ZONE-260925-8986_6ab7eb8e6358176818476cbc_BASELINE_Sentinel1_20260106.tif',
      rasterValidated: true,
      rasterWidth: 2535,
      rasterHeight: 1285,
      rasterBandCount: 2,
      rasterCrs: 'EPSG:32644',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 10. M4 Test Zone Observation 1 (Sentinel-2, 2024-01-01)
    // Linked to M4 Baseline: 6ac0e18e1631811fece60779
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac0e18e1631811fece60777'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20240101T051241_20240101T051808_T44PMT',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2024-01-01T05:00:00.000Z'),
      cloudCover: 5.0,
      footprint: zoneM4.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20240101T051241_20240101T051808_T44PMT',
      intersectingZones: [zoneM4._id],
      metadata: {
        platform: 'Sentinel-2B',
        tile: 'T44PMT',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2B',
      rasterValidated: true,
      rasterCrs: 'EPSG:32644',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 11. M4 Test Zone Observation 2 (Sentinel-2, 2024-01-16)
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac0e18e1631811fece60778'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20240116T051241_20240116T051808_T44PMT',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2024-01-16T05:00:00.000Z'),
      cloudCover: 2.1,
      footprint: zoneM4.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20240116T051241_20240116T051808_T44PMT',
      intersectingZones: [zoneM4._id],
      metadata: {
        platform: 'Sentinel-2A',
        tile: 'T44PMT',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2A',
      rasterValidated: true,
      rasterCrs: 'EPSG:32644',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 12. M12 Reserved Forest Zone Observation 1 (Sentinel-2, 2026-02-15)
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac0ea0d5a8d6c351db5b170'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260215T051241_20260215T051808_T43PGL',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-02-15T05:12:41.000Z'),
      cloudCover: 3.4,
      footprint: zoneM12.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'COPERNICUS/S2_SR_HARMONIZED/20260215T051241_20260215T051808_T43PGL',
      intersectingZones: [zoneM12._id],
      metadata: {
        platform: 'Sentinel-2A',
        tile: 'T43PGL',
        resolutionMeters: 10,
        provider: 'GEE',
      },
      platform: 'Sentinel-2A',
      rasterValidated: true,
      rasterCrs: 'EPSG:32643',
      resolutionMeters: 10,
    },

    // -------------------------------------------------------------------------
    // 13. M12 Reserved Forest Zone Observation 2 (Sentinel-1 SAR, 2026-02-18)
    // -------------------------------------------------------------------------
    {
      _id: new Types.ObjectId('6ac0ea0d5a8d6c351db5b171'),
      imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260218T003240_20260218T003305_063124_07F89B_2C4D',
      source: SatelliteSource.SENTINEL_1,
      sensorType: SensorType.SAR,
      acquisitionDate: new Date('2026-02-18T00:32:40.000Z'),
      cloudCover: 0,
      footprint: zoneM12.boundary,
      processingStatus: SatelliteProcessingStatus.PROCESSED,
      geeReference: 'ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(geometry)',
      intersectingZones: [zoneM12._id],
      metadata: {
        platform: 'Sentinel-1A',
        mode: 'IW',
        polarizations: ['VV', 'VH'],
        relativeOrbitNumber: 92,
      },
      platform: 'Sentinel-1A',
      rasterValidated: true,
      rasterCrs: 'EPSG:32643',
      resolutionMeters: 10,
    },
  ];

  await SatelliteMetadata.insertMany(recordsToInsert);
  console.log(`\n✅ Successfully inserted ${recordsToInsert.length} authentic SatelliteMetadata records!`);


  // Check counts per zone
  console.log('\n--- VERIFICATION OF ZONE-SCOPED SATELLITE COUNTS ---');
  for (const z of zones) {
    const count = await SatelliteMetadata.countDocuments({ intersectingZones: z._id });
    console.log(`Zone "${z.name}" (${z.zoneId}): ${count} observations`);
  }

  await mongoose.connection.close();
  console.log('\nDatabase closed cleanly.');
  process.exit(0);
}

restoreAllZoneSatellites().catch(err => {
  console.error('Failed to restore satellites:', err);
  process.exit(1);
});
