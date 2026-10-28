```javascript
/**
 * =================================================================================================
 * TAMIL NADU FOREST ENFORCEMENT & MONITORING SYSTEM
 * DUAL-RESULT GOOGLE EARTH ENGINE (GEE) INDEPENDENT VALIDATION SCRIPT
 * =================================================================================================
 *
 * Source of Truth: PRODUCTION_OPTICAL_ALGORITHM_FORENSIC_REPORT.md
 * Target Case: Record CHG-1791696357291-3501 (Zone ZONE-261011-6340 / Sirumalai 'test zone 57')
 *
 * OBJECTIVE:
 * Compare:
 *   A. LEGACY REPRODUCTION — Replicates the production application's exact raster scaling,
 *      including the Baseline Landsat-scaling branch anomaly (DN * 0.0000275 - 0.2), Current
 *      Sentinel-2 scaling (DN * 0.0001), exact NDVI formula, and canopy drop rule (dNDVI <= -0.15).
 *      Target under investigation: 3,774 changed pixels (37.74 ha, 0.1231% of valid grid).
 *
 *   B. SCIENTIFICALLY CORRECTED COMPARISON — Applies authentic Sentinel-2 surface reflectance
 *      scaling (DN * 0.0001 clamped to [0, 1]) consistently to BOTH scenes on the identical grid
 *      and validity mask, isolating reflectance calibration as the primary independent variable.
 *
 * STRICT SAFEGUARDS:
 * - Uses exact canonical AnalysisGrid: EPSG:32643, 10m resolution, origin [819510, 1140140].
 * - Uses exact 6-band production validity mask: rejects pixels where B2=B3=B4=B8=0.
 * - Does NOT hardcode the UI 100 ha denominator; computes ground areas from the physical grid.
 * =================================================================================================
 */

// ─── 1. MONITORED ZONE DEFINITION ────────────────────────────────────────────────────────────────
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
// CRS: EPSG:32643 (UTM Zone 43N)
// Origin: [X0 = 819510, Y0 = 1140140]
// Extent: Width = 2251 pixels (819510 to 842020), Height = 2093 pixels (1119210 to 1140140)
// GDAL Affine Transform: [819510, 10, 0, 1140140, 0, -10]
// GEE crsTransform: [xScale, xShear, xOrigin, yShear, yScale, yOrigin]
var crs = 'EPSG:32643';
var crsTransform = [10, 0, 819510, 0, -10, 1140140];
var gridEnvelope = ee.Geometry.Rectangle([819510, 1119210, 842020, 1140140], 'EPSG:32643', false);

// ─── 3. LOAD AUTHENTIC SATELLITE SCENES ──────────────────────────────────────────────────────────
var baselineId = 'COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM';
var currentId  = 'COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM';

var rawBase = ee.Image(baselineId);
var rawCur  = ee.Image(currentId);

// Align raw images to the production AnalysisGrid
var alignedBase = rawBase.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']).reproject({
  crs: crs,
  crsTransform: crsTransform
});

var alignedCur = rawCur.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']).reproject({
  crs: crs,
  crsTransform: crsTransform
});

// ─── 4. PRODUCTION VALIDITY & BOUNDARY INTERSECTION MASK ─────────────────────────────────────────
// Production Fallback Rule: Pixel rejected only if all 4 key bands (B2, B3, B4, B8) are 0.
// Intersected with the rasterized vector polygon boundary.
var zoneMask = ee.Image(0).paint({
  featureCollection: ee.FeatureCollection([ee.Feature(zonePolygon)]),
  color: 1
}).reproject({
  crs: crs,
  crsTransform: crsTransform
});

var baseRadiometricValid = alignedBase.select('B2').neq(0)
  .or(alignedBase.select('B3').neq(0))
  .or(alignedBase.select('B4').neq(0))
  .or(alignedBase.select('B8').neq(0))
  .and(alignedBase.select('B8').mask());

var curRadiometricValid = alignedCur.select('B2').neq(0)
  .or(alignedCur.select('B3').neq(0))
  .or(alignedCur.select('B4').neq(0))
  .or(alignedCur.select('B8').neq(0))
  .and(alignedCur.select('B8').mask());

var validComparisonMask = zoneMask.eq(1)
  .and(baseRadiometricValid)
  .and(curRadiometricValid)
  .rename('valid_mask');

// ─── 5. CORE HELPER: PRODUCTION NDVI IMPLEMENTATION ──────────────────────────────────────────────
// Formula: denom = NIR + Red; ndvi = denom > 1e-6 ? (NIR - Red) / denom : 0.0; clamped to [-1, 1].
function computeProductionNdvi(reflImage) {
  var nir = reflImage.select('B8');
  var red = reflImage.select('B4');
  var numer = nir.subtract(red);
  var denom = nir.add(red);
  
  var ndvi = numer.divide(denom)
    .where(denom.lte(1e-6), 0.0)
    .clamp(-1.0, 1.0);
  
  return ndvi.rename('ndvi');
}

// ─── 6. A. LEGACY REPRODUCTION PIPELINE ──────────────────────────────────────────────────────────
// Replicates OpticalPixelIndexService.ts:70-112 branch anomaly:
// - Baseline: maxVal in NIR (16,090) > 15,000 triggered Landsat branch: clamp(DN * 0.0000275 - 0.2, 0, 1)
// - Current: maxVal in NIR (10,896) <= 15,000 triggered Sentinel-2 branch: clamp(DN * 0.0001, 0, 1)
var legacyBaseRefl = alignedBase.multiply(0.0000275).subtract(0.2).clamp(0.0, 1.0);
var legacyCurRefl  = alignedCur.multiply(0.0001).clamp(0.0, 1.0);

var legacyBaseNdvi = computeProductionNdvi(legacyBaseRefl);
var legacyCurNdvi  = computeProductionNdvi(legacyCurRefl);

// Temporal differencing: deltaNDVI = Current - Baseline
var legacyDeltaNdvi = legacyCurNdvi.subtract(legacyBaseNdvi).rename('delta_ndvi');

// Canopy loss classification: deltaNDVI <= -0.15
var legacyChangeMask = legacyDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('change');

// ─── 7. B. SCIENTIFICALLY CORRECTED COMPARISON PIPELINE ──────────────────────────────────────────
// Applies consistent Sentinel-2 Level-2A surface reflectance scaling to BOTH scenes:
// reflectance = clamp(DN * 0.0001, 0.0, 1.0)
var corrBaseRefl = alignedBase.multiply(0.0001).clamp(0.0, 1.0);
var corrCurRefl  = alignedCur.multiply(0.0001).clamp(0.0, 1.0);

var corrBaseNdvi = computeProductionNdvi(corrBaseRefl);
var corrCurNdvi  = computeProductionNdvi(corrCurRefl);

var corrDeltaNdvi = corrCurNdvi.subtract(corrBaseNdvi).rename('delta_ndvi');
var corrChangeMask = corrDeltaNdvi.lte(-0.15).and(validComparisonMask).rename('change');

// Classification disagreement mask
var diffMask = legacyChangeMask.neq(corrChangeMask).and(validComparisonMask).rename('diff');

// ─── 8. QUANTITATIVE REDUCTIONS & STATISTICAL DIAGNOSTICS ────────────────────────────────────────
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

var combinedReducers = ee.Reducer.mean()
  .combine({ reducer2: ee.Reducer.median(), sharedInputs: true })
  .combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true })
  .combine({ reducer2: ee.Reducer.sum(), sharedInputs: true })
  .combine({ reducer2: ee.Reducer.count(), sharedInputs: true });

var legacyStats = legacyComposite.reduceRegion({
  reducer: combinedReducers,
  geometry: gridEnvelope,
  crs: crs,
  crsTransform: crsTransform,
  maxPixels: 1e9,
  tileScale: 4
});

var corrStats = corrComposite.reduceRegion({
  reducer: combinedReducers,
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

// ─── 9. FORMAT AND PRINT DIAGNOSTIC RESULTS TO CONSOLE ───────────────────────────────────────────
print('================================================================================');
print('🔍 TAMIL NADU FOREST MONITORING SYSTEM — DUAL OPTICAL VALIDATION REPORT');
print('================================================================================');

print('SCENE & GRID SPECIFICATIONS:', {
  'Zone Code': 'ZONE-261011-6340 (test zone 57 / Sirumalai)',
  'Baseline Scene': baselineId,
  'Baseline Acquisition': '2020-01-09T05:12:01 UTC',
  'Current Scene': currentId,
  'Current Acquisition': '2024-02-07T05:10:01 UTC',
  'Canonical CRS': crs,
  'Resolution': '10.0 m x 10.0 m',
  'Grid Origin': '[819510, 1140140]',
  'Grid Dimensions': '2251 cols x 2093 rows (4,711,343 total cells)'
});

// Format Legacy Reproduction Table
var legValidCount = ee.Number(legacyStats.get('valid_count'));
var legChangedCount = ee.Number(legacyStats.get('changed_sum'));
var legChangedAreaM2 = legChangedCount.multiply(100.0);
var legChangedAreaHa = legChangedAreaM2.divide(10000.0);
var legValidAreaHa = legValidCount.multiply(100.0).divide(10000.0);
var legChangedPct = legChangedCount.divide(legValidCount).multiply(100.0);

print('--------------------------------------------------------------------------------');
print('A. LEGACY REPRODUCTION (Replicating Production Code Anomaly):', {
  'Baseline Scaling': 'DN * 0.0000275 - 0.2 (Landsat branch, triggered by maxVal > 15000)',
  'Current Scaling': 'DN * 0.0001 (Sentinel-2 branch)',
  'Target Under Investigation': '3,774 changed px | 3,066,268 valid px | 37.74 ha | 0.1231%',
  'Valid Comparison Pixels': legValidCount,
  'Changed Pixels (Loss <= -0.15)': legChangedCount,
  'Valid Comparison Area (ha)': legValidAreaHa,
  'Changed Area (ha)': legChangedAreaHa,
  'Changed Area (m²)': legChangedAreaM2,
  'Affected Percentage (%)': legChangedPct,
  'Baseline NDVI Mean': legacyStats.get('base_ndvi_mean'),
  'Baseline NDVI Median': legacyStats.get('base_ndvi_median'),
  'Baseline NDVI Min / Max': ee.List([legacyStats.get('base_ndvi_min'), legacyStats.get('base_ndvi_max')]),
  'Baseline Zero-NDVI Pixels': legacyStats.get('base_zero_sum'),
  'Current NDVI Mean': legacyStats.get('cur_ndvi_mean'),
  'Current NDVI Median': legacyStats.get('cur_ndvi_median'),
  'Current NDVI Min / Max': ee.List([legacyStats.get('cur_ndvi_min'), legacyStats.get('cur_ndvi_max')]),
  'Current Zero-NDVI Pixels': legacyStats.get('cur_zero_sum'),
  'Delta NDVI Mean': legacyStats.get('delta_ndvi_mean'),
  'Delta NDVI Median': legacyStats.get('delta_ndvi_median')
});

// Format Corrected Comparison Table
var corValidCount = ee.Number(corrStats.get('valid_count'));
var corChangedCount = ee.Number(corrStats.get('changed_sum'));
var corChangedAreaM2 = corChangedCount.multiply(100.0);
var corChangedAreaHa = corChangedAreaM2.divide(10000.0);
var corValidAreaHa = corValidCount.multiply(100.0).divide(10000.0);
var corChangedPct = corChangedCount.divide(corValidCount).multiply(100.0);

print('--------------------------------------------------------------------------------');
print('B. SCIENTIFICALLY CORRECTED COMPARISON (Consistent Sentinel-2 Scaling):', {
  'Baseline Scaling': 'DN * 0.0001 clamped [0, 1] (Authoritative Sentinel-2 L2A)',
  'Current Scaling': 'DN * 0.0001 clamped [0, 1] (Authoritative Sentinel-2 L2A)',
  'Valid Comparison Pixels': corValidCount,
  'Changed Pixels (Loss <= -0.15)': corChangedCount,
  'Valid Comparison Area (ha)': corValidAreaHa,
  'Changed Area (ha)': corChangedAreaHa,
  'Changed Area (m²)': corChangedAreaM2,
  'Affected Percentage (%)': corChangedPct,
  'Baseline NDVI Mean': corrStats.get('base_ndvi_mean'),
  'Baseline NDVI Median': corrStats.get('base_ndvi_median'),
  'Baseline NDVI Min / Max': ee.List([corrStats.get('base_ndvi_min'), corrStats.get('base_ndvi_max')]),
  'Baseline Zero-NDVI Pixels': corrStats.get('base_zero_sum'),
  'Current NDVI Mean': corrStats.get('cur_ndvi_mean'),
  'Current NDVI Median': corrStats.get('cur_ndvi_median'),
  'Current NDVI Min / Max': ee.List([corrStats.get('cur_ndvi_min'), corrStats.get('cur_ndvi_max')]),
  'Current Zero-NDVI Pixels': corrStats.get('cur_zero_sum'),
  'Delta NDVI Mean': corrStats.get('delta_ndvi_mean'),
  'Delta NDVI Median': corrStats.get('delta_ndvi_median')
});

// Format Cross-Method Discrepancy
var diffPixelCount = ee.Number(diffStats.get('diff_pixels_sum'));
var diffAreaHa = diffPixelCount.multiply(100.0).divide(10000.0);
var diffPct = diffPixelCount.divide(corValidCount).multiply(100.0);

print('--------------------------------------------------------------------------------');
print('CROSS-METHOD COMPARISON & DISCREPANCY AUDIT:', {
  'Disagreement Pixel Count': diffPixelCount,
  'Disagreement Area (ha)': diffAreaHa,
  'Disagreement Percentage of Zone': diffPct,
  'UI Denominator Finding': 'Production UI displayed "37.74 ha of 100 ha" due to fallback scalar (zoneDoc.areaHectares || 100.0). True zone area is ~30,662 ha.'
});
print('================================================================================');

// ─── 10. MAP DISPLAY & VISUALIZATION LAYERS ──────────────────────────────────────────────────────
Map.centerObject(zonePolygon, 11);

var ndviVis = {
  min: -0.2,
  max: 0.9,
  palette: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#1a9850']
};

// 1. Natural Color RGBs
Map.addLayer(alignedBase.select(['B4', 'B3', 'B2']), {min: 0, max: 2500, gamma: 1.2}, '1. Baseline True Color (2020-01-09)', false);
Map.addLayer(alignedCur.select(['B4', 'B3', 'B2']),  {min: 0, max: 2500, gamma: 1.2}, '2. Current True Color (2024-02-07)', false);

// 2. NDVI Layers
Map.addLayer(legacyBaseNdvi.updateMask(validComparisonMask), ndviVis, '3. Legacy Baseline NDVI (Anomalous Scaling ~0)', false);
Map.addLayer(corrBaseNdvi.updateMask(validComparisonMask),   ndviVis, '4. Corrected Baseline NDVI (S2 0.0001)', false);
Map.addLayer(corrCurNdvi.updateMask(validComparisonMask),    ndviVis, '5. Current NDVI (2024-02-07)', false);

// 3. Change Classification Masks
Map.addLayer(legacyChangeMask.updateMask(legacyChangeMask), {palette: ['#dc2626']}, '6. Legacy Change Mask (Loss <= -0.15)', true);
Map.addLayer(corrChangeMask.updateMask(corrChangeMask),     {palette: ['#ea580c']}, '7. Corrected Change Mask (Loss <= -0.15)', true);

// 4. Difference & Vector Outline
Map.addLayer(diffMask.updateMask(diffMask), {palette: ['#facc15']}, '8. Classification Disagreement (Legacy != Corrected)', true);
Map.addLayer(ee.Image().paint(zonePolygon, 0, 2), {palette: ['#06b6d4']}, '9. Monitored Zone Boundary (Sirumalai)', true);
```

