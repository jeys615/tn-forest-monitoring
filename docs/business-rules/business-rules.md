# Business Rules & System Rules

## Module M1 — User & Access Management Rules

1. **Password Hashing**: Passwords must always be hashed using bcryptjs (salt cost >= 12). Plain-text passwords must never be logged or stored.
2. **Password Secrecy**: `passwordHash` must never be returned in API responses or user DTOs.
3. **Generic Auth Errors**: Login failures return generic `401 Unauthorized` ("Invalid email or password") to prevent account enumeration.
4. **Account Status Enforcement**: Only users with status `ACTIVE` can authenticate. `INACTIVE` or `SUSPENDED` users must be rejected immediately.
5. **Privilege Escalation Block**:
   - A user cannot grant roles or permissions higher than their own level.
   - Non-`SUPER_ADMIN` users cannot create or assign `SUPER_ADMIN` users.
   - Users cannot alter their own role or permissions.
6. **Server-Side Enforcement**: All authorization checks (`requireAuth`, `requireRole`, `requirePermission`) occur strictly on the backend.
7. **Preservation of History**: Deactivating a user updates `status` to `INACTIVE` or `SUSPENDED`; physical database deletion is prohibited to preserve audit history.

---

## Core System Architecture Rules (Future Modules)

- **GEE as Image Source Only**: Google Earth Engine is used exclusively as a satellite image source. All image processing occurs locally.
- **Multi-Satellite Query**: Query configured satellite sources in parallel and accept the FIRST VALID image.
- **Metadata Storage**: Store image metadata locally; do NOT store permanent large satellite images locally.
- **Area & Transport Separation**: Satellite-observed disturbed area (hectares) and transport quantity (tonnes) remain separate measurements. Do NOT convert hectares to tonnes without a validated scientific model.
- **Reconciliation**: Inconsistencies generate investigation workflows, not automatic legal violations.
- **AI/ML Excluded from V1**: V1 contains no AI/ML dependencies.

---

## Baseline Architecture & Policy Rules (Planned for M5/M6)

### Sensor Family / Sensor Track Separation
1. **Independent Tracks**: Every monitored zone maintains two independent baseline tracks:
   - **OPTICAL BASELINE TRACK**: Sentinel-2, Landsat 8, Landsat 9
   - **SAR BASELINE TRACK**: Sentinel-1 (C-SAR)
2. **Active Baseline Invariant**: Each zone maintains maximum ONE `ACTIVE` optical baseline and maximum ONE `ACTIVE` SAR baseline at any point in time.
3. **Historical Auditability**: Historical baselines must never be deleted when a new baseline becomes active.

### Baseline Change Policy Rules
- **RULE 1**: A newly acquired image does NOT automatically become a baseline.
- **RULE 2**: An image that produces an alert must NOT automatically replace the active baseline.
- **RULE 3**: A cloudy optical image must NOT become an optical baseline if it fails the configured quality threshold.
- **RULE 4**: SAR imagery can be used as a SAR observation/baseline independently of optical cloud cover.
- **RULE 5**: Optical baseline and SAR baseline evolve independently.
- **RULE 6**: Historical baselines must be retained for auditability.
- **RULE 7**: A baseline candidate must pass quality/validity checks before activation.
- **RULE 8**: If a zone has an unresolved significant incident/change alert, automatic re-baselining must be blocked or placed into a pending state.
- **RULE 9**: M5 owns baseline selection and local processing.
- **RULE 10**: M6 owns change detection and comparison/evidence generation.
- **RULE 11**: Optical and SAR images must NOT be directly treated as the same image type.
- **RULE 12**: Optical processing and SAR processing use different algorithms/features.

### Optical + SAR Evidence Fusion Architecture (M5/M6 Pipeline)
```
                ZONE
                  |
          +-------+-------+
          |               |
          v               v
      OPTICAL           SAR
      TRACK             TRACK
          |               |
    Optical baseline   SAR baseline
          |               |
    Optical current    SAR current
          |               |
    Optical processing SAR processing
          |               |
          +-------+-------+
                  |
                  v
          Evidence Fusion
                  |
                  v
          Change Detection
                  |
                  v
               ALERT
```

