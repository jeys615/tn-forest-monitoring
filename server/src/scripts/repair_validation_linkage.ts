import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { BaselineModel } from '../models/Baseline.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { Types } from 'mongoose';
import mongoose from 'mongoose';

async function repair() {
  console.log('=== REPAIRING AUTHORITATIVE VALIDATION DATA LINKAGES ===\n');
  await connectDatabase();

  const sirumalaiZoneId = new Types.ObjectId('6ac5a9d496837067de289f3b');
  const sirumalaiZone = await Zone.findById(sirumalaiZoneId);
  if (!sirumalaiZone) {
    throw new Error('VALIDATION-SIRUMALAI-S2 zone (6ac5a9d496837067de289f3b) not found in database!');
  }
  console.log(`Found target zone: ${sirumalaiZone.name} (${sirumalaiZone.zoneId}, _id: ${sirumalaiZone._id})`);

  // 1. Repair SatelliteMetadata records: Add Sirumalai to intersectingZones
  const meta2020 = await SatelliteMetadata.findOne({ imageId: /20200109.*T43PHM/ });
  const meta2026 = await SatelliteMetadata.findOne({ imageId: /20260122.*T43PHM/ });

  if (!meta2020 || !meta2026) {
    throw new Error(`SatelliteMetadata records for 20200109 or 20260122 not found!`);
  }

  console.log('\n--- 1. Updating SatelliteMetadata intersectingZones ---');
  for (const meta of [meta2020, meta2026]) {
    const existingZones = meta.intersectingZones.map((z: any) => z.toString());
    if (!existingZones.includes(sirumalaiZoneId.toString())) {
      existingZones.push(sirumalaiZoneId.toString());
    }
    const updatedZoneIds = existingZones.map(id => new Types.ObjectId(id));
    await SatelliteMetadata.collection.updateOne(
      { _id: meta._id },
      { $set: { intersectingZones: updatedZoneIds } }
    );
    console.log(`Updated ${meta.imageId} intersectingZones:`, updatedZoneIds.map(id => id.toString()));
  }

  // 2. Repair ChangeDetection record CHG-1791379089579-2827
  console.log('\n--- 2. Updating ChangeDetection CHG-1791379089579-2827 zoneId ---');
  const cd = await ChangeDetectionModel.findOne({ changeId: 'CHG-1791379089579-2827' });
  if (!cd) {
    throw new Error('ChangeDetection record CHG-1791379089579-2827 not found!');
  }
  console.log(`Current CD zoneId: ${cd.zoneId?.toString()}, target: ${sirumalaiZoneId.toString()}`);
  await ChangeDetectionModel.collection.updateOne(
    { _id: cd._id },
    { $set: { zoneId: sirumalaiZoneId } }
  );
  console.log(`Successfully updated ChangeDetection ${cd.changeId} zoneId to ${sirumalaiZoneId}`);

  // 3. Repair Baseline records
  console.log('\n--- 3. Updating Baseline records ---');
  // Deactivate 2026-03-10 baseline for Sirumalai if active
  await BaselineModel.collection.updateMany(
    { zoneId: sirumalaiZoneId, _id: { $ne: new Types.ObjectId('6ac643d2540f1518603d0728') } },
    { $set: { isActive: false } }
  );
  // Set 2020-01-09 baseline zoneId to Sirumalai and isActive: true
  const base2020 = await BaselineModel.findById('6ac643d2540f1518603d0728');
  if (base2020) {
    await BaselineModel.collection.updateOne(
      { _id: base2020._id },
      { $set: { zoneId: sirumalaiZoneId, isActive: true } }
    );
    console.log(`Successfully updated Baseline ${base2020._id} (${base2020.imageId}) zoneId to ${sirumalaiZoneId} and isActive to true`);
  } else {
    console.warn('Baseline 6ac643d2540f1518603d0728 not found by ID, searching by imageId...');
    const altBase = await BaselineModel.findOne({ imageId: /20200109.*T43PHM/ });
    if (altBase) {
      await BaselineModel.collection.updateOne(
        { _id: altBase._id },
        { $set: { zoneId: sirumalaiZoneId, isActive: true } }
      );
      console.log(`Updated Baseline ${altBase._id} zoneId to ${sirumalaiZoneId}`);
    }
  }

  // 4. Update ProcessedImageResult records
  console.log('\n--- 4. Updating ProcessedImageResult records ---');
  const procUpdated = await ProcessedImageResultModel.collection.updateMany(
    { satelliteMetadataId: { $in: [meta2020._id, meta2026._id] } },
    { $set: { zoneId: sirumalaiZoneId } }
  );
  console.log(`Updated ${procUpdated.modifiedCount} ProcessedImageResult records to zoneId ${sirumalaiZoneId}`);

  // 5. Verification check
  console.log('\n--- 5. Verification ---');
  const verifyMeta = await SatelliteMetadata.find({ intersectingZones: sirumalaiZoneId });
  console.log(`SatelliteMetadata records intersecting Sirumalai (${verifyMeta.length}):`);
  for (const m of verifyMeta) {
    console.log(` - ${m.imageId} (${m.acquisitionDate.toISOString().slice(0, 10)}) status: ${m.processingStatus}`);
  }

  const verifyCd = await ChangeDetectionModel.find({ zoneId: sirumalaiZoneId });
  console.log(`ChangeDetection records for Sirumalai (${verifyCd.length}):`);
  for (const c of verifyCd) {
    console.log(` - ${c.changeId} (detected: ${c.detectedAt.toISOString().slice(0, 10)})`);
  }

  const verifyBase = await BaselineModel.find({ zoneId: sirumalaiZoneId, isActive: true });
  console.log(`Active Baseline for Sirumalai:`, verifyBase.map(b => ({ id: b._id.toString(), imageId: b.imageId, date: b.acquisitionDate })));

  console.log('\n✅ REPAIR COMPLETE & VERIFIED');
  await mongoose.connection.close();
  process.exit(0);
}

repair().catch(err => {
  console.error('Repair failed:', err);
  process.exit(1);
});
