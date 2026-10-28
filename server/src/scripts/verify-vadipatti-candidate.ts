import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { getGeeConfig } from '../config/gee.js';
import { google } from 'googleapis';

async function verifyAsset() {
  console.log('=== GEE ASSET VERIFICATION ===');
  const auth = GeeAuthService.getInstance();
  const config = getGeeConfig();
  const token = await auth.getAccessToken();

  const assetId = 'COPERNICUS/S2_SR_HARMONIZED/20260909T050649_20260909T051600_T43PHM';
  const url = `https://earthengine.googleapis.com/v1alpha/projects/earthengine-public/assets/${assetId}`;

  console.log(`Checking Earth Engine asset: ${assetId}`);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': config.projectId,
    },
  });

  console.log(`GEE Asset HTTP Status: ${res.status} ${res.statusText}`);
  if (res.ok) {
    const data = await res.json();
    console.log('GEE Asset Found:');
    console.log('  ID:              ', data.id);
    console.log('  Name:            ', data.name);
    console.log('  Start Time:      ', data.startTime);
    console.log('  End Time:        ', data.endTime);
    console.log('  Properties:');
    console.log('    Spacecraft:    ', data.properties?.SPACECRAFT_NAME);
    console.log('    Cloud Cover %: ', data.properties?.CLOUDY_PIXEL_PERCENTAGE);
    console.log('    MGRS Tile:     ', data.properties?.MGRS_TILE);
    console.log('  Bands count:     ', data.bands?.length);
  } else {
    const err = await res.text();
    console.error('GEE Asset Error:', err);
  }

  // Also check Google Drive to see if any file matching this image/zone was exported
  console.log('\n=== GOOGLE DRIVE SEARCH ===');
  try {
    const { GoogleDriveService } = await import('../services/drive/GoogleDriveService.js');
    const fs = await import('fs');
    const path = await import('path');
    const driveService = new GoogleDriveService();
    const accessCheck = await driveService.checkDriveAccess();
    console.log('Drive access check:', accessCheck);

    const client = (driveService as any).driveClient;
    const fileRes = await client.files.get({
      fileId: '1-JHsxCLIGmpYdfB1AgvTQtUPcyzMui0B',
      fields: 'id, name, size, mimeType, createdTime, modifiedTime, description, properties, appProperties',
    });
    console.log('Drive File 1-JHsxCLIGmpYdfB1AgvTQtUPcyzMui0B details:');
    console.log(JSON.stringify(fileRes.data, null, 2));

    console.log('\n=== LOCAL STORAGE INSPECTION ===');
    const storageDir = path.resolve('storage/raster_temp');
    if (fs.existsSync(storageDir)) {
      const items = fs.readdirSync(storageDir);
      console.log('Items in storage/raster_temp:', items);
      for (const item of items) {
        const p = path.join(storageDir, item);
        if (fs.statSync(p).isDirectory()) {
          console.log(`  Dir ${item}:`, fs.readdirSync(p));
        } else {
          console.log(`  File ${item}: ${fs.statSync(p).size} bytes`);
        }
      }
    } else {
      console.log('storage/raster_temp does not exist');
    }
  } catch (dErr: any) {
    console.error('Drive query error:', dErr.message);
  }
}

verifyAsset().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
