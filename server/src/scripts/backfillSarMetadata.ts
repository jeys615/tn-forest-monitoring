import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { SarCompatibilityService } from '../services/spatial/SarCompatibilityService.js';
import { SensorType, SatelliteSource } from '@tn-forest/shared/types';

async function main() {
  console.info('Connecting to MongoDB at:', env.MONGODB_URI);
  await mongoose.connect(env.MONGODB_URI);

  const docs = await SatelliteMetadata.find({});
  console.info(`Found ${docs.length} total satellite metadata documents.`);

  let updatedCount = 0;
  for (const doc of docs) {
    if (doc.source === SatelliteSource.SENTINEL_1 || doc.sensorType === SensorType.SAR) {
      const parsed = SarCompatibilityService.parseSentinel1Metadata(
        doc.imageId,
        doc.metadata as Record<string, unknown> | undefined,
      );

      const updateFields = {
        platform: parsed.platform,
        mission: parsed.mission,
        instrument: parsed.instrument,
        mode: parsed.mode,
        polarizations: parsed.polarizations,
        orbitDirection: parsed.orbitDirection,
        absoluteOrbitNumber: parsed.absoluteOrbitNumber,
        relativeOrbitNumber: parsed.relativeOrbitNumber,
        metadata: {
          ...(doc.metadata || {}),
          platform: parsed.platform,
          mission: parsed.mission,
          instrument: parsed.instrument,
          mode: parsed.mode,
          polarizations: parsed.polarizations,
          orbitDirection: parsed.orbitDirection,
          absoluteOrbitNumber: parsed.absoluteOrbitNumber,
          relativeOrbitNumber: parsed.relativeOrbitNumber,
          orbitNumber: parsed.relativeOrbitNumber ?? parsed.absoluteOrbitNumber,
        },
      };

      await SatelliteMetadata.updateOne({ _id: doc._id }, { $set: updateFields });
      updatedCount++;
      console.info(
        `Updated SAR record [${doc._id}] ${doc.imageId} -> Platform: ${parsed.platform}, Track: ${parsed.relativeOrbitNumber}, AbsOrbit: ${parsed.absoluteOrbitNumber}, Direction: ${parsed.orbitDirection}, Mode: ${parsed.mode}, Pols: ${parsed.polarizations?.join('+')}`,
      );
    } else if (doc.source === SatelliteSource.SENTINEL_2 || doc.sensorType === SensorType.OPTICAL) {
      const isS2 = doc.source === SatelliteSource.SENTINEL_2;
      const isL8 = doc.source === SatelliteSource.LANDSAT_8;
      const isL9 = doc.source === SatelliteSource.LANDSAT_9;

      const platform = isS2 ? (doc.imageId.includes('S2B') ? 'Sentinel-2B' : 'Sentinel-2A') : isL8 ? 'Landsat 8' : isL9 ? 'Landsat 9' : 'Optical';
      const updateFields = {
        platform,
        mission: isS2 ? 'Sentinel-2' : 'Landsat',
        instrument: isS2 ? 'MSI' : 'OLI/TIRS',
        mode: 'STANDARD',
      };
      await SatelliteMetadata.updateOne({ _id: doc._id }, { $set: updateFields });
      console.info(`Updated Optical record [${doc._id}] ${doc.imageId} -> Platform: ${platform}`);
    }
  }

  console.info(`\nBackfill complete. ${updatedCount} SAR records updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});
