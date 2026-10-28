# Real-Raster Before-and-After Validation Exhibit Report

**System:** Tamil Nadu Forest Monitoring System  
**Target Zone:** ZONE-261011-6340 (test zone 57)  
**Target Detection Record:** CHG-1791696357291-3501 (MongoDB ObjectId: `6acb1de59ee540ec5f7060de`)  
**Operating State:** `CANOPY_GUARD_MODE=SHADOW` (Algorithm v2.0 remains official classification authority)  
**Selected Validation Feature:** `POLY-CHG-1791696357291-3501-033` (MultiPolygon Index: 32)  
**Report Generated:** 2026-10-20T05:56:46.596Z  

---

## 1. Executive Summary & Verification Claims

This report establishes the empirical before-and-after satellite raster evidence for change detection `CHG-1791696357291-3501` in Sirumalai Hills.

### Three Rigorous Evidentiary Boundaries:
1. **Software execution verified [CONFIRMED]:** The existing operational pipeline successfully ingested, harmonized, and processed real Copernicus Sentinel-2 L2A GeoTIFFs without synthetic or mock data.
2. **Spectral change reproduced [CONFIRMED]:** Polygon `POLY-CHG-1791696357291-3501-033` contains genuine, measurable vegetation spectral loss between January 9, 2020 and February 7, 2024. Specifically, **25 out of 36 valid pixels (69.4%)** cross the production disturbance threshold of $\Delta\text{NDVI} \le -0.15$, reaching a peak deficit of $\Delta\text{NDVI} = -0.426$.
3. **Ground-truth deforestation confirmed [UNVERIFIED / CAVEAT]:** While physical spectral reflectance decreased substantially, satellite spectral change alone cannot prove legal forest clearance versus agricultural cycling, natural clearing, or seasonal disturbance without independent, date-matched sub-meter imagery or territorial beat inspection reports.

---

## 2. Verified Input Datasets & Spatial Provenance

Both input rasters were verified directly from disk with zero missing assets:

| Parameter | Baseline Observation ($T_0$) | Comparison Observation ($T_1$) |
| :--- | :--- | :--- |
| **GEE Scene ID** | `COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM` | `COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM` |
| **Satellite & Sensor** | Sentinel-2A / MSI (Multi-Spectral Instrument) | Sentinel-2B / MSI (Multi-Spectral Instrument) |
| **Product Level** | Level-2A (Bottom-of-Atmosphere Surface Reflectance) | Level-2A (Bottom-of-Atmosphere Surface Reflectance) |
| **Acquisition Date** | 2020-01-09T05:12:01.000Z | 2024-02-07T05:10:01.000Z |
| **Seasonality** | Dry Post-Northeast-Monsoon Winter | Dry Post-Northeast-Monsoon Winter |
| **Local File Path** | `d:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6acb1b449ee540ec5f705ee2/ZONE-261011-6340_6acb1b449ee540ec5f705ee2_CURRENT_Sentinel2_20200109.tif` | `d:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6acb1cad9ee540ec5f705fac/ZONE-261011-6340_6acb1cad9ee540ec5f705fac_CURRENT_Sentinel2_20240207.tif` |
| **File Size on Disk** | 46,513,805 bytes (~44.36 MB) | 45,993,119 bytes (~43.86 MB) |
| **Raster Dimensions** | 2,231 columns $\times$ 2,073 rows (6 bands) | 2,231 columns $\times$ 2,073 rows (6 bands) |
| **Projected CRS** | `EPSG:32643` (WGS 84 / UTM Zone 43N) | `EPSG:32643` (WGS 84 / UTM Zone 43N) |
| **Pixel Resolution** | 10.0 m $\times$ 10.0 m ($100\text{ m}^2$ per pixel) | 10.0 m $\times$ 10.0 m ($100\text{ m}^2$ per pixel) |
| **Raster Origin** | $[X: 819610\text{ m}, Y: 1140040\text{ m}]$ | $[X: 819610\text{ m}, Y: 1140040\text{ m}]$ |
| **Band Ordering** | B2 (Blue), B3 (Green), B4 (Red), B8 (NIR), B11 (SWIR1), B12 (SWIR2) | B2 (Blue), B3 (Green), B4 (Red), B8 (NIR), B11 (SWIR1), B12 (SWIR2) |
| **Reflectance Scale** | Surface Reflectance DN $\times 0.0001$ | Surface Reflectance DN $\times 0.0001$ |

Both rasters share the identical affine coordinate grid, enabling exact pixel-by-pixel differential algebra without spatial interpolation blurring.

---

## 3. Selected Validation Feature: `POLY-CHG-1791696357291-3501-033`

### Selection Rule & Deterministic Provenance:
From the 193 polygons vectorized in detection record `CHG-1791696357291-3501`, `POLY-CHG-1791696357291-3501-033` (Index 32) was selected using the deterministic rule:
> **"Rank all 193 polygons by verified detector-positive pixel count ($\Delta\text{NDVI} \le -0.15$) and select the #1 ranked cluster."**

