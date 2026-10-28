import { GoogleDriveService } from '../services/drive/GoogleDriveService.js';

/**
 * Dedicated Google Drive Connectivity & Verification Diagnostic Script.
 *
 * Independently tests authentic Google Drive API access via configured ADC or OAuth credentials.
 * Ensures strict separation between GEE permissions and Google Drive permissions.
 */

async function runDriveDiagnostic() {
  console.log('================================================================');
  console.log('📁 GOOGLE DRIVE CONNECTIVITY & VERIFICATION DIAGNOSTIC');
  console.log('================================================================\n');

  const driveService = new GoogleDriveService();

  console.log('Checking independent Google Drive API authorization...');
  const result = await driveService.checkDriveAccess();

  if (!result.authenticated || !result.apiAccess) {
    console.error('\n[DRIVE]');
    console.error('Authentication: FAILED');
    console.error(`Reason: ${result.error || 'Unknown authorization error'}\n`);
    console.error('Action Required:');
    console.error('  To authorize Google Drive access for Application Default Credentials (ADC), run:');
    console.error('    gcloud auth login --enable-gdrive-access --update-adc\n');
    console.error('================================================================');
    console.error('❌ DIAGNOSTIC FAILED: Google Drive access is not authenticated.');
    console.error('================================================================');
    process.exitCode = 1;
    return;
  }

  console.log('\n[DRIVE]');
  console.log('Authentication: SUCCESS\n');

  console.log('[DRIVE]');
  console.log('Authenticated Drive access: SUCCESS\n');

  console.log('[DRIVE]');
  console.log('Account/file visibility: SUCCESS');
  if (result.userEmail) {
    console.log(`Authenticated Account: ${result.userEmail}`);
  }
  console.log(`Accessible Files Visible: ${result.filesCount ?? 0}\n`);

  console.log('================================================================');
  console.log('✅ DIAGNOSTIC COMPLETE: Real Google Drive access verified!');
  console.log('================================================================');
  process.exitCode = 0;
}

runDriveDiagnostic().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('\n[DRIVE]');
  console.error('Authentication: FAILED');
  console.error(`Unexpected Diagnostic Error: ${msg}\n`);
  process.exitCode = 1;
});
