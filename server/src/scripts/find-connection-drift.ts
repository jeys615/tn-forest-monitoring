import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function testImports() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Initial DB:', mongoose.connection.name);

  // Import MonitoringSchedulerService
  const { MonitoringSchedulerService } = await import('../services/MonitoringSchedulerService.js');
  console.log('After MonitoringSchedulerService DB:', mongoose.connection.name);

  // Import MonitoringSchedulerWorker
  const { MonitoringSchedulerWorker } = await import('../workers/MonitoringSchedulerWorker.js');
  console.log('After MonitoringSchedulerWorker DB:', mongoose.connection.name);

  // Import AutomatedMonitoringService
  const { AutomatedMonitoringService } = await import('../services/AutomatedMonitoringService.js');
  console.log('After AutomatedMonitoringService DB:', mongoose.connection.name);

  const { Zone } = await import('../models/Zone.js');
  console.log('Zone count:', await Zone.countDocuments());
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  console.log('Vadipatti found:', !!vadipatti);

  await mongoose.disconnect();
}

testImports();