---

## Technical Context & Unavoidable Platform Nuances

1. **Online Tile Pyramids vs. Pre-Exported GeoTIFFs**:
   - The production server operated on static local GeoTIFF files previously exported from GEE to Google Drive.
   - When running directly within the GEE Code Editor, Earth Engine evaluates `COPERNICUS/S2_SR_HARMONIZED` assets dynamically. While the `crsTransform: [10, 0, 819510, 0, -10, 1140140]` parameter forces the exact 10 m pixel centers, minor 1–2 pixel boundary variations may occur along the perimeter due to differences between GEE's internal vector-to-raster clipping and Node.js ray-casting ([`AnalysisGridService.rasterizePolygon`](file:///d:/tn-enforcement-system/tn-forest-monitoring/server/src/services/spatial/AnalysisGridService.ts#L102-L162)).

2. **Quality Mask Scope**:
   - As documented in the forensic report, the local GeoTIFFs lacked an SCL quality band. To isolate reflectance scaling as the single independent variable, both the Legacy and Corrected pipelines implement the production radiometric fallback (`B2 != 0 || B3 != 0 || B4 != 0 || B8 != 0`).
   - Neither pipeline applies full Scene Classification (SCL) cloud or shadow filtering.

3. **Why Legacy Baseline Vegetation Clamped to Zero**:
   - In `OpticalPixelIndexService.ts:80`, the condition `maxVal > 15000` routed the 2020 Sentinel-2 raster into the Landsat formula ($DN \times 0.0000275 - 0.2$). For normal Sentinel-2 vegetation canopy values ($DN \approx 2000 - 4000$), this produced negative reflectance values which clamped to `0.0`.
   - The Legacy reproduction above explicitly replicates this scaling path, allowing you to observe the exact mechanism that suppressed baseline NDVI to `0.0018` and caused the reported $0.1231\%$ change rate.