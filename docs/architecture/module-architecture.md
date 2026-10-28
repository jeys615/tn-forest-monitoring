# Module Architecture

The system is divided into 12 core modules. They must be developed in the strict order specified below.

## Development Order

M1 → M2 → M3 → M4 → M5 → M6 → M7 → M9 → M10 → M11 → M8 → M12

## Modules

### 1. M1 — User & Access Management

- **Description**: Handles user identity, roles, and access controls.
- **Responsibilities**: User registration, authentication, authorization, role management, session management.
- **Status**: COMPLETED
- **Dependencies**: None.

### 2. M2 — Marked Area & Map Management

- **Description**: Manages geographic boundaries of interest.
- **Responsibilities**: CRUD for forest/protected/mining areas with GeoJSON boundaries, area types (PROTECTED, AUTHORIZED_MINING, SUSPICIOUS, GENERAL), statuses (ACTIVE, SUSPENDED, INACTIVE, UNDER_REVIEW, ARCHIVED), versioning, soft delete.
- **Status**: COMPLETED
- **Dependencies**: M1

### 3. M3 — Multi-Satellite Image Acquisition

- **Description**: Interfaces with satellite imagery providers (e.g., Google Earth Engine) to discover and acquire imagery.
- **Responsibilities**: Parallel satellite query across OPTICAL (Sentinel-2, Landsat-8, Landsat-9) and SAR (Sentinel-1) sources, first-valid-image strategy, metadata storage, candidate discovery without enforcing baseline decisions.
- **Status**: COMPLETED
- **Dependencies**: M2

### 4. M4 — Monitoring Scheduler

- **Description**: Schedules automated observations and local processing jobs.
- **Responsibilities**: Continuous monitoring for marked areas, weekly scans for non-marked areas, job lifecycle tracking with sensor-family classification (OPTICAL vs SAR).
- **Status**: COMPLETED
- **Dependencies**: M2, M3

### 5. M5 — Baseline Management & Local Image Processing

- **Description**: Manages dual-track baseline candidate selection and processes downloaded satellite imagery locally.
- **Responsibilities**: Independent OPTICAL and SAR baseline management per zone, local processing (NDVI/BSI for optical, SAR intensity/speckle filtering), cloud-aware optical fallback to SAR.
- **Status**: COMPLETED
- **Dependencies**: M3, M4

### 6. M6 — Change Detection, Multi-Threshold Alerting & Evidence Fusion

- **Description**: Analyzes processed images against active baselines, computes multi-sensor indicator deltas, calculates affected area percentages, enforces centralized multi-threshold alerting (2%/5%/10%), evaluates deterministic evidence strength, and orchestrates alert lifecycle.
- **Responsibilities**: Independent optical vs optical and SAR vs SAR change vector detection, spatial changed area calculation with clear simulation/real distinction, multi-threshold alert fusion into exactly ONE consolidated alert with highest severity, cloud fallback to Sentinel-1 SAR, alert lifecycle triage (OPEN, ACKNOWLEDGED, RESOLVED).
- **Status**: COMPLETED
- **Dependencies**: M5

### 7. M7 — Historical Area Analysis, Temporary Monitoring Areas & Mining Activity Estimation

- **Description**: Universal analysis of marked areas (permanent monitored zones and ad-hoc temporary monitoring areas) using unified local calculation engines.
- **Responsibilities**: Common `MarkedAreaAnalysisService` abstraction, historical multi-sensor retrieval, optical (S2/L8/L9) and SAR (S1) change detection, 2%/5%/10% multi-threshold alerting, Evidence Strength score calculation, mining activity classification (8 categories), progressive expansion time-series timelines, volumetric extraction estimation ($V = \text{Area } \times \text{Depth}$) with elevation integrity and disclaimers, permanent baseline isolation.
- **Status**: COMPLETED
- **Dependencies**: M2, M5, M6

