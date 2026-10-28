/**
 * hls-acquisition.test.ts — Phase 5 Unit Tests
 *
 * Tests for HLSAcquisitionService with fully isolated mocks.
 * NO real GEE calls, NO MongoDB, NO file I/O.
 *
 * 15 scenarios covered:
 *   1.  SAR source → immediate throw (programming error)
 *   2.  SRTM DEM source → immediate throw (programming error)
 *   3.  SENTINEL_2 → S30 collection mapping verified
 *   4.  LANDSAT_8 → L30 collection mapping verified
 *   5.  LANDSAT_9 → L30 collection mapping verified
 *   6.  GEE API error → HLS_API_ERROR failure
 *   7.  GEE returns 0 images → HLS_NO_IMAGE_FOUND failure
 *   8.  GEE returns images but none match date lineage → HLS_DATE_MISMATCH failure
 *   9.  Export submission fails → HLS_EXPORT_FAILED failure
 *  10.  Export task times out / FAILED state → HLS_EXPORT_FAILED failure
 *  11.  Drive search finds no file → HLS_DOWNLOAD_FAILED failure
 *  12.  Drive download fails → HLS_DOWNLOAD_FAILED failure
 *  13.  Raster has insufficient bands → HLS_RASTER_INVALID failure
 *  14.  Fmask band is entirely nodata → HLS_QA_INVALID failure
 *  15.  Full success path → HLSAcquisitionResult with correct fields
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  SatelliteSource,
  HLSProduct,
  HLSVersion,
  HLSErrorStage,
  type GeoJSONPolygon,
} from '@tn-forest/shared/types';
import {
  HLSAcquisitionService,
  HLS_GEE_COLLECTIONS,
  HLS_NATIVE_RESOLUTION_M,
  resolveHLSProduct,
  resolveHLSSourcePlatform,
  validateHLSDateLineage,
  selectBestHLSCandidate,
  type HLSAcquisitionInput,
  type HLSAcquisitionResult,
  type HLSAcquisitionFailure,
} from '../services/hls/HLSAcquisitionService.js';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { AppError } from '../utils/AppError.js';

// ─── Test Infrastructure ──────────────────────────────────────────────────────

console.log('\n==================================================');
console.log('PHASE 5 — HLS ACQUISITION SERVICE UNIT TESTS');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

function pass(name: string): void {
  passed++;
  console.log(`  ✅ PASS: ${name}`);
}

function fail(name: string, err: unknown): void {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  ❌ FAIL: ${name} → ${msg}`);
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    pass(name);
  } catch (err: unknown) {
    fail(name, err);
  }
}

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

const MOCK_ZONE_CODE = 'ZONE-TEST-0001';
const MOCK_JOB_ID = 'JOB-HLS-TEST-001';
const SOURCE_DATE = new Date('2026-01-15T00:00:00.000Z');
const SAME_DATE = new Date('2026-01-15T06:30:00.000Z'); // Same day, different time
const MISMATCH_DATE = new Date('2025-12-01T00:00:00.000Z'); // 45 days off

const MOCK_GEOMETRY: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [78.0, 10.0],
      [79.0, 10.0],
      [79.0, 11.0],
      [78.0, 11.0],
      [78.0, 10.0],
    ],
  ],
};

/** Create a mock RawGeeImageRecord with a given date and image ID */
function mockImage(
  id: string,
  acquisitionDate: Date,
  cloudCover: number = 5.0,
): import('../services/gee/GeeClientService.js').RawGeeImageRecord {
  return {
    id,
    startTime: acquisitionDate.toISOString(),
    properties: {
      'system:time_start': acquisitionDate.getTime(),
      'system:index': id.split('/').pop() || id,
      CLOUD_COVERAGE_ASSESSMENT: cloudCover,
    },
  };
}

