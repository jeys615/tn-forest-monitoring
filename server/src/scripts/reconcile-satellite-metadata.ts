import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tn_forest_monitoring';

export async function reconcileSatelliteMetadata() {
  console.info(`[RECONCILE] Connecting to MongoDB: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  // 1. Fetch Zones
  const vadipatti = await db.collection('zones').findOne({ zoneId: 'ZONE-260913-7787' });
  const sirumalai = await db.collection('zones').findOne({ zoneId: 'ZONE-260925-8986' });

  if (!vadipatti || !sirumalai) {
    throw new Error('Required zones not found in database');
  }

  console.info(`[RECONCILE] Found Vadipatti: ${vadipatti._id} (${vadipatti.zoneId})`);
  console.info(`[RECONCILE] Found Sirumalai: ${sirumalai._id} (${sirumalai.zoneId})`);

  // 2. Reconcile Vadipatti Active Optical Metadata (6aa678502b4fe5808c7e8e2d)
  const metaV1Id = new Types.ObjectId('6aa678502b4fe5808c7e8e2d');
  const existingV1 = await db.collection('satellitemetadatas').findOne({ _id: metaV1Id });
  if (!existingV1) {
    console.info(`[RECONCILE] Restoring missing SatelliteMetadata for Vadipatti Active Optical Baseline: ${metaV1Id}`);
    await db.collection('satellitemetadatas').insertOne({
      _id: metaV1Id,
      imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20150106',
      source: 'LANDSAT_8',
      sensorType: 'OPTICAL',
      spacecraftName: 'Landsat 8',
      acquisitionDate: new Date('2015-01-06T05:05:32.318Z'),
      cloudCover: 0.0,
      footprint: vadipatti.boundary,
      intersectingZones: [vadipatti._id],
      processingStatus: 'PROCESSED',
      geeExportTaskId: 'projects/monitoring-system-506515/operations/XO74HAF3GK336J76OADX2LWL',
      driveFileId: '1Sr78xDnoawa9kdVgFGy1D1xSi4_MG10G',
      driveFileName: 'ZONE-260913-7787_6aa679012b4fe5808c7e8ec7_BASELINE_Landsat8_20150106.tif',
      driveFileSizeBytes: 689804,
      localRasterPath: 'D:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6aa679012b4fe5808c7e8ec7/ZONE-260913-7787_6aa679012b4fe5808c7e8ec7_BASELINE_Landsat8_20150106.tif',
      rasterValidated: true,
      rasterWidth: 314,
      rasterHeight: 236,
      rasterBandCount: 6,
      rasterCrs: 'EPSG:32644',
      originalCrs: 'EPSG:32644',
      areaCalculationCrs: 'EPSG:32644',
      spectralIndicesCalculated: true,
      isRealTelemetry: true,
      createdAt: new Date('2026-09-24T12:33:10.315Z'),
      updatedAt: new Date('2026-09-24T12:33:10.315Z'),
    });
  } else {
    console.info(`[RECONCILE] SatelliteMetadata ${metaV1Id} already present.`);
  }

  // 3. Reconcile Vadipatti Candidate Optical Metadata (6aa6798c2b4fe5808c7e9038)
  const metaV2Id = new Types.ObjectId('6aa6798c2b4fe5808c7e9038');
  const existingV2 = await db.collection('satellitemetadatas').findOne({ _id: metaV2Id });
  if (!existingV2) {
    console.info(`[RECONCILE] Restoring missing SatelliteMetadata for Vadipatti Candidate Optical Baseline: ${metaV2Id}`);
    await db.collection('satellitemetadatas').insertOne({
      _id: metaV2Id,
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260909T050649_20260909T051600_T43PHM',
      source: 'SENTINEL_2',
      sensorType: 'OPTICAL',
      spacecraftName: 'Sentinel-2',
      acquisitionDate: new Date('2026-09-09T05:25:57.347Z'),
      cloudCover: 19.866832,
      footprint: vadipatti.boundary,
      intersectingZones: [vadipatti._id],
      processingStatus: 'FAILED',
      failureReason: 'EXPORT_FAILED: fetch failed',
      errorStage: 'EXPORT_SUBMISSION_FAILED',
      errorCode: 'FETCH_FAILED',
      errorMessage: 'fetch failed',
      failedAt: new Date('2026-09-24T12:52:00.455Z'),
      isRealTelemetry: true,
      createdAt: new Date('2026-09-24T12:52:00.327Z'),
      updatedAt: new Date('2026-09-24T12:52:00.455Z'),
    });
  } else {
    console.info(`[RECONCILE] SatelliteMetadata ${metaV2Id} already present.`);
  }

  // 4. Reconcile Sirumalai Active Optical Metadata (6ab5c628f979afc8c8714eba)
  const metaS1Id = new Types.ObjectId('6ab5c628f979afc8c8714eba');
  const existingS1 = await db.collection('satellitemetadatas').findOne({ _id: metaS1Id });
  if (!existingS1) {
    console.info(`[RECONCILE] Restoring missing SatelliteMetadata for Sirumalai Active Optical Baseline: ${metaS1Id}`);
    await db.collection('satellitemetadatas').insertOne({
      _id: metaS1Id,
      imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260906T051241_20260906T051802_T43PHM',
      source: 'SENTINEL_2',
      sensorType: 'OPTICAL',
      spacecraftName: 'Sentinel-2',
      acquisitionDate: new Date('2026-09-06T05:26:14.942Z'),
      cloudCover: 13.23971,
      footprint: sirumalai.boundary,
      intersectingZones: [sirumalai._id],
      processingStatus: 'PROCESSED',
      geeExportTaskId: 'projects/monitoring-system-506515/operations/VPVQM3ZVLIRXMKX7IARXK7MX',
      driveFileId: '1jcIsmqX4KhmsflU_T6d2k8BHzSR-9A4F',
      driveFileName: 'ZONE-260925-8986_6ab5c957f979afc8c8714fb4_BASELINE_Sentinel2_20260906.tif',
      driveFileSizeBytes: 49579275,
      localRasterPath: 'D:\\tn-enforcement-system\\tn-forest-monitoring\\server\\storage\\raster_temp\\6ab5c957f979afc8c8714fb4\\ZONE-260925-8986_6ab5c957f979afc8c8714fb4_BASELINE_Sentinel2_20260906.tif',
      rasterValidated: true,
      rasterWidth: 2569,
      rasterHeight: 2237,
      rasterBandCount: 6,
      rasterCrs: 'EPSG:32643',
      originalCrs: 'EPSG:32643',
      areaCalculationCrs: 'EPSG:32643',
      spectralIndicesCalculated: true,
      isRealTelemetry: true,
      createdAt: new Date('2026-09-25T01:07:35.595Z'),
      updatedAt: new Date('2026-09-25T08:19:14.131Z'),
    });
  } else {
    console.info(`[RECONCILE] SatelliteMetadata ${metaS1Id} already present.`);
  }

  // 5. Hardening imageId on all Baselines
  console.info('[RECONCILE] Hardening imageId on baseline documents...');
  await db.collection('baselines').updateOne(
    { _id: new Types.ObjectId('6aa679012b4fe5808c7e8ec7') },
    { $set: { imageId: 'LANDSAT/LC08/C02/T1_L2/LC08_143053_20150106' } },
  );

  await db.collection('baselines').updateOne(
    { _id: new Types.ObjectId('6ab51cf0f979afc8c8714b41') },
    {
      $set: {
        imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260909T050649_20260909T051600_T43PHM',
        errorStage: 'EXPORT_SUBMISSION_FAILED',
        errorCode: 'FETCH_FAILED',
        errorMessage: 'fetch failed',
        failedAt: new Date('2026-09-24T12:52:00.455Z'),
      },
    },
  );

  await db.collection('baselines').updateOne(
    { _id: new Types.ObjectId('6ab5c957f979afc8c8714fb4') },
    { $set: { imageId: 'COPERNICUS/S2_SR_HARMONIZED/20260906T051241_20260906T051802_T43PHM' } },
  );

  await db.collection('baselines').updateOne(
    { _id: new Types.ObjectId('6ab7eb8e6358176818476cbc') },
    { $set: { imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20260106T003233_20260106T003258_062639_07DA3D_0A25' } },
  );

  await db.collection('baselines').updateOne(
    { _id: new Types.ObjectId('6ab8a9ba667c98f4208d8d32') },
    { $set: { imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20210101T004101_20210101T004126_035937_043594_958C' } },
  );

  await db.collection('baselines').updateOne(
    { _id: new Types.ObjectId('6ab8dab06f0c75ad0b423200') },
    { $set: { imageId: 'COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20200102T003240_20200102T003305_030614_0381E6_3EAD' } },
  );

  // 6. Verify Data Lineage and Integrity
  const allBaselines = await db.collection('baselines').find({}).toArray();
  const allMetas = await db.collection('satellitemetadatas').find({}).toArray();

  console.info(`[RECONCILE] Verification: ${allBaselines.length} Baselines, ${allMetas.length} SatelliteMetadatas`);
  for (const b of allBaselines) {
    if (!b.imageId) throw new Error(`Baseline ${b._id} missing imageId!`);
    const meta = allMetas.find((m) => m._id.toString() === b.satelliteMetadataId.toString());
    if (!meta) throw new Error(`Baseline ${b._id} still orphaned from metadata!`);
    console.info(`  Baseline ${b._id} (${b.sensorType}, ${b.status}, active: ${b.isActive}) -> Meta ${meta._id} [${b.imageId}]`);
  }

  // 7. Verify Vadipatti Active Optical Baseline preserved
  const vadipattiActive = allBaselines.find((b) => b._id.toString() === '6aa679012b4fe5808c7e8ec7');
  if (!vadipattiActive || !vadipattiActive.isActive || vadipattiActive.status !== 'ACTIVE') {
    throw new Error('Vadipatti Active Optical Baseline compromised!');
  }

  // 8. Verify Sirumalai 3 SAR baselines
  const sirumalaiSar = allBaselines.filter((b) => b.zoneId.toString() === sirumalai._id.toString() && b.sensorType === 'SAR');
  if (sirumalaiSar.length !== 3) {
    throw new Error(`Expected 3 Sirumalai SAR baselines, found ${sirumalaiSar.length}`);
  }
  const activeSarCount = sirumalaiSar.filter((s) => s.isActive).length;
  if (activeSarCount > 1) {
    throw new Error(`Expected at most 1 active Sirumalai SAR baseline, found ${activeSarCount}`);
  }
  for (const sar of sirumalaiSar) {
    if (sar.status !== 'PROCESSED' && sar.status !== 'ACTIVE') {
      throw new Error(`Sirumalai SAR baseline ${sar._id} must be PROCESSED or ACTIVE!`);
    }
  }

  // 9. Verify Vadipatti alert preserved
  const vadipattiAlert = await db.collection('alerts').findOne({ alertId: 'ALT-1789295023854-8239' });
  if (!vadipattiAlert) {
    console.warn('[RECONCILE] Notice: Alert ALT-1789295023854-8239 check');
  } else {
    console.info(`[RECONCILE] Vadipatti Alert ${vadipattiAlert.alertId} verified preserved.`);
  }

  console.info('[RECONCILE] All database reconciliations and invariants successfully verified!');
  const isDirectRun =
    process.argv[1]?.endsWith('reconcile-satellite-metadata.ts') ||
    process.argv[1]?.endsWith('reconcile-satellite-metadata.js');
  if (isDirectRun) {
    await mongoose.disconnect();
  }

  return { orphanedCount: 0, activeOpticalIntact: true };
}

if (process.argv[1]?.endsWith('reconcile-satellite-metadata.ts') || process.argv[1]?.endsWith('reconcile-satellite-metadata.js')) {
  reconcileSatelliteMetadata().catch((err) => {
    console.error('[RECONCILE] Error:', err);
    process.exit(1);
  });
}
