/**
 * =================================================================================================
 * TAMIL NADU FOREST ENFORCEMENT & MONITORING SYSTEM
 * DUAL-LEVEL CLOUD & SHADOW MASKING VALIDATION EXPERIMENT (GEE SCL SUITE)
 * =================================================================================================
 *
 * Source Assets:
 *   - Baseline Image: COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM
 *   - Current Image:  COPERNICUS/S2_SR_HARMONIZED/20240207T050959_20240207T051829_T43PHM
 * Monitored Zone:
 *   - ZONE-261011-6340 (Sirumalai / 'test zone 57')
 *
 * OBJECTIVE:
 *   Quantify the impact of ESA/Sen2Cor Scene Classification Layer (SCL) cloud/shadow masking
 *   on the validated optical disturbance baseline (Control: 3,066,268 valid px, 136,709 changed px).
 *
 * SCL QUALITY FILTER RULES (Nearest-Neighbor Resampling to 10m Canonical Grid):
 *   - Masked / Excluded Classes:
 *       Class 1:  Saturated / defective pixel
 *       Class 3:  Cloud shadows
 *       Class 8:  Cloud medium probability
 *       Class 9:  Cloud high probability
 *       Class 10: Thin cirrus
 *       Class 11: Snow / Ice
 *   - Retained / Clear Classes:
 *       Class 2:  Dark area pixels
 *       Class 4:  Vegetation
 *       Class 5:  Non-vegetated (bare ground)
 *       Class 6:  Water
 *       Class 7:  Unclassified
 * =================================================================================================
 */

// ─── 1. MONITORED ZONE BOUNDARY ──────────────────────────────────────────────────────────────────
var zoneCoords = [
  [77.9894489403392, 10.299362275406638],
  [77.91732345319646, 10.238635598046182],
  [77.93174855062499, 10.148873794825437],
  [77.95853801727802, 10.13132342563887],
  [77.95922492667938, 10.112421953733723],
  [77.06569588389009, 10.127273203956566],
  [78.11996172659744, 10.167098159692666],
  [78.11309263258389, 10.199494462762104],
  [78.03547187023025, 10.280470781358266],
  [77.9894489403392, 10.299362275406638]
];
var zonePolygon = ee.Geometry.Polygon([zoneCoords], 'EPSG:4326', false);

// ─── 2. CANONICAL ANALYSIS GRID ──────────────────────────────────────────────────────────────────
var targetCrs = 'EPSG:32643';
var canonicalTransform = [10, 0, 819510, 0, -10, 1140140];
var gridCols = 2251;
var gridRows = 2093;
var gridEnvelope = ee.Geometry.Rectangle([819510, 1119210, 842020, 1140140], targetCrs, false);

var zoneMask = ee.Image.constant(1)
  .clip(zonePolygon)
  .reproject({ crs: targetCrs, crsTransform: canonicalTransform })
  .unmask(0);

// ─── 3. LOAD SOURCE ASSETS ───────────────────────────────────────────────────────────────────────
var rawBase = ee.Image('COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM');
var rawCur  = ee.Image('COPERNICUS/S2_SR_HARMONIZED/20240207T050959_20240207T051829_T43PHM');

// ─── 4. SPATIAL HARMONIZATION & RESAMPLING ───────────────────────────────────────────────────────
// Reflectance bands: Bilinear interpolation
var continuousBands = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];
var harmBaseRefl = rawBase.select(continuousBands).resample('bilinear')
  .reproject({ crs: targetCrs, crsTransform: canonicalTransform });
var harmCurRefl  = rawCur.select(continuousBands).resample('bilinear')
  .reproject({ crs: targetCrs, crsTransform: canonicalTransform });

// Discrete SCL band: Nearest-neighbor interpolation
var harmBaseScl = rawBase.select('SCL')
  .reproject({ crs: targetCrs, crsTransform: canonicalTransform });
var harmCurScl  = rawCur.select('SCL')
  .reproject({ crs: targetCrs, crsTransform: canonicalTransform });

// ─── 5. CONTROL VALIDITY MASK (UNMASKED BASELINE) ────────────────────────────────────────────────
function getRadiometricMask(img) {
  var b2 = img.select('B2'), b3 = img.select('B3'), b4 = img.select('B4'), b8 = img.select('B8');
  var notAllZero = b2.neq(0).or(b3.neq(0)).or(b4.neq(0)).or(b8.neq(0));
  var hasData = b2.mask().and(b3.mask()).and(b4.mask()).and(b8.mask());
  return notAllZero.and(hasData);
}

var controlMask = zoneMask.eq(1)
  .and(getRadiometricMask(harmBaseRefl))
  .and(getRadiometricMask(harmCurRefl))
  .rename('control_valid');

// ─── 6. SCL CLOUD & SHADOW MASKS ─────────────────────────────────────────────────────────────────
// Exclude SCL classes: 1 (Defective), 3 (Shadow), 8 (Cloud Med), 9 (Cloud High), 10 (Cirrus), 11 (Snow)
function getSclCloudMask(sclImg) {
  return sclImg.eq(8).or(sclImg.eq(9)).or(sclImg.eq(10)).rename('cloud');
}

function getSclShadowMask(sclImg) {
  return sclImg.eq(3).rename('shadow');
}

