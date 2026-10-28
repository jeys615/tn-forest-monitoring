```javascript
/**
 * =================================================================================================
 * TAMIL NADU FOREST ENFORCEMENT & MONITORING SYSTEM
 * DUAL-RESULT GOOGLE EARTH ENGINE (GEE) INDEPENDENT VALIDATION SCRIPT (CORRECTED)
 * =================================================================================================
 *
 * Source of Truth: PRODUCTION_OPTICAL_ALGORITHM_FORENSIC_REPORT.md
 * Target Case: Record CHG-1791696357291-3501 (_id: 6acb1de59ee540ec5f7060de)
 * Zone: ZONE-261011-6340 (Sirumalai / 'test zone 57')
 *
 * PURPOSE:
 * Compare two independent pipelines on the canonical analysis grid:
 *   A. LEGACY REPRODUCTION (Diagnostic of production code anomaly):
 *      - Replicates OpticalPixelIndexService.ts:80 branch decision condition (maxVal > 15000):
 *        * Baseline: clamp(DN * 0.0000275 - 0.2, 0.0, 1.0) [Landsat formula branch anomaly]
 *        * Current:  clamp(DN * 0.0001, 0.0, 1.0)          [Sentinel-2 formula branch]
 *      - Evaluates whether this code branch reproduces the reported near-zero baseline NDVI
 *        and the reported 3,774 changed pixels (0.1231%) without forcing any output.
 *
 *   B. SCIENTIFICALLY CORRECTED COMPARISON:
 *      - Applies authoritative Sentinel-2 L2A scaling consistently to BOTH scenes:
 *        * Baseline: clamp(DN * 0.0001, 0.0, 1.0)
 *        * Current:  clamp(DN * 0.0001, 0.0, 1.0)
 *      - Evaluated on the identical grid and validity mask to isolate reflectance calibration.
 *
 * CORRECTIONS APPLIED IN THIS VERSION:
 * 1. Safe NDVI Denominator Handling: Replaced denominators <= 1e-6 with 1.0 before division
 *    to prevent GEE from unintentionally masking zero-reflectance pixels where production assigns NDVI = 0.
 * 2. Raw Reducer Output Dictionaries: Prints raw reduction output dictionaries before accessing
 *    values, and uses multi-key safe extraction to eliminate key-naming assumptions.
 * 3. Bilinear Continuous vs. Discrete Categorical Resampling: Continuous reflectance bands use
 *    resample('bilinear') while zone boundary and validity masks remain discrete nearest-neighbor.
 * 4. Dynamic Live Metadata & NIR Peak Audit: Measures live maximum NIR DN values across the grid
 *    to verify whether maxVal > 15000 triggers in online GEE assets.
 * 5. Dynamic Grid & Area Accounting: Dynamic calculation of valid and changed areas from 10m grid
 *    geometry without hardcoded 100 ha scalar.
 * =================================================================================================
 */

// ─── 1. MONITORED ZONE POLYGON GEOMETRY ──────────────────────────────────────────────────────────
var zoneCoords = [
  [77.9894489403392, 10.299362275406638],
  [77.91732345319646, 10.238635598046182],
  [77.93174855062499, 10.148873794825437],
  [77.95853801727802, 10.13132342563887],
  [77.95922492667938, 10.112421953733723],
  [78.06569588389009, 10.127273203956566],
  [78.11996172659744, 10.167098159692666],
  [78.11309263258389, 10.199494462762104],
  [78.03547187023025, 10.280470781358266],
  [77.9894489403392, 10.299362275406638]
];

var zonePolygon = ee.Geometry.Polygon([zoneCoords], 'EPSG:4326', false);

// ─── 2. PRODUCTION CANONICAL ANALYSIS GRID SPECIFICATION ─────────────────────────────────────────
// EPSG:32643 (UTM Zone 43N)
// Origin: Top-Left [X0 = 819510 m, Y0 = 1140140 m]
// Dimensions: 2251 cols x 2093 rows (Width: 819510 to 842020 m, Height: 1119210 to 1140140 m)
// GDAL Affine Transform: [819510, 10, 0, 1140140, 0, -10]
// GEE crsTransform: [xScale, xShear, xOrigin, yShear, yScale, yOrigin]
var crs = 'EPSG:32643';
var crsTransform = [10, 0, 819510, 0, -10, 1140140];
var gridEnvelope = ee.Geometry.Rectangle([819510, 1119210, 842020, 1140140], 'EPSG:32643', false);

// ─── 3. LOAD SOURCE ASSETS & VERIFY DYNAMIC METADATA ─────────────────────────────────────────────
var baselineId = 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM';
var currentId  = 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM';

var rawBase = ee.Image(baselineId);
var rawCur  = ee.Image(currentId);

// Dynamically extract metadata from Earth Engine headers
function extractDynamicMetadata(img, label) {
  var timeStart = ee.Date(img.get('system:time_start'));
  var timeEnd = ee.Date(img.get('system:time_end'));
  var b4Proj = img.select('B4').projection();
  return ee.Dictionary({
    'Asset Label': label,
    'Asset ID': img.id(),
    'Spacecraft': img.get('SPACECRAFT_NAME'),
    'system:time_start (UTC)': timeStart.format('YYYY-MM-dd HH:mm:ss.SSS'),
    'system:time_start (Epoch ms)': img.get('system:time_start'),
    'system:time_end (UTC)': timeEnd.format('YYYY-MM-dd HH:mm:ss.SSS'),
    'Datatake Identifier': img.get('DATATAKE_IDENTIFIER'),
    'Granule Identifier': img.get('GRANULE_ID'),
    'MGRS Tile': img.get('MGRS_TILE'),
    'Cloud Coverage Assessment (%)': img.get('CLOUDY_PIXEL_PERCENTAGE'),
    'Native Projection CRS': b4Proj.crs(),
    'Native Nominal Scale (m)': b4Proj.nominalScale(),
    'Band Names': img.bandNames()
  });
}

var baseMeta = extractDynamicMetadata(rawBase, 'Baseline Asset (2020)');
var curMeta  = extractDynamicMetadata(rawCur, 'Current Asset (2024)');

// ─── 4. NIR PEAK REFLECTANCE AUDIT (INVESTIGATING maxVal > 15000) ────────────────────────────────
// The production code routed Sentinel-2 to Landsat scaling if maxVal in NIR exceeded 15,000.
// We measure the live peak raw NIR DN across the canonical analysis grid.
var baseMaxNir = rawBase.select('B8').reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
}).get('B8');

var curMaxNir = rawCur.select('B8').reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
}).get('B8');

// ─── 5. RASTER RESAMPLING & CANONICAL GRID HARMONIZATION ─────────────────────────────────────────
// Production OpticalSpatialHarmonizationService.reprojectOpticalToGrid applies continuous
// sub-pixel bilinear interpolation to continuous reflectance bands.
var opticalBands = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];

var harmonizedBase = rawBase.select(opticalBands)
  .resample('bilinear')
  .reproject({
    crs: crs,
    crsTransform: crsTransform
  });

var harmonizedCur = rawCur.select(opticalBands)
  .resample('bilinear')
  .reproject({
    crs: crs,
    crsTransform: crsTransform
  });

// ─── 6. PRODUCTION VALIDITY & BOUNDARY MASKS (NEAREST-NEIGHBOR DISCRETE) ─────────────────────────
// Categorical and boundary masks remain discrete nearest-neighbor (NO bilinear smoothing).
// Vector polygon boundary mask:
var zoneMask = ee.Image(0).paint({
  featureCollection: ee.FeatureCollection([ee.Feature(zonePolygon)]),
  color: 1
}).reproject({
  crs: crs,
  crsTransform: crsTransform
});

// Production Fallback Radiometric Quality Rule:
// Valid iff NOT all 4 bands (B2, B3, B4, B8) are zero, and valid source data exists.
function getProductionRadiometricMask(reprojectedContinuousImg) {
  var b2 = reprojectedContinuousImg.select('B2');
  var b3 = reprojectedContinuousImg.select('B3');
  var b4 = reprojectedContinuousImg.select('B4');
  var b8 = reprojectedContinuousImg.select('B8');

  var notAllZero = b2.neq(0).or(b3.neq(0)).or(b4.neq(0)).or(b8.neq(0));
  var hasData = b2.mask().and(b3.mask()).and(b4.mask()).and(b8.mask());

  return notAllZero.and(hasData);
}

var baseValid = getProductionRadiometricMask(harmonizedBase);
var curValid  = getProductionRadiometricMask(harmonizedCur);

// Combined valid comparison mask (Zone Boundary && Baseline Valid && Current Valid)
var validComparisonMask = zoneMask.eq(1)
  .and(baseValid)
  .and(curValid)
  .rename('valid_mask');

// ─── 7. SAFE PRODUCTION NDVI CALCULATION ─────────────────────────────────────────────────────────
// Production formula:
//   const ndviDenom = nir + red;
//   const ndviVal = ndviDenom > 1e-6 ? (nir - red) / ndviDenom : 0.0;
//   ndvi[i] = Math.max(-1.0, Math.min(1.0, ndviVal));
//
// GEE Safety Guard:
// In Earth Engine, numer.divide(denom) when denom == 0 automatically masks the pixel.
// Since .where() cannot unmask already-masked pixels, we replace denom <= 1e-6 with 1.0
// before division, then assign 0.0 where denom <= 1e-6.
// This prevents GEE from unintentionally masking pixels that production assigns NDVI = 0.
function computeSafeProductionNdvi(reflImage) {
  var nir = reflImage.select('B8');
  var red = reflImage.select('B4');
  var numer = nir.subtract(red);
  var denom = nir.add(red);

  var safeDenom = denom.where(denom.lte(1e-6), 1.0);
  var ndvi = numer.divide(safeDenom)
    .where(denom.lte(1e-6), 0.0)
    .clamp(-1.0, 1.0);

  return ndvi.rename('ndvi');
}

// ─── 8. A. LEGACY REPRODUCTION PIPELINE ──────────────────────────────────────────────────────────
// Replicates OpticalPixelIndexService.ts:80 branch decision condition (maxVal > 15000):
// - Baseline: clamp(DN * 0.0000275 - 0.2, 0.0, 1.0) [Landsat formula branch anomaly]
// - Current:  clamp(DN * 0.0001, 0.0, 1.0)          [Sentinel-2 formula branch]
var legacyBaseRefl = harmonizedBase.multiply(0.0000275).subtract(0.2).clamp(0.0, 1.0);
var legacyCurRefl  = harmonizedCur.multiply(0.0001).clamp(0.0, 1.0);

var legacyBaseNdvi = computeSafeProductionNdvi(legacyBaseRefl);
var legacyCurNdvi  = computeSafeProductionNdvi(legacyCurRefl);

var legacyDeltaNdvi = legacyCurNdvi.subtract(legacyBaseNdvi).rename('delta_ndvi');
var legacyChangeMask = legacyDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('change');

// ─── 9. B. SCIENTIFICALLY CORRECTED COMPARISON PIPELINE ──────────────────────────────────────────
// Consistent Sentinel-2 Level-2A surface reflectance scaling applied to BOTH scenes:
// reflectance = clamp(DN * 0.0001, 0.0, 1.0)
var corrBaseRefl = harmonizedBase.multiply(0.0001).clamp(0.0, 1.0);
var corrCurRefl  = harmonizedCur.multiply(0.0001).clamp(0.0, 1.0);

var corrBaseNdvi = computeSafeProductionNdvi(corrBaseRefl);
var corrCurNdvi  = computeSafeProductionNdvi(corrCurRefl);

var corrDeltaNdvi = corrCurNdvi.subtract(corrBaseNdvi).rename('delta_ndvi');
var corrChangeMask = corrDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('change');

// Classification disagreement mask (pixels where legacy and corrected change decisions differ)
var diffMask = legacyChangeMask.neq(corrChangeMask).and(validComparisonMask).rename('diff');

// ─── 10. QUANTITATIVE REDUCTIONS & STATISTICAL DIAGNOSTICS ───────────────────────────────────────
// Multi-band composites strictly masked by validComparisonMask
var legacyComposite = ee.Image.cat([
  legacyBaseNdvi.rename('base_ndvi'),
  legacyCurNdvi.rename('cur_ndvi'),
  legacyDeltaNdvi.rename('delta_ndvi'),
  legacyChangeMask.rename('changed'),
  legacyBaseNdvi.eq(0).rename('base_zero'),
  legacyCurNdvi.eq(0).rename('cur_zero'),
  validComparisonMask.rename('valid')
]).updateMask(validComparisonMask);

var corrComposite = ee.Image.cat([
  corrBaseNdvi.rename('base_ndvi'),
  corrCurNdvi.rename('cur_ndvi'),
  corrDeltaNdvi.rename('delta_ndvi'),
  corrChangeMask.rename('changed'),
  corrBaseNdvi.eq(0).rename('base_zero'),
  corrCurNdvi.eq(0).rename('cur_zero'),
  validComparisonMask.rename('valid')
]).updateMask(validComparisonMask);

var statReducers = ee.Reducer.mean().combine({
  reducer2: ee.Reducer.median(), sharedInputs: true
}).combine({
  reducer2: ee.Reducer.minMax(), sharedInputs: true
}).combine({
  reducer2: ee.Reducer.sum(), sharedInputs: true
}).combine({
  reducer2: ee.Reducer.count(), sharedInputs: true
});

var legacyStats = legacyComposite.reduceRegion({
  reducer: statReducers,
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

var corrStats = corrComposite.reduceRegion({
  reducer: statReducers,
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

var diffStats = diffMask.rename('diff_pixels').updateMask(validComparisonMask).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

// Robust dictionary value extraction helper that checks multiple candidate output key formats
function safeExtract(dict, candidateKeys, fallback) {
  var d = ee.Dictionary(dict);
  var foundKey = ee.List(candidateKeys).iterate(function(k, prev) {
    return ee.Algorithms.If(prev, prev, ee.Algorithms.If(d.contains(k), k, null));
  }, null);

  return ee.Algorithms.If(foundKey, d.get(foundKey), fallback);
}

// ─── 11. PRINT RAW REDUCER OUTPUTS & FORMATTED AUDIT ─────────────────────────────────────────────
print('================================================================================');
print('🔍 TAMIL NADU FOREST MONITORING SYSTEM — GEE DUAL VALIDATION SCRIPT');
print('================================================================================');

// 1. Raw Dictionaries (Printed first to allow direct inspection of Earth Engine output keys)
print('RAW REDUCER OUTPUT — Legacy Dictionary:', legacyStats);
print('RAW REDUCER OUTPUT — Corrected Dictionary:', corrStats);
print('RAW REDUCER OUTPUT — Disagreement Dictionary:', diffStats);

// 2. Verified Dynamic Metadata
print('DYNAMIC METADATA — Baseline Asset:', baseMeta);
print('DYNAMIC METADATA — Current Asset:', curMeta);

print('METADATA TIMESTAMP EXPLANATION:', {
  'Granule ID vs system:time_start':
    'Sentinel-2 Granule IDs contain two UTC timestamps: ' +
    '1. Datatake sensing start (e.g., 20200109T051201) — start of continuous orbit pass. ' +
    '2. Granule sensing start (e.g., 20200109T051844) — exact moment sensor crossed MGRS tile T43PHM. ' +
    'GEE system:time_start records the granule sensing start in epoch milliseconds.'
});

// 3. NIR Peak Audit
print('NIR PEAK REFLECTANCE AUDIT (Branch Trigger maxVal > 15000):', {
  'Baseline Raw NIR Peak (DN)': baseMaxNir,
  'Baseline maxVal > 15000 Triggered?': ee.Algorithms.If(ee.Number(baseMaxNir).gt(15000), 'YES (>15000)', 'NO (<=15000)'),
  'Current Raw NIR Peak (DN)': curMaxNir,
  'Current maxVal > 15000 Triggered?': ee.Algorithms.If(ee.Number(curMaxNir).gt(15000), 'YES (>15000)', 'NO (<=15000)'),
  'Technical Mechanism': 'In OpticalPixelIndexService.ts:80, maxVal > 15000 routed Sentinel-2 into Landsat formula (DN * 0.0000275 - 0.2).'
});

// 4. Canonical Grid Parameters
print('PRODUCTION CANONICAL GRID SPECIFICATION:', {
  'Canonical CRS': crs,
  'Resolution': '10.0 m x 10.0 m (100.0 m² pixel area)',
  'GDAL Affine Transform': '[819510, 10, 0, 1140140, 0, -10]',
  'GEE crsTransform': crsTransform,
  'Grid Dimensions': '2251 cols x 2093 rows (4,711,343 cells in grid envelope)',
  'Reported Local Valid Pixels': 3066268,
  'Reported Local Changed Pixels': 3774,
  'Reported Local Changed Area': '37.74 ha',
  'Reported Local Affected %': '0.1231%'
});

// Format Legacy Summary
var legValidCount = ee.Number(safeExtract(legacyStats, ['valid_count', 'valid_sum', 'valid'], 0));
var legChangedCount = ee.Number(safeExtract(legacyStats, ['changed_sum', 'changed'], 0));
var legChangedAreaM2 = legChangedCount.multiply(100.0);
var legChangedAreaHa = legChangedAreaM2.divide(10000.0);
var legValidAreaHa = legValidCount.multiply(100.0).divide(10000.0);
var legChangedPct = ee.Algorithms.If(
  legValidCount.gt(0),
  legChangedCount.divide(legValidCount).multiply(100.0),
  0.0
);

print('--------------------------------------------------------------------------------');
print('A. LEGACY REPRODUCTION (Replicating Production Code Anomaly):', {
  'Baseline Reflectance Scaling': 'clamp(DN * 0.0000275 - 0.2, 0.0, 1.0) [Landsat Branch Anomaly]',
  'Current Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Sentinel-2 Branch]',
  'Reflectance Resampling': 'Bilinear (Continuous Reflectance Bands)',
  'Validity Masking Rule': '!(B2=0 && B3=0 && B4=0 && B8=0) & Zone Mask (Nearest-Neighbor)',
  'Investigation Target': '3,774 changed px | 3,066,268 valid px | 37.74 ha | 0.1231%',
  'Valid Comparison Pixel Count': legValidCount,
  'Changed Pixel Count (dNDVI <= -0.15)': legChangedCount,
  'Valid Comparison Area (ha)': legValidAreaHa,
  'Changed Ground Area (ha)': legChangedAreaHa,
  'Changed Ground Area (m²)': legChangedAreaM2,
  'Affected Percentage (%)': legChangedPct,
  'Baseline NDVI Mean': safeExtract(legacyStats, ['base_ndvi_mean', 'base_ndvi'], null),
  'Baseline NDVI Median': safeExtract(legacyStats, ['base_ndvi_median'], null),
  'Baseline NDVI Min / Max': ee.List([
    safeExtract(legacyStats, ['base_ndvi_min'], null),
    safeExtract(legacyStats, ['base_ndvi_max'], null)
  ]),
  'Baseline Zero-NDVI Pixels': safeExtract(legacyStats, ['base_zero_sum', 'base_zero'], 0),
  'Current NDVI Mean': safeExtract(legacyStats, ['cur_ndvi_mean', 'cur_ndvi'], null),
  'Current NDVI Median': safeExtract(legacyStats, ['cur_ndvi_median'], null),
  'Current NDVI Min / Max': ee.List([
    safeExtract(legacyStats, ['cur_ndvi_min'], null),
    safeExtract(legacyStats, ['cur_ndvi_max'], null)
  ]),
  'Current Zero-NDVI Pixels': safeExtract(legacyStats, ['cur_zero_sum', 'cur_zero'], 0),
  'Delta NDVI Mean': safeExtract(legacyStats, ['delta_ndvi_mean', 'delta_ndvi'], null),
  'Delta NDVI Median': safeExtract(legacyStats, ['delta_ndvi_median'], null),
  'Delta NDVI Min / Max': ee.List([
    safeExtract(legacyStats, ['delta_ndvi_min'], null),
    safeExtract(legacyStats, ['delta_ndvi_max'], null)
  ])
});

// Format Corrected Summary
var corValidCount = ee.Number(safeExtract(corrStats, ['valid_count', 'valid_sum', 'valid'], 0));
var corChangedCount = ee.Number(safeExtract(corrStats, ['changed_sum', 'changed'], 0));
var corChangedAreaM2 = corChangedCount.multiply(100.0);
var corChangedAreaHa = corChangedAreaM2.divide(10000.0);
var corValidAreaHa = corValidCount.multiply(100.0).divide(10000.0);
var corChangedPct = ee.Algorithms.If(
  corValidCount.gt(0),
  corChangedCount.divide(corValidCount).multiply(100.0),
  0.0
);

print('--------------------------------------------------------------------------------');
print('B. SCIENTIFICALLY CORRECTED COMPARISON (Consistent Sentinel-2 Scaling):', {
  'Baseline Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Authoritative Sentinel-2 L2A]',
  'Current Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Authoritative Sentinel-2 L2A]',
  'Reflectance Resampling': 'Bilinear (Continuous Reflectance Bands)',
  'Validity Masking Rule': '!(B2=0 && B3=0 && B4=0 && B8=0) & Zone Mask (Nearest-Neighbor)',
  'Valid Comparison Pixel Count': corValidCount,
  'Changed Pixel Count (dNDVI <= -0.15)': corChangedCount,
  'Valid Comparison Area (ha)': corValidAreaHa,
  'Changed Ground Area (ha)': corChangedAreaHa,
  'Changed Ground Area (m²)': corChangedAreaM2,
  'Affected Percentage (%)': corChangedPct,
  'Baseline NDVI Mean': safeExtract(corrStats, ['base_ndvi_mean', 'base_ndvi'], null),
  'Baseline NDVI Median': safeExtract(corrStats, ['base_ndvi_median'], null),
  'Baseline NDVI Min / Max': ee.List([
    safeExtract(corrStats, ['base_ndvi_min'], null),
    safeExtract(corrStats, ['base_ndvi_max'], null)
  ]),
  'Baseline Zero-NDVI Pixels': safeExtract(corrStats, ['base_zero_sum', 'base_zero'], 0),
  'Current NDVI Mean': safeExtract(corrStats, ['cur_ndvi_mean', 'cur_ndvi'], null),
  'Current NDVI Median': safeExtract(corrStats, ['cur_ndvi_median'], null),
  'Current NDVI Min / Max': ee.List([
    safeExtract(corrStats, ['cur_ndvi_min'], null),
    safeExtract(corrStats, ['cur_ndvi_max'], null)
  ]),
  'Current Zero-NDVI Pixels': safeExtract(corrStats, ['cur_zero_sum', 'cur_zero'], 0),
  'Delta NDVI Mean': safeExtract(corrStats, ['delta_ndvi_mean', 'delta_ndvi'], null),
  'Delta NDVI Median': safeExtract(corrStats, ['delta_ndvi_median'], null),
  'Delta NDVI Min / Max': ee.List([
    safeExtract(corrStats, ['delta_ndvi_min'], null),
    safeExtract(corrStats, ['delta_ndvi_max'], null)
  ])
});

// Format Cross-Method Classification Discrepancy
var diffPixelCount = ee.Number(safeExtract(diffStats, ['diff_pixels_sum', 'diff_pixels', 'diff'], 0));
var diffAreaHa = diffPixelCount.multiply(100.0).divide(10000.0);
var diffPct = ee.Algorithms.If(
  corValidCount.gt(0),
  diffPixelCount.divide(corValidCount).multiply(100.0),
  0.0
);

print('--------------------------------------------------------------------------------');
print('CROSS-METHOD DISCREPANCY & AUDIT SUMMARY:', {
  'Disagreement Pixel Count': diffPixelCount,
  'Disagreement Area (ha)': diffAreaHa,
  'Disagreement % of Valid Area': diffPct,
  'Valid Pixel Delta vs 3,066,268 Target': corValidCount.subtract(3066268),
  'Investigation Note': 'A non-zero delta in valid pixels indicates edge centroid rasterization differences between GEE and local Node.js ray-casting.',
  'UI Denominator Finding': 'Production UI displayed "37.74 ha of 100 ha" due to fallback scalar (zoneDoc.areaHectares || 100.0). True zone comparison area is ~30,662 ha.'
});
print('================================================================================');

// ─── 12. MAP VISUALIZATION LAYERS ────────────────────────────────────────────────────────────────
Map.centerObject(zonePolygon, 11);

var ndviVis = {
  min: -0.2,
  max: 0.9,
  palette: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#1a9850']
};

// 1. Natural Color True RGBs (B4, B3, B2)
Map.addLayer(harmonizedBase.select(['B4', 'B3', 'B2']), {min: 0, max: 2500, gamma: 1.2}, '1. Baseline True Color RGB (2020-01-09)', false);
Map.addLayer(harmonizedCur.select(['B4', 'B3', 'B2']),  {min: 0, max: 2500, gamma: 1.2}, '2. Current True Color RGB (2024-02-07)', false);

// 2. NDVI Spectral Index Layers
Map.addLayer(legacyBaseNdvi.updateMask(validComparisonMask), ndviVis, '3. Legacy Baseline NDVI (Anomalous Landsat Scaling ~0)', false);
Map.addLayer(corrBaseNdvi.updateMask(validComparisonMask),   ndviVis, '4. Corrected Baseline NDVI (True Sentinel-2 0.0001)', false);
Map.addLayer(corrCurNdvi.updateMask(validComparisonMask),    ndviVis, '5. Current NDVI (2024-02-07)', false);

// 3. Canopy Disturbance Masks (Canopy Loss: dNDVI <= -0.15)
Map.addLayer(legacyChangeMask.updateMask(legacyChangeMask), {palette: ['#dc2626']}, '6. Legacy Change Mask (Loss <= -0.15)', true);
Map.addLayer(corrChangeMask.updateMask(corrChangeMask),     {palette: ['#ea580c']}, '7. Corrected Change Mask (Loss <= -0.15)', true);

// 4. Disagreement & Boundary Outline
Map.addLayer(diffMask.updateMask(diffMask), {palette: ['#facc15']}, '8. Classification Disagreement Mask (Legacy != Corrected)', true);
Map.addLayer(ee.Image().paint(zonePolygon, 0, 2), {palette: ['#06b6d4']}, '9. Monitored Zone Boundary (Sirumalai Outline)', true);
```

