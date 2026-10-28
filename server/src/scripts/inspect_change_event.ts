import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { Zone } from '../models/Zone.js';

async function main() {
  await connectDatabase();
  const cd = await ChangeDetectionModel.findOne({ changeId: 'CHG-1788726810637-8266' }).lean();
  console.log('--- CHANGE DETECTION RECORD ---');
  console.log(JSON.stringify(cd, null, 2));

  if (cd?.observationId) {
    const curMeta = await SatelliteMetadata.findById(cd.observationId).lean();
    console.log('\n--- CURRENT SATELLITE METADATA ---');
    console.log(JSON.stringify(curMeta, null, 2));

    const curProc = await ProcessedImageResultModel.findOne({ satelliteMetadataId: cd.observationId }).lean();
    console.log('\n--- CURRENT PROCESSED RESULT ---');
    console.log(JSON.stringify(curProc, null, 2));
  }

  if (cd?.zoneId) {
    const zone = await Zone.findById(cd.zoneId).lean();
    console.log('\n--- ZONE RECORD ---');
    console.log('Zone Name:', zone?.name, 'Area Ha:', zone?.areaHectares);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
