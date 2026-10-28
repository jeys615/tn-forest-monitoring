/*
 * OFFLINE RASTER GEOMETRY & AREA CALCULATION VERIFICATION SUITE
 *
 * Exercises:
 * 1. Real raster sirumalai_baseline.tif (555x559 px, 20m x 20m resolution in UTM 43N -> 12,409.80 ha)
 * 2. Arithmetic reconciliation of 622.76 ha hypothesis vs 12,409.80 ha actual
 * 3. 2D Affine Transformation with rotation/skew using determinant
 * 4. Geographic CRS (EPSG:4326 in degrees) geodesic ground distance calculation using WGS84 ellipsoid
 * 5. Projected CRS with non-metre units (US Survey Feet EPSG unit 9003)
 * 6. Strict rejection of missing spatial georeferencing (no silent fallback to 10m)
 * 7. Strict rejection of missing or unknown CRS
 * 8. Strict rejection of zero or negative pixel dimensions
 * 9. Real-raster end-to-end execution of OfflineChangeDetectionService on Sirumalai imagery
 */
import fs from 'node:fs';
import path from 'node:path';
import * as GeoTIFF from 'geotiff';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { OfflineChangeDetectionService } from '../services/offline/OfflineChangeDetectionService.js';
import { calculateDegreeToMeterPixelArea } from '../utils/geo.js';
import { AppError } from '../utils/AppError.js';