---

## Summary of All Corrections Applied

1. **NDVI Division-by-Zero and Unintentional Masking Fix (`computeSafeProductionNdvi`)**:
   - In GEE, standard division `numer.divide(denom)` when `denom == 0` causes Earth Engine to automatically mask the pixel. Once masked, downstream `.where()` operations cannot restore or assign values to it.
   - We corrected this by constructing `safeDenom = denom.where(denom.lte(1e-6), 1.0)`. Division by `safeDenom` is strictly non-zero and produces no division-by-zero masks. Then `.where(denom.lte(1e-6), 0.0)` sets the NDVI strictly to `0.0`. Pixels where $\text{NIR} + \text{Red} \le 10^{-6}$ remain fully valid and unmasked with $\text{NDVI} = 0.0$, matching [`OpticalPixelIndexService.ts:196`](file:///d:/tn-enforcement-system/tn-forest-monitoring/server/src/services/spatial/OpticalPixelIndexService.ts#L196).

2. **Raw Reducer Outputs Printed First & Multi-Key Extraction (`safeExtract`)**:
   - The raw output dictionaries (`legacyStats`, `corrStats`, `diffStats`) are explicitly printed in the console before any key access.
   - We implemented a fallback-safe extraction helper `safeExtract(dict, candidateKeys, fallback)` that inspects Earth Engine's actual dictionary keys (e.g. testing `['valid_count', 'valid_sum', 'valid']` and `['base_ndvi_mean', 'base_ndvi']`) before reading values, completely preventing key-not-found exceptions.

3. **Separation of Bilinear Continuous Bands vs. Discrete Categorical Masks**:
   - Continuous reflectance bands (`B2`, `B3`, `B4`, `B8`, `B11`, `B12`) are explicitly sampled using `.resample('bilinear')` before reprojection, matching [`OpticalSpatialHarmonizationService.reprojectOpticalToGrid`](file:///d:/tn-enforcement-system/tn-forest-monitoring/server/src/services/spatial/OpticalSpatialHarmonizationService.ts#L213-L272).
   - In contrast, the zone polygon boundary mask (`zoneMask`) and validity mask remain discrete nearest-neighbor layers, avoiding artificial fractional boundary bleed.

4. **NIR Peak Reflectance Audit (`baseMaxNir` / `curMaxNir`)**:
   - Added live measurement of maximum raw NIR Digital Numbers across the analysis grid envelope to audit whether $DN > 15,000$ triggers in the GEE online asset over this zone.
   - Clarified that the legacy baseline scaling is a diagnostic reproduction of the documented `maxVal > 15000` branch condition, without claiming exact ground truth.

5. **Dynamic Timestamp Explanation**:
   - Clarified why Granule IDs contain two UTC timestamps (Datatake acquisition start time vs. MGRS tile sensing time) and how `system:time_start` reflects the granule sensing start.

6. **Preservation of Grid and Rules**:
   - The canonical `EPSG:32643` grid, `[10, 0, 819510, 0, -10, 1140140]` affine transform, $2251 \times 2093$ envelope, production fallback radiometric rule (`!(B2=0 && B3=0 && B4=0 && B8=0)`), and $\Delta\text{NDVI} \le -0.15$ threshold remain strictly preserved without SCL cloud filtering or forced target numbers.