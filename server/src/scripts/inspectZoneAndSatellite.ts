import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { BaselineModel } from '../models/Baseline.js';
import { AutomatedMonitoringService } from '../services/AutomatedMonitoringService.js';
import { GeeSatelliteService } from '../services/gee/GeeSatelliteService.js';
import { SensorType } from '@tn-forest/shared/types';

async function check() {
  await mongoose.connect(env.MONGODB_URI);
  
  const zone = await Zone.findOne({ name: 'sathiyar' }).lean();
  if (!zone) {
    console.error('Zone sathiyar not found');
    return;
  }
  console.log(`Zone: ${zone.name} (${zone.zoneId})`);

  const baseline = await BaselineModel.findOne({ zoneId: zone._id, isActive: true }).lean();
  console.log(`Active baseline acq date: ${baseline?.acquisitionDate}`);

  const autoService = AutomatedMonitoringService.getInstance();
  const geeService = new GeeSatelliteService();

  const startDate = new Date(baseline!.acquisitionDate!.getTime() + 1000);
  const endDate = new Date();

  console.log('\n--- Testing GeeSatelliteService.searchSentinel2Images directly ---');
  console.log(`startDate: ${startDate.toISOString().slice(0, 10)}, endDate: ${endDate.toISOString().slice(0, 10)}`);
  
  const t0 = Date.now();
  try {
    const s2Res = await geeService.searchSentinel2Images({
      boundary: zone.boundary,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      maxCloudCover: 20,
      sensor: SensorType.OPTICAL,
    });
    console.log(`searchSentinel2Images completed in ${Date.now() - t0}ms`);
    console.log(`Total found: ${s2Res.totalFound}`);
    console.log(`Images count: ${s2Res.images.length}`);
    if (s2Res.images.length > 0) {
      console.log('First 5 images:');
      s2Res.images.slice(0, 5).forEach((img, i) => {
        console.log(`  #${i + 1}: ${img.imageId} (${img.acquisitionDate}, cloud: ${img.cloudCoverPercentage}%)`);
      });
    }
  } catch (err) {
    console.error('searchSentinel2Images failed:', err);
  }

  console.log('\n--- Testing getActiveMonitoringAreas ---');
  const activeAreas = await autoService.getActiveMonitoringAreas(false);
  console.log(`Active areas count: ${activeAreas.length}`);
  activeAreas.forEach((a) => console.log(`- Area: ${a.name} (${a.id}, type: ${a.type}, status: ${a.status})`));

  console.log('\n--- Calling autoService.runAutomatedMonitoringCycle ---');
  try {
    const cycleRes = await autoService.runAutomatedMonitoringCycle({ forceAllAreas: false });
    console.log('Cycle Result:', cycleRes);
  } catch (err) {
    console.error('runAutomatedMonitoringCycle threw:', err);
  }

  await mongoose.disconnect();
}

check().catch(console.error);


