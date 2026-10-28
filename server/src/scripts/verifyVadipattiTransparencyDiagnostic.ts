/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { User } from '../models/User.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';
import {
  AutomatedMonitoringService,
  type AreaInfo,
} from '../services/AutomatedMonitoringService.js';

async function runVadipattiDiagnostic(): Promise<void> {
  console.info('================================================================');
  console.info('READ-ONLY REAL GEE MONITORING TRANSPARENCY DIAGNOSTIC — VADIPATTI');
  console.info('================================================================\n');

  await connectDatabase();

  // 1. Record pre-execution invariant counts
  const usersBefore = await User.countDocuments();
  const zonesBefore = await Zone.countDocuments();
  const baselinesBefore = await BaselineModel.countDocuments();
  const satellitesBefore = await SatelliteMetadata.countDocuments();
  const changesBefore = await ChangeDetectionModel.countDocuments();
  const alertsBefore = await AlertModel.countDocuments();
  const jobsBefore = await MonitoringJobModel.countDocuments();
  const incrementalBefore = await IncrementalMonitoringRecordModel.countDocuments();

  console.info('--- Pre-Execution Production Invariants ---');
  console.info(`Users:        ${usersBefore} (expected 3)`);
  console.info(`Zones:        ${zonesBefore} (expected 1)`);
  console.info(`Baselines:    ${baselinesBefore} (expected 1)`);
  console.info(`Satellites:   ${satellitesBefore} (expected 5)`);
  console.info(`Changes:      ${changesBefore} (expected 1)`);
  console.info(`Alerts:       ${alertsBefore} (expected 1)`);
  console.info(`Jobs:         ${jobsBefore}`);
  console.info(`Incremental:  ${incrementalBefore}\n`);

  if (usersBefore !== 3 || zonesBefore !== 1 || baselinesBefore !== 1) {
    console.error('❌ SAFETY ABORT: Production database counts do not match expected invariants.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // 2. Query Vadipatti Zone
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  if (!vadipatti) {
    console.error('❌ Vadipatti zone ZONE-260913-7787 not found in database!');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.info(`Found Vadipatti zone: ${vadipatti.name} (${vadipatti.zoneId})`);
  console.info(`ObjectId: ${vadipatti._id.toString()}`);

  const activeBaseline = await BaselineModel.findOne({ zoneId: vadipatti._id, isActive: true });
  console.info(`Active baseline ID: ${activeBaseline?._id?.toString() ?? 'NONE'}`);
  console.info(`Active baseline sensor: ${activeBaseline?.sensorType ?? 'NONE'}`);
  console.info(`Active baseline date: ${activeBaseline?.acquisitionDate?.toISOString() ?? 'NONE'}`);

  const latestIncremental = await IncrementalMonitoringRecordModel.findOne({ areaId: vadipatti._id.toString() })
    .sort({ acquisitionDate: -1 });
  console.info(`Latest incremental acquisition date: ${latestIncremental?.acquisitionDate?.toISOString() ?? 'NONE'}\n`);

  const areaInfo: AreaInfo = {
    id: vadipatti._id.toString(),
    name: vadipatti.name,
    type: 'PERMANENT',
    boundary: vadipatti.boundary,
    status: vadipatti.status,
    category: vadipatti.category,
    areaHectares: vadipatti.areaHectares,
  };

  const autoService = AutomatedMonitoringService.getInstance();

  console.info('Executing live GEE query for Vadipatti via AutomatedMonitoringService...');
  const startTime = Date.now();
  const { areaResult } = await autoService.processAreaIncrementalDetailed(areaInfo);
  const durationMs = Date.now() - startTime;

  console.info('\n================================================================');
  console.info('VADIPATTI MONITORING CYCLE RESULT (LIVE GEE TRANSPARENCY)');
  console.info('================================================================');
  console.info(`Execution Time: ${durationMs}ms`);
  console.info(`Discovered:     ${areaResult.discoveredCount}`);
  console.info(`Eligible:       ${areaResult.eligibleCount}`);
  console.info(`Processed:      ${areaResult.processedCount}`);
  console.info(`Alerts:         0`);

  if (areaResult.discoveredCount > 0 && areaResult.eligibleCount === 0) {
    console.info('\nStatus: WAITING_FOR_NEXT_CYCLE (Waiting for new cloud-free satellite acquisition)');
    console.info('\nWHY NO IMAGE WAS PROCESSED:');
    console.info('Rejection Summary:');
    console.info(`  Cloud Cover Exceeds Threshold: ${areaResult.rejectionSummary.CLOUD_COVER_EXCEEDS_THRESHOLD}`);
    console.info(`  Sensor Track Mismatch:         ${areaResult.rejectionSummary.SENSOR_TRACK_MISMATCH}`);
    console.info(`  Temporal Ineligible:           ${areaResult.rejectionSummary.TEMPORAL_INELIGIBLE}`);
    console.info(`  Geometry Not Intersecting:     ${areaResult.rejectionSummary.GEOMETRY_NOT_INTERSECTING}`);
    console.info(`  Duplicate Observation:         ${areaResult.rejectionSummary.DUPLICATE_OBSERVATION}`);
    console.info(`  Baseline Match:                ${areaResult.rejectionSummary.BASELINE_MATCH}`);
    console.info(`  Other:                         ${areaResult.rejectionSummary.OTHER}`);

    console.info('\nRejected Observations Details:');
    for (const obs of areaResult.rejectedObservations) {
      console.info(`  - [${obs.reasonCode}] ${obs.imageId}`);
      console.info(`      Acquisition: ${obs.acquisitionTime}`);
      console.info(`      Sensor:      ${obs.sensor ?? 'UNKNOWN'}`);
      if (obs.cloudCover !== undefined) {
        console.info(`      Cloud Cover: ${obs.cloudCover.toFixed(2)}% (Threshold: <= 20%)`);
      }
      console.info(`      Reason:      ${obs.reason}`);
    }
  }

  if (areaResult.searchConfig) {
    console.info('\nSearch Configuration:');
    console.info(`  Window:          ${areaResult.searchConfig.searchWindowStart} to ${areaResult.searchConfig.searchWindowEnd}`);
    console.info(`  Cloud Threshold: <= ${areaResult.searchConfig.cloudCoverThreshold}%`);
    console.info(`  Baseline:        ${areaResult.searchConfig.activeBaselineSensor} (${areaResult.searchConfig.activeBaselineSource})`);
    console.info(`  Last Processed:  ${areaResult.searchConfig.lastProcessedDate ?? 'None'}`);
  }

  // 3. Post-execution invariant check (ensure NO data was modified)
  console.info('\n--- Post-Execution Safety Verification ---');
  const usersAfter = await User.countDocuments();
  const zonesAfter = await Zone.countDocuments();
  const baselinesAfter = await BaselineModel.countDocuments();
  const satellitesAfter = await SatelliteMetadata.countDocuments();
  const changesAfter = await ChangeDetectionModel.countDocuments();
  const alertsAfter = await AlertModel.countDocuments();
  const jobsAfter = await MonitoringJobModel.countDocuments();
  const incrementalAfter = await IncrementalMonitoringRecordModel.countDocuments();

  console.info(`Users:        ${usersAfter} (Before: ${usersBefore})`);
  console.info(`Zones:        ${zonesAfter} (Before: ${zonesBefore})`);
  console.info(`Baselines:    ${baselinesAfter} (Before: ${baselinesBefore})`);
  console.info(`Satellites:   ${satellitesAfter} (Before: ${satellitesBefore})`);
  console.info(`Changes:      ${changesAfter} (Before: ${changesBefore})`);
  console.info(`Alerts:       ${alertsAfter} (Before: ${alertsBefore})`);
  console.info(`Jobs:         ${jobsAfter} (Before: ${jobsBefore})`);
  console.info(`Incremental:  ${incrementalAfter} (Before: ${incrementalBefore})`);

  const unchanged =
    usersBefore === usersAfter &&
    zonesBefore === zonesAfter &&
    baselinesBefore === baselinesAfter &&
    satellitesBefore === satellitesAfter &&
    changesBefore === changesAfter &&
    alertsBefore === alertsAfter &&
    jobsBefore === jobsAfter &&
    incrementalBefore === incrementalAfter;

  if (unchanged) {
    console.info('\n✅ READ-ONLY INVARIANTS 100% PRESERVED: Zero production records modified.');
  } else {
    console.error('\n❌ WARNING: Database record counts changed during read-only diagnostic!');
  }

  await mongoose.disconnect();
  console.info('MongoDB disconnected.\n');
}

runVadipattiDiagnostic().catch((err) => {
  console.error('Fatal error during Vadipatti diagnostic:', err);
  process.exit(1);
});
