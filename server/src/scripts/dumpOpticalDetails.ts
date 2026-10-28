import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import fs from 'node:fs';

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  console.log('=== PART 1: OPTICAL METADATA RECORDS ===');
  const metas = await SatelliteMetadata.find({ sensorType: { $ne: 'SAR' } });
  for (const m of metas) {
    let rasterInfo: any = 'NONE';
    if (m.localRasterPath && fs.existsSync(m.localRasterPath)) {
      try {
        const parsed = await GeoTiffService.readGeoTiff(m.localRasterPath);
        rasterInfo = {
          width: parsed.metadata.width,
          height: parsed.metadata.height,
          crs: parsed.metadata.crs,
          bbox: parsed.metadata.bbox,
          bands: parsed.bandNames,
        };
      } catch (err: any) {
        rasterInfo = `PARSE_ERROR: ${err.message}`;
      }
    }
    console.log(JSON.stringify({
      id: m._id,
      imageId: m.imageId,
      source: m.source,
      sensorType: m.sensorType,
      platform: m.platform,
      date: m.acquisitionDate,
      cloud: (m as any).cloudCoverPercentage ?? m.cloudCover,
      path: m.localRasterPath,
      existsOnDisk: m.localRasterPath ? fs.existsSync(m.localRasterPath) : false,
      rasterInfo,
      geeAssetId: (m as any).geeAssetId,
      geeExportTaskId: m.geeExportTaskId,
      driveFileId: m.driveFileId,
      metaObj: m.metadata,
    }, null, 2));
  }

  console.log('\n=== PART 2: OPTICAL BASELINES ===');
  const baselines = await BaselineModel.find({ sensorType: { $ne: 'SAR' } });
  for (const b of baselines) {
    console.log(JSON.stringify({
      id: b._id,
      zoneId: b.zoneId,
      satelliteMetadataId: b.satelliteMetadataId,
      imageId: b.imageId,
      sensorType: b.sensorType,
      source: b.source,
      date: b.acquisitionDate,
      status: b.status,
      isActive: b.isActive,
      qualityScore: b.qualityScore,
      cloudCover: b.cloudCover,
      validPixelPercentage: b.validPixelPercentage,
      indices: (b as any).indices,
      geeExportTaskId: b.geeExportTaskId,
      driveFileId: b.driveFileId,
      localRasterPath: b.localRasterPath,
      existsOnDisk: b.localRasterPath ? fs.existsSync(b.localRasterPath) : false,
    }, null, 2));
  }

  console.log('\n=== PART 3: OPTICAL CHANGE DETECTIONS DETAILED ===');
  const changes = await ChangeDetectionModel.find({ sensorType: { $ne: 'SAR' } });
  for (const c of changes) {
    console.log(JSON.stringify({
      id: c._id,
      changeId: c.changeId,
      zoneId: c.zoneId,
      observationId: c.observationId,
      baselineId: c.baselineId,
      sensorType: c.sensorType,
      source: c.source,
      detectedAt: c.detectedAt,
      calculationMode: c.calculationMode,
      spatialSource: c.spatialSource,
      calculationMethod: c.calculationMethod,
      spatialCalculation: c.spatialCalculation,
      zoneArea: c.zoneArea,
      changedArea: c.changedArea,
      affectedAreaPercentage: c.affectedAreaPercentage,
      changedPixels: (c as any).changedPixels,
      validPixels: (c as any).validPixels,
      severity: c.severity,
      evidenceStrength: c.evidenceStrength,
      categories: c.categories,
      changeIndicators: c.changeIndicators,
      explanation: c.explanation,
      analysisGrid: c.analysisGrid,
      rasterStatistics: c.rasterStatistics,
      thresholdConfig: c.thresholdConfig,
    }, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
