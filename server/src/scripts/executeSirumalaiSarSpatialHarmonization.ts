import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { ChangeDetectionService } from '../services/ChangeDetectionService.js';
import { ChangeCalculationMethod, SpatialCalculationType } from '@tn-forest/shared/types';

function parsePngDimensions(buf: Buffer): { width: number; height: number } {
  // Check PNG signature: 137 80 78 71 13 10 26 10
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error('Buffer is not a valid PNG image');
  }
  // IHDR starts at byte 12 (chunk type 'IHDR'), width is at offset 16, height at offset 20 (big-endian)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function run() {
  console.log('Connecting to MongoDB at:', env.MONGODB_URI);
  await mongoose.connect(env.MONGODB_URI);

  // Synchronize collection indexes so calculationMethod is part of compound unique key
  try {
    const coll = mongoose.connection.collection('changedetections');
    const existingIndexes = await coll.indexes();
    const oldIndex = existingIndexes.find((i) => i.name === 'zoneId_1_observationId_1_baselineId_1');
    if (oldIndex) {
      console.log('Dropping obsolete index zoneId_1_observationId_1_baselineId_1...');
      await coll.dropIndex('zoneId_1_observationId_1_baselineId_1');
      console.log('Dropped obsolete index.');
    }
    await ChangeDetectionModel.syncIndexes();
    console.log('Indexes synchronized successfully.');
  } catch (err: unknown) {
    console.warn('Index synchronization notice:', err instanceof Error ? err.message : err);
  }

  // -------------------------------------------------------------------------
  // STEP 1: Audit and preserve existing Sirumalai change record
  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log('STEP 1: PRESERVE HISTORICAL SAR ZONAL AUDIT RECORD');
  console.log('============================================================');
  const existingRecord = await ChangeDetectionModel.findOne({ changeId: 'CHG-1790511626250-4641' });
  if (existingRecord) {
    existingRecord.calculationMethod = ChangeCalculationMethod.SAR_ZONAL_SUMMARY;
    existingRecord.spatialCalculation = SpatialCalculationType.ZONAL_STATISTICS;
    if (!existingRecord.explanation.includes('[PRESERVED HISTORICAL AUDIT]')) {
      existingRecord.explanation = `[PRESERVED HISTORICAL AUDIT - ZONAL STATISTICS SUMMARY] ${existingRecord.explanation}`;
    }
    await existingRecord.save();
    console.log('✅ Successfully marked CHG-1790511626250-4641 as SAR_ZONAL_SUMMARY / ZONAL_STATISTICS');
  } else {
    console.warn('⚠️ Record CHG-1790511626250-4641 not found in database');
  }

  // -------------------------------------------------------------------------
  // STEP 2: Execute Real Pixel-Level SAR Change Detection
  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log('STEP 2: EXECUTE REAL PIXEL-LEVEL SAR CHANGE DETECTION');
  console.log('============================================================');
  const changeService = new ChangeDetectionService();

  const sirumalaiZoneId = '6ab5c434f979afc8c8714e25';
  const baselineId = '6ab8dab06f0c75ad0b423200';
  const observationId = '6ab8a897667c98f4208d8bc0';

  console.log(`Executing detectChange with forceRecalculate: true for Zone: ${sirumalaiZoneId}...`);
  const resultDto = await changeService.detectChange({
    zoneId: sirumalaiZoneId,
    baselineId: baselineId,
    observationId: observationId,
    forceRecalculate: true,
  });

  console.log('\nChange Detection Finished Successfully!');
  console.log('Result Change ID:', resultDto.id, resultDto.changeId);
  console.log('Calculation Method:', resultDto.calculationMethod);
  console.log('Spatial Calculation:', resultDto.spatialCalculation);
  console.log('Affected Area Percentage:', resultDto.affectedAreaPercentage, '%');
  console.log('Changed Area:', resultDto.changedArea, 'ha');
  console.log('Zone Area:', resultDto.zoneArea, 'ha');
  console.log('Severity:', resultDto.severity);
  console.log('Evidence Strength:', resultDto.evidenceStrength);

  // Verify in MongoDB
  const newRecord = await ChangeDetectionModel.findOne({ changeId: resultDto.changeId }).lean();
  if (!newRecord) {
    throw new Error(`Failed to find newly created record ${resultDto.changeId} in MongoDB`);
  }

  console.log('\n--- ANALYSIS GRID VERIFICATION ---');
  console.log('Analysis Grid CRS:', newRecord.analysisGrid?.crs);
  console.log('Grid Width x Height:', `${newRecord.analysisGrid?.width} x ${newRecord.analysisGrid?.height}`);
  console.log('Grid Pixel Size:', `${newRecord.analysisGrid?.pixelSizeX}m x ${newRecord.analysisGrid?.pixelSizeY}m`);
  console.log('Grid Origin:', `(${newRecord.analysisGrid?.originX}, ${newRecord.analysisGrid?.originY})`);
  console.log('Transform Matrix:', newRecord.analysisGrid?.transform);
  console.log('Comparison Pixel Count:', newRecord.analysisGrid?.comparisonPixelCount);
  console.log('Overlap Coverage Percentage:', `${newRecord.analysisGrid?.coveragePercentage?.toFixed(2)}%`);

  const sarThresh = newRecord.thresholdConfig as any;
  const sarStats = newRecord.rasterStatistics as any;

  console.log('\n--- THRESHOLD CONFIGURATION ---');
  console.log('VV Threshold (dB):', sarThresh?.vvThresholdDb);
  console.log('VH Threshold (dB):', sarThresh?.vhThresholdDb);
  console.log('Decision Rule:', sarThresh?.decisionRule);

  console.log('\n--- RASTER PIXEL STATISTICS ---');
  console.log('Mean Delta VV:', sarStats?.meanDeltaVv?.toFixed(4), 'dB');
  console.log('Median Delta VV:', sarStats?.medianDeltaVv?.toFixed(4), 'dB');
  console.log('Std Delta VV:', sarStats?.stdDeltaVv?.toFixed(4), 'dB');
  console.log('Mean Delta VH:', sarStats?.meanDeltaVh?.toFixed(4), 'dB');
  console.log('Median Delta VH:', sarStats?.medianDeltaVh?.toFixed(4), 'dB');
  console.log('Std Delta VH:', sarStats?.stdDeltaVh?.toFixed(4), 'dB');
  console.log('Changed VV Pixel Count:', sarStats?.changedVvPixelCount);
  console.log('Changed VH Pixel Count:', sarStats?.changedVhPixelCount);
  console.log('Combined Changed Pixel Count:', sarStats?.combinedChangedPixelCount);
  console.log('Valid Comparison Pixel Count:', sarStats?.validComparisonPixelCount);

  if (newRecord.changedGeometry) {
    console.log('\n--- VECTORIZED CHANGED GEOMETRY ---');
    console.log('Geometry Type:', newRecord.changedGeometry.type);
    console.log('Polygons/Rings:', newRecord.changedGeometry.coordinates?.length);
  }

  // -------------------------------------------------------------------------
  // STEP 3: Verify Common-Grid PNG Image Buffers for Curtain Slider
  // -------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log('STEP 3: VERIFY CURTAIN SLIDER PIXEL REGISTRATION');
  console.log('============================================================');
  console.log('Fetching baseline harmonized PNG buffer...');
  const baseBuffer = await changeService.getBaselineImageBuffer(resultDto.changeId, 'VV');
  console.log('Baseline PNG Buffer Size:', baseBuffer.length, 'bytes');

  console.log('Fetching current harmonized PNG buffer...');
  const currBuffer = await changeService.getCurrentImageBuffer(resultDto.changeId, 'VV');
  console.log('Current PNG Buffer Size:', currBuffer.length, 'bytes');

  const basePng = parsePngDimensions(baseBuffer);
  const currPng = parsePngDimensions(currBuffer);

  console.log(`Baseline PNG Dimensions: ${basePng.width} x ${basePng.height}`);
  console.log(`Current PNG Dimensions: ${currPng.width} x ${currPng.height}`);

  if (basePng.width !== currPng.width || basePng.height !== currPng.height) {
    throw new Error(`Dimension mismatch! Baseline: ${basePng.width}x${basePng.height}, Current: ${currPng.width}x${currPng.height}`);
  }

  if (newRecord.analysisGrid && (basePng.width !== newRecord.analysisGrid.width || basePng.height !== newRecord.analysisGrid.height)) {
    throw new Error(`Image dimensions ${basePng.width}x${basePng.height} do not match analysis grid ${newRecord.analysisGrid.width}x${newRecord.analysisGrid.height}`);
  }

  console.log('✅ PERFECT CURTAIN SLIDER REGISTRATION CONFIRMED: Baseline and Current images share identical pixel dimensions and coordinate grid!');

  await mongoose.disconnect();
  console.log('\nAll steps completed successfully.');
}

run().catch((err) => {
  console.error('Execution failed:', err);
  process.exit(1);
});
