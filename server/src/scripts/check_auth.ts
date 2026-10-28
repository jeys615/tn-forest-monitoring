import { getGeeConfig } from '../config/gee.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { google } from 'googleapis';

async function testAuth() {
  console.log('Testing GEE and Google Cloud Auth...');
  const config = getGeeConfig();
  console.log('GEE Config:', {
    projectId: config.projectId,
    mode: config.mode,
    authMethod: config.authMethod,
    hasCredentials: config.hasCredentials,
    credentialsPath: config.credentialsPath,
  });

  const authService = GeeAuthService.getInstance();
  const token = await authService.getAccessToken();
  console.log('Access Token acquired:', token ? `${token.slice(0, 15)}... (Length: ${token.length})` : 'NULL');

  const connStatus = await authService.checkConnection();
  console.log('GEE Connection Status:', connStatus);

  if (token) {
    // Check Google Drive Access
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: token });
      const drive = google.drive({ version: 'v3', auth });
      const res = await drive.files.list({ pageSize: 5 });
      console.log('Google Drive list files successful:', res.data.files?.length, 'files found');
      if (res.data.files) {
        console.log('Sample files:', res.data.files.map(f => f.name));
      }
    } catch (e: any) {
      console.log('Google Drive API check failed:', e.message);
    }
  }
}

testAuth().catch(console.error);
