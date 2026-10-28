# Offline Satellite Image Change Detection Validation Report

**Job ID:** `OFFLINE-CHG-1792665984623-8219`  
**Execution Timestamp:** 2026-10-22T10:46:32.196Z  
**Pipeline Selected:** `SAME_SENSOR`  

---

## 1. Input Image Specifications

| Attribute | Baseline ($T_0$) | Observation ($T_1$) |
| :--- | :--- | :--- |
| **Filename** | `sirumalai_baseline.tif` | `sirumalai_observation.tif` |
| **Sensor Platform** | Sentinel-2 | Sentinel-2 |
| **Acquisition Date** | Unspecified | Unspecified |
| **Spatial Dimensions** | 555 × 559 px | 555 × 559 px |
| **Spectral Bands** | 7 bands | 7 bands |
| **CRS** | `EPSG:32643` | `EPSG:32643` |
| **Pixel Resolution** | 20.00m × 20.00m | 20.00m × 20.00m |

---

## 2. Harmonization & Cloud Masking Summary

- **Common Analysis Grid:** 555 × 559 pixels (12409.80 ha footprint)
- **Valid Clear Observation Area:** 12183.36 ha (98.18%)
- **Masked / Cloud / Invalid Area:** 226.44 ha (1.82%)
- **Vegetation Change Threshold:** $\Delta NDVI = \pm0.15$
- **Bare-Soil Change Threshold:** $\Delta BSI = \pm0.12$

---

## 3. Quantitative Change Detection Summary

| Category | Pixels | Area (ha) | Area ($km^2$) | Coverage (%) |
| :--- | :--- | :--- | :--- | :--- |
| **Vegetation Decrease Candidate** | 245 | 9.80 | 0.0980 | 0.08% |
| **Vegetation Increase Candidate** | 14,005 | 560.20 | 5.6020 | 4.51% |
| **Bare-Ground Expansion Candidate** | 1,431 | 57.24 | 0.5724 | 0.46% |
| **Bare-Ground Reduction Candidate** | 81,755 | 3270.20 | 32.7020 | 26.35% |
| **Other Land-Surface Spectral Change** | 90,026 | 3601.04 | 36.0104 | 29.02% |
| **Stable Land Cover** | 1,17,122 | 4684.88 | 46.8488 | 37.75% |
| **Uncertain / Cloud-Masked / Invalid** | 5,661 | 226.44 | 2.2644 | 1.82% |

---

## 4. Scientific Framing & Limitations

1. **Candidate Characterization:** Detected vegetation and bare-soil changes represent *spectral response differences*. They do not constitute conclusive legal proof of deforestation or illicit mining without independent field verification.
2. **Atmospheric & Phenological Variations:** Seasonal changes in moisture, sun angle, and agricultural cycles can induce spectral delta independent of physical ground disturbance.
3. **Cross-Sensor Uncertainty:** Same-sensor comparison: Radiometric scales and spectral response functions are directly compatible.
