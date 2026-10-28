import { GeeTaskService } from '../services/gee/GeeTaskService.js';
import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';

async function main() {
  const taskService = new GeeTaskService();
  const taskId = 'projects/monitoring-system-506515/operations/TDFYQC5RIJKJTBSTWOTK2B4J';
  console.log('Checking GEE Task Status for:', taskId);
  const status = await taskService.getTaskStatus(taskId);
  console.log('Task Status:', JSON.stringify(status, null, 2));

  console.log('\nChecking Google Drive for:', 'ZONE-260925-8986_6ab71f54dd917534b30beb73_CURRENT_Sentinel1_20200102.tif');
  const driveService = new GoogleDriveService();
  try {
    const file = await driveService.findExportedFile('ZONE-260925-8986_6ab71f54dd917534b30beb73_CURRENT_Sentinel1_20200102.tif');
    console.log('Drive File:', file);
  } catch (err: any) {
    console.error('Drive Error:', err.message);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
