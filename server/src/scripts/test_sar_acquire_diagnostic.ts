import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import { SensorType, SatelliteSource } from '@tn-forest/shared/types';
import { acquireImageSchema } from '../validators/satellite.validator.js';

async function runDiagnostic() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('--- 1. DATABASE & VADIPATTI CHECK ---');
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' });
  if (!vadipatti) {
    console.error('Vadipatti zone NOT found!');
    process.exit(1);
  }
  console.log(`Vadipatti ID: ${vadipatti._id}`);
  console.log(`Boundary coordinates count: ${vadipatti.boundary.coordinates[0].length}`);

  console.log('\n--- 1b. EXISTING SATELLITEMETADATAS IN DB ---');
  const db = mongoose.connection.db;
  const existingMetas = await db?.collection('satellitemetadatas').find({}).toArray();
  for (const m of existingMetas || []) {
    console.log(`  id: ${m._id} | imageId: ${m.imageId} | source: ${m.source} | sensorType: ${m.sensorType} | status: ${m.processingStatus}`);
    if (m.processingStatus === 'FAILED' || m._id.toString() === '6ab71f54dd917534b30beb73') {
      console.log(`    failureReason: ${m.failureReason}`);
      console.log(`    geeExportTaskId: ${m.geeExportTaskId}`);
      console.log(`    driveFileName: ${m.driveFileName}`);
      console.log(`    createdAt: ${m.createdAt}`);
      console.log(`    updatedAt: ${m.updatedAt}`);
      console.log(`    metadata: ${JSON.stringify(m.metadata)}`);
    }
  }

  console.log('\n--- 2. GEE AUTHENTICATION CHECK ---');
  const authService = GeeAuthService.getInstance();
  const config = authService.getConfig();
  console.log(`Caller project: ${config.projectId}`);
  console.log(`Auth method:    ${config.authMethod}`);
  const token = await authService.getAccessToken();
  console.log(`Access token:   ${token ? 'VALID (' + token.slice(0, 15) + '...)' : 'MISSING'}`);

  console.log('\n--- 3. VALIDATION SCHEMA TEST ---');
  // Test common date formats from browser HTML5 date input: YYYY-MM-DD
  const testPayloads = [
    { zoneId: vadipatti._id.toString(), startDate: '2026-01-01', endDate: '2026-03-31', sensorType: SensorType.SAR, maxCloudCover: 100 },
    { zoneId: vadipatti._id.toString(), startDate: '2024-01-01', endDate: '2024-01-31', sensorType: SensorType.SAR, maxCloudCover: 100 },
    { zoneId: vadipatti._id.toString(), startDate: '2026-09-01', endDate: '2026-09-25', sensorType: SensorType.SAR, maxCloudCover: 100 },
  ];

  for (const p of testPayloads) {
    const parseRes = acquireImageSchema.safeParse(p);
    console.log(`Payload [${p.startDate} to ${p.endDate}]: parse success = ${parseRes.success}`);
    if (!parseRes.success) {
      console.error('Validation error:', parseRes.error.format());
    }
  }

  console.log('\n--- 4. GEE SAR COLLECTION QUERY (DIRECT) ---');
  const clientService = new GeeClientService();
  const provider = new GeeSatelliteProvider();

  // Test date ranges
  const dateRanges = [
    { start: '2026-01-01', end: '2026-03-31' },
    { start: '2024-01-01', end: '2024-01-31' },
    { start: '2026-08-01', end: '2026-09-25' },
    { start: '2026-09-01', end: '2026-09-26' },
  ];

  for (const dr of dateRanges) {
    console.log(`\nTesting SAR search: ${dr.start} to ${dr.end}`);
    try {
      const sarImages = await provider.searchSarImages(vadipatti.boundary, {
        startDate: new Date(dr.start),
        endDate: new Date(dr.end),
        sensorType: SensorType.SAR,
      });
      console.log(`  Result: Found ${sarImages.length} images.`);
      if (sarImages.length > 0) {
        console.log(`  First image ID: ${sarImages[0].imageId}`);
        console.log(`  First acquisition date: ${sarImages[0].acquisitionDate}`);
        console.log(`  Bands: ${sarImages[0].bands.map(b => b.id).join(', ')}`);
      }
    } catch (err: any) {
      console.error(`  Error searching ${dr.start} to ${dr.end}:`, err.message, err.statusCode || '');
      if (err.stack) console.error(err.stack);
    }
  }

  console.log('\n--- 5. SIMULATE acquireBestImage (NO DB WRITE) ---');
  for (const dr of dateRanges) {
    console.log(`\nTesting acquireBestImage: ${dr.start} to ${dr.end}`);
    try {
      const best = await provider.acquireBestImage(vadipatti.boundary, {
        startDate: new Date(dr.start),
        endDate: new Date(dr.end),
        sensorType: SensorType.SAR,
        maxCloudCover: 100,
      });
      console.log(`  Best image: ${best.imageId} (${best.acquisitionDate.toISOString()})`);
    } catch (err: any) {
      console.error(`  Error in acquireBestImage:`, err.message, 'Code/Status:', err.statusCode || err.code || '');
    }
  }

  await mongoose.disconnect();
  console.log('\nDiagnostic complete.');
  process.exit(0);
}

runDiagnostic().catch((err) => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
});
