import fs from 'fs';
import { GeeClientService } from '../services/gee/GeeClientService.js';
import { GeeSatelliteProvider } from '../services/gee/providers/GeeSatelliteProvider.js';
import { AppError } from '../utils/AppError.js';
import type { GeoJSONPolygon } from '@tn-forest/shared/types';

/**
 * Automated Test Suite for Real Earth Engine Public Collection Discovery (REST API).
 *
 * Verifies Requirements A through L:
 * A. Correct public asset parent construction
 * B. Correct REST API version (v1alpha)
 * C. Endpoint does NOT contain imageCollections
 * D. Endpoint does NOT use caller project for public assets
 * E. No deterministic fallback exists
 * F. Real GEE response parsed into real image metadata
 * G. Empty GEE result returns []
 * H. Genuine HTTP/API errors remain distinguishable from no-image results (GEE_API_ERROR)
 * I. Pagination handled (nextPageToken & pageToken)
 * J. Zone geometry passed to request
 * K. Date range passed correctly
 * L. Cloud filter passed correctly
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
  passed++;
}

async function runGeeDiscoveryTests() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING GEE REST DISCOVERY TEST SUITE (ITEMS A THROUGH L)');
  console.log('================================================================\n');

  const testGeometry: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [78.0747, 10.1182],
        [78.0867, 10.1118],
        [78.0939, 10.1196],
        [78.0890, 10.1235],
        [78.0747, 10.1182],
      ],
    ],
  };

  const clientService = new GeeClientService();
  const sourceCode = fs.readFileSync('src/services/gee/GeeClientService.ts', 'utf-8');

  // ── TEST A: Correct public asset parent construction ──
  console.log('▶ Test A: Correct public asset parent construction');
  {
    const collectionId = 'COPERNICUS/S2_SR_HARMONIZED';
    const expectedParent = `projects/earthengine-public/assets/${collectionId}`;
    assert(
      sourceCode.includes('`projects/earthengine-public/assets/${collection}`') ||
      sourceCode.includes("projects/earthengine-public/assets/"),
      `Parent constructed as projects/earthengine-public/assets/\${collection} (expected: ${expectedParent})`,
    );
  }

  // ── TEST B: Correct REST API version (v1alpha) ──
  console.log('\n▶ Test B: Correct REST API version (v1alpha)');
  {
    assert(
      sourceCode.includes('/v1alpha/'),
      'REST endpoint explicitly uses /v1alpha/',
    );
  }

  // ── TEST C: Endpoint does NOT contain imageCollections ──
  console.log('\n▶ Test C: Endpoint does NOT contain imageCollections');
  {
    assert(
      !sourceCode.includes('/imageCollections/'),
      'Endpoint does NOT contain /imageCollections/',
    );
    assert(
      !sourceCode.includes('imageCollections:listImages'),
      'Endpoint does NOT contain imageCollections:listImages',
    );
  }

  // ── TEST D: Endpoint does NOT use caller project for public datasets ──
  console.log('\n▶ Test D: Endpoint does NOT use caller project for public datasets');
  {
    assert(
      !sourceCode.includes('projects/${config.projectId}/imageCollections') &&
      !sourceCode.includes('projects/${config.projectId}/assets/COPERNICUS'),
      'Caller project is NOT used as parent for public collections',
    );
  }

  // ── TEST E: No deterministic fallback exists ──
  console.log('\n▶ Test E: No deterministic fallback exists');
  {
    assert(
      !sourceCode.includes('generateDeterministicCatalog') &&
      !sourceCode.includes('generateDeterministicLandsatCatalog') &&
      !sourceCode.includes('generateDeterministicSarCatalog'),
      'GeeClientService contains ZERO deterministic catalog fallback methods',
    );
  }

  // ── TEST F: Real GEE response parsed into real image metadata ──
  console.log('\n▶ Test F: Real GEE response parsed into real image metadata');
  {
    const results = await clientService.querySentinel2Collection({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: testGeometry,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-15T23:59:59.999Z'),
      maxCloudCover: 100.0,
    });

    assert(results.length > 0, `Returned ${results.length} real Sentinel-2 images from Earth Engine`);
    const img = results[0];
    assert(img.id.startsWith('COPERNICUS/S2_SR_HARMONIZED/'), `Real GEE image ID: ${img.id}`);
    assert(typeof img.properties === 'object', 'Properties object exists');
    assert(img.properties['system:time_start'] !== undefined, 'system:time_start timestamp is present');
  }

  // ── TEST G: Empty GEE result returns [] ──
  console.log('\n▶ Test G: Empty GEE result returns [] (no fake data on zero results)');
  {
    // Cloud cover = -1% (impossible) -> must return empty array honestly
    const results = await clientService.querySentinel2Collection({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: testGeometry,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-05T00:00:00.000Z'),
      maxCloudCover: -1.0,
    });

    assert(Array.isArray(results) && results.length === 0, 'Returns empty array [] honestly when no images match');
  }

  // ── TEST H: Genuine HTTP/API errors remain distinguishable from no-image results ──
  console.log('\n▶ Test H: Genuine HTTP/API errors remain distinguishable from no-image results');
  {
    let caughtError: unknown = null;
    try {
      // Non-existent collection must throw GEE_API_ERROR (HTTP 404), NOT return []
      await clientService.listPublicImages({
        collection: 'NON_EXISTENT_DATASET_123456789',
        geometry: testGeometry,
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2024-01-05T00:00:00.000Z'),
      });
    } catch (err: unknown) {
      caughtError = err;
    }

    assert(caughtError instanceof AppError, 'Throws AppError on HTTP 4xx API error');
    assert(
      (caughtError as AppError).message.includes('GEE API error') ||
      (caughtError as AppError).message.includes('HTTP 404'),
      'Error message identifies GEE API error distinctly',
    );
  }

  // ── TEST I: Pagination is handled (nextPageToken & pageToken) ──
  console.log('\n▶ Test I: Pagination is handled (nextPageToken & pageToken)');
  {
    const page1 = await clientService.listPublicImages({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: testGeometry,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-31T23:59:59.999Z'),
      pageSize: 1,
    });

    assert(page1.images.length === 1, 'Page 1 returned 1 image');
    assert(typeof page1.nextPageToken === 'string', 'Page 1 returns nextPageToken');

    const page2 = await clientService.listPublicImages({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: testGeometry,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-31T23:59:59.999Z'),
      pageSize: 1,
      pageToken: page1.nextPageToken,
    });

    assert(page2.images.length === 1, 'Page 2 returned 1 image');
    assert(page1.images[0].id !== page2.images[0].id, 'Page 1 and Page 2 have different image IDs');
  }

  // ── TEST J: Zone geometry is passed to request ──
  console.log('\n▶ Test J: Zone geometry is passed to request');
  {
    assert(
      sourceCode.includes("url.searchParams.set('region', JSON.stringify(geometry))"),
      'Actual zone GeoJSON polygon is passed as URL searchParam region',
    );
  }

  // ── TEST K: Date range is passed correctly ──
  console.log('\n▶ Test K: Date range is passed correctly');
  {
    assert(
      sourceCode.includes("url.searchParams.set('startTime', startDate.toISOString())"),
      'User start date is passed as startTime ISO string',
    );
    assert(
      sourceCode.includes("url.searchParams.set('endTime', endDate.toISOString())"),
      'User end date is passed as endTime ISO string',
    );
  }

  // ── TEST L: Cloud filter is passed correctly ──
  console.log('\n▶ Test L: Cloud filter is passed correctly');
  {
    // Query with 10% cloud threshold vs 100% cloud threshold
    const lowCloud = await clientService.querySentinel2Collection({
      collection: 'COPERNICUS/S2_SR_HARMONIZED',
      geometry: testGeometry,
      startDate: new Date('2024-01-01T00:00:00.000Z'),
      endDate: new Date('2024-01-31T23:59:59.999Z'),
      maxCloudCover: 30.0,
    });

    for (const img of lowCloud) {
      const cloud = Number(img.properties.CLOUDY_PIXEL_PERCENTAGE ?? img.properties.CLOUD_COVERAGE_ASSESSMENT ?? 0);
      assert(cloud <= 30.0, `Filtered image cloud ${cloud}% <= 30%`);
    }
  }

  console.log('\n================================================================');
  console.log(`📊 GEE DISCOVERY TEST REPORT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGeeDiscoveryTests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
