import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Verify CHG-1790511626250-4641 (zonal summary) is untouched
  const zonal = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790511626250-4641' });
  console.log('Zonal record exists:', !!zonal, {
    changeId: zonal?.changeId,
    calculationMethod: zonal?.calculationMethod,
    affectedAreaPercentage: zonal?.affectedAreaPercentage,
  });

  // 2. Find CHG-1790525317279-8405
  const pixel = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790525317279-8405' });
  console.log('Pixel record exists:', !!pixel, {
    changeId: pixel?.changeId,
    calculationMethod: pixel?.calculationMethod,
    affectedAreaPercentage: pixel?.affectedAreaPercentage,
    auditStatus: (pixel as any)?.auditStatus,
  });

  if (pixel) {
    // Explicitly mark auditStatus without rewriting results or deleting
    await ChangeDetectionModel.updateOne(
      { changeId: 'CHG-1790525317279-8405' },
      {
        $set: {
          auditStatus: 'INVALID_FOR_PRODUCTION_GEOMETRY',
          explanation: `[AUDIT RECORD - INCOMPATIBLE ORBIT GEOMETRY: Baseline Track 92 vs Current Track 165] ${pixel.explanation || ''}`.trim(),
        },
      },
    );
    console.log('Successfully marked CHG-1790525317279-8405 as INVALID_FOR_PRODUCTION_GEOMETRY');
  }

  // Verify updated record
  const updated = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790525317279-8405' });
  console.log('Updated pixel record:', {
    changeId: updated?.changeId,
    affectedAreaPercentage: updated?.affectedAreaPercentage,
    auditStatus: (updated as any)?.auditStatus,
    explanation: updated?.explanation?.slice(0, 100),
  });

  await mongoose.disconnect();
}

main().catch(console.error);
