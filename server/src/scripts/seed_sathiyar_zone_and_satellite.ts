import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { User } from '../models/User.js';
import { ZoneCategory, ZoneStatus, SatelliteSource, SatelliteProcessingStatus, SensorType, UserRole } from '@tn-forest/shared/types';
import { hashPassword } from '../utils/password.js';

async function restore(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB:', env.MONGODB_URI);

  let user = await User.findOne({ email: 'admin@tnforest.gov.in' });
  if (!user) {
    const pw = await hashPassword('Admin@TNFMS2026!');
    user = await User.create({
      _id: new mongoose.Types.ObjectId('6a8f22e8f728d2ce522dd93d'),
      name: 'System Super Administrator',
      email: 'admin@tnforest.gov.in',
      passwordHash: pw,
      role: UserRole.SUPER_ADMIN,
      employeeId: 'EMP-0001',
      status: 'ACTIVE',
      permissions: [],
    });
    console.log('Super Admin recreated');
  }

  // Restore sathiyar_forest zone
  let zone = await Zone.findOne({ name: 'sathiyar_forest' });
  if (!zone) {
    zone = await Zone.create({
      _id: new mongoose.Types.ObjectId('6a8f3255b9cb2d5795dd34d4'),
      zoneId: 'ZONE-260826-5537',
      name: 'sathiyar_forest',
      category: ZoneCategory.RESERVED_AREA,
      status: ZoneStatus.PROTECTED,
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [78.07470465117308, 10.118261747031166],
            [78.08672717223784, 10.111838408411883],
            [78.0939406848767, 10.11969852887474],
            [78.08904580130034, 10.123501743888568],
            [78.07977128505037, 10.1228256200689],
            [78.07521990207582, 10.12198046329112],
            [78.07470465117308, 10.118261747031166],
          ],
        ],
      },
      centerPoint: {
        type: 'Point',
        coordinates: [78.08428185420182, 10.11868516256593],
      },
      baselineDate: new Date('2026-08-20T00:00:00.000Z'),
      createdBy: user._id,
    });
    console.log('Zone sathiyar_forest restored with ID:', zone._id);
  }

  // Restore SatelliteMetadata
  let sat = await SatelliteMetadata.findOne({ imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260803T050221_20260803T050519_T44PMT' });
  if (!sat) {
    sat = await SatelliteMetadata.create({
      _id: new mongoose.Types.ObjectId('6a8f34c7b9cb2d5795dd3717'),
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260803T050221_20260803T050519_T44PMT',
      source: SatelliteSource.SENTINEL_2,
      sensorType: SensorType.OPTICAL,
      acquisitionDate: new Date('2026-08-03T00:00:00.000Z'),
      cloudCover: 0,
      footprint: zone.boundary,
      processingStatus: SatelliteProcessingStatus.ACQUIRED,
      geeReference: 'ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(geometry)',
      intersectingZones: [zone._id],
      metadata: {
        spacecraftName: 'Sentinel-2A',
        sunElevationAngle: 58.4,
        cloudCoverPercentage: 0,
        nativeResolutionMeters: 10,
        bands: [
          'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12',
          'AOT', 'WVP', 'SCL', 'TCI_R', 'TCI_G', 'TCI_B', 'MSK_CLDPRB', 'MSK_SNWPRB',
          'QA10', 'QA20', 'QA60',
        ],
        isRealTelemetry: true,
      },
    });
    console.log('SatelliteMetadata restored with ID:', sat._id);
  }

  await mongoose.disconnect();
  process.exit(0);
}

restore().catch((err) => {
  console.error(err);
  process.exit(1);
});
