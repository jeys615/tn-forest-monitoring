# Offline Satellite Image Change Detection Validation Report

**Job ID:** `OFFLINE-CHG-1792481501899-4882`  
**Execution Timestamp:** 2026-10-20T07:33:49.682Z  
**Pipeline Selected:** `SAME_SENSOR`  

---

## 1. Input Image Specifications

| Attribute | Baseline ($T_0$) | Observation ($T_1$) |
| :--- | :--- | :--- |
| **Filename** | `ZONE-260925-8986_6ab9074f65d99f53e6ce732f_BASELINE_Sentinel2_20260926.tif` | `ZONE-260925-8986_6ab8abf5667c98f4208d8f6a_CURRENT_Sentinel2_20260926.tif` |
| **Sensor Platform** | Sentinel-2 | Sentinel-2 |
| **Acquisition Date** | Unspecified | Unspecified |
| **Spatial Dimensions** | 2569 × 2237 px | 2569 × 2237 px |
| **Spectral Bands** | 6 bands | 6 bands |
| **CRS** | `EPSG:32643` | `EPSG:32643` |
| **Pixel Resolution** | 10.00m × 10.00m | 10.00m × 10.00m |

---

## 2. Harmonization & Cloud Masking Summary

- **Common Analysis Grid:** 2569 × 2237 pixels (57468.53 ha footprint)
- **Valid Clear Observation Area:** 57468.53 ha (100%)
- **Masked / Cloud / Invalid Area:** 0.00 ha (0%)
- **Vegetation Change Threshold:** $\Delta NDVI = \pm0.15$
- **Bare-Soil Change Threshold:** $\Delta BSI = \pm0.12$

---

## 3. Quantitative Change Detection Summary

| Category | Pixels | Area (ha) | Area ($km^2$) | Coverage (%) |
| :--- | :--- | :--- | :--- | :--- |
| **Vegetation Decrease Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Vegetation Increase Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Bare-Ground Expansion Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Bare-Ground Reduction Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Other Land-Surface Spectral Change** | 0 | 0.00 | 0.0000 | 0% |
| **Stable Land Cover** | 29,44,742 | 29447.42 | 294.4742 | 51.24% |
| **Uncertain / Cloud-Masked / Invalid** | 28,02,111 | 28021.11 | 280.2111 | 48.76% |

---

## 4. Scientific Framing & Limitations

1. **Candidate Characterization:** Detected vegetation and bare-soil changes represent *spectral response differences*. They do not constitute conclusive legal proof of deforestation or illicit mining without independent field verification.
2. **Atmospheric & Phenological Variations:** Seasonal changes in moisture, sun angle, and agricultural cycles can induce spectral delta independent of physical ground disturbance.
3. **Cross-Sensor Uncertainty:** Same-sensor comparison: Radiometric scales and spectral response functions are directly compatible.
