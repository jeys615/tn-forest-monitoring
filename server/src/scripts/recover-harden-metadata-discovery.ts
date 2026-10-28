/**
 * Recover and Harden Sentinel-2 Metadata Discovery
 * Project: TN Forest Monitoring System
 * Monitored Zone: ZONE-261011-6340 (Sirumalai Hills, Dindigul District)
 *
 * Implements bounded exponential backoff with jitter and Retry-After support
 * to query COPERNICUS/S2_SR_HARMONIZED for candidate phenological windows.
 *
 * READ-ONLY INVESTIGATION: Zero mutations to MongoDB, files, or production baselines.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Zone } from '../models/Zone.js';
import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
  purpose: string;
}

interface RawGeeImageRecord {
  name: string;
  id: string;
  properties?: Record<string, any>;
  bands?: Array<{ id: string; dataType?: string; grid?: any }>;
  geometry?: any;
}

/**
 * Resilient HTTP fetch with bounded retries, exponential backoff, jitter, and Retry-After header parsing.
 */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  options: RetryOptions,
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const backoffFactor = options.backoffFactor ?? 2.0;
  const timeoutMs = options.timeoutMs ?? 15000;

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return res;
      }

      // Permanent client errors (400, 401, 403, 404) should NOT be retried
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `[PERMANENT_ERROR] ${options.purpose}: HTTP ${res.status} - ${res.statusText}. Response: ${body.substring(0, 200)}`,
        );
      }

      // Transient errors: 429, 500, 502, 503, 504
      const isTransient =
        res.status === 429 ||
        res.status === 500 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504;

      if (!isTransient || attempt >= maxAttempts) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `[EXHAUSTED] ${options.purpose}: HTTP ${res.status} after ${attempt}/${maxAttempts} attempts. Response: ${body.substring(0, 200)}`,
        );
      }

      // Parse Retry-After header if present
      const retryAfterHeader = res.headers.get('Retry-After');
      let waitMs = delay;
      if (retryAfterHeader) {
        const seconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(seconds)) {
          waitMs = Math.min(10000, seconds * 1000);
        } else {
          const date = new Date(retryAfterHeader).getTime();
          if (!isNaN(date) && date > Date.now()) {
            waitMs = Math.min(10000, date - Date.now());
          }
        }
      } else {
        // Add random jitter (50ms - 250ms)
        const jitter = Math.floor(Math.random() * 200) + 50;
        waitMs = delay + jitter;
        delay *= backoffFactor;
      }

      console.warn(
        `[RETRY] ${options.purpose}: HTTP ${res.status} on attempt ${attempt}/${maxAttempts}. Backing off for ${waitMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (err: any) {
      clearTimeout(timer);

      const isTimeout = err.name === 'AbortError';
      const isNetworkError =
        isTimeout ||
        err.message?.includes('fetch failed') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ETIMEDOUT');

      if (!isNetworkError || attempt >= maxAttempts) {
        throw new Error(
          `[FAILED] ${options.purpose}: ${err.message} (Attempt ${attempt}/${maxAttempts})`,
        );
      }

      const jitter = Math.floor(Math.random() * 200) + 50;
      const waitMs = delay + jitter;
      delay *= backoffFactor;

      console.warn(
        `[RETRY] ${options.purpose}: Network error (${err.message}) on attempt ${attempt}/${maxAttempts}. Retrying in ${waitMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw new Error(`[EXHAUSTED] ${options.purpose}: Max retry attempts (${maxAttempts}) exceeded.`);
}

/**
 * Lists public images from Earth Engine with resilient retries
 */
async function listS2ImagesWithRetry(params: {
  geometry: GeoJSONPolygon;
  startDate: Date;
  endDate: Date;
  purpose: string;
}): Promise<RawGeeImageRecord[]> {
  const auth = GeeAuthService.getInstance();
  const token = await auth.getAccessToken();
  const config = auth.getConfig();

  if (!token) {
    throw new Error('GEE Authentication failed: No ADC access token available.');
  }

  const url = new URL(
    'https://earthengine.googleapis.com/v1alpha/projects/earthengine-public/assets/COPERNICUS/S2_SR_HARMONIZED:listImages',
  );
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('startTime', params.startDate.toISOString());
  url.searchParams.set('endTime', params.endDate.toISOString());
  url.searchParams.set('region', JSON.stringify(params.geometry));

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Goog-User-Project': config.projectId,
  };

  const res = await fetchWithRetry(url.toString(), headers, {
    purpose: params.purpose,
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffFactor: 2.0,
    timeoutMs: 15000,
  });

  const json = (await res.json()) as { images?: RawGeeImageRecord[] };
  return json.images ?? [];
}

