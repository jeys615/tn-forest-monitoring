import { connectDatabase } from '../config/database.js';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import mongoose from 'mongoose';

async function test() {
  await connectDatabase();
  const service = new ChangeDetectionService();
  const changeId = 'CHG-1791379089579-2827';
  console.log('Testing getComparisonMetadata...');
  try {
    const meta = await service.getComparisonMetadata(changeId);
    console.log('Comparison metadata SUCCESS:');
    console.log({
      changeId: meta.changeId,
      zoneId: meta.zoneId,
      zoneName: meta.zoneName,
      baselineImageId: meta.baseline.imageId,
      baselineRasterAvailable: meta.baseline.rasterAvailable,
      currentImageId: meta.current.imageId,
      currentRasterAvailable: meta.current.rasterAvailable,
    });
  } catch (err: any) {
    console.error('getComparisonMetadata FAILED:', err.message);
  }

  console.log('\nTesting getBaselineImageBuffer...');
  try {
    const buf = await service.getBaselineImageBuffer(changeId);
    console.log(`Baseline image buffer SUCCESS! Buffer size: ${buf.length} bytes, format: PNG signature check: ${buf.slice(0, 8).toString('hex')}`);
  } catch (err: any) {
    console.error('getBaselineImageBuffer FAILED:', err.message, err.stack);
  }

  console.log('\nTesting getCurrentImageBuffer...');
  try {
    const buf = await service.getCurrentImageBuffer(changeId);
    console.log(`Current image buffer SUCCESS! Buffer size: ${buf.length} bytes, format: PNG signature check: ${buf.slice(0, 8).toString('hex')}`);
  } catch (err: any) {
    console.error('getCurrentImageBuffer FAILED:', err.message, err.stack);
  }

  await mongoose.connection.close();
  process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