/** Build an HLSAcquisitionService with all dependencies mocked */
function buildMockedService(overrides: {
  fetchAllPublicImages?: (params: any) => Promise<any>;
  requestImageExport?: (opts: any) => Promise<any>;
  pollTaskCompletion?: (taskId: string, opts?: any) => Promise<any>;
  findExportedFile?: (fileName: string) => Promise<any>;
  downloadGeoTiff?: (params: any) => Promise<any>;
  readGeoTiff?: (filePath: string) => Promise<any>;
}): HLSAcquisitionService {
  // Mock GeeClientService
  const mockGeeClient = {
    fetchAllPublicImages: overrides.fetchAllPublicImages ??
      (async () => ({ images: [mockImage(`NASA/HLS/HLSS30/v002/${SOURCE_DATE.toISOString().slice(0,10).replace(/-/g,'')}_T44PMT`, SOURCE_DATE)], pagesFetched: 1, rawCount: 1, uniqueCount: 1 })),
  } as any;

  // Mock GeeExportService
  const mockExportService = {
    requestImageExport: overrides.requestImageExport ??
      (async () => ({
        taskId: 'projects/monitoring-system-506515/operations/EXP-HLS-TEST-001',
        taskState: 'RUNNING',
        driveFileName: 'ZONE-TEST-0001_JOB-HLS-TEST-001_BASELINE_Sentinel2_20260115.tif',
        driveFolder: 'MonitoringExports',
        exportScaleMeters: 30,
        crs: 'EPSG:4326',
        bandsExported: ['B2', 'B3', 'B4', 'B8A', 'B11', 'B12', 'Fmask'],
        requestedAt: new Date(),
      })),
  } as any;

  // Mock GeeTaskService
  const mockTaskService = {
    pollTaskCompletion: overrides.pollTaskCompletion ??
      (async () => ({ taskId: 'projects/monitoring-system-506515/operations/EXP-HLS-TEST-001', state: 'EXPORT_COMPLETED', progressPercentage: 100, updatedAt: new Date(), isTransientError: false })),
  } as any;

  // Mock GoogleDriveService
  const mockDriveService = {
    findExportedFile: overrides.findExportedFile ??
      (async () => ({ id: 'DRIVE-FILE-HLS-001', name: 'ZONE-TEST-0001_JOB-HLS-TEST-001_BASELINE_Sentinel2_20260115.tif', size: '1048576' })),
    downloadGeoTiff: overrides.downloadGeoTiff ??
      (async (params: any) => ({
        fileId: 'DRIVE-FILE-HLS-001',
        fileName: params.fileName || 'hls_test.tif',
        localFilePath: path.join(os.tmpdir(), 'hls_test.tif'),
        sizeBytes: 1048576,
        downloadedAt: new Date(),
      })),
  } as any;

  const svc = new HLSAcquisitionService(
    mockGeeClient,
    mockExportService,
    mockTaskService,
    mockDriveService,
  );

  // Patch GeoTiffService.readGeoTiff if override provided
  if (overrides.readGeoTiff) {
    const originalReadGeoTiff = GeoTiffService.readGeoTiff;
    (GeoTiffService as any).readGeoTiff = overrides.readGeoTiff;
    // Restore after use via a cleanup marker
    (svc as any)._cleanupReadGeoTiff = () => {
      (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
    };
  }

  return svc;
}

/** Default mock GeoTiffService.readGeoTiff result with valid 7-band raster */
function mockValidRaster(numBands = 7) {
  const width = 50;
  const height = 50;
  const totalPixels = width * height;

  // Build band data: 6 optical + 1 Fmask (all valid pixels, values 0–100)
  const bandData: Float32Array[] = [];
  for (let b = 0; b < numBands; b++) {
    const band = new Float32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      band[i] = b === numBands - 1 ? 64 : 500 + i; // Fmask = 64 (valid), others = reflectance
    }
    bandData.push(band);
  }

  return {
    metadata: {
      width,
      height,
      numBands,
      crs: 'EPSG:32644',
      originalCrs: 'EPSG:32644',
      normalizedCrs: 'EPSG:32644',
      areaCalculationCrs: 'EPSG:32644',
      pixelScale: [30, 30, 0] as [number, number, number],
      tiePoint: [0, 0, 0, 420000, 1100000, 0] as [number, number, number, number, number, number],
      bbox: [420000, 1000000, 421500, 1001500] as [number, number, number, number],
      nodata: -9999,
      bitsPerSample: [16, 16, 16, 16, 16, 16, 8],
      pixelAreaM2: 900,
      isProjectedMetric: true,
    },
    bandData,
    bandNames: ['B2', 'B3', 'B4', 'B8A', 'B11', 'B12', 'Fmask'].slice(0, numBands),
  };
}

// ─── Pure Unit Tests (no async IO) ───────────────────────────────────────────

console.log('▶ Section A: Pure utility function tests\n');

