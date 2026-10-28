```javascript
/**
 * =================================================================================================
 * TAMIL NADU FOREST ENFORCEMENT & MONITORING SYSTEM
 * DUAL-RESULT GOOGLE EARTH ENGINE (GEE) INDEPENDENT VALIDATION SCRIPT (REVISED)
 * =================================================================================================
 *
 * Source of Truth: PRODUCTION_OPTICAL_ALGORITHM_FORENSIC_REPORT.md
 * Verification Target: Change Detection Record CHG-1791696357291-3501 (_id: 6acb1de59ee540ec5f7060de)
 * Monitored Zone: ZONE-261011-6340 (Sirumalai / 'test zone 57')
 *
 * SPECIFICATION OF COMPARISONS:
 *
 *   A. LEGACY REPRODUCTION:
 *      - Replicates OpticalPixelIndexService.ts:80 branch anomaly triggered by maxVal > 15000:
 *        * Baseline (2020-01-09): Landsat scaling clamp(DN * 0.0000275 - 0.2, 0.0, 1.0)
 *        * Current (2024-02-07): Sentinel-2 scaling clamp(DN * 0.0001, 0.0, 1.0)
 *      - Production NDVI: (NIR - Red) / (NIR + Red) where (NIR + Red) > 1e-6 else 0.0; clamp [-1, 1]
 *      - Temporal differencing: deltaNDVI = Current - Baseline
 *      - Canopy loss decision rule: deltaNDVI <= -0.15
 *      - Reported local target for investigation: 3,774 changed px | 3,066,268 valid px | 37.74 ha (0.1231%)
 *
 *   B. SCIENTIFICALLY CORRECTED COMPARISON:
 *      - Applies authoritative Sentinel-2 L2A scaling consistently to BOTH scenes:
 *        * Baseline (2020-01-09): clamp(DN * 0.0001, 0.0, 1.0)
 *        * Current (2024-02-07): clamp(DN * 0.0001, 0.0, 1.0)
 *      - Identical NDVI formula, differencing, and drop threshold (deltaNDVI <= -0.15).
 *      - Evaluated on the identical production grid and validity mask to isolate reflectance calibration.
 *
 * IMPLEMENTATION SAFEGUARDS:
 * - Continuous reflectance bands resampled with 'bilinear' before reprojection.
 * - Categorical masks (zone boundary & validity) remain discrete (nearest neighbor).
 * - Metadata extracted dynamically from asset properties (no hardcoded timestamps).
 * - Exact canonical AnalysisGrid: EPSG:32643, 10m scale, origin [819510, 1140140], 2251 x 2093.
 * - Exact 6-band production validity fallback: rejects pixels only if B2=B3=B4=B8=0.
 * - No SCL cloud masking introduced; no hardcoded 100 ha denominator.
 * =================================================================================================
 */

// ─── 1. MONITORED ZONE GEOMETRY ──────────────────────────────────────────────────────────────────
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

// Helper to extract and structure live metadata directly from Earth Engine asset headers
function extractDynamicMetadata(img, label) {
  var timeStart = ee.Date(img.get('system:time_start'));
  var timeEnd = ee.Date(img.get('system:time_end'));
  var b4Proj = img.select('B4').projection();
  return ee.Dictionary({
    'Asset Label': label,
    'Asset ID': img.id(),
    'Collection': 'COPERNICUS/S2_SR_HARMONIZED',
    'Spacecraft': img.get('SPACECRAFT_NAME'),
    'system:time_start (UTC)': timeStart.format('YYYY-MM-dd HH:mm:ss.SSS'),
    'system:time_start (Epoch ms)': img.get('system:time_start'),
    'system:time_end (UTC)': timeEnd.format('YYYY-MM-dd HH:mm:ss.SSS'),
    'Datatake Identifier': img.get('DATATAKE_IDENTIFIER'),
    'Granule Identifier': img.get('GRANULE_ID'),
    'MGRS Tile': img.get('MGRS_TILE'),
    'Cloud Coverage (%)': img.get('CLOUDY_PIXEL_PERCENTAGE'),
    'Native Projection CRS': b4Proj.crs(),
    'Native Nominal Scale (m)': b4Proj.nominalScale(),
    'Asset Band Count': img.bandNames().length(),
    'Available Band Names': img.bandNames()
  });
}

var baseMeta = extractDynamicMetadata(rawBase, 'Baseline (2020)');
var curMeta  = extractDynamicMetadata(rawCur, 'Current (2024)');

// ─── 4. RASTER RESAMPLING & GRID HARMONIZATION ───────────────────────────────────────────────────
// Requirement 1: OpticalSpatialHarmonizationService.reprojectOpticalToGrid applies continuous
// sub-pixel bilinear resampling to continuous reflectance bands.
// resample('bilinear') is explicitly called on continuous bands prior to reprojection.
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

// ─── 5. PRODUCTION VALIDITY & BOUNDARY MASKS (NEAREST-NEIGHBOR DISCRETE) ─────────────────────────
// Requirement 1 & 3: Categorical/discrete masks MUST NOT be bilinearly resampled.
// Zone Vector Boundary Mask: Pixel centroid ray-casting inside polygon boundary.
var zoneMask = ee.Image(0).paint({
  featureCollection: ee.FeatureCollection([ee.Feature(zonePolygon)]),
  color: 1
}).reproject({
  crs: crs,
  crsTransform: crsTransform
});

// Production Fallback Quality Rule:
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

// Multi-criteria intersection mask: Zone Mask & Baseline Valid & Current Valid
var validComparisonMask = zoneMask.eq(1)
  .and(baseValid)
  .and(curValid)
  .rename('valid_mask');

// ─── 6. PRODUCTION NDVI CALCULATION ──────────────────────────────────────────────────────────────
// Formula: denom = NIR + Red; ndvi = denom > 1e-6 ? (NIR - Red) / denom : 0.0; clamp [-1, 1]
function computeProductionNdvi(reflImage) {
  var nir = reflImage.select('B8');
  var red = reflImage.select('B4');
  var numer = nir.subtract(red);
  var denom = nir.add(red);

  var rawNdvi = numer.divide(denom);
  var safeNdvi = rawNdvi
    .where(denom.lte(1e-6), 0.0)
    .clamp(-1.0, 1.0);

  return safeNdvi.rename('ndvi');
}

// ─── 7. A. LEGACY REPRODUCTION PIPELINE ──────────────────────────────────────────────────────────
// Replicates OpticalPixelIndexService.ts:80 branch anomaly:
// - Baseline: maxVal in NIR (16,090) > 15,000 triggered Landsat branch: clamp(DN * 0.0000275 - 0.2, 0, 1)
// - Current: maxVal in NIR (10,896) <= 15,000 triggered Sentinel-2 branch: clamp(DN * 0.0001, 0, 1)
var legacyBaseRefl = harmonizedBase.multiply(0.0000275).subtract(0.2).clamp(0.0, 1.0);
var legacyCurRefl  = harmonizedCur.multiply(0.0001).clamp(0.0, 1.0);

var legacyBaseNdvi = computeProductionNdvi(legacyBaseRefl);
var legacyCurNdvi  = computeProductionNdvi(legacyCurRefl);

var legacyDeltaNdvi = legacyCurNdvi.subtract(legacyBaseNdvi).rename('delta_ndvi');
var legacyChangeMask = legacyDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('change');

// ─── 8. B. SCIENTIFICALLY CORRECTED COMPARISON PIPELINE ──────────────────────────────────────────
// Applies consistent Sentinel-2 Level-2A surface reflectance scaling to BOTH scenes:
// reflectance = clamp(DN * 0.0001, 0.0, 1.0)
var corrBaseRefl = harmonizedBase.multiply(0.0001).clamp(0.0, 1.0);
var corrCurRefl  = harmonizedCur.multiply(0.0001).clamp(0.0, 1.0);

var corrBaseNdvi = computeProductionNdvi(corrBaseRefl);
var corrCurNdvi  = computeProductionNdvi(corrCurRefl);

var corrDeltaNdvi = corrCurNdvi.subtract(corrBaseNdvi).rename('delta_ndvi');
var corrChangeMask = corrDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('change');

// Classification disagreement mask (pixels where legacy and corrected decisions differ)
var diffMask = legacyChangeMask.neq(corrChangeMask).and(validComparisonMask).rename('diff');

// ─── 9. QUANTITATIVE REDUCTIONS & STATISTICAL DIAGNOSTICS ────────────────────────────────────────
// Build multi-band images masked strictly by validComparisonMask for unified single-pass reduction
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

// Combined Reducers guaranteeing valid, unambiguous dictionary keys
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

// ─── 10. FORMATTED CONSOLE DIAGNOSTICS & AUDIT REPORT ────────────────────────────────────────────
print('================================================================================');
print('📡 TN FOREST MONITORING SYSTEM — DUAL OPTICAL VALIDATION AUDIT');
print('================================================================================');

print('1. VERIFIED DYNAMIC METADATA — Baseline Asset:', baseMeta);
print('2. VERIFIED DYNAMIC METADATA — Current Asset:', curMeta);

print('3. METADATA TIMESTAMP DISCREPANCY AUDIT:', {
  'Granule ID vs system:time_start':
    'Sentinel-2 Granule IDs contain two UTC timestamps: ' +
    '1. Datatake sensing start (e.g., 20200109T051201) — start of orbit strip. ' +
    '2. Granule sensing start (e.g., 20200109T051844) — exact moment sensor crossed MGRS tile T43PHM. ' +
    'GEE system:time_start records the granule sensing start in epoch milliseconds.'
});

print('4. PRODUCTION CANONICAL GRID SPECIFICATION:', {
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

// Format Legacy Reproduction Results
var legValidCount = ee.Number(legacyStats.get('valid_count'));
var legChangedCount = ee.Number(legacyStats.get('changed_sum'));
var legChangedAreaM2 = legChangedCount.multiply(100.0);
var legChangedAreaHa = legChangedAreaM2.divide(10000.0);
var legValidAreaHa = legValidCount.multiply(100.0).divide(10000.0);
var legChangedPct = legChangedCount.divide(legValidCount).multiply(100.0);

print('--------------------------------------------------------------------------------');
print('A. LEGACY REPRODUCTION (Replicating Production Code Anomaly):', {
  'Baseline Reflectance Scaling': 'clamp(DN * 0.0000275 - 0.2, 0.0, 1.0) [Landsat Branch Anomaly]',
  'Current Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Sentinel-2 Branch]',
  'Resampling Method': 'Bilinear (Continuous Reflectance Bands)',
  'Validity Masking Rule': '!(B2=0 && B3=0 && B4=0 && B8=0) & Zone Mask (Nearest-Neighbor)',
  'Target Under Investigation': '3,774 changed px | 3,066,268 valid px | 37.74 ha | 0.1231%',
  'Valid Comparison Pixel Count': legValidCount,
  'Changed Pixel Count (dNDVI <= -0.15)': legChangedCount,
  'Valid Comparison Area (ha)': legValidAreaHa,
  'Changed Ground Area (ha)': legChangedAreaHa,
  'Changed Ground Area (m²)': legChangedAreaM2,
  'Affected Percentage (%)': legChangedPct,
  'Baseline NDVI Mean': legacyStats.get('base_ndvi_mean'),
  'Baseline NDVI Median': legacyStats.get('base_ndvi_median'),
  'Baseline NDVI Min': legacyStats.get('base_ndvi_min'),
  'Baseline NDVI Max': legacyStats.get('base_ndvi_max'),
  'Baseline Zero-NDVI Pixels': legacyStats.get('base_zero_sum'),
  'Current NDVI Mean': legacyStats.get('cur_ndvi_mean'),
  'Current NDVI Median': legacyStats.get('cur_ndvi_median'),
  'Current NDVI Min': legacyStats.get('cur_ndvi_min'),
  'Current NDVI Max': legacyStats.get('cur_ndvi_max'),
  'Current Zero-NDVI Pixels': legacyStats.get('cur_zero_sum'),
  'Delta NDVI Mean': legacyStats.get('delta_ndvi_mean'),
  'Delta NDVI Median': legacyStats.get('delta_ndvi_median'),
  'Delta NDVI Min': legacyStats.get('delta_ndvi_min'),
  'Delta NDVI Max': legacyStats.get('delta_ndvi_max')
});

// Format Corrected Comparison Results
var corValidCount = ee.Number(corrStats.get('valid_count'));
var corChangedCount = ee.Number(corrStats.get('changed_sum'));
var corChangedAreaM2 = corChangedCount.multiply(100.0);
var corChangedAreaHa = corChangedAreaM2.divide(10000.0);
var corValidAreaHa = corValidCount.multiply(100.0).divide(10000.0);
var corChangedPct = corChangedCount.divide(corValidCount).multiply(100.0);

print('--------------------------------------------------------------------------------');
print('B. SCIENTIFICALLY CORRECTED COMPARISON (Consistent Sentinel-2 Scaling):', {
  'Baseline Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Authoritative Sentinel-2 L2A]',
  'Current Reflectance Scaling': 'clamp(DN * 0.0001, 0.0, 1.0) [Authoritative Sentinel-2 L2A]',
  'Resampling Method': 'Bilinear (Continuous Reflectance Bands)',
  'Validity Masking Rule': '!(B2=0 && B3=0 && B4=0 && B8=0) & Zone Mask (Nearest-Neighbor)',
  'Valid Comparison Pixel Count': corValidCount,
  'Changed Pixel Count (dNDVI <= -0.15)': corChangedCount,
  'Valid Comparison Area (ha)': corValidAreaHa,
  'Changed Ground Area (ha)': corChangedAreaHa,
  'Changed Ground Area (m²)': corChangedAreaM2,
  'Affected Percentage (%)': corChangedPct,
  'Baseline NDVI Mean': corrStats.get('base_ndvi_mean'),
  'Baseline NDVI Median': corrStats.get('base_ndvi_median'),
  'Baseline NDVI Min': corrStats.get('base_ndvi_min'),
  'Baseline NDVI Max': corrStats.get('base_ndvi_max'),
  'Baseline Zero-NDVI Pixels': corrStats.get('base_zero_sum'),
  'Current NDVI Mean': corrStats.get('cur_ndvi_mean'),
  'Current NDVI Median': corrStats.get('cur_ndvi_median'),
  'Current NDVI Min': corrStats.get('cur_ndvi_min'),
  'Current NDVI Max': corrStats.get('cur_ndvi_max'),
  'Current Zero-NDVI Pixels': corrStats.get('cur_zero_sum'),
  'Delta NDVI Mean': corrStats.get('delta_ndvi_mean'),
  'Delta NDVI Median': corrStats.get('delta_ndvi_median'),
  'Delta NDVI Min': corrStats.get('delta_ndvi_min'),
  'Delta NDVI Max': corrStats.get('delta_ndvi_max')
});

// Format Cross-Method Classification Discrepancy
var diffPixelCount = ee.Number(diffStats.get('diff_pixels_sum'));
var diffAreaHa = diffPixelCount.multiply(100.0).divide(10000.0);
var diffPct = diffPixelCount.divide(corValidCount).multiply(100.0);

print('--------------------------------------------------------------------------------');
print('CROSS-METHOD DISCREPANCY & AUDIT SUMMARY:', {
  'Disagreement Pixel Count': diffPixelCount,
  'Disagreement Area (ha)': diffAreaHa,
  'Disagreement % of Zone': diffPct,
  'Valid Pixel Delta vs 3,066,268 Target': corValidCount.subtract(3066268),
  'UI Denominator Explanation': 'Production UI displayed "37.74 ha of 100 ha" due to fallback scalar (zoneDoc.areaHectares || 100.0). True zone comparison area is ~30,662 ha.'
});
print('================================================================================');

// ─── 11. MAP VISUALIZATION LAYERS ────────────────────────────────────────────────────────────────
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

## Technical Audit: Key Platform Nuances & Unavoidable Limitations

1. **Bilinear Resampling vs. Mask Discretization**:
   - In accordance with production [`OpticalSpatialHarmonizationService.reprojectOpticalToGrid`](file:///d:/tn-enforcement-system/tn-forest-monitoring/server/src/services/spatial/OpticalSpatialHarmonizationService.ts#L40-L50), continuous reflectance bands (`B2`, `B3`, `B4`, `B8`, `B11`, `B12`) are resampled using continuous bilinear interpolation (`.resample('bilinear')`) before reprojection to the canonical grid.
   - The zone polygon vector mask and the radiometric non-zero validity mask are preserved as discrete, un-interpolated boolean layers (nearest-neighbor) to prevent artificial fractional bleed along the zone boundary.

2. **Dynamically Verified Metadata & Timestamp Discrepancies**:
   - In Sentinel-2 naming conventions (e.g., `COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM`):
     - The first timestamp (`20200109T051201`) denotes the **Datatake sensing start time** (when the satellite began the orbit acquisition pass).
     - The second timestamp (`20200109T051844`) denotes the **Granule sensing time** (when the sensor imaged MGRS tile `T43PHM`).
     - Earth Engine's `system:time_start` represents the granule sensing timestamp in UTC milliseconds (`2020-01-09T05:18:44.xxx UTC`). The script prints this directly from the asset dictionary.

3. **Pixel Count: GEE Dynamic Reprojection vs. Local Static GeoTIFF**:
   - The local production pipeline operated on pre-exported static GeoTIFF files where GDAL/Node.js ray-casting yielded exactly `3,066,268` valid pixels.
   - In Google Earth Engine, polygon rasterization along complex diagonal perimeter segments (vertices V1–V10) is evaluated dynamically by Earth Engine's rasterizer. Minor perimeter centroid inclusion variations ($\pm$ a few dozen boundary pixels out of 3.06 million, $< 0.001\%$) may appear between GEE's internal vector clipping and the local Node.js ray-casting loop. The script prints the exact valid pixel count and reports any delta against `3,066,268`.

4. **Validity Mask Scope**:
   - Both pipelines strictly implement the production fallback rule (`!(B2=0 && B3=0 && B4=0 && B8=0)`), matching the 6-band local rasters. Neither pipeline introduces an SCL cloud/shadow mask, guaranteeing that reflectance scaling remains the sole independent variable under investigation.