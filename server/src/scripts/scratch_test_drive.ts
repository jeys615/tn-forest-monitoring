import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';

async function testDrive() {
  const drive = new GoogleDriveService();
  console.log('Testing Drive access with 6-second timeout...');

  const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
    setTimeout(() => resolve({ timeout: true }), 6000),
  );

  const checkPromise = drive.checkDriveAccess().then((res) => ({ timeout: false, res }));

  const raceResult = await Promise.race([timeoutPromise, checkPromise]);

  if (raceResult.timeout) {
    console.log('Drive access check timed out after 6s. Google Drive API may be blocked or network-limited.');
  } else {
    console.log('Drive access check result:', JSON.stringify(raceResult.res, null, 2));
  }
}

testDrive().catch(console.error);
