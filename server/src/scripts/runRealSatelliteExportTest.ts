import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { User } from '../models/User.js';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import {
  ZoneCategory,
  ZoneStatus,
  SatelliteSource,
  SatelliteProcessingStatus,
  SensorType,
  UserRole,
} from '@tn-forest/shared/types';
import { hashPassword } from '../utils/password.js';

/**
 * Real End-to-End Test: Satellite Metadata -> GEE Export -> Google Drive -> GeoTIFF Download -> Raster Validation
 *
 * Target Real Image: COPERNICUS/S2_SR_HARMONIZED/20210128T051049_20210128T051756_T43PHM
 */
async function runRealSatelliteExportTest() {
  console.log('================================================================');
  console.log('🛰️ REAL GEE SATELLITE EXPORT ➔ GOOGLE DRIVE ➔ GEOTIFF TEST');
  console.log('================================================================\n');

  console.log(`Connecting to MongoDB (${env.MONGODB_URI})...`);
  await mongoose.connect(env.MONGODB_URI);
  console.log(`✅ MongoDB Connected (readyState: ${mongoose.connection.readyState})\n`);

  // 1. Ensure admin user exists
  let adminUser = await User.findOne({ email: 'admin@tnforest.gov.in' });
  if (!adminUser) {
    const pw = await hashPassword('Admin@TNFMS2026!');
    adminUser = await User.create({
      _id: new mongoose.Types.ObjectId('6a8f22e8f728d2ce522dd93d'),
      name: 'System Super Administrator',
      email: 'admin@tnforest.gov.in',
      passwordHash: pw,
      role: UserRole.SUPER_ADMIN,
      employeeId: 'EMP-0001',
      status: 'ACTIVE',
      permissions: [],
    });
  }

  // 2. Ensure Sathiyar Reserve Forest zone exists
  let zone = await Zone.findOne({
    $or: [
      { code: 'ZONE-SATHIYAR-001' },
      { zoneId: 'ZONE-SATHIYAR-001' },
      { name: /Sathiyar/i },
    ],
  });

  if (!zone) {
    console.log('Creating Sathiyar Reserve Forest zone...');
    zone = await Zone.create({
      _id: new mongoose.Types.ObjectId('6a9c12d167959c391f63d7be'),
      zoneId: 'ZONE-SATHIYAR-001',
      name: 'Sathiyar Reserve Forest',
      category: ZoneCategory.RESERVED_AREA,
      status: ZoneStatus.PROTECTED,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.0747, 10.1182],
            [78.0867, 10.1118],
            [78.0939, 10.1196],
            [78.089, 10.1235],
            [78.0797, 10.1228],
            [78.0747, 10.1182],
          ],
        ],
      },
      centerPoint: {
        type: 'Point',
        coordinates: [78.0843, 10.1187],
      },
      baselineDate: new Date('2020-01-09T00:00:00.000Z'),
      createdBy: adminUser._id,
    });
  }

  console.log(`Target Zone: ${zone.name} (${zone.zoneId || (zone as any).code}), ID: ${zone._id}`);

  const targetImageId = 'COPERNICUS/S2_SR_HARMONIZED/20210128T051049_20210128T051756_T43PHM';
  const acquisitionService = new SatelliteAcquisitionService();

  // 3. Locate or acquire authentic SatelliteMetadata record in MongoDB
  console.log('\n--- 1. LOCATE OR ACQUIRE REAL SATELLITE METADATA RECORD ---');
  let satelliteDoc = await SatelliteMetadata.findOne({ imageId: targetImageId });

  if (!satelliteDoc) {
    console.log(`Record not in database. Acquiring catalog metadata via real GEE discovery for 2021-01-28...`);
    const acquired = await acquisitionService.acquireImage({
      zoneId: zone._id.toString(),
      startDate: '2021-01-25',
      endDate: '2021-01-30',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      maxCloudCover: 20,
    });

    console.log(`Catalog acquisition returned: ${acquired.imageId}`);
    satelliteDoc = await SatelliteMetadata.findById(acquired.id);
  }

  if (!satelliteDoc) {
    console.error(`❌ Failed to acquire or locate ${targetImageId}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found Authentic Satellite Record in MongoDB:`);
  console.log(`  ID:                 ${satelliteDoc._id}`);
  console.log(`  Image ID:           ${satelliteDoc.imageId}`);
  console.log(`  Source:             ${satelliteDoc.source}`);
  console.log(`  Sensor:             ${satelliteDoc.sensorType}`);
  console.log(`  Acquisition Date:   ${satelliteDoc.acquisitionDate.toISOString()}`);
  console.log(`  Cloud Cover:        ${satelliteDoc.cloudCover.toFixed(2)}%`);
  console.log(`  Current Status:     ${satelliteDoc.processingStatus}`);

  // Ensure zone is linked
  const zoneIdStr = zone._id.toString();
  const hasZone = satelliteDoc.intersectingZones.some((z: any) => z.toString() === zoneIdStr);
  if (!hasZone) {
    satelliteDoc.intersectingZones.push(zone._id as any);
    await satelliteDoc.save();
  }

  // 4. Trigger Real GEE Export Pipeline via SatelliteAcquisitionService
  console.log('\n--- 2. TRIGGER REAL GEE EXPORT PIPELINE (EXPLICIT RASTER EXPORT) ---');
  console.log('Initiating exportSatelliteRaster with sync: true...');

  const startTime = Date.now();
  let exportedDto;

  try {
    exportedDto = await acquisitionService.exportSatelliteRaster(satelliteDoc._id.toString(), {
      zoneId: zone._id.toString(),
      sync: true,
      force: true,
    });
  } catch (err: any) {
    console.error(`❌ Export pipeline failed: ${err.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const durationMs = Date.now() - startTime;
  console.log(`\n✅ Real GEE Pipeline Completed in ${(durationMs / 1000).toFixed(1)}s\n`);

  // 5. Reload final updated record from MongoDB
  const finalDoc = await SatelliteMetadata.findById(satelliteDoc._id);
  if (!finalDoc) {
    console.error('❌ Could not reload final record.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('================================================================');
  console.log('📋 FINAL REAL GEE SATELLITE EXPORT AUDIT REPORT');
  console.log('================================================================');
  console.log(`1.  GEE Image ID:              ${finalDoc.imageId}`);
  console.log(`2.  Export Operation/Task ID:  ${finalDoc.geeExportTaskId}`);
  console.log(`3.  Export Status:             ${finalDoc.processingStatus}`);
  console.log(`4.  Drive File ID:             ${finalDoc.driveFileId}`);
  console.log(`5.  Drive Filename:            ${finalDoc.driveFileName}`);
  console.log(`6.  Drive File Size:           ${finalDoc.driveFileSizeBytes} bytes (${((finalDoc.driveFileSizeBytes || 0) / 1024).toFixed(1)} KB)`);
  console.log(`7.  Local Raster Path:         ${finalDoc.localRasterPath}`);
  console.log(`8.  Raster Dimensions:         ${finalDoc.rasterWidth} × ${finalDoc.rasterHeight} px`);
  console.log(`9.  Band Count:                ${finalDoc.rasterBandCount} bands`);
  console.log(`10. Original CRS:              ${finalDoc.originalCrs}`);
  console.log(`11. Normalized CRS:            ${finalDoc.rasterCrs}`);
  console.log(`12. Resolution:                ${finalDoc.resolutionMeters}m`);
  console.log(`13. Validation Result:         ${finalDoc.rasterValidated ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`14. Processing Status:         ${finalDoc.processingStatus}`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  console.log('MongoDB disconnected cleanly.');
}

runRealSatelliteExportTest().catch((err) => {
  console.error('Fatal error in test script:', err);
  process.exit(1);
});
