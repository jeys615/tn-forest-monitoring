import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

/**
 * Dedicated Google Earth Engine Connectivity & Discovery Diagnostic Script.
 *
 * Tests Sentinel-2 discovery independently against the Earth Engine v1alpha
 * public collection discovery REST endpoint using Application Default Credentials (ADC).
 */

async function runDiagnostic() {
  console.log('================================================================');
  console.log('🛰️ GEE CONNECTIVITY & SATELLITE DISCOVERY DIAGNOSTIC');
  console.log('================================================================\n');

  const authService = GeeAuthService.getInstance();
  const config = authService.getConfig();

  // 1. Acquire ADC Token
  const token = await authService.getAccessToken();
  if (!token) {
    console.error('[GEE_DISCOVERY] Authentication: FAILED (No access token acquired)');
    process.exit(1);
  }
  console.log('[GEE_DISCOVERY] Authentication: SUCCESS');

  // 2. Setup known valid parameters (Sentinel-2 over Tamil Nadu, January 2024)
  const collection = 'COPERNICUS/S2_SR_HARMONIZED';
  const publicAssetParent = `projects/earthengine-public/assets/${collection}`;
  const startDate = new Date('2024-01-01T00:00:00.000Z');
  const endDate = new Date('2024-01-31T23:59:59.999Z');
  const maxCloudCover = 50.0;

  // Small polygon over Tamil Nadu (Madurai / Sathiyar region)
  const testGeometry: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.0747, 10.1182],
        [78.0867, 10.1118],
        [78.0939, 10.1196],
        [78.0890, 10.1235],
        [78.0797, 10.1228],
        [78.0747, 10.1182],
      ],
    ],
  };

  console.log(`[GEE_DISCOVERY] Collection:\n${collection}\n`);
  console.log(`[GEE_DISCOVERY] Public asset:\n${publicAssetParent}\n`);
  console.log('[GEE_DISCOVERY] REST version: v1alpha\n');

  const clientService = new GeeClientService();

  try {
    const images = await clientService.querySentinel2Collection({
      collection,
      geometry: testGeometry,
      startDate,
      endDate,
      maxCloudCover,
    });

    console.log('[GEE_DISCOVERY] HTTP status: 200');
    console.log(`[GEE_DISCOVERY] Images returned: ${images.length}`);

    if (images.length === 0) {
      console.warn('⚠️ [GEE_DISCOVERY] Zero images returned under cloud cover limit.');
      process.exit(1);
    }

    const firstImage = images[0];
    const acqDate = firstImage.properties['system:time_start']
      ? new Date(Number(firstImage.properties['system:time_start'])).toISOString()
      : (firstImage.startTime || 'UNKNOWN');
    const cloud = firstImage.properties.CLOUDY_PIXEL_PERCENTAGE ?? firstImage.properties.CLOUD_COVERAGE_ASSESSMENT ?? 'N/A';

    console.log(`[GEE_DISCOVERY] First image:\n${firstImage.id}`);
    console.log(`[GEE_DISCOVERY] Acquisition date:\n${acqDate}`);
    console.log(`[GEE_DISCOVERY] Cloud:\n${cloud}%\n`);

    console.log('================================================================');
    console.log('✅ DIAGNOSTIC COMPLETE: Real GEE discovery is verified and functional!');
    console.log('================================================================');
    process.exitCode = 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ [GEE_DISCOVERY] Diagnostic error: ${msg}`);
    process.exitCode = 1;
  }
}

runDiagnostic().catch((err) => {
  console.error('Fatal error running diagnostic:', err);
  process.exitCode = 1;
});
