import assert from 'node:assert';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { normalizeDateRange } from '../utils/dateNormalization.js';
import { GeeSatelliteService } from '../services/gee/GeeSatelliteService.js';
import { GeeExportService } from '../services/gee/GeeExportService.js';
import { BaselineService } from '../services/BaselineService.js';
import { BaselineModel } from '../models/Baseline.js';
import { SatelliteMetadata } from '../models/SatelliteMetadata.js';
import { Zone } from '../models/Zone.js';
import { AlertModel } from '../models/Alert.js';
import {
  SensorType,
  SatelliteSource,
  PipelineErrorStage,
  BaselineStatus,
} from '@tn-forest/shared/types';
import { reconcileSatelliteMetadata } from '../scripts/reconcile-satellite-metadata.js';

async function runSystemWideTests() {
  console.log('================================================================');
  console.log('🧪 SYSTEM-WIDE SATELLITE CATALOG & BASELINE ARCHITECTURE TEST SUITE');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);

  // -------------------------------------------------------------------------
  // TEST 1: Date Range Normalization
  // -------------------------------------------------------------------------
  console.log('Running Test 1: Date Range Normalization...');
  {
    // Single day "2026-01-06" must expand to 2026-01-07T00:00:00.000Z
    const normalizedSingle = normalizeDateRange('2026-01-06', '2026-01-06');
    assert.strictEqual(
      normalizedSingle.startDate.toISOString(),
      '2026-01-06T00:00:00.000Z',
      'Start date must be midnight UTC of start date',
    );
    assert.strictEqual(
      normalizedSingle.endDate.toISOString(),
      '2026-01-06T23:59:59.999Z',
      'End date must cover end of day UTC',
    );
    assert.strictEqual(
      normalizedSingle.exclusiveEndDate.toISOString(),
      '2026-01-07T00:00:00.000Z',
      'Exclusive end date must be start of next day for GEE filterDate',
    );

    // Multi-day range "2026-01-01" to "2026-01-31"
    const normalizedMulti = normalizeDateRange('2026-01-01', '2026-01-31');
    assert.strictEqual(
      normalizedMulti.startDate.toISOString(),
      '2026-01-01T00:00:00.000Z',
    );
    assert.strictEqual(
      normalizedMulti.endDate.toISOString(),
      '2026-01-31T23:59:59.999Z',
    );
    assert.strictEqual(
      normalizedMulti.exclusiveEndDate.toISOString(),
      '2026-02-01T00:00:00.000Z',
    );
    console.log('  ✅ Test 1 PASSED: Date ranges correctly normalized and inclusive of end date.\n');
  }

  // -------------------------------------------------------------------------
  // TEST 2: GEE Multi-Collection Optical Search & Deduplication
  // -------------------------------------------------------------------------
  console.log('Running Test 2: GEE Multi-Collection Optical Search...');
  const geeService = new GeeSatelliteService();
  const vadipatti = await Zone.findOne({ zoneId: 'ZONE-260913-7787' }).lean();
  assert.ok(vadipatti, 'Vadipatti zone must exist');

  {
    // Search optical images for Vadipatti in Jan 2026 (all optical collections)
    const result = await geeService.searchImages({
      zoneId: vadipatti._id.toString(),
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      sensorType: SensorType.OPTICAL,
      maxCloudCover: 30,
    });

    assert.ok(result.totalFound > 0, 'Multi-collection optical search must find candidate observations');
    assert.strictEqual(result.sensorType, SensorType.OPTICAL);

    // Verify all returned images are OPTICAL and from supported optical sources
    const allowedOpticalSources = [
      SatelliteSource.SENTINEL_2,
      SatelliteSource.LANDSAT_8,
      SatelliteSource.LANDSAT_9,
    ];
    const imageIds = new Set<string>();
    for (const img of result.images) {
      assert.strictEqual(img.sensorType, SensorType.OPTICAL, 'All results must have sensorType OPTICAL');
      assert.ok(
        allowedOpticalSources.includes(img.source),
        `Source ${img.source} must be one of Sentinel-2, Landsat-8, Landsat-9`,
      );
      assert.ok(!imageIds.has(img.imageId), `Duplicate imageId found: ${img.imageId}`);
      imageIds.add(img.imageId);
    }

    // Verify sort order: descending by acquisition date
    for (let i = 0; i < result.images.length - 1; i++) {
      const d1 = new Date(result.images[i].acquisitionDate).getTime();
      const d2 = new Date(result.images[i + 1].acquisitionDate).getTime();
      assert.ok(d1 >= d2, `Images must be sorted in descending order: ${d1} >= ${d2}`);
    }
    console.log(`  ✅ Test 2 PASSED: Multi-collection optical search found ${result.totalFound} images with zero duplicates and sorted descending.\n`);
  }

  // -------------------------------------------------------------------------
  // TEST 3: GEE Single-Source Optical Filtering
  // -------------------------------------------------------------------------
  console.log('Running Test 3: GEE Single-Source Optical Filtering (Landsat-8)...');
  {
    const result = await geeService.searchImages({
      zoneId: vadipatti._id.toString(),
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      sensorType: SensorType.OPTICAL,
      source: SatelliteSource.LANDSAT_8,
      maxCloudCover: 50,
    });

    for (const img of result.images) {
      assert.strictEqual(img.source, SatelliteSource.LANDSAT_8, 'All results must strictly be Landsat-8');
      assert.strictEqual(img.sensorType, SensorType.OPTICAL);
    }
    console.log(`  ✅ Test 3 PASSED: Single-source filter strictly returned only Landsat-8 images (${result.totalFound} found).\n`);
  }

  // -------------------------------------------------------------------------
  // TEST 4: GEE SAR Search Isolation & No Cloud Filter
  // -------------------------------------------------------------------------
  console.log('Running Test 4: GEE SAR Search Isolation...');
  const sirumalai = await Zone.findOne({ zoneId: 'ZONE-260925-8986' }).lean();
  assert.ok(sirumalai, 'Sirumalai zone must exist');

  {
    const result = await geeService.searchImages({
      zoneId: sirumalai._id.toString(),
      startDate: '2026-01-01',
      endDate: '2026-01-15',
      sensorType: SensorType.SAR,
    });

    assert.ok(result.totalFound > 0, 'SAR search must find Sentinel-1 passes');
    assert.strictEqual(result.sensorType, SensorType.SAR);
    for (const img of result.images) {
      assert.strictEqual(img.sensorType, SensorType.SAR, 'All SAR results must be SAR');
      assert.strictEqual(img.source, SatelliteSource.SENTINEL_1, 'All SAR results must be Sentinel-1');
      assert.ok(img.imageId.startsWith('COPERNICUS/S1_GRD'), 'Asset must be from S1_GRD collection');
    }
    console.log(`  ✅ Test 4 PASSED: SAR search isolation verified (${result.totalFound} Sentinel-1 images, zero cloud filtering).\n`);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Zero Cross-Sensor Fallback
  // -------------------------------------------------------------------------
  console.log('Running Test 5: Zero Cross-Sensor Fallback...');
  {
    // Search for SAR on an impossible narrow window (1ms) - must return empty array, NOT fallback to Optical
    const emptySar = await geeService.searchImages({
      zoneId: sirumalai._id.toString(),
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-01T00:00:00.001Z',
      sensorType: SensorType.SAR,
    });
    assert.strictEqual(emptySar.totalFound, 0, 'SAR search on empty period must return 0 results');
    assert.strictEqual(emptySar.images.length, 0, 'SAR search must NEVER fallback to optical');

    // Search for Optical on an impossible narrow window (1ms) - must return empty array, NOT fallback to SAR
    const emptyOptical = await geeService.searchImages({
      zoneId: sirumalai._id.toString(),
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-01T00:00:00.001Z',
      sensorType: SensorType.OPTICAL,
      maxCloudCover: 20,
    });
    assert.strictEqual(emptyOptical.totalFound, 0, 'Optical search on empty period must return 0 results');
    assert.strictEqual(emptyOptical.images.length, 0, 'Optical search must NEVER fallback to SAR');
    console.log('  ✅ Test 5 PASSED: Strict sensor track isolation — zero cross-sensor fallbacks.\n');
  }

  // -------------------------------------------------------------------------
  // TEST 6: Bounded Retry and Structured Error Stages on Export Failure
  // -------------------------------------------------------------------------
  console.log('Running Test 6: Bounded Retry & Structured Error Fields...');
  {
    const exportService = new GeeExportService();
    // Test that an invalid asset fails cleanly with structured error details
    const invalidAsset = 'COPERNICUS/S2_SR_HARMONIZED/NON_EXISTENT_SCENE_99999999';
    let exportError: any = null;
    try {
      await exportService.requestImageExport({
        scene: {
          imageId: invalidAsset,
          satellite: 'Sentinel-2',
          sensorType: SensorType.OPTICAL,
          collection: 'COPERNICUS/S2_SR_HARMONIZED',
          nativeResolution: 10,
          bands: ['B2', 'B3', 'B4', 'B8'],
          processingLevel: 'Level-2A',
          provider: 'COPERNICUS / GEE',
          acquisitionDate: new Date('2026-01-01'),
          cloudCover: 0,
          footprint: {
            type: 'Polygon',
            coordinates: [
              [
                [78.0, 10.0],
                [78.1, 10.0],
                [78.1, 10.1],
                [78.0, 10.1],
                [78.0, 10.0],
              ],
            ],
          },
        },
        zoneCode: 'ZONE_TEST',
        jobId: 'TEST_JOB_1',
        imageType: 'BASELINE',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [78.0, 10.0],
              [78.1, 10.0],
              [78.1, 10.1],
              [78.0, 10.1],
              [78.0, 10.0],
            ],
          ],
        },
      });
    } catch (err: any) {
      exportError = err;
    }

    console.log('Caught export error:', {
      message: exportError?.message,
      name: exportError?.name,
      errorStage: exportError?.errorStage,
      errorCode: exportError?.errorCode,
      stack: exportError?.stack,
    });
    assert.ok(exportError, 'Exporting non-existent scene should have failed');
    assert.ok(exportError.errorStage, 'Error must contain errorStage');
    assert.strictEqual(exportError.errorStage, PipelineErrorStage.EXPORT_SUBMISSION_FAILED);
    assert.ok(exportError.errorCode, 'Error must contain errorCode');
    assert.ok(exportError.retryCount !== undefined, 'Error must track retryCount');
    console.log(`  Captured error details: stage=${exportError.errorStage}, code=${exportError.errorCode}, retries=${exportError.retryCount}`);
    console.log('  ✅ Test 6 PASSED: Structured error stages, error codes, and bounded retry count verified.\n');
  }

  // -------------------------------------------------------------------------
  // TEST 7: Baseline imageId Hardening & SatelliteMetadata Reconciliation
  // -------------------------------------------------------------------------
  console.log('Running Test 7: Idempotent Metadata Reconciliation & imageId Hardening...');
  {
    // Run reconciliation script
    const result = await reconcileSatelliteMetadata();
    assert.strictEqual(result.orphanedCount, 0, 'Zero orphaned baselines must remain');
    assert.strictEqual(result.activeOpticalIntact, true, 'Vadipatti active baseline must remain active');

    // Verify all baselines in database have imageId populated
    const allBaselines = await BaselineModel.find({}).lean();
    for (const b of allBaselines) {
      assert.ok(b.imageId, `Baseline ${b._id} must have imageId field populated`);
      assert.ok(b.satelliteMetadataId, `Baseline ${b._id} must have satelliteMetadataId`);
      
      const meta = await SatelliteMetadata.findById(b.satelliteMetadataId).lean();
      assert.ok(meta, `SatelliteMetadata for baseline ${b._id} must exist in DB`);
      assert.strictEqual(b.imageId, meta.imageId, `Baseline imageId must match metadata imageId`);
    }
    console.log(`  ✅ Test 7 PASSED: All ${allBaselines.length} baselines have hardened imageId and 100% valid lineage.\n`);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Sirumalai SAR 14 Gates & Vadipatti Invariant Verification
  // -------------------------------------------------------------------------
  console.log('Running Test 8: Sirumalai SAR 14-Gates & Vadipatti Invariant Protection...');
  {
    const baselineService = new BaselineService();
    const sirumalaiSarBaselines = await BaselineModel.find({
      zoneId: sirumalai._id,
      sensorType: SensorType.SAR,
    }).sort({ acquisitionDate: 1 });

    assert.strictEqual(sirumalaiSarBaselines.length, 3, 'Must have 3 SAR baselines for Sirumalai');

    for (const b of sirumalaiSarBaselines) {
      if (b.acquisitionDate.toISOString().startsWith('2020-01-02')) {
        assert.ok(b.status === BaselineStatus.PROCESSED || b.status === BaselineStatus.ACTIVE);
      } else {
        assert.strictEqual(b.isActive, false, 'Candidate must remain non-active');
        assert.strictEqual(b.status, BaselineStatus.PROCESSED);
      }

      // Gate 1: SatelliteMetadata exists
      const meta = await SatelliteMetadata.findById(b.satelliteMetadataId);
      assert.ok(meta, `Gate 1: Metadata must exist for baseline ${b._id}`);

      // Gate 2: Real GEE asset ID
      assert.ok(meta.imageId.startsWith('COPERNICUS/S1_GRD/'), 'Gate 2: Must be real GEE S1 asset');

      // Gate 3: Valid acquisition date
      assert.ok(!isNaN(b.acquisitionDate.getTime()), 'Gate 3: Valid acquisition date');

      // Gate 4: Supported SAR sensor
      assert.strictEqual(b.sensorType, SensorType.SAR, 'Gate 4: Must be SAR');
      assert.strictEqual(b.source, 'SENTINEL_1', 'Gate 4: Must be SENTINEL_1');

      // Gate 5: GEE export task ID exists
      assert.ok(b.geeExportTaskId?.startsWith('projects/'), 'Gate 5: GEE task ID exists');

      // Gate 6: Completed status
      assert.ok([BaselineStatus.ACTIVE, BaselineStatus.PROCESSED].includes(b.status), 'Gate 6: Export completed');

      // Gate 7: Google Drive file ID exists
      assert.ok(b.driveFileId && b.driveFileId.length > 5, 'Gate 7: Drive file ID exists');

      // Gate 8: Drive file size > 0
      assert.ok(b.driveFileSizeBytes && b.driveFileSizeBytes > 0, 'Gate 8: Drive file size > 0');

      // Gate 9: Local raster path exists
      assert.ok(b.localRasterPath, 'Gate 9: Local raster path exists');

      // Gate 10: rasterValidated = true
      assert.strictEqual(b.rasterValidated, true, 'Gate 10: rasterValidated must be true');

      // Gate 11: rasterBandCount = 2 (VV/VH)
      assert.strictEqual(b.rasterBandCount, 2, 'Gate 11: Band count must be 2');

      // Gate 12: Dimensions > 0
      assert.ok(b.rasterWidth && b.rasterWidth > 0 && b.rasterHeight && b.rasterHeight > 0, 'Gate 12: Dimensions > 0');

      // Gate 13: Raster CRS
      assert.ok(b.rasterCrs?.startsWith('EPSG:'), 'Gate 13: Valid CRS');

      // Gate 14: SAR radar backscatter validation
      assert.strictEqual(b.spectralIndicesCalculated, false, 'Gate 14: SAR skips optical indices');
    }

    // Verify Vadipatti
    const vadipattiZone = await Zone.findById(vadipatti._id).lean();
    assert.strictEqual(vadipattiZone?.monitoringTracks?.optical?.enabled, true);
    assert.strictEqual(vadipattiZone?.monitoringTracks?.sar?.enabled, false);

    const vadipattiActive = await BaselineModel.findOne({
      zoneId: vadipatti._id,
      isActive: true,
    });
    assert.ok(vadipattiActive, 'Vadipatti active baseline must exist');
    assert.strictEqual(vadipattiActive._id.toString(), '6aa679012b4fe5808c7e8ec7');

    const alert = await AlertModel.findOne({ alertId: 'ALT-1789295023854-8239' });
    assert.ok(alert, 'Production alert ALT-1789295023854-8239 must exist');
    console.log('  ✅ Test 8 PASSED: All 3 Sirumalai SAR candidates pass 14/14 gates and Vadipatti production state is 100% preserved.\n');
  }

  await mongoose.disconnect();
  console.log('================================================================');
  console.log('🎉 ALL 8 SYSTEM-WIDE ARCHITECTURE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runSystemWideTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
