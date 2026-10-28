import { connectDatabase } from '../config/database.js';
import { SatelliteAcquisitionService } from '../services/SatelliteAcquisitionService.js';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import mongoose from 'mongoose';

async function verify() {
  await connectDatabase();
  const satService = new SatelliteAcquisitionService();
  const changeService = new ChangeDetectionService();
  const sirumalaiId = '6ac5a9d496837067de289f3b';

  console.log('=== VERIFYING SATELLITE CATALOG API QUERY FOR SIRUMALAI ===');
  const images = await satService.getAllImages({ zoneId: sirumalaiId });
  console.log(`Found ${images.length} satellite observations for VALIDATION-SIRUMALAI-S2:`);
  for (const img of images) {
    console.log(` - ID: ${img.id}`);
    console.log(`   ImageId: ${img.imageId}`);
    console.log(`   Date: ${img.acquisitionDate}`);
    console.log(`   Status: ${img.processingStatus}`);
    console.log(`   Source: ${img.source}`);
  }

  console.log('\n=== VERIFYING CHANGE DETECTION API QUERY FOR SIRUMALAI ===');
  const changes = await changeService.getChanges({ zoneId: sirumalaiId });
  console.log(`Found ${changes.length} change detections for VALIDATION-SIRUMALAI-S2:`);
  for (const c of changes) {
    console.log(` - ChangeId: ${c.changeId}`);
    console.log(`   DetectedAt: ${c.detectedAt}`);
    console.log(`   ChangedArea: ${c.changedArea} ha (${c.affectedAreaPercentage}%)`);
    console.log(`   Severity: ${c.severity}`);
    console.log(`   Source: ${c.source}`);
  }

  console.log('\n=== VERIFYING COMPARISON METADATA FOR CHG-1791379089579-2827 ===');
  const meta = await changeService.getComparisonMetadata('CHG-1791379089579-2827');
  console.log(`Comparison Metadata resolved:`);
  console.log(` - Zone: ${meta.zoneName} (${meta.zoneCode})`);
  console.log(` - Baseline ImageId: ${meta.baseline.imageId} (Available: ${meta.baseline.rasterAvailable})`);
  console.log(` - Current ImageId: ${meta.current.imageId} (Available: ${meta.current.rasterAvailable})`);
  console.log(` - Temporal Gap: ${meta.temporalGap.formatted}`);

  await mongoose.connection.close();
  process.exit(0);
}

verify().catch(e => { console.error(e); process.exit(1); });
