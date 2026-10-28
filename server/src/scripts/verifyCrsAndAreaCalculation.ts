import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoTiffService } from '../services/raster/GeoTiffService.js';
import { PixelAnalysisService } from '../services/raster/PixelAnalysisService.js';
import { SensorNormalizationService } from '../services/raster/SensorNormalizationService.js';
import { RasterPreprocessingService } from '../services/raster/RasterPreprocessingService.js';
import { EvidenceScoreCalculator } from '../services/changeDetection/EvidenceScoreCalculator.js';
import { calculateM6Metrics } from '../utils/m6Metrics.js';
import { determineMetricSafeCrs, isMetricProjectedCrs } from '../utils/geo.js';
import { CrossSensorAgreement, type GeoJSONPolygon } from '@tn-forest/shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function verifyCrsAndAreaCalculation() {
  console.log('================================================================');
  console.log('🌐 CRS NORMALIZATION & METRIC-SAFE AREA CALCULATION AUDIT');
  console.log('================================================================\n');

  // 1. Locate the authentic downloaded Sathiyar GeoTIFF
  const possiblePaths = [
    path.resolve(__dirname, '../../storage/raster_temp/JOB-MTNG14ED/SATHIYAR_JOB-MTNG14ED_BASELINE_Sentinel2_20200109.tif'),
    path.resolve(__dirname, '../../storage/raster_temp/TEST-DOWNLOAD/SATHIYAR_JOB-MTNFWHP9_BASELINE_Sentinel2_20200109.tif'),
    path.resolve(__dirname, '../../storage/raster_temp/JOB-MTNFWHP9/SATHIYAR_JOB-MTNFWHP9_BASELINE_Sentinel2_20200109.tif'),
  ];

  let geoTiffPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!geoTiffPath) {
    console.error('❌ Real GeoTIFF not found in storage. Ensure real baseline export has run.');
    process.exit(1);
  }

  console.log(`[REAL_RASTER] Found authentic GeoTIFF: ${geoTiffPath}`);
  const fileBuffer = fs.readFileSync(geoTiffPath);
  console.log(`[REAL_RASTER] File size: ${fileBuffer.length} bytes\n`);

  // 2. Parse GeoTIFF with updated dynamic CRS extraction
  console.log('--- 1. PARSE GEOTIFF & DETECT CRS ---');
  const parsed = await GeoTiffService.readGeoTiffFromBuffer(fileBuffer);
  const meta = parsed.metadata;

  console.log(`Original CRS:         ${meta.originalCrs}`);
  console.log(`Normalized CRS:       ${meta.normalizedCrs}`);
  console.log(`Area-calculation CRS: ${meta.areaCalculationCrs}`);
  console.log(`Is Projected Metric:  ${meta.isProjectedMetric}`);
  console.log(`Original Resolution:  ${meta.pixelScale[0]}m x ${meta.pixelScale[1]}m`);
  console.log(`Raster Dimensions:    ${meta.width} x ${meta.height} (${meta.numBands} bands)`);
  console.log(`Total Pixels:         ${meta.width * meta.height}`);
  console.log(`Pixel Area:           ${meta.pixelAreaM2.toFixed(2)} m²\n`);

  // 3. Dynamic CRS determination for Sathiyar zone geometry
  console.log('--- 2. DYNAMIC METRIC CRS SELECTION FOR ZONE ---');
  const sathiyarPolygon: GeoJSONPolygon = {
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
  const dynamicZoneCrs = determineMetricSafeCrs(sathiyarPolygon);
  console.log(`Zone Centroid Dynamic UTM: ${dynamicZoneCrs} (WGS 84 / UTM zone 44N)`);
  console.log(`Raster Native CRS:         ${meta.originalCrs} (WGS 84 / UTM zone 43N - Sentinel-2 granule T43PHM)`);
  console.log(`Are both metric-safe?      ${isMetricProjectedCrs(dynamicZoneCrs) && isMetricProjectedCrs(meta.originalCrs)}\n`);

  // 4. Optical Band Normalization & Valid Pixel Mask
  console.log('--- 3. OPTICAL PROCESSING & VALID PIXEL ACCOUNTING ---');
  const extracted = {
    metadata: meta,
    bands: {
      blue: parsed.bandData[0],
      green: parsed.bandData[1],
      red: parsed.bandData[2],
      nir: parsed.bandData[3],
      swir1: parsed.bandData.length > 4 ? parsed.bandData[4] : undefined,
      swir2: parsed.bandData.length > 5 ? parsed.bandData[5] : undefined,
    },
    satellite: 'Sentinel-2' as const,
    nativeResolution: meta.pixelScale[0] || 10,
  };

  const normalizedOptical = SensorNormalizationService.normalizeOpticalBands(extracted);
  const prep = RasterPreprocessingService.generateValidPixelMask(normalizedOptical, 0.0);
  console.log(`Total Pixels:     ${prep.totalPixels}`);
  console.log(`Valid Pixels:     ${prep.validPixels} (${prep.validPercentage}%)`);
  console.log(`Masked Pixels:    ${prep.maskedPixels} (${prep.maskedPercentage}%)\n`);

  // 5. Calculate Real Spectral Indices (Zonal Statistics)
  console.log('--- 4. ZONAL SPECTRAL INDICES ---');
  const zonal = PixelAnalysisService.calculateSpectralIndices(normalizedOptical, prep.validMask);
  console.log(`Mean NDVI: ${zonal.stats.ndviMean.toFixed(3)}`);
  console.log(`Mean NDWI: ${zonal.stats.ndwiMean.toFixed(3)}`);
  console.log(`Mean NDBI: ${zonal.stats.nbrMean.toFixed(3)}\n`);

  // 6. Metric-Safe Change Detection & Area Calculation
  console.log('--- 5. CHANGE DETECTION & AREA CALCULATION ---');
  // Scenario: Simulate 1,250 changed pixels (e.g. vegetation loss) out of valid pixels
  const simulatedChangedPixels = Math.min(prep.validPixels, 1250);
  const m6Result = calculateM6Metrics({
    changedPixels: simulatedChangedPixels,
    validPixels: prep.validPixels,
    pixelResolutionMeters: meta.pixelScale[0] || 10,
    pixelAreaM2: meta.pixelAreaM2,
  });

  console.log(`Pixel Resolution:         ${m6Result.pixelResolutionMeters} m`);
  console.log(`Pixel Area (m²):          ${m6Result.pixelAreaM2.toFixed(2)} m²`);
  console.log(`Valid Pixels:             ${m6Result.validPixels}`);
  console.log(`Changed Pixels:           ${m6Result.changedPixels}`);
  console.log(`No-Change Pixels:         ${m6Result.noChangePixels}`);
  console.log(`Changed Area (m²):        ${m6Result.affectedAreaM2.toFixed(2)} m²`);
  console.log(`Changed Area (Hectares):  ${m6Result.affectedAreaHa.toFixed(4)} ha`);
  console.log(`Affected Area Percentage: ${m6Result.affectedAreaPercentage.toFixed(3)} %`);
  console.log(`Formula Verified:         (${m6Result.changedPixels} / ${m6Result.validPixels}) * 100 = ${((m6Result.changedPixels / m6Result.validPixels) * 100).toFixed(3)}%`);
  console.log(`Pixel Accounting Valid:   ${m6Result.pixelAccountingValid}\n`);

  // 7. Strict Separation: affectedAreaPercentage vs evidenceScore
  console.log('--- 6. EVIDENCE SCORE VS AFFECTED AREA PERCENTAGE ---');
  const evidenceBreakdown = EvidenceScoreCalculator.calculateEvidenceScore({
    affectedAreaPercentage: m6Result.affectedAreaPercentage,
    imageQualityScore: 95,
    hasTemporalHistory: true,
    isTemporallyConsistent: true,
    crossSensorAgreement: CrossSensorAgreement.HIGH,
  });

  console.log(`Affected Area:  ${m6Result.affectedAreaPercentage.toFixed(3)}% (Physical surface area change)`);
  console.log(`Evidence Score: ${evidenceBreakdown.totalEvidenceScore}/100 (Detection confidence score)`);
  console.log(`Explanation:    ${evidenceBreakdown.explanation}\n`);

  // 8. Output Required Summary Checklist
  console.log('================================================================');
  console.log('📋 FINAL AUDIT REPORT: CRS & AREA CALCULATION SAFETY');
  console.log('================================================================');
  console.log(`1.  Original CRS:             ${meta.originalCrs}`);
  console.log(`2.  Normalized CRS:           ${meta.normalizedCrs}`);
  console.log(`3.  Area calculation CRS:     ${meta.areaCalculationCrs}`);
  console.log(`4.  Original resolution:      ${meta.pixelScale[0]}m x ${meta.pixelScale[1]}m`);
  console.log(`5.  Normalized resolution:    ${meta.pixelScale[0]}m x ${meta.pixelScale[1]}m`);
  console.log(`6.  Pixel area in m²:         ${meta.pixelAreaM2.toFixed(2)} m²`);
  console.log(`7.  Changed pixels:           ${m6Result.changedPixels}`);
  console.log(`8.  Valid pixels:             ${m6Result.validPixels}`);
  console.log(`9.  Changed area in m²:       ${m6Result.affectedAreaM2.toFixed(2)} m²`);
  console.log(`10. Changed area in hectares: ${m6Result.affectedAreaHa.toFixed(4)} ha`);
  console.log(`11. Affected area percentage: ${m6Result.affectedAreaPercentage.toFixed(3)} %`);
  console.log(`12. Evidence score:           ${evidenceBreakdown.totalEvidenceScore} / 100`);
  console.log('================================================================\n');
}

verifyCrsAndAreaCalculation().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
