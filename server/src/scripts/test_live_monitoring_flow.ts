import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { MonitoringJobModel } from '../models/MonitoringJob.js';
import { ProcessedImageResultModel } from '../models/ProcessedImageResult.js';

interface LoginResponse {
  success: boolean;
  data: { token: string };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface JobData {
  id: string;
  jobId: string;
  type: string;
  zoneId?: string;
  satelliteMetadataId?: string;
  status: string;
  logs: string[];
  results?: {
    processedImageUrl?: string;
    ndviMean?: number;
    cloudCoverUsed?: number;
    anomalyScore?: number;
  };
  errorMessage?: string;
}

async function runLiveTest(): Promise<void> {
  console.log('================================================================');
  console.log('🛰️ TESTING LIVE MONITORING JOB EXECUTION FOR SATHIYAR FOREST');
  console.log('================================================================\n');

  // 1. Health check
  console.log('--- STEP 1: Backend Health Check ---');
  const healthRes = await fetch('http://localhost:5000/api/health');
  console.log('  • GET /api/health HTTP Status:', healthRes.status);
  if (!healthRes.ok) {
    throw new Error(`Backend not responding on port 5000 (status ${healthRes.status})`);
  }

  // 2. Login
  console.log('\n--- STEP 2: Authenticating as Super Admin ---');
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tnforest.gov.in', password: 'Admin@TNFMS2026!' }),
  });
  const loginJson = (await loginRes.json()) as LoginResponse;
  console.log('  • Login Status:', loginRes.status, 'Success:', loginJson.success);
  if (!loginJson.success || !loginJson.data?.token) {
    throw new Error('Super Admin login failed');
  }
  const token = loginJson.data.token;

  // 3. Find Zone
  console.log('\n--- STEP 3: Verify sathiyar_forest Zone ---');
  await mongoose.connect(env.MONGODB_URI);
  const zone = await Zone.findOne({ name: 'sathiyar_forest' });
  if (!zone) throw new Error('Zone sathiyar_forest not found in database');
  console.log(`  • Zone Found: ${zone.name} (DB ID: ${zone._id}, Zone ID: ${zone.zoneId})`);

  // 4. Verify SatelliteMetadata
  console.log('\n--- STEP 4: Verify SatelliteMetadata Record ---');
  const satMeta = await SatelliteMetadata.findOne({ intersectingZones: zone._id });
  if (!satMeta) throw new Error('SatelliteMetadata not found for sathiyar_forest');
  console.log(`  • Metadata DB ID       : ${satMeta._id}`);
  console.log(`  • GEE Image Asset ID   : ${satMeta.imageId}`);
  console.log(`  • Source               : ${satMeta.source}`);
  console.log(`  • Sensor Type          : ${satMeta.sensorType}`);
  console.log(`  • Processing Status    : ${satMeta.processingStatus}`);
  console.log(`  • Cloud Cover          : ${satMeta.cloudCover}%`);
  console.log(`  • Acquisition Date     : ${satMeta.acquisitionDate.toISOString()}`);

  // 5. Schedule Fresh Monitoring Job
  console.log('\n--- STEP 5: Scheduling Fresh Monitoring Job ---');
  const scheduleRes = await fetch('http://localhost:5000/api/monitoring/schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 'TARGETED_ACQUISITION',
      zoneId: zone._id.toString(),
    }),
  });
  const scheduleJson = (await scheduleRes.json()) as ApiResponse<JobData>;
  console.log('  • Schedule HTTP Status :', scheduleRes.status);
  console.log('  • Scheduled Job ID     :', scheduleJson.data.jobId);
  console.log('  • Initial Job Status   :', scheduleJson.data.status);

  if (scheduleJson.data.status !== 'PENDING') {
    throw new Error(`Expected PENDING status, got ${scheduleJson.data.status}`);
  }

  const jobDbId = scheduleJson.data.id;

  // 6. Execute / Process Job
  console.log('\n--- STEP 6: Executing Monitoring Job (Local Processing) ---');
  const processRes = await fetch(`http://localhost:5000/api/monitoring/jobs/${jobDbId}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const processJson = (await processRes.json()) as ApiResponse<JobData>;
  console.log('  • Process HTTP Status  :', processRes.status);
  console.log('  • Final Job Status     :', processJson.data.status);

  if (!processJson.success || processJson.data.status !== 'COMPLETED') {
    console.error('Job Error Message:', processJson.data.errorMessage);
    console.error('Job Logs:\n', processJson.data.logs.join('\n'));
    throw new Error(`Job execution failed: ${processJson.data.errorMessage}`);
  }

  // 7. Verify Results
  console.log('\n--- STEP 7: Verifying Computational Results ---');
  const results = processJson.data.results;
  console.log('  • Processed Image URL  :', results?.processedImageUrl);
  console.log('  • Calculated NDVI Mean :', results?.ndviMean);
  console.log('  • Cloud Cover Used     :', results?.cloudCoverUsed + '%');
  console.log('  • Spatial Anomaly Score:', results?.anomalyScore + '%');

  if (results?.ndviMean === undefined || results.ndviMean <= 0) {
    throw new Error(`Invalid NDVI mean produced: ${results?.ndviMean}`);
  }

  // 8. Verify Persistence in MongoDB
  console.log('\n--- STEP 8: Database Persistence Verification ---');
  const savedJob = await MonitoringJobModel.findById(jobDbId);
  console.log(`  • Job in MongoDB: status=${savedJob?.status}, results=${JSON.stringify(savedJob?.results)}`);

  const savedProc = await ProcessedImageResultModel.findOne({ satelliteMetadataId: satMeta._id });
  console.log(`  • ProcessedImageResult in MongoDB: status=${savedProc?.processingStatus}, opticalMetrics=${JSON.stringify(savedProc?.opticalMetrics)}`);

  const updatedMeta = await SatelliteMetadata.findById(satMeta._id);
  console.log(`  • SatelliteMetadata in MongoDB: processingStatus=${updatedMeta?.processingStatus}`);

  console.log('\n--- STEP 9: Job Execution Diagnostic Logs ---');
  for (const logLine of savedJob?.logs || []) {
    console.log(`    ${logLine}`);
  }

  console.log('\n================================================================');
  console.log('🎉 LIVE MONITORING JOB COMPLETED WITH 100% SUCCESS');
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runLiveTest().catch(async (err: unknown) => {
  console.error('❌ Live test failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
