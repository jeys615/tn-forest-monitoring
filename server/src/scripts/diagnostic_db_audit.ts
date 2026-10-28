import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { Zone } from '../models/Zone.js';
import { SensorType, BaselineStatus } from '@tn-forest/shared/types';

async function runDiagnostic() {
  console.log('[1] Loading environment');
  const mongoUri = env.MONGODB_URI;
  console.log(`[1] Environment loaded. Target URI: ${mongoUri}`);

  console.log('[2] Connecting MongoDB');
  const startTime = Date.now();
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    console.log(`[3] MongoDB connected in ${Date.now() - startTime}ms`);
  } catch (connErr: any) {
    console.error('MONGODB_CONNECTION_FAILED:', connErr.message || connErr);
    process.exit(1);
  }

  try {
    console.log('[4] Querying SatelliteMetadata');
    const satCount = await SatelliteMetadata.countDocuments();
    const allSatMetas = await SatelliteMetadata.find().lean();
    console.log(`[4] SatelliteMetadata count: ${satCount}`);

    console.log('[5] Querying Baseline');
    const baseCount = await BaselineModel.countDocuments();
    const allBaselines = await BaselineModel.find().lean();
    console.log(`[5] Baseline count: ${baseCount}`);

    // Check orphan baselines (where satelliteMetadataId doesn't exist)
    const satIdSet = new Set(allSatMetas.map((s) => s._id.toString()));
    const orphanBaselines = allBaselines.filter(
      (b) => !b.satelliteMetadataId || !satIdSet.has(b.satelliteMetadataId.toString()),
    );
    console.log(`Orphan baseline count: ${orphanBaselines.length}`);
    if (orphanBaselines.length > 0) {
      console.log('Orphan baseline IDs:', orphanBaselines.map((b) => b._id.toString()));
    }

    // Zones
    const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).lean();
    const sirumalai = await Zone.findOne({ zoneId: 'ZONE-260925-8986' }).lean();

    console.log('\n--- SPECIFIC RECORD VERIFICATION ---');

    // 1. Vadipatti active optical baseline
    console.log('\n[VADIPATTI ACTIVE OPTICAL BASELINE]');
    if (vadipatti) {
      const vadipattiActive = await BaselineModel.findOne({
        zoneId: vadipatti._id,
        sensorType: SensorType.OPTICAL,
        isActive: true,
      }).lean();
      if (vadipattiActive) {
        console.log({
          _id: vadipattiActive._id.toString(),
          status: vadipattiActive.status,
          isActive: vadipattiActive.isActive,
          source: vadipattiActive.source,
          sensorType: vadipattiActive.sensorType,
          acquisitionDate: vadipattiActive.acquisitionDate,
          satelliteMetadataId: vadipattiActive.satelliteMetadataId?.toString(),
          qualityScore: vadipattiActive.qualityScore,
          geeExportTaskId: vadipattiActive.geeExportTaskId,
          driveFileId: vadipattiActive.driveFileId,
          rasterValidated: vadipattiActive.rasterValidated,
          spectralIndicesCalculated: vadipattiActive.spectralIndicesCalculated,
        });
      } else {
        console.log('NOT FOUND');
      }
    } else {
      console.log('Vadipatti zone NOT FOUND');
    }

    // 2. Vadipatti Sentinel-2 candidate
    console.log('\n[VADIPATTI SENTINEL-2 CANDIDATE (6ab51cf0f979afc8c8714b41)]');
    const vadipattiCand = await BaselineModel.findById('6ab51cf0f979afc8c8714b41').lean();
    if (vadipattiCand) {
      console.log({
        _id: vadipattiCand._id.toString(),
        status: vadipattiCand.status,
        isActive: vadipattiCand.isActive,
        source: vadipattiCand.source,
        sensorType: vadipattiCand.sensorType,
        acquisitionDate: vadipattiCand.acquisitionDate,
        satelliteMetadataId: vadipattiCand.satelliteMetadataId?.toString(),
        qualityScore: vadipattiCand.qualityScore,
        geeExportTaskId: vadipattiCand.geeExportTaskId,
        driveFileId: vadipattiCand.driveFileId,
        driveFileSizeBytes: vadipattiCand.driveFileSizeBytes,
        localRasterPath: vadipattiCand.localRasterPath,
        rasterValidated: vadipattiCand.rasterValidated,
        rasterBandCount: vadipattiCand.rasterBandCount,
        rasterWidth: vadipattiCand.rasterWidth,
        rasterHeight: vadipattiCand.rasterHeight,
        rasterCrs: vadipattiCand.rasterCrs,
        spectralIndicesCalculated: vadipattiCand.spectralIndicesCalculated,
        failureReason: vadipattiCand.failureReason,
        errorStage: vadipattiCand.errorStage,
        errorCode: vadipattiCand.errorCode,
      });

      if (vadipattiCand.satelliteMetadataId) {
        const candMeta = await SatelliteMetadata.findById(vadipattiCand.satelliteMetadataId).lean();
        console.log('Associated SatelliteMetadata (6aa6798c2b4fe5808c7e9038):', {
          _id: candMeta?._id.toString(),
          imageId: candMeta?.imageId,
          source: candMeta?.source,
          processingStatus: candMeta?.processingStatus,
          geeExportTaskId: candMeta?.geeExportTaskId,
          driveFileId: candMeta?.driveFileId,
          localRasterPath: candMeta?.localRasterPath,
          failureReason: candMeta?.failureReason,
        });
      }
    } else {
      console.log('NOT FOUND');
    }

    // 3. Sirumalai active optical baseline
    console.log('\n[SIRUMALAI ACTIVE OPTICAL BASELINE]');
    if (sirumalai) {
      const sirumalaiActive = await BaselineModel.findOne({
        zoneId: sirumalai._id,
        sensorType: SensorType.OPTICAL,
        isActive: true,
      }).lean();
      if (sirumalaiActive) {
        console.log({
          _id: sirumalaiActive._id.toString(),
          status: sirumalaiActive.status,
          isActive: sirumalaiActive.isActive,
          source: sirumalaiActive.source,
          sensorType: sirumalaiActive.sensorType,
          acquisitionDate: sirumalaiActive.acquisitionDate,
          satelliteMetadataId: sirumalaiActive.satelliteMetadataId?.toString(),
          rasterValidated: sirumalaiActive.rasterValidated,
          spectralIndicesCalculated: sirumalaiActive.spectralIndicesCalculated,
        });
      } else {
        console.log('NOT FOUND');
      }
    } else {
      console.log('Sirumalai zone NOT FOUND');
    }

    // 4. Sirumalai 2020 SAR
    // 5. Sirumalai 2021 SAR
    // 6. Sirumalai 2026 SAR
    console.log('\n[SIRUMALAI SAR BASELINES (2020, 2021, 2026)]');
    if (sirumalai) {
      const sirumalaiSar = await BaselineModel.find({
        zoneId: sirumalai._id,
        sensorType: SensorType.SAR,
      })
        .sort({ acquisitionDate: 1 })
        .lean();

      console.log(`Found ${sirumalaiSar.length} SAR baselines for Sirumalai:`);
      for (const b of sirumalaiSar) {
        console.log({
          _id: b._id.toString(),
          date: b.acquisitionDate.toISOString().slice(0, 10),
          status: b.status,
          isActive: b.isActive,
          source: b.source,
          geeExportTaskId: b.geeExportTaskId,
          driveFileId: b.driveFileId,
          driveFileSizeBytes: b.driveFileSizeBytes,
          localRasterPath: b.localRasterPath,
          rasterValidated: b.rasterValidated,
          rasterBandCount: b.rasterBandCount,
          rasterWidth: b.rasterWidth,
          rasterHeight: b.rasterHeight,
          rasterCrs: b.rasterCrs,
          spectralIndicesCalculated: b.spectralIndicesCalculated,
        });
      }
    }

    console.log('\n[6] Query completed');
  } finally {
    console.log('[7] Closing MongoDB connection');
    await mongoose.disconnect();
    console.log('[8] Script exited');
  }
}

runDiagnostic()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Unhandled script error:', err);
    process.exit(1);
  });