### Geometric & Geographic Coordinates:
- **Centroid (WGS 84):** `[829190.0041966° E, 1133769.9971445° N]`
- **Bounding Box (UTM Zone 43N):** $[X_{\min}: 829160, Y_{\min}: 1133740, X_{\max}: 829220, Y_{\max}: 1133800]$
- **Dimensions:** $60\text{ m} \times 60\text{ m}$ ($6 \times 6$ raster pixels)
- **Bounding Box Area:** $0.36\text{ ha}$ ($3,600\text{ m}^2$)
- **GeoTIFF Array Window:** Columns $[955, 961)$, Rows $[624, 630)$
- **Contextual Window Extent:** Columns $[935, 981)$, Rows $[604, 650)$ ($46 \times 46$ pixels, $460\text{ m} \times 460\text{ m} = 21.16\text{ ha}$)

---

## 4. Quantitative Scientific Statistics

### Selected Polygon Footprint (36 Pixels):
- **Total Pixels Evaluated:** 36
- **Valid Comparison Pixels:** 36 (0 nodata, 0 cloud-masked)
- **Detector-Positive Pixels ($\Delta\text{NDVI} \le -0.15$):** **25 pixels (69.44%)**
- **Verified Changed Ground Area:** $25 \times 100\text{ m}^2 / 10,000 = \mathbf{0.25\text{ ha}}$
- **Baseline (2020) NDVI:**
  - Mean: $0.6865$
  - Median: $0.6975$
  - Range: $[0.5186, 0.7788]$ (Healthy moderate-to-dense canopy)
- **Observation (2024) NDVI:**
  - Mean: $0.4268$
  - Median: $0.4484$
  - Range: $[0.2917, 0.5849]$ (Severely degraded vegetation / exposed sub-canopy)
- **Delta-NDVI ($\Delta\text{NDVI} = \text{NDVI}_{2024} - \text{NDVI}_{2020}$):**
  - Mean: **$-0.2597$**
  - Median: **$-0.2458$**
  - Range: **$[-0.4265, -0.0784]$**
  - Peak Drop: **$-0.4265$** (Over $42\%$ absolute drop in vegetative index)

### Surrounding Contextual Window (2,116 Pixels / 21.16 ha):
- **Total Pixels:** 2,116
- **Valid Pixels:** 2,116 ($100\%$)
- **Total Deficit Pixels in Window:** 41 pixels
  - **Inside `POLY-CHG-1791696357291-3501-033`:** 25 pixels
  - **Outside `POLY-CHG-1791696357291-3501-033` (Context Buffer):** 16 pixels (representing adjacent disturbance cluster `POLY-057`)
- **Context Mean Baseline NDVI:** $0.7284$ (Background undisturbed forest)
- **Context Mean Observation NDVI:** $0.7410$ (Background general seasonal stability)
- **Context Mean $\Delta\text{NDVI}$:** $+0.0126$ (Confirms background forest was stable/greening, isolating the drop inside `POLY-CHG-1791696357291-3501-033` as an anomalous localized disturbance)

---

## 5. Generated Visual Artifacts

The following visual and data deliverables were generated and verified under `d:/tn-enforcement-system/tn-forest-monitoring/server/storage/validation_results/CHG-1791696357291-3501/`:

1. `baseline_2020.png` (368 $\times$ 448 px): Authentic 2020 True Color image with yellow polygon boundary outline and 100m scale bar.
2. `observation_2024.png` (368 $\times$ 448 px): Authentic 2024 True Color image showing visible canopy discoloration at the exact polygon coordinates.
3. `before_after_comparison.png` (756 $\times$ 468 px): Synchronized side-by-side comparison figure with north indicator, scale bar, and verified provenance annotations.
4. `ndvi_comparison.png` (1134 $\times$ 498 px): 3-panel spectral figure displaying 2020 NDVI, 2024 NDVI, and $\Delta\text{NDVI}$ with standard colorbars and disturbance threshold indicators.
5. `polygon_statistics.json`: Machine-readable audit file recording all coordinates, scene IDs, and distribution parameters.
6. `pixel_level_samples.csv`: Complete 2,116-row pixel database with geodetic coordinates, band reflectances, and detector flags.

---

## 6. Academic Mentor Demonstration Walkthrough

When presenting this exhibit to an academic mentor or review board:

1. **Open `before_after_comparison.png`:**
   - Point out that both images represent real Copernicus Sentinel-2 L2A surface reflectance data.
   - Show the mentor the exact 100m scale bar and geographic north arrow.
   - Point to the yellow bounding box: explain that within this $60\text{m} \times 60\text{m}$ area, the forest canopy noticeably lightened and lost green reflectance between January 2020 and February 2024.
2. **Open `ndvi_comparison.png`:**
   - Walk through the three panels:
     - Panel 1 shows healthy forest canopy in 2020 (deep green, NDVI $\approx 0.70$).
     - Panel 2 shows degraded vegetation in 2024 (yellow-orange, NDVI down to $0.29$).
     - Panel 3 shows the difference: the polygon is illuminated in dark crimson red, crossing the scientific threshold of $\Delta\text{NDVI} \le -0.15$.
3. **Open `polygon_statistics.json` & `pixel_level_samples.csv`:**
   - Demonstrate the reproducibility: every pixel has an exact UTM easting/northing and WGS 84 latitude/longitude.
   - Highlight that 25 of 36 pixels ($69.4\%$) independently meet the threshold.
4. **State the Scientific Boundary Clearly:**
   - Emphasize to the mentor: *"We have verified software execution and reproduced measurable spectral loss on real satellite rasters. However, we do not claim this proves illegal deforestation without date-matched sub-meter imagery or field records."*
