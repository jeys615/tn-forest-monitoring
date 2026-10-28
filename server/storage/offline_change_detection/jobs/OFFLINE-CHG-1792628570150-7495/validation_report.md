# Offline Satellite Image Change Detection Validation Report

**Job ID:** `OFFLINE-CHG-1792628570150-7495`  
**Execution Timestamp:** 2026-10-22T00:22:50.210Z  
**Pipeline Selected:** `SAME_SENSOR`  

---

## 1. Input Image Specifications

| Attribute | Baseline ($T_0$) | Observation ($T_1$) |
| :--- | :--- | :--- |
| **Filename** | `test_T0_Sentinel2.tif` | `test_T1_SameSensor_Sentinel2.tif` |
| **Sensor Platform** | Sentinel-2 | Sentinel-2 |
| **Acquisition Date** | Unspecified | Unspecified |
| **Spatial Dimensions** | 20 × 20 px | 20 × 20 px |
| **Spectral Bands** | 7 bands | 7 bands |
| **CRS** | `EPSG:32644` | `EPSG:32644` |
| **Pixel Resolution** | 10.00m × 10.00m | 10.00m × 10.00m |

---

## 2. Harmonization & Cloud Masking Summary

- **Common Analysis Grid:** 20 × 20 pixels (4.00 ha footprint)
- **Valid Clear Observation Area:** 3.95 ha (98.75%)
- **Masked / Cloud / Invalid Area:** 0.05 ha (1.25%)
- **Vegetation Change Threshold:** $\Delta NDVI = \pm0.15$
- **Bare-Soil Change Threshold:** $\Delta BSI = \pm0.12$

---

## 3. Quantitative Change Detection Summary

| Category | Pixels | Area (ha) | Area ($km^2$) | Coverage (%) |
| :--- | :--- | :--- | :--- | :--- |
| **Vegetation Decrease Candidate** | 195 | 1.95 | 0.0195 | 48.75% |
| **Vegetation Increase Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Bare-Ground Expansion Candidate** | 50 | 0.50 | 0.0050 | 12.5% |
| **Bare-Ground Reduction Candidate** | 0 | 0.00 | 0.0000 | 0% |
| **Other Land-Surface Spectral Change** | 0 | 0.00 | 0.0000 | 0% |
| **Stable Land Cover** | 150 | 1.50 | 0.0150 | 37.5% |
| **Uncertain / Cloud-Masked / Invalid** | 5 | 0.05 | 0.0005 | 1.25% |

---

## 4. Scientific Framing & Limitations

1. **Candidate Characterization:** Detected vegetation and bare-soil changes represent *spectral response differences*. They do not constitute conclusive legal proof of deforestation or illicit mining without independent field verification.
2. **Atmospheric & Phenological Variations:** Seasonal changes in moisture, sun angle, and agricultural cycles can induce spectral delta independent of physical ground disturbance.
3. **Cross-Sensor Uncertainty:** Same-sensor comparison: Radiometric scales and spectral response functions are directly compatible.