### 7.1. GIS — Remote-Sensing Investigation Workstation & Calculation Verification System

- **Description**: Professional 4-pane remote-sensing workstation providing full visual, auditable mathematical proof, and live sandbox validation for all satellite-derived change calculations.
- **Responsibilities**: Multi-base layer switching (Esri Satellite, OSM, USGS Topo), 13 spectral & SAR display modes, Observation & Band Value Inspector (S2 B2..B12, Landsat SR_B2..SR_B7, S1 C-SAR), step-by-step arithmetic substitution proofs for NDVI/NDWI/NDBI/BSI/SAVI/EVI, multi-threshold matrix and single consolidated alert guarantees, 4-part evidence score breakdown (40/20/20/20), 3D volumetric estimation and DEM integrity, interactive Calculation Validation & Sandbox Fixture tool.
- **Status**: COMPLETED
- **Dependencies**: M1, M2, M3, M5, M6, M7

### 7.2. M8.1–M8.7 — Real Google Earth Engine Integration & Continuous Production Monitoring

- **Description**: Real Google Earth Engine backend integration, server-side `reduceRegion` zonal pixel statistics, automated incremental monitoring, and fault-tolerant production reliability infrastructure.
- **Responsibilities**:
  - **M8.1**: OAuth2/ADC token management without JSON keys, GEE connectivity diagnostic.
  - **M8.2**: Real Sentinel-2 & Sentinel-1 observation querying, persistence, and deduplication.
  - **M8.3**: Server-side zonal pixel reductions (`reduceRegion`) for optical (B2..B12) and SAR (VV, VH).
  - **M8.4**: Real GEE data to M5 baseline processing pipeline for permanent zones.
  - **M8.5**: Production hardening, mathematical grounding, and regression verification.
  - **M8.6**: Automated real-time incremental discovery, 10-state lifecycle machine, scheduler API.
  - **M8.7**: Production reliability: atomic concurrency locks (`acquireJobLock`), transient error classifier (`classifyError`), bounded retry queue (`RETRY_PENDING`), stale job recovery (`recoverStaleJobs`), permanent baseline immunity, secret redaction, and operational health API (`GET /api/monitoring/health`).
- **Status**: COMPLETED
- **Dependencies**: M1, M2, M3, M4, M5, M6, M7

### 8. M9 — Transport & E-Pass Management

- **Description**: Manages transport logistics and generation of digital passes.
- **Responsibilities**: Mining authorizations, transport companies, trucks, drivers, E-Pass generation with QR/digital signature, E-Pass states (DRAFT, ACTIVE, USED, EXPIRED, CANCELLED, REVOKED).
- **Status**: NOT_STARTED
- **Dependencies**: M7

### 9. M10 — Checkpoint Enforcement

- **Description**: Verifies e-passes and transport at physical checkpoints.
- **Responsibilities**: Online/offline verification, QR scanning, multi-step validation, offline sync (PENDING_SYNC, SYNCED, SYNC_FAILED), idempotent sync.
- **Status**: NOT_STARTED
- **Dependencies**: M9

### 10. M11 — Mining & Transport Reconciliation

- **Description**: Compares different metrics to detect anomalies.
- **Responsibilities**: Compare satellite observations, mining authorization, E-Pass quantities, checkpoint quantities; flag inconsistencies, do NOT assume hectares=tonnes.
- **Status**: NOT_STARTED
- **Dependencies**: M7, M9, M10

### 11. M8 — Alert & Field Verification

- **Description**: Manages alerts and physical verification processes.
- **Responsibilities**: Alert generation, field verification workflow, incident reporting.
- **Status**: NOT_STARTED
- **Dependencies**: M6, M11

### 12. M12 — Reports, Evidence & Audit

- **Description**: Generates reports and maintains audit trails.
- **Responsibilities**: Reports, evidence management, audit logging.
- **Status**: NOT_STARTED
- **Dependencies**: All preceding modules.
