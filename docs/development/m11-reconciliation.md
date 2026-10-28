# Module M11 — Mining & Transport Reconciliation & Discrepancy Analysis

## Overview

Module M11 establishes the centralized multi-dimensional reconciliation engine for the Tamil Nadu Forest Monitoring & Environmental Enforcement System. It synthesizes and cross-references data from four distinct operational layers:
1. **Permitted Limits (M9)**: Authorized mining quotas, permitted weights, lessee credentials, and validity windows.
2. **Transport Logistics (M9)**: Digital E-Passes, declared net weights, and lifecycle states (`ACTIVE`, `USED`, `EXPIRED`, `CANCELLED`).
3. **Physical Checkpoint Enforcement (M10)**: Scanned passages, cryptographic verification logs, geofence radius compliance, and verified transit weights.
4. **Satellite Environmental Observations (M5/M6/M7/M8)**: Disturbed land area in hectares, DEM elevation extraction volume ($m^3$), optical/SAR spectral shifts, and multi-factor evidence confidence scores.

---

## Core Business Invariants & Rules

1. **Separation of Measurements**: Satellite disturbed area (hectares) and transport quantities (tonnes) are never conflated without a designated mineral specific gravity density model ($\rho$, default $2.6 \, \text{t/m}^3$ for granite).
2. **Multi-Factor Anomaly Classification**:
   - `EXCESS_EXTRACTION_UNRECORDED_TRANSPORT`: High physical disturbance observed by satellite with negligible or zero declared transport (illicit extraction).
   - `EXCESS_TRANSPORT_OVER_PERMIT`: Cumulative issued transport tonnage exceeds the authorized lease quota.
   - `UNVERIFIED_TRANSIT_GAP`: Significant discrepancy between issued E-Pass tonnage and checkpoint-verified transit tonnage (checkpoint evasion).
   - `EXTRACTION_OUTSIDE_PERMITTED_BOUNDARY`: Ground disturbance detected inside protected forest reserves without an active mining authorization.
   - `VOLUME_TONNAGE_DISPROPORTION`: 3D DEM elevation extraction volume converted to theoretical tonnage diverges from declared transport beyond tolerance limits.
   - `SUSPENDED_MINING_ACTIVITY`: Transport activity or checkpoint passages logged under a suspended or revoked permit.
   - `EXPIRED_PERMIT_TRANSIT`: E-Passes generated or used past permit expiration dates.
3. **Decision-Support & Investigation Triage**: Discrepancies generate auditable Reconciliation Reports with composite Discrepancy Scores (0–100) and actionable field investigation recommendations (`UNDER_INVESTIGATION` → `RESOLVED`), avoiding premature legal convictions.
4. **Mandatory Scientific Disclaimer**: All satellite volume estimations and discrepancy outputs include the certified disclaimer: *"Satellite-derived approximate estimate. Environmental monitoring and decision-support only; not a certified mining survey."*

---

## Architecture & Data Flow

```
[M9 Mining Authorization]      [M9 E-Pass Logistics]      [M10 Checkpoint Logs]      [M6/M7 Satellite Changes]
          │                              │                          │                           │
          └──────────────────────┐       │       ┌──────────────────┘                           │
                                 ▼       ▼       ▼                                              ▼
                           [ReconciliationService / Engine] ◄───────────────────────────────────┘
                                         │
                                         ▼
                            [Multi-Factor Anomaly Detector]
                                         │
                                         ▼
                             [Discrepancy Score: 0–100]
                                         │
                                         ▼
                         [ReconciliationReport (Persistent)]
                                         │
                                         ▼
                            [Investigation & Audit UI]
```

---

## Database Model & Schema

- **Collection**: `reconciliationreports`
- **Model**: `ReconciliationReportModel`
- **Indexes**:
  - `reconciliationId` (unique)
  - `zoneId` + `createdAt`
  - `authorizationId` + `createdAt`
  - `status` + `createdAt`
  - `reconciliationStatus` + `createdAt`

---

## API Endpoints

- `POST /api/reconciliation/run`: Execute multi-dimensional reconciliation audit on-demand.
- `GET /api/reconciliation/reports`: List reconciliation reports with status and date filters.
- `GET /api/reconciliation/reports/:id`: Retrieve detailed audit report with 4-quadrant breakdown and anomaly list.
- `PATCH /api/reconciliation/reports/:id/status`: Update investigation lifecycle status (`UNDER_INVESTIGATION`, `RESOLVED`) with notes.
- `GET /api/reconciliation/summary`: Fetch system-wide reconciliation KPI aggregates.
- `GET /api/reconciliation/zone/:zoneId`: Fetch zone-specific reconciliation audit history.

---

## Verification & Testing

- **Automated Test Suite**: `server/src/tests/m11-reconciliation.test.ts` (11 comprehensive test scenarios).
- **Master Regression**: 19/19 test suites PASS (M1 through M11).
