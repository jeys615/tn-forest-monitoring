Investigating Test 14 to understand Sentinel-2 reflectance scaling. This requires examining how the `HarmonizedOpticalRaster` is handled. The current code likely includes a `mockHarmonizedCur` for Sentinel-2 data and its scaling.


Test 14's reliance on a uniform DN value of 2500 for all pixels resulted in an incomplete assessment of the reflectance normalization. The normalization logic uses `maxVal` to scale the data, but Test 14 never evaluated DN values exceeding 15000, which are common in real-world scenes. This omission explains why the edge case involving high DN values (e.g., cloud saturation) was undetected in the existing tests.
Examining other tests, `hls-comparison.test.ts` uses a `mockHarmonizedS30` raster and calls the reflectance normalization function, but specifically for HLS-S30 data, and does not seem to test Sentinel-2 DN values directly. The analysis will now broaden to investigate if any test incorporates and tests Sentinel-2 DN scaling.


The normalization logic incorrectly flags Sentinel-2 data for Landsat scaling if any NIR DN exceeds 15000. This threshold is problematic because Sentinel-2 scenes can naturally contain NIR values above 15000, especially in areas with high vegetation or bright surfaces like clouds. This heuristic misclassifies Sentinel-2 data, leading to incorrect reflectance scaling. The `isLandsat` variable's evaluation needs to consider a more robust and source-specific approach.


The current logic's `isLandsat` determination hinges on a simple `maxVal` threshold, leading to incorrect Landsat flag assignment for Sentinel-2 data when a pixel exceeds 15000 DN. This causes reflectance values to be scaled incorrectly. The application of the Landsat scaling formula to Sentinel-2 DN values results in negative reflectance values, especially in vegetated areas, which are then clamped to zero. This leads to complete NDVI collapse. The heuristic's reliance on `maxVal` makes Sentinel-2 processing non-deterministic because a single cloud or bright pixel can trigger incorrect scaling.


The reflectance normalization's problematic `isLandsat` logic appears in multiple codebase locations: change detection, monitoring, HLS comparison, spectral index calculation, and preview generation. This indicates a pervasive issue with the heuristic. The `SensorNormalizationService`, though correct, was bypassed in newer pipelines, highlighting the need for a unified solution.

The correction requires replacing the pixel value threshold with a sensor-specific metadata check, such as inspecting the raster's satellite name. This will ensure proper scaling and classification based on the data source, improving accuracy and removing non-determinism. Standardizing sensor identification across the code will be crucial for maintainability.


A robust solution involves implementing sensor-specific scaling using the raster metadata. This entails applying distinct scaling formulas for Landsat, HLS, and Sentinel-2 data based on the identified satellite source. Existing scaling logic should be refactored to prioritize satellite metadata over heuristics like the maximum pixel value.

The proposed regression tests will validate the correct application of these scaling factors and also confirm correct index calculations. Test cases will encompass scenarios with varying digital number values, including bright, saturated pixels, pre-normalized data, and distinct raster types (Landsat, Sentinel-2, and HLS) to ensure that correct reflectance values are obtained. The tests will extend to NDVI, NDWI, and NDBI calculations with realistic input values.


A new edge case involves the NDVI calculation where near-zero denominators lead to erroneous zero values; this needs a targeted test case. The regression tests will include a Sentinel-2 pair, with a bright cloud in the baseline, to verify accurate NDVI calculations and change detection results.

The corrected external results will serve as diagnostic evidence. The local pixel count will be independently calculated and not forced to match the external benchmark, accounting for pipeline-specific differences.

The final step is to prepare a read-only report including the affected files, root cause analysis, proposed code modifications, and a comprehensive test plan for regression validation.


