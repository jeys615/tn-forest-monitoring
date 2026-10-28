# Offline Satellite Image Change Detection Validation Report

**Job ID:** `OFFLINE-CHG-1792618275699-5003`  
**Execution Timestamp:** 2026-10-21T21:31:15.752Z  
**Pipeline Selected:** `CROSS_SENSOR`  

---

## 1. Input Image Specifications

| Attribute | Baseline ($T_0$) | Observation ($T_1$) |
| :--- | :--- | :--- |
| **Filename** | `test_T0_Sentinel2.tif` | `test_T1_CrossSensor_Landsat8.tif` |
| **Sensor Platform** | Sentinel-2 | Landsat-8 |
| **Acquisition Date** | Unspecified | Unspecified |
| **Spatial Dimensions** | 20 × 20 px | 20 × 20 px |
| **Spectral Bands** | 7 bands | 7 bands |
| **CRS** | `EPSG:32717` | `EPSG:32717` |
| **Pixel Resolution** | 10.00m × 10.00m | 10.00m × 10.00m |

---

## 2. Harmonization & Cloud Masking Summary

- **Common Analysis Grid:** 20 × 20 pixels (4.00 ha footprint)
- **Valid Clear Observation Area:** 4.00 ha (100%)
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
| **Other Land-Surface Spectral Change** | 400 | 4.00 | 0.0400 | 100% |
| **Stable Land Cover** | 0 | 0.00 | 0.0000 | 0% |
| **Uncertain / Cloud-Masked / Invalid** | 0 | 0.00 | 0.0000 | 0% |

---

## 4. Scientific Framing & Limitations

1. **Candidate Characterization:** Detected vegetation and bare-soil changes represent *spectral response differences*. They do not constitute conclusive legal proof of deforestation or illicit mining without independent field verification.
2. **Atmospheric & Phenological Variations:** Seasonal changes in moisture, sun angle, and agricultural cycles can induce spectral delta independent of physical ground disturbance.
3. **Cross-Sensor Uncertainty:** Cross-sensor comparison: Roy et al. / HLS bandpass adjustment was applied. Residual differences up to ±0.03 surface reflectance may persist.
