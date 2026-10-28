import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';
import { AlertModel } from '../models/Alert.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { IncrementalMonitoringRecordModel } from '../models/IncrementalMonitoringRecord.js';

async function main() {
  console.info('Connecting to MongoDB at:', env.MONGODB_URI);
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.info('Connected successfully to database:', mongoose.connection.name);
    console.info('Host:', mongoose.connection.host);
    console.info('Port:', mongoose.connection.port);

    console.info('\n--- COLLECTION COUNTS ---');
    const counts = {
      users: await User.countDocuments(),
      zones: await Zone.countDocuments(),
      baselines: await BaselineModel.countDocuments(),
      satellitemetadatas: await SatelliteMetadata.countDocuments(),
      changedetections: await ChangeDetectionModel.countDocuments(),
      alerts: await AlertModel.countDocuments(),
      monitoringjobs: await MonitoringJobModel.countDocuments(),
      incrementalmonitoringrecords: await IncrementalMonitoringRecordModel.countDocuments(),
    };

    for (const [col, count] of Object.entries(counts)) {
      console.info(`  ${col.padEnd(30)}: ${count}`);
    }

    console.info('\nVerification completed successfully.');
    await mongoose.disconnect();
    console.info('Disconnected cleanly.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ MongoDB connection/query error:', err.message || err);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

main();
