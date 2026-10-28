# Offline Satellite Image Change Detection Validation Report

**Job ID:** `OFFLINE-CHG-1792618929596-8831`  
**Execution Timestamp:** 2026-10-21T21:42:22.042Z  
**Pipeline Selected:** `CROSS_SENSOR`  

---

## 1. Input Image Specifications

| Attribute | Baseline ($T_0$) | Observation ($T_1$) |
| :--- | :--- | :--- |
| **Filename** | `sirumalai_baseline.tif` | `sirumalai_observation.tif` |
| **Sensor Platform** | Generic-Optical | Generic-Optical |
| **Acquisition Date** | Unspecified | Unspecified |
| **Spatial Dimensions** | 555 × 559 px | 555 × 559 px |
| **Spectral Bands** | 7 bands | 7 bands |
| **CRS** | `EPSG:32643` | `EPSG:32643` |
| **Pixel Resolution** | 20.00m × 20.00m | 20.00m × 20.00m |

---

## 2. Harmonization & Cloud Masking Summary

- **Common Analysis Grid:** 555 × 559 pixels (12409.80 ha footprint)
- **Valid Clear Observation Area:** 12409.80 ha (100%)
- **Masked / Cloud / Invalid Area:** 0.00 ha (0%)
- **Vegetation Change Threshold:** $\Delta NDVI = \pm0.15$
- **Bare-Soil Change Threshold:** $\Delta BSI = \pm0.12$

---

## 3. Quantitative Change Detection Summary

| Category | Pixels | Area (ha) | Area ($km^2$) | Coverage (%) |
| :--- | :--- | :--- | :--- | :--- |
| **Vegetation Decrease Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Vegetation Increase Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Bare-Ground Expansion Candidate** | 3 | 0.12 | 0.0012 | 0% |
| **Bare-Ground Reduction Candidate** | 83,675 | 3347.00 | 33.4700 | 26.97% |
| **Other Land-Surface Spectral Change** | 97,606 | 3904.24 | 39.0424 | 31.46% |
| **Stable Land Cover** | 1,23,301 | 4932.04 | 49.3204 | 39.74% |
| **Uncertain / Cloud-Masked / Invalid** | 5,660 | 226.40 | 2.2640 | 1.82% |

---

## 4. Scientific Framing & Limitations

1. **Candidate Characterization:** Detected vegetation and bare-soil changes represent *spectral response differences*. They do not constitute conclusive legal proof of deforestation or illicit mining without independent field verification.
2. **Atmospheric & Phenological Variations:** Seasonal changes in moisture, sun angle, and agricultural cycles can induce spectral delta independent of physical ground disturbance.
3. **Cross-Sensor Uncertainty:** Cross-sensor comparison: Roy et al. / HLS bandpass adjustment was applied. Residual differences up to ±0.03 surface reflectance may persist.
