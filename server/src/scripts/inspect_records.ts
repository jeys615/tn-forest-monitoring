import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import mongoose from 'mongoose';

async function check() {
  await connectDatabase();
  const z1 = await Zone.findById('6ac5a9d496837067de289f3b');
  const z2 = await Zone.findById('6ac64221540f1518603d05ff');
  const sat1 = await SatelliteMetadata.findOne({ imageId: /20200109/ });
  const sat2 = await SatelliteMetadata.findOne({ imageId: /20260122/ });
  console.log('sat1 footprint coords:', JSON.stringify(sat1?.footprint?.coordinates));
  console.log('z1 (Sirumalai) coords:', JSON.stringify(z1?.boundary?.coordinates));
  console.log('z2 (testing) coords:', JSON.stringify(z2?.boundary?.coordinates));
  console.log('sat1:', {
    id: sat1?._id.toString(),
    imageId: sat1?.imageId,
    intersectingZones: sat1?.intersectingZones,
    localRasterPath: sat1?.localRasterPath,
    driveFileId: sat1?.driveFileId,
    driveFileName: sat1?.driveFileName,
    rasterValidated: sat1?.rasterValidated,
    metadata: sat1?.metadata,
  });
  console.log('sat2:', {
    id: sat2?._id.toString(),
    imageId: sat2?.imageId,
    intersectingZones: sat2?.intersectingZones,
    localRasterPath: sat2?.localRasterPath,
    driveFileId: sat2?.driveFileId,
    driveFileName: sat2?.driveFileName,
    rasterValidated: sat2?.rasterValidated,
    metadata: sat2?.metadata,
  });
  let cd = await ChangeDetectionModel.findOne({ changeId: 'CHG-1791379089579-2827' });
  console.log('cd:', {
    changeId: cd?.changeId,
    zoneId: cd?.zoneId?.toString(),
    observationId: cd?.observationId?.toString(),
    baselineId: cd?.baselineId?.toString(),
    rasterStatistics: cd?.rasterStatistics ? 'EXISTS' : 'NONE',
  });
  if (!cd) {
    cd = await ChangeDetectionModel.findOne({ $or: [{ changeId: /1791379089579/ }, { changeId: /2827/ }] });
  }
  if (cd) {
    console.log('CD found:', {
      id: cd._id.toString(),
      changeId: cd.changeId,
      zoneId: cd.zoneId?.toString(),
      observationId: cd.observationId?.toString(),
      baselineId: cd.baselineId?.toString(),
      referenceObservationId: cd.referenceObservationId?.toString(),
      sensorType: cd.sensorType,
      source: cd.source,
      detectedAt: cd.detectedAt,
      changedArea: cd.changedArea,
      calculationMethod: cd.calculationMethod,
      spatialCalculation: cd.spatialCalculation,
      comparisonMode: cd.comparisonMode,
      rasterStatistics: cd.rasterStatistics,
    });
  } else {
    console.log('CD not found by exact ID. Listing all CDs:');
    const allCds = await ChangeDetectionModel.find({});
    console.log('All CDs:', allCds.map(c => ({ id: c._id.toString(), changeId: c.changeId, zoneId: c.zoneId?.toString(), obsId: c.observationId?.toString(), baseId: c.baselineId?.toString() })));
  }

  console.log('\n--- Checking Baselines ---');
  const allBaselines = await BaselineModel.find({});
  console.log('Total baselines:', allBaselines.length);
  for (const b of allBaselines) {
    console.log({
      id: b._id.toString(),
      zoneId: b.zoneId?.toString(),
      satMetaId: b.satelliteMetadataId?.toString(),
      imageId: b.imageId,
      status: b.status,
      isActive: b.isActive,
    });
  }

  console.log('\n--- Checking SatelliteMetadata records ---');
  const allSat = await SatelliteMetadata.find({});
  console.log('Total SatelliteMetadata count:', allSat.length);
  for (const s of allSat) {
    console.log({
      id: s._id.toString(),
      imageId: s.imageId,
      acquisitionDate: s.acquisitionDate,
      intersectingZones: s.intersectingZones.map((z: any) => z?.toString()),
      processingStatus: s.processingStatus,
    });
  }

  await mongoose.connection.close();
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
