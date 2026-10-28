/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AutomatedMonitoringService } from '../services/AutomatedMonitoringService.js';

async function main() {
  console.info('================================================================');
  console.info('REAL SATHIYAR INCREMENTAL MONITORING SCAN EXECUTION');
  console.info('Option A: Latest Observation Only Policy');
  console.info('================================================================\n');

  await connectDatabase();

  const zone = await Zone.findOne({ name: 'sathiyar' });
  if (!zone) {
    throw new Error('Sathiyar zone not found in database!');
  }

  const baseline = await BaselineModel.findOne({ zoneId: zone._id, status: 'ACTIVE' });
  if (!baseline) {
    throw new Error('Active baseline for Sathiyar zone not found!');
  }

  const baselineMeta = await SatelliteMetadata.findById(baseline.satelliteMetadataId);
  if (!baselineMeta) {
    throw new Error('Baseline SatelliteMetadata not found!');
  }

  console.info('INITIAL STATE:');
  console.info(`  Zone: ${zone.name} (${zone.zoneId}) [_id: ${zone._id}]`);
  console.info(`  Zone Status: ${zone.status}`);
  console.info(`  Active Baseline ID: ${baseline._id}`);
  console.info(`  Baseline Image ID: ${baselineMeta.imageId}`);
  console.info(`  Baseline Acquisition Date: ${baseline.acquisitionDate?.toISOString()}`);
  console.info(`  Baseline Cloud Cover: ${baseline.cloudCover}%`);

  const initialBaselineAcq = baseline.acquisitionDate?.getTime();
  const initialBaselineSatMetaId = baseline.satelliteMetadataId.toString();

  console.info('\n--- Triggering Live Incremental Monitoring Cycle ---');
  const service = AutomatedMonitoringService.getInstance();
  const startTime = Date.now();
  const cycleResult = await service.runAutomatedMonitoringCycle({});
  const durationMs = Date.now() - startTime;

  console.info('\n--- Cycle Result ---');
  console.info(JSON.stringify(cycleResult, null, 2));

  // Inspect DB State after cycle
  console.info('\n--- POST-SCAN DATABASE INSPECTION ---');

  // 1. Verify baseline immutability
  const postBaseline = await BaselineModel.findById(baseline._id);
  const baselineUnchanged =
    postBaseline?.acquisitionDate?.getTime() === initialBaselineAcq &&
    postBaseline?.satelliteMetadataId.toString() === initialBaselineSatMetaId &&
    postBaseline?.status === 'ACTIVE';
  console.info(`  Baseline Immutability Verified: ${baselineUnchanged ? 'YES (UNMODIFIED)' : 'FAILED'}`);

  // 2. Query latest IncrementalMonitoringRecord
  const latestRecord = await IncrementalMonitoringRecordModel.findOne({ areaId: zone._id.toString() })
    .sort({ createdAt: -1 });

  console.info('  Latest Incremental Record:', {
    jobId: latestRecord?.jobId,
    targetObservationId: latestRecord?.targetObservationId,
    lifecycleState: latestRecord?.lifecycleState,
    acquisitionDate: latestRecord?.acquisitionDate?.toISOString(),
    completedAt: latestRecord?.completedAt?.toISOString(),
    results: latestRecord?.results,
  });

  // 3. Query SatelliteMetadata for the newly processed observation
  let obsMeta = null;
  if (latestRecord?.targetObservationId) {
    obsMeta = await SatelliteMetadata.findOne({ imageId: latestRecord.targetObservationId });
    console.info('  Observation Satellite Metadata:', {
      _id: obsMeta?._id,
      imageId: obsMeta?.imageId,
      acquisitionDate: obsMeta?.acquisitionDate?.toISOString(),
      cloudCover: obsMeta?.cloudCover,
      processingStatus: obsMeta?.processingStatus,
      geeExportTaskId: obsMeta?.geeExportTaskId,
      driveFileName: obsMeta?.driveFileName,
      localRasterPath: obsMeta?.localRasterPath,
      metadata: obsMeta?.metadata,
    });
  }

  // 4. Query ProcessedImageResult
  let processedResult = null;
  if (latestRecord?.results?.processedImageResultId) {
    processedResult = await ProcessedImageResultModel.findById(latestRecord.results.processedImageResultId);
    console.info('  Processed Image Result:', {
      _id: processedResult?._id,
      processingStatus: processedResult?.processingStatus,
      indices: (processedResult as any)?.indices,
      opticalMetrics: processedResult?.opticalMetrics,
      qualityMetrics: processedResult?.qualityMetrics,
    });
  }

  // 5. Query ChangeDetection
  let changeDoc = null;
  if (latestRecord?.results?.changeDetectionId) {
    changeDoc = await ChangeDetectionModel.findById(latestRecord.results.changeDetectionId);
    console.info('  Change Detection Document:', {
      _id: changeDoc?._id,
      changeId: changeDoc?.changeId,
      severity: changeDoc?.severity,
      affectedAreaPercentage: changeDoc?.affectedAreaPercentage,
      changedArea: changeDoc?.changedArea,
      zoneArea: changeDoc?.zoneArea,
    });
  }

  // 6. Summary for the UI
  const summaries = await service.getAreaMonitoringSummaries();
  const sathiyarSummary = summaries.find((s) => s.areaId === zone._id.toString());
  console.info('  Sathiyar Monitored Area Summary (UI View):', sathiyarSummary);

  await mongoose.disconnect();
  console.info('\nReal scan completed successfully.');
}

main().catch((err) => {
  console.error('Scan Failed:', err);
  process.exit(1);
});
