```javascript
/**
 * =================================================================================================
 * TAMIL NADU FOREST ENFORCEMENT & MONITORING SYSTEM
 * DUAL-RESULT GOOGLE EARTH ENGINE (GEE) VALIDATION SCRIPT (FAST PASS — FIXED ARITHMETIC)
 * =================================================================================================
 *
 * Source of Truth: PRODUCTION_OPTICAL_ALGORITHM_FORENSIC_REPORT.md
 * Target Case: Record CHG-1791696357291-3501 (_id: 6acb1de59ee540ec5f7060de)
 * Zone: ZONE-261011-6340 (Sirumalai / 'test zone 57')
 *
 * SCRIPT SPECIFICATION:
 *   A. LEGACY REPRODUCTION (Diagnostic of production code anomaly):
 *      - Baseline: clamp(DN * 0.0000275 - 0.2, 0.0, 1.0) [Landsat formula branch anomaly]
 *      - Current:  clamp(DN * 0.0001, 0.0, 1.0)          [Sentinel-2 formula branch]
 *      - Difference: deltaNDVI = Current - Baseline; Canopy loss: deltaNDVI <= -0.15
 *
 *   B. SCIENTIFICALLY CORRECTED COMPARISON:
 *      - Authoritative Sentinel-2 L2A scaling on BOTH: clamp(DN * 0.0001, 0.0, 1.0)
 *      - Difference: deltaNDVI = Current - Baseline; Canopy loss: deltaNDVI <= -0.15
 *
 * BUG FIX IN THIS REVISION:
 * - Resolved "d.contains(...).and is not a function" error at line 300:
 *   ee.Dictionary.contains() returns an ee.Boolean, which does not possess a client-side .and() method.
 *   Replaced with nested individual ee.Algorithms.If key checks for server-side evaluation.
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

// ─── 2. CANONICAL ANALYSIS GRID SPECIFICATION ────────────────────────────────────────────────────
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

function extractDynamicMetadata(img, label) {
  var timeStart = ee.Date(img.get('system:time_start'));
  var b4Proj = img.select('B4').projection();
  return ee.Dictionary({
    'Asset Label': label,
    'Asset ID': img.id(),
    'Spacecraft': img.get('SPACECRAFT_NAME'),
    'system:time_start (UTC)': timeStart.format('YYYY-MM-dd HH:mm:ss.SSS'),
    'system:time_start (Epoch ms)': img.get('system:time_start'),
    'Granule Identifier': img.get('GRANULE_ID'),
    'MGRS Tile': img.get('MGRS_TILE'),
    'Cloud Coverage Assessment (%)': img.get('CLOUDY_PIXEL_PERCENTAGE'),
    'Native Projection CRS': b4Proj.crs(),
    'Native Nominal Scale (m)': b4Proj.nominalScale()
  });
}

var baseMeta = extractDynamicMetadata(rawBase, 'Baseline Asset (2020)');
var curMeta  = extractDynamicMetadata(rawCur, 'Current Asset (2024)');

// ─── 4. DIAGNOSTIC NIR PEAK AUDIT (LIVE GEE VS HISTORICAL LOCAL GEO-TIFF) ────────────────────────
var liveBaseMaxNir = rawBase.select('B8').reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
}).get('B8');

var liveCurMaxNir = rawCur.select('B8').reduceRegion({
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
// Vector zone boundary mask remains discrete nearest-neighbor (NO bilinear blur on boundary)
var zoneMask = ee.Image(0).paint({
  featureCollection: ee.FeatureCollection([ee.Feature(zonePolygon)]),
  color: 1
}).reproject({
  crs: crs,
  crsTransform: crsTransform
});

// Production Fallback Radiometric Quality Rule evaluated on bilinearly resampled continuous bands:
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
// Production formula: denom > 1e-6 ? (NIR - Red) / denom : 0.0; clamp [-1, 1].
// Replaces denom <= 1e-6 with 1.0 prior to division to prevent GEE from unintentionally masking
// pixels where denom == 0, then assigns strictly 0.0 where denom <= 1e-6.
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
var legacyChangeMask = legacyDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('changed_pixels');

// ─── 9. B. SCIENTIFICALLY CORRECTED COMPARISON PIPELINE ──────────────────────────────────────────
// Authoritative Sentinel-2 Level-2A surface reflectance scaling applied consistently to BOTH:
// reflectance = clamp(DN * 0.0001, 0.0, 1.0)
var corrBaseRefl = harmonizedBase.multiply(0.0001).clamp(0.0, 1.0);
var corrCurRefl  = harmonizedCur.multiply(0.0001).clamp(0.0, 1.0);

var corrBaseNdvi = computeSafeProductionNdvi(corrBaseRefl);
var corrCurNdvi  = computeSafeProductionNdvi(corrCurRefl);

var corrDeltaNdvi = corrCurNdvi.subtract(corrBaseNdvi).rename('delta_ndvi');
var corrChangeMask = corrDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('changed_pixels');

// Classification disagreement mask
var diffMask = legacyChangeMask.neq(corrChangeMask).and(validComparisonMask).rename('diff_pixels');

// ─── 10. LIGHTWEIGHT STREAMING REDUCTIONS ────────────────────────────────────────────────────────
// Fast streaming reductions avoiding memory-heavy median sorting
// A. Legacy Reductions
var legacyCountDict = ee.Image.cat([
  legacyChangeMask.rename('changed_pixels'),
  validComparisonMask.rename('valid_pixels')
]).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

var legacyMeanDict = ee.Image.cat([
  legacyBaseNdvi.rename('base_ndvi_mean'),
  legacyCurNdvi.rename('cur_ndvi_mean'),
  legacyDeltaNdvi.rename('delta_ndvi_mean')
]).updateMask(validComparisonMask).reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

var legacyStats = legacyCountDict.combine(legacyMeanDict);

// B. Corrected Reductions
var corrCountDict = ee.Image.cat([
  corrChangeMask.rename('changed_pixels'),
  validComparisonMask.rename('valid_pixels')
]).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

var corrMeanDict = ee.Image.cat([
  corrBaseNdvi.rename('base_ndvi_mean'),
  corrCurNdvi.rename('cur_ndvi_mean'),
  corrDeltaNdvi.rename('delta_ndvi_mean')
]).updateMask(validComparisonMask).reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

var corrStats = corrCountDict.combine(corrMeanDict);

// C. Disagreement Reduction
var diffStats = diffMask.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

// ─── 11. DIRECT SERVER-SIDE ARITHMETIC HELPERS (FIXED) ───────────────────────────────────────────
// Strict stat lookup helper: reports missing key explicitly without silent zero fallbacks
function getStrictStat(dict, key) {
  var d = ee.Dictionary(dict);
  return ee.Algorithms.If(
    d.contains(key),
    d.get(key),
    'KEY_UNAVAILABLE: ' + key
  );
}

// Compute area in hectares: pixel count * 100 m² / 10,000 m²/ha
function computeAreaHa(dict, key) {
  var d = ee.Dictionary(dict);
  return ee.Algorithms.If(
    d.contains(key),
    ee.Number(d.get(key)).multiply(100.0).divide(10000.0),
    'KEY_UNAVAILABLE: ' + key
  );
}

// Compute area in square meters: pixel count * 100 m²
function computeAreaM2(dict, key) {
  var d = ee.Dictionary(dict);
  return ee.Algorithms.If(
    d.contains(key),
    ee.Number(d.get(key)).multiply(100.0),
    'KEY_UNAVAILABLE: ' + key
  );
}

// Compute affected percentage: (changed pixels / valid pixels) * 100
// FIX: Replaced invalid .and() on ee.Boolean with nested ee.Algorithms.If key checks
function computePercentage(dict, changedKey, validKey) {
  var d = ee.Dictionary(dict);
  return ee.Algorithms.If(
    d.contains(changedKey),
    ee.Algorithms.If(
      d.contains(validKey),
      ee.Algorithms.If(
        ee.Number(d.get(validKey)).gt(0),
        ee.Number(d.get(changedKey)).divide(ee.Number(d.get(validKey))).multiply(100.0),
        'INVALID_DENOMINATOR (valid_pixels == 0)'
      ),
      'KEY_UNAVAILABLE: ' + validKey
    ),
    'KEY_UNAVAILABLE: ' + changedKey
  );
}

// ─── 12. PRINT RAW DICTIONARIES & STRUCTURED AUDIT REPORT ────────────────────────────────────────
print('================================================================================');
print('⚡ TN FOREST MONITORING SYSTEM — GEE DUAL VALIDATION SCRIPT (FAST PASS)');
print('================================================================================');

// 1. Raw Output Dictionaries
print('1. RAW REDUCER OUTPUT — Legacy Dictionary:', legacyStats);
print('2. RAW REDUCER OUTPUT — Corrected Dictionary:', corrStats);
print('3. RAW REDUCER OUTPUT — Disagreement Dictionary:', diffStats);

// 2. Verified Dynamic Metadata
print('4. DYNAMIC ASSET METADATA — Baseline:', baseMeta);
print('5. DYNAMIC ASSET METADATA — Current:', curMeta);

print('6. METADATA TIMESTAMP EXPLANATION:', {
  'Granule ID vs system:time_start':
    'Sentinel-2 Granule IDs contain two UTC timestamps: ' +
    '1. Datatake sensing start (e.g., 20200109T051201) — start of continuous orbit pass. ' +
    '2. Granule sensing start (e.g., 20200109T051844) — exact moment sensor imaged MGRS tile T43PHM. ' +
    'GEE system:time_start records the granule sensing start in epoch milliseconds.'
});

// 3. Documented Production Decision vs Live GEE Peak Diagnostic
print('7. NIR PEAK REFLECTANCE AUDIT & PRODUCTION BRANCH CONTEXT:', {
  'Documented Historical Production Data': {
    'Baseline Local GeoTIFF Peak NIR (DN)': 16090,
    'Current Local GeoTIFF Peak NIR (DN)': 10896,
    'Production Code Branch Condition': 'maxVal > 15000 in OpticalPixelIndexService.ts:80',
    'Actual Historical Decision': 'Baseline took Landsat formula (DN * 0.0000275 - 0.2); Current took Sentinel-2 (DN * 0.0001)'
  },
  'Live GEE Online Asset Diagnostic (Context Only)': {
    'Live GEE Baseline NIR Peak (DN)': liveBaseMaxNir,
    'Live GEE Baseline > 15000?': ee.Algorithms.If(ee.Number(liveBaseMaxNir).gt(15000), 'YES (>15000)', 'NO (<=15000)'),
    'Live GEE Current NIR Peak (DN)': liveCurMaxNir,
    'Live GEE Current > 15000?': ee.Algorithms.If(ee.Number(liveCurMaxNir).gt(15000), 'YES (>15000)', 'NO (<=15000)'),
    'Diagnostic Caveat': 'The live GEE peak is diagnostic only. It does not independently prove which branch the production code executed historically on the local GeoTIFF.'
  }
});

// 4. Canonical Grid Parameters
print('8. PRODUCTION CANONICAL GRID SPECIFICATION:', {
  'Canonical CRS': crs,
  'Resolution': '10.0 m x 10.0 m (100.0 m² pixel area)',
  'GDAL Affine Transform': '[819510, 10, 0, 1140140, 0, -10]',
  'GEE crsTransform': crsTransform,
  'Grid Dimensions': '2251 cols x 2093 rows (4,711,343 cells in grid envelope)',
  'Historical Local Valid Pixels': 3066268,
  'Historical Local Changed Pixels': 3774,
  'Historical Local Changed Area': '37.74 ha',
  'Historical Local Affected %': '0.1231%'
});

// Derived Calculations for Legacy Scenario
var legValidPixels   = getStrictStat(legacyStats, 'valid_pixels');
var legChangedPixels = getStrictStat(legacyStats, 'changed_pixels');
var legValidAreaHa   = computeAreaHa(legacyStats, 'valid_pixels');
var legChangedAreaHa = computeAreaHa(legacyStats, 'changed_pixels');
var legChangedAreaM2 = computeAreaM2(legacyStats, 'changed_pixels');
var legAffectedPct   = computePercentage(legacyStats, 'changed_pixels', 'valid_pixels');

print('--------------------------------------------------------------------------------');
print('A. LEGACY REPRODUCTION (Diagnostic Reproduction of Suspected Branch Anomaly):', {
  'Baseline Reflectance Scaling': 'clamp(DN * 0.0000275 - 0.2, 0.0, 1.0) [Landsat Branch Anomaly]',
  'Current Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Sentinel-2 Branch]',
  'Reflectance Resampling': 'Bilinear (Continuous Reflectance Bands)',
  'Validity Masking Definition': 'Calculated from bilinearly resampled continuous bands: !(B2=0 && B3=0 && B4=0 && B8=0) & Discrete Zone Mask',
  'Historical Target Under Audit': '3,774 changed px | 3,066,268 valid px | 37.74 ha | 0.1231%',
  'Valid Comparison Pixels': legValidPixels,
  'Changed Pixels (dNDVI <= -0.15)': legChangedPixels,
  'Valid Comparison Area (ha)': legValidAreaHa,
  'Changed Ground Area (ha)': legChangedAreaHa,
  'Changed Ground Area (m²)': legChangedAreaM2,
  'Affected Percentage (%)': legAffectedPct,
  'Baseline NDVI Mean': getStrictStat(legacyStats, 'base_ndvi_mean'),
  'Current NDVI Mean': getStrictStat(legacyStats, 'cur_ndvi_mean'),
  'Delta NDVI Mean': getStrictStat(legacyStats, 'delta_ndvi_mean')
});

// Derived Calculations for Corrected Scenario
var corValidPixels   = getStrictStat(corrStats, 'valid_pixels');
var corChangedPixels = getStrictStat(corrStats, 'changed_pixels');
var corValidAreaHa   = computeAreaHa(corrStats, 'valid_pixels');
var corChangedAreaHa = computeAreaHa(corrStats, 'changed_pixels');
var corChangedAreaM2 = computeAreaM2(corrStats, 'changed_pixels');
var corAffectedPct   = computePercentage(corrStats, 'changed_pixels', 'valid_pixels');

print('--------------------------------------------------------------------------------');
print('B. SCIENTIFICALLY CORRECTED COMPARISON (Consistent Sentinel-2 L2A Scaling):', {
  'Baseline Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Authoritative Sentinel-2 L2A]',
  'Current Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Authoritative Sentinel-2 L2A]',
  'Reflectance Resampling': 'Bilinear (Continuous Reflectance Bands)',
  'Validity Masking Definition': 'Calculated from bilinearly resampled continuous bands: !(B2=0 && B3=0 && B4=0 && B8=0) & Discrete Zone Mask',
  'Valid Comparison Pixels': corValidPixels,
  'Changed Pixels (dNDVI <= -0.15)': corChangedPixels,
  'Valid Comparison Area (ha)': corValidAreaHa,
  'Changed Ground Area (ha)': corChangedAreaHa,
  'Changed Ground Area (m²)': corChangedAreaM2,
  'Affected Percentage (%)': corAffectedPct,
  'Baseline NDVI Mean': getStrictStat(corrStats, 'base_ndvi_mean'),
  'Current NDVI Mean': getStrictStat(corrStats, 'cur_ndvi_mean'),
  'Delta NDVI Mean': getStrictStat(corrStats, 'delta_ndvi_mean')
});

// Derived Calculations for Disagreement & Delta
// FIX: Using nested ee.Algorithms.If key checks instead of invalid chained .and()
var diffPixels = getStrictStat(diffStats, 'diff_pixels');
var diffAreaHa = computeAreaHa(diffStats, 'diff_pixels');

var diffPct = ee.Algorithms.If(
  ee.Dictionary(diffStats).contains('diff_pixels'),
  ee.Algorithms.If(
    ee.Dictionary(corrStats).contains('valid_pixels'),
    ee.Algorithms.If(
      ee.Number(ee.Dictionary(corrStats).get('valid_pixels')).gt(0),
      ee.Number(ee.Dictionary(diffStats).get('diff_pixels'))
        .divide(ee.Number(ee.Dictionary(corrStats).get('valid_pixels')))
        .multiply(100.0),
      'INVALID_DENOMINATOR (valid_pixels == 0)'
    ),
    'KEY_UNAVAILABLE: valid_pixels'
  ),
  'KEY_UNAVAILABLE: diff_pixels'
);

var validPixelDelta = ee.Algorithms.If(
  ee.Dictionary(corrStats).contains('valid_pixels'),
  ee.Number(ee.Dictionary(corrStats).get('valid_pixels')).subtract(3066268),
  'KEY_UNAVAILABLE: valid_pixels'
);

print('--------------------------------------------------------------------------------');
print('CROSS-METHOD DISCREPANCY & AUDIT SUMMARY:', {
  'Disagreement Pixel Count': diffPixels,
  'Disagreement Area (ha)': diffAreaHa,
  'Disagreement % of Valid Area': diffPct,
  'Valid Pixel Delta vs Local Target (3,066,268)': validPixelDelta,
  'Delta Explanation': 'A non-zero delta in valid pixels reflects online tile pyramid bilinear resampling and vector boundary centroid rasterization differences in GEE vs local Node.js ray-casting.',
  'UI Denominator Finding': 'Production UI displayed "37.74 ha of 100 ha" due to fallback scalar (zoneDoc.areaHectares || 100.0). True zone comparison area is ~30,662 ha.'
});
print('================================================================================');

// ─── 13. MAP VISUALIZATION LAYERS ────────────────────────────────────────────────────────────────
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
Map.addLayer(legacyBaseNdvi.updateMask(validComparisonMask), ndviVis, '3. Legacy Baseline NDVI (Diagnostic Scaling Anomaly ~0)', false);
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

## Identification & Explanation of the Exact Fix

### Root Cause
At line 300 of the previous script:
```javascript
var hasBoth = d.contains(changedKey).and(d.contains(validKey));
```
and within `diffPct`:
```javascript
ee.Dictionary(diffStats).contains('diff_pixels').and(ee.Dictionary(corrStats).contains('valid_pixels'))
```
The method `d.contains(...)` returns a server-side `ee.Boolean` object. In the Earth Engine JavaScript client library, `ee.Boolean` does not provide an `.and()` method (unlike `ee.Image.and()` or `ee.Filter.and()`). Attempting to call `.and()` directly on the returned `ee.Boolean` threw the runtime TypeError:
`d.contains(...).and is not a function`.

### Exact Corrections Applied
1. **Replaced Invalid `.and()` on `ee.Boolean` with Nested `ee.Algorithms.If` in `computePercentage`**:
   ```javascript
   function computePercentage(dict, changedKey, validKey) {
     var d = ee.Dictionary(dict);
     return ee.Algorithms.If(
       d.contains(changedKey),
       ee.Algorithms.If(
         d.contains(validKey),
         ee.Algorithms.If(
           ee.Number(d.get(validKey)).gt(0),
           ee.Number(d.get(changedKey)).divide(ee.Number(d.get(validKey))).multiply(100.0),
           'INVALID_DENOMINATOR (valid_pixels == 0)'
         ),
         'KEY_UNAVAILABLE: ' + validKey
       ),
       'KEY_UNAVAILABLE: ' + changedKey
     );
   }
   ```
2. **Replaced Invalid `.and()` in `diffPct` Evaluation**:
   ```javascript
   var diffPct = ee.Algorithms.If(
     ee.Dictionary(diffStats).contains('diff_pixels'),
     ee.Algorithms.If(
       ee.Dictionary(corrStats).contains('valid_pixels'),
       ee.Algorithms.If(
         ee.Number(ee.Dictionary(corrStats).get('valid_pixels')).gt(0),
         ee.Number(ee.Dictionary(diffStats).get('diff_pixels'))
           .divide(ee.Number(ee.Dictionary(corrStats).get('valid_pixels')))
           .multiply(100.0),
         'INVALID_DENOMINATOR (valid_pixels == 0)'
       ),
       'KEY_UNAVAILABLE: valid_pixels'
     ),
     'KEY_UNAVAILABLE: diff_pixels'
   );
   ```
3. **Preserved All Strict Error Reporting & Zero-Fallback Removal**:
   - Every metric performs direct server-side arithmetic on verified keys (`valid_pixels`, `changed_pixels`, `diff_pixels`).
   - If any dictionary key is absent, the script outputs explicit human-readable error messages (`'KEY_UNAVAILABLE: <key>'`) or `'INVALID_DENOMINATOR'`, never silently defaulting to `0`.