### Cloud-Aware Optical Selection & SAR Fallback Flow
```
OPTICAL IMAGE ACQUIRED
    |
    | Cloud Cover <= maxCloudCover?
    |
    +---- YES ---> Optical Processing & Baseline Evaluation
    |
    +---- NO ----> Reject Optical for Baseline; Trigger SAR Acquisition (Sentinel-1)
                    |
                    ---> Independent SAR Processing & Evidence Generation
```

### Intended M5 Baseline Model Structure
- **Fields**: `id`, `zoneId`, `satelliteMetadataId`, `sensorType` (`OPTICAL` | `SAR`), `source`, `acquisitionDate`, `qualityScore`, `cloudCover` (nullable for SAR), `status`, `isActive`, `validFrom`, `validUntil`, `selectionReason`, `createdAt`, `updatedAt`
- **Statuses**: `CANDIDATE`, `ACTIVE`, `RETIRED`, `REJECTED`, `FROZEN`

---

## Module M6 — Change Detection, Multi-Threshold Alerting & Evidence Fusion Rules

### 1. Spatial Change Area Integrity & Transparency
- **RULE 1**: Spatial change percentage must NEVER be fabricated or falsely represented as an actual ground pixel mask when derived from scalar/statistical models.
- **RULE 2**: Every change detection result and alert must explicitly record its `calculationMode` (`SIMULATED` vs `REAL`) and `spatialSource` (`DERIVED_INDICATORS`, `PIXEL_MASK`, `SIMULATION`).
- **RULE 3**: The spatial calculation architecture is designed as a pluggable abstraction so real raster pixel-mask classification pipelines can seamlessly integrate in the future without altering alerting thresholds.

### 2. Multi-Threshold Alerting & Severity Calibration
- **RULE 4**: Centralized thresholds:
  - `< 2%`: Normal variance / Minor fluctuation -> `severity: NONE`, **NO Alert** generated.
  - `2% - 5%`: Low severity change -> `severity: LOW`, Alert generated.
  - `5% - 10%`: Medium severity change -> `severity: MEDIUM`, Alert generated.
  - `≥ 10%`: High severity change -> `severity: HIGH`, Alert generated.
- **RULE 5 (Single Alert Guarantee)**: Only ONE consolidated alert is generated per detection event. If multiple thresholds (2%, 5%, 10%) are crossed, the alert records `highestThresholdCrossed = 10`, `thresholdsCrossed = [2, 5, 10]`, and `severity = HIGH`.

### 3. Sensor Separation & Dedicated Indicators
- **RULE 6**: Optical current is compared strictly against Optical active baseline; SAR current is compared strictly against SAR active baseline. Optical and SAR pixel rasters are NEVER compared directly pixel-by-pixel.
- **RULE 7**: Optical change vectors evaluate optical indicators (`NDVI`, `NDWI`, `NDBI`, `BSI`, `SAVI`, `EVI`).
- **RULE 8**: SAR change vectors evaluate SAR indicators (`VV`, `VH`, `VV/VH`, temporal backscatter difference in dB).
- **RULE 9**: Optical images with cloud cover > 20% trigger automatic fallback to Sentinel-1 SAR imagery while marking optical evidence as `CLOUD_DEGRADED`.

### 4. Deterministic Evidence Strength & Fusion
- **RULE 10**: Every alert calculates a deterministic Evidence Strength score (0–100) combining:
  - **Magnitude Score (40%)**: Scale of spectral / backscatter index shift.
  - **Data Quality Score (20%)**: Cloud cover and valid pixel fraction.
  - **Temporal Consistency Score (20%)**: Historical trend confirmation over recent observations.
  - **Cross-Sensor Confirmation Score (20%)**: Concordance between optical and SAR observations.
- **RULE 11**: All alerts must include a human-readable explanation synthesizing affected area, index deltas, and cross-sensor status.

