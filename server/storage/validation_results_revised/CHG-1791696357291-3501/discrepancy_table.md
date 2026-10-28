# Numerical Discrepancy Table: Sirumalai Detection Exhibit

**Target Record:** `CHG-1791696357291-3501`  
**Target Polygon:** `POLY-CHG-1791696357291-3501-033` (MultiPolygon Index 32)  
**Audit Reference:** `readonly_numerical_audit.md`  
**Document Generated:** 2026-10-20T06:22:39.695Z  

---

### Discrepancy Reconciliation Matrix

This table documents every metric where the prior narrative report (`validation_report.md`) differed from the authoritative raster data and independent numerical calculation:

| Metric | Original Reported Value (Stale Draft) | Corrected Authoritative Value | Population / Scope | Supporting Evidence & Root Cause |
| :--- | :--- | :--- | :--- | :--- |
| **Baseline (2020) NDVI Mean** | `0.6865` | **`0.1551`** | All 36 Footprint Pixels | Authoritative JSON (`baselineNdvi.mean = 0.1551`) and original GeoTIFF. The report narrative had static template text from a high-canopy draft. |
| **Baseline (2020) NDVI Mean (Changed Sub-population)** | *(Not reported separately)* | **`0.0710`** | 25 Threshold-Positive Pixels | Independent pixel algebra on the 25 cells meeting $\Delta\text{NDVI} \le -0.15$. |
| **Baseline (2020) NDVI Median** | `0.6975` | **`0.0777`** | All 36 Footprint Pixels | Authoritative JSON (`baselineNdvi.median = 0.0777`). |
| **Baseline (2020) NDVI Range** | `[0.5186, 0.7788]` | **`[-0.0280, 0.7683]`** | All 36 Footprint Pixels | Authoritative GeoTIFF pixel range across columns 955-960, rows 624-629. |
| **Observation (2024) NDVI Mean** | `0.4268` | **`-0.0455`** | All 36 Footprint Pixels | Authoritative JSON (`observationNdvi.mean = -0.0455`) and GeoTIFF pixel recomputation. |
| **Observation (2024) NDVI Mean (Changed Sub-population)** | *(Not reported separately)* | **`-0.1887`** | 25 Threshold-Positive Pixels | Independent pixel algebra on the 25 cells meeting $\Delta\text{NDVI} \le -0.15$. |
| **Observation (2024) NDVI Median** | `0.4484` | **`-0.1588`** | All 36 Footprint Pixels | Authoritative JSON (`observationNdvi.median = -0.1588`). |
| **Observation (2024) NDVI Range** | `[0.2917, 0.5849]` | **`[-0.3834, 0.7102]`** | All 36 Footprint Pixels | Authoritative GeoTIFF pixel range across columns 955-960, rows 624-629. |
| **Delta-NDVI Mean** | `-0.2597` | **`-0.2006`** | All 36 Footprint Pixels | Authoritative JSON (`deltaNdvi.mean = -0.2006`). The reported `-0.2597` was the mean of the **25 changed pixels**, mistakenly labeled as the entire footprint mean. |
| **Delta-NDVI Mean (Changed Sub-population)** | `-0.2597` | **`-0.2597`** | 25 Threshold-Positive Pixels | Confirmed to 4 decimal places ($-6.4932 / 25 = -0.259728...$). |
| **Delta-NDVI Median** | `-0.2458` | **`-0.1910`** | All 36 Footprint Pixels | Authoritative JSON (`deltaNdvi.median = -0.1910`). |
| **Delta-NDVI Range** | `[-0.4265, -0.0784]` | **`[-0.4265, +0.0455]`** | All 36 Footprint Pixels | Full range across all 36 cells. Upper bound includes positive edge pixels (+0.0455). |
| **Peak NDVI Drop** | `-0.4265` | **`-0.4265`** | Pixel 28 (Col 958, Row 628) | Exactly reproduced to 4 decimal places across all files. |
| **Context Window Deficit Pixels (Outside Polygon)** | `16 pixels` | **`228 pixels`** | 200m Context Buffer (2,080 pixels) | Authoritative JSON (`detectorPositivePixelsOutsidePolygon = 228`) and CSV. Narrative `16` was from a prior narrow 10m buffer trial. |
| **Context Window Total Deficit Pixels** | `41 pixels` | **`253 pixels`** | Entire $46 \times 46$ Window (2,116 pixels) | Authoritative JSON (`detectorPositivePixelsTotal = 253`) and CSV ($25 + 228 = 253$). |
| **Context Window Mean Delta-NDVI** | `+0.0126` | **`-0.0343`** | Entire $46 \times 46$ Window (2,116 pixels) | Authoritative JSON (`deltaNdvi.mean = -0.0343`) across all 2,116 cells. |