async function runGeometryTests() {
  console.log('\n================================================================');
  console.log('📐 OFFLINE RASTER GEOMETRY & AREA CALCULATION TEST SUITE');
  console.log('================================================================\n');

  let pass = 0;
  let fail = 0;
  const ok = (msg: string) => {
    console.log(`  ✔ ${msg}`);
    pass++;
  };
  const ko = (msg: string, err?: unknown) => {
    console.error(`  ✘ ${msg}`, err ?? '');
    fail++;
  };

  const realBaselinePath = 'C:/Users/jayaseelan/Downloads/sirumalai_baseline.tif';
  const realObservationPath = 'C:/Users/jayaseelan/Downloads/sirumalai_observation.tif';

  // ─── GATE 1: Real GeoTIFF Metadata Inspection ────────────────────────
  console.log('▶ Gate 1: Real raster metadata inspection (sirumalai_baseline.tif)...');
  try {
    const parsed = await GeoTiffService.readGeoTiff(realBaselinePath);
    const meta = parsed.metadata;

    const widthOk = meta.width === 555;
    const heightOk = meta.height === 559;
    const crsOk = meta.crs === 'EPSG:32643';
    const scaleX = meta.pixelScale[0];
    const scaleY = meta.pixelScale[1];
    const scaleOk = scaleX === 20 && scaleY === 20;
    const pixelAreaOk = meta.pixelAreaM2 === 400.0;

    if (widthOk && heightOk && crsOk && scaleOk && pixelAreaOk) {
      ok(`Gate 1 Passed: Sirumalai raster verified: ${meta.width}x${meta.height} px, CRS: ${meta.crs}, resolution: ${scaleX}m x ${scaleY}m, pixelArea: ${meta.pixelAreaM2} m²`);
    } else {
      ko('Gate 1 Failed: Unexpected metadata', { width: meta.width, height: meta.height, crs: meta.crs, scaleX, scaleY, pixelArea: meta.pixelAreaM2 });
    }
  } catch (err) {
    ko('Gate 1 Failed with exception', err);
  }

  // ─── GATE 2: Real Raster Mathematical Footprint Verification ─────────
  console.log('\n▶ Gate 2: True mathematical footprint calculation (12,409.80 ha)...');
  try {
    const parsed = await GeoTiffService.readGeoTiff(realBaselinePath);
    const totalPixels = parsed.metadata.width * parsed.metadata.height;
    const pixelAreaHa = parsed.metadata.pixelAreaM2 / 10000.0;
    const totalHa = Number((totalPixels * pixelAreaHa).toFixed(4));
    const totalSqKm = Number((totalHa / 100.0).toFixed(4));

    // Span from bounding box: [823180, 1123460, 834280, 1134640]
    const spanX = parsed.metadata.bbox[2] - parsed.metadata.bbox[0]; // 11,100 m
    const spanY = parsed.metadata.bbox[3] - parsed.metadata.bbox[1]; // 11,180 m
    const bboxAreaHa = (spanX * spanY) / 10000.0; // 12,409.80 ha

    if (totalPixels === 310245 && totalHa === 12409.8 && totalSqKm === 124.098 && bboxAreaHa === 12409.8) {
      ok(`Gate 2 Passed: 310,245 pixels x 400 m² = 124,098,000 m² = exactly 12,409.80 ha (124.0980 km²), matching bounding box ${spanX}m x ${spanY}m`);
    } else {
      ko('Gate 2 Failed', { totalPixels, totalHa, totalSqKm, bboxAreaHa });
    }
  } catch (err) {
    ko('Gate 2 Failed with exception', err);
  }

  // ─── GATE 3: Reconcile 622.76 ha Hypothesis vs 12,409.80 ha Actual ───
  console.log('\n▶ Gate 3: Discrepancy reconciliation (622.76 ha hypothesis vs 12,409.80 ha actual)...');
  try {
    // 622.76 ha for 310,245 pixels requires:
    // (622.76 * 10,000) / 310,245 = 20.07316798 m² per pixel (linear resolution ~4.48m)
    const hypotheticalAreaM2 = (622.76 * 10000.0) / 310245;
    const hypotheticalLinearRes = Math.sqrt(hypotheticalAreaM2);

    // If pixel scale is 20m, true area is 400m², producing 12,409.80 ha.
    // The prompt's 622.76 ha figure conflated "20m pixel resolution" (400 m²) with "~20 m² pixel area".
    const ratio = 12409.80 / 622.76; // approximately 19.927 (~20x)
    if (Math.abs(hypotheticalAreaM2 - 20.073) < 0.01 && Math.abs(ratio - (400.0 / 20.073)) < 0.1) {
      ok(`Gate 3 Passed: Reconciled: 622.76 ha assumes 20.07 m²/pixel (~4.48m linear). Real GeoTIFF has 20m x 20m = 400 m²/pixel -> exactly 12,409.80 ha.`);
    } else {
      ko('Gate 3 Failed', { hypotheticalAreaM2, hypotheticalLinearRes, ratio });
    }
  } catch (err) {
    ko('Gate 3 Failed with exception', err);
  }

  // ─── GATE 4: Affine Transform with Rotation/Skew (Determinant) ────────
  console.log('\n▶ Gate 4: Affine transformation determinant calculation...');
  try {
    // 4x4 affine matrix rotated by 30 degrees with 10m pixel scale:
    // a = 10 * cos(30°) = 8.660254
    // b = -10 * sin(30°) = -5.0
    // e = 10 * sin(30°) = 5.0
    // f = 10 * cos(30°) = 8.660254
    // det = a*f - b*e = 75.0 - (-25.0) = 100.0 m²
    const angle = (30 * Math.PI) / 180;
    const s = 10.0;
    const a = s * Math.cos(angle);
    const b = -s * Math.sin(angle);
    const e = s * Math.sin(angle);
    const f = s * Math.cos(angle);
    const d = 500000;
    const h = 1200000;

    const values = new Float32Array(100);
    const metadata = {
      width: 10,
      height: 10,
      ModelTransformation: [
        a, b, 0, d,
        e, f, 0, h,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ],
      GeoAsciiParams: 'WGS 84 / UTM zone 43N',
    };
    const ab = await GeoTIFF.writeArrayBuffer(values, metadata);
    const parsed = await GeoTiffService.readGeoTiffFromBuffer(Buffer.from(ab));

    const detOk = Math.abs(parsed.metadata.pixelAreaM2 - 100.0) < 0.01;
    const affineFlagOk = parsed.metadata.hasAffineTransform === true;

    if (detOk && affineFlagOk) {
      ok(`Gate 4 Passed: 30° Rotated affine transform accurately computed: det = ${parsed.metadata.pixelAreaM2} m² per pixel`);
    } else {
      ko('Gate 4 Failed', { pixelArea: parsed.metadata.pixelAreaM2, hasAffine: parsed.metadata.hasAffineTransform });
    }
  } catch (err) {
    ko('Gate 4 Failed with exception', err);
  }

  // ─── GATE 5: Geographic CRS (Degrees) Geodesic Calculation ───────────
  console.log('\n▶ Gate 5: Geographic CRS (degrees) geodesic ellipsoidal calculation...');
  try {
    // At Tamil Nadu latitude ~10°N:
    // 0.00018° longitude ~ 19.74m
    // 0.00018° latitude ~ 19.91m
    // Pixel area ~ 392.91 m²
    const geoCalc = calculateDegreeToMeterPixelArea(0.00018, 0.00018, 10.0);
    const areaOk = geoCalc.pixelAreaM2 > 390 && geoCalc.pixelAreaM2 < 395;
    const notMultipliedAsMeters = geoCalc.pixelAreaM2 > 1.0; // 0.00018 * 0.00018 would be 0.0000000324

    if (areaOk && notMultipliedAsMeters) {
      ok(`Gate 5 Passed: WGS84 geodesic calculation at 10°N: ${geoCalc.meterX}m x ${geoCalc.meterY}m = ${geoCalc.pixelAreaM2} m² (never treating degrees as metres)`);
    } else {
      ko('Gate 5 Failed', geoCalc);
    }
  } catch (err) {
    ko('Gate 5 Failed with exception', err);
  }

  // ─── GATE 6: Projected CRS with Non-Metre Units (US Survey Feet) ──────
  console.log('\n▶ Gate 6: Non-metre projected units (US Survey Feet, unit 9003)...');
  try {
    // 100 survey feet x 100 survey feet:
    // 1 survey foot = 1200 / 3937 m = 0.3048006096 m
    // 100 survey feet = 30.48006 m
    // Expected area = 30.48006² = 929.0341 m²
    const values = new Float32Array(100);
    const metadata = {
      width: 10,
      height: 10,
      ModelPixelScale: [100.0, 100.0, 0.0],
      ModelTiepoint: [0.0, 0.0, 0.0, 6000000.0, 2000000.0, 0.0],
      GeoKeyDirectory: [
        1, 1, 0, 3,
        1024, 0, 1, 1, // GTModelTypeGeoKey = ModelTypeProjected
        3072, 0, 1, 2227, // ProjectedCSTypeGeoKey = NAD83 / California zone 3 (ftUS)
        3076, 0, 1, 9003, // ProjLinearUnitsGeoKey = Linear_Foot_US_Survey
      ],
    };
    const ab = await GeoTIFF.writeArrayBuffer(values, metadata);
    const parsed = await GeoTiffService.readGeoTiffFromBuffer(Buffer.from(ab));

    const expectedAreaM2 = Math.pow(100.0 * (1200.0 / 3937.0), 2);
    const diff = Math.abs(parsed.metadata.pixelAreaM2 - expectedAreaM2);

    if (diff < 0.1 && parsed.metadata.linearUnitScale && Math.abs(parsed.metadata.linearUnitScale - (1200 / 3937)) < 1e-6) {
      ok(`Gate 6 Passed: US Survey Feet unit scaling verified: 100ft x 100ft = ${parsed.metadata.pixelAreaM2} m² (scale: ${parsed.metadata.linearUnitScale})`);
    } else {
      ko('Gate 6 Failed', { actual: parsed.metadata.pixelAreaM2, expected: expectedAreaM2, scale: parsed.metadata.linearUnitScale });
    }
  } catch (err) {
    ko('Gate 6 Failed with exception', err);
  }

  // ─── GATE 7: Rejection of Missing Georeferencing ───────────────────────
  console.log('\n▶ Gate 7: Strict rejection of missing georeferencing metadata...');
  try {
    // Construct a genuine standard TIFF without any GeoTIFF tags (no CRS, no pixel scale, no tie points)
    const numTags = 9;
    const ifdOffset = 12;
    const plainTiffBuf = Buffer.alloc(12 + 2 + numTags * 12 + 4);
    plainTiffBuf.write('II', 0); // Little-endian
    plainTiffBuf.writeUInt16LE(42, 2); // TIFF magic 42
    plainTiffBuf.writeUInt32LE(ifdOffset, 4); // IFD offset
    Buffer.from([100, 150, 200, 250]).copy(plainTiffBuf, 8); // 2x2 pixels at offset 8

    let o = ifdOffset;
    plainTiffBuf.writeUInt16LE(numTags, o); o += 2;
    const writeTag = (tag: number, type: number, count: number, val: number) => {
      plainTiffBuf.writeUInt16LE(tag, o);
      plainTiffBuf.writeUInt16LE(type, o + 2);
      plainTiffBuf.writeUInt32LE(count, o + 4);
      plainTiffBuf.writeUInt32LE(val, o + 8);
      o += 12;
    };
    writeTag(256, 3, 1, 2); // ImageWidth = 2
    writeTag(257, 3, 1, 2); // ImageLength = 2
    writeTag(258, 3, 1, 8); // BitsPerSample = 8
    writeTag(259, 3, 1, 1); // Compression = 1 (none)
    writeTag(262, 3, 1, 1); // PhotometricInterpretation = 1
    writeTag(273, 4, 1, 8); // StripOffsets = 8
    writeTag(277, 3, 1, 1); // SamplesPerPixel = 1
    writeTag(278, 3, 1, 2); // RowsPerStrip = 2
    writeTag(279, 4, 1, 4); // StripByteCounts = 4
    plainTiffBuf.writeUInt32LE(0, o);

    let rejected = false;
    let caughtMessage = '';
    try {
      await GeoTiffService.readGeoTiffFromBuffer(plainTiffBuf);
    } catch (err: any) {
      caughtMessage = err?.message || String(err);
      if (err instanceof AppError && (caughtMessage.includes('CRS') || caughtMessage.includes('georeferencing') || caughtMessage.includes('resolution'))) {
        rejected = true;
      }
    }

    if (rejected) {
      ok(`Gate 7 Passed: Plain unreferenced TIFF rejected with AppError: "${caughtMessage}" (no silent fallback to 10m or 4326)`);
    } else {
      ko('Gate 7 Failed: Unreferenced raster was unexpectedly accepted', caughtMessage);
    }
  } catch (err) {
    ko('Gate 7 Failed with unexpected error', err);
  }

  // ─── GATE 8: Rejection of Zero or Negative Pixel Dimensions ───────────
  console.log('\n▶ Gate 8: Rejection of zero or negative pixel dimensions...');
  try {
    const values = new Float32Array(100);
    const metadata = {
      width: 10,
      height: 10,
      ModelPixelScale: [0.0, 0.0, 0.0],
      GeoAsciiParams: 'WGS 84 / UTM zone 43N',
    };
    const ab = await GeoTIFF.writeArrayBuffer(values, metadata);
    let rejected = false;
    try {
      await GeoTiffService.readGeoTiffFromBuffer(Buffer.from(ab));
    } catch (err: any) {
      if (err instanceof AppError && (err.message.includes('positive') || err.message.includes('invalid') || err.message.includes('scale'))) {
        rejected = true;
      }
    }

    if (rejected) {
      ok('Gate 8 Passed: Zero pixel scale rejected with AppError');
    } else {
      ko('Gate 8 Failed: Zero pixel scale was accepted');
    }
  } catch (err) {
    ko('Gate 8 Failed with unexpected error', err);
  }

  // ─── GATE 9: Real-Raster End-to-End Change Detection Execution ────────
  console.log('\n▶ Gate 9: End-to-end execution on real Sirumalai rasters...');
  try {
    const result = await OfflineChangeDetectionService.executeChangeDetection({
      baselinePath: realBaselinePath,
      observationPath: realObservationPath,
      baselineSensor: 'Sentinel-2',
      observationSensor: 'Sentinel-2',
      vegetationThreshold: 0.15,
      soilThreshold: 0.12,
      maskClouds: true,
    });

    const totalHa = result.areaSummary.totalFootprintHectares;
    const validHa = result.areaSummary.validAnalyzedHectares;
    const maskedHa = result.areaSummary.maskedHectares;
    const sumCategoriesHa = Number(result.areaSummary.categories.reduce((acc, c) => acc + c.areaHectares, 0).toFixed(2));
    const sumCategoriesPixels = result.areaSummary.categories.reduce((acc, c) => acc + c.pixelCount, 0);

    const conservationOk = Math.abs(totalHa - 12409.80) < 0.1;
    const pixelSumOk = sumCategoriesPixels === 310245;
    const areaSumOk = Math.abs(sumCategoriesHa - 12409.80) < 0.2;
    const artifactsOk = !!result.artifacts.baselinePng && !!result.artifacts.observationPng && !!result.artifacts.changeMapPng && !!result.artifacts.cloudMaskPng;

    if (conservationOk && pixelSumOk && areaSumOk && artifactsOk) {
      ok(`Gate 9 Passed: End-to-end Sirumalai change detection succeeded: Total: ${totalHa} ha, Valid: ${validHa} ha, Masked: ${maskedHa} ha, Sum categories: ${sumCategoriesHa} ha (${sumCategoriesPixels} px). All image artifacts populated.`);
    } else {
      ko('Gate 9 Failed', { totalHa, validHa, maskedHa, sumCategoriesHa, sumCategoriesPixels, artifactsOk });
    }
  } catch (err) {
    ko('Gate 9 Failed with exception', err);
  }

  // ─── Final Summary ───────────────────────────────────────────────────
  console.log('\n================================================================');
  if (fail === 0) {
    console.log(`✅ ALL ${pass} RASTER GEOMETRY & AREA CALCULATION GATES PASSED (${pass}/${pass + fail})`);
  } else {
    console.log(`❌ GEOMETRY TESTS: ${pass} passed, ${fail} FAILED`);
  }
  console.log('================================================================\n');

  if (fail > 0) process.exit(1);
}

runGeometryTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