### 5. Deduplication & Alert Lifecycle Management
- **RULE 12**: Compound uniqueness on `{ zoneId, observationId, baselineId }` prevents duplicate observations from spawning duplicate alerts.
- **RULE 13**: Alert lifecycle progresses through `OPEN` → `ACKNOWLEDGED` → `RESOLVED` with mandatory audit trails (userId, timestamp, resolution notes).
- **RULE 14**: Environmental change detection identifies physical land-cover shifts and does NOT assert legal guilt. Legal reconciliation belongs to downstream modules.

---

## Module M7 — Historical Area Analysis, Temporary Monitoring Areas & Mining Activity Estimation Rules

### 1. Unified Marked Area Concept
- **RULE 15 (Marked Area Universality)**: Calculations and monitoring analysis apply to all marked areas without segregation. Marked areas comprise:
  1. **Permanent Monitored Zones**: Continuously monitored against active baselines.
  2. **Temporary Monitoring Areas**: Ad-hoc user-drawn polygons with historical `[startDate, endDate]` date ranges.
- **RULE 16 (Shared Engine Abstraction)**: Both permanent and temporary areas execute calculations through `MarkedAreaAnalysisService`, using identical M5/M6 spectral and radar engines.
- **RULE 17 (Baseline Isolation)**: Temporary area analysis and historical comparisons must NEVER replace, overwrite, or mutate the active baseline of any permanent monitored zone.

### 2. Mining Classification & Volumetric Integrity
- **RULE 18 (No False Mining Assertions)**: Do NOT classify all bare soil shifts as mining. Elevated bare soil is categorized as `BARE_SOIL_EXPOSURE` or `POSSIBLE_MINING_ACTIVITY` unless confirmed by sustained excavation patterns or structural SAR shifts.
- **RULE 19 (Volumetric Estimation Integrity)**: Volumetric extraction ($V = \text{Area } (\text{m}^2) \times \text{Depth } (\text{m})$) is calculated ONLY when 3D DEM / surface elevation data is available. If depth/DEM is unavailable, the system explicitly reports `isVolumeAvailable: false` with explanation: *"Volume estimation unavailable — elevation/depth data required."* Depth is NEVER fabricated.
- **RULE 20 (Mandatory Disclaimer)**: All volumetric and extraction estimates must include: *"Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey."*
- **RULE 21 (Progressive Expansion Tracking)**: Chronological time-series timelines track step-by-step spatial growth and flag progressive expansion across multi-date observation intervals.

---

## GIS Remote-Sensing Workstation & Calculation Verification Rules

### 1. Calculation Transparency & Auditable Substitution
- **RULE 22 (Calculation Chain Auditability)**: Every displayed change metric must be traceable through an unbroken verification chain:
  `Observation -> Baseline -> Metadata -> Band Inputs -> Formula -> Delta -> Changed Area -> Affected % -> Threshold -> Evidence Score -> Consolidated Alert`.
- **RULE 23 (Authenticity Transparency)**: The system must strictly distinguish between real satellite observation telemetry and derived indicators. Derived indicators are explicitly labeled `DERIVED LOCAL INDICATORS` or `SIMULATED VALIDATION DATA`.
- **RULE 24 (Step-by-Step Mathematical Verification)**: Optical indicators (NDVI, NDWI, NDBI, BSI, SAVI, EVI) and SAR deltas ($\Delta\text{VV}, \Delta\text{VH}, \Delta\text{Ratio}$) must display their underlying mathematical formulas and actual numeric substitutions.
- **RULE 25 (Changed Area Ratio Formula)**: Changed area percentages must strictly satisfy:
  $$\text{affectedAreaPercentage} = \left(\frac{\text{changedArea}}{\text{zoneArea}}\right) \times 100$$
- **RULE 26 (Dedicated Validation Mode & Sandbox Fixture)**: The GIS interface must provide a dedicated Calculation Validation Mode allowing operators and developers to audit formulas and test edge cases with controlled sandbox inputs.

---

## Module M8 — Google Earth Engine Satellite Acquisition & Real Zonal Statistics Rules

