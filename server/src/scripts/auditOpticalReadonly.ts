import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { Zone } from '../models/Zone.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import fs from 'node:fs';

async function main() {
  console.log('============================================================');
  console.log('READ-ONLY OPTICAL FORENSIC AUDIT SCRIPT');
  console.log('============================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // 1. Zones
  console.log('--- ZONES ---');
  const zones = await Zone.find({});
  for (const z of zones) {
    console.log(`Zone [${z._id}] ${z.name} (Code: ${(z as any).zoneCode ?? (z as any).code ?? 'N/A'}): Area=${(z as any).areaHectares} ha, Status=${z.status}`);
  }

  // 2. Optical SatelliteMetadata records
  console.log('\n--- OPTICAL SATELLITE METADATA RECORDS ---');
  const opticalMetas = await SatelliteMetadata.find({ sensorType: { $ne: 'SAR' } });
  console.log(`Found ${opticalMetas.length} optical satellite metadata records.`);
  for (const m of opticalMetas) {
    console.log(`\nMetadata ID: ${m._id}`);
    console.log(`  imageId: ${m.imageId}`);
    console.log(`  source: ${m.source} | sensorType: ${m.sensorType} | platform: ${m.platform}`);
    console.log(`  acquisitionDate: ${m.acquisitionDate?.toISOString()}`);
    console.log(`  cloudCoverPercentage: ${(m as any).cloudCoverPercentage ?? m.cloudCover}`);
    console.log(`  localRasterPath: ${m.localRasterPath}`);
    console.log(`  localThumbnailPath: ${(m as any).localThumbnailPath}`);
    console.log(`  geeAssetId: ${(m as any).geeAssetId}`);
    console.log(`  geeExportTaskId: ${m.geeExportTaskId}`);
    console.log(`  driveFileId: ${m.driveFileId}`);
    console.log(`  metadata:`, JSON.stringify(m.metadata, null, 2));

    // Check disk file if localRasterPath exists
    if (m.localRasterPath && fs.existsSync(m.localRasterPath)) {
      const stats = fs.statSync(m.localRasterPath);
      console.log(`  File on disk: EXISTS (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      try {
        const parsed = await GeoTiffService.readGeoTiff(m.localRasterPath);
        console.log(`  Parsed GeoTIFF:`);
        console.log(`    Dimensions: ${parsed.metadata.width} x ${parsed.metadata.height}`);
        console.log(`    CRS: ${parsed.metadata.crs}`);
        console.log(`    Bbox: [${parsed.metadata.bbox.join(', ')}]`);
        console.log(`    Bands: ${parsed.bandNames.join(', ')}`);
      } catch (err: any) {
        console.log(`    GeoTIFF parsing error: ${err.message}`);
      }
    } else {
      console.log(`  File on disk: NOT FOUND / NULL`);
    }
  }

  // 3. Optical Baselines
  console.log('\n--- OPTICAL BASELINES ---');
  const opticalBaselines = await BaselineModel.find({ sensorType: { $ne: 'SAR' } });
  console.log(`Found ${opticalBaselines.length} optical baseline records.`);
  for (const b of opticalBaselines) {
    console.log(`\nBaseline ID: ${b._id}`);
    console.log(`  zoneId: ${b.zoneId}`);
    console.log(`  satelliteMetadataId: ${b.satelliteMetadataId}`);
    console.log(`  imageId: ${b.imageId}`);
    console.log(`  sensorType: ${b.sensorType} | source: ${b.source}`);
    console.log(`  acquisitionDate: ${b.acquisitionDate?.toISOString()}`);
    console.log(`  status: ${b.status} | isActive: ${b.isActive}`);
    console.log(`  qualityScore: ${b.qualityScore} | cloudCover: ${b.cloudCover}`);
    console.log(`  validPixelPercentage: ${b.validPixelPercentage}`);
    console.log(`  indices:`, JSON.stringify((b as any).indices, null, 2));
    console.log(`  geeExportTaskId: ${b.geeExportTaskId}`);
    console.log(`  driveFileId: ${b.driveFileId}`);
    console.log(`  localRasterPath: ${b.localRasterPath}`);
  }

  // 4. Optical Change Detection Records
  console.log('\n--- OPTICAL CHANGE DETECTION RECORDS ---');
  const opticalChanges = await ChangeDetectionModel.find({ sensorType: { $ne: 'SAR' } });
  console.log(`Found ${opticalChanges.length} optical change detection records.`);
  for (const c of opticalChanges) {
    console.log(`\nChangeDetection ID: ${c._id} (${c.changeId})`);
    console.log(`  zoneId: ${c.zoneId}`);
    console.log(`  observationId: ${c.observationId}`);
    console.log(`  baselineId: ${c.baselineId}`);
    console.log(`  referenceObservationId: ${c.referenceObservationId}`);
    console.log(`  sensorType: ${c.sensorType} | source: ${c.source}`);
    console.log(`  detectedAt: ${c.detectedAt?.toISOString()}`);
    console.log(`  calculationMode: ${c.calculationMode}`);
    console.log(`  spatialSource: ${c.spatialSource}`);
    console.log(`  calculationMethod: ${c.calculationMethod}`);
    console.log(`  spatialCalculation: ${c.spatialCalculation}`);
    console.log(`  zoneArea: ${c.zoneArea} ha | changedArea: ${c.changedArea} ha | affectedAreaPercentage: ${c.affectedAreaPercentage}%`);
    console.log(`  changedPixels: ${(c as any).changedPixels} | validPixels: ${(c as any).validPixels}`);
    console.log(`  severity: ${c.severity} | evidenceStrength: ${c.evidenceStrength}`);
    console.log(`  categories: ${JSON.stringify(c.categories)}`);
    console.log(`  changeIndicators:`, JSON.stringify(c.changeIndicators, null, 2));
    console.log(`  analysisGrid:`, JSON.stringify(c.analysisGrid, null, 2));
    console.log(`  rasterStatistics:`, JSON.stringify(c.rasterStatistics, null, 2));
    console.log(`  thresholdConfig:`, JSON.stringify(c.thresholdConfig, null, 2));
    console.log(`  explanation: ${c.explanation}`);
    console.log(`  auditStatus: ${c.auditStatus}`);
  }

  // 5. Optical Alerts
  console.log('\n--- OPTICAL ALERTS ---');
  const opticalAlerts = await AlertModel.find({ sensorType: { $ne: 'SAR' } });
  console.log(`Found ${opticalAlerts.length} optical alert records.`);
  for (const a of opticalAlerts) {
    console.log(`\nAlert ID: ${a._id} (${a.alertId})`);
    console.log(`  zoneId: ${a.zoneId}`);
    console.log(`  changeDetectionId: ${a.changeDetectionId}`);
    console.log(`  sensorType: ${a.sensorType} | source: ${(a as any).source}`);
    console.log(`  severity: ${a.severity} | evidenceStrength: ${a.evidenceStrength}`);
    console.log(`  affectedAreaPercentage: ${a.affectedAreaPercentage}%`);
    console.log(`  explanation: ${a.explanation}`);
  }

  // Also check ALL ChangeDetection records to make sure we don't miss cross-sensor or mislabeled records
  console.log('\n--- ALL CHANGE DETECTION RECORDS SUMMARY ---');
  const allChanges = await ChangeDetectionModel.find({}, { changeId: 1, sensorType: 1, source: 1, calculationMethod: 1, affectedAreaPercentage: 1, zoneId: 1, detectedAt: 1, auditStatus: 1 });
  for (const ac of allChanges) {
    console.log(`Change ${ac.changeId}: sensorType=${ac.sensorType}, source=${ac.source}, method=${ac.calculationMethod}, affectedArea=${ac.affectedAreaPercentage}%, auditStatus=${ac.auditStatus}`);
  }

  await mongoose.disconnect();
  console.log('\n============================================================');
  console.log('AUDIT SCRIPT COMPLETE');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('Audit script error:', err);
  process.exit(1);
});
