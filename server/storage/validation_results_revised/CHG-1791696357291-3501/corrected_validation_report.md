# Corrected Real-Raster Before-and-After Validation Report

**System:** Tamil Nadu Forest Monitoring System  
**Target Zone:** ZONE-261011-6340 (test zone 57)  
**Target Detection Record:** CHG-1791696357291-3501 (MongoDB ObjectId: `6acb1de59ee540ec5f7060de`)  
**Operating State:** `CANOPY_GUARD_MODE=SHADOW` (Algorithm v2.0 remains official classification authority)  
**Selected Validation Feature:** `POLY-CHG-1791696357291-3501-033` (MultiPolygon Index: 32)  
**Report Revision Date:** 2026-10-20T06:22:39.699Z  
**Audit Reference:** `readonly_numerical_audit.md`  

---

## 1. Executive Summary & Scientific Verification Claims

This report presents the corrected, fully verified empirical before-and-after satellite raster evidence for change detection `CHG-1791696357291-3501` in Sirumalai Hills.

### The Three Rigorous Evidentiary Boundaries:
1. **Software Execution Verified [CONFIRMED]:** The operational pipeline ingested and harmonized authentic European Space Agency (ESA) Copernicus Sentinel-2 Level-2A surface reflectance GeoTIFFs without synthetic or mock data.
2. **Spectral Change Reproduced [CONFIRMED]:** Within polygon `POLY-CHG-1791696357291-3501-033`, **25 out of 36 valid pixels (69.44%)** independently satisfy the production disturbance threshold of $\Delta\text{NDVI} \le -0.15$, reaching a peak deficit of $\Delta\text{NDVI} = -0.4265$. The mean deficit across the 25 changed pixels is **$-0.2597$**, while the mean across all 36 footprint pixels is **$-0.2006$**.
3. **Ground-Truth Deforestation [UNVERIFIED / CAVEAT]:** While physical vegetative reflectance dropped significantly, satellite spectral change alone cannot prove legal forest clearance versus seasonal drying, scrub clearing, or agricultural cycling without independent, date-matched sub-meter imagery or territorial beat inspection reports.

---

## 2. Verified Input Datasets & Spatial Provenance

Both input rasters were verified directly from disk with identical affine grids and zero projection skew:

| Parameter | Baseline Observation ($T_0$) | Comparison Observation ($T_1$) |
| :--- | :--- | :--- |
| **GEE Scene ID** | `COPERNICUS/S2_SR_HARMONIZED/20200109T051201_20200109T051844_T43PHM` | `COPERNICUS/S2_SR_HARMONIZED/20240207T051001_20240207T052026_T43PHM` |
| **Satellite & Sensor** | Sentinel-2A / MSI (Multi-Spectral Instrument) | Sentinel-2B / MSI (Multi-Spectral Instrument) |
| **Product Level** | Level-2A (Surface Reflectance) | Level-2A (Surface Reflectance) |
| **Acquisition Timestamp** | 2020-01-09T05:12:01.000Z | 2024-02-07T05:10:01.000Z |
| **Local File Path** | `d:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6acb1b449ee540ec5f705ee2/ZONE-261011-6340_6acb1b449ee540ec5f705ee2_CURRENT_Sentinel2_20200109.tif` | `d:/tn-enforcement-system/tn-forest-monitoring/server/storage/raster_temp/6acb1cad9ee540ec5f705fac/ZONE-261011-6340_6acb1cad9ee540ec5f705fac_CURRENT_Sentinel2_20240207.tif` |
| **File Size on Disk** | 46,513,805 bytes (~44.36 MB) | 45,993,119 bytes (~43.86 MB) |
| **Raster Dimensions** | 2,231 columns $\times$ 2,073 rows (6 bands) | 2,231 columns $\times$ 2,073 rows (6 bands) |
| **Projected CRS** | `EPSG:32643` (WGS 84 / UTM Zone 43N) | `EPSG:32643` (WGS 84 / UTM Zone 43N) |
| **Spatial Resolution** | 10.0 m $\times$ 10.0 m ($100\text{ m}^2$ per pixel) | 10.0 m $\times$ 10.0 m ($100\text{ m}^2$ per pixel) |
| **Raster Origin** | $[X: 819610\text{ m}, Y: 1140040\text{ m}]$ | $[X: 819610\text{ m}, Y: 1140040\text{ m}]$ |
| **Bands Used** | B2 (Blue), B3 (Green), B4 (Red), B8 (NIR) | B2 (Blue), B3 (Green), B4 (Red), B8 (NIR) |

---

## 3. Geometric & Spatial Alignment

* **Centroid (WGS 84):** `78.0051662° E, 10.2427844° N`
* **Bounding Box (UTM Zone 43N):** $[X_{\min}: 829160, Y_{\min}: 1133740, X_{\max}: 829220, Y_{\max}: 1133800]$
* **Dimensions:** $60\text{ m} \times 60\text{ m}$ ($6 \times 6 = 36\text{ pixels}$)
* **Bounding Box Area:** $0.36\text{ ha}$ ($3,600\text{ m}^2$)
* **GeoTIFF Raster Indices:** Columns $[955, 961)$, Rows $[624, 630)$
* **Context Window Extent:** Columns $[935, 981)$, Rows $[604, 650)$ ($46 \times 46 = 2,116\text{ pixels}$, $460\text{ m} \times 460\text{ m} = 21.16\text{ ha}$)

---

## 4. Corrected Quantitative Verification Statistics

To ensure scientific rigor, metrics are reported separately for the **entire 36-pixel footprint envelope** and for the **25 threshold-positive disturbed pixels**:

