import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';

async function checkBands() {
  await mongoose.connect(env.MONGODB_URI);
  const chg = await ChangeDetectionModel.findOne({ changeId: 'CHG-1791696357291-3501' }).lean();
  const baseMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: chg!.baselineId }, { imageId: /20200109/ }],
  }).lean();
  const curMeta = await SatelliteMetadata.findOne({
    $or: [{ _id: chg!.observationId }, { imageId: /20240207/ }],
  }).lean();

  const baseParsed = await GeoTiffService.readGeoTiff(baseMeta!.localRasterPath || '');
  const curParsed = await GeoTiffService.readGeoTiff(curMeta!.localRasterPath || '');

  console.log('Base GeoTIFF bands:', baseParsed.bandCount, 'width:', baseParsed.width, 'height:', baseParsed.height);
  console.log('Cur GeoTIFF bands:', curParsed.bandCount, 'width:', curParsed.width, 'height:', curParsed.height);

  await mongoose.disconnect();
}
checkBands().catch(console.error);