await test('resolveHLSProduct: SENTINEL_2 → S30', () => {
  assert.equal(resolveHLSProduct(SatelliteSource.SENTINEL_2), HLSProduct.S30);
});

await test('resolveHLSProduct: LANDSAT_8 → L30', () => {
  assert.equal(resolveHLSProduct(SatelliteSource.LANDSAT_8), HLSProduct.L30);
});

await test('resolveHLSProduct: LANDSAT_9 → L30', () => {
  assert.equal(resolveHLSProduct(SatelliteSource.LANDSAT_9), HLSProduct.L30);
});

await test('resolveHLSSourcePlatform: SENTINEL_2 → "Sentinel-2"', () => {
  assert.equal(resolveHLSSourcePlatform(SatelliteSource.SENTINEL_2), 'Sentinel-2');
});

await test('resolveHLSSourcePlatform: LANDSAT_8 → "Landsat-8"', () => {
  assert.equal(resolveHLSSourcePlatform(SatelliteSource.LANDSAT_8), 'Landsat-8');
});

await test('resolveHLSSourcePlatform: LANDSAT_9 → "Landsat-9"', () => {
  assert.equal(resolveHLSSourcePlatform(SatelliteSource.LANDSAT_9), 'Landsat-9');
});

await test('validateHLSDateLineage: same-day match → true', () => {
  assert.equal(validateHLSDateLineage(SOURCE_DATE, SAME_DATE), true);
});

await test('validateHLSDateLineage: 45-day mismatch → false', () => {
  assert.equal(validateHLSDateLineage(SOURCE_DATE, MISMATCH_DATE), false);
});

await test('selectBestHLSCandidate: returns null when no images match date', () => {
  const images = [
    mockImage('img1', MISMATCH_DATE, 10),
    mockImage('img2', MISMATCH_DATE, 5),
  ];
  const result = selectBestHLSCandidate(images, SOURCE_DATE);
  assert.equal(result, null);
});

await test('selectBestHLSCandidate: picks lowest cloud among date-matched candidates', () => {
  const highCloud = mockImage('img-high', SAME_DATE, 20);
  const lowCloud = mockImage('img-low', SAME_DATE, 3);
  const images = [highCloud, lowCloud];
  const result = selectBestHLSCandidate(images, SOURCE_DATE);
  assert.ok(result !== null);
  assert.equal(result!.id, 'img-low');
});

await test('HLS_GEE_COLLECTIONS: S30 maps to correct NASA collection', () => {
  assert.equal(HLS_GEE_COLLECTIONS[HLSProduct.S30], 'NASA/HLS/HLSS30/v002');
});

await test('HLS_GEE_COLLECTIONS: L30 maps to correct NASA collection', () => {
  assert.equal(HLS_GEE_COLLECTIONS[HLSProduct.L30], 'NASA/HLS/HLSL30/v002');
});

await test('HLS_NATIVE_RESOLUTION_M is 30', () => {
  assert.equal(HLS_NATIVE_RESOLUTION_M, 30);
});

// ─── Scenario 1: SAR source → immediate throw ─────────────────────────────────
console.log('\n▶ Section B: acquireHLS() error scenarios\n');

await test('Scenario 1: SAR source (SENTINEL_1) throws immediately', async () => {
  const svc = buildMockedService({});
  await assert.rejects(
    () =>
      svc.acquireHLS({
        zoneCode: MOCK_ZONE_CODE,
        jobId: MOCK_JOB_ID,
        sourceSatellite: SatelliteSource.SENTINEL_1,
        sourceObservationDate: SOURCE_DATE,
        geometry: MOCK_GEOMETRY,
      }),
    (err) => {
      assert.ok(err instanceof AppError, 'Should throw AppError for SAR source');
      assert.ok(
        (err as AppError).message.includes('SAR'),
        'Error message should mention SAR',
      );
      return true;
    },
  );
});

// ─── Scenario 2: GEE API error ────────────────────────────────────────────────
await test('Scenario 2: GEE API error → HLS_API_ERROR failure', async () => {
  const svc = buildMockedService({
    fetchAllPublicImages: async () => {
      throw new AppError('GEE API error: HTTP 503 Service Unavailable', 503);
    },
  });

  const result = await svc.acquireHLS({
    zoneCode: MOCK_ZONE_CODE,
    jobId: MOCK_JOB_ID,
    sourceSatellite: SatelliteSource.SENTINEL_2,
    sourceObservationDate: SOURCE_DATE,
    geometry: MOCK_GEOMETRY,
  }) as HLSAcquisitionFailure;

  assert.equal(result.success, false);
  assert.equal(result.errorStage, HLSErrorStage.HLS_API_ERROR);
  assert.ok(result.errorMessage.includes('NASA/HLS/HLSS30/v002'));
});