function getSclClearMask(sclImg) {
  // Clear is classes 2, 4, 5, 6, 7
  return sclImg.eq(2).or(sclImg.eq(4)).or(sclImg.eq(5)).or(sclImg.eq(6)).or(sclImg.eq(7)).rename('clear');
}

var baseCloud = getSclCloudMask(harmBaseScl);
var baseShadow = getSclShadowMask(harmBaseScl);
var baseClear = getSclClearMask(harmBaseScl);

var curCloud = getSclCloudMask(harmCurScl);
var curShadow = getSclShadowMask(harmCurScl);
var curClear = getSclClearMask(harmCurScl);

// Multi-Temporal SCL Clear Mask
var treatmentMask = controlMask.and(baseClear).and(curClear).rename('scl_valid');

// ─── 7. SPECTRAL INDICES & CANOPY DISTURBANCE ─────────────────────────────────────────────────────
function computeSafeNdvi(reflImg) {
  var nir = reflImg.select('B8').multiply(0.0001).clamp(0.0, 1.0);
  var red = reflImg.select('B4').multiply(0.0001).clamp(0.0, 1.0);
  var numer = nir.subtract(red);
  var denom = nir.add(red);
  var safeDenom = denom.where(denom.lte(1e-6), 1.0);
  return numer.divide(safeDenom).where(denom.lte(1e-6), 0.0).clamp(-1.0, 1.0).rename('ndvi');
}

var baseNdvi = computeSafeNdvi(harmBaseRefl);
var curNdvi  = computeSafeNdvi(harmCurRefl);
var deltaNdvi = curNdvi.subtract(baseNdvi).rename('delta_ndvi');

// Disturbance Masks (Loss <= -0.15)
var controlDisturbance = deltaNdvi.lte(-0.15).and(controlMask).rename('control_loss');
var treatmentDisturbance = deltaNdvi.lte(-0.15).and(treatmentMask).rename('treatment_loss');

// Overlap: Original disturbance pixels removed by SCL masking
var removedDisturbance = controlDisturbance.and(treatmentMask.not()).rename('removed_loss');

// ─── 8. FAST STREAMING REDUCTIONS ────────────────────────────────────────────────────────────────
// 1. Discrete Pixel Counts
var countComposite = ee.Image.cat([
  controlMask.rename('control_valid'),
  treatmentMask.rename('treatment_valid'),
  controlDisturbance.rename('control_loss'),
  treatmentDisturbance.rename('treatment_loss'),
  removedDisturbance.rename('removed_loss'),
  baseCloud.and(controlMask).rename('base_cloud'),
  baseShadow.and(controlMask).rename('base_shadow'),
  curCloud.and(controlMask).rename('cur_cloud'),
  curShadow.and(controlMask).rename('cur_shadow')
]);

var pixelCounts = countComposite.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: gridEnvelope,
  crs: targetCrs,
  crsTransform: canonicalTransform,
  maxPixels: 1e9,
  bestEffort: false,
  tileScale: 4
});

// 2. Control Continuous NDVI Zonal Means
var controlMeans = ee.Image.cat([
  baseNdvi.rename('control_base_mean'),
  curNdvi.rename('control_cur_mean'),
  deltaNdvi.rename('control_delta_mean')
]).updateMask(controlMask).reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: gridEnvelope,
  crs: targetCrs,
  crsTransform: canonicalTransform,
  maxPixels: 1e9,
  bestEffort: false,
  tileScale: 4
});

// 3. Treatment Continuous NDVI Zonal Means
var treatmentMeans = ee.Image.cat([
  baseNdvi.rename('treat_base_mean'),
  curNdvi.rename('treat_cur_mean'),
  deltaNdvi.rename('treat_delta_mean')
]).updateMask(treatmentMask).reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: gridEnvelope,
  crs: targetCrs,
  crsTransform: canonicalTransform,
  maxPixels: 1e9,
  bestEffort: false,
  tileScale: 4
});

// ─── 9. FORMATTED REPORTING ──────────────────────────────────────────────────────────────────────
print('================================================================================');
print('GEE CLOUD/SHADOW SCL VALIDATION EXPERIMENT REPORT');
print('================================================================================');
print('RAW COUNTS DICTIONARY:', pixelCounts);
print('RAW CONTROL MEANS DICTIONARY:', controlMeans);
print('RAW TREATMENT MEANS DICTIONARY:', treatmentMeans);

var cValid = ee.Number(pixelCounts.get('control_valid'));
var tValid = ee.Number(pixelCounts.get('treatment_valid'));
var cLoss  = ee.Number(pixelCounts.get('control_loss'));
var tLoss  = ee.Number(pixelCounts.get('treatment_loss'));
var rLoss  = ee.Number(pixelCounts.get('removed_loss'));

print('--------------------------------------------------------------------------------');
print('VALIDATION SUMMARY COMPARISON:', {
  'Control Valid Pixels': cValid,
  'Control Valid Area (ha)': cValid.multiply(100).divide(10000),
  'Treatment (SCL) Valid Pixels': tValid,
  'Treatment (SCL) Valid Area (ha)': tValid.multiply(100).divide(10000),
  'Masked Area Reduction (%)': cValid.subtract(tValid).divide(cValid).multiply(100),
  'Control Disturbance Candidates': cLoss,
  'Treatment Disturbance Candidates': tLoss,
  'Candidate Reduction (%)': cLoss.subtract(tLoss).divide(cLoss).multiply(100),
  'Contaminated Candidates Removed': rLoss
});
print('================================================================================');
