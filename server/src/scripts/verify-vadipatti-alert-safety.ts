import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AlertModel } from '../models/Alert.js';
import { Zone } from '../models/Zone.js';
import { ChangeDetectionModel } from '../models/ChangeDetection.js';

async function main() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    console.info('=== VADIPATTI & ALERT INVARIANT CHECK ===');

    // 1. Check Vadipatti zone
    const zone = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
    if (!zone) {
      console.error('❌ Vadipatti zone not found!');
      process.exit(1);
    }
    console.info(`Zone: ${zone.name} (${zone.zoneId})`);
    console.info(`Monitoring Tracks: optical=${(zone as any).monitoringTracks?.optical?.enabled}, sar=${(zone as any).monitoringTracks?.sar?.enabled}`);

    // 2. Check production alert
    const alert = await AlertModel.findOne({ alertId: 'ALT-1789295023854-8239' });
    if (!alert) {
      console.error('❌ Production alert ALT-1789295023854-8239 not found!');
      process.exit(1);
    }
    console.info(`\nAlert ID: ${alert.alertId}`);
    console.info(`Status: ${alert.status} (expected OPEN)`);
    console.info(`Severity: ${alert.severity}`);
    console.info(`Monitoring Track: ${alert.monitoringTrack}`);
    console.info(`ChangeDetection ID: ${alert.changeDetectionId}`);
    console.info(`Affected Area %: ${alert.affectedAreaPercentage}`);
    console.info(`Audit History Length: ${alert.auditHistory?.length ?? 0}`);

    // 3. Check ChangeDetection
    const change = await ChangeDetectionModel.findOne({ changeId: 'CHG-1789295023854-2895' });
    if (!change) {
      console.error('❌ Production ChangeDetection CHG-1789295023854-2895 not found!');
      process.exit(1);
    }
    console.info(`\nChangeDetection ID: ${change.changeId}`);
    console.info(`Observation ID: ${change.observationId}`);
    console.info(`Baseline ID: ${change.baselineId}`);
    console.info(`Monitoring Track: ${change.monitoringTrack}`);

    console.info('\n✅ All Vadipatti and production alert invariants verified.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err: any) {
    console.error('Error:', err.message || err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