### 1. Secure Authentication & Organization Policy Compliance
- **RULE 27 (Zero Private Key Files)**: In compliance with organization policy `iam.disableServiceAccountKeyCreation`, the system must authenticate via OAuth 2.0 user tokens or Application Default Credentials (ADC). Storing JSON private keys or credentials in source code is strictly prohibited.
- **RULE 28 (Authentic Image Identifiers & Timestamps)**: Observation records must preserve genuine Earth Engine image identifiers (`COPERNICUS/S2_SR_HARMONIZED/...`, `COPERNICUS/S1_GRD/...`) and actual acquisition timestamps (UTC ISO 8601) directly from telemetry. Generating fake IDs or substituting `new Date()` is forbidden.

### 2. Server-Side Regional Reduction & No Large Scene Downloads
- **RULE 29 (Server-Side Regional Reduction)**: Regional spectral and radar band statistics must be computed server-side in Google Earth Engine via `reduceRegion` over target polygon boundaries. Downloading complete 500MB scenes to disk or database is strictly prohibited.
- **RULE 30 (Ephemeral Workspace Cleanup)**: Any temporary processing workspaces must be wrapped in `try ... finally` blocks to guarantee 100% recursive deletion on success, failure, or network timeouts.

### 3. Spectral & Radar Zonal Statistics Grounding
- **RULE 31 (Optical Zonal Telemetry)**: Sentinel-2 observations extract `mean`, `median`, `min`, `max`, and `validPixelCount` across bands `B2`, `B3`, `B4`, `B8`, `B11`, `B12`.
- **RULE 32 (SAR Zonal Telemetry)**: Sentinel-1 observations extract `VV`, `VH`, and `angle` radar statistics. Optical and SAR tracks remain strictly segregated.
- **RULE 33 (Non-Silent Fallback Invariant)**: In production mode (`REAL_GEE_PROVIDER`), the system must never silently fall back to simulated imagery if Earth Engine queries fail. Explicit error codes (`GEE_AUTHENTICATION_FAILED`, `NO_VALID_PIXELS`, `MISSING_BAND`, `GEE_PROCESSING_FAILED`) must be raised.
- **RULE 34 (Provenance & Calculation Integrity)**: All indicators computed from GEE zonal statistics must retain provenance tags (`provenance: 'GEE_ZONAL_STATISTICS'`, `processingMode: 'REAL'`).

### 4. Production Reliability, Concurrency & Stale Recovery (M8.7)
- **RULE 35 (Atomic Concurrency Locking)**: Every observation event must be locked atomically via `{ areaId, targetObservationId }` before execution. Parallel workers attempting to process the same observation receive the existing lock and do NOT execute duplicate pipelines.
- **RULE 36 (Transient vs Permanent Error Classification)**: Network timeouts, 429 rate limits, and 503 gateway errors must be classified as transient and re-queued (`RETRY_PENDING`) up to `maxRetries = 3`. Permanent errors (invalid geometries, collection schema mismatches) must be marked permanently `FAILED`.
- **RULE 37 (Stale Job Recovery)**: Jobs stuck in active states (`QUEUED`, `ACQUIRING`, `REDUCING`, `PROCESSING`, `CHANGE_ANALYSIS`, `ALERT_EVALUATION`) for longer than the timeout window (default 5 minutes) must be detected and transitioned automatically to `RETRY_PENDING` (or `FAILED` if retry limit reached).
- **RULE 38 (Secret Redaction in Audit Logs)**: Bearer tokens (`Bearer ya29...`), API keys (`AIzaSy...`), and private passwords must never be stored in logs or audit trails; all occurrences must be masked with `[REDACTED_TOKEN]` / `[REDACTED_KEY]`.
- **RULE 39 (Single Alert Idempotency per Event)**: Multiple pipeline runs or retries on the same observation event must never create duplicate alert records in the database.
- **RULE 40 (Permanent Baseline Immunity)**: Temporary area incremental monitoring operations must NEVER establish or modify permanent active baselines (`BaselineModel`).