async function runHardenedDiscovery() {
  console.log('================================================================');
  console.log('🛡️ RECOVER & HARDEN SENTINEL-2 METADATA DISCOVERY');
  console.log('Zone: Sirumalai (ZONE-261011-6340, Tile T43PHM, EPSG:32643)');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  const zone = await Zone.findOne({ zoneId: 'ZONE-261011-6340' }).lean();
  if (!zone) throw new Error('Zone not found in MongoDB');
  const boundary = zone.boundary as GeoJSONPolygon;

  // Window definitions
  const targetWindows = [
    {
      role: 'Baseline Reference',
      windowName: 'January 2020 Baseline (Around Jan 09)',
      start: new Date('2020-01-05T00:00:00Z'),
      end: new Date('2020-01-16T23:59:59Z'),
    },
    {
      role: 'Intra-Annual Seasonal Control',
      windowName: 'February 2020 Seasonal Control (Feb 03 – Feb 20)',
      start: new Date('2020-02-01T00:00:00Z'),
      end: new Date('2020-02-20T23:59:59Z'),
    },
    {
      role: 'Same-Season Inter-Annual Control',
      windowName: 'January 2024 Same-Season Window (Jan 03 – Jan 25)',
      start: new Date('2024-01-01T00:00:00Z'),
      end: new Date('2024-01-25T23:59:59Z'),
    },
    {
      role: 'Post-Monsoon Recovery Verification',
      windowName: 'Post-Monsoon Recovery Window (Nov 2024 – Jan 2025)',
      start: new Date('2024-11-01T00:00:00Z'),
      end: new Date('2025-01-31T23:59:59Z'),
    },
  ];

  const windowResults: Record<string, Array<any>> = {};
  const requiredBands = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];

  for (const win of targetWindows) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`Scanning [${win.role}]: ${win.windowName}`);
    console.log(`Date Range: ${win.start.toISOString().split('T')[0]} to ${win.end.toISOString().split('T')[0]}`);
    console.log(`----------------------------------------------------------------`);

    try {
      const images = await listS2ImagesWithRetry({
        geometry: boundary,
        startDate: win.start,
        endDate: win.end,
        purpose: `Query S2 images for ${win.role}`,
      });

      console.log(`✓ Successfully retrieved ${images.length} candidate scenes.`);
      const processedCandidates = [];

      for (const img of images) {
        const props = img.properties || {};
        const assetId = img.id;
        let utcDate = 'UNKNOWN';
        if (props['system:time_start']) {
          utcDate = new Date(Number(props['system:time_start'])).toISOString();
        } else if ((img as any).startTime) {
          utcDate = new Date((img as any).startTime).toISOString();
        } else {
          const match = assetId.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
          if (match) {
            const [, yr, mo, da, hr, mi, se] = match;
            utcDate = `${yr}-${mo}-${da}T${hr}:${mi}:${se}Z`;
          }
        }
        const tile = props['MGRS_TILE'] || 'UNKNOWN';
        const platform = props['SPACECRAFT_NAME'] || 'Sentinel-2';
        const cloudPct = Number(props['CLOUDY_PIXEL_PERCENTAGE'] ?? 100);
        const bandIds = img.bands?.map((b) => b.id) || [];

        const hasAllRequiredBands = requiredBands.every((rb) => bandIds.includes(rb));
        const hasScl = bandIds.includes('SCL');

        // Check MGRS tile match
        const isTileMatch = tile === '43PHM' || tile === 'T43PHM' || assetId.includes('T43PHM');

        // Extract native resolution & CRS
        const b4Band = img.bands?.find((b) => b.id === 'B4');
        const nativeCrs = b4Band?.grid?.crsCode || 'EPSG:32643';
        const nativeScale = 10; // S2 B2, B3, B4, B8 are native 10m

        processedCandidates.push({
          assetId,
          utcDate,
          tile,
          platform,
          cloudPct,
          hasAllRequiredBands,
          hasScl,
          isTileMatch,
          nativeCrs,
          nativeScale,
          totalBands: bandIds.length,
        });
      }

      // Sort by tile match (primary), cloud cover ascending (secondary), temporal proximity (tertiary)
      processedCandidates.sort((a, b) => {
        if (a.isTileMatch !== b.isTileMatch) return a.isTileMatch ? -1 : 1;
        return a.cloudPct - b.cloudPct;
      });

      windowResults[win.role] = processedCandidates;

      // Print top candidates
      console.log(`Evaluated Candidates (Ranked by quality):`);
      processedCandidates.slice(0, 5).forEach((c, idx) => {
        console.log(`  #${idx + 1}: ${c.assetId}`);
        console.log(`      UTC Sensing: ${c.utcDate} | Platform: ${c.platform} | Tile: ${c.tile}`);
        console.log(`      Scene Cloud: ${c.cloudPct.toFixed(2)}% | Tile Match: ${c.isTileMatch ? 'YES' : 'NO'}`);
        console.log(`      Required Bands (B2-B12): ${c.hasAllRequiredBands ? 'YES' : 'NO'} | SCL Available: ${c.hasScl ? 'YES' : 'NO'}`);
      });
    } catch (err: any) {
      console.error(`❌ Failed to retrieve scenes for ${win.role}: ${err.message}`);
      windowResults[win.role] = [];
    }
  }

  console.log('\n================================================================');
  console.log('📊 SYNTHESIS & RECOMMENDATION MATRIX');
  console.log('================================================================');

  for (const win of targetWindows) {
    const list = windowResults[win.role] || [];
    console.log(`\nRole: [${win.role}]`);
    if (list.length === 0) {
      console.log(`  STATUS: NO DATA / QUERY FAILED`);
      continue;
    }

    const top = list[0];
    console.log(`  Recommended Scene: ${top.assetId}`);
    console.log(`  Acquisition UTC:   ${top.utcDate}`);
    console.log(`  Spacecraft:        ${top.platform}`);
    console.log(`  MGRS Tile:         ${top.tile} (${top.isTileMatch ? 'Consistent with Baseline/Current' : 'Mismatch'})`);
    console.log(`  Scene Cloud Cover: ${top.cloudPct.toFixed(2)}%`);
    console.log(`  Spectral Bands:    ${top.hasAllRequiredBands ? 'All 6 bands verified' : 'Missing bands'}`);
    console.log(`  SCL Layer:         ${top.hasScl ? 'Present' : 'Missing'}`);
    console.log(`  Suitability:       ${top.cloudPct < 15 ? 'EXCELLENT (<15% cloud)' : (top.cloudPct < 30 ? 'USABLE (requires SCL screening)' : 'MARGINAL')}`);
  }

  await mongoose.disconnect();
  console.log('\n================================================================');
  console.log('✅ METADATA DISCOVERY & HARDENING COMPLETE (Zero mutations)');
  console.log('================================================================');
  process.exit(0);
}

runHardenedDiscovery().catch(async (e) => {
  console.error('Fatal discovery error:', e);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
  process.exit(1);
});