### A. Entire Footprint Population (36 Pixels / 0.36 ha):
* **Total Evaluated Cells:** 36
* **Valid Cells:** 36 ($100\%$, 0 invalid, 0 cloud-obscured)
* **Threshold-Positive Cells ($\Delta\text{NDVI} \le -0.15$):** **25 pixels (69.44%)**
* **Sub-Threshold / Stable Cells ($\Delta\text{NDVI} > -0.15$):** 11 pixels (30.56%)
* **Baseline (2020) NDVI:**
  - Mean: **$0.1551$**
  - Median: **$0.0777$**
  - Range: **$[-0.0280, 0.7683]$**
  - Standard Deviation: $0.1904$
* **Observation (2024) NDVI:**
  - Mean: **$-0.0455$**
  - Median: **$-0.1588$**
  - Range: **$[-0.3834, 0.7102]$**
  - Standard Deviation: $0.2717$
* **Delta-NDVI ($\text{NDVI}_{2024} - \text{NDVI}_{2020}$):**
  - Mean: **$-0.2006$**
  - Median: **$-0.1910$**
  - Range: **$[-0.4265, +0.0455]$**
  - Peak Drop: **$-0.4265$** (Pixel 28, drop from $+0.0431$ to $-0.3834$)

### B. Disturbed Change Sub-Population (25 Pixels / 0.25 ha):
* **Total Changed Pixels:** 25
* **Verified Disturbed Ground Area:** $25 \times 100\text{ m}^2 / 10,000 = \mathbf{0.25\text{ ha}}$
* **Baseline (2020) NDVI:**
  - Mean: **$0.0710$**
  - Median: **$0.0694$**
  - Range: **$[-0.0280, 0.1900]$**
* **Observation (2024) NDVI:**
  - Mean: **$-0.1887$**
  - Median: **$-0.1881$**
  - Range: **$[-0.3834, -0.0819]$**
* **Delta-NDVI ($\text{NDVI}_{2024} - \text{NDVI}_{2020}$):**
  - Mean: **$-0.2597$**
  - Median: **$-0.2632$**
  - Range: **$[-0.4265, -0.1512]$**

### C. Surrounding Context Window (2,116 Pixels / 21.16 ha):
* **Total Valid Pixels:** 2,116 ($100\%$)
* **Total Deficit Pixels in Window ($\Delta\text{NDVI} \le -0.15$):** **253 pixels (11.96%)**
  - **Inside `POLY-CHG-1791696357291-3501-033`:** 25 pixels
  - **Outside in Context Buffer:** 228 pixels (representing adjacent disturbance clusters, including `POLY-057`)
* **Context Baseline (2020) NDVI:** Mean = $0.7345$, Median = $0.8072$
* **Context Observation (2024) NDVI:** Mean = $0.7002$, Median = $0.7835$
* **Context Delta-NDVI:** Mean = **$-0.0343$**, Median = **$-0.0268$**
* **Context Analysis:** Broad background forest across the $460\text{m} \times 460\text{m}$ area remained stable (mean drop of only $-0.034$), isolating the acute drop inside `POLY-CHG-1791696357291-3501-033` as an authentic, localized spectral disturbance.

---

## 5. Area-Accounting Reconciliation

| Level | Value | Physical Basis |
| :--- | :--- | :--- |
| **Polygon Envelope Area** | $0.3600\text{ ha}$ ($3,600\text{ m}^2$) | Full $60\text{m} \times 60\text{m}$ bounding box covering 36 contiguous 10m grid cells |
| **Valid Coverage Area** | $0.3600\text{ ha}$ ($3,600\text{ m}^2$) | 36 valid raster cells with non-zero, cloud-free surface reflectance |
| **Threshold-Positive Disturbed Area** | $0.2500\text{ ha}$ ($2,500\text{ m}^2$) | Exactly 25 cells meeting the scientific disturbance criterion $\Delta\text{NDVI} \le -0.15$ |
| **Stable / Edge Buffer Area** | $0.1100\text{ ha}$ ($1,100\text{ m}^2$) | 11 boundary cells with $\Delta\text{NDVI} > -0.15$ |

**Reconciliation Statement:** The reported $0.36\text{ ha}$ footprint and $0.25\text{ ha}$ threshold-positive area are fully reconciled and mathematically consistent. The $0.11\text{ ha}$ difference consists of boundary transition pixels that did not cross the $-0.15$ threshold.

---

## 6. Generated Visual Exhibits (In Revision Directory)

All figures have been generated and verified under `d:/tn-enforcement-system/tn-forest-monitoring/server/storage/validation_results_revised/CHG-1791696357291-3501/`:

1. `baseline_2020.png` ($368 \times 452\text{ px}$): Authentic 2020 Sentinel-2A True Color image with yellow polygon boundary outline and 100m scale bar.
2. `observation_2024.png` ($368 \times 452\text{ px}$): Authentic 2024 Sentinel-2B True Color image showing visible canopy discoloration at polygon coordinates.
3. `before_after_comparison.png` ($756 \times 472\text{ px}$): Synchronized side-by-side comparison figure with north indicator, scale bar, and verified provenance annotations.
4. `ndvi_comparison.png` ($1134 \times 520\text{ px}$): 3-panel spectral figure displaying 2020 NDVI, 2024 NDVI, and $\Delta\text{NDVI}$ with standard colorbars, disturbance threshold indicators, and dual-population statistical callouts.
5. `polygon_statistics_revised.json`: Authoritative machine-readable audit file with full dual-population breakdowns.
6. `pixel_level_samples.csv`: Complete 2,116-row pixel dataset with verified coordinates and band DNs.
7. `discrepancy_table.md`: Standalone discrepancy matrix documenting every corrected metric.
8. `hash_manifest.json`: Cryptographic SHA-256 verification manifest for all source and output files.
