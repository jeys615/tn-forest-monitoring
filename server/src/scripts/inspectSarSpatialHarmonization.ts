import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import fs from 'node:fs';

async function inspectChangeDetection() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('--- 1. CHANGEDETECTION RECORD ---');
  const change = await ChangeDetectionModel.findById('6ab90a0a65d99f53e6ce7555').lean();
  console.log(JSON.stringify(change, null, 2));

  console.log('\n--- 2. BASELINE RECORD ---');
  const baseline = await BaselineModel.findById(change?.baselineId).lean();
  console.log(JSON.stringify(baseline, null, 2));

  console.log('\n--- 3. BASELINE SATELLITEMETADATA ---');
  const baseMeta = await SatelliteMetadata.findById(baseline?.satelliteMetadataId).lean();
  console.log(JSON.stringify(baseMeta, null, 2));

  console.log('\n--- 4. CURRENT SATELLITEMETADATA ---');
  const currMeta = await SatelliteMetadata.findById(change?.observationId).lean();
  console.log(JSON.stringify(currMeta, null, 2));

  console.log('\n--- 5. PROCESSED IMAGE RESULTS ---');
  const baseProcessed = await ProcessedImageResultModel.find({ satelliteMetadataId: baseline?.satelliteMetadataId }).lean();
  console.log('Base processed count:', baseProcessed.length);
  console.log(JSON.stringify(baseProcessed, null, 2));

  const currProcessed = await ProcessedImageResultModel.find({ satelliteMetadataId: change?.observationId }).lean();
  console.log('Curr processed count:', currProcessed.length);
  console.log(JSON.stringify(currProcessed, null, 2));

  console.log('\n--- 6. PHYSICAL GEOTIFF HEADER INSPECTION ---');
  const basePath = baseline?.localRasterPath || baseMeta?.localRasterPath;
  const currPath = currMeta?.localRasterPath;

  console.log('Baseline raster path:', basePath, 'exists:', fs.existsSync(basePath!));
  console.log('Current raster path:', currPath, 'exists:', fs.existsSync(currPath!));

  if (basePath && fs.existsSync(basePath)) {
    const baseParsed = await GeoTiffService.readGeoTiff(basePath);
    console.log('Baseline Parsed Metadata:', JSON.stringify(baseParsed.metadata, null, 2));
  }

  if (currPath && fs.existsSync(currPath)) {
    const currParsed = await GeoTiffService.readGeoTiff(currPath);
    console.log('Current Parsed Metadata:', JSON.stringify(currParsed.metadata, null, 2));
  }

  await mongoose.disconnect();
}

inspectChangeDetection().catch(console.error);