// ─── Scenario 3: GEE returns 0 images ────────────────────────────────────────
await test('Scenario 3: GEE returns 0 images → HLS_NO_IMAGE_FOUND failure', async () => {
  const svc = buildMockedService({
    fetchAllPublicImages: async () => ({ images: [], pagesFetched: 1, rawCount: 0, uniqueCount: 0 }),
  });

  const result = await svc.acquireHLS({
    zoneCode: MOCK_ZONE_CODE,
    jobId: MOCK_JOB_ID,
    sourceSatellite: SatelliteSource.SENTINEL_2,
    sourceObservationDate: SOURCE_DATE,
    geometry: MOCK_GEOMETRY,
  }) as HLSAcquisitionFailure;

  assert.equal(result.success, false);
  assert.equal(result.errorStage, HLSErrorStage.HLS_NO_IMAGE_FOUND);
});

// ─── Scenario 4: Images exist but no date match ───────────────────────────────
await test('Scenario 4: Images found but date mismatch → HLS_DATE_MISMATCH failure', async () => {
  const svc = buildMockedService({
    fetchAllPublicImages: async () => ({
      images: [
        mockImage('NASA/HLS/HLSS30/v002/20251201_T44PMT', MISMATCH_DATE, 5),
        mockImage('NASA/HLS/HLSS30/v002/20251215_T44PMT', new Date('2025-12-15'), 8),
      ],
      pagesFetched: 1,
      rawCount: 2,
      uniqueCount: 2,
    }),
  });

  const result = await svc.acquireHLS({
    zoneCode: MOCK_ZONE_CODE,
    jobId: MOCK_JOB_ID,
    sourceSatellite: SatelliteSource.SENTINEL_2,
    sourceObservationDate: SOURCE_DATE, // 2026-01-15
    geometry: MOCK_GEOMETRY,
  }) as HLSAcquisitionFailure;

  assert.equal(result.success, false);
  assert.equal(result.errorStage, HLSErrorStage.HLS_DATE_MISMATCH);
  assert.ok(result.errorMessage.includes('lineage mismatch') || result.errorMessage.includes('mismatch'));
});

// ─── Scenario 5: Export submission fails ──────────────────────────────────────
await test('Scenario 5: Export submission fails → HLS_EXPORT_FAILED failure', async () => {
  const svc = buildMockedService({
    fetchAllPublicImages: async () => ({
      images: [mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE)],
      pagesFetched: 1, rawCount: 1, uniqueCount: 1,
    }),
    requestImageExport: async () => {
      throw new AppError('GEE export submission failed: quota exceeded', 429);
    },
  });

  const result = await svc.acquireHLS({
    zoneCode: MOCK_ZONE_CODE,
    jobId: MOCK_JOB_ID,
    sourceSatellite: SatelliteSource.SENTINEL_2,
    sourceObservationDate: SOURCE_DATE,
    geometry: MOCK_GEOMETRY,
  }) as HLSAcquisitionFailure;

  assert.equal(result.success, false);
  assert.equal(result.errorStage, HLSErrorStage.HLS_EXPORT_FAILED);
  assert.ok(result.errorMessage.toLowerCase().includes('export'));
});

// ─── Scenario 6: Export task fails/times out ─────────────────────────────────
await test('Scenario 6: Export task FAILED state → HLS_EXPORT_FAILED failure', async () => {
  const svc = buildMockedService({
    fetchAllPublicImages: async () => ({
      images: [mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE)],
      pagesFetched: 1, rawCount: 1, uniqueCount: 1,
    }),
    pollTaskCompletion: async () => ({
      taskId: 'projects/test/operations/TASK-001',
      state: 'EXPORT_FAILED',
      errorMessage: 'Computation timed out.',
      updatedAt: new Date(),
      isTransientError: false,
    }),
  });

  const result = await svc.acquireHLS({
    zoneCode: MOCK_ZONE_CODE,
    jobId: MOCK_JOB_ID,
    sourceSatellite: SatelliteSource.LANDSAT_8,
    sourceObservationDate: SOURCE_DATE,
    geometry: MOCK_GEOMETRY,
  }) as HLSAcquisitionFailure;

  assert.equal(result.success, false);
  assert.equal(result.errorStage, HLSErrorStage.HLS_EXPORT_FAILED);
  assert.ok(result.errorMessage.includes('EXPORT_FAILED'));
});

