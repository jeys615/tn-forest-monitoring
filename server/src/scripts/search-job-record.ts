import mongoose from 'mongoose';

async function searchRecords() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn_forest_monitoring');
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB connection failed');

  const jobs = await db.collection('monitoringjobs').find({
    $or: [
      { jobId: { $regex: 'MUIJSDOC' } },
      { 'result.driveFileId': '1-JHsxCLIGmpYdfB1AgvTQtUPcyzMui0B' },
      { 'result.driveFileName': { $regex: '20260909' } },
      { 'result.localRasterPath': { $regex: '20260909' } },
    ],
  }).toArray();

  console.log('Matching MonitoringJobs:', jobs.length);
  for (const j of jobs) {
    console.log(JSON.stringify(j, null, 2));
  }

  // Also check all collections for this Drive ID
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    const found = await db.collection(c.name).find({
      $or: [
        { driveFileId: '1-JHsxCLIGmpYdfB1AgvTQtUPcyzMui0B' },
        { 'result.driveFileId': '1-JHsxCLIGmpYdfB1AgvTQtUPcyzMui0B' },
        { geeExportTaskId: { $regex: 'MUIJSDOC' } },
      ],
    }).toArray();
    if (found.length > 0) {
      console.log(`Found in collection ${c.name}:`, found);
    }
  }

  await mongoose.disconnect();
}

searchRecords().catch(console.error);
