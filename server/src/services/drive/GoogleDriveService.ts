import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { google, type drive_v3 } from 'googleapis';
import { GoogleAuth, OAuth2Client, JWT } from 'google-auth-library';
import { getGeeConfig } from '../../config/gee.js';
import { GeeAuthService } from '../gee/GeeAuthService.js';
import { AppError } from '../../utils/AppError.js';
import { HTTP_STATUS } from '../../constants/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_TEMP_DIR = path.resolve(__dirname, '../../../storage/raster_temp');

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
];

export interface DownloadedRasterFile {
  fileId: string;
  fileName: string;
  localFilePath: string;
  sizeBytes: number;
  downloadedAt: Date;
}

export interface DriveAccessCheckResult {
  authenticated: boolean;
  apiAccess: boolean;
  accountVisibility: boolean;
  userEmail?: string;
  filesCount?: number;
  error?: string;
}

export class GoogleDriveService {
  private driveClient: drive_v3.Drive | null = null;

  constructor() {
    this.initDriveClient();
  }

  private initDriveClient(): void {
    const config = getGeeConfig();
    const appData = process.env.APPDATA || (process.env.HOME ? path.join(process.env.HOME, '.config') : '');
    const adcPath = config.credentialsPath || (appData ? path.join(appData, 'gcloud', 'application_default_credentials.json') : '');

    try {
      if (config.authMethod === 'SERVICE_ACCOUNT_KEY' && config.serviceAccountEmail && config.privateKey) {
        const jwt = new JWT({
          email: config.serviceAccountEmail,
          key: config.privateKey,
          scopes: DRIVE_SCOPES,
        });
        this.driveClient = google.drive({ version: 'v3', auth: jwt as any });
        return;
      }

      if (config.authMethod === 'OAUTH2_REFRESH_TOKEN' && config.clientId && config.clientSecret && config.refreshToken) {
        const oauth2 = new OAuth2Client(config.clientId, config.clientSecret);
        oauth2.setCredentials({ refresh_token: config.refreshToken });
        this.driveClient = google.drive({ version: 'v3', auth: oauth2 as any });
        return;
      }

      if (adcPath && fs.existsSync(adcPath)) {
        try {
          const adcData = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
          if (adcData.client_id && adcData.client_secret && adcData.refresh_token) {
            const oauth2 = new OAuth2Client(adcData.client_id, adcData.client_secret);
            oauth2.setCredentials({ refresh_token: adcData.refresh_token });
            this.driveClient = google.drive({ version: 'v3', auth: oauth2 as any });
            return;
          }
        } catch {
          // Fall through to standard GoogleAuth
        }
      }

      const auth = new GoogleAuth({
        scopes: DRIVE_SCOPES,
        keyFilename: adcPath && fs.existsSync(adcPath) ? adcPath : undefined,
      });
      this.driveClient = google.drive({ version: 'v3', auth: auth as any });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Drive Service] Client initialization warning: ${msg}`);
    }
  }

  /**
   * Ensures local temporary directory exists for a job.
   */
  public ensureJobTempDir(jobId: string): string {
    const jobDir = path.join(STORAGE_TEMP_DIR, jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    return jobDir;
  }

  /**
   * Independently verifies Google Drive authentication, API accessibility,
   * and file visibility without exposing credentials.
   */
  public async checkDriveAccess(): Promise<DriveAccessCheckResult> {
    if (!this.driveClient) {
      this.initDriveClient();
    }

    if (!this.driveClient) {
      return {
        authenticated: false,
        apiAccess: false,
        accountVisibility: false,
        error: 'DRIVE_AUTH_FAILED: No Google Drive credentials available or client initialization failed.',
      };
    }

    try {
      // 1. Verify Drive API call and user identity
      const aboutRes = await this.driveClient.about.get({
        fields: 'user(displayName, emailAddress, permissionId), storageQuota',
      });

      const userEmail = aboutRes.data.user?.emailAddress || 'authenticated-user';

      // 2. Verify account / file visibility
      const listRes = await this.driveClient.files.list({
        pageSize: 5,
        fields: 'files(id, name, mimeType, size)',
        spaces: 'drive',
      });

      const filesCount = listRes.data.files ? listRes.data.files.length : 0;

      return {
        authenticated: true,
        apiAccess: true,
        accountVisibility: true,
        userEmail,
        filesCount,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes('insufficient') ||
        errMsg.includes('SCOPE') ||
        err?.code === 403 ||
        err?.status === 403 ||
        err?.response?.status === 403
      ) {
        return {
          authenticated: false,
          apiAccess: false,
          accountVisibility: false,
          error: `DRIVE_AUTH_FAILED: Request had insufficient authentication scopes. Please authenticate via 'gcloud auth login --enable-gdrive-access --update-adc'. Details: ${errMsg}`,
        };
      }
      return {
        authenticated: false,
        apiAccess: false,
        accountVisibility: false,
        error: `DRIVE_ACCESS_FAILED: ${errMsg}`,
      };
    }
  }

  /**
   * Searches Google Drive for an exported GeoTIFF by filename pattern.
   * Verifies that the file exists, has a valid ID, and non-zero size.
   */
  public async findExportedFile(fileName: string, folderName?: string): Promise<drive_v3.Schema$File | null> {
    console.info(`[DRIVE] Searching exported file: ${fileName}...`);

    if (!this.driveClient) {
      this.initDriveClient();
    }

    if (!this.driveClient) {
      throw new AppError('DRIVE_AUTH_FAILED: Google Drive client not initialized', HTTP_STATUS.SERVICE_UNAVAILABLE);
    }

    try {
      const prefix = fileName.replace(/\.tif$/, '');
      const query = `name contains '${prefix}' and trashed = false`;
      const res = await this.driveClient.files.list({
        q: query,
        fields: 'files(id, name, size, mimeType, createdTime, md5Checksum, parents)',
        orderBy: 'createdTime desc',
        pageSize: 10,
        spaces: 'drive',
      });

      const files = res.data.files;
      if (files && files.length > 0) {
        const file = files[0];
        console.info(`[DRIVE] File found: ${file.name}`);
        console.info(`[DRIVE] File ID: ${file.id}`);
        console.info(`[DRIVE] File size: ${file.size} bytes`);
        return file;
      }
      console.warn(`[DRIVE] File not found matching query: ${query}`);
      return null;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('insufficient') || errMsg.includes('SCOPE') || err?.code === 403) {
        console.error(`[DRIVE] DRIVE_AUTH_FAILED: Insufficient Google Drive scopes on access token (${errMsg})`);
        throw new AppError(
          `DRIVE_AUTH_FAILED: Access token does not have Google Drive scopes. Please authenticate via 'gcloud auth login --enable-gdrive-access --update-adc'. Details: ${errMsg}`,
          HTTP_STATUS.FORBIDDEN,
        );
      }
      console.warn(`[DRIVE] Search error: ${errMsg}`);
      throw new AppError(`DRIVE_SEARCH_FAILED: ${errMsg}`, HTTP_STATUS.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Downloads a GeoTIFF file from Google Drive to local temporary directory.
   */
  public async downloadGeoTiff(params: {
    jobId: string;
    fileName: string;
    fileId?: string;
    mockFallbackGenerator?: () => Buffer | Promise<Buffer>;
  }): Promise<DownloadedRasterFile> {
    const { jobId, fileName, fileId, mockFallbackGenerator } = params;
    const jobDir = this.ensureJobTempDir(jobId);
    const localFilePath = path.join(jobDir, fileName.endsWith('.tif') ? fileName : `${fileName}.tif`);

    if (!this.driveClient) {
      this.initDriveClient();
    }

    // 1. Real Google Drive download
    if (fileId) {
      try {
        console.info(`[DRIVE] Downloading file ${fileId} (${fileName}) to ${localFilePath}...`);
        let downloadSuccess = false;

        try {
          const auth = GeeAuthService.getInstance();
          const token = await auth.getAccessToken();
          if (token) {
            const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            const fetchRes = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (fetchRes.ok && fetchRes.body) {
              const dest = fs.createWriteStream(localFilePath);
              const reader = fetchRes.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                dest.write(value);
              }
              dest.end();
              await new Promise<void>((resolve) => dest.on('finish', () => resolve()));
              downloadSuccess = true;
            }
          }
        } catch (fetchErr: any) {
          console.warn(`[DRIVE] Direct stream fetch attempt failed (${fetchErr.message}), falling back to driveClient...`);
        }

        if (!downloadSuccess && this.driveClient) {
          const dest = fs.createWriteStream(localFilePath);
          const res = await this.driveClient.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' },
          );
          await pipeline(res.data as any, dest);
        }

        const stats = fs.statSync(localFilePath);
        if (stats.size === 0) {
          throw new AppError(`Downloaded file ${fileName} has 0 bytes`, HTTP_STATUS.SERVICE_UNAVAILABLE);
        }

        console.info(`[RASTER] Downloaded: ${localFilePath}`);
        console.info(`[DRIVE] Download complete: ${fileName} (${stats.size} bytes).`);
        return {
          fileId,
          fileName,
          localFilePath,
          sizeBytes: stats.size,
          downloadedAt: new Date(),
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[DRIVE] Real download failed: ${errMsg}`);
        if (errMsg.includes('insufficient') || errMsg.includes('SCOPE') || err?.code === 403) {
          throw new AppError(
            `DRIVE_AUTH_FAILED: Insufficient Google Drive scopes on access token (${errMsg})`,
            HTTP_STATUS.FORBIDDEN,
          );
        }
        if (process.env.NODE_ENV !== 'test' || !mockFallbackGenerator) {
          throw new AppError(
            `Failed to download GeoTIFF from Drive: ${errMsg}`,
            HTTP_STATUS.SERVICE_UNAVAILABLE,
          );
        }
      }
    }

    // 2. Controlled test mode fallback only if explicitly supplied by caller in test environment
    if (process.env.NODE_ENV === 'test' && mockFallbackGenerator) {
      const buffer = await Promise.resolve(mockFallbackGenerator());
      fs.writeFileSync(localFilePath, buffer);
      const stats = fs.statSync(localFilePath);
      return {
        fileId: fileId || `DRIVE-FILE-${Date.now()}`,
        fileName,
        localFilePath,
        sizeBytes: stats.size,
        downloadedAt: new Date(),
      };
    }

    // 3. If file already exists locally
    if (fs.existsSync(localFilePath)) {
      const stats = fs.statSync(localFilePath);
      if (stats.size > 0) {
        console.info(`[RASTER] Using existing local raster: ${localFilePath} (${stats.size} bytes)`);
        return {
          fileId: fileId || `LOCAL-${Date.now()}`,
          fileName,
          localFilePath,
          sizeBytes: stats.size,
          downloadedAt: new Date(),
        };
      }
    }

    throw new AppError(`GeoTIFF ${fileName} could not be downloaded from Google Drive`, HTTP_STATUS.NOT_FOUND);
  }

  /**
   * Cleans up temporary raster directory for a completed job.
   */
  public cleanupJobTempFiles(jobId: string): void {
    const jobDir = path.join(STORAGE_TEMP_DIR, jobId);
    if (fs.existsSync(jobDir)) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
        console.info(`[Drive Service] Cleaned up temporary files for job ${jobId}.`);
      } catch (err) {
        console.warn(`[Drive Service] Cleanup warning: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
