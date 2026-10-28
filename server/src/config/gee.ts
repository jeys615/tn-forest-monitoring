import { env } from './env.js';
import fs from 'node:fs';
import path from 'node:path';

export interface GeeConfig {
  projectId: string;
  mode: 'REAL' | 'SIMULATED';
  authMethod:
    | 'SERVICE_ACCOUNT_KEY'
    | 'OAUTH2_REFRESH_TOKEN'
    | 'OAUTH2_ACCESS_TOKEN'
    | 'APPLICATION_DEFAULT_CREDENTIALS'
    | 'UNAUTHENTICATED';
  hasCredentials: boolean;
  serviceAccountEmail?: string;
  privateKey?: string;
  credentialsPath?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  driveFolderId: string;
  exportScale: number;
  maxPixels: number;
  exportTimeoutMs: number;
  pollIntervalMs: number;
}

export function getGeeConfig(): GeeConfig {
  const projectId = env.GEE_PROJECT_ID || 'monitoring-system-506515';
  const mode = env.GEE_MODE || 'REAL';
  const driveFolderId = env.GEE_DRIVE_FOLDER_ID || 'MonitoringExports';
  const exportScale = env.GEE_EXPORT_SCALE || 10;
  const maxPixels = env.GEE_MAX_PIXELS || 1e9;
  const exportTimeoutMs = env.GEE_EXPORT_TIMEOUT_MS || 600000;
  const pollIntervalMs = env.GEE_POLL_INTERVAL_MS || 10000;

  // 1. Check Service Account Email and Private Key
  if (env.GEE_SERVICE_ACCOUNT_EMAIL && env.GEE_PRIVATE_KEY) {
    return {
      projectId,
      mode,
      authMethod: 'SERVICE_ACCOUNT_KEY',
      hasCredentials: true,
      serviceAccountEmail: env.GEE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GEE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      driveFolderId,
      exportScale,
      maxPixels,
      exportTimeoutMs,
      pollIntervalMs,
    };
  }

  // 2. Check explicit Access Token
  if (env.GEE_ACCESS_TOKEN) {
    return {
      projectId,
      mode,
      authMethod: 'OAUTH2_ACCESS_TOKEN',
      hasCredentials: true,
      accessToken: env.GEE_ACCESS_TOKEN,
      driveFolderId,
      exportScale,
      maxPixels,
      exportTimeoutMs,
      pollIntervalMs,
    };
  }

  // 3. Check OAuth2 Refresh Token credentials
  if (env.GEE_REFRESH_TOKEN && env.GEE_CLIENT_ID && env.GEE_CLIENT_SECRET) {
    return {
      projectId,
      mode,
      authMethod: 'OAUTH2_REFRESH_TOKEN',
      hasCredentials: true,
      clientId: env.GEE_CLIENT_ID,
      clientSecret: env.GEE_CLIENT_SECRET,
      refreshToken: env.GEE_REFRESH_TOKEN,
      driveFolderId,
      exportScale,
      maxPixels,
      exportTimeoutMs,
      pollIntervalMs,
    };
  }

  // 4. Check GOOGLE_APPLICATION_CREDENTIALS environment file
  if (env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return {
      projectId,
      mode,
      authMethod: 'APPLICATION_DEFAULT_CREDENTIALS',
      hasCredentials: true,
      credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
      driveFolderId,
      exportScale,
      maxPixels,
      exportTimeoutMs,
      pollIntervalMs,
    };
  }

  // 5. Check standard OS Application Default Credentials (ADC)
  const appData = process.env.APPDATA || (process.env.HOME ? path.join(process.env.HOME, '.config') : '');
  if (appData) {
    const adcPath = path.join(appData, 'gcloud', 'application_default_credentials.json');
    if (fs.existsSync(adcPath)) {
      return {
        projectId,
        mode,
        authMethod: 'APPLICATION_DEFAULT_CREDENTIALS',
        hasCredentials: true,
        credentialsPath: adcPath,
        driveFolderId,
        exportScale,
        maxPixels,
        exportTimeoutMs,
        pollIntervalMs,
      };
    }
  }

  return {
    projectId,
    mode,
    authMethod: 'UNAUTHENTICATED',
    hasCredentials: false,
    driveFolderId,
    exportScale,
    maxPixels,
    exportTimeoutMs,
    pollIntervalMs,
  };
}
