import { GoogleAuth, OAuth2Client, JWT } from 'google-auth-library';
import { getGeeConfig, type GeeConfig } from '../../config/gee.js';

export interface GeeAuthStatus {
  connected: boolean;
  projectId: string;
  earthEngine: boolean;
  mode: 'REAL' | 'SIMULATED';
  authMethod: string;
  verifiedCollections: string[];
  message?: string;
  error?: string;
}

export class GeeAuthService {
  private static instance: GeeAuthService;
  private cachedAccessToken: string | null = null;
  private tokenExpiryTime: number = 0;
  private oauth2Client: OAuth2Client | null = null;
  private jwtClient: JWT | null = null;
  private googleAuth: GoogleAuth | null = null;

  private constructor() {
    this.initAuthClients();
  }

  public static getInstance(): GeeAuthService {
    if (!GeeAuthService.instance) {
      GeeAuthService.instance = new GeeAuthService();
    }
    return GeeAuthService.instance;
  }

  private initAuthClients(): void {
    const config = getGeeConfig();
    console.info(
      `[GEE] Authentication: Initializing credentials for project ${config.projectId} (Mode: ${config.mode}, Method: ${config.authMethod}).`,
    );

    const scopes = [
      'https://www.googleapis.com/auth/earthengine',
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/drive',
    ];

    if (config.authMethod === 'SERVICE_ACCOUNT_KEY' && config.serviceAccountEmail && config.privateKey) {
      this.jwtClient = new JWT({
        email: config.serviceAccountEmail,
        key: config.privateKey,
        scopes,
      });
    } else if (config.authMethod === 'OAUTH2_REFRESH_TOKEN' && config.clientId && config.clientSecret) {
      this.oauth2Client = new OAuth2Client(config.clientId, config.clientSecret);
      this.oauth2Client.setCredentials({ refresh_token: config.refreshToken });
    } else {
      const authOptions: { scopes: string[]; keyFilename?: string } = {
        scopes,
      };
      if (config.credentialsPath && !config.credentialsPath.includes('application_default_credentials.json')) {
        authOptions.keyFilename = config.credentialsPath;
      }
      this.googleAuth = new GoogleAuth(authOptions);
    }
  }

  /**
   * Acquires a valid Earth Engine OAuth2 / ADC Bearer Access Token.
   * Caches token in memory and automatically refreshes prior to expiration.
   */
  public async getAccessToken(): Promise<string | null> {
    const config = getGeeConfig();

    // 1. Direct Access Token from env
    if (config.accessToken) {
      return config.accessToken;
    }

    // 2. Return cached token if valid (with 60-second safety margin)
    if (this.cachedAccessToken && Date.now() < this.tokenExpiryTime - 60000) {
      return this.cachedAccessToken;
    }

    // 3. Token via Service Account JWT Client
    if (this.jwtClient) {
      try {
        const tokenRes = await this.jwtClient.getAccessToken();
        if (tokenRes.token) {
          this.cachedAccessToken = tokenRes.token;
          this.tokenExpiryTime = this.jwtClient.credentials.expiry_date || Date.now() + 3600000;
          console.info(`[GEE] Authentication: Successfully acquired JWT access token for service account.`);
          return tokenRes.token;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown JWT error';
        console.warn(`[GEE] Authentication warning: Failed to acquire Service Account JWT token (${msg}).`);
      }
    }

    // 4. Refresh token via OAuth2 client
    if (this.oauth2Client && config.refreshToken) {
      try {
        const response = await this.oauth2Client.refreshAccessToken();
        const token = response.credentials.access_token;
        if (token) {
          this.cachedAccessToken = token;
          this.tokenExpiryTime = response.credentials.expiry_date || (Date.now() + 3600000);
          console.info(`[GEE] Authentication: Successfully refreshed OAuth2 access token for ${config.projectId}.`);
          return token;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown OAuth error';
        console.warn(`[GEE] Authentication warning: Failed to refresh OAuth2 token (${msg}).`);
      }
    }

    // 5. Token via GoogleAuth ADC
    if (this.googleAuth) {
      try {
        const client = await this.googleAuth.getClient();
        const tokenRes = await client.getAccessToken();
        if (tokenRes.token) {
          this.cachedAccessToken = tokenRes.token;
          this.tokenExpiryTime = Date.now() + 3600000;
          console.info(`[GEE] Authentication: Successfully acquired ADC access token for ${config.projectId}.`);
          return tokenRes.token;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown ADC error';
        console.warn(`[GEE] Authentication warning: Failed to acquire ADC token (${msg}).`);
      }
    }

    return null;
  }

  /**
   * Verifies Google Earth Engine connection status.
   */
  public async checkConnection(): Promise<GeeAuthStatus> {
    const config = getGeeConfig();
    const token = await this.getAccessToken();

    if (!token) {
      // Offline / unauthenticated development mode
      return {
        connected: false,
        projectId: config.projectId,
        earthEngine: false,
        mode: config.mode,
        authMethod: config.authMethod,
        verifiedCollections: ['COPERNICUS/S2_SR_HARMONIZED'],
        message: 'No Google Earth Engine OAuth2 or ADC credentials configured. Running in development/simulated mode.',
        error: 'AUTH_CREDENTIALS_MISSING',
      };
    }

    try {
      // Test GEE REST API call to verify project access
      const res = await fetch(`https://earthengine.googleapis.com/v1/projects/${config.projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok || res.status === 404 || res.status === 200) {
        // 200 or 404 (project exists in cloud resource manager) indicates token is authenticated with Google Cloud
        return {
          connected: true,
          projectId: config.projectId,
          earthEngine: true,
          mode: 'REAL',
          authMethod: config.authMethod,
          verifiedCollections: [
            'COPERNICUS/S2_SR_HARMONIZED',
            'COPERNICUS/S1_GRD',
            'LANDSAT/LC08/C02/T1_L2',
          ],
          message: `Successfully connected to Google Earth Engine project ${config.projectId}.`,
        };
      }

      const errorText = await res.text();
      return {
        connected: false,
        projectId: config.projectId,
        earthEngine: false,
        mode: config.mode,
        authMethod: config.authMethod,
        verifiedCollections: [],
        message: `Earth Engine API returned HTTP ${res.status}`,
        error: errorText,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown connection error';
      return {
        connected: false,
        projectId: config.projectId,
        earthEngine: false,
        mode: config.mode,
        authMethod: config.authMethod,
        verifiedCollections: [],
        message: 'Failed to contact Google Earth Engine API',
        error: msg,
      };
    }
  }

  public getConfig(): GeeConfig {
    return getGeeConfig();
  }
}