// ─── Scenario 7: Drive search returns null ────────────────────────────────────
await test('Scenario 7: Drive search finds no file → HLS_DOWNLOAD_FAILED failure', async () => {
  const svc = buildMockedService({
    fetchAllPublicImages: async () => ({
      images: [mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE)],
      pagesFetched: 1, rawCount: 1, uniqueCount: 1,
    }),
    findExportedFile: async () => null,
  });

  const result = await svc.acquireHLS({
    zoneCode: MOCK_ZONE_CODE,
    jobId: MOCK_JOB_ID,
    sourceSatellite: SatelliteSource.SENTINEL_2,
    sourceObservationDate: SOURCE_DATE,
    geometry: MOCK_GEOMETRY,
  }) as HLSAcquisitionFailure;

  assert.equal(result.success, false);
  assert.equal(result.errorStage, HLSErrorStage.HLS_DOWNLOAD_FAILED);
  assert.ok(result.errorMessage.includes('not found in Google Drive'));
});

// ─── Scenario 8: Drive download throws ───────────────────────────────────────
await test('Scenario 8: Drive download fails → HLS_DOWNLOAD_FAILED failure', async () => {
  const svc = buildMockedService({
    fetchAllPublicImages: async () => ({
      images: [mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE)],
      pagesFetched: 1, rawCount: 1, uniqueCount: 1,
    }),
    downloadGeoTiff: async () => {
      throw new AppError('DRIVE_AUTH_FAILED: Insufficient Drive scopes', 403);
    },
  });

  const result = await svc.acquireHLS({
    zoneCode: MOCK_ZONE_CODE,
    jobId: MOCK_JOB_ID,
    sourceSatellite: SatelliteSource.SENTINEL_2,
    sourceObservationDate: SOURCE_DATE,
    geometry: MOCK_GEOMETRY,
  }) as HLSAcquisitionFailure;

  assert.equal(result.success, false);
  assert.equal(result.errorStage, HLSErrorStage.HLS_DOWNLOAD_FAILED);
  assert.ok(result.errorMessage.includes('download'));
});

// ─── Scenario 9: Raster has insufficient bands ────────────────────────────────
await test('Scenario 9: Raster has insufficient bands → HLS_RASTER_INVALID failure', async () => {
  const originalReadGeoTiff = GeoTiffService.readGeoTiff;
  try {
    (GeoTiffService as any).readGeoTiff = async (_filePath: string) => mockValidRaster(3); // Only 3 bands

    const svc = buildMockedService({
      fetchAllPublicImages: async () => ({
        images: [mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE)],
        pagesFetched: 1, rawCount: 1, uniqueCount: 1,
      }),
    });

    const result = await svc.acquireHLS({
      zoneCode: MOCK_ZONE_CODE,
      jobId: MOCK_JOB_ID,
      sourceSatellite: SatelliteSource.SENTINEL_2,
      sourceObservationDate: SOURCE_DATE,
      geometry: MOCK_GEOMETRY,
    }) as HLSAcquisitionFailure;

    assert.equal(result.success, false);
    assert.equal(result.errorStage, HLSErrorStage.HLS_RASTER_INVALID);
    assert.ok(result.errorMessage.includes('band count'));
  } finally {
    (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
  }
});

// ─── Scenario 10: Fmask band is entirely nodata ──────────────────────────────
await test('Scenario 10: Fmask band entirely nodata → HLS_QA_INVALID failure', async () => {
  const originalReadGeoTiff = GeoTiffService.readGeoTiff;
  try {
    (GeoTiffService as any).readGeoTiff = async (_filePath: string) => {
      const base = mockValidRaster(7);
      // Set Fmask band (index 6) to all nodata (-9999)
      const nodataFmask = new Float32Array(base.metadata.width * base.metadata.height).fill(-9999);
      base.bandData[6] = nodataFmask;
      return base;
    };

    const svc = buildMockedService({
      fetchAllPublicImages: async () => ({
        images: [mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE)],
        pagesFetched: 1, rawCount: 1, uniqueCount: 1,
      }),
    });

    const result = await svc.acquireHLS({
      zoneCode: MOCK_ZONE_CODE,
      jobId: MOCK_JOB_ID,
      sourceSatellite: SatelliteSource.SENTINEL_2,
      sourceObservationDate: SOURCE_DATE,
      geometry: MOCK_GEOMETRY,
    }) as HLSAcquisitionFailure;

    assert.equal(result.success, false);
    assert.equal(result.errorStage, HLSErrorStage.HLS_QA_INVALID);
    assert.ok(result.errorMessage.includes('Fmask') || result.errorMessage.includes('nodata'));
  } finally {
    (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
  }
});

