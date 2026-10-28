import { connectDatabase } from '../config/database.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { Zone } from '../models/Zone.js';
import mongoose from 'mongoose';

async function main() {
  await connectDatabase();
  const zones = await Zone.find({});
  console.log(`Total Zones: ${zones.length}`);
  for (const z of zones) {
    const satCount = await SatelliteMetadata.countDocuments({ intersectingZones: z._id });
    const bCount = await BaselineModel.countDocuments({ zoneId: z._id });
    console.log(`Zone: ${z.name} (${z.zoneId}) ID: ${z._id} | SatCount: ${satCount} | BaselineCount: ${bCount}`);
    if (satCount > 0) {
      const sats = await SatelliteMetadata.find({ intersectingZones: z._id }).sort({ acquisitionDate: -1 });
      for (const s of sats) {
        const fileExists = s.localRasterPath ? (await import('node:fs')).existsSync(s.localRasterPath) : false;
        console.log(`   - Sat [${s.sensorType}] ${s.imageId} | ${s.acquisitionDate.toISOString().slice(0, 10)} | Cloud: ${s.cloudCover}% | Status: ${s.processingStatus} | localRaster: ${Boolean(s.localRasterPath)} (${s.localRasterPath || 'none'}) | fileExists: ${fileExists} | validated: ${Boolean(s.rasterValidated)} | dims: ${s.rasterWidth}x${s.rasterHeight} | crs: ${s.rasterCrs}`);
      }
    }
    if (bCount > 0) {
      const baselines = await BaselineModel.find({ zoneId: z._id });
      for (const b of baselines) {
        console.log(`   * Baseline [${b.sensorType}] ${b.imageId || b.source} | Status: ${b.status} | Active: ${b.isActive} | SatMetaRef: ${b.satelliteMetadataId} | Task: ${b.geeExportTaskId || 'none'} | Drive: ${b.driveFileId || 'none'} | localRaster: ${Boolean(b.localRasterPath)} | failure: ${b.failureReason || 'none'}`);
      }
    }
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
