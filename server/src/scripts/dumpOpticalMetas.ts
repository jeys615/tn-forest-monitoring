import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import fs from 'node:fs';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const metas = await SatelliteMetadata.find({ sensorType: { $ne: 'SAR' } });
  console.log(`Found ${metas.length} optical metadata records:`);
  for (const m of metas) {
    let rasterInfo: any = 'NONE';
    if (m.localRasterPath && fs.existsSync(m.localRasterPath)) {
      try {
        const parsed = await GeoTiffService.readGeoTiff(m.localRasterPath);
        rasterInfo = {
          width: parsed.metadata.width,
          height: parsed.metadata.height,
          numBands: parsed.metadata.numBands,
          crs: parsed.metadata.crs,
          originalCrs: parsed.metadata.originalCrs,
          pixelScale: parsed.metadata.pixelScale,
          bbox: parsed.metadata.bbox,
          nodata: parsed.metadata.nodata,
          pixelAreaM2: parsed.metadata.pixelAreaM2,
          bandCount: parsed.bandData.length,
          bandStats: parsed.bandData.map((b, idx) => {
            let min = Infinity, max = -Infinity, sum = 0, count = 0;
            for (let i = 0; i < b.length; i++) {
              const v = b[i];
              if (!isNaN(v) && v !== parsed.metadata.nodata) {
                if (v < min) min = v;
                if (v > max) max = v;
                sum += v;
                count++;
              }
            }
            return {
              bandIndex: idx,
              min: count > 0 ? min : null,
              max: count > 0 ? max : null,
              mean: count > 0 ? sum / count : null,
              validPixelCount: count,
            };
          }),
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
      metadata: m.metadata,
    }, null, 2));
  }
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