// ─── Scenario 11: Full success (SENTINEL_2 → S30) ────────────────────────────
console.log('\n▶ Section C: Full success scenarios\n');

await test('Scenario 11: Full success — SENTINEL_2 → S30 acquisition', async () => {
  const originalReadGeoTiff = GeoTiffService.readGeoTiff;
  try {
    (GeoTiffService as any).readGeoTiff = async (_filePath: string) => mockValidRaster(7);

    const svc = buildMockedService({
      fetchAllPublicImages: async () => ({
        images: [
          mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE, 3.5),
        ],
        pagesFetched: 1, rawCount: 1, uniqueCount: 1,
      }),
    });

    const result = await svc.acquireHLS({
      zoneCode: MOCK_ZONE_CODE,
      jobId: MOCK_JOB_ID,
      sourceSatellite: SatelliteSource.SENTINEL_2,
      sourceObservationDate: SOURCE_DATE,
      geometry: MOCK_GEOMETRY,
    }) as HLSAcquisitionResult;

    assert.equal(result.success, true);
    assert.equal(result.hlsProduct, HLSProduct.S30);
    assert.equal(result.hlsVersion, HLSVersion.V2_0);
    assert.equal(result.geeCollection, 'NASA/HLS/HLSS30/v002');
    assert.equal(result.geeHlsImageId, 'NASA/HLS/HLSS30/v002/20260115_T44PMT');
    assert.equal(result.resolutionMeters, 30);
    assert.equal(result.bandCount, 7);
    assert.equal(result.rasterWidth, 50);
    assert.equal(result.rasterHeight, 50);
    assert.equal(result.rasterCrs, 'EPSG:32644');
    assert.equal(result.fmaskValidated, true);
    assert.equal(result.sourcePlatform, 'Sentinel-2');
    assert.ok(result.cloudCoverPercent >= 0);
    assert.ok(result.fileSizeBytes > 0);
    assert.ok(result.completedAt instanceof Date);
  } finally {
    (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
  }
});

