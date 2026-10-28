import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://localhost:27017/tn_forest_monitoring';

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');
  
  const baselines = await db.collection('baselines').find({}).toArray();
  console.log(`\n=== PRODUCTION BASELINES (${baselines.length} total) ===\n`);
  for (const d of baselines) {
    console.log(JSON.stringify({
      _id: d._id,
      zoneId: d.zoneId,
      imageId: d.imageId,
      satelliteMetadataId: d.satelliteMetadataId,
      sensorType: d.sensorType,
      monitoringTrack: d.monitoringTrack,
      source: d.source,
      status: d.status,
      isActive: d.isActive,
      geeExportTaskId: d.geeExportTaskId,
      driveFileId: d.driveFileId,
      driveFileName: d.driveFileName,
      rasterBandCount: d.rasterBandCount,
      localRasterPath: d.localRasterPath,
      // Check for any HLS-related fields already existing
      hlsRepresentationId: d.hlsRepresentationId,
      nativeImageId: d.nativeImageId,
      sourceObservationId: d.sourceObservationId,
      geeImageId: d.geeImageId,
    }, null, 2));
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