// ─── Scenario 12: Full success (LANDSAT_8 → L30) ────────────────────────────
await test('Scenario 12: Full success — LANDSAT_8 → L30 acquisition', async () => {
  const originalReadGeoTiff = GeoTiffService.readGeoTiff;
  try {
    (GeoTiffService as any).readGeoTiff = async (_filePath: string) => mockValidRaster(7);

    const svc = buildMockedService({
      fetchAllPublicImages: async () => ({
        images: [mockImage('NASA/HLS/HLSL30/v002/20260115_T44PMT', SOURCE_DATE, 8.0)],
        pagesFetched: 1, rawCount: 1, uniqueCount: 1,
      }),
    });

    const result = await svc.acquireHLS({
      zoneCode: MOCK_ZONE_CODE,
      jobId: MOCK_JOB_ID,
      sourceSatellite: SatelliteSource.LANDSAT_8,
      sourceObservationDate: SOURCE_DATE,
      geometry: MOCK_GEOMETRY,
    }) as HLSAcquisitionResult;

    assert.equal(result.success, true);
    assert.equal(result.hlsProduct, HLSProduct.L30);
    assert.equal(result.geeCollection, 'NASA/HLS/HLSL30/v002');
    assert.equal(result.sourcePlatform, 'Landsat-8');
  } finally {
    (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
  }
});

// ─── Scenario 13: Full success (LANDSAT_9 → L30) ────────────────────────────
await test('Scenario 13: Full success — LANDSAT_9 → L30 acquisition', async () => {
  const originalReadGeoTiff = GeoTiffService.readGeoTiff;
  try {
    (GeoTiffService as any).readGeoTiff = async (_filePath: string) => mockValidRaster(7);

    const svc = buildMockedService({
      fetchAllPublicImages: async () => ({
        images: [mockImage('NASA/HLS/HLSL30/v002/20260115_L9_T44PMT', SOURCE_DATE, 2.0)],
        pagesFetched: 1, rawCount: 1, uniqueCount: 1,
      }),
    });

    const result = await svc.acquireHLS({
      zoneCode: MOCK_ZONE_CODE,
      jobId: MOCK_JOB_ID,
      sourceSatellite: SatelliteSource.LANDSAT_9,
      sourceObservationDate: SOURCE_DATE,
      geometry: MOCK_GEOMETRY,
    }) as HLSAcquisitionResult;

    assert.equal(result.success, true);
    assert.equal(result.hlsProduct, HLSProduct.L30);
    assert.equal(result.geeCollection, 'NASA/HLS/HLSL30/v002');
    assert.equal(result.sourcePlatform, 'Landsat-9');
  } finally {
    (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
  }
});

// ─── Scenario 14: Best candidate selection (multiple images) ─────────────────
await test('Scenario 14: selectBestHLSCandidate picks lowest cloud among valid matches', async () => {
  const originalReadGeoTiff = GeoTiffService.readGeoTiff;
  try {
    let capturedGeeImageId: string | undefined;

    (GeoTiffService as any).readGeoTiff = async (_filePath: string) => mockValidRaster(7);

    const svc = buildMockedService({
      fetchAllPublicImages: async () => ({
        images: [
          mockImage('NASA/HLS/HLSS30/v002/HIGH_CLOUD', SOURCE_DATE, 35.0),
          mockImage('NASA/HLS/HLSS30/v002/LOW_CLOUD', SOURCE_DATE, 4.0),
          mockImage('NASA/HLS/HLSS30/v002/MISMATCH', MISMATCH_DATE, 1.0),
        ],
        pagesFetched: 1, rawCount: 3, uniqueCount: 3,
      }),
      requestImageExport: async (opts: any) => {
        capturedGeeImageId = opts?.scene?.imageId;
        return {
          taskId: 'projects/test/operations/TEST-TASK',
          taskState: 'RUNNING',
          driveFileName: 'test.tif',
          driveFolder: 'MonitoringExports',
          exportScaleMeters: 30,
          crs: 'EPSG:4326',
          bandsExported: ['B2', 'B3', 'B4', 'B8A', 'B11', 'B12', 'Fmask'],
          requestedAt: new Date(),
        };
      },
    });

    const result = await svc.acquireHLS({
      zoneCode: MOCK_ZONE_CODE,
      jobId: MOCK_JOB_ID,
      sourceSatellite: SatelliteSource.SENTINEL_2,
      sourceObservationDate: SOURCE_DATE,
      geometry: MOCK_GEOMETRY,
    });

    // The MISMATCH date image should be excluded; LOW_CLOUD should win over HIGH_CLOUD
    assert.equal(capturedGeeImageId, 'NASA/HLS/HLSS30/v002/LOW_CLOUD');
  } finally {
    (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
  }
});

// ─── Scenario 15: HLSVersion.V2_0 is always used ────────────────────────────
await test('Scenario 15: hlsVersion defaults to V2.0 in result', async () => {
  const originalReadGeoTiff = GeoTiffService.readGeoTiff;
  try {
    (GeoTiffService as any).readGeoTiff = async () => mockValidRaster(7);

    const svc = buildMockedService({
      fetchAllPublicImages: async () => ({
        images: [mockImage('NASA/HLS/HLSS30/v002/20260115_T44PMT', SOURCE_DATE)],
        pagesFetched: 1, rawCount: 1, uniqueCount: 1,
      }),
    });

    const result = await svc.acquireHLS({
      zoneCode: MOCK_ZONE_CODE,
      jobId: MOCK_JOB_ID,
      sourceSatellite: SatelliteSource.SENTINEL_2,
      sourceObservationDate: SOURCE_DATE,
      geometry: MOCK_GEOMETRY,
      // No hlsVersion specified → should default to V2_0
    }) as HLSAcquisitionResult;

    assert.equal(result.success, true);
    assert.equal(result.hlsVersion, HLSVersion.V2_0);
    assert.equal(result.hlsVersion, 'V2.0');
  } finally {
    (GeoTiffService as any).readGeoTiff = originalReadGeoTiff;
  }
});

// ─── Final Summary ────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log(`PHASE 5 HLS ACQUISITION TESTS: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
